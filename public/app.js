const $ = (id) => document.getElementById(id);
const card = (title, meta, actions = '', extra = '') => `<div class="card"><h3>${title}</h3><div class="meta">${meta}</div>${actions ? `<div class="actions">${actions}</div>` : ''}${extra}</div>`;
const fmtAge = (ms) => { if (ms == null) return 'n/a'; const s = Math.floor(ms/1000); if (s < 60) return `${s}s`; const m = Math.floor(s/60); if (m < 60) return `${m}m`; const h = Math.floor(m/60); if (h < 24) return `${h}h`; return `${Math.floor(h/24)}d`; };

let token = localStorage.getItem('missionToken') || '';
let dashboard = null;
let tasks = [];
let activity = [];
let currentFilePath = '';

function authHeaders(){ const h = {'Content-Type':'application/json'}; if(token) h['x-mission-token']=token; return h; }
function ensureToken(){ if(token) return true; token=(prompt('MISSION_CONTROL_TOKEN:')||'').trim(); localStorage.setItem('missionToken',token); return true; }
function refreshIcons(){ if(window.lucide?.createIcons) window.lucide.createIcons(); }

async function loadAll(){
  const [d,t,a] = await Promise.all([
    fetch('/api/dashboard').then(r=>r.json()),
    fetch('/api/tasks').then(r=>r.json()).then(x=>x.tasks||[]),
    fetch('/api/activity?limit=100').then(r=>r.json()).then(x=>x.events||[]),
  ]);
  dashboard = d; tasks = t; activity = a;
}

function renderTop(){
  const gw = dashboard?.status?.gateway;
  $('gatewayDot').style.background = gw?.reachable ? '#22c55e' : '#ef4444';
}

function renderAgents(){
  const agents = dashboard?.status?.agents?.agents || [];
  const hb = new Map((dashboard?.status?.heartbeat?.agents || []).map(x=>[x.agentId,x]));
  const ai = new Map((dashboard?.agentInsights || []).map(x=>[x.agentId,x]));

  $('agentCards').innerHTML = agents.map((a, idx) => {
    const insight = ai.get(a.id) || { skills:[], coreFiles:[], memoryFiles:[], cronCount:0, heartbeatConfigured:false };
    const t = tasks.filter(x=>x.agentId===a.id);
    const inProg = t.filter(x=>x.status==='in_progress').length;
    const todo = t.filter(x=>x.status==='todo').length;
    const review = t.filter(x=>x.status==='review').length;

    const files = [...(insight.coreFiles||[]), ...(insight.memoryFiles||[])].filter(f=>f.name.toLowerCase().endsWith('.md')).slice(0,20);
    const cron = (dashboard?.cronJobs||[]).filter(c=>c.agentId===a.id);

    const actions = [
      `<button data-agent="${a.id}" data-action="toggle">${insight.heartbeatConfigured ? 'Disable HB' : 'Enable HB'}</button>`,
      ...cron.slice(0,3).map(c=>`<button data-agent="${a.id}" data-cron="${c.id}">Run ${c.name}</button>`),
      `<button data-agent="${a.id}" data-action="newtask">+ Task</button>`,
      `<button data-agent="${a.id}" data-action="expand">Expand</button>`
    ].join('');

    const extra = `<div class="expand hidden" id="exp-${idx}">
      <div class="meta"><strong>Skills:</strong> ${(insight.skills||[]).map(s=>s.name).join(', ') || 'none'}</div>
      <div class="meta" style="margin-top:6px"><strong>Workflow:</strong> in_progress=${inProg}, review=${review}, todo=${todo}</div>
      <div class="meta" style="margin-top:6px"><strong>Files:</strong><br/>${files.map(f=>`${f.name} <button class="open-file" data-path="${encodeURIComponent(f.relPath)}">Open</button>`).join('<br/>') || 'none'}</div>
      <div class="meta" style="margin-top:6px"><strong>Cron:</strong><br/>${cron.map(c=>`${c.name} (${c.schedule?.expr||'n/a'})`).join('<br/>') || 'none'}</div>
      <div class="meta" style="margin-top:6px"><strong>Tasks:</strong><br/>${t.slice(0,8).map(x=>`[${x.status}] ${x.title} <button class="task-send" data-task="${x.id}">Send</button> <button class="task-result" data-task="${x.id}">Result</button>`).join('<br/>') || 'none'}</div>
    </div>`;

    return card(
      `${a.name} (${a.id})`,
      `Heartbeat: ${hb.get(a.id)?.enabled ? 'on' : 'off'}<br/>Last active: ${fmtAge(a.lastActiveAgeMs)} ago<br/>Cron: ${insight.cronCount} · Tasks: ${t.length}<br/>Queue: ${todo} · Running: ${inProg} · Review: ${review}`,
      actions,
      extra
    );
  }).join('') || '<div class="meta">No agents found.</div>';

  refreshIcons();
}

function renderGenericActions(){
  const failures = tasks.filter(t=>t.dispatchState==='error').length;
  const pendingApprovals = (dashboard?.artifacts||[]).filter(a=>a.type==='queue' && (a.queue?.pending||0)>0).length;
  const html = [
    card('System', `Gateway: ${dashboard?.status?.gateway?.reachable ? 'online' : 'offline'}<br/>Sessions: ${dashboard?.status?.sessions?.count ?? 'n/a'}`,
      `<button id="ga-refresh">Refresh now</button><button id="ga-stream">Reload stream</button>`),
    card('Health', `Dispatch failures: ${failures}<br/>Queue files with pending: ${pendingApprovals}`,
      `<button id="ga-failures">Show failures</button><button id="ga-activity">Open activity</button>`),
    card('Quick ops', `Common control shortcuts`,
      `<button id="ga-cron">Run first cron</button><button id="ga-token">Token usage</button>`),
  ].join('');
  $('genericActions').innerHTML = html;
}

