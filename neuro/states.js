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
  timeScale: 1, sway: 0, blur: 1, ghost: 0, trails: 0, vignette: 0, focusWander: 0, jitter: 0 };
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
// heightened sensation; jaw clenching (bruxism) is a common physical effect
// (not rendered: a camera tremor read as screen wobble rather than clenching).
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
        trails: 0.2 * k,                                             // soft, kept light: heavier trails read as wobble
        spark: 1 + 0.5 * k,
        pulseMix: 0.8 * k,
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

// ════════════════════════════════════════════════════════════════════════════
// Neurodivergence (base layer). Research pass, Nov 2026. Group-level findings;
// individuals vary widely. Rendered as differences, not deficits.
// ════════════════════════════════════════════════════════════════════════════

// ── Schizophrenia ───────────────────────────────────────────────────────────
// Findings: elevated striatal dopamine synthesis capacity (PET meta-analysis,
// ~14% above controls, large effect; Fusar-Poli & Meyer-Lindenberg 2013), the
// aberrant-salience account (Kapur 2003): irrelevant signals acquire meaning;
// robustly reduced 40 Hz gamma responses linked to parvalbumin interneurons
// (Grent-'t-Jong et al. 2023; Gonzalez-Burgos & Lewis 2012) - i.e. weaker
// timing precision and synchrony.
// Rendered: neurons flare with nothing behind them, sparks on silent branches,
// loosened signal timing, irregular salience storms, a faint violet cast.
const SZ = ['Low', 'Moderate', 'High'];
function schizophrenia(api) {
  const ONSET = 10;
  const lvl = eased(1, 0.4);
  let t0 = 0, last = 0, nextPhantom = 0, storm = null, nextStorm = 0;
  return {
    start() {
      t0 = last = performance.now() / 1000;
      nextPhantom = t0 + 2; nextStorm = t0 + ONSET + 4 + Math.random() * 6;
      api.setModColor('#c79bff');
    },
    setParam(v) { const L = Math.max(0, Math.min(2, Math.round(v))); if (!t0) lvl.snap(L); else lvl.set(L); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const k = 0.45 + (lvl.step(dt) / 2) * 0.55;
      const on = ease((now - t0) / ONSET);
      if (now >= nextPhantom && on > 0.2) {
        api.phantom({ flashes: Math.random() < 0.5 * k ? 1 : 0, sparks: 1 + Math.round(3 * k) });
        nextPhantom = now + lerp(2.6, 0.6, k) * (0.5 + Math.random());
      }
      // salience storm: a short cluster of meaning-without-cause
      if (now >= nextStorm && on > 0.8) {
        storm = { at: now, len: 1.5 + 2 * k };
        nextStorm = now + lerp(16, 7, k) + Math.random() * 6;
      }
      let st = 0;
      if (storm) {
        const age = now - storm.at;
        if (age > storm.len) storm = null;
        else {
          st = Math.sin(Math.PI * age / storm.len);
          if (Math.random() < dt * 9) api.phantom({ flashes: 1, sparks: 3 });
        }
      }
      api.setMods(blend({
        jitter: 0.12 + 0.38 * k,                 // weaker timing precision
        spont: 1 + 0.35 * k,
        transmit: 1 + 0.08 * k,
        spark: 1 + 0.6 * k + st * 0.8,
        gain: 1 + st * 0.12 * k,
        sat: 1 + 0.06 * k,
        pulseMix: 0.25 * k + st * 0.3,
        focusWander: 0.25 * k + st * 0.4,
        tint: [1 + 0.02 * k, 1 - 0.02 * k, 1 + 0.05 * k],
      }, on));
    },
  };
}

