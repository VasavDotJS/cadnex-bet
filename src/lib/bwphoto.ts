/**
 * Player photos in black and white: a square crop that fills the frame with the player,
 * converted to greyscale with a gentle levels stretch so every photo has clean blacks and
 * whites. Rendered once per player and size; the same canvas is used in the app and in
 * story videos.
 */

/**
 * Square crop that fills the frame with the player: most lead photos are upright portraits or
 * action shots with the head in the upper middle, so zoom in and favour the top.
 */
export function cropFor(w: number, h: number): [number, number, number] {
  if (h > w * 1.08) {
    const side = w * 0.8;
    return [(w - side) / 2, h * 0.03, side];
  }
  const side = Math.min(w, h) * 0.8;
  return [(w - side) / 2, (h - side) * 0.15, side];
}

/** The black-and-white photo on its own square canvas of `size` pixels, or null if it can't be read. */
export function bwPhoto(img: CanvasImageSource & { width: number; height: number }, size: number): HTMLCanvasElement | null {
  const n = Math.max(16, Math.round(size));
  const w = (img as HTMLImageElement).naturalWidth || img.width;
  const h = (img as HTMLImageElement).naturalHeight || img.height;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const [sx, sy, side] = cropFor(w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, n, n);
  let px: ImageData;
  try {
    px = ctx.getImageData(0, 0, n, n);
  } catch {
    return null; // a cross-origin image can't be read; callers fall back to initials
  }
  const d = px.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const l = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    d[i] = l;
    hist[l]++;
  }
  // stretch between the 0.5th and 99.5th percentiles, so dull photos still get real blacks and whites
  const total = n * n;
  const pct = (q: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= q * total) return v;
    return 255;
  };
  const lo = pct(0.005), hi = Math.max(lo + 40, pct(0.995));
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.min(255, Math.max(0, ((d[i] - lo) / (hi - lo)) * 255));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(px, 0, 0);
  return c;
}
