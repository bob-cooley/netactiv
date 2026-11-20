// neuro / cursors - selectable custom cursors for the /neuro test space.
// A drawn element follows the mouse over the network canvas (so cursors can
// animate); over the settings panel and buttons the normal system cursor returns.
// Reacts to the engine's hover state (canvas.nx-over) and to pressing.

const CURSORS = {
  system: { label: 'System' },

  plus: {
    label: 'Small +', w: 18, h: 18, hx: 9, hy: 9,
    svg: `<svg viewBox="0 0 18 18"><path class="nc-line" d="M9 1.5v15M1.5 9h15"/></svg>`,
  },

  crosshair: {
    label: 'Crosshairs', w: 42, h: 42, hx: 21, hy: 21,
    svg: `<svg viewBox="0 0 42 42">
      <g class="nc-spin">
        <circle class="nc-line" cx="21" cy="21" r="12"/>
        <path class="nc-line" d="M21 2v11M21 29v11M2 21h11M29 21h11"/>
      </g>
      <circle class="nc-dot" cx="21" cy="21" r="1.8"/>
    </svg>`,
  },

  finger: {
    label: 'Middle finger', w: 36, h: 44, hx: 18, hy: 2,
    svg: `<svg viewBox="0 0 36 44"><g class="nc-hand">
      <rect x="14" y="2" width="8" height="25" rx="4"/>
      <rect x="6" y="15" width="8" height="13" rx="4"/>
      <rect x="22" y="15" width="8" height="13" rx="4"/>
      <rect x="29.5" y="18" width="6" height="11" rx="3"/>
      <rect x="5" y="23" width="30.5" height="19" rx="7"/>
      <ellipse cx="13" cy="31" rx="8.5" ry="3.6" transform="rotate(-14 13 31)"/>
      <path class="nc-crease" d="M18 6.5v2"/>
    </g></svg>`,
  },

  eye: {
    label: 'Eye', w: 46, h: 30, hx: 23, hy: 15,
    svg: `<svg viewBox="0 0 46 30">
      <defs><clipPath id="nc-eyeclip"><path d="M2 15 Q23 -6 44 15 Q23 36 2 15Z"/></clipPath></defs>
      <g class="nc-lidgroup">
        <path class="nc-white" d="M2 15 Q23 -6 44 15 Q23 36 2 15Z"/>
        <g clip-path="url(#nc-eyeclip)">
          <g class="nc-look">
            <circle class="nc-iris" cx="23" cy="15" r="7.5"/>
            <circle class="nc-pupil" cx="23" cy="15" r="3.4"/>
            <circle cx="25.4" cy="12.6" r="1.3" fill="#fff"/>
          </g>
        </g>
        <path class="nc-line" d="M2 15 Q23 -6 44 15 Q23 36 2 15Z"/>
      </g>
    </svg>`,
  },

  ship: {
    label: 'Spaceship', w: 52, h: 32, hx: 26, hy: 16,
    svg: `<svg viewBox="0 0 52 32">
      <ellipse class="nc-beam" cx="26" cy="26" rx="9" ry="3"/>
      <path class="nc-dome" d="M16 15 Q17 4 26 4 Q35 4 36 15Z"/>
      <path d="M20 9 Q23 6.5 27 6.6" class="nc-glint"/>
      <ellipse class="nc-hull" cx="26" cy="17" rx="23" ry="6.5"/>
      <ellipse class="nc-rim" cx="26" cy="17" rx="23" ry="6.5"/>
      <g class="nc-lights">
        <circle cx="10" cy="18" r="1.6"/><circle cx="18" cy="20.3" r="1.6"/>
        <circle cx="26" cy="21" r="1.6"/><circle cx="34" cy="20.3" r="1.6"/>
        <circle cx="42" cy="18" r="1.6"/>
      </g>
    </svg>`,
  },
};

const KEY = 'neuro.cursor';
const KEY_ALPHA = 'neuro.cursorOpacity';

