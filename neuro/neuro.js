// neuro - procedural neural network fly-through
// Three.js r160. Everything is generated at runtime: no image assets.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ── Config ──────────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const IS_MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const CFG = {
  chunkLen: 40,                 // world units per generated slab
  chunksAhead: IS_MOBILE ? 3 : 4,
  chunksBehind: 1,
  neuronsPerChunk: IS_MOBILE ? [2, 4] : [4, 6],
  passingFibres: IS_MOBILE ? 22 : 44,
  synapsesPerChunk: IS_MOBILE ? 140 : 260,
  dustPerChunk: IS_MOBILE ? 120 : 240,
  speed: REDUCED ? 0.25 : parseFloat(params.get('speed') || '2.4'),
  fogDensity: 0.026,
  pulseSpeed: 7.0,              // units / second along a dendrite
  pulseSpacing: 46.0,           // distance between successive pulses
  dpr: Math.min(devicePixelRatio || 1, IS_MOBILE ? 1.25 : 1.75),
  bloom: { strength: 0.95, radius: 0.6, threshold: 0.14 },
  dof: params.get('dof') !== '0',
  dofSamples: IS_MOBILE ? 20 : 40,
  dofFar: 120.0,                // depth encoded into alpha is normalised to this range
  seed: params.has('seed') ? parseInt(params.get('seed'), 10) : (Math.random() * 1e9) | 0,
};

const PALETTE = {
  bg: new THREE.Color('#02030a'),
  fibreBase: new THREE.Color('#2a2fb8'),   // deep indigo body
  fibreEdge: new THREE.Color('#8f9cff'),   // violet rim
  fibrePale: new THREE.Color('#c9d6ff'),   // occasional white fibre
  pulse: new THREE.Color('#7ff3ff'),       // cyan-white signal
  somaCore: new THREE.Color('#e8f6ff'),
  somaRim: new THREE.Color('#6f8bff'),
  synCool: new THREE.Color('#4fd8ff'),
  synWarm: new THREE.Color('#ffae5c'),
  synHot: new THREE.Color('#ff5cc8'),
};

// ── Seeded RNG ──────────────────────────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = mulberry32(CFG.seed);
const rr = (a, b) => a + (b - a) * rand();
const ri = (a, b) => Math.floor(rr(a, b + 1));
function randUnit(out = new THREE.Vector3()) {
  const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(th), s * Math.sin(th), u);
}

// Cheap 3D value noise for soma surface displacement
function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w
  );
}

// ── Camera path: the tunnel centre line ─────────────────────────────────────
function pathAt(z, out = new THREE.Vector3()) {
  return out.set(
    Math.sin(z * 0.011) * 9 + Math.sin(z * 0.029 + 1.3) * 3.5,
    Math.sin(z * 0.017 + 0.7) * 5 + Math.cos(z * 0.023) * 2.5,
    z
  );
}

// ── Renderer / scene ────────────────────────────────────────────────────────
const canvas = document.getElementById('neuro');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('fallback').style.display = 'flex';
  throw e;
}
renderer.setPixelRatio(CFG.dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(PALETTE.bg, 0); // alpha 0 = far, for depth-of-field
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(PALETTE.bg, CFG.fogDensity);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 220);

// ── Shared uniforms ─────────────────────────────────────────────────────────
const shared = {
  uTime: { value: 0 },
  uFog: { value: CFG.fogDensity },
  uPulseSpeed: { value: CFG.pulseSpeed },
  uPulseSpacing: { value: CFG.pulseSpacing },
  uPixelRatio: { value: CFG.dpr },
  uDofFar: { value: CFG.dofFar },
};

// Additive colour, but alpha keeps the NEAREST visible depth (max of 1 - d/far).
// Every glowing material uses this so the DOF pass can read per-pixel distance.
const DEPTH_ADDITIVE = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendEquationAlpha: THREE.MaxEquation,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneFactor,
};

