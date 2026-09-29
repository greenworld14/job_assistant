const J = self.JBX;
const $ = id => document.getElementById(id);

const ctx = { tab: null, site: null, canRun: false, injected: false, job: null, existing: null, hasProfile: false };

function sendToTab(msg, frameId) {
  return new Promise(resolve => {
    const done = res => {
      if (chrome.runtime.lastError) resolve({ ok: false, noReceiver: true, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, noReceiver: true });
    };
    const payload = Object.assign({ target: 'content' }, msg);
    try {
      if (frameId != null) chrome.tabs.sendMessage(ctx.tab.id, payload, { frameId }, done);
      else chrome.tabs.sendMessage(ctx.tab.id, payload, done);
    } catch (e) {
      resolve({ ok: false, noReceiver: true, error: e.message });
    }
  });
}

async function inject(allFrames) {
  try {
    await chrome.scripting.executeScript({ target: { tabId: ctx.tab.id, allFrames }, files: ['shared.js', 'questions.js', 'content.js'] });
    ctx.injected = true;
    return true;
  } catch (e) {
    showMsg('Could not access this page: ' + e.message, 'bad');
    return false;
  }
}

async function ensureContent() {
  const ping = await sendToTab({ type: 'ping' }, 0);
  if (ping && ping.ok) return true;
  return inject(!!ctx.site);
}

function showMsg(html, kind) {
  const el = $('pageMsg');
  el.className = 'notice ' + (kind || 'info');
  el.innerHTML = html;
  el.classList.remove('hidden');
}

function hideMsg() {
  $('pageMsg').classList.add('hidden');
}

async function refreshStats() {
  const res = await J.send({ type: 'getStats' });
  if (!res.ok) return;
  const s = res.stats;
  $('sTotal').textContent = s.total;
  $('sToday').textContent = s.today;
  $('sWeek').textContent = s.week;
  $('sMonth').textContent = s.month;
  const goal = Number(res.settings.dailyGoal) || 0;
  $('goalBox').classList.toggle('hidden', goal <= 0);
  if (goal > 0) {
    const pct = Math.min(100, Math.round((s.today / goal) * 100));
    $('goalText').textContent = `${s.today} / ${goal}${s.today >= goal ? ' 🎉' : ''}`;
    $('goalBar').querySelector('span').style.width = pct + '%';
    $('goalBar').classList.toggle('done', s.today >= goal);
  }
  const last = res.last;
  $('lastBox').classList.toggle('hidden', !last);
  if (last) {
    $('lastText').textContent = `Last: ${[last.title, last.company].filter(Boolean).join(' @ ') || last.url} · ${J.localTime(last.appliedAt)}`;
    $('lastText').title = $('lastText').textContent;
  }
}

function renderJob() {
  const job = ctx.job;
  const has = job && (job.title || job.company);
  $('jobInfo').classList.toggle('hidden', !has);
  if (has) {
    $('jobTitle').textContent = job.title || 'Untitled role';
    $('jobCompany').textContent = job.company || '';
  }
  const ex = ctx.existing;
  const chip = $('appliedChip');
  chip.classList.toggle('hidden', !ex);
  if (ex) {
    chip.textContent = ex.status === 'Saved' ? 'Saved' : `${ex.status} · ${J.localDate(ex.appliedAt)}`;
    chip.className = 'chip on';
  }
  $('markBtn').textContent = ex && ex.status !== 'Saved' ? 'Applied ✓' : 'Mark as applied';
  $('markBtn').disabled = !ctx.canRun || !!(ex && ex.status !== 'Saved');
  $('saveBtn').disabled = !ctx.canRun || !!ex;
}

async function loadJob() {
  let job = null;
  const r = await sendToTab({ type: 'getJob' }, 0);
  if (r && r.ok && r.job) job = r.job;
  if (!job) job = { site: ctx.site ? ctx.site.id : 'other', url: ctx.tab.url, title: ctx.tab.title || '' };
  const look = await J.send({ type: 'lookupJob', job, tabId: ctx.tab.id });
  ctx.job = look.ok ? look.job : job;
  ctx.existing = look.ok ? look.existing : null;
  renderJob();
}

function renderFillResult(r) {
  const box = $('result');
  box.classList.remove('hidden');
  if (!r || !r.ok) {
    let msg = (r && r.message) || 'Could not fill this page.';
    if (r && r.noReceiver) msg = 'The page did not respond. Reload the tab and try again.';
    box.innerHTML = `<div class="notice bad">${J.escapeHtml(msg)}</div>`;
    if (r && r.error === 'noProfile') {
      box.innerHTML += '<div style="margin-top:8px"><button class="btn sm" id="goProfile">Set up profile</button></div>';
      $('goProfile').onclick = () => chrome.runtime.openOptionsPage();
    }
    return;
  }
  const open = r.review.filter(x => !x.soft);
  box.innerHTML = `<div class="sum"><span class="f">✓ ${r.filled} filled</span><span class="w">⚠ ${open.length} need review</span>${r.kept ? `<span class="muted">${r.kept} kept</span>` : ''}</div><ul></ul>`;
  const ul = box.querySelector('ul');
  for (const item of r.review) {
    const li = document.createElement('li');
    li.innerHTML = `<div>${J.escapeHtml(item.label)}</div><div class="r">${J.escapeHtml(item.reason)}${item.required ? ' · <span class="req">required</span>' : ''}</div>`;
    ul.appendChild(li);
  }
  if (!r.review.length) ul.remove();
  if (!r.filled && !r.review.length) box.innerHTML = '<div class="notice warn">No matching fields were found in this form. If the form is on another step, open it and try again.</div>';
}

