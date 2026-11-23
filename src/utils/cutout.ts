/**
 * Smart studio-backdrop remover with anti-halo edge decontamination and RGB inpainting.
 * Eliminates white/grey compression fringes when cutouts are displayed over dark #120A07 surfaces
 * or sampled by WebGL bilinear filtering & blur shaders.
 */

const cutoutCache = new Map<string, Promise<string>>();
const resolvedCutoutCache = new Map<string, string>();

export function getCachedCutoutUrl(src: string): string | null {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  return resolvedCutoutCache.get(src) || null;
}

export function getCutoutDataUrl(src: string): Promise<string> {
  if (!src) return Promise.resolve('');
  if (src.startsWith('data:')) return Promise.resolve(src);

  const resolved = resolvedCutoutCache.get(src);
  if (resolved) return Promise.resolve(resolved);

  const existing = cutoutCache.get(src);
  if (existing) return existing;

  const promise = new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const maxDim = 640;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(src);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        // Sample corner background color
        const corners = [
          0,
          (w - 1) * 4,
          (h - 1) * w * 4,
          ((h - 1) * w + (w - 1)) * 4,
        ];
        let bgR = 0;
        let bgG = 0;
        let bgB = 0;
        let cornerSamples = 0;
        for (const idx of corners) {
          if (data[idx + 3] > 200) {
            bgR += data[idx];
            bgG += data[idx + 1];
            bgB += data[idx + 2];
            cornerSamples++;
          }
        }

        // If already transparent at corners, return as-is
        if (cornerSamples === 0) {
          resolve(src);
          return;
        }

        bgR /= cornerSamples;
        bgG /= cornerSamples;
        bgB /= cornerSamples;

        const bgLum = (bgR + bgG + bgB) / 3;
        if (bgLum < 195) {
          resolve(src);
          return;
        }

        const isPureWhiteBg = bgR > 246 && bgG > 246 && bgB > 246;
        const distThreshold = isPureWhiteBg ? 40 : 44;
        const lumThreshold = isPureWhiteBg ? 224 : 194;

        const total = w * h;
        const visited = new Uint8Array(total);
        const queue = new Int32Array(total);
        let head = 0;
        let tail = 0;

        const isBgPixel = (pIdx: number) => {
          const i = pIdx * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const dr = r - bgR;
          const dg = g - bgG;
          const db = b - bgB;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          const lum = (r + g + b) / 3;
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          return (dist < distThreshold && lum > lumThreshold) || (sat < 10 && lum > 240);
        };

        const enqueue = (x: number, y: number) => {
          const p = y * w + x;
          if (!visited[p] && isBgPixel(p)) {
            visited[p] = 1;
            queue[tail++] = p;
          }
        };

        for (let x = 0; x < w; x++) {
          enqueue(x, 0);
          enqueue(x, h - 1);
        }
        for (let y = 0; y < h; y++) {
          enqueue(0, y);
          enqueue(w - 1, y);
        }

        while (head < tail) {
          const p = queue[head++];
          const x = p % w;
          const y = (p - x) / w;
          data[p * 4 + 3] = 0;

          if (x > 0) enqueue(x - 1, y);
          if (x < w - 1) enqueue(x + 1, y);
          if (y > 0) enqueue(x, y - 1);
          if (y < h - 1) enqueue(x, y + 1);
        }

        // Helper: average color of deeper interior neighbors around (x, y)
        const sampleInterior = (cx: number, cy: number) => {
          let r = 0;
          let g = 0;
          let b = 0;
          let n = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (Math.abs(dx) + Math.abs(dy) < 2) continue;
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
              const np = ny * w + nx;
              if (visited[np] === 0) {
                const ni = np * 4;
                const nl = (data[ni] + data[ni + 1] + data[ni + 2]) / 3;
                if (nl < 230) {
                  r += data[ni];
                  g += data[ni + 1];
                  b += data[ni + 2];
                  n++;
                }
              }
            }
          }
          if (n === 0) return null;
          return { r: r / n, g: g / n, b: b / n, lum: (r + g + b) / (3 * n) };
        };

        // Pass 1: Trim 1px bright JPEG compression halo pixels bordering transparent background
        const trimMask = new Uint8Array(total);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const p = y * w + x;
            if (visited[p] === 1) continue;
            if (!visited[p - 1] && !visited[p + 1] && !visited[p - w] && !visited[p + w]) continue;

            const i = p * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const lum = (r + g + b) / 3;
            const sat = Math.max(r, g, b) - Math.min(r, g, b);

            const interior = sampleInterior(x, y);
            if (interior && interior.lum < 175 && lum > Math.max(170, interior.lum + 42) && sat < 32) {
              trimMask[p] = 1;
            } else if (lum > 236 && sat < 14) {
              trimMask[p] = 1;
            }
          }
        }
        for (let p = 0; p < total; p++) {
          if (trimMask[p]) {
            visited[p] = 1;
            data[p * 4 + 3] = 0;
          }
        }

        // Pass 2: Decontaminate & smoothly feather the remaining outer 1px edge
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const p = y * w + x;
            if (visited[p] === 1) continue;
            let tNeighbors = 0;
            if (visited[p - 1]) tNeighbors++;
            if (visited[p + 1]) tNeighbors++;
            if (visited[p - w]) tNeighbors++;
            if (visited[p + w]) tNeighbors++;
            if (tNeighbors === 0) continue;

            const i = p * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const lum = (r + g + b) / 3;
            const sat = Math.max(r, g, b) - Math.min(r, g, b);
            const interior = sampleInterior(x, y);

            if (interior && interior.lum < 175 && lum > interior.lum + 18 && sat < 34) {
              // Un-mix white studio bleed toward the garment's real color and feather alpha
              const denom = Math.max(24, bgLum - interior.lum);
              const estAlpha = Math.max(0.18, Math.min(0.92, (bgLum - lum) / denom));
              data[i] = Math.round(interior.r * 0.78 + r * 0.22);
              data[i + 1] = Math.round(interior.g * 0.78 + g * 0.22);
              data[i + 2] = Math.round(interior.b * 0.78 + b * 0.22);
              data[i + 3] = Math.round(255 * estAlpha);
            } else {
              // Slight soft AA feather on normal edges
              data[i + 3] = Math.round(255 * (1 - tNeighbors * 0.08));
            }
          }
        }

        // Pass 3: Dilate garment RGB 3px into transparent neighbors (keeping alpha = 0)
        // Prevents WebGL LinearFilter / blur shaders from blending white (255,255,255) into edges
        let alphaMask = new Uint8Array(total);
        for (let p = 0; p < total; p++) {
          alphaMask[p] = data[p * 4 + 3] > 0 ? 1 : 0;
        }
        for (let step = 0; step < 3; step++) {
          const nextMask = new Uint8Array(alphaMask);
          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              const p = y * w + x;
              if (alphaMask[p]) continue;
              let sr = 0;
              let sg = 0;
              let sb = 0;
              let cnt = 0;
              const nbrs = [p - 1, p + 1, p - w, p + w];
              for (const np of nbrs) {
                if (alphaMask[np]) {
                  const ni = np * 4;
                  sr += data[ni];
                  sg += data[ni + 1];
                  sb += data[ni + 2];
                  cnt++;
                }
              }
              if (cnt > 0) {
                const i = p * 4;
                data[i] = Math.round(sr / cnt);
                data[i + 1] = Math.round(sg / cnt);
                data[i + 2] = Math.round(sb / cnt);
                nextMask[p] = 1;
              }
            }
          }
          alphaMask = nextMask;
        }

        ctx.putImageData(imageData, 0, 0);
        const outUrl = canvas.toDataURL('image/png');
        resolvedCutoutCache.set(src, outUrl);
        resolve(outUrl);
      } catch {
        resolvedCutoutCache.set(src, src);
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });

  cutoutCache.set(src, promise);
  return promise;
}
