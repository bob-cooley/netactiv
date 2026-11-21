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

// ── shared helpers for dose-style profiles ──────────────────────────────────
// Blend a set of modifier targets from neutral by an amount 0..1 (onset ramp).
const NEUTRAL = { gain: 1, sat: 1, speed: 1, spont: 1, spark: 1, fov: 0, pulseMix: 0, transmit: 1, shake: 0,
  timeScale: 1, sway: 0, blur: 1, ghost: 0, trails: 0, vignette: 0, focusWander: 0 };
function blend(target, amt) {
  const out = {};
  for (const k of Object.keys(NEUTRAL)) {
    const v = target[k] != null ? target[k] : NEUTRAL[k];
    out[k] = lerp(NEUTRAL[k], v, amt);
  }
  if (target.tint) out.tint = target.tint.map((c) => lerp(1, c, amt));
  else out.tint = [1, 1, 1];
  return out;
}
// A parameter that eases toward its target instead of jumping when the slider moves.
function eased(initial, rate = 0.5) {
  let cur = initial, goal = initial;
  return {
    set(v) { goal = v; },
    snap(v) { cur = goal = v; },
    step(dt) { cur += (goal - cur) * Math.min(1, dt * rate); return cur; },
  };
}

// ── Drunk (alcohol) ─────────────────────────────────────────────────────────
// Grounding: alcohol enhances GABA-A (the main inhibitory receptor) and blocks
// NMDA glutamate receptors, so its net effect is depressant. It is biphasic: low
// doses are mildly disinhibiting (a lift in activity and mood, partly via
// dopamine release), higher doses slow and dull. The cerebellum is notably
// affected, which shows as unsteadiness; vision blurs and doubles at higher
// doses. Parameter: standard drinks.
function drunk(api) {
  const ONSET = 15;
  const dose = eased(3, 0.4);
  let t0 = 0, last = 0;
  return {
    start() { t0 = last = performance.now() / 1000; },
    setParam(v) { const d = Math.max(1, Math.min(8, Math.round(v))); if (!t0) dose.snap(d); else dose.set(d); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const d = dose.step(dt);
      const lift = Math.max(0, 1 - Math.abs(d - 1.5) / 1.5) * 0.15;   // low-dose disinhibition
      const dep = Math.min(1, Math.max(0, (d - 1) / 7));               // 0 at 1 drink, 1 at 8
      const ghost = dep > 0.35 ? ((dep - 0.35) / 0.65) * 0.6 : 0;
      api.setMods(blend({
        spont: 1 + lift - 0.6 * dep,
        transmit: 1 + lift * 0.5 - 0.45 * dep,
        timeScale: 1 - 0.25 * dep,
        speed: 1 - 0.2 * dep,
        sway: 0.15 + 1.0 * Math.pow(dep, 1.2),
        blur: 1 + 1.4 * dep,
        ghost,
        focusWander: 0.3 * dep,
        sat: 1 + lift * 0.5 - 0.15 * dep,
        gain: 1 + lift * 0.3 - 0.08 * dep,
        tint: [1, 1 - 0.03 * dep, 1 - 0.1 * dep],                      // a slight warm, dull cast
      }, ease((now - t0) / ONSET)));
    },
  };
}

// ── High (THC) ──────────────────────────────────────────────────────────────
// Grounding: THC activates CB1 receptors, which sit on presynaptic terminals and
// reduce how much transmitter is released (both excitatory and inhibitory).
// CB1 is dense in the hippocampus (short-term memory) and areas involved in
// timing, and altered time perception and wandering attention are characteristic.
// Rendered as: weaker transmission, stretched time, trailing afterimages, focus
// that drifts, and occasional thought loops replaying the same small cluster.
const THC = ['Microdose', 'Low', 'Moderate', 'High', 'Very high'];
function high(api) {
  const ONSET = 8;
  const lvl = eased(2, 0.6);
  let t0 = 0, last = 0, loop = null, nextLoop = 0;
  return {
    start() { t0 = last = performance.now() / 1000; nextLoop = t0 + ONSET + 4 + Math.random() * 6; },
    setParam(v) { const L = Math.max(0, Math.min(4, Math.round(v))); if (!t0) lvl.snap(L); else lvl.set(L); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const t = lvl.step(dt) / 4;
      const on = ease((now - t0) / ONSET);
      // thought loop: the same few neurons replay a few times
      if (now >= nextLoop && on > 0.8) {
        if (Math.random() < 0.35 + 0.6 * t) loop = { ids: api.cluster(3 + Math.round(t * 2)), reps: 3 + Math.round(t * 2), at: now };
        nextLoop = now + 9 + Math.random() * 8 - t * 4;
      }
      if (loop && now >= loop.at) {
        api.fireIds(loop.ids, 0.25);
        loop.reps -= 1;
        loop.at = now + 1.4;
        if (loop.reps <= 0) loop = null;
      }
      api.setMods(blend({
        transmit: 1 - (0.12 + 0.3 * t),
        timeScale: 1 - (0.12 + 0.33 * t),
        speed: 0.95 - 0.15 * t,
        spont: 0.95,
        trails: 0.35 + 0.5 * t,
        focusWander: 0.4 + 0.8 * t,
        sat: 1.08 + 0.12 * t,
        gain: 1.02,
        tint: [1.03, 0.98, 1.04],
      }, on));
    },
  };
}

