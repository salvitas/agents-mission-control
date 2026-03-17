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
  await fsp.mkdir(path.join(workspace, 'memory'), { recursive: true });
  await fsp.mkdir(path.join(state, 'agents', 'lucy-dev', 'sessions'), { recursive: true });
  await fsp.mkdir(bin, { recursive: true });

  await fsp.writeFile(path.join(workspace, 'SOUL.md'), '# soul');
  await fsp.writeFile(path.join(workspace, 'memory', '2026-01-01.md'), '# mem');
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

  return { root, workspace, state, bin, adaptersPath, auditPath: path.join(root, 'audit.jsonl'), tasksPath: path.join(root, 'tasks.json') };
}

async function withRuntime(fn) {
  const fx = await setupFixture();
  const oldPath = process.env.PATH;
  process.env.PATH = `${fx.bin}:${oldPath}`;
  const rt = await createRuntime({ workspace: fx.workspace, openclawState: fx.state, adaptersPath: fx.adaptersPath, auditPath: fx.auditPath, tasksPath: fx.tasksPath, missionToken: 'tkn' });
  try { await fn({ fx, rt }); } finally { process.env.PATH = oldPath; await rt.stop(); }
}

test('dashboard loads, queue detected, and agent insights include cron counts', async () => withRuntime(async ({ rt }) => {
  const res = await request(rt.app).get('/api/dashboard').expect(200);
  assert.equal(res.body.cronJobs.length, 1);
  assert.equal(res.body.artifacts.some((a) => a.rel.endsWith('pending-approval.md')), true);
  assert.equal(Array.isArray(res.body.agentInsights), true);
  assert.equal(res.body.agentInsights[0].cronCount, 1);
}));

test('approve endpoint requires token and updates markdown', async () => withRuntime(async ({ rt, fx }) => {
  await request(rt.app).post('/api/approve').send({ path: 'agents/dev/pending-approval.md' }).expect(401);
  await request(rt.app).post('/api/approve').set('x-mission-token', 'tkn').send({ path: 'agents/dev/pending-approval.md' }).expect(200);
  const content = await fsp.readFile(path.join(fx.workspace, 'agents/dev/pending-approval.md'), 'utf8');
  assert.match(content, /- \[x\]/i);
}));

test('cron run rejects invalid id format', async () => withRuntime(async ({ rt }) => {
  await request(rt.app).post('/api/cron/run').set('x-mission-token', 'tkn').send({ id: 'not-a-uuid' }).expect(400);
}));

test('tasks CRUD with auth works', async () => withRuntime(async ({ rt }) => {
  await request(rt.app).post('/api/tasks').send({ title: 'A', agentId: 'lucy-dev', tab: 'feature-x' }).expect(401);
  const created = await request(rt.app).post('/api/tasks').set('x-mission-token', 'tkn').send({ title: 'A', agentId: 'lucy-dev', tab: 'feature-x' }).expect(200);
  const id = created.body.task.id;
  await request(rt.app).patch(`/api/tasks/${id}`).set('x-mission-token', 'tkn').send({ status: 'in_progress' }).expect(200);
  const list = await request(rt.app).get('/api/tasks').expect(200);
  assert.equal(list.body.tasks.length, 1);
  assert.equal(list.body.tasks[0].status, 'in_progress');
  await request(rt.app).delete(`/api/tasks/${id}`).set('x-mission-token', 'tkn').expect(200);
  const after = await request(rt.app).get('/api/tasks').expect(200);
  assert.equal(after.body.tasks.length, 0);
}));
