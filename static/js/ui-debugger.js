/**
 * SQLlix UI Debugger — TEMPORARY
 * --------------------------------
 * Logs panel geometry / key UI state to the console so UI bugs can be reported.
 *
 * HOW TO REMOVE LATER:
 *   1. Delete this file: static/js/ui-debugger.js
 *   2. Remove the <script src="js/ui-debugger.js"></script> line from index.html
 *
 * Filter console by:  SQLlix:UI-DEBUG
 */
(function () {
  'use strict';

  const TAG = '[SQLlix:UI-DEBUG]';
  const ENABLED = true; // flip to false to silence without deleting
  if (!ENABLED) return;

  function rectInfo(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      id: el.id || null,
      className: String(el.className || '').slice(0, 120),
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
      bottom: Math.round(r.bottom),
      right: Math.round(r.right),
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      zIndex: cs.zIndex,
      position: cs.position,
      overflow: cs.overflow,
      transform: cs.transform === 'none' ? 'none' : cs.transform.slice(0, 60),
      topStyle: el.style.top || '',
      heightStyle: el.style.height || '',
    };
  }

  function logPanel(name, reason) {
    const sel =
      name === 'history' ? '#historyPanel' :
      name === 'tools' ? '#toolsPanel' :
      name === 'payload' ? '#payloadWorkbench' :
      name === 'settings' ? '#settingsPanel' :
      name === 'adv-filter' ? '#advFilterPanel' :
      `[data-panel="${name}"]`;

    const panel = document.querySelector(sel);
    const topBar = document.querySelector('.top-bar');
    const header = panel && panel.querySelector('.vpanel-header');
    const actions = panel && panel.querySelector('.vpanel-header-actions');
    const backdrop = document.querySelector('#vpanelBackdrop');
    const topBarR = topBar ? topBar.getBoundingClientRect() : null;
    const headerR = header ? header.getBoundingClientRect() : null;

    const payload = {
      reason,
      panelName: name,
      time: new Date().toISOString(),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      bodyClass: document.body.className,
      cssTopbarH: getComputedStyle(document.documentElement).getPropertyValue('--topbar-h').trim(),
      topBar: rectInfo(topBar),
      panel: rectInfo(panel),
      header: rectInfo(header),
      headerActions: rectInfo(actions),
      backdrop: rectInfo(backdrop),
      headerCoveredByTopBar: !!(topBarR && headerR && headerR.top < topBarR.bottom - 1),
      headerButtons: actions
        ? [...actions.querySelectorAll('button')].map((b) => ({
            id: b.id || '',
            text: (b.textContent || '').trim().slice(0, 24),
            visible: getComputedStyle(b).display !== 'none' && b.offsetParent !== null,
            rect: (() => {
              const r = b.getBoundingClientRect();
              return { top: Math.round(r.top), h: Math.round(r.height) };
            })(),
          }))
        : [],
      historyLen: (window.state && Array.isArray(window.state.history))
        ? window.state.history.length
        : (typeof state !== 'undefined' && state.history ? state.history.length : 'n/a'),
    };

    console.groupCollapsed(`${TAG} ${reason} · ${name}`);
    console.log(payload);
    console.groupEnd();
    return payload;
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      clearTimeout(t);
      const args = arguments;
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  function boot() {
    // Expose for manual calls: __sqlixUIDebug.logPanel('history','manual')
    window.__sqlixUIDebug = {
      logPanel,
      dumpAll: function () {
        ['history', 'tools', 'payload', 'settings'].forEach((n) => logPanel(n, 'dumpAll'));
      },
    };

    document.addEventListener(
      'click',
      (e) => {
        const nav = e.target.closest && e.target.closest('.nav-tool[data-panel]');
        if (nav) {
          const name = nav.dataset.panel;
          setTimeout(() => logPanel(name, 'nav-click'), 40);
          setTimeout(() => logPanel(name, 'nav-click+280ms'), 280);
        }
        const pop = e.target.closest && e.target.closest(
          '#historyPopoutBtn, #payloadPopoutBtn, #settingsPopoutBtn, #toolsPopoutBtn'
        );
        if (pop) {
          console.log(TAG, 'popout-click', pop.id);
        }
        const pin = e.target.closest && e.target.closest(
          '#historyPinBtn, #payloadPinBtn, #toolsPinBtn, #settingsPinBtn'
        );
        if (pin) {
          const panel = pin.closest('.vpanel');
          setTimeout(
            () => logPanel((panel && panel.dataset.panel) || 'unknown', 'pin-toggle'),
            80
          );
        }
      },
      true
    );

    const observe = debounce((el) => {
      const name = (el && el.dataset && el.dataset.panel) || el.id || 'panel';
      logPanel(name, 'attr-change');
    }, 120);

    ['#historyPanel', '#toolsPanel', '#payloadWorkbench', '#settingsPanel'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const mo = new MutationObserver(() => observe(el));
      mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    });

    window.addEventListener('resize', debounce(() => {
      console.log(TAG, 'resize', {
        viewport: { w: innerWidth, h: innerHeight },
        topbarH: getComputedStyle(document.documentElement).getPropertyValue('--topbar-h').trim(),
      });
    }, 200));

    console.log(
      TAG,
      'enabled. Open History/Tools and copy console groups tagged',
      TAG,
      '— remove via deleting js/ui-debugger.js + its <script> tag.'
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 150));
  } else {
    setTimeout(boot, 150);
  }
})();
