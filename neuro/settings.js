// neuro / settings - control interface for the /neuro test space.
// Loaded only by neuro/index.html; the homepage background never sees it.
// Talks to the engine through window.__neuro (see neuro.js).

const NS = 'http://www.w3.org/2000/svg';

// ── Wait for the engine ─────────────────────────────────────────────────────
function whenReady(cb) {
  if (window.__neuro && window.__neuro.reseed) return cb(window.__neuro);
  setTimeout(() => whenReady(cb), 50);
}

whenReady((api) => {
  injectStyles();
  const canvas = document.getElementById('neuro');

  // ── Dial definitions: 0-100 %, default reflects the current state ─────────
  const base = api.defaults;
  const DIALS = [
    {
      id: 'speed', label: 'Speed', def: 50,
      apply: (v) => api.setSpeed(base.speed * v / 50),
      sub: (v) => `${(base.speed * v / 50).toFixed(2)} u/s`,
    },
    {
      id: 'color', label: 'Color intensity', def: 50,
      apply: (v) => api.setSaturation(v / 50),
      sub: (v) => `sat x${(v / 50).toFixed(2)}`,
    },
    {
      id: 'opacity', label: 'Opacity', def: 100,
      apply: (v) => {
        canvas.style.transition = 'opacity 0.12s linear';
        canvas.style.opacity = String(v / 100);
      },
      sub: (v) => `alpha ${(v / 100).toFixed(2)}`,
    },
    {
      id: 'intensity', label: 'Intensity', def: 50,
      apply: (v) => api.setGain(v / 50),
      sub: (v) => `gain x${(v / 50).toFixed(2)}`,
    },
  ];

  const MOODS = ['Excited', 'Sad', 'Depressed', 'Relieved', 'Aroused', 'Video game (dopamine hits)'];
  const ALTERED = ['Drunk (alcohol)', 'High (THC)', 'Rolling (MDMA)', 'Amphetamines', 'Coffee (caffeine)'];

  // ── Gear button ───────────────────────────────────────────────────────────
  const gear = el('button', { class: 'nx-gear', type: 'button', 'aria-label': 'Settings', 'aria-expanded': 'false' });
  gear.appendChild(gearIcon());
  document.body.appendChild(gear);

  // ── Panel ─────────────────────────────────────────────────────────────────
  const panel = el('div', { class: 'nx-panel', role: 'dialog', 'aria-label': 'Neuro settings', hidden: '' });
  panel.innerHTML = `
    <div class="nx-scan"></div>
    <i class="nx-corner tl"></i><i class="nx-corner tr"></i><i class="nx-corner bl"></i><i class="nx-corner br"></i>
    <header class="nx-head">
      <div class="nx-title"><span class="nx-lamp"></span>neuro <b>//</b> control interface</div>
      <div class="nx-telemetry">
        <span>fps <em data-fps>---</em></span>
        <span>nodes <em data-nodes>---</em></span>
        <span>links <em data-links>---</em></span>
      </div>
      <button class="nx-reset" type="button" data-act="reset">reset all</button>
      <button class="nx-close" type="button" aria-label="Close settings">&times;</button>
    </header>

    <div class="nx-top">
    <section class="nx-mod nx-seed">
      <div class="nx-mod-label"><span>00</span> generation seed</div>
      <div class="nx-seed-row">
        <input class="nx-seed-display" data-seed inputmode="numeric" maxlength="9" spellcheck="false" aria-label="Seed">
        <div class="nx-btns">
          <button type="button" data-act="load">load</button>
          <button type="button" data-act="random">random</button>
          <button type="button" data-act="copy">copy link</button>
        </div>
      </div>
      <div class="nx-hint" data-seed-msg>same seed, same network, from the start of the path</div>
    </section>
    <section class="nx-mod nx-states">
      <div class="nx-mod-label"><span>05</span> state profiles</div>
      <div class="nx-state-row">
        <label class="nx-select">
          <span>mood</span>
          <select data-state="mood">
            <option value="">baseline</option>
            ${MOODS.map((m) => `<option>${m}</option>`).join('')}
          </select>
        </label>
        <label class="nx-select">
          <span>altered state</span>
          <select data-state="altered">
            <option value="">baseline</option>
            ${ALTERED.map((m) => `<option>${m}</option>`).join('')}
          </select>
        </label>
        <div class="nx-standby"><span class="nx-lamp amber"></span><em data-state-msg>standby - profiles not yet calibrated</em></div>
      </div>
    </section>
    </div>

    <div class="nx-dials"></div>


    <footer class="nx-foot">
      <span class="nx-hint">drag, scroll or use arrow keys on a dial &middot; double-click a dial to reset it &middot; esc closes</span>
    </footer>
  `;
  document.body.appendChild(panel);

  // ── Dials ─────────────────────────────────────────────────────────────────
  const dialWrap = panel.querySelector('.nx-dials');
  const controls = DIALS.map((d, i) => makeDialModule(d, i + 1));
  controls.forEach((c) => dialWrap.appendChild(c.root));

  // ── Seed ──────────────────────────────────────────────────────────────────
  const seedInput = panel.querySelector('[data-seed]');
  const seedMsg = panel.querySelector('[data-seed-msg]');
  const showSeed = () => { seedInput.value = String(api.getSeed()).padStart(9, '0'); };
  showSeed();

  function loadSeed(n) {
    const s = api.reseed(n);
    showSeed();
    const u = new URL(location.href);
    u.searchParams.set('seed', String(s));
    u.searchParams.delete('z');
    history.replaceState(null, '', u);
    flash(seedMsg, `seed ${s} loaded`);
  }
  seedInput.addEventListener('input', () => { seedInput.value = seedInput.value.replace(/\D/g, '').slice(0, 9); });
  seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadSeed(parseInt(seedInput.value || '0', 10)); });
  panel.querySelector('[data-act="load"]').addEventListener('click', () => loadSeed(parseInt(seedInput.value || '0', 10)));
  panel.querySelector('[data-act="random"]').addEventListener('click', () => loadSeed((Math.random() * 1e9) | 0));
  panel.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    const u = new URL(location.href);
    u.searchParams.set('seed', String(api.getSeed()));
    try { await navigator.clipboard.writeText(u.toString()); flash(seedMsg, 'link copied'); }
    catch { flash(seedMsg, u.toString()); }
  });

  // ── State profiles (placeholders for now) ─────────────────────────────────
  const stateMsg = panel.querySelector('[data-state-msg]');
  panel.querySelectorAll('[data-state]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const mood = panel.querySelector('[data-state="mood"]').value;
      const altered = panel.querySelector('[data-state="altered"]').value;
      const picked = [mood, altered].filter(Boolean).join(' + ');
      stateMsg.textContent = picked ? `${picked.toLowerCase()} - not yet calibrated` : 'standby - profiles not yet calibrated';
      window.dispatchEvent(new CustomEvent('neuro:state', { detail: { mood, altered } }));
    });
  });

  // ── Reset ─────────────────────────────────────────────────────────────────
  panel.querySelector('[data-act="reset"]').addEventListener('click', () => controls.forEach((c) => c.set(c.def)));

  // ── Open / close ──────────────────────────────────────────────────────────
  let telemetry = 0;
  function open(on) {
    panel.hidden = !on;
    gear.setAttribute('aria-expanded', String(on));
    gear.classList.toggle('on', on);
    clearInterval(telemetry);
    if (on) {
      showSeed();
      updateTelemetry();
      telemetry = setInterval(updateTelemetry, 500);
    }
  }
  function updateTelemetry() {
    panel.querySelector('[data-fps]').textContent = String(Math.round(api.getFps())).padStart(3, '0');
    const st = api.stats();
    panel.querySelector('[data-nodes]').textContent = String(st.neurons).padStart(3, '0');
    panel.querySelector('[data-links]').textContent = String(st.junctions).padStart(3, '0');
  }
  gear.addEventListener('click', () => open(panel.hidden));
  panel.querySelector('.nx-close').addEventListener('click', () => open(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) open(false); });

  // ─────────────────────────────────────────────────────────────────────────
  function makeDialModule(d, n) {
    const root = el('section', { class: 'nx-mod nx-dialmod' });
    root.innerHTML = `
      <div class="nx-mod-label"><span>${String(n).padStart(2, '0')}</span> ${d.label}</div>
      <div class="nx-dialbody">
        <div class="nx-dial" tabindex="0" role="slider" aria-label="${d.label}" aria-valuemin="0" aria-valuemax="100"></div>
        <div class="nx-gauge">
          <div class="nx-bar"></div>
          <div class="nx-readout">
            <div class="nx-big"><b data-val>000</b><i>%</i></div>
            <div class="nx-sub" data-sub></div>
            <div class="nx-def">default ${d.def}%</div>
          </div>
        </div>
      </div>`;
    const dialEl = root.querySelector('.nx-dial');
    const dial = dialSvg(d.def);
    dialEl.appendChild(dial.svg);

    const bar = root.querySelector('.nx-bar');
    const SEG = 24;
    const segs = [];
    for (let i = 0; i < SEG; i++) {
      const s = el('i');
      const frac = (i + 1) / SEG;
      s.className = frac > 0.9 ? 'hot' : frac > 0.7 ? 'warm' : '';
      bar.prepend(s);
      segs.push(s);
    }
    const valEl = root.querySelector('[data-val]');
    const subEl = root.querySelector('[data-sub]');

    let value = d.def;
    function set(v) {
      value = Math.min(100, Math.max(0, v));
      const r = Math.round(value);
      dial.setValue(value);
      valEl.textContent = String(r).padStart(3, '0');
      subEl.textContent = d.sub(value);
      dialEl.setAttribute('aria-valuenow', String(r));
      dialEl.setAttribute('aria-valuetext', `${r}%`);
      const lit = Math.round((value / 100) * SEG);
      segs.forEach((s, i) => s.classList.toggle('lit', i < lit));
      d.apply(value);
    }

    // drag: up / right increases
    let drag = null;
    dialEl.addEventListener('pointerdown', (e) => {
      dialEl.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, v: value };
      dialEl.classList.add('grab');
      dialEl.focus({ preventScroll: true });
    });
    dialEl.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const fine = e.shiftKey ? 0.1 : 0.4;
      set(drag.v + ((e.clientX - drag.x) - (e.clientY - drag.y)) * fine);
    });
    const end = () => { drag = null; dialEl.classList.remove('grab'); };
    dialEl.addEventListener('pointerup', end);
    dialEl.addEventListener('pointercancel', end);
    dialEl.addEventListener('dblclick', () => set(d.def));
    dialEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      set(value + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 5 : 1));
    }, { passive: false });
    dialEl.addEventListener('keydown', (e) => {
      const k = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (k) { e.preventDefault(); set(value + k * (e.shiftKey ? 5 : 1)); }
      else if (e.key === 'Home') { e.preventDefault(); set(0); }
      else if (e.key === 'End') { e.preventDefault(); set(100); }
    });

    set(d.def);
    return { root, set, def: d.def };
  }
});

