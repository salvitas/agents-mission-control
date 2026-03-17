const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { createRuntime } = require('../server');

async function setupFixture() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'mc-'));
  const workspace = path.join(root, 'workspace');
  const state = path.join(root, 'state');
  const bin = path.join(root, 'bin');
  await fsp.mkdir(path.join(workspace, 'agents', 'dev'), { recursive: true });
  await fsp.mkdir(path.join(state, 'agents', 'lucy-dev', 'sessions'), { recursive: true });
  await fsp.mkdir(bin, { recursive: true });

  await fsp.writeFile(path.join(workspace, 'agents', 'dev', 'pending-approval.md'), '# q\n- [ ] item 1\n');
  await fsp.writeFile(path.join(state, 'agents', 'lucy-dev', 'sessions', 'abc.jsonl'), [
    JSON.stringify({ type: 'message', timestamp: '2026-01-01', message: { role: 'user', content: [{ type: 'text', text: 'hello approval' }] } }),
    ''
  ].join('\n'));

  const openclawScript = `#!/bin/sh
if [ "$1" = "status" ]; then
  echo '{"sessions":{"count":1,"recent":[]},"agents":{"agents":[{"id":"lucy-dev","name":"Lucy Dev","lastActiveAgeMs":1000}]},"heartbeat":{"agents":[{"agentId":"lucy-dev","enabled":true}]}}'
  exit 0
fi
if [ "$1" = "cron" ] && [ "$2" = "list" ]; then
  echo '{"jobs":[{"id":"1301bb9c-2b4a-461f-9d13-ced1fba4695b","name":"job1","agentId":"lucy-dev","schedule":{"expr":"* * * * *"},"state":{"lastRunStatus":"ok","lastRunAtMs":1}}]}'
  exit 0
fi
if [ "$1" = "cron" ] && [ "$2" = "run" ]; then
  echo '{"ok":true}'
  exit 0
fi
exit 1
`;
  const openclawPath = path.join(bin, 'openclaw');
  await fsp.writeFile(openclawPath, openclawScript, { mode: 0o755 });

  const adaptersPath = path.join(root, 'queue-adapters.json');
  await fsp.writeFile(adaptersPath, JSON.stringify({
    adapters: [{ name: 'md', match: { ext: '.md', pathRegex: 'approval' }, parser: { type: 'markdownCheckbox' } }]
  }));

  return { root, workspace, state, bin, adaptersPath, auditPath: path.join(root, 'audit.jsonl') };
}

test('dashboard loads and queue detected', async () => {
  const fx = await setupFixture();
  const oldPath = process.env.PATH;
  process.env.PATH = `${fx.bin}:${oldPath}`;
  const rt = await createRuntime({ workspace: fx.workspace, openclawState: fx.state, adaptersPath: fx.adaptersPath, auditPath: fx.auditPath, missionToken: 'tkn' });
  try {
    const res = await request(rt.app).get('/api/dashboard').expect(200);
    assert.equal(res.body.cronJobs.length, 1);
    assert.equal(res.body.artifacts.some((a) => a.rel.endsWith('pending-approval.md')), true);
  } finally {
    process.env.PATH = oldPath;
    await rt.stop();
  }
});

test('approve endpoint requires token and updates markdown', async () => {
  const fx = await setupFixture();
  const oldPath = process.env.PATH;
  process.env.PATH = `${fx.bin}:${oldPath}`;
  const rt = await createRuntime({ workspace: fx.workspace, openclawState: fx.state, adaptersPath: fx.adaptersPath, auditPath: fx.auditPath, missionToken: 'tkn' });
  try {
    await request(rt.app).post('/api/approve').send({ path: 'agents/dev/pending-approval.md' }).expect(401);
    await request(rt.app)
      .post('/api/approve')
      .set('x-mission-token', 'tkn')
      .send({ path: 'agents/dev/pending-approval.md' })
      .expect(200);

    const content = await fsp.readFile(path.join(fx.workspace, 'agents/dev/pending-approval.md'), 'utf8');
    assert.match(content, /- \[x\]/i);
  } finally {
    process.env.PATH = oldPath;
    await rt.stop();
  }
});

test('cron run rejects invalid id format', async () => {
  const fx = await setupFixture();
  const oldPath = process.env.PATH;
  process.env.PATH = `${fx.bin}:${oldPath}`;
  const rt = await createRuntime({ workspace: fx.workspace, openclawState: fx.state, adaptersPath: fx.adaptersPath, auditPath: fx.auditPath, missionToken: 'tkn' });
  try {
    await request(rt.app)
      .post('/api/cron/run')
      .set('x-mission-token', 'tkn')
      .send({ id: 'not-a-uuid' })
      .expect(400);
  } finally {
    process.env.PATH = oldPath;
    await rt.stop();
  }
});
