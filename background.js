importScripts('shared.js');

const J = self.JBX;
const PENDING_TTL = 30 * 60 * 1000;
let queue = Promise.resolve();

function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function getApps() {
  const { applications } = await chrome.storage.local.get('applications');
  return Array.isArray(applications) ? applications : [];
}

async function setApps(apps) {
  await chrome.storage.local.set({ applications: apps });
}

async function updateBadge() {
  const [apps, settings] = await Promise.all([getApps(), J.getSettings()]);
  const s = J.computeStats(apps);
  const n = settings.badgeMode === 'today' ? s.today : s.total;
  const text = n > 999 ? '999+' : n > 0 ? String(n) : '';
  await chrome.action.setBadgeText({ text });
  const goalMet = settings.dailyGoal > 0 && s.today >= settings.dailyGoal;
  await chrome.action.setBadgeBackgroundColor({ color: goalMet ? '#15803d' : '#2563eb' });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  await chrome.action.setTitle({
    title: `Job Apply Assistant\nApplied: ${s.total} total · ${s.today} today · ${s.week} this week · ${s.month} this month`
  });
}

function tabKey(tabId) {
  return 'tab:' + tabId;
}

async function getTabState(tabId) {
  if (tabId == null) return {};
  const k = tabKey(tabId);
  const r = await chrome.storage.session.get(k);
  return r[k] || {};
}

async function patchTabState(tabId, patch) {
  if (tabId == null) return;
  const k = tabKey(tabId);
  const cur = await getTabState(tabId);
  const next = Object.assign({}, cur, patch);
  for (const key of Object.keys(next)) if (next[key] === null) delete next[key];
  await chrome.storage.session.set({ [k]: next });
}

function cleanJob(job) {
  const j = job || {};
  const site = j.site || 'other';
  const url = j.url || '';
  const jobId = j.jobId || J.jobIdFromUrl(site, url);
  const companySlug = j.companySlug || J.companyFromUrl(site, url);
  return {
    site,
    url,
    jobId,
    companySlug,
    weak: !!j.weak,
    title: (j.title || '').trim().slice(0, 200),
    company: (j.company || J.prettifySlug(companySlug) || '').trim().slice(0, 120)
  };
}

function mergeJob(primary, secondary) {
  const a = primary || {};
  const b = secondary || {};
  if (!b.site || (a.site && b.site !== a.site)) return a;
  if (a.jobId && b.jobId && String(a.jobId) !== String(b.jobId)) return a;
  const out = Object.assign({}, b, a);
  for (const k of ['title', 'company', 'jobId', 'companySlug', 'url', 'site']) {
    if (!a[k] && b[k]) out[k] = b[k];
  }
  if (!a.jobId && b.jobId) {
    out.url = b.url;
    out.companySlug = b.companySlug || out.companySlug;
  }
  if (a.weak && b.title && !b.weak) {
    out.title = b.title;
    out.company = b.company || out.company;
    out.weak = false;
  }
  return out;
}

async function recordApplication(rawJob, source, status) {
  return serial(async () => {
    const job = cleanJob(rawJob);
    if (!job.jobId && !job.url) return { ok: false, error: 'Could not identify this job (no URL or job ID).' };
    const apps = await getApps();
    const now = new Date().toISOString();
    const wanted = status || 'Applied';
    const existing = apps.find(a => J.isSameJob(a, job));
    if (existing) {
      if (existing.status === 'Saved' && wanted !== 'Saved') {
        const previous = Object.assign({}, existing);
        existing.status = wanted;
        existing.appliedAt = now;
        existing.source = source;
        if (!existing.title && job.title) existing.title = job.title;
        if (!existing.company && job.company) existing.company = job.company;
        await setApps(apps);
        const lastAction = { id: existing.id, previous, at: now };
        await chrome.storage.local.set({ lastAction });
        return { ok: true, added: true, app: existing, lastAction };
      }
      return { ok: true, duplicate: true, app: existing };
    }
    const app = {
      id: J.uid(),
      site: job.site,
      company: job.company,
      companySlug: job.companySlug,
      title: job.title,
      url: job.url,
      jobId: job.jobId,
      key: J.jobKey(job),
      status: wanted,
      source,
      notes: '',
      createdAt: now,
      appliedAt: now
    };
    apps.push(app);
    await setApps(apps);
    const lastAction = wanted === 'Saved' ? null : { id: app.id, previous: null, at: now };
    if (lastAction) await chrome.storage.local.set({ lastAction });
    return { ok: true, added: true, app, lastAction };
  });
}

