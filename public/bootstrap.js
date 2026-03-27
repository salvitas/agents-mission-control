const $ = (id) => document.getElementById(id);
const fmt = (ts) => ts ? new Date(ts).toLocaleString() : 'n/a';
const badge = (txt, cls='') => `<span class="pill ${cls}">${txt}</span>`;
const card = (title, meta, actions='') => `<div class="card"><h3>${title}</h3><div class="meta">${meta}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;

let jobs = [];
let selectedJobId = localStorage.getItem('bootstrapJobId') || '';
let selectedLogs = [];
let selectedArtifacts = [];

async function api(path, opts={}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return res.json();
}

function selectJob(id) {
  selectedJobId = id;
  localStorage.setItem('bootstrapJobId', id);
}

async function loadJobs() {
  const d = await api('/api/bootstrap/jobs');
  jobs = d.jobs || [];
  if (!selectedJobId && jobs[0]) selectJob(jobs[0].id);
  if (selectedJobId && !jobs.some((j) => j.id === selectedJobId) && jobs[0]) selectJob(jobs[0].id);
}

function currentJob() { return jobs.find((j) => j.id === selectedJobId) || null; }

async function loadJobDetail() {
  if (!selectedJobId) return;
  const d = await api(`/api/bootstrap/jobs/${encodeURIComponent(selectedJobId)}`);
  if (d.job) {
    selectedLogs = d.logs || [];
    selectedArtifacts = d.artifacts || [];
  }
}

function renderSummary() {
  const job = currentJob();
  if (!job) {
    $('bootstrapSummary').innerHTML = 'No job selected.';
    $('bootstrapLogs').textContent = 'Logs will appear here.';
    return;
  }
  $('bootstrapSummary').innerHTML = [
    `<div><strong>${job.agentName}</strong> · ${job.id}</div>`,
    `<div>State: ${badge(job.state)}</div>`,
    `<div>Region: ${job.region} · Type: ${job.instanceType}</div>`,
    `<div>Created: ${fmt(job.createdAt)} · Updated: ${fmt(job.updatedAt)}</div>`,
    job.repoUrl ? `<div>Repo: ${job.repoUrl}</div>` : '',
    job.sshKeyName ? `<div>SSH key: ${job.sshKeyName}</div>` : '',
    job.notes ? `<div>Notes: ${job.notes}</div>` : '',
  ].filter(Boolean).join('<br/>');
  $('bootstrapLogs').textContent = selectedLogs.join('\n') || 'No logs yet.';
}

function renderJobs() {
  $('bootstrapJobs').innerHTML = jobs.map((job) => card(
    `${job.agentName} · ${job.state}`,
    `Region: ${job.region}<br/>Type: ${job.instanceType}<br/>Created: ${fmt(job.createdAt)}`,
    `<button data-id="${job.id}" class="select-job">Open</button><button data-id="${job.id}" class="refresh-job">Poll</button>`
  )).join('') || '<div class="meta">No bootstrap jobs yet.</div>';
}

function renderArtifacts() {
  $('bootstrapArtifacts').innerHTML = selectedArtifacts.map((a) => card(
    a.name,
    `${a.kind || 'artifact'}<br/>${a.path || ''}<br/>${a.summary || ''}`,
    a.url ? `<a class="ghost-link" href="${a.url}" target="_blank" rel="noreferrer">Open</a>` : ''
  )).join('') || '<div class="meta">No artifacts for selected job.</div>';
}

async function refreshAll() {
  await loadJobs();
  await loadJobDetail();
  renderJobs();
  renderSummary();
  renderArtifacts();
}

$('bootstrapForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = new FormData(ev.currentTarget);
  const payload = Object.fromEntries(form.entries());
  const d = await api('/api/bootstrap/jobs', { method: 'POST', body: JSON.stringify(payload) });
  if (d.error) return alert(d.error);
  selectJob(d.job.id);
  await refreshAll();
});

$('bootstrapJobs').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  selectJob(btn.dataset.id);
  await refreshAll();
});

$('refreshBootstrapBtn').addEventListener('click', refreshAll);
$('refreshLogsBtn').addEventListener('click', async () => { await loadJobDetail(); renderSummary(); renderArtifacts(); });
$('copyJobBtn').addEventListener('click', async () => {
  const job = currentJob();
  if (!job) return;
  await navigator.clipboard.writeText(job.id);
  alert('Job id copied');
});

refreshAll();
const refreshTimer = setInterval(refreshAll, 5000);
if (typeof refreshTimer.unref === 'function') refreshTimer.unref();
