(function (root) {
  const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
  const DATE = `(?:${MONTH}\\s*,?\\s*'?\\d{2,4}|\\d{1,2}\\s*[/.-]\\s*\\d{4}|\\d{4}\\s*[/.-]\\s*\\d{1,2}|(?:19|20)\\d{2})`;
  const END = `(?:${DATE}|present|current|now|today|ongoing)`;
  const RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|–|—|~|to|until|thru|through)\\s*(${END})`, 'i');
  const SINCE_RE = new RegExp(`(?:since|from)\\s+(${DATE})`, 'i');

  const HEADINGS = [
    ['summary', /^(professional |career |executive |personal )?(summary|profile|overview|objective)( of qualifications)?$|^about( me)?$|^career objective$|^professional profile$/],
    ['experience', /^(work |professional |relevant |employment |career )?(experience|history)$|^employment( history)?$|^work history$|^experience and employment$|^professional background$/],
    ['education', /^education( and training| and certifications| background)?$|^academic (background|history|qualifications)$|^academics$|^qualifications$/],
    ['skills', /^(technical |core |key |professional |relevant )?(skills|competencies|expertise|proficiencies)( and (tools|technologies|expertise|abilities|interests))?$|^technolog(y|ies)$|^tech stack$|^tools( and technologies)?$|^areas of expertise$|^skills summary$|^skill set$/],
    ['projects', /^(personal |academic |selected |key )?projects$/],
    ['other', /^(certifications?|licenses?( and certifications)?|awards?( and honors)?|honors|publications|languages|volunteer(ing)?( experience| work)?|interests|hobbies|references|activities|leadership|achievements|accomplishments|training|courses|coursework|affiliations|memberships)$/]
  ];

  const TITLE_WORDS = /\b(engineer|developer|manager|analyst|designer|intern|lead|director|consultant|specialist|scientist|architect|coordinator|associate|assistant|administrator|officer|head|vp|vice president|president|founder|co-founder|programmer|technician|representative|executive|supervisor|advisor|strategist|researcher|editor|writer|recruiter|accountant|teacher|instructor|nurse|product owner|owner|partner|principal|staff|sde|swe|devops|qa|tester|trainee|fellow|chef|clerk|agent|operator|marketer|planner)\b/i;
  const COMPANY_WORDS = /\b(inc|llc|ltd|corp|corporation|company|co\.|gmbh|plc|group|technologies|technology|labs|solutions|systems|software|studios?|partners|consulting|bank|university|agency|holdings|ventures|pvt|limited|foundation|institute|health|services)\b/i;
  const SCHOOL_WORDS = /\b(university|college|institute|school|academy|polytechnic|universidad|université|universität|conservatory|iit|mit)\b/i;
  const DEGREE_WORDS = /\b(bachelor'?s?|master'?s?|b\.?\s?s\.?c?|m\.?\s?s\.?c?|b\.?\s?a\.?|m\.?\s?a\.?|b\.?\s?eng|m\.?\s?eng|b\.?\s?tech|m\.?\s?tech|b\.?\s?e\.?|m\.?\s?e\.?|ph\.?\s?d|doctor(ate)?|mba|associate'?s?|diploma|certificate|a\.?\s?s\.?|high school|ged|bba|bcom|mcom|bca|mca|llb|jd|md)\b/i;
  const BULLET_RE = /^[•‣◦⁃∙▪●○■□➢–—\-*•▪●◦■►✓✔➤»·o]\s+/;

  function clean(s) {
    return String(s || '').replace(/[   ]/g, ' ').replace(/[ \t]+/g, ' ').trim();
  }

  function headingKind(line) {
    if (line.length > 48) return null;
    const norm = line.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!norm) return null;
    for (const [kind, re] of HEADINGS) if (re.test(norm)) return kind;
    return null;
  }

  function isBullet(line) {
    return BULLET_RE.test(line);
  }

  function stripBullet(line) {
    return line.replace(BULLET_RE, '').trim();
  }

  function titleCase(s) {
    return s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }

  function normalizeUrl(u) {
    let s = u.replace(/[).,;]+$/, '');
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/\//, '');
    return s;
  }

  function findEmail(text) {
    const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m ? m[0] : '';
  }

  function findPhone(lines) {
    const re = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d[\d\s.-]{6,}\d/g;
    for (const line of lines.slice(0, 20).concat(lines.slice(20))) {
      if (RANGE_RE.test(line) && !/phone|mobile|tel|cell/i.test(line)) continue;
      const matches = line.match(re) || [];
      for (const m of matches) {
        const digits = m.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 15 && !/^(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}$/.test(m.trim())) return clean(m);
      }
    }
    return '';
  }

  function findUrls(text, links) {
    const all = (links || []).concat(text.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|dev|me|net|org|co|app|site|tech|xyz|ai|page|design|us|uk|ca|in|info|portfolio)(?:\/[^\s,;|()<>]*)?/gi) || []);
    const out = { linkedin: '', github: '', portfolio: '' };
    const emailDomains = (text.match(/@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).map(d => d.slice(1).toLowerCase());
    for (const raw of all) {
      const u = raw.trim();
      if (/^mailto:|^tel:/i.test(u)) continue;
      const lower = u.toLowerCase();
      if (/linkedin\.com\/(in|pub)\//.test(lower)) { if (!out.linkedin) out.linkedin = normalizeUrl(u); continue; }
      if (/github\.com\/[a-z0-9-]+/.test(lower)) {
        if (!out.github) out.github = normalizeUrl(u).replace(/(github\.com\/[^/]+).*$/i, '$1');
        continue;
      }
      if (/linkedin\.com|github\.com|google\.com|gmail\.com|outlook\.com|yahoo\.com|hotmail\.com|icloud\.com/.test(lower)) continue;
      const host = lower.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      if (emailDomains.includes(host)) continue;
      if (/^\d/.test(host) || host.split('.')[0].length < 2) continue;
      if (!out.portfolio) out.portfolio = normalizeUrl(u);
    }
    return out;
  }

  function looksLikeName(line) {
    const l = line.replace(/[,|•·].*$/, '').trim();
    if (!l || l.length > 40 || /\d|@|https?:|www\.|\.com/i.test(l)) return false;
    if (headingKind(l)) return false;
    const words = l.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;
    if (/\b(resume|curriculum|vitae|cv)\b/i.test(l)) return false;
    return words.every(w => /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]*$/.test(w) || /^[A-ZÀ-Ý'’.-]+$/.test(w));
  }

  function findName(lines) {
    for (const line of lines.slice(0, 6)) {
      const first = line.split(/\s*[|•·]\s*/)[0].trim();
      if (looksLikeName(first)) {
        const name = first.replace(/,.*$/, '').trim();
        return name === name.toUpperCase() ? titleCase(name) : name;
      }
    }
    return '';
  }

  function findLocation(lines) {
    const cityState = /\b([A-Z][a-zA-Z.'’ -]{1,30}),\s*([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?/;
    const cityCountry = /^([A-Z][a-zA-Z.'’ -]{1,30}),\s*([A-Z][a-zA-Z .]{2,30})$/;
    for (const line of lines.slice(0, 10)) {
      const segs = line.split(/\s*[|•·◦▪]\s*|\s{3,}|\t/);
      for (const seg of segs) {
        const s = seg.trim();
        if (!s || /@|https?:|www\.|linkedin|github/i.test(s)) continue;
        const cleaned = s.replace(/^(address|location)\s*:\s*/i, '');
        let m = cleaned.match(cityState);
        if (m && !RANGE_RE.test(cleaned)) return clean(m[0]);
        m = cleaned.match(cityCountry);
        if (m && !TITLE_WORDS.test(cleaned) && !COMPANY_WORDS.test(cleaned)) return clean(m[0]);
      }
    }
    return '';
  }

  function sectionize(lines) {
    const sections = { header: [] };
    let cur = 'header';
    for (const line of lines) {
      const colon = line.match(/^([A-Za-z &]{3,40}):\s*(.*)$/);
      const kind = headingKind(line) || (colon && headingKind(colon[1]) && ['skills', 'summary'].includes(headingKind(colon[1])) ? headingKind(colon[1]) : null);
      if (kind) {
        cur = kind;
        sections[cur] = sections[cur] || [];
        if (colon && colon[2] && !headingKind(line)) sections[cur].push(colon[2]);
        continue;
      }
      sections[cur] = sections[cur] || [];
      sections[cur].push(line);
    }
    return sections;
  }

  function parseSkills(lines) {
    const out = [];
    const seen = new Set();
    for (let line of lines || []) {
      line = stripBullet(line).replace(/^[A-Za-z /&+-]{2,40}:\s*/, '');
      for (let part of line.split(/\s*[,;|•·▪●]\s*|\s{2,}|\t|\s+\/\s+/)) {
        part = part.replace(/^(and|&)\s+/i, '').replace(/[.]$/, '').trim();
        if (!part || part.length > 40 || part.split(' ').length > 5) continue;
        const k = part.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(part);
      }
    }
    return out.slice(0, 80);
  }

  function splitHeader(text) {
    return text
      .split(/\s+(?:\||–|—|-|@|at)\s+|\s*[|•·]\s*|,\s+(?=[A-Z][a-z])|\t|\s{3,}/)
      .map(s => s.replace(/^[,\s(]+|[,\s)]+$/g, '').trim())
      .filter(s => s && !/^(remote|hybrid|on-?site|full[- ]time|part[- ]time|contract|internship)$/i.test(s));
  }

  function looksLikePlace(s) {
    return /^[A-Z][a-zA-Z .'-]+,\s*([A-Z]{2}|[A-Z][a-z]+)$/.test(s) || /^(remote|hybrid)$/i.test(s);
  }

  function assignHeader(parts) {
    const res = { title: '', company: '', location: '' };
    const rest = [];
    for (const p of parts) {
      if (!res.location && looksLikePlace(p)) { res.location = p; continue; }
      rest.push(p);
    }
    for (const p of rest) {
      if (!res.title && TITLE_WORDS.test(p) && !COMPANY_WORDS.test(p)) res.title = p;
      else if (!res.company && COMPANY_WORDS.test(p) && !TITLE_WORDS.test(p)) res.company = p;
    }
    for (const p of rest) {
      if (p === res.title || p === res.company) continue;
      if (!res.title) res.title = p;
      else if (!res.company) res.company = p;
    }
    return res;
  }

  function normDate(s) {
    return clean(s).replace(/\s*,\s*/, ' ').replace(/^(\w)/, c => c.toUpperCase());
  }

  function parseExperience(lines) {
    const L = (lines || []).map(clean).filter(Boolean);
    const dateIdx = [];
    L.forEach((line, i) => { if ((RANGE_RE.test(line) || SINCE_RE.test(line)) && !isBullet(line)) dateIdx.push(i); });
    if (!dateIdx.length) return [];
    const entries = [];
    const used = new Set();
    for (let k = 0; k < dateIdx.length; k++) {
      const di = dateIdx[k];
      const prevBound = k > 0 ? dateIdx[k - 1] : -1;
      const line = L[di];
      const m = line.match(RANGE_RE) || line.match(SINCE_RE);
      const start = m ? normDate(m[1]) : '';
      const end = m && m[2] ? normDate(m[2]) : (m ? 'Present' : '');
      const rest = clean(line.replace(m[0], '').replace(/[()]/g, ' ').replace(/\s*[|,–—-]\s*$/, '').replace(/^\s*[|,–—-]\s*/, ''));
      const header = [];
      for (let j = di - 1, n = 0; j > prevBound && n < 2; j--, n++) {
        const l = L[j];
        if (isBullet(l) || l.length > 90 || used.has(j) || /[.!?]$/.test(l) && l.length > 50) break;
        header.unshift(l);
        used.add(j);
      }
      if (rest) header.push(rest);
      used.add(di);
      const parts = header.flatMap(splitHeader);
      const h = assignHeader(parts);
      entries.push({ di, start, end, ...h });
    }
    for (let k = 0; k < entries.length; k++) {
      const from = entries[k].di + 1;
      const to = k + 1 < entries.length ? entries[k + 1].di : L.length;
      const desc = [];
      for (let j = from; j < to; j++) {
        if (used.has(j)) continue;
        if (!isBullet(L[j]) && k + 1 < entries.length && j >= to - 2 && L[j].length < 90) continue;
        desc.push(isBullet(L[j]) ? '• ' + stripBullet(L[j]) : L[j]);
      }
      const e = entries[k];
      if (!e.title && !e.company && desc.length && !isBullet(L[from] || '')) {
        const parts = splitHeader(desc.shift().replace(/^• /, ''));
        Object.assign(e, assignHeader(parts));
      }
      e.description = desc.join('\n');
      delete e.di;
    }
    return entries.map(e => ({
      title: e.title || '',
      company: e.company || '',
      location: e.location || '',
      startDate: e.start || '',
      endDate: e.end || '',
      description: e.description || ''
    }));
  }

  function parseEducation(lines) {
    const out = [];
    let cur = null;
    const push = () => { if (cur && (cur.school || cur.degree)) out.push(cur); cur = null; };
    for (const raw of lines || []) {
      const line = stripBullet(clean(raw));
      if (!line) continue;
      const years = line.match(/(?:19|20)\d{2}/g) || [];
      const range = line.match(RANGE_RE);
      const noDates = clean(line.replace(RANGE_RE, '').replace(/\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*)?(?:19|20)\d{2}\b/gi, '').replace(/\(\s*\)/g, '').replace(/\s*[|,–—-]\s*$/, '').replace(/expected|graduat(ed|ion)/gi, ''));
      const hasSchool = SCHOOL_WORDS.test(line);
      const hasDegree = DEGREE_WORDS.test(line);
      const gpa = line.match(/\bgpa\s*[:\-]?\s*(\d(?:\.\d{1,2})?)(?:\s*\/\s*\d(?:\.\d)?)?/i);
      if (hasSchool && (!cur || cur.school)) { push(); cur = blankEdu(); }
      if (hasDegree && !hasSchool && cur && cur.degree && cur.school) { push(); cur = blankEdu(); }
      if (!cur && (hasSchool || hasDegree)) cur = blankEdu();
      if (!cur) continue;
      const parts = noDates.split(/\s*[|•·]\s*|\s+[–—-]\s+|\t|\s{3,}/).map(s => s.replace(/^[,\s]+|[,\s]+$/g, '')).filter(Boolean)
        .flatMap(s => (SCHOOL_WORDS.test(s) && DEGREE_WORDS.test(s) ? s.split(/\s*,\s*/) : [s]));
      for (const p of parts) {
        if (SCHOOL_WORDS.test(p) && !cur.school) cur.school = p;
        else if (DEGREE_WORDS.test(p) && !cur.degree) {
          cur.degree = p.replace(/\bgpa\b.*$/i, '').replace(/[,;]\s*$/, '').trim();
          const d = cur.degree.match(/.*\bin\s+([A-Z][^,;]+)$/) || cur.degree.match(/\bof\s+([A-Z][^,;]+)$/) || cur.degree.match(/,\s*([A-Z][^,;]+)$/);
          if (d && !/^(science|arts|engineering|technology|business administration|philosophy)$/i.test(d[1].trim())) cur.discipline = d[1].trim();
          else if (d) {
            const d2 = cur.degree.match(/\b(?:science|arts|engineering|technology)\s+(?:in|of)\s+([A-Z][^,;]+)$/i);
            if (d2) cur.discipline = d2[1].trim();
          }
        }
      }
      if (gpa && !cur.gpa) cur.gpa = gpa[1];
      if (range) {
        cur.startDate = cur.startDate || normDate(range[1]);
        cur.endDate = normDate(range[2]);
      } else if (years.length) {
        if (years.length >= 2) { cur.startDate = cur.startDate || years[0]; cur.endDate = years[years.length - 1]; }
        else cur.endDate = cur.endDate || years[0];
      }
    }
    push();
    return out.slice(0, 6);
  }

  function blankEdu() {
    return { school: '', degree: '', discipline: '', startDate: '', endDate: '', gpa: '' };
  }

  function yearOf(s, fallbackNow) {
    if (!s) return null;
    if (/present|current|now|today|ongoing/i.test(s)) return fallbackNow;
    const m = s.match(/(19|20)\d{2}/);
    if (m) {
      const month = s.match(new RegExp(MONTH, 'i'));
      const mi = month ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(month[0].slice(0, 3).toLowerCase()) : 0;
      return Number(m[0]) + Math.max(0, mi) / 12;
    }
    const m2 = s.match(/(\d{1,2})\s*[/.-]\s*(\d{4})/);
    if (m2) return Number(m2[2]) + (Number(m2[1]) - 1) / 12;
    return null;
  }

  function yearsExperience(work) {
    const now = new Date();
    const nowY = now.getFullYear() + now.getMonth() / 12;
    const spans = work.map(w => [yearOf(w.startDate, nowY), yearOf(w.endDate, nowY) ?? yearOf(w.startDate, nowY)]).filter(s => s[0] != null && s[1] != null && s[1] >= s[0]).sort((a, b) => a[0] - b[0]);
    if (!spans.length) return '';
    let total = 0;
    let [cs, ce] = spans[0];
    for (const [s, e] of spans.slice(1)) {
      if (s <= ce) ce = Math.max(ce, e);
      else { total += ce - cs; cs = s; ce = e; }
    }
    total += ce - cs;
    return Math.max(0, Math.round(total));
  }

  function parseText(text, links) {
    const lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
    const full = lines.join('\n');
    const sections = sectionize(lines);
    const name = findName(lines);
    const urls = findUrls(full, links);
    const work = parseExperience(sections.experience);
    const education = parseEducation(sections.education);
    let summary = (sections.summary || []).map(stripBullet).join(' ');
    if (!summary) {
      const hdr = (sections.header || []).filter(l => l.length > 90 && !/@|https?:/.test(l));
      summary = hdr.join(' ');
    }
    const nameParts = name.split(/\s+/).filter(Boolean);
    const location = findLocation(lines);
    const locParts = location.split(',').map(s => s.trim());
    return {
      fullName: name,
      firstName: nameParts[0] || '',
      lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
      email: findEmail(full),
      phone: findPhone(lines),
      location,
      address: '',
      city: locParts[0] || '',
      state: /^[A-Z]{2}\b/.test(locParts[1] || '') ? (locParts[1] || '').slice(0, 2) : '',
      zip: ((location.match(/\b\d{5}(?:-\d{4})?\b/) || [''])[0]),
      country: /^[A-Z]{2}\b/.test(locParts[1] || '') ? '' : (locParts[1] || ''),
      linkedin: urls.linkedin,
      github: urls.github,
      portfolio: urls.portfolio,
      currentTitle: work[0] ? work[0].title : '',
      currentCompany: work[0] ? work[0].company : '',
      yearsExperience: yearsExperience(work),
      summary: clean(summary).slice(0, 2000),
      skills: parseSkills(sections.skills),
      work,
      education
    };
  }

  function decodeXml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&');
  }

  function docxXmlToText(xml) {
    const paras = xml.split(/<\/w:p>/);
    const out = [];
    for (const p of paras) {
      let line = '';
      const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>|<w:numPr>/g;
      let m;
      let bullet = false;
      while ((m = re.exec(p))) {
        if (m[1] != null) line += decodeXml(m[1]);
        else if (m[0] === '<w:tab/>') line += '\t';
        else if (m[0] === '<w:numPr>') bullet = true;
        else line += '\n';
      }
      if (/<\/w:tc>/.test(p)) line += '\t';
      if (line.trim()) out.push((bullet ? '• ' : '') + line);
    }
    return out.join('\n').replace(/\t\n/g, '\n');
  }

  async function extractDocx(buffer) {
    const zip = await root.MiniZip.readZip(buffer);
    const doc = await zip.text('word/document.xml');
    if (!doc) throw new Error('This DOCX has no document body.');
    const links = [];
    const rels = await zip.text('word/_rels/document.xml.rels');
    if (rels) {
      const re = /<Relationship\b[^>]*>/g;
      let m;
      while ((m = re.exec(rels))) {
        if (/TargetMode="External"/.test(m[0]) && /hyperlink/.test(m[0])) {
          const t = m[0].match(/Target="([^"]+)"/);
          if (t) links.push(decodeXml(t[1]));
        }
      }
    }
    let text = docxXmlToText(doc);
    for (const name of zip.names.filter(n => /^word\/header\d*\.xml$/.test(n))) {
      const h = await zip.text(name);
      if (h) text = docxXmlToText(h) + '\n' + text;
    }
    return { text, links };
  }

  async function extractPdf(buffer) {
    const pdfjs = root.pdfjsLib;
    if (!pdfjs) throw new Error('PDF reader failed to load.');
    pdfjs.GlobalWorkerOptions.workerSrc = root.chrome && chrome.runtime ? chrome.runtime.getURL('lib/pdf.worker.min.js') : 'lib/pdf.worker.min.js';
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
    const lines = [];
    const links = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const rows = [];
      for (const it of content.items) {
        if (!('str' in it)) continue;
        const x = it.transform[4];
        const y = it.transform[5];
        const h = Math.abs(it.transform[3]) || it.height || 10;
        let row = rows.find(r => Math.abs(r.y - y) <= Math.max(2, h * 0.35));
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ x, w: it.width || 0, s: it.str, h });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) {
        r.items.sort((a, b) => a.x - b.x);
        let line = '';
        let lastEnd = null;
        for (const it of r.items) {
          if (lastEnd != null) {
            const gap = it.x - lastEnd;
            if (gap > it.h * 2.5) line += '\t';
            else if (gap > it.h * 0.15 && !/\s$/.test(line) && !/^\s/.test(it.s)) line += ' ';
          }
          line += it.s;
          lastEnd = it.x + it.w;
        }
        if (line.trim()) lines.push(line);
      }
      try {
        const ann = await page.getAnnotations();
        for (const a of ann) if (a.url) links.push(a.url);
      } catch (e) {}
    }
    return { text: lines.join('\n'), links };
  }

  async function extractText(file) {
    const name = (file.name || '').toLowerCase();
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 5));
    const sig = String.fromCharCode(...head);
    if (name.endsWith('.pdf') || sig.startsWith('%PDF')) return extractPdf(buf);
    if (name.endsWith('.docx') || (head[0] === 0x50 && head[1] === 0x4b)) return extractDocx(buf);
    if (name.endsWith('.doc')) throw new Error('Old .doc files are not supported. Save it as .docx or PDF and upload again.');
    if (name.endsWith('.txt') || /^text\//.test(file.type)) return { text: new TextDecoder().decode(buf), links: [] };
    throw new Error('Unsupported file type. Upload a PDF or DOCX resume.');
  }

  async function parseFile(file) {
    const { text, links } = await extractText(file);
    if (!text || text.replace(/\s/g, '').length < 30) {
      throw new Error('Could not read text from this file. If it is a scanned image PDF, export a text-based PDF or DOCX instead.');
    }
    return { text, links, profile: parseText(text, links) };
  }

  root.ResumeParser = { parseFile, parseText, extractText, docxXmlToText, parseExperience, parseEducation, parseSkills };
})(typeof self !== 'undefined' ? self : globalThis);
