const J = self.JBX;
const $ = id => document.getElementById(id);
const form = $('profileForm');
const MAX_FILE = 5 * 1024 * 1024;
const PROFILE_FIELDS = ['firstName', 'lastName', 'fullName', 'email', 'phone', 'location', 'address', 'city', 'state', 'zip', 'country', 'yearsExperience', 'linkedin', 'github', 'portfolio', 'currentTitle', 'currentCompany', 'summary', 'skills'];

let dirty = false;
let lastText = '';

function setDirty(v) {
  dirty = v;
  $('saveState').textContent = v ? 'Unsaved changes' : 'All changes saved';
  $('saveState').style.color = v ? 'var(--warn)' : '';
}

function status(html, kind) {
  $('parseStatus').innerHTML = html ? `<div class="notice ${kind || 'info'}">${html}</div>` : '';
}

function fmtSize(n) {
  return n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function base64ToBlob(rf) {
  const bin = atob(rf.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: rf.type || 'application/octet-stream' });
}

function entryNode(tplId, data, list, label) {
  const node = $(tplId).content.firstElementChild.cloneNode(true);
  for (const input of node.querySelectorAll('[data-k]')) input.value = (data && data[input.dataset.k]) || '';
  node.querySelector('.rm').addEventListener('click', () => { node.remove(); renumber(list, label); setDirty(true); });
  node.addEventListener('input', () => setDirty(true));
  list.appendChild(node);
  renumber(list, label);
}

function renumber(list, label) {
  [...list.children].forEach((n, i) => { n.querySelector('.idx').textContent = `${label} ${i + 1}`; });
  if (!list.children.length) list.innerHTML = '';
}

function readEntries(list) {
  return [...list.querySelectorAll('.entry')].map(n => {
    const o = {};
    for (const input of n.querySelectorAll('[data-k]')) o[input.dataset.k] = input.value.trim();
    return o;
  }).filter(o => Object.values(o).some(Boolean));
}

function fillForm(p) {
  const profile = p || {};
  for (const k of PROFILE_FIELDS) {
    const el = form.elements[k];
    if (!el) continue;
    const v = profile[k];
    el.value = Array.isArray(v) ? v.join(', ') : (v == null ? '' : v);
  }
  $('workList').innerHTML = '';
  (profile.work || []).forEach(w => entryNode('workTpl', w, $('workList'), 'Position'));
  $('eduList').innerHTML = '';
  (profile.education || []).forEach(e => entryNode('eduTpl', e, $('eduList'), 'School'));
}

function readForm() {
  const p = {};
  for (const k of PROFILE_FIELDS) p[k] = (form.elements[k].value || '').trim();
  p.skills = p.skills.split(/\s*[,;\n]\s*/).map(s => s.trim()).filter(Boolean);
  p.yearsExperience = p.yearsExperience === '' ? '' : Number(p.yearsExperience);
  if (!p.fullName) p.fullName = [p.firstName, p.lastName].filter(Boolean).join(' ');
  if (!p.firstName && p.fullName) p.firstName = p.fullName.split(' ')[0];
  if (!p.lastName && p.fullName.includes(' ')) p.lastName = p.fullName.split(' ').slice(-1)[0];
  p.work = readEntries($('workList'));
  p.education = readEntries($('eduList'));
  p.updatedAt = new Date().toISOString();
  return p;
}

function validate(p) {
  const problems = [];
  if (!p.firstName && !p.fullName) problems.push('name');
  if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) problems.push('a valid email');
  if (!p.email) problems.push('email');
  return problems;
}

async function save() {
  const p = readForm();
  const problems = validate(p);
  if (problems.length && !confirm(`Your profile is missing ${problems.join(', ')}. Save anyway?`)) return;
  await chrome.storage.local.set({ profile: p });
  setDirty(false);
  status('Profile saved. Open a job application and click <b>Fill application</b>.', 'good');
}

function showFile(rf) {
  $('fileBox').classList.toggle('hidden', !rf);
  if (!rf) return;
  $('fileName').textContent = rf.name;
  $('fileMeta').textContent = `${fmtSize(rf.size)} · saved ${new Date(rf.savedAt).toLocaleString()} · attached automatically to resume-upload fields`;
}

