'use client';

/**
 * Launch screen: a cloud of liquid droplets flows together, merges like mercury and forms
 * the CDNX wordmark, which then locks into the exact vector logo with "CADNEX" set beneath.
 * It leaves as soon as the app underneath has booted.
 *
 * Rendering is two WebGL passes. Pass 1 draws every droplet as a soft point into a
 * half-resolution "field" texture (additive). Pass 2 thresholds that field into a liquid
 * surface, shades it from the field's slope (highlights, lime/violet rim while moving) and
 * blends the field into the real logo mask so the final frame is pixel-exact.
 * Reduced-motion users and browsers without WebGL get a simple fade of the same lockup.
 *
 * `?splash=<seconds>` freezes the timeline at that moment (for checking frames).
 */
import { useEffect, useRef, useState } from 'react';
import { MARK, SUB } from '../components/Brand';
import { isReady, READY_EVENT } from './ready';

// The wordmark's box inside the traced artwork (viewBox units) and the full lockup height.
const VB_X = 554;
const VB_Y = 533;
const VB_W = 1645;
const VB_H = 443;
const LOCK_H = 602;
const ASPECT = VB_H / VB_W;

// Timeline in seconds.
const T_FADE = 0.28; // droplets fade in
const T_LOCK = 0.82; // liquid starts pouring into the exact letter shapes
const T_CRISP = 1.48; // logo fully crisp
const T_SUB = 1.2; // "CADNEX" line starts
const T_DONE = 1.78; // earliest moment the splash may leave
const T_DONE_SIMPLE = 0.8; // same, for the reduced-motion fade
const T_WAIT = 2.6; // still not ready: show a quiet progress line
const T_GIVE_UP = 9; // never cover the app for longer than this
const EXIT_MS = 560;

const SPLASH_BG = '#0A0A0C';
const SQUASH = 0.62;
const CX = 0.5;
const CY = ASPECT / 2;

type Phase = 'run' | 'exit' | 'gone';