// ── ADHD ────────────────────────────────────────────────────────────────────
// Findings: default-mode interference hypothesis (Sonuga-Barke & Castellanos
// 2007): task-negative network activity fails to stay suppressed and intrudes
// periodically; increased intra-individual reaction-time variability, often
// slow (<0.1 Hz) fluctuations (Tamm et al. 2012 review; Karalunas et al.);
// catecholamine (dopamine/noradrenaline) signalling differences, the target of
// stimulant medication. Hyperfocus is widely reported, less studied.
// Rendered: slow surges and sags in pace; attention lapses where focus jumps
// off-subject while activity erupts at the edges; occasional hyperfocus spells
// (tunnel, crisp, steady). Slider: DSM presentations.
const ADHD_P = ['Inattentive', 'Combined', 'Hyperactive-impulsive'];
function adhd(api) {
  const ONSET = 6;
  const lvl = eased(1, 0.5);
  let t0 = 0, last = 0, nextLapse = 0, lapse = null, hyper = null, nextHyper = 0, phase = Math.random() * 10;
  return {
    start() {
      t0 = last = performance.now() / 1000;
      nextLapse = t0 + ONSET + 2 + Math.random() * 4;
      nextHyper = t0 + ONSET + 14 + Math.random() * 10;
      api.setModColor('#bff4ff');
    },
    setParam(v) { const L = Math.max(0, Math.min(2, Math.round(v))); if (!t0) lvl.snap(L); else lvl.set(L); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const h = lvl.step(dt) / 2;                // 0 inattentive .. 1 hyperactive-impulsive
      const ia = 1 - h * 0.6;                    // inattentive weight
      const on = ease((now - t0) / ONSET);
      // slow variability: pace surges and sags on a ~0.05-0.08 Hz cycle
      const slow = Math.sin(now * 0.33 + phase) * 0.6 + Math.sin(now * 0.51 + phase * 2) * 0.4;
      if (!hyper && now >= nextLapse && on > 0.6) {
        lapse = { at: now, len: 1.2 + Math.random() * 1.6 * ia };
        api.focusTo(Math.random() < 0.5 ? 4 + Math.random() * 3 : 28 + Math.random() * 12, lapse.len);
        api.burstPeriphery(3 + Math.round(3 * h), 0.05);
        nextLapse = now + lerp(5, 9, h) * (0.6 + Math.random() * 0.8) / (0.6 + ia * 0.6);
      }
      if (lapse && now - lapse.at > lapse.len) lapse = null;
      if (!hyper && now >= nextHyper) { hyper = { at: now, len: 6 + Math.random() * 5 }; lapse = null; }
      let hf = 0;
      if (hyper) {
        const age = now - hyper.at;
        if (age > hyper.len) { hyper = null; nextHyper = now + 22 + Math.random() * 16; nextLapse = now + 3; }
        else hf = Math.min(1, age / 0.8, (hyper.len - age) / 0.8);
      }
      const lp = lapse ? 1 : 0;
      api.setMods(blend({
        speed: (1 + 0.12 * h + slow * (0.18 + 0.12 * h)) * (1 - 0.15 * hf),
        spont: 1 + 0.35 * h + 0.25 * ia * lp,
        timeScale: 1 + 0.08 * h - 0.06 * hf,
        transmit: 1 + 0.05 * h,
        focusWander: (0.35 * ia + 0.15) * (1 - hf),
        shake: 0.004 * h * (1 - hf),
        blur: 1 + 0.25 * lp - 0.4 * hf,
        vignette: 0.75 * hf,
        sat: 1 + 0.1 * hf,
        gain: 1 + 0.05 * hf,
        pulseMix: 0.45 * hf,
      }, on));
    },
  };
}

// ── Tourette's ──────────────────────────────────────────────────────────────
// Findings: cortico-striato-thalamo-cortical (CSTC) loop dysfunction; post-
// mortem reductions in striatal interneurons, including cholinergic
// tonically-active neurons that normally counterbalance dopamine (Kataoka et al.
// 2010; review Bloch, State & Pittenger); dopamine involvement (antagonists
// reduce tics). Tics are commonly preceded by a premonitory urge, linked to the
// insula and supplementary motor area (Wohlgemuth et al. 2025 scoping review);
// tics can be briefly suppressed, after which the urge resolves on release.
// Rendered: tension builds (tightening frame, rising tremor, amber tint), then
// the same loop of neurons discharges with a sharp jolt, followed by relief.
const TS = ['Occasional', 'Frequent', 'Persistent'];
function tourettes(api) {
  const ONSET = 5;
  const lvl = eased(1, 0.5);
  let t0 = 0, last = 0, loopIds = [], urge = null, relief = 0, tic = null;
  function newUrge(now, k) {
    const suppressed = Math.random() < 0.25;              // held back longer, released harder
    urge = { at: now, len: (lerp(7, 2.5, k) + Math.random() * 2.5) * (suppressed ? 1.8 : 1), mag: suppressed ? 1.5 : 1 };
  }
  return {
    start() { t0 = last = performance.now() / 1000; api.setModColor('#ffc27a'); },
    setParam(v) { const L = Math.max(0, Math.min(2, Math.round(v))); if (!t0) lvl.snap(L); else lvl.set(L); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const k = lvl.step(dt) / 2;
      const on = ease((now - t0) / ONSET);
      if (!loopIds.length || Math.random() < dt * 0.02) loopIds = api.cluster(4 + Math.round(2 * k)); // the habitual loop
      if (!urge && !tic && on > 0.8 && now > relief) newUrge(now, k);
      let u = 0;
      if (urge) {
        u = Math.min(1, (now - urge.at) / urge.len);
        if (u >= 1) {
          api.fireIds(loopIds, 0.03);
          if (Math.random() < 0.5) api.fireIds(loopIds, 0.03);
          tic = { at: now, mag: urge.mag };
          urge = null;
          relief = now + 1.2 + Math.random() * (2.5 - 1.5 * k);
        }
      }
      let jolt = 0;
      if (tic) {
        const age = now - tic.at;
        if (age > 1.5) tic = null;
        else jolt = Math.exp(-age / 0.18) * tic.mag;
      }
      const tension = u * u;
      api.setMods(blend({
        vignette: 0.45 * tension,
        shake: 0.006 * tension + 0.05 * jolt,
        spark: 1 + 0.5 * tension + 1.2 * jolt,
        gain: 1 + 0.05 * tension + 0.22 * jolt,
        pulseMix: 0.5 * tension + 0.4 * jolt,
        fov: -2.2 * jolt,
        spont: 1 + 0.15 * k,
        transmit: 1 + 0.06 * k,
        tint: [1 + 0.03 * tension, 1, 1 - 0.03 * tension],
      }, on));
    },
  };
}