export function initCursors(select, canvas) {
  injectStyles();
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  for (const [id, c] of Object.entries(CURSORS)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = c.label;
    select.appendChild(o);
  }

  const box = document.createElement('div');
  box.className = 'nc';
  box.setAttribute('aria-hidden', 'true');
  const inner = document.createElement('div');
  inner.className = 'nc-in';
  box.appendChild(inner);
  document.body.appendChild(box);

  let current = 'system';
  let x = -100, y = -100, sx = -100, sy = -100, vx = 0, vy = 0;
  let overCanvas = false, inWindow = false, down = false;
  let blinkT = 0;
  let alpha = 1;
  try { const a = parseFloat(localStorage.getItem(KEY_ALPHA)); if (a >= 0 && a <= 1) alpha = a; } catch {}
  const control = {
    getOpacity: () => alpha,
    setOpacity(v) {
      alpha = Math.max(0, Math.min(1, v));
      try { localStorage.setItem(KEY_ALPHA, String(alpha)); } catch {}
    },
  };

  function choose(id) {
    if (!CURSORS[id]) id = 'system';
    current = id;
    select.value = id;
    try { localStorage.setItem(KEY, id); } catch {}
    const c = CURSORS[id];
    document.body.classList.toggle('nc-custom', id !== 'system');
    box.dataset.kind = id;
    inner.innerHTML = c.svg || '';
    if (c.svg) {
      inner.style.width = c.w + 'px';
      inner.style.height = c.h + 'px';
      inner.style.transformOrigin = `${c.hx}px ${c.hy}px`;
    }
    clearTimeout(blinkT);
    if (id === 'eye') scheduleBlink();
  }

  // the eye blinks at irregular intervals, sometimes twice
  function scheduleBlink() {
    blinkT = setTimeout(() => {
      blink();
      if (Math.random() < 0.25) setTimeout(blink, 260);
      scheduleBlink();
    }, 2200 + Math.random() * 4200);
  }
  function blink() {
    const lid = inner.querySelector('.nc-lidgroup');
    if (!lid) return;
    lid.classList.remove('blink');
    void lid.getBoundingClientRect(); // restart the animation
    lid.classList.add('blink');
  }

  select.addEventListener('change', () => choose(select.value));
  let saved = 'system';
  try { saved = localStorage.getItem(KEY) || 'system'; } catch {}
  choose(saved);

  if (!fine) return control; // touch screens: no cursor to draw

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    overCanvas = e.target === canvas;
    inWindow = true;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { inWindow = false; });
  document.documentElement.addEventListener('mouseleave', () => { inWindow = false; });
  canvas.addEventListener('pointerdown', () => { down = true; });
  addEventListener('pointerup', () => { down = false; });

  let last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const c = CURSORS[current];
    const show = !!c.svg && overCanvas && inWindow;
    box.style.opacity = show ? String(alpha) : '0';
    if (!c.svg) return;

    // the spaceship trails the pointer slightly; everything else tracks it exactly
    const k = current === 'ship' ? 1 - Math.pow(0.0008, dt) : 1;
    const px = sx, py = sy;
    sx += (x - sx) * k;
    sy += (y - sy) * k;
    if (dt > 0) {
      vx += ((sx - px) / dt - vx) * 0.2;
      vy += ((sy - py) / dt - vy) * 0.2;
    }
    box.style.transform = `translate3d(${sx - c.hx}px, ${sy - c.hy}px, 0)`;

    const over = canvas.classList.contains('nx-over');
    box.classList.toggle('over', over);
    box.classList.toggle('down', down);
    let scale = (over ? 1.18 : 1) * (down ? 0.82 : 1);
    let rot = 0;
    if (current === 'ship') rot = Math.max(-28, Math.min(28, vx * 0.03));
    inner.style.transform = `rotate(${rot}deg) scale(${scale})`;

    if (current === 'eye') {
      // pupil glances in the direction of travel, and dilates over a neuron
      const look = inner.querySelector('.nc-look');
      if (look) {
        const m = Math.hypot(vx, vy) || 1;
        const r = Math.min(4.5, m * 0.012);
        const ox = (vx / m) * r, oy = (vy / m) * r * 0.6;
        look.style.transform = `translate(${ox}px, ${oy}px)`;
        const p = inner.querySelector('.nc-pupil');
        if (p) p.setAttribute('r', over ? '4.6' : down ? '2.4' : '3.4');
      }
    }
  }
  requestAnimationFrame(tick);
  return control;
}

function injectStyles() {
  const css = `
  body.nc-custom #neuro { cursor: none; }
  #neuro.nx-over { cursor: pointer; }
  body.nc-custom #neuro.nx-over { cursor: none; }
  .nc { position: fixed; left: 0; top: 0; z-index: 50; pointer-events: none; opacity: 0;
        transition: opacity .12s linear; will-change: transform; }
  .nc-in { transition: transform .12s ease-out; filter: drop-shadow(0 0 1.5px rgba(0,0,0,0.95)); }
  .nc-in svg { width: 100%; height: 100%; display: block; overflow: visible; }

  .nc-line { fill: none; stroke: #5aaebb; stroke-width: 1.6; stroke-linecap: round; vector-effect: non-scaling-stroke; }
  .nc-dot { fill: rgb(158,78,116); }
  .nc.over .nc-line { stroke: #a9dbe2; }
  .nc.over .nc-dot { fill: #fff; }
  .nc-spin { transform-origin: 21px 21px; transition: transform .4s ease; }
  .nc.over .nc-spin { transform: rotate(45deg); }

  .nc-hand > * { fill: #0d0d12; stroke: #d4d4da; stroke-width: 1.5; }
  .nc-hand .nc-crease { fill: none; stroke: rgba(232,232,236,0.5); stroke-width: 1; }
  .nc.over .nc-hand > * { stroke: rgb(158,78,116); }

  .nc-white { fill: #eef2f7; }
  .nc-iris { fill: #00a9c2; stroke: #006b7d; stroke-width: 0.8; }
  .nc-pupil { fill: #05060a; transition: r .15s ease; }
  .nc-look { transition: transform .08s linear; }
  .nc-lidgroup { transform-origin: 23px 15px; }
  .nc-lidgroup.blink { animation: nc-blink .17s ease-in-out; }
  @keyframes nc-blink { 0%, 100% { transform: scaleY(1); } 45%, 55% { transform: scaleY(0.06); } }
  .nc.over .nc-iris { fill: rgb(158,78,116); stroke: #5a2a40; }

  .nc-hull { fill: #23232e; }
  .nc-rim { fill: none; stroke: #5aaebb; stroke-width: 1.3; }
  .nc-dome { fill: rgba(169,219,226,0.30); stroke: #a9dbe2; stroke-width: 1.2; }
  .nc-glint { fill: none; stroke: rgba(255,255,255,0.7); stroke-width: 1; stroke-linecap: round; }
  .nc-beam { fill: rgba(90,174,187,0.0); transition: fill .2s; }
  .nc.over .nc-beam, .nc.down .nc-beam { fill: rgba(90,174,187,0.45); }
  .nc-lights circle { fill: rgb(158,78,116); animation: nc-chase 1s infinite; }
  .nc-lights circle:nth-child(2) { animation-delay: .2s; }
  .nc-lights circle:nth-child(3) { animation-delay: .4s; }
  .nc-lights circle:nth-child(4) { animation-delay: .6s; }
  .nc-lights circle:nth-child(5) { animation-delay: .8s; }
  @keyframes nc-chase { 0%, 60%, 100% { opacity: .25; } 20% { opacity: 1; } }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
}