// ── Fibre material (dendrites, axons) ───────────────────────────────────────
const fibreMat = new THREE.ShaderMaterial({
  uniforms: {
    ...shared,
    uBase: { value: PALETTE.fibreBase },
    uEdge: { value: PALETTE.fibreEdge },
    uPale: { value: PALETTE.fibrePale },
    uPulse: { value: PALETTE.pulse },
    uIntensity: { value: 0.32 },
  },
  vertexShader: /* glsl */`
    attribute float aAlong;
    attribute float aSeed;
    attribute float aTint;
    attribute float aRad;
    varying vec3 vN;
    varying vec3 vV;
    varying float vAlong;
    varying float vSeed;
    varying float vTint;
    varying float vRad;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vV = mv.xyz;
      vN = normalize(normalMatrix * normal);
      vAlong = aAlong;
      vSeed = aSeed;
      vTint = aTint;
      vRad = aRad;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */`
    uniform float uTime, uFog, uPulseSpeed, uPulseSpacing, uIntensity, uDofFar;
    uniform vec3 uBase, uEdge, uPale, uPulse;
    varying vec3 vN;
    varying vec3 vV;
    varying float vAlong;
    varying float vSeed;
    varying float vTint;
    varying float vRad;
    void main() {
      float depth = -vV.z;
      vec3 V = normalize(-vV);
      // guard: interpolated normals can shrink toward zero, and float rounding can push
      // |dot| past 1.0; pow() of a negative base is NaN, which bloom smears into squares
      vec3 n = vN * inversesqrt(max(dot(vN, vN), 1e-8));
      float facing = clamp(abs(dot(n, V)), 0.0, 1.0);
      float rim = pow(max(1.0 - facing, 0.0), 1.6);

      // body: dim indigo core, bright violet rim -> reads as translucent tube
      vec3 col = mix(uBase * 0.35, uEdge, rim);
      col = mix(col, uPale * (0.4 + rim), vTint);
      // hair-thin fibres stay visible: lift them a touch
      col *= 0.8 + 0.35 * smoothstep(0.1, 0.0, vRad);

      // travelling action potential (only on "active" trees)
      float firing = step(0.42, fract(vSeed * 13.17));
      float ph = fract((vAlong - uTime * uPulseSpeed) / uPulseSpacing + vSeed);
      float d = (ph - 0.5) * uPulseSpacing;
      float pulse = exp(-d * d * 1.6) * firing;
      float trail = exp(-max(d, 0.0) * 0.35) * step(0.0, d) * step(d, 4.0) * firing * 0.12;
      col += uPulse * (pulse * 1.8 + trail) * (0.6 + 0.6 * facing);

      float fog = exp(-depth * uFog);
      // with depth-of-field, close fibres melt into soft light instead of vanishing
      float nearFade = smoothstep(0.35, 3.0, depth);
      // roots (aAlong < 0) fade out inside the soma so the join blends
      float rootFade = smoothstep(-0.9, 0.1, vAlong);
      float vis = fog * nearFade * rootFade;
      float dA = (1.0 - clamp(depth / uDofFar, 0.0, 1.0)) * step(0.12, vis);
      gl_FragColor = vec4(col * uIntensity * vis, dA);
    }
  `,
  transparent: true,
  depthWrite: false,
  ...DEPTH_ADDITIVE,
  side: THREE.DoubleSide,
});

// ── Soma material ───────────────────────────────────────────────────────────
const GLSL_NOISE = /* glsl */`
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
`;

const SOMA_VERT = /* glsl */`
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vObj;
  void main() {
    vObj = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

// Cell membrane: dark translucent interior, crisp mottled violet edge.
function makeSomaMat(grainScale) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFog: shared.uFog,
      uDofFar: shared.uDofFar,
      uRim: { value: PALETTE.somaRim },
      uEdge: { value: PALETTE.fibreEdge },
      uFlash: { value: 0 },
      uGlow: { value: 1 },
      uGrain: { value: grainScale },
    },
    vertexShader: SOMA_VERT,
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform float uFog, uFlash, uGlow, uDofFar, uGrain;
      uniform vec3 uRim, uEdge;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vObj;
      void main() {
        float depth = -vV.z;
        vec3 n = vN * inversesqrt(max(dot(vN, vN), 1e-8));
        float facing = clamp(abs(dot(n, normalize(-vV))), 0.0, 1.0);
        float edge = 1.0 - facing;
        // tight rim = defined membrane outline; broad rim = body volume
        float rimTight = pow(edge, 2.6);
        float rimBroad = pow(edge, 1.4);
        // granular cytoplasm / membrane texture
        vec3 q = vObj * uGrain;
        float grain = vnoise(q * 3.0) * 0.6 + vnoise(q * 9.0) * 0.4;
        grain = 0.5 + (grain - 0.5) * 0.5;               // half-strength texture
        vec3 col = uEdge * rimTight * 0.8 * (0.85 + 0.3 * grain)
                 + uRim * rimBroad * 0.42 * (0.8 + 0.4 * grain)
                 + uRim * 0.07
                 + uEdge * pow(facing, 3.0) * 0.18;     // soft fill, a little of the old glow
        col *= uGlow * 0.85 + uFlash * 0.9;
        float fog = exp(-depth * uFog);
        float nearFade = smoothstep(0.8, 5.0, depth);
        float vis = fog * nearFade;
        float dA = (1.0 - clamp(depth / uDofFar, 0.0, 1.0)) * step(0.12, vis);
        gl_FragColor = vec4(col * vis, dA);
      }
    `,
    transparent: true,
    depthWrite: false,
    ...DEPTH_ADDITIVE,
  });
}

// Nucleus: seen through the membrane; bright face-on core, soft falloff, tiny nucleolus.
function makeNucleusMat() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFog: shared.uFog,
      uDofFar: shared.uDofFar,
      uCore: { value: PALETTE.somaCore },
      uRim: { value: PALETTE.somaRim },
      uFlash: { value: 0 },
      uGlow: { value: 1 },
    },
    vertexShader: SOMA_VERT,
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform float uFog, uFlash, uGlow, uDofFar;
      uniform vec3 uCore, uRim;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vObj;
      void main() {
        float depth = -vV.z;
        vec3 n = vN * inversesqrt(max(dot(vN, vN), 1e-8));
        float facing = clamp(abs(dot(n, normalize(-vV))), 0.0, 1.0);
        float core = pow(facing, 2.2);
        float mottle = 0.88 + 0.25 * vnoise(vObj * 7.0);
        vec3 col = mix(uRim * 0.25, uCore * 0.55, core) * mottle;
        col += uCore * pow(facing, 10.0) * 0.25;          // nucleolus glint
        col *= uGlow * 0.8 + uFlash * 1.6;
        float fog = exp(-depth * uFog);
        float nearFade = smoothstep(0.8, 5.0, depth);
        float vis = fog * nearFade;
        float dA = (1.0 - clamp(depth / uDofFar, 0.0, 1.0)) * step(0.12, vis);
        gl_FragColor = vec4(col * vis, dA);
      }
    `,
    transparent: true,
    depthWrite: false,
    ...DEPTH_ADDITIVE,
  });
}

