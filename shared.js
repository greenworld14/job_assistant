(function (root) {
  if (root.JBX) return;

  const SITES = [
    { id: 'greenhouse', name: 'Greenhouse', host: /(^|\.)greenhouse\.io$/i },
    { id: 'lever', name: 'Lever', host: /(^|\.)lever\.co$/i },
    { id: 'ashby', name: 'Ashby', host: /(^|\.)ashbyhq\.com$/i },
    { id: 'workday', name: 'Workday', host: /(^|\.)(myworkdayjobs|myworkdaysite)\.com$/i },
    { id: 'linkedin', name: 'LinkedIn', host: /(^|\.)linkedin\.com$/i },
    { id: 'indeed', name: 'Indeed', host: /(^|\.)indeed\.com$/i },
    { id: 'dice', name: 'Dice', host: /(^|\.)dice\.com$/i },
    { id: 'ziprecruiter', name: 'ZipRecruiter', host: /(^|\.)ziprecruiter\.(com|co\.uk|ca)$/i }
  ];

  const STATUSES = ['Applied', 'Saved', 'Interview', 'Rejected', 'Offer'];

  const DEFAULT_SETTINGS = {
    dailyGoal: 10,
    countMode: 'confirm',
    badgeMode: 'total',
    showFloatingButton: true,
    overwriteExisting: false,
    highlightFields: true,
    autoFillSavedAnswers: true,
    reviewBeforeSubmit: true,
    blockUnansweredRequired: true,
    matchThreshold: 0.8,
    aiEnabled: false,
    aiAutoAnswer: true,
    aiModel: 'deepseek-chat'
  };

  const AI_SKIP_INTENTS = ['salary', 'gender', 'race', 'hispanic', 'veteran', 'disability', 'pronouns'];
  const AI_SKIP_RE = /certify|attest|acknowledg|consent|\bi agree\b|agree to|privacy|terms (and|&) conditions|signature|sign here|okay to (send|text|contact|call)|text messages|\bsms\b|marketing|newsletter|subscribe|criminal|convict|felony/;

  function aiSkipReason(question) {
    const n = normQuestion(question);
    const intent = questionIntent(question);
    if (AI_SKIP_INTENTS.includes(intent)) return intent === 'salary' ? 'Salary is personal — AI won\'t guess it.' : 'Voluntary disclosure — AI never answers these.';
    if (AI_SKIP_RE.test(n)) return 'Consent/personal preference — answer it yourself.';
    return '';
  }

  const SCHEMA_VERSION = 2;

  const QUESTION_TYPES = {
    yesno: 'Yes / No',
    select: 'Single choice',
    multi: 'Multiple choice',
    text: 'Free text'
  };

  const INTENTS = [
    ['workAuth', /authori[sz]ed? to work.*without (visa )?sponsor|without (the need for |requiring )?(visa )?sponsorship/],
    ['sponsorship', /sponsor|\bvisa\b|h-?1-?b/],
    ['citizenship', /citizen/],
    ['workAuth', /authori[sz]ed? to work|legally (authori[sz]ed|eligible|able|permitted|entitled)|eligible to work|right to work|work authori[sz]ation|work permit/],
    ['clearance', /security clearance|\bclearance\b/],
    ['relocation', /relocat/],
    ['onsite', /on-?site|in[- ]office|in person|hybrid|commut/],
    ['travel', /willing to travel|travel requirement|travel up to/],
    ['salary', /salary|compensation|pay expectation|desired pay|expected (pay|salary|compensation|ctc)|\bctc\b|hourly rate|rate expectation/],
    ['startDate', /start date|when can you start|available to start|earliest (start|available)|availability to start/],
    ['notice', /notice period/],
    ['age18', /18 years|over (the age of )?18|at least 18|legal age/],
    ['prevEmployee', /(previously|ever) (worked|been employed)|former employee|worked (for|at) .* before/],
    ['source', /how did you (hear|find|learn|come across)|where did you (hear|find)/],
    ['referred', /referred|referral|refer you/],
    ['backgroundCheck', /background check/],
    ['drugTest', /drug (test|screen)/],
    ['driverLicense', /driver'?s? licen[cs]e/],
    ['nonCompete', /non-?compete|restrictive covenant/],
    ['pronouns', /pronoun/],
    ['gender', /gender|\bsex\b/],
    ['hispanic', /hispanic|latin[oax]/],
    ['race', /\brace\b|ethnic/],
    ['veteran', /veteran|military/],
    ['disability', /disabilit/]
  ];

  const COUNTRIES = [
    ['us', /\b(u\.?s\.?a?|united states|america)\b/],
    ['canada', /\bcanad/],
    ['uk', /\b(u\.?k\.?|united kingdom|britain|england)\b/],
    ['eu', /\b(e\.?u\.?|european union|eea)\b/],
    ['india', /\bindia\b/],
    ['australia', /\baustralia/],
    ['germany', /\bgerman/],
    ['mexico', /\bmexic/]
  ];

  const STOP_WORDS = new Set('a an the you your yours are is am do does did will would have has had be been being to of in on for with at by this that these those we our us as or and any if please what which who whom how can could should may might currently current there their it its from into about me my i select one all apply following'.split(' '));

  function normQuestion(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\*/g, ' ')
      .replace(/\(required\)|required/g, ' ')
      .replace(/[^a-z0-9$+ ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stem(w) {
    if (w.length > 5) return w.replace(/(ations?|ings?|ies|ied|ed|es|s)$/, '');
    if (w.length > 3) return w.replace(/s$/, '');
    return w;
  }

  function questionTokens(s) {
    return [...new Set(normQuestion(s).split(' ').filter(w => w && !STOP_WORDS.has(w)).map(stem))];
  }

  function questionIntent(s) {
    const t = normQuestion(s);
    for (const [name, re] of INTENTS) if (re.test(t)) return name;
    return '';
  }

  function countriesIn(s) {
    const t = ' ' + String(s || '').toLowerCase() + ' ';
    return COUNTRIES.filter(([, re]) => re.test(t)).map(([c]) => c);
  }

  function numbersIn(s) {
    return (normQuestion(s).match(/\d+/g) || []).sort().join(',');
  }

  function questionSimilarity(a, b) {
    const na = normQuestion(a);
    const nb = normQuestion(b);
    if (!na || !nb) return 0;
    const ca = countriesIn(a);
    const cb = countriesIn(b);
    if (ca.length && cb.length && !ca.some(c => cb.includes(c))) return 0;
    const numA = numbersIn(a);
    const numB = numbersIn(b);
    if (numA && numB && numA !== numB) return 0;
    if (na === nb) return 1;
    const ia = questionIntent(a);
    const ib = questionIntent(b);
    if (ia && ib && ia !== ib) return 0;
    const ta = questionTokens(a);
    const tb = questionTokens(b);
    if (!ta.length || !tb.length) return 0;
    const setB = new Set(tb);
    const common = ta.filter(t => setB.has(t)).length;
    const dice = (2 * common) / (ta.length + tb.length);
    if (ia && ia === ib) return Math.max(0.9, dice);
    return dice;
  }

  function bestAnswerMatch(question, answers, threshold) {
    let best = null;
    let bestScore = 0;
    for (const a of answers || []) {
      if (!a || !a.question || isEmptyAnswer(a.value)) continue;
      const s = questionSimilarity(question, a.question);
      if (s > bestScore) { best = a; bestScore = s; }
    }
    const min = threshold == null ? DEFAULT_SETTINGS.matchThreshold : threshold;
    return best && bestScore >= min ? { answer: best, score: bestScore } : (best ? { answer: null, near: best, score: bestScore } : null);
  }

  function isEmptyAnswer(v) {
    if (Array.isArray(v)) return v.length === 0;
    return v == null || String(v).trim() === '';
  }

  function answerToText(a) {
    if (!a) return '';
    if (Array.isArray(a.value)) return a.value.join(', ');
    return String(a.value == null ? '' : a.value);
  }

  const KEEP_PARAMS = ['jk', 'vjk', 'currentjobid', 'gh_jid', 'token', 'for', 'jid', 'lk'];
  const STRIP_TAIL = /\/(apply|application|applymanually|autofillwithresume|useMyLastApplication|confirmation|thanks|thank-you|thankyou|submitted|success)$/i;
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  function siteForHost(host) {
    return SITES.find(s => s.host.test(host || '')) || null;
  }

  function siteForUrl(href) {
    try {
      const u = new URL(href);
      if (!/^https?:$/.test(u.protocol)) return null;
      return siteForHost(u.hostname);
    } catch (e) {
      return null;
    }
  }

  function siteName(id) {
    const s = SITES.find(x => x.id === id);
    return s ? s.name : (id || 'Other');
  }

  function jobIdFromUrl(siteId, href) {
    let u;
    try { u = new URL(href); } catch (e) { return ''; }
    const p = u.pathname;
    const q = u.searchParams;
    let m;
    switch (siteId) {
      case 'greenhouse':
        m = p.match(/\/jobs\/(\d+)/);
        return m ? m[1] : (q.get('gh_jid') || q.get('token') || '');
      case 'lever':
      case 'ashby':
        m = p.match(UUID);
        return m ? m[0].toLowerCase() : '';
      case 'workday':
        m = p.match(/\/(?:job|details)\/(?:[^/]+\/)?[^/]*_([A-Za-z0-9-]+)(?=\/|$)/);
        return m ? m[1] : '';
      case 'linkedin':
        m = p.match(/\/jobs\/view\/(?:[^/]*-)?(\d{5,})/);
        return m ? m[1] : (q.get('currentJobId') || '');
      case 'indeed':
        return q.get('jk') || q.get('vjk') || '';
      case 'dice':
        m = p.match(UUID);
        if (m) return m[0].toLowerCase();
        m = p.match(/\/jobs\/detail\/[^/]+\/[^/]+\/([^/?#]+)/i) || p.match(/\/job-detail\/([^/?#]+)/i);
        return m ? m[1] : '';
      case 'ziprecruiter':
        if (q.get('jid')) return q.get('jid');
        if (q.get('lk')) return q.get('lk');
        m = p.match(/\/(?:k|ek|km)\/l\/([A-Za-z0-9_-]+)/) || p.match(/\/jobs\/[^/]*?-([0-9a-f]{8,})(?:\/|$)/i) || p.match(/\/job\/[^/]+\/([A-Za-z0-9_-]{6,})/);
        return m ? m[1] : '';
      default:
        return '';
    }
  }

  function companyFromUrl(siteId, href) {
    let u;
    try { u = new URL(href); } catch (e) { return ''; }
    const seg = u.pathname.split('/').filter(Boolean);
    switch (siteId) {
      case 'greenhouse':
        if (u.searchParams.get('for')) return u.searchParams.get('for');
        return seg[0] && !/^(embed|v1)$/i.test(seg[0]) ? seg[0] : '';
      case 'lever':
      case 'ashby':
        return seg[0] ? decodeURIComponent(seg[0]) : '';
      case 'workday':
        return u.hostname.split('.')[0] || '';
      case 'ziprecruiter':
        return seg[0] === 'c' && seg[1] ? decodeURIComponent(seg[1]) : '';
      default:
        return '';
    }
  }

  function prettifySlug(slug) {
    if (!slug) return '';
    return String(slug)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function normalizeUrl(href) {
    let u;
    try { u = new URL(href); } catch (e) { return String(href || '').trim().toLowerCase(); }
    const kept = [];
    u.searchParams.forEach((v, k) => {
      if (KEEP_PARAMS.includes(k.toLowerCase())) kept.push([k.toLowerCase(), v]);
    });
    kept.sort((a, b) => a[0].localeCompare(b[0]));
    let path = u.pathname.replace(/\/+$/, '');
    let prev;
    do {
      prev = path;
      path = path.replace(STRIP_TAIL, '').replace(/\/+$/, '');
    } while (path !== prev);
    const qs = kept.map(([k, v]) => k + '=' + v).join('&');
    return (u.hostname.toLowerCase().replace(/^www\./, '') + path + (qs ? '?' + qs : '')).toLowerCase();
  }

  function normCompany(name) {
    return String(name || '').toLowerCase().replace(/\b(inc|llc|ltd|corp|corporation|co|gmbh|plc|limited|company)\b\.?/g, '').replace(/[^a-z0-9]/g, '');
  }

  function companiesCompatible(a, b) {
    if (a.companySlug && b.companySlug) return a.companySlug.toLowerCase() === b.companySlug.toLowerCase();
    const x = normCompany(a.company);
    const y = normCompany(b.company);
    if (!x || !y) return true;
    return x === y || x.includes(y) || y.includes(x);
  }

  function isSameJob(a, b) {
    if (!a || !b) return false;
    if ((a.site || '') !== (b.site || '')) return false;
    if (a.jobId && b.jobId) {
      return String(a.jobId).toLowerCase() === String(b.jobId).toLowerCase() && companiesCompatible(a, b);
    }
    if (a.url && b.url && normalizeUrl(a.url) === normalizeUrl(b.url)) return companiesCompatible(a, b);
    return false;
  }

  function jobKey(job) {
    const id = job.jobId ? 'id:' + String(job.jobId).toLowerCase() : 'url:' + normalizeUrl(job.url || '');
    return (job.site || 'other') + '|' + id + '|' + (job.companySlug ? job.companySlug.toLowerCase() : normCompany(job.company));
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function startOfWeek(d) {
    const x = startOfDay(d);
    const day = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - day);
    return x;
  }

  function startOfMonth(d) {
    const x = startOfDay(d);
    x.setDate(1);
    return x;
  }

  function isApplied(app) {
    return app && app.status !== 'Saved';
  }

  function computeStats(apps, now) {
    const ref = now ? new Date(now) : new Date();
    const d = startOfDay(ref).getTime();
    const w = startOfWeek(ref).getTime();
    const m = startOfMonth(ref).getTime();
    const s = { total: 0, today: 0, week: 0, month: 0, saved: 0 };
    for (const a of apps || []) {
      if (!isApplied(a)) { s.saved++; continue; }
      const t = new Date(a.appliedAt || a.createdAt).getTime();
      s.total++;
      if (t >= d) s.today++;
      if (t >= w) s.week++;
      if (t >= m) s.month++;
    }
    return s;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function localDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function localTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(apps) {
    const head = ['Date', 'Time', 'Company', 'Job Title', 'Status', 'Site', 'URL', 'Job ID', 'Source', 'Notes'];
    const rows = (apps || []).map(a => [
      localDate(a.appliedAt || a.createdAt),
      localTime(a.appliedAt || a.createdAt),
      a.company, a.title, a.status, siteName(a.site), a.url, a.jobId, a.source, a.notes
    ]);
    return '﻿' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  }

  async function getSettings() {
    const { settings } = await chrome.storage.local.get('settings');
    return Object.assign({}, DEFAULT_SETTINGS, settings || {});
  }

  function send(msg) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(msg, res => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(res || { ok: false, error: 'No response' });
        });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  root.JBX = {
    SITES, STATUSES, DEFAULT_SETTINGS, SCHEMA_VERSION, QUESTION_TYPES,
    aiSkipReason, normQuestion, questionTokens, questionIntent, questionSimilarity, bestAnswerMatch, isEmptyAnswer, answerToText,
    siteForHost, siteForUrl, siteName, jobIdFromUrl, companyFromUrl, prettifySlug,
    normalizeUrl, normCompany, isSameJob, jobKey, isApplied, computeStats,
    startOfDay, startOfWeek, startOfMonth, uid, localDate, localTime, toCsv,
    getSettings, send, escapeHtml
  };
})(typeof self !== 'undefined' ? self : globalThis);