async function doFill(generic) {
  $('fillBtn').disabled = true;
  $('fillBtn').textContent = 'Filling…';
  if (generic) {
    const ok = await inject(false);
    if (!ok) { $('fillBtn').disabled = false; $('fillBtn').textContent = '⚡ Fill application'; return; }
  } else if (!(await ensureContent())) {
    $('fillBtn').disabled = false;
    $('fillBtn').textContent = '⚡ Fill application';
    return;
  }
  const r = await sendToTab({ type: 'fill' });
  renderFillResult(r);
  $('fillBtn').disabled = false;
  $('fillBtn').textContent = '⚡ Fill application';
}

async function doMark() {
  $('markBtn').disabled = true;
  let res = null;
  if (ctx.site || ctx.injected) {
    res = await sendToTab({ type: 'markApplied' }, 0);
    if (res && res.noReceiver) res = null;
  }
  if (!res) res = await J.send({ type: 'markApplied', job: ctx.job, tabId: ctx.tab.id });
  if (!res.ok) showMsg(J.escapeHtml(res.error || 'Could not log this job.'), 'bad');
  else if (res.duplicate) showMsg('Already counted — not added again.', 'warn');
  else showMsg('Counted as applied. Use Undo below if that was a mistake.', 'good');
  await loadJob();
  await refreshStats();
}

async function doSave() {
  const res = await J.send({ type: 'saveJob', job: ctx.job, tabId: ctx.tab.id });
  if (!res.ok) showMsg(J.escapeHtml(res.error || 'Could not save.'), 'bad');
  else if (res.duplicate) showMsg('Already in your tracker.', 'warn');
  else showMsg('Saved to tracker (not counted as applied).', 'good');
  await loadJob();
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  ctx.tab = tab;
  const { profile } = await chrome.storage.local.get('profile');
  ctx.hasProfile = !!profile;
  await refreshStats();

  const url = tab && tab.url ? tab.url : '';
  const isWeb = /^https?:/i.test(url);
  const isStore = /chrome\.google\.com\/webstore|chromewebstore\.google\.com/i.test(url);
  ctx.site = isWeb ? J.siteForUrl(url) : null;
  ctx.canRun = isWeb && !isStore;

  const chip = $('siteChip');
  if (!ctx.canRun) {
    chip.textContent = 'Not available here';
    showMsg("Autofill can't run on this page (browser pages, the Chrome Web Store, new tabs and local files are off-limits). Open a job application in a normal tab.", 'warn');
    renderJob();
    return;
  }
  if (ctx.site) {
    chip.textContent = ctx.site.name + ' · supported';
    chip.className = 'chip on';
    $('fillBtn').disabled = false;
  } else {
    chip.textContent = new URL(url).hostname.replace(/^www\./, '') + ' · not supported';
    showMsg('This site isn\'t in the supported list (LinkedIn, Indeed, Dice, ZipRecruiter, Greenhouse, Lever, Workday, Ashby). You can still try a generic fill — review results carefully — or log the job manually.', 'warn');
    $('genericBtn').classList.remove('hidden');
  }
  if (!ctx.hasProfile) {
    showMsg('No profile yet. <a href="#" id="setupLink">Upload your resume</a> to enable autofill. You can still track applications.', 'warn');
    $('setupLink').onclick = e => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
    $('fillBtn').disabled = true;
    $('genericBtn').disabled = true;
  }
  await loadJob();
}

$('fillBtn').addEventListener('click', () => doFill(false));
$('genericBtn').addEventListener('click', () => { hideMsg(); doFill(true); });
$('markBtn').addEventListener('click', doMark);
$('saveBtn').addEventListener('click', doSave);
$('undoBtn').addEventListener('click', async () => {
  const r = await J.send({ type: 'undoLast' });
  showMsg(r.ok ? 'Last count undone.' : J.escapeHtml(r.error || 'Nothing to undo.'), r.ok ? 'good' : 'warn');
  await refreshStats();
  if (ctx.canRun) await loadJob();
});
$('openTracker').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('tracker.html') }));
$('openProfile').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('openOptions').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('options.html#settings') }));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.applications || changes.settings)) refreshStats();
});

init();