// ── Autism ──────────────────────────────────────────────────────────────────
// Findings (kept to the better-supported end): excitation/inhibition imbalance
// hypothesis (Rubenstein & Merzenich 2003) - direction still disputed;
// connectivity findings are mixed (local and long-range over- and under-
// connectivity both reported), so they are not modelled directly. Predictive-
// processing accounts propose less weight on prior expectation relative to
// sensory input ("hypo-priors"), consistent with widely reported sensory
// hypersensitivity and attention to detail.
// Rendered: crisper, more detailed and vivid responses; every event lands with
// more intensity; more fine-grained local activity; no smoothing waves; periodic
// sensory surges. Slider: sensory sensitivity.
const AUT = ['Low', 'Moderate', 'High'];
function autism(api) {
  const ONSET = 6;
  const lvl = eased(1, 0.5);
  let t0 = 0, last = 0, nextSurge = 0, surge = null;
  return {
    start() { t0 = last = performance.now() / 1000; nextSurge = t0 + ONSET + 3; api.setModColor('#dcd0ff'); },
    setParam(v) { const L = Math.max(0, Math.min(2, Math.round(v))); if (!t0) lvl.snap(L); else lvl.set(L); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const k = 0.4 + (lvl.step(dt) / 2) * 0.6;
      const on = ease((now - t0) / ONSET);
      if (now >= nextSurge && on > 0.6) {
        surge = { at: now, len: 2.2 + 1.5 * k };
        api.burst(4 + Math.round(4 * k), 0.025);
        api.phantom({ flashes: 0, sparks: 6 + Math.round(8 * k) });
        nextSurge = now + lerp(13, 6, k) * (0.7 + Math.random() * 0.6);
      }
      let sg = 0;
      if (surge) {
        const age = now - surge.at;
        if (age > surge.len) surge = null;
        else sg = Math.min(1, age / 0.25) * Math.exp(-age / (surge.len * 0.5));
      }
      api.setMods(blend({
        blur: 1 - 0.45 * k,                       // detail stays sharp throughout the depth
        spark: 1 + 0.7 * k + 0.9 * sg,
        sat: 1 + 0.15 * k + 0.12 * sg,
        gain: 1 + 0.04 * k + 0.18 * sg,
        spont: 1 + 0.3 * k,                       // more fine-grained local activity
        transmit: 1 + 0.05 * k,
        pulseMix: 0.35 * k + 0.3 * sg,
        fov: -1.2 * sg,
        vignette: 0.25 * sg,
      }, on));
    },
  };
}

