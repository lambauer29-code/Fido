/* ============================================================
   Dokumenten-Scanner: Ecken-Erkennung, Perspektiv-Entzerrung,
   Scan-Filter und Zusammenfügen mehrerer Seiten zu einem PDF.
   Läuft komplett im Browser (keine Daten verlassen das Gerät).
   ============================================================ */

const MAX_SRC = 2000;   // Kantenlänge, auf die Fotos vor der Verarbeitung begrenzt werden
const MAX_OUT = 2000;   // Kantenlänge des entzerrten Scans

/** Foto laden und auf MAX_SRC verkleinern → { canvas, width, height } */
export async function loadImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file));
  const s = Math.min(1, MAX_SRC / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

/* ---------- Ecken-Erkennung ----------
   Verkleinern → Graustufen → Otsu-Schwelle → größte helle Fläche (das Papier)
   → Ecken als Extrempunkte (x+y, x−y). Robust für Papier auf dunklerem Untergrund. */
export function detectCorners(canvas) {
  const W = canvas.width, H = canvas.height;
  const inset = (f) => [[W * f, H * f], [W * (1 - f), H * f], [W * (1 - f), H * (1 - f)], [W * f, H * (1 - f)]];
  const s = Math.min(1, 220 / Math.max(W, H));
  const w = Math.max(8, Math.round(W * s)), h = Math.max(8, Math.round(H * s));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Uint8Array(w * h), hist = new Array(256).fill(0);
  for (let i = 0; i < w * h; i++) { const v = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0; g[i] = v; hist[v]++; }
  const t = otsu(hist, w * h);
  // größte zusammenhängende helle Fläche
  const lab = new Int32Array(w * h).fill(-1); let best = null;
  const stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (g[i] <= t || lab[i] !== -1) continue;
    let sp = 0, n = 0, tl = [0, 0, Infinity], br = [0, 0, -Infinity], tr = [0, 0, -Infinity], bl = [0, 0, Infinity];
    stack[sp++] = i; lab[i] = i;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0; n++;
      const a = x + y, b = x - y;
      if (a < tl[2]) tl = [x, y, a]; if (a > br[2]) br = [x, y, a];
      if (b > tr[2]) tr = [x, y, b]; if (b < bl[2]) bl = [x, y, b];
      if (x > 0 && g[p - 1] > t && lab[p - 1] === -1) { lab[p - 1] = i; stack[sp++] = p - 1; }
      if (x < w - 1 && g[p + 1] > t && lab[p + 1] === -1) { lab[p + 1] = i; stack[sp++] = p + 1; }
      if (y > 0 && g[p - w] > t && lab[p - w] === -1) { lab[p - w] = i; stack[sp++] = p - w; }
      if (y < h - 1 && g[p + w] > t && lab[p + w] === -1) { lab[p + w] = i; stack[sp++] = p + w; }
    }
    if (!best || n > best.n) best = { n, tl, tr, br, bl };
  }
  if (!best) return inset(0.04);
  const area = best.n / (w * h);
  if (area < 0.12 || area > 0.985) return inset(0.04);
  const pts = [best.tl, best.tr, best.br, best.bl].map(([x, y]) => [(x + 0.5) / s, (y + 0.5) / s]);
  // Plausibilität: Viereck darf nicht entartet sein
  if (polyArea(pts) < W * H * 0.08) return inset(0.04);
  return pts;
}
function otsu(hist, total) {
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, max = 0, th = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue; const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > max) { max = between; th = i; }
  }
  return th;
}
export function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a / 2); }

