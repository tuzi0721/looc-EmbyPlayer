// Extract a representative dominant color from an image URL by sampling a tiny
// downscaled copy on a canvas. Used to tint the immersive "ambient" background
// behind detail/home content with the artwork's color (Plex "Artwork Colors").
//
// Canvas pixel reads require a CORS-clean image; if the server does not send
// CORS headers the canvas is tainted and `getImageData` throws. In that case
// (and on any other failure) we resolve to `null` so callers fall back to the
// theme accent. Results are cached per URL.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const cache = new Map<string, Rgb | null>();

export function rgbToCss(rgb: Rgb, alpha = 1): string {
  return alpha >= 1 ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export async function extractDominantColor(url: string | null | undefined): Promise<Rgb | null> {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url) ?? null;

  const result = await new Promise<Rgb | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    let settled = false;
    const done = (value: Rgb | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // Guard against images that never load.
    const timer = window.setTimeout(() => done(null), 6000);
    img.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return done(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 125) continue;
          const cr = data[i];
          const cg = data[i + 1];
          const cb = data[i + 2];
          // Skip near-black / near-white pixels so the tint reflects real color.
          const max = Math.max(cr, cg, cb);
          const min = Math.min(cr, cg, cb);
          if (max < 24 || min > 232) continue;
          r += cr;
          g += cg;
          b += cb;
          count += 1;
        }
        if (count === 0) return done(null);
        done({ r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) });
      } catch {
        // Tainted canvas (no CORS) or other failure.
        done(null);
      }
    };
    img.src = url;
  });

  cache.set(url, result);
  return result;
}