// ── Bipolar / Mania ─────────────────────────────────────────────────────────
// Findings: reward/behavioural-approach hypersensitivity, particularly
// implicated in hypomania/mania (Alloy et al. 2015 review); circadian
// dysregulation as vulnerability and course factor (ISBD chronobiology task
// force); a proposed circadian-dopamine link (2025 review). Depressive episodes
// show reduced reward responsiveness. Episodes are the defining feature.
// Rendered on one axis, p = -1 (depressive) .. 0 (balanced) .. +1 (manic):
// depressive: slow, sparse, dim, cool, rumination loops; manic: fast, dense,
// saturated, warm, frequent spreading waves and reward-like bursts.
const BIP = ['Depressive', 'Low', 'Balanced', 'Hypomanic', 'Manic'];
const MANIA = ['Hypomania', 'Mania', 'Severe mania'];
function polar(api, axisOf) {
  const ONSET = 10;
  const ax = eased(0, 0.25);                 // mood shifts gradually
  let t0 = 0, last = 0, nextWave = 0, nextBurst = 0, loop = null, nextLoop = 0;
  return {
    start() {
      t0 = last = performance.now() / 1000;
      nextWave = t0 + 4; nextBurst = t0 + 3; nextLoop = t0 + 6;
      api.setModColor('#ffbf6b');
    },
    setParam(v) { const p = axisOf(v); if (!t0) ax.snap(p); else ax.set(p); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const p = ax.step(dt);
      const up = Math.max(0, p), dn = Math.max(0, -p);
      const on = ease((now - t0) / ONSET);
      if (up > 0.3 && on > 0.5) {
        if (now >= nextWave) { api.wave({ speed: 16, reach: 30 + 20 * up, max: Math.round(20 + 25 * up), jitter: 0.2 }); nextWave = now + lerp(9, 3, Math.min(1, up)); }
        if (now >= nextBurst) { api.burst(3 + Math.round(4 * up), 0.03); nextBurst = now + lerp(5, 1.4, Math.min(1, up)) * (0.6 + Math.random() * 0.8); }
      }
      if (dn > 0.4 && on > 0.5) {
        // rumination: the same small cluster replays
        if (!loop && now >= nextLoop) { loop = { ids: api.cluster(3), reps: 3 + Math.round(3 * dn), at: now }; }
        if (loop && now >= loop.at) {
          api.fireIds(loop.ids, 0.3, false);
          loop.reps -= 1; loop.at = now + 2.2;
          if (loop.reps <= 0) { loop = null; nextLoop = now + 6 + Math.random() * 6; }
        }
      }
      const u = Math.min(1.3, up);
      api.setMods(blend({
        speed: 1 + 0.4 * u - 0.28 * dn,
        timeScale: 1 + 0.18 * u - 0.12 * dn,
        spont: 1 + 0.8 * u - 0.55 * dn,
        transmit: 1 + 0.22 * u - 0.15 * dn,
        sat: 1 + 0.32 * u - 0.3 * dn,
        gain: 1 + 0.1 * u - 0.15 * dn,
        spark: 1 + 0.6 * u - 0.3 * dn,
        trails: 0.25 * Math.max(0, u - 0.4),     // racing thoughts at the top end
        pulseMix: 0.5 * u,
        focusWander: 0.35 * Math.max(0, u - 0.6),
        vignette: 0.3 * dn,
        tint: [1 + 0.04 * u - 0.06 * dn, 1 - 0.01 * u - 0.02 * dn, 1 - 0.03 * u + 0.06 * dn],
      }, on));
    },
  };
}
const bipolar = (api) => polar(api, (v) => [-1, -0.5, 0, 0.5, 1][Math.max(0, Math.min(4, Math.round(v)))]);
const mania = (api) => polar(api, (v) => [0.55, 1.0, 1.3][Math.max(0, Math.min(2, Math.round(v)))]);

