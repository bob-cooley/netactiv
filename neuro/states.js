// neuro / states - mood and altered-state profiles for the /neuro test space.
// Each profile drives the engine's modifier layer (window.__neuro.setMods) on top
// of the user's slider settings; leaving a profile restores neutral modifiers.

// ── Video game (dopamine hits) ──────────────────────────────────────────────
// Grounding: dopamine neurons fire in short phasic bursts when a reward arrives,
// and the burst is larger when the reward is unexpected (reward prediction
// error). Striatal dopamine release during video game play has been measured
// directly (Koepp et al., Nature 1998). Games deliver rewards on variable
// schedules, so hits land at irregular intervals with occasional jackpots.
function videoGame(api) {
  const BASE = { speed: 1.15, spont: 0.55, gain: 0.9, sat: 1.08 };
  let next = 0, lastHit = 0, hit = null, t0 = performance.now() / 1000;

  api.setModColor('#ffc84a'); // warm gold for dopamine-driven pulses

  function schedule(now) { next = now + 1.8 + Math.random() * 4.7; }

  function fire(now) {
    const jackpot = Math.random() < 0.15;
    // surprise: a hit after a long wait lands harder than one in quick succession
    const wait = now - lastHit;
    const surprise = Math.min(1.35, Math.max(0.5, wait / 4));
    lastHit = now;
    const n = jackpot ? 12 : 4 + Math.floor(Math.random() * 4);
    api.burst(n, jackpot ? 0.05 : 0.03);
    hit = { at: now, mag: (jackpot ? 1.6 : 1) * surprise, tau: jackpot ? 0.9 : 0.45, colourTau: jackpot ? 2.4 : 1.4, jackpot };
    schedule(now);
  }

  return {
    start() { const now = performance.now() / 1000; lastHit = now; schedule(now); api.setMods(BASE); },
    frame(now) {
      if (now >= next) fire(now);
      let e = 0, c = 0, kick = 0;
      if (hit) {
        const age = now - hit.at;
        e = Math.exp(-age / hit.tau) * hit.mag;           // flash envelope: instant attack, fast decay
        c = Math.exp(-age / hit.colourTau) * Math.min(1, hit.mag); // gold lingers a little longer
        kick = Math.exp(-age / 0.25) * (hit.jackpot ? 3.2 : 1.1) * hit.mag;
        if (age > 6) hit = null;
      }
      api.setMods({
        speed: BASE.speed,
        spont: BASE.spont,
        gain: BASE.gain * (1 + e * 0.55),
        sat: BASE.sat * (1 + e * 0.35),
        spark: 1 + e * 1.4,
        pulseMix: c,
        fov: -kick,                                        // a small zoom punch on each hit
      });
    },
  };
}

// ── Coffee (caffeine) ───────────────────────────────────────────────────────
// Grounding: caffeine blocks adenosine receptors. Adenosine builds up during
// waking and acts as a brake: it damps firing and (via A1 receptors) suppresses
// transmitter release at synapses. Blocking it removes the brake rather than
// pressing an accelerator: more spontaneous firing, slightly freer transmission,
// heightened arousal, and at higher doses a fine tremor. Onset is gradual, so
// the effect ramps in.
function coffee(api) {
  const ONSET = 18;          // seconds to full effect (compressed from ~30-60 min)
  let t0 = 0, spell = null, nextSpell = 0;
  const ease = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

  return {
    start() {
      t0 = performance.now() / 1000;
      nextSpell = t0 + ONSET + 4 + Math.random() * 8;
      api.setMods({ pulseMix: 0 });
    },
    frame(now) {
      const r = ease((now - t0) / ONSET);
      // occasional jittery spell once the caffeine has kicked in
      if (now >= nextSpell) {
        spell = { at: now, len: 0.6 + Math.random() * 0.9 };
        nextSpell = now + 7 + Math.random() * 10;
      }
      let jitter = 1;
      if (spell) {
        const age = now - spell.at;
        if (age > spell.len) spell = null;
        else jitter = 1 + 2.2 * Math.sin(Math.PI * age / spell.len);
      }
      api.setMods({
        spont: 1 + 1.1 * r,          // brake removed: neurons fire on their own about twice as often
        transmit: 1 + 0.18 * r,      // signals cross junctions a little more readily
        speed: 1 + 0.22 * r,
        gain: 1 + 0.06 * r,
        sat: 1 + 0.1 * r,
        spark: 1 + 0.2 * r,
        shake: 0.022 * r * jitter,   // fine tremor, stronger during a spell
        fov: 0,
      });
    },
  };
}

// profile id (as shown in the dropdown) -> factory
const PROFILES = {
  'Video game (dopamine hits)': videoGame,
  'Coffee (caffeine)': coffee,
};

export const isCalibrated = (name) => !!PROFILES[name];

export function initStates(api) {
  let active = null;

  function stop() {
    active = null;
    api.resetMods();
  }

  window.addEventListener('neuro:state', (e) => {
    const { mood, altered } = e.detail;
    // one profile at a time for now: mood takes priority, then altered state
    const name = [mood, altered].find((n) => n && PROFILES[n]);
    stop();
    if (name) {
      active = PROFILES[name](api);
      active.start();
    }
  });

  function loop() {
    requestAnimationFrame(loop);
    if (active) active.frame(performance.now() / 1000);
  }
  requestAnimationFrame(loop);
}
