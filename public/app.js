const $ = (id) => document.getElementById(id);
const fmtAge = (ms) => { if (ms == null) return 'n/a'; const s = Math.floor(ms / 1e3); if (s < 60) return `${s}s`; const m = Math.floor(s / 60); if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`; };
const card = (t, m, a = '') => `<div class="card"><h3>${t}</h3><div class="meta">${m}</div>${a ? `<div class="actions">${a}</div>` : ''}</div>`;
const STATUS = ['todo', 'in_progress', 'review', 'done'];
let token = localStorage.getItem('missionToken') || '';
let tasks = [];
let selectedTaskTab = 'all';
let currentFilePath = '';
let editMode = false;

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

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}

function renderTasks() {
  const tabs = ['all', ...Array.from(new Set(tasks.map((t) => t.tab || 'general'))).sort()];
  $('taskTabs').innerHTML = tabs.map((t) => `<button class="pill" onclick="setTaskTab('${encodeURIComponent(t)}')">${t}</button>`).join('');
  const filtered = selectedTaskTab === 'all' ? tasks : tasks.filter((t) => (t.tab || 'general') === selectedTaskTab);
  $('kanban').innerHTML = STATUS.map((s) => {
    const label = s.replace('_', ' ').toUpperCase();
    const colTasks = filtered.filter((t) => t.status === s);
    return `<div class="col"><h3>${label} (${colTasks.length})</h3>${colTasks.map((t) => `<div class="task"><div><strong>${t.title}</strong></div><small>${t.agentId} · ${t.tab}</small><div class="meta">Dispatch: ${t.dispatchState || 'idle'}${t.dispatchError ? `<br/>Err: ${t.dispatchError}` : ''}</div><div class="actions"><button onclick="moveTask('${t.id}','${s}')">Next</button><button onclick="dispatchTaskToAgent('${t.id}')">Send</button><button onclick="deleteTask('${t.id}')">Delete</button></div></div>`).join('') || '<div class="meta">No tasks</div>'}</div>`;
  }).join('');
}

function renderDashboard(d) {
  const agents = d.status?.agents?.agents || [];
  const hb = new Map((d.status?.heartbeat?.agents || []).map((x) => [x.agentId, x]));
  const ai = new Map((d.agentInsights || []).map((x) => [x.agentId, x]));
  const gw = d.status?.gateway;
  const dot = $('gatewayDot');
  if (dot) dot.style.background = gw?.reachable ? '#90e0ad' : '#f1abab';

  $('stats').innerHTML = [
    ['Agents', agents.length],
    ['Sessions', d.status?.sessions?.count ?? 'n/a'],
    ['Cron jobs', d.cronJobs?.length ?? 0],
    ['Artifacts', d.artifacts?.length ?? 0],
  ].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  $('usageCards').innerHTML = [
    ['Today', d.tokenUsage?.today ?? 0],
    ['Last 7 days', d.tokenUsage?.last7d ?? 0],
    ['Last 30 days', d.tokenUsage?.last30d ?? 0],
  ].map(([k, v]) => `<div class="card"><h3>${k}</h3><div class="meta">Token usage window</div><div style="font-size:1.4rem;font-weight:700;margin-top:6px;">${v}</div></div>`).join('');
  $('agents').innerHTML = agents.map((a) => {
    const h = hb.get(a.id);
    const insight = ai.get(a.id) || { cronCount: 0, coreFiles: [], memoryFiles: [], skills: [] };
    const badge = h?.enabled ? '<span class="badge ok">heartbeat on</span>' : '<span class="badge off">heartbeat off</span>';
    const mdList = [...(insight.coreFiles || []), ...(insight.memoryFiles || [])]
      .filter((f) => f.name.toLowerCase().endsWith('.md'))
      .slice(0, 40)
      .map((f) => `<li>${f.name} <button class="file-action" data-action="view" data-path="${encodeURIComponent(f.relPath)}" title="View"><i data-lucide="eye"></i></button> <button class="file-action" data-action="edit" data-path="${encodeURIComponent(f.relPath)}" title="Edit"><i data-lucide="pencil"></i></button></li>`)
      .join('');
    const skills = (insight.skills || []).map((s) => s.name).join(', ') || 'none';
    const hbBtn = insight.heartbeatConfigured
      ? `<button onclick="toggleHeartbeat('${a.id}','disable')" title="Disable heartbeat"><i data-lucide="pause"></i></button>`
      : `<button onclick="toggleHeartbeat('${a.id}','enable')" title="Enable heartbeat"><i data-lucide="play"></i></button>`;
    return card(`${a.name} (${a.id})`, `${badge}<br/>Last active: ${fmtAge(a.lastActiveAgeMs)} ago<br/>Cron jobs: ${insight.cronCount}<br/>Skills: ${skills}<br/>Markdown files: ${(insight.coreFiles||[]).length + (insight.memoryFiles||[]).length}<br/>Heartbeat tasks: ${insight.heartbeatConfigured ? 'configured' : 'disabled'}`, `${hbBtn}<ul class="meta">${mdList || '<li>No markdown files</li>'}</ul>`);
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
  refreshIcons();
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
  await Promise.all([loadAudit(), loadTasks(), loadResearchRequests()]);
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

async function dispatchTaskToAgent(id) {
  ensureToken();
  const r = await fetch(`/api/tasks/${encodeURIComponent(id)}/dispatch`, { method: 'POST', headers: authHeaders() });
  const d = await r.json();
  if (d.error) alert(d.error);
  await loadTasks();
}

async function loadResearchRequests() {
  const r = await fetch('/api/research/requests');
  const d = await r.json();
  const rows = d.requests || [];
  $('researchRequests').innerHTML = rows.map((x) => {
    const actions = x.status === 'pending'
      ? `<button onclick="approveResearch('${x.id}')">Approve & Run</button><button onclick="declineResearch('${x.id}')">Decline</button>`
      : '';
    const resultBtn = x.result ? `<button onclick="viewTextResult('${encodeURIComponent(x.result)}')">View result</button>` : '';
    return card(`${x.capability} · ${x.topic}`, `Status: ${x.status}<br/>Created: ${new Date(x.createdAt).toLocaleString()}<br/>Context: ${x.context || '-'}`, `${actions}${resultBtn}`);
  }).join('') || '<div class="meta">No research requests yet.</div>';
}

async function addResearchRequest() {
  ensureToken();
  const capability = $('researchCapability').value;
  const topic = $('researchTopic').value.trim();
  const context = $('researchContext').value.trim();
  if (!topic) return alert('Research topic required');
  const r = await fetch('/api/research/requests', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ capability, topic, context }) });
  const d = await r.json();
  if (d.error) return alert(d.error);
  $('researchTopic').value = '';
  $('researchContext').value = '';
  await loadResearchRequests();
}

async function approveResearch(id) {
  ensureToken();
  const r = await fetch(`/api/research/requests/${encodeURIComponent(id)}/approve`, { method: 'POST', headers: authHeaders() });
  const d = await r.json();
  if (d.error) alert(d.error);
  await loadResearchRequests();
}

async function declineResearch(id) {
  ensureToken();
  const reason = prompt('Decline reason (optional):') || '';
  const r = await fetch(`/api/research/requests/${encodeURIComponent(id)}/decline`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ reason }) });
  const d = await r.json();
  if (d.error) alert(d.error);
  await loadResearchRequests();
}

function viewTextResult(encoded) {
  $('viewer').textContent = decodeURIComponent(encoded);
  switchPanel('viewer');
}

function setTaskTab(tab) {
  selectedTaskTab = decodeURIComponent(tab);
  renderTasks();
}

async function viewFile(p) {
  const rel = decodeURIComponent(p);
  currentFilePath = rel;
  const r = await fetch(`/api/file?path=${encodeURIComponent(rel)}`);
  const d = await r.json();
  const txt = d.error ? `Error: ${d.error}` : d.content;
  $('viewer').textContent = txt;
  $('editor').value = txt;
  $('editingPath').textContent = rel;
  editMode = false;
  $('editor').style.display = 'none';
  $('viewer').style.display = 'block';
  switchPanel('viewer');
}

async function editFile(p) {
  await viewFile(p);
  editMode = true;
  $('editor').style.display = 'block';
  $('viewer').style.display = 'none';
}

async function saveEditedFile() {
  ensureToken();
  if (!currentFilePath) return alert('No file selected');
  const r = await fetch('/api/file/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ path: currentFilePath, content: $('editor').value }) });
  const d = await r.json();
  if (d.error) return alert(d.error);
  await viewFile(encodeURIComponent(currentFilePath));
  await refresh();
}

async function approveOne(p) { ensureToken(); const rel = decodeURIComponent(p); await fetch('/api/approve', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ path: rel }) }); await refresh(); await viewFile(p); }
async function runCron(id) { ensureToken(); const r = await fetch('/api/cron/run', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ id }) }); const d = await r.json(); if (d.error) alert(d.error); else alert('Cron run triggered'); await refresh(); }
async function toggleHeartbeat(agentId, mode) { ensureToken(); const r = await fetch(`/api/heartbeat/${encodeURIComponent(agentId)}/${encodeURIComponent(mode)}`, { method: 'POST', headers: authHeaders() }); const d = await r.json(); if (d.error) alert(d.error); await refresh(); }
async function loadAudit() { const r = await fetch('/api/audit?limit=40'); const d = await r.json(); $('audit').innerHTML = (d.events || []).map((e) => card(`${e.type} · ${new Date(e.ts).toLocaleString()}`, `Path/ID: ${e.path || e.id || e.taskId || e.agentId || '-'}<br/>By: ${e.actor || 'dashboard'}`)).join('') || '<div class="meta">No audit events yet.</div>'; }
async function searchTranscripts() { const q = $('q').value || ''; const agentId = $('agentFilter').value || ''; const r = await fetch(`/api/transcripts?q=${encodeURIComponent(q)}&agentId=${encodeURIComponent(agentId)}&limit=80`); const d = await r.json(); $('transcripts').innerHTML = (d.results || []).map((x) => card(`${x.agentId} · ${x.role}`, `${x.timestamp}<br/>session: ${x.sessionId}<br/><br/>${x.text}`)).join('') || '<div class="meta">No transcript matches.</div>'; }

document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => switchPanel(b.dataset.tab)));
$('refreshBtn').addEventListener('click', refresh);
$('searchBtn').addEventListener('click', searchTranscripts);
$('addTaskBtn').addEventListener('click', addTask);
$('addResearchBtn').addEventListener('click', addResearchRequest);
$('agents').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.file-action');
  if (!btn) return;
  const p = btn.dataset.path;
  if (!p) return;
  if (btn.dataset.action === 'edit') editFile(p);
  else viewFile(p);
});
$('editModeBtn').addEventListener('click', () => {
  if (!currentFilePath) return alert('Open a markdown file first');
  editMode = !editMode;
  $('editor').style.display = editMode ? 'block' : 'none';
  $('viewer').style.display = editMode ? 'none' : 'block';
});
$('saveEditBtn').addEventListener('click', saveEditedFile);
const ws = new WebSocket(`ws://${location.host}/ws`);
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.type === 'dashboard') renderDashboard(m.data); };

refresh();
window.viewFile = viewFile; window.editFile = editFile; window.approveOne = approveOne; window.runCron = runCron; window.toggleHeartbeat = toggleHeartbeat; window.moveTask = moveTask; window.dispatchTaskToAgent = dispatchTaskToAgent; window.deleteTask = deleteTask; window.setTaskTab = setTaskTab; window.approveResearch = approveResearch; window.declineResearch = declineResearch; window.viewTextResult = viewTextResult;
