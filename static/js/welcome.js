/**
 * SQLlix — Welcome screen interactions (Rendered empty state)
 * Loaded after app.js so openVPanel / $ are available.
 */
(function bindWelcome() {
  const $ = window.$ || ((s) => document.querySelector(s));
  const root = document.getElementById('renderedPlaceholder');
  if (!root) return;
  const spot = root.querySelector('#wMinSpot');
  const auroras = [...root.querySelectorAll('.w-aurora')];

  const setLocalXY = (el, e) => {
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / Math.max(1, r.width)) * 100;
    const y = ((e.clientY - r.top) / Math.max(1, r.height)) * 100;
    el.style.setProperty('--mx', x.toFixed(2) + '%');
    el.style.setProperty('--my', y.toFixed(2) + '%');
  };

  root.addEventListener('mousemove', (e) => {
    const r = root.getBoundingClientRect();
    const nx = (e.clientX - r.left) / Math.max(1, r.width);
    const ny = (e.clientY - r.top) / Math.max(1, r.height);
    root.classList.add('is-hot');
    if (spot) {
      spot.style.left = (nx * 100).toFixed(2) + '%';
      spot.style.top = (ny * 100).toFixed(2) + '%';
    }
    auroras.forEach((a, i) => {
      const strength = 16 + i * 12;
      a.style.transform = `translate(${((nx - 0.5) * strength).toFixed(1)}px, ${((ny - 0.5) * strength).toFixed(1)}px)`;
    });
  });
  root.addEventListener('mouseleave', () => {
    root.classList.remove('is-hot');
    auroras.forEach((a) => { a.style.transform = ''; });
  });

  root.querySelectorAll('.w-btn-primary, .w-btn-secondary, .w-card').forEach((el) => {
    el.addEventListener('mousemove', (e) => setLocalXY(el, e));
  });

  root.querySelectorAll('.w-card').forEach((card) => {
    card.addEventListener('mouseenter', (e) => {
      card.querySelectorAll('.w-spark').forEach((s) => s.remove());
      const r = card.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const colors = ['#ff4d9a', '#c084ff', '#ff7ac8', '#a78bfa'];
      for (let i = 0; i < 4; i++) {
        const sp = document.createElement('span');
        sp.className = 'w-spark';
        const ang = (-40 + i * 35) * Math.PI / 180;
        const dist = 18 + i * 8;
        sp.style.left = x + 'px';
        sp.style.top = y + 'px';
        sp.style.setProperty('--sx', (Math.cos(ang) * dist).toFixed(1) + 'px');
        sp.style.setProperty('--sy', (Math.sin(ang) * dist).toFixed(1) + 'px');
        sp.style.color = colors[i];
        sp.style.background = colors[i];
        sp.style.animationDelay = (i * 0.07) + 's';
        card.appendChild(sp);
      }
      card.classList.add('is-orbiting');
    });
    card.addEventListener('mouseleave', () => {
      card.classList.remove('is-orbiting');
      card.querySelectorAll('.w-spark').forEach((s) => s.remove());
    });
  });

  root.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', () => {
      const name = el.dataset.open;
      if (name && typeof window.openVPanel === 'function') window.openVPanel(name);
      else if (name && typeof openVPanel === 'function') openVPanel(name);
    });
  });
})();
