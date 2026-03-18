const $ = (id) => document.getElementById(id);
const card = (t, m, a = '') => `<div class="card"><h3>${t}</h3><div class="meta">${m}</div>${a ? `<div class="actions">${a}</div>` : ''}</div>`;
const fmtAge = (ms) => { if (ms == null) return 'n/a'; const s = Math.floor(ms / 1000); if (s < 60) return `${s}s`; const m = Math.floor(s / 60); if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`; };
const STATUS = ['todo', 'in_progress', 'review', 'done'];

let token = localStorage.getItem('missionToken') || '';
let latestDashboard = null;
let latestTasks = [];
let latestActivity = [];
let selectedAgentId = '';
let currentFilePath = '';

function authHeaders() { const h = { 'Content-Type': 'application/json' }; if (token) h['x-mission-token'] = token; return h; }
function ensureToken() { if (token) return true; token = (prompt('MISSION_CONTROL_TOKEN:') || '').trim(); localStorage.setItem('missionToken', token); return true; }
function slugFromAgentId(agentId) { return String(agentId || '').replace(/^lucy-/, ''); }

function switchPane(tab) {
  document.querySelectorAll('.wtab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.id === `pane-${tab}`));
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}

function renderFleet() {
  const agents = latestDashboard?.status?.agents?.agents || [];
  if (!selectedAgentId && agents[0]) selectedAgentId = agents[0].id;
  $('fleetCount').textContent = String(agents.length);
  $('fleetList').innerHTML = agents.map((a) => {
    const active = a.id === selectedAgentId ? 'active' : '';
    return `<div class="fleet-item ${active}" data-agent="${a.id}"><div class="name">${a.name}</div><div class="meta">${a.id} · last active ${fmtAge(a.lastActiveAgeMs)} ago</div></div>`;
  }).join('');
}

function renderTopState() {
  const gw = latestDashboard?.status?.gateway;
  const dot = $('gatewayDot');
  if (dot) dot.style.background = gw?.reachable ? '#22c55e' : '#ef4444';
}

function renderAgentWorkspace() {
  const d = latestDashboard || {};
  const agents = d.status?.agents?.agents || [];
  const ai = new Map((d.agentInsights || []).map((x) => [x.agentId, x]));
  const hb = new Map((d.status?.heartbeat?.agents || []).map((x) => [x.agentId, x]));
  const a = agents.find((x) => x.id === selectedAgentId);
  if (!a) return;

  const insight = ai.get(a.id) || { skills: [], coreFiles: [], memoryFiles: [], cronCount: 0, heartbeatConfigured: false };
  const runtime = d.runtimeByAgent?.[a.id] || { inProgress: 0, review: 0, todo: 0, lastTaskAt: null };
  const agentTasks = latestTasks.filter((t) => t.agentId === a.id);

  $('agentTitle').textContent = `${a.name} (${a.id})`;

  $('agentKpis').innerHTML = [
    ['In progress', runtime.inProgress],
    ['Review', runtime.review],
    ['Todo', runtime.todo],
    ['Cron jobs', insight.cronCount],
  ].map(([k, v]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  $('agentSummary').innerHTML = [
    card('Status', `Heartbeat: ${hb.get(a.id)?.enabled ? 'on' : 'off'}<br/>Tasks: ${agentTasks.length}<br/>Last task: ${runtime.lastTaskAt ? new Date(runtime.lastTaskAt).toLocaleString() : 'n/a'}`),
    card('Skills', (insight.skills || []).map((s) => s.name).join(', ') || 'No skills detected'),
  ].join('');

  $('agentControls').innerHTML = [
    card('Heartbeat', `Current: ${insight.heartbeatConfigured ? 'configured' : 'disabled'}`, `${insight.heartbeatConfigured ? `<button data-hb="disable"><i data-lucide="pause"></i> Disable</button>` : `<button data-hb="enable"><i data-lucide="play"></i> Enable</button>`}`),
    card('Quick Actions', 'Operations on current agent', `<button data-open="timeline"><i data-lucide="timeline"></i> Timeline</button><button data-open="tasks"><i data-lucide="list-todo"></i> Tasks</button>`),
  ].join('');

  const cronJobs = (d.cronJobs || []).filter((c) => c.agentId === a.id);
  $('cronCards').innerHTML = cronJobs.map((c) => card(c.name, `Schedule: ${c.schedule?.expr || 'n/a'}<br/>Last: ${c.state?.lastRunStatus || 'n/a'}`, `<button data-cron="${c.id}"><i data-lucide="play-circle"></i> Run now</button>`)).join('') || '<div class="meta">No cron jobs for this agent.</div>';

  renderTaskBoard(a.id);
  renderTimeline(a.id);
  renderFiles(a.id, insight);
}

function renderTaskBoard(agentId) {
  const rows = latestTasks.filter((t) => t.agentId === agentId);
  $('taskBoard').innerHTML = STATUS.map((s) => {
    const col = rows.filter((r) => r.status === s);
    return `<div class="col"><h3>${s.replace('_', ' ')}</h3>${col.map((t) => `<div class="task"><div><strong>${t.title}</strong></div><div class="meta">${t.tab} · ${t.dispatchState || 'idle'}</div><div class="actions"><button class="task-btn" data-action="next" data-id="${t.id}" data-status="${s}"><i data-lucide="arrow-right"></i> Next</button><button class="task-btn" data-action="send" data-id="${t.id}"><i data-lucide="send"></i> Send</button><button class="task-btn" data-action="result" data-id="${t.id}"><i data-lucide="file-text"></i> Result</button></div></div>`).join('') || '<div class="meta">No tasks</div>'}</div>`;
  }).join('');

  const tabs = ['all', ...new Set(rows.map((t) => t.tab || 'general'))];
  $('taskTabs').innerHTML = tabs.map((t) => `<button class="outline-btn task-tab" data-tab="${encodeURIComponent(t)}">${t}</button>`).join('');
}

function applyTimelineFilters(rows, agentId) {
  const type = ($('activityType').value || '').trim().toLowerCase();
  const winH = Number($('activityWindow').value || 0);
  const now = Date.now();
  return rows.filter((e) => {
    if (agentId && e.agentId && e.agentId !== agentId) return false;
    if (type && !String(e.type || '').toLowerCase().includes(type)) return false;
    if (winH > 0) {
      const ts = new Date(e.ts || 0).getTime();
      if (!ts || now - ts > winH * 3600 * 1000) return false;
    }
    return true;
  });
}

function renderTimeline(agentId) {
  const rows = applyTimelineFilters(latestActivity, agentId);
  $('timelineCards').innerHTML = rows.slice(0, 80).map((e, idx) => {
    const fail = e.ok === false || String(e.status || '').toLowerCase() === 'error' || String(e.dispatchState || '').toLowerCase() === 'error';
    const badge = fail ? '<span class="pill" style="border-color:#ef4444;color:#fca5a5">failure</span>' : '<span class="pill" style="border-color:#22c55e;color:#86efac">ok</span>';
    return card(`${e.type} · ${new Date(e.ts).toLocaleString()}`, `${badge}<br/>Agent: ${e.agentId || '-'}<br/>Task: ${e.taskId || e.requestId || '-'}<br/>Status: ${e.status || e.dispatchState || e.ok || '-'}<br/>${e.title || e.topic || ''}`, `<button class="tl-detail" data-idx="${idx}"><i data-lucide="file-search"></i> Details</button>`);
  }).join('') || '<div class="meta">No timeline events.</div>';

  $('activityTicker').innerHTML = rows.slice(0, 8).map((e) => `<div class="card"><div class="meta">${new Date(e.ts).toLocaleTimeString()} · ${e.type} · ${e.status || e.dispatchState || e.ok || '-'}</div></div>`).join('') || '<div class="meta">No recent activity.</div>';
}

function renderFiles(agentId, insight) {
  const allMd = [...(insight.coreFiles || []), ...(insight.memoryFiles || [])].filter((f) => f.name.toLowerCase().endsWith('.md'));
  const artifacts = (latestDashboard?.artifacts || []).filter((a) => a.agentId === agentId && a.type !== 'queue');
  $('fileCards').innerHTML = [
    card('Markdown files', allMd.slice(0, 40).map((f) => `${f.name} <button class="open-file" data-path="${encodeURIComponent(f.relPath)}"><i data-lucide="folder-open"></i> Open</button>`).join('<br/>') || 'No markdown files'),
    card('Artifacts', artifacts.slice(0, 40).map((a) => `${a.type.toUpperCase()} · ${a.rel} <button class="open-file" data-path="${encodeURIComponent(a.rel)}"><i data-lucide="file-search"></i> Open</button>`).join('<br/>') || 'No artifacts'),
  ].join('');
}

async function loadData() {
  const [dRes, tRes, aRes] = await Promise.all([
    fetch('/api/dashboard'),
    fetch('/api/tasks'),
    fetch('/api/activity?limit=140'),
  ]);
  latestDashboard = await dRes.json();
  latestTasks = (await tRes.json()).tasks || [];
  latestActivity = (await aRes.json()).events || [];
}

async function refreshAll() {
  await loadData();
  renderTopState();
  renderFleet();
  renderAgentWorkspace();
  refreshIcons();
}

async function addTask() {
  ensureToken();
  if (!selectedAgentId) return;
  const title = ($('taskTitle').value || '').trim();
  const tab = ($('taskTab').value || 'general').trim();
  if (!title) return alert('Task title required');
  await fetch('/api/tasks', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title, tab, agentId: selectedAgentId, status: 'todo' }) });
  $('taskTitle').value = '';
  await refreshAll();
}

async function mutateTask(id, patch) {
  ensureToken();
  const r = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(patch) });
  const d = await r.json();
  if (d.error) alert(d.error);
  await refreshAll();
}

async function dispatchTask(id) {
  ensureToken();
  const r = await fetch(`/api/tasks/${encodeURIComponent(id)}/dispatch`, { method: 'POST', headers: authHeaders() });
  const d = await r.json();
  if (d.error) alert(d.error);
  await refreshAll();
}

function showInViewer(content, label) {
  $('viewer').textContent = content;
  $('editor').value = content;
  $('editingPath').textContent = label || '';
  $('editor').style.display = 'none';
  $('viewer').style.display = 'block';
}

async function openFile(encodedPath) {
  const rel = decodeURIComponent(encodedPath);
  currentFilePath = rel;
  const r = await fetch(`/api/file?path=${encodeURIComponent(rel)}`);
  const d = await r.json();
  showInViewer(d.error ? `Error: ${d.error}` : d.content, rel);
}

async function saveCurrentFile() {
  ensureToken();
  if (!currentFilePath) return alert('No file selected');
  const r = await fetch('/api/file/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ path: currentFilePath, content: $('editor').value }) });
  const d = await r.json();
  if (d.error) return alert(d.error);
  await openFile(encodeURIComponent(currentFilePath));
  await refreshAll();
}

async function runCron(id) {
  ensureToken();
  const r = await fetch('/api/cron/run', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ id }) });
  const d = await r.json();
  if (d.error) alert(d.error);
  await refreshAll();
}

async function toggleHeartbeat(mode) {
  ensureToken();
  const r = await fetch(`/api/heartbeat/${encodeURIComponent(selectedAgentId)}/${encodeURIComponent(mode)}`, { method: 'POST', headers: authHeaders() });
  const d = await r.json();
  if (d.error) alert(d.error);
  await refreshAll();
}

// events
document.querySelectorAll('.wtab').forEach((b) => b.addEventListener('click', () => switchPane(b.dataset.tab)));
$('refreshBtn').addEventListener('click', refreshAll);
$('addTaskBtn').addEventListener('click', addTask);
$('activityFilterBtn').addEventListener('click', () => renderTimeline(selectedAgentId));
$('editModeBtn').addEventListener('click', () => {
  if (!currentFilePath) return alert('Open a markdown file first');
  const edit = $('editor').style.display !== 'block';
  $('editor').style.display = edit ? 'block' : 'none';
  $('viewer').style.display = edit ? 'none' : 'block';
});
$('saveEditBtn').addEventListener('click', saveCurrentFile);

$('fleetList').addEventListener('click', (ev) => {
  const item = ev.target.closest('.fleet-item');
  if (!item) return;
  selectedAgentId = item.dataset.agent;
  renderFleet();
  renderAgentWorkspace();
});

$('taskBoard').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.task-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (!id) return;
  if (action === 'next') {
    const current = btn.dataset.status;
    const i = STATUS.indexOf(current);
    mutateTask(id, { status: STATUS[Math.min(i + 1, STATUS.length - 1)] });
  } else if (action === 'send') dispatchTask(id);
  else if (action === 'result') {
    const t = latestTasks.find((x) => x.id === id);
    showInViewer(t?.result || t?.dispatchError || 'No result yet', `task:${id}`);
  }
});

$('agentControls').addEventListener('click', (ev) => {
  const hb = ev.target.closest('[data-hb]');
  if (hb) return toggleHeartbeat(hb.dataset.hb);
  const open = ev.target.closest('[data-open]');
  if (open) return switchPane(open.dataset.open);
});

$('cronCards').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-cron]');
  if (!b) return;
  runCron(b.dataset.cron);
});

$('timelineCards').addEventListener('click', (ev) => {
  const b = ev.target.closest('.tl-detail');
  if (!b) return;
  const idx = Number(b.dataset.idx);
  const rows = applyTimelineFilters(latestActivity, selectedAgentId);
  const e = rows[idx];
  if (!e) return;
  showInViewer(JSON.stringify(e, null, 2), `timeline:${idx}`);
});

$('fileCards').addEventListener('click', (ev) => {
  const b = ev.target.closest('.open-file');
  if (!b) return;
  openFile(b.dataset.path);
});

const ws = new WebSocket(`ws://${location.host}/ws`);
ws.onmessage = async (ev) => {
  const m = JSON.parse(ev.data || '{}');
  if (m.type === 'dashboard') {
    latestDashboard = m.data;
    renderTopState();
    renderFleet();
    renderAgentWorkspace();
    refreshIcons();
  }
};

document.addEventListener('keydown', (ev) => {
  if (ev.target && ['INPUT','TEXTAREA','SELECT'].includes(ev.target.tagName)) return;
  const k = ev.key.toLowerCase();
  if (k === '1') switchPane('overview');
  else if (k === '2') switchPane('tasks');
  else if (k === '3') switchPane('control');
  else if (k === '4') switchPane('timeline');
  else if (k === '5') switchPane('files');
  else if (k === 'r') refreshAll();
});

refreshAll();