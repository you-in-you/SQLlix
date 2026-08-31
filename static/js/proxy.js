/**
 * SQLlix — Proxy manager
 * Loaded after app.js. Exposes helpers on window for requests / init.
 */
(function () {
  const $ = (s) => document.querySelector(s);

  const PROXY_LS_KEY = 'sqli-workbench-proxies-v1';
  let proxyState = { items: [], activeId: null };
  let proxyPingTimer = null;

  function apiBaseUrl() {
    return (window.location.port === '5000') ? '' : 'http://127.0.0.1:5000';
  }

  function formatBytes(n) {
    if (typeof window.formatBytes === 'function') {
      try { return window.formatBytes(n); } catch (e) {}
    }
    n = Math.max(0, Number(n) || 0);
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function escapeHtml(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || '');
  }

  function loadProxyState() {
    try {
      const raw = localStorage.getItem(PROXY_LS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.items)) {
        proxyState.items = data.items;
        proxyState.activeId = data.activeId || null;
      }
    } catch (e) {}
  }

  function saveProxyState() {
    try {
      localStorage.setItem(PROXY_LS_KEY, JSON.stringify({
        items: proxyState.items,
        activeId: proxyState.activeId,
      }));
    } catch (e) {}
  }

  function getActiveProxy() {
    if (!proxyState.activeId) return null;
    return proxyState.items.find((p) => p.id === proxyState.activeId) || null;
  }

  function getActiveProxyUrl() {
    const p = getActiveProxy();
    return p ? p.url : '';
  }

  function applyServerProxyStats(stats) {
    if (!stats || !stats.proxy) return;
    const item = proxyState.items.find((p) => p.url === stats.proxy);
    if (!item) return;
    if (typeof stats.bytes_sent === 'number') item.bytesOut = stats.bytes_sent;
    if (typeof stats.bytes_recv === 'number') item.bytesIn = stats.bytes_recv;
    saveProxyState();
    updateProxyToolbar();
    renderProxyList();
  }

  function updateProxyToolbar() {
    const active = getActiveProxy();
    const dot = $('#proxyStatusDot');
    const label = $('#proxyActiveLabel');
    const pingEl = $('#proxyPingMs');
    const outEl = $('#proxyBytesOut');
    const inEl = $('#proxyBytesIn');
    if (label) label.textContent = active ? active.url : 'Direct (no proxy)';
    if (outEl) outEl.textContent = formatBytes(active ? active.bytesOut : 0);
    if (inEl) inEl.textContent = formatBytes(active ? active.bytesIn : 0);
    if (pingEl) {
      if (active && active.lastPingMs != null) {
        pingEl.textContent = active.lastPingOk === false
          ? (active.lastPingMs + 'ms ✗')
          : (active.lastPingMs + 'ms');
      } else {
        pingEl.textContent = active ? '—' : '';
      }
    }
    if (dot) {
      dot.classList.remove('ok', 'bad', 'pending');
      if (!active) return;
      if (active.lastPingOk === true) dot.classList.add('ok');
      else if (active.lastPingOk === false) dot.classList.add('bad');
      else dot.classList.add('pending');
    }
  }

  function renderProxyList() {
    const list = $('#proxyList');
    if (!list) return;
    const items = [...proxyState.items].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (a.url || '').localeCompare(b.url || '');
    });
    if (!items.length) {
      list.innerHTML = '<div class="proxy-empty">No proxies yet — add one above</div>';
      return;
    }
    list.innerHTML = items.map((p) => {
      const isActive = p.id === proxyState.activeId;
      const ping = p.lastPingMs != null
        ? (p.lastPingOk === false ? (p.lastPingMs + 'ms ✗') : (p.lastPingMs + 'ms'))
        : '—';
      return '<div class="proxy-item' + (isActive ? ' active' : '') + (p.pinned ? ' pinned' : '') + '" data-id="' + p.id + '">' +
        '<div class="proxy-item-top">' +
          '<span class="proxy-item-url" title="' + escapeHtml(p.url) + '">' + escapeHtml(p.url) + '</span>' +
          '<div class="proxy-item-actions">' +
            '<button type="button" class="use-btn' + (isActive ? ' active' : '') + '" data-act="use" title="Use this proxy">' + (isActive ? 'Active' : 'Use') + '</button>' +
            '<button type="button" class="pin-btn' + (p.pinned ? ' on' : '') + '" data-act="pin" title="Pin">' + (p.pinned ? 'Pinned' : 'Pin') + '</button>' +
            '<button type="button" class="del-btn" data-act="del" title="Remove">×</button>' +
          '</div></div>' +
        (p.note ? '<div class="proxy-item-note">' + escapeHtml(p.note) + '</div>' : '') +
        '<div class="proxy-item-meta">' +
          '<span>ping ' + ping + '</span>' +
          '<span>↑ ' + formatBytes(p.bytesOut || 0) + '</span>' +
          '<span>↓ ' + formatBytes(p.bytesIn || 0) + '</span>' +
        '</div></div>';
    }).join('');

    list.querySelectorAll('.proxy-item').forEach((row) => {
      const id = row.dataset.id;
      row.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.act;
          const item = proxyState.items.find((x) => x.id === id);
          if (!item) return;
          if (act === 'use') {
            proxyState.activeId = proxyState.activeId === id ? null : id;
            saveProxyState();
            renderProxyList();
            updateProxyToolbar();
            if (proxyState.activeId) pingProxy(item, true);
            showToast(proxyState.activeId ? 'Proxy active' : 'Direct mode', 'success');
          } else if (act === 'pin') {
            item.pinned = !item.pinned;
            saveProxyState();
            renderProxyList();
          } else if (act === 'del') {
            proxyState.items = proxyState.items.filter((x) => x.id !== id);
            if (proxyState.activeId === id) proxyState.activeId = null;
            saveProxyState();
            renderProxyList();
            updateProxyToolbar();
            showToast('Proxy removed');
          }
        });
      });
    });
  }

  async function pingProxy(item, showToastOnFail) {
    if (!item || !item.url) return;
    const dot = $('#proxyStatusDot');
    if (dot && proxyState.activeId === item.id) {
      dot.classList.remove('ok', 'bad');
      dot.classList.add('pending');
    }
    const t0 = performance.now();
    try {
      const res = await fetch(apiBaseUrl() + '/api/proxy/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: item.url }),
      });
      const data = await res.json().catch(function () { return {}; });
      const ms = Math.round(performance.now() - t0);
      item.lastPingMs = ms;
      item.lastPingOk = !!(res.ok && data && data.ok !== false);
      item.lastPingAt = Date.now();
      if (data.proxy_stats) applyServerProxyStats(data.proxy_stats);
      saveProxyState();
      updateProxyToolbar();
      renderProxyList();
      if (!item.lastPingOk && showToastOnFail) {
        showToast(data.error || 'Proxy ping failed', 'error');
      }
    } catch (err) {
      item.lastPingMs = Math.round(performance.now() - t0);
      item.lastPingOk = false;
      item.lastPingAt = Date.now();
      saveProxyState();
      updateProxyToolbar();
      renderProxyList();
      if (showToastOnFail) showToast(String(err.message || err), 'error');
    }
  }

  function startProxyPingLoop() {
    if (proxyPingTimer) clearInterval(proxyPingTimer);
    proxyPingTimer = setInterval(function () {
      const panel = $('#proxyPanel');
      if (!panel || !panel.classList.contains('open')) return;
      const active = getActiveProxy();
      if (active) pingProxy(active, false);
    }, 15000);
  }

  function bindProxyUI() {
    const addBtn = $('#proxyAddBtn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        const url = (($('#proxyUrlInput') && $('#proxyUrlInput').value) || '').trim();
        const note = (($('#proxyNoteInput') && $('#proxyNoteInput').value) || '').trim();
        if (!url) { showToast('Enter proxy URL'); return; }
        if (proxyState.items.some(function (p) { return p.url === url; })) {
          showToast('Proxy already exists'); return;
        }
        const item = {
          id: 'p' + Date.now().toString(36),
          url: url, note: note, pinned: false,
          bytesIn: 0, bytesOut: 0,
          lastPingMs: null, lastPingOk: null, lastPingAt: null,
        };
        proxyState.items.push(item);
        saveProxyState();
        if ($('#proxyUrlInput')) $('#proxyUrlInput').value = '';
        if ($('#proxyNoteInput')) $('#proxyNoteInput').value = '';
        renderProxyList();
        showToast('Proxy added', 'success');
        pingProxy(item, false);
      });
    }
    const pingNow = $('#proxyPingNowBtn');
    if (pingNow) {
      pingNow.addEventListener('click', function () {
        const active = getActiveProxy();
        if (!active) { showToast('No active proxy'); return; }
        pingProxy(active, true);
      });
    }
  }

  function initProxy() {
    loadProxyState();
    bindProxyUI();
    updateProxyToolbar();
    startProxyPingLoop();
  }

  window.getActiveProxy = getActiveProxy;
  window.getActiveProxyUrl = getActiveProxyUrl;
  window.applyServerProxyStats = applyServerProxyStats;
  window.renderProxyList = renderProxyList;
  window.updateProxyToolbar = updateProxyToolbar;
  window.pingProxy = pingProxy;
  window.loadProxyState = loadProxyState;
  window.startProxyPingLoop = startProxyPingLoop;
  window.bindProxyUI = bindProxyUI;
  window.initProxy = initProxy;
  if (!window.apiBaseUrl) window.apiBaseUrl = apiBaseUrl;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProxy);
  } else {
    setTimeout(initProxy, 0);
  }
})();
