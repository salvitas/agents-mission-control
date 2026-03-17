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
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:;");
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

  async function buildDataset() {
    const [statusOut, cronOut, adapters] = await Promise.all([
      execFileP('openclaw', ['status', '--json'], { cwd: cfg.workspace }),
      execFileP('openclaw', ['cron', 'list', '--json'], { cwd: cfg.workspace }),
      readAdapters(),
    ]);
    const status = parseJsonFromNoisyOutput(statusOut.stdout);
    const cron = safeJson(cronOut.stdout, { jobs: [] });
    const files = await helpers.listFilesRecursive(helpers.AGENTS_DIR);
    const artifacts = files.map(helpers.classifyArtifact).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 700);
    for (const art of artifacts) {
      if (art.type === 'queue') art.queue = await summarizeQueue(art.abs, art.rel, art.agentId, adapters);
      const st = await fsp.stat(art.abs);
      art.size = st.size;
      art.mtimeMs = st.mtimeMs;
    }
    return { now: Date.now(), workspace: cfg.workspace, status, cronJobs: cron.jobs || [], artifacts, adaptersCount: adapters.length };
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
  app.get('/api/transcripts', async (req, res, next) => {
    try {
      const results = await searchTranscripts({ agentId: String(req.query.agentId || ''), q: String(req.query.q || ''), limit: Number(req.query.limit || 60) });
      res.json({ results });
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
    res.status(500).json({ error: 'Internal error' });
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