async function undoAction(action) {
  return serial(async () => {
    if (!action || !action.id) return { ok: false, error: 'Nothing to undo.' };
    const apps = await getApps();
    const idx = apps.findIndex(a => a.id === action.id);
    if (idx === -1) return { ok: false, error: 'That entry no longer exists.' };
    if (action.previous) apps[idx] = action.previous;
    else apps.splice(idx, 1);
    await setApps(apps);
    const { lastAction } = await chrome.storage.local.get('lastAction');
    if (lastAction && lastAction.id === action.id) await chrome.storage.local.remove('lastAction');
    return { ok: true };
  });
}

async function updateApp(id, patch) {
  return serial(async () => {
    const apps = await getApps();
    const app = apps.find(a => a.id === id);
    if (!app) return { ok: false, error: 'Entry not found.' };
    const allowed = ['company', 'title', 'url', 'status', 'notes', 'appliedAt'];
    for (const k of allowed) if (k in patch) app[k] = patch[k];
    if (patch.status && patch.status !== 'Saved' && !app.appliedAt) app.appliedAt = new Date().toISOString();
    await setApps(apps);
    return { ok: true, app };
  });
}

async function deleteApp(id) {
  return serial(async () => {
    const apps = await getApps();
    const idx = apps.findIndex(a => a.id === id);
    if (idx === -1) return { ok: false, error: 'Entry not found.' };
    const [removed] = apps.splice(idx, 1);
    await setApps(apps);
    return { ok: true, removed };
  });
}

async function restoreApp(app) {
  return serial(async () => {
    if (!app || !app.id) return { ok: false };
    const apps = await getApps();
    if (!apps.some(a => a.id === app.id)) apps.push(app);
    await setApps(apps);
    return { ok: true };
  });
}

async function addManual(entry) {
  const job = cleanJob(Object.assign({ site: J.siteForUrl(entry.url || '')?.id || 'other' }, entry));
  if (!job.url && !job.jobId) job.url = 'manual:' + J.uid();
  const res = await recordApplication(job, 'manual', entry.status || 'Applied');
  if (res.ok && res.added && entry.appliedAt) await updateApp(res.app.id, { appliedAt: entry.appliedAt });
  return res;
}

async function resetAll() {
  return serial(async () => {
    await chrome.storage.local.set({ applications: [] });
    await chrome.storage.local.remove('lastAction');
    return { ok: true };
  });
}

async function getAnswers() {
  const { answers } = await chrome.storage.local.get('answers');
  return Array.isArray(answers) ? answers : [];
}

function cleanAnswer(a) {
  const type = J.QUESTION_TYPES[a.type] ? a.type : null;
  if (!type) return { error: 'Unknown question type: ' + a.type };
  const question = String(a.question || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!question) return { error: 'The question text is empty.' };
  let value = a.value;
  if (type === 'multi') {
    value = (Array.isArray(value) ? value : String(value || '').split(/\s*[,\n]\s*/)).map(v => String(v).trim()).filter(Boolean).slice(0, 50);
  } else if (type === 'yesno') {
    const v = String(Array.isArray(value) ? value[0] : value || '').trim().toLowerCase();
    value = /^(y|yes|true)/.test(v) ? 'Yes' : /^(n|no|false)/.test(v) ? 'No' : '';
  } else {
    value = String(Array.isArray(value) ? value.join(', ') : value == null ? '' : value);
    if (value.length > 5000) return { error: 'Answer is longer than 5000 characters.' };
  }
  const options = Array.isArray(a.options) ? a.options.map(o => String(o).slice(0, 200)).slice(0, 50) : [];
  return { question, type, value, options };
}

