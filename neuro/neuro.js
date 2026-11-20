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
  pulseSpacing: 46.0,           // ambient pulses on passing fibres only
  spontaneousEvery: 14,         // mean seconds between a neuron firing on its own
  refractory: 3.0,              // seconds a neuron ignores input after firing
  transmitP: 0.34,              // chance a pulse crosses a junction (kept subcritical)
  maxTargets: 3,                // outgoing junctions per neuron
  junctionReach: 4.5,           // branch must pass this close to a soma to connect
  synapticDelay: 0.14,
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

// State modifiers layered on top of the user's settings. All neutral by default,
// so pages that never touch them (the homepage) render exactly as designed.
const MOD = { gain: 1, sat: 1, speed: 1, spont: 1, spark: 1, fov: 0, pulseMix: 0, transmit: 1, shake: 0 };
const USER = { gain: 1, sat: 1 };
const BASE_PULSE = new THREE.Color('#7ff3ff');
const MOD_PULSE = new THREE.Color('#ffc84a');
let sparkBase = 1;
let appliedFov = 62;

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

// ── Firing state: last 4 fire times per neuron, read by the fibre shader ────
const FIRE_W = 256;
const fireData = new Float32Array(FIRE_W * 4).fill(-1000);
const fireTex = new THREE.DataTexture(fireData, FIRE_W, 1, THREE.RGBAFormat, THREE.FloatType);
fireTex.minFilter = fireTex.magFilter = THREE.NearestFilter;
fireTex.needsUpdate = true;