// ── SSRI withdrawal (antidepressant discontinuation) ─────────────────────────
// Findings: Henssler et al. 2024 (Lancet Psychiatry, 79 studies, ~21,000 people):
// discontinuation symptoms in ~31% after stopping antidepressants vs ~17% after
// placebo; severe in ~2.8% vs ~0.6% - common, mostly mild, partly non-specific.
// Dizziness is the most frequently reported symptom; "brain zaps" (brief
// electric-shock-like sensations) are well documented and most associated with
// abrupt cessation (Papp & Onton 2018), which tapering mitigates only partly.
// Shorter half-life drugs (e.g. paroxetine) are linked to more reports. The
// neurobiology remains unresolved (review, Frontiers), so no specific mechanism
// is modelled. Movement as a zap trigger comes from patient reports and was
// not verified in the research pass.
// Rendered: dizziness (sway, slight smear, faint doubling), jumpy reactivity,
// a dimmer, flatter mood, and the signature brain zap: a near-instant electric
// jolt through the whole network. Slider: how the medication was stopped.
const TAPER = ['Abrupt stop', 'Fast taper', 'Slow taper'];
function ssriWithdrawal(api) {
  const ONSET = 12;
  const sev = eased(1, 0.4);
  let t0 = 0, last = 0, nextZap = 0, zap = null, moveEnergy = 0;
  const onMove = (e) => { moveEnergy = Math.min(1, moveEnergy + Math.hypot(e.movementX || 0, e.movementY || 0) / 900); };
  return {
    start() {
      t0 = last = performance.now() / 1000;
      nextZap = t0 + 5 + Math.random() * 5;
      api.setModColor('#e6f6ff'); // electric white-blue
      addEventListener('pointermove', onMove, { passive: true });
    },
    stop() { removeEventListener('pointermove', onMove); },
    setParam(v) {
      const L = Math.max(0, Math.min(2, Math.round(v)));
      const k = [1, 0.6, 0.3][L];
      if (!t0) sev.snap(k); else sev.set(k);
    },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const k = sev.step(dt);
      const on = ease((now - t0) / ONSET);
      moveEnergy *= Math.pow(0.4, dt);
      // brain zap: on a loose schedule, more likely just after movement
      const due = now >= nextZap || (on > 0.6 && moveEnergy > 0.35 && Math.random() < dt * 2.5 * k);
      if (due && on > 0.4 && (!zap || now - zap.at > 1.2)) {
        zap = { at: now, mag: 0.7 + 0.5 * Math.random() };
        api.wave({ speed: 140, reach: 60, max: 45, depth: 10, jitter: 0.02 });
        if (Math.random() < 0.3) setTimeout(() => api.wave({ speed: 140, reach: 50, max: 30, depth: 12, jitter: 0.02 }), 140);
        nextZap = now + lerp(16, 4, k) * (0.6 + Math.random() * 0.8);
        moveEnergy = 0;
      }
      let z = 0;
      if (zap) {
        const age = now - zap.at;
        z = Math.exp(-age / 0.11) * zap.mag;
        if (age > 2) zap = null;
      }
      const sway = 0.12 + 0.45 * k;                        // dizziness
      api.setMods(blend({
        sway: sway * (1 + 0.6 * Math.sin(now * 0.7) ** 2),
        trails: 0.18 * k,
        ghost: 0.12 * k + 0.45 * z,
        transmit: 1 + 0.15 * k,                            // jumpy, irritable reactivity
        spont: 1 + 0.2 * k,
        jitter: 0.12 * k,
        sat: (1 - 0.15 * k) * (1 - 0.35 * z),              // flatter mood, bleached at the zap
        gain: (1 - 0.08 * k) * (1 + 0.65 * z),
        spark: 1 + 2.2 * z,
        pulseMix: Math.min(1, 0.95 * z + 0.15 * k),
        fov: -2.6 * z,
        shake: 0.05 * z,
        tint: [1 - 0.02 * k, 1, 1 + 0.04 * k],
      }, on));
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Moods (layer above neurodivergence). Research pass Nov 2026: findings for
// moods are group-level and partly contested; noted per profile.
// ════════════════════════════════════════════════════════════════════════════

// ── Excited ─────────────────────────────────────────────────────────────────
// Findings: arousal is driven by the locus coeruleus-noradrenaline system;
// LC activation produces cortical EEG desynchronization (optogenetic and
// stimulation studies, reviews PMC6742544, PMC3278579), and adaptive-gain
// accounts (Aston-Jones & Cohen 2005) describe sharper, higher-gain responses.
// Rendered: faster and busier, independent (desynchronised) firing, quick
// flurries of activity, brighter sparks, a warm bright cast.
const EXC = ['Mild', 'Lively', 'Thrilled'];
function excited(api) {
  const ONSET = 4;
  const lvl = eased(1, 0.6);
  let t0 = 0, last = 0, nextFlurry = 0, flurry = null;
  return {
    start() { t0 = last = performance.now() / 1000; nextFlurry = t0 + 2; api.setModColor('#ffd27a'); },
    setParam(v) { const L = Math.max(0, Math.min(2, Math.round(v))); if (!t0) lvl.snap(L); else lvl.set(L); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const k = 0.45 + (lvl.step(dt) / 2) * 0.55;
      const on = ease((now - t0) / ONSET);
      if (now >= nextFlurry && on > 0.5) {
        flurry = { at: now, n: 3 + Math.round(4 * k), i: 0 };
        nextFlurry = now + lerp(6, 2.2, k) * (0.6 + Math.random() * 0.8);
      }
      if (flurry && now - flurry.at > flurry.i * 0.18) {
        api.burst(2 + Math.round(2 * k), 0.02);
        flurry.i++;
        if (flurry.i >= flurry.n) flurry = null;
      }
      const surge = 0.5 + 0.5 * Math.sin(now * 0.9);
      api.setMods(blend({
        speed: 1 + 0.3 * k + 0.12 * k * surge,
        timeScale: 1 + 0.15 * k,
        spont: 1 + 0.7 * k,
        transmit: 1 + 0.08 * k,
        jitter: 0.06 * k,                         // independent, less synchronised firing
        spark: 1 + 0.6 * k,
        sat: 1 + 0.2 * k,
        gain: 1 + 0.07 * k,
        pulseMix: 0.4 * k,
        tint: [1 + 0.04 * k, 1 + 0.02 * k, 1 - 0.02 * k],
      }, on));
    },
  };
}

// ── Sad ─────────────────────────────────────────────────────────────────────
// Findings: transient sadness induction raises subgenual cingulate (limbic)
// activity and lowers right dorsolateral prefrontal / parietal activity, a
// reciprocal limbic-cortical pattern (Mayberg et al. 1999); a later meta-
// analysis ties a specific subgenual subregion (s24) to sadness. Unlike
// depression, normal sadness is transient and reward responsiveness persists.
// Rendered: slower, quieter, cooler and greyer, but still responsive; slow
// sighs that dim and sink the view; activity lingers a little.
const SAD = ['Wistful', 'Sad', 'Grieving'];
function sad(api) {
  const ONSET = 8;
  const lvl = eased(1, 0.4);
  let t0 = 0, last = 0, nextSigh = 0, sigh = null;
  return {
    start() { t0 = last = performance.now() / 1000; nextSigh = t0 + ONSET; api.setModColor('#9fb8ff'); },
    setParam(v) { const L = Math.max(0, Math.min(2, Math.round(v))); if (!t0) lvl.snap(L); else lvl.set(L); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const k = 0.4 + (lvl.step(dt) / 2) * 0.6;
      const on = ease((now - t0) / ONSET);
      if (now >= nextSigh) { sigh = { at: now, len: 3.5 + 1.5 * k }; nextSigh = now + lerp(16, 8, k) + Math.random() * 5; }
      let sg = 0;
      if (sigh) {
        const age = now - sigh.at;
        if (age > sigh.len) sigh = null;
        else sg = Math.sin(Math.PI * age / sigh.len);
      }
      api.setMods(blend({
        speed: 1 - 0.25 * k - 0.1 * sg,
        timeScale: 1 - 0.1 * k,
        spont: 1 - 0.3 * k,
        transmit: 1 - 0.05 * k,                   // still responsive
        sat: 1 - 0.25 * k - 0.1 * sg,
        gain: 1 - 0.1 * k - 0.1 * sg,
        trails: 0.15 * k,                         // things linger
        vignette: 0.2 * k + 0.2 * sg,
        sway: 0.12 * sg,
        pulseMix: 0.35 * k,
        tint: [1 - 0.06 * k, 1 - 0.02 * k, 1 + 0.06 * k],
      }, on));
    },
  };
}

// ── Depressed ───────────────────────────────────────────────────────────────
// Findings: reward circuitry shows blunted ventral-striatal responses with
// orbitofrontal hyper-responses (2019 meta-analysis, 41 studies), and reduced
// nucleus-accumbens network connectivity linked to anhedonia severity (2022
// meta/mega-analysis). Default-mode hyperconnectivity and its link to
// rumination are contested (2016 meta-analysis vs later null/opposite
// findings), so rumination is modelled conservatively as occasional replay.
// Rendered: sparse, slow, heavily desaturated and dim; signals fade before
// they travel far; the same small cluster replays now and then.
const DEP = ['Mild', 'Moderate', 'Severe'];
function depressed(api) {
  const ONSET = 10;
  const lvl = eased(1, 0.3);
  let t0 = 0, last = 0, loop = null, nextLoop = 0;
  return {
    start() { t0 = last = performance.now() / 1000; nextLoop = t0 + ONSET; api.setModColor('#8f97a8'); },
    setParam(v) { const L = Math.max(0, Math.min(2, Math.round(v))); if (!t0) lvl.snap(L); else lvl.set(L); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const k = 0.4 + (lvl.step(dt) / 2) * 0.6;
      const on = ease((now - t0) / ONSET);
      if (!loop && now >= nextLoop && on > 0.7) loop = { ids: api.cluster(3), reps: 2 + Math.round(3 * k), at: now };
      if (loop && now >= loop.at) {
        api.fireIds(loop.ids, 0.35, false);
        loop.reps -= 1; loop.at = now + 2.6;
        if (loop.reps <= 0) { loop = null; nextLoop = now + lerp(18, 8, k) + Math.random() * 6; }
      }
      api.setMods(blend({
        speed: 1 - 0.35 * k,
        timeScale: 1 - 0.15 * k,
        spont: 1 - 0.55 * k,
        transmit: 1 - 0.3 * k,                    // blunted: signals fizzle
        spark: 1 - 0.4 * k,
        sat: 1 - 0.5 * k,
        gain: 1 - 0.2 * k,
        vignette: 0.35 * k,
        blur: 1 + 0.25 * k,
        pulseMix: 0.5 * k,
        tint: [1 - 0.03 * k, 1 - 0.03 * k, 1 + 0.01 * k],
      }, on));
    },
  };
}

// ── Relieved ────────────────────────────────────────────────────────────────
// Findings: relief behaves as a reward; its pleasantness tracks nucleus
// accumbens activity (Leknes et al. 2011), and unexpected omission of threat
// triggers reward-prediction-error-like signals in reward and salience
// regions (Willems et al. 2023, eLife; the formal RPE interpretation is
// debated). Relief depends on a prior negative expectation.
// Rendered as a cycle: tension builds (tight, cool, jittery), then the threat
// lifts - a warm wave releases outward, the frame opens, pace eases - followed
// by a calm afterglow. Slider: size of the threat (bigger threat, bigger relief).
const REL = ['Minor', 'Moderate', 'Major'];
function relieved(api) {
  const ONSET = 3;
  const lvl = eased(1, 0.5);
  let t0 = 0, last = 0, phase = 'tense', at = 0, len = 0;
  const begin = (p, now, k) => {
    phase = p; at = now;
    len = p === 'tense' ? lerp(5, 9, k) * (0.8 + Math.random() * 0.4) : lerp(7, 11, k);
  };
  return {
    start() { t0 = last = performance.now() / 1000; begin('tense', t0, 0.5); api.setModColor('#ffd9a0'); },
    setParam(v) { const L = Math.max(0, Math.min(2, Math.round(v))); if (!t0) lvl.snap(L); else lvl.set(L); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const k = 0.4 + (lvl.step(dt) / 2) * 0.6;
      const on = ease((now - t0) / ONSET);
      const age = now - at;
      if (phase === 'tense' && age > len) {
        begin('release', now, k);
        api.wave({ speed: 10, reach: 45, max: Math.round(20 + 20 * k), depth: 16, jitter: 0.3 });
      } else if (phase === 'release' && age > len) begin('tense', now, k);
      let tension = 0, release = 0;
      if (phase === 'tense') tension = ease(age / len);
      else release = Math.exp(-age / (len * 0.45));
      api.setMods(blend({
        vignette: 0.45 * k * tension,
        jitter: 0.15 * k * tension,
        shake: 0.004 * k * tension,
        spont: 1 + 0.25 * k * tension - 0.15 * (1 - tension) * (phase === 'release' ? 1 : 0),
        speed: 1 + 0.1 * k * tension - 0.2 * release,
        sat: 1 - 0.1 * tension + 0.25 * k * release,
        gain: 1 - 0.04 * tension + 0.15 * k * release,
        spark: 1 + 0.6 * k * release,
        pulseMix: 0.7 * k * release,
        fov: 1.5 * k * release,                   // the frame opens up
        tint: [1 - 0.03 * tension + 0.06 * k * release, 1 + 0.02 * k * release, 1 + 0.04 * tension - 0.04 * k * release],
      }, on));
    },
  };
}

// ── Aroused ─────────────────────────────────────────────────────────────────
// Findings: sexual arousal consistently engages hypothalamus and striatum
// (incl. ventral striatum) across fMRI meta-analyses (2019 meta-analysis: the
// neural basis does not differ between women and men; 2023 review), with
// deactivations in regions for introspection and social cognition that may
// release inhibition (Poeppl et al. 2014). The hypothalamus drives autonomic
// responses. Rendered: a slow rhythm that builds in tempo and warmth in waves,
// attention narrowing to the centre (vignette, little wandering), activity
// concentrating centrally, warm ember tones. Kept abstract.
const ARO = ['Low', 'Building', 'High'];
function aroused(api) {
  const ONSET = 6;
  const lvl = eased(1, 0.4);
  let t0 = 0, last = 0, cycleAt = 0, nextBeat = 0;
  return {
    start() { t0 = last = cycleAt = performance.now() / 1000; nextBeat = t0 + 2; api.setModColor('#ffa040'); },
    setParam(v) { const L = Math.max(0, Math.min(2, Math.round(v))); if (!t0) lvl.snap(L); else lvl.set(L); },
    frame(now) {
      const dt = Math.min(now - last, 0.5); last = now;
      const k = 0.4 + (lvl.step(dt) / 2) * 0.6;
      const on = ease((now - t0) / ONSET);
      // crescendo cycles: tempo and intensity rise, then settle and begin again
      const CYCLE = lerp(32, 22, k);
      let c = (now - cycleAt) / CYCLE;
      if (c >= 1) { cycleAt = now; c = 0; }
      const build = c < 0.85 ? ease(c / 0.85) : 1 - ease((c - 0.85) / 0.15);
      if (now >= nextBeat && on > 0.4) {
        api.burst(2 + Math.round(3 * k * build), 0.03);
        nextBeat = now + lerp(3.2, 0.8, build * k);
      }
      const beat = Math.pow(0.5 + 0.5 * Math.sin(now * (1.2 + 2.4 * build * k)), 3);
      api.setMods(blend({
        speed: 1 + 0.15 * k * build,
        spont: 1 + 0.5 * k * build,
        transmit: 1 + 0.12 * k * build,
        sat: 1 + 0.25 * k * build,
        gain: 1 + 0.06 * k * build + 0.05 * beat * build,
        spark: 1 + 0.5 * k * build,
        vignette: 0.15 + 0.35 * k * build,        // attention narrows
        blur: 1 + 0.2 * k * build,                // background falls away
        pulseMix: 0.25 + 0.5 * k * build,
        tint: [1 + 0.07 * k * build, 1 - 0.01 * k * build, 1 - 0.05 * k * build],
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
  'Excited': { factory: excited, param: { min: 0, max: 2, step: 1, def: 1, label: (v) => EXC[v] } },
  'Sad': { factory: sad, param: { min: 0, max: 2, step: 1, def: 1, label: (v) => SAD[v] } },
  'Depressed': { factory: depressed, param: { min: 0, max: 2, step: 1, def: 1, label: (v) => DEP[v] } },
  'Relieved': { factory: relieved, param: { min: 0, max: 2, step: 1, def: 1, label: (v) => REL[v] } },
  'Aroused': { factory: aroused, param: { min: 0, max: 2, step: 1, def: 1, label: (v) => ARO[v] } },
  'SSRI withdrawal': { factory: ssriWithdrawal, param: { min: 0, max: 2, step: 1, def: 0, label: (v) => TAPER[v] } },
  'Schizophrenia': { factory: schizophrenia, param: { min: 0, max: 2, step: 1, def: 1, label: (v) => SZ[v] } },
  'ADHD': { factory: adhd, param: { min: 0, max: 2, step: 1, def: 1, label: (v) => ADHD_P[v] } },
  "Tourette's": { factory: tourettes, param: { min: 0, max: 2, step: 1, def: 1, label: (v) => TS[v] } },
  'Autism': { factory: autism, param: { min: 0, max: 2, step: 1, def: 1, label: (v) => AUT[v] } },
  'Bipolar': { factory: bipolar, param: { min: 0, max: 4, step: 1, def: 2, label: (v) => BIP[v] } },
  'Mania': { factory: mania, param: { min: 0, max: 2, step: 1, def: 1, label: (v) => MANIA[v] } },
};

export const isCalibrated = (name) => !!PROFILES[name];
export const paramSpec = (name) => (PROFILES[name] ? PROFILES[name].param : null);

// ── Layering ────────────────────────────────────────────────────────────────
// Neurodivergence is the standing base layer; mood and altered state sit on top.
// Each active profile writes into its own layer; layers are combined every frame:
// strength-type modifiers multiply, overlay-type modifiers add (with caps), and
// pulse colours blend by how strongly each layer tints its pulses.
// NOTE: combinations of two or more states are a theoretical extrapolation; the
// individual states are grounded in findings, their interactions are not studied.
const SLOTS = ['neuro', 'mood', 'altered'];
const MULT = ['gain', 'sat', 'speed', 'spont', 'spark', 'transmit', 'timeScale', 'blur'];
const ADD = { fov: [-8, 8], shake: [0, 0.12], sway: [0, 2], ghost: [0, 0.8], trails: [0, 0.94],
  vignette: [0, 1.2], focusWander: [0, 2], pulseMix: [0, 1], jitter: [0, 0.8] };
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function combine(layers) {
  const out = {};
  for (const k of MULT) out[k] = layers.reduce((acc, L) => acc * (L.mods[k] != null ? L.mods[k] : 1), 1);
  for (const k of Object.keys(ADD)) out[k] = clamp(layers.reduce((acc, L) => acc + (L.mods[k] || 0), 0), ADD[k]);
  out.tint = [0, 1, 2].map((i) => layers.reduce((acc, L) => acc * (L.mods.tint ? L.mods.tint[i] : 1), 1));
  // colour: weighted by each layer's own pulse tint strength
  let w = 0;
  const col = [0, 0, 0];
  for (const L of layers) {
    const m = L.mods.pulseMix || 0;
    if (m <= 0 || !L.color) continue;
    const c = hexToRgb(L.color);
    for (let i = 0; i < 3; i++) col[i] += c[i] * m;
    w += m;
  }
  return { mods: out, color: w > 0 ? rgbToHex(col.map((v) => v / w)) : null };
}

export function initStates(api) {
  const values = {}; // remembered parameter per state for this visit
  for (const [n, p] of Object.entries(PROFILES)) values[n] = p.param.def;
  const slots = {};  // slot -> { name, profile, mods, color }

  // per-layer proxy: profiles write to their own layer, everything else passes through
  function layerApi(layer) {
    return {
      ...api,
      setMods: (o) => { Object.assign(layer.mods, o); },
      setModColor: (hex) => { layer.color = hex; },
      resetMods: () => { layer.mods = {}; },
    };
  }

  window.addEventListener('neuro:state', (e) => {
    const picks = e.detail;
    for (const slot of SLOTS) {
      const name = picks[slot] && PROFILES[picks[slot]] ? picks[slot] : '';
      const cur = slots[slot];
      if ((cur ? cur.name : '') === name) continue;
      if (cur && cur.profile.stop) cur.profile.stop();
      delete slots[slot];
      if (name) {
        const layer = { name, mods: {}, color: null };
        layer.profile = PROFILES[name].factory(layerApi(layer));
        layer.profile.setParam(values[name]);
        layer.profile.start();
        slots[slot] = layer;
      }
    }
    if (!Object.keys(slots).length) api.resetMods();
  });

  function loop() {
    requestAnimationFrame(loop);
    const layers = SLOTS.map((s) => slots[s]).filter(Boolean);
    if (!layers.length) return;
    const now = performance.now() / 1000;
    for (const L of layers) L.profile.frame(now);
    const { mods, color } = combine(layers);
    if (color) api.setModColor(color);
    api.setMods(mods);
  }
  requestAnimationFrame(loop);

  return {
    getParam: (name) => values[name],
    setParam(name, v) {
      if (!PROFILES[name]) return;
      values[name] = v;
      for (const L of Object.values(slots)) if (L.name === name) L.profile.setParam(v);
    },
  };
}
