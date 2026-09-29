const J = self.JBX;
const $ = id => document.getElementById(id);

const state = { apps: [], settings: J.DEFAULT_SETTINGS, sort: { key: 'appliedAt', dir: -1 }, snackTimer: null };

function snack(text, actionLabel, action) {
  document.querySelectorAll('.snackbar').forEach(n => n.remove());
  clearTimeout(state.snackTimer);
  const el = document.createElement('div');
  el.className = 'snackbar';
  const span = document.createElement('span');
  span.textContent = text;
  el.appendChild(span);
  if (actionLabel) {
    const b = document.createElement('button');
    b.textContent = actionLabel;
    b.onclick = async () => { el.remove(); await action(); };
    el.appendChild(b);
  }
  document.body.appendChild(el);
  state.snackTimer = setTimeout(() => el.remove(), 8000);
}

async function load() {
  const { applications, settings } = await chrome.storage.local.get(['applications', 'settings']);
  state.apps = Array.isArray(applications) ? applications : [];
  state.settings = Object.assign({}, J.DEFAULT_SETTINGS, settings || {});
  renderStats();
  renderSiteFilter();
  render();
}

function renderStats() {
  const s = J.computeStats(state.apps);
  $('sTotal').textContent = s.total;
  $('sToday').textContent = s.today;
  $('sWeek').textContent = s.week;
  $('sMonth').textContent = s.month;
  $('sSaved').textContent = s.saved;
  const goal = Number(state.settings.dailyGoal) || 0;
  if (document.activeElement !== $('goalInput')) $('goalInput').value = goal;
  const pct = goal > 0 ? Math.min(100, Math.round((s.today / goal) * 100)) : 0;
  $('goalBar').querySelector('span').style.width = pct + '%';
  $('goalBar').classList.toggle('done', goal > 0 && s.today >= goal);
  $('goalText').textContent = goal > 0 ? `${s.today} / ${goal} today${s.today >= goal ? ' 🎉' : ''}` : 'Off';
}

function renderSiteFilter() {
  const sel = $('fSite');
  const cur = sel.value;
  const sites = [...new Set(state.apps.map(a => a.site || 'other'))].sort();
  sel.innerHTML = '<option value="">All sites</option>' + sites.map(s => `<option value="${J.escapeHtml(s)}">${J.escapeHtml(J.siteName(s))}</option>`).join('');
  sel.value = sites.includes(cur) ? cur : '';
}

function dateOf(a) {
  return a.appliedAt || a.createdAt;
}

function filtered() {
  const q = $('q').value.trim().toLowerCase();
  const st = $('fStatus').value;
  const site = $('fSite').value;
  const from = $('fFrom').value ? new Date($('fFrom').value + 'T00:00:00').getTime() : -Infinity;
  const to = $('fTo').value ? new Date($('fTo').value + 'T23:59:59.999').getTime() : Infinity;
  const { key, dir } = state.sort;
  return state.apps
    .filter(a => {
      const t = new Date(dateOf(a)).getTime();
      if (t < from || t > to) return false;
      if (st && a.status !== st) return false;
      if (site && (a.site || 'other') !== site) return false;
      if (q && ![a.company, a.title, a.url, a.notes].join(' ').toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      const x = key === 'appliedAt' ? new Date(dateOf(a)).getTime() : String(a[key] || '').toLowerCase();
      const y = key === 'appliedAt' ? new Date(dateOf(b)).getTime() : String(b[key] || '').toLowerCase();
      return x < y ? -dir : x > y ? dir : 0;
    });
}

function statusOptions(selected) {
  return J.STATUSES.map(s => `<option value="${s}"${s === selected ? ' selected' : ''}>${s}</option>`).join('');
}

function toLocalInput(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return J.localDate(iso) + 'T' + J.localTime(iso);
}

function render() {
  const list = filtered();
  const tbody = $('rows');
  tbody.innerHTML = '';
  for (const a of list) {
    const tr = document.createElement('tr');
    tr.dataset.id = a.id;
    const safeUrl = /^https?:\/\//i.test(a.url || '') ? a.url : '';
    tr.innerHTML = `
      <td class="when"><input type="datetime-local" data-f="appliedAt" value="${toLocalInput(dateOf(a))}"></td>
      <td><input data-f="company" value="${J.escapeHtml(a.company)}" placeholder="Company"></td>
      <td><input data-f="title" value="${J.escapeHtml(a.title)}" placeholder="Job title"></td>
      <td>${J.escapeHtml(J.siteName(a.site))}</td>
      <td><select data-f="status" class="st-${J.escapeHtml(a.status)}">${statusOptions(a.status)}</select></td>
      <td><input data-f="notes" value="${J.escapeHtml(a.notes || '')}" placeholder="Add note"></td>
      <td class="acts">${safeUrl ? `<a class="btn sm ghost" href="${J.escapeHtml(safeUrl)}" target="_blank" rel="noopener" title="${J.escapeHtml(safeUrl)}">Open ↗</a>` : ''}<button class="btn sm ghost danger del" title="Delete entry">Delete</button></td>`;
    tbody.appendChild(tr);
  }
  const total = state.apps.length;
  $('countLabel').textContent = list.length === total ? `${total} entr${total === 1 ? 'y' : 'ies'}` : `${list.length} of ${total} entries`;
  const empty = $('empty');
  empty.classList.toggle('hidden', list.length > 0);
  empty.textContent = total ? 'No entries match these filters.' : 'No applications logged yet. Submit an application on a supported site, or use "Mark as applied" / "+ Add manually".';
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.textContent = th.textContent.replace(/ [▾▴]$/, '') + (th.dataset.sort === state.sort.key ? (state.sort.dir < 0 ? ' ▾' : ' ▴') : '');
  });
}