async function saveAnswer(input) {
  return serial(async () => {
    const c = cleanAnswer(input || {});
    if (c.error) return { ok: false, error: c.error };
    const answers = await getAnswers();
    const now = new Date().toISOString();
    let existing = input.id ? answers.find(a => a.id === input.id) : null;
    if (!existing) existing = answers.find(a => J.normQuestion(a.question) === J.normQuestion(c.question));
    if (existing) {
      const prevOptions = existing.options || [];
      Object.assign(existing, c, { updatedAt: now });
      if (!c.options.length) existing.options = prevOptions;
    } else {
      existing = Object.assign({ id: J.uid(), createdAt: now, updatedAt: now, uses: 0, lastUsedAt: null }, c);
      answers.push(existing);
    }
    await chrome.storage.local.set({ answers });
    return { ok: true, answer: existing };
  });
}

async function deleteAnswer(id) {
  return serial(async () => {
    const answers = await getAnswers();
    const idx = answers.findIndex(a => a.id === id);
    if (idx === -1) return { ok: false, error: 'Saved answer not found.' };
    const [removed] = answers.splice(idx, 1);
    await chrome.storage.local.set({ answers });
    return { ok: true, removed };
  });
}

async function restoreAnswer(answer) {
  return serial(async () => {
    const answers = await getAnswers();
    if (answer && answer.id && !answers.some(a => a.id === answer.id)) answers.push(answer);
    await chrome.storage.local.set({ answers });
    return { ok: true };
  });
}

async function touchAnswer(id) {
  return serial(async () => {
    const answers = await getAnswers();
    const a = answers.find(x => x.id === id);
    if (!a) return { ok: false };
    a.uses = (a.uses || 0) + 1;
    a.lastUsedAt = new Date().toISOString();
    await chrome.storage.local.set({ answers });
    return { ok: true };
  });
}

async function migrate() {
  return serial(async () => {
    const d = await chrome.storage.local.get(['schemaVersion', 'answers', 'applications', 'settings']);
    const from = d.schemaVersion || 1;
    const patch = { settings: Object.assign({}, J.DEFAULT_SETTINGS, d.settings || {}) };
    if (!Array.isArray(d.applications)) patch.applications = [];
    if (!Array.isArray(d.answers)) patch.answers = [];
    if (from < J.SCHEMA_VERSION) patch.schemaVersion = J.SCHEMA_VERSION;
    await chrome.storage.local.set(patch);
    return { from, to: J.SCHEMA_VERSION };
  });
}

const AI_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const AI_MODELS = ['deepseek-chat', 'deepseek-reasoner'];

const AI_SYSTEM = [
  'You fill in job application screening questions on behalf of a candidate.',
  'Answer truthfully using ONLY the candidate profile and the candidate\'s saved answers provided. Never invent employers, degrees, certifications, clearances, licenses or years of experience.',
  'Answer formats by question type:',
  '- "yesno": exactly "Yes" or "No".',
  '- "select": exactly one string copied verbatim from "options".',
  '- "multi": an array of strings copied verbatim from "options".',
  '- "text": a concise, professional first-person answer in plain text (no markdown). Stay within "maxLength" characters when given, otherwise under 500 characters.',
  'For years-of-experience questions, compute from the work history dates and skills; when options are ranges, pick the range containing the number.',
  'If the profile and saved answers do not contain enough information to answer honestly (for example work authorization, sponsorship, clearance, relocation or availability that is not stated), return null for that answer. Do not guess.',
  'Give each answer a confidence between 0 and 1.',
  'Respond with JSON only, in this shape: {"answers":[{"id":"<question id>","answer":<string|array|null>,"confidence":<number>}]}'
].join('\n');