// ── Dial artwork (original SVG) ─────────────────────────────────────────────
// 270-degree sweep: 0 % at lower left, 100 % at lower right.
function dialSvg(defVal) {
  const svg = svgEl('svg', { viewBox: '0 0 200 200', class: 'nx-dial-svg' });
  const uid = Math.random().toString(36).slice(2, 8);
  svg.innerHTML = `
    <defs>
      <radialGradient id="kf${uid}" cx="40%" cy="35%" r="75%">
        <stop offset="0" stop-color="#3a3a46"/>
        <stop offset="0.55" stop-color="#16161c"/>
        <stop offset="1" stop-color="#050507"/>
      </radialGradient>
      <radialGradient id="bz${uid}" cx="50%" cy="50%" r="50%">
        <stop offset="0.80" stop-color="rgba(10,10,14,0.55)"/>
        <stop offset="1" stop-color="rgba(220,30,130,0.10)"/>
      </radialGradient>
      <filter id="gl${uid}" filterUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240">
        <feGaussianBlur stdDeviation="2.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <circle cx="100" cy="100" r="94" fill="url(#bz${uid})" stroke="rgba(220,30,130,0.45)" stroke-width="1"/>
    <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(220,30,130,0.18)" stroke-width="0.6" stroke-dasharray="2 3"/>
  `;
  const A0 = -135, A1 = 135;
  const ang = (v) => A0 + (A1 - A0) * (v / 100);
  const pol = (a, r) => {
    const t = (a - 90) * Math.PI / 180;
    return [100 + r * Math.cos(t), 100 + r * Math.sin(t)];
  };

  // scale ticks and labels
  const ticks = svgEl('g', {});
  for (let i = 0; i <= 50; i++) {
    const v = i * 2, a = ang(v), major = v % 10 === 0;
    const [x1, y1] = pol(a, major ? 64 : 68);
    const [x2, y2] = pol(a, 74);
    ticks.appendChild(svgEl('line', {
      x1, y1, x2, y2,
      stroke: major ? 'rgba(232,232,236,0.85)' : 'rgba(232,232,236,0.35)',
      'stroke-width': major ? 1.4 : 0.8,
    }));
    if (v % 20 === 0) {
      const [tx, ty] = pol(a, 83);
      const t = svgEl('text', { x: tx, y: ty + 3, class: 'nx-dial-num', 'text-anchor': 'middle' });
      t.textContent = String(v);
      ticks.appendChild(t);
    }
  }
  svg.appendChild(ticks);

  // default marker
  const [mx, my] = pol(ang(defVal), 77);
  const marker = svgEl('circle', { cx: mx, cy: my, r: 2.2, fill: '#00c8e0', opacity: 0.8 });
  svg.appendChild(marker);

  // value arc track + live arc
  const track = svgEl('path', { d: arcPath(A0, A1, 58), fill: 'none', stroke: 'rgba(0,200,224,0.12)', 'stroke-width': 4, 'stroke-linecap': 'round' });
  const arc = svgEl('path', { fill: 'none', stroke: '#00c8e0', 'stroke-width': 4, 'stroke-linecap': 'round', filter: `url(#gl${uid})` });
  svg.appendChild(track);
  svg.appendChild(arc);

  // knob: rotates as a group
  const knob = svgEl('g', {});
  knob.appendChild(svgEl('circle', { cx: 100, cy: 100, r: 48, fill: `url(#kf${uid})`, stroke: 'rgba(255,255,255,0.10)', 'stroke-width': 1 }));
  for (let i = 0; i < 40; i++) {
    const a = i * 9;
    const [x1, y1] = pol(a, 44);
    const [x2, y2] = pol(a, 48);
    knob.appendChild(svgEl('line', { x1, y1, x2, y2, stroke: 'rgba(255,255,255,0.13)', 'stroke-width': 1 }));
  }
  knob.appendChild(svgEl('circle', { cx: 100, cy: 100, r: 30, fill: 'none', stroke: 'rgba(255,255,255,0.06)', 'stroke-width': 1 }));
  const [px1, py1] = pol(0, 16);
  const [px2, py2] = pol(0, 41);
  knob.appendChild(svgEl('line', {
    x1: px1, y1: py1, x2: px2, y2: py2,
    stroke: 'rgb(220,30,130)', 'stroke-width': 3.2, 'stroke-linecap': 'round', filter: `url(#gl${uid})`,
  }));
  knob.appendChild(svgEl('circle', { cx: 100, cy: 100, r: 5, fill: '#0a0a0e', stroke: 'rgba(220,30,130,0.6)', 'stroke-width': 1 }));
  svg.appendChild(knob);

  function arcPath(a0, a1, r) {
    const [x0, y0] = pol(a0, r);
    const [x1, y1] = pol(a1, r);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  }

  return {
    svg,
    setValue(v) {
      const a = ang(v);
      knob.setAttribute('transform', `rotate(${a} 100 100)`);
      arc.setAttribute('d', v > 0.3 ? arcPath(A0, a, 58) : '');
    },
  };
}

