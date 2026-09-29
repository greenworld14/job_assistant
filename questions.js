(function (root) {
  if (root.JBXQuestions) return;

  root.JBXQuestions = function create(h) {
    const J = root.JBX;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const YES_RE = /^(yes|y|true|i am|i do|i will|i have|i can|agree|i agree)\b/i;
    const NO_RE = /^(no|n|false|i am not|i'm not|i do not|i don'?t|i will not|i won'?t|i have not|i cannot|i can'?t)\b/i;
    const PLACEHOLDER_RE = /^(select|choose|please|--|—|none selected|pick|select one|select\.\.\.)/i;
    const LIMIT_RE = /(?:max(?:imum)?|up to|limit(?:ed)? to|no more than|at most)\s*:?\s*(\d[\d,]*)\s*(?:characters|chars?)|(\d[\d,]*)\s*(?:characters|chars?)\s*(?:max(?:imum)?|or (?:less|fewer)|limit)/i;

    const state = { questions: [], ui: null, mode: 'review', onDone: null, seq: 0 };
    const ids = new WeakMap();

    function clean(s) {
      return String(s || '').replace(/\s+/g, ' ').trim();
    }

    function norm(s) {
      return J.normQuestion(s);
    }

    function isYes(v) {
      return YES_RE.test(clean(v));
    }

    function isNo(v) {
      return NO_RE.test(clean(v));
    }

    function yesNoOf(v) {
      if (v === true) return 'Yes';
      if (v === false) return 'No';
      if (isNo(v)) return 'No';
      if (isYes(v)) return 'Yes';
      return '';
    }

    function isYesNoOptions(opts) {
      if (opts.length !== 2) return false;
      const a = opts.map(o => o.label);
      return (isYes(a[0]) && isNo(a[1])) || (isNo(a[0]) && isYes(a[1]));
    }

    function inputOptionLabel(inp) {
      if (inp.labels && inp.labels.length) {
        const t = h.ownText(inp.labels[0]);
        if (t) return t;
      }
      const wrap = inp.closest('label');
      if (wrap) {
        const t = h.ownText(wrap);
        if (t) return t;
      }
      if (inp.getAttribute('aria-label')) return clean(inp.getAttribute('aria-label'));
      let n = inp.nextSibling;
      while (n && n.nodeType === 3 && !clean(n.textContent)) n = n.nextSibling;
      if (n && clean(n.textContent) && clean(n.textContent).length < 120) return clean(n.textContent);
      return clean(inp.value);
    }

    function selectOptions(sel) {
      return [...sel.options]
        .filter(o => !o.disabled && clean(o.text) && !(PLACEHOLDER_RE.test(clean(o.text)) && !clean(o.value)) && !(o.index === 0 && !clean(o.value)))
        .map(o => ({ label: clean(o.text), value: o.value, el: o }));
    }

    function limitOf(el, label) {
      const max = parseInt(el.getAttribute('maxlength'), 10);
      if (max > 0 && max < 100000) return max;
      const m = String(label || '').match(LIMIT_RE);
      if (m) return parseInt((m[1] || m[2]).replace(/,/g, ''), 10) || 0;
      return 0;
    }

    function textLabel(el) {
      return h.fullLabel ? h.fullLabel(el) : h.displayLabel(el);
    }

    function groupRequired(els, label) {
      if (/\*|\brequired\b/i.test(label || '')) return true;
      return els.some(e => e.required || e.getAttribute('aria-required') === 'true' || (e.closest('[aria-required="true"]') && true));
    }

    function ariaGroupLabel(grp) {
      if (grp.getAttribute('aria-label')) return clean(grp.getAttribute('aria-label'));
      const lb = grp.getAttribute('aria-labelledby');
      if (lb) {
        const rootNode = grp.getRootNode && grp.getRootNode().getElementById ? grp.getRootNode() : document;
        const t = lb.split(/\s+/).map(id => rootNode.getElementById(id) || document.getElementById(id)).filter(Boolean).map(n => clean(n.textContent)).join(' ');
        if (t) return t;
      }
      const fs = grp.closest('fieldset');
      if (fs && fs.querySelector('legend')) return clean(fs.querySelector('legend').textContent);
      let c = grp.parentElement;
      for (let i = 0; i < 4 && c; i++, c = c.parentElement) {
        const t = h.ownText(c, '[role="radiogroup"], [role="group"]');
        if (t && t.length < 300) return t;
      }
      return 'Question';
    }

    function nextId(el) {
      if (!ids.has(el)) ids.set(el, 'q' + (++state.seq));
      return ids.get(el);
    }

    function isComboInput(el) {
      return el.tagName === 'INPUT' && (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list' || el.getAttribute('aria-haspopup') === 'listbox');
    }

    function build(candidates, scope) {
      const out = [];
      const used = new Set();
      const reasonOf = new Map(candidates.map(c => [c.el, c.reason]));
      for (const { el } of candidates) {
        if (used.has(el)) continue;
        const type = (el.type || '').toLowerCase();
        const reason = reasonOf.get(el) || '';
        if (el.tagName === 'INPUT' && (type === 'radio' || type === 'checkbox')) {
          let group = [el];
          if (el.name) group = [...scope.querySelectorAll(`input[type="${type}"]`)].filter(x => x.name === el.name);
          if (type === 'checkbox' && group.length === 1) {
            const box = el.closest('fieldset, [role="group"]');
            if (box) {
              const inBox = [...box.querySelectorAll('input[type="checkbox"]')];
              if (inBox.length > 1) group = inBox;
            }
          }
          group.forEach(g => used.add(g));
          const label = group.length > 1 || type === 'radio' ? h.groupLabel(el) : textLabel(el);
          const options = group.map(g => ({ label: inputOptionLabel(g), value: g.value, el: g }));
          let qtype;
          let widget;
          if (type === 'radio') {
            widget = 'radio';
            qtype = isYesNoOptions(options) ? 'yesno' : 'select';
          } else if (group.length > 1) {
            widget = 'checkgroup';
            qtype = 'multi';
          } else {
            widget = 'checkbox';
            qtype = 'yesno';
          }
          out.push(q(el, group, qtype, widget, label, options, groupRequired(group, label), reason));
          continue;
        }
        used.add(el);
        if (el.tagName === 'SELECT') {
          const options = selectOptions(el);
          const label = textLabel(el);
          const qtype = el.multiple ? 'multi' : (isYesNoOptions(options) ? 'yesno' : 'select');
          out.push(q(el, [el], qtype, el.multiple ? 'multiselect' : 'select', label, options, h.isRequired(el), reason));
          continue;
        }
        if (el.tagName === 'BUTTON') {
          out.push(q(el, [el], 'select', 'popup', textLabel(el), [], /\*/.test(textLabel(el)) || el.getAttribute('aria-required') === 'true', reason));
          continue;
        }
        if (el.getAttribute && el.getAttribute('role') === 'radiogroup') {
          const radios = [...el.querySelectorAll('[role="radio"]')];
          const options = radios.map(r => ({ label: clean(r.getAttribute('aria-label') || r.textContent), value: r.getAttribute('data-value') || '', el: r }));
          const label = ariaGroupLabel(el);
          out.push(q(el, radios, isYesNoOptions(options) ? 'yesno' : 'select', 'ariaRadio', label, options, groupRequired([el], label), reason));
          continue;
        }
        if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !isComboInput(el))) {
          const label = textLabel(el);
          const item = q(el, [el], 'text', el.tagName === 'TEXTAREA' ? 'textarea' : 'input', label, [], h.isRequired(el), reason);
          item.maxLength = limitOf(el, label);
          out.push(item);
          continue;
        }
        if (isComboInput(el)) {
          out.push(q(el, [el], 'select', 'combobox', textLabel(el), [], h.isRequired(el), reason));
          continue;
        }
        out.push(q(el, [el], 'unknown', 'custom', textLabel(el), [], h.isRequired(el), reason));
      }
      return out;
    }

    function q(el, els, type, widget, label, options, required, reason) {
      return {
        id: nextId(el), el, els, type, widget,
        label: clean(label).replace(/\s*\*\s*$/, '').replace(/\s*\(required\)\s*$/i, '').slice(0, 300) || 'Untitled question',
        options, required: !!required, reason: reason || '', maxLength: 0,
        status: 'needs', message: '', score: 0, savedId: null, source: ''
      };
    }

    function comboContainer(el) {
      return el.closest('[class*="container" i], [class*="select" i], [class*="combobox" i], [data-automation-id]') || el.parentElement;
    }

    function comboDisplay(qq) {
      if (qq.widget === 'popup') {
        const t = clean(qq.el.textContent);
        if (t && !PLACEHOLDER_RE.test(t)) return t;
        const hidden = qq.el.parentElement && qq.el.parentElement.querySelector('input[type="hidden"]');
        return hidden && clean(hidden.value) ? clean(hidden.value) : '';
      }
      const c = comboContainer(qq.el);
      const shown = c && c.querySelector('[class*="singleValue" i], [class*="single-value" i], [class*="selected-value" i]');
      if (shown && clean(shown.textContent)) return clean(shown.textContent);
      const multi = c ? [...c.querySelectorAll('[class*="multiValue" i] [class*="label" i], [class*="multi-value__label" i]')].map(n => clean(n.textContent)).filter(Boolean) : [];
      if (multi.length) return multi.join(', ');
      return clean(qq.el.value);
    }

    function isAnswered(qq) {
      switch (qq.widget) {
        case 'radio':
        case 'checkgroup':
          return qq.els.some(e => e.checked);
        case 'checkbox':
          return qq.el.checked || !qq.required;
        case 'ariaRadio':
          return qq.els.some(e => e.getAttribute('aria-checked') === 'true');
        case 'select':
          return h.hasValue(qq.el);
        case 'multiselect':
          return [...qq.el.selectedOptions].some(o => clean(o.value));
        case 'input':
        case 'textarea':
          return clean(qq.el.value) !== '';
        case 'combobox':
        case 'popup':
          return comboDisplay(qq) !== '';
        default:
          return null;
      }
    }

    function currentValue(qq) {
      switch (qq.widget) {
        case 'radio':
          return (qq.options.find(o => o.el.checked) || {}).label || '';
        case 'ariaRadio':
          return (qq.options.find(o => o.el.getAttribute('aria-checked') === 'true') || {}).label || '';
        case 'checkgroup':
          return qq.options.filter(o => o.el.checked).map(o => o.label);
        case 'checkbox':
          return qq.el.checked ? 'Yes' : (qq.touched ? 'No' : '');
        case 'select': {
          const o = qq.el.options[qq.el.selectedIndex];
          return o && h.hasValue(qq.el) ? clean(o.text) : '';
        }
        case 'multiselect':
          return [...qq.el.selectedOptions].filter(o => clean(o.value)).map(o => clean(o.text));
        case 'input':
        case 'textarea':
          return qq.el.value;
        case 'combobox':
        case 'popup':
          return comboDisplay(qq);
        default:
          return '';
      }
    }

    function matchOption(options, value) {
      const v = clean(value);
      if (!v || !options.length) return null;
      const yn = yesNoOf(v);
      if (yn && options.length <= 3) {
        const hit = options.find(o => (yn === 'Yes' ? isYes(o.label) : isNo(o.label)));
        if (hit) return hit;
      }
      const nv = norm(v);
      let hit = options.find(o => norm(o.label) === nv || norm(o.value) === nv);
      if (hit) return hit;
      hit = options.find(o => nv.length >= 2 && (norm(o.label).startsWith(nv) || (norm(o.label).length >= 3 && nv.startsWith(norm(o.label)))));
      if (hit) return hit;
      return options.find(o => nv.length >= 4 && norm(o.label).includes(nv)) || null;
    }

    function fire(el, types) {
      for (const t of types) {
        const Ctor = /^mouse|click/.test(t) ? MouseEvent : Event;
        el.dispatchEvent(new Ctor(t, { bubbles: true, cancelable: true, composed: true }));
      }
    }

    function key(el, k, code) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, keyCode: code, which: code, bubbles: true, cancelable: true, composed: true }));
    }

    function press(el, parts) {
      const r = el.getBoundingClientRect();
      const base = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      const ptr = { pointerId: 1, pointerType: 'mouse', isPrimary: true };
      for (const t of parts) {
        const down = /down|over|move/.test(t);
        const o = Object.assign({}, base, { buttons: down ? 1 : 0 });
        el.dispatchEvent(/^pointer/.test(t) ? new PointerEvent(t, Object.assign(o, ptr)) : new MouseEvent(t, o));
      }
    }

    function popupOptionEls(qq) {
      const el = qq.el;
      const id = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
      const rootNode = el.getRootNode && el.getRootNode().getElementById ? el.getRootNode() : document;
      const list = id ? (rootNode.getElementById(id) || document.getElementById(id)) : null;
      let pool = [...(list ? list.querySelectorAll('[role="option"]') : document.querySelectorAll('[role="listbox"] [role="option"], [role="option"]'))];
      if (!pool.length && list) pool = [...list.querySelectorAll('li')].concat(list.querySelector('li') ? [] : [...list.children]);
      return pool.filter(o => !h.isOurs(o) && h.isVisible(o) && clean(o.textContent || o.getAttribute('aria-label')));
    }

    function isExpanded(el) {
      return el.getAttribute('aria-expanded') === 'true';
    }

    async function waitOptions(qq, rounds) {
      for (let i = 0; i < rounds; i++) {
        await sleep(80);
        const opts = popupOptionEls(qq);
        if (opts.length) return opts;
      }
      return [];
    }

    async function openPopup(qq) {
      const el = qq.el;
      try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
      const already = popupOptionEls(qq);
      if (already.length && isExpanded(el)) return already;
      const target = qq.widget === 'popup' ? el : (el.closest('[class*="control" i]') || el);
      const attempts = [
        () => press(target, ['mousedown', 'mouseup', 'click']),
        () => press(target, ['pointerdown', 'pointerup']),
        () => { el.focus(); key(el, 'ArrowDown', 40); },
        () => { el.focus(); key(el, 'Enter', 13); },
        () => { el.focus(); key(el, ' ', 32); }
      ];
      if (qq.widget !== 'popup') attempts.unshift(() => { el.focus(); press(target, ['mousedown']); key(el, 'ArrowDown', 40); });
      for (const run of attempts) {
        if (!isExpanded(el)) run();
        const opts = await waitOptions(qq, 10);
        if (opts.length) return opts;
        if (isExpanded(el)) {
          const late = await waitOptions(qq, 10);
          if (late.length) return late;
        }
      }
      return [];
    }

    async function closePopup(qq) {
      if (!isExpanded(qq.el) && !popupOptionEls(qq).length) return;
      key(qq.el, 'Escape', 27);
      const active = document.activeElement;
      if (active && active !== qq.el && active !== document.body) key(active, 'Escape', 27);
      await sleep(60);
      if (isExpanded(qq.el) && qq.widget === 'popup') press(qq.el, ['mousedown', 'mouseup', 'click']);
      await sleep(40);
      if (qq.widget !== 'popup') qq.el.blur();
    }

    async function loadPopupOptions(qq) {
      if (qq.options.length || qq.loaded) return qq.options;
      qq.loaded = true;
      const els = await openPopup(qq);
      qq.options = els.map(o => ({ label: clean(o.getAttribute('aria-label') || o.textContent), value: o.getAttribute('data-value') || o.id || '' })).filter(o => o.label && !PLACEHOLDER_RE.test(o.label));
      await closePopup(qq);
      if (qq.options.length && isYesNoOptions(qq.options)) qq.type = 'yesno';
      if (!qq.options.length && qq.widget === 'popup') qq.type = 'unknown';
      return qq.options;
    }

    async function choosePopup(qq, value) {
      const els = await openPopup(qq);
      const opts = els.map(o => ({ label: clean(o.getAttribute('aria-label') || o.textContent), el: o }));
      if (!opts.length) return { ok: false, error: 'The choices for this question could not be opened. Pick it on the page.' };
      const hit = matchOption(opts, value);
      if (!hit) {
        await closePopup(qq);
        return { ok: false, error: `"${value}" is not one of the options.` };
      }
      try { hit.el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      press(hit.el, ['pointerover', 'mouseover', 'pointermove', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
      await sleep(150);
      if (!isAnswered(qq) && hit.el.isConnected && popupOptionEls(qq).length) {
        hit.el.click();
        await sleep(150);
      }
      await closePopup(qq);
      if (qq.widget !== 'popup') qq.el.blur();
      return isAnswered(qq) ? { ok: true } : { ok: true, uncertain: true };
    }

    function substitute(text) {
      const job = h.job ? h.job() : {};
      return String(text || '')
        .replace(/\{company\}/gi, job.company || 'your company')
        .replace(/\{title\}/gi, job.title || 'this role');
    }

    async function applyValue(qq, value) {
      try {
        switch (qq.widget) {
          case 'radio':
          case 'ariaRadio': {
            const hit = matchOption(qq.options, Array.isArray(value) ? value[0] : value);
            if (!hit) return { ok: false, error: `"${value}" is not one of the options.` };
            const checked = qq.widget === 'radio' ? hit.el.checked : hit.el.getAttribute('aria-checked') === 'true';
            if (!checked) {
              if (qq.widget === 'ariaRadio') fire(hit.el, ['mousedown', 'mouseup']);
              hit.el.click();
            }
            return { ok: true };
          }
          case 'checkbox': {
            const want = yesNoOf(value) === 'Yes';
            if (qq.el.checked !== want) qq.el.click();
            qq.touched = true;
            return { ok: true };
          }
          case 'checkgroup': {
            const vals = Array.isArray(value) ? value : String(value).split(/\s*,\s*/);
            const hits = vals.map(v => matchOption(qq.options, v)).filter(Boolean);
            if (!hits.length && vals.filter(Boolean).length) return { ok: false, error: 'None of the saved choices are options here.' };
            for (const o of qq.options) {
              const want = hits.includes(o);
              if (o.el.checked !== want) o.el.click();
            }
            return hits.length < vals.filter(Boolean).length ? { ok: true, partial: true } : { ok: true };
          }
          case 'select': {
            if (value === '') {
              h.setNativeValue(qq.el, '');
              return { ok: true };
            }
            const hit = matchOption(qq.options, value);
            if (!hit) return { ok: false, error: `"${value}" is not one of the options.` };
            h.setNativeValue(qq.el, hit.value);
            return { ok: true };
          }
          case 'multiselect': {
            const vals = Array.isArray(value) ? value : String(value).split(/\s*,\s*/);
            const hits = vals.map(v => matchOption(qq.options, v)).filter(Boolean);
            if (!hits.length && vals.filter(Boolean).length) return { ok: false, error: 'None of the saved choices are options here.' };
            for (const o of qq.options) o.el.selected = hits.includes(o);
            fire(qq.el, ['input', 'change']);
            return hits.length < vals.filter(Boolean).length ? { ok: true, partial: true } : { ok: true };
          }
          case 'input':
          case 'textarea': {
            const text = substitute(Array.isArray(value) ? value.join(', ') : value);
            if (qq.maxLength && text.length > qq.maxLength) return { ok: false, error: `Answer is ${text.length} characters; the limit here is ${qq.maxLength}.`, tooLong: true };
            h.setNativeValue(qq.el, text);
            return { ok: true };
          }
          case 'combobox':
          case 'popup':
            return choosePopup(qq, Array.isArray(value) ? value[0] : value);
          default:
            return { ok: false, error: 'This question uses a control the extension can\'t operate. Answer it on the page.' };
        }
      } catch (e) {
        return { ok: false, error: 'Could not set this answer: ' + (e.message || e) };
      }
    }

    function compatible(qq, saved) {
      if (qq.type === 'unknown') return false;
      if (qq.type === 'text') return true;
      if (qq.type === 'yesno') return !!yesNoOf(Array.isArray(saved.value) ? saved.value[0] : saved.value);
      return true;
    }

    async function autoAnswer(questions, answers, settings) {
      for (const qq of questions) {
        const answered = isAnswered(qq);
        if (qq.type === 'unknown') {
          qq.status = 'unsupported';
          qq.message = 'Unsupported question type — answer it directly on the page.';
          continue;
        }
        if (answered) {
          qq.status = 'prefilled';
          qq.message = 'Already answered on the page.';
          continue;
        }
        const m = J.bestAnswerMatch(qq.label, answers, settings.matchThreshold);
        if (!m || !m.answer) {
          qq.status = 'needs';
          qq.message = m && m.near ? `No confident saved answer (closest: "${m.near.question}", ${Math.round(m.score * 100)}% match).` : 'No saved answer yet — answer it and tick "Save as default".';
          continue;
        }
        qq.suggestion = m.answer;
        qq.score = m.score;
        if (!settings.autoFillSavedAnswers) {
          qq.status = 'needs';
          qq.message = `Saved answer available (${Math.round(m.score * 100)}% match): "${J.answerToText(m.answer)}".`;
          continue;
        }
        if (!compatible(qq, m.answer)) {
          qq.status = 'needs';
          qq.message = `Saved answer "${J.answerToText(m.answer)}" doesn't fit this question type.`;
          continue;
        }
        if ((qq.widget === 'combobox' || qq.widget === 'popup') && !qq.options.length) await loadPopupOptions(qq);
        if (qq.type === 'unknown') {
          qq.status = 'unsupported';
          qq.message = 'Unsupported question type — the choices could not be read. Answer it directly on the page.';
          continue;
        }
        const res = await applyValue(qq, qq.type === 'yesno' ? yesNoOf(Array.isArray(m.answer.value) ? m.answer.value[0] : m.answer.value) : m.answer.value);
        if (res.ok) {
          qq.status = res.partial || res.uncertain ? 'verify' : 'auto';
          qq.savedId = m.answer.id;
          qq.source = 'saved';
          qq.message = `Filled from saved answer (${Math.round(m.score * 100)}% match)${res.partial ? ' — some saved choices were not available' : ''}${res.uncertain ? ' — please confirm the selection' : ''}.`;
          J.send({ type: 'touchAnswer', id: m.answer.id });
        } else {
          qq.status = res.tooLong ? 'error' : 'needs';
          qq.message = res.error;
        }
      }
      return questions;
    }

    function aiEligible(qq, force) {
      if (qq.type === 'unknown') return false;
      if (!force && isAnswered(qq)) return false;
      if (qq.widget === 'checkbox') return false;
      return !J.aiSkipReason(qq.label);
    }

    function trimToLimit(text, max) {
      if (!max || text.length <= max) return text;
      const cut = text.slice(0, max);
      const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
      if (stop > max * 0.6) return cut.slice(0, stop + 1);
      const sp = cut.lastIndexOf(' ');
      return sp > max * 0.6 ? cut.slice(0, sp) : cut;
    }

    const DECLINE_RE = /decline|prefer not|not (to )?(say|answer|disclose|self[- ]identify)|don'?t wish|do not wish|choose not|rather not|not specified/i;
    const DISCLOSURE_INTENTS = ['gender', 'race', 'hispanic', 'veteran', 'disability', 'pronouns'];

    async function declineDisclosures(questions) {
      let count = 0;
      for (const qq of questions) {
        if (isAnswered(qq) || qq.type === 'unknown' || qq.type === 'text') continue;
        if (!DISCLOSURE_INTENTS.includes(J.questionIntent(qq.label))) continue;
        if ((qq.widget === 'combobox' || qq.widget === 'popup') && !qq.options.length) await loadPopupOptions(qq);
        const opt = qq.options.find(o => DECLINE_RE.test(o.label));
        if (!opt) continue;
        const res = await applyValue(qq, qq.type === 'multi' ? [opt.label] : opt.label);
        if (!res.ok) continue;
        qq.status = 'auto';
        qq.source = 'decline';
        qq.message = `Auto apply chose "${opt.label}" for this voluntary question.`;
        count++;
      }
      return count;
    }

    async function aiAnswer(questions, onlyIds, auto) {
      const targets = questions.filter(qq => (onlyIds ? onlyIds.includes(qq.id) && aiEligible(qq, true) : aiEligible(qq)));
      if (!targets.length) return { ok: true, count: 0, asked: 0 };
      for (const qq of targets) {
        if ((qq.widget === 'combobox' || qq.widget === 'popup') && !qq.options.length) await loadPopupOptions(qq);
      }
      const ready = targets.filter(qq => qq.type !== 'unknown' && (qq.type === 'text' || qq.options.length));
      if (!ready.length) return { ok: true, count: 0, asked: 0 };
      ready.forEach(qq => { qq.aiBusy = true; });
      if (state.ui && !state.ui.ov.hidden) render();
      const res = await J.send({
        type: 'aiAnswer',
        auto: !!auto,
        job: h.job ? h.job() : {},
        questions: ready.map(qq => ({ id: qq.id, label: qq.label, type: qq.type, options: qq.options.map(o => o.label), maxLength: qq.maxLength || null, required: qq.required }))
      });
      ready.forEach(qq => { qq.aiBusy = false; });
      if (!res || !res.ok) {
        state.aiError = (res && res.error) || 'The AI assistant failed.';
        return { ok: false, error: state.aiError };
      }
      state.aiError = '';
      let count = 0;
      for (const qq of ready) {
        const a = res.answers.find(x => x.id === qq.id);
        if (!a || a.answer == null || (Array.isArray(a.answer) && !a.answer.length) || String(a.answer).trim() === '') {
          qq.status = 'needs';
          qq.status = auto ? 'skipped' : 'needs';
          qq.message = auto ? 'Skipped by Auto apply — AI could not answer this from your profile.' : 'AI could not answer this from your profile — please answer it yourself.';
          continue;
        }
        if (a.confidence < 0.5 && !auto) {
          qq.status = 'needs';
          qq.message = `AI wasn't confident (${Math.round(a.confidence * 100)}%) — suggestion: "${Array.isArray(a.answer) ? a.answer.join(', ') : a.answer}". Please answer it yourself.`;
          continue;
        }
        let value = a.answer;
        let note = '';
        if (qq.type === 'yesno') {
          value = yesNoOf(Array.isArray(value) ? value[0] : value);
          if (!value) { qq.status = 'needs'; qq.message = `AI gave an unusable answer ("${a.answer}").`; continue; }
        } else if (qq.type === 'select') {
          const hit = matchOption(qq.options, Array.isArray(value) ? value[0] : value);
          if (!hit) { qq.status = 'needs'; qq.message = `AI suggested "${value}", which isn't one of the options.`; continue; }
          value = hit.label;
        } else if (qq.type === 'multi') {
          const vals = (Array.isArray(value) ? value : String(value).split(/\s*,\s*/)).map(v => matchOption(qq.options, v)).filter(Boolean).map(o => o.label);
          if (!vals.length) { qq.status = 'needs'; qq.message = 'AI suggested choices that aren\'t options here.'; continue; }
          value = vals;
        } else {
          value = String(Array.isArray(value) ? value.join(', ') : value).trim();
          if (qq.maxLength && value.length > qq.maxLength) {
            value = trimToLimit(value, qq.maxLength);
            note = ' Shortened to fit the character limit.';
          }
        }
        const applied = await applyValue(qq, value);
        if (!applied.ok) {
          qq.status = 'needs';
          qq.message = 'AI answer could not be applied: ' + applied.error;
          continue;
        }
        qq.status = 'ai';
        qq.source = 'ai';
        qq.aiConfidence = a.confidence;
        qq.message = `Answered by AI (${Math.round(a.confidence * 100)}% confident) — please verify.${note}${applied.uncertain ? ' Confirm the selection on the page.' : ''}`;
        count++;
      }
      h.refresh();
      if (state.ui && !state.ui.ov.hidden) render();
      return { ok: true, count, asked: ready.length };
    }

    function validate(questions) {
      const problems = [];
      for (const qq of questions) {
        qq.error = '';
        qq.warn = '';
        const answered = isAnswered(qq);
        if (qq.type === 'text' && qq.maxLength && String(qq.el.value || '').length > qq.maxLength) {
          qq.error = `Too long: ${qq.el.value.length} / ${qq.maxLength} characters.`;
          problems.push(qq);
          continue;
        }
        if (qq.required && answered === false) {
          qq.error = qq.status === 'error' && qq.message ? `Required — ${qq.message}` : 'Required — please answer this question.';
          problems.push(qq);
        } else if (qq.required && answered === null) {
          qq.warn = 'Required — the extension can\'t check this control, make sure it is answered on the page.';
        }
      }
      return problems;
    }

    async function saveAnswer(qq) {
      if (qq.type === 'unknown') return { ok: false, error: 'This question type can\'t be saved.' };
      let value = currentValue(qq);
      if (qq.type === 'yesno') value = yesNoOf(value) || (qq.widget === 'checkbox' ? (qq.el.checked ? 'Yes' : 'No') : '');
      if (J.isEmptyAnswer(value)) return { ok: false, error: 'Answer the question first, then save it.' };
      const res = await J.send({
        type: 'saveAnswer',
        answer: { id: qq.savedId || undefined, question: qq.label, type: qq.type, value, options: qq.options.map(o => o.label).slice(0, 50) }
      });
      if (res.ok) {
        qq.savedId = res.answer.id;
        state.answersCache = null;
      }
      return res;
    }

    const CSS = `
      .ov { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: flex; align-items: center; justify-content: center; z-index: 2147483647; padding: 16px; }
      .modal { width: min(640px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: #fff; color: #111827; border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,.35); overflow: hidden; font-size: 13.5px; }
      .mh { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #e5e7eb; }
      .mh h3 { margin: 0; font-size: 16px; }
      .mh .sub { color: #6b7280; font-size: 12.5px; margin-top: 2px; }
      .mb { overflow: auto; padding: 12px 16px 16px; }
      .mf { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid #e5e7eb; background: #f9fafb; flex-wrap: wrap; }
      .mf .msg { margin-right: auto; font-size: 12.5px; color: #b91c1c; font-weight: 600; }
      .mf .msg.ok { color: #15803d; }
      .link { background: none; border: 0; color: #6b7280; text-decoration: underline; cursor: pointer; font-size: 12px; padding: 4px; }
      h4 { margin: 14px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
      .qc { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
      .qc.err { border-color: #dc2626; background: #fef2f2; }
      .qc.ok { border-left: 3px solid #16a34a; }
      .qc.need { border-left: 3px solid #d97706; }
      .qh { display: flex; gap: 6px; align-items: flex-start; }
      .ql { flex: 1; font-weight: 600; line-height: 1.35; }
      .tag { font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 999px; background: #eef2ff; color: #3730a3; white-space: nowrap; }
      .rq { font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 999px; background: #fee2e2; color: #b91c1c; white-space: nowrap; }
      .qi { margin: 8px 0 6px; }
      .qm { font-size: 12px; color: #6b7280; }
      .qm.e { color: #b91c1c; font-weight: 600; }
      .qm.w { color: #b45309; }
      .row2 { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
      .save { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: #374151; cursor: pointer; }
      .save input { margin: 0; }
      .yn { display: inline-flex; border: 1px solid #d1d5db; border-radius: 999px; overflow: hidden; }
      .yn button { border: 0; background: #fff; padding: 6px 16px; font-weight: 600; font-size: 12.5px; cursor: pointer; color: #374151; }
      .yn button + button { border-left: 1px solid #d1d5db; }
      .yn button[aria-pressed="true"].y { background: #16a34a; color: #fff; }
      .yn button[aria-pressed="true"].n { background: #475569; color: #fff; }
      select.in, textarea.in, input.in { width: 100%; box-sizing: border-box; font: inherit; padding: 7px 9px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; color: #111827; }
      textarea.in { min-height: 80px; resize: vertical; }
      .count { font-size: 11.5px; color: #6b7280; text-align: right; margin-top: 3px; }
      .count.over { color: #b91c1c; font-weight: 700; }
      .checks { display: flex; flex-direction: column; gap: 4px; }
      .checks label { display: flex; gap: 8px; align-items: center; font-size: 13px; }
      .pf { list-style: none; margin: 0; padding: 0; }
      .pf li { display: flex; gap: 10px; padding: 5px 0; border-top: 1px solid #f3f4f6; font-size: 12.5px; cursor: default; }
      .pf li:hover { background: none; }
      .pf .k { color: #6b7280; width: 40%; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pf .v { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .empty { color: #6b7280; font-size: 12.5px; padding: 6px 0; }
      .banner { padding: 9px 11px; border-radius: 8px; font-size: 12.5px; margin-bottom: 6px; line-height: 1.4; }
      .banner.info { background: #eff6ff; color: #1e3a8a; }
      .banner.bad { background: #fef2f2; color: #991b1b; }
      .btn2 { border: 1px solid #d1d5db; background: #fff; color: #111827; border-radius: 8px; padding: 8px 12px; font-weight: 600; font-size: 13px; cursor: pointer; }
      .btn2.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
      .btn2:disabled { opacity: .5; cursor: default; }
      .btn2.sm { padding: 4px 8px; font-size: 11.5px; }
      .hdr-acts { display: flex; align-items: center; gap: 6px; }
      .aiall { background: #7c3aed; border-color: #7c3aed; color: #fff; }
      .qc.ok.ai { border-left: 3px solid #7c3aed; }
      .qm.ai { color: #6d28d9; }
      .banner.ai { background: #f5f3ff; color: #4c1d95; }
      .acts { display: inline-flex; gap: 4px; align-items: center; }
      .askai { color: #6d28d9; font-weight: 600; text-decoration: none; }
      @media (prefers-color-scheme: dark) {
        .modal { background: #111827; color: #f3f4f6; }
        .mh, .mf { border-color: #374151; }
        .mf { background: #0b1220; }
        .qc { border-color: #374151; }
        .qc.err { background: #3f1d1d; border-color: #f87171; }
        .tag { background: #1e1b4b; color: #c7d2fe; }
        .rq { background: #450a0a; color: #fecaca; }
        .yn, .yn button + button { border-color: #4b5563; }
        .yn button, select.in, textarea.in, input.in, .btn2 { background: #1f2937; color: #f3f4f6; border-color: #4b5563; }
        .save, .checks label { color: #d1d5db; }
        .pf li { border-color: #1f2937; }
        .banner.info { background: #172554; color: #bfdbfe; }
        .banner.bad { background: #3f1d1d; color: #fecaca; }
        .banner.ai { background: #2e1065; color: #ddd6fe; }
        .qm.ai, .askai { color: #c4b5fd; }
      }
    `;

    function esc(s) {
      return J.escapeHtml(s);
    }

    function statusClass(qq) {
      if (qq.error) return 'err';
      const a = isAnswered(qq);
      if (a && qq.status === 'ai') return 'ok ai';
      return a ? 'ok' : 'need';
    }

    async function askAi(onlyIds) {
      if (!state.ui) return;
      const btn = state.ui.shadow.querySelector('.aiall');
      if (btn) { btn.disabled = true; btn.textContent = '✨ Asking AI…'; }
      const r = await aiAnswer(state.questions, onlyIds);
      if (btn) { btn.disabled = false; btn.textContent = '✨ Answer with AI'; }
      const banner = state.ui.shadow.querySelector('.aibanner');
      if (!r.ok) {
        banner.className = 'banner bad aibanner';
        banner.textContent = 'AI assistant: ' + r.error;
        banner.hidden = false;
      } else if (!r.asked) {
        banner.className = 'banner info aibanner';
        banner.textContent = 'Nothing for AI to answer — every remaining question is already answered, personal (salary, consent, voluntary disclosure) or unsupported.';
        banner.hidden = false;
      } else {
        banner.className = 'banner ai aibanner';
        banner.textContent = `AI answered ${r.count} of ${r.asked} question${r.asked === 1 ? '' : 's'}. Check each answer marked "Answered by AI" before you submit.`;
        banner.hidden = false;
      }
      render();
    }

    function renderControl(qq, box) {
      const val = currentValue(qq);
      if (qq.type === 'unknown') {
        box.innerHTML = '<div class="qm w">This question uses a custom control the extension can\'t operate. Answer it directly on the page.</div>';
        return;
      }
      if (qq.type === 'yesno') {
        const yn = yesNoOf(val);
        box.innerHTML = `<div class="yn" role="group" aria-label="Yes or No"><button type="button" class="y" aria-pressed="${yn === 'Yes'}">Yes</button><button type="button" class="n" aria-pressed="${yn === 'No'}">No</button></div>`;
        box.querySelector('.y').onclick = () => change(qq, 'Yes');
        box.querySelector('.n').onclick = () => change(qq, 'No');
        return;
      }
      if (qq.type === 'select') {
        if ((qq.widget === 'combobox' || qq.widget === 'popup') && !qq.options.length) {
          box.innerHTML = `<button type="button" class="btn2 sm">Load choices</button> <span class="qm">${esc(val || 'Not answered')}</span>`;
          box.querySelector('button').onclick = async () => {
            qq.loaded = false;
            await loadPopupOptions(qq);
            if (!qq.options.length) {
              qq.type = 'unknown';
            }
            render();
          };
          return;
        }
        const sel = document.createElement('select');
        sel.className = 'in';
        sel.innerHTML = '<option value="">— Choose —</option>' + qq.options.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join('');
        const cur = matchOption(qq.options, val);
        if (cur) sel.value = String(qq.options.indexOf(cur));
        sel.onchange = () => change(qq, sel.value === '' ? '' : qq.options[+sel.value].label);
        box.appendChild(sel);
        return;
      }
      if (qq.type === 'multi') {
        const selected = Array.isArray(val) ? val : [];
        const wrap = document.createElement('div');
        wrap.className = 'checks';
        qq.options.forEach(o => {
          const l = document.createElement('label');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = selected.includes(o.label);
          cb.onchange = () => change(qq, [...wrap.querySelectorAll('input')].map((c, i) => (c.checked ? qq.options[i].label : null)).filter(Boolean));
          l.appendChild(cb);
          l.appendChild(document.createTextNode(o.label));
          wrap.appendChild(l);
        });
        if (!qq.options.length) wrap.innerHTML = '<div class="qm w">No choices found.</div>';
        box.appendChild(wrap);
        return;
      }
      const ta = document.createElement(qq.widget === 'input' && !(qq.maxLength > 200) ? 'input' : 'textarea');
      ta.className = 'in';
      ta.value = String(val || '');
      if (qq.maxLength) ta.maxLength = qq.maxLength;
      const counter = document.createElement('div');
      counter.className = 'count';
      const upd = () => {
        const n = ta.value.length;
        counter.textContent = qq.maxLength ? `${n} / ${qq.maxLength} characters` : `${n} characters`;
        counter.classList.toggle('over', !!qq.maxLength && n > qq.maxLength);
      };
      ta.oninput = () => { upd(); changeText(qq, ta.value); };
      ta.onchange = () => { if (qq.saveOn) saveAnswer(qq).then(r => setMsg(qq, r)); };
      upd();
      box.appendChild(ta);
      box.appendChild(counter);
    }

    let textTimer = null;

    function changeText(qq, value) {
      clearTimeout(textTimer);
      textTimer = setTimeout(async () => {
        const res = await applyValue(qq, value);
        qq.status = res.ok ? 'manual' : 'error';
        qq.message = res.ok ? 'Answered.' : res.error;
        qq.error = res.ok ? '' : res.error;
        h.refresh();
        updateCard(qq);
        updateFooter();
      }, 250);
    }

    async function change(qq, value) {
      const res = await applyValue(qq, value);
      qq.touched = true;
      qq.status = res.ok ? 'manual' : 'error';
      qq.message = res.ok ? (res.uncertain ? 'Selected — confirm it on the page.' : 'Answered.') : res.error;
      qq.error = res.ok ? '' : res.error;
      if (res.ok && qq.saveOn) setMsg(qq, await saveAnswer(qq));
      h.refresh();
      render();
    }

    function setMsg(qq, res) {
      if (!res) return;
      qq.message = res.ok ? 'Saved as your default answer.' : (res.error || 'Could not save.');
      updateCard(qq);
    }

    function updateCard(qq) {
      if (!state.ui) return;
      const card = state.ui.shadow.querySelector(`.qc[data-id="${qq.id}"]`);
      if (!card) return;
      card.className = 'qc ' + statusClass(qq);
      const m = card.querySelector('.qm.status');
      m.className = 'qm status' + (qq.error ? ' e' : qq.warn && !isAnswered(qq) ? ' w' : qq.status === 'ai' ? ' ai' : '');
      m.textContent = qq.aiBusy ? '✨ AI is thinking…' : (qq.error || (qq.warn && !isAnswered(qq) ? qq.warn : qq.message));
    }

    function card(qq) {
      const div = document.createElement('div');
      div.className = 'qc ' + statusClass(qq);
      div.dataset.id = qq.id;
      const typeLabel = qq.type === 'unknown' ? 'Unsupported' : J.QUESTION_TYPES[qq.type];
      div.innerHTML = `
        <div class="qh"><span class="ql">${esc(qq.label)}</span>${qq.required ? '<span class="rq">Required</span>' : ''}<span class="tag">${esc(typeLabel)}</span></div>
        <div class="qi"></div>
        <div class="qm status"></div>
        <div class="row2">
          ${qq.type === 'unknown' ? '<span></span>' : `<label class="save"><input type="checkbox" ${qq.saveOn ? 'checked' : ''}> ${qq.savedId ? 'Update my saved answer' : 'Save as default answer'}</label>`}
          <span class="acts">
            ${h.settings().aiEnabled && qq.type !== 'unknown' && qq.widget !== 'checkbox' && !J.aiSkipReason(qq.label) ? `<button type="button" class="link askai">${qq.status === 'ai' ? 'Ask AI again' : '✨ Ask AI'}</button>` : ''}
            <button type="button" class="link jump">Show on page</button>
          </span>
        </div>`;
      renderControl(qq, div.querySelector('.qi'));
      const cb = div.querySelector('.save input');
      if (cb) cb.onchange = async () => {
        qq.saveOn = cb.checked;
        if (cb.checked) setMsg(qq, await saveAnswer(qq));
      };
      const ask = div.querySelector('.askai');
      if (ask) ask.onclick = async () => {
        ask.textContent = '✨ Asking…';
        ask.disabled = true;
        await askAi([qq.id]);
      };
      div.querySelector('.jump').onclick = () => {
        hide(false);
        h.focusField(qq.el);
        h.toast('Answer it on the page, then reopen "Review answers" from the panel.', '', [{ label: 'Review answers', run: () => open(state.mode) }], 9000);
      };
      return div;
    }

    function profileRows() {
      const r = h.lastResult();
      if (!r || !r.filled) return [];
      return r.filled.filter(f => f.key && f.key !== 'question').map(f => {
        const el = f.el;
        let v = '';
        if (el.type === 'file') v = el.files && el.files[0] ? el.files[0].name : '';
        else if (el.tagName === 'SELECT') v = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '';
        else v = el.value;
        return { label: f.label, value: v };
      });
    }

    function render() {
      if (!state.ui) return;
      const { shadow } = state.ui;
      const qs = shadow.querySelector('.qs');
      const problems = validate(state.questions);
      qs.innerHTML = '';
      if (!state.questions.length) qs.innerHTML = '<div class="empty">No screening questions detected on this step.</div>';
      const ordered = [...state.questions].sort((a, b) => (b.required - a.required) || (Number(!!isAnswered(a)) - Number(!!isAnswered(b))));
      ordered.forEach(qq => {
        const c = card(qq);
        qs.appendChild(c);
        updateCard(qq);
      });
      shadow.querySelector('.qcount').textContent = `(${state.questions.length})`;
      const rows = profileRows();
      const pf = shadow.querySelector('.pf');
      pf.innerHTML = rows.length ? rows.map(r => `<li><span class="k">${esc(r.label)}</span><span class="v">${esc(r.value || '—')}</span></li>`).join('') : '<li class="empty">Nothing filled from your profile yet — click "Fill application" first.</li>';
      shadow.querySelector('.pcount').textContent = `(${rows.length})`;
      updateFooter(problems);
    }

    function updateFooter(problems) {
      if (!state.ui) return;
      const probs = problems || validate(state.questions);
      const { shadow } = state.ui;
      const msg = shadow.querySelector('.mf .msg');
      const confirm = shadow.querySelector('.confirm');
      const anyway = shadow.querySelector('.anyway');
      const block = h.settings().blockUnansweredRequired;
      const req = probs.filter(p => p.required && !p.error.startsWith('Too long')).length;
      const long = probs.filter(p => p.error.startsWith('Too long')).length;
      const parts = [];
      if (req) parts.push(`${req} required question${req === 1 ? '' : 's'} unanswered`);
      if (long) parts.push(`${long} answer${long === 1 ? '' : 's'} over the length limit`);
      msg.textContent = parts.length ? parts.join(' · ') : 'All required questions answered.';
      msg.className = 'msg' + (parts.length ? '' : ' ok');
      if (state.mode === 'submit') {
        confirm.textContent = 'Looks good — I\'ll submit';
        confirm.disabled = !!(probs.length && block);
        anyway.hidden = !(probs.length && block);
      } else {
        confirm.textContent = 'Done';
        confirm.disabled = false;
        anyway.hidden = true;
      }
    }

    function ensureUi() {
      if (state.ui) return state.ui;
      const shadow = h.shadow();
      if (!shadow.querySelector('#jbx-q-style')) {
        const st = document.createElement('style');
        st.id = 'jbx-q-style';
        st.textContent = CSS;
        shadow.appendChild(st);
      }
      const ov = document.createElement('div');
      ov.className = 'ov';
      ov.hidden = true;
      ov.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-label="Review your answers">
          <div class="mh"><div><h3>Review your answers</h3><div class="sub"></div></div><div class="hdr-acts"><button type="button" class="btn2 sm aiall" hidden>✨ Answer with AI</button><button type="button" class="link close" title="Close">✕</button></div></div>
          <div class="mb">
            <div class="banner info intro"></div>
            <div class="banner aibanner" hidden></div>
            <h4>Screening questions <span class="qcount"></span></h4>
            <div class="qs"></div>
            <h4>Filled from your profile <span class="pcount"></span></h4>
            <ul class="pf"></ul>
          </div>
          <div class="mf"><span class="msg"></span><button type="button" class="link anyway" hidden>Submit anyway</button><button type="button" class="btn2 back">Back to form</button><button type="button" class="btn2 primary confirm">Done</button></div>
        </div>`;
      shadow.appendChild(ov);
      const ui = { shadow, ov };
      state.ui = ui;
      const close = () => hide(false);
      ov.querySelector('.close').onclick = close;
      ov.querySelector('.back').onclick = close;
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
      ov.querySelector('.confirm').onclick = () => {
        const probs = validate(state.questions);
        if (state.mode === 'submit' && probs.length && h.settings().blockUnansweredRequired) {
          render();
          return;
        }
        hide(state.mode === 'submit');
      };
      ov.querySelector('.anyway').onclick = () => hide(true);
      ov.querySelector('.aiall').onclick = () => askAi(null);
      return ui;
    }

    function hide(confirmed) {
      if (!state.ui) return;
      state.ui.ov.hidden = true;
      const done = state.onDone;
      state.onDone = null;
      if (done) done(!!confirmed);
    }

    function open(mode, onDone) {
      const ui = ensureUi();
      state.mode = mode || 'review';
      state.onDone = onDone || null;
      const job = h.job ? h.job() : {};
      ui.shadow.querySelector('.sub').textContent = [job.title, job.company].filter(Boolean).join(' · ') || location.hostname;
      ui.shadow.querySelector('.intro').textContent = state.mode === 'submit'
        ? 'Check every answer before you submit. When everything looks right, confirm and then click the site\'s Submit button again — the extension never submits for you.'
        : 'Answers from your saved defaults are filled in only when the question clearly matches. Anything uncertain is left for you.';
      ui.shadow.querySelector('.intro').className = 'banner info intro';
      ui.shadow.querySelector('.aiall').hidden = !h.settings().aiEnabled;
      const banner = ui.shadow.querySelector('.aibanner');
      if (state.aiError) {
        banner.className = 'banner bad aibanner';
        banner.textContent = 'AI assistant: ' + state.aiError;
        banner.hidden = false;
      } else {
        const n = state.questions.filter(x => x.status === 'ai').length;
        banner.className = 'banner ai aibanner';
        banner.textContent = n ? `AI answered ${n} question${n === 1 ? '' : 's'} (purple). Check each one before you submit.` : '';
        banner.hidden = !n;
      }
      ui.ov.hidden = false;
      render();
      const first = ui.shadow.querySelector('.qc.err, .qc.need');
      if (first) first.scrollIntoView({ block: 'nearest' });
    }

    function isOpen() {
      return !!(state.ui && !state.ui.ov.hidden);
    }

    async function scan(candidates, scope, opts) {
      const settings = h.settings();
      let questions;
      try {
        questions = build(candidates, scope);
      } catch (e) {
        questions = [];
      }
      const popups = questions.filter(qq => !qq.options.length && (qq.widget === 'popup' || (qq.widget === 'combobox' && !isAnswered(qq))));
      if (popups.length) {
        const t = h.toast(`Reading the choices for ${popups.length} question${popups.length === 1 ? '' : 's'}…`, '', [], 60000);
        for (const qq of popups) {
          try { await loadPopupOptions(qq); } catch (e) {}
        }
        if (t) t.remove();
      }
      const { answers } = await chrome.storage.local.get('answers');
      await autoAnswer(questions, Array.isArray(answers) ? answers : [], Object.assign({}, settings, opts && opts.noAuto ? { autoFillSavedAnswers: false } : {}));
      state.questions = questions;
      state.aiError = '';
      const auto = !!(opts && opts.auto);
      if (auto) await declineDisclosures(questions);
      if (settings.aiEnabled && (settings.aiAutoAnswer || auto) && !(opts && opts.noAi)) {
        const n = questions.filter(qq => aiEligible(qq)).length;
        if (n) {
          const t = h.toast(`✨ AI is answering ${n} question${n === 1 ? '' : 's'}…`, '', [], 60000);
          const r = await aiAnswer(questions, null, auto);
          if (t) t.remove();
          if (!r.ok) h.toast('AI assistant: ' + r.error, 'warn', [], 10000);
        }
      }
      return questions;
    }

    return { scan, open, isOpen, aiAnswer: ids => aiAnswer(state.questions, ids), validate, isAnswered, currentValue, applyValue, questions: () => state.questions, render, yesNoOf, matchOption };
  };
})(typeof self !== 'undefined' ? self : globalThis);