async function handleFile(file) {
  if (!file) return;
  if (!/\.(pdf|docx)$/i.test(file.name)) {
    status(/\.doc$/i.test(file.name) ? 'Old .doc files are not supported. Save it as DOCX or PDF and try again.' : 'Please choose a PDF or DOCX file.', 'bad');
    return;
  }
  if (file.size > MAX_FILE) {
    status(`That file is ${fmtSize(file.size)}. Please use a resume under 5 MB.`, 'bad');
    return;
  }
  status('Reading your resume…');
  const buf = await file.arrayBuffer();
  const rf = { name: file.name, type: file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), size: file.size, data: bufToBase64(buf), savedAt: Date.now() };
  try {
    await chrome.storage.local.set({ resumeFile: rf });
  } catch (e) {
    status('Could not store the file: ' + J.escapeHtml(e.message), 'bad');
    return;
  }
  showFile(rf);
  await parseAndFill(new File([buf], file.name, { type: rf.type }));
}

async function parseAndFill(file) {
  try {
    const { text, profile } = await ResumeParser.parseFile(file);
    lastText = text;
    $('rawText').textContent = text;
    $('rawBox').classList.remove('hidden');
    const { profile: existing } = await chrome.storage.local.get('profile');
    let merged = profile;
    if (existing && (existing.email || existing.fullName)) {
      const replace = confirm('Replace your saved profile with the details from this resume?\n\nOK = replace with extracted values\nCancel = only fill empty fields');
      merged = replace ? Object.assign({}, existing, stripEmpty(profile)) : Object.assign({}, profile, stripEmpty(existing));
    }
    fillForm(merged);
    setDirty(true);
    const found = ['fullName', 'email', 'phone', 'location', 'linkedin'].filter(k => profile[k]).length;
    status(`Extracted ${found}/5 contact fields, ${profile.work.length} position(s), ${profile.education.length} school(s) and ${profile.skills.length} skill(s). <b>Review below, then click Save profile.</b>`, 'good');
  } catch (e) {
    status(J.escapeHtml(e.message || String(e)) + ' The file was still saved for upload fields — you can fill the profile in manually.', 'warn');
  }
}

