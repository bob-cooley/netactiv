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

// profile id (as shown in the dropdown) -> factory
const PROFILES = {
  'Video game (dopamine hits)': videoGame,
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
