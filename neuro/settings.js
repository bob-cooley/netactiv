// neuro / settings - simple control panel for the /neuro test space.
// Loaded only by neuro/index.html; the homepage background never sees it.
// Talks to the engine through window.__neuro (see neuro.js).
// The earlier retro-futuristic version is archived in settings-retro.js.

import { initCursors } from './cursors.js?v=1';

function whenReady(cb) {
  if (window.__neuro && window.__neuro.setStructure) return cb(window.__neuro);
  setTimeout(() => whenReady(cb), 50);
}

// 0-100 slider -> multiplier, with 50 = 1x (the original network)
const span = (v, lo, hi) => (v <= 50 ? lo + (1 - lo) * (v / 50) : 1 + (hi - 1) * ((v - 50) / 50));

whenReady((api) => {
  injectStyles();
  api.enableInteraction(); // tap to fire, focus follows pointer (/neuro only)
  const canvas = document.getElementById('neuro');
  const base = api.defaults;
  const mobile = api.isMobile;

  const DISPLAY = [
    { id: 'speed', label: 'Speed', def: 50, apply: (v) => api.setSpeed(base.speed * v / 50) },
    { id: 'color', label: 'Color intensity', def: 50, apply: (v) => api.setSaturation(v / 50) },
    {
      id: 'opacity', label: 'Opacity', def: 100,
      apply: (v) => { canvas.style.transition = 'opacity 0.12s linear'; canvas.style.opacity = String(v / 100); },
    },
    { id: 'intensity', label: 'Intensity', def: 50, apply: (v) => api.setGain(v / 50) },
  ];

  // structural sliders regenerate geometry, so they apply after a short pause
  const struct = { density: 50, thickness: 50, branching: 50 };
  let rebuildT = 0;
  const queueRebuild = () => {
    clearTimeout(rebuildT);
    rebuildT = setTimeout(() => api.setStructure({
      density: span(struct.density, 0.2, mobile ? 1.5 : 2.0),
      thickness: span(struct.thickness, 0.35, 2.2),
      branching: span(struct.branching, 0.3, mobile ? 1.35 : 1.6),
    }), 300);
  };
  const STRUCTURE = [
    { id: 'density', label: 'Density', def: 50, apply: (v) => { struct.density = v; queueRebuild(); } },
    { id: 'thickness', label: 'Thickness', def: 50, apply: (v) => { struct.thickness = v; queueRebuild(); } },
    { id: 'connections', label: 'Connections', def: 50, apply: (v) => api.setConnections(span(v, 0.34, 2.67)) },
    { id: 'branching', label: 'Branching', def: 50, apply: (v) => { struct.branching = v; queueRebuild(); } },
  ];

  const MOODS = ['Excited', 'Sad', 'Depressed', 'Relieved', 'Aroused', 'Video game (dopamine hits)'];
  const ALTERED = ['Drunk (alcohol)', 'High (THC)', 'Rolling (MDMA)', 'Amphetamines', 'Coffee (caffeine)'];

  // ── Gear ──────────────────────────────────────────────────────────────────
  const gear = el('button', { class: 'ns-gear', type: 'button', 'aria-label': 'Settings', 'aria-expanded': 'false' });
  gear.innerHTML = gearSvg();
  document.body.appendChild(gear);

  // ── Panel ─────────────────────────────────────────────────────────────────
  const panel = el('div', { class: 'ns-panel', role: 'dialog', 'aria-label': 'Neuro settings', hidden: '' });
  panel.innerHTML = `
    <header class="ns-head">
      <div class="ns-title">neuro <b>/</b> settings</div>
      <div class="ns-tele">fps <em data-fps>--</em> &middot; nodes <em data-nodes>--</em> &middot; links <em data-links>--</em></div>
      <button class="ns-btn" type="button" data-act="reset">reset</button>
      <button class="ns-close" type="button" aria-label="Close settings">&times;</button>
    </header>

    <div class="ns-seed">
      <label class="ns-label" for="ns-seed">seed</label>
      <input id="ns-seed" class="ns-seed-in" data-seed inputmode="numeric" maxlength="9" spellcheck="false">
      <button class="ns-btn" type="button" data-act="load">load</button>
      <button class="ns-btn" type="button" data-act="random">random</button>
      <button class="ns-btn" type="button" data-act="copy">copy link</button>
      <span class="ns-note" data-seed-msg></span>
    </div>

    <div class="ns-cols">
      <section><h3>display</h3><div data-group="display"></div></section>
      <section><h3>structure <span class="ns-note">rebuilds the network</span></h3><div data-group="structure"></div></section>
    </div>

    <div class="ns-states">
      <label class="ns-sel"><span class="ns-label">mood</span>
        <select data-state="mood"><option value="">baseline</option>${MOODS.map((m) => `<option>${m}</option>`).join('')}</select>
      </label>
      <label class="ns-sel"><span class="ns-label">altered state</span>
        <select data-state="altered"><option value="">baseline</option>${ALTERED.map((m) => `<option>${m}</option>`).join('')}</select>
      </label>
      <label class="ns-sel"><span class="ns-label">cursor</span>
        <select data-cursor></select>
      </label>
      <span class="ns-note ns-standby" data-state-msg>profiles not yet calibrated</span>
    </div>

    <div class="ns-foot ns-note">tap or click the network to fire a neuron &middot; double-click a slider to reset it &middot; esc closes</div>
  `;
  document.body.appendChild(panel);
  initCursors(panel.querySelector('[data-cursor]'), canvas);

  const sliders = [
    ...DISPLAY.map((d) => makeSlider(d, panel.querySelector('[data-group="display"]'))),
    ...STRUCTURE.map((d) => makeSlider(d, panel.querySelector('[data-group="structure"]'))),
  ];

  // ── Seed ──────────────────────────────────────────────────────────────────
  const seedIn = panel.querySelector('[data-seed]');
  const seedMsg = panel.querySelector('[data-seed-msg]');
  const showSeed = () => { seedIn.value = String(api.getSeed()); };
  showSeed();
  function loadSeed(n) {
    const s = api.reseed(n);
    showSeed();
    const u = new URL(location.href);
    u.searchParams.set('seed', String(s));
    u.searchParams.delete('z');
    history.replaceState(null, '', u);
    note(seedMsg, 'loaded');
  }
  seedIn.addEventListener('input', () => { seedIn.value = seedIn.value.replace(/\D/g, '').slice(0, 9); });
  seedIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadSeed(parseInt(seedIn.value || '0', 10)); });
  panel.querySelector('[data-act="load"]').addEventListener('click', () => loadSeed(parseInt(seedIn.value || '0', 10)));
  panel.querySelector('[data-act="random"]').addEventListener('click', () => loadSeed((Math.random() * 1e9) | 0));
  panel.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    const u = new URL(location.href);
    u.searchParams.set('seed', String(api.getSeed()));
    try { await navigator.clipboard.writeText(u.toString()); note(seedMsg, 'link copied'); }
    catch { note(seedMsg, 'copy failed'); }
  });

  // ── States (placeholders) ─────────────────────────────────────────────────
  const stateMsg = panel.querySelector('[data-state-msg]');
  panel.querySelectorAll('[data-state]').forEach((sel) => sel.addEventListener('change', () => {
    const mood = panel.querySelector('[data-state="mood"]').value;
    const altered = panel.querySelector('[data-state="altered"]').value;
    const picked = [mood, altered].filter(Boolean).join(' + ');
    stateMsg.textContent = picked ? `${picked.toLowerCase()}: not yet calibrated` : 'profiles not yet calibrated';
    window.dispatchEvent(new CustomEvent('neuro:state', { detail: { mood, altered } }));
  }));

  // ── Reset / open / close ──────────────────────────────────────────────────
  panel.querySelector('[data-act="reset"]').addEventListener('click', () => sliders.forEach((s) => s.reset()));
  let tele = 0;
  function open(on) {
    panel.hidden = !on;
    gear.setAttribute('aria-expanded', String(on));
    gear.classList.toggle('on', on);
    clearInterval(tele);
    if (on) { showSeed(); telemetry(); tele = setInterval(telemetry, 500); }
  }
  function telemetry() {
    const st = api.stats();
    panel.querySelector('[data-fps]').textContent = String(Math.round(api.getFps()));
    panel.querySelector('[data-nodes]').textContent = String(st.neurons);
    panel.querySelector('[data-links]').textContent = String(st.junctions);
  }
  gear.addEventListener('click', () => open(panel.hidden));
  panel.querySelector('.ns-close').addEventListener('click', () => open(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) open(false); });

  // ─────────────────────────────────────────────────────────────────────────
  function makeSlider(d, parent) {
    const row = el('div', { class: 'ns-row' });
    row.innerHTML = `
      <label class="ns-label" for="ns-${d.id}">${d.label}</label>
      <input id="ns-${d.id}" type="range" min="0" max="100" step="1" value="${d.def}">
      <output class="ns-val">${d.def}%</output>`;
    const input = row.querySelector('input');
    const out = row.querySelector('output');
    const paint = () => {
      input.style.setProperty('--p', `${input.value}%`);
      out.textContent = `${input.value}%`;
    };
    input.addEventListener('input', () => { paint(); d.apply(+input.value); });
    input.addEventListener('dblclick', () => { input.value = d.def; paint(); d.apply(d.def); });
    paint();
    parent.appendChild(row);
    return {
      reset() {
        const changed = +input.value !== d.def;
        input.value = d.def;
        paint();
        if (changed) d.apply(d.def);
      },
    };
  }
});

