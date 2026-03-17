const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const DEFAULTS = {
  port: Number(process.env.PORT || 4872),
  workspace: process.env.WORKSPACE_DIR || '/Users/salva/.openclaw/workspace',
  openclawState: process.env.OPENCLAW_STATE_DIR || '/Users/salva/.openclaw',
  adaptersPath: path.join(__dirname, 'config', 'queue-adapters.json'),
  auditPath: path.join(__dirname, 'data', 'approval-audit.jsonl'),
  tasksPath: path.join(__dirname, 'data', 'tasks.json'),
  researchPath: path.join(__dirname, 'data', 'research-requests.json'),
  missionToken: process.env.MISSION_CONTROL_TOKEN || '',
};

function execFileP(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30000, maxBuffer: 20 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}

function safeJson(s, fallback = null) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function parseJsonFromNoisyOutput(txt) {
  const idx = txt.indexOf('{');
  if (idx < 0) throw new Error('JSON payload missing');
  return JSON.parse(txt.slice(idx));
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function buildHelpers(cfg) {
  const AGENTS_DIR = path.join(cfg.workspace, 'agents');

  function ensureSafePath(inputPath) {
    if (typeof inputPath !== 'string' || inputPath.length > 2000) throw new Error('Invalid path');
    const abs = path.resolve(cfg.workspace, inputPath);
    if (!abs.startsWith(path.resolve(cfg.workspace))) throw new Error('Path escapes workspace');
    return abs;
  }

  async function listFilesRecursive(dir, depth = 0, maxDepth = 6, out = []) {
    if (depth > maxDepth) return out;
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      if (e.name.startsWith('.git')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await listFilesRecursive(full, depth + 1, maxDepth, out);
      else out.push(full);
    }
    return out;
  }

  function detectAgentId(relPath) {
    const m = relPath.match(/^agents\/([^/]+)\//);
    return m ? m[1] : null;
  }

  function classifyArtifact(filePath) {
    const base = path.basename(filePath).toLowerCase();
    const rel = path.relative(cfg.workspace, filePath);
    const ext = path.extname(base);
    if (!['.md', '.json', '.jsonl', '.log', '.txt'].includes(ext)) return null;
    const score = [
      /(queue|pending|approval|approve)/.test(base) ? 4 : 0,
      /(cron|heartbeat|job)/.test(base) ? 3 : 0,
      /(report|transcript|summary)/.test(base) ? 2 : 0,
      /\.log$/.test(base) ? 1 : 0,
    ].reduce((a, b) => a + b, 0);
    if (!score) return null;
    let type = 'artifact';
    if (/(queue|pending|approval|approve)/.test(base)) type = 'queue';
    else if (/(cron|heartbeat|job)/.test(base)) type = 'cron';
    else if (/(report|transcript|summary)/.test(base)) type = 'report';
    else if (/\.log$/.test(base)) type = 'log';
    return { rel, abs: filePath, type, score, agentId: detectAgentId(rel) };
  }

  return { AGENTS_DIR, ensureSafePath, listFilesRecursive, classifyArtifact };
}

async function createRuntime(config = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const helpers = buildHelpers(cfg);

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; script-src 'self' https://cdnjs.cloudflare.com https://cdn.tailwindcss.com https://unpkg.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;");
    next();
  });

  const hits = new Map();
  app.use((req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${Math.floor(Date.now() / 60000)}`;
    const c = (hits.get(key) || 0) + 1;
    hits.set(key, c);
    if (c > 300) return res.status(429).json({ error: 'Rate limit exceeded' });
    next();
  });

  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  function requireToken(req, res, next) {
    if (!cfg.missionToken) return next();
    const t = req.headers['x-mission-token'];
    if (!t || !crypto.timingSafeEqual(Buffer.from(String(t)), Buffer.from(cfg.missionToken))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  async function readAdapters() {
    const j = safeJson(await fsp.readFile(cfg.adaptersPath, 'utf8'), { adapters: [] });
    return j.adapters || [];
  }

  function pickAdapter(adapters, rel, ext, agentId) {
    return adapters.find((a) => {
      const m = a.match || {};
      if (m.ext && m.ext !== ext) return false;
      if (m.agentId && m.agentId !== agentId) return false;
      if (m.pathRegex && !(new RegExp(m.pathRegex, 'i').test(rel))) return false;
      return true;
    });
  }

  function parseMarkdownQueue(content) {
    const pending = (content.match(/- \[ \]/g) || []).length;
    const done = (content.match(/- \[x\]/gi) || []).length;
    return { pending, done, total: pending + done };
  }

  function parseJsonQueue(content, parser) {
    const rows = safeJson(content, []);
    if (!Array.isArray(rows)) return { pending: null, done: null, total: null };
    const key = parser.statusField || 'status';
    const p = new Set((parser.pendingValues || ['pending']).map((x) => String(x).toLowerCase()));
    const a = new Set((parser.approvedValues || ['approved', 'done']).map((x) => String(x).toLowerCase()));
    let pending = 0; let done = 0;
    for (const r of rows) {
      const v = String(r?.[key] || '').toLowerCase();
      if (p.has(v)) pending += 1;
      else if (a.has(v)) done += 1;
    }
    return { pending, done, total: rows.length };
  }

  async function summarizeQueue(filePath, rel, agentId, adapters) {
    const content = await fsp.readFile(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();
    const ad = pickAdapter(adapters, rel, ext, agentId);
    if (!ad) return { pending: null, done: null, total: null, adapter: null };
    if (ad.parser?.type === 'markdownCheckbox') return { ...parseMarkdownQueue(content), adapter: ad.name };
    if (ad.parser?.type === 'jsonStatusArray') return { ...parseJsonQueue(content, ad.parser), adapter: ad.name };
    return { pending: null, done: null, total: null, adapter: ad.name };
  }

  async function readAgentSkills(agentId, workspaceDir) {
    const slug = String(agentId || '').replace(/^lucy-/, '');
    const roots = [
      path.join(cfg.workspace, 'agents', slug, 'skills', 'local'),
      path.join(workspaceDir, 'skills', 'local'),
    ];
    const seen = new Set();
    const skills = [];
    for (const root of roots) {
      const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (!e.name || e.name.startsWith('.') || seen.has(e.name)) continue;
        seen.add(e.name);
        const full = path.join(root, e.name);
        let target = null;
        try { if ((await fsp.lstat(full)).isSymbolicLink()) target = await fsp.readlink(full); } catch {}
        skills.push({ name: e.name, target, source: root });
      }
    }
    return skills;
  }

  async function buildDataset() {
    const [statusOut, cronOut, sessionsOut, adapters] = await Promise.all([
      execFileP('openclaw', ['status', '--json'], { cwd: cfg.workspace }),
      execFileP('openclaw', ['cron', 'list', '--json'], { cwd: cfg.workspace }),
      execFileP('openclaw', ['sessions', '--all-agents', '--json'], { cwd: cfg.workspace }),
      readAdapters(),
    ]);
    const status = parseJsonFromNoisyOutput(statusOut.stdout);
    const cron = safeJson(cronOut.stdout, { jobs: [] });
    const sessions = safeJson(sessionsOut.stdout, { sessions: [] });
    const files = await helpers.listFilesRecursive(helpers.AGENTS_DIR);
    const artifacts = files.map(helpers.classifyArtifact).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 700);
    for (const art of artifacts) {
      if (art.type === 'queue') art.queue = await summarizeQueue(art.abs, art.rel, art.agentId, adapters);
      const st = await fsp.stat(art.abs);
      art.size = st.size;
      art.mtimeMs = st.mtimeMs;
    }

    const cronByAgent = (cron.jobs || []).reduce((acc, j) => {
      const k = String(j.agentId || 'unknown');
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const wantedNames = ['SOUL.md', 'HEARTBEAT.md', 'IDENTITY.md', 'TOOLS.md', 'USER.md', 'MEMORY.md'];
    const agents = status?.agents?.agents || [];
    const agentInsights = [];

    for (const a of agents) {
      const workspaceDir = String(a.workspaceDir || '');
      const relBase = workspaceDir.startsWith(cfg.workspace) ? path.relative(cfg.workspace, workspaceDir) : null;
      const coreFiles = [];
      if (relBase !== null) {
        for (const name of wantedNames) {
          const abs = path.join(workspaceDir, name);
          const exists = await fsp.stat(abs).then((s) => s.isFile()).catch(() => false);
          if (exists) {
            const relPath = relBase ? path.join(relBase, name) : name;
            coreFiles.push({ name, relPath });
          }
        }
      }

      let memoryFiles = [];
      if (relBase !== null) {
        const memDir = path.join(workspaceDir, 'memory');
        const entries = await fsp.readdir(memDir, { withFileTypes: true }).catch(() => []);
        memoryFiles = entries
          .filter((e) => e.isFile() && /\.(md|json|jsonl|txt)$/i.test(e.name))
          .slice(0, 100)
          .map((e) => ({ name: e.name, relPath: path.join(relBase, 'memory', e.name) }));
      }

      const skills = await readAgentSkills(a.id, workspaceDir).catch(() => []);
      const heartbeatPath = relBase !== null ? path.join(workspaceDir, 'HEARTBEAT.md') : null;
      const heartbeatText = heartbeatPath ? await fsp.readFile(heartbeatPath, 'utf8').catch(() => '') : '';
      const heartbeatConfigured = Boolean(String(heartbeatText || '').trim().replace(/^#.*$/gm, '').trim());

      agentInsights.push({
        agentId: a.id,
        cronCount: cronByAgent[a.id] || 0,
        coreFiles,
        memoryFiles,
        skills,
        heartbeatConfigured,
      });
    }

    const nowMs = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const sums = { today: 0, last7d: 0, last30d: 0 };
    for (const s of (sessions.sessions || [])) {
      const updatedAt = Number(s.updatedAt || 0);
      const t = Number(s.totalTokens || 0);
      if (!updatedAt || !Number.isFinite(t)) continue;
      const age = nowMs - updatedAt;
      if (age <= day) sums.today += t;
      if (age <= 7 * day) sums.last7d += t;
      if (age <= 30 * day) sums.last30d += t;
    }

    return { now: nowMs, workspace: cfg.workspace, status, cronJobs: cron.jobs || [], artifacts, adaptersCount: adapters.length, agentInsights, tokenUsage: sums };
  }

  async function appendAudit(event) {
    await fsp.mkdir(path.dirname(cfg.auditPath), { recursive: true });
    await fsp.appendFile(cfg.auditPath, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`);
  }

  async function readAudit(limit = 200) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit || 200)));
    const txt = await fsp.readFile(cfg.auditPath, 'utf8').catch(() => '');
    return txt.split(/\r?\n/).filter(Boolean).slice(-safeLimit).map((l) => safeJson(l)).filter(Boolean).reverse();
  }

  async function searchTranscripts({ agentId = '', q = '', limit = 60 }) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit || 60)));
    const term = String(q || '').toLowerCase().slice(0, 200);
    const root = path.join(cfg.openclawState, 'agents');
    const ds = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
    const out = [];
    for (const d of ds) {
      if (!d.isDirectory()) continue;
      if (agentId && d.name !== agentId) continue;
      const sessionsDir = path.join(root, d.name, 'sessions');
      const files = (await fsp.readdir(sessionsDir).catch(() => [])).filter((x) => x.endsWith('.jsonl')).slice(0, 80);
      for (const f of files) {
        const full = path.join(sessionsDir, f);
        const content = await fsp.readFile(full, 'utf8').catch(() => '');
        const lines = content.split(/\r?\n/).filter(Boolean).slice(-400);
        for (const line of lines) {
          const row = safeJson(line);
          if (!row || row.type !== 'message') continue;
          const msg = row.message || {};
          const text = (msg.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
          if (!text) continue;
          if (term && !text.toLowerCase().includes(term)) continue;
          out.push({ agentId: d.name, sessionId: f.replace(/\.jsonl$/, ''), role: msg.role || 'unknown', timestamp: row.timestamp, text: text.slice(0, 900) });
          if (out.length >= safeLimit) return out;
        }
      }
    }
    return out;
  }

  const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];
  function sanitizeTaskInput(input = {}) {
    const title = String(input.title || '').trim().slice(0, 160);
    if (!title) throw new Error('title is required');
    const agentId = String(input.agentId || 'unassigned').trim().slice(0, 80);
    const tab = String(input.tab || 'general').trim().slice(0, 80);
    const status = String(input.status || 'todo').trim();
    if (!TASK_STATUSES.includes(status)) throw new Error('invalid status');
    return {
      title,
      agentId,
      tab,
      status,
      priority: String(input.priority || 'normal').slice(0, 20),
      notes: String(input.notes || '').slice(0, 1200),
    };
  }

  async function readTasks() {
    const raw = safeJson(await fsp.readFile(cfg.tasksPath, 'utf8').catch(() => '[]'), []);
    return Array.isArray(raw) ? raw : [];
  }

  async function writeTasks(tasks) {
    await fsp.mkdir(path.dirname(cfg.tasksPath), { recursive: true });
    await fsp.writeFile(cfg.tasksPath, JSON.stringify(tasks, null, 2));
  }

  async function updateTask(taskId, updater) {
    const tasks = await readTasks();
    const i = tasks.findIndex((t) => t.id === taskId);
    if (i < 0) return null;
    const next = updater({ ...tasks[i] });
    tasks[i] = { ...next, updatedAt: new Date().toISOString() };
    await writeTasks(tasks);
    return tasks[i];
  }

  function buildTaskPrompt(task) {
    return [
      `You are assigned this task from Mission Control.`,
      `Task title: ${task.title}`,
      `Tab: ${task.tab}`,
      `Priority: ${task.priority || 'normal'}`,
      task.notes ? `Notes:\n${task.notes}` : '',
      '',
      'Please execute it now and return:',
      '1) What you did',
      '2) Output/results',
      '3) Any blockers',
      '4) Next step suggestion',
    ].filter(Boolean).join('\n');
  }

  async function dispatchTask(taskId, actor = 'system') {
    const current = await updateTask(taskId, (t) => ({ ...t, status: 'in_progress', dispatchState: 'running' }));
    if (!current) return;
    const assigned = String(current.agentId || '');
    if (!/^lucy-[a-z0-9-]+$/i.test(assigned)) {
      await updateTask(taskId, (t) => ({ ...t, dispatchState: 'error', dispatchError: 'Invalid or unassigned agentId' }));
      return;
    }

    try {
      const out = await execFileP('openclaw', ['agent', '--agent', assigned, '--message', buildTaskPrompt(current), '--json', '--timeout', '240'], { cwd: cfg.workspace });
      await updateTask(taskId, (t) => ({ ...t, status: 'review', dispatchState: 'done', result: out.stdout.slice(0, 12000) }));
      await appendAudit({ type: 'task_dispatch', taskId, actor, agentId: assigned, ok: true });
    } catch (e) {
      await updateTask(taskId, (t) => ({ ...t, dispatchState: 'error', dispatchError: String(e.message || 'dispatch failed') }));
      await appendAudit({ type: 'task_dispatch', taskId, actor, agentId: assigned, ok: false, error: String(e.message || 'dispatch failed') });
    } finally {
      await broadcastDashboard();
    }
  }

  const RESEARCH_CAPABILITIES = ['web_research', 'compare_options', 'market_scan', 'fact_check'];
  function sanitizeResearchInput(input = {}) {
    const capability = String(input.capability || '').trim();
    if (!RESEARCH_CAPABILITIES.includes(capability)) throw new Error('invalid capability');
    const topic = String(input.topic || '').trim().slice(0, 240);
    if (!topic) throw new Error('topic is required');
    return {
      capability,
      topic,
      context: String(input.context || '').slice(0, 2000),
      status: 'pending',
    };
  }

  async function readResearchRequests() {
    const raw = safeJson(await fsp.readFile(cfg.researchPath, 'utf8').catch(() => '[]'), []);
    return Array.isArray(raw) ? raw : [];
  }

  async function writeResearchRequests(items) {
    await fsp.mkdir(path.dirname(cfg.researchPath), { recursive: true });
    await fsp.writeFile(cfg.researchPath, JSON.stringify(items, null, 2));
  }

  function buildResearchPrompt(item) {
    const header = `Capability: ${item.capability}\nTopic: ${item.topic}`;
    const context = item.context ? `\nContext:\n${item.context}` : '';
    return `${header}${context}\n\nPlease run your best research workflow and return:\n1) Executive summary\n2) Key findings (with sources)\n3) Risks/uncertainties\n4) Recommended next actions.`;
  }

  let cache = null;
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  async function broadcastDashboard() {
    try {
      cache = await buildDataset();
      const payload = JSON.stringify({ type: 'dashboard', data: cache });
      for (const c of wss.clients) if (c.readyState === 1) c.send(payload);
    } catch {}
  }

  wss.on('connection', async (ws) => {
    if (!cache) cache = await buildDataset().catch(() => null);
    if (cache) ws.send(JSON.stringify({ type: 'dashboard', data: cache }));
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/api/dashboard', async (_req, res, next) => { try { res.json(cache || await buildDataset()); } catch (e) { next(e); } });
  app.get('/api/file', async (req, res, next) => {
    try {
      const rel = String(req.query.path || '');
      const abs = helpers.ensureSafePath(rel);
      const st = await fsp.stat(abs);
      if (st.size > 1024 * 1024) return res.status(413).json({ error: 'File too large (max 1MB)' });
      if (!['.md', '.json', '.jsonl', '.log', '.txt'].includes(path.extname(abs).toLowerCase())) return res.status(400).json({ error: 'Unsupported file type' });
      res.json({ path: rel, content: await fsp.readFile(abs, 'utf8') });
    } catch (e) { next(e); }
  });
  app.get('/api/audit', async (req, res, next) => { try { res.json({ events: await readAudit(req.query.limit) }); } catch (e) { next(e); } });

  app.post('/api/file/save', requireToken, async (req, res, next) => {
    try {
      const rel = String(req.body.path || '');
      const content = String(req.body.content || '');
      const abs = helpers.ensureSafePath(rel);
      if (path.extname(abs).toLowerCase() !== '.md') return res.status(400).json({ error: 'Only .md editing is supported' });
      if (content.length > 1024 * 1024) return res.status(413).json({ error: 'Content too large' });
      await fsp.writeFile(abs, content, 'utf8');
      await appendAudit({ type: 'md_edit', path: rel, actor: req.ip });
      await broadcastDashboard();
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.get('/api/transcripts', async (req, res, next) => {
    try {
      const results = await searchTranscripts({ agentId: String(req.query.agentId || ''), q: String(req.query.q || ''), limit: Number(req.query.limit || 60) });
      res.json({ results });
    } catch (e) { next(e); }
  });

  app.get('/api/tasks', async (_req, res, next) => {
    try { res.json({ tasks: await readTasks() }); } catch (e) { next(e); }
  });

  app.get('/api/research/capabilities', (_req, res) => {
    res.json({ capabilities: RESEARCH_CAPABILITIES });
  });

  app.get('/api/research/requests', async (_req, res, next) => {
    try { res.json({ requests: await readResearchRequests() }); } catch (e) { next(e); }
  });

  app.post('/api/research/requests', requireToken, async (req, res, next) => {
    try {
      const item = sanitizeResearchInput(req.body || {});
      const rows = await readResearchRequests();
      const created = { id: crypto.randomUUID(), ...item, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      rows.unshift(created);
      await writeResearchRequests(rows);
      await appendAudit({ type: 'research_request_create', requestId: created.id, actor: req.ip, capability: created.capability });
      res.json({ ok: true, request: created });
    } catch (e) { next(e); }
  });

  app.post('/api/research/requests/:id/decline', requireToken, async (req, res, next) => {
    try {
      const id = String(req.params.id || '');
      const rows = await readResearchRequests();
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return res.status(404).json({ error: 'Request not found' });
      rows[i] = { ...rows[i], status: 'declined', declineReason: String(req.body?.reason || '').slice(0, 500), updatedAt: new Date().toISOString() };
      await writeResearchRequests(rows);
      await appendAudit({ type: 'research_request_decline', requestId: id, actor: req.ip });
      res.json({ ok: true, request: rows[i] });
    } catch (e) { next(e); }
  });

  app.post('/api/research/requests/:id/approve', requireToken, async (req, res, next) => {
    try {
      const id = String(req.params.id || '');
      const rows = await readResearchRequests();
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return res.status(404).json({ error: 'Request not found' });
      if (rows[i].status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be approved' });

      rows[i] = { ...rows[i], status: 'approved', updatedAt: new Date().toISOString() };
      const prompt = buildResearchPrompt(rows[i]);
      const out = await execFileP('openclaw', ['agent', '--agent', 'lucy-research', '--message', prompt, '--json', '--timeout', '180'], { cwd: cfg.workspace });
      rows[i] = { ...rows[i], status: 'completed', result: out.stdout.slice(0, 12000), updatedAt: new Date().toISOString() };
      await writeResearchRequests(rows);
      await appendAudit({ type: 'research_request_approve', requestId: id, actor: req.ip, agentId: 'lucy-research' });
      res.json({ ok: true, request: rows[i] });
    } catch (e) { next(e); }
  });

  app.post('/api/heartbeat/:agentId/:mode', requireToken, async (req, res, next) => {
    try {
      const agentId = String(req.params.agentId || '');
      const mode = String(req.params.mode || '');
      if (!/^lucy-[a-z0-9-]+$/i.test(agentId)) return res.status(400).json({ error: 'Invalid agent id' });
      if (!['enable', 'disable'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
      const slug = agentId.replace(/^lucy-/, '');
      const hbPath = path.join(cfg.workspace, 'agents', slug, 'HEARTBEAT.md');
      await fsp.mkdir(path.dirname(hbPath), { recursive: true });

      if (mode === 'disable') {
        const existing = await fsp.readFile(hbPath, 'utf8').catch(() => '');
        if (existing && String(existing).trim()) {
          await fsp.writeFile(`${hbPath}.bak`, existing, 'utf8').catch(() => {});
        }
        await fsp.writeFile(hbPath, '# HEARTBEAT.md\n\n# Disabled from Mission Control\n', 'utf8');
      } else {
        const backup = await fsp.readFile(`${hbPath}.bak`, 'utf8').catch(() => '');
        await fsp.writeFile(hbPath, backup || '# HEARTBEAT.md\n\n# Add tasks below when you want periodic checks.\n', 'utf8');
      }

      await appendAudit({ type: `heartbeat_${mode}`, agentId, actor: req.ip });
      await broadcastDashboard();
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.post('/api/tasks', requireToken, async (req, res, next) => {
    try {
      const task = sanitizeTaskInput(req.body || {});
      const tasks = await readTasks();
      const created = { id: crypto.randomUUID(), ...task, dispatchState: 'idle', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      tasks.unshift(created);
      await writeTasks(tasks);
      await appendAudit({ type: 'task_create', taskId: created.id, actor: req.ip, agentId: created.agentId, tab: created.tab });
      if (/^lucy-/i.test(created.agentId)) {
        dispatchTask(created.id, req.ip).catch(() => {});
      }
      res.json({ ok: true, task: created });
    } catch (e) { next(e); }
  });

  app.patch('/api/tasks/:id', requireToken, async (req, res, next) => {
    try {
      const id = String(req.params.id || '');
      if (!id) return res.status(400).json({ error: 'Invalid task id' });
      const tasks = await readTasks();
      const i = tasks.findIndex((t) => t.id === id);
      if (i < 0) return res.status(404).json({ error: 'Task not found' });
      const patch = req.body || {};
      const prevTask = { ...tasks[i] };
      const nextTask = { ...tasks[i] };
      if (patch.title !== undefined) nextTask.title = String(patch.title).trim().slice(0, 160);
      if (patch.agentId !== undefined) nextTask.agentId = String(patch.agentId).trim().slice(0, 80);
      if (patch.tab !== undefined) nextTask.tab = String(patch.tab).trim().slice(0, 80);
      if (patch.notes !== undefined) nextTask.notes = String(patch.notes).slice(0, 1200);
      if (patch.priority !== undefined) nextTask.priority = String(patch.priority).slice(0, 20);
      if (patch.status !== undefined) {
        const st = String(patch.status);
        if (!TASK_STATUSES.includes(st)) return res.status(400).json({ error: 'invalid status' });
        nextTask.status = st;
      }
      nextTask.updatedAt = new Date().toISOString();
      tasks[i] = nextTask;
      await writeTasks(tasks);
      await appendAudit({ type: 'task_update', taskId: id, actor: req.ip });
      const agentChanged = prevTask.agentId !== nextTask.agentId;
      if (/^lucy-/i.test(nextTask.agentId) && (nextTask.status === 'todo' || patch.dispatchNow === true || agentChanged)) {
        dispatchTask(id, req.ip).catch(() => {});
      }
      res.json({ ok: true, task: nextTask });
    } catch (e) { next(e); }
  });

  app.delete('/api/tasks/:id', requireToken, async (req, res, next) => {
    try {
      const id = String(req.params.id || '');
      const tasks = await readTasks();
      const nextTasks = tasks.filter((t) => t.id !== id);
      if (nextTasks.length === tasks.length) return res.status(404).json({ error: 'Task not found' });
      await writeTasks(nextTasks);
      await appendAudit({ type: 'task_delete', taskId: id, actor: req.ip });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.post('/api/tasks/:id/dispatch', requireToken, async (req, res, next) => {
    try {
      const id = String(req.params.id || '');
      const task = await updateTask(id, (t) => ({ ...t, dispatchState: 'queued' }));
      if (!task) return res.status(404).json({ error: 'Task not found' });
      dispatchTask(id, req.ip).catch(() => {});
      res.json({ ok: true, task });
    } catch (e) { next(e); }
  });

  app.post('/api/approve', requireToken, async (req, res, next) => {
    try {
      const rel = String(req.body.path || '');
      const abs = helpers.ensureSafePath(rel);
      if (!abs.endsWith('.md')) return res.status(400).json({ error: 'Only .md supported' });
      const lines = (await fsp.readFile(abs, 'utf8')).split(/\r?\n/);
      const idx = lines.findIndex((l) => /- \[ \]/.test(l));
      if (idx >= 0) lines[idx] = lines[idx].replace(/- \[ \]/, '- [x]');
      await fsp.writeFile(abs, `${lines.join('\n')}\n`);
      await appendAudit({ type: 'approval', path: rel, changed: idx >= 0, lineIndex: idx, actor: req.ip });
      await broadcastDashboard();
      res.json({ ok: true, changed: idx >= 0 });
    } catch (e) { next(e); }
  });

  app.post('/api/cron/run', requireToken, async (req, res, next) => {
    try {
      const id = String(req.body.id || '');
      if (!isUuid(id)) return res.status(400).json({ error: 'Invalid cron id format' });
      const out = await execFileP('openclaw', ['cron', 'run', id, '--timeout', '120000'], { cwd: cfg.workspace });
      await appendAudit({ type: 'cron_run', id, actor: req.ip, ok: true });
      await broadcastDashboard();
      res.json({ ok: true, stdout: out.stdout.slice(0, 3000) });
    } catch (e) {
      await appendAudit({ type: 'cron_run', id: req.body?.id, actor: req.ip, ok: false, error: String(e.message || 'error') });
      next(e);
    }
  });

  app.use((err, _req, res, _next) => {
    const payload = { error: 'Internal error' };
    if (process.env.NODE_ENV === 'test') payload.detail = String(err?.message || err);
    res.status(500).json(payload);
  });

  const interval = setInterval(broadcastDashboard, 10000);
  return {
    app,
    server,
    start: () => new Promise((resolve) => server.listen(cfg.port, () => resolve(cfg.port))),
    stop: () => new Promise((resolve) => { clearInterval(interval); wss.close(() => server.close(() => resolve())); }),
    _internals: { isUuid, parseJsonFromNoisyOutput, safeJson, helpers },
  };
}

async function main() {
  const runtime = await createRuntime();
  await runtime.start();
  console.log(`Mission Control: http://localhost:${DEFAULTS.port}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { createRuntime };
