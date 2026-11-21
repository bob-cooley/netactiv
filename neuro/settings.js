// neuro / settings - simple control panel for the /neuro test space.
// Loaded only by neuro/index.html; the homepage background never sees it.
// Talks to the engine through window.__neuro (see neuro.js).
// The earlier retro-futuristic version is archived in settings-retro.js.

import { initCursors } from './cursors.js?v=3';
import { initStates, isCalibrated, paramSpec } from './states.js?v=9';
import { CITATIONS } from './citations.js?v=1';

function whenReady(cb) {
  if (window.__neuro && window.__neuro.setStructure) return cb(window.__neuro);
  setTimeout(() => whenReady(cb), 50);
}

// 0-100 slider -> multiplier, with 50 = 1x (the original network)
const span = (v, lo, hi) => (v <= 50 ? lo + (1 - lo) * (v / 50) : 1 + (hi - 1) * ((v - 50) / 50));

whenReady((api) => {
  injectStyles();
  api.enableInteraction(); // tap to fire, focus follows pointer (/neuro only)
  const states = initStates(api);
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
  const NEURO = ['Autism', 'ADHD', 'Bipolar', 'Mania', 'Schizophrenia', "Tourette's"];

  // ── Gear ──────────────────────────────────────────────────────────────────
  const gear = el('button', { class: 'ns-gear', type: 'button', 'aria-label': 'Settings', 'aria-expanded': 'false' });
  gear.innerHTML = gearSvg();
  document.body.appendChild(gear);

  // ── Info ──────────────────────────────────────────────────────────────────
  const infoBtn = el('button', { class: 'ns-gear ns-info-btn', type: 'button', 'aria-label': 'About this visualization', 'aria-expanded': 'false' });
  infoBtn.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17" class="ns-info-ring"/><circle cx="24" cy="15.5" r="2.3" class="ns-info-dot"/><path d="M24 21.5v13" class="ns-info-stem"/></svg>';
  document.body.appendChild(infoBtn);
  const info = el('div', { class: 'ns-panel ns-info', role: 'dialog', 'aria-label': 'About this visualization', hidden: '' });
  info.innerHTML = `
    <header class="ns-head">
      <div class="ns-title">neuro <b>/</b> about</div>
      <button class="ns-close" type="button" aria-label="Close" style="margin-left:auto">&times;</button>
    </header>
    <div class="ns-info-body">
      <p>Though this neuro-visualization is interpreted cinematically, the construction, actions, patterns and triggers are all based in published scientific research. Much of it is well established; some, particularly for moods and neurodivergence, reflects group-level findings that are still being studied, and individual experience varies widely. Combinations of states are theoretical. That said, it is a <i>simulation</i>, intended to give some insight into brain activity in different states.</p>
      <p>It is born of scientific study, but the tool is more sci-“inspired” than absolute.</p>
      <p class="ns-cite-link"><a href="#" data-act="cites" aria-expanded="false">citations <span aria-hidden="true">&rarr;</span></a></p>
    </div>`;
  document.body.appendChild(info);

  // citations: slides in beside the about panel, unrolling downward
  const cites = el('div', { class: 'ns-panel ns-cites', role: 'region', 'aria-label': 'Citations', hidden: '' });
  cites.innerHTML = `
    <header class="ns-head">
      <div class="ns-title">neuro <b>/</b> citations</div>
      <button class="ns-close" type="button" aria-label="Close citations" style="margin-left:auto">&times;</button>
    </header>
    <div class="ns-cites-body">
      ${CITATIONS.map((g) => `
        <section>
          <h4>${g.group}</h4>
          <ul>${g.items.map((c) => `<li><a href="${c.url}" target="_blank" rel="noopener">${c.text}</a></li>`).join('')}</ul>
        </section>`).join('')}
    </div>`;
  document.body.appendChild(cites);

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
      <div class="ns-sel"><label class="ns-label" for="ns-mood">mood</label>
        <select id="ns-mood" data-state="mood"><option value="">baseline</option>${MOODS.map((m) => `<option>${m}</option>`).join('')}</select>
        <div class="ns-sub"><input type="range" class="ns-range" data-param="mood" aria-label="Mood parameter"><output class="ns-subval">-</output></div>
      </div>
      <div class="ns-sel"><label class="ns-label" for="ns-altered">altered state</label>
        <select id="ns-altered" data-state="altered"><option value="">baseline</option>${ALTERED.map((m) => `<option>${m}</option>`).join('')}</select>
        <div class="ns-sub"><input type="range" class="ns-range" data-param="altered" aria-label="Altered state parameter"><output class="ns-subval">-</output></div>
      </div>
      <div class="ns-sel"><label class="ns-label" for="ns-neuro">neurodivergence</label>
        <select id="ns-neuro" data-state="neuro"><option value="">baseline</option>${NEURO.map((m) => `<option>${m}</option>`).join('')}</select>
        <div class="ns-sub"><input type="range" class="ns-range" data-param="neuro" aria-label="Neurodivergence parameter"><output class="ns-subval">-</output></div>
      </div>
      <div class="ns-sel"><label class="ns-label" for="ns-cursor">cursor</label>
        <select id="ns-cursor" data-cursor></select>
        <div class="ns-sub"><input type="range" class="ns-range" data-cursor-alpha min="0" max="100" step="1" aria-label="Cursor opacity"><output class="ns-subval"></output></div>
      </div>
      <span class="ns-note ns-standby" data-state-msg>baseline</span>
      <span class="ns-note ns-stacknote" data-stack-note hidden>combined states are a theoretical extrapolation: each state is grounded in findings, but how they interact has not been studied</span>
    </div>

    <div class="ns-foot ns-note">tap or click the network to fire a neuron &middot; double-click a slider to reset it &middot; esc closes</div>
  `;
  document.body.appendChild(panel);
  const cursor = initCursors(panel.querySelector('[data-cursor]'), canvas);
  {
    const r = panel.querySelector('[data-cursor-alpha]');
    const out = r.nextElementSibling;
    const paint = () => { r.style.setProperty('--p', `${r.value}%`); out.textContent = `${r.value}%`; };
    r.value = Math.round(cursor.getOpacity() * 100);
    paint();
    r.addEventListener('input', () => { paint(); cursor.setOpacity(r.value / 100); });
    r.addEventListener('dblclick', () => { r.value = 100; paint(); cursor.setOpacity(1); });
  }

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
  const stackNote = panel.querySelector('[data-stack-note]');
  function syncParam(slot) {
    const name = panel.querySelector(`[data-state="${slot}"]`).value;
    const r = panel.querySelector(`[data-param="${slot}"]`);
    const out = r.nextElementSibling;
    const spec = paramSpec(name);
    r.disabled = !spec;
    r.closest('.ns-sub').classList.toggle('off', !spec);
    if (!spec) { r.min = 0; r.max = 100; r.value = 0; r.style.setProperty('--p', '0%'); out.textContent = name ? 'n/a' : '-'; return; }
    r.min = spec.min; r.max = spec.max; r.step = spec.step;
    r.value = states.getParam(name);
    const paintP = () => {
      r.style.setProperty('--p', `${((r.value - spec.min) / (spec.max - spec.min)) * 100}%`);
      out.textContent = spec.label(+r.value);
    };
    paintP();
    r.oninput = () => { paintP(); states.setParam(name, +r.value); };
    r.ondblclick = () => { r.value = spec.def; paintP(); states.setParam(name, spec.def); };
  }
  syncParam('mood');
  syncParam('altered');
  syncParam('neuro');
  panel.querySelectorAll('[data-state]').forEach((sel) => sel.addEventListener('change', () => {
    syncParam(sel.dataset.state);
    const mood = panel.querySelector('[data-state="mood"]').value;
    const altered = panel.querySelector('[data-state="altered"]').value;
    const neuro = panel.querySelector('[data-state="neuro"]').value;
    // layer order: neurodivergence (base), then mood, then altered state
    const ordered = [neuro, mood, altered];
    const live = ordered.filter((n) => n && isCalibrated(n));
    const pending = ordered.filter((n) => n && !isCalibrated(n));
    const parts = [];
    if (live.length) parts.push(`${live.join(' + ').toLowerCase()}: active`);
    if (pending.length) parts.push(`${pending.join(' + ').toLowerCase()}: not yet calibrated`);
    stateMsg.textContent = parts.length ? parts.join(' / ') : 'baseline';
    stateMsg.classList.toggle('live', live.length > 0);
    stackNote.hidden = live.length < 2;
    window.dispatchEvent(new CustomEvent('neuro:state', { detail: { mood, altered, neuro } }));
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
  gear.addEventListener('click', () => { showInfo(false); open(panel.hidden); });
  const citeLink = info.querySelector('[data-act="cites"]');
  let citeT = 0;
  function showCites(on) {
    clearTimeout(citeT);
    citeLink.setAttribute('aria-expanded', String(on));
    info.classList.toggle('shifted', on);
    if (on) {
      // top-align with the about panel (it only moves sideways)
      cites.style.setProperty('--top', `${Math.max(16, info.getBoundingClientRect().top)}px`);
      cites.hidden = false;
      cites.querySelector('.ns-cites-body').scrollTop = 0;
      void cites.offsetWidth;          // let the closed state paint, then unroll
      cites.classList.add('open');
    } else {
      cites.classList.remove('open');
      citeT = setTimeout(() => { cites.hidden = true; }, 600);
    }
  }
  citeLink.addEventListener('click', (e) => { e.preventDefault(); showCites(!cites.classList.contains('open')); });
  cites.querySelector('.ns-close').addEventListener('click', () => showCites(false));
  function showInfo(on) {
    info.hidden = !on;
    infoBtn.setAttribute('aria-expanded', String(on));
    infoBtn.classList.toggle('on', on);
    if (!on) { showCites(false); cites.hidden = true; info.classList.remove('shifted'); }
  }
  infoBtn.addEventListener('click', () => { const on = info.hidden; if (on) open(false); showInfo(on); });
  info.querySelector('.ns-close').addEventListener('click', () => showInfo(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !info.hidden) showInfo(false); });
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
    --ns-mag: rgb(158,78,116);
    --ns-mag-dim: rgba(158,78,116,0.45);
    --ns-teal: #5aaebb;
    --ns-text: #d4d4da;
    --ns-muted: #9a9aa6;
    --ns-ui: 'Century Gothic Pro', 'Century Gothic', 'Futura', sans-serif;
    --ns-mono: 'Space Mono', ui-monospace, Menlo, monospace;
  }
  .ns-gear {
    --ns-icon: rgba(255,255,255,0.88);
    position: fixed; top: 18px; right: 18px; z-index: 40;
    width: 44px; height: 44px; padding: 6px; border-radius: 50%;
    background: rgba(7,7,7,0.25); border: 1px solid rgba(255,255,255,0.4); cursor: pointer;
    transition: border-color .2s, background .2s;
  }
  .ns-gear svg { width: 100%; height: 100%; display: block; }
  .ns-gear-rot { stroke: var(--ns-icon); stroke-width: 1.6; fill: rgba(7,7,7,0.85); transform-origin: 24px 24px; transition: transform .6s ease; }
  .ns-gear-hole { fill: none; stroke: var(--ns-icon); stroke-width: 1.6; }
  .ns-gear:hover .ns-gear-rot, .ns-gear.on .ns-gear-rot { transform: rotate(72deg); }
  .ns-info-btn { right: 72px; }
  .ns-info-ring, .ns-info-stem { fill: none; stroke: var(--ns-icon); stroke-width: 2.4; stroke-linecap: round; }
  .ns-info-dot { fill: var(--ns-icon); }
  .ns-panel.ns-info { width: min(600px, calc(100vw - 24px)); }
  .ns-info-body p { font-size: 15px; line-height: 1.65; letter-spacing: .02em; color: var(--ns-text); margin: 0 0 12px; }
  .ns-info-body p:last-child { margin-bottom: 2px; }
  .ns-info-body i { color: var(--ns-teal); font-style: italic; }
  .ns-cite-link { margin-top: 4px !important; }
  .ns-cite-link a { font-family: var(--ns-ui); font-size: 13px; letter-spacing: .14em; text-transform: lowercase; color: var(--ns-teal); text-decoration: none; border-bottom: 1px solid rgba(90,174,187,0.4); padding-bottom: 1px; }
  .ns-cite-link a:hover, .ns-cite-link a[aria-expanded="true"] { color: #fff; border-color: #fff; }

  /* about + citations side by side: about slides left, citations unroll on the right */
  .ns-panel.ns-info { --iw: min(600px, 47vw); --cw: min(520px, 47vw); --gap: 18px; width: var(--iw); transition: transform .55s cubic-bezier(.2,.7,.2,1); }
  .ns-panel.ns-info.shifted { transform: translate(calc(-50% - (var(--cw) + var(--gap)) / 2), -50%); }
  .ns-panel.ns-cites {
    --iw: min(600px, 47vw); --cw: min(520px, 47vw); --gap: 18px;
    /* the pair (about + gap + citations) is centred; citations start right of about */
    width: var(--cw); left: calc(50% + (var(--iw) + var(--gap) - var(--cw)) / 2);
    top: var(--top, 15vh); transform: none;
    max-height: min(calc(100vh - var(--top, 15vh) - 24px), 640px); display: flex; flex-direction: column; overflow: hidden;
    clip-path: inset(0 0 100% 0); opacity: 0;
    transition: clip-path .6s cubic-bezier(.2,.7,.2,1) .18s, opacity .25s ease .18s;
  }
  .ns-panel.ns-cites.open { clip-path: inset(0 0 0 0); opacity: 1; }
  .ns-cites-body { overflow-y: auto; scrollbar-width: none; padding-right: 4px; }
  .ns-cites-body::-webkit-scrollbar { display: none; }
  .ns-cites-body h4 { font-weight: 400; font-size: 12px; letter-spacing: .22em; text-transform: lowercase; color: var(--ns-mag); margin: 12px 0 6px; }
  .ns-cites-body section:first-child h4 { margin-top: 0; }
  .ns-cites-body ul { list-style: none; margin: 0; padding: 0; }
  .ns-cites-body li { margin: 0 0 7px; font-size: 13px; line-height: 1.45; }
  .ns-cites-body a { color: var(--ns-text); text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.15); }
  .ns-cites-body a:hover { color: var(--ns-teal); border-color: var(--ns-teal); }
  .ns-panel.ns-cites.open .ns-cites-body section { animation: ns-drop .5s ease both; }
  ${Array.from({ length: 14 }, (_, i) => `.ns-panel.ns-cites.open .ns-cites-body section:nth-child(${i + 1}) { animation-delay: ${0.25 + i * 0.05}s; }`).join('\n  ')}
  @keyframes ns-drop { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
  @media (max-width: 760px) {
    .ns-panel.ns-info.shifted { transform: translate(-50%, -50%); opacity: 0; pointer-events: none; }
    .ns-panel.ns-info { --iw: calc(100vw - 24px); transition: transform .55s, opacity .3s; }
    .ns-panel.ns-cites { --cw: calc(100vw - 24px); left: 50%; transform: translateX(-50%); width: var(--cw); }
  }
  .ns-gear:hover, .ns-gear.on { border-color: rgba(255,255,255,0.75); background: rgba(255,255,255,0.08); }

  .ns-panel {
    position: fixed; z-index: 35; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(920px, calc(100vw - 24px)); max-height: calc(100vh - 80px);
    overflow-x: hidden; overflow-y: auto; scrollbar-width: none;
    padding: 18px 22px 14px;
    background: rgba(7,7,7,0.15);           /* 85% transparent */
    border: 1px solid var(--ns-mag-dim);
    color: var(--ns-text); font-family: var(--ns-ui); font-size: 14px;
    text-shadow: 0 0 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.95);
  }
  .ns-panel::-webkit-scrollbar { display: none; }
  .ns-panel[hidden] { display: none; }

  .ns-head { display: flex; align-items: center; gap: 14px; padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid rgba(158,78,116,0.2); }
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
  .ns-btn:hover { border-color: var(--ns-mag); color: #fff; background: rgba(158,78,116,0.14); }

  .ns-label { font-size: 13px; letter-spacing: .1em; text-transform: lowercase; color: var(--ns-muted); }
  .ns-note { font-family: var(--ns-mono); font-size: 12px; color: var(--ns-muted); letter-spacing: 0; text-transform: none; }

  .ns-seed { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px; }
  .ns-seed-in {
    font-family: var(--ns-mono); font-size: 18px; letter-spacing: .12em; color: var(--ns-teal);
    background: rgba(0,0,0,0.35); border: 1px solid rgba(90,174,187,0.4); padding: 4px 10px; width: 12ch; outline: none;
  }
  .ns-seed-in:focus { border-color: var(--ns-teal); }

  .ns-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 28px; margin-bottom: 14px; }
  .ns-cols h3 {
    font-weight: 400; font-size: 13px; letter-spacing: .22em; text-transform: lowercase; color: var(--ns-mag);
    margin-bottom: 8px; display: flex; align-items: baseline; gap: 10px;
  }
  .ns-row { display: grid; grid-template-columns: 112px 1fr 46px; align-items: center; gap: 10px; padding: 6px 0; }
  .ns-val { font-family: var(--ns-mono); font-size: 14px; color: var(--ns-teal); text-align: right; }

  .ns-row input[type=range], .ns-range {
    -webkit-appearance: none; appearance: none; width: 100%; height: 18px; background: transparent; cursor: pointer; margin: 0;
  }
  .ns-row input[type=range]::-webkit-slider-runnable-track, .ns-range::-webkit-slider-runnable-track {
    height: 3px; background: linear-gradient(to right, var(--ns-teal) var(--p), rgba(255,255,255,0.18) var(--p));
  }
  .ns-row input[type=range]::-moz-range-track, .ns-range::-moz-range-track { height: 3px; background: rgba(255,255,255,0.18); }
  .ns-row input[type=range]::-moz-range-progress, .ns-range::-moz-range-progress { height: 3px; background: var(--ns-teal); }
  .ns-row input[type=range]::-webkit-slider-thumb, .ns-range::-webkit-slider-thumb {
    -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5.5px; border-radius: 50%;
    background: #0b0b0f; border: 2px solid var(--ns-mag); box-shadow: 0 0 6px rgba(158,78,116,0.6);
  }
  .ns-row input[type=range]::-moz-range-thumb, .ns-range::-moz-range-thumb {
    width: 10px; height: 10px; border-radius: 50%; background: #0b0b0f; border: 2px solid var(--ns-mag);
  }
  .ns-row input[type=range]:focus-visible, .ns-range:focus-visible { outline: 1px solid var(--ns-teal); outline-offset: 2px; }

  .ns-states { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px 16px; padding-top: 12px; border-top: 1px solid rgba(158,78,116,0.2); }
  .ns-sel { display: flex; flex-direction: column; gap: 5px; flex: 1 1 0; min-width: 0; }
  .ns-sel select {
    font-family: var(--ns-mono); font-size: 13px; color: var(--ns-text);
    background: rgba(0,0,0,0.4); border: 1px solid var(--ns-mag-dim); padding: 6px 8px; width: 100%; min-width: 0; cursor: pointer;
  }
  .ns-sel select:focus { outline: none; border-color: var(--ns-teal); }
  .ns-sel option { background: #0b0b0f; }
  .ns-standby { flex-basis: 100%; color: #c9a06e; }
  .ns-sub { display: grid; grid-template-columns: minmax(0, 1fr) 84px; align-items: center; gap: 8px; margin-top: 4px; }
  .ns-sub.off { opacity: .35; }
  .ns-sub.off .ns-range { cursor: default; }
  .ns-subval { font-family: var(--ns-mono); font-size: 12px; color: var(--ns-teal); text-align: right; white-space: nowrap; }
  .ns-standby.live { color: var(--ns-teal); }
  .ns-stacknote { flex-basis: 100%; color: #c9a06e; font-style: italic; margin-top: -4px; }
  .ns-stacknote[hidden] { display: none; }
  .ns-foot { margin-top: 12px; }

  @media (max-width: 640px) {
    .ns-cols { grid-template-columns: 1fr; }
    .ns-tele { display: none; }
    .ns-row { grid-template-columns: 100px 1fr 46px; }
    .ns-sel { flex-basis: 100%; }
  }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
}