// Soft radial texture for halos
function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const haloTex = radialTexture([
  [0, 'rgba(200,225,255,0.55)'],
  [0.18, 'rgba(110,140,255,0.35)'],
  [0.5, 'rgba(60,70,220,0.08)'],
  [1, 'rgba(0,0,0,0)'],
]);

// ── Synapse / dust point material ───────────────────────────────────────────
const pointMat = new THREE.ShaderMaterial({
  uniforms: { ...shared },
  vertexShader: /* glsl */`
    attribute float aSize;
    attribute float aPhase;
    attribute vec3 aColor;
    uniform float uTime, uPixelRatio;
    varying vec3 vColor;
    varying float vDepth;
    varying float vTw;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDepth = -mv.z;
      vTw = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 40.0);
      vColor = aColor;
      gl_PointSize = min(aSize * uPixelRatio * (260.0 / max(vDepth, 0.5)), 26.0 * uPixelRatio);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */`
    uniform float uFog, uDofFar;
    varying vec3 vColor;
    varying float vDepth;
    varying float vTw;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float r2 = dot(p, p);
      float a = exp(-r2 * 30.0) + exp(-r2 * 260.0) * 1.5;
      float fog = exp(-vDepth * uFog);
      float nearFade = smoothstep(0.4, 2.5, vDepth);
      float dA = (1.0 - clamp(vDepth / uDofFar, 0.0, 1.0)) * step(0.35, a) * step(0.12, fog * nearFade);
      gl_FragColor = vec4(vColor * a * vTw * fog * nearFade, dA);
    }
  `,
  transparent: true,
  depthWrite: false,
  ...DEPTH_ADDITIVE,
});

// ── Geometry: tapered tubes ─────────────────────────────────────────────────
// Accumulates many polylines into one merged BufferGeometry.
class TubeBatch {
  constructor() {
    this.pos = []; this.nor = []; this.along = []; this.seed = []; this.tint = []; this.rad = []; this.idx = [];
    this.vcount = 0;
  }
  add(points, radii, alongs, seed, tint) {
    const n = points.length;
    if (n < 2) return;
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), tmp = new THREE.Vector3();
    const maxR = radii[0];
    const segs = maxR > 0.14 ? 8 : maxR > 0.05 ? 6 : 4;
    const base = this.vcount;
    // initial normal perpendicular to first tangent
    T.subVectors(points[1], points[0]).normalize();
    tmp.set(Math.abs(T.x) < 0.9 ? 1 : 0, Math.abs(T.x) < 0.9 ? 0 : 1, 0);
    N.crossVectors(T, tmp).normalize();
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(i - 1, 0)], b = points[Math.min(i + 1, n - 1)];
      T.subVectors(b, a).normalize();
      // parallel transport
      N.addScaledVector(T, -N.dot(T)).normalize();
      B.crossVectors(T, N);
      const p = points[i], r = radii[i];
      for (let s = 0; s < segs; s++) {
        const ang = (s / segs) * Math.PI * 2;
        const c = Math.cos(ang), sn = Math.sin(ang);
        const nx = N.x * c + B.x * sn, ny = N.y * c + B.y * sn, nz = N.z * c + B.z * sn;
        this.pos.push(p.x + nx * r, p.y + ny * r, p.z + nz * r);
        this.nor.push(nx, ny, nz);
        this.along.push(alongs[i]);
        this.seed.push(seed);
        this.tint.push(tint);
        this.rad.push(r);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let s = 0; s < segs; s++) {
        const a = base + i * segs + s;
        const b = base + i * segs + ((s + 1) % segs);
        const c = a + segs, d = b + segs;
        this.idx.push(a, c, b, b, c, d);
      }
    }
    this.vcount += n * segs;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(this.along, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.seed, 1));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 1));
    g.setAttribute('aRad', new THREE.Float32BufferAttribute(this.rad, 1));
    g.setIndex(this.vcount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// ── Neuron growth ───────────────────────────────────────────────────────────
// Random-walk dendrites with stochastic branching and taper.
function growBranch(batch, synapses, start, dir, radius, depth, along, seed, tint) {
  const pts = [start.clone()], rads = [radius], als = [along];
  const p = start.clone(), d = dir.clone();
  const segLen = 0.42 + depth * 0.06;
  const steps = Math.floor(rr(14, 34) * (1 - depth * 0.12));
  const jitter = new THREE.Vector3();
  const curl = randUnit().multiplyScalar(0.08); // slow consistent bend
  let r = radius, a = along;
  for (let i = 1; i <= steps; i++) {
    d.addScaledVector(randUnit(jitter), 0.28).add(curl).normalize();
    p.addScaledVector(d, segLen);
    r = Math.max(r * 0.955, 0.02);
    a += segLen;
    pts.push(p.clone()); rads.push(r); als.push(a);

    if (depth < 5 && i > 3 && rand() < 0.075 + depth * 0.01) {
      const nd = d.clone().addScaledVector(randUnit(jitter), 0.95).normalize();
      growBranch(batch, synapses, p, nd, r * rr(0.6, 0.85), depth + 1, a, seed, tint);
    }
    // dendritic spines / boutons
    if (rand() < 0.035) synapses.push({ p: p.clone(), kind: 0 });
  }
  // taper the last few samples to a point
  const k = Math.min(4, rads.length - 1);
  for (let j = 0; j < k; j++) rads[rads.length - 1 - j] *= (j + 1) / (k + 1);
  batch.add(pts, rads, als, seed, tint);
  if (rand() < 0.45) synapses.push({ p: p.clone(), kind: 1 }); // terminal bouton
}

function buildSomaGeometry(radius, dirs) {
  const g = new THREE.IcosahedronGeometry(1, 4);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const off = rr(0, 100);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let s = radius * (0.9 + 0.2 * noise3(v.x * 2.6 + off, v.y * 2.6, v.z * 2.6)
                    + 0.02 * noise3(v.x * 9 + off, v.y * 9, v.z * 9));
    // pull the membrane out toward each primary dendrite: pyramidal / stellate shape
    for (const d of dirs) {
      const k = Math.max(v.dot(d), 0);
      s += radius * 1.25 * Math.pow(k, 4);
    }
    pos.setXYZ(i, v.x * s, v.y * s, v.z * s);
  }
  g.computeVertexNormals();
  return g;
}

// ── Chunk generation ────────────────────────────────────────────────────────
const chunks = new Map(); // index -> { group, somas: [] }
const nucleusGeo = new THREE.IcosahedronGeometry(1, 3);
const fibreGeoms = [];

function generateChunk(k) {
  // deterministic per chunk so revisits (never happen, but seeds stay stable)
  rand = mulberry32(CFG.seed ^ (k * 2654435761));

  const group = new THREE.Group();
  const batch = new TubeBatch();
  const synapses = [];
  const somas = [];
  const z0 = -k * CFG.chunkLen, z1 = z0 - CFG.chunkLen;
  const c = new THREE.Vector3();

  // neurons
  const count = ri(CFG.neuronsPerChunk[0], CFG.neuronsPerChunk[1]);
  for (let n = 0; n < count; n++) {
    const z = rr(z1, z0);
    pathAt(z, c);
    const ang = rr(0, Math.PI * 2);
    const dist = rr(7, 20);
    const centre = new THREE.Vector3(c.x + Math.cos(ang) * dist, c.y + Math.sin(ang) * dist * 0.75, z);
    const seed = rand();
    const tint = rand() < 0.12 ? rr(0.3, 0.7) : 0;
    const somaR = rr(0.4, 0.75);
    const nPrim = ri(5, 9);
    const dirs = [];
    // one dominant apical direction + scattered basal dendrites
    const apical = randUnit();
    for (let i = 0; i < nPrim; i++) {
      const d = i === 0 ? apical.clone() : randUnit().addScaledVector(apical, -0.35).normalize();
      dirs.push(d);
    }
    for (let i = 0; i < nPrim; i++) {
      const d = dirs[i];
      const start = centre.clone().addScaledVector(d, somaR * 1.6);
      const r0 = somaR * (i === 0 ? 0.38 : rr(0.2, 0.3));
      addRoot(batch, centre, d, somaR, somaR * 1.6, r0, seed, tint);
      growBranch(batch, synapses, start, d, r0, i === 0 ? 0 : 1, 0, seed, tint);
    }
    // the axon: long, thin, fairly straight
    const axDir = apical.clone().negate().addScaledVector(randUnit(), 0.4).normalize();
    addRoot(batch, centre, axDir, somaR, somaR * 1.4, somaR * 0.12, seed, tint);
    growAxon(batch, synapses, centre.clone().addScaledVector(axDir, somaR * 1.4), axDir, somaR * 0.12, seed, tint);

    const soma = new THREE.Mesh(buildSomaGeometry(somaR, dirs), makeSomaMat(1.0 / somaR));
    soma.position.copy(centre);
    group.add(soma);

    // nucleus sits slightly off-centre inside the body
    const nucleus = new THREE.Mesh(nucleusGeo, makeNucleusMat());
    nucleus.scale.setScalar(somaR * rr(0.36, 0.46));
    nucleus.position.copy(centre).addScaledVector(randUnit(), somaR * 0.15);
    group.add(nucleus);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, color: 0xffffff, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      fog: true, opacity: 0.4,
    }));
    halo.scale.setScalar(somaR * rr(4.5, 7));
    halo.position.copy(centre);
    group.add(halo);

    somas.push({ mesh: soma, nucleus, halo, seed, active: fract(seed * 13.17) >= 0.42, baseHalo: halo.scale.x, phase: rand() * 10 });
  }

  // passing fibres from neurons outside the tunnel: long, thin, wandering
  for (let i = 0; i < CFG.passingFibres; i++) {
    pathAt(rr(z1, z0), c);
    const start = new THREE.Vector3(c.x + rr(-26, 26), c.y + rr(-20, 20), rr(z1, z0));
    // keep the immediate camera corridor reasonably clear
    if (Math.hypot(start.x - c.x, start.y - c.y) < 3.5) start.x += 6;
    const dir = randUnit();
    dir.z *= 0.6; dir.normalize();
    growFibre(batch, synapses, start, dir, rr(0.02, 0.07), rand(), rand() < 0.2 ? rr(0.4, 0.9) : 0);
  }

  const geo = batch.build();
  fibreGeoms.push(geo);
  const fibres = new THREE.Mesh(geo, fibreMat);
  fibres.frustumCulled = false;
  group.add(fibres);

  // synapse sparks + background dust
  const pts = [], cols = [], sizes = [], phases = [];
  const extra = CFG.synapsesPerChunk;
  for (let i = 0; i < extra; i++) {
    // scatter extra sparks onto fibre vertices so they sit on the network
    const vi = ri(0, geo.attributes.position.count - 1);
    synapses.push({ p: new THREE.Vector3().fromBufferAttribute(geo.attributes.position, vi), kind: 0 });
  }
  for (const s of synapses) {
    const roll = rand();
    const col = roll < 0.06 ? PALETTE.synWarm : roll < 0.09 ? PALETTE.synHot : PALETTE.synCool;
    const bright = s.kind === 1 ? rr(0.6, 1.1) : rr(0.35, 1.0);
    pts.push(s.p.x, s.p.y, s.p.z);
    cols.push(col.r * bright, col.g * bright, col.b * bright);
    sizes.push(s.kind === 1 ? rr(0.3, 0.6) : rr(0.16, 0.45));
    phases.push(rand());
  }
  for (let i = 0; i < CFG.dustPerChunk; i++) {
    pathAt(rr(z1, z0), c);
    pts.push(c.x + rr(-30, 30), c.y + rr(-22, 22), rr(z1, z0));
    const b = rr(0.08, 0.3);
    cols.push(0.45 * b, 0.55 * b, 1.0 * b);
    sizes.push(rr(0.08, 0.22));
    phases.push(rand());
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  pg.setAttribute('aColor', new THREE.Float32BufferAttribute(cols, 3));
  pg.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  pg.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  const points = new THREE.Points(pg, pointMat);
  points.frustumCulled = false;
  group.add(points);

  scene.add(group);
  chunks.set(k, { group, somas });
}

// Flared root: grows from inside the soma, wide at the core and easing down to the
// branch's own radius at the membrane, so the dendrite emerges from the cell body
// instead of butting against it. aAlong runs -1..0 here; the fibre shader fades
// that span out so the in-soma portion blends into the membrane.
function addRoot(batch, centre, dir, somaR, startDist, r0, seed, tint) {
  const N = 9;
  const pts = [], rads = [], als = [];
  const d0 = somaR * 0.1;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    pts.push(centre.clone().addScaledVector(dir, d0 + (startDist - d0) * t));
    const e = t * t * (3 - 2 * t);
    rads.push(somaR * 0.75 + (r0 - somaR * 0.75) * e);
    als.push(t - 1);
  }
  batch.add(pts, rads, als, seed, tint);
}

function growAxon(batch, synapses, start, dir, radius, seed, tint) {
  const pts = [start.clone()], rads = [radius], als = [0];
  const p = start.clone(), d = dir.clone(), j = new THREE.Vector3();
  const steps = ri(60, 110);
  let a = 0;
  for (let i = 1; i <= steps; i++) {
    d.addScaledVector(randUnit(j), 0.1).normalize();
    p.addScaledVector(d, 0.6);
    a += 0.6;
    pts.push(p.clone()); rads.push(Math.max(radius * (1 - i / steps * 0.5), 0.015)); als.push(a);
    if (i > 20 && rand() < 0.03) growBranch(batch, synapses, p, d.clone().addScaledVector(randUnit(j), 0.9).normalize(), radius * 0.5, 3, a, seed, tint);
  }
  batch.add(pts, rads, als, seed, tint);
}

function growFibre(batch, synapses, start, dir, radius, seed, tint) {
  const pts = [], rads = [], als = [];
  const p = start.clone(), d = dir.clone(), j = new THREE.Vector3();
  const curl = randUnit().multiplyScalar(0.03);
  const steps = ri(50, 120);
  for (let i = 0; i <= steps; i++) {
    if (i) { d.addScaledVector(randUnit(j), 0.16).add(curl).normalize(); p.addScaledVector(d, 0.55); }
    const t = i / steps;
    pts.push(p.clone());
    rads.push(Math.max(radius * Math.sin(Math.PI * Math.min(Math.max(t, 0.04), 0.96)), 0.008));
    als.push(i * 0.55);
    if (rand() < 0.012) synapses.push({ p: p.clone(), kind: 0 });
  }
  batch.add(pts, rads, als, seed, tint);
}

function disposeChunk(k) {
  const ch = chunks.get(k);
  if (!ch) return;
  ch.group.traverse((o) => {
    if (o.geometry && o.geometry !== nucleusGeo) o.geometry.dispose();
    if (o.material && o.material !== fibreMat && o.material !== pointMat) o.material.dispose();
  });
  scene.remove(ch.group);
  chunks.delete(k);
}

const fract = (x) => x - Math.floor(x);

// ── Post-processing ─────────────────────────────────────────────────────────
// MSAA on the scene target keeps hair-thin fibres from breaking into dashes
const msaaTarget = new THREE.WebGLRenderTarget(innerWidth * CFG.dpr, innerHeight * CFG.dpr, {
  type: THREE.HalfFloatType,
  samples: renderer.capabilities.isWebGL2 ? (IS_MOBILE ? 2 : 4) : 0,
});
const composer = new EffectComposer(renderer, msaaTarget);
composer.setPixelRatio(CFG.dpr);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));

// Safety net: zero out any NaN / Inf pixel before bloom can spread it
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      bool bad = any(notEqual(c, c)) || any(greaterThan(c, vec3(6.0e4)));
      gl_FragColor = vec4(bad ? vec3(0.0) : min(c, vec3(64.0)), texture2D(tDiffuse, vUv).a);
    }
  `,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), CFG.bloom.strength, CFG.bloom.radius, CFG.bloom.threshold);