// ── Fibre material (dendrites, axons) ───────────────────────────────────────
const fibreMat = new THREE.ShaderMaterial({
  uniforms: {
    ...shared,
    uBase: { value: PALETTE.fibreBase },
    uEdge: { value: PALETTE.fibreEdge },
    uPale: { value: PALETTE.fibrePale },
    uPulse: { value: PALETTE.pulse },
    uIntensity: { value: 0.32 },
    uFire: { value: fireTex },
  },
  vertexShader: /* glsl */`
    attribute float aAlong;
    attribute float aSeed;
    attribute float aTint;
    attribute float aRad;
    attribute float aFade;
    attribute float aNeuron;
    uniform sampler2D uFire;
    varying float vFade;
    varying vec4 vFire;
    varying float vNeuron;
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
      vFade = aFade;
      vNeuron = aNeuron;
      vFire = aNeuron >= 0.0
        ? texture2D(uFire, vec2((mod(aNeuron, 256.0) + 0.5) / 256.0, 0.5))
        : vec4(-1000.0);
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
    varying float vFade;
    varying vec4 vFire;
    varying float vNeuron;
    float front(float ft) {
      // pulse front leaves the soma at fire time ft and runs outward along the arbor
      float age = uTime - ft;
      float d = vAlong - age * uPulseSpeed;       // >0 ahead of the front, <0 behind
      float on = step(0.0, age) * step(age, 14.0);
      return on * (exp(-d * d * 1.6) * 1.8 + exp(min(d, 0.0) * 0.35) * step(d, 0.0) * step(-4.0, d) * 0.12);
    }
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

      // action potentials
      float sig;
      if (vNeuron >= 0.0) {
        // event-driven: up to four pulses in flight per neuron
        sig = front(vFire.x) + front(vFire.y) + front(vFire.z) + front(vFire.w);
      } else {
        // passing fibres from off-screen neurons: sparse ambient pulses
        float firing = step(0.6, fract(vSeed * 13.17));
        float ph = fract((vAlong - uTime * uPulseSpeed) / uPulseSpacing + vSeed);
        float d = (ph - 0.5) * uPulseSpacing;
        sig = exp(-d * d * 1.6) * firing * 1.2;
      }
      col += uPulse * sig * (0.6 + 0.6 * facing);

      float fog = exp(-depth * uFog);
      // with depth-of-field, close fibres melt into soft light instead of vanishing
      float nearFade = smoothstep(0.35, 3.0, depth);
      // roots (aAlong < 0) fade out inside the soma so the join blends
      float rootFade = smoothstep(-0.9, 0.1, vAlong);
      float vis = fog * nearFade * rootFade * vFade;
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

const MEMBRANE_VERT = /* glsl */`
  attribute float aLobe;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vObj;
  varying float vLobe;
  void main() {
    vObj = position;
    vLobe = aLobe;
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
    vertexShader: MEMBRANE_VERT,
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform float uFog, uFlash, uGlow, uDofFar, uGrain;
      uniform vec3 uRim, uEdge;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vObj;
      varying float vLobe;
      void main() {
        float depth = -vV.z;
        vec3 n = vN * inversesqrt(max(dot(vN, vN), 1e-8));
        float facing = clamp(abs(dot(n, normalize(-vV))), 0.0, 1.0);
        float edge = 1.0 - facing;
        // tight rim = defined membrane outline; broad rim = body volume
        float rimTight = pow(edge, 2.6);
        float rimBroad = pow(edge, 1.4);
        // dissolve the outline where a dendrite leaves the cell
        float exitFade = 1.0 - smoothstep(0.25, 0.8, vLobe);
        rimTight *= exitFade;
        rimBroad *= mix(0.3, 1.0, exitFade);
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
    this.pos = []; this.nor = []; this.along = []; this.seed = []; this.tint = []; this.rad = []; this.fade = []; this.nid = []; this.idx = [];
    this.curNid = -1; // neuron id stamped on tubes added while set
    this.vcount = 0;
  }
  add(points, radii, alongs, seed, tint, fades = null) {
    const n = points.length;
    if (n < 2) return;
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), tmp = new THREE.Vector3();
    const RS = S.thickness;
    const maxR = radii[0] * RS;
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
      const p = points[i], r = radii[i] * RS;
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
        this.fade.push(fades ? fades[i] : 1);
        this.nid.push(this.curNid);
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
    g.setAttribute('aFade', new THREE.Float32BufferAttribute(this.fade, 1));
    g.setAttribute('aNeuron', new THREE.Float32BufferAttribute(this.nid, 1));
    g.setIndex(this.vcount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// ── Neuron growth ───────────────────────────────────────────────────────────
// Random-walk dendrites with stochastic branching and taper.
// parentR / parentDir are set for side branches: the child then starts at the
// parent's thickness and heading, eases to its own radius and direction over the
// first few segments, and fades in, so the fork grows out of the parent instead
// of showing a flat tube end inside it.
function growBranch(batch, synapses, start, dir, radius, depth, along, seed, tint, parentR = 0, parentDir = null) {
  const pts = [start.clone()], rads = [radius], als = [along];
  const p = start.clone();
  const target = dir.clone();
  const d = parentDir ? parentDir.clone().lerp(dir, 0.35).normalize() : dir.clone();
  const segLen = 0.42 + depth * 0.06;
  const steps = Math.floor(rr(14, 34) * (1 - depth * 0.12));
  const jitter = new THREE.Vector3();
  const curl = randUnit().multiplyScalar(0.08); // slow consistent bend
  let r = radius, a = along;
  for (let i = 1; i <= steps; i++) {
    if (parentDir && i <= 5) d.lerp(target, 0.3).normalize();
    d.addScaledVector(randUnit(jitter), 0.28).add(curl).normalize();
    p.addScaledVector(d, segLen);
    r = Math.max(r * 0.955, 0.02);
    a += segLen;
    pts.push(p.clone()); rads.push(r); als.push(a);
    if (ARBOR && (i & 1)) ARBOR.push(p.x, p.y, p.z, a);

    if (depth < (S.branching > 1.2 ? 4 : 5) && i > 3 && rand() < (0.075 + depth * 0.01) * S.branching && BUDGET-- > 0) {
      const nd = d.clone().addScaledVector(randUnit(jitter), 0.95).normalize();
      growBranch(batch, synapses, p, nd, r * rr(0.6, 0.85), depth + 1, a, seed, tint, r, d);
    }
    // dendritic spines / boutons
    if (rand() < 0.035) synapses.push({ p: p.clone(), kind: 0 });
  }
  // taper the last few samples to a point
  const k = Math.min(4, rads.length - 1);
  for (let j = 0; j < k; j++) rads[rads.length - 1 - j] *= (j + 1) / (k + 1);
  let fades = null;
  if (parentR > 0) {
    const K = Math.min(5, rads.length - 1);
    fades = rads.map(() => 1);
    for (let j = 0; j <= K; j++) {
      const t = j / K, e = t * t * (3 - 2 * t);
      rads[j] = parentR * 0.92 + (rads[j] - parentR * 0.92) * e;
      fades[j] = Math.min(1, j / 3) ** 1.5;
    }
  }
  batch.add(pts, rads, als, seed, tint, fades);
  if (rand() < 0.45) synapses.push({ p: p.clone(), kind: 1 }); // terminal bouton
}

function buildSomaGeometry(radius, dirs) {
  const g = new THREE.IcosahedronGeometry(1, 4);
  const pos = g.attributes.position;
  const lobe = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  const off = rr(0, 100);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let s = radius * (0.9 + 0.2 * noise3(v.x * 2.6 + off, v.y * 2.6, v.z * 2.6)
                    + 0.02 * noise3(v.x * 9 + off, v.y * 9, v.z * 9));
    // pull the membrane out toward each primary dendrite: pyramidal / stellate shape
    let w = 0;
    for (const d of dirs) {
      const k = Math.max(v.dot(d), 0);
      s += radius * 1.25 * Math.pow(k, 4);
      w = Math.max(w, Math.pow(k, 8));
    }
    lobe[i] = w;
    pos.setXYZ(i, v.x * s, v.y * s, v.z * s);
  }
  g.computeVertexNormals();
  g.setAttribute('aLobe', new THREE.BufferAttribute(lobe, 1));
  return g;
}

// ── Chunk generation ────────────────────────────────────────────────────────
const chunks = new Map(); // index -> { group, somas: [] }
const nucleusGeo = new THREE.IcosahedronGeometry(1, 3);
let ARBOR = null;            // while growing a neuron: flat [x, y, z, along, ...] samples
let BUDGET = 0;              // forks left for the neuron being grown (guards high branching)
// Structural multipliers, 1 = the original network. Set from the /neuro settings panel.
const S = { density: 1, thickness: 1, branching: 1, connections: 1 };
const pulseSpeed = () => CFG.pulseSpeed * Math.sqrt(S.thickness); // thicker fibres conduct faster
// more links -> more excitable network (expected triggers per firing: 1 link 0.34, 3 links 1.0, 8 links 2.0);
// the refractory period stops it locking up. 3 links (default) keeps the original 0.34.
const transmitP = () => Math.min(CFG.transmitP, 2.0 / CFG.maxTargets);
let nextNeuronId = 0;
const neurons = new Map();   // id -> soma record (live chunks only)
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
  const count = Math.max(1, Math.round(ri(CFG.neuronsPerChunk[0], CFG.neuronsPerChunk[1]) * S.density));
  for (let n = 0; n < count; n++) {
    const z = rr(z1, z0);
    pathAt(z, c);
    const ang = rr(0, Math.PI * 2);
    const dist = rr(7, 20);
    const centre = new THREE.Vector3(c.x + Math.cos(ang) * dist, c.y + Math.sin(ang) * dist * 0.75, z);
    const seed = rand();
    const tint = rand() < 0.12 ? rr(0.3, 0.7) : 0;
    const somaR = rr(0.4, 0.75) * Math.pow(S.thickness, 0.4);
    BUDGET = 320;
    const nPrim = ri(5, 9);
    const dirs = [];
    const nid = nextNeuronId++;
    batch.curNid = nid;
    ARBOR = [];
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
    const arbor = new Float32Array(ARBOR);
    ARBOR = null;
    batch.curNid = -1;

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

    const rec = {
      id: nid, mesh: soma, nucleus, halo, seed, centre, arbor, out: [],
      fires: [-1000, -1000, -1000, -1000], slot: 0, lastFire: -1000,
      baseHalo: halo.scale.x, phase: rand() * 10,
    };
    const base = (nid % FIRE_W) * 4;
    fireData.fill(-1000, base, base + 4);
    fireTex.needsUpdate = true;
    somas.push(rec);
  }

  // passing fibres from neurons outside the tunnel: long, thin, wandering
  for (let i = 0; i < Math.round(CFG.passingFibres * S.density); i++) {
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
  const extra = Math.round(CFG.synapsesPerChunk * S.density);
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
  for (let i = 0; i < Math.round(CFG.dustPerChunk * S.density); i++) {
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
  for (const r of somas) neurons.set(r.id, r);
  connectNeurons(somas);
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
    const rb = somaR * 0.75 / S.thickness; // tube radii are scaled by thickness in TubeBatch
    rads.push(rb + (r0 - rb) * e);
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
    if (ARBOR && (i & 1)) ARBOR.push(p.x, p.y, p.z, a);
    if (i > 20 && rand() < 0.03) growBranch(batch, synapses, p, d.clone().addScaledVector(randUnit(j), 0.9).normalize(), radius * 0.5, 3, a, seed, tint, rads[rads.length - 1], d);
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
  for (const r of ch.somas) neurons.delete(r.id);
  chunks.delete(k);
}

const fract = (x) => x - Math.floor(x);

// ── Signal network ──────────────────────────────────────────────────────────
// A junction A->B exists where A's arbor passes within junctionReach of B's soma.
// Its delay is the arbor distance from A's soma to that point, so the spark
// lands when A's visible pulse front gets there.
function junction(A, B) {
  const a = A.arbor, c = B.centre;
  let best = Infinity, bi = -1;
  for (let i = 0; i < a.length; i += 4) {
    const dx = a[i] - c.x, dy = a[i + 1] - c.y, dz = a[i + 2] - c.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best) { best = d2; bi = i; }
  }
  if (bi < 0 || best > CFG.junctionReach * CFG.junctionReach) return null;
  return {
    target: B.id,
    along: a[bi + 3],
    gap: Math.sqrt(best),
    pos: new THREE.Vector3(a[bi], a[bi + 1], a[bi + 2]),
  };
}

function connectNeurons(fresh) {
  const all = [...neurons.values()];
  const touched = new Set();
  for (const A of fresh) {
    for (const B of all) {
      if (A === B || A.centre.distanceTo(B.centre) > 70) continue;
      const ab = junction(A, B);
      if (ab) { A.out.push(ab); touched.add(A); }
      if (!fresh.includes(B)) {
        const ba = junction(B, A);
        if (ba) { B.out.push(ba); touched.add(B); }
      }
    }
  }
  // keep the nearest few junctions per neuron
  for (const N of touched) {
    N.out.sort((x, y) => x.gap - y.gap);
    N.out.length = Math.min(N.out.length, CFG.maxTargets);
  }
}

const events = []; // { t, kind: 'fire' | 'spark', id?, pos? }
function schedule(e) {
  let i = events.length;
  while (i > 0 && events[i - 1].t > e.t) i--;
  events.splice(i, 0, e);
}

function fireNeuron(N, t) {
  if (t - N.lastFire < CFG.refractory) return;
  N.lastFire = t;
  N.fires[N.slot] = t;
  fireData[(N.id % FIRE_W) * 4 + N.slot] = t;
  N.slot = (N.slot + 1) & 3;
  fireTex.needsUpdate = true;
  for (const j of N.out) {
    const arrive = t + j.along / pulseSpeed();
    schedule({ t: arrive, kind: 'spark', pos: j.pos });
    if (Math.random() < transmitP() * MOD.transmit) {
      schedule({ t: arrive + CFG.synapticDelay + j.gap / pulseSpeed(), kind: 'fire', id: j.target });
    }
  }
}

function stepSignals(t, dt) {
  // spontaneous activity keeps the network alive as the camera moves on
  const pSpont = dt / CFG.spontaneousEvery * MOD.spont;
  for (const N of neurons.values()) if (Math.random() < pSpont) fireNeuron(N, t);
  while (events.length && events[0].t <= t) {
    const e = events.shift();
    if (e.kind === 'spark') emitSpark(e.pos, e.t);
    else { const N = neurons.get(e.id); if (N) fireNeuron(N, e.t); }
  }
}

// Junction sparks: a small ring buffer of glints drawn as points
const SPARKS = 96;
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
sparkGeo.setAttribute('aBirth', new THREE.BufferAttribute(new Float32Array(SPARKS).fill(-1000), 1));
let sparkHead = 0;
const sparkMat = new THREE.ShaderMaterial({
  uniforms: { ...shared, uColor: { value: PALETTE.pulse }, uBoost: { value: 1.0 } },
  vertexShader: /* glsl */`
    attribute float aBirth;
    uniform float uTime, uPixelRatio, uBoost;
    varying float vA;
    varying float vDepth;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDepth = -mv.z;
      float age = uTime - aBirth;
      vA = step(0.0, age) * exp(-age * 2.4);
      gl_PointSize = min((0.7 + age * 1.2) * uBoost * uPixelRatio * (260.0 / max(vDepth, 0.5)), 40.0 * uPixelRatio) * step(0.0, age);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */`
    uniform float uFog, uDofFar, uBoost;
    uniform vec3 uColor;
    varying float vA;
    varying float vDepth;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float r2 = dot(p, p);
      float a = (exp(-r2 * 26.0) + exp(-r2 * 200.0) * 1.6) * vA;
      float fog = exp(-vDepth * uFog);
      float nearFade = smoothstep(0.4, 2.5, vDepth);
      float dA = (1.0 - clamp(vDepth / uDofFar, 0.0, 1.0)) * step(0.3, a) * step(0.12, fog * nearFade);
      gl_FragColor = vec4(uColor * a * 1.6 * uBoost * fog * nearFade, dA);
    }
  `,
  transparent: true,
  depthWrite: false,
  ...DEPTH_ADDITIVE,
});
const sparks = new THREE.Points(sparkGeo, sparkMat);
sparks.frustumCulled = false;
scene.add(sparks);

function emitSpark(pos, t) {
  const i = sparkHead;
  sparkHead = (sparkHead + 1) % SPARKS;
  sparkGeo.attributes.position.setXYZ(i, pos.x, pos.y, pos.z);
  sparkGeo.attributes.aBirth.setX(i, t);
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.aBirth.needsUpdate = true;
}

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
  uniforms: {
    tDiffuse: { value: null }, uTime: shared.uTime, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) },
    uSat: { value: 1.0 },   // colour intensity: 0 = monochrome, 1 = as designed, 2 = doubled
    uGain: { value: 1.0 },  // overall intensity multiplier, before tone mapping
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uSat, uGain;
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
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(lum), col, uSat), 0.0) * uGain;
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
let fps = 60;
let last = performance.now();
let time = 0;
const camPos = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const fwd = new THREE.Vector3(), toSoma = new THREE.Vector3();
let focus = 14.0;
let camOverride = null; // debug: frame a specific soma

// Autofocus: rack toward the cell body nearest the centre of frame; when none is
// close to centre, drift slowly so focus still wanders through the layers.
// ── Interaction (opt-in; /neuro enables it, the homepage background does not) ──
const IX = {
  on: false,
  lock: null,          // { rec, until } focus held on a tapped neuron
  hover: null,         // neuron under the mouse cursor
  px: 0, py: 0,        // pointer position, CSS px
  lastMove: -1e9,      // time of last mouse move
  mouse: false,        // pointer is a mouse (focus-follows-cursor is desktop only)
};
const projV = new THREE.Vector3();

// Nearest live soma to a screen point; prefers nearer neurons slightly.
function pickSoma(px, py, maxPx) {
  let best = null, bestScore = Infinity;
  for (const N of neurons.values()) {
    const dist = N.centre.distanceTo(camera.position);
    if (dist > 70) continue;
    projV.copy(N.centre).project(camera);
    if (projV.z > 1 || projV.z < -1) continue;
    const sx = (projV.x * 0.5 + 0.5) * innerWidth;
    const sy = (-projV.y * 0.5 + 0.5) * innerHeight;
    const d = Math.hypot(sx - px, sy - py);
    if (d > maxPx) continue;
    const score = d + dist * 1.5;
    if (score < bestScore) { bestScore = score; best = N; }
  }
  return best;
}

function depthAlongView(N) {
  return Math.max(2, toSoma.subVectors(N.centre, camera.position).dot(fwd));
}

function tapRing(x, y, hit) {
  const r = document.createElement('div');
  r.className = 'nx-tap' + (hit ? ' hit' : '');
  r.style.left = x + 'px';
  r.style.top = y + 'px';
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 900);
}

function enableInteraction() {
  if (IX.on) return;
  IX.on = true;
  const st = document.createElement('style');
  st.textContent = `
    .nx-tap { position: fixed; z-index: 30; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%;
      border: 1.5px solid rgba(0,200,224,0.9); pointer-events: none; animation: nx-tap .9s ease-out forwards; }
    .nx-tap.hit { border-color: rgba(127,243,255,1); box-shadow: 0 0 12px rgba(0,200,224,0.8); }
    @keyframes nx-tap { from { transform: scale(0.4); opacity: 1; } to { transform: scale(4); opacity: 0; } }`;
  document.head.appendChild(st);

  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 350;
    down = null;
    if (moved > 12 || !quick) return;
    // tap: fire the neuron nearest the touch point, bypassing its rest period
    const N = pickSoma(e.clientX, e.clientY, e.pointerType === 'mouse' ? 160 : 220) || pickSoma(e.clientX, e.clientY, 420);
    tapRing(e.clientX, e.clientY, !!N);
    if (!N) return;
    N.lastFire = -1000;
    fireNeuron(N, time);
    emitSpark(N.centre, time);
    IX.lock = { rec: N, until: time + (e.pointerType === 'mouse' ? 2.5 : 6) };
  });
  canvas.addEventListener('pointermove', (e) => {
    IX.px = e.clientX; IX.py = e.clientY;
    IX.mouse = e.pointerType === 'mouse';
    if (IX.mouse) IX.lastMove = time;
  });
  canvas.addEventListener('pointerleave', () => { IX.lastMove = -1e9; IX.hover = null; canvas.classList.remove('nx-over'); });
}

function updateFocus(dt) {
  camera.getWorldDirection(fwd);

  // 1. a tapped neuron holds focus for a few seconds
  if (IX.lock && (time > IX.lock.until || !neurons.has(IX.lock.rec.id))) IX.lock = null;
  let driven = null;
  if (IX.lock) driven = depthAlongView(IX.lock.rec);

  // 2. desktop: focus follows the neuron under the cursor while the mouse is active
  if (driven === null && IX.on && IX.mouse && time - IX.lastMove < 5) {
    const N = pickSoma(IX.px, IX.py, 170);
    if (N) IX.hover = N;
    if (IX.hover && !neurons.has(IX.hover.id)) IX.hover = null;
    canvas.classList.toggle('nx-over', !!N); // styled by the /neuro cursor layer
    if (IX.hover) driven = depthAlongView(IX.hover);
  } else if (IX.on && !IX.lock) {
    IX.hover = null;
  }
  if (driven !== null) {
    focus += (driven - focus) * Math.min(dt * 2.2, 1);  // pointer-driven focus racks faster
    dofPass.uniforms.uFocus.value = focus;
    return;
  }

  // 3. otherwise: autofocus on the soma nearest frame centre
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
  const rawDt = (now - last) / 1000;
  if (rawDt > 0) fps += (1 / rawDt - fps) * 0.05;
  const dt = Math.min(rawDt, 0.05);
  last = now;
  time += dt;
  travel += dt * CFG.speed * MOD.speed;
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
  if (MOD.shake > 0) {
    // fine tremor: layered high-frequency sines on position and aim
    const t = time, k = MOD.shake;
    camPos.x += (Math.sin(t * 41.3) * 0.6 + Math.sin(t * 67.9 + 1.7) * 0.4) * k;
    camPos.y += (Math.sin(t * 47.1 + 0.4) * 0.6 + Math.sin(t * 73.3 + 2.9) * 0.4) * k;
    look.x += Math.sin(t * 29.7 + 0.9) * k * 3;
    look.y += Math.sin(t * 33.1 + 2.2) * k * 3;
  }
  camera.position.copy(camPos);
  const roll = Math.sin(time * 0.07) * 0.08;
  up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.up.copy(up);
  camera.lookAt(look);
  if (camOverride) { camera.position.copy(camOverride.pos); camera.lookAt(camOverride.target); }

  stepSignals(time, dt);

  // somas: slow breathing plus a flash when the neuron fires
  for (const ch of chunks.values()) {
    for (const s of ch.somas) {
      const age = time - s.lastFire;
      const flash = age >= 0 ? Math.exp(-age * 2.2) : 0;
      const breathe = 0.9 + 0.1 * Math.sin(time * 0.8 + s.phase);
      s.mesh.material.uniforms.uFlash.value = flash;
      s.mesh.material.uniforms.uGlow.value = breathe;
      s.nucleus.material.uniforms.uFlash.value = flash;
      s.nucleus.material.uniforms.uGlow.value = breathe;
      s.halo.scale.setScalar(s.baseHalo * (breathe + flash * 0.25));
      s.halo.material.opacity = 0.35 + flash * 0.25;
    }
  }

  // apply state modifiers
  finish.uniforms.uGain.value = USER.gain * MOD.gain;
  finish.uniforms.uSat.value = USER.sat * MOD.sat;
  sparkMat.uniforms.uBoost.value = sparkBase * MOD.spark;
  PALETTE.pulse.copy(BASE_PULSE).lerp(MOD_PULSE, Math.min(1, Math.max(0, MOD.pulseMix)));
  if (Math.abs(62 + MOD.fov - appliedFov) > 0.01) {
    appliedFov = 62 + MOD.fov;
    camera.fov = appliedFov;
    camera.updateProjectionMatrix();
  }

  if (dofPass.enabled) updateFocus(dt);
  composer.render();
}

canvas.classList.add('ready');
function kickStart(t0) {
  const first = [...neurons.values()].sort(() => Math.random() - 0.5).slice(0, 3);
  first.forEach((N, i) => schedule({ t: t0 + 0.6 + i * 1.3, kind: 'fire', id: N.id }));
}
kickStart(0);

// Regenerate every live chunk in place (same seed, current structure settings).
function rebuild() {
  for (const k of [...chunks.keys()]) disposeChunk(k);
  events.length = 0;
  fireData.fill(-1000);
  fireTex.needsUpdate = true;
  sparkGeo.attributes.aBirth.array.fill(-1000);
  sparkGeo.attributes.aBirth.needsUpdate = true;
  shared.uPulseSpeed.value = pulseSpeed();
  const cur = Math.floor(travel / CFG.chunkLen);
  for (let k = Math.max(0, cur - CFG.chunksBehind); k <= cur + CFG.chunksAhead; k++) generateChunk(k);
  kickStart(time);
}

// Rebuild the world from a new seed, from the start of the path.
function reseed(seed) {
  CFG.seed = (Math.abs(Math.floor(Number(seed))) || 1) % 1000000000;
  travel = 0;
  focus = 14.0;
  rebuild();
  return CFG.seed;
}

// Re-derive junctions without regenerating geometry.
function rewire() {
  CFG.maxTargets = Math.min(8, Math.max(1, Math.round(3 * S.connections)));
  CFG.junctionReach = 4.5 * Math.sqrt(S.connections);
  sparkBase = 0.6 + 0.4 * S.connections; // junction sparks read more as links grow
  const all = [...neurons.values()];
  for (const N of all) N.out = [];
  connectNeurons(all);
}
requestAnimationFrame(frame);

// debug hook for capture tooling
window.__neuro = {
  CFG,
  // ── control surface (used by /neuro settings panel; defaults leave behaviour unchanged)
  defaults: { speed: CFG.speed, sat: 1, gain: 1 },
  getSeed: () => CFG.seed,
  reseed,
  setSpeed: (v) => { CFG.speed = Math.max(0, v); },
  getSpeed: () => CFG.speed,
  setSaturation: (v) => { USER.sat = Math.max(0, v); },
  setGain: (v) => { USER.gain = Math.max(0, v); },
  // state layer: modifiers multiply the user's settings; burst fires a cluster near frame centre
  setMods: (o) => { Object.assign(MOD, o); },
  resetMods: () => { Object.assign(MOD, { gain: 1, sat: 1, speed: 1, spont: 1, spark: 1, fov: 0, pulseMix: 0, transmit: 1, shake: 0 }); },
  setModColor: (hex) => { MOD_PULSE.set(hex); },
  getMods: () => ({ ...MOD }),
  burst: (n, spread = 0.03) => {
    camera.getWorldDirection(fwd);
    const cand = [];
    for (const N of neurons.values()) {
      toSoma.subVectors(N.centre, camera.position);
      const d = toSoma.dot(fwd);
      if (d < 5 || d > 45) continue;
      const lateral = toSoma.addScaledVector(fwd, -d).length() / d;
      cand.push({ N, score: lateral + d * 0.004 });
    }
    cand.sort((a, b) => a.score - b.score);
    cand.slice(0, n).forEach((c, i) => {
      c.N.lastFire = -1000;
      schedule({ t: time + i * spread * Math.random() * 2, kind: 'fire', id: c.N.id });
    });
    return Math.min(n, cand.length);
  },
  // structure: multipliers, 1 = original. density/thickness/branching rebuild; connections rewire live
  setStructure: (o) => { for (const k of ['density', 'thickness', 'branching']) if (o[k] != null) S[k] = o[k]; rebuild(); },
  setConnections: (v) => { S.connections = v; rewire(); },
  getStructure: () => ({ ...S }),
  isMobile: IS_MOBILE,
  getFps: () => fps,
  enableInteraction,
  setTravel: (z) => { travel = z; },
  renderOnce: () => composer.render(),
  fireAll: () => { for (const N of neurons.values()) { N.lastFire = -1000; fireNeuron(N, time); } },
  stats: () => ({ neurons: neurons.size, junctions: [...neurons.values()].reduce((n, r) => n + r.out.length, 0), queued: events.length }),
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
