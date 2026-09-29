(() => {
  if (window.__jbxContentLoaded) return;
  window.__jbxContentLoaded = true;

  const J = self.JBX;
  const KNOWN = J.siteForHost(location.hostname);
  const SITE = KNOWN || { id: 'other', name: location.hostname.replace(/^www\./, '') };
  const IS_TOP = window.top === window;

  const SITE_SELECTORS = {
    greenhouse: {
      title: ['.app-title', '.job__title h1', '.job-title', 'h1.section-header', '#header h1', 'h1'],
      company: ['.company-name', '.job__company', 'meta[property="og:site_name"]'],
      form: ['#application_form', '#application-form', 'form#application', 'form[action*="application"]', '.application--form', 'form']
    },
    lever: {
      title: ['.posting-headline h2', '.posting-header h2', '.section.page-centered h2', 'h2'],
      company: ['.main-header-logo img[alt]', 'meta[property="og:site_name"]'],
      form: ['#application-form', 'form[action*="apply"]', '.application-form', 'form']
    },
    ashby: {
      title: ['h1[class*="title"]', '[class*="job-posting"] h1', 'h1', 'h2'],
      company: ['meta[property="og:site_name"]', 'img[class*="logo"][alt]'],
      form: ['[class*="application-form"]', 'form', '[class*="ApplicationForm"]']
    },
    workday: {
      title: ['[data-automation-id="jobPostingHeader"]', '[data-automation-id="jobTitle"]', 'h2[data-automation-id*="title" i]', 'h1', 'h2'],
      company: ['[data-automation-id="headerCompanyName"]', 'meta[property="og:site_name"]'],
      form: ['[data-automation-id="applyFlowPage"]', '[data-automation-id="applyFlowContent"]', 'form', 'main', '[role="main"]']
    },
    linkedin: {
      title: ['.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title', '.top-card-layout__title', '.jobs-easy-apply-modal h2', 'h1'],
      company: ['.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name', '.topcard__org-name-link', '.job-details-jobs-unified-top-card__primary-description a'],
      form: ['.jobs-easy-apply-modal', '[data-test-modal-id="easy-apply-modal"]', '.jobs-easy-apply-content', '[role="dialog"]'],
      strictForm: true
    },
    indeed: {
      title: ['[data-testid="jobsearch-JobInfoHeader-title"]', '.jobsearch-JobInfoHeader-title', '[data-testid="job-title"]', '.ia-JobHeader-title', 'h1'],
      company: ['[data-testid="inlineHeader-companyName"]', '[data-company-name]', '.jobsearch-CompanyInfoContainer a', '.ia-JobHeader-information span', '[data-testid="company-name"]'],
      form: ['form', 'main', '[role="main"]']
    },
    dice: {
      title: ['h1[data-cy="jobTitle"]', '[data-testid="jobTitle"]', '[data-testid="job-detail-header-card"] h1', '.job-title', 'h1'],
      company: ['[data-cy="companyNameLink"]', 'a[data-cy="companyNameLink"]', '[data-testid="companyNameLink"]', '[data-cy="companyName"]', '.employer-name', 'meta[property="og:site_name"]'],
      form: ['[data-testid="application-wizard"]', '[class*="wizard" i]', '[role="dialog"]', 'form', 'main'],
      shadow: true
    },
    ziprecruiter: {
      title: ['h1.job_title', '[class*="job_title"]', '[data-testid="job-title"]', '.job_header h1', 'h1'],
      company: ['.hiring_company_text a', 'a.hiring_company', '[data-testid="job-card-company"]', '[class*="hiring_company"]', '[data-testid="company-name"]'],
      form: ['[role="dialog"] form', '[role="dialog"]', '[class*="apply" i] form', 'form', 'main']
    },
    other: {
      title: ['h1'],
      company: ['meta[property="og:site_name"]'],
      form: ['form']
    }
  };

  const JOB_PAGE = {
    greenhouse: /./,
    lever: /[0-9a-f]{8}-[0-9a-f]{4}/i,
    ashby: /[0-9a-f]{8}-[0-9a-f]{4}/i,
    workday: /\/(job|details|apply)/i,
    linkedin: /\/jobs\//i,
    indeed: /viewjob|\/jobs|\/apply|\/beta\/indeedapply|\/rc\/clk|\/m\/basecamp|\/cmp\//i,
    dice: /job-detail|job-applications|\/jobs\/detail|\/apply/i,
    ziprecruiter: /\/c\/|\/jobs\/|\/job\/|\/k\/l\/|\/ek\/l\/|jid=|lk=|\/apply/i
  };

  const CONFIRM_RE = /(application|resume)\s+(has\s+been\s+|was\s+)?(successfully\s+)?(submitted|sent|received)|thanks?(\s+you)?\s+for\s+(applying|your\s+application|submitting)|your\s+application\s+(has\s+been|was|is)\s+(submitted|sent|received|complete)|we('ve|\s+have)\s+received\s+your\s+application|application\s+(is\s+)?complete|you('ve|\s+have)\s+(successfully\s+)?applied|successfully\s+applied|your\s+application\s+is\s+on\s+its\s+way/i;
  const MARKER_SITES = new Set(['dice', 'ziprecruiter']);
  const QUIET_SITES = new Set(['linkedin', 'dice', 'ziprecruiter']);
  const CONFIRM_URL_RE = /\/(confirmation|thanks|thank-you|thankyou|submitted|success|post-apply|application-submitted)(\/|$|\?)/i;
  const SUBMIT_RE = /\bsubmit\b|send application|finish application|complete application|submit application/i;
  const NOT_SUBMIT_RE = /resubmit|submit later|save (and|&) (exit|continue|close)|save draft|search|feedback|report|newsletter|subscribe|log ?in|sign ?in|sign ?up/i;

  const REVIEW_RULES = [
    { reason: 'Cover letter', re: /cover ?letter|motivation(al)? letter|letter of (interest|motivation)/ },
    { reason: 'Salary', re: /salary|compensation|pay (expectation|range|requirement)|desired pay|expected (pay|ctc)|\bctc\b|remuneration|hourly rate|rate expectation/ },
    { reason: 'Work authorization', re: /authori[sz]|legally (able|eligible|permitted|entitled)|eligible to work|right to work|work permit|sponsor|visa|citizenship|security clearance|\bclearance\b/ },
    { reason: 'Voluntary disclosure', re: /gender|\bsex\b|\brace\b|ethnic|hispanic|latin[oax]|veteran|disabilit|pronoun|sexual orientation|transgender|lgbt/ },
    { reason: 'How did you hear', re: /how did you (hear|find|learn|come)|referr(al|ed)|\bsource\b/ },
    { reason: 'Availability', re: /start date|notice period|available to start|earliest start|when can you start|availability/ },
    { reason: 'Relocation', re: /relocat|willing to (travel|commute|work on ?site)|commut/ },
    { reason: 'Consent', re: /privacy|consent|\bagree\b|acknowledg|terms|certify|attest|gdpr|data (retention|processing)/ },
    { reason: 'Age', re: /over (the age of )?18|at least 18|18 years/ },
    { reason: 'Previous employment', re: /previously (worked|employed|applied)|former employee|ever (worked|been employed)|currently employed (by|at)/ },
    { reason: 'Phone country code', re: /(country|area|dial(ing)?) ?(phone )?code|phone (country|extension|ext|device|type)|\bextension\b/ }
  ];

  const PROFILE_RULES = [
    { key: 'linkedin', re: /linked ?in/ },
    { key: 'github', re: /git ?hub/ },
    { key: 'ignore', re: /twitter|\bx handle\b|dribbble|behance|stack ?overflow|facebook|instagram/ },
    { key: 'email', re: /e ?mail/ },
    { key: 'phone', re: /phone|mobile|\bcell\b|telephone|\btel\b/ },
    { key: 'ignore', re: /middle ?(name|initial)/ },
    { key: 'firstName', re: /preferred (first )?name|nick ?name|goes by|known as/ },
    { key: 'firstName', re: /first ?name|given ?name|fore ?name|\bfname\b/ },
    { key: 'lastName', re: /last ?name|family ?name|surname|\blname\b/ },
    { key: 'portfolio', re: /portfolio|personal (web ?)?site|web ?site|\bblog\b|homepage|\burls? other\b|other (link|url|website)|\burl\b|\blink\b/ },
    { key: 'ignore', re: /address( line)? ?2|apartment|\bsuite\b|\bapt\b/ },
    { key: 'location', re: /location|where (are you|do you) (currently )?(located|live|based)|current (city|residence)|based in|city,? (and )?state|city\/state/ },
    { key: 'address', re: /address( line)? ?1|street|\baddress\b/ },
    { key: 'city', re: /\bcity\b|\btown\b|\blocality\b/ },
    { key: 'zip', re: /\bzip\b|postal|post ?code/ },
    { key: 'state', re: /\bstate\b|province|\bregion\b|\bcounty\b/ },
    { key: 'country', re: /\bcountry\b|\bnation\b/ },
    { key: 'currentCompany', re: /current (company|employer)|most recent (company|employer)|\bemployer\b|company name|^company$|\borg\b|organi[sz]ation/ },
    { key: 'currentTitle', re: /current (job )?(title|role|position)|job title|most recent (title|role|position)|^title$|headline/ },
    { key: 'school', re: /school|university|college|institution/ },
    { key: 'degree', re: /\bdegree\b|qualification/ },
    { key: 'discipline', re: /discipline|\bmajor\b|field of study|area of study|concentration/ },
    { key: 'gradYear', re: /graduat|year of completion|completion (date|year)/ },
    { key: 'gpa', re: /\bgpa\b|grade point/ },
    { key: 'yearsExperience', re: /years? of (\w+ ){0,4}experience|how many years|experience \(?years\)?|total experience/, verify: true },
    { key: 'summary', re: /summary|about (you|yourself|me)|\bbio\b|tell us about yourself|introduc|personal statement/ },
    { key: 'skills', re: /\bskills?\b|technologies|tech stack/ },
    { key: 'fullName', re: /full ?name|legal name|\bname\b/, exclude: /company|employer|school|university|reference|manager|recruiter|emergency|user ?name|file|referr|contact|hiring|supervisor|job|position/ }
  ];

  const AUTOCOMPLETE_MAP = {
    'given-name': 'firstName', 'family-name': 'lastName', name: 'fullName', email: 'email', tel: 'phone',
    'tel-national': 'phone', 'address-line1': 'address', 'street-address': 'address', 'address-level2': 'city',
    'address-level1': 'state', 'postal-code': 'zip', 'country-name': 'country', country: 'country',
    organization: 'currentCompany', 'organization-title': 'currentTitle', url: 'portfolio', 'additional-name': 'ignore'
  };

  const KEY_LABELS = {
    firstName: 'first name', lastName: 'last name', fullName: 'full name', email: 'email', phone: 'phone',
    linkedin: 'LinkedIn URL', github: 'GitHub URL', portfolio: 'portfolio/website', address: 'street address',
    city: 'city', state: 'state', zip: 'ZIP/postal code', country: 'country', location: 'location',
    currentCompany: 'current company', currentTitle: 'current title', school: 'school', degree: 'degree',
    discipline: 'field of study', gradYear: 'graduation year', gpa: 'GPA', yearsExperience: 'years of experience',
    summary: 'summary', skills: 'skills'
  };

  const US_STATES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
    DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
    NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
    RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
    VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
  };

  const COUNTRY_ALIASES = [
    ['united states', 'usa', 'us', 'u.s.', 'u.s.a.', 'united states of america', 'america'],
    ['united kingdom', 'uk', 'u.k.', 'great britain', 'england', 'britain'],
    ['united arab emirates', 'uae'],
    ['south korea', 'korea, republic of', 'republic of korea', 'korea'],
    ['netherlands', 'the netherlands', 'holland'],
    ['germany', 'deutschland'],
    ['india', 'bharat']
  ];

  const state = {
    profile: null,
    resume: null,
    settings: Object.assign({}, J.DEFAULT_SETTINGS),
    marks: [],
    lastResult: null,
    lastSubmitAt: 0,
    appliedBaseline: null,
    bypassUntil: 0,
    reviewing: false,
    confirmTimer: null,
    confirmHandled: false,
    ui: null,
    url: location.href
  };

  async function loadData() {
    const d = await chrome.storage.local.get(['profile', 'resumeFile', 'settings']);
    state.profile = d.profile || null;
    state.resume = d.resumeFile || null;
    state.settings = Object.assign({}, J.DEFAULT_SETTINGS, d.settings || {});
  }

  function clean(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function normText(s) {
    return String(s || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_\-\[\]\.:#*()?]+/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function textOf(el) {
    if (!el) return '';
    if (el.tagName === 'META') return clean(el.getAttribute('content'));
    if (el.tagName === 'IMG') return clean(el.getAttribute('alt'));
    return clean(el.innerText || el.textContent);
  }

  function firstText(selectors, root, meta) {
    for (const sel of selectors || []) {
      let els;
      try { els = (root || document).querySelectorAll(sel); } catch (e) { continue; }
      for (const el of els) {
        if (isOurs(el)) continue;
        const t = textOf(el);
        if (t && t.length < 200) {
          if (meta) meta.generic = /^h[1-6]$/i.test(sel);
          return t;
        }
      }
    }
    return '';
  }

  function jsonLdJob() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        const list = [].concat(data, data['@graph'] || []);
        for (const item of list) {
          if (!item) continue;
          const t = [].concat(item['@type'] || []);
          if (t.includes('JobPosting')) {
            const org = item.hiringOrganization || {};
            return {
              title: clean(item.title),
              company: clean(typeof org === 'string' ? org : org.name),
              jobId: item.identifier && (item.identifier.value || item.identifier['@value']) ? String(item.identifier.value || item.identifier['@value']) : ''
            };
          }
        }
      } catch (e) {}
    }
    return null;
  }

  function titleFromDocTitle() {
    const t = clean(document.title);
    let m = t.match(/job application for (.+?) at (.+)$/i);
    if (m) return { title: m[1], company: m[2] };
    m = t.match(/^(.+?) at (.+?)(?: [-|–] .*)?$/i);
    if (m) return { title: m[1], company: m[2] };
    m = t.match(/^(.+?) [-–|] (.+?)(?: [-–|] .*)?$/);
    if (m) {
      if (SITE.id === 'lever') return { company: m[1], title: m[2] };
      return { title: m[1], company: m[2] };
    }
    return { title: t, company: '' };
  }

  function extractJob() {
    const cfg = SITE_SELECTORS[SITE.id] || SITE_SELECTORS.other;
    const url = location.href;
    const meta = {};
    let title = firstText(cfg.title, null, meta);
    let weak = !title || meta.generic;
    let company = firstText(cfg.company);
    const ld = jsonLdJob();
    if (ld && ld.title && weak) {
      title = ld.title;
      weak = false;
    }
    if (ld) company = company || ld.company;
    if (!title || !company) {
      const dt = titleFromDocTitle();
      if (!title) title = dt.title;
      company = company || dt.company;
    }
    company = clean(company).replace(/^(at|@)\s+/i, '');
    if (SITE.id === 'linkedin' && /linkedin/i.test(company)) company = '';
    if (SITE.id === 'indeed') company = company.replace(/\s*\d(\.\d)? out of 5.*$/i, '');
    const companySlug = J.companyFromUrl(SITE.id, url);
    const jobId = J.jobIdFromUrl(SITE.id, url) || (ld && ld.jobId) || '';
    title = title.replace(/\s*[-|–]\s*(linkedin|indeed(\.com)?|workday|greenhouse|lever)\s*$/i, '');
    return {
      site: SITE.id,
      url,
      jobId,
      companySlug,
      weak: !!weak,
      title: clean(title).slice(0, 200),
      company: clean(company || J.prettifySlug(companySlug)).slice(0, 120)
    };
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.05;
  }

  function isOurs(el) {
    return !!(el.closest && el.closest('#jbx-host'));
  }

  function isCandidateField(el) {
    if (isOurs(el) || el.disabled) return false;
    const type = (el.type || '').toLowerCase();
    if (el.tagName === 'INPUT' && ['hidden', 'submit', 'button', 'image', 'reset', 'search', 'password', 'range', 'color'].includes(type)) return false;
    if (el.getAttribute('role') === 'searchbox' || el.closest('[role="search"], header nav')) return false;
    if (/^(q|query|keywords?|search.*|global-?nav.*)$/i.test(el.name || el.id || '')) return false;
    if (el.form && isSearchForm(el.form)) return false;
    if (type === 'file') return true;
    if (el.readOnly && el.getAttribute('role') !== 'combobox') return false;
    if (type === 'radio' || type === 'checkbox') return isVisible(el) || isVisible(el.parentElement);
    return isVisible(el);
  }

  function isSearchForm(form) {
    if (form.__jbxSearch !== undefined) return form.__jbxSearch;
    const action = (form.getAttribute('action') || '').toLowerCase();
    const res = form.getAttribute('role') === 'search' ||
      /search|\/jobs(\?|$)|jobs-search|\/candidate\/search/.test(action) ||
      !!form.querySelector('input[type="search"], input[name="search" i], input[name="q"], input[name="query" i], input[name*="keyword" i], input[id*="keyword" i], input[name="search_query" i]');
    form.__jbxSearch = res;
    return res;
  }

  const USE_SHADOW = !!(SITE_SELECTORS[SITE.id] && SITE_SELECTORS[SITE.id].shadow);

  function deepAll(root, sel) {
    const out = [...root.querySelectorAll(sel)];
    if (!USE_SHADOW) return out;
    const walk = r => {
      for (const el of r.querySelectorAll('*')) {
        if (el.shadowRoot && el.id !== 'jbx-host') {
          out.push(...el.shadowRoot.querySelectorAll(sel));
          walk(el.shadowRoot);
        }
      }
    };
    walk(root);
    return out;
  }

  function getFields(scope) {
    return deepAll(scope, 'input, textarea, select').filter(isCandidateField);
  }

  function findScope() {
    const cfg = SITE_SELECTORS[SITE.id] || SITE_SELECTORS.other;
    for (const sel of cfg.form) {
      let best = null;
      let bestN = 0;
      let els;
      try { els = deepAll(document, sel); } catch (e) { continue; }
      for (const el of els) {
        if (isOurs(el)) continue;
        const n = getFields(el).length;
        if (n > bestN) { best = el; bestN = n; }
      }
      if (best && (bestN >= 2 || cfg.strictForm)) return best;
    }
    if (cfg.strictForm) return null;
    let best = null;
    let bestN = 0;
    for (const f of document.forms) {
      if (isSearchForm(f)) continue;
      const n = getFields(f).length;
      if (n > bestN) { best = f; bestN = n; }
    }
    if (best && bestN >= 2) return best;
    return getFields(document.body).length ? document.body : null;
  }

  function ownText(node, exclude) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('input, select, textarea, option, script, style, button, #jbx-host').forEach(n => n.remove());
    if (exclude) clone.querySelectorAll(exclude).forEach(n => n.remove());
    return clean(clone.textContent);
  }

  function labelText(el) {
    const parts = [];
    if (el.labels && el.labels.length) for (const l of el.labels) parts.push(ownText(l));
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const rootNode = el.getRootNode && el.getRootNode().getElementById ? el.getRootNode() : document;
      lb.split(/\s+/).forEach(id => { const n = rootNode.getElementById(id) || document.getElementById(id); if (n) parts.push(clean(n.textContent)); });
    }
    if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
    let t = clean(parts.join(' '));
    if (t) return t;
    const wrap = el.closest('label');
    if (wrap) {
      t = ownText(wrap);
      if (t) return t;
    }
    const type = (el.type || '').toLowerCase();
    if (type === 'radio' || type === 'checkbox') {
      const fs = el.closest('fieldset');
      if (fs && fs.querySelector('legend')) return clean(fs.querySelector('legend').textContent);
    }
    let c = el.parentElement;
    for (let i = 0; i < 5 && c && c !== document.body; i++, c = c.parentElement) {
      const others = getFields(c).filter(f => f !== el && !(f.name && f.name === el.name));
      if (others.length) break;
      const txt = ownText(c);
      if (txt && txt.length <= 300) return txt;
    }
    return '';
  }

  function descriptor(el) {
    const bits = [
      labelText(el),
      el.getAttribute('name'),
      el.id,
      el.getAttribute('placeholder'),
      el.getAttribute('data-automation-id'),
      el.getAttribute('data-qa'),
      el.getAttribute('title')
    ];
    return normText(bits.filter(Boolean).join(' '));
  }

  function fullLabel(el) {
    const t = labelText(el) || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || 'Unlabeled field';
    return clean(t).replace(/\s*\*\s*$/, '');
  }

  function displayLabel(el) {
    return fullLabel(el).slice(0, 90);
  }

  function isRequired(el) {
    return el.required || el.getAttribute('aria-required') === 'true' || /\*/.test(labelText(el));
  }

  function classify(el, desc) {
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).pop();
    if (AUTOCOMPLETE_MAP[ac]) return { key: AUTOCOMPLETE_MAP[ac] };
    const label = normText(labelText(el));
    for (const text of label ? [label, desc] : [desc]) {
      for (const r of REVIEW_RULES) if (r.re.test(text)) return { review: true, reason: r.reason };
      for (const r of PROFILE_RULES) {
        if (r.re.test(text) && !(r.exclude && r.exclude.test(text))) return { key: r.key, verify: !!r.verify };
      }
    }
    return { key: null };
  }

  function workList() {
    return (state.profile && state.profile.work) || [];
  }

  function eduList() {
    return (state.profile && state.profile.education) || [];
  }

  function profileValue(key) {
    const p = state.profile || {};
    const w = workList()[0] || {};
    const e = eduList()[0] || {};
    switch (key) {
      case 'fullName': return p.fullName || clean((p.firstName || '') + ' ' + (p.lastName || ''));
      case 'firstName': return p.firstName || (p.fullName || '').split(' ')[0] || '';
      case 'lastName': return p.lastName || (p.fullName || '').split(' ').slice(1).join(' ') || '';
      case 'location': return p.location || [p.city, p.state].filter(Boolean).join(', ');
      case 'city': return p.city || (p.location || '').split(',')[0].trim();
      case 'state': return p.state || ((p.location || '').split(',')[1] || '').trim();
      case 'currentCompany': return p.currentCompany || w.company || '';
      case 'currentTitle': return p.currentTitle || w.title || '';
      case 'school': return e.school || '';
      case 'degree': return e.degree || '';
      case 'discipline': return e.discipline || '';
      case 'gradYear': return ((e.endDate || '').match(/\d{4}/) || [''])[0];
      case 'gpa': return e.gpa || '';
      case 'yearsExperience': return p.yearsExperience != null && p.yearsExperience !== '' ? String(p.yearsExperience) : '';
      case 'skills': return Array.isArray(p.skills) ? p.skills.join(', ') : (p.skills || '');
      default: return p[key] != null ? String(p[key]) : '';
    }
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    try { el.focus({ preventScroll: true }); } catch (e) {}
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  }

  function degreeLevel(s) {
    const t = String(s || '').toLowerCase();
    if (/ph\.? ?d|doctor/.test(t)) return 'doctor';
    if (/\bmba\b/.test(t)) return 'mba';
    if (/master|\bm\.? ?s\.?\b|\bm\.? ?sc\b|\bm\.? ?a\.?\b|\bm\.? ?eng|\bm\.? ?tech/.test(t)) return 'master';
    if (/bachelor|\bb\.? ?s\.?\b|\bb\.? ?sc\b|\bb\.? ?a\.?\b|\bb\.? ?eng|\bb\.? ?tech|\bb\.? ?e\.?\b|undergrad/.test(t)) return 'bachelor';
    if (/associate/.test(t)) return 'associate';
    if (/high school|secondary|ged\b/.test(t)) return 'high school';
    return '';
  }

  function variants(value, key) {
    const v = clean(value).toLowerCase();
    const out = new Set([v]);
    if (key === 'state') {
      const up = clean(value).toUpperCase();
      if (US_STATES[up]) out.add(US_STATES[up].toLowerCase());
      for (const [ab, name] of Object.entries(US_STATES)) if (name.toLowerCase() === v) out.add(ab.toLowerCase());
    }
    if (key === 'country' || key === 'location') {
      for (const group of COUNTRY_ALIASES) if (group.includes(v)) group.forEach(g => out.add(g));
    }
    return [...out].filter(Boolean);
  }

  function chooseOption(select, value, key) {
    const opts = [...select.options].filter(o => !o.disabled && clean(o.text) && !/^(select|choose|please|--|none selected)/i.test(clean(o.text)));
    if (!opts.length) return null;
    const vs = variants(value, key);
    const txt = o => clean(o.text).toLowerCase();
    const val = o => clean(o.value).toLowerCase();
    let hit = opts.find(o => vs.includes(txt(o)) || vs.includes(val(o)));
    if (hit) return hit;
    if (key === 'degree') {
      const lvl = degreeLevel(value);
      if (lvl) hit = opts.find(o => degreeLevel(o.text) === lvl);
      if (hit) return hit;
    }
    if (key === 'yearsExperience' || key === 'gradYear' || key === 'gpa') {
      const n = parseFloat(value);
      if (!isNaN(n)) {
        hit = opts.find(o => {
          const nums = (o.text.match(/\d+(\.\d+)?/g) || []).map(Number);
          if (!nums.length) return false;
          if (/\+|more|over|above/i.test(o.text) && nums.length === 1) return n >= nums[0];
          if (/less|under|below|fewer/i.test(o.text) && nums.length === 1) return n < nums[0];
          if (nums.length >= 2) return n >= nums[0] && n <= nums[1];
          return n === nums[0];
        });
        if (hit) return hit;
      }
    }
    hit = opts.find(o => vs.some(v => v.length >= 3 && (txt(o).startsWith(v) || (txt(o).length >= 3 && v.startsWith(txt(o))))));
    if (hit) return hit;
    return opts.find(o => vs.some(v => v.length >= 4 && txt(o).includes(v))) || null;
  }

  function hasValue(el) {
    if (el.tagName === 'SELECT') {
      const o = el.options[el.selectedIndex];
      return !!(o && clean(o.value) && !/^(select|choose|please|--)/i.test(clean(o.text)));
    }
    if (el.type === 'file') return !!(el.files && el.files.length);
    return clean(el.value) !== '';
  }

  function isCombobox(el) {
    return el.getAttribute('role') === 'combobox' || !!el.getAttribute('aria-autocomplete') || el.getAttribute('aria-haspopup') === 'listbox' || /autocomplete|typeahead/i.test(el.className || '');
  }

  function setValue(el, value, key) {
    if (el.tagName === 'SELECT') {
      const opt = chooseOption(el, value, key);
      if (!opt) return false;
      setNativeValue(el, opt.value);
      return true;
    }
    const type = (el.type || '').toLowerCase();
    let v = value;
    if (type === 'number') {
      const n = parseFloat(value);
      if (isNaN(n)) return false;
      v = String(n);
    }
    if (type === 'url' && v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
    if (type === 'email' && !/@/.test(v)) return false;
    const max = parseInt(el.getAttribute('maxlength'), 10);
    if (max > 0 && v.length > max) v = v.slice(0, max);
    setNativeValue(el, v);
    return true;
  }

  function base64ToFile(rf) {
    const bin = atob(rf.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], rf.name, { type: rf.type || 'application/octet-stream', lastModified: rf.savedAt || Date.now() });
  }

  function attachResume(input) {
    const file = base64ToFile(state.resume);
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function visibleTarget(el) {
    let c = el;
    for (let i = 0; i < 6 && c; i++, c = c.parentElement) if (isVisible(c)) return c;
    return el;
  }

  function injectStyles() {
    if (document.getElementById('jbx-style')) return;
    const st = document.createElement('style');
    st.id = 'jbx-style';
    st.textContent = `
      .jbx-filled { outline: 2px solid #16a34a !important; outline-offset: 2px !important; box-shadow: 0 0 0 4px rgba(22,163,74,.15) !important; }
      .jbx-review { outline: 2px dashed #d97706 !important; outline-offset: 2px !important; box-shadow: 0 0 0 4px rgba(217,119,6,.15) !important; }
      .jbx-flash { animation: jbx-flash 1.2s ease-out 2; }
      @keyframes jbx-flash { 0% { box-shadow: 0 0 0 8px rgba(37,99,235,.45) !important; } 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); } }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  function clearMarks() {
    for (const m of state.marks) m.el.classList.remove('jbx-filled', 'jbx-review');
    state.marks = [];
  }

  function mark(el, cls) {
    if (!state.settings.highlightFields) return;
    injectStyles();
    const t = visibleTarget(el);
    t.classList.add(cls);
    state.marks.push({ el: t, cls });
    if (cls === 'jbx-review') {
      const done = () => {
        if (hasValue(el) || (el.type === 'radio' || el.type === 'checkbox') && el.checked) {
          t.classList.remove('jbx-review');
          t.classList.add('jbx-filled');
          if (state.lastResult) {
            const item = state.lastResult.review.find(r => r.el === el);
            if (item) item.done = true;
            renderResult(state.lastResult);
          }
        }
      };
      el.addEventListener('change', done);
      el.addEventListener('input', done);
    }
  }

  function focusField(el) {
    const t = visibleTarget(el);
    t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    t.classList.remove('jbx-flash');
    void t.offsetWidth;
    t.classList.add('jbx-flash');
    setTimeout(() => { try { el.focus({ preventScroll: true }); } catch (e) {} }, 400);
  }

  function groupLabel(el) {
    const fs = el.closest('fieldset');
    if (fs && fs.querySelector('legend')) return clean(fs.querySelector('legend').textContent);
    const grp = el.closest('[role="radiogroup"], [role="group"]');
    if (grp) {
      const lb = grp.getAttribute('aria-labelledby');
      if (lb && document.getElementById(lb)) return clean(document.getElementById(lb).textContent);
      if (grp.getAttribute('aria-label')) return grp.getAttribute('aria-label');
    }
    let c = el.parentElement;
    for (let i = 0; i < 6 && c && c !== document.body; i++, c = c.parentElement) {
      const others = getFields(c).filter(f => f.name !== el.name);
      if (others.length) break;
      const t = ownText(c);
      if (t && c.querySelectorAll(`input[name="${CSS.escape(el.name || '')}"]`).length > 1 && t.length < 400) return t;
    }
    return displayLabel(el);
  }

  async function fill(opts) {
    await loadData();
    if (!state.profile) return { ok: false, error: 'noProfile', message: 'No profile saved yet. Upload your resume in the extension options first.' };
    const scope = findScope();
    if (!scope) {
      const msg = SITE.id === 'linkedin'
        ? 'Open the Easy Apply dialog first, then click Fill.'
        : 'No application form fields found on this page. Open the application form (e.g. click "Apply") and try again.';
      return { ok: false, error: 'noForm', message: msg, frameFields: 0 };
    }
    clearMarks();
    const fields = getFields(scope);
    const result = { ok: true, site: SITE.name, filled: [], kept: [], review: [], total: fields.length };
    const fileInputs = fields.filter(f => f.type === 'file');
    const later = [];

    for (const el of fields) {
      const type = (el.type || '').toLowerCase();
      if (type === 'file') { later.push(el); continue; }
      if (type === 'radio' || type === 'checkbox') continue;
      const label = displayLabel(el);
      const desc = descriptor(el);
      const cls = classify(el, desc);
      const filledAlready = hasValue(el);
      if (cls.review || !cls.key || cls.key === 'ignore') continue;
      const value = profileValue(cls.key);
      if (filledAlready && !state.settings.overwriteExisting) {
        result.kept.push({ el, label });
        continue;
      }
      if (!value) {
        if (!filledAlready) {
          result.review.push({ el, label, reason: 'No ' + (KEY_LABELS[cls.key] || cls.key) + ' in profile', required: isRequired(el) });
          mark(el, 'jbx-review');
        }
        continue;
      }
      if (setValue(el, value, cls.key)) {
        result.filled.push({ el, label, key: cls.key });
        mark(el, 'jbx-filled');
        if (isCombobox(el)) result.review.push({ el, label, reason: 'Pick the matching suggestion', required: isRequired(el), soft: true });
        else if (cls.verify) result.review.push({ el, label, reason: 'Verify value', required: false, soft: true });
      } else {
        result.review.push({ el, label, reason: el.tagName === 'SELECT' ? 'No matching option' : 'Could not fill', required: isRequired(el) });
        mark(el, 'jbx-review');
      }
    }

    for (const el of later) {
      const desc = descriptor(el);
      const label = displayLabel(el);
      if (/cover|motivation/.test(desc)) {
        if (!hasValue(el)) {
          result.review.push({ el, label: label || 'Cover letter upload', reason: 'Cover letter', required: isRequired(el) });
          mark(el, 'jbx-review');
        }
        continue;
      }
      const isResume = /resume|\bcv\b|curriculum/.test(desc) || fileInputs.length === 1;
      if (!isResume) {
        if (!hasValue(el)) {
          result.review.push({ el, label, reason: 'File upload', required: isRequired(el) });
          mark(el, 'jbx-review');
        }
        continue;
      }
      if (hasValue(el)) { result.kept.push({ el, label: 'Resume' }); continue; }
      if (!state.resume) {
        result.review.push({ el, label: 'Resume upload', reason: 'No resume file stored', required: true });
        mark(el, 'jbx-review');
        continue;
      }
      try {
        attachResume(el);
        result.filled.push({ el, label: 'Resume: ' + state.resume.name, key: 'resume' });
        mark(el, 'jbx-filled');
      } catch (e) {
        result.review.push({ el, label: 'Resume upload', reason: 'Upload manually', required: true });
        mark(el, 'jbx-review');
      }
    }

    const questions = await Q.scan(questionCandidates(scope), scope, opts && opts.auto ? { auto: true } : null);
    for (const qq of questions) {
      if (qq.status === 'auto' || qq.status === 'verify' || qq.status === 'ai') {
        result.filled.push({ el: qq.el, label: qq.label, key: 'question' });
        mark(qq.el, 'jbx-filled');
        if (qq.status === 'verify') result.review.push({ el: qq.el, label: qq.label, reason: 'Verify saved answer', required: qq.required, soft: true });
        if (qq.status === 'ai') result.review.push({ el: qq.el, label: qq.label, reason: 'Answered by AI — verify', required: qq.required, soft: true });
      } else if (qq.status === 'prefilled') {
        result.kept.push({ el: qq.el, label: qq.label });
      } else {
        const reason = qq.status === 'skipped' ? 'Skipped — AI could not answer' : qq.status === 'unsupported' ? 'Unsupported question type' : qq.status === 'error' ? qq.message : (qq.reason || J.QUESTION_TYPES[qq.type] || 'Question');
        result.review.push({ el: qq.el, label: qq.label.slice(0, 90), reason, required: qq.required });
        mark(qq.el, 'jbx-review');
      }
    }
    result.questions = {
      total: questions.length,
      ai: questions.filter(x => x.status === 'ai').length,
      auto: questions.filter(x => x.status === 'auto' || x.status === 'verify' || x.status === 'ai').length,
      open: questions.filter(x => Q.isAnswered(x) === false).length
    };

    state.lastResult = result;
    return result;
  }

  function questionCandidates(scope) {
    const out = [];
    for (const el of getFields(scope)) {
      const type = (el.type || '').toLowerCase();
      if (type === 'file') continue;
      if (type === 'radio') { out.push({ el, reason: '' }); continue; }
      if (type === 'checkbox') {
        const named = el.name ? scope.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(el.name)}"]`).length : 1;
        const box = el.closest('fieldset, [role="group"]');
        const inBox = box ? box.querySelectorAll('input[type="checkbox"]').length : 1;
        if (named < 2 && inBox < 2 && !isRequired(el) && !/\?/.test(labelText(el))) continue;
        out.push({ el, reason: '' });
        continue;
      }
      const cls = classify(el, descriptor(el));
      if (cls.review) out.push({ el, reason: cls.reason });
      else if (!cls.key) out.push({ el, reason: 'Custom question' });
    }
    for (const btn of deepAll(scope, 'button[aria-haspopup="listbox"]')) {
      if (isVisible(btn) && !isOurs(btn)) out.push({ el: btn, reason: 'Choose an option' });
    }
    for (const grp of deepAll(scope, '[role="radiogroup"]')) {
      if (isVisible(grp) && !isOurs(grp) && !grp.querySelector('input[type="radio"]')) out.push({ el: grp, reason: '' });
    }
    return out;
  }

  function refreshReview() {
    const r = state.lastResult;
    for (const qq of Q.questions()) {
      if (!Q.isAnswered(qq)) continue;
      if (r) for (const item of r.review) if (item.el === qq.el && !item.soft) item.done = true;
      const t = visibleTarget(qq.el);
      if (t.classList.contains('jbx-review')) {
        t.classList.remove('jbx-review');
        if (state.settings.highlightFields) t.classList.add('jbx-filled');
      }
    }
    if (r && state.ui && !state.ui.panel.hidden) renderResult(r);
  }

  async function openReview(mode) {
    await loadData();
    const scope = findScope();
    if (mode === 'submit' || !Q.questions().length || !Q.questions().every(x => x.el.isConnected)) {
      if (scope) await Q.scan(questionCandidates(scope), scope);
    }
    hostEl().host.style.display = '';
    return new Promise(resolve => Q.open(mode, resolve));
  }

  function shouldReview() {
    if (!state.settings.reviewBeforeSubmit || state.reviewing) return false;
    if (Date.now() < state.bypassUntil) return false;
    if (Q.isOpen()) return false;
    const scope = findScope();
    return !!(scope && getFields(scope).length);
  }

  async function reviewBeforeSubmit() {
    state.reviewing = true;
    try {
      const confirmed = await openReview('submit');
      if (confirmed) {
        state.bypassUntil = Date.now() + 3 * 60 * 1000;
        toast('Answers confirmed. Now click the site\'s Submit button to send your application.', 'ok', [], 10000);
      }
    } catch (e) {
      state.bypassUntil = Date.now() + 60 * 1000;
      toast('Review screen failed to open (' + (e.message || e) + '). Submit is not blocked.', 'warn');
    } finally {
      state.reviewing = false;
    }
  }

  function serializeResult(r) {
    if (!r || !r.ok) return r;
    return {
      ok: true,
      site: r.site,
      filled: r.filled.length,
      kept: r.kept.length,
      filledLabels: r.filled.map(f => f.label),
      questions: r.questions || { total: 0, auto: 0, open: 0 },
      review: r.review.map(x => ({ label: x.label, reason: x.reason, required: x.required, soft: !!x.soft }))
    };
  }

  function getProfileSummary() {
    return !!state.profile;
  }

  function hostEl() {
    if (state.ui) return state.ui;
    const host = document.createElement('div');
    host.id = 'jbx-host';
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483646; right: 16px; bottom: 16px;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        [hidden] { display: none !important; }
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        .wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .toasts { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
        .toast { background: #111827; color: #f9fafb; border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.4; max-width: 340px; box-shadow: 0 8px 24px rgba(0,0,0,.25); display: flex; gap: 10px; align-items: center; }
        .toast.ok { background: #14532d; }
        .toast.warn { background: #78350f; }
        .toast button { background: rgba(255,255,255,.14); color: #fff; border: 0; border-radius: 6px; padding: 5px 9px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
        .toast button:hover { background: rgba(255,255,255,.26); }
        .pill { display: flex; align-items: stretch; border-radius: 999px; overflow: hidden; box-shadow: 0 6px 20px rgba(37,99,235,.35); }
        .pill button { border: 0; background: #2563eb; color: #fff; font-size: 13px; font-weight: 600; padding: 10px 14px; cursor: pointer; }
        .pill button:hover { background: #1d4ed8; }
        .pill .more, .pill .go { border-left: 1px solid rgba(255,255,255,.3); }
        .pill .more { padding: 10px 11px; }
        .pill .goauto { background: #15803d; }
        .pill .goauto:hover { background: #166534; }
        .pill button:disabled { opacity: .7; cursor: default; }
        .panel { width: 340px; max-height: 70vh; display: flex; flex-direction: column; background: #fff; color: #111827; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.18); overflow: hidden; font-size: 13px; }
        .hd { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
        .hd b { font-size: 13px; }
        .hd small { color: #6b7280; margin-left: 6px; }
        .x { border: 0; background: transparent; font-size: 18px; line-height: 1; cursor: pointer; color: #6b7280; padding: 0 4px; }
        .body { padding: 10px 12px; overflow: auto; }
        .job { color: #374151; margin-bottom: 8px; line-height: 1.35; }
        .job .t { font-weight: 600; }
        .row { display: flex; gap: 6px; flex-wrap: wrap; }
        .btn { border: 1px solid #d1d5db; background: #fff; color: #111827; border-radius: 8px; padding: 7px 10px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
        .btn:hover { background: #f3f4f6; }
        .btn.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
        .btn.primary:hover { background: #1d4ed8; }
        .btn.good { background: #15803d; color: #fff; border-color: #15803d; }
        .btn:disabled { opacity: .55; cursor: default; }
        .sum { margin: 10px 0 6px; display: flex; gap: 12px; font-weight: 600; }
        .sum .f { color: #15803d; }
        .sum .r { color: #b45309; }
        ul { list-style: none; margin: 0; padding: 0; }
        li { display: flex; gap: 8px; align-items: flex-start; padding: 6px 4px; border-top: 1px solid #f3f4f6; cursor: pointer; border-radius: 6px; }
        li:hover { background: #fffbeb; }
        li.done { opacity: .5; text-decoration: line-through; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #d97706; margin-top: 5px; flex: none; }
        .dot.soft { background: #60a5fa; }
        .lbl { flex: 1; min-width: 0; }
        .lbl div:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rsn { color: #6b7280; font-size: 11.5px; }
        .req { color: #dc2626; font-size: 11px; font-weight: 700; }
        .note { margin-top: 10px; padding: 8px; border-radius: 8px; background: #eff6ff; color: #1e3a8a; font-size: 12px; line-height: 1.4; }
        .err { margin-top: 8px; padding: 8px; border-radius: 8px; background: #fef2f2; color: #991b1b; font-size: 12px; }
        .applied { margin-top: 8px; padding: 6px 8px; border-radius: 8px; background: #f0fdf4; color: #166534; font-size: 12px; }
        @media (prefers-color-scheme: dark) {
          .panel { background: #111827; color: #f3f4f6; border-color: #374151; }
          .hd { background: #1f2937; border-color: #374151; }
          .job { color: #d1d5db; }
          .btn { background: #1f2937; color: #f3f4f6; border-color: #4b5563; }
          .btn:hover { background: #374151; }
          li { border-color: #1f2937; }
          li:hover { background: #292524; }
          .note { background: #1e293b; color: #bfdbfe; }
          .err { background: #3f1d1d; color: #fecaca; }
          .applied { background: #052e16; color: #bbf7d0; }
        }
      </style>
      <div class="wrap">
        <div class="toasts"></div>
        <div class="panel" hidden>
          <div class="hd"><div><b>Job Apply Assistant</b><small class="site"></small></div><button class="x" title="Minimize">&times;</button></div>
          <div class="body">
            <div class="job"></div>
            <div class="row">
              <button class="btn good auto">🚀 Auto apply</button>
              <button class="btn primary fill">Fill application</button>
              <button class="btn mark">Mark as applied</button>
              <button class="btn save">Save job</button>
              <button class="btn qa">Review answers</button>
            </div>
            <div class="status"></div>
            <div class="note">Auto apply fills every step and submits only when all required questions are answered. Otherwise it stops and shows you what is missing.</div>
          </div>
        </div>
        <div class="pill"><button class="goauto">🚀 Auto apply</button><button class="go">⚡ Fill</button><button class="more" title="Show panel">▴</button></div>
      </div>`;
    document.documentElement.appendChild(host);
    const $ = s => shadow.querySelector(s);
    const ui = { host, shadow, $, panel: $('.panel'), pill: $('.pill'), toasts: $('.toasts'), status: $('.status') };
    state.ui = ui;
    $('.goauto').addEventListener('click', autoApply);
    $('.auto').addEventListener('click', autoApply);
    $('.go').addEventListener('click', () => runFill(true));
    $('.fill').addEventListener('click', () => runFill(true));
    $('.more').addEventListener('click', () => togglePanel(true));
    $('.x').addEventListener('click', () => togglePanel(false));
    $('.mark').addEventListener('click', markApplied);
    $('.save').addEventListener('click', saveJob);
    $('.qa').addEventListener('click', () => openReview('review'));
    return ui;
  }

  function togglePanel(open) {
    const ui = hostEl();
    ui.panel.hidden = !open;
    ui.pill.style.display = open ? 'none' : 'flex';
    if (open) refreshPanelJob();
  }

  async function refreshPanelJob() {
    const ui = hostEl();
    const res = await J.send({ type: 'lookupJob', job: extractJob() });
    const job = (res && res.job) || extractJob();
    ui.$('.site').textContent = '· ' + SITE.name;
    ui.$('.job').innerHTML = job.title || job.company
      ? `<div class="t">${J.escapeHtml(job.title || 'Untitled role')}</div><div>${J.escapeHtml(job.company || '')}</div>`
      : '<div>Job details not detected on this page.</div>';
    const existing = res && res.existing;
    const markBtn = ui.$('.mark');
    const prev = ui.$('.applied');
    if (prev) prev.remove();
    if (existing && existing.status !== 'Saved') {
      markBtn.disabled = true;
      markBtn.textContent = 'Applied ✓';
      const d = document.createElement('div');
      d.className = 'applied';
      d.textContent = `Already logged as ${existing.status} on ${J.localDate(existing.appliedAt)} ${J.localTime(existing.appliedAt)}.`;
      ui.$('.job').after(d);
    } else {
      markBtn.disabled = false;
      markBtn.textContent = 'Mark as applied';
    }
    ui.$('.save').disabled = !!existing;
    ui.$('.save').textContent = existing && existing.status === 'Saved' ? 'Saved ✓' : 'Save job';
  }

  function renderResult(r) {
    const ui = hostEl();
    if (!r) { ui.status.innerHTML = ''; return; }
    if (!r.ok) {
      ui.status.innerHTML = `<div class="err">${J.escapeHtml(r.message || 'Could not fill this page.')}</div>`;
      return;
    }
    const open = r.review.filter(x => !x.done && !x.soft).length;
    ui.status.innerHTML = `
      <div class="sum"><span class="f">✓ ${r.filled.length} filled</span><span class="r">⚠ ${open} need${open === 1 ? 's' : ''} review</span>${r.kept.length ? `<span style="color:#6b7280;font-weight:500">${r.kept.length} kept</span>` : ''}</div>
      <ul></ul>`;
    const ul = ui.status.querySelector('ul');
    r.review.forEach(item => {
      const li = document.createElement('li');
      if (item.done) li.className = 'done';
      li.innerHTML = `<span class="dot${item.soft ? ' soft' : ''}"></span><div class="lbl"><div>${J.escapeHtml(item.label || 'Field')}</div><div class="rsn">${J.escapeHtml(item.reason)}${item.required ? ' · <span class="req">required</span>' : ''}</div></div>`;
      li.addEventListener('click', () => focusField(item.el));
      ul.appendChild(li);
    });
    if (!r.filled.length && !r.review.length) ui.status.innerHTML = '<div class="err">No matching fields were found in this form.</div>';
  }

  async function runFill(showPanel) {
    let r;
    try {
      r = await fill();
    } catch (e) {
      r = { ok: false, error: 'fillFailed', message: 'Something went wrong while filling: ' + (e.message || e) };
    }
    if (IS_TOP || showPanel) {
      togglePanel(true);
      renderResult(r);
    }
    if (r.ok && r.questions && r.questions.total) openReview('review');
    return r;
  }

  const NEXT_RE = /^(next|continue|next step|save (and|&) continue|review( application| your application)?|proceed)\b/i;
  const APPLY_RE = /^(1[- ]?click apply|one[- ]click apply|easy apply|quick apply|apply now|apply( for this job)?)\b/i;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function buttonText(b) {
    return clean([b.innerText || b.value || '', b.getAttribute('aria-label') || ''].join(' ')).slice(0, 120);
  }

  function actionButtons(scope) {
    const seen = new Set();
    const out = [];
    for (const root of [scope, document]) {
      if (!root) continue;
      for (const b of deepAll(root, 'button, input[type="submit"], [role="button"], a')) {
        if (seen.has(b) || isOurs(b) || !isVisible(b) || b.disabled || b.getAttribute('aria-disabled') === 'true') continue;
        seen.add(b);
        out.push(b);
      }
    }
    return out;
  }

  function setAutoBusy(busy) {
    if (!state.ui) return;
    for (const b of [state.ui.$('.goauto'), state.ui.$('.auto')]) {
      b.disabled = busy;
      b.textContent = busy ? '🚀 Applying…' : '🚀 Auto apply';
    }
  }

  async function autoApply() {
    if (state.autoRunning) return;
    state.autoRunning = true;
    setAutoBusy(true);
    let openedApply = false;
    let prevEls = null;
    let skippedTotal = 0;
    if (!state.settings.aiEnabled) toast('The AI assistant is off, so only saved answers are used. Turn it on in Settings → AI assistant to answer company questions.', 'warn', [], 10000);
    try {
      for (let step = 0; step < 12; step++) {
        let r;
        try {
          r = await fill({ auto: true });
        } catch (e) {
          r = { ok: false, error: 'fillFailed', message: 'Something went wrong while filling: ' + (e.message || e) };
        }
        togglePanel(true);
        renderResult(r);
        if (!r.ok) {
          if (r.error === 'noForm' && !openedApply) {
            const apply = actionButtons(null).find(b => APPLY_RE.test(buttonText(b)));
            if (apply) {
              openedApply = true;
              apply.click();
              await sleep(2500);
              continue;
            }
          }
          toast(r.message || 'Could not fill this page.', 'warn');
          return;
        }
        const qs = Q.questions();
        const fieldEls = [...r.filled, ...r.kept, ...r.review].map(x => x.el);
        if (prevEls && fieldEls.length && fieldEls.every(el => prevEls.has(el))) {
          toast('The site did not move to the next step — it needs an answer Auto apply skipped. Answer the highlighted questions, then click Auto apply again.', 'warn', [], 15000);
          openReview('review');
          return;
        }
        prevEls = new Set(fieldEls);
        const qEls = new Set(qs.map(x => x.el));
        const skipped = Q.validate(qs).length + r.review.filter(x => x.required && !x.soft && !qEls.has(x.el) && x.el.isConnected && !hasValue(x.el)).length;
        skippedTotal += skipped;
        const buttons = actionButtons(findScope());
        const submit = buttons.find(b => submitControl(b));
        if (submit) {
          state.bypassUntil = Date.now() + 3 * 60 * 1000;
          submit.click();
          await sleep(3000);
          if (confirmationVisible() || !submit.isConnected || !isVisible(submit)) {
            toast(`Application submitted by Auto apply${skippedTotal ? ` (${skippedTotal} question${skippedTotal === 1 ? '' : 's'} skipped)` : ''}.`, 'ok', [], 10000);
          } else {
            toast('Submit was clicked, but no confirmation yet. If the page shows errors, answer those questions and click Auto apply again.', 'warn', [], 15000);
          }
          return;
        }
        const next = buttons.find(b => NEXT_RE.test(buttonText(b)));
        if (!next) {
          toast('No Next or Submit button found. Finish this step on the page.', 'warn', [], 10000);
          return;
        }
        next.click();
        await sleep(2000);
      }
    } finally {
      state.autoRunning = false;
      setAutoBusy(false);
    }
  }

  function toast(text, kind, actions, ms) {
    const ui = hostEl();
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    const span = document.createElement('span');
    span.textContent = text;
    t.appendChild(span);
    for (const a of actions || []) {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.addEventListener('click', async () => { t.remove(); await a.run(); });
      t.appendChild(b);
    }
    ui.toasts.appendChild(t);
    setTimeout(() => t.remove(), ms || 9000);
    return t;
  }

  function describeJob(app) {
    const parts = [app.title, app.company].filter(Boolean);
    return parts.length ? parts.join(' @ ') : 'this job';
  }

  function announceRecord(res) {
    if (!res) return;
    if (!res.ok) { toast(res.error || 'Could not log this application.', 'warn'); return; }
    if (res.duplicate) {
      toast(`Already counted: ${describeJob(res.app)} (not counted again).`, '');
      return;
    }
    if (res.added && res.app) {
      const action = res.lastAction;
      toast(`Counted as applied: ${describeJob(res.app)}`, 'ok', action ? [{
        label: 'Undo',
        run: async () => {
          const u = await J.send({ type: 'undo', action });
          toast(u.ok ? 'Undone — not counted.' : (u.error || 'Undo failed.'), u.ok ? '' : 'warn');
          if (state.ui && !state.ui.panel.hidden) refreshPanelJob();
        }
      }] : [], 12000);
      if (state.ui && !state.ui.panel.hidden) refreshPanelJob();
    }
  }

  async function markApplied() {
    const res = await J.send({ type: 'markApplied', job: extractJob() });
    state.confirmHandled = true;
    announceRecord(res);
    return res;
  }

  async function saveJob() {
    const res = await J.send({ type: 'saveJob', job: extractJob() });
    if (res.ok && res.added) toast('Saved to tracker: ' + describeJob(res.app), 'ok');
    else if (res.ok && res.duplicate) toast('Already in tracker as ' + res.app.status + '.', '');
    else toast(res.error || 'Could not save.', 'warn');
    if (state.ui && !state.ui.panel.hidden) refreshPanelJob();
  }

  function submitControl(target) {
    const btn = target && target.closest && target.closest('button, input[type="submit"], input[type="button"], [role="button"], a');
    if (!btn || isOurs(btn)) return null;
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return null;
    const text = clean([btn.innerText || btn.value || '', btn.getAttribute('aria-label') || '', btn.getAttribute('data-automation-id') || ''].join(' ')).slice(0, 120);
    if (NOT_SUBMIT_RE.test(text)) return null;
    if (SUBMIT_RE.test(text)) return btn;
    if (SITE.id === 'ziprecruiter' && /\b1[- ]?click apply\b|\bone[- ]click apply\b/i.test(text)) return btn;
    if (btn.type === 'submit' && btn.form && looksLikeApplication(btn.form) && !/next|continue|review|save|search|upload|add/i.test(text)) return btn;
    return null;
  }

  function looksLikeApplication(form) {
    return !!form.querySelector('input[type="email"], input[type="file"], input[name*="email" i], input[name*="resume" i]');
  }

  async function onSubmitAttempt() {
    const now = Date.now();
    if (now - state.lastSubmitAt < 2500) return;
    state.lastSubmitAt = now;
    state.confirmHandled = false;
    state.appliedBaseline = appliedMarkers();
    const res = await J.send({ type: 'submitAttempt', job: extractJob() });
    if (!res || !res.ok) return;
    if (res.mode === 'click') {
      announceRecord(res);
      state.confirmHandled = true;
      return;
    }
    toast('Submission detected — it will be counted once the confirmation appears.', '', [{ label: 'Count now', run: markApplied }], 10000);
    watchConfirmation(120000);
  }

  function pageText() {
    const b = document.body;
    if (!b) return '';
    let text = b.innerText || '';
    if (USE_SHADOW) {
      for (const el of deepAll(document, '*')) {
        if (el.shadowRoot && el.id !== 'jbx-host') text += '\n' + clean(el.shadowRoot.textContent);
      }
    }
    return text.slice(0, 80000);
  }

  function appliedMarkers() {
    if (!MARKER_SITES.has(SITE.id)) return 0;
    let n = 0;
    for (const el of deepAll(document, 'button, [role="button"], a, span, div[class*="applied" i], p')) {
      if (isOurs(el) || el.children.length > 2) continue;
      const t = clean(el.textContent);
      if (t.length <= 24 && /^(✓\s*)?(applied|application sent|you applied|applied\s*✓|already applied)$/i.test(t)) n++;
    }
    return n;
  }

  function confirmationVisible() {
    if (CONFIRM_RE.test(pageText())) return true;
    if (MARKER_SITES.has(SITE.id) && state.appliedBaseline != null && appliedMarkers() > state.appliedBaseline) return true;
    return false;
  }

  function watchConfirmation(duration) {
    clearInterval(state.confirmTimer);
    const until = Date.now() + duration;
    state.confirmTimer = setInterval(async () => {
      if (state.confirmHandled || Date.now() > until) { clearInterval(state.confirmTimer); return; }
      if (confirmationVisible()) {
        clearInterval(state.confirmTimer);
        state.confirmHandled = true;
        const res = await J.send({ type: 'confirmationDetected', job: extractJob(), url: location.href, strong: true });
        announceRecord(res);
      }
    }, 1200);
  }

  async function passiveConfirmationCheck() {
    if (state.confirmHandled || !KNOWN) return;
    const st = await J.send({ type: 'getTabState' });
    if (st && st.ok && st.pending) {
      watchConfirmation(60000);
      return;
    }
    if (!confirmationVisible()) return;
    const quiet = QUIET_SITES.has(SITE.id);
    const strong = CONFIRM_URL_RE.test(location.pathname) && !quiet;
    if (!strong && quiet) return;
    const res = await J.send({ type: 'confirmationDetected', job: extractJob(), url: location.href, strong });
    if (!res || !res.ok) return;
    if (res.suggest) {
      toast('This looks like an application confirmation. Count it?', '', [{ label: 'Mark as applied', run: markApplied }], 15000);
      return;
    }
    if (strong) {
      state.confirmHandled = true;
      announceRecord(res);
    }
  }

  function isJobPage() {
    const re = JOB_PAGE[SITE.id];
    return !!(re && re.test(location.pathname + location.search));
  }

  async function publishContext() {
    if (!KNOWN) return;
    const job = extractJob();
    if (job.title && (job.jobId || (isJobPage() && !job.weak))) J.send({ type: 'jobContext', job });
  }

  function shouldShowButton() {
    if (!state.settings.showFloatingButton || !KNOWN) return false;
    if (IS_TOP) return isJobPage() || !!(findScope() && getFields(findScope()).length >= 3);
    const scope = findScope();
    return !!(scope && getFields(scope).length >= 3);
  }

  function updateButtonVisibility() {
    const show = shouldShowButton();
    if (show) {
      const ui = hostEl();
      ui.host.style.display = '';
    } else if (state.ui && !Q.isOpen()) {
      state.ui.host.style.display = state.ui.toasts.children.length ? '' : 'none';
      if (!state.ui.toasts.children.length) togglePanel(false);
    }
  }

  const Q = self.JBXQuestions({
    ownText, displayLabel, fullLabel, groupLabel, isRequired, isVisible, isOurs, hasValue, setNativeValue, focusField, toast,
    shadow: () => hostEl().shadow,
    settings: () => state.settings,
    job: () => extractJob(),
    lastResult: () => state.lastResult,
    refresh: refreshReview
  });

  function block(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
  }

  document.addEventListener('click', e => {
    const path = e.composedPath ? e.composedPath() : [];
    const target = path[0] && path[0].nodeType === 1 ? path[0] : e.target;
    if (!submitControl(target)) return;
    if (shouldReview()) {
      block(e);
      reviewBeforeSubmit();
      return;
    }
    onSubmitAttempt();
  }, true);

  document.addEventListener('submit', e => {
    if (!(e.target && e.target.tagName === 'FORM' && looksLikeApplication(e.target))) return;
    if (shouldReview()) {
      block(e);
      reviewBeforeSubmit();
      return;
    }
    onSubmitAttempt();
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && submitControl(e.target) && !shouldReview()) onSubmitAttempt();
  }, true);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.target !== 'content') return false;
    if (msg.type === 'ping') {
      sendResponse({ ok: true, top: IS_TOP, site: SITE.id });
      return false;
    }
    if (msg.type === 'getJob') {
      if (!IS_TOP) return false;
      sendResponse({ ok: true, job: extractJob() });
      return false;
    }
    if (msg.type === 'markApplied') {
      if (!IS_TOP) return false;
      markApplied().then(sendResponse);
      return true;
    }
    if (msg.type === 'togglePanel') {
      if (!IS_TOP) return false;
      togglePanel(true);
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'fill') {
      const scope = findScope();
      const n = scope ? getFields(scope).length : 0;
      if (!IS_TOP && n === 0) return false;
      if (IS_TOP && n === 0) {
        setTimeout(() => {
          fill().then(r => sendResponse(serializeResult(r)));
        }, 600);
        return true;
      }
      runFill(true).then(r => sendResponse(serializeResult(r)));
      return true;
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      state.settings = Object.assign({}, J.DEFAULT_SETTINGS, changes.settings.newValue || {});
      updateButtonVisibility();
    }
    if (changes.applications && state.ui && !state.ui.panel.hidden) refreshPanelJob();
  });

  function onUrlChange() {
    state.url = location.href;
    state.confirmHandled = false;
    state.lastResult = null;
    clearMarks();
    if (state.ui) renderResult(null);
    publishContext();
    updateButtonVisibility();
    setTimeout(passiveConfirmationCheck, 1500);
  }

  async function init() {
    await loadData();
    publishContext();
    updateButtonVisibility();
    setTimeout(passiveConfirmationCheck, 1500);
    setTimeout(() => { publishContext(); updateButtonVisibility(); }, 2500);
    if (IS_TOP && KNOWN) {
      setInterval(() => {
        if (location.href !== state.url) onUrlChange();
      }, 1000);
    }
  }

  window.__jbx = { fill, extractJob, classify, descriptor, findScope, getFields, SITE, markApplied, openReview, questions: () => Q.questions() };
  init();
})();