// Depth of field: gather blur driven by depth stored in alpha.
// Thin-lens circle of confusion ~ |1/d - 1/focus|; each sample contributes only
// if its own blur disc reaches the centre pixel, so sharp foreground stays sharp.
const dofPass = new ShaderPass({
  defines: { SAMPLES: CFG.dofSamples },
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(innerWidth * CFG.dpr, innerHeight * CFG.dpr) },
    uFocus: { value: 14.0 },
    uFar: { value: CFG.dofFar },
    uK: { value: 30.0 * CFG.dpr },
    uMaxR: { value: (IS_MOBILE ? 10.0 : 15.0) * CFG.dpr },
    uFarBlur: { value: 3.5 * CFG.dpr },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uFocus, uFar, uK, uMaxR, uFarBlur;
    varying vec2 vUv;
    float depthOf(float a) { return max((1.0 - clamp(a, 0.0, 1.0)) * uFar, 0.05); }
    float cocOf(float d) {
      float c = abs(1.0 / d - 1.0 / uFocus) * uK;
      c += smoothstep(uFocus, uFocus + 60.0, d) * uFarBlur;
      return min(c, uMaxR);
    }
    void main() {
      vec4 c0 = texture2D(tDiffuse, vUv);
      float d0 = depthOf(c0.a);
      float coc0 = cocOf(d0);
      vec3 acc = c0.rgb;
      float wsum = 1.0;
      for (int i = 0; i < SAMPLES; i++) {
        float t = (float(i) + 0.5) / float(SAMPLES);
        float r = sqrt(t) * uMaxR;
        float ang = float(i) * 2.39996323;
        vec2 off = vec2(cos(ang), sin(ang)) * r / uRes;
        vec4 s = texture2D(tDiffuse, vUv + off);
        float sd = depthOf(s.a);
        float sc = cocOf(sd);
        // background must not bleed over a sharper foreground
        if (sd > d0) sc = min(sc, coc0 * 2.0);
        float w = smoothstep(r - 1.0, r + 0.5, sc);
        acc += s.rgb * w;
        wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, 1.0);
    }
  `,
});
dofPass.enabled = CFG.dof;
composer.addPass(dofPass);
composer.addPass(bloom);

const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: shared.uTime, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      // faint chromatic spread toward the edges, like a lens
      vec2 c = vUv - 0.5;
      float r = dot(c, c);
      vec2 off = c * r * 0.006;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // deep-blue lift in the shadows, vignette, grain
      col += vec3(0.002, 0.003, 0.012) * (1.0 - r * 2.0);
      col *= smoothstep(0.95, 0.18, r * 1.6);
      col += (h(vUv * uRes + fract(uTime) * 100.0) - 0.5) * 0.018;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
composer.addPass(finish);
composer.addPass(new OutputPass());

// ── Interaction ─────────────────────────────────────────────────────────────
const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
  finish.uniforms.uRes.value.set(innerWidth, innerHeight);
  dofPass.uniforms.uRes.value.set(innerWidth * CFG.dpr, innerHeight * CFG.dpr);
});
let paused = false;
document.addEventListener('visibilitychange', () => { paused = document.hidden; last = performance.now(); });

// ── Loop ────────────────────────────────────────────────────────────────────
let travel = parseFloat(params.get('z') || '0'); // distance along -Z
let last = performance.now();
let time = 0;
const camPos = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const fwd = new THREE.Vector3(), toSoma = new THREE.Vector3();
let focus = 14.0;
let camOverride = null; // debug: frame a specific soma

// Autofocus: rack toward the cell body nearest the centre of frame; when none is
// close to centre, drift slowly so focus still wanders through the layers.
function updateFocus(dt) {
  camera.getWorldDirection(fwd);
  let best = null, bestScore = 0.32;
  for (const ch of chunks.values()) {
    for (const s of ch.somas) {
      toSoma.subVectors(s.mesh.position, camera.position);
      const d = toSoma.dot(fwd);
      if (d < 6 || d > 38) continue;
      const lateral = toSoma.addScaledVector(fwd, -d).length() / d;
      if (lateral < bestScore) { bestScore = lateral; best = d; }
    }
  }
  const target = best !== null ? best : 16 + Math.sin(time * 0.05) * 4 + Math.sin(time * 0.13) * 1.5;
  focus += (target - focus) * Math.min(dt * 0.6, 1);
  dofPass.uniforms.uFocus.value = focus;
}

function ensureChunks() {
  const cur = Math.floor(travel / CFG.chunkLen);
  // generate at most one new chunk per frame to avoid hitches
  for (let k = cur - CFG.chunksBehind; k <= cur + CFG.chunksAhead; k++) {
    if (k >= 0 && !chunks.has(k)) { generateChunk(k); break; }
  }
  for (const k of chunks.keys()) if (k < cur - CFG.chunksBehind) disposeChunk(k);
}

// prime the view before first frame
for (let k = 0; k <= CFG.chunksAhead; k++) generateChunk(k);

function frame(now) {
  requestAnimationFrame(frame);
  if (paused) return;
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  time += dt;
  travel += dt * CFG.speed;
  shared.uTime.value = time;

  ensureChunks();

  // camera rides the path, looking slightly ahead, with a gentle roll and mouse parallax
  mouseS.lerp(mouse, 0.035);
  pathAt(-travel, camPos);
  pathAt(-travel - 9, look);
  camPos.x += mouseS.x * 1.6;
  camPos.y -= mouseS.y * 1.1;
  look.x += mouseS.x * 3.0;
  look.y -= mouseS.y * 2.0;
  camera.position.copy(camPos);
  const roll = Math.sin(time * 0.07) * 0.08;
  up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.up.copy(up);
  camera.lookAt(look);
  if (camOverride) { camera.position.copy(camOverride.pos); camera.lookAt(camOverride.target); }

  // somas: slow breathing plus a flash when a pulse leaves the cell body
  for (const ch of chunks.values()) {
    for (const s of ch.somas) {
      let flash = 0;
      if (s.active) {
        const ph = fract((0 - time * CFG.pulseSpeed) / CFG.pulseSpacing + s.seed);
        const d = (ph - 0.5) * CFG.pulseSpacing;
        flash = Math.exp(-d * d * 0.25);
      }
      const breathe = 0.9 + 0.1 * Math.sin(time * 0.8 + s.phase);
      s.mesh.material.uniforms.uFlash.value = flash;
      s.mesh.material.uniforms.uGlow.value = breathe;
      s.nucleus.material.uniforms.uFlash.value = flash;
      s.nucleus.material.uniforms.uGlow.value = breathe;
      s.halo.scale.setScalar(s.baseHalo * (breathe + flash * 0.25));
      s.halo.material.opacity = 0.35 + flash * 0.25;
    }
  }

  if (dofPass.enabled) updateFocus(dt);
  composer.render();
}

canvas.classList.add('ready');
requestAnimationFrame(frame);

// debug hook for capture tooling
window.__neuro = {
  CFG,
  setTravel: (z) => { travel = z; },
  renderOnce: () => composer.render(),
  // frame the i-th live soma from a given distance (debug / capture only)
  frameSoma: (i = 0, dist = 5) => {
    const all = [...chunks.values()].flatMap((c) => c.somas);
    const s = all[i % all.length];
    if (!s) return false;
    const target = s.mesh.position.clone();
    camOverride = { target, pos: target.clone().add(new THREE.Vector3(0.6, 0.4, dist)) };
    return true;
  },
};