function stripEmpty(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    if (v === '' || v == null || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

async function loadSettings() {
  const s = await J.getSettings();
  $('setGoal').value = s.dailyGoal;
  $('setCountMode').value = s.countMode;
  $('setBadge').value = s.badgeMode;
  $('setFloat').checked = !!s.showFloatingButton;
  $('setHighlight').checked = !!s.highlightFields;
  $('setOverwrite').checked = !!s.overwriteExisting;
  $('setAutoAnswers').checked = !!s.autoFillSavedAnswers;
  $('setReview').checked = !!s.reviewBeforeSubmit;
  $('setBlock').checked = !!s.blockUnansweredRequired;
  $('setThreshold').value = String(s.matchThreshold);
  $('setAi').checked = !!s.aiEnabled;
  $('setAiAuto').checked = !!s.aiAutoAnswer;
  $('setAiModel').value = s.aiModel || 'deepseek-chat';
  const { aiKey } = await chrome.storage.local.get('aiKey');
  $('aiKey').value = '';
  $('aiKey').placeholder = aiKey ? `Saved (…${aiKey.slice(-4)}) — paste a new key to replace it` : 'sk-…';
  aiStatus(aiKey ? '' : 'No API key saved yet.', aiKey ? '' : 'warn');
}

function aiStatus(text, kind) {
  const el = $('aiStatus');
  el.textContent = text;
  el.style.color = kind === 'bad' ? 'var(--bad)' : kind === 'good' ? 'var(--good)' : kind === 'warn' ? 'var(--warn)' : 'var(--muted)';
}

async function saveAiKey() {
  const key = $('aiKey').value.trim();
  if (!key) { aiStatus('Paste your DeepSeek API key first.', 'warn'); return false; }
  if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) { aiStatus('That doesn\'t look like a DeepSeek key (it should start with "sk-").', 'bad'); return false; }
  await chrome.storage.local.set({ aiKey: key });
  await loadSettings();
  aiStatus('Key saved in this browser.', 'good');
  return true;
}

async function saveSettings() {
  const s = await J.getSettings();
  s.dailyGoal = Math.max(0, Math.min(200, parseInt($('setGoal').value, 10) || 0));
  s.countMode = $('setCountMode').value;
  s.badgeMode = $('setBadge').value;
  s.showFloatingButton = $('setFloat').checked;
  s.highlightFields = $('setHighlight').checked;
  s.overwriteExisting = $('setOverwrite').checked;
  s.autoFillSavedAnswers = $('setAutoAnswers').checked;
  s.reviewBeforeSubmit = $('setReview').checked;
  s.blockUnansweredRequired = $('setBlock').checked;
  s.matchThreshold = Number($('setThreshold').value) || J.DEFAULT_SETTINGS.matchThreshold;
  s.aiEnabled = $('setAi').checked;
  s.aiAutoAnswer = $('setAiAuto').checked;
  s.aiModel = $('setAiModel').value;
  await chrome.storage.local.set({ settings: s });
}

$('aiKeyShow').addEventListener('click', () => {
  const show = $('aiKey').type === 'password';
  $('aiKey').type = show ? 'text' : 'password';
  $('aiKeyShow').textContent = show ? 'Hide' : 'Show';
});

$('aiSaveKey').addEventListener('click', saveAiKey);

$('aiRemoveKey').addEventListener('click', async () => {
  if (!confirm('Remove the saved DeepSeek API key from this browser?')) return;
  await chrome.storage.local.remove('aiKey');
  await loadSettings();
  aiStatus('Key removed.', '');
});

$('aiTest').addEventListener('click', async () => {
  if ($('aiKey').value.trim() && !(await saveAiKey())) return;
  aiStatus('Testing…', '');
  $('aiTest').disabled = true;
  const r = await J.send({ type: 'aiTest' });
  $('aiTest').disabled = false;
  if (r.ok) aiStatus(`Connected to DeepSeek (${r.model}).${r.enabled ? '' : ' Turn on the AI assistant above to use it.'}`, 'good');
  else aiStatus(r.error || 'Connection failed.', 'bad');
});

const COMMON_QUESTIONS = [
  ['Are you legally authorized to work in the United States?', 'yesno'],
  ['Will you now or in the future require visa sponsorship?', 'yesno'],
  ['Are you at least 18 years of age?', 'yesno'],
  ['Are you willing to relocate?', 'yesno'],
  ['Are you able to work on-site or hybrid?', 'yesno'],
  ['Have you previously worked for this company?', 'yesno'],
  ['What are your salary expectations?', 'text'],
  ['When can you start?', 'text'],
  ['What is your notice period?', 'text'],
  ['How did you hear about this position?', 'select'],
  ['Why do you want to work here?', 'text']
];

function snack(text, actionLabel, action) {
  document.querySelectorAll('.snackbar').forEach(n => n.remove());
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
  setTimeout(() => el.remove(), 8000);
}

function answerValueEditor(card, type, value) {
  const box = card.querySelector('.value-box');
  box.innerHTML = '';
  const label = document.createElement('span');
  label.textContent = 'Answer';
  box.appendChild(label);
  if (type === 'yesno') {
    const v = String(Array.isArray(value) ? value[0] || '' : value || '');
    const wrap = document.createElement('div');
    wrap.className = 'yn';
    wrap.innerHTML = `<button type="button" class="y" aria-pressed="${v === 'Yes'}">Yes</button><button type="button" class="n" aria-pressed="${v === 'No'}">No</button>`;
    wrap.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      card.dataset.value = b.textContent;
      markDirty(card);
    }));
    card.dataset.value = v;
    box.appendChild(wrap);
    return;
  }
  const input = document.createElement(type === 'select' ? 'input' : 'textarea');
  input.dataset.a = 'value';
  if (type === 'select') {
    input.placeholder = 'The option to pick, e.g. "LinkedIn"';
    input.value = Array.isArray(value) ? value[0] || '' : value || '';
  } else if (type === 'multi') {
    input.placeholder = 'One choice per line (or comma-separated)';
    input.rows = 3;
    input.value = Array.isArray(value) ? value.join('\n') : String(value || '').split(/\s*,\s*/).filter(Boolean).join('\n');
  } else {
    input.placeholder = 'Your answer. {company} and {title} are replaced automatically.';
    input.rows = 4;
    input.value = Array.isArray(value) ? value.join(', ') : value || '';
  }
  input.addEventListener('input', () => { markDirty(card); if (counter) counter.textContent = `${input.value.length} characters`; });
  box.appendChild(input);
  let counter = null;
  if (type === 'text') {
    counter = document.createElement('div');
    counter.className = 'count';
    counter.textContent = `${input.value.length} characters`;
    box.appendChild(counter);
  }
}

