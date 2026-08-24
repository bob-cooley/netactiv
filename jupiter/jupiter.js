(function () {
  const canvas = document.getElementById('neuralvex-canvas');
  const ctx    = canvas.getContext('2d');

  let W, H, cx, cy, R, rafId;
  let Rdraw = 0;
  let stars = [];
  let nodes = [], edges = [], packets = [];
  let dreamFlashes = [];
  let joltEnd = 0, lastJolt = 0;
  let dragSens = 0.005;

  const TILT           = 0.44;
  const LAT_LINES      = 9;
  const LON_LINES      = 18;
  const SPIN_MS        = 28000;
  const AUTO_SPIN_BASE = 2 * Math.PI / SPIN_MS;

  const MODES = {
    chill:      { speedMult: 1.0, countMult: 1.0,                     dreamFlashes: false, flicker: false },
    rem:        { speedMult: 0.4, countMult: 0.3,                     dreamFlashes: true,  flicker: false },
    addied:     { speedMult: 3.0, countMult: 4.0, nodeCountMult: 2.0, packetCountMult: 2.0, maxParallel: 10, dreamFlashes: false, flicker: false },
    overcaffed: { speedMult: 3.0, countMult: 4.0, nodeCountMult: 2.0, packetCountMult: 2.0, maxParallel: 10, dreamFlashes: false, flicker: true  },
  };
  let currentMode = 'chill';

  const NODE_TYPES = [
    { id: 'relay',    rgb: [0,   255, 218], weight: 0.42, glowScale: 1.00, pulseSpeed: 1.00 },
    { id: 'hub',      rgb: [255, 178,   0], weight: 0.15, glowScale: 1.70, pulseSpeed: 0.55 },
    { id: 'gateway',  rgb: [195,  45, 255], weight: 0.16, glowScale: 1.20, pulseSpeed: 1.35 },
    { id: 'core',     rgb: [255, 255, 255], weight: 0.11, glowScale: 2.00, pulseSpeed: 0.38 },
    { id: 'transfer', rgb: [ 48, 255,  90], weight: 0.16, glowScale: 1.10, pulseSpeed: 1.70 },
  ];

  const TYPE_PRIORITY = { core: 5, hub: 4, gateway: 3, transfer: 2, relay: 1 };

  function pickType() {
    let r = Math.random(), acc = 0;
    for (const t of NODE_TYPES) { acc += t.weight; if (r < acc) return t; }
    return NODE_TYPES[0];
  }

  const mm = (A, B) => [
    A[0]*B[0]+A[1]*B[3]+A[2]*B[6], A[0]*B[1]+A[1]*B[4]+A[2]*B[7], A[0]*B[2]+A[1]*B[5]+A[2]*B[8],
    A[3]*B[0]+A[4]*B[3]+A[5]*B[6], A[3]*B[1]+A[4]*B[4]+A[5]*B[7], A[3]*B[2]+A[4]*B[5]+A[5]*B[8],
    A[6]*B[0]+A[7]*B[3]+A[8]*B[6], A[6]*B[1]+A[7]*B[4]+A[8]*B[7], A[6]*B[2]+A[7]*B[5]+A[8]*B[8],
  ];
  const mv  = (M, v) => [M[0]*v[0]+M[1]*v[1]+M[2]*v[2], M[3]*v[0]+M[4]*v[1]+M[5]*v[2], M[6]*v[0]+M[7]*v[1]+M[8]*v[2]];
  const mrx = a => { const c=Math.cos(a),s=Math.sin(a); return [1,0,0, 0,c,-s, 0,s,c]; };
  const mry = a => { const c=Math.cos(a),s=Math.sin(a); return [c,0,s, 0,1,0,-s,0,c]; };
  const mrz = a => { const c=Math.cos(a),s=Math.sin(a); return [c,-s,0, s,c,0, 0,0,1]; };

  let rotM   = mrz(TILT);
  let velX   = 0, velY = AUTO_SPIN_BASE;
  let isDrag = false;
  let lastPX = 0, lastPY = 0, lastPT = 0, lastTS = 0;

  function cross3(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function norm3(v) { const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return l<1e-9?v:[v[0]/l,v[1]/l,v[2]/l]; }

  const MAX_PARALLEL = 2;
  const PARALLEL_DOT = 0.82;
  function tooParallel(ax, axes, max) {
    const limit = max !== undefined ? max : MAX_PARALLEL;
    let n = 0;
    for (const ex of axes) {
      if (Math.abs(ax[0]*ex[0]+ax[1]*ex[1]+ax[2]*ex[2]) > PARALLEL_DOT && ++n >= limit) return true;
    }
    return false;
  }

  function xyz(lat, lon) { const c=Math.cos(lat); return [c*Math.cos(lon), Math.sin(lat), c*Math.sin(lon)]; }
  function rot(p) { return mv(rotM, p); }
  function proj(p) { return [cx + Rdraw * p[0], cy - Rdraw * p[1], p[2]]; }

  function slerp(a, b, t) {
    let dot = a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    dot = Math.max(-1, Math.min(1, dot));
    const omega = Math.acos(dot);
    if (omega < 1e-6) return [a[0], a[1], a[2]];
    const s = Math.sin(omega);
    return [a[0]*Math.sin((1-t)*omega)/s+b[0]*Math.sin(t*omega)/s,
            a[1]*Math.sin((1-t)*omega)/s+b[1]*Math.sin(t*omega)/s,
            a[2]*Math.sin((1-t)*omega)/s+b[2]*Math.sin(t*omega)/s];
  }

  // ── AudioContext patch — intercepts Spotify SDK's audio graph ─────────────────
  // Runs before SDK loads; when _reactivACReady is true the next new AudioContext
  // gets an analyser inserted before its destination.
  (function patchAC() {
    try {
      const Native = window.AudioContext || window.webkitAudioContext;
      if (!Native || window._reactivACPatched) return;
      window._reactivACPatched = true;

      class PatchedAC extends Native {
        constructor(opts) {
          super(opts);
          if (!window._reactivACReady || window._reactivSDKAnalyser) return;
          window._reactivACReady = false;
          try {
            const an = this.createAnalyser();
            an.fftSize               = 2048;
            an.smoothingTimeConstant = 0.80;
            an.connect(this.destination);
            window._reactivSDKAnalyser = an;

            const dest  = this.destination;
            const origCG = this.createGain.bind(this);
            this.createGain = () => {
              const g  = origCG();
              const oc = g.connect.bind(g);
              g.connect = (node, ...rest) => oc(node === dest ? an : node, ...rest);
              return g;
            };
          } catch(e) {}
        }
      }

      window.AudioContext = window.webkitAudioContext = PatchedAC;
    } catch(e) {}
  })();

  // ── Audio engine ────────────────────────────────────────────

  let audioCtx    = null;   // our own context (mic / builtin)
  let ownAnalyser = null;   // analyser from our context
  let analyser    = null;   // currently active analyser
  let freqData    = null;
  let micStream   = null;
  let builtinNode = null;
  let audioMode   = 'off';  // 'off' | 'mic' | 'builtin' | 'spotify'

  let bassEnergy    = 0;
  let midEnergy     = 0;
  let highEnergy    = 0;
  let overallEnergy = 0;

  function ensureAudioCtx() {
    if (audioCtx) return;
    audioCtx    = new (window.AudioContext || window.webkitAudioContext)();
    ownAnalyser = audioCtx.createAnalyser();
    ownAnalyser.fftSize               = 2048;
    ownAnalyser.smoothingTimeConstant = 0.80;
    freqData    = new Uint8Array(ownAnalyser.frequencyBinCount);
  }

  function disableAudio() {
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (builtinNode && ownAnalyser) { try { builtinNode.disconnect(ownAnalyser); } catch(e) {} }
    if (spPlayer) { try { spPlayer.disconnect(); } catch(e) {} spPlayer = null; spDeviceId = null; }
    const el = document.getElementById('audio-builtin');
    if (el) el.pause();
    bassEnergy = midEnergy = highEnergy = overallEnergy = 0;
    analyser  = null;
    audioMode = 'off';
  }

  async function enableMic() {
    disableAudio();
    ensureAudioCtx();
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const src = audioCtx.createMediaStreamSource(micStream);
      src.connect(ownAnalyser);
      analyser  = ownAnalyser;
      audioMode = 'mic';
      return true;
    } catch(e) {
      micStream = null;
      audioMode = 'off';
      return false;
    }
  }

  function enableBuiltin() {
    disableAudio();
    ensureAudioCtx();
    const el = document.getElementById('audio-builtin');
    if (!el) return;
    if (!builtinNode) {
      builtinNode = audioCtx.createMediaElementSource(el);
      builtinNode.connect(audioCtx.destination);
    }
    builtinNode.connect(ownAnalyser);
    if (audioCtx.state === 'suspended') audioCtx.resume();
    el.loop = true;
    el.play().catch(() => {});
    analyser  = ownAnalyser;
    audioMode = 'builtin';
  }

  function tickAudio() {
    if (!analyser || !freqData || audioMode === 'off') return;
    analyser.getByteFrequencyData(freqData);
    const avg = (lo, hi) => {
      let s = 0; for (let i = lo; i < hi; i++) s += freqData[i];
      return s / ((hi - lo) * 255);
    };
    const rB = avg(1, 10), rM = avg(10, 80), rH = avg(80, 200), rO = avg(0, 200);
    bassEnergy    += (rB - bassEnergy)    * (rB > bassEnergy    ? 0.55 : 0.12);
    midEnergy     += (rM - midEnergy)     * (rM > midEnergy     ? 0.40 : 0.12);
    highEnergy    += (rH - highEnergy)    * (rH > highEnergy    ? 0.40 : 0.12);
    overallEnergy += (rO - overallEnergy) * 0.20;
  }

  // ── Spotify Web Playback SDK ───────────────────────────────────────────

  // Bump SP_SCOPE_VER whenever OAuth scopes change — forces re-auth.
  const SP_SCOPE_VER = '2';
  if (localStorage.getItem('sp_scope_ver') !== SP_SCOPE_VER) {
    ['sp_token','sp_refresh','sp_expires','sp_verifier','sp_auto_mode'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem('sp_scope_ver', SP_SCOPE_VER);
  }

  let spToken    = localStorage.getItem('sp_token') || null;
  let spPlayer   = null;
  let spDeviceId = null;

  const spClientId    = () => localStorage.getItem('sp_client_id') || '3f49c126b1c44c4a9d8a4b7330eff27e';
  const spRedirectUri = () => window.location.origin + window.location.pathname;

  function spRandomStr(n) {
    const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => ch[b % ch.length]).join('');
  }

  async function spChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  async function spLogin() {
    const cid = spClientId();
    if (!cid) return;
    const verifier  = spRandomStr(64);
    const challenge = await spChallenge(verifier);
    localStorage.setItem('sp_verifier',  verifier);
    localStorage.setItem('sp_auto_mode', 'spotify');
    const p = new URLSearchParams({
      client_id: cid, response_type: 'code',
      redirect_uri: spRedirectUri(),
      scope: 'streaming user-read-currently-playing user-read-playback-state user-modify-playback-state',
      code_challenge_method: 'S256', code_challenge: challenge,
    });
    window.location.href = 'https://accounts.spotify.com/authorize?' + p;
  }

  async function spExchangeCode(code) {
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: spClientId(), grant_type: 'authorization_code',
        code, redirect_uri: spRedirectUri(),
        code_verifier: localStorage.getItem('sp_verifier') || '',
      }),
    });
    if (!resp.ok) return false;
    const d = await resp.json();
    spToken = d.access_token;
    localStorage.setItem('sp_token',   spToken);
    localStorage.setItem('sp_refresh', d.refresh_token || '');
    localStorage.setItem('sp_expires', Date.now() + (d.expires_in || 3600) * 1000);
    return true;
  }

  async function spRefreshToken() {
    const refresh = localStorage.getItem('sp_refresh');
    if (!refresh) return;
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: spClientId(), grant_type: 'refresh_token', refresh_token: refresh,
      }),
    });
    if (!resp.ok) return;
    const d = await resp.json();
    spToken = d.access_token;
    localStorage.setItem('sp_token',   spToken);
    localStorage.setItem('sp_expires', Date.now() + (d.expires_in || 3600) * 1000);
    if (d.refresh_token) localStorage.setItem('sp_refresh', d.refresh_token);
  }

  function loadSpotifySDK() {
    return new Promise((resolve, reject) => {
      if (window.Spotify) { resolve(); return; }
      const t = setTimeout(() => reject(new Error('SDK timeout')), 12000);
      window.onSpotifyWebPlaybackSDKReady = () => { clearTimeout(t); resolve(); };
      const s = document.createElement('script');
      s.src = 'https://sdk.scdn.co/spotify-player.js';
      s.onerror = () => { clearTimeout(t); reject(new Error('SDK load failed')); };
      document.head.appendChild(s);
    });
  }

  async function initSpotifyPlayer() {
    if (!spToken) return false;

    const exp = parseInt(localStorage.getItem('sp_expires') || '0');
    if (Date.now() > exp - 60000) await spRefreshToken();
    if (!spToken) return false;

    if (spPlayer) { try { spPlayer.disconnect(); } catch(e) {} spPlayer = null; }

    // Tell our AudioContext patch to intercept the next context the SDK creates
    window._reactivSDKAnalyser = null;
    window._reactivACReady     = true;

    try { await loadSpotifySDK(); } catch(e) { window._reactivACReady = false; return false; }

    return new Promise(resolve => {
      spPlayer = new window.Spotify.Player({
        name: 'reactiv',
        getOAuthToken: cb => cb(spToken),
        volume: 0.8,
      });

      spPlayer.addListener('ready', async ({ device_id }) => {
        spDeviceId = device_id;
        try {
          await fetch('https://api.spotify.com/v1/me/player', {
            method: 'PUT',
            headers: { Authorization: 'Bearer ' + spToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_ids: [device_id], play: true }),
          });
        } catch(e) {}

        const sdkAn = window._reactivSDKAnalyser;
        if (sdkAn) {
          analyser  = sdkAn;
          freqData  = new Uint8Array(sdkAn.frequencyBinCount);
          audioMode = 'spotify';
        }

        if (typeof updateSpotifyUI === 'function') updateSpotifyUI();
        resolve(true);
      });

      spPlayer.addListener('authentication_error', () => {
        spToken = null;
        ['sp_token','sp_refresh','sp_expires'].forEach(k => localStorage.removeItem(k));
        spLogin();
        resolve(false);
      });

      spPlayer.addListener('account_error',        () => resolve(false));
      spPlayer.addListener('not_ready',            () => { spDeviceId = null; });
      spPlayer.addListener('player_state_changed', () => {
        if (typeof updateSpotifyUI === 'function') updateSpotifyUI();
      });

      spPlayer.connect().then(ok => { if (!ok) resolve(false); });
    });
  }

  // ── Public API ────────────────────────────────────────────

  window.setAudioMode = async function(mode) {
    if (mode === 'mic') {
      return await enableMic();
    } else if (mode === 'builtin') {
      enableBuiltin();
      return true;
    } else if (mode === 'spotify') {
      if (!spToken) return false;
      disableAudio();
      return await initSpotifyPlayer();
    } else {
      disableAudio();
      localStorage.removeItem('sp_auto_mode');
      return true;
    }
  };

  window.spLogin       = spLogin;
  window.spIsConnected = () => !!spToken;
  window.spRedirectUri = spRedirectUri;

  window.spGetCurrentTrack = async function() {
    if (!spPlayer) return null;
    try {
      const state = await spPlayer.getCurrentState();
      if (!state) return null;
      const t = state.track_window.current_track;
      return { name: t.name, artist: t.artists.map(a => a.name).join(', ') };
    } catch(e) { return null; }
  };

  window.spDisconnect = function() {
    spToken = null;
    if (spPlayer) { try { spPlayer.disconnect(); } catch(e) {} spPlayer = null; }
    spDeviceId = null;
    ['sp_token','sp_refresh','sp_expires','sp_verifier','sp_auto_mode'].forEach(k => localStorage.removeItem(k));
    if (audioMode === 'spotify') disableAudio();
  };

  // ── Scene init ────────────────────────────────────────────

  function buildScene() {
    const mode            = MODES[currentMode];
    const nodeCount       = Math.max(8,  Math.round(44  * (mode.nodeCountMult   !== undefined ? mode.nodeCountMult   : mode.countMult)));
    const edgeCount       = Math.max(5,  Math.round(50  * mode.countMult));
    const packetCount     = Math.max(3,  Math.round(28  * (mode.packetCountMult !== undefined ? mode.packetCountMult : mode.countMult)));
    const modeMaxParallel = mode.maxParallel !== undefined ? mode.maxParallel : MAX_PARALLEL;

    dreamFlashes = [];

    stars = Array.from({ length: 320 }, () => ({
      x: Math.random(), y: Math.random(),
      r: 0.25 + Math.random() * 0.85,
      a: 0.07 + Math.random() * 0.52,
    }));

    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    nodes = Array.from({ length: nodeCount }, (_, i) => {
      const y0  = 1 - (i / (nodeCount - 1)) * 2;
      const yj  = Math.max(-0.98, Math.min(0.98, y0 + (Math.random() - 0.5) * 0.14));
      const lat = Math.asin(yj);
      const lon = ((GOLDEN * i + (Math.random() - 0.5) * 0.45) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const type = pickType();
      return {
        pos:         xyz(lat, lon),
        type,
        pulsePhase:  Math.random() * Math.PI * 2,
        pulsePeriod: (1400 + Math.random() * 2400) / (type.pulseSpeed * mode.speedMult),
      };
    });

    const used = new Set();
    const edgeAxes = [];
    edges = [];

    const hubIdxs = nodes.reduce((a, nd, i) => nd.type.id === 'hub' ? [...a, i] : a, []);
    hubIdxs.forEach(h => {
      const target = 5 + Math.floor(Math.random() * 2);
      let got = 0, t = 0;
      while (got < target && t++ < 600) {
        const b = Math.floor(Math.random() * nodeCount);
        const k = `${Math.min(h, b)}-${Math.max(h, b)}`;
        if (b === h || used.has(k)) continue;
        const ax = norm3(cross3(nodes[h].pos, nodes[b].pos));
        if (tooParallel(ax, edgeAxes, modeMaxParallel)) continue;
        used.add(k); edgeAxes.push(ax);
        const dom = TYPE_PRIORITY[nodes[h].type.id] >= TYPE_PRIORITY[nodes[b].type.id] ? nodes[h].type : nodes[b].type;
        edges.push({ a: h, b, rgb: dom.rgb });
        got++;
      }
    });

    let tries = 0;
    while (edges.length < edgeCount && tries++ < 8000) {
      const a = Math.floor(Math.random() * nodeCount);
      const b = Math.floor(Math.random() * nodeCount);
      const k = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (a === b || used.has(k)) continue;
      const ax = norm3(cross3(nodes[a].pos, nodes[b].pos));
      if (tooParallel(ax, edgeAxes, modeMaxParallel)) continue;
      edgeAxes.push(ax); used.add(k);
      const dom = TYPE_PRIORITY[nodes[a].type.id] >= TYPE_PRIORITY[nodes[b].type.id] ? nodes[a].type : nodes[b].type;
      edges.push({ a, b, rgb: dom.rgb });
    }

    const SLOW_CAP       = 4;
    const SLOW_FLOOR_RAW = 0.0002 + 0.003 * 0.20;
    const slowEdges      = new Set();
    let slowCount        = 0;
    packets = Array.from({ length: packetCount }, () => {
      const edge     = Math.floor(Math.random() * edges.length);
      const rawSpeed = 0.0002 + Math.pow(Math.random(), 1.5) * 0.003;
      let speed      = rawSpeed * mode.speedMult;
      if (rawSpeed < SLOW_FLOOR_RAW && (slowCount >= SLOW_CAP || slowEdges.has(edge))) {
        speed = (SLOW_FLOOR_RAW + Math.random() * (0.0032 - SLOW_FLOOR_RAW)) * mode.speedMult;
      } else if (rawSpeed < SLOW_FLOOR_RAW) {
        slowCount++; slowEdges.add(edge);
      }
      return { edge, t: Math.random(), speed };
    });
  }

  // ── Render ────────────────────────────────────────────

  function render(ts) {
    const dt = lastTS ? Math.min(ts - lastTS, 50) : 16;
    lastTS = ts;

    tickAudio();

    Rdraw = R * (1 + bassEnergy * 0.22);
    const audioActive    = audioMode !== 'off';
    const audioSpeedMult = audioActive ? (1 + midEnergy     * 1.0) : 1;
    const nodeGlowBoost  = audioActive ? (1 + highEnergy    * 0.6) : 1;
    const edgeAlphaBoost = audioActive ? (1 + overallEnergy * 0.4) : 1;

    const mode     = MODES[currentMode];
    const autoSpin = AUTO_SPIN_BASE * mode.speedMult;

    const flickerMult = mode.flicker
      ? (Math.random() < 0.20 ? 0.15 + Math.random() * 0.25 : 0.65 + Math.random() * 0.35)
      : 1;

    if (mode.flicker && ts > joltEnd) {
      const timeSince = ts - lastJolt;
      if (timeSince > 30000 || (timeSince > 2000 && Math.random() < 0.0015 * dt / 16.67)) {
        joltEnd = ts + 150 + Math.random() * 250;
        lastJolt = ts;
      }
    }
    const joltX = (mode.flicker && ts < joltEnd) ? (Math.random() - 0.5) * 36 : 0;
    const joltY = (mode.flicker && ts < joltEnd) ? (Math.random() - 0.5) * 36 : 0;

    if (!isDrag) {
      rotM = mm(mrx(velX * dt), rotM);
      rotM = mm(mry(velY * dt), rotM);
      const decay = Math.pow(0.97, dt / 16.67);
      velX *= decay;
      const spinTarget = velY < 0 ? -autoSpin : autoSpin;
      velY = spinTarget + (velY - spinTarget) * decay;
    }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#02040d';
    ctx.fillRect(0, 0, W, H);

    stars.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(195,218,255,${s.a})`;
      ctx.fill();
    });

    cx += joltX; cy += joltY;

    const SEGS = 72;

    ctx.beginPath();
    for (let i = 0; i <= LAT_LINES; i++) {
      const lat = -Math.PI / 2 + (i / LAT_LINES) * Math.PI;
      for (let j = 0; j < SEGS; j++) {
        const p0 = proj(rot(xyz(lat, (j / SEGS) * Math.PI * 2)));
        const p1 = proj(rot(xyz(lat, ((j + 1) / SEGS) * Math.PI * 2)));
        if (p0[2] <= 0 && p1[2] <= 0) { ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
      }
    }
    for (let i = 0; i < LON_LINES; i++) {
      const lon = (i / LON_LINES) * Math.PI * 2;
      for (let j = 0; j < SEGS; j++) {
        const p0 = proj(rot(xyz(-Math.PI/2 + (j / SEGS) * Math.PI, lon)));
        const p1 = proj(rot(xyz(-Math.PI/2 + ((j + 1) / SEGS) * Math.PI, lon)));
        if (p0[2] <= 0 && p1[2] <= 0) { ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
      }
    }
    ctx.strokeStyle = `rgba(0, 175, 255, ${0.06 * flickerMult})`;
    ctx.lineWidth = 0.4;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i <= LAT_LINES; i++) {
      const lat = -Math.PI / 2 + (i / LAT_LINES) * Math.PI;
      for (let j = 0; j < SEGS; j++) {
        const p0 = proj(rot(xyz(lat, (j / SEGS) * Math.PI * 2)));
        const p1 = proj(rot(xyz(lat, ((j + 1) / SEGS) * Math.PI * 2)));
        if (p0[2] > 0 && p1[2] > 0) { ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
      }
    }
    for (let i = 0; i < LON_LINES; i++) {
      const lon = (i / LON_LINES) * Math.PI * 2;
      for (let j = 0; j < SEGS; j++) {
        const p0 = proj(rot(xyz(-Math.PI/2 + (j / SEGS) * Math.PI, lon)));
        const p1 = proj(rot(xyz(-Math.PI/2 + ((j + 1) / SEGS) * Math.PI, lon)));
        if (p0[2] > 0 && p1[2] > 0) { ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
      }
    }
    ctx.strokeStyle = `rgba(0, 210, 255, ${0.28 * flickerMult})`;
    ctx.lineWidth = 0.65;
    ctx.stroke();

    const nPole = proj(rot([0, 1, 0]));
    const sPole = proj(rot([0, -1, 0]));
    const axX   = 1.18;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(cx + (nPole[0] - cx) * axX, cy + (nPole[1] - cy) * axX);
    ctx.lineTo(cx + (sPole[0] - cx) * axX, cy + (sPole[1] - cy) * axX);
    ctx.strokeStyle = `rgba(0, 160, 220, ${0.18 * flickerMult})`;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.setLineDash([]);

    const ESEGS = 32;
    edges.forEach(({ a, b, rgb: [er, eg, eb] }) => {
      let prev = null;
      for (let j = 0; j <= ESEGS; j++) {
        const sp = slerp(nodes[a].pos, nodes[b].pos, j / ESEGS);
        const rp = proj(rot(sp));
        if (prev) {
          const mz   = (rp[2] + prev[2]) * 0.5;
          const alph = (mz > 0 ? (0.06 + mz * 0.40) : 0.010) * flickerMult * edgeAlphaBoost;
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(rp[0], rp[1]);
          ctx.strokeStyle = `rgba(${er},${eg},${eb},${Math.min(alph, 0.98)})`;
          ctx.lineWidth = 0.85;
          ctx.stroke();
        }
        prev = rp;
      }
    });

    nodes.forEach(nd => {
      const rp = proj(rot(nd.pos));
      if (rp[2] < -0.04) return;
      const pulse = 0.5 + 0.5 * Math.sin(ts / nd.pulsePeriod * Math.PI * 2 + nd.pulsePhase);
      const vis   = rp[2] > 0 ? 0.40 + rp[2] * 0.60 : 0;
      const a     = Math.min(0.98, vis * (0.55 + 0.45 * pulse) * flickerMult * nodeGlowBoost);
      const gr    = Rdraw * nd.type.glowScale * (0.018 + 0.010 * pulse);
      const [nr, ng, nb] = nd.type.rgb;
      const g     = ctx.createRadialGradient(rp[0], rp[1], 0, rp[0], rp[1], gr);
      g.addColorStop(0,   `rgba(${nr},${ng},${nb},${a * 0.92})`);
      g.addColorStop(0.5, `rgba(${nr},${ng},${nb},${a * 0.28})`);
      g.addColorStop(1,   `rgba(${nr},${ng},${nb},0)`);
      ctx.beginPath();
      ctx.arc(rp[0], rp[1], gr, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      const dotR = nd.type.id === 'core' ? 2.4 : nd.type.id === 'hub' ? 2.0 : 1.6;
      ctx.beginPath();
      ctx.arc(rp[0], rp[1], dotR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${nr},${ng},${nb},${Math.min(1, a * 1.3)})`;
      ctx.fill();
    });

    packets.forEach(p => {
      p.t = (p.t + p.speed * audioSpeedMult) % 1;
      const edge = edges[p.edge];
      const sp   = slerp(nodes[edge.a].pos, nodes[edge.b].pos, p.t);
      const rp   = proj(rot(sp));
      if (rp[2] < 0) return;
      const a  = (0.45 + rp[2] * 0.55) * flickerMult;
      const pr = Rdraw * 0.014;
      const [er, eg, eb] = edge.rgb;
      const g  = ctx.createRadialGradient(rp[0], rp[1], 0, rp[0], rp[1], pr);
      g.addColorStop(0,   `rgba(255,255,255,${a})`);
      g.addColorStop(0.4, `rgba(${er},${eg},${eb},${a * 0.70})`);
      g.addColorStop(1,   `rgba(${er},${eg},${eb},0)`);
      ctx.beginPath();
      ctx.arc(rp[0], rp[1], pr, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    });

    if (mode.dreamFlashes && nodes.length > 0) {
      if (Math.random() < 0.005 * dt / 16.67) {
        const nd = nodes[Math.floor(Math.random() * nodes.length)];
        dreamFlashes.push({ pos: nd.pos, age: 0, life: 600 + Math.random() * 1400 });
      }
      dreamFlashes = dreamFlashes.filter(f => {
        f.age += dt;
        if (f.age >= f.life) return false;
        const rp = proj(rot(f.pos));
        if (rp[2] > 0) {
          const t      = f.age / f.life;
          const bright = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
          const gr     = Rdraw * 0.14 * bright;
          const g      = ctx.createRadialGradient(rp[0], rp[1], 0, rp[0], rp[1], gr);
          g.addColorStop(0,    `rgba(255,255,255,${bright * 0.95})`);
          g.addColorStop(0.25, `rgba(220,190,255,${bright * 0.55})`);
          g.addColorStop(1,    'rgba(180,140,255,0)');
          ctx.beginPath();
          ctx.arc(rp[0], rp[1], gr, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
        }
        return true;
      });
    }

    const rim = ctx.createRadialGradient(cx, cy, Rdraw * 0.88, cx, cy, Rdraw * 1.18);
    rim.addColorStop(0,    `rgba(0, 170, 255, ${0.12 * flickerMult})`);
    rim.addColorStop(0.55, `rgba(0, 120, 220, ${0.05 * flickerMult})`);
    rim.addColorStop(1,    'rgba(0,  70, 180, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, Rdraw * 1.18, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();

    cx -= joltX; cy -= joltY;

    rafId = requestAnimationFrame(render);
  }

  // ── Drag input ────────────────────────────────────────────

  function onDown(x, y) {
    isDrag = true; lastPX = x; lastPY = y;
    lastPT = performance.now(); velX = 0; velY = 0;
    canvas.style.cursor = 'grabbing';
  }

  function onMove(x, y) {
    if (!isDrag) return;
    const now = performance.now();
    const dt  = Math.max(1, now - lastPT);
    rotM = mm(mrx((y - lastPY) * dragSens), rotM);
    rotM = mm(mry((x - lastPX) * dragSens), rotM);
    const alpha = 0.65;
    velX = alpha * ((y - lastPY) * dragSens / dt) + (1 - alpha) * velX;
    velY = alpha * ((x - lastPX) * dragSens / dt) + (1 - alpha) * velY;
    lastPX = x; lastPY = y; lastPT = now;
  }

  function onUp() { isDrag = false; canvas.style.cursor = 'grab'; }

  canvas.addEventListener('mousedown', e => onDown(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup',   onUp);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  canvas.addEventListener('touchend',   onUp);
  canvas.addEventListener('touchcancel', onUp);

  // ── Mode switching ──────────────────────────────────────────

  window.setDisplayMode = function(mode) {
    if (!MODES[mode]) return;
    currentMode = mode;
    buildScene();
    const autoSpin = AUTO_SPIN_BASE * MODES[mode].speedMult;
    if (!isDrag) velY = velY < 0 ? -autoSpin : autoSpin;
  };

  // ── Resize ────────────────────────────────────────────

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    R = Math.min(W, H) * 0.38;
    Rdraw = R;
    cx = W * 0.5; cy = H * 0.5;
    dragSens = Math.PI / (2 * R);
    canvas.style.cursor = 'grab';
  }

  buildScene();
  resize();

  let rsTimer;
  window.addEventListener('resize', () => {
    clearTimeout(rsTimer);
    rsTimer = setTimeout(() => { cancelAnimationFrame(rafId); resize(); rafId = requestAnimationFrame(render); }, 120);
  });

  rafId = requestAnimationFrame(render);

  // ── OAuth callback ──────────────────────────────────────────
  const _urlParams = new URLSearchParams(window.location.search);
  const _spCode    = _urlParams.get('code');
  if (_spCode && localStorage.getItem('sp_auto_mode') === 'spotify') {
    history.replaceState({}, '', window.location.pathname);
    spExchangeCode(_spCode).then(async ok => {
      if (!ok) return;
      if (typeof syncAudioButtons === 'function') syncAudioButtons('spotify');
      await initSpotifyPlayer();
    });
  } else if (localStorage.getItem('sp_auto_mode') === 'spotify' && spToken) {
    initSpotifyPlayer().then(() => {
      if (typeof syncAudioButtons === 'function') syncAudioButtons('spotify');
    });
  }

})();
