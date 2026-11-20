// neuro / states - mood and altered-state profiles for the /neuro test space.
// Each profile drives the engine's modifier layer (window.__neuro.setMods) on top
// of the user's slider settings; leaving a profile restores neutral modifiers.
// Every profile declares one parameter, shown as a slider under its dropdown.

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// ── Video game (dopamine hits) ──────────────────────────────────────────────
// Grounding: dopamine neurons fire in short phasic bursts when a reward arrives,
// and the burst is larger when the reward is unexpected (reward prediction
// error). Striatal dopamine release during video game play has been measured
// directly (Koepp et al., Nature 1998). Games deliver rewards on variable
// schedules, so hits land at irregular intervals with occasional jackpots.
// The parameter picks a game along a calm-to-frantic continuum.
const GAMES = ['Tetris', 'Minecraft', 'Mario Kart', 'Call of Duty', 'GTA 6'];

function videoGame(api) {
  let level = 2, next = 0, lastHit = 0, hit = null;
  let cfg = tune(level);

  function tune(L) {
    const t = L / (GAMES.length - 1);                  // 0 = Tetris, 1 = GTA 6
    return {
      gapMin: lerp(4.0, 0.9, t), gapMax: lerp(9.0, 2.8, t),   // seconds between hits
      burstMin: Math.round(lerp(3, 8, t)), burstMax: Math.round(lerp(4, 11, t)),
      jackpotP: lerp(0.06, 0.25, t), jackpotN: Math.round(lerp(8, 16, t)),
      flash: lerp(0.3, 0.8, t), punch: lerp(0.5, 1.6, t), spark: lerp(0.8, 1.9, t),
      speed: lerp(1.0, 1.35, t), spont: lerp(0.6, 0.85, t),
      gain: lerp(0.92, 0.88, t), sat: lerp(1.02, 1.15, t),
    };
  }
  function schedule(now) { next = now + cfg.gapMin + Math.random() * (cfg.gapMax - cfg.gapMin); }

  function fire(now) {
    const jackpot = Math.random() < cfg.jackpotP;
    // surprise: a hit after a long wait lands harder than one in quick succession
    const typical = (cfg.gapMin + cfg.gapMax) / 2;
    const surprise = Math.min(1.35, Math.max(0.5, (now - lastHit) / typical));
    lastHit = now;
    const n = jackpot ? cfg.jackpotN : cfg.burstMin + Math.floor(Math.random() * (cfg.burstMax - cfg.burstMin + 1));
    api.burst(n, jackpot ? 0.05 : 0.03);
    hit = { at: now, mag: (jackpot ? 1.6 : 1) * surprise, tau: jackpot ? 0.9 : 0.45, colourTau: jackpot ? 2.4 : 1.4, jackpot };
    schedule(now);
  }

  return {
    start() {
      const now = performance.now() / 1000;
      api.setModColor('#ffc84a'); // warm gold for dopamine-driven pulses
      lastHit = now;
      schedule(now);
    },
    setParam(v) {
      level = Math.max(0, Math.min(GAMES.length - 1, Math.round(v)));
      cfg = tune(level);
      const now = performance.now() / 1000;
      if (next - now > cfg.gapMax) schedule(now);       // switching to a faster game takes effect promptly
    },
    frame(now) {
      if (now >= next) fire(now);
      let e = 0, c = 0, kick = 0;
      if (hit) {
        const age = now - hit.at;
        e = Math.exp(-age / hit.tau) * hit.mag;
        c = Math.exp(-age / hit.colourTau) * Math.min(1, hit.mag);
        kick = Math.exp(-age / 0.25) * (hit.jackpot ? 3.2 : 1.1) * hit.mag * cfg.punch;
        if (age > 6) hit = null;
      }
      api.setMods({
        speed: cfg.speed,
        spont: cfg.spont,
        gain: cfg.gain * (1 + e * cfg.flash),
        sat: cfg.sat * (1 + e * 0.35),
        spark: 1 + e * cfg.spark,
        pulseMix: c,
        fov: -kick,
        transmit: 1,
        shake: 0,
      });
    },
  };
}