function readAnswerCard(card) {
  const type = card.querySelector('[data-a="type"]').value;
  const question = card.querySelector('[data-a="question"]').value.trim();
  let value;
  if (type === 'yesno') value = card.dataset.value || '';
  else {
    const raw = card.querySelector('[data-a="value"]').value;
    value = type === 'multi' ? raw.split(/\s*[\n,]\s*/).map(s => s.trim()).filter(Boolean) : raw.trim();
  }
  return { id: card.dataset.id || undefined, question, type, value };
}

function markDirty(card) {
  card.classList.add('dirty');
  card.querySelector('.err-msg').textContent = '';
}

function answerCard(a) {
  const card = $('answerTpl').content.firstElementChild.cloneNode(true);
  if (a.id) card.dataset.id = a.id;
  card.querySelector('[data-a="question"]').value = a.question || '';
  const typeSel = card.querySelector('[data-a="type"]');
  typeSel.value = a.type || 'yesno';
  answerValueEditor(card, typeSel.value, a.value);
  card.classList.toggle('incomplete', J.isEmptyAnswer(a.value));
  const meta = card.querySelector('.meta');
  meta.textContent = a.id ? `Used ${a.uses || 0} time${a.uses === 1 ? '' : 's'}${a.lastUsedAt ? ' · last ' + new Date(a.lastUsedAt).toLocaleDateString() : ''}${J.isEmptyAnswer(a.value) ? ' · no answer yet — it won\'t be used' : ''}` : 'New — not saved yet';
  card.querySelector('[data-a="question"]').addEventListener('input', () => markDirty(card));
  typeSel.addEventListener('change', () => {
    const cur = readAnswerCard(card);
    answerValueEditor(card, typeSel.value, cur.value);
    markDirty(card);
  });
  card.querySelector('.save').addEventListener('click', async () => {
    const data = readAnswerCard(card);
    if (!data.question) { card.querySelector('.err-msg').textContent = 'Enter the question text.'; return; }
    const res = await J.send({ type: 'saveAnswer', answer: data });
    if (!res.ok) { card.querySelector('.err-msg').textContent = res.error || 'Could not save.'; return; }
    card.dataset.id = res.answer.id;
    card.classList.remove('dirty');
    renderAnswers(true);
  });
  card.querySelector('.del').addEventListener('click', async () => {
    if (!card.dataset.id) { card.remove(); return; }
    const res = await J.send({ type: 'deleteAnswer', id: card.dataset.id });
    if (!res.ok) { card.querySelector('.err-msg').textContent = res.error || 'Could not delete.'; return; }
    snack('Saved answer deleted.', 'Undo', async () => { await J.send({ type: 'restoreAnswer', answer: res.removed }); renderAnswers(true); });
    renderAnswers(true);
  });
  return card;
}

