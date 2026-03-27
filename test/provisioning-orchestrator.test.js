const test = require('node:test');
const assert = require('node:assert/strict');
const { createProvisioningOrchestrator } = require('../src/app/provisioning-orchestrator');

test('returns a plan when AWS SDK is unavailable', async () => {
  const orchestrator = createProvisioningOrchestrator({ provider: { region: 'ap-southeast-1', hasAws: false } });
  const out = await orchestrator.provision({ name: 'bootstrapper' });
  assert.equal(out.region, 'ap-southeast-1');
  assert.match(out.steps[0].detail, /AWS SDK not installed/);
});

test('builds modular provisioning steps', async () => {
  const orchestrator = createProvisioningOrchestrator({ provider: { region: 'ap-southeast-1', hasAws: true } });
  const out = await orchestrator.provision({ name: 'bootstrapper', preferSsm: true, sshKeyName: 'keypair' });
  assert.equal(out.steps.length, 4);
  assert.equal(out.connection, 'ssm');
  assert.equal(out.steps[1].step, 'security-group');
});