const AI_AUTO = [
  'AUTO MODE: the candidate clicked "Auto apply" and wants every question answered without stopping.',
  'Answer every question you reasonably can from the profile, even with low confidence:',
  '- Questions about the candidate\'s ties to this company (worked here before, currently work here, family or friends here, referred by an employee): answer "No" unless the profile or saved answers show otherwise.',
  '- "Are you over 18" / legal age: "Yes" when the candidate has a work history or degree.',
  '- Location, country, state, city: use the candidate\'s location.',
  '- "How did you hear about us": pick the job board or "Online job board" style option that fits the site; otherwise the closest option.',
  '- Experience, skills, tools and willingness questions: answer from the work history and skills.',
  '- Short text questions: write a brief honest answer based on the profile.',
  'Still return null for work authorization, visa sponsorship, citizenship, security clearance and licenses when the profile and saved answers do not state them. Return null when no reasonable answer exists; the question will be skipped.'
].join('\n');

function profileForAi(p) {
  const profile = p || {};
  const work = (profile.work || []).slice(0, 8).map(w => ({
    title: w.title, company: w.company, location: w.location, start: w.startDate, end: w.endDate,
    description: String(w.description || '').slice(0, 600)
  }));
  const education = (profile.education || []).slice(0, 4).map(e => ({ school: e.school, degree: e.degree, field: e.discipline, end: e.endDate }));
  return {
    location: profile.location || [profile.city, profile.state, profile.country].filter(Boolean).join(', '),
    currentTitle: profile.currentTitle || (work[0] && work[0].title) || '',
    currentCompany: profile.currentCompany || (work[0] && work[0].company) || '',
    yearsExperience: profile.yearsExperience,
    summary: String(profile.summary || '').slice(0, 1200),
    skills: (Array.isArray(profile.skills) ? profile.skills : String(profile.skills || '').split(/\s*,\s*/)).slice(0, 80),
    work,
    education,
    links: { linkedin: profile.linkedin || '', github: profile.github || '', portfolio: profile.portfolio || '' }
  };
}

function parseAiJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(raw);
  } catch (e) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('AI response was not valid JSON.');
  }
}

async function callDeepSeek(messages, opts) {
  const { aiKey } = await chrome.storage.local.get('aiKey');
  const settings = await J.getSettings();
  if (!aiKey) return { ok: false, error: 'Add your DeepSeek API key in Settings → AI assistant.' };
  const model = AI_MODELS.includes(settings.aiModel) ? settings.aiModel : 'deepseek-chat';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 60000);
  let res;
  try {
    res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + aiKey },
      body: JSON.stringify(Object.assign({ model, messages, temperature: 0.2, max_tokens: 2500 }, model === 'deepseek-chat' ? { response_format: { type: 'json_object' } } : {})),
      signal: ctrl.signal
    });
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.name === 'AbortError' ? 'DeepSeek took too long to respond. Try again.' : 'Could not reach DeepSeek: ' + e.message };
  }
  clearTimeout(timer);
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()).error || {}).message || ''; } catch (e) {}
    const known = {
      400: 'DeepSeek rejected the request (400).',
      401: 'DeepSeek rejected the API key (401). Check the key in Settings.',
      402: 'Your DeepSeek account has insufficient balance (402).',
      422: 'DeepSeek could not process the request (422).',
      429: 'DeepSeek rate limit reached (429). Wait a moment and try again.',
      500: 'DeepSeek server error (500). Try again later.',
      503: 'DeepSeek is overloaded (503). Try again later.'
    };
    return { ok: false, status: res.status, error: (known[res.status] || `DeepSeek error ${res.status}.`) + (detail ? ' ' + detail : '') };
  }
  let data;
  try { data = await res.json(); } catch (e) { return { ok: false, error: 'DeepSeek returned an unreadable response.' }; }
  const content = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
  if (!content) return { ok: false, error: 'DeepSeek returned an empty answer.' };
  return { ok: true, content, usage: data.usage || null, model };
}