function gearIcon() {
  const svg = svgEl('svg', { viewBox: '0 0 48 48', 'aria-hidden': 'true' });
  const g = svgEl('g', { class: 'nx-gear-rot' });
  for (let i = 0; i < 10; i++) {
    g.appendChild(svgEl('rect', {
      x: 21.5, y: 3, width: 5, height: 9, rx: 1,
      transform: `rotate(${i * 36} 24 24)`,
    }));
  }
  g.appendChild(svgEl('circle', { cx: 24, cy: 24, r: 13.5 }));
  svg.appendChild(g);
  svg.appendChild(svgEl('circle', { cx: 24, cy: 24, r: 5.5, class: 'nx-gear-hole' }));
  return svg;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function el(tag, attrs = {}) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function flash(node, msg) {
  const prev = node.dataset.base || node.textContent;
  node.dataset.base = prev;
  node.textContent = msg;
  node.classList.add('nx-flash');
  clearTimeout(node._t);
  node._t = setTimeout(() => { node.textContent = prev; node.classList.remove('nx-flash'); }, 2600);
}

// ── Styles ──────────────────────────────────────────────────────────────────
function injectStyles() {
  const css = `
  :root {
    --nx-mag: rgb(220,30,130);
    --nx-mag-dim: rgba(220,30,130,0.4);
    --nx-mag-faint: rgba(220,30,130,0.12);
    --nx-teal: #00c8e0;
    --nx-red: #990000;
    --nx-text: #e8e8ec;
    --nx-muted: #8a8a98;
    --nx-ui: 'Century Gothic Pro', 'Century Gothic', 'Futura', sans-serif;
    --nx-mono: 'Space Mono', ui-monospace, Menlo, monospace;
  }
  .nx-gear {
    position: fixed; top: 18px; right: 18px; z-index: 40;
    width: 44px; height: 44px; padding: 6px;
    background: rgba(7,7,7,0.25); border: 1px solid var(--nx-mag-dim); border-radius: 50%;
    cursor: pointer; transition: border-color .2s, background .2s;
  }
  .nx-gear svg { width: 100%; height: 100%; display: block; }
  .nx-gear-rot { fill: none; stroke: var(--nx-mag); stroke-width: 1.6; transform-origin: 24px 24px; transition: transform .6s ease; }
  .nx-gear-rot rect, .nx-gear-rot circle { fill: rgba(7,7,7,0.85); }
  .nx-gear-hole { fill: none; stroke: var(--nx-mag); stroke-width: 1.6; }
  .nx-gear:hover .nx-gear-rot, .nx-gear.on .nx-gear-rot { transform: rotate(72deg); }
  .nx-gear:hover, .nx-gear.on { border-color: var(--nx-mag); background: rgba(220,30,130,0.10); }
  .nx-gear:focus-visible { outline: 1px solid var(--nx-teal); outline-offset: 3px; }

  .nx-panel {
    position: fixed; z-index: 35; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(1060px, calc(100vw - 32px)); max-height: calc(100vh - 96px); overflow: auto;
    padding: 22px 26px 18px;
    background: rgba(7,7,7,0.14);
    border: 1px solid var(--nx-mag-dim);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.4), inset 0 0 60px rgba(220,30,130,0.05);
    color: var(--nx-text); font-family: var(--nx-ui);
    text-shadow: 0 0 6px rgba(0,0,0,0.9);
    animation: nx-in .28s ease-out;
  }
  .nx-panel[hidden] { display: none; }
  @keyframes nx-in { from { opacity: 0; transform: translate(-50%, -48%) scale(.985); } to { opacity: 1; transform: translate(-50%, -50%); } }
  .nx-scan {
    position: absolute; inset: 0; pointer-events: none;
    background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px);
  }
  .nx-corner { position: absolute; width: 18px; height: 18px; border: 2px solid var(--nx-mag); pointer-events: none; }
  .nx-corner.tl { top: -2px; left: -2px; border-right: 0; border-bottom: 0; }
  .nx-corner.tr { top: -2px; right: -2px; border-left: 0; border-bottom: 0; }
  .nx-corner.bl { bottom: -2px; left: -2px; border-right: 0; border-top: 0; }
  .nx-corner.br { bottom: -2px; right: -2px; border-left: 0; border-top: 0; }

  .nx-head {
    position: relative; display: flex; align-items: center; gap: 18px;
    padding-bottom: 12px; margin-bottom: 16px; border-bottom: 1px solid var(--nx-mag-faint);
  }
  .nx-title { font-size: 15px; letter-spacing: .32em; text-transform: lowercase; display: flex; align-items: center; gap: 10px; }
  .nx-title b { color: var(--nx-mag); font-weight: 400; }
  .nx-telemetry { margin-left: auto; display: flex; gap: 18px; font-family: var(--nx-mono); font-size: 11px; letter-spacing: .12em; color: var(--nx-muted); text-transform: uppercase; }
  .nx-telemetry em { font-style: normal; color: var(--nx-teal); }
  .nx-close {
    width: 30px; height: 30px; border: 1px solid var(--nx-mag-dim); background: rgba(7,7,7,0.3);
    color: var(--nx-mag); font-size: 20px; line-height: 1; cursor: pointer;
  }
  .nx-close:hover { border-color: var(--nx-mag); color: #fff; }

  .nx-lamp { width: 8px; height: 8px; border-radius: 50%; background: var(--nx-teal); box-shadow: 0 0 8px var(--nx-teal); display: inline-block; animation: nx-blink 2.4s infinite; }
  .nx-lamp.amber { background: #ffae5c; box-shadow: 0 0 8px #ffae5c; }
  @keyframes nx-blink { 0%, 92%, 100% { opacity: 1; } 95% { opacity: .25; } }

  .nx-mod {
    position: relative; border: 1px solid var(--nx-mag-faint); background: rgba(7,7,7,0.22);
    padding: 12px 14px 14px;
  }
  .nx-mod::before {
    content: ''; position: absolute; top: -1px; left: -1px; width: 34px; height: 1px; background: var(--nx-mag);
  }
  .nx-mod-label { font-size: 11px; letter-spacing: .28em; text-transform: lowercase; color: var(--nx-muted); margin-bottom: 10px; }
  .nx-mod-label span { font-family: var(--nx-mono); color: var(--nx-mag); margin-right: 8px; letter-spacing: .1em; }

  .nx-top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; margin-bottom: 14px; }
  .nx-seed-row { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
  .nx-seed-display {
    font-family: var(--nx-mono); font-size: 28px; letter-spacing: .24em; color: var(--nx-teal);
    background: rgba(0,0,0,0.45); border: 1px solid rgba(0,200,224,0.35); padding: 6px 14px;
    width: 15ch; text-shadow: 0 0 10px rgba(0,200,224,0.55); outline: none;
  }
  .nx-seed-display:focus { border-color: var(--nx-teal); }
  .nx-btns { display: flex; gap: 8px; flex-wrap: wrap; }
  .nx-btns button, .nx-reset {
    font-family: var(--nx-ui); font-size: 11px; letter-spacing: .26em; text-transform: lowercase;
    color: var(--nx-text); background: rgba(7,7,7,0.4); border: 1px solid var(--nx-mag-dim);
    padding: 9px 14px; cursor: pointer; transition: border-color .15s, color .15s, background .15s;
  }
  .nx-btns button:hover, .nx-reset:hover { border-color: var(--nx-mag); color: #fff; background: rgba(220,30,130,0.14); }
  .nx-hint { font-family: var(--nx-mono); font-size: 10.5px; letter-spacing: .08em; color: var(--nx-muted); margin-top: 8px; }
  .nx-flash { color: var(--nx-teal); }

  .nx-dials { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
  .nx-dialbody { display: flex; align-items: center; gap: 18px; }
  .nx-dial { width: 130px; height: 130px; flex: none; cursor: grab; touch-action: none; border-radius: 50%; outline: none; }
  .nx-dial.grab { cursor: grabbing; }
  .nx-dial:focus-visible { box-shadow: 0 0 0 1px var(--nx-teal); }
  .nx-dial-svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .nx-dial-num { font-family: var(--nx-mono); font-size: 8.5px; fill: rgba(232,232,236,0.6); }

  .nx-gauge { display: flex; align-items: stretch; gap: 14px; flex: 1; min-width: 0; height: 112px; }
  .nx-bar {
    width: 22px; flex: none; display: flex; flex-direction: column; gap: 2px; padding: 3px;
    border: 1px solid rgba(0,200,224,0.25); background: rgba(0,0,0,0.4);
  }
  .nx-bar i { flex: 1; background: rgba(0,200,224,0.08); }
  .nx-bar i.lit { background: var(--nx-teal); box-shadow: 0 0 6px rgba(0,200,224,0.7); }
  .nx-bar i.warm.lit { background: var(--nx-mag); box-shadow: 0 0 6px rgba(220,30,130,0.7); }
  .nx-bar i.hot.lit { background: #d01818; box-shadow: 0 0 6px rgba(208,24,24,0.8); }
  .nx-bar i.warm { background: rgba(220,30,130,0.08); }
  .nx-bar i.hot { background: rgba(153,0,0,0.18); }
  .nx-readout {
    flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;
    border-left: 1px solid var(--nx-mag-faint); padding-left: 14px;
    background: repeating-linear-gradient(to bottom, transparent 0 21px, rgba(0,200,224,0.06) 21px 22px);
  }
  .nx-big { font-family: var(--nx-mono); color: var(--nx-teal); text-shadow: 0 0 12px rgba(0,200,224,0.6); line-height: 1; }
  .nx-big b { font-size: 42px; font-weight: 400; letter-spacing: .06em; }
  .nx-big i { font-style: normal; font-size: 16px; margin-left: 4px; color: rgba(0,200,224,0.7); }
  .nx-sub { font-family: var(--nx-mono); font-size: 12px; letter-spacing: .14em; color: var(--nx-text); margin-top: 8px; text-transform: uppercase; }
  .nx-def { font-family: var(--nx-mono); font-size: 10px; letter-spacing: .14em; color: var(--nx-muted); margin-top: 4px; text-transform: uppercase; }

  .nx-state-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 14px; }
  .nx-select { display: flex; flex-direction: column; gap: 6px; font-size: 10.5px; letter-spacing: .26em; color: var(--nx-muted); text-transform: lowercase; }
  .nx-select select {
    appearance: none; -webkit-appearance: none;
    font-family: var(--nx-mono); font-size: 13px; letter-spacing: .06em; color: var(--nx-text);
    background: rgba(0,0,0,0.5) linear-gradient(45deg, transparent 50%, var(--nx-mag) 50%) no-repeat right 14px center / 8px 8px;
    border: 1px solid var(--nx-mag-dim); padding: 9px 36px 9px 12px; min-width: 210px; cursor: pointer;
  }
  .nx-select select:focus { outline: none; border-color: var(--nx-teal); }
  .nx-select option { background: #0b0b0f; color: var(--nx-text); }
  .nx-standby { flex-basis: 100%; display: flex; align-items: center; gap: 10px; font-family: var(--nx-mono); font-size: 11px; letter-spacing: .1em; color: #ffae5c; }
  .nx-standby em { font-style: normal; }

  .nx-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; padding-top: 8px; border-top: 1px solid var(--nx-mag-faint); }
  .nx-reset { padding: 7px 12px; }
  .nx-foot .nx-hint { margin-top: 0; }

  @media (max-width: 820px) {
    .nx-dials, .nx-top { grid-template-columns: 1fr; }
    .nx-telemetry { display: none; }
    .nx-panel { padding: 18px 16px 14px; max-height: calc(100vh - 84px); top: calc(50% + 20px); }
    .nx-seed-display { font-size: 22px; }
    .nx-select select { min-width: 200px; }
  }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
}
