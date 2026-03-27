const crypto = require('crypto');

function maybeAws() {
  try {
    return {
      EC2Client: require('@aws-sdk/client-ec2').EC2Client,
      DescribeImagesCommand: require('@aws-sdk/client-ec2').DescribeImagesCommand,
      DescribeInstancesCommand: require('@aws-sdk/client-ec2').DescribeInstancesCommand,
      DescribeSecurityGroupsCommand: require('@aws-sdk/client-ec2').DescribeSecurityGroupsCommand,
      DescribeSubnetsCommand: require('@aws-sdk/client-ec2').DescribeSubnetsCommand,
      DescribeVpcsCommand: require('@aws-sdk/client-ec2').DescribeVpcsCommand,
      CreateSecurityGroupCommand: require('@aws-sdk/client-ec2').CreateSecurityGroupCommand,
      AuthorizeSecurityGroupIngressCommand: require('@aws-sdk/client-ec2').AuthorizeSecurityGroupIngressCommand,
      RunInstancesCommand: require('@aws-sdk/client-ec2').RunInstancesCommand,
      CreateTagsCommand: require('@aws-sdk/client-ec2').CreateTagsCommand,
      TerminateInstancesCommand: require('@aws-sdk/client-ec2').TerminateInstancesCommand,
      IamClient: require('@aws-sdk/client-iam').IamClient,
      GetRoleCommand: require('@aws-sdk/client-iam').GetRoleCommand,
      CreateRoleCommand: require('@aws-sdk/client-iam').CreateRoleCommand,
      PutRolePolicyCommand: require('@aws-sdk/client-iam').PutRolePolicyCommand,
      CreateInstanceProfileCommand: require('@aws-sdk/client-iam').CreateInstanceProfileCommand,
      AddRoleToInstanceProfileCommand: require('@aws-sdk/client-iam').AddRoleToInstanceProfileCommand,
      GetInstanceProfileCommand: require('@aws-sdk/client-iam').GetInstanceProfileCommand,
      SsmClient: require('@aws-sdk/client-ssm').SSMClient,
      SendCommandCommand: require('@aws-sdk/client-ssm').SendCommandCommand,
      GetCommandInvocationCommand: require('@aws-sdk/client-ssm').GetCommandInvocationCommand,
    };
  } catch {
    return null;
  }
}

function defaultName(prefix, parts = []) {
  const raw = [prefix, ...parts].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return raw.slice(0, 60) || `${prefix}-${crypto.randomBytes(3).toString('hex')}`;
}

function normalizeTags(tags = {}) {
  return Object.entries(tags)
    .filter(([, v]) => v !== undefined && v !== null && String(v).length)
    .map(([Key, Value]) => ({ Key, Value: String(Value) }));
}

function createAwsProvider(options = {}) {
  const aws = options.aws || maybeAws();
  const region = options.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-southeast-1';
  const ec2 = options.ec2 || (aws ? new aws.EC2Client({ region }) : null);
  const iam = options.iam || (aws ? new aws.IamClient({ region }) : null);
  const ssm = options.ssm || (aws ? new aws.SsmClient({ region }) : null);

  return {
    region,
    hasAws: Boolean(aws),
    clients: { ec2, iam, ssm },
    commands: aws,
    defaultName,
    normalizeTags,
  };
}

module.exports = { createAwsProvider, defaultName, normalizeTags };