async function aiAnswer(questions, job, auto) {
  const settings = await J.getSettings();
  if (!settings.aiEnabled) return { ok: false, error: 'The AI assistant is turned off. Enable it in Settings → AI assistant.' };
  const list = (questions || []).filter(q => q && q.id && q.label && !J.aiSkipReason(q.label)).slice(0, 40).map(q => ({
    id: String(q.id),
    question: String(q.label).slice(0, 600),
    type: ['yesno', 'select', 'multi', 'text'].includes(q.type) ? q.type : 'text',
    options: Array.isArray(q.options) ? q.options.map(o => String(o).slice(0, 200)).slice(0, 80) : [],
    maxLength: q.maxLength || null,
    required: !!q.required
  }));
  if (!list.length) return { ok: true, answers: [] };
  const { profile, answers } = await chrome.storage.local.get(['profile', 'answers']);
  const saved = (Array.isArray(answers) ? answers : []).filter(a => !J.isEmptyAnswer(a.value)).slice(0, 40).map(a => ({ question: a.question, answer: a.value }));
  const payload = {
    job: { title: (job && job.title) || '', company: (job && job.company) || '' },
    candidate: profileForAi(profile),
    savedAnswers: saved,
    questions: list
  };
  const res = await callDeepSeek([{ role: 'system', content: auto ? AI_SYSTEM + '\n' + AI_AUTO : AI_SYSTEM }, { role: 'user', content: JSON.stringify(payload) }]);
  if (!res.ok) return res;
  let parsed;
  try { parsed = parseAiJson(res.content); } catch (e) { return { ok: false, error: e.message }; }
  const out = Array.isArray(parsed.answers) ? parsed.answers : [];
  const ids = new Set(list.map(q => q.id));
  return {
    ok: true,
    model: res.model,
    usage: res.usage,
    answers: out.filter(a => a && ids.has(String(a.id))).map(a => ({
      id: String(a.id),
      answer: a.answer === undefined ? null : a.answer,
      confidence: typeof a.confidence === 'number' ? Math.max(0, Math.min(1, a.confidence)) : 0.5
    }))
  };
}

async function aiTest() {
  const settings = await J.getSettings();
  const res = await callDeepSeek([
    { role: 'system', content: 'Reply with JSON only.' },
    { role: 'user', content: 'Return {"ok": true}' }
  ], { timeout: 30000 });
  if (!res.ok) return res;
  return { ok: true, model: res.model, enabled: !!settings.aiEnabled };
}

async function findExisting(rawJob) {
  const job = cleanJob(rawJob);
  const apps = await getApps();
  return apps.find(a => J.isSameJob(a, job)) || null;
}