interface Drop {
  // polar coordinates around the logo centre; y is squashed by SQUASH so the vortex is an ellipse
  rt: number; // target radius and angle (where the droplet sits in the logo)
  at: number;
  rs: number; // scattered start radius and angle
  as: number;
  delay: number;
  dur: number;
  r0: number; // start size as a share of the settled size
  ph: number; // phase for wobble
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const x = clamp((v - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** Seeded random so every launch looks equally good. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample droplet targets from the filled wordmark, then scatter each one outward. */
function makeDrops(): Drop[] {
  const gw = 420;
  const gh = Math.round(gw * ASPECT);
  const c = document.createElement('canvas');
  c.width = gw;
  c.height = gh;
  const ctx = c.getContext('2d');
  if (!ctx) return [];
  ctx.setTransform(gw / VB_W, 0, 0, gh / VB_H, (-VB_X * gw) / VB_W, (-VB_Y * gh) / VB_H);
  ctx.fillStyle = '#fff';
  ctx.fill(new Path2D(MARK), 'evenodd');
  const img = ctx.getImageData(0, 0, gw, gh).data;
  const rand = rng(7);
  const step = gh * 0.085;
  const out: Drop[] = [];
  for (let y = step / 2; y < gh; y += step) {
    for (let x = step / 2; x < gw; x += step) {
      const jx = clamp(Math.round(x + (rand() - 0.5) * step * 0.5), 0, gw - 1);
      const jy = clamp(Math.round(y + (rand() - 0.5) * step * 0.5), 0, gh - 1);
      if (img[(jy * gw + jx) * 4 + 3] < 140) continue;
      // target in squashed polar coordinates around the logo centre
      const dx = jx / gw - CX;
      const dy = ((jy / gh) * ASPECT - CY) / SQUASH;
      const rt = Math.hypot(dx, dy);
      const at = Math.atan2(dy, dx);
      // start further out and further back around the vortex, so everything spirals in
      out.push({
        rt, at,
        rs: rt + 0.28 + 0.62 * Math.pow(rand(), 0.7),
        as: at - (1.1 + 1.3 * rand()),
        delay: 0.04 + 0.22 * (jx / gw) + 0.2 * rand(),
        dur: 0.66 + 0.26 * rand(),
        r0: 0.45 + 0.5 * rand(),
        ph: rand() * Math.PI * 2,
      });
    }
  }
  return out;
}

const VS_DROPS = `
attribute vec2 a_pos;
attribute float a_size;
attribute float a_str;
uniform vec2 u_res;
varying float v_str;
void main() {
  vec2 c = a_pos / u_res * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  gl_PointSize = a_size;
  v_str = a_str;
}`;

const FS_DROPS = `
precision mediump float;
varying float v_str;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float f = 1.0 - r2;
  gl_FragColor = vec4(f * f * v_str);
}`;

const VS_QUAD = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FS_SURFACE = `
precision mediump float;
uniform sampler2D u_field;
uniform sampler2D u_mask;
uniform vec2 u_texel;
uniform float u_k;
uniform float u_time;
uniform float u_str;
varying vec2 v_uv;
float F(vec2 uv) { return texture2D(u_field, uv).r / u_str; }
void main() {
  float m = texture2D(u_mask, v_uv).r;
  float f = mix(F(v_uv), m, u_k);
  float a = smoothstep(0.44, 0.56, f);
  if (a <= 0.001) { gl_FragColor = vec4(0.0); return; }
  vec2 g = vec2(F(v_uv + vec2(u_texel.x, 0.0)) - F(v_uv - vec2(u_texel.x, 0.0)),
                F(v_uv + vec2(0.0, u_texel.y)) - F(v_uv - vec2(0.0, u_texel.y)));
  vec3 n = normalize(vec3(-g * 5.5 / (1.0 + 0.7 * f), 1.0));
  vec3 L = normalize(vec3(-0.45, 0.55, 0.7));
  float ndl = dot(n, L);
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 36.0);
  float rim = clamp(1.0 - n.z * 1.08, 0.0, 1.0);
  vec3 lime = vec3(0.71, 0.95, 0.24);
  vec3 violet = vec3(0.55, 0.47, 1.0);
  vec3 tint = mix(violet, lime, 0.5 + 0.5 * sin(u_time * 2.1 + v_uv.x * 7.0 + v_uv.y * 3.0));
  // liquid metal: dark body, bright crest, coloured film at the edges
  vec3 liquid = mix(vec3(0.42, 0.42, 0.47), vec3(0.98), smoothstep(-0.35, 0.95, ndl));
  liquid += vec3(spec * 1.15) + tint * pow(rim, 2.2) * 1.25;
  vec3 col = mix(liquid, vec3(0.965), smoothstep(0.55, 1.0, u_k));
  gl_FragColor = vec4(min(col, vec3(1.0)) * a, a);
}`;

interface Scene {
  frame(t: number, mark: { x: number; y: number; w: number }): void;
  destroy(): void;
}

function compile(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const v = mk(gl.VERTEX_SHADER, vs);
  const f = mk(gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  if (!v || !f || !p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

function makeTexture(gl: WebGLRenderingContext, w: number, h: number, type: number): WebGLTexture | null {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Sets up WebGL, or returns null so the caller falls back to the simple fade. */
function createScene(canvas: HTMLCanvasElement, drops: Drop[]): Scene | null {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl || !drops.length) return null;
  const maxPoint = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1] ?? 1;
  if (maxPoint < 24) return null;
  const pDrops = compile(gl, VS_DROPS, FS_DROPS);
  const pSurf = compile(gl, VS_QUAD, FS_SURFACE);
  if (!pDrops || !pSurf) return null;

  const dropBuf = gl.createBuffer();
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const data = new Float32Array(drops.length * 4);

  const loc = {
    dPos: gl.getAttribLocation(pDrops, 'a_pos'),
    dSize: gl.getAttribLocation(pDrops, 'a_size'),
    dStr: gl.getAttribLocation(pDrops, 'a_str'),
    dRes: gl.getUniformLocation(pDrops, 'u_res'),
    qPos: gl.getAttribLocation(pSurf, 'a_pos'),
    field: gl.getUniformLocation(pSurf, 'u_field'),
    mask: gl.getUniformLocation(pSurf, 'u_mask'),
    texel: gl.getUniformLocation(pSurf, 'u_texel'),
    k: gl.getUniformLocation(pSurf, 'u_k'),
    time: gl.getUniformLocation(pSurf, 'u_time'),
    str: gl.getUniformLocation(pSurf, 'u_str'),
  };

  // Prefer a half-float field: overlapping droplets add up without clipping, so the merged
  // liquid keeps its contours. Otherwise use 8-bit and scale droplets down to leave headroom.
  const half = gl.getExtension('OES_texture_half_float');
  const halfLinear = gl.getExtension('OES_texture_half_float_linear');
  gl.getExtension('EXT_color_buffer_half_float');
  let fieldType: number = gl.UNSIGNED_BYTE;
  let STR = 0.4;
  if (half && halfLinear) {
    const t = makeTexture(gl, 4, 4, half.HALF_FLOAT_OES);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
      fieldType = half.HALF_FLOAT_OES;
      STR = 1;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(t);
  }

  let W = 0;
  let H = 0;
  let FW = 0;
  let FH = 0;
  let fieldTex: WebGLTexture | null = null;
  let fbo: WebGLFramebuffer | null = null;
  let maskTex: WebGLTexture | null = null;
  let maskKey = '';

  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w === W && h === H) return dpr;
    W = canvas.width = w;
    H = canvas.height = h;
    FW = Math.max(1, Math.round(W / 2));
    FH = Math.max(1, Math.round(H / 2));
    if (fieldTex) gl.deleteTexture(fieldTex);
    if (fbo) gl.deleteFramebuffer(fbo);
    fieldTex = makeTexture(gl, FW, FH, fieldType);
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fieldTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    maskKey = '';
    return dpr;
  };

  /** The exact logo, drawn at full resolution where the liquid ends up. */
  const updateMask = (mx: number, my: number, mw: number) => {
    const key = `${W}x${H}:${mx.toFixed(1)},${my.toFixed(1)},${mw.toFixed(1)}`;
    if (key === maskKey) return;
    maskKey = key;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const s = mw / VB_W;
    ctx.setTransform(s, 0, 0, s, mx - VB_X * s, my - VB_Y * s);
    ctx.fillStyle = '#fff';
    ctx.fill(new Path2D(MARK), 'evenodd');
    if (!maskTex) maskTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  return {
    frame(t, mark) {
      const dpr = size();
      const mx = mark.x * dpr;
      const my = mark.y * dpr;
      const mw = mark.w * dpr;
      updateMask(mx, my, mw);

      // pass 1: droplets into the half-resolution field
      const fs = FW / W; // field scale
      const R = mw * ASPECT * 0.165 * fs; // settled droplet radius in field pixels
      const intro = smooth(0, T_FADE, t);
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        const p = clamp((t - d.delay) / d.dur, 0, 1);
        const e = easeInOut(p);
        // the angle leads, the radius follows: droplets swing round, then pour inward
        const ea = 1 - Math.pow(1 - p, 3);
        const ang = d.as + (d.at - d.as) * ea + (1 - ea) * 0.12 * Math.sin(t * 1.4 + d.ph);
        const rad = d.rs + (d.rt - d.rs) * e;
        let x = CX + Math.cos(ang) * rad;
        let y = CY + Math.sin(ang) * rad * SQUASH;
        const wob = (1 - e) * (0.005 + 0.01 * Math.sin(Math.PI * e));
        x += Math.sin(t * 2.3 + d.ph) * wob;
        y += Math.cos(t * 1.9 + d.ph * 1.3) * wob;
        const r = R * (d.r0 + (1 - d.r0) * e) * (1 + 0.22 * Math.sin(Math.PI * e));
        data[i * 4] = (mx + x * mw) * fs;
        data[i * 4 + 1] = (my + y * mw) * fs;
        data[i * 4 + 2] = Math.min(r * 2, maxPoint);
        data[i * 4 + 3] = intro * STR;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, FW, FH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(pDrops);
      gl.uniform2f(loc.dRes, FW, FH);
      gl.bindBuffer(gl.ARRAY_BUFFER, dropBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc.dPos);
      gl.vertexAttribPointer(loc.dPos, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(loc.dSize);
      gl.vertexAttribPointer(loc.dSize, 1, gl.FLOAT, false, 16, 8);
      gl.enableVertexAttribArray(loc.dStr);
      gl.vertexAttribPointer(loc.dStr, 1, gl.FLOAT, false, 16, 12);
      gl.drawArrays(gl.POINTS, 0, drops.length);
      gl.disableVertexAttribArray(loc.dSize);
      gl.disableVertexAttribArray(loc.dStr);

      // pass 2: threshold, shade and lock into the exact logo
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(pSurf);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fieldTex);
      gl.uniform1i(loc.field, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.uniform1i(loc.mask, 1);
      gl.uniform2f(loc.texel, 1 / FW, 1 / FH);
      gl.uniform1f(loc.k, smooth(T_LOCK, T_CRISP, t));
      gl.uniform1f(loc.time, t);
      gl.uniform1f(loc.str, STR);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(loc.qPos);
      gl.vertexAttribPointer(loc.qPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

export function Splash() {
  const [phase, setPhase] = useState<Phase>('run');
  const [fallback, setFallback] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<SVGPathElement>(null);
  const subRef = useRef<SVGPathElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const q = new URLSearchParams(window.location.search).get('splash');
    const freeze = q !== null && q !== '' && !Number.isNaN(Number(q)) ? Number(q) : null;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let scene: Scene | null = null;
    try {
      scene = reduced ? null : createScene(canvas, makeDrops());
    } catch {
      scene = null;
    }
    if (!scene) setFallback(true);
    let ready = isReady();
    const onReady = () => { ready = true; };
    window.addEventListener(READY_EVENT, onReady);
    const onLost = (e: Event) => { e.preventDefault(); scene = null; setFallback(true); };
    canvas.addEventListener('webglcontextlost', onLost);

    const start = performance.now();
    let raf = 0;
    let leaving = false;
    let finished = false;
    let waitShown = false;
    let exitTimer = 0;
    let mark: { x: number; y: number; w: number } | null = null;
    const tick = (now: number) => {
      const t = freeze ?? (now - start) / 1000;
      // measure while still; during the exit zoom the box is scaled with the canvas
      if (!leaving || !mark) {
        const r = box.getBoundingClientRect();
        mark = { x: r.left, y: r.top, w: r.width };
        const cx = r.left + r.width / 2;
        const cy = r.top + (r.width * ASPECT) / 2;
        if (stageRef.current) stageRef.current.style.transformOrigin = `${cx}px ${cy}px`;
        if (glowRef.current) Object.assign(glowRef.current.style, { left: `${cx}px`, top: `${cy}px`, width: `${r.width * 2.3}px` });
      }
      if (scene) {
        scene.frame(t, mark);
      } else if (markRef.current) {
        const a = smooth(0.05, 0.55, t);
        markRef.current.style.opacity = String(a);
        markRef.current.style.transform = `scale(${0.96 + 0.04 * a})`;
      }
      // a soft violet-lime bloom swells while the liquid gathers, then settles
      if (glowRef.current) glowRef.current.style.opacity = String(smooth(0.15, 0.9, t) * (1 - 0.55 * smooth(1.3, 2.1, t)));
      const s = smooth(T_SUB, T_SUB + 0.6, t);
      if (subRef.current) {
        subRef.current.style.opacity = String(s);
        subRef.current.style.transform = `translateY(${(1 - s) * 40}px) scaleX(${1 + 0.22 * (1 - s)})`;
      }
      if (freeze === null) {
        if (!waitShown && t > T_WAIT && !ready) { waitShown = true; setWaiting(true); }
        if (!leaving && ((t >= (scene ? T_DONE : T_DONE_SIMPLE) && ready) || t > T_GIVE_UP)) {
          leaving = true;
          setPhase('exit');
          exitTimer = window.setTimeout(() => {
            // stop drawing and free the GPU before the app takes over
            finished = true;
            cancelAnimationFrame(raf);
            scene?.destroy();
            scene = null;
            setPhase('gone');
          }, EXIT_MS);
        }
      }
      if (!finished) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(exitTimer);
      window.removeEventListener(READY_EVENT, onReady);
      canvas.removeEventListener('webglcontextlost', onLost);
      scene?.destroy();
    };
  }, []);

  if (phase === 'gone') return null;
  return (
    <div className="cdnx-splash" data-phase={phase} role="status" aria-label="Loading CADNEX" style={{ background: SPLASH_BG }}>
      <div ref={stageRef} className="cdnx-splash-stage">
        <div ref={glowRef} className="cdnx-splash-glow" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div ref={boxRef} className="cdnx-splash-box">
          <svg viewBox={`${VB_X} ${VB_Y} ${VB_W} ${LOCK_H}`} className="block w-full" fill="#fff" aria-hidden>
            <path ref={markRef} fillRule="evenodd" d={MARK} style={{ opacity: 0, transformBox: 'fill-box', transformOrigin: '50% 50%', display: fallback ? undefined : 'none' }} />
            <path ref={subRef} fillRule="evenodd" d={SUB} style={{ opacity: 0, transformBox: 'fill-box', transformOrigin: '50% 50%' }} />
          </svg>
          {waiting && <span className="cdnx-splash-wait" />}
        </div>
      </div>
    </div>
  );
}