// ── Coffee (caffeine) ───────────────────────────────────────────────────────
// Grounding: caffeine blocks adenosine receptors. Adenosine builds up during
// waking and acts as a brake: it damps firing and (via A1 receptors) suppresses
// transmitter release at synapses. Blocking it removes the brake rather than
// pressing an accelerator: more spontaneous firing, slightly freer transmission,
// heightened arousal, and at higher doses a tremor. Onset is gradual, so the
// effect ramps in; the parameter is the dose in cups.
function coffee(api) {
  const ONSET = 18;          // seconds to full effect (compressed from ~30-60 min)
  let t0 = 0, cups = 2, dose = 0, spell = null, nextSpell = 0, last = 0;

  return {
    start() {
      t0 = last = performance.now() / 1000;
      dose = cups; // the onset curve handles the ramp-in; easing is only for later changes
      nextSpell = t0 + ONSET + 4 + Math.random() * 8;
    },
    setParam(v) { cups = Math.max(1, Math.min(6, Math.round(v))); },
    frame(now) {
      const dt = Math.min(now - last, 0.5);
      last = now;
      const onset = ease((now - t0) / ONSET);
      // a change in cups eases in over a few seconds rather than jumping
      dose += (cups - dose) * Math.min(1, dt * 0.35);
      const d = dose * onset;                              // effective cups

      // jittery spells: more frequent and stronger with more cups
      if (now >= nextSpell && d > 1.5) {
        spell = { at: now, len: 0.5 + Math.random() * (0.4 + d * 0.2) };
        nextSpell = now + Math.max(3, 18 - d * 2.5) + Math.random() * 8;
      }
      let jitter = 1;
      if (spell) {
        const age = now - spell.at;
        if (age > spell.len) spell = null;
        else jitter = 1 + (1 + d * 0.4) * Math.sin(Math.PI * age / spell.len);
      }
      api.setMods({
        spont: 1 + 0.35 * d,                 // 1 cup ~1.35x spontaneous firing, 6 cups ~3.1x
        transmit: 1 + 0.05 * d,
        speed: 1 + 0.06 * d,
        gain: 1 + 0.02 * d,
        sat: 1 + 0.03 * d,
        spark: 1 + 0.06 * d,
        shake: 0.004 * Math.pow(d, 1.6) * jitter, // barely there at 1 cup, obvious by 4+
        fov: 0,
        pulseMix: 0,
      });
    },
  };
}

// name (as shown in the dropdown) -> { factory, param spec }
const PROFILES = {
  'Video game (dopamine hits)': {
    factory: videoGame,
    param: { min: 0, max: GAMES.length - 1, step: 1, def: 2, label: (v) => GAMES[v] },
  },
  'Coffee (caffeine)': {
    factory: coffee,
    param: { min: 1, max: 6, step: 1, def: 2, label: (v) => `${v} cup${v === 1 ? '' : 's'}` },
  },
};

export const isCalibrated = (name) => !!PROFILES[name];
export const paramSpec = (name) => (PROFILES[name] ? PROFILES[name].param : null);

export function initStates(api) {
  let active = null, activeName = '';
  const values = {}; // remembered parameter per state for this visit
  for (const [n, p] of Object.entries(PROFILES)) values[n] = p.param.def;

  function stop() {
    active = null;
    activeName = '';
    api.resetMods();
  }

  window.addEventListener('neuro:state', (e) => {
    const { mood, altered } = e.detail;
    // one profile at a time for now: mood takes priority, then altered state
    const name = [mood, altered].find((n) => n && PROFILES[n]) || '';
    if (name === activeName) return;
    stop();
    if (name) {
      active = PROFILES[name].factory(api);
      activeName = name;
      active.setParam(values[name]);
      active.start();
    }
  });

  function loop() {
    requestAnimationFrame(loop);
    if (active) active.frame(performance.now() / 1000);
  }
  requestAnimationFrame(loop);

  return {
    getParam: (name) => values[name],
    setParam(name, v) {
      if (!PROFILES[name]) return;
      values[name] = v;
      if (name === activeName && active) active.setParam(v);
    },
  };
}