/* ---------- Perspektiv-Entzerrung ---------- */
// Homographie, die das Zielrechteck (0..W, 0..H) auf das Quell-Viereck abbildet
function homography(src, W, H) {
  const dst = [[0, 0], [W, 0], [W, H], [0, H]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = dst[i], [u, v] = src[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return [...h, 1];
}
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const div = M[c][c] || 1e-12;
    for (let k = c; k <= n; k++) M[c][k] /= div;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r) => r[n]);
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Viereck aus dem Foto auf ein Rechteck entzerren → Canvas */
export function warp(srcCanvas, corners) {
  const [tl, tr, br, bl] = corners;
  let W = Math.max(dist(tl, tr), dist(bl, br)), H = Math.max(dist(tl, bl), dist(tr, br));
  const s = Math.min(1, MAX_OUT / Math.max(W, H)); W = Math.max(1, Math.round(W * s)); H = Math.max(1, Math.round(H * s));
  const hm = homography(corners, W, H);
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const src = srcCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const octx = out.getContext("2d"); const img = octx.createImageData(W, H); const o = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const den = hm[6] * x + hm[7] * y + hm[8];
      let u = (hm[0] * x + hm[1] * y + hm[2]) / den, v = (hm[3] * x + hm[4] * y + hm[5]) / den;
      u = Math.min(sw - 1.001, Math.max(0, u)); v = Math.min(sh - 1.001, Math.max(0, v));
      const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, oi = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        o[oi + c] = (src[i00 + c] * (1 - fx) + src[i10 + c] * fx) * (1 - fy) + (src[i01 + c] * (1 - fx) + src[i11 + c] * fx) * fy;
      }
      o[oi + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/* ---------- Scan-Filter ---------- */
// "farbe": Original mit leichtem Kontrast · "dokument": Graustufen + Tonwertkorrektur · "sw": adaptives Schwarz-Weiß
export function applyFilter(canvas, mode = "dokument") {
  const W = canvas.width, H = canvas.height;
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  if (mode === "original") return out;
  const img = ctx.getImageData(0, 0, W, H), d = img.data, n = W * H;
  if (mode === "farbe" || mode === "dokument") {
    // Beleuchtung ausgleichen: Papier-Hintergrund schätzen (stark verkleinert + Maximum-Filter entfernt Schrift)
    const bg = background(canvas, W, H);
    if (mode === "farbe") {
      for (let i = 0; i < n * 4; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp((d[i + c] / Math.max(24, bg[i + c])) * 255 * 1.02);
    } else {
      for (let i = 0; i < n; i++) {
        const j = i * 4, g = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114, b = Math.max(24, bg[j] * 0.299 + bg[j + 1] * 0.587 + bg[j + 2] * 0.114);
        const v = clamp(255 - (255 - Math.min(255, (g / b) * 255)) * 1.7); // Papier → weiß, Schrift kräftiger
        d[j] = d[j + 1] = d[j + 2] = v;
      }
    }
  } else { // sw: adaptive Schwelle über Integralbild (Schatten- und Knickfalten-tolerant)
    const g = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 1; y <= H; y++) { let row = 0; for (let x = 1; x <= W; x++) { row += g[(y - 1) * W + x - 1]; I[y * (W + 1) + x] = I[(y - 1) * (W + 1) + x] + row; } }
    const r = Math.max(8, Math.round(Math.max(W, H) / 40));
    for (let y = 0; y < H; y++) {
      const y1 = Math.max(0, y - r), y2 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x1 = Math.max(0, x - r), x2 = Math.min(W, x + r + 1);
        const sum = I[y2 * (W + 1) + x2] - I[y1 * (W + 1) + x2] - I[y2 * (W + 1) + x1] + I[y1 * (W + 1) + x1];
        const mean = sum / ((x2 - x1) * (y2 - y1));
        const v = g[y * W + x] < mean * 0.88 ? 0 : 255, i = (y * W + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
// Hintergrund (Papierhelligkeit) pro Pixel: verkleinern → 2× Maximum-Filter → weich hochskalieren
function background(canvas, W, H) {
  const s = Math.max(1, Math.round(Math.max(W, H) / 64));
  const w = Math.max(4, Math.round(W / s)), h = Math.max(4, Math.round(H / s));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true }); cx.drawImage(canvas, 0, 0, w, h);
  let im = cx.getImageData(0, 0, w, h);
  for (let pass = 0; pass < 2; pass++) {
    const src = im.data, dst = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy));
          const v = src[(yy * w + xx) * 4 + k]; if (v > m) m = v;
        }
        dst[o + k] = m;
      }
      dst[o + 3] = 255;
    }
    im = new ImageData(dst, w, h);
  }
  cx.putImageData(im, 0, 0);
  const big = document.createElement("canvas"); big.width = W; big.height = H;
  const bx = big.getContext("2d", { willReadFrequently: true }); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = "high";
  bx.filter = "blur(" + Math.max(2, Math.round(s * 1.5)) + "px)";
  bx.drawImage(c, 0, 0, W, H);
  return bx.getImageData(0, 0, W, H).data;
}
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
function levels(arr, n, get, step = 4) {
  const hist = new Array(256).fill(0); let cnt = 0;
  for (let i = 0; i < n * step; i += step * 7) { hist[clamp(get(i) | 0)]++; cnt++; }
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > cnt * 0.01) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > cnt * 0.03) { hi = v; break; } }
  return [lo, Math.max(lo + 1, hi)];
}

export const toJpeg = (canvas, q = 0.82) => new Promise((r) => canvas.toBlob(r, "image/jpeg", q));

/** Mehrere Seiten (JPEG-Blobs) zu einem PDF zusammenfügen (Seiten in A4-Breite) */
export async function pagesToPdf(blobs) {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  for (const b of blobs) {
    const img = await pdf.embedJpg(new Uint8Array(await b.arrayBuffer()));
    const w = 595.28, h = (img.height / img.width) * w;
    pdf.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  pdf.setProducer("Dokumente-App Scanner");
  return new Blob([await pdf.save()], { type: "application/pdf" });
}

/** Großes PDF fürs Auslesen verkleinern: Seiten rendern → JPEG → neues PDF (Original bleibt unverändert) */
export async function shrinkPdf(blob, maxBytes = 3.6 * 1024 * 1024, maxPages = 15) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
  const n = Math.min(pdf.numPages, maxPages);
  let out = blob;
  for (const [longSide, q] of [[1800, 0.72], [1400, 0.62], [1100, 0.55], [850, 0.5]]) {
    const pages = [];
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: longSide / Math.max(v1.width, v1.height) });
      const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      pages.push(await toJpeg(c, q));
    }
    out = await pagesToPdf(pages);
    if (out.size <= maxBytes) break;
  }
  pdf.destroy();
  return out;
}
