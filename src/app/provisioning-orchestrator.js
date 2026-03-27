const { createAwsProvider, defaultName } = require('../services/aws/provider');

function createProvisioningOrchestrator(options = {}) {
  const provider = options.provider || createAwsProvider(options.awsOptions || {});
  const logger = options.logger || console;
  const state = options.state || {};
  provider.clients = provider.clients || {};

  async function provision(config = {}) {
    const result = { region: provider.region, steps: [], connection: null, resources: {} };
    if (!provider.hasAws) {
      result.steps.push({ step: 'validate', status: 'skipped', detail: 'AWS SDK not installed; returning plan only' });
      return result;
    }

    if (!provider.clients?.ec2 || !provider.clients?.iam || !provider.clients?.ssm || !provider.commands) {
      result.steps.push({ step: 'iam-role', status: 'planned' });
      result.steps.push({ step: 'security-group', status: 'planned' });
      result.steps.push({ step: 'instance', status: 'planned' });
      result.steps.push({ step: 'connect', status: config.preferSsm === false ? 'ssh' : 'ssm' });
      result.connection = config.preferSsm === false ? 'ssh' : 'ssm';
      return result;
    }

    result.resources.roleArn = await ensureIamRole(config, result);
    result.resources.securityGroupId = await ensureSecurityGroup(config, result);
    result.resources.instanceId = await launchInstance(config, result);
    result.connection = await connectInstance(config, result);
    return result;
  }

  async function ensureIamRole(config, result) {
    const { iam, ec2 } = provider.clients;
    const roleName = config.iamRoleName || defaultName('openclaw-ec2', [config.name]);
    const profileName = config.instanceProfileName || roleName;
    result.resources.iamRoleName = roleName;
    result.resources.instanceProfileName = profileName;

    const assumeRolePolicyDocument = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { Service: 'ec2.amazonaws.com' }, Action: 'sts:AssumeRole' }],
    });
    try { await iam.send(new provider.commands.GetRoleCommand({ RoleName: roleName })); }
    catch {
      await iam.send(new provider.commands.CreateRoleCommand({ RoleName: roleName, AssumeRolePolicyDocument: assumeRolePolicyDocument }));
      await iam.send(new provider.commands.PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: `${roleName}-ssm`,
        PolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{ Effect: 'Allow', Action: ['ssm:UpdateInstanceInformation','ssmmessages:*','ec2messages:*','cloudwatch:PutMetricData'], Resource: '*' }],
        }),
      }));
    }
    try { await iam.send(new provider.commands.GetInstanceProfileCommand({ InstanceProfileName: profileName })); }
    catch {
      await iam.send(new provider.commands.CreateInstanceProfileCommand({ InstanceProfileName: profileName }));
      try { await iam.send(new provider.commands.AddRoleToInstanceProfileCommand({ InstanceProfileName: profileName, RoleName: roleName })); } catch {}
    }
    return `arn:aws:iam::instance-profile/${profileName}`;
  }

  async function ensureSecurityGroup(config, result) {
    const { ec2 } = provider.clients;
    const vpcId = config.vpcId || await resolveDefaultVpcId();
    const sgName = config.securityGroupName || defaultName('openclaw-sg', [config.name]);
    result.resources.securityGroupName = sgName;

    const existing = await ec2.send(new provider.commands.DescribeSecurityGroupsCommand({
      Filters: [{ Name: 'group-name', Values: [sgName] }, ...(vpcId ? [{ Name: 'vpc-id', Values: [vpcId] }] : [])],
    })).catch(() => ({ SecurityGroups: [] }));
    if (existing.SecurityGroups?.[0]) return existing.SecurityGroups[0].GroupId;

    const created = await ec2.send(new provider.commands.CreateSecurityGroupCommand({
      GroupName: sgName,
      Description: 'OpenClaw bootstrapper security group',
      VpcId: vpcId,
      TagSpecifications: [{ ResourceType: 'security-group', Tags: provider.normalizeTags({ Name: sgName, App: 'OpenClaw' }) }],
    }));
    const ingress = config.ingress || [{ protocol: 'tcp', fromPort: 22, toPort: 22, cidr: config.sshCidr || '0.0.0.0/0' }];
    if (ingress.length) {
      await ec2.send(new provider.commands.AuthorizeSecurityGroupIngressCommand({
        GroupId: created.GroupId,
        IpPermissions: ingress.map((rule) => ({
          IpProtocol: rule.protocol || 'tcp',
          FromPort: rule.fromPort,
          ToPort: rule.toPort,
          IpRanges: [{ CidrIp: rule.cidr }],
        })),
      })).catch(() => {});
    }
    return created.GroupId;
  }

  async function launchInstance(config, result) {
    const { ec2 } = provider.clients;
    const instanceType = config.instanceType || 't3.micro';
    const ami = config.ami || await resolveLatestAmi();
    const subnetId = config.subnetId || await resolveDefaultSubnetId();
    const securityGroupId = result.resources.securityGroupId;
    const instanceProfile = config.instanceProfileName || result.resources.instanceProfileName;
    const run = await ec2.send(new provider.commands.RunInstancesCommand({
      ImageId: ami,
      InstanceType: instanceType,
      MinCount: 1,
      MaxCount: 1,
      SubnetId: subnetId,
      SecurityGroupIds: securityGroupId ? [securityGroupId] : undefined,
      IamInstanceProfile: instanceProfile ? { Name: instanceProfile } : undefined,
      TagSpecifications: [{ ResourceType: 'instance', Tags: provider.normalizeTags({ Name: config.name || 'openclaw', App: 'OpenClaw' }) }],
    }));
    const instanceId = run.Instances?.[0]?.InstanceId;
    if (instanceId) {
      await ec2.send(new provider.commands.CreateTagsCommand({ Resources: [instanceId], Tags: provider.normalizeTags({ Name: config.name || 'openclaw' }) }));
    }
    return instanceId;
  }

  async function connectInstance(config, result) {
    const { ssm } = provider.clients;
    const connection = config.preferSsm === false ? 'ssh' : 'ssm';
    if (connection === 'ssm') {
      await ssm.send(new provider.commands.SendCommandCommand({
        InstanceIds: [result.resources.instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: { commands: ['echo OpenClaw bootstrap started'] },
      })).catch(() => { result.connection = 'ssh'; });
      if (result.connection !== 'ssh') return 'ssm';
    }
    return 'ssh';
  }

  async function resolveDefaultVpcId() {
    const { ec2 } = provider.clients;
    const out = await ec2.send(new provider.commands.DescribeVpcsCommand({ Filters: [{ Name: 'isDefault', Values: ['true'] }] }));
    return out.Vpcs?.[0]?.VpcId;
  }

  async function resolveDefaultSubnetId() {
    const { ec2 } = provider.clients;
    const out = await ec2.send(new provider.commands.DescribeSubnetsCommand({ Filters: [{ Name: 'default-for-az', Values: ['true'] }] })).catch(() => ({ Subnets: [] }));
    return out.Subnets?.[0]?.SubnetId;
  }

  async function resolveLatestAmi() {
    const { ec2 } = provider.clients;
    const out = await ec2.send(new provider.commands.DescribeImagesCommand({
      Owners: ['amazon'],
      Filters: [
        { Name: 'name', Values: ['amzn2-ami-hvm-*'] },
        { Name: 'architecture', Values: ['x86_64'] },
        { Name: 'state', Values: ['available'] },
      ],
    })).catch(() => ({ Images: [] }));
    const sorted = [...(out.Images || [])].sort((a, b) => String(b.CreationDate || '').localeCompare(String(a.CreationDate || '')));
    return sorted[0]?.ImageId || 'ami-unknown';
  }

  return { provision, provider, state };
}

module.exports = { createProvisioningOrchestrator };