async function update(id, patch) {
  const res = await J.send({ type: 'updateApp', id, patch });
  if (!res.ok) snack(res.error || 'Update failed');
}

$('rows').addEventListener('change', e => {
  const el = e.target;
  const tr = el.closest('tr');
  if (!tr || !el.dataset.f) return;
  let v = el.value;
  if (el.dataset.f === 'appliedAt') {
    const d = new Date(v);
    if (isNaN(d)) return;
    v = d.toISOString();
  }
  if (el.dataset.f === 'status') el.className = 'st-' + v;
  update(tr.dataset.id, { [el.dataset.f]: v });
});

$('rows').addEventListener('click', async e => {
  const btn = e.target.closest('.del');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const res = await J.send({ type: 'deleteApp', id });
  if (!res.ok) { snack(res.error || 'Delete failed'); return; }
  const removed = res.removed;
  snack(`Deleted ${[removed.title, removed.company].filter(Boolean).join(' @ ') || 'entry'}.`, 'Undo', async () => {
    await J.send({ type: 'restoreApp', app: removed });
    snack('Entry restored.');
  });
});

document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
  const key = th.dataset.sort;
  state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : (key === 'appliedAt' ? -1 : 1) };
  render();
}));

['q', 'fStatus', 'fFrom', 'fTo', 'fSite'].forEach(id => $(id).addEventListener('input', () => { markQuick(null); render(); }));

function markQuick(range) {
  document.querySelectorAll('[data-range]').forEach(b => b.classList.toggle('on', b.dataset.range === range));
}

document.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => {
  const now = new Date();
  const r = b.dataset.range;
  const start = r === 'today' ? J.startOfDay(now) : r === 'week' ? J.startOfWeek(now) : r === 'month' ? J.startOfMonth(now) : null;
  $('fFrom').value = start ? J.localDate(start.toISOString()) : '';
  $('fTo').value = '';
  markQuick(r);
  render();
}));

$('clearFilters').addEventListener('click', () => {
  ['q', 'fFrom', 'fTo'].forEach(id => { $(id).value = ''; });
  $('fStatus').value = '';
  $('fSite').value = '';
  markQuick(null);
  render();
});

$('exportCsv').addEventListener('click', () => {
  const list = filtered();
  if (!list.length) { snack('Nothing to export.'); return; }
  const blob = new Blob([J.toCsv(list)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `job-applications-${J.localDate(new Date().toISOString())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  snack(`Exported ${list.length} entr${list.length === 1 ? 'y' : 'ies'}.`);
});

$('resetBtn').addEventListener('click', async () => {
  const n = J.computeStats(state.apps).total;
  if (!state.apps.length) { snack('Nothing to reset.'); return; }
  if (!confirm(`Reset the counter?\n\nThis permanently deletes all ${state.apps.length} tracker entries (${n} applied). Export a CSV first if you want a copy.\n\nThis cannot be undone.`)) return;
  const typed = prompt('Type RESET to confirm.');
  if ((typed || '').trim().toUpperCase() !== 'RESET') { snack('Reset cancelled.'); return; }
  await J.send({ type: 'resetAll' });
  snack('Counter reset. All entries deleted.');
});

$('undoLast').addEventListener('click', async () => {
  const res = await J.send({ type: 'undoLast' });
  snack(res.ok ? 'Last count undone.' : (res.error || 'Nothing to undo.'));
});

$('goalInput').addEventListener('change', async () => {
  const s = await J.getSettings();
  s.dailyGoal = Math.max(0, Math.min(200, parseInt($('goalInput').value, 10) || 0));
  await chrome.storage.local.set({ settings: s });
});

$('toggleAdd').addEventListener('click', () => {
  const f = $('addForm');
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) {
    f.elements.date.value = J.localDate(new Date().toISOString());
    f.elements.company.focus();
  }
});

$('addForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const date = f.elements.date.value;
  const now = new Date();
  const when = date ? new Date(`${date}T${J.localTime(now.toISOString())}:00`) : now;
  const res = await J.send({
    type: 'addManual',
    entry: {
      company: f.elements.company.value.trim(),
      title: f.elements.title.value.trim(),
      url: f.elements.url.value.trim(),
      status: f.elements.status.value,
      appliedAt: when.toISOString()
    }
  });
  if (!res.ok) { snack(res.error || 'Could not add.'); return; }
  if (res.duplicate) { snack('That job is already in your tracker.'); return; }
  f.reset();
  f.classList.add('hidden');
  snack('Entry added.');
});

$('fStatus').innerHTML += J.STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');
$('addForm').elements.status.innerHTML = statusOptions('Applied');

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.applications || changes.settings) {
    const active = document.activeElement;
    const editing = active && active.closest && active.closest('#rows') && active.matches('input');
    if (editing && changes.applications && !changes.settings) {
      state.apps = changes.applications.newValue || [];
      renderStats();
      return;
    }
    load();
  }
});

load();