// ── helpers ─────────────────────────────────────────────────────────────────
function el(tag, attrs = {}) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function note(node, msg) {
  node.textContent = msg;
  clearTimeout(node._t);
  node._t = setTimeout(() => { node.textContent = ''; }, 2400);
}
function gearSvg() {
  let teeth = '';
  for (let i = 0; i < 10; i++) teeth += `<rect x="21.5" y="3" width="5" height="9" rx="1" transform="rotate(${i * 36} 24 24)"/>`;
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><g class="ns-gear-rot">${teeth}<circle cx="24" cy="24" r="13.5"/></g><circle class="ns-gear-hole" cx="24" cy="24" r="5.5"/></svg>`;
}

// ── Styles ──────────────────────────────────────────────────────────────────
function injectStyles() {
  const css = `
  :root {
    --ns-mag: rgb(220,30,130);
    --ns-mag-dim: rgba(220,30,130,0.45);
    --ns-teal: #00c8e0;
    --ns-text: #e8e8ec;
    --ns-muted: #a0a0ae;
    --ns-ui: 'Century Gothic Pro', 'Century Gothic', 'Futura', sans-serif;
    --ns-mono: 'Space Mono', ui-monospace, Menlo, monospace;
  }
  .ns-gear {
    position: fixed; top: 18px; right: 18px; z-index: 40;
    width: 44px; height: 44px; padding: 6px; border-radius: 50%;
    background: rgba(7,7,7,0.25); border: 1px solid var(--ns-mag-dim); cursor: pointer;
    transition: border-color .2s, background .2s;
  }
  .ns-gear svg { width: 100%; height: 100%; display: block; }
  .ns-gear-rot { stroke: var(--ns-mag); stroke-width: 1.6; fill: rgba(7,7,7,0.85); transform-origin: 24px 24px; transition: transform .6s ease; }
  .ns-gear-hole { fill: none; stroke: var(--ns-mag); stroke-width: 1.6; }
  .ns-gear:hover .ns-gear-rot, .ns-gear.on .ns-gear-rot { transform: rotate(72deg); }
  .ns-gear:hover, .ns-gear.on { border-color: var(--ns-mag); background: rgba(220,30,130,0.10); }

  .ns-panel {
    position: fixed; z-index: 35; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(720px, calc(100vw - 24px)); max-height: calc(100vh - 80px);
    overflow-x: hidden; overflow-y: auto; scrollbar-width: none;
    padding: 18px 22px 14px;
    background: rgba(7,7,7,0.15);           /* 85% transparent */
    border: 1px solid var(--ns-mag-dim);
    color: var(--ns-text); font-family: var(--ns-ui); font-size: 14px;
    text-shadow: 0 0 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.95);
  }
  .ns-panel::-webkit-scrollbar { display: none; }
  .ns-panel[hidden] { display: none; }

  .ns-head { display: flex; align-items: center; gap: 14px; padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid rgba(220,30,130,0.2); }
  .ns-title { font-size: 16px; letter-spacing: .24em; text-transform: lowercase; }
  .ns-title b { color: var(--ns-mag); font-weight: 400; }
  .ns-tele { margin-left: auto; font-family: var(--ns-mono); font-size: 12px; color: var(--ns-muted); }
  .ns-tele em { font-style: normal; color: var(--ns-teal); }
  .ns-close {
    width: 30px; height: 30px; background: rgba(7,7,7,0.3); border: 1px solid var(--ns-mag-dim);
    color: var(--ns-mag); font-size: 20px; line-height: 1; cursor: pointer;
  }
  .ns-close:hover { border-color: var(--ns-mag); color: #fff; }
  .ns-btn {
    font-family: var(--ns-ui); font-size: 13px; letter-spacing: .12em; text-transform: lowercase;
    color: var(--ns-text); background: rgba(7,7,7,0.35); border: 1px solid var(--ns-mag-dim);
    padding: 6px 12px; cursor: pointer;
  }
  .ns-btn:hover { border-color: var(--ns-mag); color: #fff; background: rgba(220,30,130,0.14); }

  .ns-label { font-size: 13px; letter-spacing: .1em; text-transform: lowercase; color: var(--ns-muted); }
  .ns-note { font-family: var(--ns-mono); font-size: 12px; color: var(--ns-muted); letter-spacing: 0; text-transform: none; }

  .ns-seed { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px; }
  .ns-seed-in {
    font-family: var(--ns-mono); font-size: 18px; letter-spacing: .12em; color: var(--ns-teal);
    background: rgba(0,0,0,0.35); border: 1px solid rgba(0,200,224,0.4); padding: 4px 10px; width: 12ch; outline: none;
  }
  .ns-seed-in:focus { border-color: var(--ns-teal); }

  .ns-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 28px; margin-bottom: 14px; }
  .ns-cols h3 {
    font-weight: 400; font-size: 13px; letter-spacing: .22em; text-transform: lowercase; color: var(--ns-mag);
    margin-bottom: 8px; display: flex; align-items: baseline; gap: 10px;
  }
  .ns-row { display: grid; grid-template-columns: 112px 1fr 46px; align-items: center; gap: 10px; padding: 6px 0; }
  .ns-val { font-family: var(--ns-mono); font-size: 14px; color: var(--ns-teal); text-align: right; }

  .ns-row input[type=range] {
    -webkit-appearance: none; appearance: none; width: 100%; height: 18px; background: transparent; cursor: pointer; margin: 0;
  }
  .ns-row input[type=range]::-webkit-slider-runnable-track {
    height: 3px; background: linear-gradient(to right, var(--ns-teal) var(--p), rgba(255,255,255,0.18) var(--p));
  }
  .ns-row input[type=range]::-moz-range-track { height: 3px; background: rgba(255,255,255,0.18); }
  .ns-row input[type=range]::-moz-range-progress { height: 3px; background: var(--ns-teal); }
  .ns-row input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5.5px; border-radius: 50%;
    background: #0b0b0f; border: 2px solid var(--ns-mag); box-shadow: 0 0 6px rgba(220,30,130,0.6);
  }
  .ns-row input[type=range]::-moz-range-thumb {
    width: 10px; height: 10px; border-radius: 50%; background: #0b0b0f; border: 2px solid var(--ns-mag);
  }
  .ns-row input[type=range]:focus-visible { outline: 1px solid var(--ns-teal); outline-offset: 2px; }

  .ns-states { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px 16px; padding-top: 12px; border-top: 1px solid rgba(220,30,130,0.2); }
  .ns-sel { display: flex; flex-direction: column; gap: 5px; }
  .ns-sel select {
    font-family: var(--ns-mono); font-size: 13px; color: var(--ns-text);
    background: rgba(0,0,0,0.4); border: 1px solid var(--ns-mag-dim); padding: 6px 8px; min-width: 190px; cursor: pointer;
  }
  .ns-sel select:focus { outline: none; border-color: var(--ns-teal); }
  .ns-sel option { background: #0b0b0f; }
  .ns-standby { flex-basis: 100%; color: #ffae5c; }
  .ns-foot { margin-top: 12px; }

  @media (max-width: 640px) {
    .ns-cols { grid-template-columns: 1fr; }
    .ns-tele { display: none; }
    .ns-row { grid-template-columns: 100px 1fr 46px; }
  }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
}