async function handle(msg, sender) {
  const tabId = sender.tab ? sender.tab.id : msg.tabId;
  switch (msg.type) {
    case 'jobContext': {
      if (!msg.job || !msg.job.title) return { ok: true };
      const incoming = cleanJob(msg.job);
      const st = await getTabState(tabId);
      const prev = st.job;
      if (prev && prev.site === incoming.site && prev.jobId && (!incoming.jobId || (incoming.weak && prev.jobId === incoming.jobId))) {
        await patchTabState(tabId, { job: mergeJob(prev, incoming), jobAt: Date.now() });
        return { ok: true };
      }
      await patchTabState(tabId, { job: incoming, jobAt: Date.now() });
      return { ok: true };
    }
    case 'getTabState': {
      const st = await getTabState(tabId);
      const pending = st.pending && Date.now() - st.pending.at < PENDING_TTL ? st.pending : null;
      return { ok: true, job: st.job || null, pending };
    }
    case 'submitAttempt': {
      const settings = await J.getSettings();
      const st = await getTabState(tabId);
      const job = mergeJob(cleanJob(msg.job), st.job);
      if (settings.countMode === 'click') {
        const res = await recordApplication(job, 'submit-click');
        await patchTabState(tabId, { pending: null });
        return Object.assign({ mode: 'click' }, res);
      }
      await patchTabState(tabId, { pending: { job, at: Date.now() } });
      return { ok: true, mode: 'confirm', pending: true };
    }
    case 'confirmationDetected': {
      const st = await getTabState(tabId);
      const pending = st.pending && Date.now() - st.pending.at < PENDING_TTL ? st.pending : null;
      if (!pending && !msg.strong) {
        const job = mergeJob(cleanJob(msg.job), st.job);
        const existing = await findExisting(job);
        return { ok: true, suggest: !existing, existing, job };
      }
      const job = pending ? mergeJob(pending.job, mergeJob(cleanJob(msg.job), st.job)) : mergeJob(cleanJob(msg.job), st.job);
      if (!job.jobId && !pending && !job.title) return { ok: true, suggest: true, job };
      const res = await recordApplication(job, 'confirmation');
      await patchTabState(tabId, { pending: null });
      return res;
    }
    case 'clearPending':
      await patchTabState(tabId, { pending: null });
      return { ok: true };
    case 'markApplied': {
      const st = await getTabState(tabId);
      const job = mergeJob(cleanJob(msg.job), st.job);
      const res = await recordApplication(job, 'manual');
      await patchTabState(tabId, { pending: null });
      return res;
    }
    case 'saveJob': {
      const st = await getTabState(tabId);
      return recordApplication(mergeJob(cleanJob(msg.job), st.job), 'manual', 'Saved');
    }
    case 'lookupJob': {
      const st = await getTabState(tabId);
      const job = mergeJob(cleanJob(msg.job), st.job);
      return { ok: true, job, existing: await findExisting(job) };
    }
    case 'undo':
      return undoAction(msg.action);
    case 'undoLast': {
      const { lastAction } = await chrome.storage.local.get('lastAction');
      return undoAction(lastAction);
    }
    case 'updateApp':
      return updateApp(msg.id, msg.patch || {});
    case 'deleteApp':
      return deleteApp(msg.id);
    case 'restoreApp':
      return restoreApp(msg.app);
    case 'addManual':
      return addManual(msg.entry || {});
    case 'resetAll':
      return resetAll();
    case 'getStats': {
      const [apps, settings] = await Promise.all([getApps(), J.getSettings()]);
      const { lastAction } = await chrome.storage.local.get('lastAction');
      const last = lastAction ? apps.find(a => a.id === lastAction.id) || null : null;
      return { ok: true, stats: J.computeStats(apps), settings, lastAction: last ? lastAction : null, last };
    }
    case 'saveAnswer':
      return saveAnswer(msg.answer || {});
    case 'deleteAnswer':
      return deleteAnswer(msg.id);
    case 'restoreAnswer':
      return restoreAnswer(msg.answer);
    case 'touchAnswer':
      return touchAnswer(msg.id);
    case 'aiAnswer':
      return aiAnswer(msg.questions, msg.job, !!msg.auto);
    case 'aiTest':
      return aiTest();
    case 'openPage':
      await chrome.tabs.create({ url: chrome.runtime.getURL(msg.page) });
      return { ok: true };
    default:
      return { ok: false, error: 'Unknown message: ' + msg.type };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type || msg.target === 'content') return false;
  handle(msg, sender).then(sendResponse, err => sendResponse({ ok: false, error: String(err && err.message || err) }));
  return true;
});

chrome.runtime.onInstalled.addListener(async details => {
  await migrate();
  const { profile } = await chrome.storage.local.get('profile');
  await updateBadge();
  if (details.reason === 'install' && !profile) chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(async () => {
  await migrate();
  await updateBadge();
});
chrome.tabs.onActivated.addListener(() => { updateBadge(); });
chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove(tabKey(tabId)); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.applications || changes.settings)) updateBadge();
});