// ── Rolling (MDMA) ──────────────────────────────────────────────────────────
// Grounding: MDMA reverses the serotonin transporter, releasing large amounts of
// serotonin, with additional dopamine and noradrenaline release and a rise in
// oxytocin. Reported effects are euphoria, emotional warmth and closeness, and
// heightened sensation; jaw clenching (bruxism) is a common physical effect.
// Rendered as: broad synchronised waves rolling through the network, a slow
// warm breathing rhythm, warm colour, richer saturation and soft trails.
const MDMA = ['Light', 'Typical', 'Strong'];
function rolling(api) {
  const ONSET = 30;          // compressed from roughly 30-60 minutes
  const lvl = eased(1, 0.5);
  let t0 = 0, last = 0, nextWave = 0;
  return {
    start() {
      t0 = last = performance.now() / 1000;
      nextWave = t0 + 8;
      api.setModColor('#ff9070'); // warm coral pulses
    },
    setParam(v) { const L = Math.max(0, Math.min(2, Math.round(v))); if (!t0) lvl.snap(L); else lvl.set(L); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const k = 0.55 + (lvl.step(dt) / 2) * 0.45;   // light 0.55, typical ~0.78, strong 1
      const on = ease((now - t0) / ONSET);
      if (now >= nextWave && on > 0.3) {
        api.wave({ speed: 12, reach: 38 + 12 * k, max: Math.round(28 + 22 * k), jitter: 0.25 });
        nextWave = now + lerp(7.5, 3.5, k) * (0.8 + Math.random() * 0.4);
      }
      const breath = 0.5 + 0.5 * Math.sin(now * Math.PI * 2 * 0.22);
      api.setMods(blend({
        gain: (1 + 0.08 * k) * (1 + 0.08 * k * breath),
        sat: 1 + 0.35 * k,
        spont: 1 + 0.4 * k,
        transmit: 1 + 0.2 * k,
        speed: 1 + 0.1 * k,
        trails: 0.45 * k,
        spark: 1 + 0.5 * k,
        pulseMix: 0.8 * k,
        shake: 0.006 * k,                                            // jaw clench, faintly
        tint: [1 + 0.06 * k, 1 - 0.01 * k, 1 - 0.03 * k],
      }, on));
    },
  };
}

// ── Amphetamines ────────────────────────────────────────────────────────────
// Grounding: amphetamines reverse dopamine and noradrenaline transporters and
// release vesicular stores, raising both sharply. Effects are heightened
// arousal, alertness, narrowed and intensified focus, and speed; higher doses
// bring restlessness and tremor. Rendered as: faster time and travel, rapid
// small bursts, more spontaneous firing, sharper focus with less blur, a
// tunnel vignette, cool white pulses, and a fine tremor at the top end.
const AMPH = ['Low', 'Moderate', 'High'];
function amphetamines(api) {
  const ONSET = 20;
  const lvl = eased(1, 0.5);
  let t0 = 0, last = 0, nextBurst = 0;
  return {
    start() {
      t0 = last = performance.now() / 1000;
      nextBurst = t0 + 3;
      api.setModColor('#eaf6ff'); // cold white
    },
    setParam(v) { const L = Math.max(0, Math.min(2, Math.round(v))); if (!t0) lvl.snap(L); else lvl.set(L); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const k = 0.5 + (lvl.step(dt) / 2) * 0.5;
      const on = ease((now - t0) / ONSET);
      if (now >= nextBurst && on > 0.2) {
        api.burst(2 + Math.round(2 * k), 0.02);
        nextBurst = now + lerp(2.5, 1.0, k) * (0.7 + Math.random() * 0.6);
      }
      api.setMods(blend({
        timeScale: 1 + 0.35 * k,
        speed: 1 + 0.4 * k,
        spont: 1 + 0.9 * k,
        transmit: 1 + 0.25 * k,
        blur: 1 - 0.45 * k,
        vignette: 0.35 + 0.4 * k,
        sat: 1 + 0.1 * k,
        gain: 1 + 0.06 * k,
        pulseMix: 0.5 * k,
        shake: 0.006 * Math.pow(k, 1.5) * (k > 0.8 ? 2 : 1),
      }, on));
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
  'Drunk (alcohol)': {
    factory: drunk,
    param: { min: 1, max: 8, step: 1, def: 3, label: (v) => `${v} drink${v === 1 ? '' : 's'}` },
  },
  'High (THC)': {
    factory: high,
    param: { min: 0, max: THC.length - 1, step: 1, def: 2, label: (v) => THC[v] },
  },
  'Rolling (MDMA)': {
    factory: rolling,
    param: { min: 0, max: MDMA.length - 1, step: 1, def: 1, label: (v) => MDMA[v] },
  },
  'Amphetamines': {
    factory: amphetamines,
    param: { min: 0, max: AMPH.length - 1, step: 1, def: 1, label: (v) => AMPH[v] },
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
    const { mood, altered, neuro } = e.detail;
    // one profile at a time for now: mood takes priority, then altered state
    const name = [mood, altered, neuro].find((n) => n && PROFILES[n]) || '';
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
