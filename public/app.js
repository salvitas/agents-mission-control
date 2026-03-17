const $ = (id) => document.getElementById(id);
const fmtAge = (ms) => { if (ms == null) return 'n/a'; const s = Math.floor(ms / 1e3); if (s < 60) return `${s}s`; const m = Math.floor(s / 60); if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`; };
const card = (t, m, a = '') => `<div class="card"><h3>${t}</h3><div class="meta">${m}</div>${a ? `<div class="actions">${a}</div>` : ''}</div>`;
const STATUS = ['todo', 'in_progress', 'review', 'done'];
let token = localStorage.getItem('missionToken') || '';
let tasks = [];
let selectedTaskTab = 'all';

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['x-mission-token'] = token;
  return h;
}

function ensureToken() {
  if (token) return true;
  const entered = prompt('Enter MISSION_CONTROL_TOKEN (or leave empty if disabled server-side):') || '';
  token = entered.trim();
  localStorage.setItem('missionToken', token);
  return true;
}

function switchPanel(tab) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
}

function renderTasks() {
  const tabs = ['all', ...Array.from(new Set(tasks.map((t) => t.tab || 'general'))).sort()];
  $('taskTabs').innerHTML = tabs.map((t) => `<button class="pill" onclick="setTaskTab('${encodeURIComponent(t)}')">${t}</button>`).join('');
  const filtered = selectedTaskTab === 'all' ? tasks : tasks.filter((t) => (t.tab || 'general') === selectedTaskTab);
  $('kanban').innerHTML = STATUS.map((s) => {
    const label = s.replace('_', ' ').toUpperCase();
    const colTasks = filtered.filter((t) => t.status === s);
    return `<div class="col"><h3>${label} (${colTasks.length})</h3>${colTasks.map((t) => `<div class="task"><div><strong>${t.title}</strong></div><small>${t.agentId} · ${t.tab}</small><div class="actions"><button onclick="moveTask('${t.id}','${s}')">Next</button><button onclick="deleteTask('${t.id}')">Delete</button></div></div>`).join('') || '<div class="meta">No tasks</div>'}</div>`;
  }).join('');
}

function renderDashboard(d) {
  const agents = d.status?.agents?.agents || [];
  const hb = new Map((d.status?.heartbeat?.agents || []).map((x) => [x.agentId, x]));
  const ai = new Map((d.agentInsights || []).map((x) => [x.agentId, x]));
  $('stats').innerHTML = [['Agents', agents.length], ['Sessions', d.status?.sessions?.count ?? 'n/a'], ['Cron jobs', d.cronJobs?.length ?? 0], ['Artifacts', d.artifacts?.length ?? 0], ['Adapters', d.adaptersCount ?? 0]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  $('agents').innerHTML = agents.map((a) => {
    const h = hb.get(a.id);
    const insight = ai.get(a.id) || { cronCount: 0, coreFiles: [], memoryFiles: [] };
    const badge = h?.enabled ? '<span class="badge ok">heartbeat on</span>' : '<span class="badge off">heartbeat off</span>';
    const coreActions = insight.coreFiles.slice(0, 12).map((f) => `<button onclick="viewFile('${encodeURIComponent(f.relPath)}')">${f.name}</button>`).join('');
    const memActions = insight.memoryFiles.slice(0, 20).map((f) => `<button onclick="viewFile('${encodeURIComponent(f.relPath)}')">${f.name}</button>`).join('');
    return card(`${a.name} (${a.id})`, `${badge}<br/>Last active: ${fmtAge(a.lastActiveAgeMs)} ago<br/>Cron jobs: ${insight.cronCount}<br/>Memory files: ${insight.memoryFiles.length}`, `${coreActions}${memActions}`);
  }).join('');
  $('cronJobs').innerHTML = (d.cronJobs || []).map((j) => card(`${j.name} (${j.id})`, `Agent: ${j.agentId}<br/>Schedule: ${j.schedule?.expr || 'n/a'}<br/>Last: ${j.state?.lastRunStatus || 'n/a'} · ${fmtAge(Date.now() - (j.state?.lastRunAtMs || Date.now()))} ago`, `<button onclick="runCron('${j.id}')">Run now</button>`)).join('') || '<div class="meta">No cron jobs.</div>';
  const queues = (d.artifacts || []).filter((a) => a.type === 'queue');
  $('queues').innerHTML = queues.map((q) => {
    const rel = q.rel; const pending = q.queue?.pending;
    const b = pending > 0 ? `<span class="badge warn">${pending} pending</span>` : '<span class="badge ok">no pending</span>';
    const ap = rel.endsWith('.md') ? `<button onclick="approveOne('${encodeURIComponent(rel)}')">Approve next</button>` : '';
    return card(rel, `${b}<br/>Adapter: ${q.queue?.adapter || 'n/a'}<br/>Updated: ${new Date(q.mtimeMs).toLocaleString()}`, `<button onclick="viewFile('${encodeURIComponent(rel)}')">Open</button>${ap}`);
  }).join('') || '<div class="meta">No queue files detected.</div>';
  $('artifacts').innerHTML = (d.artifacts || []).filter((a) => a.type !== 'queue').slice(0, 80).map((a) => card(`${a.type.toUpperCase()} · ${a.rel}`, `Updated: ${new Date(a.mtimeMs).toLocaleString()}<br/>Size: ${a.size} bytes`, `<button onclick="viewFile('${encodeURIComponent(a.rel)}')">Open</button>`)).join('');
}

async function loadTasks() {
  const r = await fetch('/api/tasks');
  const d = await r.json();
  tasks = d.tasks || [];
  renderTasks();
}

async function refresh() {
  const r = await fetch('/api/dashboard');
  renderDashboard(await r.json());
  await Promise.all([loadAudit(), loadTasks()]);
}

async function addTask() {
  ensureToken();
  const title = $('taskTitle').value.trim();
  if (!title) return alert('Task title required');
  await fetch('/api/tasks', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title, agentId: $('taskAgent').value || 'unassigned', tab: $('taskTab').value || 'general', status: 'todo' }) });
  $('taskTitle').value = '';
  await loadTasks();
}

async function moveTask(id, current) {
  ensureToken();
  const i = STATUS.indexOf(current);
  const next = STATUS[Math.min(i + 1, STATUS.length - 1)];
  await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status: next }) });
  await loadTasks();
}

async function deleteTask(id) {
  ensureToken();
  await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() });
  await loadTasks();
}

function setTaskTab(tab) {
  selectedTaskTab = decodeURIComponent(tab);
  renderTasks();
}

async function viewFile(p) { const rel = decodeURIComponent(p); const r = await fetch(`/api/file?path=${encodeURIComponent(rel)}`); const d = await r.json(); $('viewer').textContent = d.error ? `Error: ${d.error}` : d.content; }
async function approveOne(p) { ensureToken(); const rel = decodeURIComponent(p); await fetch('/api/approve', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ path: rel }) }); await refresh(); await viewFile(p); }
async function runCron(id) { ensureToken(); const r = await fetch('/api/cron/run', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ id }) }); const d = await r.json(); if (d.error) alert(d.error); else alert('Cron run triggered'); await refresh(); }
async function loadAudit() { const r = await fetch('/api/audit?limit=40'); const d = await r.json(); $('audit').innerHTML = (d.events || []).map((e) => card(`${e.type} · ${new Date(e.ts).toLocaleString()}`, `Path/ID: ${e.path || e.id || e.taskId || '-'}<br/>By: ${e.actor || 'dashboard'}`)).join('') || '<div class="meta">No audit events yet.</div>'; }
async function searchTranscripts() { const q = $('q').value || ''; const agentId = $('agentFilter').value || ''; const r = await fetch(`/api/transcripts?q=${encodeURIComponent(q)}&agentId=${encodeURIComponent(agentId)}&limit=80`); const d = await r.json(); $('transcripts').innerHTML = (d.results || []).map((x) => card(`${x.agentId} · ${x.role}`, `${x.timestamp}<br/>session: ${x.sessionId}<br/><br/>${x.text}`)).join('') || '<div class="meta">No transcript matches.</div>'; }

document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => switchPanel(b.dataset.tab)));
$('refreshBtn').addEventListener('click', refresh);
$('searchBtn').addEventListener('click', searchTranscripts);
$('addTaskBtn').addEventListener('click', addTask);
const ws = new WebSocket(`ws://${location.host}/ws`);
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.type === 'dashboard') renderDashboard(m.data); };

refresh();
window.viewFile = viewFile; window.approveOne = approveOne; window.runCron = runCron; window.moveTask = moveTask; window.deleteTask = deleteTask; window.setTaskTab = setTaskTab;