async function renderAnswers(force) {
  const list = $('answerList');
  if (!force && list.querySelector('.answer.dirty')) return;
  const { answers } = await chrome.storage.local.get('answers');
  const all = Array.isArray(answers) ? answers : [];
  const q = $('answerSearch').value.trim().toLowerCase();
  const pending = [...list.querySelectorAll('.answer.dirty')].filter(c => !c.dataset.id);
  list.innerHTML = '';
  pending.forEach(c => list.appendChild(c));
  const shown = all
    .filter(a => !q || [a.question, J.answerToText(a)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  shown.forEach(a => list.appendChild(answerCard(a)));
  if (!all.length && !pending.length) list.innerHTML = '<div class="notice info">No saved answers yet. Add your usual answers (work authorization, sponsorship, salary…) or tick "Save as default answer" in the review screen while applying.</div>';
  else if (!shown.length && !pending.length) list.innerHTML = '<div class="muted small">No saved answers match your search.</div>';
}

$('addAnswer').addEventListener('click', () => {
  const card = answerCard({ question: '', type: 'yesno', value: '' });
  card.classList.add('dirty');
  const list = $('answerList');
  if (list.querySelector('.notice')) list.innerHTML = '';
  list.prepend(card);
  card.querySelector('[data-a="question"]').focus();
});

$('addCommon').addEventListener('click', async () => {
  const { answers } = await chrome.storage.local.get('answers');
  const have = new Set((answers || []).map(a => J.normQuestion(a.question)));
  let added = 0;
  for (const [question, type] of COMMON_QUESTIONS) {
    if (have.has(J.normQuestion(question))) continue;
    const res = await J.send({ type: 'saveAnswer', answer: { question, type, value: type === 'multi' ? [] : '' } });
    if (res.ok) added++;
  }
  await renderAnswers(true);
  snack(added ? `Added ${added} common question${added === 1 ? '' : 's'} — fill in your answers and click Save.` : 'All common questions are already in your list.');
});

$('answerSearch').addEventListener('input', () => renderAnswers(true));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.answers) renderAnswers(false);
});

async function init() {
  const { profile, resumeFile } = await chrome.storage.local.get(['profile', 'resumeFile']);
  fillForm(profile);
  showFile(resumeFile);
  setDirty(false);
  if (!profile) {
    $('saveState').textContent = 'No profile saved yet';
    status('Start by uploading your resume. You can also type your details in manually.', 'info');
  }
  await loadSettings();
  await renderAnswers(true);
}

const drop = $('drop');
$('fileInput').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));

form.addEventListener('input', () => setDirty(true));
form.addEventListener('submit', e => { e.preventDefault(); save(); });
$('saveBtn').addEventListener('click', save);
$('addWork').addEventListener('click', () => { entryNode('workTpl', {}, $('workList'), 'Position'); setDirty(true); });
$('addEdu').addEventListener('click', () => { entryNode('eduTpl', {}, $('eduList'), 'School'); setDirty(true); });

$('reparseBtn').addEventListener('click', async () => {
  const { resumeFile } = await chrome.storage.local.get('resumeFile');
  if (!resumeFile) return;
  status('Reading your resume…');
  await parseAndFill(new File([base64ToBlob(resumeFile)], resumeFile.name, { type: resumeFile.type }));
});

$('downloadBtn').addEventListener('click', async () => {
  const { resumeFile } = await chrome.storage.local.get('resumeFile');
  if (!resumeFile) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(base64ToBlob(resumeFile));
  a.download = resumeFile.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

$('removeFileBtn').addEventListener('click', async () => {
  if (!confirm('Remove the stored resume file? Resume-upload fields will no longer be filled.')) return;
  await chrome.storage.local.remove('resumeFile');
  showFile(null);
  $('rawBox').classList.add('hidden');
});

$('clearProfile').addEventListener('click', async () => {
  if (!confirm('Delete your profile and stored resume from this browser? Your application tracker is kept.')) return;
  await chrome.storage.local.remove(['profile', 'resumeFile']);
  fillForm(null);
  showFile(null);
  setDirty(false);
  status('Profile and resume deleted.', 'info');
});

['setGoal', 'setCountMode', 'setBadge', 'setFloat', 'setHighlight', 'setOverwrite', 'setAutoAnswers', 'setReview', 'setBlock', 'setThreshold', 'setAi', 'setAiAuto', 'setAiModel'].forEach(id => $(id).addEventListener('change', saveSettings));

window.addEventListener('beforeunload', e => {
  if (dirty || document.querySelector('.answer.dirty')) { e.preventDefault(); e.returnValue = ''; }
});

init();
