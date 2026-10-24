/**
 * Turns the story into a file people can post.
 *
 * 1. WebCodecs + MP4 muxer: frames are drawn and encoded as fast as the phone can (no
 *    waiting in real time) into an H.264 MP4, the format Instagram and WhatsApp take.
 * 2. MediaRecorder: records the canvas in real time when WebCodecs is missing.
 * 3. A still PNG of the final frame, if video isn't possible at all.
 */
import { DURATION, H, W } from './story';

export interface StoryFile {
  file: File;
  kind: 'video' | 'image';
}

const FPS = 30;
const BITRATE = 9_000_000;

type Draw = (ctx: CanvasRenderingContext2D, t: number) => void;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

const AVC = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.640032', 'avc1.42001f'];

async function pickCodec(codecs: string[]): Promise<{ codec: string; width: number; height: number } | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  const sizes: [number, number][] = [[W, H], [720, 1280]];
  for (const [width, height] of sizes) {
    for (const codec of codecs) {
      try {
        const r = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: BITRATE, framerate: FPS });
        if (r.supported) return { codec, width, height };
      } catch {
        /* try the next one */
      }
    }
  }
  return null;
}

/** Exported with a codec list for tests; the app always uses H.264 (what the apps accept). */
export async function withWebCodecs(draw: Draw, onProgress: (p: number) => void, name: string, codecs: string[] = AVC): Promise<StoryFile | null> {
  const pick = await pickCodec(codecs);
  if (!pick) return null;
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const canvas = document.createElement('canvas');
  canvas.width = pick.width;
  canvas.height = pick.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;
  const target = new ArrayBufferTarget();
  const kind = pick.codec.startsWith('avc') ? 'avc' : pick.codec.startsWith('vp09') ? 'vp9' : 'av1';
  const muxer = new Muxer({ target, video: { codec: kind, width: pick.width, height: pick.height, frameRate: FPS }, fastStart: 'in-memory' });
  let failed: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failed = e as Error; },
  });
  encoder.configure({ codec: pick.codec, width: pick.width, height: pick.height, bitrate: BITRATE, framerate: FPS, ...(kind === 'avc' ? { avc: { format: 'avc' as const } } : {}) });
  const frames = Math.round(DURATION * FPS);
  const scale = pick.width / W;
  for (let i = 0; i < frames; i++) {
    if (failed) throw failed;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    draw(ctx, i / FPS);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    if (i % 6 === 0) {
      onProgress((i + 1) / frames);
      await tick();
    }
  }
  await encoder.flush();
  encoder.close();
  if (failed) throw failed;
  muxer.finalize();
  onProgress(1);
  return { file: new File([target.buffer], `${name}.mp4`, { type: 'video/mp4' }), kind: 'video' };
}

async function withRecorder(draw: Draw, onProgress: (p: number) => void, name: string): Promise<StoryFile | null> {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const type = types.find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  if (!ctx || !('captureStream' in canvas)) return null;
  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<void>((r) => { rec.onstop = () => r(); });
  const scale = canvas.width / W;
  rec.start(250);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const step = () => {
      const t = (performance.now() - start) / 1000;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      draw(ctx, Math.min(t, DURATION));
      onProgress(Math.min(1, t / DURATION));
      if (t < DURATION) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  rec.stop();
  await done;
  const mime = type.split(';')[0];
  return { file: new File(chunks, `${name}.${mime === 'video/mp4' ? 'mp4' : 'webm'}`, { type: mime }), kind: 'video' };
}

async function still(draw: Draw, name: string): Promise<StoryFile> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, DURATION);
  const blob = await new Promise<Blob>((r, j) => canvas.toBlob((b) => (b ? r(b) : j(new Error('no image'))), 'image/png'));
  return { file: new File([blob], `${name}.png`, { type: 'image/png' }), kind: 'image' };
}

/** Best file this browser can make. Never throws: falls back to a still image. */
export async function makeStoryFile(draw: Draw, onProgress: (p: number) => void, name = 'cadnex-story'): Promise<StoryFile> {
  try {
    const v = await withWebCodecs(draw, onProgress, name);
    if (v) return v;
  } catch {
    /* fall through */
  }
  try {
    const r = await withRecorder(draw, onProgress, name);
    // WebM can't go to Instagram or WhatsApp Status; a still is more useful there
    if (r && r.file.type === 'video/mp4') return r;
  } catch {
    /* fall through */
  }
  return still(draw, name);
}

export async function makeStill(draw: Draw, name = 'cadnex-story'): Promise<StoryFile> {
  return still(draw, name);
}