function renderLog(lines){ $('logStream').textContent = (lines||[]).join('\n') || 'No log lines.'; }

async function loadLogs(){
  const source = $('logSource').value || 'gateway';
  const d = await fetch(`/api/logs/live?source=${encodeURIComponent(source)}&lines=300`).then(r=>r.json());
  renderLog(d.lines || []);
}

async function toggleHeartbeat(agentId, mode){
  ensureToken();
  const d = await fetch(`/api/heartbeat/${encodeURIComponent(agentId)}/${encodeURIComponent(mode)}`, {method:'POST', headers:authHeaders()}).then(r=>r.json());
  if(d.error) return alert(d.error);
  await refresh();
}

async function runCron(id){
  ensureToken();
  const d = await fetch('/api/cron/run', {method:'POST', headers:authHeaders(), body:JSON.stringify({id})}).then(r=>r.json());
  if(d.error) return alert(d.error);
  await refresh();
}

async function createTaskForAgent(agentId){
  ensureToken();
  const title = prompt(`New task for ${agentId}:`);
  if(!title) return;
  const tab = prompt('Feature/mission tab:', 'general') || 'general';
  const d = await fetch('/api/tasks', {method:'POST', headers:authHeaders(), body:JSON.stringify({title,tab,agentId,status:'todo'})}).then(r=>r.json());
  if(d.error) return alert(d.error);
  await refresh();
}

async function sendTask(taskId){
  ensureToken();
  const d = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/dispatch`, {method:'POST', headers:authHeaders()}).then(r=>r.json());
  if(d.error) return alert(d.error);
  await refresh();
}

function showInViewer(content, label){
  $('viewer').textContent = content;
  $('editor').value = content;
  $('editingPath').textContent = label || '';
  $('viewer').style.display = 'block';
  $('editor').style.display = 'none';
}

async function openFile(encoded){
  const rel = decodeURIComponent(encoded);
  currentFilePath = rel;
  const d = await fetch(`/api/file?path=${encodeURIComponent(rel)}`).then(r=>r.json());
  showInViewer(d.error ? `Error: ${d.error}` : d.content, rel);
}

async function saveFile(){
  ensureToken();
  if(!currentFilePath) return alert('No file selected');
  const d = await fetch('/api/file/save', {method:'POST', headers:authHeaders(), body:JSON.stringify({path:currentFilePath, content:$('editor').value})}).then(r=>r.json());
  if(d.error) return alert(d.error);
  await openFile(encodeURIComponent(currentFilePath));
  await refresh();
}

function render(){
  renderTop();
  renderAgents();
  renderGenericActions();
}

async function refresh(){
  await loadAll();
  render();
  await loadLogs();
}

// interactions
$('refreshBtn').addEventListener('click', refresh);
$('loadLogsBtn').addEventListener('click', loadLogs);
$('editModeBtn').addEventListener('click', () => {
  if(!currentFilePath) return alert('Open markdown file first');
  const edit = $('editor').style.display !== 'block';
  $('editor').style.display = edit ? 'block' : 'none';
  $('viewer').style.display = edit ? 'none' : 'block';
});
$('saveEditBtn').addEventListener('click', saveFile);

$('agentCards').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button');
  if(!btn) return;
  const a = btn.dataset.agent;
  if(btn.dataset.action === 'expand') {
    const card = btn.closest('.card');
    const exp = card?.querySelector('.expand');
    if(exp) exp.classList.toggle('hidden');
    return;
  }
  if(btn.dataset.action === 'toggle' && a){
    const text = btn.textContent.toLowerCase();
    return toggleHeartbeat(a, text.includes('disable') ? 'disable' : 'enable');
  }
  if(btn.dataset.action === 'newtask' && a) return createTaskForAgent(a);
  if(btn.dataset.cron) return runCron(btn.dataset.cron);
  if(btn.classList.contains('open-file')) return openFile(btn.dataset.path);
  if(btn.classList.contains('task-send')) return sendTask(btn.dataset.task);
  if(btn.classList.contains('task-result')) {
    const t = tasks.find(x=>x.id===btn.dataset.task);
    return showInViewer(t?.result || t?.dispatchError || 'No result yet', `task:${btn.dataset.task}`);
  }
});

$('genericActions').addEventListener('click', async (ev) => {
  const id = ev.target.closest('button')?.id;
  if(!id) return;
  if(id==='ga-refresh') return refresh();
  if(id==='ga-stream') return loadLogs();
  if(id==='ga-failures') {
    const fail = tasks.filter(t=>t.dispatchState==='error');
    return showInViewer(JSON.stringify(fail, null, 2), 'dispatch-failures');
  }
  if(id==='ga-activity') return showInViewer(JSON.stringify(activity.slice(0,80), null, 2), 'activity');
  if(id==='ga-cron') {
    const c = (dashboard?.cronJobs||[])[0];
    if(!c) return alert('No cron jobs');
    return runCron(c.id);
  }
  if(id==='ga-token') return showInViewer(JSON.stringify(dashboard?.tokenUsage || {}, null, 2), 'token-usage');
});

const ws = new WebSocket(`ws://${location.host}/ws`);
ws.onmessage = async (ev) => {
  const m = JSON.parse(ev.data || '{}');
  if(m.type==='dashboard'){
    dashboard = m.data;
    renderTop();
    renderAgents();
    renderGenericActions();
  }
};

refresh();