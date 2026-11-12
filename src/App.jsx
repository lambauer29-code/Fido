import { createPortal } from "react-dom";
import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { loadImage, detectCorners, warp, applyFilter, toJpeg, pagesToPdf, shrinkPdf } from "./scan.js";
import { parseReceiptQR, pastOrToday } from "./receipt.js";
import { saveBlob, downloadCsv, downloadXlsx, tablePdf, zipBlob, vcardText, csvBlob, xlsxBlob } from "./exports.js";
import { latestBalance, parseFile, withIds, categorize, detectRecurring, matchInvoices, portfolio, rowsToTransactions, FIELD_LABELS, counterpartyKey } from "./importers.js";

/* ============================================================
   Dokumente – PWA für Dokumente, Verträge & Finanzen
   Daten liegen lokal im Browser (IndexedDB). Analyse via /api/analyze (Claude).
   ============================================================ */

const DEFAULT_CATEGORIES = [
  "Rechnungen", "Verträge", "Versicherung", "Bank & Finanzen", "Steuer & Finanzamt",
  "Lohn & Arbeit", "Gesundheit", "Auto & Mobilität", "Wohnen & Energie",
  "Lebensmittel & Haushalt", "Freizeit & Abos", "Behörden", "Garantie & Kaufbelege", "Sonstiges"
];
// Icon + Farbe je Kategorie (Finanz-Look: Icon im Farbkreis, Dokument-Look: farbiges Etikett)
const CAT_META = {
  "Rechnungen": ["🧾", "#3b82f6"], "Verträge": ["📑", "#8b5cf6"], "Versicherung": ["🛡️", "#0ea5e9"],
  "Bank & Finanzen": ["🏦", "#14b8a6"], "Steuer & Finanzamt": ["🏛️", "#f59e0b"], "Lohn & Arbeit": ["💼", "#22c55e"],
  "Gesundheit": ["🩺", "#ef4444"], "Auto & Mobilität": ["🚗", "#6366f1"], "Wohnen & Energie": ["🏠", "#f97316"],
  "Lebensmittel & Haushalt": ["🛒", "#84cc16"], "Freizeit & Abos": ["🎬", "#ec4899"], "Behörden": ["📮", "#64748b"],
  "Garantie & Kaufbelege": ["🏷️", "#a855f7"], "Sonstiges": ["📁", "#94a3b8"],
  "Bargeld": ["💶", "#16a34a"], "Einnahmen": ["💰", "#22c55e"], "Umbuchung": ["🔁", "#64748b"]
};
const PALETTE = ["#3b82f6", "#f97316", "#22c55e", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#ef4444", "#6366f1", "#84cc16"];
let CAT_STYLE = {}; // Symbol/Farbe umbenannter Kategorien (aus den Einstellungen)
function catMeta(c) {
  if (CAT_STYLE[c]) return { icon: CAT_STYLE[c][0], color: CAT_STYLE[c][1], img: CAT_STYLE[c][2] };
  if (CAT_META[c]) return { icon: CAT_META[c][0], color: CAT_META[c][1] };
  let h = 0; for (const ch of String(c)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { icon: "📁", color: PALETTE[h % PALETTE.length] };
}
const CatGlyph = ({ c }) => { const m = catMeta(c); return m.img ? <img className="catimg" src={m.img} alt="" /> : <>{m.icon}</>; };
const CatIcon = ({ c, size = 40 }) => {
  const m = catMeta(c);
  return <span className="caticon" style={{ width: size, height: size, background: m.color + "22", fontSize: size * 0.48 }}><CatGlyph c={c} /></span>;
};
const Label = ({ c }) => { const m = catMeta(c); return <span className="label" style={{ color: m.color, background: m.color + "1f" }}>{c}</span>; };

/* ---------- Vorschaubilder (Docutain-Look) ---------- */
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  return pdfjs;
}
async function makeThumb(blob) {
  const W = 300;
  const canvas = document.createElement("canvas");
  if (blob.type === "application/pdf") {
    const pdfjs = await loadPdfjs();
    const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
    const page = await pdf.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: W / vp1.width });
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    pdf.destroy();
  } else {
    const bmp = await createImageBitmap(blob);
    const s = W / bmp.width;
    canvas.width = W; canvas.height = Math.round(bmp.height * s);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL("image/jpeg", 0.7);
}
/* Originaldatei in neuem Tab öffnen (Fenster sofort öffnen, sonst blockiert Safari) */
async function openOriginal(d) {
  const w = window.open("", "_blank");
  const b = await db.getFile(d.id);
  if (!b) { w?.close(); return false; }
  const url = URL.createObjectURL(b);
  if (w) w.location.href = url; else window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
/* Teilen: Originaldateien über das System-Teilen-Menü (Nachrichten, WhatsApp, Mail, AirDrop …) */
const EXT = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/webp": "webp" };
const safeName = (t) => (t || "Dokument").replace(/[–—]/g, "-").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
async function docFiles(list) {
  const out = [], used = new Set();
  for (const d of list) {
    const b = await db.getFile(d.id); if (!b) continue;
    let n = safeName(d.title) + "." + (EXT[b.type] || (d.fileName || "").split(".").pop() || "bin"), k = 2;
    while (used.has(n)) n = n.replace(/(\.\w+)$/, ` (${k++})$1`);
    used.add(n); out.push(new File([b], n, { type: b.type || "application/octet-stream" }));
  }
  return out;
}
let shareUi = null; // wird von der App gesetzt: öffnet das Ersatz-Fenster
async function shareDocs(list) {
  if (!list.length) return;
  const files = await docFiles(list);
  if (!files.length) return alert("Originaldatei nicht gefunden");
  const title = list.length === 1 ? list[0].title : `${list.length} Dokumente`;
  if (shareUi) return shareUi({ files, title, docs: list });
  if (navigator.canShare?.({ files })) { try { await navigator.share({ files, title }); } catch {} } else downloadFiles(files);
}
function downloadFiles(files) {
  files.forEach((f, i) => setTimeout(() => {
    const a = document.createElement("a"), u = URL.createObjectURL(f);
    a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  }, i * 350));
}
// letzte Klickposition – das Teilen-Menü erscheint dort (wie das macOS-Menü)
let lastPtr = { x: innerWidth / 2, y: 120 };
if (typeof window !== "undefined") window.addEventListener("pointerdown", (e) => { lastPtr = { x: e.clientX, y: e.clientY }; }, true);
function ShareWin({ data, onClose }) {
  const { files, title, docs, to = "" } = data;
  const summary = docs.map((d) => `• ${d.title}${d.documentDate ? " (" + fmtDate(d.documentDate) + ")" : ""}`).join("\n");
  const size = files.reduce((s, f) => s + f.size, 0);
  const sys = !!navigator.canShare?.({ files });
  const [msg, setMsg] = useState("");
  const ref = useRef(null);
  const [pos] = useState(() => { const w = 300, x = Math.min(Math.max(12, lastPtr.x - w / 2), innerWidth - w - 12); const below = lastPtr.y + 14; return { left: x, top: below + 360 > innerHeight ? Math.max(12, lastPtr.y - 370) : below, arrowX: Math.min(w - 20, Math.max(20, lastPtr.x - x)), up: below + 360 <= innerHeight }; });
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => e.key === "Escape" && onClose();
    setTimeout(() => document.addEventListener("pointerdown", down, true), 0); window.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key); };
  }, []);
  const via = (url, app) => { downloadFiles(files); setMsg(`Heruntergeladen – in ${app} anhängen.`); setTimeout(() => window.open(url, "_blank"), 400); };
  const system = async () => { try { await navigator.share({ files, title }); onClose(); } catch (e) { if (e.name !== "AbortError") setMsg("Nicht verfügbar: " + e.message); } };
  const kb = size < 1048576 ? Math.max(1, Math.round(size / 1024)) + " KB" : (size / 1048576).toFixed(1).replace(".", ",") + " MB";
  const kind = files.length > 1 ? `${files.length} Dateien` : files[0]?.type === "application/pdf" ? "PDF-Dokument" : files[0]?.type?.startsWith("image/") ? "Bild" : "Datei";
  return createPortal(
    <div ref={ref} className={"sharepop" + (pos.up ? " up" : " down")} style={{ left: pos.left, top: pos.top, "--ax": pos.arrowX + "px" }} role="menu">
      <div className="sphead"><span className="spfile">{files.length > 1 ? "🗂" : files[0]?.type?.startsWith("image/") ? "🖼" : "📄"}</span>
        <div><b className="clamp">{title}</b><small>{kind} · {kb}</small></div></div>
      <div className="spsep" />
      <button role="menuitem" onClick={() => via(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent("Guten Tag,\n\nim Anhang:\n" + summary + "\n\nMit freundlichen Grüßen")}`, "der Mail")}><span>✉️</span>E-Mail</button>
      <button role="menuitem" onClick={() => (sys ? system() : via(`sms:&body=${encodeURIComponent(title)}`, "Nachrichten"))}><span>🗨️</span>Nachrichten</button>
      <button role="menuitem" onClick={() => via(`https://wa.me/?text=${encodeURIComponent(title)}`, "WhatsApp")}><span>💬</span>WhatsApp</button>
      <button role="menuitem" onClick={() => (sys ? system() : (downloadFiles(files), setMsg("Heruntergeladen – im Finder mit AirDrop senden.")))}><span>📡</span>AirDrop</button>
      <button role="menuitem" onClick={() => via(`https://t.me/share/url?url=${encodeURIComponent(" ")}&text=${encodeURIComponent(title)}`, "Telegram")}><span>✈️</span>Telegram</button>
      <div className="spsep" />
      <button role="menuitem" onClick={() => { downloadFiles(files); setMsg("Im Ordner „Downloads“ gespeichert."); }}><span>⬇️</span>Herunterladen</button>
      {msg && <div className="spmsg">{msg}</div>}
    </div>, document.body);
}
/* Drucken: Seiten als Bilder in einen unsichtbaren Rahmen legen und den Druckdialog öffnen (klappt auch in Safari) */
async function blobToImages(b, width = 1700, max = 60) {
  if (b.type !== "application/pdf") return [URL.createObjectURL(b)];
  const srcs = [], pdf = await (await loadPdfjs()).getDocument({ data: await b.arrayBuffer() }).promise;
  for (let i = 1; i <= Math.min(pdf.numPages, max); i++) {
    const page = await pdf.getPage(i), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: width / v1.width });
    const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    srcs.push(c.toDataURL("image/jpeg", 0.9));
  }
  pdf.destroy();
  return srcs;
}
async function printImages(srcs, title = "Dokument") {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(f);
  const w = f.contentWindow, docu = w.document;
  docu.open();
  docu.write(`<!doctype html><html><head><title>${String(title).replace(/</g, "&lt;")}</title><style>@page{margin:8mm}html,body{margin:0}img{display:block;width:100%;height:auto;page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}</style></head><body>${srcs.map((s) => `<img src="${s}">`).join("")}</body></html>`);
  docu.close();
  await Promise.all([...docu.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  w.focus(); w.print();
  setTimeout(() => { f.remove(); srcs.forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u)); }, 60000);
}
async function printDoc(d, notify) {
  const b = await db.getFile(d.id);
  if (!b) return notify?.("Originaldatei nicht gefunden");
  notify?.("Druck wird vorbereitet …");
  await printImages(await blobToImages(b), d.title);
}
/* PDF in der App anzeigen (statt neuem Fenster – am iPhone kommt man sonst nicht zurück) */
let pdfUi = null;
function PdfViewWin({ data, onClose }) {
  const [pages, setPages] = useState(null);
  useEffect(() => { let dead = false; blobToImages(data.blob, Math.min(1600, Math.round(900 * (window.devicePixelRatio || 1)))).then((p) => !dead && setPages(p)).catch(() => setPages([])); return () => { dead = true; }; }, [data]);
  return (
    <Win id="pdfview" defW={760} onClose={onClose} dirty={false} className="pdfviewwin">
      <div className="panelhead"><b className="clamp">{data.title || data.name}</b>
        <button className="btn" title="Drucken" onClick={() => pages && printImages(pages, data.title)}><IcoPrint /></button>
        <button className="btn" title="Teilen / Sichern" onClick={() => sharePdf(data.blob, data.name, data.title, data.to)}><IcoShare /></button>
        <XBtn /></div>
      <div className="dpages">
        {!pages && <div className="dpload">PDF wird geladen …</div>}
        {pages?.map((src, i) => <img key={i} src={src} alt={`Seite ${i + 1}`} />)}
      </div>
    </Win>
  );
}

function DocActions({ d, prevOpen, onPreview, onEdit, onTrash }) {
  const stop = (f) => (e) => { e.stopPropagation(); f(); };
  return (
    <div className="dactions" onClick={(e) => e.stopPropagation()}>
      <button title="Bearbeiten" aria-label="Bearbeiten" onClick={stop(onEdit)}><IcoEdit /></button>
      <button title="Drucken" aria-label="Drucken" onClick={stop(() => printDoc(d))}><IcoPrint /></button>
      <button title="Teilen (Nachrichten, WhatsApp, Mail …)" aria-label="Teilen" onClick={stop(() => shareDocs([d]))}><IcoShare /></button>
      <button title="In den Papierkorb" aria-label="Löschen" className="del" onClick={stop(() => confirm(`„${d.title}“ in den Papierkorb verschieben?`) && onTrash(d))}><IcoTrash /></button>
    </div>
  );
}

/* Ausklappbare Vorschau in der Dokumentliste */
function DocPreview({ d, onOpen, getBlob, onPrint, onOriginal }) {
  const [pages, setPages] = useState([]), [total, setTotal] = useState(0), [want, setWant] = useState(3), [err, setErr] = useState("");
  const pdfRef = useRef(null);
  useEffect(() => {
    let dead = false, url;
    (async () => {
      try {
        const b = getBlob ? await getBlob() : await db.getFile(d.id); if (!b) throw new Error("Originaldatei nicht gefunden");
        if (b.type !== "application/pdf") { url = URL.createObjectURL(b); if (!dead) { setPages([url]); setTotal(1); } return; }
        if (!pdfRef.current) pdfRef.current = await (await loadPdfjs()).getDocument({ data: await b.arrayBuffer() }).promise;
        const pdf = pdfRef.current; if (dead) return; setTotal(pdf.numPages);
        const W = Math.min(1600, Math.round(820 * (window.devicePixelRatio || 1)));
        for (let i = pages.length + 1; i <= Math.min(want, pdf.numPages); i++) {
          const page = await pdf.getPage(i), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: W / v1.width });
          const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
          const src = c.toDataURL("image/jpeg", 0.82); if (dead) return;
          setPages((p) => (p.length >= i ? p : [...p, src]));
        }
      } catch (e) { if (!dead) setErr(e.message || String(e)); }
    })();
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [d.id, want]);
  useEffect(() => () => { pdfRef.current?.destroy(); }, []);
  return (
    <div className="dprev" onClick={(e) => e.stopPropagation()}>
      {err ? <p className="muted small">Vorschau nicht möglich: {err}</p> : <>
        <div className="dpages">
          {/* schwebende Leiste am oberen Rand der Vorschau */}
          <div className="dprevbar float">
            <small>{total > 1 ? `${pages.length} von ${total} Seiten` : "1 Seite"}</small>
            {total > pages.length && pages.length >= want && <button className="btn sm" onClick={() => setWant(want + 5)}>Weitere Seiten</button>}
            <button className="btn sm" onClick={() => (onPrint ? onPrint() : printDoc(d))} title="Drucken"><IcoPrint /></button>
            <button className="btn sm" onClick={() => (onOriginal ? onOriginal() : openOriginal(d))}>Original öffnen</button>
          </div>
          {pages.map((src, i) => <img key={i} src={src} alt={`Seite ${i + 1}`} loading="lazy" />)}
          {(!pages.length || pages.length < Math.min(want, total || 1)) && <div className="dpload">Seite wird geladen …</div>}
        </div>
      </>}
    </div>
  );
}

/* Schwebeleiste auf der Kachel (Seitenzahl + Original öffnen) */
const pageCountCache = new Map();
function CardBar({ d }) {
  const [n, setN] = useState(() => (d.mimeType === "application/pdf" ? pageCountCache.get(d.id) || d.pageCount || 0 : 1));
  const load = async () => {
    if (n) return;
    try {
      const b = await db.getFile(d.id); if (!b) return;
      if (b.type !== "application/pdf") { setN(1); return; }
      const pdf = await (await loadPdfjs()).getDocument({ data: await b.arrayBuffer() }).promise;
      pageCountCache.set(d.id, pdf.numPages); setN(pdf.numPages); pdf.destroy();
    } catch {}
  };
  const ref = useRef(null);
  useEffect(() => {
    if (n || !ref.current) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } });
    io.observe(ref.current); return () => io.disconnect();
  }, [d.id]);
  return (
    <div ref={ref} className="dprevbar float gbar" onClick={(e) => e.stopPropagation()}>
      {n > 0 && <small style={{ paddingLeft: 6 }}>{n === 1 ? "1 Seite" : `${n} Seiten`}</small>}
      <button className="btn sm" onClick={() => printDoc(d)} title="Drucken" aria-label="Drucken"><IcoPrint /></button>
      <button className="btn sm orig" onClick={() => openOriginal(d)}>Original öffnen</button>
    </div>
  );
}

const Thumb = ({ d, className = "thumb" }) => (
  <div className={className}>{d.thumb ? <img src={d.thumb} alt="" /> : <span>{d.mimeType === "application/pdf" ? "PDF" : "🖼"}</span>}</div>
);

// Abo aus Umsätzen „vermutlich beendet“, wenn die letzte Buchung deutlich länger her ist als ein Intervall
const SUB_MAXDAYS = { monatlich: 62, vierteljährlich: 125, halbjährlich: 220, jährlich: 420 };
const subStale = (r) => !!r.last && daysUntil(r.last) < -(SUB_MAXDAYS[r.interval] || 62);
// ✓ bestätigt = zählt immer · ✕ deaktiviert = zählt nie · sonst automatisch nach letzter Buchung
const subInactive = (r, subs = {}) => (subs.ended || []).includes(r.key) || (!(subs.verified || []).includes(r.key) && subStale(r));
const INTERVAL_FACTOR ={ monatlich: 1, vierteljährlich: 1 / 3, halbjährlich: 1 / 6, jährlich: 1 / 12 };
const INTERVAL_SHORT = { monatlich: "/ Monat", vierteljährlich: "/ Quartal", halbjährlich: "/ Halbjahr", jährlich: "/ Jahr" };
const TRASH_DAYS = 30;

/* ---------- IndexedDB ---------- */
const DB_NAME = "dokumente", DB_VER = 3;
let dbPromise;
function openDB() {
  if (!dbPromise)
    dbPromise = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" });
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
        if (!db.objectStoreNames.contains("tx")) db.createObjectStore("tx", { keyPath: "id" });
        if (!db.objectStoreNames.contains("logos")) db.createObjectStore("logos");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  return dbPromise;
}
async function idb(store, mode, fn) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}
const db = {
  allLogos: async () => { const k = await idb("logos", "readonly", (s) => s.getAllKeys()); const v = await idb("logos", "readonly", (s) => s.getAll()); return Object.fromEntries((k || []).map((x, i) => [x, v[i]])); },
  putLogo: (k, v) => idb("logos", "readwrite", (s) => s.put(v, k)),
  delLogo: (k) => idb("logos", "readwrite", (s) => s.delete(k)),
  allDocs: () => idb("docs", "readonly", (s) => s.getAll()),
  putDoc: (d) => idb("docs", "readwrite", (s) => s.put(d)),
  delDoc: (id) => idb("docs", "readwrite", (s) => s.delete(id)),
  getFile: (id) => idb("files", "readonly", (s) => s.get(id)),
  putFile: (id, blob) => idb("files", "readwrite", (s) => s.put(blob, id)),
  delFile: (id) => idb("files", "readwrite", (s) => s.delete(id)),
  allTx: () => idb("tx", "readonly", (s) => s.getAll()),
  putTxs: (list) => idb("tx", "readwrite", (s) => { let r; for (const t of list) r = s.put(t); return r; }),
  delTxs: (ids) => idb("tx", "readwrite", (s) => { let r; for (const id of ids) r = s.delete(id); return r; })
};

/* ---------- Helfer ---------- */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayISO = () => new Date().toLocaleDateString("sv-SE");
// einheitlich TT.MM.JJJJ (mit führender Null)
const fmtDate = (iso) => (iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–");
let HIDE_AMOUNTS = false; // Einstellungen → Datenschutz
const fmtMoney = (v, cur = "EUR") => HIDE_AMOUNTS && v != null && !isNaN(v) ? "€ •••" :
  v == null || isNaN(v) ? "" : new Intl.NumberFormat("de-AT", { style: "currency", currency: cur || "EUR" }).format(v);
const daysUntil = (iso) => Math.round((new Date(iso + "T12:00:00") - new Date(todayISO() + "T12:00:00")) / 864e5);
const MONTHS_DE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const monthKey = (d) => (d.documentDate || d.createdAt || "").slice(0, 7);
const monthLabel = (k) => new Date(k + "-15").toLocaleDateString("de-AT", { month: "short", year: "2-digit" });
const norm = (s) => String(s || "").toLowerCase();
const isEUR = (d) => (d.amount?.currency || "EUR") === "EUR";
// tatsächlich überwiesener Betrag: bei Lohn/Gehalt die Netto-Auszahlung, sonst die Endsumme
const isSalary = (d) => /lohn|gehalt|bezug/i.test(`${d.docType || ""} ${d.category || ""} ${d.title || ""}`);
const payAmt = (d) => !d.amount ? null : d.amount.payout ?? (d.direction === "einnahme" && isSalary(d) && d.amount.net ? d.amount.net : d.amount.total);
const docScope = (d) => d.scope || "privat";
const monthlyCost = (c) => (c?.amount && INTERVAL_FACTOR[c.interval] ? c.amount * INTERVAL_FACTOR[c.interval] : 0);
const Ico = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>);
const IcoEye = () => <Ico d={<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>} />;
const IcoEyeOff = () => <Ico d={<><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6C3.8 8.3 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="M3 3l18 18" /></>} />;
const IcoLayout = () => <Ico d={<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>} />;
const IcoEdit = () => <Ico d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>} />;
const IcoOpen = () => <Ico d={<><path d="M14 4h6v6" /><path d="M10 14L20 4" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>} />;
const IcoTrash = () => <Ico d={<><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M9 7V4h6v3" /></>} />;
const IcoCalSync = () => <Ico size={17} d={<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M9.5 15.5l2 2 3.5-4" /></>} />;
const IcoShare = () => <Ico d={<><path d="M12 15V3" /><path d="M8 7l4-4 4 4" /><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" /></>} />;
const IcoPrint = () => <Ico d={<><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /><path d="M17 12h.01" /></>} />;
const IcoSun = () => <Ico d={<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>} />;
const IcoMoon = () => <Ico d={<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />} />;
const IcoChev = ({ open }) => <span className={"pchev" + (open ? " open" : "")}><Ico size={16} d={<path d="M6 9l6 6 6-6" />} /></span>;

/* Tag/Nacht: auto = System, zeit = nach Uhrzeit (Tag 7–19 Uhr), light, dark */
const DAY_FROM = 7, DAY_TO = 19;
function effectiveTheme(mode) {
  if (mode === "light" || mode === "dark") return mode;
  if (mode === "zeit") { const h = new Date().getHours(); return h >= DAY_FROM && h < DAY_TO ? "light" : "dark"; }
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === "dark" ? "#0d1117" : "#f3f5f9";
}

const ls = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

if (typeof document !== "undefined" && ls.get("tabbarIcons", false)) document.documentElement.classList.add("tbicons");
const BACKUP_SKIP = /^(appToken|appLock|pending|openSettingsSec|win:|scanFilter)/;
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
function base64ToBlob(b64, type) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
async function prepareFile(file) {
  if (file.type === "application/pdf") return file;
  if (!file.type.startsWith("image/")) throw new Error("Nur PDF oder Bilder");
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function copy(text, notify) {
  try { await navigator.clipboard.writeText(text); notify?.("Kopiert"); } catch { notify?.("Kopieren nicht möglich"); }
}

function useEsc(fn) {
  useEffect(() => { const h = (e) => { if (e.key === "Escape") fn(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); });
}

/* ---------- Kalender (.ics) ---------- */
const icsEsc = (s = "") => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
function icsEvent(dl, doc) {
  const d = dl.date.replace(/-/g, "");
  const next = new Date(dl.date + "T12:00:00"); next.setDate(next.getDate() + 1);
  const d2 = next.toLocaleDateString("sv-SE").replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const amount = payAmt(doc) != null ? ` (${fmtMoney(payAmt(doc), doc.amount.currency)})` : "";
  const sum = icsEsc(`${dl.label}: ${doc.title}${amount}`);
  return [
    "BEGIN:VEVENT", `UID:${dl.id}@dokumente`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`,
    `SUMMARY:${sum}`, `DESCRIPTION:${icsEsc(doc.summary || "")}`,
    "BEGIN:VALARM", "TRIGGER:-P2DT15H", "ACTION:DISPLAY", `DESCRIPTION:${sum}`, "END:VALARM",
    "BEGIN:VALARM", "TRIGGER:-PT15H", "ACTION:DISPLAY", `DESCRIPTION:${sum}`, "END:VALARM",
    "END:VEVENT"
  ].join("\r\n");
}
function downloadIcs(items, name) {
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dokumente//DE", ...items.map(([dl, doc]) => icsEvent(dl, doc)), "END:VCALENDAR"].join("\r\n");
  download(new Blob([body], { type: "text/calendar" }), name);
}

/* ---------- CSV-Export (Excel-tauglich, de-AT) ---------- */
function exportCsv(list, name) {
  const n = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  const head = ["Datum", "Titel", "Absender", "Kategorie", "Typ", "Brutto €", "Netto €", "USt €", "Währung", "Art", "Steuerrelevant", "Bezahlt", "Tags"];
  downloadCsv(name, head, list.map((d) => [d.documentDate || "", d.title || "", d.sender || "", d.category || "", d.docType || "", n(d.amount?.total), n(d.amount?.net), n(d.amount?.vat),
    d.amount?.currency || "", d.direction || "", d.taxRelevant ? "ja" : "", d.paid ? "ja" : "", (d.tags || []).join(", ")]));
}

/* ---------- EPC-QR („Zahlen mit Code“) ---------- */
function epcPayload(doc) {
  const p = doc.payment || {};
  const amount = doc.amount?.total && isEUR(doc) ? "EUR" + doc.amount.total.toFixed(2) : "";
  return ["BCD", "002", "1", "SCT", (p.bic || "").replace(/\s/g, ""), (p.recipient || doc.sender || "").slice(0, 70),
    (p.iban || "").replace(/\s/g, "").toUpperCase(), amount, "", "", (p.reference || "").slice(0, 140)].join("\n");
}

/* ---------- Suche ---------- */
function haystack(d) {
  return norm([d.title, d.sender, d.category, d.docType, d.summary, d.fullText, d.notes, d.fileName,
    d.contract?.provider, d.contract?.customerNumber, d.payment?.reference,
    (d.tags || []).join(" "), d.amount?.total != null ? String(d.amount.total).replace(".", ",") : ""].join(" "));
}

/* ---------- Kündigungsschreiben ---------- */
function cancelLetter(c, me) {
  const lines = [
    me.name, me.address, "", c.provider || "", "", `${me.city ? me.city + ", " : ""}am ${fmtDate(todayISO())}`, "",
    `Betreff: Kündigung ${c.name || "meines Vertrags"}${c.customerNumber ? ` – Kunden-/Vertragsnummer ${c.customerNumber}` : ""}`, "",
    "Sehr geehrte Damen und Herren,", "",
    `hiermit kündige ich den oben genannten Vertrag fristgerecht zum nächstmöglichen Zeitpunkt${c.endDate ? `, laut meinen Unterlagen zum ${fmtDate(c.endDate)}` : ""}.`,
    "Ein erteiltes SEPA-Lastschriftmandat widerrufe ich mit Wirkung zum Vertragsende.", "",
    "Bitte bestätigen Sie mir die Kündigung und das Vertragsende schriftlich.", "",
    "Mit freundlichen Grüßen", "", me.name
  ];
  return lines.filter((l, i) => !(l === undefined || (l === "" && lines[i - 1] === ""))).join("\n").trim();
}

/* ---------- Navigation, Kontengruppen, Dokument-Bereiche ---------- */
const TAB_DEFS = { home: ["🏠", "Übersicht"], docs: ["📄", "Dokumente"], deadlines: ["⏰", "Umtauschfrist"], accounts: ["🏦", "Konten"], cash: ["💶", "Ausgabe"], analyse: ["📊", "Analyse"], vermoegen: ["💎", "Vermögen"], fahrtenbuch: ["🚗", "Fahrtenbuch"], firma: ["📈", "Firmenauswertung"], invoices: ["🧾", "Rechnungen"], kunden: ["👥", "Kunden"], mahnungen: ["📮", "Mahnungen"], artikel: ["📦", "Artikel"], inventur: ["📋", "Lager & Inventur"], besitz: ["🛡️", "Besitz & Garantie"], kassa: ["📒", "Kassabuch"], vertraege: ["📑", "Verträge"], contracts: ["🔁", "Fixkosten & Abos"], settings: ["⚙️", "Einstellungen"], backup: ["💾", "Backup"] };
const KIND_DEFS = { cash: ["💶", "Bargeld"], bank: ["🏦", "Girokonto"], card: ["💳", "Kreditkarte"], wallet: ["🌐", "PayPal / Online"], savings: ["🐷", "Sparkonto"], broker: ["📈", "Depot"] };
const kindIcon = (k) => (KIND_DEFS[k] || KIND_DEFS.bank)[0];
/* Konto-Symbol: eigenes Bild > eigenes Emoji > Standard je Kontoart ("none" = kein Symbol) */
const accHasIcon = (a) => !!(a.iconImg || (a.icon && a.icon !== "none"));
function AccIcon({ a, className = "ki", force = false }) {
  if (a.iconImg) return <span className={className + " custom"}><img src={a.iconImg} alt="" /></span>;
  if (a.icon === "none") return force ? <span className={className} /> : null;
  if (a.icon) return <span className={className + " custom"}>{a.icon}</span>;
  return <span className={className}>{kindIcon(a.kind)}</span>;
}
const accStyle = (a) => (a.color ? { color: a.color } : undefined);
const ACC_COLORS = ["#4f8cff", "#0b63f6", "#00b3a4", "#16a34a", "#84cc16", "#eab308", "#f59e0b", "#ef4444", "#e8384f", "#ec4899", "#a855f7", "#64748b"];
const ACC_EMOJIS = ["🏦", "💳", "💶", "🐷", "📈", "🌐", "🏠", "🚗", "💼", "🏢", "🎓", "💰", "🪙", "💎", "🧾", "🛒", "✈️", "❤️", "⭐", "🔒", "🅿️", "📱", "⚡", "🍀"];
async function iconFromFile(file) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const s = Math.max(64 / bmp.width, 64 / bmp.height), w = bmp.width * s, h = bmp.height * s;
  c.getContext("2d").drawImage(bmp, (64 - w) / 2, (64 - h) / 2, w, h);
  return c.toDataURL("image/png");
}
function AccStyleEditor({ a, onChange, onClose, lib = [], setLib }) {
  const fileRef = useRef();
  const [txt, setTxt] = useState("");
  const set = (patch) => onChange({ ...a, ...patch });
  const addLib = (it) => setLib?.([...lib.filter((x) => (it.src ? x.src !== it.src : x.emoji !== it.emoji)), { id: uid(), ...it }]);
  const delLib = (it) => { if (!confirm("Dieses eigene Symbol aus der Sammlung löschen?")) return; setLib?.(lib.filter((x) => x.id !== it.id)); };
  return (
    <div className="accstyle">
      <div className="asrow"><small className="muted">Textfarbe</small>
        <div className="swatches">
          <button className={"sw def" + (!a.color ? " on" : "")} title="Standard" onClick={() => set({ color: undefined })} style={{ background: "var(--txt)" }}>A</button>
          {ACC_COLORS.map((c) => <button key={c} className={"sw" + (a.color === c ? " on" : "")} style={{ background: c }} title={c} onClick={() => set({ color: c })} />)}
          <ColorDot className={"sw custom" + (a.color && !ACC_COLORS.includes(a.color) ? " on" : "")} title="Eigene Farbe" value={a.color || "#4f8cff"} onInput={(c) => set({ color: c })}>＋</ColorDot>
        </div>
      </div>
      <div className="asrow"><small className="muted">Symbol vor dem Namen</small>
        <div className="emojigrid">
          <button className={!a.icon && !a.iconImg ? "on" : ""} title="Standard je Kontoart" onClick={() => set({ icon: undefined, iconImg: undefined })}>{kindIcon(a.kind)}<i>Std</i></button>
          <button className={a.icon === "none" && !a.iconImg ? "on" : ""} title="Kein Symbol" onClick={() => set({ icon: "none", iconImg: undefined })}>∅</button>
          {ACC_EMOJIS.map((e) => <button key={e} className={a.icon === e && !a.iconImg ? "on" : ""} onClick={() => set({ icon: e, iconImg: undefined })}>{e}</button>)}
        </div>
      </div>
      <div className="asrow"><small className="muted">Eigene Symbole <span className="muted">– für alle Konten verfügbar</span></small>
        <div className="emojigrid">
          {lib.map((it) => (
            <span key={it.id} className="libwrap">
              <button className={(it.src ? a.iconImg === it.src : a.icon === it.emoji && !a.iconImg) ? "on" : ""} title="Eigenes Symbol"
                onClick={() => set(it.src ? { iconImg: it.src, icon: undefined } : { icon: it.emoji, iconImg: undefined })}>{it.src ? <img src={it.src} alt="" /> : it.emoji}</button>
              <button className="libdel" title="Aus Sammlung löschen" onClick={() => delLib(it)}>×</button>
            </span>
          ))}
          {a.iconImg && !lib.some((x) => x.src === a.iconImg) && <button className="on" title="Eigenes Bild"><img src={a.iconImg} alt="" /></button>}
          <button className="upl" title="Bild hochladen (PNG, JPG, SVG) – wird zur Sammlung hinzugefügt" onClick={() => fileRef.current.click()}>＋</button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={async (e) => {
            const files = [...e.target.files]; e.target.value = ""; let last = null; const add = [];
            for (const f of files) { try { last = await iconFromFile(f); add.push({ id: uid(), src: last }); } catch {} }
            if (!add.length) return alert("Bild konnte nicht gelesen werden");
            setLib?.([...lib, ...add]); set({ iconImg: last, icon: undefined });
          }} />
        </div>
        <div className="libadd">
          <input value={txt} maxLength={4} placeholder="Eigenes Emoji / Zeichen, z. B. 🦊 oder B" onChange={(e) => setTxt(e.target.value)} />
          <button className="btn sm" disabled={!txt.trim()} onClick={() => { const e2 = txt.trim(); addLib({ emoji: e2 }); set({ icon: e2, iconImg: undefined }); setTxt(""); }}>Hinzufügen</button>
        </div>
      </div>
      <div className="asfoot"><span className="aspreview"><AccIcon a={a} force /><b style={accStyle(a)}>{a.name}</b></span><button className="btn sm" onClick={onClose}>Fertig</button></div>
    </div>
  );
}
const DEFAULT_NAV = {
  tabs: [
    { key: "home", side: true, phone: true }, { key: "docs", side: true, phone: true }, { key: "deadlines", side: true, phone: true, parent: "docs" },
    { key: "accounts", side: true, phone: true }, { key: "cash", side: true, phone: true }, { key: "analyse", side: true, phone: true }, { key: "vermoegen", side: true, phone: true }, { key: "fahrtenbuch", side: true, phone: true }, { key: "invoices", side: true, phone: true }, { key: "kunden", side: true, phone: true }, { key: "mahnungen", side: true, phone: true }, { key: "firma", side: true, phone: true }, { key: "artikel", side: true, phone: true }, { key: "inventur", side: true, phone: true }, { key: "besitz", side: true, phone: true }, { key: "kassa", side: true, phone: true }, { key: "vertraege", side: true, phone: true }, { key: "contracts", side: true, phone: true }, { key: "settings", side: true, phone: true }, { key: "backup", side: true, phone: true, parent: "settings" }
  ],
  groups: [
    { id: "g-cash", title: "Bargeld", kinds: ["cash"], ids: [] },
    { id: "g-giro", title: "Girokonten", kinds: ["bank", "card", "wallet"], ids: [] },
    { id: "g-save", title: "Sparkonten", kinds: ["savings"], ids: [] },
    { id: "g-depot", title: "Depots", kinds: ["broker"], ids: [] }
  ],
  accOpen: true, docsOpen: false
};
function loadNav() {
  const n = ls.get("nav", null);
  const docGroups = n?.docGroups || buildDocGroups(ls.get("categories", DEFAULT_CATEGORIES));
  if (!n) return { ...DEFAULT_NAV, docGroups };
  n.docGroups = normGroups(docGroups);
  if (!n.v27 && !n.docGroups.some((g) => g.cats.includes("Ausgangsrechnung"))) {
    const fi = n.docGroups.findIndex((g) => g.area === "finanzen");
    const firma = { id: "d-firma", title: "Firma", area: "finanzen", cats: ["Ausgangsrechnung"] };
    const arr = [...n.docGroups]; let at = fi < 0 ? arr.length : fi + 1; while (arr[at]?.parent) at++;
    arr.splice(at, 0, firma); n.docGroups = normGroups(arr);
  }
  n.v27 = true;
  if (!n.v19) { n.tabs = n.tabs.map((t) => (t.key === "deadlines" && !t.parent ? { ...t, parent: "docs" } : t)); n.v19 = true; }
  const keys = n.tabs.map((t) => t.key);
  // fehlende (neue) Reiter vor „Einstellungen“ einfügen
  // Analyse/Vermögen direkt nach „Ausgabe“ einfügen
  for (const [k, prevKey] of [["analyse", "cash"], ["vermoegen", "analyse"], ["fahrtenbuch", "vermoegen"], ["firma", "mahnungen"], ["inventur", "artikel"], ["besitz", "inventur"], ["kassa", "besitz"]]) if (!keys.includes(k)) {
    const pi = n.tabs.findIndex((t) => t.key === prevKey);
    if (pi >= 0) { n.tabs = [...n.tabs.slice(0, pi + 1), DEFAULT_NAV.tabs.find((t) => t.key === k), ...n.tabs.slice(pi + 1)]; keys.push(k); }
  }
  const missing = DEFAULT_NAV.tabs.filter((t) => !keys.includes(t.key) && t.parent !== "settings");
  const after = DEFAULT_NAV.tabs.filter((t) => !keys.includes(t.key) && t.parent === "settings");
  const si = n.tabs.findIndex((t) => t.key === "settings");
  const tabs = si < 0 ? [...n.tabs, ...missing, ...after] : [...n.tabs.slice(0, si), ...missing, n.tabs[si], ...after, ...n.tabs.slice(si + 1)];
  return { ...DEFAULT_NAV, ...n, tabs };
}
const tabLabel = (nav, key) => nav.tabs.find((t) => t.key === key)?.label?.trim() || TAB_DEFS[key]?.[1] || "";
const isNavDeco = (t) => !!t.sep || t.head != null;
/* Reiter-Symbol: eigenes Bild > eigenes Emoji > Standard */
const TAB_SVG = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></>,
  docs: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>,
  deadlines: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M5 3 2.5 5.5M19 3l2.5 2.5" /></>,
  accounts: <><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 20h18" /></>,
  analyse: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M21 20H3" /></>,
  vermoegen: <><path d="M3 17l5-5 4 4 8-8" /><path d="M15 8h5v5" /><path d="M3 21h18" /></>,
  fahrtenbuch: <><path d="M5 17h14v-5l-2-5H7l-2 5z" /><path d="M5 12h14" /><circle cx="8" cy="17" r="1.8" /><circle cx="16" cy="17" r="1.8" /></>,
  firma: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 16v-3M12 16V9M16 16v-5" /></>,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></>,
  invoices: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  kunden: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.7 2.5 3 5.2" /></>,
  mahnungen: <><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 21h4" /></>,
  besitz: <><path d="M12 3l7 3v5.5c0 4.4-3 8.1-7 9.5-4-1.4-7-5.1-7-9.5V6z" /><path d="m9 12 2 2 4-4" /></>,
  inventur: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="m8.5 10 1.2 1.2L12 9M8.5 15l1.2 1.2L12 14M14.5 10.5H16M14.5 15.5H16" /></>,
  kassa: <><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" /><path d="M5 18a2 2 0 0 1 2-2h12" /><path d="M9 8h6M9 11.5h4" /></>,
  artikel: <><path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>,
  vertraege: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M8.5 17c1.2-1.6 2-1.6 2.6 0 .6 1.4 1.3 1.4 2.4 0" /></>,
  contracts: <><path d="M4 11a8 8 0 0 1 14-5.3L20 8" /><path d="M20 3v5h-5" /><path d="M20 13a8 8 0 0 1-14 5.3L4 16" /><path d="M4 21v-5h5" /></>,
  backup: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4" /><rect x="8" y="13" width="8" height="5" rx="1" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};
function TabIcon({ t }) {
  const cls = "tabico" + (t.iconImg || t.icon || t.color ? " custom" : "");
  const svg = !t.iconImg && !t.icon && TAB_SVG[t.key] ? <svg className="tabsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TAB_SVG[t.key]}</svg> : null;
  if (t.iconImg) return <span className={cls}><img src={t.iconImg} alt="" /></span>;
  return <span className={cls + (svg ? " hassvg" : "")}><span className="tabemo">{t.icon || TAB_DEFS[t.key]?.[0]}</span>{svg}</span>;
}

// Gruppen aus der Konfiguration + Konten, die noch keiner Gruppe zugeordnet sind (nach Art einsortiert)
function resolveGroups(nav, accounts) {
  const byId = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const placed = new Set();
  const groups = nav.groups.map((g) => ({ ...g, accounts: (g.ids || []).filter((id) => byId[id] && !placed.has(id) && placed.add(id)).map((id) => byId[id]) }));
  const rest = [];
  for (const a of accounts) {
    if (placed.has(a.id)) continue;
    const g = groups.find((x) => (x.kinds || []).includes(a.kind || "bank"));
    if (g) g.accounts.push(a); else rest.push(a);
  }
  if (rest.length) groups.push({ id: "g-rest", title: "Weitere Konten", accounts: rest, auto: true });
  return groups;
}
// Zählt eine Buchung zum Kontostand? (nur was nach dem Erfassen des Startbestands passiert ist)
const afterOpening = (t, acc) => !acc.openingDate || t.date > acc.openingDate ||
  (t.date === acc.openingDate && (!acc.openingAt || (t.createdAt || t.importedAt || "") > acc.openingAt));
const balEstimated = (acc) => acc.kind !== "cash" && (acc.opening == null || acc.opening === "");
function accountBalance(acc, txs) {
  if (acc.kind === "cash") return cashBalance(acc, txs);
  if (acc.opening == null || acc.opening === "") {
    const l = txs.filter((t) => t.accountId === acc.id);
    return l.length ? l.reduce((s, t) => s + t.amount, 0) : null; // geschätzt: Summe aller Umsätze
  }
  return acc.opening + txs.filter((t) => t.accountId === acc.id && afterOpening(t, acc)).reduce((s, t) => s + t.amount, 0);
}

const SCOPES = [["privat", "👤", "Privat"], ["firma", "🏢", "Firma"]];
const AREAS = { finanzen: ["💶", "Finanzen"], vertraege: ["📑", "Verträge"], sonstiges: ["🗂️", "Sonstiges"] };
function docArea(d) {
  if (d.areaManual) return d.areaManual;
  if (d.area === "sonstiges") return "sonstiges";
  if (CAT_AREA[d.category]) return CAT_AREA[d.category];
  if (d.area) return d.area;
  if (d.contract || d.docType === "Vertrag" || d.docType === "Polizze") return "vertraege";
  if (d.amount?.total && d.direction && d.direction !== "keine") return "finanzen";
  return "sonstiges";
}
const inAnalysis = (d) => docArea(d) !== "sonstiges";

/* ---------- Dokument-Kategorien in Gruppen (wie Konten) ---------- */
const DEFAULT_CAT_AREA = {
  "Rechnungen": "finanzen", "Bank & Finanzen": "finanzen", "Steuer & Finanzamt": "finanzen", "Lohn & Arbeit": "finanzen",
  "Lebensmittel & Haushalt": "finanzen", "Freizeit & Abos": "finanzen", "Auto & Mobilität": "finanzen", "Wohnen & Energie": "finanzen",
  "Garantie & Kaufbelege": "finanzen", "Gesundheit": "finanzen", "Verträge": "vertraege", "Versicherung": "vertraege",
  "Behörden": "sonstiges", "Sonstiges": "sonstiges"
};
function buildDocGroups(categories) {
  const g = [
    { id: "d-fin", title: "Finanzen", area: "finanzen", cats: [] },
    { id: "d-vert", title: "Verträge", area: "vertraege", cats: [] },
    { id: "d-sonst", title: "Sonstiges", area: "sonstiges", cats: [] }
  ];
  for (const c of categories) (g.find((x) => x.area === (DEFAULT_CAT_AREA[c] || "sonstiges")) || g[2]).cats.push(c);
  if (!g.some((x) => x.cats.includes("Sonstiges"))) g[2].cats.push("Sonstiges");
  return g;
}
// Untergruppen: g.parent = id einer Hauptgruppe; Array wird so sortiert, dass Untergruppen direkt hinter ihrer Hauptgruppe stehen
function normGroups(groups) {
  const ids = new Set(groups.map((g) => g.id));
  const fixed = groups.map((g) => (g.parent && (!ids.has(g.parent) || g.parent === g.id || groups.find((x) => x.id === g.parent)?.parent) ? { ...g, parent: undefined } : g));
  const tops = fixed.filter((g) => !g.parent);
  return tops.flatMap((t) => [t, ...fixed.filter((g) => g.parent === t.id)]);
}
const flattenCats = (docGroups) => [...new Set([...docGroups.flatMap((g) => g.cats), "Sonstiges"])];
// Kategorie → Bereich (wird bei jedem Rendern aus der Konfiguration gesetzt)
let CAT_AREA = { ...DEFAULT_CAT_AREA };

function DocTree({ docGroups, docs, selected, onSelect, onToggleGroup, variant = "", showEmpty = false }) {
  const count = (c) => docs.filter((d) => d.category === c).length;
  const groups = normGroups(docGroups);
  const kids = (g) => groups.filter((x) => x.parent === g.id);
  const total = (g) => g.cats.reduce((s, c) => s + count(c), 0) + kids(g).reduce((s, k) => s + total(k), 0);
  const visible = (g) => showEmpty || total(g) > 0;
  const shown = groups.filter((g) => !g.parent && visible(g));
  if (!shown.length) return null;
  const renderGroup = (g, sub) => (
    <div key={g.id} className={"accgroup" + (sub ? " subgrp" : "")}>
      {g.title?.trim() && (
        <button className="acctitle" onClick={() => onToggleGroup(g.id)} aria-expanded={!g.collapsed}>
          <span className={"chev" + (g.collapsed ? "" : " open")}>›</span><span className="grow">{g.title}</span>
          {g.collapsed && <small>{total(g)}</small>}
        </button>
      )}
      {!g.collapsed && <>
        {g.cats.filter((c) => showEmpty || count(c)).map((c) => (
          <button key={c} className={"accitem" + (selected === c ? " on" : "")} onClick={() => onSelect(selected === c ? "" : c)}>
            <span className="ki"><CatGlyph c={c} /></span><span className="an" style={CAT_STYLE[c] ? { color: CAT_STYLE[c][1] } : undefined}>{c}</span><span className="ab muted">{count(c)}</span>
          </button>
        ))}
        {!sub && kids(g).filter(visible).map((k) => renderGroup(k, true))}
      </>}
    </div>
  );
  return (
    <div className={"acctree doctree " + variant}>
      {shown.map((g, gi) => <React.Fragment key={g.id}>{gi > 0 && <div className="accdiv" />}{renderGroup(g, false)}</React.Fragment>)}
    </div>
  );
}

/* ---------- Ziehen & Ablegen (Maus + Touch, über Pointer-Events) ---------- */
// Ziele werden über data-Attribute gefunden: data-<art>-item="liste|index" und data-<art>-list="liste|länge"
function findDropTarget(x, y, kind) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const item = el.closest(`[data-${kind}-item]`);
  if (item) {
    const [list, idx] = item.getAttribute(`data-${kind}-item`).split("|");
    const r = item.getBoundingClientRect();
    const pr = item.parentElement.getBoundingClientRect();
    if (item.dataset.grid && r.width < pr.width * 0.8) return { list, index: +idx + (x > r.left + r.width / 2 ? 1 : 0) };
    return { list, index: +idx + (y > r.top + r.height / 2 ? 1 : 0) };
  }
  const lst = el.closest(`[data-${kind}-list]`);
  if (!lst) return null;
  const [list, len] = lst.getAttribute(`data-${kind}-list`).split("|");
  // zwischen zwei Zeilen: nächstgelegene Position statt Listenende
  const items = [...lst.querySelectorAll(`[data-${kind}-item]`)].filter((n) => n.getAttribute(`data-${kind}-item`).split("|")[0] === list);
  for (const n of items) {
    const r = n.getBoundingClientRect();
    if (y < r.top + r.height / 2) return { list, index: +n.getAttribute(`data-${kind}-item`).split("|")[1] };
  }
  return { list, index: +len };
}
function useDnd(onDrop) {
  const [drag, setDrag] = useState(null);
  const cur = useRef(null), dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  function start(e, payload) {
    if (e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    cur.current = { ...payload, x: e.clientX, y: e.clientY, over: null };
    setDrag({ ...cur.current });
    document.body.classList.add("dnd-active");
    navigator.vibrate?.(8);
    let raf;
    const move = (ev) => {
      const d = cur.current; if (!d) return;
      ev.preventDefault();
      d.x = ev.clientX; d.y = ev.clientY; d.over = findDropTarget(ev.clientX, ev.clientY, d.kind);
      setDrag({ ...d });
    };
    const end = () => {
      const d = cur.current; cur.current = null; setDrag(null);
      document.body.classList.remove("dnd-active");
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end);
      cancelAnimationFrame(raf);
      if (d?.over) dropRef.current(d, d.over);
    };
    // automatisch scrollen, wenn man an den Rand zieht
    const tick = () => {
      const d = cur.current; if (!d) return;
      if (d.y < 90) window.scrollBy(0, -12); else if (d.y > innerHeight - 90) window.scrollBy(0, 12);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
  }
  // Hilfen fürs Rendern
  const isDragging = (kind, list, index) => drag && drag.kind === kind && drag.list === list && drag.index === index;
  const lineAt = (kind, list, index) => drag && drag.kind === kind && drag.over && drag.over.list === list && drag.over.index === index &&
    !(drag.list === list && (index === drag.index || index === drag.index + 1));
  const ghost = drag && <div className="dndghost" style={{ left: drag.x, top: drag.y }}>{drag.label}</div>;
  return { drag, start, isDragging, lineAt, ghost };
}
// Element in Listen verschieben (Quelle und Ziel können verschiedene Listen sein)
function moveBetween(lists, from, fromIdx, to, toIdx) {
  const out = Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, [...v]]));
  const [item] = out[from].splice(fromIdx, 1);
  if (from === to && toIdx > fromIdx) toIdx--;
  out[to].splice(toIdx, 0, item);
  return out;
}
const Handle = ({ onDown, label = "Ziehen zum Verschieben" }) => (
  <span className="handle" onPointerDown={onDown} aria-label={label} title={label} role="button">⠿</span>
);

/* ---------- Textfeld mit ✓ übernehmen / ✕ verwerfen ---------- */
function EditText({ value = "", onSave, placeholder, className = "", validate, resetOnSave = false, inputClass = "" }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const dirty = v !== value;
  const ok = () => {
    const t = v.trim();
    if (validate) { const err = validate(t); if (err) return; }
    onSave(t);
    if (resetOnSave) setV("");
  };
  const cancel = () => setV(value);
  return (
    <div className={"edittext " + className + (dirty ? " dirty" : "")}>
      <input className={inputClass} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (dirty) ok(); } if (e.key === "Escape" && dirty) { e.stopPropagation(); e.preventDefault(); cancel(); } }} />
      {dirty && (
        <span className="editbtns">
          <button className="okbtn" onClick={ok} aria-label="Übernehmen" title="Übernehmen (Enter)">✓</button>
          <button className="nobtn" onClick={cancel} aria-label="Verwerfen" title="Verwerfen (Esc)">✕</button>
        </span>
      )}
    </div>
  );
}

/* Kategorie: Symbol & Farbe (Einstellungen und „Neue Kategorie“) */
const CAT_EMOJIS = ["📁", "🏠", "⚡", "🚗", "⛽", "🛒", "🍽️", "🏥", "💊", "🛡️", "📱", "🌐", "🎓", "👶", "🐾", "✈️", "🎁", "👕", "🔧", "🏋️", "🎮", "📚", "💼", "🏢", "🧾", "💶", "📈", "🏦", "🧸", "🌱", "🔒", "⭐"];
const IconLibCtx = React.createContext({ lib: [], setLib: null });
function CatStylePicker({ icon, color, img, onChange }) {
  const [txt, setTxt] = useState("");
  const { lib, setLib } = React.useContext(IconLibCtx);
  const fileRef = useRef();
  const set = (p) => onChange({ icon, color, img, ...p });
  return (
    <div className="accstyle catstyle">
      <div className="asrow"><small className="muted">Farbe</small>
        <div className="swatches">
          {ACC_COLORS.map((c) => <button type="button" key={c} className={"sw" + (color === c ? " on" : "")} style={{ background: c }} title={c} onClick={() => set({ color: c })} />)}
          <ColorDot className={"sw custom" + (color && !ACC_COLORS.includes(color) ? " on" : "")} title="Eigene Farbe" value={color || "#4f8cff"} onInput={(c) => set({ color: c })}>＋</ColorDot>
        </div>
      </div>
      <div className="asrow"><small className="muted">Symbol</small>
        <div className="emojigrid">
          {[...new Set([...CAT_EMOJIS, icon].filter(Boolean))].map((e) => <button type="button" key={e} className={icon === e && !img ? "on" : ""} onClick={() => set({ icon: e, img: undefined })}>{e}</button>)}
        </div>
      </div>
      <div className="asrow"><small className="muted">Eigene Symbole <span className="muted">– für Kategorien und Konten</span></small>
        <div className="emojigrid">
          {lib.map((it) => (
            <span key={it.id} className="libwrap">
              <button type="button" className={(it.src ? img === it.src : icon === it.emoji && !img) ? "on" : ""} onClick={() => set(it.src ? { img: it.src } : { icon: it.emoji, img: undefined })}>{it.src ? <img src={it.src} alt="" /> : it.emoji}</button>
              <button type="button" className="libdel" title="Aus Sammlung löschen" onClick={() => confirm("Dieses eigene Symbol aus der Sammlung löschen?") && setLib?.(lib.filter((x) => x.id !== it.id))}>×</button>
            </span>
          ))}
          {img && !lib.some((x) => x.src === img) && <button type="button" className="on"><img src={img} alt="" /></button>}
          <button type="button" className="upl" title="Bild hochladen (PNG, JPG, SVG) – wird zur Sammlung hinzugefügt" onClick={() => fileRef.current.click()}>＋</button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={async (e) => {
            const files = [...e.target.files]; e.target.value = ""; let last = null; const add = [];
            for (const f of files) { try { last = await iconFromFile(f); add.push({ id: uid(), src: last }); } catch {} }
            if (!add.length) return alert("Bild konnte nicht gelesen werden");
            setLib?.([...lib, ...add]); set({ img: last });
          }} />
        </div>
        <div className="libadd">
          <input value={txt} maxLength={4} placeholder="Eigenes Emoji / Zeichen, z. B. 🦊 oder B" onChange={(e) => setTxt(e.target.value)} />
          <button type="button" className="btn sm" disabled={!txt.trim()} onClick={() => { const t = txt.trim(); if (!lib.some((x) => x.emoji === t)) setLib?.([...lib, { id: uid(), emoji: t }]); set({ icon: t, img: undefined }); setTxt(""); }}>Hinzufügen</button>
        </div>
      </div>
    </div>
  );
}
function NewCategoryWin({ groups, defGroup, existing, onCreate, onClose }) {
  const [name, setName] = useState(""), [gid, setGid] = useState(defGroup || groups[0]?.id);
  const auto = catMeta(name || "x");
  const [st, setSt] = useState({ icon: "📁", color: auto.color });
  const n = name.trim(), dup = n && existing.some((c) => c.toLowerCase() === n.toLowerCase());
  return (
    <Win id="newcat" onClose={onClose} small center dirty={!!n} saveLabel="Anlegen">
      <div className="panelhead"><b>Neue Kategorie</b>
        <button className="btn primary" disabled={!n || dup} onClick={() => { onCreate(n, gid, st); onClose(); }}>Anlegen</button><XBtn /></div>
      <label>Name<input autoFocus value={name} placeholder="z. B. KFZ, Haustier, Hobby" onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && n && !dup) { onCreate(n, gid, st); onClose(); } }} /></label>
      {dup && <p className="red small">Diese Kategorie gibt es schon.</p>}
      <label>Gruppe<select value={gid} onChange={(e) => setGid(e.target.value)}>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.title || "(ohne Überschrift)"} · {AREAS[g.area]?.[1] || ""}</option>)}
      </select></label>
      <CatStylePicker icon={st.icon} color={st.color} img={st.img} onChange={setSt} />
      <div className="asfoot"><span className="aspreview"><span className="label" style={{ color: st.color, background: st.color + "22" }}>{st.img ? <img className="catimg" src={st.img} alt="" /> : st.icon} {n || "Vorschau"}</span></span></div>
      <p className="muted small">Später änderbar unter Einstellungen › Dokumente – Kategorien.</p>
    </Win>
  );
}

function DocNavSettings({ part = "groups", nav, setNav, docs, renameCategory, deleteCategory, notify }) {
  const isG = part === "groups";
  const groups = nav.docGroups;
  const all = flattenCats(groups);
  const save = (g) => setNav((n) => ({ ...n, docGroups: normGroups(g) }));
  const patch = (gi, p) => save(groups.map((g, k) => (k === gi ? { ...g, ...p } : g)));
  const count = (c) => docs.filter((d) => d.category === c).length;
  const [styleCat, setStyleCat] = useState(null);
  const hasKids = (g) => groups.some((x) => x.parent === g.id);
  const addSub = (g) => save([...groups, { id: "d-" + uid(), title: "Neue Untergruppe", area: g.area, parent: g.id, cats: [] }]);
  const dnd = useDnd((d, over) => {
    if (d.kind === "dcat") {
      const m = moveBetween(Object.fromEntries(groups.map((g) => [g.id, g.cats])), d.list, d.index, over.list, over.index);
      save(groups.map((g) => ({ ...g, cats: m[g.id] })));
    } else if (d.kind === "dgrp") save(moveBetween({ g: groups }, "g", d.index, "g", over.index).g);
  });
  const delGroup = (gi) => {
    if (groups.length <= 1) return notify("Mindestens eine Gruppe wird gebraucht");
    const gone = groups[gi];
    const rest = groups.filter((_, k) => k !== gi).map((g) => (g.parent === gone.id ? { ...g, parent: undefined } : g)), moved = gone.cats;
    const tgtName = gone.parent ? groups.find((g) => g.id === gone.parent)?.title : rest[0].title;
    if (moved.length && !confirm(`Gruppe löschen? Die ${moved.length} Kategorien wandern in „${tgtName || "erste Gruppe"}“.`)) return;
    const tgt = gone.parent ? rest.findIndex((g) => g.id === gone.parent) : 0;
    rest[tgt] = { ...rest[tgt], cats: [...rest[tgt].cats, ...moved] }; save(rest);
  };
  const addGroup = () => save([...groups, { id: "d-" + uid(), title: "Neue Gruppe", area: "sonstiges", cats: [] }]);
  const check = (old) => (t) => {
    if (!t) { notify("Der Name darf nicht leer sein"); return "leer"; }
    if (t.toLowerCase() !== old.toLowerCase() && all.some((c) => c.toLowerCase() === t.toLowerCase())) { notify("Diese Kategorie gibt es schon"); return "doppelt"; }
  };

  return (
    <SetSec id={isG ? "docgroups" : "doccats"} title={isG ? "Dokumente – Gruppen" : "Dokumente – Kategorien"}>
      {isG
        ? <p className="muted small">Gruppen sind die Überschriften in der Seitenleiste und bei den Dokumenten. Am Griff <b>⠿</b> ziehen zum Sortieren. Die Gruppe legt fest, ob ihre Dokumente als Finanzen, Verträge oder Sonstiges zählen („Sonstiges“ fließt nicht in Übersicht und Budgets).</p>
        : <p className="muted small">Auf das Symbol einer Kategorie tippen, um Symbol &amp; Farbe zu ändern. Am Griff <b>⠿</b> ziehen, um Kategorien zu sortieren oder in eine andere Gruppe zu verschieben. Gruppen selbst bearbeitest du unter „Dokumente – Gruppen“.</p>}
      {groups.map((g, gi) => (
        <React.Fragment key={g.id}>
          {isG && dnd.lineAt("dgrp", "g", gi) && <div className="dropline" />}
          <div className={"grpcfg" + (isG ? "" : " catsonly") + (g.parent ? " subcfg" : "") + (dnd.isDragging("dgrp", "g", gi) ? " dragging" : "") + (dnd.drag?.kind === "dcat" && dnd.drag.over?.list === g.id ? " dropover" : "")}
            {...(isG ? { "data-dgrp-item": `g|${gi}` } : { "data-dcat-list": `${g.id}|${g.cats.length}` })}>
            {!isG && <div className="grplabel"><b>{g.parent ? "↳ " : ""}{g.title || "Ohne Überschrift"}</b><small className="muted">{AREAS[g.area]?.[0]} {AREAS[g.area]?.[1]}</small></div>}
            {isG && <><div className="grphead">
              <Handle onDown={(e) => dnd.start(e, { kind: "dgrp", list: "g", index: gi, label: `📁 ${g.title || "Gruppe"}` })} label="Gruppe verschieben" />
              {g.parent && <span className="subarrow" aria-hidden="true">↳</span>}
              <EditText className="grow" inputClass="grptitle" value={g.title || ""} placeholder={g.parent ? "Name der Untergruppe" : "Ohne Überschrift (nur Trennlinie)"} onSave={(t) => patch(gi, { title: t })} />
              <button className="iconbtn" onClick={() => delGroup(gi)} aria-label="Gruppe löschen" title="Gruppe löschen">🗑</button>
            </div>
            <div className="areapick">
              <small className="muted">gehört zu</small>
              <select className="chip" value={g.parent || ""} disabled={hasKids(g)} title={hasKids(g) ? "Hat selbst Untergruppen" : ""} onChange={(e) => patch(gi, { parent: e.target.value || undefined, ...(e.target.value ? { area: groups.find((x) => x.id === e.target.value)?.area || g.area } : {}) })}>
                <option value="">– Hauptgruppe –</option>
                {groups.filter((x) => !x.parent && x.id !== g.id).map((x) => <option key={x.id} value={x.id}>{x.title || "Ohne Überschrift"}</option>)}
              </select>
              {!g.parent && <button className="chip" onClick={() => addSub(g)}>＋ Untergruppe</button>}
            </div>
            <div className="areapick">
              <small className="muted">zählt als</small>
              {Object.entries(AREAS).map(([k, [i, l]]) => <button key={k} className={g.area === k ? "on" : ""} onClick={() => patch(gi, { area: k })}>{i} {l}</button>)}
              <small className="muted grpn">{g.cats.length} {g.cats.length === 1 ? "Kategorie" : "Kategorien"}</small>
            </div></>}
            {!isG && g.cats.map((c, ci) => (
              <React.Fragment key={c}>
                {dnd.lineAt("dcat", g.id, ci) && <div className="dropline" />}
                <div className={"acccfg catrow" + (dnd.isDragging("dcat", g.id, ci) ? " dragging" : "")} data-dcat-item={`${g.id}|${ci}`}>
                  <Handle onDown={(e) => dnd.start(e, { kind: "dcat", list: g.id, index: ci, label: `${catMeta(c).icon} ${c}` })} />
                  <button className="ki catki" title="Symbol & Farbe" aria-label="Symbol & Farbe" style={{ background: catMeta(c).color + "22", color: catMeta(c).color }}
                    onClick={() => setStyleCat(styleCat === c ? null : c)}><CatGlyph c={c} /></button>
                  <EditText className="grow" inputClass="catname" value={c} validate={check(c)} onSave={(t) => t !== c && renameCategory(c, t)} />
                  <small className="muted cnt" title="Dokumente">{count(c)}</small>
                  {c !== "Sonstiges"
                    ? <button className="iconbtn" aria-label="Kategorie löschen" title="Kategorie löschen"
                        onClick={() => confirm(`Kategorie „${c}“ löschen?${count(c) ? ` ${count(c)} Dokument(e) wandern nach „Sonstiges“.` : ""}`) && deleteCategory(c)}>🗑</button>
                    : <span className="iconbtn-spacer" />}
                </div>
                {styleCat === c && <div className="catstylebox">
                  <CatStylePicker icon={catMeta(c).icon} color={catMeta(c).color} img={catMeta(c).img} onChange={(m) => setNav((n) => ({ ...n, catStyle: { ...(n.catStyle || {}), [c]: [m.icon, m.color, m.img] } }))} />
                  <div className="asfoot"><span className="aspreview"><span className="label" style={{ color: catMeta(c).color, background: catMeta(c).color + "1f" }}><CatGlyph c={c} /> {c}</span></span>
                    <button className="link" onClick={() => setNav((n) => { const cs = { ...(n.catStyle || {}) }; delete cs[c]; return { ...n, catStyle: cs }; })}>Standard</button>
                    <button className="btn sm" onClick={() => setStyleCat(null)}>Fertig</button></div>
                </div>}
              </React.Fragment>
            ))}
            {!isG && dnd.lineAt("dcat", g.id, g.cats.length) && <div className="dropline" />}
            {!isG && !g.cats.length && <div className="dropzone">Kategorie hierher ziehen</div>}
            {!isG && <div className="acccfg addcat">
              <span className="ki">＋</span>
              <EditText className="grow" value="" resetOnSave placeholder="Neue Kategorie, z. B. „KFZ“, „Haustier“" validate={check("")}
                onSave={(t) => patch(gi, { cats: [...g.cats, t] })} />
            </div>}
          </div>
        </React.Fragment>
      ))}
      {isG && dnd.lineAt("dgrp", "g", groups.length) && <div className="dropline" />}
      {isG && <div className="actions" data-dgrp-list={`g|${groups.length}`}>
        <button className="btn" onClick={addGroup}>＋ Gruppe</button>
        <button className="link" onClick={() => confirm("Dokument-Gruppen auf Standard zurücksetzen? (Kategorien bleiben erhalten)") && save(buildDocGroups(all))}>Zurücksetzen</button>
      </div>}
      {dnd.ghost}
    </SetSec>
  );
}

function NavSettings({ part, nav, setNav, accounts, setAccounts, txs, deleteAccount, notify }) {
  const [edit, setEdit] = useState(null);
  const [styleFor, setStyleFor] = useState(null);
  const resolved = resolveGroups(nav, accounts);
  const real = resolved.filter((g) => !g.auto);
  const saveGroups = (gs) => setNav((n) => ({ ...n, groups: gs.filter((g) => !g.auto).map(({ accounts: _a, ...g }) => ({ ...g, ids: g.ids })) }));
  const explicit = () => resolved.map((g) => ({ ...g, ids: g.accounts.map((a) => a.id) }));
  const [tabStyle, setTabStyle] = useState(null);
  const patchTab = (i, p) => setNav((n) => ({ ...n, tabs: n.tabs.map((t, k) => (k === i ? { ...t, ...p } : t)) }));
  const patchGroup = (gi, p) => saveGroups(explicit().map((g, k) => (k === gi ? { ...g, ...p } : g)));
  const delGroup = (gi) => { const g = explicit(); if (g[gi].accounts.length && !confirm("Gruppe löschen? Die Konten werden automatisch neu einsortiert.")) return; saveGroups(g.filter((_, k) => k !== gi)); };
  const addGroup = () => saveGroups([...explicit(), { id: "g-" + uid(), title: "Neue Gruppe", kinds: [], ids: [] }]);
  const dnd = useDnd((d, over) => {
    if (d.kind === "tab") setNav((n) => ({ ...n, tabs: moveBetween({ t: n.tabs }, "t", d.index, "t", over.index).t }));
    if (d.kind === "agrp") saveGroups(moveBetween({ g: explicit().filter((x) => !x.auto) }, "g", d.index, "g", over.index).g);
    if (d.kind === "acc") {
      const ex = explicit();
      const m = moveBetween(Object.fromEntries(ex.map((g) => [g.id, g.ids])), d.list, d.index, over.list, over.index);
      saveGroups(ex.map((g) => ({ ...g, ids: m[g.id] })));
    }
  });

  return (
    <>
      {part !== "accounts" && <SetSec id="nav-tabs" title="Seitenleiste">
        <p className="muted small">Am Griff <b>⠿</b> ziehen zum Sortieren. Auf das Symbol tippen für Symbol &amp; Textfarbe (auch eigenes Bild). „Leiste“ = Seitenleiste auf Tablet &amp; Mac, „Handy“ = untere Leiste am Phone (am besten max. 5). Linien und Überschriften gliedern die Seitenleiste.</p>
        <div data-tab-list={`t|${nav.tabs.length}`}>
          {nav.tabs.map((t, i) => (
            <React.Fragment key={t.key}>
              {dnd.lineAt("tab", "t", i) && <div className="dropline" />}
              {t.sep ? (
                <div className={"navcfg decocfg" + (dnd.isDragging("tab", "t", i) ? " dragging" : "")} data-tab-item={`t|${i}`}>
                  <Handle onDown={(e) => dnd.start(e, { kind: "tab", list: "t", index: i, label: "── Linie" })} />
                  <span className="sepline" /><small className="muted">Linie</small>
                  <button className="iconbtn" title="Entfernen" onClick={() => setNav((n) => ({ ...n, tabs: n.tabs.filter((x) => x.key !== t.key) }))}>🗑</button>
                </div>
              ) : t.head != null ? (
                <div className={"navcfg decocfg" + (dnd.isDragging("tab", "t", i) ? " dragging" : "")} data-tab-item={`t|${i}`}>
                  <Handle onDown={(e) => dnd.start(e, { kind: "tab", list: "t", index: i, label: "Überschrift " + t.head })} />
                  <small className="muted hdlbl">Überschrift</small>
                  <EditText className="grow" value={t.head} placeholder="z. B. Finanzen" onSave={(v) => patchTab(i, { head: v })} />
                  <button className="iconbtn" title="Entfernen" onClick={() => setNav((n) => ({ ...n, tabs: n.tabs.filter((x) => x.key !== t.key) }))}>🗑</button>
                </div>
              ) : (<>
                <div className={"navcfg" + (t.parent ? " childcfg" : "") + (dnd.isDragging("tab", "t", i) ? " dragging" : "")} data-tab-item={`t|${i}`}>
                  <Handle onDown={(e) => dnd.start(e, { kind: "tab", list: "t", index: i, label: `${TAB_DEFS[t.key]?.[0] || ""} ${tabLabel(nav, t.key)}` })} />
                  <button className="ki catki" title="Symbol & Textfarbe" style={t.color ? { background: t.color + "22" } : undefined} onClick={() => setTabStyle(tabStyle === t.key ? null : t.key)}><TabIcon t={t} /></button>
                  <EditText className="grow" value={t.label || ""} placeholder={TAB_DEFS[t.key]?.[1]} onSave={(v) => patchTab(i, { label: v })} />
                  {(() => { const fixed = t.key === "settings" || t.key === "home" || nav.tabs.some((c) => c.parent === t.key); return (
                  <select className="chip parentsel" title={fixed ? "Bleibt Hauptreiter (hat Unterreiter bzw. muss immer erreichbar sein)" : "Ebene"} disabled={fixed} value={fixed ? "" : t.parent || ""} onChange={(e) => patchTab(i, { parent: e.target.value || undefined })}>
                    <option value="">Hauptreiter</option>
                    {!fixed && nav.tabs.filter((p) => !isNavDeco(p) && p.key !== t.key && !p.parent).map((p) => <option key={p.key} value={p.key}>unter {tabLabel(nav, p.key)}</option>)}
                  </select>); })()}
                  <label className="mini"><input type="checkbox" checked={t.side} disabled={t.key === "settings"} onChange={(e) => patchTab(i, { side: e.target.checked })} />Leiste</label>
                  <label className="mini"><input type="checkbox" checked={t.phone} disabled={t.key === "settings"} onChange={(e) => patchTab(i, { phone: e.target.checked })} />Handy</label>
                </div>
                {tabStyle === t.key && <div className="catstylebox">
                  <CatStylePicker icon={t.icon || TAB_DEFS[t.key]?.[0]} color={t.color} img={t.iconImg} onChange={(m) => patchTab(i, { icon: m.icon, color: m.color, iconImg: m.img })} />
                  <div className="asfoot"><span className="aspreview"><span className="tabprev" style={t.color ? { color: t.color } : undefined}><TabIcon t={t} /> {tabLabel(nav, t.key)}</span></span>
                    <button className="link" onClick={() => patchTab(i, { icon: undefined, color: undefined, iconImg: undefined })}>Standard</button>
                    <button className="btn sm" onClick={() => setTabStyle(null)}>Fertig</button></div>
                </div>}
              </>)}
            </React.Fragment>
          ))}
          {dnd.lineAt("tab", "t", nav.tabs.length) && <div className="dropline" />}
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setNav((n) => ({ ...n, tabs: [...n.tabs, { key: "sep-" + uid(), sep: true }] }))}>＋ Linie</button>
          <button className="btn" onClick={() => setNav((n) => ({ ...n, tabs: [...n.tabs, { key: "head-" + uid(), head: "Neue Überschrift" }] }))}>＋ Überschrift</button>
        </div>
        <p className="muted small">Neue Linien/Überschriften landen unten – an den Griff ziehen, um sie zu platzieren. Handy-Leiste: {nav.tabs.filter((t) => t.phone).length} Reiter{nav.tabs.filter((t) => t.phone).length > 5 ? " – mehr als 5 werden am Phone eng" : ""}</p>
      </SetSec>}

      {part !== "tabs" && <SetSec id="nav-accounts" title="Konten & Gruppen">
        <label className="switchrow">
          <span><b>Auswahl-Kästchen in der Seitenleiste</b><small className="muted block">An = mehrere Konten ankreuzen und zusammenfassen. Aus = Konto antippen zeigt nur dieses Konto (nochmal antippen = alle).</small></span>
          <input type="checkbox" className="switch" checked={nav.showChecks !== false} onChange={(e) => setNav((n) => ({ ...n, showChecks: e.target.checked }))} />
        </label>
        <p className="muted small">Gruppen erscheinen unter „{tabLabel(nav, "accounts")}“ mit Überschrift und Trennlinie und lassen sich dort ein- und ausklappen. Konten und Gruppen am Griff <b>⠿</b> verschieben. Leere Überschrift = nur Trennlinie.</p>
        {resolved.map((g, gi) => (
          <React.Fragment key={g.id}>
            {!g.auto && dnd.lineAt("agrp", "g", gi) && <div className="dropline" />}
            <div className={"grpcfg" + (dnd.isDragging("agrp", "g", gi) ? " dragging" : "") + (dnd.drag?.kind === "acc" && dnd.drag.over?.list === g.id ? " dropover" : "")}
              {...(g.auto ? {} : { "data-agrp-item": `g|${gi}`, "data-acc-list": `${g.id}|${g.accounts.length}` })}>
              <div className="grphead">
                {g.auto ? <b className="grow">{g.title} <small className="muted">(automatisch – in eine Gruppe ziehen)</small></b> : <>
                  <Handle onDown={(e) => dnd.start(e, { kind: "agrp", list: "g", index: gi, label: `📁 ${g.title || "Gruppe"}` })} label="Gruppe verschieben" />
                  <EditText className="grow" inputClass="grptitle" value={g.title || ""} placeholder="Ohne Überschrift (nur Trennlinie)" onSave={(t) => patchGroup(gi, { title: t })} />
                  <button className="iconbtn" onClick={() => delGroup(gi)} aria-label="Gruppe löschen" title="Gruppe löschen">🗑</button>
                </>}
              </div>
              {g.accounts.map((a, ai) => {
                const bal = accountBalance(a, txs);
                return (
                  <React.Fragment key={a.id}>
                    {!g.auto && dnd.lineAt("acc", g.id, ai) && <div className="dropline" />}
                    <div className={"acccfg accrow" + (dnd.isDragging("acc", g.id, ai) ? " dragging" : "")} {...(g.auto ? {} : { "data-acc-item": `${g.id}|${ai}` })}>
                      <Handle onDown={(e) => dnd.start(e, { kind: "acc", list: g.id, index: ai, label: `${kindIcon(a.kind)} ${a.name}` })} />
                      <button className="iconbtn acciconbtn" onClick={() => setStyleFor(styleFor === a.id ? null : a.id)} title="Symbol & Farbe"><AccIcon a={a} force /></button>
                      <button className="link grow left" onClick={() => setEdit(a)}><span style={accStyle(a)}>{a.name}</span>{bal != null && <small className="muted"> · {fmtMoney(bal)}</small>}</button>
                      <button className={"iconbtn" + (styleFor === a.id ? " on" : "")} onClick={() => setStyleFor(styleFor === a.id ? null : a.id)} aria-label="Symbol und Farbe" title="Symbol & Farbe">🎨</button>
                      <button className="iconbtn" onClick={() => setEdit(a)} aria-label="Konto bearbeiten" title="Bearbeiten">✎</button>
                    </div>
                    {styleFor === a.id && <AccStyleEditor a={a} lib={nav.accIcons || []} setLib={(l) => setNav((n) => ({ ...n, accIcons: l }))} onClose={() => setStyleFor(null)} onChange={(n) => setAccounts((l) => l.map((x) => (x.id === a.id ? n : x)))} />}
                  </React.Fragment>
                );
              })}
              {!g.auto && dnd.lineAt("acc", g.id, g.accounts.length) && <div className="dropline" />}
              {!g.accounts.length && <div className="dropzone">Konto hierher ziehen</div>}
            </div>
          </React.Fragment>
        ))}
        {dnd.lineAt("agrp", "g", real.length) && <div className="dropline" />}
        <div className="actions" data-agrp-list={`g|${real.length}`}>
          <button className="btn" onClick={addGroup}>＋ Gruppe / Überschrift</button>
          <button className="btn" onClick={() => setEdit("new")}>＋ Konto anlegen</button>
          <button className="link" onClick={() => confirm("Seitenleiste auf Standard zurücksetzen?") && setNav((n) => ({ ...DEFAULT_NAV, docGroups: n.docGroups }))}>Zurücksetzen</button>
        </div>
        {dnd.ghost}
      </SetSec>}

      {part !== "tabs" && edit && (
        <AccountSheet init={edit === "new" ? null : edit} hasAtmAccount={accounts.some((a) => a.atm && a.id !== edit?.id)} txs={txs}
          onClose={() => setEdit(null)}
          onDelete={edit !== "new" ? () => { if (confirm(`Konto „${edit.name}“ samt Umsätzen löschen?`)) { deleteAccount(edit.id); setEdit(null); } } : null}
          onSave={(a) => {
            setAccounts((l) => (l.some((x) => x.id === a.id) ? l.map((x) => (x.id === a.id ? a : x)) : [...l, a]));
            setEdit(null); notify(edit === "new" ? `Konto „${a.name}“ angelegt` : "Konto gespeichert");
          }} />
      )}
    </>
  );
}

/* ---------- Freischwebende Fenster (ab Tablet) ---------- */
function useMedia(q) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q), h = () => setM(mq.matches); mq.addEventListener("change", h); return () => mq.removeEventListener("change", h); }, [q]);
  return m;
}
let winZ = 60; // zuletzt angeklicktes Fenster liegt oben
function clampRect(r) {
  const W = window.innerWidth, H = window.innerHeight;
  const w = Math.min(Math.max(320, r.w), W - 16), h = Math.min(Math.max(240, r.h), H - 16);
  // horizontal darf ein Teil aus dem Bild ragen, vertikal bleibt das Fenster ganz sichtbar (Ecke greifbar)
  return { w, h, x: Math.min(Math.max(-(w - 140), r.x), W - 140), y: Math.min(Math.max(0, r.y), Math.max(0, H - h - 8)) };
}
function defaultRect(defW, small) {
  const W = window.innerWidth, H = window.innerHeight;
  if (small) { const w = Math.min(defW || 520, W - 48), h = Math.min(680, H - 64); return { w, h, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) }; }
  const w = Math.min(defW || 580, W - 48);
  return { w, h: H - 48, x: W - w - 24, y: 24 };
}
const WinCtx = React.createContext(null);
/* Hintergrund sperren, solange ein Fenster offen ist (iOS: body fixieren, Scrollposition merken) */
let lockCount = 0, lockY = 0;
function useScrollLock() {
  useEffect(() => {
    const html = document.documentElement, b = document.body;
    if (lockCount++ === 0) {
      lockY = window.scrollY;
      html.classList.add("win-open");
      b.style.position = "fixed"; b.style.top = `-${lockY}px`; b.style.left = "0"; b.style.right = "0"; b.style.width = "100%";
    }
    return () => {
      if (--lockCount === 0) {
        html.classList.remove("win-open");
        b.style.position = b.style.top = b.style.left = b.style.right = b.style.width = "";
        window.scrollTo(0, lockY);
      }
    };
  }, []);
}
const XBtn = () => { const close = React.useContext(WinCtx); return <button className="xbtn" onClick={() => close?.()} aria-label="Schließen" title="Schließen">✕</button>; };
/* Schwebendes Fenster. Klick daneben / Esc / ✕ schließt – bei ungespeicherten Änderungen wird erst nachgefragt.
   dirty: true/false erzwingt, undefined = automatisch (sobald im Fenster etwas eingegeben wurde) */
function Win({ id, onClose, children, className = "", defW, small = false, center = false, dirty, saveLabel = "Speichern" }) {
  const wide = useMedia("(min-width:768px)");
  useEdgeBack(() => reqRef.current?.(), !wide);
  useScrollLock();
  const rootRef = useRef(null);
  const [touched, setTouched] = useState(false);
  const [ask, setAsk] = useState(false);
  const isDirty = dirty ?? touched;
  const dirtyRef = useRef(isDirty); dirtyRef.current = isDirty;
  const requestClose = () => { if (dirtyRef.current) setAsk(true); else onClose(); };
  const reqRef = useRef(requestClose); reqRef.current = requestClose;
  const zRef = useRef(0);
  useEffect(() => {
    let block = false;
    const down = (e) => {
      const el = rootRef.current; if (!el || el.contains(e.target)) return;
      if (e.target.closest?.(".win,.sheet,.topactions,.fabmenu,.fabmenu-bg,.toast,.dndghost,.sharepop,.sidetip")) return;
      if (dirtyRef.current) block = true; // Klick nicht weiterreichen, sonst gehen Eingaben verloren
      reqRef.current();
    };
    const click = (e) => { if (block) { block = false; e.stopPropagation(); e.preventDefault(); } };
    const key = (e) => { if (e.key === "Escape" && zRef.current === winZ) { e.stopPropagation(); if (ask) setAsk(false); else reqRef.current(); } };
    document.addEventListener("pointerdown", down, true); document.addEventListener("click", click, true); window.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("click", click, true); window.removeEventListener("keydown", key); };
  }, [ask]);
  const doSave = () => {
    const btn = [...(rootRef.current?.querySelectorAll(".btn.primary") || [])].find((b) => !b.disabled && !b.closest(".winguard"));
    btn?.click(); setAsk(false); setTimeout(() => onClose(), 0);
  };
  const canSave = () => [...(rootRef.current?.querySelectorAll(".btn.primary") || [])].some((b) => !b.disabled && !b.closest(".winguard"));
  const guard = ask && (
    <div className="winguard" role="alertdialog" aria-label="Ungespeicherte Änderungen">
      <b>Ungespeicherte Änderungen</b>
      <span className="grow" />
      {canSave() && <button className="btn primary sm" onClick={doSave}>{saveLabel}</button>}
      <button className="btn sm danger" onClick={() => { setAsk(false); onClose(); }}>Verwerfen</button>
      <button className="btn sm" onClick={() => setAsk(false)}>Weiter bearbeiten</button>
    </div>
  );
  // Ereignisse aus eingebetteten (per Portal geöffneten) Fenstern ignorieren
  const own = (e) => (e.target.closest?.(".win,.sheet .panel") || null) === e.currentTarget || e.currentTarget.contains?.(e.target);
  const touchProps = { onInput: (e) => own(e) && setTouched(true), onChange: (e) => own(e) && setTouched(true) };
  const [rect, setRect] = useState(() => {
    const r = ls.get("win:" + id, null) || defaultRect(defW, small);
    // center: gemerkte Größe, aber immer mittig öffnen
    return clampRect(center ? { ...r, x: Math.round((innerWidth - r.w) / 2), y: Math.max(16, Math.round((innerHeight - r.h) / 2)) } : r);
  });
  const [z, setZ] = useState(() => ++winZ);
  zRef.current = z;
  useEffect(() => { const t = setTimeout(() => ls.set("win:" + id, rect), 150); return () => clearTimeout(t); }, [rect, id]);
  useEffect(() => { const h = () => setRect((r) => clampRect(r)); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);

  if (!wide) return (
    <WinCtx.Provider value={requestClose}>
    <div className={"sheet " + className} onClick={requestClose}>
      <div ref={rootRef} className={"panel" + (small ? " small-panel" : "")} onClick={(e) => e.stopPropagation()} {...touchProps}>{guard}{children}</div>
    </div>
    </WinCtx.Provider>
  );

  // Ziehen am Fensterkopf bzw. an Rändern/Ecken (Maus & Touch)
  const track = (e, apply) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, start = { ...rect };
    document.body.classList.add("win-moving");
    const mv = (ev) => setRect(clampRect(apply(start, ev.clientX - sx, ev.clientY - sy)));
    const up = () => { document.body.classList.remove("win-moving"); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };
  const onHead = (e) => {
    if (!e.currentTarget.contains(e.target)) return;
    setZ(++winZ);
    if (!e.target.closest(".panelhead") || e.target.closest("button,input,select,a,textarea,label")) return;
    track(e, (s, dx, dy) => ({ ...s, x: s.x + dx, y: s.y + dy }));
  };
  const edge = (dir) => (e) => {
    e.stopPropagation();
    track(e, (s, dx, dy) => {
      const r = { ...s };
      if (dir.includes("e")) r.w = s.w + dx;
      if (dir.includes("s")) r.h = s.h + dy;
      if (dir.includes("w")) { r.w = s.w - dx; r.x = s.x + dx; }
      if (dir.includes("n")) { r.h = s.h - dy; r.y = s.y + dy; }
      return r;
    });
  };
  return (
    <WinCtx.Provider value={requestClose}>
    <div ref={rootRef} className={"win " + className} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z }} onPointerDown={onHead} {...touchProps}>
      <div className="wininner">{guard}{children}</div>
      {["n", "e", "s", "w", "ne", "se", "sw", "nw"].map((d) => <span key={d} className={"rz rz-" + d} onPointerDown={edge(d)} />)}
      <span className="rzgrip" aria-hidden="true" />
    </div>
    </WinCtx.Provider>
  );
}

/* Seitenleiste in der Breite ziehbar (Breite wird gemerkt) */
function SideResizer() {
  useEffect(() => { const w = ls.get("sideW", null); if (w) document.documentElement.style.setProperty("--side", w + "px"); }, []);
  const down = (e) => {
    e.preventDefault();
    document.body.classList.add("win-moving");
    const mv = (ev) => {
      const w = Math.min(420, Math.max(180, Math.round(ev.clientX)));
      document.documentElement.style.setProperty("--side", w + "px"); ls.set("sideW", w);
    };
    const up = () => { document.body.classList.remove("win-moving"); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const reset = () => { document.documentElement.style.removeProperty("--side"); ls.set("sideW", null); };
  return <div className="sideresize" onPointerDown={down} onDoubleClick={reset} title="Ziehen = Breite ändern · Doppelklick = Standard" />;
}

function AccountTree({ onToggleChecks, onAll, showChecks = true, groups, txs, sel = [], onToggle, onOnly, onGroupSel, onHide, onToggleGroup, hidden = [], onUnhide, variant = "" }) {
  const shown = groups.filter((g) => g.accounts.length);
  if (!shown.length && !hidden.length) return null;
  const Box = ({ state, onClick, label }) => !showChecks ? null : (
    <button className={"cbox" + (state ? " on" : "")} onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={label} aria-pressed={state === "all"}>
      {state === "all" ? "✓" : state === "some" ? "–" : ""}
    </button>
  );
  return (
    <div className={"acctree " + variant}>
      {onToggleChecks && (
        <button className={"selmode" + (showChecks ? " on" : "")} onClick={onToggleChecks} title={showChecks ? "Mehrfachauswahl ausschalten" : "Mehrfachauswahl einschalten"} aria-pressed={showChecks}>
          <span className="cbox">{showChecks ? "✓" : ""}</span>Mehrfachauswahl
        </button>
      )}
      {shown.map((g, gi) => {
        const ids = g.accounts.map((a) => a.id), n = ids.filter((id) => sel.includes(id)).length;
        return (
          <div key={g.id} className="accgroup">
            {gi > 0 && <div className="accdiv" />}
            {g.title?.trim() && (
              <div className="acctitle">
                <Box state={n === ids.length ? "all" : n ? "some" : ""} onClick={() => onGroupSel(ids, n !== ids.length)} label={`Gruppe „${g.title}“ auswählen`} />
                <button className="acctoggle" onClick={() => onToggleGroup(g.id)} aria-expanded={!g.collapsed}>
                  <span className="grow">{g.title}</span>{g.collapsed && <small>{g.accounts.length}</small>}<span className={"chev" + (g.collapsed ? "" : " open")}>›</span>
                </button>
              </div>
            )}
            {!g.collapsed && g.accounts.map((a) => {
              const bal = accountBalance(a, txs), on = sel.includes(a.id) && (showChecks || sel.length < groups.reduce((t, g) => t + g.accounts.length, 0));
              return (
                <div key={a.id} className={"accitem" + (on ? " on" : "")}>
                  <Box state={on ? "all" : ""} onClick={() => onToggle(a.id)} label={`${a.name} auswählen`} />
                  <button className="aname" onClick={() => (showChecks ? onOnly(a.id) : sel.length === 1 && sel[0] === a.id && onAll ? onAll() : onOnly(a.id))} title={`Nur ${a.name} anzeigen`}>
                    <AccIcon a={a} /><span className="an" style={accStyle(a)}>{a.name}</span>
                  </button>
                  {bal != null ? <span className={"ab " + (bal < 0 ? "neg" : "pos")} title={balEstimated(a) ? "Aus Umsätzen berechnet – für den genauen Stand Kontostand eintragen oder Import mit Saldo-Spalte" : undefined}>{fmtMoney(bal)}</span>
                    : <span className="ab muted" title="Kontostand unbekannt">—</span>}
                  <button className="aeye" onClick={() => onHide(a.id)} title={`${a.name} ausblenden`} aria-label={`${a.name} ausblenden`}><IcoEye /></button>
                </div>
              );
            })}
          </div>
        );
      })}
      {!!hidden.length && (
        <div className="acchidden">
          <div className="acctitle muted"><span className="grow">Ausgeblendet ({hidden.length})</span></div>
          {hidden.map((a) => (
            <div key={a.id} className="accitem hid">
              <AccIcon a={a} /><span className="an">{a.name}</span>
              <button className="unhide" onClick={() => onUnhide(a.id)}>Einblenden</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Konten-Auswahl (Chip „Alle Konten“): Mehrfachauswahl mit Schnellwahl */
function AccountPicker({ groups, txs, sel, onApply, onClose }) {
  const all = groups.flatMap((g) => g.accounts);
  const [s, setS] = useState(sel.length ? sel : all.map((a) => a.id));
  const bal = (a) => accountBalance(a, txs);
  const total = all.filter((a) => s.includes(a.id)).reduce((t, a) => t + (bal(a) || 0), 0);
  const tog = (id) => setS((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  return (
    <Win id="accpick" onClose={onClose} small dirty={[...s].sort().join() !== [...(sel.length ? sel : all.map((a) => a.id))].sort().join()} saveLabel="Übernehmen">
      <div className="panelhead"><b>Konten auswählen</b><small className="muted">{s.length} von {all.length}</small>
        <XBtn /></div>
      <div className="quickpick">
        <button onClick={() => setS(all.map((a) => a.id))}>Alle</button>
        <button onClick={() => setS([])}>Keine</button>
        <button onClick={() => setS(all.filter((a) => (bal(a) || 0) > 0).map((a) => a.id))}>Nur Guthaben</button>
        <button onClick={() => setS(all.filter((a) => (bal(a) || 0) < 0).map((a) => a.id))}>Nur Schulden</button>
      </div>
      <div className="picklist">
        {groups.filter((g) => g.accounts.length).map((g) => {
          const ids = g.accounts.map((a) => a.id), n = ids.filter((id) => s.includes(id)).length;
          return (
            <div key={g.id}>
              <button className="pickgroup" onClick={() => setS((x) => (n === ids.length ? x.filter((y) => !ids.includes(y)) : [...new Set([...x, ...ids])]))}>
                <span className={"cbox" + (n ? " on" : "")}>{n === ids.length ? "✓" : n ? "–" : ""}</span>
                <span className="grow">{g.title?.trim() || "Konten"}</span>
                <small>{fmtMoney(g.accounts.reduce((t, a) => t + (bal(a) || 0), 0))}</small>
              </button>
              {g.accounts.map((a) => (
                <button key={a.id} className="pickitem" onClick={() => tog(a.id)}>
                  <span className={"cbox" + (s.includes(a.id) ? " on" : "")}>{s.includes(a.id) ? "✓" : ""}</span>
                  <AccIcon a={a} className="acci" /><span className="grow" style={accStyle(a)}>{a.name}</span>
                  <b className={(bal(a) || 0) < 0 ? "neg" : "pos"}>{bal(a) != null ? fmtMoney(bal(a)) : "—"}</b>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="pickfoot">
        <span className="grow muted small">Summe Auswahl</span>
        <b className={total < 0 ? "neg" : "pos"}>{fmtMoney(total)}</b>
        <button className="btn primary" disabled={!s.length} onClick={() => onApply(s.length === all.length ? [] : s)}>Übernehmen</button>
      </div>
    </Win>
  );
}

/* ---------- Einstellungen: Seitenleiste & Kontengruppen ---------- */
/* ============================================================ */

/* ======================= App-Sperre (optional, Standard: aus) ======================= */
// Passwort wird nie gespeichert – nur ein PBKDF2-SHA-256-Hash mit zufälligem Salt (localStorage „appLock“)
async function lockHash(pw, saltB64, iter = 200000) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, key, 256));
  const b64 = (u) => btoa(String.fromCharCode(...u));
  return { salt: b64(salt), hash: b64(bits), iter };
}
async function lockCheck(pw) {
  const l = ls.get("appLock", null); if (!l) return true;
  const h = await lockHash(pw, l.salt, l.iter); return h.hash === l.hash;
}
const lockActive = () => !!ls.get("appLock", null);
function LockScreen({ onUnlock }) {
  const [pw, setPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const go = async (e) => {
    e?.preventDefault(); if (!pw || busy) return; setBusy(true);
    if (await lockCheck(pw)) { try { sessionStorage.setItem("findocuUnlocked", "1"); } catch {} onUnlock(); }
    else { setErr("Falsches Passwort"); setPw(""); }
    setBusy(false);
  };
  return (
    <div className="lockscreen">
      <form className="lockbox" onSubmit={go}>
        <img src="/icon.svg" alt="" className="lockicon" />
        <h1>FinDocu</h1>
        <p className="muted">Finanzen &amp; Dokumente · gesperrt</p>
        <input type="password" autoFocus autoComplete="current-password" placeholder="Passwort" value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} className={err ? "shake" : ""} />
        {err && <small className="red block">{err}</small>}
        <button className="btn primary big" disabled={!pw || busy}>{busy ? "Prüfe …" : "Entsperren"}</button>
      </form>
    </div>
  );
}
export default function App() {
  const [unlocked, setUnlocked] = useState(() => { try { return !lockActive() || sessionStorage.getItem("findocuUnlocked") === "1"; } catch { return !lockActive(); } });
  useEffect(() => { const h = () => setUnlocked(false); window.addEventListener("findocu-lock", h); return () => window.removeEventListener("findocu-lock", h); }, []);
  if (!unlocked) { applyTheme(effectiveTheme(ls.get("theme", "auto"))); return <><style>{CSS}</style><LockScreen onUnlock={() => setUnlocked(true)} /></>; }
  return <AppMain />;
}
function AppMain() {
  const [docs, setDocs] = useState([]);
  const [tab, setTab] = useState("home");
  const [openId, setOpenId] = useState(null);
  const [docCat, setDocCat] = useState("");
  const [budgets, setBudgets] = useState(() => ls.get("budgets", {}));
  const [me, setMe] = useState(() => ls.get("me", { name: "", address: "", city: "" }));
  const [token, setToken] = useState(() => ls.get("appToken", ""));
  const [toast, setToast] = useState("");
  const [txs, setTxsState] = useState([]);
  const txsRef = useRef([]);
  const docsRef = useRef([]); docsRef.current = docs;
  const pendingLink = useRef(null);
  const setTxs = (v) => setTxsState((prev) => { const n = typeof v === "function" ? v(prev) : v; txsRef.current = n; return n; });
  const [accounts, setAccountsState] = useState(() => ls.get("accounts", []));
  const accountsRef = useRef(accounts);
  const setAccounts = (v) => setAccountsState((prev) => { const n = typeof v === "function" ? v(prev) : v; accountsRef.current = n; return n; });
  const [scanOpen, setScanOpen] = useState(false);
  const [nav, setNav] = useState(loadNav);
  const categories = useMemo(() => flattenCats(nav.docGroups), [nav.docGroups]);
  CAT_AREA = Object.fromEntries(nav.docGroups.flatMap((g) => g.cats.map((c) => [c, g.area])));
  CAT_STYLE = nav.catStyle || {};
  useEffect(() => ls.set("categories", categories), [categories]);
  const setCategories = (list) => setNav((n) => ({ ...n, docGroups: buildDocGroups(list) }));
  // neue Kategorie ohne die eigenen Gruppen zu verlieren: in die erste Finanzen-Gruppe
  const addCategory = (name) => setNav((n) => {
    if (n.docGroups.some((g) => g.cats.includes(name))) return n;
    let done = false;
    const docGroups = n.docGroups.map((g) => (!done && g.area === "finanzen" ? ((done = true), { ...g, cats: [...g.cats, name] }) : g));
    return { ...n, docGroups: done ? docGroups : [...docGroups, { id: "d-" + uid(), title: "Weitere", area: "finanzen", cats: [name] }] };
  });
  const addCategoryEx = (name, gid, st) => setNav((n) => {
    if (n.docGroups.some((g) => g.cats.includes(name))) return n;
    const has = n.docGroups.some((g) => g.id === gid);
    const docGroups = n.docGroups.map((g, i) => ((has ? g.id === gid : i === 0) ? { ...g, cats: [...g.cats, name] } : g));
    return { ...n, docGroups, catStyle: st ? { ...(n.catStyle || {}), [name]: [st.icon, st.color, st.img] } : n.catStyle };
  });
  const toggleDocGroup = (id) => setNav((n) => ({ ...n, docGroups: n.docGroups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)) }));
  const [selAccs, setSelAccsRaw] = useState(() => ls.get("selAccs", []));
  const setSelAccs = (v) => setSelAccsRaw((cur) => { const n = typeof v === "function" ? v(cur) : v; ls.set("selAccs", n); return n; });
  const [docAreaSel, setDocAreaSel] = useState(() => ls.get("docArea", "alle"));
  const [manualTx, setManualTx] = useState(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(() => ls.get("hideAmounts", false));
  const [themeMode, setThemeMode] = useState(() => ls.get("theme", "auto"));
  const [theme, setTheme] = useState(() => effectiveTheme(ls.get("theme", "auto")));
  const [newAccReq, setNewAccReq] = useState(false);
  const [homeEdit, setHomeEdit] = useState(false);
  const [boardEdit, setBoardEdit] = useState(null);
  const [calSync, setCalSyncRaw] = useState(() => ls.get("calSync", { on: false, key: "", at: "" }));
  const setCalSync = (v) => { ls.set("calSync", v); setCalSyncRaw(v); };
  const [design, setDesignRaw] = useState(() => ls.get("design", { preset: "fido" }));
  const setDesign = (d) => { ls.set("design", d); setDesignRaw(d); };
  useEffect(() => applyDesign(design, theme), [design, theme]);
  useEffect(() => {
    ls.set("theme", themeMode);
    const upd = () => setTheme(effectiveTheme(themeMode)); upd();
    const mq = matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener?.("change", upd);
    const iv = setInterval(upd, 60000);
    return () => { mq.removeEventListener?.("change", upd); clearInterval(iv); };
  }, [themeMode]);
  useEffect(() => applyTheme(theme), [theme]);
  HIDE_AMOUNTS = hideAmounts;
  useEffect(() => ls.set("hideAmounts", hideAmounts), [hideAmounts]);
  useEffect(() => {
    if (!fabOpen) return;
    const h = (e) => e.key === "Escape" && setFabOpen(false);
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [fabOpen]);
  const [rules, setRules] = useState(() => ls.get("rules", []));
  const [subs, setSubs] = useState(() => ls.get("subs", { confirmed: [], dismissed: [] }));
  const fileInput = useRef();
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    (async () => {
      const all = await db.allDocs();
      const cutoff = Date.now() - TRASH_DAYS * 864e5;
      for (const d of all.filter((d) => d.deletedAt && new Date(d.deletedAt).getTime() < cutoff)) { await db.delDoc(d.id); await db.delFile(d.id); }
      const kept = all.filter((d) => !(d.deletedAt && new Date(d.deletedAt).getTime() < cutoff))
        .map((x) => (x.status === "processing" ? { ...x, status: "error", error: "Abgebrochen" } : x));
      setDocs(kept);
      // Vorschaubilder für ältere Dokumente nachziehen
      for (const d of kept.filter((d) => !d.thumb)) {
        try {
          const b = await db.getFile(d.id); if (!b) continue;
          const thumb = await makeThumb(b);
          const nd = { ...d, thumb }; await db.putDoc(nd);
          setDocs((p) => p.map((x) => (x.id === d.id ? { ...x, thumb } : x)));
        } catch {}
      }
    })();
    navigator.storage?.persist?.();
  }, []);

  useEffect(() => ls.set("budgets", budgets), [budgets]);
  useEffect(() => ls.set("me", me), [me]);
  useEffect(() => ls.set("appToken", token), [token]);
  useEffect(() => ls.set("accounts", accounts), [accounts]);
  useEffect(() => ls.set("rules", rules), [rules]);
  useEffect(() => ls.set("subs", subs), [subs]);
  useEffect(() => ls.set("nav", nav), [nav]);
  useEffect(() => ls.set("docArea", docAreaSel), [docAreaSel]);
  useEffect(() => { db.allTx().then(setTxs); }, []);

  const notify = (m) => { setToast(m); setTimeout(() => setToast(""), 3000); };
  const active = useMemo(() => docs.filter((d) => !d.deletedAt), [docs]);
  const recurring = useMemo(() => detectRecurring(txs), [txs]);
  const confirmedSubs = useMemo(() => recurring.filter((r) => subs.confirmed.includes(r.key) &&
    !activeContracts(active).some((d) => norm(d.contract.provider).split(" ")[0] && r.key.includes(norm(d.contract.provider).split(" ")[0]))), [recurring, subs, active]);
  const fixExtra = confirmedSubs.filter((r) => !subInactive(r, subs)).reduce((s, r) => s + r.amount * (INTERVAL_FACTOR[r.interval] || 0), 0);

  // Umsätze importieren: IDs (Dubletten-Schutz), Kategorien, Abgleich mit Rechnungen
  async function importTxs(accountId, list, ownIbans, meta) {
    const stamp = new Date().toISOString();
    const own = ownIbans || accounts.map((a) => a.iban).filter(Boolean);
    const current = txsRef.current;
    const existing = new Set(current.map((t) => t.id));
    const withMeta = withIds(list, accountId).map((t) => ({ ...t, category: categorize(t, rules, own), importedAt: stamp }));
    // Kontostand aus der Datei (Schlusssaldo/Saldo-Spalte) übernehmen, wenn er neuer ist als der bekannte
    const lb = latestBalance(list, meta);
    if (lb) setAccounts((l) => l.map((a) => (a.id === accountId && a.kind !== "cash" && (!a.openingDate || lb.date >= a.openingDate)
      ? { ...a, opening: lb.amount, openingDate: lb.date, openingAt: stamp } : a)));
    const fresh = withMeta.filter((t) => !existing.has(t.id));
    let all = [...current, ...fresh];
    const links = matchInvoices(active, all);
    const linkMap = Object.fromEntries(links.map((l) => [l.txId, l.docId]));
    all = all.map((t) => (linkMap[t.id] ? { ...t, docId: linkMap[t.id] } : t));
    await db.putTxs(all.filter((t) => fresh.includes(t) || linkMap[t.id]));
    txsRef.current = all; setTxs(all);
    for (const l of links) {
      const d = active.find((x) => x.id === l.docId);
      if (d) await saveDoc({ ...d, paid: true, paidDate: l.date, deadlines: (d.deadlines || []).map((x) => (/zahl|fällig/i.test(x.label) ? { ...x, done: true } : x)) });
    }
    return { added: fresh.length, dupes: withMeta.length - fresh.length, matched: links.length };
  }
  async function updateTx(t, applyRule) {
    let list = txs.map((x) => (x.id === t.id ? t : x));
    if (applyRule && t.counterparty) {
      const match = t.counterparty.toLowerCase();
      setRules((r) => [{ match, category: t.category }, ...r.filter((x) => x.match !== match)]);
      list = list.map((x) => (x.counterparty?.toLowerCase().includes(match) && x.category !== t.category ? { ...x, orig: x.orig || { category: x.category }, category: t.category } : x));
    }
    setTxs(list); await db.putTxs(list.filter((x) => x.id === t.id || (applyRule && x.counterparty?.toLowerCase().includes(t.counterparty.toLowerCase()))));
  }
  // Manuelle Änderungen eines Empfängers zurücksetzen (Buchungsdetail)
  async function resetCp(key, counterparty) {
    const cur = txsRef.current;
    const list = cur.map((x) => (x.orig && counterpartyKey(x) === key ? (({ orig, preTransferCat, ...rest }) => ({ ...rest, ...orig }))(x) : x));
    const changed = list.filter((x, i) => x !== cur[i]);
    const m = (counterparty || "").toLowerCase();
    if (m) setRules((r) => r.filter((x) => !(x.match === m || m.includes(x.match) && x.match.length > 3)));
    setTxs(list); if (changed.length) await db.putTxs(changed);
    notify?.(changed.length ? `${changed.length} Buchung${changed.length === 1 ? "" : "en"} zurückgesetzt` : "Keine manuellen Änderungen gefunden");
  }
  // Beleg ↔ Buchung verknüpfen (docId leer = lösen)
  async function linkTx(txId, docId) {
    const cur = txsRef.current;
    const list = cur.map((x) => (x.id === txId ? { ...x, docId: docId || undefined } : docId && x.docId === docId ? { ...x, docId: undefined } : x));
    const changed = list.filter((x, i) => x !== cur[i]);
    setTxs(list); await db.putTxs(changed);
    const t = list.find((x) => x.id === txId);
    setDocs((prev) => prev.map((d) => {
      if (docId && d.id === docId && d.direction !== "einnahme" && !d.paid) { const n = { ...d, paid: true, paidDate: t?.date }; db.putDoc(n); return n; }
      return d;
    }));
  }
  const [shareData, setShareData] = useState(null);
  const [pdfView, setPdfView] = useState(null);
  pdfUi = setPdfView;
  const impRef = useRef(null), vcfApp = useRef(null);
  const [sideMini, setSideMiniRaw] = useState(() => ls.get("sideMini", false));
  const [sideTip, setSideTip] = useState(null);
  const setSideMini = (v) => { setSideMiniRaw(v); ls.set("sideMini", v); };
  useEffect(() => { document.documentElement.classList.toggle("side-mini", !!sideMini); }, [sideMini]);
  // Design „Finanz-App-Stil“ ist Standard auf allen Geräten
  useEffect(() => { const c = document.documentElement.classList; c.add("ios", "fg"); }, []);
  useEffect(() => {
    const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); setSideMiniRaw((v) => { ls.set("sideMini", !v); return !v; }); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  const [bizReq, setBizReq] = useState(0);
  const [upl, setUpl] = useState(null), [accBusy, setAccBusy] = useState(null), [ctBusy, setCtBusy] = useState(null);
  const docPeak = useRef(0);
  const [uniLast, setUniLast] = useState("");
  const appQ = useRef({ files: [], i: 0, contacts: null, running: false });
  const uniFiles = useRef({});
  const enqueueStmt = (f) => { const q = appQ.current; q.files.push(f); if (!q.running) { q.running = true; nextAppImp(); } else setAccBusy((b) => b && { ...b, total: q.files.length, n: q.files.length - q.i + 1 }); };
  const STMT_RE = /\.(csv|txt|tsv|xml|sta|mt940|940|ofx|qfx|qif|json|xlsx|xlsm|xls)$/i;
  const nextAppImp = async () => {
    const q = appQ.current;
    if (q.i < q.files.length) {
      const f = q.files[q.i++];
      setAccBusy({ title: `Kontoauszug ${q.i} von ${q.files.length} wird importiert …`, sub: f.name, done: q.i - 1, total: q.files.length, n: q.files.length - q.i + 1 });
      try { setImp({ file: f, result: await parseFile(f, ls.get("mappings", {})), uni: true, autoAi: f.__ai }); } catch (e) { notify(`${f.name}: nicht lesbar (${e.message})`); nextAppImp(); }
      return;
    }
    setAccBusy(null);
    const c = q.contacts; appQ.current = { files: [], i: 0, contacts: null, running: false };
    if (c?.length) { ls.set("pendingContactImport", c); setTab("kunden"); setBizReq((n) => n + 1); }
  };
  async function smartImport(list) {
    const docs = [], stmts = [], vcf = [], skip = [];
    for (const f of list) {
      if (f.name.startsWith(".")) continue;
      if (/\.vcf$/i.test(f.name) || /vcard/i.test(f.type)) vcf.push(f);
      else if (STMT_RE.test(f.name)) stmts.push(f);
      else if (/\.pdf$/i.test(f.name) || /pdf$/i.test(f.type) || /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name))
        (/(konto|auszug|umsatz|umsätze|statement|camt|depot)/i.test(f.name) ? (f.__ai = true, stmts) : docs).push(f);
      else skip.push(f);
    }
    let contacts = [];
    for (const f of vcf) { try { contacts = contacts.concat(parseVcf(await f.text())); } catch {} }
    const parts = [docs.length && `${docs.length} Dokument${docs.length === 1 ? "" : "e"}`, stmts.length && `${stmts.length} Kontoauszug${stmts.length === 1 ? "" : "/-auszüge"}`,
      contacts.length && `${contacts.length} Kontakt${contacts.length === 1 ? "" : "e"}`, skip.length && `${skip.length} übersprungen`].filter(Boolean);
    const msg = parts.length ? "Erkannt: " + parts.join(" · ") : "Keine passenden Dateien gefunden";
    setUniLast(msg + (docs.length ? " · KI prüft PDFs/Fotos zusätzlich auf Kontoauszüge" : "") + (skip.length ? ` (${skip.slice(0, 3).map((f) => f.name).join(", ")}${skip.length > 3 ? " …" : ""})` : "")); notify(msg);
    const q = appQ.current;
    q.files.push(...stmts); if (contacts.length) q.contacts = [...(q.contacts || []), ...contacts];
    if (docs.length) onFiles(docs, { stay: true, uni: true });
    if ((stmts.length || contacts.length) && !q.running) { q.running = true; setTimeout(nextAppImp, docs.length ? 300 : 0); }
  }
  const [imp, setImp] = useState(null);
  shareUi = setShareData;
  // bestehende Rechnungsbelege einmalig in „Ausgangsrechnung“ verschieben
  useEffect(() => {
    if (ls.get("migAusg", false) || !docs.length || !categories.includes("Ausgangsrechnung")) return;
    ls.set("migAusg", true);
    docs.filter((d) => d.invoiceId && !d.deletedAt && d.category !== "Ausgangsrechnung").forEach((d) => saveDoc({ ...d, category: "Ausgangsrechnung" }));
  }, [docs.length, categories]);
  // Rechnung (+ Mahnungen) als PDF-Beleg in Dokumente ablegen und an die Buchung hängen
  async function attachInvoiceBeleg(invId, txId) {
    try {
      const inv = ls.get("invoices", []).find((x) => x.id === invId); if (!inv || !txId) return;
      const co = { ...CO_DEFAULT, ...ls.get("company", {}) };
      let blob = await buildInvoicePdf(inv, co);
      if ((inv.reminders || []).length) {
        const { PDFDocument } = await import("pdf-lib");
        const out = await PDFDocument.load(await blob.arrayBuffer());
        for (let i = 0; i < inv.reminders.length; i++) {
          const rb = await buildInvoicePdf({ ...inv, reminders: inv.reminders.slice(0, i + 1) }, co, inv.reminders[i]);
          const src = await PDFDocument.load(await rb.arrayBuffer());
          (await out.copyPages(src, src.getPageIndices())).forEach((pg) => out.addPage(pg));
        }
        blob = new Blob([await out.save()], { type: "application/pdf" });
      }
      const old = docsRef.current.find((d) => d.invoiceId === invId && !d.deletedAt);
      const id = old?.id || uid();
      const doc = { ...(old || {}), id, createdAt: old?.createdAt || new Date().toISOString(), fileName: invFileName(inv), mimeType: "application/pdf", size: blob.size,
        title: `${inv.kind === "angebot" ? "Angebot" : "Rechnung"} ${inv.number} – ${inv.customer?.name || ""}`.trim(), category: categories.includes("Ausgangsrechnung") ? "Ausgangsrechnung" : categories.includes("Einnahmen") ? "Einnahmen" : old?.category || "Sonstiges",
        docType: "Ausgangsrechnung", tags: ["rechnung", "firma"], deadlines: [], sender: co.name, documentDate: inv.date, scope: "firma", scopeManual: true,
        amount: { total: invTotal(inv), currency: "EUR" }, direction: "einnahme", paid: true, paidDate: inv.paidAt, status: "done", invoiceId: invId,
        summary: `${inv.kind === "angebot" ? "Angebot" : "Rechnung"} an ${inv.customer?.name || ""}${(inv.reminders || []).length ? ` inkl. ${inv.reminders.length} Mahnung(en)` : ""}`, notes: old?.notes || "" };
      try { doc.thumb = await makeThumb(blob); } catch {}
      await db.putFile(id, blob); await saveDoc(doc); await linkTx(txId, id);
    } catch (e) { notify("Beleg konnte nicht angehängt werden: " + e.message); }
  }
  // Zahlungseingang einer Rechnung auf ein Konto buchen bzw. mit vorhandener Buchung verknüpfen
  const bizBook = {
    accounts, txs,
    belegOf: (invId) => docs.find((d) => d.invoiceId === invId && !d.deletedAt),
    openDoc: (id) => setOpenId(id),
    viewBeleg: async (d) => { const b = await db.getFile(d.id); if (b) openPdf(b, d.fileName || "Rechnung.pdf"); else notify("Datei nicht gefunden"); },
    attach: (invId, txId) => attachInvoiceBeleg(invId, txId).then(() => notify("Beleg angehängt")),
    async create({ inv, accountId, date, amount, method }) {
      const tx = await addManualTx({ accountId, date, amount, counterparty: inv.customer?.name || "Kunde", purpose: `${inv.number}${method ? " · " + method : ""}`, category: "Einnahmen", invoiceId: inv.id, bookingText: "Rechnung" });
      notify(`Zahlungseingang ${fmtMoney(amount)} gebucht – Rechnung als Beleg angehängt`); setTimeout(() => attachInvoiceBeleg(inv.id, tx.id), 100); return tx.id;
    },
    async link(txId, inv) { const t = txsRef.current.find((x) => x.id === txId); if (t) await updateTx({ ...t, invoiceId: inv.id, category: t.category && t.category !== "Sonstiges" ? t.category : "Einnahmen" }); setTimeout(() => attachInvoiceBeleg(inv.id, txId), 100); return txId; },
    async unlink(txId, removeCreated) {
      const t = txsRef.current.find((x) => x.id === txId); if (!t) return;
      const belegDoc = t.docId && docsRef.current.find((d) => d.id === t.docId && d.invoiceId);
      if (removeCreated && t.manual && t.invoiceId) await deleteTx(t); else await updateTx({ ...t, invoiceId: undefined, ...(belegDoc ? { docId: undefined } : {}) });
    },
  };
  const scanCb = useRef(null);
  // Scannen: Kamera direkt im Klick öffnen (iOS verlangt eine direkte Benutzeraktion), danach Zuschneiden im Scanner
  const camGlobal = useRef(null);
  const [scanFile, setScanFile] = useState(null);
  const startScan = () => { const el = camGlobal.current; if (!el) return setScanOpen(true); el.value = ""; el.click(); };
  const scanFor = (cb) => { scanCb.current = cb; startScan(); };
  async function saveCash(t, att) {
    const tx = await addManualTx(t);
    if (att?.file) await onFiles([att.file], { ...(att.opts || {}), linkTx: tx.id });
    else notify("Buchung gespeichert");
    return tx;
  }
  // Reiter „Ausgabe“: Buchung anlegen, bereits ausgelesenen Beleg verknüpfen (kein zweiter KI-Aufruf)
  async function saveExpense(t, att = {}) {
    const tx = await addManualTx(t);
    if (att.docId) {
      await linkTx(tx.id, att.docId);
      const d = docsRef.current?.find?.((x) => x.id === att.docId);
      if (d) await saveDoc({ ...d, receiptFlow: false, paid: true, paidDate: tx.date, ...(accountsRef.current.find((a) => a.id === tx.accountId)?.kind === "cash" ? { paidCash: true } : {}) });
      notify(`Ausgabe ${fmtMoney(tx.amount)} gespeichert · Beleg verknüpft`);
    } else if (att.file) await onFiles([att.file], { linkTx: tx.id, stay: true });
    else notify(`Ausgabe ${fmtMoney(tx.amount)} gespeichert`);
    return tx;
  }
  const receiptFor = (txId, file, o = {}) => onFiles([file], { ...o, receipt: true, stay: true, linkTx: txId });
  const scanReceiptFor = (txId) => scanFor((file, o) => receiptFor(txId, file, { ...o, scanned: true }));
  function attachNew(txId, how) { pendingLink.current = txId; if (how === "scan") startScan(); else fileInput.current.click(); }
  // Kategorie umbenennen/löschen: Dokumente, Umsätze, Budgets, Regeln mitziehen
  async function renameCategory(from, to) {
    const m = catMeta(from);
    setNav((n) => ({ ...n, catStyle: { ...(n.catStyle || {}), [to]: [m.icon, m.color, m.img] }, docGroups: n.docGroups.map((g) => ({ ...g, cats: g.cats.map((c) => (c === from ? to : c)) })) }));
    const changed = docs.filter((d) => d.category === from).map((d) => ({ ...d, category: to }));
    for (const d of changed) await saveDoc(d);
    const tx = txsRef.current.filter((t) => t.category === from).map((t) => ({ ...t, category: to }));
    if (tx.length) { await db.putTxs(tx); setTxs((p) => p.map((t) => (t.category === from ? { ...t, category: to } : t))); }
    if (budgets[from] != null) { const b = { ...budgets, [to]: budgets[from] }; delete b[from]; setBudgets(b); }
    setRules((r) => r.map((x) => (x.category === from ? { ...x, category: to } : x)));
    if (docCat === from) setDocCat(to);
    notify(`„${from}“ → „${to}“${changed.length ? ` (${changed.length} Dokumente)` : ""}`);
  }
  async function deleteCategory(c) {
    setNav((n) => ({ ...n, docGroups: n.docGroups.map((g) => ({ ...g, cats: g.cats.filter((x) => x !== c) })) }));
    for (const d of docs.filter((d) => d.category === c)) await saveDoc({ ...d, category: "Sonstiges" });
    const tx = txsRef.current.filter((t) => t.category === c).map((t) => ({ ...t, category: "Sonstiges" }));
    if (tx.length) { await db.putTxs(tx); setTxs((p) => p.map((t) => (t.category === c ? { ...t, category: "Sonstiges" } : t))); }
    if (docCat === c) setDocCat("");
    notify(`Kategorie „${c}“ gelöscht`);
  }

  // Bargeld: Konto sicherstellen, manuelle Buchung, Beleg als Barausgabe
  function ensureCashAccount() {
    let a = accountsRef.current.find((x) => x.kind === "cash");
    if (!a) { a = { id: uid(), kind: "cash", name: "Geldbörse", iban: "", opening: 0, openingDate: "", atm: true }; setAccounts((l) => [...l, a]); }
    return a;
  }
  async function addManualTx(t) {
    const accountId = t.accountId === "new-cash" ? ensureCashAccount().id : t.accountId;
    const tx = { id: "m-" + uid(), kind: "bank", currency: "EUR", iban: "", purpose: "", bookingText: "Bar", manual: true, createdAt: new Date().toISOString(), ...t, accountId };
    if (!tx.category) tx.category = categorize(tx, rules, []);
    const all = [...txsRef.current, tx]; txsRef.current = all; setTxs(all); await db.putTxs([tx]);
    return tx;
  }
  async function deleteTx(t) {
    await db.delTxs([t.id]); setTxs((p) => p.filter((x) => x.id !== t.id));
    if (t.docId) { const d = docs.find((x) => x.id === t.docId); if (d) await saveDoc({ ...d, paid: false, paidCash: false }); }
  }
  async function bookCash(doc) {
    if (!doc.amount?.total) return;
    const acc = ensureCashAccount();
    const generic = ["Rechnungen", "Sonstiges", "Garantie & Kaufbelege", "Verträge"].includes(doc.category);
    const base = { date: doc.documentDate || todayISO(), amount: -Math.abs(doc.amount.total), currency: doc.amount.currency || "EUR", counterparty: doc.sender || doc.title, purpose: doc.title };
    await addManualTx({ ...base, accountId: acc.id, docId: doc.id, category: generic ? categorize({ ...base, kind: "bank" }, rules, []) : doc.category });
    await saveDoc({ ...doc, paid: true, paidCash: true, paidDate: base.date, deadlines: (doc.deadlines || []).map((x) => (/zahl|fällig/i.test(x.label) ? { ...x, done: true } : x)) });
    notify(`💶 ${fmtMoney(doc.amount.total)} als Barausgabe gebucht (${acc.name})`);
  }

  async function deleteAccount(id) {
    const ids = txs.filter((t) => t.accountId === id).map((t) => t.id);
    await db.delTxs(ids); setTxs((p) => p.filter((t) => t.accountId !== id)); setAccounts((a) => a.filter((x) => x.id !== id));
  }

  async function saveDoc(d) {
    setDocs((prev) => { const i = prev.findIndex((x) => x.id === d.id); if (i < 0) return [d, ...prev]; const n = [...prev]; n[i] = d; return n; });
    await db.putDoc(d);
  }
  async function trashDoc(doc) { await saveDoc({ ...doc, deletedAt: new Date().toISOString() }); setOpenId(null); notify("In den Papierkorb verschoben"); }
  async function purgeDoc(id) { setDocs((p) => p.filter((d) => d.id !== id)); await db.delDoc(id); await db.delFile(id); }

  async function analyze(doc, blob) {
    await saveDoc({ ...doc, status: "processing", error: null });
    try {
      // Vercel nimmt max. ~4,5 MB pro Anfrage: große PDFs fürs Auslesen verkleinern
      const send = blob.type === "application/pdf" && blob.size > 3.6 * 1024 * 1024 ? await shrinkPdf(blob) : blob;
      const data = await blobToBase64(send);
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json", "x-app-token": token },
        body: JSON.stringify({ data, mediaType: send.type, categories, itemCategories: itemCats(), today: todayISO(), company: me.company || "", person: me.name || "",
          groups: nav.docGroups.map((g) => `${g.title || "Gruppe"} (${AREAS[g.area][1]}): ${g.cats.join(", ")}`).join("\n") })
      });
      const j = await r.json().catch(() => ({ error: r.status === 413 ? "Datei zu groß für den Server (max. ca. 4 MB)" : `HTTP ${r.status}` }));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const c = j.contract;
      const done = ({
        ...doc,
        status: "done", error: null,
        title: j.title || doc.fileName,
        category: categories.includes(j.category) ? j.category : "Sonstiges",
        docType: j.doc_type || "Sonstiges",
        tags: (j.tags || []).map((t) => norm(t).trim()).filter(Boolean),
        sender: j.sender || "",
        documentDate: j.document_date || "",
        summary: j.summary || "",
        fullText: j.full_text || "",
        merchant: j.merchant || "",
        purchaseDate: /^\d{4}-\d{2}-\d{2}$/.test(j.purchase_date || "") ? j.purchase_date : "",
        lineItems: (j.line_items || []).filter((x) => x && x.name && Number.isFinite(+x.total)).map((x) => ({ id: uid(), name: String(x.name), qty: +x.qty || 1, unitPrice: x.unit_price != null ? +x.unit_price : null, total: +x.total, category: x.category || "Sonstiges" })),
        amount: j.amount && j.amount.total != null ? { ...j.amount, currency: j.amount.currency || "EUR" } : null,
        direction: j.direction || "keine",
        area: ["finanzen", "vertraege", "sonstiges"].includes(j.area) ? j.area : undefined,
        taxRelevant: !!j.tax_relevant,
        scope: doc.scopeManual ? doc.scope : j.scope === "firma" ? "firma" : "privat",
        payment: j.payment?.iban ? j.payment : null,
        contract: c?.provider ? {
          provider: c.provider, name: c.name || "", customerNumber: c.customer_number || "", amount: c.amount ?? null,
          interval: c.interval || "", startDate: c.start_date || "", endDate: c.end_date || "", noticePeriod: c.notice_period || "",
          cancelBy: c.cancel_by || "", active: true
        } : null,
        deadlines: (j.deadlines || []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date)).map((x) => ({ id: uid(), date: x.date, label: x.label, done: false })),
        paid: doc.paid || txsRef.current.some((t) => t.docId === doc.id),
        paidDate: doc.paidDate || txsRef.current.find((t) => t.docId === doc.id)?.date
      });
      await saveDoc(done);
      const uf = uniFiles.current[doc.id];
      if (uf) {
        delete uniFiles.current[doc.id];
        if (done.docType === "Kontoauszug") { notify(`KI hat einen Kontoauszug erkannt: „${done.title}“ – Umsätze werden importiert`); uf.__ai = true; enqueueStmt(uf); }
      }
      if (doc.receiptFlow) {
        // Reiter „Ausgabe“: Buchung entsteht erst beim Speichern. Aus der Buchungsdetailansicht gescannt: Buchung existiert schon → Positionen übernehmen
        const lt = txsRef.current.find((t) => t.docId === done.id);
        if (lt) {
          await saveDoc({ ...done, receiptFlow: false, paid: true, paidDate: lt.date });
          const its = (done.lineItems || []).map((i) => ({ name: i.name, qty: +i.qty || 1, total: Math.round((+i.total || 0) * 100) / 100, category: i.category || "Sonstiges" }));
          if (!lt.items?.length && its.length) { const n = { ...lt, items: its, ...(!lt.counterparty && done.merchant ? { counterparty: done.merchant } : {}) }; setTxs((p) => p.map((x) => (x.id === n.id ? n : x))); await db.putTxs([n]); }
          const diff = done.amount?.total != null && Math.abs(Math.abs(lt.amount) - done.amount.total) > 0.01;
          notify(`Beleg ausgelesen${its.length && !lt.items?.length ? ` · ${its.length} Position${its.length === 1 ? "" : "en"} übernommen` : ""}${diff ? ` · Achtung: Beleg ${fmtMoney(done.amount.total)} ≠ Buchung ${fmtMoney(Math.abs(lt.amount))}` : ""}`);
        }
      }
      else if (doc.payCash && done.amount?.total && done.direction !== "einnahme") await bookCash({ ...done, direction: "ausgabe" });
      else if (!txsRef.current.some((t) => t.docId === done.id)) {
        const [l] = matchInvoices([done], txsRef.current);
        if (l) { await linkTx(l.txId, done.id); const t = txsRef.current.find((x) => x.id === l.txId); notify(`Beleg „${done.title}“ an Buchung ${t ? fmtDate(t.date) + " · " + fmtMoney(t.amount) : ""} angehängt`); }
      }
    } catch (e) {
      await saveDoc({ ...doc, status: "error", error: e.message });
    }
  }

  async function onFiles(list, opts = {}) {
    const files = [...list], ids = [];
    for (const [fi, f] of files.entries()) {
      setUpl({ i: fi + 1, n: files.length, name: f.name });
      let blob;
      try { blob = await prepareFile(f); } catch (e) { notify(`${f.name}: ${e.message}`); continue; }
      if (blob.size > 3.6 * 1024 * 1024) notify(`${f.name}: ${(blob.size / 1048576).toFixed(0)} MB – wird zum Auslesen automatisch verkleinert`);
      const doc = {
        id: uid(), createdAt: new Date().toISOString(), fileName: f.name, mimeType: blob.type, size: blob.size,
        title: f.name, category: "Sonstiges", tags: [], deadlines: [], amount: null, paid: false, notes: "", status: "processing",
        ...(opts.cash ? { payCash: true } : {}), ...(opts.scanned ? { scanned: true } : {}), ...(opts.uni ? { uniCheck: true } : {}), ...(opts.receipt ? { receiptFlow: true, category: "Garantie & Kaufbelege" } : {})
      };
      try { doc.thumb = await makeThumb(blob); } catch {}
      if (opts.uni) uniFiles.current[doc.id] = f;
      ids.push(doc.id);
      await db.putFile(doc.id, blob);
      await saveDoc(doc);
      if (opts.linkTx) { await linkTx(opts.linkTx, doc.id); notify("Beleg wird ausgelesen und ist der Buchung zugeordnet"); }
      queue.current = queue.current.then(() => analyze(doc, blob));
    }
    setUpl(null);
    if (files.length && !opts.linkTx && !opts.stay) setTab("docs");
    return ids;
  }
  async function reanalyze(doc) {
    const blob = await db.getFile(doc.id);
    if (!blob) return notify("Datei nicht gefunden");
    queue.current = queue.current.then(() => analyze(doc, blob));
  }

  const procN = docs.filter((d) => d.status === "processing" && !d.deletedAt).length;
  if (!procN && !upl) docPeak.current = 0; else docPeak.current = Math.max(docPeak.current, procN + (upl ? upl.n - upl.i : 0), upl ? upl.n : 0);
  const docBusy = upl || procN ? (() => { const total = Math.max(docPeak.current, 1), left = procN + (upl ? upl.n - upl.i : 0);
    const proc = docs.filter((d) => d.status === "processing" && !d.deletedAt);
    return { title: upl ? `Datei ${upl.i} von ${upl.n} wird hochgeladen …` : `KI liest ${procN} Dokument${procN === 1 ? "" : "e"} aus …`,
      sub: upl ? upl.name : proc.slice(0, 3).map((d) => d.fileName || d.title).join(", ") + (procN > 3 ? ` und ${procN - 3} weitere` : ""), done: total - left, total, n: left }; })() : null;
  const busyTab = { docs: docBusy, accounts: accBusy, kunden: ctBusy };
  const openDoc = docs.find((d) => d.id === openId);
  // Kündigungstermine aus dem Reiter „Verträge“ als zusätzliche Fristen
  const [ctVer, setCtVer] = useState(0);
  const ctDocs = useMemo(() => contractDlDocs(ls.get("contractList", []), active), [tab, ctVer, active]);
  const astDocs = useMemo(() => assetDlDocs(ls.get("besitz", [])), [tab, ctVer]);
  const dlDocs = useMemo(() => [...active, ...ctDocs, ...astDocs], [active, ctDocs, astDocs]);
  const saveDl = async (d) => {
    if (d.isAsset) {
      const dl = d.deadlines.find((x) => x.date && (astDocs.find((y) => y.id === d.id)?.deadlines || []).some((o) => o.id === x.id && o.done !== x.done)) || d.deadlines[0];
      ls.set("besitz", ls.get("besitz", []).map((a) => (a.id === d.astId ? { ...a, dlDone: dl.done ? [...new Set([...(a.dlDone || []), dl.date])] : (a.dlDone || []).filter((x) => x !== dl.date) } : a)));
      setCtVer((v) => v + 1); return;
    }
    if (!d.isContract) return saveDoc(d);
    const dl = d.deadlines[0], orig = ctDocs.find((x) => x.id === d.id)?.deadlines[0];
    if (orig && dl.date !== orig.date) { notify("Vertragsfristen bitte im Reiter „Verträge“ ändern"); setCtVer((v) => v + 1); return; }
    ls.set("contractList", ls.get("contractList", []).map((c) => (c.id === d.ctId ? { ...c, dlDone: dl.done ? [...new Set([...(c.dlDone || []), dl.date])] : (c.dlDone || []).filter((x) => x !== dl.date) } : c)));
    setCtVer((v) => v + 1);
  };
  const openDl = (id) => { if (String(id).startsWith("as:")) { ls.set("assetOpenReq", String(id).slice(3)); setTab("besitz"); return; }
    if (String(id).startsWith("ct:")) { ls.set("ctOpenReq", String(id).slice(3)); setTab("vertraege"); } else setOpenId(id); };
  // Kalender-Abo: bei jeder Änderung der Fristen (verzögert) neu hochladen
  const calSig = useMemo(() => JSON.stringify(dlDocs.flatMap((d) => (d.deadlines || []).filter((x) => !x.done).map((x) => [x.id, x.date, x.label, d.title, payAmt(d)]))), [dlDocs]);
  const calFirst = useRef(true);
  useEffect(() => {
    if (!calSync.on || !calSync.key) return;
    if (calFirst.current) { calFirst.current = false; if (calSync.at && Date.now() - new Date(calSync.at) < 6e5) return; }
    const t = setTimeout(async () => {
      const items = dlDocs.flatMap((doc) => (doc.deadlines || []).filter((x) => !x.done).map((dl) => [dl, doc]));
      try { const at = await pushCalendar(calSync.key, items, token); setCalSync({ ...calSync, at }); } catch {}
    }, 3000);
    return () => clearTimeout(t);
  }, [calSig, calSync.on]);
  const visAccounts = accounts.filter((a) => !a.hidden), hiddenAccs = accounts.filter((a) => a.hidden);
  const groups = resolveGroups(nav, visAccounts);
  // Auswahl: leere Liste = alle sichtbaren Konten
  const visIds = visAccounts.map((a) => a.id);
  const pickedVis = selAccs.filter((id) => visIds.includes(id));
  const allSel = !pickedVis.length || pickedVis.length === visIds.length;
  const effSel = allSel ? visIds : pickedVis;
  const selAcc = !allSel && effSel.length === 1 ? effSel[0] : "";
  const setSelAcc = (id) => setSelAccs(id ? [id] : []);
  const accActions = {
    onToggle: (id) => setSelAccs(() => { const n = effSel.includes(id) ? effSel.filter((x) => x !== id) : [...effSel, id]; return n.length === visIds.length ? [] : n; }),
    onOnly: (id) => { setSelAccs([id]); setTab("accounts"); },
    onAll: () => setSelAccs([]),
    onGroupSel: (ids, add) => setSelAccs(() => { const n = add ? [...new Set([...effSel, ...ids])] : effSel.filter((x) => !ids.includes(x)); return n.length === visIds.length ? [] : n; }),
    onHide: (id) => { setAccounts((l) => l.map((a) => (a.id === id ? { ...a, hidden: true } : a))); setSelAccs((c) => c.filter((x) => x !== id)); notify("Konto ausgeblendet – unten unter „Ausgeblendet“ wieder einblendbar"); },
    onUnhide: (id) => { setAccounts((l) => l.map((a) => (a.id === id ? { ...a, hidden: false } : a))); if (!allSel) setSelAccs([...effSel, id]); },
  };
  const toggleGroup = (id) => setNav((n) => ({ ...n, groups: n.groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)) }));
  const areaCounts = Object.fromEntries(Object.keys(AREAS).map((k) => [k, active.filter((d) => docArea(d) === k).length]));

  return (
    <IconLibCtx.Provider value={{ lib: nav.accIcons || [], setLib: (l) => setNav((n) => ({ ...n, accIcons: l })) }}>
    <div className={"app tab-" + tab}>
      <style>{CSS}</style>
      <header className="top">
        <h1>{tabLabel(nav, tab)}</h1>
        <div className="topactions">
        <div className="topicons">
          {tab === "home" && <button className={"eyebtn" + (homeEdit ? " on" : "")} onClick={() => setHomeEdit(!homeEdit)} aria-label="Übersicht anpassen" title="Übersicht anpassen"><IcoLayout /></button>}
          {["analyse", "vermoegen", "firma"].includes(tab) && <button className={"eyebtn" + (boardEdit === tab ? " on" : "")} onClick={() => setBoardEdit(boardEdit === tab ? null : tab)} aria-label="Widgets anpassen" title="Widgets anpassen"><IcoLayout /></button>}
          <button className="eyebtn" onClick={() => setHideAmounts(!hideAmounts)} aria-label={hideAmounts ? "Beträge anzeigen" : "Beträge ausblenden"} title={hideAmounts ? "Beträge anzeigen" : "Beträge ausblenden"}>{hideAmounts ? <IcoEyeOff /> : <IcoEye />}</button>
          <button className="eyebtn" onClick={() => setThemeMode(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Tagmodus" : "Nachtmodus"} title={theme === "dark" ? "Tagmodus" : "Nachtmodus"}>{theme === "dark" ? <IcoSun /> : <IcoMoon />}</button>
        </div>
        <div className="addbtn">
          <button className={"btn primary addplus" + (fabOpen ? " open" : "")} onClick={() => setFabOpen(!fabOpen)} aria-label="Hinzufügen" aria-expanded={fabOpen} title="Hinzufügen">＋</button>
        </div>
        </div>
      </header>

      <main>
        {tab === "home" && <Home docs={active} dlDocs={dlDocs} txs={txs.filter((t) => !hiddenAccs.some((a) => a.id === t.accountId))} budgets={budgets} onOpen={setOpenId} setTab={setTab} fixExtra={fixExtra} hasCash={visAccounts.some((a) => a.kind === "cash")}
          accounts={visAccounts} onManual={setManualTx} openAccount={(id) => { setSelAcc(id); setTab("accounts"); }}
          uniDrop={<>
            <DropField onFiles={smartImport} busy={!!(docBusy || accBusy)} title="Beliebige Dateien oder Ordner hierher ziehen" what="Dokumente, Kontoauszüge, vCards" isOk={() => true} accept="" />
            {docBusy && <ImportBar {...docBusy} />}{accBusy && <ImportBar {...accBusy} />}
            {uniLast && <p className="small muted unilast">{uniLast}</p>}
          </>}
          cashForm={<ExpenseForm accounts={visAccounts} txs={txs} docs={active} categories={TX_CATS(categories)} onSave={saveExpense} onScan={scanFor} addCategory={addCategory} notify={notify}
            onUpload={async (file, o) => (await onFiles([file], { ...(o || {}), stay: true, receipt: true }))[0]}
            suggestCat={(name) => (name && name.trim() ? (() => { const c = categorize({ counterparty: name, purpose: "", kind: "bank", amount: -1 }, rules, []); return c && c !== "Sonstiges" ? c : ""; })() : "")} />}
          editing={homeEdit} setEditing={setHomeEdit} actions={{ scan: () => startScan(), upload: () => fileInput.current.click(), manual: () => setManualTx({}), newAcc: () => { setTab("accounts"); setNewAccReq(true); } }} />}
        {tab === "accounts" && <Accounts goTab={setTab} resetCp={resetCp} scanReceiptFor={scanReceiptFor} receiptFor={receiptFor} busy={accBusy} setBusy={setAccBusy} addCategory={addCategory} linkTx={linkTx} attachNew={attachNew} txs={txs} accounts={accounts} setAccounts={setAccounts} importTxs={importTxs} updateTx={updateTx}
          deleteAccount={deleteAccount} categories={categories} docs={active} onOpen={setOpenId} token={token} notify={notify}
          recurring={recurring} subs={subs} setSubs={setSubs} onManual={setManualTx} deleteTx={deleteTx}
          acc={selAcc} setAcc={setSelAcc} sel={effSel} allSel={allSel} setSel={setSelAccs} accActions={accActions} hiddenAccs={hiddenAccs} visAccounts={visAccounts} groups={groups} toggleGroup={toggleGroup} newAccReq={newAccReq} clearNewAccReq={() => setNewAccReq(false)} />}
        {tab === "docs" && <DocList onFiles={onFiles} docBusy={docBusy} trashDoc={trashDoc} reanalyze={reanalyze} docs={active} categories={categories} onOpen={setOpenId} area={docAreaSel} setArea={setDocAreaSel}
          cat={docCat} setCat={setDocCat} docGroups={nav.docGroups} toggleDocGroup={toggleDocGroup}
          deadlineTab={nav.tabs.some((t) => t.key === "deadlines") ? { label: tabLabel(nav, "deadlines"), open: () => setTab("deadlines") } : null} />}
        {tab === "deadlines" && <Deadlines docs={dlDocs} onOpen={openDl} saveDoc={saveDl} calSync={calSync} setCalSync={setCalSync} token={token} notify={notify} />}
        {tab === "cash" && <ExpensePage accounts={visAccounts} txs={txs} categories={TX_CATS(categories)} onSave={saveExpense} onScan={scanFor} addCategory={addCategory} notify={notify}
          onUpload={async (file, o) => (await onFiles([file], { ...(o || {}), stay: true, receipt: true }))[0]}
          suggestCat={(name) => (name && name.trim() ? (() => { const c = categorize({ counterparty: name, purpose: "", kind: "bank", amount: -1 }, rules, []); return c && c !== "Sonstiges" ? c : ""; })() : "")}
          docs={active} onOpen={setOpenId} openAccount={(id) => { setSelAcc(id); setTab("accounts"); }} />}
        {tab === "analyse" && <Analysis txs={txs.filter((t) => !hiddenAccs.some((a) => a.id === t.accountId))} accounts={visAccounts} hasCash={visAccounts.some((a) => a.kind === "cash")} editing={boardEdit === tab} setEditing={(v) => setBoardEdit(v ? tab : null)} />}
        {tab === "fahrtenbuch" && <Fahrtenbuch accounts={visAccounts} notify={notify} onBook={async (t) => { const tx = await addManualTx(t); return tx; }}
          txs={txs} docs={active} onScan={scanFor} onOpen={setOpenId}
          onUpload={async (file, o) => (await onFiles([file], { ...(o || {}), stay: true, receipt: true }))[0]}
          onLink={async (txId, docId) => { await linkTx(txId, docId); const d = docsRef.current.find((x) => x.id === docId); if (d?.receiptFlow) await saveDoc({ ...d, receiptFlow: false, paid: true }); }} />}
        {tab === "firma" && <BizReport docs={active} setTab={setTab} editing={boardEdit === tab} setEditing={(v) => setBoardEdit(v ? tab : null)} />}
        {tab === "vermoegen" && <Wealth txs={txs} accounts={visAccounts} openAccount={(id) => { setSelAcc(id); setTab("accounts"); }} editing={boardEdit === tab} setEditing={(v) => setBoardEdit(v ? tab : null)} />}
        {tab === "invoices" && <InvoicesPage book={bizBook} req={bizReq} setTab={setTab} me={me} txs={txs} notify={notify} onArchive={async (blob, name) => { await onFiles([new File([blob], name, { type: "application/pdf" })]); }} />}
        {tab === "mahnungen" && <DunningPage book={bizBook} setTab={setTab} />}
        {tab === "artikel" && <ArticlesPage setTab={setTab} />}
        {tab === "besitz" && <AssetsPage docs={active} onOpen={setOpenId} notify={notify} onScan={scanFor} calSync={calSync} setCalSync={setCalSync} token={token}
          onUpload={async (file, o) => (await onFiles([file], { ...(o || {}), stay: true }))[0]} />}
        {tab === "inventur" && <InventoryPage setTab={setTab} notify={notify} docs={active} onOpen={setOpenId} onScan={scanFor} onUpload={async (file, o) => (await onFiles([file], { ...(o || {}), stay: true, receipt: true }))[0]} />}
        {tab === "kassa" && <KassaPage docs={active} onOpen={setOpenId} notify={notify} onScan={scanFor} onUpload={async (file, o) => (await onFiles([file], { ...(o || {}), stay: true, receipt: true }))[0]} />}
        {tab === "kunden" && <ContactsPage setTab={setTab} req={bizReq} busy={ctBusy} setBusy={setCtBusy} />}
        {tab === "vertraege" && <ContractsPage docs={active} me={me} onOpen={setOpenId} onFiles={onFiles} docBusy={docBusy} notify={notify} />}
        {tab === "contracts" && <Contracts docs={active} onOpen={setOpenId} me={me} notify={notify} extra={confirmedSubs} subs={subs} setSubs={setSubs} txs={txs} accounts={accounts} />}
        {(tab === "settings" || tab === "backup") && (
          <Settings key={tab} only={tab === "backup" ? "backup" : ""} theme={theme} design={design} setDesign={setDesign} themeMode={themeMode} setThemeMode={setThemeMode} importTxs={importTxs} hideAmounts={hideAmounts} setHideAmounts={setHideAmounts} nav={nav} setNav={setNav} deleteAccount={deleteAccount} renameCategory={renameCategory} deleteCategory={deleteCategory} txs={txs} setTxs={setTxs} accounts={accounts} setAccounts={setAccounts} rules={rules} setRules={setRules} setTab={setTab} categories={categories} setCategories={setCategories} budgets={budgets} setBudgets={setBudgets}
            me={me} setMe={setMe} token={token} setToken={setToken}
            docs={docs} setDocs={setDocs} saveDoc={saveDoc} purgeDoc={purgeDoc} notify={notify} />
        )}
      </main>

      <input ref={vcfApp} type="file" accept=".vcf,text/vcard,text/x-vcard" multiple hidden onChange={async (e) => {
        const files = [...e.target.files]; e.target.value = ""; let all = [];
        for (const f of files) all = all.concat(parseVcf(await f.text()));
        if (!all.length) return notify("Keine Kontakte in der Datei gefunden");
        ls.set("pendingContactImport", all); setTab("kunden"); setBizReq((n) => n + 1);
      }} />
      <input ref={impRef} type="file" accept={IMPORT_ACCEPT} hidden onChange={async (e) => {
        const f = e.target.files[0]; e.target.value = ""; if (!f) return;
        try { setImp({ file: f, result: await parseFile(f, ls.get("mappings", {})) }); } catch (err) { notify("Datei nicht lesbar: " + err.message); }
      }} />
      {imp && <ImportSheet imp={imp} accounts={accounts} setAccounts={setAccounts} importTxs={importTxs} token={token} notify={notify} onClose={() => { const u = imp.uni; setImp(null); if (u) setTimeout(nextAppImp, 50); }} />}
      <input ref={fileInput} type="file" accept="application/pdf,image/*" multiple hidden
        onChange={(e) => { const l = pendingLink.current; pendingLink.current = null; onFiles(e.target.files, l ? { linkTx: l } : {}); e.target.value = ""; }} />
      {fabOpen && <div className="fabmenu-bg" onClick={() => setFabOpen(false)} />}
      {fabOpen && (
        <div className="fabmenu" role="menu">
          <button role="menuitem" onClick={() => { setFabOpen(false); startScan(); }}><span>📷</span><div><b>Scannen</b><small>Bon oder Rechnung fotografieren</small></div></button>
          <button role="menuitem" onClick={() => { setFabOpen(false); fileInput.current.click(); }}><span>📄</span><div><b>Datei / Foto</b><small>PDF oder Bild hochladen</small></div></button>
          <button role="menuitem" onClick={() => { setFabOpen(false); setManualTx(tab === "accounts" && selAcc ? { accountId: selAcc } : {}); }}><span>💶</span><div><b>Buchung</b><small>Barausgabe oder Buchung erfassen</small></div></button>
          <button role="menuitem" onClick={() => { setFabOpen(false); ls.set("pendingInvoice", { kind: "rechnung" }); setTab("invoices"); setBizReq((n) => n + 1); }}><span>🧾</span><div><b>Neue Rechnung</b><small>Rechnung für deine Firma schreiben</small></div></button>
          <button role="menuitem" onClick={async () => {
            setFabOpen(false);
            const out = await pickPhoneContacts();
            if (out === null) return vcfApp.current.click();
            if (out.length) { ls.set("pendingContactImport", out); setTab("kunden"); setBizReq((n) => n + 1); }
          }}><span>📱</span><div><b>Kunden importieren</b><small>Aus Handy-Kontakten oder vCard-Datei (.vcf)</small></div></button>
          <button role="menuitem" onClick={() => { setFabOpen(false); ls.set("pendingContact", "new"); setTab("kunden"); setBizReq((n) => n + 1); }}><span>👥</span><div><b>Neuer Kunde</b><small>Kontakt anlegen oder aus dem Handy übernehmen</small></div></button>
          <button role="menuitem" onClick={() => { setFabOpen(false); impRef.current.click(); }}><span>⬆️</span><div><b>Umsätze importieren</b><small>Kontoauszug: CSV, Excel, CAMT, PDF …</small></div></button>
          <button role="menuitem" onClick={() => { setFabOpen(false); setTab("accounts"); setNewAccReq(true); }}><span>🏦</span><div><b>Konto anlegen</b><small>Girokonto, Karte, Sparkonto, Bargeld …</small></div></button>
        </div>
      )}
      <button className={"fab" + (fabOpen ? " open" : "")} onClick={() => setFabOpen(!fabOpen)} aria-label="Hinzufügen">＋</button>
      <input ref={camGlobal} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) { setScanFile(f); setScanOpen(true); } }} />
      {scanOpen && createPortal(<Scanner initial={scanFile} onClose={() => { setScanOpen(false); setScanFile(null); pendingLink.current = null; scanCb.current = null; }} onDone={(file, o) => { setScanOpen(false); setScanFile(null);
        if (scanCb.current) { const cb = scanCb.current; scanCb.current = null; cb(file, o); return; }
        const l = pendingLink.current; pendingLink.current = null; onFiles([file], { ...o, scanned: true, ...(l ? { linkTx: l } : {}) }); }} />, document.querySelector(".app") || document.body)}
      {manualTx && <ManualTxSheet init={manualTx} accounts={visAccounts} txs={txs} docs={active} categories={TX_CATS(categories)} onClose={() => setManualTx(null)}
        onSave={saveExpense} onScan={scanFor} addCategory={addCategory} notify={notify}
        onUpload={async (file, o) => (await onFiles([file], { ...(o || {}), stay: true, receipt: true }))[0]}
        suggestCat={(name) => (name && name.trim() ? (() => { const c = categorize({ counterparty: name, purpose: "", kind: "bank", amount: -1 }, rules, []); return c && c !== "Sonstiges" ? c : ""; })() : "")} />}

      <nav className="bottom" onPointerOver={(e) => {
        if (!sideMini || e.pointerType === "touch") return;
        const b = e.target.closest?.("button,.brand"); if (!b) return setSideTip(null);
        const r = b.getBoundingClientRect();
        const text = b.classList.contains("brand") ? "FinDocu" : b.getAttribute("aria-label");
        setSideTip(text ? { text, top: r.top + r.height / 2 } : null);
      }} onPointerLeave={() => setSideTip(null)}>
        <div className="brand"><img src="/icon.svg" alt="" /><div><b>FinDocu</b><small>Finanzen & Dokumente</small></div></div>
        {nav.tabs.map((t) => {
          if (t.sep) return <hr key={t.key} className="navsep side-only" />;
          if (t.head != null) return <div key={t.key} className="navhead side-only">{t.head}</div>;
          if (!(t.side || t.phone)) return null;
          // Unterreiter: in der Seitenleiste unter dem Elternreiter, am Handy normal in der Leiste
          const parentShown = t.parent && nav.tabs.some((p) => p.key === t.parent && p.side);
          if (parentShown) return t.phone ? (
            <button key={t.key} className={(tab === t.key ? "on" : "") + " side-hide"} onClick={() => setTab(t.key)} aria-label={tabLabel(nav, t.key)}>
              <TabIcon t={t} /><span className="tl" style={t.color ? { color: t.color } : undefined}>{tabLabel(nav, t.key)}</span></button>) : null;
          const kids = nav.tabs.filter((c) => c.parent === t.key && c.side && !isNavDeco(c));
          const sub = (t.key === "accounts" && accounts.length) || (t.key === "docs" && active.length);
          const open = t.key === "accounts" ? nav.accOpen : nav.docsOpen;
          const flag = t.key === "accounts" ? "accOpen" : "docsOpen";
          return (
            <React.Fragment key={t.key}>
              <button className={(tab === t.key ? "on" : "") + (t.phone ? "" : " ph-hide") + (t.side ? "" : " side-hide")}
                onClick={() => {
                  if (sub) {
                    const gk = t.key === "accounts" ? "groups" : "docGroups";
                    setNav((n) => {
                      const gs = n[gk] || [];
                      const allOpen = n[flag] && gs.every((g) => !g.collapsed);
                      const collapse = tab === t.key && allOpen;
                      return { ...n, [flag]: true, [gk]: gs.map((g) => ({ ...g, collapsed: collapse })) };
                    });
                  }
                  setTab(t.key); if (t.key === "docs") { setDocAreaSel("alle"); setDocCat(""); }
                }} aria-label={tabLabel(nav, t.key)}>
                <TabIcon t={t} /><span className="tl" style={t.color ? { color: t.color } : undefined}>{tabLabel(nav, t.key)}</span>
                {t.key === "home" && <Badge docs={dlDocs} />}
                {busyTab[t.key] && <span className="busytab" title={busyTab[t.key].title}><span className="spin" />{busyTab[t.key].n > 0 && <small>{busyTab[t.key].n}</small>}</span>}
                {!!sub && <i className={"subtog side-only" + (open ? " open" : "")} role="button" aria-label="ein-/ausklappen"
                  onClick={(e) => { e.stopPropagation(); setNav((n) => ({ ...n, [flag]: !n[flag] })); }}>›</i>}
              </button>
              {t.side && busyTab[t.key] && tab !== t.key && <div className="side-only sidebusy" onClick={() => setTab(t.key)}><b>{busyTab[t.key].title}</b><span className="ibar"><span style={{ width: Math.max(4, Math.round((busyTab[t.key].done / Math.max(1, busyTab[t.key].total)) * 100)) + "%" }} /></span></div>}
              {t.side && kids.map((c) => (
                <button key={c.key} className={"subtab side-only" + (tab === c.key ? " on" : "")} onClick={() => setTab(c.key)} aria-label={tabLabel(nav, c.key)}>
                  <TabIcon t={c} /><span className="tl" style={c.color ? { color: c.color } : undefined}>{tabLabel(nav, c.key)}</span>
                  {c.key === "deadlines" && <DeadlineBadge docs={dlDocs} />}
                </button>
              ))}
              {t.key === "accounts" && t.side && nav.accOpen && accounts.length > 0 && (
                <div className="subnav side-only">
                  <AccountTree groups={groups} txs={txs} sel={effSel} onToggleGroup={toggleGroup} hidden={hiddenAccs} showChecks={nav.showChecks !== false} {...accActions} />
                </div>
              )}
              {t.key === "docs" && t.side && nav.docsOpen && active.length > 0 && (
                <div className="subnav side-only">
                  <DocTree docGroups={nav.docGroups} docs={active} selected={tab === "docs" ? docCat : ""} onToggleGroup={toggleDocGroup}
                    onSelect={(c) => { setDocCat(c); setDocAreaSel("alle"); setTab("docs"); }} />
                </div>
              )}
            </React.Fragment>
          );
        })}
        <button className="sidetoggle side-only" onClick={() => setSideMini(!sideMini)} title={sideMini ? undefined : "Seitenleiste einklappen (⌘\\)"} aria-label={sideMini ? "Seitenleiste ausklappen (⌘\\)" : "Seitenleiste einklappen"}>
          <span className="tabico">{sideMini ? "»" : "«"}</span>
        </button>
      </nav>
      {sideMini && sideTip && <div className="sidetip" style={{ top: sideTip.top }}>{sideTip.text}</div>}

      <SideResizer />
      {openDoc && (
        <Detail doc={openDoc} categories={categories} docGroups={nav.docGroups} addCategoryEx={addCategoryEx} onClose={() => setOpenId(null)} bookCash={bookCash} txs={txs} accounts={accounts} linkTx={linkTx}
          saveDoc={saveDoc} trashDoc={trashDoc} reanalyze={reanalyze} notify={notify} />
      )}
      {shareData && <ShareWin data={shareData} onClose={() => setShareData(null)} />}
      {pdfView && <PdfViewWin data={pdfView} onClose={() => setPdfView(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
    </IconLibCtx.Provider>
  );
}

function DeadlineBadge({ docs }) {
  const n = docs.reduce((s, d) => s + (d.deadlines || []).filter((dl) => !dl.done && daysUntil(dl.date) <= 7).length, 0);
  return n ? <i className="badge">{n}</i> : null;
}
function Badge({ docs }) {
  const n = docs.flatMap((d) => d.deadlines || []).filter((x) => !x.done && daysUntil(x.date) <= 7).length;
  return n ? <b className="badge">{n}</b> : null;
}

/* ---------- Übersicht (Finanz-Look) ---------- */
function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div className="bar"><div style={{ width: pct + "%", background: color }} /></div>;
}
function Donut({ parts, total }) {
  const R = 54, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg viewBox="0 0 140 140" className="donut">
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--line)" strokeWidth="16" />
      {parts.map((p) => {
        const len = total ? (p.v / total) * C : 0;
        const el = <circle key={p.c} cx="70" cy="70" r={R} fill="none" stroke={catMeta(p.c).color} strokeWidth="16"
          strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />;
        off += len; return el;
      })}
      <text x="70" y="66" textAnchor="middle" className="donut-l">Ausgaben</text>
      <text x="70" y="86" textAnchor="middle" className="donut-v">{fmtMoney(total).replace(",00", "")}</text>
    </svg>
  );
}
const HOME_WIDGETS = {
  hero: ["Monatssaldo", 12, "💰", "Einnahmen, Ausgaben, Fixkosten"],
  alerts: ["Offene Rechnungen", 12, "🧾", "Hinweis auf unbezahlte Rechnungen"],
  konten: ["Konten", 4, "🏦", "Kontostände aller Konten"],
  bargeld: ["Bargeld", 4, "💶", "Bestand der Geldbörse"],
  barerfassung: ["Ausgabe erfassen", 4, "✍️", "Sofort-Eingabe für Ausgaben, mit Beleg-Scan"],
  kategorien: ["Ausgaben nach Kategorie", 4, "🍩", "Donut-Diagramm des Monats"],
  verlauf: ["Verlauf", 4, "📊", "6 Monate Einnahmen/Ausgaben"],
  budgets: ["Budgets", 4, "🎯", "Budget pro Kategorie"],
  fristen: ["Nächste Fristen", 4, "⏰", "Zahlungen & Kündigungen"],
  docs: ["Neueste Dokumente", 4, "📄", "Zuletzt hinzugefügt"],
  contracts: ["Verträge & Fixkosten", 4, "📑", "Teuerste laufende Verträge"],
  tx: ["Letzte Buchungen", 4, "💳", "Neueste Kontoumsätze"],
  tax: ["Steuer", 4, "🧮", "Steuerrelevante Belege des Jahres"],
  quick: ["Schnellzugriff", 4, "⚡", "Scannen, Datei, Buchung, Konto"],
  ablage: ["Universal-Ablage", 4, "📥", "Alle Dateien & Ordner – wird automatisch einsortiert"],
};
const HOME_DEFAULT = { order: ["hero", "alerts", "konten", "bargeld", "kategorien", "verlauf", "budgets", "fristen"], hidden: ["docs", "contracts", "tx", "tax", "quick"], w: {}, h: {}, gap: 16 };
function migrateLayout(l) {
  if (!l) return JSON.parse(JSON.stringify({ ...HOME_DEFAULT, order: ["ablage", ...HOME_DEFAULT.order], seenAblage: true }));
  if (!l.seenAblage) l = { ...l, seenAblage: true, order: l.order.includes("ablage") ? l.order : ["ablage", ...l.order], hidden: (l.hidden || []).filter((x) => x !== "ablage") };
  if (l.size && !l.w) { const conv = { "1": 4, "2": 8, full: 12 }; l = { ...l, w: Object.fromEntries(Object.entries(l.size).map(([k, v]) => [k, conv[v] || 4])) }; }
  return { gap: 16, h: {}, w: {}, ...l };
}

/* ======================= Ausgabe (Kassenbon erfassen, Positionen, QR) ======================= */
const ITEM_CATS_DEF = ["Lebensmittel", "Getränke", "Obst & Gemüse", "Fleisch & Fisch", "Milchprodukte", "Brot & Backwaren", "Süßes & Snacks", "Alkohol",
  "Drogerie & Hygiene", "Haushalt & Reinigung", "Tierbedarf", "Baby & Kind", "Kleidung", "Elektronik", "Gastronomie", "Treibstoff", "Pfand", "Rabatt", "Sonstiges"];
const itemCats = () => { const l = ls.get("itemCats", null); return Array.isArray(l) && l.length ? l : ITEM_CATS_DEF; };
const parseAmt = (x) => { const v = Number(String(x ?? "").replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return Number.isFinite(v) ? v : NaN; };
const amtStr = (v) => (v == null || isNaN(v) ? "" : (Math.round(v * 100) / 100).toFixed(2).replace(".", ","));
const GENERIC_DOC_CATS = ["Rechnungen", "Sonstiges", "Garantie & Kaufbelege", "Verträge"];

function ExpenseForm({ accounts, txs, docs, categories, onSave, onScan, onUpload, addCategory, suggestCat, notify, initAccount }) {
  const today = todayISO();
  const cashAcc = accounts.find((a) => a.kind === "cash");
  const lastAcc = ls.get("expAcc", "");
  const defAcc = initAccount && accounts.some((a) => a.id === initAccount) ? initAccount : accounts.some((a) => a.id === lastAcc) ? lastAcc : cashAcc?.id || accounts[0]?.id || "new-cash";
  const blank = () => ({ dir: "out", merchant: "", amount: "", date: today, accountId: defAcc, category: "", note: "", items: [], docId: null, file: null, url: null, qr: null, touched: {} });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false), [qrOpen, setQrOpen] = useState(false), [extraCats, setExtraCats] = useState([]);
  const [icats, setIcats] = useState(itemCats);
  const fileRef = useRef();
  const set = (p, touch) => setF((x) => ({ ...x, ...p, touched: touch ? { ...x.touched, ...Object.fromEntries(Object.keys(p).map((k) => [k, true])) } : x.touched }));
  const doc = f.docId ? docs.find((d) => d.id === f.docId) : null;
  const reading = doc?.status === "processing";
  // Nach dem Auslesen durch die KI die Felder füllen (vom Nutzer Geändertes bleibt)
  const filled = useRef(null);
  useEffect(() => {
    if (!doc || doc.status !== "done" || filled.current === doc.id) return;
    filled.current = doc.id;
    setF((x) => {
      const t = x.touched, merchant = t.merchant && x.merchant ? x.merchant : doc.merchant || doc.sender || x.merchant;
      const items = x.items.length ? x.items : (doc.lineItems || []).map((it) => ({ ...it, id: uid(), qty: String(Math.round((+it.qty || 1) * 1000) / 1000).replace(".", ","), total: amtStr(it.total) }));
      const docCat = categories.includes(doc.category) && !GENERIC_DOC_CATS.includes(doc.category) ? doc.category : "";
      return { ...x, merchant,
        amount: t.amount && x.amount ? x.amount : doc.amount?.total != null ? amtStr(doc.amount.total) : x.amount,
        date: t.date ? x.date : pastOrToday(doc.purchaseDate || doc.documentDate, today),
        category: t.category && x.category ? x.category : docCat || suggestCat(merchant) || x.category,
        dir: doc.direction === "einnahme" ? "in" : x.dir, items };
    });
    notify(doc.lineItems?.length ? `Beleg ausgelesen: ${doc.lineItems.length} Position${doc.lineItems.length === 1 ? "" : "en"}` : "Beleg ausgelesen");
  }, [doc?.status, doc?.id]);
  useEffect(() => () => f.url && URL.revokeObjectURL(f.url), []);

  const attach = async (file, opts = {}) => {
    if (f.url) URL.revokeObjectURL(f.url);
    const url = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setF((x) => ({ ...x, file, url, docId: null }));
    filled.current = null;
    const id = await onUpload(file, opts);
    if (id) setF((x) => ({ ...x, docId: id }));
  };
  const onQr = (text) => {
    setQrOpen(false);
    const q = parseReceiptQR(text);
    if (!q) return notify("Kein Kassenbon-QR erkannt (RKSV/TSE). Tipp: Beleg stattdessen scannen – die KI liest ihn aus.");
    const known = q.register && txs.find((t) => t.receiptQr?.register === q.register && t.counterparty);
    setF((x) => ({ ...x, qr: q, amount: x.touched.amount && x.amount ? x.amount : amtStr(q.total), date: x.touched.date ? x.date : pastOrToday(q.date, today),
      merchant: x.merchant || known?.counterparty || "", category: x.category || known?.category || "" }));
    notify(`QR-Code gelesen: ${fmtMoney(q.total)}${q.date ? " · " + fmtDate(q.date) : ""}${known ? " · " + known.counterparty : ""}`);
  };
  const items = f.items, setItems = (fn) => setF((x) => ({ ...x, items: typeof fn === "function" ? fn(x.items) : fn }));
  const itemSum = items.reduce((s, it) => s + (parseAmt(it.total) || 0), 0);
  const val = parseAmt(f.amount);
  const total = val > 0 ? val : items.length ? itemSum : NaN;
  const diff = items.length && val > 0 ? Math.round((val - itemSum) * 100) / 100 : 0;
  const cat = f.category || suggestCat(f.merchant) || "Lebensmittel & Haushalt";
  const ok = total > 0 && f.date && f.merchant.trim() && !busy;
  const cats = [...new Set([...categories, ...extraCats, cat])];
  const merchants = useMemo(() => {
    const m = {}; txs.forEach((t) => { if (t.counterparty && t.amount < 0) m[t.counterparty] = (m[t.counterparty] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 300).map((x) => x[0]);
  }, [txs.length]);
  const save = async () => {
    if (!ok) return; setBusy(true);
    try {
      const it = items.filter((x) => x.name.trim() || parseAmt(x.total)).map((x) => ({ name: x.name.trim(), qty: parseAmt(x.qty) || 1, total: Math.round((parseAmt(x.total) || 0) * 100) / 100, category: x.category || "Sonstiges" }));
      const date = pastOrToday(f.date, today);
      ls.set("expAcc", f.accountId);
      await onSave({ accountId: f.accountId, date, amount: f.dir === "out" ? -total : total, counterparty: f.merchant.trim(), purpose: f.note.trim(),
        category: f.dir === "in" && !f.category ? "Einnahmen" : cat, ...(it.length ? { items: it } : {}),
        ...(f.qr ? { receiptQr: { kind: f.qr.kind, register: f.qr.register, receiptNo: f.qr.receiptNo } } : {}) },
        { docId: f.docId, file: f.docId ? null : f.file });
      if (f.url) URL.revokeObjectURL(f.url);
      filled.current = null; setF(blank());
    } finally { setBusy(false); }
  };
  const newItemCat = () => { const n = (prompt("Neue Positions-Kategorie:") || "").trim(); if (!n) return null; const l = [...new Set([...icats, n])]; ls.set("itemCats", l); setIcats(l); return n; };

  return (
    <div className="expform">
      <div className="expscan">
        <button className="expbig" onClick={() => onScan((file, o) => attach(file, { ...o, scanned: true }))}>
          <span className="expico">📷</span><b>Beleg scannen</b><small>KI liest Firma, Betrag & Positionen</small>
        </button>
        <button className="expbig" onClick={() => setQrOpen(true)}>
          <span className="expico">▦</span><b>QR-Code</b><small>Registrierkassen-QR (RKSV)</small>
        </button>
        <button className="expbig" onClick={() => fileRef.current.click()}>
          <span className="expico">🖼</span><b>Foto / PDF</b><small>aus Galerie oder Dateien</small>
        </button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const x = e.target.files[0]; e.target.value = ""; if (x) attach(x); }} />
      </div>
      {(f.file || f.qr) && (
        <div className="expatt">
          {f.file && (f.url ? <img src={f.url} alt="" /> : <span className="attpdf">PDF</span>)}
          <div className="grow">
            {f.file && <b>{reading ? "KI liest den Beleg …" : doc?.status === "error" ? "Auslesen fehlgeschlagen" : doc?.status === "done" ? "Beleg ausgelesen" : "Beleg wird hochgeladen …"}</b>}
            {f.file && <small className="muted block">{doc?.status === "error" ? doc.error : reading ? "Felder werden gleich automatisch ausgefüllt" : doc?.status === "done" ? `${doc.lineItems?.length || 0} Positionen erkannt` : f.file.name}</small>}
            {f.qr && <small className="muted block">▦ {f.qr.kind} · Beleg {f.qr.receiptNo || "—"}{f.qr.time ? " · " + f.qr.time + " Uhr" : ""}{f.qr.vat?.length ? " · " + f.qr.vat.map((v) => `${v.rate}: ${fmtMoney(v.gross)}`).join(", ") : ""}</small>}
          </div>
          {reading && <span className="spin" aria-hidden="true" />}
          <button className="iconbtn" title="Entfernen" aria-label="Beleg entfernen" onClick={() => { if (f.url) URL.revokeObjectURL(f.url); setF((x) => ({ ...x, file: null, url: null, docId: null, qr: null })); }}>✕</button>
        </div>
      )}
      <div className="seg">
        <button className={f.dir === "out" ? "on" : ""} onClick={() => set({ dir: "out" })}>Ausgabe</button>
        <button className={f.dir === "in" ? "on" : ""} onClick={() => set({ dir: "in" })}>Einnahme</button>
      </div>
      <label>Firma<input list="expmerchants" value={f.merchant} placeholder="z. B. Penny, BILLA, OMV" onChange={(e) => set({ merchant: e.target.value }, true)} /></label>
      <datalist id="expmerchants">{merchants.map((m) => <option key={m} value={m} />)}</datalist>
      <label>Gesamtbetrag<input className="bigamount" inputMode="decimal" placeholder={items.length ? amtStr(itemSum) + " €" : "0,00 €"} value={f.amount} onChange={(e) => set({ amount: e.target.value }, true)} /></label>
      <div className="grid2">
        <label>Datum<input type="date" max={today} value={f.date} onChange={(e) => set({ date: e.target.value > today ? today : e.target.value }, true)} /></label>
        <label>Konto
          <select value={f.accountId} onChange={(e) => set({ accountId: e.target.value }, true)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.icon && a.icon !== "none" ? a.icon : kindIcon(a.kind)} {a.name}</option>)}
            {!cashAcc && <option value="new-cash">💶 Geldbörse (neu)</option>}
          </select>
        </label>
      </div>
      <label>Kategorie
        <select value={cat} onChange={(e) => {
          if (e.target.value !== "__new") return set({ category: e.target.value }, true);
          const n = (prompt("Name der neuen Kategorie:") || "").trim(); if (!n) return;
          addCategory?.(n); setExtraCats((x) => [...x, n]); set({ category: n }, true);
        }}>
          {cats.map((c) => <option key={c}>{c}</option>)}
          {addCategory && <option value="__new">＋ Neue Kategorie …</option>}
        </select>
      </label>
      <div className="expitems">
        <div className="expitemshead"><b>Positionen</b><small className="muted">{items.length ? `${items.length} · ${fmtMoney(itemSum)}` : "optional"}</small></div>
        {items.map((it, i) => (
          <div key={it.id} className="expitem">
            <input className="q" inputMode="decimal" aria-label="Menge" value={it.qty} onChange={(e) => setItems((l) => l.map((x) => (x.id === it.id ? { ...x, qty: e.target.value } : x)))} />
            <span className="x">×</span>
            <input className="n" aria-label="Bezeichnung" placeholder="Artikel" value={it.name} onChange={(e) => setItems((l) => l.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))} />
            <input className="p" inputMode="decimal" aria-label="Preis" placeholder="0,00" value={it.total} onChange={(e) => setItems((l) => l.map((x) => (x.id === it.id ? { ...x, total: e.target.value } : x)))} />
            <select className="c" aria-label="Kategorie der Position" value={it.category} onChange={(e) => {
              const v = e.target.value === "__new" ? newItemCat() : e.target.value; if (v) setItems((l) => l.map((x) => (x.id === it.id ? { ...x, category: v } : x)));
            }}>
              {[...new Set([...icats, it.category])].map((c) => <option key={c}>{c}</option>)}
              <option value="__new">＋ Neue …</option>
            </select>
            <button className="iconbtn" title="Position entfernen" aria-label="Position entfernen" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))}>✕</button>
          </div>
        ))}
        <div className="expitemsfoot">
          <button className="link" onClick={() => setItems((l) => [...l, { id: uid(), qty: "1", name: "", total: "", category: l[l.length - 1]?.category || icats[0] }])}>＋ Position</button>
          {diff !== 0 && <span className={"expdiff" + (Math.abs(diff) > 0.009 ? " warn" : "")}>Differenz {fmtMoney(diff)}
            <button className="link" onClick={() => set({ amount: amtStr(itemSum) }, true)}>Summe übernehmen</button></span>}
        </div>
      </div>
      <label>Notiz (optional)<input value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="z. B. Wocheneinkauf" /></label>
      <button className="btn primary cashsave" disabled={!ok} onClick={save}>{busy ? "Speichert …" : reading ? "Speichern (Beleg wird noch gelesen)" : `Speichern${total > 0 ? " · " + fmtMoney(f.dir === "out" ? -total : total) : ""}`}</button>
      {qrOpen && createPortal(<CodeScanWin title="Kassenbon-QR scannen" onClose={() => setQrOpen(false)} onResult={(code) => onQr(code)} />, document.querySelector(".app") || document.body)}
    </div>
  );
}

function ExpensePage({ accounts, txs, categories, onSave, onScan, onUpload, addCategory, suggestCat, docs, onOpen, openAccount, notify }) {
  const [openId, setOpenId] = useState(null);
  const month = todayISO().slice(0, 7);
  const list = txs.filter((t) => t.manual).sort((a, b) => (b.date + (b.createdAt || "")).localeCompare(a.date + (a.createdAt || ""))).slice(0, 40);
  const monthOut = txs.filter((t) => t.manual && t.amount < 0 && t.date.startsWith(month)).reduce((s, t) => s - t.amount, 0);
  const cash = accounts.filter((a) => a.kind === "cash");
  const accOf = (id) => accounts.find((a) => a.id === id);
  return (
    <div className="exppage">
      <section className="tile">
        <div className="tilehead"><b>Ausgabe erfassen</b><small>alle Konten</small></div>
        <ExpenseForm accounts={accounts} txs={txs} docs={docs} categories={categories} onSave={onSave} onScan={onScan} onUpload={onUpload} addCategory={addCategory} suggestCat={suggestCat} notify={notify} />
      </section>
      <section className="tile">
        <div className="tilehead"><b>Erfasste Ausgaben</b><small>{monthLabel(month)}: {fmtMoney(monthOut)}</small>
          {(() => { const all = txs.filter((t) => t.manual).sort((a, b) => a.date.localeCompare(b.date)); const accN = (id) => accounts.find((a) => a.id === id)?.name || "";
            const pos = all.flatMap((t) => (t.items || []).map((i) => [t.date, t.counterparty || "", accN(t.accountId), i.name, i.qty, i.qty ? r2e(i.total / i.qty) : "", r2e(i.total), i.category || ""]));
            const bons = all.map((t) => [t.date, t.counterparty || "", accN(t.accountId), t.category || "", (t.items || []).length, -t.amount, t.receiptQr?.receiptNo || "", t.docId ? "ja" : ""]);
            const PH = ["Datum", "Geschäft", "Konto", "Artikel", "Menge", "Einzelpreis €", "Gesamt €", "Warengruppe"], BH = ["Datum", "Geschäft", "Konto", "Kategorie", "Positionen", "Betrag €", "Beleg-Nr.", "Beleg"];
            return <ExportMenu items={[{ head: `${all.length} Ausgaben · ${pos.length} Positionen` },
              { label: "📊 Excel (.xlsx)", sub: "Blätter: Positionen, Einkäufe, Warengruppen", run: () => { const g = {}; pos.forEach((p) => { const o = g[p[7] || "Sonstiges"] || (g[p[7] || "Sonstiges"] = [0, 0]); o[0] += p[6]; o[1]++; });
                downloadXlsx(`einkaeufe-${isoToday()}.xlsx`, [{ name: "Positionen", head: PH, rows: pos }, { name: "Einkäufe", head: BH, rows: bons }, { name: "Warengruppen", head: ["Warengruppe", "Summe €", "Positionen"], rows: Object.entries(g).sort((a, b) => b[1][0] - a[1][0]).map(([k, [v, n]]) => [k, r2e(v), n]) }]); } },
              { label: "📄 Positionen CSV", run: () => downloadCsv(`einkauf-positionen-${isoToday()}.csv`, PH, pos) },
              { label: "📄 Einkäufe CSV", run: () => downloadCsv(`einkaeufe-${isoToday()}.csv`, BH, bons) }]} />; })()}</div>
        {cash.map((a) => (
          <div key={a.id} className="frow click" onClick={() => openAccount(a.id)}>
            <span className="caticon" style={{ width: 40, height: 40, background: "#16a34a22", fontSize: 20 }}><AccIcon a={a} className="acci" force /></span>
            <div className="grow"><b style={accStyle(a)}>{a.name}</b><small className="muted block">Bargeld-Bestand</small></div>
            <div className="right"><b className={cashBalance(a, txs) < 0 ? "neg" : "pos"}>{fmtMoney(cashBalance(a, txs))}</b></div>
          </div>
        ))}
        {!list.length && <p className="muted small">Noch keine Ausgaben erfasst. Scanne einen Kassenbon – Firma, Betrag, Datum und Positionen werden automatisch ausgefüllt.</p>}
        {list.map((t) => { const d = t.docId && docs.find((x) => x.id === t.docId), a = accOf(t.accountId), open = openId === t.id; return (
          <div key={t.id} className="expentry">
            <div className="frow click" onClick={() => setOpenId(open ? null : t.id)}>
              <CatIcon c={t.category} size={36} />
              <div className="grow"><b>{t.counterparty || t.purpose || "Buchung"}</b>
                <small className="muted block">{fmtDate(t.date)} · {t.category}{a ? " · " + a.name : ""}{t.items?.length ? ` · ${t.items.length} Pos.` : ""}{d ? " · 📎" : ""}</small></div>
              <div className="right"><b className={t.amount < 0 ? "neg" : "pos"}>{fmtMoney(t.amount)}</b></div>
            </div>
            {open && (
              <div className="expdetail">
                {t.items?.length ? t.items.map((it, i) => (
                  <div key={i} className="exprow"><span className="muted">{String(it.qty).replace(".", ",")}×</span><span className="grow">{it.name}</span><span className="chip sm">{it.category}</span><b>{fmtMoney(it.total)}</b></div>
                )) : <p className="muted small">Keine Positionen erfasst.</p>}
                {t.purpose && <p className="small">{t.purpose}</p>}
                {d && <button className="link" onClick={() => onOpen(d.id)}>📎 Beleg öffnen</button>}
              </div>
            )}
          </div>); })}
      </section>
    </div>
  );
}

/* ======================= Firmen-Auswertung ======================= */
function BizReport({ docs, setTab, editing = false, setEditing = () => {} }) {
  const [list] = useLsState("invoices", []);
  const [fb] = useLsState("fbook", FB_EMPTY);
  const thisYear = todayISO().slice(0, 4);
  const [year, setYear] = useState(thisYear);
  const years = [...new Set([thisYear, ...list.map((x) => (x.date || "").slice(0, 4)).filter(Boolean)])].sort().reverse();
  const inY = (d) => year === "alle" || (d || "").startsWith(year);
  const inv = list.filter((x) => x.kind === "rechnung" && !["entwurf", "storniert"].includes(invState(x)));
  const yInv = inv.filter((x) => inY(x.date));
  const net = (x) => invTotal({ ...x, fee: 0 }), sum = (l, f = invTotal) => l.reduce((s, x) => s + f(x), 0);
  const billed = sum(yInv, net);
  const paidL = inv.filter((x) => invState(x) === "bezahlt" && inY(x.paidAt || x.date));
  const received = sum(paidL);
  const openL = inv.filter((x) => ["offen", "überfällig"].includes(invState(x)));
  const overL = openL.filter((x) => invState(x) === "überfällig");
  const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const paidWithDates = yInv.filter((x) => invState(x) === "bezahlt" && x.paidAt && x.date);
  const avgDays = paidWithDates.length ? Math.round(paidWithDates.reduce((s, x) => s + Math.max(0, days(x.date, x.paidAt)), 0) / paidWithDates.length) : null;
  const onTime = paidWithDates.filter((x) => x.paidAt <= invDue(x)).length;
  // Betriebsausgaben: Dokumente „Firma“ mit Ausgabe + Kilometergeld aus dem Fahrtenbuch
  const bizDocs = docs.filter((d) => d.scope === "firma" && d.direction === "ausgabe" && d.amount?.total && inY(d.documentDate || d.createdAt));
  const expDocs = bizDocs.reduce((s, d) => s + Math.abs(d.amount.total), 0);
  const bizTrips = (fb.entries || []).filter((e) => e.type === "trip" && e.purpose === "business" && inY(e.date));
  const bizKm = bizTrips.reduce((s, e) => s + Math.max(0, (+e.endKm || 0) - (+e.startKm || 0)), 0);
  const kmRate = +(fb.settings?.kmRate ?? 0.5);
  const kmMoney = Math.min(bizKm, 30000) * kmRate;
  const profit = received - expDocs - kmMoney;
  // Monate
  const months = year === "alle" ? (() => { const t = todayISO().slice(0, 7); const o = []; for (let i = 11; i >= 0; i--) o.push(addMon(t, -i)); return o; })() : Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const chart = months.map((m) => ({ k: m, label: monthLabel(m).split(" ")[0], a: sum(inv.filter((x) => invState(x) === "bezahlt" && (x.paidAt || x.date || "").startsWith(m))), b: sum(inv.filter((x) => (x.date || "").startsWith(m)), net) }));
  // Kunden
  const byCust = {};
  yInv.forEach((x) => { const k = x.customer?.name || "Ohne Kunde"; const c = byCust[k] || (byCust[k] = { k, v: 0, n: 0, open: 0, late: 0 }); c.v += net(x); c.n++; if (["offen", "überfällig"].includes(invState(x))) c.open += invTotal(x); if ((x.reminders || []).length) c.late++; });
  const custs = Object.values(byCust).sort((a, b) => b.v - a.v);
  // Leistungen
  const byItem = {};
  yInv.forEach((x) => (x.items || []).forEach((it) => { const k = normName(it.text || "Position").split("\n")[0].slice(0, 60); const o = byItem[k] || (byItem[k] = { k, v: 0, q: 0, unit: it.unit || "" }); o.v += (+it.qty || 0) * (+it.price || 0); o.q += +it.qty || 0; }));
  const items = Object.values(byItem).sort((a, b) => b.v - a.v).slice(0, 10);
  // Angebote
  const offers = list.filter((x) => x.kind === "angebot" && x.status !== "entwurf" && inY(x.date));
  const accepted = offers.filter((x) => x.status === "angenommen"), declined = offers.filter((x) => x.status === "abgelehnt");
  // Mahnungen
  const rem = inv.flatMap((x) => (x.reminders || []).map((r) => ({ x, r }))).filter((h) => inY(h.r.date));
  const feesPaid = inv.filter((x) => invState(x) === "bezahlt" && inY(x.paidAt || x.date)).reduce((s, x) => s + (+x.fee || 0), 0);
  const withRem = yInv.filter((x) => (x.reminders || []).length).length;
  // Kleinunternehmer
  const kuYear = year === "alle" ? thisYear : year;
  const kuRev = sum(inv.filter((x) => (x.date || "").startsWith(kuYear)), net);
  const kuPct = Math.min(100, (kuRev / KU_LIMIT) * 100);
  return (
    <div className="anapage">
      <div className="anahead">
        <div className="chips anaaccs">{[...years, "alle"].map((y) => <button key={y} className={"chip" + (year === y ? " on" : "")} onClick={() => setYear(y)}>{y === "alle" ? "Gesamt" : y}</button>)}
          <ExportMenu label="⬇︎ Export" items={[
            { head: `Zeitraum: ${year === "alle" ? "gesamt" : year}` },
            { label: "📦 Steuerberater-Paket (ZIP)", sub: "EAR als Excel + PDF, Rechnungsausgangsbuch, offene Posten, alle Rechnungen und Belege", run: async () => saveBlob(await steuerberaterZip(year, list, docs, fb, { ...CO_DEFAULT, ...ls.get("company", {}) }), `Steuerberater-${year === "alle" ? "gesamt" : year}.zip`) },
            { label: "📊 Einnahmen-Ausgaben-Rechnung Excel", run: () => downloadXlsx(`EAR-${year}.xlsx`, earSheets(year, earData(year, list, docs, fb))) },
            { label: "🖨 Einnahmen-Ausgaben-Rechnung PDF", run: async () => saveBlob(await earPdf(year, earData(year, list, docs, fb), ls.get("company", {}).name), `EAR-${year}.pdf`) },
            { label: "📒 Rechnungsausgangsbuch Excel", run: () => downloadXlsx(`Rechnungsausgangsbuch-${year}.xlsx`, [{ name: "Rechnungen", head: INV_HEAD, rows: list.filter((x) => x.kind === "rechnung" && x.number && inY(x.date)).map(invRow) }]) },
            { label: "📮 Offene Posten PDF", run: async () => saveBlob(await openItemsPdf(list), `Offene-Posten-${isoToday()}.pdf`) }]} /></div>
      </div>
      <WidgetBoard storeKey="bizGrid" title="Firmenauswertung" editing={editing} setEditing={setEditing}>
      <W k="kennzahlen" label="Kennzahlen"><div className="anakpis">
        <div className="tile kpi"><small className="muted">Fakturiert</small><div className="kpiv">{fmtMoney(billed)}</div><small className="muted">{yInv.length} Rechnungen</small></div>
        <div className="tile kpi"><small className="muted">Eingegangen</small><div className="kpiv pos">{fmtMoney(received)}</div><small className="muted">{paidL.length} bezahlt</small></div>
        <div className="tile kpi click" onClick={() => setTab("invoices")}><small className="muted">Offen</small><div className={"kpiv" + (overL.length ? " neg" : "")}>{fmtMoney(sum(openL))}</div><small className={overL.length ? "warnc" : "muted"}>{openL.length} offen{overL.length ? ` · ${overL.length} überfällig` : ""}</small></div>
        <div className="tile kpi"><small className="muted">Ø Zahlungsdauer</small><div className="kpiv">{avgDays != null ? avgDays + " Tage" : "—"}</div><small className="muted">{paidWithDates.length ? `${pct(onTime, paidWithDates.length)} % pünktlich` : "noch keine Zahlungen"}</small></div>
      </div></W>
      <W k="einnahmen-ausgaben-rechnung" label="Einnahmen-Ausgaben-Rechnung"><section className="tile">
        <div className="tilehead"><b>Einnahmen-Ausgaben-Rechnung</b><small>{year === "alle" ? "gesamt" : year} · vereinfacht</small></div>
        <div className="earrow"><span>Betriebseinnahmen (bezahlte Rechnungen)</span><b className="pos">{fmtMoney(received)}</b></div>
        <div className="earrow"><span>Betriebsausgaben (Dokumente „Firma“, {bizDocs.length})</span><b className="neg">−{fmtMoney(expDocs)}</b></div>
        <div className="earrow"><span>Kilometergeld ({bizKm.toLocaleString("de-AT")} km × {fmtMoney(kmRate)}){bizKm > 30000 ? " · max. 30.000 km" : ""}</span><b className="neg">−{fmtMoney(kmMoney)}</b></div>
        <div className="earrow total"><span>Gewinn (vor Steuern & SV)</span><b className={profit >= 0 ? "pos" : "neg"}>{fmtMoney(profit)}</b></div>
        <small className="muted">Nur eine Übersicht aus den Daten der App – keine Steuerberatung. Ausgaben zählen, wenn das Dokument als „Firma“ markiert ist.</small>
      </section></W>
      <W k="umsatz-pro-monat" label="Umsatz pro Monat"><section className="tile">
        <div className="tilehead"><b>Umsatz pro Monat</b></div>
        <div className="kuhead"><small className="muted">Kleinunternehmergrenze {kuYear}</small><small><b>{fmtMoney(kuRev)}</b> / {fmtMoney(KU_LIMIT)} · {Math.round(kuPct)} %</small></div>
        <div className="kubar"><div style={{ width: kuPct + "%", background: kuPct > 90 ? "var(--red)" : kuPct > 75 ? "var(--warn)" : "var(--acc)" }} /></div>
        <MiniBars data={chart} h={140} />
        <div className="legend"><span className="dot inc" />Zahlungseingang <span className="dot out" />fakturiert</div>
      </section></W>
        <W k="kunden" label="Kunden" w="half"><section className="tile">
          <div className="tilehead"><b>Kunden</b><small>{custs.length}</small></div>
          {custs.slice(0, 10).map((c) => (
            <div key={c.k} className="frow"><div className="grow"><div className="row1"><span>{c.k}</span><span><b>{fmtMoney(c.v)}</b></span></div>
              <Bar value={c.v} max={custs[0].v} color="var(--acc)" />
              <small className="muted">{c.n} Rechnung{c.n === 1 ? "" : "en"} · {pct(c.v, billed)} %{c.open ? <span className="warnc"> · offen {fmtMoney(c.open)}</span> : ""}{c.late ? ` · ${c.late}× gemahnt` : ""}</small></div></div>))}
          {!custs.length && <p className="muted small">Noch keine Rechnungen in diesem Zeitraum.</p>}
        </section></W>
        <W k="leistungen-und-artikel" label="Leistungen & Artikel" w="half"><section className="tile">
          <div className="tilehead"><b>Leistungen & Artikel</b></div>
          {items.map((x) => (
            <div key={x.k} className="frow"><div className="grow"><div className="row1"><span>{x.k}</span><span><b>{fmtMoney(x.v)}</b></span></div>
              <Bar value={x.v} max={items[0].v} color="#8b5cf6" /><small className="muted">{String(Math.round(x.q * 100) / 100).replace(".", ",")} {x.unit} · {pct(x.v, billed)} %</small></div></div>))}
          {!items.length && <p className="muted small">Keine Positionen.</p>}
        </section></W>
        <W k="angebote" label="Angebote" w="half"><section className="tile">
          <div className="tilehead"><b>Angebote</b></div>
          <div className="minikpis">
            <div><small className="muted">Gestellt</small><b>{offers.length}</b><small className="muted">{fmtMoney(sum(offers, net))}</small></div>
            <div><small className="muted">Angenommen</small><b className="pos">{accepted.length}</b><small className="muted">{offers.length ? pct(accepted.length, offers.length) + " %" : "—"}</small></div>
            <div><small className="muted">Abgelehnt</small><b>{declined.length}</b><small className="muted">{fmtMoney(sum(declined, net))}</small></div>
          </div>
        </section></W>
        <W k="mahnwesen" label="Mahnwesen" w="half"><section className="tile click" onClick={() => setTab("mahnungen")}>
          <div className="tilehead"><b>Mahnwesen</b><span className="muted">›</span></div>
          <div className="minikpis">
            <div><small className="muted">Versendet</small><b>{rem.length}</b><small className="muted">Erinnerungen & Mahnungen</small></div>
            <div><small className="muted">Gemahnte Rechnungen</small><b>{withRem}</b><small className="muted">{yInv.length ? pct(withRem, yInv.length) + " % aller" : "—"}</small></div>
            <div><small className="muted">Mahngebühren</small><b>{fmtMoney(feesPaid)}</b><small className="muted">eingenommen</small></div>
          </div>
          {overL.slice(0, 4).map((x) => (
            <div key={x.id} className="frow"><div className="grow"><b>{x.number}</b><small className="muted block">{x.customer?.name} · seit {fmtDate(invDueEff(x))} fällig · {(x.reminders || []).length ? remindName((x.reminders || []).length - 1) : "noch nicht gemahnt"}</small></div>
              <div className="right"><b className="neg">{fmtMoney(invTotal(x))}</b></div></div>))}
        </section></W>
      </WidgetBoard>
    </div>
  );
}

/* ======================= Fahrtenbuch (Stil Drivvo) ======================= */
const FB_EMPTY = { vehicles: [], entries: [], reminders: [], settings: { kmRate: 0.5 } };
const ENERGY = ["Super 95", "Super 98", "Diesel", "Strom (kWh)", "Autogas (LPG)", "CNG"];
const FUELS = ["Super 95", "Super 98", "Diesel", "Hybrid (Benzin)", "Hybrid (Diesel)", "Plug-in-Hybrid (Benzin)", "Plug-in-Hybrid (Diesel)", "Strom (kWh)", "Autogas (LPG)", "CNG"];
const isElec = (f) => /Strom/.test(f || "");
const vehHasFuel = (v) => !/^Strom/.test(v?.fuel || "");
const vehHasPlug = (v) => /Plug-in|^Strom/.test(v?.fuel || "");
const vehDefFuel = (v) => { const f = v?.fuel || "Super 95"; return /^Strom/.test(f) ? "Strom (kWh)" : /Diesel/.test(f) ? "Diesel" : /Hybrid/.test(f) ? "Super 95" : f; };
const ecFuel = (f) => (/Diesel/.test(f) ? "DIE" : /CNG/.test(f) ? "GAS" : "SUP");
const unitOf = (f) => (isElec(f) ? "kWh" : "l");
const FB_EXP = [["Service", "🔧"], ["Reparatur", "🛠️"], ["Reifen", "🛞"], ["Versicherung", "🛡️"], ["Motorbezogene Steuer", "🏛️"], ["Pickerl (§57a)", "✅"], ["Vignette & Maut", "🛣️"], ["Parken", "🅿️"], ["Autowäsche", "🧽"], ["Zubehör", "🧰"], ["Strafe", "🚨"], ["Sonstiges", "📁"]];
const FB_ICON = { fuel: "⛽", expense: "🧾", trip: "🛣️" };
const VEH_ICONS = ["🚗", "🚙", "🚐", "🛻", "🏍️", "🛵", "🚚", "⚡"];
const kmFmt = (v) => (v == null || isNaN(v) ? "—" : Math.round(v).toLocaleString("de-AT") + " km");

function consOf(fuel) {
  const cons = []; let lastFull = null, acc = 0;
  for (const f of fuel) {
    if (lastFull != null) acc += +f.liters || 0;
    if (f.full) { if (lastFull != null && f.km > lastFull.km && acc > 0) cons.push({ date: f.date, km: f.km, v: (acc / (f.km - lastFull.km)) * 100, dist: f.km - lastFull.km }); lastFull = f; acc = 0; }
  }
  const dist = cons.reduce((s, c) => s + c.dist, 0);
  return { cons, avg: dist ? (cons.reduce((s, c) => s + (c.v * c.dist) / 100, 0) / dist) * 100 : null, last: cons[cons.length - 1]?.v ?? null };
}
function fbStats(v, entries) {
  const e = entries.filter((x) => x.vid === v.id);
  const kms = [+v.startKm || 0, ...e.map((x) => +(x.type === "trip" ? x.endKm : x.km) || 0)];
  const odo = Math.max(...kms);
  const fuel = e.filter((x) => x.type === "fuel" && +x.km).sort((a, b) => a.km - b.km || a.date.localeCompare(b.date));
  // Verbrauch nach Volltank-Methode – Kraftstoff und Strom getrennt (Hybrid / Plug-in)
  const liq = consOf(fuel.filter((x) => !isElec(x.fuel))), el = consOf(fuel.filter((x) => isElec(x.fuel)));
  const costs = e.filter((x) => x.type !== "trip").reduce((s, x) => s + (+x.total || 0), 0);
  const firstKm = Math.min(...kms);
  const perKm = odo > firstKm ? costs / (odo - firstKm) : null;
  return { odo, cons: liq.cons, avg: liq.avg, last: liq.last, consE: el.cons, avgE: el.avg, lastE: el.last, costs, perKm, e };
}

// Standort ermitteln und Tankstellen / Ladestationen / Ort abfragen
function getPos() {
  return new Promise((ok, fail) => {
    if (!navigator.geolocation) return fail(new Error("Standort wird von diesem Gerät nicht unterstützt"));
    navigator.geolocation.getCurrentPosition((p) => ok(p.coords), (e) => fail(new Error(e.code === 1 ? "Standortzugriff verweigert – in den Browser-Einstellungen erlauben" : "Standort nicht verfügbar")), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}
async function nearby(kind, extra = {}) {
  const c = await getPos();
  const qs = new URLSearchParams({ kind, lat: c.latitude.toFixed(5), lon: c.longitude.toFixed(5), ...extra });
  const r = await fetch("/api/nearby?" + qs, { headers: { "x-app-token": ls.get("appToken", "") } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
  return { ...j, lat: c.latitude, lon: c.longitude };
}

function FbEntryWin({ init, vehicles, accounts, txs = [], docs = [], onSave, onDelete, onClose, lastKm, fuelPrice, onScan, onUpload, onOpen }) {
  const [x, setX] = useState(() => ({ date: todayISO(), ...init, acct: init.txId ? "link" : init.acct || "none" }));
  const set = (p) => setX((o) => ({ ...o, ...p }));
  const v = vehicles.find((y) => y.id === x.vid) || vehicles[0];
  const isNew = !init.id;
  const t = x.type;
  const n = (k) => parseAmt(x[k]);
  const [near, setNear] = useState(null); // { busy, err, stations, source, kind }
  const [placeBusy, setPlaceBusy] = useState("");
  const [txQ, setTxQ] = useState("");
  const fileRef = useRef();
  const elec = isElec(x.fuel || vehDefFuel(v));
  // Tanken: aus zwei Werten den dritten berechnen
  const calc = (p, base) => {
    const o = { ...(base || x), ...p }, L = parseAmt(o.liters), P = parseAmt(o.price), T = parseAmt(o.total);
    if ("liters" in p || "price" in p) { if (L > 0 && P > 0) o.total = amtStr(L * P); }
    else if ("total" in p && T > 0) { if (P > 0) o.liters = amtStr(T / P); else if (L > 0) o.price = (T / L).toFixed(3).replace(".", ","); }
    return o;
  };
  const doc = x.docId ? docs.find((d) => d.id === x.docId) : null;
  // Beleg ausgelesen → Felder füllen
  const filled = useRef(null);
  useEffect(() => {
    if (!doc || doc.status !== "done" || filled.current === doc.id) return;
    filled.current = doc.id;
    setX((o) => {
      let p = { ...o };
      if (!o.total && doc.amount?.total) p.total = amtStr(doc.amount.total);
      if (!o.station && (doc.merchant || doc.sender)) p.station = doc.merchant || doc.sender;
      const d = doc.purchaseDate || doc.documentDate; if (d) p.date = pastOrToday(d, todayISO());
      if (o.type === "fuel") {
        const it = (doc.lineItems || []).find((i) => i.qty > 3 && i.unitPrice > 0.2 && i.unitPrice < 4) || (doc.lineItems || []).find((i) => /super|diesel|benzin|strom|kwh|lpg|cng/i.test(i.name));
        if (it) { if (!o.liters) p.liters = amtStr(it.qty); if (!o.price && it.unitPrice) p.price = String(it.unitPrice).replace(".", ","); if (!o.total) p.total = amtStr(it.total); }
      }
      return p;
    });
  }, [doc?.status, doc?.id]);
  const attach = async (file, opts = {}) => { set({ attName: file.name, attBusy: true }); const id = await onUpload(file, opts); set({ docId: id || null, attBusy: false }); };
  const [qrOpen, setQrOpen] = useState(false);
  const onQr = (text) => {
    setQrOpen(false);
    const q = parseReceiptQR(text);
    if (!q) return alert("Kein Kassenbon-QR erkannt (RKSV/TSE). Tipp: Beleg stattdessen scannen – die KI liest ihn aus.");
    setX((o) => { const p = { ...o, receiptQr: q }; if (q.total != null) { if (o.type === "fuel") Object.assign(p, calc({ total: amtStr(q.total) }, p)); else p.total = amtStr(q.total); } if (q.date) p.date = pastOrToday(q.date, todayISO()); return p; });
  };
  const findNear = async () => {
    const kind = elec ? "charge" : "fuel";
    setNear({ busy: true, kind });
    try { const j = await nearby(kind, kind === "fuel" ? { fuel: ecFuel(x.fuel || vehDefFuel(v)) } : {}); setNear({ ...j, kind, busy: false }); }
    catch (e) { setNear({ kind, busy: false, err: e.message }); }
  };
  const pickStation = (s) => {
    let o = { ...x, station: s.name + (s.address ? ` · ${s.address}` : ""), lat: s.lat, lon: s.lon };
    if (s.price && !n("price")) o = calc({ price: String(s.price).replace(".", ",") }, o);
    setX(o); setNear(null);
  };
  const fillPlace = async (field) => {
    setPlaceBusy(field);
    try { const j = await nearby("place"); set({ [field]: j.city && j.street ? `${j.city}, ${j.street}` : j.label || j.city }); }
    catch (e) { alert(e.message); } finally { setPlaceBusy(""); }
  };
  // passende Kontobuchungen (Ausgang, Betrag & Datum in der Nähe)
  const amt = n("total");
  const cands = useMemo(() => txs.filter((tx) => tx.amount < 0 && (!tx.fbId || tx.fbId === x.id || tx.id === x.txId))
    .map((tx) => ({ tx, score: (amt > 0 && Math.abs(-tx.amount - amt) < 0.01 ? 6 : amt > 0 && Math.abs(-tx.amount - amt) < 1 ? 2 : 0) + (Math.abs(new Date(tx.date) - new Date(x.date)) < 4 * 864e5 ? 3 : 0)
      + (/tank|omv|bp|shell|eni|avanti|jet|turm|diskont|a1|ionity|smatrics|wien energie|energie|garage|autohaus|öamtc|arbö|asfinag|park/i.test(tx.counterparty + " " + tx.purpose) ? 1 : 0) }))
    .filter(({ tx }) => !txQ || norm(`${tx.counterparty} ${tx.purpose} ${amtStr(-tx.amount)}`).includes(norm(txQ)))
    .sort((a, b) => b.score - a.score || b.tx.date.localeCompare(a.tx.date)).slice(0, txQ ? 30 : 8), [txs.length, amt, x.date, txQ, x.txId]);
  const linked = x.txId && txs.find((tx) => tx.id === x.txId);
  const ok = x.vid && x.date && (t === "trip" ? n("endKm") > n("startKm") && (x.to || "").trim() : t === "fuel" ? n("total") > 0 && n("liters") > 0 : n("total") > 0 && (x.cat || "").trim())
    && !(x.acct === "link" && !x.txId);
  const save = () => {
    if (!ok) return;
    const out = { ...x, id: x.id || uid() };
    delete out.attBusy;
    ["km", "startKm", "endKm"].forEach((k) => { if (out[k] !== undefined && out[k] !== "") out[k] = Math.round(parseAmt(out[k])); });
    ["liters", "price", "total"].forEach((k) => { if (out[k] !== undefined && out[k] !== "") out[k] = parseAmt(out[k]); });
    if (t === "fuel" && !out.fuel) out.fuel = vehDefFuel(v);
    onSave(out);
  };
  const title = { fuel: elec ? "Laden" : "Tanken", expense: "Ausgabe", trip: "Fahrt" }[t];
  const placeBtn = (f) => <button className="iconbtn fbgps" title="Aktuellen Ort einsetzen" aria-label="Aktuellen Ort einsetzen" disabled={!!placeBusy} onClick={() => fillPlace(f)}>{placeBusy === f ? <span className="spin" /> : "📍"}</button>;
  return (
    <Win id={"fb-" + t} onClose={onClose} small>
      <div className="panelhead"><b>{t === "fuel" && elec ? "⚡" : FB_ICON[t]} {isNew ? title + " erfassen" : title}</b><XBtn /></div>
      {vehicles.length > 1 && <label>Fahrzeug<select value={x.vid} onChange={(e) => set({ vid: e.target.value })}>{vehicles.map((y) => <option key={y.id} value={y.id}>{y.icon || "🚗"} {y.name}</option>)}</select></label>}
      {t === "trip" ? (<>
        <div className="seg">{[["business", "💼 Geschäftlich"], ["private", "🏠 Privat"], ["commute", "🏭 Arbeitsweg"]].map(([k, l]) => <button key={k} className={x.purpose === k ? "on" : ""} onClick={() => set({ purpose: k })}>{l}</button>)}</div>
        <div className="grid2">
          <label>Datum<input type="date" value={x.date} max={todayISO()} onChange={(e) => set({ date: e.target.value })} /></label>
          <label>Uhrzeit<input type="time" value={x.time || ""} onChange={(e) => set({ time: e.target.value })} /></label>
          <label>Von<span className="fbinbtn"><input value={x.from || ""} placeholder="z. B. Linz" onChange={(e) => set({ from: e.target.value })} />{placeBtn("from")}</span></label>
          <label>Nach<span className="fbinbtn"><input value={x.to || ""} placeholder="z. B. Wels, Kunde Huber" onChange={(e) => set({ to: e.target.value })} />{placeBtn("to")}</span></label>
          <label>km-Stand Beginn<input inputMode="numeric" value={x.startKm ?? ""} onChange={(e) => set({ startKm: e.target.value })} /></label>
          <label>km-Stand Ende<input inputMode="numeric" value={x.endKm ?? ""} onChange={(e) => set({ endKm: e.target.value })} /></label>
        </div>
        <div className="fbkmhint">{n("endKm") > n("startKm") ? <b>{kmFmt(n("endKm") - n("startKm"))}</b> : <span className="muted">Strecke wird aus den km-Ständen berechnet</span>}
          {x.purpose === "business" && n("endKm") > n("startKm") && <span className="muted"> · Kilometergeld {fmtMoney((n("endKm") - n("startKm")) * 0.5)}</span>}</div>
        <label>Zweck der Fahrt{x.purpose === "business" ? " (Pflicht fürs Finanzamt)" : ""}<input value={x.note || ""} placeholder="z. B. Montage bei Kunde, Materialeinkauf" onChange={(e) => set({ note: e.target.value })} /></label>
      </>) : (<>
        <div className="fbbeleg">
          {x.docId || x.attBusy ? (
            <div className="expatt">
              {doc?.thumb ? <img src={doc.thumb} alt="" /> : <span className="attpdf">📄</span>}
              <div className="grow"><b>{x.attBusy ? "Beleg wird hochgeladen …" : doc?.status === "processing" ? "KI liest den Beleg …" : doc?.status === "error" ? "Auslesen fehlgeschlagen" : "Beleg angehängt"}</b>
                <small className="muted block">{doc?.status === "done" ? (doc.merchant || doc.sender || doc.title) + (doc.amount?.total ? " · " + fmtMoney(doc.amount.total) : "") : x.attName || ""}</small></div>
              {doc?.status === "processing" && <span className="spin" />}
              {doc && <button className="btn sm" onClick={() => onOpen(doc.id)}>Öffnen</button>}
              <button className="iconbtn" title="Beleg entfernen" aria-label="Beleg entfernen" onClick={() => set({ docId: null, attName: "" })}>✕</button>
            </div>
          ) : (
            <div className="expscan">
              <button className="expbig" onClick={() => onScan((f, o) => attach(f, { ...o, scanned: true }))}><span className="expico">📷</span><b>Beleg scannen</b><small>KI liest Tankstelle, Liter, Preis & Betrag</small></button>
              <button className="expbig" onClick={() => setQrOpen(true)}><span className="expico">▦</span><b>QR-Code</b><small>Registrierkassen-QR (RKSV)</small></button>
              <button className="expbig" onClick={() => fileRef.current.click()}><span className="expico">🖼</span><b>Foto / PDF</b><small>aus Galerie oder Dateien</small></button>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) attach(f); }} />
            </div>
          )}
        </div>
        <div className="grid2">
          <label>Datum<input type="date" value={x.date} max={todayISO()} onChange={(e) => set({ date: e.target.value })} /></label>
          <label>Kilometerstand<input inputMode="numeric" value={x.km ?? ""} placeholder={lastKm ? String(lastKm) : ""} onChange={(e) => set({ km: e.target.value })} /></label>
        </div>
        {t === "fuel" ? (<>
          <label>{vehHasPlug(v) && vehHasFuel(v) ? "Kraftstoff / Strom" : "Kraftstoff"}<select value={x.fuel || vehDefFuel(v)} onChange={(e) => set({ fuel: e.target.value })}>{ENERGY.map((f) => <option key={f}>{f}</option>)}</select></label>
          <div className="grid3">
            <label>Preis/{elec ? "kWh" : "Liter"}<input inputMode="decimal" value={x.price ?? ""} placeholder={fuelPrice ? String(fuelPrice).replace(".", ",") : elec ? "0,49" : "1,659"} onChange={(e) => setX(calc({ price: e.target.value }))} /></label>
            <label>{elec ? "kWh" : "Liter"}<input inputMode="decimal" value={x.liters ?? ""} onChange={(e) => setX(calc({ liters: e.target.value }))} /></label>
            <label>Gesamt €<input inputMode="decimal" value={x.total ?? ""} onChange={(e) => setX(calc({ total: e.target.value }))} /></label>
          </div>
          {(() => { const cap = elec ? v?.battery : v?.tank, q = n("liters"); if (!cap) return null;
            const over = q > cap * 1.05, pw = elec ? (+x.dc ? v.dcKw : v.acKw) : null;
            return <div className={"fbcap" + (over ? " warn" : "")}>
              <div className="kubar"><div style={{ width: Math.min(100, (q / cap) * 100 || 0) + "%", background: over ? "var(--red)" : "var(--acc)" }} /></div>
              <small>{elec ? "Akku" : "Tank"} max. {String(cap).replace(".", ",")} {elec ? "kWh" : "l"}{q > 0 ? ` · ${Math.round((q / cap) * 100)} % gefüllt` : ""}{over ? " – mehr als möglich, bitte prüfen" : ""}
                {elec && pw && q > 0 ? ` · Ladedauer ca. ${(() => { const h = q / pw; return h >= 1 ? `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min` : `${Math.round(h * 60)} min`; })()} bei ${String(pw).replace(".", ",")} kW` : ""}</small>
              {elec && v.dcKw && <div className="seg sm fbacdc"><button className={!+x.dc ? "on" : ""} onClick={() => set({ dc: 0 })}>AC (Wallbox/Säule)</button><button className={+x.dc ? "on" : ""} onClick={() => set({ dc: 1 })}>DC (Schnelllader)</button></div>}
            </div>; })()}
          <label className="check"><input type="checkbox" checked={x.full ?? true} onChange={(e) => set({ full: e.target.checked })} /> {elec ? "Voll geladen" : "Vollgetankt"} (für die Verbrauchsberechnung)</label>
          <label>{elec ? "Ladestation" : "Tankstelle"}<span className="fbinbtn"><input value={x.station || ""} placeholder={elec ? "z. B. SMATRICS Linz" : "z. B. OMV Linz Süd"} onChange={(e) => set({ station: e.target.value })} />
            <button className="btn sm fbnear" disabled={near?.busy} onClick={findNear}>{near?.busy ? <span className="spin" /> : "📍"} In der Nähe</button></span></label>
          {near && !near.busy && (
            <div className="fbnearlist">
              {near.err ? <p className="warn small">{near.err}</p> : !near.stations?.length ? <p className="muted small">Keine {near.kind === "charge" ? "Ladestationen" : "Tankstellen"} im Umkreis von 3 km gefunden.</p> : near.stations.slice(0, 8).map((s, i) => (
                <div key={i} className="frow click" onClick={() => pickStation(s)}>
                  <span className="fbic fuel">{near.kind === "charge" ? "⚡" : "⛽"}</span>
                  <div className="grow"><b>{s.name}</b><small className="muted block">{[s.address, s.dist != null && (s.dist < 1 ? Math.round(s.dist * 1000) + " m" : s.dist.toFixed(1).replace(".", ",") + " km"), s.power && s.power, s.open === false && "geschlossen"].filter(Boolean).join(" · ")}</small></div>
                  {s.price ? <b>{String(s.price.toFixed(3)).replace(".", ",")} €</b> : null}
                </div>))}
              {near.source && <small className="muted">Quelle: {near.source}{near.source.startsWith("E-Control") ? " – Preise nur für die günstigsten gemeldeten Stationen" : ""}</small>}
            </div>
          )}
        </>) : (<>
          <div className="fbcats">{FB_EXP.map(([c, i]) => <button key={c} className={"chip" + (x.cat === c ? " on" : "")} onClick={() => set({ cat: c })}>{i} {c}</button>)}</div>
          <div className="grid2">
            <label>Betrag €<input inputMode="decimal" value={x.total ?? ""} onChange={(e) => set({ total: e.target.value })} /></label>
            <label>Werkstatt / Anbieter<input value={x.station || ""} onChange={(e) => set({ station: e.target.value })} /></label>
          </div>
        </>)}
        <label>Notiz<input value={x.note || ""} onChange={(e) => set({ note: e.target.value })} /></label>
        {accounts.length > 0 && (
          <div className="fbbook">
            <small className="muted">Konto</small>
            {linked && x.acct === "link" ? (
              <div className="frow fblinked"><span className="fbic">🏦</span><div className="grow"><b>{linked.counterparty || "Buchung"}</b><small className="muted block">{fmtDate(linked.date)} · {accounts.find((a) => a.id === linked.accountId)?.name || ""}</small></div>
                <b className="neg">{fmtMoney(linked.amount)}</b><button className="iconbtn" title="Verknüpfung lösen" aria-label="Verknüpfung lösen" onClick={() => set({ txId: null })}>✕</button></div>
            ) : (<>
              <div className="seg">{[["none", "Nicht buchen"], ["new", "Neu buchen"], ["link", "Vorhandene Buchung"]].map(([k, l]) => <button key={k} className={x.acct === k ? "on" : ""} onClick={() => set({ acct: k, bookAcc: x.bookAcc || ls.get("expAcc", "") || accounts[0].id })}>{l}</button>)}</div>
              {x.acct === "new" && <select value={x.bookAcc} onChange={(e) => set({ bookAcc: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.icon && a.icon !== "none" ? a.icon : kindIcon(a.kind)} {a.name}</option>)}</select>}
              {x.acct === "link" && (
                <div className="fbtxpick">
                  <div className="searchbar"><span>🔍</span><input type="search" value={txQ} placeholder="Buchung suchen – Name oder Betrag" onChange={(e) => setTxQ(e.target.value)} /></div>
                  {cands.map(({ tx, score }) => (
                    <div key={tx.id} className={"frow click" + (x.txId === tx.id ? " on" : "")} onClick={() => set({ txId: tx.id })}>
                      <span className={"txradio" + (x.txId === tx.id ? " on" : "")} />
                      <div className="grow"><b>{tx.counterparty || "Buchung"}{score >= 9 ? " ⭐" : ""}</b><small className="muted block">{fmtDate(tx.date)} · {accounts.find((a) => a.id === tx.accountId)?.name || ""}{tx.docId ? " · 📎" : ""}</small></div>
                      <b className="neg">{fmtMoney(tx.amount)}</b>
                    </div>))}
                  {!cands.length && <p className="muted small">Keine passenden Buchungen gefunden.</p>}
                </div>
              )}
            </>)}
          </div>
        )}
      </>)}
      <div className="row gap fbbtns">
        <button className="btn primary" disabled={!ok} onClick={save}>Speichern</button>
        {!isNew && <button className="btn danger" onClick={() => { if (confirm("Eintrag löschen?")) onDelete(x.id); }}>Löschen</button>}
      </div>
      {qrOpen && createPortal(<CodeScanWin title="Kassenbon-QR scannen" onClose={() => setQrOpen(false)} onResult={(code) => onQr(code)} />, document.querySelector(".app") || document.body)}
    </Win>
  );
}

function VehIcon({ v }) { return v?.iconImg ? <img className="vehimg" src={v.iconImg} alt="" /> : <>{v?.icon || "🚗"}</>; }
function VehicleWin({ init, onSave, onDelete, onClose }) {
  const [lib, setLib] = useLsState("vehIcons", []);
  const [addOpen, setAddOpen] = useState(false), [txt, setTxt] = useState("");
  const fileRef = useRef();
  const addEmoji = () => { const e2 = txt.trim(); if (!e2) return; if (!lib.some((x) => x.emoji === e2)) setLib((l) => [...l, { id: uid(), emoji: e2 }]); set({ icon: e2, iconImg: undefined }); setTxt(""); setAddOpen(false); };
  const [v, setV] = useState(() => ({ icon: "🚗", fuel: "Super 95", ...init }));
  const set = (p) => setV((o) => ({ ...o, ...p }));
  return (
    <Win id="fb-veh" onClose={onClose} small>
      <div className="panelhead"><b>{init.id ? "Fahrzeug bearbeiten" : "Fahrzeug hinzufügen"}</b><XBtn /></div>
      <div className="fbcats vehicons">
        {VEH_ICONS.map((i) => <button key={i} className={"chip" + (v.icon === i && !v.iconImg ? " on" : "")} onClick={() => set({ icon: i, iconImg: undefined })}>{i}</button>)}
        {lib.map((it) => (
          <span key={it.id} className="libwrap">
            <button className={"chip" + ((it.src ? v.iconImg === it.src : v.icon === it.emoji && !v.iconImg) ? " on" : "")} title="Eigenes Symbol"
              onClick={() => set(it.src ? { iconImg: it.src, icon: undefined } : { icon: it.emoji, iconImg: undefined })}>{it.src ? <img src={it.src} alt="" /> : it.emoji}</button>
            <button className="libdel" title="Aus Sammlung löschen" aria-label="Symbol löschen" onClick={() => setLib((l) => l.filter((x) => x.id !== it.id))}>×</button>
          </span>))}
        <button className={"chip" + (addOpen ? " on" : "")} title="Eigenes Symbol hinzufügen" aria-label="Eigenes Symbol hinzufügen" onClick={() => setAddOpen(!addOpen)}>＋</button>
      </div>
      {addOpen && (
        <div className="libadd vehadd">
          <input value={txt} maxLength={4} placeholder="Emoji, z. B. 🚜 🏎️ 🚲" onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEmoji()} />
          <button className="btn sm" disabled={!txt.trim()} onClick={addEmoji}>Hinzufügen</button>
          <button className="btn sm" onClick={() => fileRef.current.click()}>🖼 Bild</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
            const f = e.target.files[0]; e.target.value = ""; if (!f) return;
            try { const src = await iconFromFile(f); setLib((l) => [...l, { id: uid(), src }]); set({ iconImg: src, icon: undefined }); setAddOpen(false); } catch { alert("Bild konnte nicht gelesen werden"); }
          }} />
        </div>
      )}
      <label>Name<input value={v.name || ""} autoFocus placeholder="z. B. Golf, Firmenauto" onChange={(e) => set({ name: e.target.value })} /></label>
      <div className="grid2">
        <label>Marke & Modell<input value={v.model || ""} placeholder="VW Golf 8" onChange={(e) => set({ model: e.target.value })} /></label>
        <label>Kennzeichen<input value={v.plate || ""} placeholder="L-12345X" onChange={(e) => set({ plate: e.target.value.toUpperCase() })} /></label>
        <label>Kilometerstand jetzt<input inputMode="numeric" value={v.startKm ?? ""} onChange={(e) => set({ startKm: e.target.value })} /></label>
        <label>Nutzung<select value={v.use || "privat"} onChange={(e) => set({ use: e.target.value })}><option value="privat">Privat</option><option value="firma">Firma</option><option value="beides">Privat & Firma</option></select></label>
      </div>
      <label>Antrieb<select value={v.fuel} onChange={(e) => set({ fuel: e.target.value })}>{FUELS.map((f) => <option key={f}>{f}</option>)}</select></label>
      <div className="grid2">
        {vehHasFuel(v) && <label>Tankvolumen (l)<input inputMode="decimal" value={v.tank ?? ""} placeholder="z. B. 45" onChange={(e) => set({ tank: e.target.value })} /></label>}
        {vehHasPlug(v) && <label>Akku nutzbar (kWh)<input inputMode="decimal" value={v.battery ?? ""} placeholder="z. B. 13,8" onChange={(e) => set({ battery: e.target.value })} /></label>}
        {vehHasPlug(v) && <label>Ladeleistung AC (kW)<input inputMode="decimal" value={v.acKw ?? ""} placeholder="z. B. 3,7 / 11" onChange={(e) => set({ acKw: e.target.value })} /></label>}
        {vehHasPlug(v) && <label>Ladeleistung DC (kW)<input inputMode="decimal" value={v.dcKw ?? ""} placeholder="leer = kein Schnellladen" onChange={(e) => set({ dcKw: e.target.value })} /></label>}
      </div>
      <div className="row gap fbbtns">
        <button className="btn primary" disabled={!(v.name || "").trim()} onClick={() => { const num = (k) => { const z = parseAmt(v[k]); return z > 0 ? z : null; };
          onSave({ ...v, id: v.id || uid(), name: v.name.trim(), startKm: Math.round(parseAmt(v.startKm) || 0), tank: num("tank"), battery: num("battery"), acKw: num("acKw"), dcKw: num("dcKw") }); }}>Speichern</button>
        {init.id && <button className="btn danger" onClick={() => { if (confirm("Fahrzeug samt allen Einträgen löschen?")) onDelete(v.id); }}>Löschen</button>}
      </div>
    </Win>
  );
}

/* Fahrzeugauswahl als Dropdown: Maus darüber öffnet, Antippen/Klick schaltet um */
function PickMenu({ label, icon, items, extra = [], title, wide = false }) {
  const [open, setOpen] = useState(false), [pos, setPos] = useState(null);
  const ref = useRef(null), t = useRef(null), lastPtr = useRef("mouse");
  const W = wide ? 320 : 292;
  const place = () => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ top: Math.round(r.bottom + 6), left: Math.round(Math.max(12, Math.min(r.left, innerWidth - W))), maxH: Math.max(220, Math.round(innerHeight - r.bottom - 24)) }); };
  const show = () => { clearTimeout(t.current); place(); setOpen(true); };
  const hide = (ms = 180) => { clearTimeout(t.current); t.current = setTimeout(() => setOpen(false), ms); };
  useEffect(() => {
    if (!open) return;
    const out = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.(".pickmenu")) setOpen(false); };
    const re = (e) => { if (e?.target?.closest?.(".pickmenu")) return; place(); };
    document.addEventListener("pointerdown", out); addEventListener("resize", re); addEventListener("scroll", re, true);
    return () => { document.removeEventListener("pointerdown", out); removeEventListener("resize", re); removeEventListener("scroll", re, true); };
  }, [open]);
  const hov = { onPointerEnter: (e) => { lastPtr.current = e.pointerType; if (e.pointerType === "mouse") show(); }, onPointerLeave: (e) => { if (e.pointerType === "mouse") hide(); } };
  return (
    <span className="vehpick" ref={ref} {...hov}>
      <button className={"chip vehpickbtn" + (open ? " on open" : "")} title={title} aria-haspopup="menu" aria-expanded={open}
        onPointerDown={(e) => { lastPtr.current = e.pointerType; }}
        onClick={() => { if (lastPtr.current === "mouse" && open) return; open ? setOpen(false) : show(); }}>{icon ? <>{icon} </> : null}{label} <span className="caret">▾</span></button>
      {open && pos && createPortal(
        <div className="moremenu vehmenu pickmenu" role="menu" style={{ position: "fixed", top: pos.top, left: pos.left, right: "auto", maxHeight: pos.maxH, overflowY: "auto" }} {...hov}>
          {items.map((x, i) => x.head ? <small key={"h" + i} className="muted pickhead">{x.head}</small> : (
            <button key={x.k} role="menuitemradio" aria-checked={!!x.on} className={x.on ? "on" : ""} onClick={() => { x.run(); setOpen(false); }}>
              {x.icon != null && <span className="vehmi">{x.icon}</span>}<span className="grow"><b>{x.title}</b>{x.sub && <small className="muted block">{x.sub}</small>}</span>{x.right && <span className="pickright">{x.right}</span>}{x.on && <span className="ok">✓</span>}
            </button>))}
          {!!extra.filter(Boolean).length && <div className="menusep" />}
          {extra.filter(Boolean).map((x, i) => <button key={"x" + i} onClick={() => { setOpen(false); x.run(); }}>{x.label}</button>)}
        </div>, document.querySelector(".app") || document.body)}
    </span>
  );
}
function VehPicker({ vehicles, v, onPick, onEdit, onAdd }) {
  const [open, setOpen] = useState(false), [pos, setPos] = useState(null);
  const ref = useRef(null), t = useRef(null), lastPtr = useRef("mouse");
  const place = () => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ top: Math.round(r.bottom + 6), left: Math.round(Math.max(12, Math.min(r.left, innerWidth - 292))) }); };
  const show = () => { clearTimeout(t.current); place(); setOpen(true); };
  const hide = (ms = 180) => { clearTimeout(t.current); t.current = setTimeout(() => setOpen(false), ms); };
  useEffect(() => {
    if (!open) return;
    const out = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.(".vehmenu")) setOpen(false); };
    const re = () => place();
    document.addEventListener("pointerdown", out); addEventListener("resize", re); addEventListener("scroll", re, true);
    return () => { document.removeEventListener("pointerdown", out); removeEventListener("resize", re); removeEventListener("scroll", re, true); };
  }, [open]);
  const hov = { onPointerEnter: (e) => { lastPtr.current = e.pointerType; if (e.pointerType === "mouse") show(); }, onPointerLeave: (e) => { if (e.pointerType === "mouse") hide(); } };
  return (
    <span className="vehpick" ref={ref} {...hov}>
      <button className={"chip on vehpickbtn" + (open ? " open" : "")} aria-haspopup="menu" aria-expanded={open}
        onPointerDown={(e) => { lastPtr.current = e.pointerType; }}
        onClick={() => { if (lastPtr.current === "mouse" && open) return; open ? setOpen(false) : show(); }}><VehIcon v={v} /> {v.name} <span className="caret">▾</span></button>
      {open && pos && createPortal(
        <div className="moremenu vehmenu" role="menu" style={{ position: "fixed", top: pos.top, left: pos.left, right: "auto" }} {...hov}>
          {vehicles.map((x) => (
            <button key={x.id} role="menuitemradio" aria-checked={x.id === v.id} className={x.id === v.id ? "on" : ""} onClick={() => { onPick(x.id); setOpen(false); }}>
              <span className="vehmi"><VehIcon v={x} /></span><span className="grow"><b>{x.name}</b><small className="muted block">{[x.model, x.plate].filter(Boolean).join(" · ") || x.fuel || ""}</small></span>{x.id === v.id && <span className="ok">✓</span>}
            </button>
          ))}
          <div className="menusep" />
          <button onClick={() => { setOpen(false); onEdit(v); }}>✎ „{v.name}“ bearbeiten</button>
          <button onClick={() => { setOpen(false); onAdd(); }}>＋ Fahrzeug hinzufügen</button>
        </div>, document.querySelector(".app") || document.body)}
    </span>
  );
}

function Fahrtenbuch({ accounts, onBook, notify, txs = [], docs = [], onScan, onUpload, onOpen, onLink }) {
  const [fb, setFb] = useLsState("fbook", FB_EMPTY);
  const vehicles = fb.vehicles || [], entries = fb.entries || [], reminders = fb.reminders || [];
  const [vid, setVid] = useLsState("fbVid", "");
  const v = vehicles.find((x) => x.id === vid) || vehicles[0];
  const [view, setView] = useState("verlauf");
  const [viewCfg, setViewCfg] = useLsState("fbViews", { order: [], hidden: [] });
  const [edit, setEdit] = useState(null), [vEdit, setVEdit] = useState(null), [remEdit, setRemEdit] = useState(null);
  const upd = (p) => setFb((o) => ({ ...FB_EMPTY, ...o, ...p(o) }));
  // Ablagefeld: Belege ablegen → KI liest aus → Eintrag (Tanken/Laden/Ausgabe) wird angelegt und mit passender Kontobuchung verknüpft
  const [showDrop, setShowDrop] = useLsState("fbDrop", true);
  const [wait, setWait] = useLsState("fbWait", []);
  const [dropBusy, setDropBusy] = useState(null);
  const dropFiles = async (files) => {
    const vId = (vehicles.find((x) => x.id === vid) || vehicles[0])?.id; if (!vId) return notify("Bitte zuerst ein Fahrzeug anlegen");
    for (const [i, f] of files.entries()) {
      setDropBusy({ title: `Beleg ${i + 1} von ${files.length} wird hochgeladen …`, sub: f.name, done: i, total: files.length, n: files.length - i });
      const id = await onUpload(f, {}); if (id) setWait((l) => [...l, { docId: id, vid: vId }]);
    }
    setDropBusy(null);
  };
  useEffect(() => {
    if (!wait.length) return;
    const fin = wait.map((w) => ({ w, d: docs.find((x) => x.id === w.docId) })).filter(({ d }) => !d || d.status !== "processing");
    if (!fin.length) return;
    const add = [], used = new Set((fb.entries || []).map((e) => e.txId).filter(Boolean)), links = [];
    for (const { w, d } of fin) {
      if (!d || d.status === "error" || !d.amount?.total) { if (d) notify(`„${d.fileName || d.title}“: kein Betrag erkannt – bitte manuell erfassen`); continue; }
      const text = norm(`${d.title} ${d.merchant || ""} ${d.sender || ""} ${d.fullText || ""} ${(d.lineItems || []).map((i) => i.name).join(" ")}`);
      const elec = /kwh|ladestation|laden|smatrics|ionity|wallbox|charging/.test(text);
      const isFuel = elec || /super|diesel|benzin|tankstelle|treibstoff|kraftstoff|liter|\bomv\b|\bbp\b|shell|eni|avanti|turmöl|jet\b/.test(text);
      const it = (d.lineItems || []).find((i) => i.qty > 2 && i.unitPrice > 0.15 && i.unitPrice < 4);
      const date = pastOrToday(d.purchaseDate || d.documentDate, todayISO()), total = Math.abs(d.amount.total);
      const cat = [["Service", /service|inspektion|ölwechsel|wartung/], ["Reparatur", /reparatur|werkstatt|ersatzteil/], ["Reifen", /reifen|felge|räder/], ["Versicherung", /versicherung|polizze|prämie/],
        ["Motorbezogene Steuer", /motorbezogene|kfz-steuer/], ["Pickerl (§57a)", /pickerl|57a|begutachtung/], ["Vignette & Maut", /vignette|maut|asfinag/], ["Parken", /park/], ["Autowäsche", /wäsche|waschstraße|waschanlage/], ["Strafe", /strafe|organmandat|anonymverfügung/]]
        .find(([, re]) => re.test(text))?.[0] || "Sonstiges";
      const e = { id: uid(), vid: w.vid, date, total, docId: d.id, station: d.merchant || d.sender || "",
        ...(isFuel ? { type: "fuel", fuel: elec ? "Strom (kWh)" : /diesel/.test(text) ? "Diesel" : "Super 95", liters: it ? it.qty : 0, price: it?.unitPrice ?? null, full: true } : { type: "expense", cat }) };
      const t = txs.filter((x) => x.amount < 0 && !used.has(x.id) && Math.abs(-x.amount - total) < 0.01 && Math.abs(new Date(x.date) - new Date(date)) <= 4 * 864e5)
        .sort((a, b) => Math.abs(new Date(a.date) - new Date(date)) - Math.abs(new Date(b.date) - new Date(date)))[0];
      if (t) { e.txId = t.id; used.add(t.id); links.push([t.id, d.id]); }
      add.push(e);
    }
    const done = new Set(fin.map(({ w }) => w.docId));
    setWait((l) => l.filter((w) => !done.has(w.docId)));
    if (add.length) {
      upd((o) => ({ entries: [...(o.entries || []), ...add] }));
      links.forEach(([a, b]) => onLink(a, b));
      notify(`${add.length} Beleg${add.length === 1 ? "" : "e"} ins Fahrtenbuch übernommen${links.length ? ` · ${links.length} mit Kontobuchung verknüpft` : ""}${add.some((e) => e.type === "fuel" && !e.liters) ? " – bei Tankbelegen ohne Literangabe bitte Liter ergänzen" : ""}`);
    }
  }, [docs, wait.length]);
  const waitN = wait.length;
  // Erinnerungen → Kalender (je Erinnerung, .ics für alle, Kalender-Abo)
  const remIcs = (list) => list.filter((r) => r.date && !r.done).map((r) => { const veh = vehicles.find((x) => x.id === r.vid);
    return [{ id: "fbrem-" + r.id, date: r.date, label: r.title }, { id: "fbrem-" + r.id, title: `${veh?.name || "Fahrzeug"}${veh?.plate ? " (" + veh.plate + ")" : ""}`, summary: [r.km && `bzw. bei ${kmFmt(r.km)}`, r.note].filter(Boolean).join(" · ") }]; });
  const [fbCal, setFbCal] = useLsState("fbCalSync", { on: false, key: "", at: "" });
  const [calOpen, setCalOpen] = useState(false);
  useEffect(() => {
    const f = () => { const el = document.querySelector(".fbseg"); if (!el) return; const top = parseFloat(getComputedStyle(el).top) || 0; el.classList.toggle("stuck", el.getBoundingClientRect().top <= top + 0.5 && scrollY > 0); };
    f(); addEventListener("scroll", f, { passive: true }); addEventListener("resize", f); return () => { removeEventListener("scroll", f); removeEventListener("resize", f); };
  }, []);
  const remSig = JSON.stringify(reminders.map((r) => [r.id, r.date, r.title, r.done, r.km]));
  useEffect(() => {
    if (!fbCal.on || !fbCal.key) return;
    const t = setTimeout(() => pushCalendar(fbCal.key, remIcs(reminders), ls.get("appToken", ""), "FinDocu – Fahrzeuge").then((at) => setFbCal((c) => ({ ...c, at }))).catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [remSig]);
  if (!vehicles.length) return (
    <div className="fbpage">
      <section className="tile fbempty">
        <div className="fbhero">🚗</div>
        <b>Dein Fahrtenbuch</b>
        <p className="muted">Tankfüllungen, Werkstatt & Kosten, Fahrten (geschäftlich/privat) und Erinnerungen wie Pickerl oder Service – mit Verbrauch, Kosten pro km und Kilometergeld.</p>
        <button className="btn primary" onClick={() => setVEdit({})}>＋ Fahrzeug hinzufügen</button>
      </section>
      {vEdit && <VehicleWin init={vEdit} onClose={() => setVEdit(null)} onSave={(nv) => { upd((o) => ({ vehicles: [...(o.vehicles || []), nv] })); setVid(nv.id); setVEdit(null); }} />}
    </div>
  );
  const st = fbStats(v, entries);
  const today = todayISO(), month = today.slice(0, 7), year = today.slice(0, 4);
  const mine = st.e.slice().sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")) || ((+b.km || +b.endKm || 0) - (+a.km || +a.endKm || 0)));
  const monthCost = st.e.filter((x) => x.type !== "trip" && x.date.startsWith(month)).reduce((s, x) => s + (+x.total || 0), 0);
  const lastFuel = st.e.filter((x) => x.type === "fuel").sort((a, b) => b.date.localeCompare(a.date))[0];
  const myRem = reminders.filter((r) => r.vid === v.id && !r.done);
  const remState = (r) => { const dd = r.date ? daysUntil(r.date) : null, dk = r.km ? r.km - st.odo : null;
    const due = (dd != null && dd <= 0) || (dk != null && dk <= 0), soon = (dd != null && dd <= 30) || (dk != null && dk <= 1000);
    return { dd, dk, cls: due ? "due" : soon ? "soon" : "" }; };
  const dueN = myRem.filter((r) => remState(r).cls).length;
  const saveEntry = async (x) => {
    const { acct, bookAcc, attName, ...e } = x;
    if (e.type !== "trip") {
      if (acct === "new" && !e.txId && bookAcc && e.total > 0) {
        const tx = await onBook({ accountId: bookAcc, date: e.date, amount: -Math.abs(e.total), counterparty: (e.station || "").split(" · ")[0] || (e.type === "fuel" ? (isElec(e.fuel) ? "Ladestation" : "Tankstelle") : e.cat),
          purpose: `${v.name}: ${e.type === "fuel" ? `${isElec(e.fuel) ? "Laden" : "Tanken"} ${amtStr(e.liters)} ${unitOf(e.fuel)}` : e.cat}${e.note ? " · " + e.note : ""}`, category: "Auto & Mobilität" });
        e.txId = tx?.id; ls.set("expAcc", bookAcc);
      }
      if (acct === "none") e.txId = null;
      if (e.txId && e.docId) await onLink(e.txId, e.docId);
    }
    upd((o) => ({ entries: (o.entries || []).some((y) => y.id === e.id) ? o.entries.map((y) => (y.id === e.id ? e : y)) : [...(o.entries || []), e] }));
    notify(e.type === "trip" ? `Fahrt gespeichert · ${kmFmt(e.endKm - e.startKm)}` : `${e.type === "fuel" ? "Tanken" : e.cat} gespeichert · ${fmtMoney(e.total)}`);
    setEdit(null);
  };
  const newEntry = (type) => setEdit({ type, vid: v.id, ...(type === "trip" ? { purpose: ls.get("fbPurpose", "business"), startKm: st.odo || "" } : type === "fuel" ? { fuel: vehDefFuel(v), full: true } : {}) });
  const newCharge = () => setEdit({ type: "fuel", vid: v.id, fuel: "Strom (kWh)", full: true });
  // Berichte
  const months = Array.from({ length: 12 }, (_, i) => addMon(month, i - 11));
  const costChart = months.map((m) => ({ k: m, label: monthLabel(m).split(" ")[0], b: st.e.filter((x) => x.type !== "trip" && x.date.startsWith(m)).reduce((s, x) => s + (+x.total || 0), 0) }));
  const byCat = {}; st.e.filter((x) => x.type !== "trip" && x.date.startsWith(year)).forEach((x) => { const k = x.type === "fuel" ? (isElec(x.fuel) ? "Strom" : "Treibstoff") : x.cat || "Sonstiges"; byCat[k] = (byCat[k] || 0) + (+x.total || 0); });
  const catList = Object.entries(byCat).sort((a, b) => b[1] - a[1]); const catTot = catList.reduce((s, x) => s + x[1], 0);
  const trips = st.e.filter((x) => x.type === "trip");
  const tripKm = (l) => l.reduce((s, x) => s + Math.max(0, x.endKm - x.startKm), 0);
  const yTrips = trips.filter((x) => x.date.startsWith(year));
  const bizKm = tripKm(yTrips.filter((x) => x.purpose === "business")), privKm = tripKm(yTrips.filter((x) => x.purpose === "private")), comKm = tripKm(yTrips.filter((x) => x.purpose === "commute"));
  const kmRate = +(fb.settings?.kmRate ?? 0.5);
  const exportCsv = () => {
    const rows = [["Datum", "Uhrzeit", "Fahrzeug", "Kennzeichen", "Von", "Nach", "Zweck", "Art", "km-Stand Beginn", "km-Stand Ende", "km", "Kilometergeld"]];
    trips.slice().sort((a, b) => a.date.localeCompare(b.date) || a.startKm - b.startKm).forEach((x) => rows.push([x.date, x.time || "", v.name, v.plate || "", x.from || "", x.to || "", x.note || "", { business: "geschäftlich", private: "privat", commute: "Arbeitsweg" }[x.purpose] || "", x.startKm, x.endKm, x.endKm - x.startKm, x.purpose === "business" ? amtStr((x.endKm - x.startKm) * kmRate) : ""]));
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `Fahrtenbuch_${v.name}_${year}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const [prevId, setPrevId] = useState(null);
  const docOf = (x) => x.docId && docs.find((d) => d.id === x.docId && !d.deletedAt);
  const openEdit = (x) => setEdit({ ...x, liters: amtStr(x.liters), total: amtStr(x.total), price: x.price != null ? String(x.price).replace(".", ",") : "" });
  const delEntry = (x) => { if (confirm(`Eintrag „${x.type === "trip" ? `${x.from || "?"} → ${x.to}` : x.type === "fuel" ? (isElec(x.fuel) ? "Laden" : "Tanken") : x.cat}“ vom ${fmtDate(x.date)} löschen?`)) upd((o) => ({ entries: o.entries.filter((y) => y.id !== x.id) })); };
  const FbActs = ({ x }) => { const d = docOf(x); const st = (f) => (e) => { e.stopPropagation(); f(); }; return (
    <div className="dactions txacts" onClick={(e) => e.stopPropagation()}>
      <button title="Eintrag bearbeiten" aria-label="Bearbeiten" onClick={st(() => openEdit(x))}><IcoEdit /></button>
      <button title={d ? "Beleg drucken" : "Kein Beleg angehängt"} aria-label="Drucken" disabled={!d} onClick={st(() => d && printDoc(d, notify))}><IcoPrint /></button>
      <button title={d ? "Beleg teilen" : "Kein Beleg angehängt"} aria-label="Teilen" disabled={!d} onClick={st(() => d && shareDocs([d]))}><IcoShare /></button>
      <button title="Eintrag löschen" aria-label="Löschen" className="del" onClick={st(() => delEntry(x))}><IcoTrash /></button>
    </div>); };
  const row = (x) => {
    const icon = x.type === "expense" ? (FB_EXP.find((c) => c[0] === x.cat)?.[1] || "🧾") : FB_ICON[x.type];
    return (
      <div key={x.id} className={"fbentry" + (prevId === x.id ? " open" : "")}>
      <div className="frow click fbrow" onClick={() => (docOf(x) ? setPrevId(prevId === x.id ? null : x.id) : openEdit(x))}>
        <span className={"fbic " + x.type}>{x.type === "fuel" && isElec(x.fuel) ? "⚡" : icon}</span>
        <div className="grow">
          <b>{x.type === "fuel" ? `${isElec(x.fuel) ? "Laden" : "Tanken"} · ${amtStr(x.liters).replace(",00", "")} ${unitOf(x.fuel)}` : x.type === "trip" ? `${x.from || "?"} → ${x.to}` : x.cat}</b>
          <small className="muted block">{fmtDate(x.date)}{x.time ? " " + x.time : ""} · {x.type === "trip" ? `${kmFmt(x.endKm - x.startKm)} · ${{ business: "geschäftlich", private: "privat", commute: "Arbeitsweg" }[x.purpose] || ""}${x.note ? " · " + x.note : ""}` : `${[x.km ? kmFmt(x.km) : "", x.station].filter(Boolean).join(" · ")}${x.type === "fuel" && x.price ? ` · ${String(x.price).replace(".", ",")} €/${unitOf(x.fuel)}` : ""}${x.txId ? " · 🏦" : ""}${x.docId ? " · 📎" : ""}`}</small>
        </div>
        <div className="right">{x.type === "trip" ? (x.purpose === "business" ? <b className="pos">{fmtMoney((x.endKm - x.startKm) * kmRate)}</b> : <b>{kmFmt(x.endKm - x.startKm)}</b>) : <b className="neg">{fmtMoney(-x.total)}</b>}</div>
        <FbActs x={x} />
      </div>
      {prevId === x.id && docOf(x) && <div className="txprev"><DocPreview d={docOf(x)} onOpen={() => onOpen(docOf(x).id)} /></div>}
      </div>);
  };
  const VIEWS_ALL = [["verlauf", "Verlauf"], ["fuel", "Tanken"], ["trip", "Fahrten"], ["expense", "Ausgaben"], ["rem", `Erinnerungen${dueN ? ` (${dueN})` : ""}`], ["bericht", "Berichte"]];
  const VIEWS = VIEWS_ALL;
  if (viewCfg.hidden.includes(view) && VIEWS_ALL.some(([k]) => !viewCfg.hidden.includes(k))) setTimeout(() => setView(([...viewCfg.order, ...VIEWS_ALL.map(([k]) => k)].find((k) => !viewCfg.hidden.includes(k)))), 0);
  return (
    <div className="fbpage">
      <div className="chips anaaccs">
        <VehPicker vehicles={vehicles} v={v} onPick={setVid} onEdit={setVEdit} onAdd={() => setVEdit({})} />
        <button className={"chip fbdropchip" + (showDrop ? " on" : "")} title="Ablagefeld ein-/ausblenden" onClick={() => setShowDrop(!showDrop)}>📥 Ablagefeld</button>
        <ExportMenu items={[{ head: `${v.name}${v.plate ? " · " + v.plate : ""}` },
          ...[year, String(+year - 1)].map((y) => ({ label: `🖨 Fahrtenbuch ${y} (PDF)`, sub: "alle Fahrten mit km-Ständen, Zweck und Kilometergeld", run: async () => saveBlob(await fbPdf(v, st.e, y, kmRate), `Fahrtenbuch-${fileSafe(v.name)}-${y}.pdf`) })),
          { label: "📊 Excel: Fahrten, Tanken, Kosten", run: () => downloadXlsx(`Fahrtenbuch-${fileSafe(v.name)}.xlsx`, fbSheets(v, st.e, kmRate)) },
          { label: "📄 Tank- & Kostenliste CSV", run: () => { const sh = fbSheets(v, st.e, kmRate)[1]; downloadCsv(`Tank-Kosten-${fileSafe(v.name)}.csv`, sh.head, sh.rows); } }]} />
      </div>
      {showDrop && <DropField onFiles={dropFiles} onHide={() => setShowDrop(false)} busy={!!dropBusy || waitN > 0} title="Tank-, Lade- oder Werkstattbelege hierher ziehen" what={`PDF & Fotos · werden für „${v.name}“ eingetragen`} />}
      {dropBusy ? <ImportBar {...dropBusy} /> : waitN > 0 && <ImportBar title={`KI liest ${waitN} Beleg${waitN === 1 ? "" : "e"} aus …`} sub="Einträge werden danach automatisch angelegt" done={0} total={waitN} n={waitN} />}
      <section className="tile fbcar">
        <div className="fbcarhead">
          <span className="fbcaric"><VehIcon v={v} /></span>
          <div className="grow"><b>{v.name}</b><small className="muted block">{[v.model, v.plate, v.fuel].filter(Boolean).join(" · ")}</small>
            {(v.tank || v.battery) && <div className="fbspecs">
              {vehHasFuel(v) && v.tank && <span>⛽ {String(v.tank).replace(".", ",")} l{st.avg ? ` · ~${Math.round((v.tank / st.avg) * 100)} km` : ""}</span>}
              {vehHasPlug(v) && v.battery && <span>🔋 {String(v.battery).replace(".", ",")} kWh{st.avgE ? ` · ~${Math.round((v.battery / st.avgE) * 100)} km elektrisch` : ""}</span>}
              {vehHasPlug(v) && (v.acKw || v.dcKw) && <span>⚡ {[v.acKw && `${String(v.acKw).replace(".", ",")} kW AC`, v.dcKw && `${String(v.dcKw).replace(".", ",")} kW DC`].filter(Boolean).join(" / ")}</span>}
            </div>}</div>
          <button className="iconbtn" title="Fahrzeug bearbeiten" aria-label="Fahrzeug bearbeiten" onClick={() => setVEdit(v)}>✎</button>
        </div>
        <div className="fbodo"><small className="muted">Kilometerstand</small><div className="kpiv big">{kmFmt(st.odo)}</div></div>
        <div className="fbstats">
          {vehHasFuel(v) && <div><small className="muted">Ø Verbrauch</small><b>{st.avg != null ? st.avg.toFixed(1).replace(".", ",") : "—"}</b><small className="muted">l/100 km{st.last != null ? ` · zuletzt ${st.last.toFixed(1).replace(".", ",")}` : ""}</small></div>}
          {vehHasPlug(v) && <div><small className="muted">Ø Strom</small><b>{st.avgE != null ? st.avgE.toFixed(1).replace(".", ",") : "—"}</b><small className="muted">kWh/100 km{st.lastE != null ? ` · zuletzt ${st.lastE.toFixed(1).replace(".", ",")}` : ""}</small></div>}
          {!(vehHasFuel(v) && vehHasPlug(v)) && <div><small className="muted">Letzte Füllung</small><b>{lastFuel ? fmtMoney(lastFuel.total) : "—"}</b><small className="muted">{lastFuel ? fmtDate(lastFuel.date) : "noch keine"}</small></div>}
          <div><small className="muted">Kosten/km</small><b>{st.perKm != null ? fmtMoney(st.perKm) : "—"}</b><small className="muted">gesamt</small></div>
          <div><small className="muted">{new Date(month + "-15").toLocaleDateString("de-AT", { month: "long" })}</small><b>{fmtMoney(monthCost)}</b><small className="muted">Kosten</small></div>
        </div>
        <div className="fbquick">
          {vehHasFuel(v) && <button onClick={() => newEntry("fuel")}><span>⛽</span>Tanken</button>}
          {vehHasPlug(v) && <button onClick={newCharge}><span>⚡</span>Laden</button>}
          <button onClick={() => newEntry("trip")}><span>🛣️</span>Fahrt</button>
          <button onClick={() => newEntry("expense")}><span>🧾</span>Ausgabe</button>
          <button onClick={() => setRemEdit({ vid: v.id })}><span>⏰</span>Erinnerung</button>
        </div>
      </section>
      <ChipBar seg storeKey="fbViews" cfg={viewCfg} setCfg={setViewCfg} className="fbseg" items={VIEWS.map(([k, l]) => ({ k, label: l, el: <button className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button> }))} />
      <FitScroll card={view !== "bericht"}>
      {["verlauf", "fuel", "trip", "expense"].includes(view) && (
        <section className="tile">
          {view === "trip" && trips.length > 0 && <div className="tilehead"><b>Fahrten {year}</b><button className="link" onClick={exportCsv}>⬇︎ CSV fürs Finanzamt</button></div>}
          {mine.filter((x) => view === "verlauf" || x.type === view).map(row)}
          {!mine.filter((x) => view === "verlauf" || x.type === view).length && <p className="muted small">Noch keine Einträge – oben über ⛽ Tanken, 🛣️ Fahrt oder 🧾 Ausgabe erfassen.</p>}
        </section>
      )}
      {view === "rem" && (
        <section className="tile">
          <div className="tilehead"><b>Erinnerungen</b>
            <span className="row1" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button className="chip" onClick={() => setCalOpen(true)} title="Erinnerungen aller Fahrzeuge als Kalender-Abo"><IcoCalSync /> Kalender-Abo{fbCal.on ? " ✓" : ""}</button>
              <button className="chip" disabled={!remIcs(reminders).length} title="Alle Erinnerungen mit Datum als .ics herunterladen" onClick={() => downloadIcs(remIcs(reminders), "fahrzeug-erinnerungen.ics")}>⬇︎ .ics</button>
              <button className="link" onClick={() => setRemEdit({ vid: v.id })}>＋ Neu</button>
            </span></div>
          {myRem.map((r) => { const s = remState(r); return (
            <div key={r.id} className={"frow fbrem " + s.cls}>
              <span className="fbic">⏰</span>
              <div className="grow click" onClick={() => setRemEdit(r)}><b>{r.title}</b><small className="muted block">{[r.date && `${fmtDate(r.date)} (${s.dd < 0 ? `seit ${-s.dd} Tagen` : s.dd === 0 ? "heute" : `in ${s.dd} Tagen`})`, r.km && `bei ${kmFmt(r.km)} (${s.dk <= 0 ? "erreicht" : `noch ${kmFmt(s.dk)}`})`].filter(Boolean).join(" · ")}</small></div>
              {r.date ? <button className="iconbtn" title="In den Kalender" aria-label="In den Kalender" onClick={() => downloadIcs(remIcs([r]), "erinnerung.ics")}>📅</button>
                : <span className="iconbtn" title="Nur nach Kilometerstand – kein Datum für den Kalender" style={{ opacity: .35 }}>📅</span>}
              <button className="btn sm" onClick={() => upd((o) => ({ reminders: o.reminders.map((y) => (y.id === r.id ? { ...y, done: true, doneAt: today } : y)) }))}>Erledigt</button>
            </div>); })}
          {!myRem.length && <p className="muted small">Keine offenen Erinnerungen. Tipp: Pickerl (§57a), Service, Reifenwechsel, Vignette, Versicherung.</p>}
          {reminders.some((r) => r.vid === v.id && r.done) && <small className="muted">Erledigt: {reminders.filter((r) => r.vid === v.id && r.done).map((r) => r.title).join(", ")}</small>}
        </section>
      )}
      {calOpen && <CalSyncSheet sync={fbCal} setSync={setFbCal} items={remIcs(reminders)} token={ls.get("appToken", "")} onClose={() => setCalOpen(false)} notify={notify} calName="FinDocu – Fahrzeuge" what="Fahrzeug-Erinnerungen" />}
      {view === "bericht" && (<>
        <div className="anagrid">
          <section className="tile"><div className="tilehead"><b>Kosten pro Monat</b><small>gesamt {fmtMoney(st.costs)}</small></div><MiniBars data={costChart} h={130} /></section>
          <section className="tile"><div className="tilehead"><b>Verbrauch</b><small>{vehHasFuel(v) ? "l/100 km" : "kWh/100 km"}</small></div>
            {st.cons.length >= 2 ? <LineChart points={st.cons.slice(-24).map((c) => ({ m: c.date.slice(0, 7), v: Math.round(c.v * 10) / 10 }))} h={130} /> : st.consE.length >= 2 ? null : <p className="muted small">Ab zwei vollen Tank-/Ladefüllungen wird der Verbrauch berechnet.</p>}
            {st.consE.length >= 2 && <><small className="muted">Strom kWh/100 km</small><LineChart points={st.consE.slice(-24).map((c) => ({ m: c.date.slice(0, 7), v: Math.round(c.v * 10) / 10 }))} h={110} /></>}
            {lastFuel?.price && <small className="muted">Letzter Preis: {String(lastFuel.price).replace(".", ",")} €/l ({fmtDate(lastFuel.date)})</small>}
          </section>
          <section className="tile"><div className="tilehead"><b>Kosten {year} nach Art</b></div>
            {catList.map(([k, val], i) => (
              <div key={k} className="frow"><div className="grow"><div className="row1"><span>{k}</span><span><b>{fmtMoney(val)}</b></span></div><Bar value={val} max={catList[0][1]} color={PALETTE[i % PALETTE.length]} /><small className="muted">{pct(val, catTot)} %</small></div></div>))}
            {!catList.length && <p className="muted small">Keine Kosten in {year}.</p>}
          </section>
          <section className="tile"><div className="tilehead"><b>Fahrten {year}</b><button className="link" onClick={exportCsv}>⬇︎ CSV</button></div>
            <div className="minikpis">
              <div><small className="muted">Geschäftlich</small><b>{kmFmt(bizKm)}</b><small className="muted">{fmtMoney(Math.min(bizKm, 30000) * kmRate)}</small></div>
              <div><small className="muted">Privat</small><b>{kmFmt(privKm)}</b><small className="muted">{pct(privKm, bizKm + privKm + comKm)} %</small></div>
              <div><small className="muted">Arbeitsweg</small><b>{kmFmt(comKm)}</b><small className="muted">{yTrips.length} Fahrten</small></div>
            </div>
            <label>Kilometergeld €/km<input inputMode="decimal" value={String(kmRate).replace(".", ",")} onChange={(e) => { const n = parseAmt(e.target.value); if (!isNaN(n)) upd((o) => ({ settings: { ...(o.settings || {}), kmRate: n } })); }} /></label>
            <small className="muted">Amtliches Kilometergeld PKW 2026: 0,50 €/km, max. 30.000 km/Jahr. Geschäftliche Fahrten fließen in die Firmen-Auswertung ein.</small>
          </section>
        </div>
      </>)}
      </FitScroll>
      {edit && <FbEntryWin init={edit} vehicles={vehicles} accounts={accounts} txs={txs} docs={docs} onScan={onScan} onUpload={onUpload} onOpen={onOpen} lastKm={st.odo} fuelPrice={lastFuel?.price} onClose={() => setEdit(null)} onSave={(x) => { if (x.type === "trip") ls.set("fbPurpose", x.purpose); saveEntry(x); }}
        onDelete={(id) => { upd((o) => ({ entries: o.entries.filter((y) => y.id !== id) })); setEdit(null); }} />}
      {vEdit && <VehicleWin init={Object.fromEntries(Object.entries(vEdit).map(([k, val]) => [k, ["tank", "battery", "acKw", "dcKw"].includes(k) && val != null ? String(val).replace(".", ",") : val]))} onClose={() => setVEdit(null)} onSave={(nv) => { upd((o) => ({ vehicles: o.vehicles.some((y) => y.id === nv.id) ? o.vehicles.map((y) => (y.id === nv.id ? nv : y)) : [...o.vehicles, nv] })); setVid(nv.id); setVEdit(null); }}
        onDelete={(id) => { upd((o) => ({ vehicles: o.vehicles.filter((y) => y.id !== id), entries: o.entries.filter((y) => y.vid !== id), reminders: (o.reminders || []).filter((y) => y.vid !== id) })); setVEdit(null); }} />}
      {remEdit && (
        <Win id="fb-rem" onClose={() => setRemEdit(null)} small>
          <div className="panelhead"><b>⏰ Erinnerung</b><XBtn /></div>
          <div className="fbcats">{["Pickerl (§57a)", "Service", "Ölwechsel", "Reifenwechsel", "Vignette", "Versicherung", "Bremsen"].map((t) => <button key={t} className={"chip" + (remEdit.title === t ? " on" : "")} onClick={() => setRemEdit({ ...remEdit, title: t })}>{t}</button>)}</div>
          <label>Bezeichnung<input value={remEdit.title || ""} onChange={(e) => setRemEdit({ ...remEdit, title: e.target.value })} /></label>
          <div className="grid2">
            <label>Fällig am<input type="date" value={remEdit.date || ""} onChange={(e) => setRemEdit({ ...remEdit, date: e.target.value })} /></label>
            <label>oder bei km-Stand<input inputMode="numeric" value={remEdit.km ?? ""} placeholder={String(st.odo + 15000)} onChange={(e) => setRemEdit({ ...remEdit, km: e.target.value })} /></label>
          </div>
          <div className="row gap fbbtns">
            <button className="btn primary" disabled={!(remEdit.title || "").trim() || !(remEdit.date || remEdit.km)} onClick={() => {
              const r = { ...remEdit, id: remEdit.id || uid(), title: remEdit.title.trim(), km: remEdit.km ? Math.round(parseAmt(remEdit.km)) : null };
              upd((o) => ({ reminders: (o.reminders || []).some((y) => y.id === r.id) ? o.reminders.map((y) => (y.id === r.id ? r : y)) : [...(o.reminders || []), r] })); setRemEdit(null); setView("rem");
            }}>Speichern</button>
            {remEdit.id && <button className="btn danger" onClick={() => { upd((o) => ({ reminders: o.reminders.filter((y) => y.id !== remEdit.id) })); setRemEdit(null); }}>Löschen</button>}
          </div>
        </Win>
      )}
    </div>
  );
}




/* Symbolleiste am Handy: mit Text oder nur Symbole */
function TabbarSetting() {
  const [icons, setIcons] = useLsState("tabbarIcons", false);
  useEffect(() => { document.documentElement.classList.toggle("tbicons", !!icons); }, [icons]);
  return (<>
    <small className="muted block tbsethead">Symbolleiste unten (Handy)</small>
    <div className="themeopts tbset" role="radiogroup" aria-label="Symbolleiste">
      {[[false, "🔤", "Symbole & Text", "Name unter jedem Symbol"], [true, "▫️", "Nur Symbole", "kompakter, mehr Reiter sichtbar"]].map(([k, i, t, sub]) => (
        <button key={String(k)} role="radio" aria-checked={icons === k} className={icons === k ? "on" : ""} onClick={() => setIcons(k)}>
          <span>{i}</span><b>{t}</b><small>{sub}</small>
        </button>))}
    </div>
    <small className="muted block tbsethead">Tag- und Nachtmodus</small>
  </>);
}
/* Passwortfeld mit Auge (anzeigen / verbergen) */
function PwInput({ show, setShow, ...rest }) {
  const [own, setOwn] = useState(false);
  const vis = show ?? own, toggle = () => (setShow ? setShow(!vis) : setOwn(!vis));
  return (
    <span className="pwinput">
      <input {...rest} type={vis ? "text" : "password"} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button type="button" className="pweye" tabIndex={-1} title={vis ? "Passwort verbergen" : "Passwort anzeigen"} aria-label={vis ? "Passwort verbergen" : "Passwort anzeigen"} onClick={toggle}>{vis ? <IcoEyeOff /> : <IcoEye />}</button>
    </span>
  );
}


/* ---------- Zeitraum-Kalender (groß, Von–Bis) ---------- */
const MONTHS_LONG = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
// Datum eintippen (TT.MM.JJJJ), übernimmt bei Enter oder Verlassen des Felds
function DateTyper({ label, value, on, max, onFocus, onCommit }) {
  const fmt = (d) => (d ? d.split("-").reverse().join(".") : "");
  const [txt, setTxt] = useState(fmt(value)), [bad, setBad] = useState(false), [edit, setEdit] = useState(false);
  useEffect(() => { if (!edit) setTxt(fmt(value)); }, [value, edit]);
  const commit = () => {
    setEdit(false);
    const m = txt.trim().match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/);
    if (!m) { setBad(!!txt.trim() && txt.trim() !== fmt(value)); setTxt(fmt(value)); return; }
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3], d = new Date(y, +m[2] - 1, +m[1]);
    if (d.getMonth() !== +m[2] - 1) { setBad(true); setTxt(fmt(value)); return; }
    let iso = d.toLocaleDateString("sv-SE"); if (iso > max) iso = max;
    setBad(false); if (iso !== value) onCommit(iso); else setTxt(fmt(value));
  };
  return (
    <label className={"rcalfield" + (on ? " on" : "") + (bad ? " bad" : "")} onClick={onFocus}>
      <small>{label}</small>
      <input value={txt} inputMode="numeric" placeholder="TT.MM.JJJJ" onFocus={() => { setEdit(true); onFocus(); }} onChange={(e) => setTxt(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
    </label>
  );
}
function RangeCalendar({ from, to, max, onChange }) {
  const [view, setView] = useState(() => (to || max).slice(0, 7));
  const [pickEnd, setPickEnd] = useState(false), [hover, setHover] = useState(null);
  useEffect(() => { if (!pickEnd && to && to.slice(0, 7) !== view) setView(to.slice(0, 7)); }, [from, to]);
  const [y, m] = view.split("-").map(Number);
  const first = new Date(y, m - 1, 1), offset = (first.getDay() + 6) % 7, dim = new Date(y, m, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(y, m - 1, 1 - offset + i); return { iso: d.toLocaleDateString("sv-SE"), day: d.getDate(), out: d.getMonth() !== m - 1 }; });
  const rows = cells.slice(35).every((c) => c.out) ? cells.slice(0, 35) : cells;
  const go = (n) => { const d = new Date(y, m - 1 + n, 1); setView(d.toLocaleDateString("sv-SE").slice(0, 7)); };
  const endPrev = pickEnd && hover ? (hover < from ? [hover, from] : [from, hover]) : [from, to];
  const click = (iso) => {
    if (iso > max) return;
    if (!pickEnd) { onChange(iso, to && to >= iso ? to : iso); setPickEnd(true); }
    else { onChange(iso < from ? iso : from, iso < from ? from : iso); setPickEnd(false); setHover(null); }
  };
  const years = []; for (let yy = +max.slice(0, 4); yy >= +max.slice(0, 4) - 15; yy--) years.push(yy);
  const fmt = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–";
  return (
    <div className="rcal">
      <div className="rcalsel">
        <DateTyper label="von" value={from} on={!pickEnd} max={max} onFocus={() => { setPickEnd(false); setView(from.slice(0, 7)); }}
          onCommit={(d) => { onChange(d, d > to ? d : to); setView(d.slice(0, 7)); setPickEnd(true); }} />
        <span aria-hidden="true">→</span>
        <DateTyper label="bis" value={to} on={pickEnd} max={max} onFocus={() => { setPickEnd(true); setView(to.slice(0, 7)); }}
          onCommit={(d) => { onChange(d < from ? d : from, d < from ? from : d); setView(d.slice(0, 7)); setPickEnd(false); }} />
      </div>
      <div className="rcalhead">
        <button className="iconbtn" aria-label="Voriger Monat" onClick={() => go(-1)}>‹</button>
        <select value={m} onChange={(e) => setView(`${y}-${String(e.target.value).padStart(2, "0")}`)}>{MONTHS_LONG.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select>
        <select value={y} onChange={(e) => setView(`${e.target.value}-${String(m).padStart(2, "0")}`)}>{years.map((yy) => <option key={yy}>{yy}</option>)}</select>
        <button className="iconbtn" aria-label="Nächster Monat" disabled={view >= max.slice(0, 7)} onClick={() => go(1)}>›</button>
      </div>
      <div className="rcalgrid" onMouseLeave={() => setHover(null)}>
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => <span key={d} className="rcalwd">{d}</span>)}
        {rows.map((c) => {
          const [a, b] = endPrev, inR = a && b && c.iso >= a && c.iso <= b, edge = c.iso === a || c.iso === b;
          return <button key={c.iso} disabled={c.iso > max} className={"rcald" + (c.out ? " out" : "") + (inR ? " in" : "") + (edge ? " edge" : "") + (c.iso === a ? " start" : "") + (c.iso === b ? " end" : "") + (c.iso === max ? " today" : "")}
            onMouseEnter={() => pickEnd && setHover(c.iso)} onClick={() => click(c.iso)}>{c.day}</button>;
        })}
      </div>
      <small className="muted rcalhint">{pickEnd ? "Jetzt das Enddatum antippen – oder oben eintippen" : "Startdatum antippen, dann Enddatum – oder oben eintippen (TT.MM.JJJJ)"}</small>
    </div>
  );
}
/* ---------- Export-Menü (Chip mit Auswahl) ---------- */
function ExportMenu({ items, label = "⬇︎ Export", className = "chip", title = "Exportieren" }) {
  const [busy, setBusy] = useState(false), [pos, setPos] = useState(null);
  const ref = useRef(null);
  // Menü schwebend (fixed) unter dem Knopf – wird so von keiner Leiste abgeschnitten
  const place = () => { const r = ref.current?.querySelector("summary")?.getBoundingClientRect(); if (!r) return;
    const w = 270; setPos({ top: Math.round(r.bottom + 6), left: Math.round(Math.max(12, Math.min(r.left, innerWidth - w - 12))) }); };
  useEffect(() => {
    const d = ref.current; if (!d) return;
    const onT = () => { if (d.open) place(); };
    d.addEventListener("toggle", onT); addEventListener("resize", onT); addEventListener("scroll", onT, true);
    return () => { d.removeEventListener("toggle", onT); removeEventListener("resize", onT); removeEventListener("scroll", onT, true); };
  }, []);
  return (
    <details ref={ref} className="more expmenu" onClick={(e) => e.stopPropagation()}>
      <summary className={className + (busy ? " on" : "")} title={title}>{busy ? "Exportiert …" : label}</summary>
      <div className="moremenu" style={pos ? { position: "fixed", top: pos.top, left: pos.left, right: "auto" } : undefined}>
        {items.filter(Boolean).map((it, i) => it.head ? <small key={i} className="muted exphead">{it.head}</small> : (
          <button key={i} disabled={busy || it.disabled} onClick={async (e) => {
            e.currentTarget.closest("details").open = false; setBusy(true);
            try { await it.run(); } catch (err) { alert("Export fehlgeschlagen: " + (err.message || err)); } finally { setBusy(false); }
          }}>{it.label}{it.sub && <small className="muted block">{it.sub}</small>}</button>))}
      </div>
    </details>
  );
}
const isoToday = () => new Date().toLocaleDateString("sv-SE");
const fileSafe = (s) => String(s || "").replace(/[^\wäöüÄÖÜß.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
const sumBy = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const docFileName = (d) => { const ext = (d.fileName || "").match(/\.[a-z0-9]{2,5}$/i)?.[0] || (d.mimeType === "application/pdf" ? ".pdf" : d.mimeType === "image/png" ? ".png" : ".jpg");
  return `${d.documentDate || (d.createdAt || "").slice(0, 10)} ${fileSafe(d.title || d.fileName).replace(/_/g, " ")}${ext}`; };
async function docsZip(list, extra = []) {
  const files = [];
  for (const d of list) { const b = await db.getFile(d.id); if (b) files.push({ name: (d.__folder ? d.__folder + "/" : "") + docFileName(d), data: b }); }
  return zipBlob([...files, ...extra]);
}

/* ---------- Firmen-Exporte ---------- */
const r2e = (v) => Math.round((Number(v) || 0) * 100) / 100;
const INV_HEAD = ["Nummer", "Art", "Datum", "Kunde", "Kundennr.", "Betrag netto €", "Mahngebühren €", "Gesamt €", "Status", "Fällig am", "Bezahlt am", "Mahnstufe"];
const invRow = (x) => [x.number || "Entwurf", x.kind === "angebot" ? "Angebot" : "Rechnung", x.date || "", x.customer?.name || "", x.customer?.number || "", r2e(invTotal({ ...x, fee: 0 })), r2e(x.fee), r2e(invTotal(x)),
  STATE_UI[invState(x)]?.[0] || invState(x), x.kind === "angebot" ? "" : invDueEff(x), x.paidAt || "", (x.reminders || []).length ? remindName(x.reminders.length - 1) : ""];
const openList = (list) => list.filter((x) => x.kind === "rechnung" && ["offen", "überfällig"].includes(invState(x))).sort((a, b) => (invDueEff(a) || "").localeCompare(invDueEff(b) || ""));
const OP_HEAD = ["Nummer", "Datum", "Kunde", "Fällig am", "Tage überfällig", "Mahnstufe", "Offen €"];
const opRow = (x) => { const d = -daysUntil(invDueEff(x)); return [x.number, x.date, x.customer?.name || "", invDueEff(x), d > 0 ? d : 0, (x.reminders || []).length ? remindName(x.reminders.length - 1) : "–", r2e(invTotal(x))]; };
async function openItemsPdf(list) {
  const l = openList(list), over = l.filter((x) => invState(x) === "überfällig");
  return tablePdf({ title: "Offene Posten", subtitle: `Stand ${fmtDate(isoToday())}`, landscape: true,
    kpis: [["Offen gesamt", fmtMoney(sumBy(l, invTotal))], ["davon überfällig", fmtMoney(sumBy(over, invTotal))], ["Rechnungen", String(l.length)], ["gemahnt", String(l.filter((x) => (x.reminders || []).length).length)]],
    columns: [{ label: "Nummer", w: 1.4 }, { label: "Datum", w: 1 }, { label: "Kunde", w: 3.2 }, { label: "Fällig am", w: 1 }, { label: "Tage überf.", w: 0.9, align: "right" }, { label: "Mahnstufe", w: 1.7 }, { label: "Offen €", w: 1.2, align: "right" }],
    rows: l.map(opRow), totals: ["Summe", "", `${l.length} Rechnungen`, "", "", "", r2e(sumBy(l, invTotal))] });
}
function earData(year, list, docs, fb) {
  const inY = (d) => year === "alle" || (d || "").startsWith(year);
  const inc = list.filter((x) => x.kind === "rechnung" && invState(x) === "bezahlt" && inY(x.paidAt || x.date)).sort((a, b) => (a.paidAt || a.date).localeCompare(b.paidAt || b.date));
  const exp = docs.filter((d) => d.scope === "firma" && d.direction === "ausgabe" && d.amount?.total && inY(d.documentDate || d.createdAt)).sort((a, b) => (a.documentDate || "").localeCompare(b.documentDate || ""));
  const veh = Object.fromEntries((fb.vehicles || []).map((v) => [v.id, v]));
  const trips = (fb.entries || []).filter((e) => e.type === "trip" && e.purpose === "business" && inY(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const rate = +(fb.settings?.kmRate ?? 0.5);
  const km = sumBy(trips, (e) => Math.max(0, e.endKm - e.startKm)), kmEur = r2e(Math.min(km, 30000) * rate);
  const tInc = r2e(sumBy(inc, invTotal)), tExp = r2e(sumBy(exp, (d) => Math.abs(d.amount.total)));
  return { inc, exp, trips, veh, rate, km, kmEur, tInc, tExp, profit: r2e(tInc - tExp - kmEur) };
}
function earSheets(year, E) {
  return [{ name: "Zusammenfassung", head: ["Position", "Betrag €"], rows: [[`Betriebseinnahmen ${year}`, E.tInc], ["Betriebsausgaben (Belege)", -E.tExp], [`Kilometergeld (${E.km} km × ${String(E.rate).replace(".", ",")} €)`, -E.kmEur], ["Gewinn (vor Steuern & SV)", E.profit]] },
    { name: "Einnahmen", head: ["Bezahlt am", "Rechnungsnr.", "Rechnungsdatum", "Kunde", "Betrag €"], rows: E.inc.map((x) => [x.paidAt || x.date, x.number, x.date, x.customer?.name || "", r2e(invTotal(x))]) },
    { name: "Ausgaben", head: ["Datum", "Lieferant", "Bezeichnung", "Kategorie", "Betrag €", "Beleg-Datei"], rows: E.exp.map((d) => [d.documentDate || "", d.merchant || d.sender || "", d.title || "", d.category || "", r2e(Math.abs(d.amount.total)), "Belege/" + docFileName(d)]) },
    { name: "Kilometergeld", head: ["Datum", "Fahrzeug", "Kennzeichen", "Von", "Nach", "Zweck", "km", "€"], rows: E.trips.map((e) => [e.date, E.veh[e.vid]?.name || "", E.veh[e.vid]?.plate || "", e.from || "", e.to || "", e.note || "", e.endKm - e.startKm, r2e((e.endKm - e.startKm) * E.rate)]) }];
}
async function earPdf(year, E, coName) {
  return tablePdf({ title: `Einnahmen-Ausgaben-Rechnung ${year === "alle" ? "gesamt" : year}`, subtitle: `${coName || "Firma"} · vereinfachte Aufstellung aus FinDocu`,
    kpis: [["Einnahmen", fmtMoney(E.tInc)], ["Ausgaben", fmtMoney(E.tExp)], ["Kilometergeld", fmtMoney(E.kmEur)], ["Gewinn", fmtMoney(E.profit)]],
    columns: [{ label: "Datum", w: 1 }, { label: "Beleg / Nummer", w: 1.6 }, { label: "Partner", w: 2.6 }, { label: "Bezeichnung", w: 3.2 }, { label: "Betrag €", w: 1.2, align: "right" }],
    sections: [{ heading: "Betriebseinnahmen", rows: E.inc.map((x) => [x.paidAt || x.date, x.number, x.customer?.name || "", "Rechnung vom " + fmtDate(x.date), r2e(invTotal(x))]), totals: ["", "", "", "Summe Einnahmen", E.tInc], empty: "keine" },
      { heading: "Betriebsausgaben", rows: E.exp.map((d) => [d.documentDate || "", d.docType || "Beleg", d.merchant || d.sender || "", d.title || "", r2e(Math.abs(d.amount.total))]), totals: ["", "", "", "Summe Ausgaben", E.tExp], empty: "keine Dokumente mit Markierung „Firma“" },
      { heading: "Kilometergeld", rows: [[ "", `${E.trips.length} Fahrten`, `${E.km.toLocaleString("de-AT")} km`, `× ${String(E.rate).replace(".", ",")} €/km (max. 30.000 km)`, E.kmEur]] },
      { heading: "Ergebnis", rows: [], totals: ["", "", "", "Gewinn (vor Steuern & SV)", E.profit] }],
    note: "Vereinfachte Übersicht aus den in FinDocu erfassten Daten – keine Steuerberatung.\nAusgaben zählen, wenn das Dokument als „Firma“ markiert ist; Einnahmen nach Zahlungseingang (Zufluss)." });
}
async function steuerberaterZip(year, list, docs, fb, co) {
  const E = earData(year, list, docs, fb), files = [], tag = year === "alle" ? "gesamt" : year;
  files.push({ name: `EAR-${tag}.xlsx`, data: xlsxBlob(earSheets(year, E)) });
  files.push({ name: `EAR-${tag}.pdf`, data: await earPdf(year, E, co.name) });
  const inY = (d) => year === "alle" || (d || "").startsWith(year);
  const yearInv = list.filter((x) => x.kind === "rechnung" && x.number && invState(x) !== "entwurf" && inY(x.date));
  files.push({ name: `Rechnungsausgangsbuch-${tag}.csv`, data: csvBlob(INV_HEAD, yearInv.map(invRow)) });
  files.push({ name: `Offene-Posten-${isoToday()}.pdf`, data: await openItemsPdf(list) });
  for (const x of yearInv) files.push({ name: "Rechnungen/" + invFileName(x), data: await buildInvoicePdf(x, co) });
  for (const d of E.exp) { const b = await db.getFile(d.id); if (b) files.push({ name: "Belege/" + docFileName(d), data: b }); }
  return zipBlob(files);
}

/* ---------- Fahrtenbuch-Exporte ---------- */
const FB_PURPOSE = { business: "geschäftlich", private: "privat", commute: "Arbeitsweg" };
function fbSheets(v, e, rate) {
  const trips = e.filter((x) => x.type === "trip").sort((a, b) => a.date.localeCompare(b.date) || a.startKm - b.startKm);
  const costs = e.filter((x) => x.type !== "trip").sort((a, b) => a.date.localeCompare(b.date));
  return [{ name: "Fahrten", head: ["Datum", "Uhrzeit", "Von", "Nach", "Zweck", "Art", "km-Stand Beginn", "km-Stand Ende", "km", "Kilometergeld €"],
      rows: trips.map((x) => [x.date, x.time || "", x.from || "", x.to || "", x.note || "", FB_PURPOSE[x.purpose] || "", x.startKm, x.endKm, x.endKm - x.startKm, x.purpose === "business" ? r2e((x.endKm - x.startKm) * rate) : ""]) },
    { name: "Tanken & Kosten", head: ["Datum", "Art", "Kraftstoff / Kategorie", "km-Stand", "Menge", "Einheit", "Preis/Einheit €", "Betrag €", "Tankstelle / Anbieter", "Notiz"],
      rows: costs.map((x) => [x.date, x.type === "fuel" ? (isElec(x.fuel) ? "Laden" : "Tanken") : "Ausgabe", x.type === "fuel" ? x.fuel || "" : x.cat || "", x.km || "", x.type === "fuel" ? x.liters : "", x.type === "fuel" ? unitOf(x.fuel) : "", x.price ?? "", r2e(x.total), x.station || "", x.note || ""]) }];
}
async function fbPdf(v, e, year, rate) {
  const trips = e.filter((x) => x.type === "trip" && x.date.startsWith(year)).sort((a, b) => a.date.localeCompare(b.date) || a.startKm - b.startKm);
  const km = (l) => sumBy(l, (x) => Math.max(0, x.endKm - x.startKm));
  const biz = trips.filter((x) => x.purpose === "business"), kmBiz = km(biz);
  const byM = {}; trips.forEach((x) => (byM[x.date.slice(0, 7)] = byM[x.date.slice(0, 7)] || []).push(x));
  return tablePdf({ title: `Fahrtenbuch ${year} – ${v.name}`, subtitle: [v.model, v.plate && "Kennzeichen " + v.plate, v.fuel].filter(Boolean).join(" · "), landscape: true,
    kpis: [["Gefahren", km(trips).toLocaleString("de-AT") + " km"], ["geschäftlich", kmBiz.toLocaleString("de-AT") + " km"], ["privat / Arbeitsweg", (km(trips) - kmBiz).toLocaleString("de-AT") + " km"], ["Kilometergeld", fmtMoney(Math.min(kmBiz, 30000) * rate)]],
    columns: [{ label: "Datum", w: 1 }, { label: "Von", w: 1.8 }, { label: "Nach", w: 2.2 }, { label: "Zweck", w: 2.8 }, { label: "Art", w: 1.1 }, { label: "km Beginn", w: 1, align: "right" }, { label: "km Ende", w: 1, align: "right" }, { label: "km", w: 0.7, align: "right" }, { label: "€", w: 0.9, align: "right" }],
    sections: Object.entries(byM).map(([m, l]) => ({ heading: new Date(m + "-15").toLocaleDateString("de-AT", { month: "long", year: "numeric" }),
      rows: l.map((x) => [x.date, x.from || "", x.to || "", x.note || "", FB_PURPOSE[x.purpose] || "", x.startKm, x.endKm, x.endKm - x.startKm, x.purpose === "business" ? r2e((x.endKm - x.startKm) * rate) : ""]),
      totals: ["", "", "", "Monatssumme", "", "", "", km(l), r2e(km(l.filter((x) => x.purpose === "business")) * rate)] })),
    note: `Kilometergeld ${String(rate).replace(".", ",")} €/km für geschäftliche Fahrten, höchstens 30.000 km pro Jahr.\nHinweis: Die Einträge sind in FinDocu nachträglich änderbar.` });
}
/* ---------- Alle Daten löschen (Backup-Bereich) ---------- */
const WIPE_WORD = "ALLES LÖSCHEN";
async function wipeAllData() {
  const d = await openDB();
  await new Promise((res, rej) => { const t = d.transaction(["docs", "files", "tx", "logos"], "readwrite"); ["docs", "files", "tx", "logos"].forEach((n) => t.objectStore(n).clear()); t.oncomplete = res; t.onerror = () => rej(t.error); });
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
}
function WipeAll({ docs, txs }) {
  const [open, setOpen] = useState(false), [ok, setOk] = useState(false), [word, setWord] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const n = (k) => { const v = ls.get(k, []); return Array.isArray(v) ? v.length : 0; };
  const fb = ls.get("fbook", null);
  const match = word.trim() === WIPE_WORD;
  const close = () => { setOpen(false); setOk(false); setWord(""); setErr(""); };
  return (
    <div className="wipezone">
      <h4 className="bkh">⚠️ Gefahrenzone</h4>
      {!open ? (
        <button className="btn danger" onClick={() => setOpen(true)}>🗑 Alle Daten löschen …</button>
      ) : (
        <div className="wipebox" role="alertdialog" aria-label="Alle Daten löschen">
          <b>Wirklich ALLE Daten in FinDocu löschen?</b>
          <p className="small">Das kann <b>nicht rückgängig</b> gemacht werden. Gelöscht wird auf diesem Gerät:</p>
          <ul className="small">
            <li>{docs} Dokumente samt Dateien (auch im Papierkorb)</li>
            <li>{txs} Umsätze und {n("accounts")} Konten</li>
            <li>{n("invoices")} Rechnungen & Angebote, {n("customers")} Kunden, {n("articles")} Artikel</li>
            <li>Fahrtenbuch ({fb?.vehicles?.length || 0} Fahrzeuge, {fb?.entries?.length || 0} Einträge), Vermögenswerte, Budgets, Regeln</li>
            <li>alle Einstellungen, Firmendaten, App-Token und das App-Passwort</li>
          </ul>
          <p className="small">Erstelle vorher ein <b>Backup</b> (oben), wenn du die Daten noch brauchst. Daten auf anderen Geräten und deine Dateien in Vercel/GitHub bleiben unberührt.</p>
          <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> Ich habe verstanden, dass alle Daten endgültig gelöscht werden.</label>
          <label>Zum Bestätigen genau <b className="wipeword">{WIPE_WORD}</b> eintippen (Großbuchstaben)
            <input value={word} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={WIPE_WORD} onChange={(e) => setWord(e.target.value)} disabled={!ok} />
          </label>
          {err && <p className="red small">{err}</p>}
          <div className="actions">
            <button className="btn danger" disabled={!ok || !match || busy} onClick={async () => {
              setBusy(true);
              try { await wipeAllData(); location.reload(); } catch (e) { setErr("Löschen fehlgeschlagen: " + (e.message || e)); setBusy(false); }
            }}>{busy ? "Löscht …" : "Endgültig löschen"}</button>
            <button className="btn" onClick={close}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}
/* ======================= Analyse ======================= */
const addMon = (m, n) => { const d = new Date(m + "-15"); d.setMonth(d.getMonth() + n); return d.toLocaleDateString("sv-SE").slice(0, 7); };
const monthsRange = (from, to) => { const out = []; for (let m = from; m <= to && out.length < 600; m = addMon(m, 1)) out.push(m); return out; };
const normName = (s) => String(s || "").replace(/\s+/g, " ").trim();
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function MiniBars({ data, h = 120, onPick, sel, fmt = (v) => fmtMoney(v).replace(",00", "") }) {
  // data: [{ k, label, a (positiv/grün), b (negativ/rot) }]
  const max = Math.max(1, ...data.flatMap((d) => [d.a || 0, d.b || 0]));
  return (
    <div className="mbars" style={{ height: h }}>
      {data.map((d) => (
        <button key={d.k} className={"mcol" + (sel === d.k ? " on" : "")} onClick={() => onPick?.(d.k)} title={`${d.label}: ${d.a != null ? "+" + fmt(d.a) : ""} ${d.b != null ? "−" + fmt(d.b) : ""}`}>
          <div className="mpair">
            {d.a != null && <div className="v inc" style={{ height: (d.a / max) * 100 + "%" }} />}
            {d.b != null && <div className="v out" style={{ height: (d.b / max) * 100 + "%" }} />}
          </div>
          <small>{d.label}</small>
        </button>
      ))}
    </div>
  );
}

function Analysis({ txs, accounts, hasCash, editing = false, setEditing = () => {} }) {
  const thisMonth = todayISO().slice(0, 7);
  const [mode, setMode] = useLsState("anaMode", "month"); // month | year | 12m
  const [cur, setCur] = useState(thisMonth);
  const [accSel, setAccSel] = useLsState("anaAccs", []);
  const [kind, setKind] = useState("out"); // out | in
  const [drill, setDrill] = useState(null); // Kategorie
  const [drillM, setDrillM] = useState(null); // Händler
  const valid = accSel.filter((id) => accounts.some((a) => a.id === id));
  const base = useMemo(() => txs.filter((t) => t.kind !== "broker" && t.category !== "Umbuchung" && !(hasCash && t.category === "Bargeld") && (t.currency || "EUR") === "EUR"
    && (!valid.length || valid.includes(t.accountId))), [txs, valid.join(","), hasCash]);
  const year = cur.slice(0, 4);
  // eigener Zeitraum (tagesgenau)
  const [cRange, setCRange] = useLsState("anaCustom", { from: thisMonth.slice(0, 4) + "-01-01", to: todayISO() });
  const cFrom = cRange.from <= cRange.to ? cRange.from : cRange.to, cTo = cRange.from <= cRange.to ? cRange.to : cRange.from;
  const custom = mode === "custom";
  const [cOpen, setCOpen] = useState(false);
  const cBtn = useRef(null), cPanel = useRef(null);
  const [cLeft, setCLeft] = useState(0);
  useEffect(() => {
    if (!cOpen) return;
    const place = () => { const b = cBtn.current, pnl = cPanel.current; if (!b || !pnl) return;
      const wrap = pnl.offsetParent?.getBoundingClientRect(), br = b.getBoundingClientRect(), w = pnl.offsetWidth; if (!wrap) return;
      let left = br.left + br.width / 2 - w / 2; left = Math.max(12, Math.min(left, innerWidth - w - 12)); setCLeft(Math.round(left - wrap.left)); };
    place(); addEventListener("resize", place); return () => removeEventListener("resize", place);
  }, [cOpen]);
  const dayShift = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toLocaleDateString("sv-SE"); };
  const cDays = Math.round((new Date(cTo + "T12:00:00") - new Date(cFrom + "T12:00:00")) / 864e5) + 1;
  const [from, to] = custom ? [cFrom.slice(0, 7), cTo.slice(0, 7)] : mode === "year" ? [year + "-01", year + "-12"] : mode === "12m" ? [addMon(cur, -11), cur] : [cur, cur];
  const span = monthsRange(from, to).length;
  const [pFrom, pTo] = [addMon(from, -span), addMon(to, -span)];
  const inR = (t, a, b) => { const m = t.date.slice(0, 7); return m >= a && m <= b; };
  const list = custom ? base.filter((t) => t.date >= cFrom && t.date <= cTo) : base.filter((t) => inR(t, from, to));
  const prev = custom ? base.filter((t) => t.date >= dayShift(cFrom, -cDays) && t.date <= dayShift(cFrom, -1)) : base.filter((t) => inR(t, pFrom, pTo));
  const sum = (l, s) => l.filter((t) => (s > 0 ? t.amount > 0 : t.amount < 0)).reduce((x, t) => x + Math.abs(t.amount), 0);
  const inc = sum(list, 1), out = sum(list, -1), pInc = sum(prev, 1), pOut = sum(prev, -1);
  const sel = list.filter((t) => (kind === "out" ? t.amount < 0 : t.amount > 0));
  const byCat = {}; sel.forEach((t) => { byCat[t.category || "Sonstiges"] = (byCat[t.category || "Sonstiges"] || 0) + Math.abs(t.amount); });
  const pByCat = {}; prev.filter((t) => (kind === "out" ? t.amount < 0 : t.amount > 0)).forEach((t) => { pByCat[t.category || "Sonstiges"] = (pByCat[t.category || "Sonstiges"] || 0) + Math.abs(t.amount); });
  const parts = Object.entries(byCat).map(([c, v]) => ({ c, v })).sort((a, b) => b.v - a.v);
  const selTotal = kind === "out" ? out : inc;
  // Verlauf: 12 Monate bis zum Ende des Zeitraums
  const chartTo = custom ? to : mode === "year" ? (year === thisMonth.slice(0, 4) ? thisMonth : year + "-12") : cur;
  const chartMonths = custom && span > 1 ? monthsRange(span > 36 ? addMon(to, -35) : from, to) : monthsRange(addMon(chartTo, -11), chartTo);
  const chart = chartMonths.map((m) => { const l = base.filter((t) => t.date.startsWith(m)); return { k: m, label: monthLabel(m).split(" ")[0], a: sum(l, 1), b: sum(l, -1) }; });
  const avgOut = chart.reduce((s, x) => s + x.b, 0) / Math.max(1, chart.filter((x) => x.a || x.b).length);
  // Händler
  const merch = {}; sel.forEach((t) => { const k = normName(t.counterparty || t.purpose || "Unbekannt"); const m = merch[k] || (merch[k] = { k, v: 0, n: 0, cat: t.category }); m.v += Math.abs(t.amount); m.n++; });
  const topMerch = Object.values(merch).sort((a, b) => b.v - a.v);
  // Positionen aus Kassenbons
  const items = list.filter((t) => t.amount < 0 && t.items?.length).flatMap((t) => t.items.map((it) => ({ ...it, merchant: t.counterparty })));
  const byItemCat = {}; items.forEach((it) => { byItemCat[it.category || "Sonstiges"] = (byItemCat[it.category || "Sonstiges"] || 0) + (it.total || 0); });
  const itemParts = Object.entries(byItemCat).map(([c, v]) => ({ c, v })).sort((a, b) => b.v - a.v);
  const byItem = {}; items.forEach((it) => { const k = normName(it.name).toLowerCase(); const x = byItem[k] || (byItem[k] = { name: normName(it.name), v: 0, q: 0, shops: new Set() }); x.v += it.total || 0; x.q += +it.qty || 1; x.shops.add(it.merchant); });
  const topItems = Object.values(byItem).sort((a, b) => b.v - a.v).slice(0, 10);
  const itemTotal = itemParts.reduce((s, p) => s + p.v, 0);
  // Wochentage (Ausgaben)
  const wd = Array(7).fill(0); list.filter((t) => t.amount < 0).forEach((t) => { wd[(new Date(t.date).getDay() + 6) % 7] += -t.amount; });
  const wdMax = Math.max(1, ...wd);
  const biggest = list.filter((t) => t.amount < 0).sort((a, b) => a.amount - b.amount).slice(0, 5);
  const dayLabel = (d) => { const x = new Date(d + "T12:00:00"); return `${String(x.getDate()).padStart(2, "0")}. ${monthLabel(d.slice(0, 7))}`; };
  const periodLabel = custom ? `${dayLabel(cFrom)} – ${dayLabel(cTo)}` : mode === "year" ? year : mode === "12m" ? `${monthLabel(from)} – ${monthLabel(to)}` : new Date(cur + "-15").toLocaleDateString("de-AT", { month: "long", year: "numeric" });
  const step = (n) => setCur((c) => { const m = mode === "year" ? addMon(c, 12 * n) : addMon(c, n); return m > thisMonth ? thisMonth : m; });
  const delta = (a, b) => { if (!b) return null; const d = Math.round(((a - b) / b) * 100); return d; };
  const Delta = ({ a, b, good = "down" }) => { const d = delta(a, b); if (d == null || !isFinite(d)) return null; const up = d > 0; const bad = good === "down" ? up : !up;
    return <small className={"delta " + (d === 0 ? "" : bad ? "bad" : "good")}>{up ? "▲" : d < 0 ? "▼" : "•"} {Math.abs(d)} %</small>; };
  const pal = (c, i) => catMeta(c).color || PALETTE[i % PALETTE.length];

  if (drill) {
    const l = sel.filter((t) => (t.category || "Sonstiges") === drill && (!drillM || normName(t.counterparty || t.purpose || "Unbekannt") === drillM)).sort((a, b) => b.date.localeCompare(a.date));
    const hist = chartMonths.map((m) => { const v = base.filter((t) => t.date.startsWith(m) && (t.category || "Sonstiges") === drill && (kind === "out" ? t.amount < 0 : t.amount > 0)).reduce((s, t) => s + Math.abs(t.amount), 0); return { k: m, label: monthLabel(m).split(" ")[0], [kind === "out" ? "b" : "a"]: v }; });
    const mm = {}; sel.filter((t) => (t.category || "Sonstiges") === drill).forEach((t) => { const k = normName(t.counterparty || t.purpose || "Unbekannt"); mm[k] = (mm[k] || 0) + Math.abs(t.amount); });
    return (
      <div className="anapage">
        <div className="anahead"><button className="btn sm" onClick={() => { setDrill(null); setDrillM(null); }}>‹ Zurück</button><b className="grow">{drill}</b><small className="muted">{periodLabel}</small></div>
        <section className="tile anakpi"><CatIcon c={drill} size={44} /><div><small className="muted">{kind === "out" ? "Ausgaben" : "Einnahmen"}</small><div className="kpiv">{fmtMoney(byCat[drill] || 0)}</div>
          <small className="muted">{pct(byCat[drill] || 0, selTotal)} % vom Gesamt · {l.length} Buchungen</small> <Delta a={byCat[drill] || 0} b={pByCat[drill] || 0} good={kind === "out" ? "down" : "up"} /></div></section>
        <section className="tile"><div className="tilehead"><b>Verlauf</b><small>12 Monate</small></div><MiniBars data={hist} /></section>
        <section className="tile"><div className="tilehead"><b>Händler</b>{drillM && <button className="link" onClick={() => setDrillM(null)}>alle zeigen</button>}</div>
          {Object.entries(mm).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => (
            <div key={k} className={"frow click" + (drillM === k ? " on" : "")} onClick={() => setDrillM(drillM === k ? null : k)}>
              <div className="grow"><b>{k}</b><Bar value={v} max={byCat[drill]} color={catMeta(drill).color} /></div><div className="right"><b>{fmtMoney(v)}</b></div>
            </div>))}
        </section>
        <section className="tile"><div className="tilehead"><b>Buchungen</b><small>{l.length}</small></div>
          {l.slice(0, 100).map((t) => (
            <div key={t.id} className="frow"><div className="grow"><b>{t.counterparty || t.purpose || "Buchung"}</b><small className="muted block">{fmtDate(t.date)}{t.items?.length ? ` · ${t.items.length} Positionen` : ""}</small></div>
              <div className="right"><b className={t.amount < 0 ? "neg" : "pos"}>{fmtMoney(t.amount)}</b></div></div>))}
        </section>
      </div>
    );
  }

  return (
    <div className="anapage">
      <div className="anahead">
        <div className="anasegwrap">
        <div className="seg sm">{[["month", "Monat"], ["year", "Jahr"], ["12m", "12 Monate"], ["custom", "Eigener Zeitraum"]].map(([k, l]) => <button key={k} ref={k === "custom" ? cBtn : undefined} className={mode === k ? "on" : ""} aria-expanded={k === "custom" ? custom && cOpen : undefined}
          onClick={() => { if (k === "custom") { if (custom) setCOpen(!cOpen); else { setMode("custom"); setCOpen(true); } } else { setMode(k); setCOpen(false); } }}>{l}{k === "custom" && <span className="anacaret" aria-hidden="true">{custom && cOpen ? "▴" : "▾"}</span>}</button>)}</div>
        {custom && cOpen && (
          <div className="anacustom" ref={cPanel} style={{ left: cLeft }} role="dialog" aria-label="Eigener Zeitraum">
            <RangeCalendar from={cFrom} to={cTo} max={todayISO()} onChange={(f, t) => setCRange({ from: f, to: t })} />
            <div className="chips anapresets">{[["Dieses Jahr", thisMonth.slice(0, 4) + "-01-01", todayISO()], ["Letzte 30 Tage", dayShift(todayISO(), -29), todayISO()], ["Letzte 90 Tage", dayShift(todayISO(), -89), todayISO()],
              ["Letztes Jahr", (+thisMonth.slice(0, 4) - 1) + "-01-01", (+thisMonth.slice(0, 4) - 1) + "-12-31"]].map(([l, f, t]) => <button key={l} className={"chip" + (cRange.from === f && cRange.to === t ? " on" : "")} onClick={() => setCRange({ from: f, to: t })}>{l}</button>)}</div>
            <small className="muted">{cDays} Tage · Vergleich mit den {cDays} Tagen davor</small>
          </div>
        )}
        </div>
        {custom ? <div className="anaper">
            <b className="anarange" role="button" tabIndex={0} title="Zeitraum ändern" onClick={() => setCOpen(!cOpen)}>{periodLabel}</b>
          </div> : <div className="anaper"><button className="iconbtn" aria-label="Zurück" onClick={() => step(-1)}>‹</button><b>{periodLabel}</b><button className="iconbtn" aria-label="Weiter" disabled={cur >= thisMonth} onClick={() => step(1)}>›</button></div>}
      </div>
      {accounts.length > 1 && (
        <div className="chips anaaccs">
          <button className={"chip" + (!valid.length ? " on" : "")} onClick={() => setAccSel([])}>Alle Konten</button>
          {accounts.map((a) => <button key={a.id} className={"chip" + (valid.includes(a.id) ? " on" : "")} onClick={() => setAccSel(valid.includes(a.id) ? valid.filter((x) => x !== a.id) : [...valid, a.id])}>{a.icon && a.icon !== "none" ? a.icon : kindIcon(a.kind)} {a.name}</button>)}
        </div>
      )}
      <WidgetBoard storeKey="anaGrid" title="Analyse" editing={editing} setEditing={setEditing}>
      <W k="kennzahlen" label="Kennzahlen"><div className="anakpis">
        <div className="tile kpi"><small className="muted">Einnahmen</small><div className="kpiv pos">{fmtMoney(inc)}</div><Delta a={inc} b={pInc} good="up" /></div>
        <div className="tile kpi"><small className="muted">Ausgaben</small><div className="kpiv neg">{fmtMoney(out)}</div><Delta a={out} b={pOut} /></div>
        <div className="tile kpi"><small className="muted">Saldo</small><div className={"kpiv " + (inc - out >= 0 ? "pos" : "neg")}>{(inc - out >= 0 ? "+" : "") + fmtMoney(inc - out)}</div><small className="muted">Vorperiode {fmtMoney(pInc - pOut)}</small></div>
        <div className="tile kpi"><small className="muted">Sparquote</small><div className="kpiv">{inc > 0 ? Math.round(((inc - out) / inc) * 100) + " %" : "—"}</div><small className="muted">vom Einkommen übrig</small></div>
      </div></W>
      <W k="in-und-out" label="In & Out"><section className="tile">
        <div className="tilehead"><b>In & Out</b><small>Ø Ausgaben {fmtMoney(avgOut)}/Monat</small></div>
        <MiniBars data={chart} h={150} sel={mode === "month" ? cur : null} onPick={(m) => { setMode("month"); setCur(m); }} />
        <div className="legend"><span className="dot inc" />Einnahmen <span className="dot out" />Ausgaben</div>
      </section></W>
      <W k="kategorien" label="Kategorien"><section className="tile">
        <div className="tilehead"><b>Kategorien</b>
          <div className="seg sm">{[["out", "Ausgaben"], ["in", "Einnahmen"]].map(([k, l]) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div></div>
        {parts.length ? (<>
          <div className="anadonut"><Donut parts={parts} total={selTotal} /></div>
          {parts.map((p, i) => (
            <div key={p.c} className="frow click" onClick={() => setDrill(p.c)}>
              <CatIcon c={p.c} size={36} />
              <div className="grow"><div className="row1"><span>{p.c}</span><span><b>{fmtMoney(p.v)}</b></span></div>
                <Bar value={p.v} max={parts[0].v} color={pal(p.c, i)} />
                <small className="muted">{pct(p.v, selTotal)} % · {sel.filter((t) => (t.category || "Sonstiges") === p.c).length} Buchungen</small> <Delta a={p.v} b={pByCat[p.c] || 0} good={kind === "out" ? "down" : "up"} /></div>
              <span className="muted">›</span>
            </div>))}
        </>) : <p className="muted small">Keine {kind === "out" ? "Ausgaben" : "Einnahmen"} im Zeitraum.</p>}
      </section></W>
        <W k="top-haendler" label="Top-Händler" w="half"><section className="tile">
          <div className="tilehead"><b>Top-Händler</b><small>{kind === "out" ? "Ausgaben" : "Einnahmen"}</small></div>
          {topMerch.slice(0, 8).map((m) => (
            <div key={m.k} className="frow click" onClick={() => { setDrill(m.cat || "Sonstiges"); setDrillM(m.k); }}>
              <CatIcon c={m.cat} size={32} />
              <div className="grow"><b>{m.k}</b><small className="muted block">{m.n}× · Ø {fmtMoney(m.v / m.n)}</small></div>
              <div className="right"><b>{fmtMoney(m.v)}</b></div>
            </div>))}
          {!topMerch.length && <p className="muted small">Keine Daten.</p>}
        </section></W>
        <W k="groesste-ausgaben" label="Größte Ausgaben" w="half"><section className="tile">
          <div className="tilehead"><b>Größte Ausgaben</b></div>
          {biggest.map((t) => (
            <div key={t.id} className="frow"><CatIcon c={t.category} size={32} /><div className="grow"><b>{t.counterparty || t.purpose || "Buchung"}</b><small className="muted block">{fmtDate(t.date)} · {t.category}</small></div>
              <div className="right"><b className="neg">{fmtMoney(t.amount)}</b></div></div>))}
          {!biggest.length && <p className="muted small">Keine Ausgaben.</p>}
        </section></W>
        <W k="ausgaben-nach-wochentag" label="Ausgaben nach Wochentag" w="half"><section className="tile">
          <div className="tilehead"><b>Ausgaben nach Wochentag</b></div>
          <div className="wdbars">{wd.map((v, i) => (
            <div key={i} className="wdcol" title={fmtMoney(v)}><div className="wdv" style={{ height: (v / wdMax) * 100 + "%" }} /><small>{WD[i]}</small></div>))}</div>
          <small className="muted">Am meisten am {["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"][wd.indexOf(Math.max(...wd))]}{wd.some(Boolean) ? ` (${fmtMoney(Math.max(...wd))})` : ""}</small>
        </section></W>
        <W k="einkaufs-positionen" label="Einkaufs-Positionen" w="half"><section className="tile">
          <div className="tilehead"><b>Einkaufs-Positionen</b><small>{items.length} Artikel aus Belegen</small></div>
          {itemParts.length ? (<>
            {itemParts.slice(0, 8).map((p, i) => (
              <div key={p.c} className="frow"><div className="grow"><div className="row1"><span>{p.c}</span><span><b>{fmtMoney(p.v)}</b></span></div>
                <Bar value={p.v} max={itemParts[0].v} color={PALETTE[i % PALETTE.length]} /><small className="muted">{pct(p.v, itemTotal)} %</small></div></div>))}
            <div className="tilehead" style={{ marginTop: 10 }}><b>Top-Artikel</b></div>
            {topItems.map((x) => (
              <div key={x.name} className="exprow"><span className="muted">{String(Math.round(x.q * 100) / 100).replace(".", ",")}×</span><span className="grow">{x.name}<small className="muted block">{[...x.shops].filter(Boolean).join(", ")}</small></span><b>{fmtMoney(x.v)}</b></div>))}
          </>) : <p className="muted small">Noch keine Positionen – scanne Kassenbons im Reiter „Ausgabe“, dann siehst du hier, wofür du im Detail Geld ausgibst (z. B. Getränke, Snacks, Drogerie).</p>}
        </section></W>
      </WidgetBoard>
    </div>
  );
}

/* ======================= Verschiebbare Widgets (Analyse-Reiter) ======================= */
const W = ({ children }) => children;
function WidgetBoard({ storeKey, title, editing = false, setEditing = () => {}, children }) {
  const items = React.Children.toArray(children).filter((c) => c && c.props && c.props.k)
    .map((c) => ({ k: c.props.k, label: c.props.label, w: c.props.w || "full", icon: c.props.icon, desc: c.props.desc, el: c.props.children }));
  const widgets = Object.fromEntries(items.map((x) => [x.k, [x.label, x.w === "half" ? 6 : x.w === "third" ? 4 : 12, x.icon || "▦", x.desc || ""]]));
  const els = Object.fromEntries(items.map((x) => [x.k, x.el || null]));
  const migrate = (l) => {
    if (l) return { gap: 16, h: {}, w: {}, ...l };
    const old = ls.get(storeKey.replace(/Grid$/, "Board"), null); // Anordnung aus v0.54.0 übernehmen
    return { order: old?.order?.length ? old.order : items.map((x) => x.k), hidden: old?.hidden || [], gap: 16, h: {}, compact: true,
      w: Object.fromEntries(Object.entries(old?.w || {}).map(([k, v]) => [k, v === "half" ? 6 : 12])) };
  };
  return <DashGrid storeKey={storeKey} widgets={widgets} migrate={migrate} els={els} editing={editing} setEditing={setEditing} title={title} />;
}

/* ======================= Vermögen ======================= */
const ASSET_KINDS = { immo: ["🏠", "Immobilie"], auto: ["🚗", "Fahrzeug"], gold: ["🪙", "Gold & Wertsachen"], depot: ["📈", "Depot / Fonds"], krypto: ["₿", "Krypto"], pension: ["🧓", "Vorsorge"], sonst: ["💎", "Sonstiges"], kredit: ["🏦", "Kredit (Schuld)"] };
function LineChart({ points, h = 180 }) {
  const [hov, setHov] = useState(null);
  if (points.length < 2) return <p className="muted small">Noch zu wenig Verlauf – sobald Umsätze aus mehreren Monaten vorhanden sind, erscheint hier die Entwicklung.</p>;
  const W = 600, P = 8, vals = points.map((p) => p.v), min = Math.min(0, ...vals), max = Math.max(1, ...vals);
  const x = (i) => P + (i / (points.length - 1)) * (W - 2 * P), y = (v) => P + (1 - (v - min) / (max - min || 1)) * (h - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(points.length - 1).toFixed(1)},${y(min)} L${x(0)},${y(min)} Z`;
  const hp = hov != null ? points[hov] : points[points.length - 1];
  const every = Math.ceil(points.length / 6);
  return (
    <div className="linechart">
      <div className="lcinfo"><b>{fmtMoney(hp.v)}</b><small className="muted">{monthLabel(hp.m)}</small></div>
      <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" onMouseLeave={() => setHov(null)}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1)); setHov(Math.max(0, Math.min(points.length - 1, i))); }}>
        <defs><linearGradient id="vgrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--acc)" stopOpacity=".35" /><stop offset="1" stopColor="var(--acc)" stopOpacity="0" /></linearGradient></defs>
        {min < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeDasharray="4 4" />}
        <path d={area} fill="url(#vgrad)" />
        <path d={d} fill="none" stroke="var(--acc)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hov != null && <line x1={x(hov)} x2={x(hov)} y1="0" y2={h} stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="lcx">{points.map((p, i) => <small key={p.m} style={{ visibility: i % every && i !== points.length - 1 ? "hidden" : "visible" }}>{monthLabel(p.m)}</small>)}</div>
    </div>
  );
}

function WealthExport({ accs, assets, points, assetVal }) {
  const accRows = accs.slice().sort((a, b) => b.now - a.now).map((x) => [x.a.name, KIND_DEFS[x.a.kind || "bank"]?.[1] || "Konto", x.a.iban || "", Math.round(x.now * 100) / 100]);
  const pos = assets.filter((x) => assetVal(x) >= 0), neg = assets.filter((x) => assetVal(x) < 0);
  const aRows = (l) => l.map((x) => [x.name, ASSET_KINDS[x.kind]?.[1] || "", "seit " + fmtDate(x.since), Math.round(assetVal(x) * 100) / 100]);
  const tAcc = sumBy(accs, (x) => x.now), tPos = sumBy(pos, assetVal), tNeg = sumBy(neg, assetVal), net = tAcc + tPos + tNeg;
  const head = ["Bezeichnung", "Art", "Info", "Wert €"];
  return <ExportMenu items={[
    { head: `Stichtag ${fmtDate(isoToday())} · Nettovermögen ${fmtMoney(net)}` },
    { label: "🖨 Vermögensaufstellung PDF", sub: "Konten, Vermögenswerte, Schulden, Verlauf", run: async () => saveBlob(await tablePdf({
      title: "Vermögensaufstellung", subtitle: `Stichtag ${fmtDate(isoToday())}`,
      kpis: [["Konten", fmtMoney(tAcc)], ["Vermögenswerte", fmtMoney(tPos)], ["Schulden", fmtMoney(tNeg)], ["Nettovermögen", fmtMoney(net)]],
      columns: [{ label: "Bezeichnung", w: 3.2 }, { label: "Art", w: 1.8 }, { label: "Info", w: 2.6 }, { label: "Wert €", w: 1.5, align: "right" }],
      sections: [{ heading: "Konten", rows: accRows, totals: ["Summe Konten", "", "", Math.round(tAcc * 100) / 100] },
        { heading: "Weitere Vermögenswerte", rows: aRows(pos), totals: ["Summe Vermögenswerte", "", "", Math.round(tPos * 100) / 100], empty: "keine erfasst" },
        { heading: "Schulden", rows: aRows(neg), totals: ["Summe Schulden", "", "", Math.round(tNeg * 100) / 100], empty: "keine erfasst" },
        { heading: "Verlauf (Monatsende)", rows: points.slice().reverse().map((p) => [monthLabel(p.m), "", "", Math.round(p.v * 100) / 100]) },
        { heading: "Nettovermögen", rows: [], totals: ["Nettovermögen", "", "", Math.round(net * 100) / 100] }],
      note: "Kontostände laut FinDocu (letzter Stand + erfasste Buchungen). Depots: nur Ein-/Auszahlungen, ohne aktuellen Kurswert." }), `vermoegensaufstellung-${isoToday()}.pdf`) },
    { label: "📊 Excel (.xlsx)", run: () => downloadXlsx(`vermoegen-${isoToday()}.xlsx`, [{ name: "Aufstellung", head, rows: [...accRows, ...aRows(pos), ...aRows(neg), ["Nettovermögen", "", "", Math.round(net * 100) / 100]] },
      { name: "Verlauf", head: ["Monat", "Vermögen €"], rows: points.map((p) => [p.m, Math.round(p.v * 100) / 100]) }]) },
    { label: "📄 CSV", run: () => downloadCsv(`vermoegen-${isoToday()}.csv`, head, [...accRows, ...aRows(pos), ...aRows(neg), ["Nettovermögen", "", "", Math.round(net * 100) / 100]]) }]} />;
}
function Wealth({ txs, accounts, openAccount, editing = false, setEditing = () => {} }) {
  const thisMonth = todayISO().slice(0, 7);
  const [range, setRange] = useLsState("wealthRange", 12);
  const [assets, setAssets] = useLsState("assets", []);
  const [edit, setEdit] = useState(null);
  const [wSel, setWSel] = useLsState("wealthAccs", []);
  const [wAssets, setWAssets] = useLsState("wealthAssets", true);
  const wValid = wSel.filter((id) => accounts.some((a) => a.id === id));
  const allAccs = accounts.map((a) => ({ a, now: accountBalance(a, txs) })).filter((x) => x.now != null);
  const accs = allAccs.filter((x) => !wValid.length || wValid.includes(x.a.id));
  const pf = useMemo(() => portfolio(wValid.length ? txs.filter((t) => wValid.includes(t.accountId)) : txs), [txs, wValid.join()]);
  const firstTx = txs.reduce((m, t) => (t.date < m ? t.date : m), thisMonth + "-31").slice(0, 7);
  const firstM = [firstTx, ...assets.map((x) => (x.since || thisMonth).slice(0, 7))].sort()[0];
  const start = range === 0 ? (firstM < thisMonth ? firstM : addMon(thisMonth, -1)) : addMon(thisMonth, -(range - 1));
  const months = monthsRange(start, thisMonth);
  const endOf = (m) => m + "-31";
  // Kontostand am Monatsende = heutiger Stand − alle späteren Umsätze
  const accAt = (x, m) => x.now - txs.filter((t) => t.accountId === x.a.id && t.date > endOf(m)).reduce((s, t) => s + t.amount, 0)
    - (x.a.kind === "cash" && x.a.atm ? txs.filter((t) => t.accountId !== x.a.id && t.category === "Bargeld" && t.amount < 0 && t.date > endOf(m) && afterOpening(t, x.a)).reduce((s, t) => s - t.amount, 0) : 0);
  const assetVal = (x) => (x.kind === "kredit" ? -Math.abs(+x.value || 0) : +x.value || 0);
  const assetAt = (m) => !wAssets ? 0 : assets.filter((x) => (x.since || "").slice(0, 7) <= m).reduce((s, x) => s + assetVal(x), 0);
  const points = months.map((m) => ({ m, v: accs.reduce((s, x) => s + accAt(x, m), 0) + assetAt(m) }));
  const now = points[points.length - 1]?.v || 0, first = points[0]?.v || 0, prevM = points[points.length - 2]?.v;
  const change = now - first;
  const groups = {};
  accs.forEach((x) => { const k = KIND_DEFS[x.a.kind || "bank"] ? x.a.kind || "bank" : "bank"; groups[k] = (groups[k] || 0) + x.now; });
  (wAssets ? assets : []).forEach((x) => { const k = "a-" + (x.kind || "sonst"); groups[k] = (groups[k] || 0) + assetVal(x); });
  const gList = Object.entries(groups).map(([k, v]) => ({ k, v, label: k.startsWith("a-") ? ASSET_KINDS[k.slice(2)]?.[1] : KIND_DEFS[k][1], icon: k.startsWith("a-") ? ASSET_KINDS[k.slice(2)]?.[0] : KIND_DEFS[k][0] })).sort((a, b) => b.v - a.v);
  const posTotal = gList.filter((g) => g.v > 0).reduce((s, g) => s + g.v, 0);
  const debts = gList.filter((g) => g.v < 0).reduce((s, g) => s + g.v, 0);
  const monthly = points.slice(1).map((p, i) => ({ k: p.m, label: monthLabel(p.m).split(" ")[0], d: p.v - points[i].v }));
  const COLORS = ["#5ee6cf", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#22c55e", "#f97316", "#14b8a6", "#ef4444"];
  const saveAsset = () => { const v = parseAmt(edit.value); if (!edit.name.trim() || isNaN(v)) return;
    const a = { ...edit, name: edit.name.trim(), value: v, since: edit.since || todayISO() };
    setAssets((l) => (l.some((x) => x.id === a.id) ? l.map((x) => (x.id === a.id ? a : x)) : [...l, a])); setEdit(null); };
  return (
    <div className="wealthpage">
      {(allAccs.length > 0 || assets.length > 0) && (
        <div className="chips anaaccs">
          <button className={"chip" + (!wValid.length ? " on" : "")} onClick={() => setWSel([])}>Alle Konten</button>
          {allAccs.map(({ a }) => <button key={a.id} className={"chip" + (wValid.includes(a.id) ? " on" : "")} onClick={() => setWSel(wValid.includes(a.id) ? wValid.filter((x) => x !== a.id) : [...wValid, a.id])}>{a.icon && a.icon !== "none" ? a.icon : kindIcon(a.kind)} {a.name}</button>)}
          {assets.length > 0 && <button className={"chip" + (wAssets ? " on" : "")} onClick={() => setWAssets(!wAssets)}>💎 Weitere Werte</button>}
          <WealthExport accs={accs} assets={wAssets ? assets : []} points={points} assetVal={assetVal} />
        </div>
      )}
      <WidgetBoard storeKey="wealthGrid" title="Vermögen" editing={editing} setEditing={setEditing}>
      <W k="vermoegensverlauf" label="Vermögensverlauf"><section className="tile wealthhero">
        <small className="muted">{wValid.length ? `Vermögen · ${wValid.length} von ${allAccs.length} Konten` : "Nettovermögen"}</small>
        <div className="kpiv big">{fmtMoney(now)}</div>
        <div className="wealthdelta">
          <span className={change >= 0 ? "pos" : "neg"}>{change >= 0 ? "▲ +" : "▼ "}{fmtMoney(change)}{first ? ` (${Math.round((change / Math.abs(first)) * 100)} %)` : ""}</span>
          <small className="muted"> seit {monthLabel(months[0])}</small>
          {prevM != null && <small className="muted"> · Vormonat {now - prevM >= 0 ? "+" : ""}{fmtMoney(now - prevM)}</small>}
        </div>
        <div className="seg sm">{[[6, "6 M"], [12, "1 J"], [36, "3 J"], [0, "Alles"]].map(([k, l]) => <button key={k} className={range === k ? "on" : ""} onClick={() => setRange(k)}>{l}</button>)}</div>
        <LineChart points={points} />
      </section></W>
        <W k="verteilung" label="Verteilung" w="half"><section className="tile">
          <div className="tilehead"><b>Verteilung</b><small>{debts ? `Schulden ${fmtMoney(debts)}` : ""}</small></div>
          {posTotal > 0 && <div className="stackbar">{gList.filter((g) => g.v > 0).map((g, i) => <div key={g.k} style={{ width: (g.v / posTotal) * 100 + "%", background: COLORS[i % COLORS.length] }} title={g.label} />)}</div>}
          {gList.map((g, i) => (
            <div key={g.k} className="frow"><span className="dot" style={{ background: g.v > 0 ? COLORS[gList.filter((x) => x.v > 0).indexOf(g) % COLORS.length] : "var(--red)" }} /><span>{g.icon}</span>
              <div className="grow"><b>{g.label}</b></div><div className="right"><b className={g.v < 0 ? "neg" : ""}>{fmtMoney(g.v)}</b><small className="muted block">{g.v > 0 ? pct(g.v, posTotal) + " %" : ""}</small></div></div>))}
          {!gList.length && <p className="muted small">Noch keine Konten mit Kontostand.</p>}
        </section></W>
        <W k="veraenderung-pro-monat" label="Veränderung pro Monat" w="half"><section className="tile">
          <div className="tilehead"><b>Veränderung pro Monat</b></div>
          {monthly.length ? (
            <div className="mbars diverge" style={{ height: 130 }}>
              {(() => { const mx = Math.max(1, ...monthly.map((x) => Math.abs(x.d))); return monthly.slice(-12).map((x) => (
                <div key={x.k} className="mcol" title={`${monthLabel(x.k)}: ${x.d >= 0 ? "+" : ""}${fmtMoney(x.d)}`}>
                  <div className="dpos">{x.d > 0 && <div className="v inc" style={{ height: (x.d / mx) * 100 + "%" }} />}</div>
                  <div className="dneg">{x.d < 0 && <div className="v out" style={{ height: (-x.d / mx) * 100 + "%" }} />}</div>
                  <small>{x.label}</small>
                </div>)); })()}
            </div>) : <p className="muted small">Noch kein Verlauf.</p>}
        </section></W>
      <W k="konten" label="Konten"><section className="tile">
        <div className="tilehead"><b>Konten</b><small>{fmtMoney(accs.reduce((s, x) => s + x.now, 0))}</small></div>
        {accs.sort((a, b) => b.now - a.now).map((x) => { const d = x.now - accAt(x, months[0]); return (
          <div key={x.a.id} className="frow click" onClick={() => openAccount(x.a.id)}>
            <span className="caticon" style={{ width: 38, height: 38, background: "#0b63f622", fontSize: 18 }}><AccIcon a={x.a} className="acci" force /></span>
            <div className="grow"><b style={accStyle(x.a)}>{x.a.name}</b><small className="muted block">{KIND_DEFS[x.a.kind || "bank"]?.[1]}{balEstimated(x.a) ? " · aus Umsätzen berechnet" : ""}</small></div>
            <div className="right"><b className={x.now < 0 ? "neg" : ""}>{fmtMoney(x.now)}</b><small className={"block " + (d >= 0 ? "pos" : "neg")}>{d >= 0 ? "+" : ""}{fmtMoney(d)}</small></div>
          </div>); })}
      </section></W>
      <W k="depot" label="Depot-Positionen" w="half" icon="📈" desc="Wertpapiere, Dividenden, Gebühren">{pf.count > 0 && (
        <section className="tile">
          <div className="tilehead"><b>Depot-Positionen</b><small>{pf.positions.length} Positionen</small></div>
          <div className="stats">
            <div><small>Investiert (netto)</small><b>{fmtMoney(pf.invested)}</b></div>
            <div><small>Dividenden & Zinsen</small><b className="ok">{fmtMoney(pf.income)}</b></div>
            <div><small>Gebühren & Steuern</small><b>{fmtMoney(pf.costs)}</b></div>
          </div>
          {pf.positions.map((p) => (
            <div key={p.key} className="frow">
              <span className="caticon" style={{ width: 40, height: 40, background: "#14b8a622", fontSize: 18 }}>📈</span>
              <div className="grow"><b className="clamp">{p.name || p.isin}</b><small className="muted block">{p.isin} · {p.shares.toLocaleString("de-AT", { maximumFractionDigits: 4 })} Stk.</small></div>
              <div className="right"><b>{fmtMoney(p.cost)}</b><small className="muted block">Einstand</small></div>
            </div>
          ))}
          <p className="muted small">Ohne Live-Kurse – Einstandswerte aus deinen Käufen/Verkäufen.</p>
        </section>
      )}</W>
      <W k="weitere-vermoegenswerte-und-schulden" label="Weitere Vermögenswerte & Schulden"><section className="tile">
        <div className="tilehead"><b>Weitere Vermögenswerte & Schulden</b><button className="link" onClick={() => setEdit({ id: uid(), name: "", kind: "immo", value: "", since: todayISO() })}>＋ Hinzufügen</button></div>
        {!assets.length && !edit && <p className="muted small">Immobilie, Auto, Gold, Depot oder Kredite manuell erfassen – sie fließen ins Nettovermögen ein.</p>}
        {assets.map((x) => (
          <div key={x.id} className="frow click" onClick={() => setEdit({ ...x, value: amtStr(x.value) })}>
            <span className="caticon" style={{ width: 38, height: 38, fontSize: 18 }}>{ASSET_KINDS[x.kind]?.[0] || "💎"}</span>
            <div className="grow"><b>{x.name}</b><small className="muted block">{ASSET_KINDS[x.kind]?.[1]} · seit {fmtDate(x.since)}</small></div>
            <div className="right"><b className={assetVal(x) < 0 ? "neg" : ""}>{fmtMoney(assetVal(x))}</b></div>
          </div>))}
        {edit && (
          <div className="assetedit">
            <div className="grid2">
              <label>Bezeichnung<input value={edit.name} autoFocus onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="z. B. Wohnung Linz" /></label>
              <label>Art<select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{Object.entries(ASSET_KINDS).map(([k, [i, l]]) => <option key={k} value={k}>{i} {l}</option>)}</select></label>
              <label>{edit.kind === "kredit" ? "Offene Schuld" : "Aktueller Wert"}<input inputMode="decimal" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} placeholder="0,00" /></label>
              <label>Seit<input type="date" value={edit.since} onChange={(e) => setEdit({ ...edit, since: e.target.value })} /></label>
            </div>
            <div className="row gap">
              <button className="btn primary sm" onClick={saveAsset}>Speichern</button>
              <button className="btn sm" onClick={() => setEdit(null)}>Abbrechen</button>
              {assets.some((x) => x.id === edit.id) && <button className="btn sm danger" onClick={() => { setAssets((l) => l.filter((x) => x.id !== edit.id)); setEdit(null); }}>Löschen</button>}
            </div>
          </div>
        )}
      </section></W>
      </WidgetBoard>
    </div>
  );
}
function Home({ docs, dlDocs, txs, budgets, onOpen, setTab, fixExtra, hasCash, accounts = [], onManual, openAccount, cashForm, uniDrop, editing = false, setEditing = () => {}, actions }) {
  const bankAccs = accounts.filter((a) => a.kind !== "cash");
  const bankBals = bankAccs.map((a) => accountBalance(a, txs)).filter((x) => x != null);
  const bankTotal = bankBals.length ? bankBals.reduce((x, y) => x + y, 0) : null;
  const cashAccs = accounts.filter((a) => a.kind === "cash");
  const thisMonth = todayISO().slice(0, 7);
  const money = docs.filter((d) => d.amount?.total && isEUR(d) && inAnalysis(d));
  // Monate mit importierten Kontoumsätzen werden aus den Umsätzen berechnet, sonst aus den Dokumenten
  const bankTx = txs.filter((t) => t.kind !== "broker" && t.category !== "Umbuchung" && !(hasCash && t.category === "Bargeld") && (t.currency || "EUR") === "EUR");
  const txMonths = new Set(bankTx.map((t) => t.date.slice(0, 7)));
  const flows = (month) => {
    if (txMonths.has(month)) {
      const l = bankTx.filter((t) => t.date.startsWith(month)), byCat = {};
      l.filter((t) => t.amount < 0).forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) - t.amount; });
      return { out: l.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0), inc: l.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0), byCat };
    }
    const l = money.filter((d) => monthKey(d) === month), byCat = {};
    l.filter((d) => d.direction === "ausgabe").forEach((d) => { byCat[d.category] = (byCat[d.category] || 0) + payAmt(d); });
    return { out: l.filter((d) => d.direction === "ausgabe").reduce((s, d) => s + payAmt(d), 0), inc: l.filter((d) => d.direction === "einnahme").reduce((s, d) => s + payAmt(d), 0), byCat };
  };
  const sumBy = (month, dir) => flows(month)[dir === "ausgabe" ? "out" : "inc"];

  const months = useMemo(() => {
    const out = [], base = new Date(thisMonth + "-15");
    for (let i = 5; i >= 0; i--) { const d = new Date(base); d.setMonth(d.getMonth() - i); out.push(d.toLocaleDateString("sv-SE").slice(0, 7)); }
    return out;
  }, [thisMonth]);
  const series = months.map((m) => ({ m, out: sumBy(m, "ausgabe"), inc: sumBy(m, "einnahme") }));
  const maxMonth = Math.max(1, ...series.flatMap((s) => [s.out, s.inc]));

  const spentByCat = flows(thisMonth).byCat;
  const parts = Object.entries(spentByCat).map(([c, v]) => ({ c, v })).sort((a, b) => b.v - a.v);
  const budgetRows = [...new Set([...Object.keys(budgets).filter((k) => budgets[k] > 0), ...Object.keys(spentByCat)])]
    .map((c) => ({ c, spent: spentByCat[c] || 0, budget: budgets[c] || 0 })).sort((a, b) => b.spent - a.spent);

  const contracts = activeContracts(docs);
  const fix = contracts.reduce((s, c) => s + monthlyCost(c.contract), 0) + (fixExtra || 0);
  const openInv = docs.filter((d) => inAnalysis(d) && d.direction === "ausgabe" && !d.paid && d.amount?.total &&
    (d.payment?.iban || (d.deadlines || []).some((x) => !x.done && /zahl|fällig/i.test(x.label))));
  const upcoming = (dlDocs || docs).flatMap((doc) => (doc.deadlines || []).filter((x) => !x.done).map((dl) => [dl, doc]))
    .sort((a, b) => a[0].date.localeCompare(b[0].date)).slice(0, 4);
  const out = sumBy(thisMonth, "ausgabe"), inc = sumBy(thisMonth, "einnahme");
  const monthName = new Date(thisMonth + "-15").toLocaleDateString("de-AT", { month: "long" });

  const w_hero = (
<div className="hero">
        <small>Saldo {monthName}</small>
        <div className="hero-v">{(inc - out >= 0 ? "+" : "") + fmtMoney(inc - out)}</div>
        <div className="hero-row">
          <div><small>Einnahmen</small><b>↑ {fmtMoney(inc)}</b></div>
          <div><small>Ausgaben</small><b>↓ {fmtMoney(out)}</b></div>
          <div onClick={() => setTab("contracts")}><small>Fixkosten</small><b>{fmtMoney(fix)}</b></div>
        </div>
      </div>
);
  const w_alerts = !!openInv.length ? (
        <div className="tile alert" onClick={() => setTab("deadlines")}>
          <CatIcon c="Rechnungen" size={36} />
          <div className="grow"><b>{openInv.length} offene Rechnung{openInv.length > 1 ? "en" : ""}</b><small>Jetzt prüfen und per QR bezahlen</small></div>
          <b>{fmtMoney(openInv.reduce((s, d) => s + d.amount.total, 0))}</b>
        </div>
      ) : null;
  const w_konten = !!bankAccs.length ? (
        <section className="tile">
          <div className="tilehead"><b>Konten</b><small>{bankTotal != null ? fmtMoney(bankTotal) : ""}</small></div>
          {bankAccs.map((a) => { const bal = accountBalance(a, txs); return (
            <div key={a.id} className="frow click" onClick={() => openAccount(a.id)}>
              <span className="caticon" style={{ width: 40, height: 40, background: "#0b63f622", fontSize: 20 }}><AccIcon a={a} className="acci" force /></span>
              <div className="grow"><b style={accStyle(a)}>{a.name}</b><small className="muted block">{balEstimated(a) ? "aus Umsätzen berechnet" : a.openingDate ? "Stand " + fmtDate(a.openingDate) + " + neuere Buchungen" : "Kontostand"}</small></div>
              <div className="right"><b className={bal == null ? "" : bal < 0 ? "neg" : "pos"}>{bal != null ? fmtMoney(bal) : "—"}</b></div>
            </div>); })}
        </section>
      ) : null;
  const w_bargeld = !!cashAccs.length ? (
        <section className="tile">
          <div className="tilehead"><b>Bargeld</b><button className="link" onClick={() => onManual({ accountId: cashAccs[0].id })}>＋ Barausgabe</button></div>
          {cashAccs.map((a) => (
            <div key={a.id} className="frow click" onClick={() => openAccount(a.id)}>
              <span className="caticon" style={{ width: 40, height: 40, background: "#16a34a22", fontSize: 20 }}>💶</span>
              <div className="grow"><b>{a.name}</b><small className="muted block">{txs.filter((t) => t.accountId === a.id).length} Buchungen{a.atm ? " · inkl. Bankomat-Behebungen" : ""}</small></div>
              <div className="right"><b className={cashBalance(a, txs) < 0 ? "neg" : "pos"}>{fmtMoney(cashBalance(a, txs))}</b><small className="muted block">Bestand</small></div>
            </div>
          ))}
          {cashBalance(cashAccs[0], txs) < 0 && <p className="warn small">Bestand negativ – vermutlich fehlt eine Behebung oder der Startbestand.</p>}
        </section>
      ) : null;
  const w_kategorien = (
<section className="tile">
        <div className="tilehead"><b>Ausgaben nach Kategorie</b><small>{monthName}</small></div>
        {parts.length ? (
          <div className="donutwrap">
            <Donut parts={parts} total={out} />
            <ul className="legendlist">
              {parts.slice(0, 5).map((p) => (
                <li key={p.c}><span className="dot" style={{ background: catMeta(p.c).color }} /><span className="grow">{p.c}</span><b>{fmtMoney(p.v)}</b></li>
              ))}
            </ul>
          </div>
        ) : <p className="muted small">Noch keine Ausgaben in diesem Monat.</p>}
      </section>
);
  const w_verlauf = (
<section className="tile">
        <div className="tilehead"><b>Verlauf</b><small>6 Monate</small></div>
        <div className="chart">
          {series.map((s) => (
            <div key={s.m} className="col">
              <div className="pair">
                <div className="v out" style={{ height: (s.out / maxMonth) * 100 + "%" }} title={fmtMoney(s.out)} />
                <div className="v inc" style={{ height: (s.inc / maxMonth) * 100 + "%" }} title={fmtMoney(s.inc)} />
              </div>
              <small>{monthLabel(s.m).split(" ")[0]}</small>
            </div>
          ))}
        </div>
        <div className="legend"><span className="dot out" />Ausgaben <span className="dot inc" />Einnahmen</div>
      </section>
);
  const w_budgets = !!budgetRows.length ? (
        <section className="tile">
          <div className="tilehead"><b>Budgets</b><small>{monthName}</small></div>
          {budgetRows.map(({ c, spent, budget }) => (
            <div key={c} className="frow">
              <CatIcon c={c} />
              <div className="grow">
                <div className="row1"><span>{c}</span><span className={budget && spent > budget ? "red" : ""}>{fmtMoney(spent)}{budget ? <small className="muted"> / {fmtMoney(budget)}</small> : ""}</span></div>
                {budget > 0 && <Bar value={spent} max={budget} color={spent > budget ? "var(--red)" : spent > budget * 0.8 ? "var(--warn)" : "var(--ok)"} />}
              </div>
            </div>
          ))}
        </section>
      ) : null;
  const w_fristen = (
<section className="tile">
        <div className="tilehead"><b>Nächste Fristen</b><button className="link" onClick={() => setTab("deadlines")}>Alle</button></div>
        {!upcoming.length && <p className="muted small">Keine offenen Fristen 🎉</p>}
        {upcoming.map(([dl, doc]) => {
          const n = daysUntil(dl.date);
          return (
            <div key={dl.id} className="frow click" onClick={() => onOpen(doc.id)}>
              <div className={"datebox" + (n < 0 ? " red" : n <= 7 ? " warn" : "")}><b>{new Date(dl.date + "T12:00").getDate()}</b><small>{new Date(dl.date + "T12:00").toLocaleDateString("de-AT", { month: "short" })}</small></div>
              <div className="grow"><b>{dl.label}</b><small className="muted block">{doc.title}</small></div>
              {doc.amount?.total != null && <b>{fmtMoney(doc.amount.total, doc.amount.currency)}</b>}
            </div>
          );
        })}
      </section>
);

  // weitere Widgets
  const recentDocs = [...docs].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5);
  const w_docs = recentDocs.length ? (
    <section className="tile">
      <div className="tilehead"><b>Neueste Dokumente</b><button className="link" onClick={() => setTab("docs")}>Alle</button></div>
      {recentDocs.map((d) => (
        <div key={d.id} className="frow click" onClick={() => onOpen(d.id)}>
          <Thumb d={d} className="thumb sm" />
          <div className="grow"><b className="clamp">{d.title}</b><small className="muted block">{d.sender ? d.sender + " · " : ""}{fmtDate(d.documentDate)}</small></div>
          {d.amount?.total != null && <b>{fmtMoney(d.amount.total, d.amount.currency)}</b>}
        </div>
      ))}
    </section>) : null;
  const recentTx = [...txs].filter((t) => t.kind !== "broker").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const accName = (id) => accounts.find((a) => a.id === id)?.name || "";
  const w_tx = recentTx.length ? (
    <section className="tile">
      <div className="tilehead"><b>Letzte Buchungen</b><button className="link" onClick={() => setTab("accounts")}>Alle</button></div>
      {recentTx.map((t) => (
        <div key={t.id} className="frow click" onClick={() => openAccount(t.accountId)}>
          <CatIcon c={t.category || "Sonstiges"} />
          <div className="grow"><b className="clamp">{t.counterparty || t.purpose || "Buchung"}</b><small className="muted block">{fmtDate(t.date)}{accName(t.accountId) ? " · " + accName(t.accountId) : ""}</small></div>
          <b className={t.amount > 0 ? "pos" : "out"}>{(t.amount > 0 ? "+" : "") + fmtMoney(t.amount, t.currency)}</b>
        </div>
      ))}
    </section>) : null;
  const topContracts = [...contracts].sort((a, b) => monthlyCost(b.contract) - monthlyCost(a.contract)).slice(0, 5);
  const w_contracts = topContracts.length ? (
    <section className="tile">
      <div className="tilehead"><b>Verträge & Fixkosten</b><button className="link" onClick={() => setTab("contracts")}>{fmtMoney(fix)} / Monat ›</button></div>
      {topContracts.map((d) => (
        <div key={d.id} className="frow click" onClick={() => onOpen(d.id)}>
          <CatIcon c={d.category} />
          <div className="grow"><b className="clamp">{d.contract.provider || d.title}</b><small className="muted block">{d.contract.name || d.category}{d.contract.cancel_by ? " · kündbar bis " + fmtDate(d.contract.cancel_by) : ""}</small></div>
          <b>{fmtMoney(monthlyCost(d.contract))}</b>
        </div>
      ))}
    </section>) : null;
  const year = thisMonth.slice(0, 4);
  const taxDocs = docs.filter((d) => d.taxRelevant && (d.documentDate || d.createdAt || "").startsWith(year));
  const w_tax = (
    <section className="tile">
      <div className="tilehead"><b>Steuer {year}</b><small>{taxDocs.length} Beleg{taxDocs.length === 1 ? "" : "e"}</small></div>
      <div className="hero-v sm">{fmtMoney(taxDocs.reduce((s, d) => s + (isEUR(d) ? d.amount?.total || 0 : 0), 0))}</div>
      {taxDocs.slice(0, 3).map((d) => (
        <div key={d.id} className="frow click" onClick={() => onOpen(d.id)}>
          <CatIcon c={d.category} /><div className="grow"><b className="clamp">{d.title}</b></div>
          {d.amount?.total != null && <b>{fmtMoney(d.amount.total, d.amount.currency)}</b>}
        </div>
      ))}
      {!taxDocs.length && <p className="muted small">Noch keine steuerrelevanten Belege in diesem Jahr.</p>}
    </section>);
  const w_quick = actions ? (
    <section className="tile">
      <div className="tilehead"><b>Schnellzugriff</b></div>
      <div className="quick">
        <button onClick={actions.scan}><span>📷</span>Scannen</button>
        <button onClick={actions.upload}><span>📄</span>Datei</button>
        <button onClick={actions.manual}><span>💶</span>Buchung</button>
        <button onClick={actions.newAcc}><span>🏦</span>Konto</button>
      </div>
    </section>) : null;

  const w_barerfassung = cashForm ? (
    <section className="tile expwidget">
      <div className="tilehead"><b>Ausgabe erfassen</b><small>alle Konten</small></div>
      {cashForm}
    </section>) : null;
  const w_ablage = uniDrop ? <section className="tile uniwidget"><div className="tilehead"><b>Universal-Ablage</b><small>wird automatisch einsortiert</small></div>{uniDrop}</section> : null;
  const els = { ablage: w_ablage, barerfassung: w_barerfassung, hero: w_hero, alerts: w_alerts, konten: w_konten, bargeld: w_bargeld, kategorien: w_kategorien, verlauf: w_verlauf,
    budgets: w_budgets, fristen: w_fristen, docs: w_docs, contracts: w_contracts, tx: w_tx, tax: w_tax, quick: w_quick };
  return (
    <>
      <DashGrid storeKey="homeLayout" widgets={HOME_WIDGETS} migrate={migrateLayout} els={els} editing={editing} setEditing={setEditing} title="Übersicht" />
      {!docs.length && <div className="empty"><div style={{ fontSize: 48 }}>📥</div><p>Tippe auf <b>＋</b> und füge dein erstes Dokument hinzu.</p></div>}
    </>
  );
}

/* Widget-Raster (Übersicht, Analyse, Vermögen, Firmenauswertung): frei platzierbar, Breite/Höhe ziehbar, ein-/ausblendbar */
function DashGrid({ storeKey, widgets, migrate, els, editing = false, setEditing = () => {}, title = "Übersicht" }) {
  const [layout, setLayoutRaw] = useState(() => migrate(ls.get(storeKey, null)));
  const setLayout = (f) => setLayoutRaw((l) => { const n = typeof f === "function" ? f(l) : f; ls.set(storeKey, n); return n; });
  const spacers = layout.order.filter(isSpacer);
  const ids = [...Object.keys(widgets), ...spacers];
  const order = [...layout.order.filter((x) => ids.includes(x)), ...ids.filter((x) => !layout.order.includes(x) && !layout.hidden.includes(x))];
  const shown = order.filter((x) => !layout.hidden.includes(x));
  const hiddenIds = ids.filter((x) => !shown.includes(x) && !isSpacer(x));
  const meta = (id) => widgets[id] || ["Leerfeld", 4, "⬚", "Freier Platz"];
  for (const sp of spacers) els[sp] = <div className={"spacer" + (editing ? " show" : "")}>{editing && <span>Leerfeld – bleibt in der Ansicht leer</span>}</div>;
  const wOf = (id) => layout.w?.[id] || meta(id)[1];
  const hOf = (id) => layout.h?.[id] || (isSpacer(id) ? 12 : null);
  const dense = layout.dense !== false;
  const addSpacer = () => { const id = "spacer-" + Date.now().toString(36); setLayout((l) => ({ ...l, order: [...shown, id], h: { ...(l.h || {}), [id]: 12 } })); };
  const gap = layout.gap ?? 16;
  const lg = useMedia("(min-width:1024px)"), md = useMedia("(min-width:700px)");
  const cols = lg ? 12 : md ? 6 : 1;
  const wdnd = useDnd((d, over) => setLayout((l) => ({ ...l, order: [...moveBetween({ w: shown }, "w", d.index, "w", over.index).w, ...hiddenIds] })));
  const spanOf = (id) => (cols === 12 ? wOf(id) : Math.max(1, Math.min(cols, Math.round(wOf(id) / 2))));
  // leere Widgets: in der Ansicht unsichtbar, behalten aber ihren Platz (außer ganze Breite) – damit Ansicht = Anpassen-Modus
  const vis = editing ? shown : shown.filter((id) => els[id] || (cols > 1 && spanOf(id) < cols));
  const setW = (id, w) => setLayout((l) => ({ ...l, w: { ...(l.w || {}), [id]: w } }));
  // Freie Platzierung (ab Desktop-Breite, 12 Spalten): jede Kachel hat x/y im Raster
  const free = cols === 12;
  const [rowsMap, setRowsMap] = useState({});
  const [drag, setDrag] = useState(null); // { id, x, y }
  const [lastMoved, setLastMoved] = useState(null);
  const compact = !!layout.compact;
  const onRows = (id, r) => setRowsMap((m) => (m[id] === r ? m : { ...m, [id]: r }));
  const packFree = (ids, pos, first) => {
    const placed = [], out = {};
    const hit = (a) => placed.some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
    // nach Position sortiert; die gerade verschobene Kachel gewinnt bei Gleichstand und verdrängt andere nach unten
    const ordered = [...ids.filter((id) => pos[id]).sort((a, b) => pos[a].y - pos[b].y || (a === first ? -1 : b === first ? 1 : pos[a].x - pos[b].x)), ...ids.filter((id) => !pos[id])];
    if (first && pos[first]) { const fy = pos[first].y, fx = pos[first].x, fw = Math.min(12, wOf(first)); const i = ordered.indexOf(first); ordered.splice(i, 1);
      const j = ordered.findIndex((id) => pos[id] && pos[id].y >= fy && pos[id].x < fx + fw && fx < pos[id].x + Math.min(12, wOf(id)));
      const k = ordered.findIndex((id) => !pos[id] || pos[id].y > fy || (pos[id].y === fy && pos[id].x >= fx));
      ordered.splice(Math.min(j < 0 ? ordered.length : j, k < 0 ? ordered.length : k), 0, first); }
    for (const id of ordered) {
      const w = Math.min(12, wOf(id)), h = hOf(id) || rowsMap[id] || 12;
      let r = null;
      if (pos[id]) { r = { x: Math.max(0, Math.min(pos[id].x, 12 - w)), y: Math.max(0, pos[id].y), w, h }; let g = 0; while (hit(r) && g++ < 4000) r.y++; }
      else for (let y = 0; !r && y < 4000; y++) for (let x = 0; x <= 12 - w; x++) { const t = { x, y, w, h }; if (!hit(t)) { r = t; break; } }
      if (compact) while (r.y > 0 && !hit({ ...r, y: r.y - 1 })) r.y--;
      placed.push(r); out[id] = r;
    }
    return out;
  };
  const basePos = layout.pos || {};
  const visP = drag?.isNew ? [...vis, drag.id] : vis;
  const curPos = () => Object.fromEntries(Object.entries(packFree(vis, basePos, lastMoved)).map(([k, v]) => [k, { x: v.x, y: v.y }]));
  const place = free ? (drag && drag.x != null ? packFree(visP, { ...curPos(), [drag.id]: { x: drag.x, y: drag.y } }, drag.id) : packFree(vis, basePos, lastMoved)) : null;
  const gridRef = useRef(null);
  // Ziehen: vorhandenes Widget (schwebt unter dem Finger/Mauszeiger) oder neues aus „Weitere Widgets“
  const startFreeDrag = (id, e, opts = {}) => {
    if (!free) return;
    e.preventDefault(); e.stopPropagation();
    const g0 = gridRef.current.getBoundingClientRect(), colW = (g0.width - gap * 11) / 12, ru = GRID_ROW + gap;
    const el = opts.isNew ? e.currentTarget : gridRef.current.querySelector(`[data-wid="${id}"]`);
    const box = el.getBoundingClientRect();
    const w = Math.min(12, opts.w || wOf(id)), h = opts.h || hOf(id) || rowsMap[id] || 12;
    const ox = opts.isNew ? Math.min(40, box.width / 2) : e.clientX - box.left, oy = opts.isNew ? 20 : e.clientY - box.top;
    const fw = opts.isNew ? Math.max(220, w * (colW + gap) - gap) : box.width, fh = opts.isNew ? 120 : box.height;
    const sx = e.clientX, sy = e.clientY;
    let cur = { id, isNew: !!opts.isNew, label: opts.label, x: opts.isNew ? null : place[id].x, y: opts.isNew ? null : place[id].y, px: e.clientX, py: e.clientY, ox, oy, fw, fh, moved: false };
    setDrag(cur); document.body.classList.add("rz-active");
    let scrollT = null;
    const calc = (cx, cy) => {
      const g = gridRef.current.getBoundingClientRect();
      const inside = cx >= g.left - 40 && cx <= g.right + 40 && cy >= g.top - 60 && cy <= g.bottom + 300;
      if (!inside && opts.isNew) return { x: null, y: null };
      const lx = cx - ox - g.left, ly = cy - oy - g.top;
      return { x: Math.max(0, Math.min(12 - w, Math.round(lx / (colW + gap)))), y: Math.max(0, Math.round(ly / ru)) };
    };
    const move = (ev) => {
      const moved = cur.moved || Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5;
      const t = calc(ev.clientX, ev.clientY);
      cur = { ...cur, ...t, px: ev.clientX, py: ev.clientY, moved }; setDrag(cur);
      clearInterval(scrollT);
      if (ev.clientY > window.innerHeight - 70) scrollT = setInterval(() => window.scrollBy(0, 16), 30);
      else if (ev.clientY < 70) scrollT = setInterval(() => window.scrollBy(0, -16), 30);
    };
    const up = () => {
      clearInterval(scrollT);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      document.body.classList.remove("rz-active");
      setDrag(null);
      if (opts.isNew && !cur.moved) { opts.onClick?.(); return; }
      if (cur.x == null) return;
      const realId = opts.isNew && isSpacer(id) ? "spacer-" + Date.now().toString(36) : id;
      const ids = opts.isNew ? [...vis, realId] : vis;
      const all = packFree(ids, { ...curPos(), [realId]: { x: cur.x, y: cur.y } }, realId);
      const pos = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { x: v.x, y: v.y }]));
      const ord = Object.keys(pos).sort((a, b) => pos[a].y - pos[b].y || pos[a].x - pos[b].x);
      setLastMoved(realId);
      setLayout((l) => ({ ...l, pos, order: [...ord, ...l.order.filter((x) => !ord.includes(x) && !l.hidden.includes(x))], hidden: l.hidden.filter((x) => x !== realId),
        ...(opts.isNew && isSpacer(realId) ? { h: { ...(l.h || {}), [realId]: 12 } } : {}) }));
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };
  const setH = (id, h) => setLayout((l) => ({ ...l, h: { ...(l.h || {}), [id]: h } }));

  return (
    <>
      {editing && (
        <div className="editbar">
          <div className="grow"><b>{title} anpassen</b><small className="muted block">{free ? "⠿ ziehen und frei platzieren – links, rechts, oben oder unten" : "⠿ ziehen zum Verschieben"} · Ecke ◢ ziehen für Breite & Höhe · ✕ blendet aus</small></div>
          {cols > 1 && <label className="gapctl" title="Abstand zwischen den Widgets">Abstand
            <input type="range" min="0" max="40" step="2" value={gap} onChange={(e) => setLayout((l) => ({ ...l, gap: +e.target.value }))} /><small>{gap}px</small></label>}
          {cols > 1 && (free
            ? <label className="densectl" title="Ein: Kacheln rutschen nach oben, wenn darüber Platz ist. Aus: Kacheln bleiben genau dort, wo du sie ablegst.">
              <input type="checkbox" checked={compact} onChange={(e) => setLayout((l) => ({ ...l, compact: e.target.checked }))} />Nach oben rücken</label>
            : <label className="densectl" title="Ein: kleine Widgets füllen Lücken automatisch. Aus: Reihenfolge bleibt strikt, Lücken bleiben frei.">
              <input type="checkbox" checked={dense} onChange={(e) => setLayout((l) => ({ ...l, dense: e.target.checked }))} />Lücken füllen</label>)}
          <button className="link" onClick={() => confirm(title + " auf Standard zurücksetzen?") && setLayout(migrate(null))}>Zurücksetzen</button>
          <button className="btn primary" onClick={() => setEditing(false)}>Fertig</button>
        </div>
      )}
      <div ref={gridRef} className={"dash" + (cols > 1 ? " gridded" : "") + (cols > 1 && !dense ? " nodense" : "") + (editing ? " editing" : "") + (free ? " freegrid" : "") + (drag ? " freedrag" : "")} style={cols > 1 ? { "--cols": cols, "--gap": gap + "px" } : undefined} data-wid-list={"w|" + vis.length}>
        {vis.map((id, i) => (
          <WidgetCell key={id} id={id} idx={i} title={meta(id)[0]} w={wOf(id)} h={hOf(id)} cols={cols} gap={gap} editing={editing} dnd={wdnd}
            place={place?.[id]} dragging={drag?.id === id} onRows={(r) => onRows(id, r)} onFreeDrag={free ? (e) => startFreeDrag(id, e) : null}
            dropBefore={wdnd.lineAt("wid", "w", i)} dropAfter={i === vis.length - 1 && wdnd.lineAt("wid", "w", vis.length)}
            onResize={(w, h) => setLayout((l) => ({ ...l, w: { ...(l.w || {}), [id]: w }, h: { ...(l.h || {}), [id]: h } }))}
            onWidth={(w) => setW(id, w)} onAutoH={() => setH(id, null)}
            onHide={() => setLayout((l) => ({ ...l, order: shown.filter((x) => x !== id), hidden: isSpacer(id) ? l.hidden : [...l.hidden.filter((x) => x !== id), id] }))}>
            {els[id] || <section className={"tile wempty" + (editing ? "" : " ghost")}><b>{meta(id)[0]}</b><small className="muted block">derzeit keine Daten – wird automatisch angezeigt, sobald es etwas gibt</small></section>}
          </WidgetCell>
        ))}
        {wdnd.ghost}
        {free && drag && drag.x != null && place[drag.id] && (
          <div className="dropslot" style={{ gridColumn: `${place[drag.id].x + 1} / span ${place[drag.id].w}`, gridRow: `${place[drag.id].y + 1} / span ${place[drag.id].h}` }} />)}
      </div>
      {free && drag && (drag.moved || !drag.isNew) && createPortal(
        <div className={"floatwidget" + (drag.isNew ? " isnew" : "")} style={{ left: drag.px - drag.ox, top: drag.py - drag.oy, width: drag.fw, height: drag.isNew ? undefined : drag.fh }}>
          {drag.isNew ? <div className="tile"><b>{drag.label}</b><small className="muted block">{drag.x == null ? "ins Raster ziehen" : "loslassen zum Ablegen"}</small></div>
            : <div className="floatclone" dangerouslySetInnerHTML={{ __html: gridRef.current?.querySelector(`[data-wid="${drag.id}"] .wbody`)?.innerHTML || "" }} />}
        </div>, document.body)}
      {editing && (
        <section className="tile addwidgets">
          <div className="tilehead"><b>Weitere Widgets</b><small>{free ? "ins Raster ziehen oder antippen" : "antippen zum Hinzufügen"}</small></div>
          <div className="wadd">
            <button className="spaceradd" onClick={free ? undefined : addSpacer} onPointerDown={free ? (e) => startFreeDrag("spacer-new", e, { isNew: true, w: 4, h: 12, label: "⬚ Leerfeld", onClick: addSpacer }) : undefined}><span>⬚</span><div><b>Leerfeld</b><small>freier Platz – beliebig oft, Größe frei ziehbar</small></div><i>＋</i></button>
            {hiddenIds.map((id) => (
              <button key={id} onClick={free ? undefined : () => setLayout((l) => ({ ...l, order: [...shown, id], hidden: l.hidden.filter((x) => x !== id) }))}
                onPointerDown={free ? (e) => startFreeDrag(id, e, { isNew: true, w: widgets[id][1], label: widgets[id][2] + " " + widgets[id][0], onClick: () => setLayout((l) => ({ ...l, order: [...shown, id], hidden: l.hidden.filter((x) => x !== id) })) }) : undefined}>
                <span>{widgets[id][2]}</span><div><b>{widgets[id][0]}</b><small>{widgets[id][3]}</small></div><i>＋</i>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}


/* Ein Widget im Raster: Breite in 12tel, Höhe in Rasterzeilen (oder automatisch nach Inhalt) */
const GRID_ROW = 8;
const isSpacer = (id) => typeof id === "string" && id.startsWith("spacer-");
function WidgetCell({ id, idx, title, w, h, cols, gap, editing, dnd, dropBefore, dropAfter, onResize, onWidth, onAutoH, onHide, children, place, dragging, onRows, onFreeDrag }) {
  const ref = useRef(null), inner = useRef(null);
  const [autoRows, setAutoRows] = useState(12);
  const grid = cols > 1, fixed = grid && !!h;
  useEffect(() => {
    if (!grid || fixed || !inner.current) return;
    const el = inner.current;
    const ro = new ResizeObserver(() => setAutoRows(Math.max(1, Math.ceil((el.getBoundingClientRect().height + gap) / (GRID_ROW + gap)))));
    ro.observe(el); return () => ro.disconnect();
  }, [grid, fixed, gap, editing]);
  useEffect(() => { if (!fixed) onRows?.(autoRows); }, [autoRows, fixed]);
  const span = cols === 12 ? w : Math.max(1, Math.min(cols, Math.round(w / 2)));
  const style = !grid ? undefined : place ? { gridColumn: `${place.x + 1} / span ${place.w}`, gridRow: `${place.y + 1} / span ${place.h}` } : { gridColumn: `span ${span}`, gridRow: `span ${fixed ? h : autoRows}` };
  function startResize(e) {
    e.preventDefault(); e.stopPropagation();
    const box = ref.current.getBoundingClientRect(), gb = ref.current.parentElement.getBoundingClientRect();
    const colW = (gb.width - gap * (cols - 1)) / cols, unit = cols === 12 ? 1 : 2;
    document.body.classList.add("rz-active");
    const move = (ev) => {
      const nc = Math.max(cols === 12 ? 2 : 1, Math.min(cols, Math.round((Math.min(ev.clientX, gb.right) - box.left + gap) / (colW + gap))));
      const nh = Math.max(6, Math.round((ev.clientY - box.top + gap) / (GRID_ROW + gap)));
      onResize(nc * unit, nh);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.classList.remove("rz-active"); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  const cls = "widget" + (dnd.isDragging("wid", "w", idx) ? " dragging" : "") + (dragging ? " floatsrc" : "") + (dropBefore ? " dropbefore" : "") + (dropAfter ? " dropafter" : "") + (span >= cols ? " wfull" : "");
  return (
    <div ref={ref} className={cls} style={style} data-wid-item={"w|" + idx} data-grid="1" data-wid={id}>
      <div ref={inner} className={"winner" + (fixed ? " fixed" : "")}>
        <div className="wbody">{children}</div>
      </div>
      {editing && (
          <div className="wchip" title={title}>
            <Handle onDown={(e) => (onFreeDrag ? onFreeDrag(e) : dnd.start(e, { kind: "wid", list: "w", index: idx, label: title }))} label={title + " verschieben"} />
            {grid && <>
              {[[4, "⅓"], [6, "½"], [8, "⅔"], [12, "1"]].map(([k, t]) => (
                <button key={k} className={w === k ? "on" : ""} title={k === 12 ? "Ganze Breite" : t + " Breite"} onClick={() => onWidth(k)}>{t}</button>
              ))}
              <button className={!h ? "on" : ""} title="Höhe automatisch nach Inhalt" onClick={onAutoH}>↕A</button>
            </>}
            <button className="wx" title={title + " ausblenden"} onClick={onHide}>✕</button>
          </div>
        )}
      {editing && grid && <span className="wresize" onPointerDown={startResize} title="Ziehen: Breite & Höhe ändern" />}
    </div>
  );
}

/* ---------- Dokumente (Docutain-Look) ---------- */
// alle Dateien aus abgelegten Ordnern (auch Unterordner) einsammeln
async function filesFromDrop(dt) {
  const items = [...(dt.items || [])].map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (!items.length) return [...(dt.files || [])];
  const out = [];
  const walk = async (e) => {
    if (e.isFile) { await new Promise((ok) => e.file((f) => { out.push(f); ok(); }, ok)); return; }
    if (e.isDirectory) {
      const rd = e.createReader();
      for (;;) { const batch = await new Promise((ok) => rd.readEntries(ok, () => ok([]))); if (!batch.length) break; for (const c of batch) await walk(c); }
    }
  };
  for (const e of items) await walk(e);
  return out;
}
const isDocFile = (x) => !x.name.startsWith(".") && (/^image\/|pdf$/i.test(x.type) || /\.(pdf|jpe?g|png|heic|heif|webp)$/i.test(x.name));

function DropField({ onFiles, onHide, busy, title = "Dateien oder Ordner hierher ziehen", what = "PDF & Fotos", isOk = isDocFile, accept = "application/pdf,image/*", emptyMsg = "Keine PDFs oder Fotos gefunden." }) {
  const [over, setOver] = useState(false);
  const ref = useRef(null), dirRef = useRef(null);
  const take = (fl) => { const all = [...(fl || [])]; const f = all.filter((x) => !x.name.startsWith(".") && isOk(x)); if (f.length) onFiles(f); else if (all.length) alert(emptyMsg); };
  return (
    <div className={"docdrop" + (over ? " over" : "")} role="button" tabIndex={0} onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
      onDrop={async (e) => { e.preventDefault(); e.stopPropagation(); setOver(false); take(await filesFromDrop(e.dataTransfer)); }}>
      <span className="ddico">{busy ? <span className="spin big" /> : "📥"}</span>
      <span className="grow"><b>{over ? "Loslassen zum Hochladen" : title}</b>
        <small className="muted block">oder klicken · <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); dirRef.current?.click(); }}>Ordner wählen</a> · {what}</small></span>
      {onHide && <button className="iconbtn ddx" title="Ablagefeld ausblenden" aria-label="Ablagefeld ausblenden" onClick={(e) => { e.stopPropagation(); onHide(); }}>✕</button>}
      <input ref={ref} type="file" accept={accept} multiple hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      <input ref={dirRef} type="file" webkitdirectory="" directory="" multiple hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
    </div>
  );
}
function ImportBar({ title, sub, done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="importbar" role="status" aria-live="polite">
      <span className="spin" aria-hidden="true" />
      <span className="grow"><b>{title}</b>{sub && <small className="muted block">{sub}</small>}<span className="ibar"><span style={{ width: Math.max(4, pct) + "%" }} /></span></span>
      {total > 0 && <small className="muted">{done} / {total}</small>}
    </div>
  );
}
/* Filter-/Chipleiste: Einträge seitlich verschiebbar und ein-/ausblendbar (gespeichert unter storeKey) */
function ChipBar({ storeKey, items, lead = null, className = "", cfg: extCfg, setCfg: extSet, seg = false }) {
  const [ownCfg, ownSet] = useLsState(storeKey, { order: [], hidden: [] });
  const cfg = extCfg || ownCfg, setCfg = extSet || ownSet;
  const [edit, setEdit] = useState(false), [dragK, setDragK] = useState(null);
  const defs = Object.fromEntries(items.filter(Boolean).map((x) => [x.k, x]));
  const order = [...cfg.order.filter((k) => defs[k]), ...Object.keys(defs).filter((k) => !cfg.order.includes(k))];
  const hidden = new Set(cfg.hidden);
  const startDrag = (e, k) => {
    if (e.button > 0) return; e.preventDefault();
    const row = e.currentTarget.parentElement; let cur = [...order];
    setDragK(k);
    const move = (ev) => {
      const els = [...row.querySelectorAll("[data-chipk]")];
      let to = els.findIndex((el) => { const r = el.getBoundingClientRect(); return ev.clientY < r.bottom && ev.clientX < r.left + r.width / 2; });
      if (to < 0) to = els.length;
      const from = cur.indexOf(k); if (to > from) to--;
      if (to !== from) { cur = [...cur]; cur.splice(from, 1); cur.splice(to, 0, k); setCfg((c) => ({ ...c, order: cur })); }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setDragK(null); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  return (
    <div className={(seg ? "seg segbar " : "chips chipbar ") + className + (edit ? " chipedit" : "")}>
      {!edit && lead}
      {order.map((k) => edit
        ? <span key={k} data-chipk={k} className={"chipcfg" + (hidden.has(k) ? " off" : "") + (dragK === k ? " drag" : "")} onPointerDown={(e) => !e.target.closest("button") && startDrag(e, k)}>
            <span className="chh" aria-hidden="true">⠿</span>{defs[k].label}
            <button className="chipeye" title={hidden.has(k) ? "Einblenden" : "Ausblenden"} onClick={() => setCfg((c) => ({ ...c, hidden: hidden.has(k) ? c.hidden.filter((x) => x !== k) : [...c.hidden, k] }))}>{hidden.has(k) ? <IcoEyeOff /> : <IcoEye />}</button>
          </span>
        : !hidden.has(k) && <React.Fragment key={k}>{defs[k].el}</React.Fragment>)}
      <button className={(seg ? "segset" : "chip chipset") + (edit ? " on" : "")} title="Leiste anordnen und ein-/ausblenden" onClick={() => setEdit(!edit)}>{edit ? "✓ Fertig" : "⇄"}</button>
      {edit && <small className="muted chiphint">Am Griff ⠿ ziehen zum Sortieren · Auge zum Ein-/Ausblenden</small>}
    </div>
  );
}

function DocList({ trashDoc, reanalyze, docs, categories, onOpen, area = "alle", setArea, cat, setCat, docGroups, toggleDocGroup, deadlineTab, onFiles, docBusy }) {
  const [showDrop, setShowDrop] = useLsState("docDrop", true);
  const [chipCfg, setChipCfg] = useLsState("docChips", { order: [], hidden: [] });
  const [q, setQ] = useState("");
  const [prevId, setPrevId] = useState(null);
  const [winPrev, setWinPrev] = useState(null);
  const [pick, setPick] = useState(null); // Set der ausgewählten IDs (null = Auswahl aus)
  const togglePick = (id) => setPick((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [tag, setTag] = useState("");
  const [year, setYear] = useState(""), [month, setMonth] = useState("");
  const [sort, setSort] = useState("date");
  const [taxOnly, setTaxOnly] = useState(false);
  const [scope, setScope] = useState(() => ls.get("docScope", "alle"));
  useEffect(() => ls.set("docScope", scope), [scope]);
  const [unpaid, setUnpaid] = useState(false);
  const [view, setView] = useState(() => ls.get("view", "list"));
  useEffect(() => ls.set("view", view), [view]);

  const tags = useMemo(() => [...new Set(docs.flatMap((d) => d.tags || []))].sort(), [docs]);
  const years = useMemo(() => [...new Set(docs.map((d) => monthKey(d).slice(0, 4)).filter(Boolean))].sort(), [docs]);

  const list = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    return docs
      .filter((d) => (scope === "alle" || docScope(d) === scope) && (area === "alle" || docArea(d) === area) && (!cat || d.category === cat) && (!tag || (d.tags || []).includes(tag)) && (!year || monthKey(d).startsWith(year)) && (!month || monthKey(d).slice(5, 7) === month) &&
        (!taxOnly || d.taxRelevant) && (!unpaid || (d.direction === "ausgabe" && d.amount?.total && !d.paid)))
      .filter((d) => { if (!terms.length) return true; const h = haystack(d); return terms.every((t) => h.includes(t)); })
      .sort((a, b) => sort === "amount" ? (payAmt(b) || 0) - (payAmt(a) || 0)
        : (b.documentDate || b.createdAt).localeCompare(a.documentDate || a.createdAt));
  }, [docs, q, cat, tag, year, month, sort, taxOnly, unpaid, area, scope]);

  const counts = useMemo(() => Object.fromEntries(categories.map((c) => [c, docs.filter((d) => d.category === c).length])), [docs, categories]);
  const amt = (d) => d.amount?.total != null && (
    <span className={"amt" + (d.direction === "einnahme" ? " ok" : d.paid ? " paid" : "")} title={payAmt(d) !== d.amount.total ? `Brutto ${fmtMoney(d.amount.total)} · ausbezahlt ${fmtMoney(payAmt(d))}` : undefined}>{d.direction === "einnahme" ? "+" : ""}{fmtMoney(payAmt(d), d.amount.currency)}</span>);
  const status = (d) => d.status === "processing" ? <span className="muted small">⏳ wird analysiert …</span> : d.status === "error" ? <span className="err">⚠️ {d.error}{reanalyze && <button className="retry" onClick={(e) => { e.stopPropagation(); reanalyze(d); }}>↻ Neu analysieren</button>}</span> : null;

  return (
    <>
      <KStats items={[{ label: "Dokumente", value: docs.length, sub: `${list.length} im aktuellen Filter` }, { label: "Heuer", value: docs.filter((d) => (d.documentDate || "").startsWith(todayISO().slice(0, 4))).length },
        { label: "Steuerrelevant", value: docs.filter((d) => d.taxRelevant).length }, { label: "Kategorien", value: new Set(docs.map((d) => d.category)).size }, { label: "Summe Filter", value: fmtMoney(list.reduce((t, d) => t + (Number(d.amount?.total) || 0), 0)) }]} />
      <div className="searchbar">
        <span>🔍</span>
        <input placeholder="Dokumente durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
        <button className="iconbtn" onClick={() => setView(view === "list" ? "grid" : "list")} aria-label="Ansicht">{view === "list" ? "▦" : "☰"}</button>
      </div>

      {!chipCfg.hidden.includes("scopebar") && <div className="seg scopeseg" role="group" aria-label="Privat oder Firma">
        {[["alle", "", "Privat & Firma"], ...SCOPES].map(([k, i, l]) => (
          <button key={k} className={scope === k ? "on" : ""} onClick={() => setScope(k)}>{i} {l} <small className="cnt">({k === "alle" ? docs.length : docs.filter((d) => docScope(d) === k).length})</small></button>
        ))}
      </div>}
      {!chipCfg.hidden.includes("areabar") && <div className="seg areaseg">
        {[["alle", "Alle", docs.length], ...Object.entries(AREAS).map(([k, [i, l]]) => [k, `${i} ${l}`, docs.filter((d) => docArea(d) === k).length])].map(([k, l, n]) => (
          <button key={k} className={area === k ? "on" : ""} onClick={() => setArea(k)}>{l} <small className="cnt">({n})</small></button>
        ))}
      </div>}
      {area === "sonstiges" && <p className="muted small" style={{ margin: "4px 2px 8px" }}>Dokumente in „Sonstiges“ zählen nicht in Übersicht, Budgets und Auswertungen.</p>}
      {!!docs.length && (
        <div className="tile mobile-only accphone">
          <DocTree docGroups={docGroups} docs={docs} selected={cat} onSelect={setCat} onToggleGroup={toggleDocGroup} variant="card" />
        </div>
      )}
      <ChipBar storeKey="docChips" cfg={chipCfg} setCfg={setChipCfg} lead={cat && <button className="chip on" onClick={() => setCat("")}>✕ <CatGlyph c={cat} /> {cat}</button>} items={[
        deadlineTab && { k: "frist", label: "⏰ " + deadlineTab.label, el: <button className="chip" onClick={deadlineTab.open}>⏰ {deadlineTab.label}</button> },
        { k: "steuer", label: "🧾 Steuerrelevant", el: <button className={taxOnly ? "chip on" : "chip"} onClick={() => setTaxOnly(!taxOnly)}>🧾 Steuerrelevant</button> },
        { k: "unbezahlt", label: "💶 Unbezahlt", el: <button className={unpaid ? "chip on" : "chip"} onClick={() => setUnpaid(!unpaid)}>💶 Unbezahlt</button> },
        { k: "monat", label: "Monat", el: <select className={"chip" + (month ? " on" : "")} value={month} onChange={(e) => setMonth(e.target.value)}><option value="">Alle Monate</option>{MONTHS_DE.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}</select> },
        { k: "jahr", label: "Jahr", el: <select className={"chip" + (year ? " on" : "")} value={year} onChange={(e) => setYear(e.target.value)}><option value="">Alle Jahre</option>{years.map((y) => <option key={y}>{y}</option>)}</select> },
        { k: "tags", label: "Tags", el: <select className={"chip" + (tag ? " on" : "")} value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Alle Tags</option>{tags.map((t) => <option key={t}>{t}</option>)}</select> },
        { k: "sort", label: "Sortierung", el: <select className="chip" value={sort} onChange={(e) => setSort(e.target.value)}><option value="date">Neueste</option><option value="amount">Betrag</option></select> },
        { k: "pick", label: "☑︎ Auswählen", el: <button className={pick ? "chip on" : "chip"} disabled={!list.length} onClick={() => setPick(pick ? null : new Set())}>{pick ? "✕ Auswahl beenden" : "☑︎ Auswählen"}</button> },
        { k: "csv", label: "⬇︎ Export", el: <ExportMenu items={[{ head: pick?.size ? `${pick.size} ausgewählt` : `${list.length} Dokumente (aktueller Filter)` },
          { label: "🗂 Dateien als ZIP", sub: pick?.size ? "nur die ausgewählten Dokumente" : "alle Dokumente im aktuellen Filter, nach Kategorie sortiert", disabled: !list.length, run: async () => {
            const l = (pick?.size ? list.filter((d) => pick.has(d.id)) : list).map((d) => ({ ...d, __folder: fileSafe(d.category || "Sonstiges").replace(/_/g, " ") }));
            const tag = [year, month, taxOnly && "steuer", cat && fileSafe(cat)].filter(Boolean).join("-") || "alle";
            const head = ["Datei", "Datum", "Titel", "Absender", "Kategorie", "Betrag €", "Steuerrelevant"];
            saveBlob(await docsZip(l, [{ name: "Übersicht.csv", data: csvBlob(head, l.map((d) => [d.__folder + "/" + docFileName(d), d.documentDate || "", d.title || "", d.sender || "", d.category || "", d.amount?.total ?? "", d.taxRelevant ? "ja" : ""])) }]), `dokumente-${tag}.zip`);
          } },
          { label: "📄 Liste als CSV", disabled: !list.length, run: () => exportCsv(list, `dokumente${year ? "-" + year : ""}${month ? "-" + month : ""}${taxOnly ? "-steuer" : ""}.csv`) }]} /> },
        { k: "scopebar", label: "👤 Leiste Privat / Firma", el: null },
        { k: "areabar", label: "🗂️ Leiste Bereiche", el: null },
        onFiles && { k: "drop", label: "📥 Ablagefeld", el: <button className={showDrop ? "chip on" : "chip"} title="Ablagefeld ein-/ausblenden" onClick={() => setShowDrop(!showDrop)}>📥 Ablagefeld</button> },
      ]} />
      {onFiles && showDrop && <DropField onFiles={onFiles} onHide={() => setShowDrop(false)} busy={!!docBusy} />}
      {docBusy && <ImportBar {...docBusy} />}
      <FitScroll>
      <div className="sumbar">{list.length} Dokument{list.length === 1 ? "" : "e"}</div>

      {!docs.length && (
        <div className="empty"><div style={{ fontSize: 48 }}>📥</div>
          <p>Noch keine Dokumente.<br />Tippe auf <b>＋</b>, um ein PDF oder Foto hinzuzufügen – Claude sortiert, verschlagwortet und liest Beträge, Fristen &amp; Verträge aus.</p></div>
      )}

      {winPrev && (
        <Win id="docprev" onClose={() => setWinPrev(null)} dirty={false} className="docprevwin">
          <div className="panelhead"><b className="clamp">{winPrev.title}</b>
            <button className="iconbtn" title="Bearbeiten" aria-label="Bearbeiten" onClick={() => { const id = winPrev.id; setWinPrev(null); onOpen(id); }}><IcoEdit /></button>
            <XBtn /></div>
          <DocPreview d={winPrev} onOpen={() => onOpen(winPrev.id)} />
        </Win>
      )}

      {view === "grid" ? (
        <div className="grid">
          {list.map((d) => (
            <div key={d.id} className={"gcard" + (pick?.has(d.id) ? " picked" : "")} onClick={() => (pick ? togglePick(d.id) : setWinPrev(d))}>
              {pick && <span className={"pickbox" + (pick.has(d.id) ? " on" : "")}>✓</span>}
              <div className="gthumbwrap">
                <Thumb d={d} className="gthumb" />
              </div>
              <div className="gbody">
                <DocActions d={d} prevOpen={false} onPreview={() => openOriginal(d)} onEdit={() => onOpen(d.id)} onTrash={trashDoc} />
                <b className="clamp">{d.title}</b>
                <small className="muted">{d.sender ? d.sender + " · " : ""}{fmtDate(d.documentDate)}</small>
                <div className="row1"><Label c={d.category} />{amt(d)}</div>
                {status(d)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="dlist">
          {list.map((d) => (
            <div key={d.id} className={"dwrap" + (prevId === d.id ? " open" : "")}>
            <SwipeRow left={pick ? [] : [{ icon: "👁", label: "Vorschau", bg: "#0ea5e9", run: () => setPrevId(prevId === d.id ? null : d.id) }, { icon: "📤", label: "Teilen", bg: "#8b5cf6", run: () => shareDocs([d]) }]}
              right={pick ? [] : [{ icon: "🗑", label: "Löschen", bg: "#ef4444", run: () => confirm(`„${d.title}“ in den Papierkorb verschieben?`) && trashDoc(d) }, { icon: "✎", label: "Bearbeiten", bg: "#3b82f6", run: () => onOpen(d.id) }]}>
            <div className={"ditem" + (pick?.has(d.id) ? " picked" : "")} onClick={() => (pick ? togglePick(d.id) : onOpen(d.id))}>
              {pick && <span className={"pickbox inline" + (pick.has(d.id) ? " on" : "")}>✓</span>}
              <Thumb d={d} />
              <div className="grow">
                <div className="row1"><b className="clamp dtitle" title="Vorschau ein-/ausblenden" onClick={(e) => { e.stopPropagation(); setPrevId(prevId === d.id ? null : d.id); }}>{d.title}</b>{amt(d)}</div>
                <small className="muted block">{d.sender ? d.sender + " · " : ""}{fmtDate(d.documentDate)}</small>
                <div className="labels">
                  <Label c={d.category} />
                  {d.taxRelevant && <span className="label tax">Steuer</span>}
                  {d.contract && <span className="label">Vertrag</span>}
                  {(d.tags || []).slice(0, 2).map((t) => <span key={t} className="label tag">#{t}</span>)}
                </div>
                {status(d)}
              </div>
              <DocActions d={d} prevOpen={prevId === d.id} onPreview={() => setPrevId(prevId === d.id ? null : d.id)} onEdit={() => onOpen(d.id)} onTrash={trashDoc} />
            </div></SwipeRow>
            {prevId === d.id && <DocPreview d={d} onOpen={() => onOpen(d.id)} />}
            </div>
          ))}
        </div>
      )}
      </FitScroll>
      {pick && (
        <div className="pickbar">
          <b>{pick.size} ausgewählt</b>
          <button className="link" onClick={() => setPick(pick.size === list.length ? new Set() : new Set(list.map((d) => d.id)))}>{pick.size === list.length ? "Keine" : "Alle"}</button>
          <span className="grow" />
          <button className="btn primary" disabled={!pick.size} onClick={() => shareDocs(list.filter((d) => pick.has(d.id)))}><IcoShare /> Teilen</button>
          <button className="btn" onClick={() => setPick(null)}>Fertig</button>
        </div>
      )}
    </>
  );
}

/* ---------- Fristen ---------- */
function Deadlines({ docs, onOpen: onEdit, saveDoc, calSync, setCalSync, token, notify }) {
  // Klick auf eine Frist: verknüpfte Rechnung/Datei direkt anzeigen (Bearbeiten über ✎ im Fenster)
  const [prev, setPrev] = useState(null);
  const onOpen = (id) => { const d = docs.find((x) => x.id === id); if (d && !d.isContract && d.mimeType) setPrev(d); else onEdit(id); };
  const [showDone, setShowDone] = useState(false);
  const [mode, setMode] = useState(() => ls.get("deadlineView", "cal"));
  useEffect(() => ls.set("deadlineView", mode), [mode]);
  const [syncOpen, setSyncOpen] = useState(false);
  const allItems = docs.flatMap((doc) => (doc.deadlines || []).map((dl) => [dl, doc])).sort((a, b) => a[0].date.localeCompare(b[0].date));
  const items = docs.flatMap((doc) => (doc.deadlines || []).map((dl) => [dl, doc]))
    .filter(([dl]) => showDone || !dl.done)
    .sort((a, b) => a[0].date.localeCompare(b[0].date));
  const groups = [
    ["Überfällig", items.filter(([dl]) => !dl.done && daysUntil(dl.date) < 0)],
    ["Nächste 7 Tage", items.filter(([dl]) => !dl.done && daysUntil(dl.date) >= 0 && daysUntil(dl.date) <= 7)],
    ["Später", items.filter(([dl]) => !dl.done && daysUntil(dl.date) > 7)],
    ["Erledigt", items.filter(([dl]) => dl.done)]
  ];
  const toggle = (dl, doc) => {
    const deadlines = doc.deadlines.map((x) => (x.id === dl.id ? { ...x, done: !x.done } : x));
    // Zahlungsfrist erledigt → Rechnung als bezahlt markieren
    const paid = /zahl|fällig/i.test(dl.label) && !dl.done ? true : doc.paid;
    saveDoc({ ...doc, deadlines, paid });
  };

  return (
    <>
      <div className="filters dlbar">
        <div className="seg" role="group" aria-label="Ansicht">
          <button className={mode === "cal" ? "on" : ""} onClick={() => setMode("cal")}>📅 Kalender</button>
          <button className={mode === "list" ? "on" : ""} onClick={() => setMode("list")}>☰ Liste</button>
        </div>
        <span className="grow" />
        <button className={"btn" + (calSync.on ? " synced" : "")} onClick={() => setSyncOpen(true)}><IcoCalSync /> {calSync.on ? "Apple Kalender verbunden" : "Mit Apple Kalender verbinden"}</button>
        <button className="btn" onClick={() => downloadIcs(allItems.filter(([dl]) => !dl.done), "fristen.ics")} disabled={!allItems.length} title="Einmalig als .ics herunterladen">⬇︎ .ics</button>
        {mode === "list" && <label className="check"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Erledigte zeigen</label>}
      </div>
      {prev && (
        <Win id="docprev" onClose={() => setPrev(null)} dirty={false} className="docprevwin">
          <div className="panelhead"><b className="clamp">{prev.title}</b>
            <button className="iconbtn" title="Bearbeiten" aria-label="Bearbeiten" onClick={() => { const id = prev.id; setPrev(null); onEdit(id); }}><IcoEdit /></button>
            <XBtn /></div>
          <DocPreview d={prev} onOpen={() => onEdit(prev.id)} />
        </Win>
      )}
      {syncOpen && <CalSyncSheet sync={calSync} setSync={setCalSync} items={allItems.filter(([dl]) => !dl.done)} token={token} notify={notify} onClose={() => setSyncOpen(false)} />}
      {mode === "cal" && <MonthCalendar items={allItems} docs={docs} onOpen={onOpen} saveDoc={saveDoc} />}
      {mode === "list" && !items.length && <div className="empty"><p>Keine offenen Fristen 🎉</p></div>}
      {mode === "list" && groups.map(([name, g]) => !!g.length && (
        <section key={name}>
          <h3 className={name === "Überfällig" ? "red" : ""}>{name}</h3>
          <ul className="list">
            {g.map(([dl, doc]) => {
              const n = daysUntil(dl.date);
              return (
                <SwipeRow key={dl.id} left={[{ icon: dl.done ? "↺" : "✓", label: dl.done ? "Offen" : "Erledigt", bg: "#16a34a", run: () => toggle(dl, doc) }]}
                  right={[{ icon: "👁", label: "Öffnen", bg: "#3b82f6", run: () => onOpen(doc.id) }, { icon: "📅", label: "Kalender", bg: "#8b5cf6", run: () => downloadIcs([[dl, doc]], "frist.ics") }]}>
                <li className={dl.done ? "done" : ""}>
                  <div className="row1">
                    <label className="check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={dl.done} onChange={() => toggle(dl, doc)} />
                      <span className="title">{dl.label}</span>
                    </label>
                    <span className={n < 0 ? "red" : n <= 7 ? "warn" : ""}>{fmtDate(dl.date)}</span>
                  </div>
                  <div className="row2" onClick={() => onOpen(doc.id)}>
                    <span>{doc.title}</span>
                    {doc.amount?.total != null && <span>{fmtMoney(doc.amount.total, doc.amount.currency)}</span>}
                    <span className="muted">{n === 0 ? "heute" : n < 0 ? `vor ${-n} T.` : `in ${n} T.`}</span>
                  </div>
                  <button className="link" onClick={() => downloadIcs([[dl, doc]], "frist.ics")}>📅 In Kalender</button>
                </li></SwipeRow>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

/* ---------- Kalender-Abo (Apple Kalender, Google, Outlook) ---------- */
function buildIcs(items, name = "FinDocu – Fristen") {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FinDocu//Fristen//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + name, "X-WR-TIMEZONE:Europe/Vienna", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ...items.map(([dl, doc]) => icsEvent(dl, doc)), "END:VCALENDAR"].join("\r\n");
}
const calKeyNew = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, "0")).join("");
async function pushCalendar(key, items, token, name) {
  const r = await fetch("/api/cal", { method: "POST", headers: { "content-type": "application/json", "x-app-token": token }, body: JSON.stringify({ k: key, ics: buildIcs(items, name) }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j.at || new Date().toISOString();
}

function CalSyncSheet({ sync, setSync, items, token, onClose, notify, calName, what = "Fristen" }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const host = location.host;
  const url = sync.key ? `webcal://${host}/api/cal?k=${sync.key}` : "";
  async function enable() {
    setBusy(true); setErr("");
    const key = sync.key || calKeyNew();
    try { const at = await pushCalendar(key, items, token, calName); setSync({ on: true, key, at }); notify("Kalender-Abo eingerichtet"); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function disable() {
    if (!confirm("Kalender-Abo beenden? Apple Kalender zeigt die Fristen danach nicht mehr an.")) return;
    try { await fetch(`/api/cal?k=${sync.key}`, { method: "DELETE", headers: { "x-app-token": token } }); } catch {}
    setSync({ on: false, key: "", at: "" });
  }
  return (
    <Win id="calsync" onClose={onClose} small dirty={false}>
      <div className="panelhead"><b>Mit Apple Kalender verbinden</b><XBtn /></div>
      {!sync.on ? <>
        {what !== "Fristen" ? <p>FinDocu stellt deine {what} als <b>Kalender-Abo</b> bereit. Apple Kalender, Google oder Outlook holen Änderungen dann selbst ab – neue oder erledigte Termine werden automatisch übernommen.</p> :
        <p>FinDocu stellt deine Fristen als <b>Kalender-Abo</b> bereit. Apple Kalender (iPhone, iPad, Mac) holt Änderungen dann selbst ab – neue Bons, Zahlungsfristen, Garantie- und Kündigungstermine erscheinen automatisch.</p>}
        <p className="muted small">Die Fristen werden dafür verschlüsselt übertragen und in deinem Vercel-Speicher unter einem geheimen Link abgelegt. Wer den Link kennt, kann die Termine sehen – nicht weitergeben.</p>
        {err && <div className="healthbox"><p className="red">✕ {err}</p>
          {/Blob/.test(err) && <ol className="small steps">
            <li>vercel.com → dein Projekt → <b>Storage</b> → <b>Create</b> → <b>Blob</b> (kostenlos)</li>
            <li>Speicher mit dem Projekt verbinden („Connect Project“) – die Variable <code>BLOB_READ_WRITE_TOKEN</code> wird automatisch gesetzt</li>
            <li>Unter <b>Deployments</b> → ⋯ → <b>Redeploy</b>, dann hier nochmal „Einrichten“</li>
          </ol>}</div>}
        <button className="btn primary" disabled={busy} onClick={enable}>{busy ? "Richte ein …" : "Kalender-Abo einrichten"}</button>
      </> : <>
        <p className="ok">✓ Abo aktiv · zuletzt aktualisiert {sync.at ? new Date(sync.at).toLocaleString("de-AT") : "–"}</p>
        <a className="btn primary" href={url}><IcoCalSync /> In Apple Kalender abonnieren</a>
        <p className="muted small">Am iPhone/iPad/Mac antippen → „Abonnieren“. Tipp: in den Kalender-Einstellungen „Aktualisieren: Alle 15 Minuten“ bzw. „Stündlich“ wählen.</p>
        <label>Link (auch für Google Kalender / Outlook)
          <div className="row1" style={{ gap: 6 }}><input readOnly value={url.replace("webcal://", "https://")} onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(url.replace("webcal://", "https://")); notify("Link kopiert"); } catch {} }}>Kopieren</button></div>
        </label>
        <div className="actions">
          <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { setSync({ ...sync, at: await pushCalendar(sync.key, items, token, calName) }); notify("Kalender aktualisiert"); } catch (e) { setErr(e.message); } setBusy(false); }}>↻ Jetzt aktualisieren</button>
          <button className="btn danger" onClick={disable}>Abo beenden</button>
        </div>
        {err && <p className="red small">✕ {err}</p>}
      </>}
      <p className="muted small" style={{ marginTop: 14 }}>Ohne Abo: „⬇︎ .ics“ lädt alle offenen {what} einmalig herunter – öffnen fügt sie zum Kalender hinzu.</p>
    </Win>
  );
}

/* ---------- Interaktiver Monatskalender ---------- */
const isoWeek = (isoD) => { const d = new Date(isoD + "T12:00:00"); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7); };
function MonthCalendar({ items, onOpen, saveDoc, docs }) {
  const today = todayISO();
  const [cursor, setCursor] = useState(today);          // Bezugsdatum für Woche/Monat/Jahr
  const [view, setView] = useState(() => ls.get("calMode", "monat"));
  useEffect(() => ls.set("calMode", view), [view]);
  const month = cursor.slice(0, 7), setMonth = (m) => setCursor(m + "-01");
  const [selDay, setSelDay] = useState(today);
  const iso = (d) => d.toLocaleDateString("sv-SE");
  const addDays = (isoD, n) => { const d = new Date(isoD + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
  const weekStart = (isoD) => { const d = new Date(isoD + "T12:00:00"); return addDays(isoD, -((d.getDay() + 6) % 7)); };
  const [dragOver, setDragOver] = useState("");
  const first = new Date(month + "-01T12:00:00");
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d.toLocaleDateString("sv-SE"); });
  const weeks = days.slice(35).every((d) => !d.startsWith(month)) ? days.slice(0, 35) : days;
  const byDay = {};
  for (const it of items) (byDay[it[0].date] ||= []).push(it);
  const shift = (n) => {
    if (view === "woche") return setCursor(addDays(cursor, 7 * n));
    const d = new Date(cursor.slice(0, 7) + "-01T12:00:00");
    if (view === "jahr") d.setFullYear(d.getFullYear() + n); else d.setMonth(d.getMonth() + n);
    setCursor(iso(d));
  };
  const pick = (d) => { setSelDay(d); setCursor(d); };
  const moveTo = async (docId, dlId, date) => {
    const doc = docs.find((d) => d.id === docId); if (!doc) return;
    await saveDoc({ ...doc, deadlines: doc.deadlines.map((x) => (x.id === dlId ? { ...x, date } : x)) });
  };
  const toggle = (dl, doc) => saveDoc({ ...doc, deadlines: doc.deadlines.map((x) => (x.id === dl.id ? { ...x, done: !x.done } : x)), paid: /zahl|fällig/i.test(dl.label) && !dl.done ? true : doc.paid });
  const tone = (dl) => (dl.done ? "done" : dl.date < today ? "over" : daysUntil(dl.date) <= 7 ? "soon" : "");
  const sel = byDay[selDay] || [];
  const [upOpen, setUpOpen] = useState(false);
  const open = items.filter(([dl]) => !dl.done);
  const overdue = open.filter(([dl]) => dl.date < today), upcoming = open.filter(([dl]) => dl.date >= today);
  return (
    <div className="cal">
      <div className="calsel top">
        <h3>{new Date(selDay + "T12:00").toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{selDay === today ? " · heute" : ""}</h3>
        {!sel.length && <p className="muted small">Keine Fristen an diesem Tag.</p>}
        {sel.map(([dl, doc]) => (
          <div key={dl.id} className={"frow calrow " + tone(dl)}>
            <input type="checkbox" checked={!!dl.done} onChange={() => toggle(dl, doc)} aria-label="Erledigt" />
            <div className="grow click" onClick={() => onOpen(doc.id)}><b>{dl.label}</b><small className="muted block">{doc.title}</small></div>
            {payAmt(doc) != null && <b>{fmtMoney(payAmt(doc), doc.amount.currency)}</b>}
            <input type="date" value={dl.date} onChange={(e) => e.target.value && moveTo(doc.id, dl.id, e.target.value)} aria-label="Datum ändern" />
          </div>
        ))}
      </div>
      {upOpen && (
        <Win id="calupc" onClose={() => setUpOpen(false)} dirty={false} small defW={620} className="calupcwin">
          <div className="panelhead"><b>⏰ Bevorstehend</b><small className="muted grow" style={{ marginLeft: 8 }}>{overdue.length ? `${overdue.length} überfällig · ` : ""}{upcoming.length} offen</small><XBtn /></div>
          <div className="calupclist">
            {!overdue.length && !upcoming.length && <p className="muted small">Keine offenen Fristen 🎉</p>}
            {[...overdue, ...upcoming].map(([dl, doc]) => {
              const n = daysUntil(dl.date);
              return (
                <div key={dl.id} className={"frow calrow click " + tone(dl) + (dl.date === selDay ? " cur" : "")} onClick={() => pick(dl.date)}>
                  <div className={"datebox" + (n < 0 ? " red" : n <= 7 ? " warn" : "")}><b>{new Date(dl.date + "T12:00").getDate()}</b><small>{new Date(dl.date + "T12:00").toLocaleDateString("de-AT", { month: "short" })}</small></div>
                  <div className="grow"><b>{dl.label}</b><small className="muted block">{doc.title}</small></div>
                  {payAmt(doc) != null && <b>{fmtMoney(payAmt(doc), doc.amount.currency)}</b>}
                  <small className={"muted nowrap" + (n < 0 ? " red" : "")}>{n === 0 ? "heute" : n < 0 ? `vor ${-n} T.` : `in ${n} T.`}</small>
                  <button className="iconbtn" title="Dokument öffnen" onClick={(e) => { e.stopPropagation(); onOpen(doc.id); }}>›</button>
                </div>
              );
            })}
          </div>
        </Win>
      )}
      <div className="calhead">
        <button className={"chip calupbtn" + (upOpen ? " on" : "") + (overdue.length ? " warn" : "")} onClick={() => setUpOpen(!upOpen)} title="Bevorstehende Fristen">⏰ Bevorstehend <b>{overdue.length + upcoming.length}</b></button>
        <button className="iconbtn" onClick={() => shift(-1)} aria-label="Zurück">‹</button>
        <b className="grow">{view === "jahr" ? cursor.slice(0, 4)
          : view === "woche" ? (() => { const ws = weekStart(cursor), we = addDays(ws, 6); const kw = isoWeek(ws); return `KW ${kw} · ${fmtDate(ws).slice(0, 6)} – ${fmtDate(we)}`; })()
          : first.toLocaleDateString("de-AT", { month: "long", year: "numeric" })}</b>
        <div className="seg calmodes" role="group" aria-label="Ansicht">
          {[["woche", "Woche"], ["monat", "Monat"], ["jahr", "Jahr"], ["kompakt", "Kompakt"]].map(([k, l]) => (
            <button key={k} className={view === k ? "on" : ""} onClick={() => { setView(k); setCursor(selDay); }}>{l}</button>
          ))}
        </div>
        <button className="chip" onClick={() => pick(today)}>Heute</button>
        <button className="iconbtn" onClick={() => shift(1)} aria-label="Weiter">›</button>
      </div>

      {view === "woche" && (
        <div className="calweek">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart(cursor), i)).map((d) => {
            const list = byDay[d] || [];
            return (
              <div key={d} className={"wday" + (d === today ? " today" : "") + (d === selDay ? " sel" : "") + (dragOver === d ? " over" : "")}
                onClick={() => setSelDay(d)}
                onDragOver={(e) => { e.preventDefault(); setDragOver(d); }} onDragLeave={() => setDragOver("")}
                onDrop={(e) => { e.preventDefault(); setDragOver(""); const [docId, dlId] = e.dataTransfer.getData("text/plain").split("|"); moveTo(docId, dlId, d); setSelDay(d); }}>
                <div className="wdhead"><small>{new Date(d + "T12:00").toLocaleDateString("de-AT", { weekday: "short" })}</small><span className="calnum">{+d.slice(8)}</span></div>
                {list.map(([dl, doc]) => (
                  <div key={dl.id} className={"wev " + tone(dl)} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", `${doc.id}|${dl.id}`)}
                    onClick={(e) => { e.stopPropagation(); onOpen(doc.id); }} title="Klicken: Dokument öffnen · Ziehen: verschieben">
                    <b>{dl.label}</b><small>{doc.title}</small>{payAmt(doc) != null && <small className="amt">{fmtMoney(payAmt(doc), doc.amount.currency)}</small>}
                  </div>
                ))}
                {!list.length && <small className="muted wempty">–</small>}
              </div>
            );
          })}
        </div>
      )}

      {view === "jahr" && (
        <div className="calyear">
          {Array.from({ length: 12 }, (_, m) => {
            const ym = `${cursor.slice(0, 4)}-${String(m + 1).padStart(2, "0")}`;
            const f = new Date(ym + "-01T12:00:00"), off = (f.getDay() + 6) % 7, n = new Date(f.getFullYear(), m + 1, 0).getDate();
            const cnt = Object.keys(byDay).filter((k) => k.startsWith(ym)).reduce((t, k) => t + byDay[k].filter(([dl]) => !dl.done).length, 0);
            return (
              <div key={ym} className="ymonth">
                <button className="ymhead" onClick={() => { setView("monat"); setCursor(ym + "-01"); }}>
                  <b>{f.toLocaleDateString("de-AT", { month: "long" })}</b>{cnt > 0 && <small className="pill">{cnt}</small>}
                </button>
                <div className="ygrid">
                  {["M", "D", "M", "D", "F", "S", "S"].map((w, i) => <span key={i} className="ywd">{w}</span>)}
                  {Array.from({ length: off }, (_, i) => <span key={"e" + i} />)}
                  {Array.from({ length: n }, (_, i) => {
                    const d = `${ym}-${String(i + 1).padStart(2, "0")}`, list = byDay[d] || [];
                    const t = list.length ? (list.some(([dl]) => tone(dl) === "over") ? "over" : list.some(([dl]) => tone(dl) === "soon") ? "soon" : list.every(([dl]) => dl.done) ? "done" : "has") : "";
                    return <button key={d} className={"yday " + t + (d === today ? " today" : "") + (d === selDay ? " sel" : "")} onClick={() => pick(d)} title={list.map(([dl, doc]) => `${dl.label}: ${doc.title}`).join("\n") || undefined}>{i + 1}</button>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(view === "monat" || view === "kompakt") && <div className={"calgrid" + (view === "kompakt" ? " compact" : "")} role="grid">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => <div key={w} className="calwd">{w}</div>)}
        {weeks.map((d) => {
          const list = byDay[d] || [];
          return (
            <div key={d} role="gridcell" tabIndex={0}
              className={"calday" + (d.startsWith(month) ? "" : " other") + (d === today ? " today" : "") + (d === selDay ? " sel" : "") + (dragOver === d ? " over" : "")}
              onClick={() => setSelDay(d)} onKeyDown={(e) => e.key === "Enter" && setSelDay(d)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(d); }} onDragLeave={() => setDragOver("")}
              onDrop={(e) => { e.preventDefault(); setDragOver(""); const [docId, dlId] = e.dataTransfer.getData("text/plain").split("|"); moveTo(docId, dlId, d); setSelDay(d); }}>
              <span className="calnum">{+d.slice(8)}</span>
              <div className="calev">
                {list.slice(0, 3).map(([dl, doc]) => (
                  <span key={dl.id} className={"calchip " + tone(dl)} draggable title={`${dl.label}: ${doc.title} – zum Verschieben ziehen`}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", `${doc.id}|${dl.id}`)}
                    onClick={(e) => { e.stopPropagation(); onOpen(doc.id); }}>{dl.label}</span>
                ))}
                {list.length > 3 && <span className="calmore">+{list.length - 3}</span>}
                {!!list.length && <span className="caldots">{list.slice(0, 4).map(([dl]) => <i key={dl.id} className={tone(dl)} />)}</span>}
              </div>
            </div>
          );
        })}
      </div>}
    </div>
  );
}

/* ---------- Verträge & Fixkosten (Finanz-Look) ---------- */
// Pro Anbieter nur das neueste Dokument zählen (z. B. 12 Monatsrechnungen = 1 Vertrag)
function activeContracts(docs) {
  const by = {};
  for (const d of docs.filter((d) => d.contract && d.contract.active !== false)) {
    const k = norm(d.contract.customerNumber || d.contract.provider);
    if (!by[k] || (d.documentDate || "") > (by[k].documentDate || "")) by[k] = d;
  }
  return Object.values(by);
}
/* Buchungen eines Vertrags/Abos – ausklappbar */
function TxFold({ list, accounts }) {
  const [all, setAll] = useState(false);
  const accName = (id) => accounts.find((a) => a.id === id)?.name || "";
  const shown = all ? list : list.slice(0, 12);
  const sum = list.reduce((s, t) => s + t.amount, 0);
  const years = {};
  for (const t of list) years[t.date.slice(0, 4)] = (years[t.date.slice(0, 4)] || 0) + t.amount;
  return (
    <div className="txfold">
      <div className="txfoldsum">
        <span>{list.length} Buchungen · gesamt <b>{fmtMoney(sum)}</b></span>
        <span className="muted">{Object.entries(years).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 4).map(([y, v]) => `${y}: ${fmtMoney(v)}`).join(" · ")}</span>
      </div>
      {shown.map((t) => (
        <div key={t.id} className="txfoldrow">
          <span className="muted">{fmtDate(t.date)}</span>
          <span className="one">{t.purpose || t.bookingText || t.counterparty || "–"}</span>
          <span className="muted one">{accName(t.accountId)}{t.docId ? " · 📎" : ""}</span>
          <b className={"r " + (t.amount > 0 ? "pos" : "")}>{fmtMoney(t.amount, t.currency)}</b>
        </div>
      ))}
      {list.length > shown.length && <button className="link" onClick={() => setAll(true)}>Alle {list.length} Buchungen zeigen</button>}
      {!list.length && <p className="muted small">Keine passenden Buchungen gefunden.</p>}
    </div>
  );
}

function Contracts({ docs, onOpen, me, notify, extra = [], subs, setSubs, txs = [], accounts = [] }) {
  const [open, setOpen] = useState({});
  const toggleOpen = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const txById = useMemo(() => Object.fromEntries(txs.map((t) => [t.id, t])), [txs]);
  // Buchungen zu einem Vertragsdokument: Anbieter im Empfänger/Verwendungszweck
  const txFor = (c) => { const w = norm(c.provider || "").split(" ").filter((x) => x.length > 2)[0]; return !w ? [] : txs.filter((t) => t.kind !== "broker" && norm(`${t.counterparty} ${t.purpose}`).includes(w)).sort((a, b) => b.date.localeCompare(a.date)); };
  const [letterFor, setLetterFor] = useState(null);
  const [showStale, setShowStale] = useState(false);
  const [sortBy, setSortBy] = useState("monat");
  const list = activeContracts(docs).sort((a, b) => monthlyCost(b.contract) - monthlyCost(a.contract));
  const ended = docs.filter((d) => d.contract && d.contract.active === false);
  const inactive = (r) => subInactive(r, subs);
  const live = extra.filter((r) => !inactive(r)), stale = extra.filter(inactive);
  const isOk = (r) => (subs?.verified || []).includes(r.key), isEnded = (r) => (subs?.ended || []).includes(r.key);
  const toggleIn = (k, list) => (list || []).includes(k) ? list.filter((x) => x !== k) : [...(list || []), k];
  const verify = (r) => setSubs({ ...subs, verified: toggleIn(r.key, subs.verified), ended: (subs.ended || []).filter((k) => k !== r.key) });
  const endIt = (r) => setSubs({ ...subs, ended: toggleIn(r.key, subs.ended), verified: (subs.verified || []).filter((k) => k !== r.key) });
  const perMonth = (r) => r.amount * (INTERVAL_FACTOR[r.interval] || 0);
  const month = list.reduce((s, d) => s + monthlyCost(d.contract), 0) + live.reduce((s, r) => s + perMonth(r), 0);
  const soon = list.filter((d) => d.contract.cancelBy && daysUntil(d.contract.cancelBy) >= 0 && daysUntil(d.contract.cancelBy) <= 60);
  const letter = letterFor ? cancelLetter(letterFor.contract, me) : "";
  const sorter = { monat: (a, b) => perMonth(b) - perMonth(a), name: (a, b) => a.name.localeCompare(b.name), zuletzt: (a, b) => (b.last || "").localeCompare(a.last || "") }[sortBy];
  const rows = [...live, ...(showStale ? stale : [])].sort(sorter);
  const remove = (r) => setSubs?.({ ...subs, confirmed: subs.confirmed.filter((k) => k !== r.key), dismissed: [...subs.dismissed, r.key] });

  return (
    <div className="cdash">
      <div className="hero">
        <small>Fixkosten pro Monat</small>
        <div className="hero-v">{fmtMoney(month)}</div>
        <div className="hero-row four">
          <div><small>Pro Jahr</small><b>{fmtMoney(month * 12)}</b></div>
          <div><small>Verträge & Abos</small><b>{list.length + live.length}</b></div>
          <div><small>Bald kündbar</small><b>{soon.length}</b></div>
          <div><small>Beendet / inaktiv</small><b>{stale.length}</b></div>
        </div>
      </div>

      <FitScroll card>
      {!list.length ? (
        <div className="tile hintrow">
          <span className="caticon" style={{ width: 40, height: 40, background: "#8b5cf622", fontSize: 18 }}>📑</span>
          <div className="grow"><b>Noch keine Vertragsdokumente</b><small className="muted block">Lade einen Vertrag, eine Polizze oder eine Abo-Rechnung hoch – Kündigungsfristen und Kündigungsschreiben gibt es dann automatisch.</small></div>
        </div>
      ) : (
        <section className="tile">
          <div className="tilehead"><b>Vertragsordner</b><small>{list.length} · nach Kosten</small></div>
          <div className="cgrid">
          {list.map((d) => {
            const c = d.contract, n = c.cancelBy ? daysUntil(c.cancelBy) : null;
            return (
              <div key={d.id} className="crow">
                <div className="frow click" onClick={() => onOpen(d.id)}>
                  <CatIcon c={d.category} />
                  <div className="grow">
                    <b>{c.provider}</b>
                    <small className="muted block">{[c.name, c.customerNumber && "Nr. " + c.customerNumber].filter(Boolean).join(" · ") || d.category}</small>
                  </div>
                  <div className="right"><b>{c.amount ? fmtMoney(c.amount) : "–"}</b><small className="muted block">{(INTERVAL_SHORT[c.interval] || "").replace("/ ", "")}</small></div>
                </div>
                <div className="cmeta">
                  {c.cancelBy
                    ? <span className={"pill " + (n < 0 ? "red" : n <= 30 ? "warn" : "")}>⏰ bis {fmtDate(c.cancelBy)}{n >= 0 ? ` · ${n} T.` : " · verpasst"}</span>
                    : c.noticePeriod ? <span className="pill">Frist: {c.noticePeriod}</span> : <span className="pill muted">Kündigungsfrist unbekannt</span>}
                  <span className="grow" />
                  <button className="link" onClick={() => toggleOpen(d.id)}>{open[d.id] ? "Buchungen ▴" : `Buchungen (${txFor(c).length}) ▾`}</button>
                  <button className="link" onClick={() => setLetterFor(d)}>Kündigen ›</button>
                </div>
                {open[d.id] && <TxFold list={txFor(c)} accounts={accounts} />}
              </div>
            );
          })}
          </div>
        </section>
      )}
      {!!extra.length && (
        <section className="tile subtile">
          <div className="tilehead"><b>Aus Kontoumsätzen</b>
            <span className="subctl">
              <select className="chip" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sortieren">
                <option value="monat">nach Kosten</option><option value="name">nach Name</option><option value="zuletzt">zuletzt gebucht</option>
              </select>
              {!!stale.length && <button className={"chip" + (showStale ? " on" : "")} onClick={() => setShowStale(!showStale)}>{showStale ? "Inaktive ausblenden" : `+ ${stale.length} beendet / inaktiv`}</button>}
            </span>
          </div>
          <div className="subtable">
            <div className="subhead"><span>Anbieter</span><span>Kategorie</span><span>Intervall</span><span className="r">Betrag</span><span className="r">pro Monat</span><span className="r">pro Jahr</span><span>Zuletzt</span><span className="r">Status</span></div>
            {rows.map((r) => (
              <React.Fragment key={r.key}>
              <div className={"subrow" + (inactive(r) ? " stale" : "") + (open[r.key] ? " open" : "")}>
                <span className="sname click" onClick={() => toggleOpen(r.key)} title="Buchungen ein-/ausklappen"><IcoChev open={!!open[r.key]} /><CatIcon c={r.category || "Sonstiges"} size={32} /><span className="grow"><b className="one">{r.name}</b><small className="muted block">{r.count}× gebucht{isEnded(r) ? " · deaktiviert" : isOk(r) ? " · bestätigt" : subStale(r) ? " · vermutlich beendet" : ""}</small></span></span>
                <span className="muted one">{r.category || "–"}</span>
                <span className="muted">{(INTERVAL_SHORT[r.interval] || "").replace("/ ", "") || r.interval}</span>
                <b className="r">{fmtMoney(r.amount)}</b>
                <span className="r">{fmtMoney(perMonth(r))}</span>
                <span className="r muted">{fmtMoney(perMonth(r) * 12)}</span>
                <span className={"muted" + (subStale(r) && !isOk(r) ? " red" : "")}>{fmtDate(r.last)}</span>
                <span className="subact">{setSubs && <>
                  <button className={"iconbtn ok" + (isOk(r) ? " on" : "")} title={isOk(r) ? "Bestätigung aufheben" : "Bestätigen: läuft noch, zählt zu den Fixkosten"} aria-pressed={isOk(r)} onClick={() => verify(r)}>✓</button>
                  <button className={"iconbtn no" + (isEnded(r) ? " on" : "")} title={isEnded(r) ? "Wieder aktivieren" : "Deaktivieren: Vertrag beendet, zählt nicht mehr"} aria-pressed={isEnded(r)} onClick={() => endIt(r)}>✕</button>
                </>}</span>
              </div>
              {open[r.key] && <TxFold list={(r.txIds || []).map((id) => txById[id]).filter(Boolean)} accounts={accounts} />}
              </React.Fragment>
            ))}
          </div>
        </section>
      )}
      {!!ended.length && <p className="muted small" style={{ marginTop: 16 }}>{ended.length} beendete Verträge (im Dokument unter „Vertrag / Abo“ abgewählt)</p>}
      </FitScroll>

      {letterFor && (
        <Win id="letter" onClose={() => setLetterFor(null)} dirty={false}>
            <div className="panelhead"><b>Kündigung</b><XBtn /></div>
            {!me.name && <p className="warn small">Tipp: Name und Adresse unter „Einstellungen“ eintragen, dann ist das Schreiben komplett.</p>}
            <pre className="fulltext letter">{letter}</pre>
            <div className="actions">
              <button className="btn primary" onClick={() => copy(letter, notify)}>Kopieren</button>
              <a className="btn" href={`mailto:?subject=${encodeURIComponent("Kündigung " + (letterFor.contract.customerNumber || letterFor.contract.provider))}&body=${encodeURIComponent(letter)}`}>Als E-Mail</a>
              <button className="btn" onClick={() => download(new Blob([letter], { type: "text/plain" }), `Kuendigung-${letterFor.contract.provider}.txt`)}>⬇︎ .txt</button>
            </div>
            <p className="muted small">Kündigungen am besten nachweisbar schicken (Einschreiben, E-Mail mit Bestätigung oder Kundenportal). Keine Rechtsberatung.</p>
        </Win>
      )}
    </div>
  );
}

/* ---------- Konten, Umsätze & Depot ---------- */
const shortD = (iso) => (iso ? new Date(iso + "T12:00").toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "");
const IMPORT_ACCEPT = ".csv,.txt,.tsv,.xml,.sta,.mt940,.940,.ofx,.qfx,.qif,.json,.xlsx,.xlsm,.xls,.pdf,image/*";
const TX_CATS = (categories) => [...new Set([...categories, "Einnahmen", "Bargeld", "Umbuchung"])];

function Accounts({ goTab, resetCp, scanReceiptFor, receiptFor, busy, setBusy = () => {}, addCategory, linkTx, attachNew, txs, accounts, setAccounts, importTxs, updateTx, deleteAccount, categories, docs, onOpen, token, notify, recurring, subs, setSubs, onManual, deleteTx, acc: accProp, setAcc, sel: selProp = [], allSel = true, setSel, accActions = {}, hiddenAccs = [], visAccounts = [], groups, toggleGroup, newAccReq, clearNewAccReq }) {
  const [accVis, setAccVis] = useState(false);
  const [pick, setPick] = useState(false);
  // Maus auf einer Konto-Karte = Vorschau nur dieses Kontos (alles andere ausgeblendet)
  const [peek, setPeek] = useState("");
  const peekT = useRef(null), lastPtr = useRef("mouse");
  const sel = peek ? [peek] : selProp, acc = peek || accProp;
  const cardAccounts = visAccounts.filter((a) => selProp.includes(a.id));
  const [newAcc, setNewAcc] = useState(false);
  useEffect(() => { if (newAccReq) { setNewAcc(true); clearNewAccReq(); } }, [newAccReq]);
  const cashAccs = accounts.filter((a) => a.kind === "cash");
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("");
  const [imp, setImp] = useState(null);
  const [txOpen, setTxOpen] = useState(null);
  const [coll, setColl] = useState("");
  const [logoOpen, setLogoOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => autoLogos(txs), 1500); return () => clearTimeout(t); }, [txs.length]);
  const [limit, setLimit] = useState(150);
  // Kopfbereich bleibt stehen, nur die Umsatzliste scrollt (wenn genug Platz ist)
  const scrollRef = useRef(null);
  const fitH = useFitHeight(scrollRef);
  const onListScroll = (e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight > el.scrollHeight - 400 && list.length > limit) setLimit((n) => n + 300); };
  const fileRef = useRef();

  const selKey = sel.join(",");
  const scoped = useMemo(() => { const set = new Set(sel); return txs.filter((t) => set.has(t.accountId) || (!t.accountId && allSel)); }, [txs, selKey, allSel]);
  const months = useMemo(() => [...new Set(scoped.map((t) => t.date.slice(0, 7)))].sort().reverse(), [scoped]);
  const list = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    return scoped.filter((t) => (!month || t.date.startsWith(month)) && (!coll || (t.colls || []).includes(coll)) &&
      (!terms.length || terms.every((w) => norm(`${t.counterparty} ${t.purpose} ${t.category} ${t.security || ""} ${t.isin || ""} ${String(t.amount).replace(".", ",")}`).includes(w))))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [scoped, q, month, coll]);
  const bank = list.filter((t) => t.kind !== "broker" && t.category !== "Umbuchung" && !(cashAccs.length && t.category === "Bargeld"));
  const inc = bank.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const out = bank.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const pending = recurring.filter((r) => !subs.confirmed.includes(r.key) && !subs.dismissed.includes(r.key));
  const accName = (id) => accounts.find((a) => a.id === id)?.name || "Konto";
  const [editAcc, setEditAcc] = useState(null);
  const wideTx = useMedia("(min-width:1024px)");
  const selA = accounts.find((a) => a.id === acc);
  const selBal = selA ? accountBalance(selA, txs) : null;
  const selAccounts = visAccounts.filter((a) => sel.includes(a.id));
  const knownBal = selAccounts.map((a) => accountBalance(a, txs)).filter((x) => x != null);
  const plusBal = knownBal.filter((x) => x > 0).reduce((t, x) => t + x, 0), minusBal = knownBal.filter((x) => x < 0).reduce((t, x) => t + x, 0);
  const multi = !acc;

  // Buchung mit Beleg: Beleg-Vorschau unter der Zeile auf-/zuklappen (wie bei Dokumente), sonst Bearbeiten-Fenster
  const [prevTx, setPrevTx] = useState(null);
  const docOf = (t) => (t.docId ? docs.find((x) => x.id === t.docId) : null);
  function openTx(t) { setTxOpen(t); }
  const txSwipe = (t) => ({
    left: [{ icon: "✎", label: "Details", bg: "#3b82f6", run: () => setTxOpen(t) }],
    right: [
      { icon: "🗑", label: "Löschen", bg: "#ef4444", run: () => confirm(`Buchung „${t.counterparty || t.purpose || "Buchung"}“ (${fmtMoney(t.amount, t.currency)}) löschen?`) && deleteTx(t) },
      t.docId ? { icon: "📎", label: "Beleg", bg: "#0ea5e9", run: () => onOpen(t.docId) } : t.kind !== "broker" && { icon: "📷", label: "Beleg", bg: "#0ea5e9", run: () => (scanReceiptFor ? scanReceiptFor(t.id) : attachNew(t.id, "scan")) }
    ]
  });
  const TxActs = ({ t }) => { const d = docOf(t); const st = (f) => (e) => { e.stopPropagation(); f(); }; return (
    <div className="dactions txacts" onClick={(e) => e.stopPropagation()}>
      <button title="Buchung bearbeiten" aria-label="Bearbeiten" onClick={st(() => setTxOpen(t))}><IcoEdit /></button>
      <button title={d ? "Beleg drucken" : "Kein Beleg angehängt"} aria-label="Drucken" disabled={!d} onClick={st(() => d && printDoc(d))}><IcoPrint /></button>
      <button title={d ? "Beleg teilen" : "Kein Beleg angehängt"} aria-label="Teilen" disabled={!d} onClick={st(() => d && shareDocs([d]))}><IcoShare /></button>
      <button title="Buchung löschen" aria-label="Löschen" className="del" onClick={st(() => confirm(`Buchung „${t.counterparty || t.purpose || "Buchung"}“ (${fmtMoney(t.amount, t.currency)}) löschen?`) && deleteTx(t))}><IcoTrash /></button>
    </div>); };
  async function onPick(file) {
    if (!file) return;
    try { setImp({ file, result: await parseFile(file, ls.get("mappings", {})) }); }
    catch (e) { notify("Datei nicht lesbar: " + e.message); nextImp(); }
  }
  const [showDrop, setShowDrop] = useLsState("accDrop", true);
  const impQ = useRef({ files: [], i: 0 });
  const report = () => { const q = impQ.current; setBusy(q.i <= q.files.length && q.files.length ? { title: `Kontoauszug ${q.i} von ${q.files.length} wird importiert …`, sub: q.files[q.i - 1]?.name, done: q.i - 1, total: q.files.length, n: q.files.length - q.i + 1 } : null); };
  const nextImp = () => { const q = impQ.current; if (q.i < q.files.length) { q.i++; report(); onPick(q.files[q.i - 1]); } else { impQ.current = { files: [], i: 0 }; setBusy(null); } };
  const dropFiles = (files) => { impQ.current = { files, i: 0 }; nextImp(); };

  const dayGroups = [];
  for (const t of list.slice(0, limit)) { const g = dayGroups[dayGroups.length - 1]; if (g && g.date === t.date) g.items.push(t); else dayGroups.push({ date: t.date, items: [t] }); }

  const modals = (<>
      {editAcc && <AccountSheet init={editAcc} txs={txs} hasAtmAccount={cashAccs.some((a) => a.atm && a.id !== editAcc.id)} onClose={() => setEditAcc(null)}
        onSave={(a) => { setAccounts((l) => l.map((x) => (x.id === a.id ? a : x))); setEditAcc(null); notify("Konto gespeichert"); }} />}
      {newAcc && <AccountSheet txs={txs} hasAtmAccount={cashAccs.some((a) => a.atm)} onClose={() => setNewAcc(false)} onSave={(a) => { setAccounts((l) => [...l, a]); setNewAcc(false); setAcc(a.id); notify(`Konto „${a.name}“ angelegt`); }} />}
      {imp && <ImportSheet imp={imp} accounts={accounts} setAccounts={setAccounts} importTxs={importTxs} token={token} notify={notify} onClose={() => { setImp(null); if (impQ.current.files.length) setTimeout(nextImp, 50); }} />}
      {logoOpen && <LogoWin txs={txs} onClose={() => setLogoOpen(false)} />}
      {accVis && <AccVisWin accounts={accounts} txs={txs} onHide={accActions.onHide} onUnhide={accActions.onUnhide} onClose={() => setAccVis(false)} />}
      {txOpen && <TxSheet scanReceiptFor={scanReceiptFor} receiptFor={receiptFor} txs={txs} recurring={recurring} subs={subs} goTab={goTab} resetCp={resetCp} onSearch={(v) => { setQ(v); setMonth(""); }} onAccount={(id) => setAcc?.(id)} onColl={(id) => { setColl(id); setSel?.([]); }} addCategory={addCategory} accounts={accounts} linkTx={linkTx} attachNew={attachNew} deleteTx={deleteTx} t={txs.find((x) => x.id === txOpen.id) || txOpen} categories={TX_CATS(categories)} docs={docs} onOpen={(id) => { setTxOpen(null); onOpen(id); }} updateTx={updateTx} onClose={() => setTxOpen(null)} accName={accName} />}
  </>);
  // ---------- Handy: Kontenliste → Kontodetail (Finanzguru-Stil) ----------
  const mobile = useMobileBeta();
  const [mView, setMView] = useState(null);           // null = Übersicht, "all" = alle Buchungen, sonst Konto-ID
  const [mSearch, setMSearch] = useState(false);
  const [mFold, setMFold] = useLsState("mAccFold", {});
  const sentinel = useRef(null);
  useEffect(() => {
    if (!mobile || !mView || !sentinel.current) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) setLimit((n) => n + 200); }, { rootMargin: "800px" });
    io.observe(sentinel.current); return () => io.disconnect();
  }, [mobile, mView, list.length]);
  const ctNames = useMemo(() => ls.get("contractList", []).filter((c) => !c.cancelledAt).flatMap((c) => [c.provider, c.name]).filter(Boolean).map(norm).filter((x) => x.length > 2), [txs.length]);
  const recIds = useMemo(() => new Set(recurring.filter((r) => subs.confirmed.includes(r.key)).flatMap((r) => r.txIds || [])), [recurring, subs]);
  const isContract = (t) => recIds.has(t.id) || (t.counterparty && ctNames.some((n) => norm(t.counterparty).includes(n) || n.includes(norm(t.counterparty))));
  const openAcc = (id) => { setQ(""); setMonth(""); setColl(""); setMSearch(false); setLimit(150); if (id === "all") { setSel([]); setAcc?.(""); } else { setSel([id]); setAcc?.(id); } setMView(id); scrollTo(0, 0); };
  useEdgeBack(() => backAcc(), mobile && !!mView && !txOpen);
  const backAcc = () => { setMView(null); setSel([]); setAcc?.(""); setQ(""); setMonth(""); setColl(""); scrollTo(0, 0); };
  if (mobile) {
    const mon = todayISO().slice(0, 7);
    const visIds = new Set(visAccounts.map((a) => a.id));
    const monTx = txs.filter((t) => visIds.has(t.accountId) && t.date.startsWith(mon) && t.kind !== "broker" && t.category !== "Umbuchung" && !(cashAccs.length && t.category === "Bargeld"));
    const mInc = monTx.filter((t) => t.amount > 0).reduce((x, t) => x + t.amount, 0), mOut = monTx.filter((t) => t.amount < 0).reduce((x, t) => x - t.amount, 0);
    const now = new Date(), daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    const balOf = (a) => accountBalance(a, txs);
    const allBal = visAccounts.map(balOf).filter((x) => x != null).reduce((x, y) => x + y, 0);
    const Money = ({ v, cls = "" }) => <b className={"mmoney " + cls + (v > 0 ? " pos" : "")}>{v == null ? "–" : fmtMoney(v)}</b>;
    const shownGroups = groups.filter((g) => g.accounts.some((a) => visIds.has(a.id)));
    if (!mView) return (
      <div className="mkonten">
        {!!txs.length && (
          <section className="tile mstat" onClick={() => goTab?.("analyse")}>
            <div className="mstathead"><b>Statistik</b><span className="muted">{daysLeft} Tag{daysLeft === 1 ? "" : "e"} bis Monatsende</span><span className="muted">›</span></div>
            <div className="mstatval"><b className={mInc - mOut < 0 ? "neg" : ""}>{fmtMoney(mInc - mOut).replace(",00", "")}</b><span className="muted">{mInc - mOut < 0 ? "mehr ausgegeben als eingenommen" : "Einnahmen verfügbar"}</span></div>
            <div className="mstatbar"><i style={{ width: `${mInc ? Math.min(100, (mOut / mInc) * 100) : mOut ? 100 : 0}%` }} /></div>
            <small className="muted">Eingänge {fmtMoney(mInc)} · Ausgaben {fmtMoney(mOut)} im {monthLabel(mon)}</small>
          </section>
        )}
        <section className="tile mlist"><div className="mrow" onClick={() => openAcc("all")}><span className="maccico">📥</span><div className="grow"><span>Alle Buchungen</span><Money v={allBal} /></div><span className="muted">›</span></div></section>
        {shownGroups.map((g, gi) => {
          const accs = g.accounts.filter((a) => visIds.has(a.id)), folded = mFold[g.id];
          return (
            <div key={g.id} className="mgroup">
              <button className="mgrouphead" onClick={() => setMFold({ ...mFold, [g.id]: !folded })}><h2>{g.title?.trim() || "Konten"}</h2><span className={"chev" + (folded ? "" : " open")}>⌄</span></button>
              {!folded && (
                <section className="tile mlist">
                  {accs.map((a) => (
                    <div key={a.id} className="mrow" onClick={() => openAcc(a.id)}>
                      <span className="maccico">{KIND_DEFS[a.kind || "bank"]?.[0] || "🏦"}</span>
                      <div className="grow"><span>{a.name}</span><Money v={balOf(a)} /></div><span className="muted">›</span>
                    </div>
                  ))}
                </section>
              )}
            </div>
          );
        })}
        {!!pending.length && <section className="tile mlist"><div className="mrow" onClick={() => goTab?.("contracts")}><span className="maccico">🔁</span><div className="grow"><span>{pending.length} erkannte Abos & Fixkosten</span><small className="muted">prüfen und übernehmen</small></div><span className="muted">›</span></div></section>}
        <div className="mactions">
          <button className="btn" onClick={() => setNewAcc(true)}>＋ Konto</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>📄 Kontoauszug importieren</button>
          {!!txs.length && <button className="btn" onClick={() => setLogoOpen(true)}>✨ Logos</button>}
        </div>
        <input ref={fileRef} type="file" hidden multiple accept=".csv,.txt,.xml,.sta,.mt940,.940,.ofx,.qif,.pdf,.xlsx,.xls,.json" onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) dropFiles(f); }} />
        {modals}
      </div>
    );
    const a = mView === "all" ? null : accounts.find((x) => x.id === mView);
    const bal = a ? balOf(a) : allBal;
    const groupsD = [];
    for (const t of list.slice(0, limit)) { const g = groupsD[groupsD.length - 1]; if (g && g.date === t.date) g.items.push(t); else groupsD.push({ date: t.date, items: [t] }); }
    const dayLabel = (iso) => { const d = new Date(iso + "T12:00"); const r = relDay(iso); return r === "Heute" || r === "Gestern" ? r : `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}. ${["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getDay()]}`; };
    const cl = ls.get("txColls", []);
    return (
      <div className="mkonten macc">
        <div className="mtopbar">
          <button className="link mback" onClick={backAcc}>‹ Zurück</button>
          <b className="mtitle">{a ? a.name : "Alle Buchungen"}</b>
          <button className={"iconbtn" + (mSearch ? " on" : "")} aria-label="Suchen" onClick={() => { setMSearch(!mSearch); if (mSearch) setQ(""); }}>🔍</button>
          <details className="more mmore">
            <summary className="iconbtn" aria-label="Mehr">⋯</summary>
            <div className="moremenu">
              {a && <button onClick={(e) => { e.currentTarget.closest("details").open = false; setEditAcc(a); }}>✎ Konto bearbeiten</button>}
              <button onClick={(e) => { e.currentTarget.closest("details").open = false; fileRef.current?.click(); }}>📄 Kontoauszug importieren</button>
              <button onClick={(e) => { e.currentTarget.closest("details").open = false; setLogoOpen(true); }}>✨ Firmenlogos</button>
              {a && <button className="red" onClick={() => confirm(`Konto „${a.name}“ samt Umsätzen löschen?`) && (deleteAccount(a.id), backAcc())}>🗑 Konto löschen</button>}
            </div>
          </details>
        </div>
        <input ref={fileRef} type="file" hidden multiple accept=".csv,.txt,.xml,.sta,.mt940,.940,.ofx,.qif,.pdf,.xlsx,.xls,.json" onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) dropFiles(f); }} />
        {mSearch && <div className="searchbar"><span>🔍</span><input type="search" autoFocus placeholder="Buchungen durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
        <div className="mbalrow">
          <select className="mmonth" value={month} onChange={(e) => setMonth(e.target.value)}><option value="">Heute</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
          <Money v={month ? list.reduce((x, t) => x + t.amount, 0) : bal} cls="big" />
          {cl.length ? <select className="mmonth r" value={coll} onChange={(e) => setColl(e.target.value)}><option value="">📁 Alle</option>{cl.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : <span />}
        </div>
        {month && <small className="muted center-text block">Summe der Buchungen im {monthLabel(month)}</small>}
        <div className="mtxlist">
          {groupsD.map((g, gi) => (
            <React.Fragment key={g.date}>
              {(gi > 0 || dayLabel(g.date) !== "Heute") && <div className="mday">{dayLabel(g.date)}</div>}
              {g.items.map((t) => (
                <SwipeRow key={t.id} {...txSwipe(t)}><div className="mtx" onClick={() => openTx(t)}>
                  <TxIcon t={t} size={46} />
                  <div className="grow">
                    <b className="one">{t.kind === "broker" ? (t.security || t.type) : t.counterparty || t.purpose || "Buchung"}</b>
                    <div className="msub">{isContract(t) && <span className="mtag">Vertrag</span>}<span className="one">{t.kind === "broker" ? t.type : t.category}</span>{t.docId && <span title="Beleg">📎</span>}</div>
                  </div>
                  <span className={"mamt" + (t.amount > 0 ? " in" : "")}>{fmtMoney(t.amount, t.currency)}</span>
                  {recIds.has(t.id) && <span className="mrec" title="Wiederkehrend">↻</span>}
                </div></SwipeRow>
              ))}
            </React.Fragment>
          ))}
          {!list.length && <p className="muted center-text" style={{ padding: 30 }}>{q ? "Keine Treffer." : "Keine Buchungen."}</p>}
          <div ref={sentinel} />
        </div>
        {modals}
      </div>
    );
  }
  return (
    <div className={"split" + (!pending.length ? " noside" : "")}>
      <aside className="side">

      {!!pending.length && (
        <section className="tile">
          <div className="tilehead"><b>Erkannte Abos & Fixkosten</b><small>aus Umsätzen</small></div>
          {pending.slice(0, 6).map((r) => (
            <div key={r.key} className="frow">
              <CatIcon c={r.category || "Sonstiges"} />
              <div className="grow"><b>{r.name}</b><small className="muted block">{fmtMoney(r.amount)} {INTERVAL_SHORT[r.interval]} · {r.count}× gebucht</small></div>
              <button className="iconbtn ok" title="Als Fixkosten übernehmen" onClick={() => setSubs({ ...subs, confirmed: [...subs.confirmed, r.key] })}>✓</button>
              <button className="iconbtn" title="Ignorieren" onClick={() => setSubs({ ...subs, dismissed: [...subs.dismissed, r.key] })}>✕</button>
            </div>
          ))}
        </section>
      )}


      </aside>
      <div className="maincol">
      {/* gleicher Aufbau für ein Konto und mehrere – damit beim Wechseln (z. B. Maus über Karte) nichts springt */}
      <div className="hero hero-stable">
        <small>{selA ? `Kontostand · ${selA.name}` : allSel ? `Gesamtstand · alle ${visAccounts.length} Konten` : `Zusammenfassung · ${sel.length} von ${visAccounts.length} Konten`}</small>
        <div className="hero-v">{selA ? (selBal != null ? fmtMoney(selBal) : "—") : knownBal.length ? fmtMoney(knownBal.reduce((s, x) => s + x, 0)) : "—"}</div>
        <div className="hsub">
          {selA ? (balEstimated(selA)
            ? <button className="herolink" onClick={() => setEditAcc(selA)}>{selBal != null ? "aus Umsätzen berechnet · Kontostand eintragen ›" : "Kontostand eintragen ›"}</button>
            : <span>Stand {selA.openingDate ? fmtDate(selA.openingDate) : ""} + neuere Buchungen</span>)
            : !allSel ? <span>{selAccounts.map((a) => a.name).join(" · ")}</span> : <span>&nbsp;</span>}
        </div>
        <div className="hero-row four">
          {selA ? <>
            <div><small>Eingänge{month ? " " + monthLabel(month) : ""}</small><b>↑ {fmtMoney(inc)}</b></div>
            <div><small>Ausgänge{month ? " " + monthLabel(month) : ""}</small><b>↓ {fmtMoney(out)}</b></div>
            <div><small>Saldo{month ? " " + monthLabel(month) : ""}</small><b>{(inc - out >= 0 ? "+" : "") + fmtMoney(inc - out)}</b></div>
            <div><small>Buchungen</small><b>{list.length}</b></div>
          </> : <>
            <div><small>Guthaben</small><b>{fmtMoney(plusBal)}</b></div>
            <div><small>Schulden</small><b>{fmtMoney(minusBal)}</b></div>
            <div><small>Eingänge{month ? " " + monthLabel(month) : ""}</small><b>↑ {fmtMoney(inc)}</b></div>
            <div><small>Ausgänge{month ? " " + monthLabel(month) : ""}</small><b>↓ {fmtMoney(out)}</b></div>
          </>}
        </div>
      </div>
      {!!accounts.length && (
        <div className="tile mobile-only accphone">
          <AccountTree groups={groups} txs={txs} sel={sel} onToggleGroup={toggleGroup} hidden={hiddenAccs} {...accActions} variant="card" />
        </div>
      )}
      {!!accounts.length && (
        <div className="chips">
          <button className={showDrop ? "chip on" : "chip"} title="Ablagefeld ein-/ausblenden" onClick={() => setShowDrop(!showDrop)}>📥 Ablagefeld</button>
          <button className="chip on chipdrop" onClick={() => setPick(true)}>{allSel ? "Alle Konten" : acc ? accName(acc) : `${sel.length} Konten`} <span aria-hidden="true">▾</span></button>
          {!allSel && <button className="chip" onClick={() => setSel([])}>✕ Alle anzeigen</button>}
          {selA && !peek && <button className="chip" onClick={() => setEditAcc(selA)}>✎ Konto bearbeiten</button>}
          <button className={"chip desktop-only" + (hiddenAccs.length ? " on" : "")} title="Konten aktivieren / deaktivieren" onClick={() => setAccVis(true)}>👁 Konten ein/aus{hiddenAccs.length ? ` (${hiddenAccs.length} aus)` : ""}</button>
          <select className="chip" value={month} onChange={(e) => setMonth(e.target.value)}><option value="">Alle Monate</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
          {(() => { const cl = ls.get("txColls", []); if (!cl.length) return null;
            return coll ? <button className="chip on" onClick={() => setColl("")} title="Sammlungsfilter aufheben">📁 {cl.find((c) => c.id === coll)?.name || "Sammlung"} · {fmtMoney(list.reduce((a, t) => a + t.amount, 0))} ✕</button>
              : <select className="chip" value="" onChange={(e) => { setColl(e.target.value); setSel?.([]); }}><option value="">📁 Sammlungen</option>{cl.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>; })()}
          {!!txs.length && <button className="chip" onClick={() => setLogoOpen(true)} title="Firmenlogos für Empfänger laden">✨ Logos</button>}
          {(() => {
            const scopeName = allSel ? "alle-konten" : sel.length === 1 ? fileSafe(accName(sel[0])) : `${sel.length}-konten`;
            const fn = (ext) => `umsaetze-${scopeName}-${month || "gesamt"}.${ext}`;
            const head = ["Datum", "Konto", "Gegenpartei", "Verwendungszweck", "Kategorie", "Betrag", "Währung", "Beleg", "Positionen"];
            const rows = () => list.map((t) => [t.date, accName(t.accountId), t.counterparty || "", t.purpose || t.security || "", t.category || "", t.amount, t.currency || "EUR", t.docId ? "ja" : "", (t.items || []).map((i) => `${i.qty}× ${i.name} ${String(i.total).replace(".", ",")}`).join(" | ")]);
            return <ExportMenu items={[
              { head: `${list.length} Umsätze · ${allSel ? "alle Konten" : sel.length === 1 ? accName(sel[0]) : sel.length + " Konten"} · ${month ? monthLabel(month) : "alle Monate"}` },
              { label: "📊 Excel (.xlsx)", disabled: !list.length, run: () => downloadXlsx(fn("xlsx"), [{ name: "Umsätze", head, rows: rows() }, { name: "Kategorien", head: ["Kategorie", "Einnahmen", "Ausgaben", "Anzahl"],
                rows: Object.entries(list.reduce((m, t) => { const k = t.category || "Sonstiges"; const o = m[k] || (m[k] = [0, 0, 0]); if (t.amount > 0) o[0] += t.amount; else o[1] += -t.amount; o[2]++; return m; }, {})).sort((a, b) => b[1][1] - a[1][1]).map(([k, [i, o, n]]) => [k, Math.round(i * 100) / 100, Math.round(o * 100) / 100, n]) }]) },
              { label: "📄 CSV", disabled: !list.length, run: () => downloadCsv(fn("csv"), head, rows()) },
              { label: "🖨 PDF", sub: "Kontoauszug-Liste je Konto mit Summen", disabled: !list.length, run: async () => {
                const byAcc = {}; list.forEach((t) => (byAcc[t.accountId] = byAcc[t.accountId] || []).push(t));
                saveBlob(await tablePdf({ title: "Umsätze", subtitle: `${allSel ? "Alle Konten" : Object.keys(byAcc).map(accName).join(", ")} · ${month ? monthLabel(month) : "gesamter Zeitraum"}`,
                  kpis: [["Einnahmen", fmtMoney(inc)], ["Ausgaben", fmtMoney(out)], ["Saldo", fmtMoney(inc - out)], ["Buchungen", String(list.length)]],
                  columns: [{ label: "Datum", w: 1.1 }, { label: "Gegenpartei", w: 3 }, { label: "Verwendungszweck", w: 3.6 }, { label: "Kategorie", w: 2 }, { label: "Betrag €", w: 1.4, align: "right" }],
                  sections: Object.entries(byAcc).map(([id, l]) => ({ heading: accName(id), rows: l.map((t) => [t.date, t.counterparty || "", t.purpose || t.security || "", t.category || "", t.amount]), totals: ["", "Summe", `${l.length} Buchungen`, "", Math.round(sumBy(l, (t) => t.amount) * 100) / 100] })),
                  note: "Umbuchungen zwischen eigenen Konten und Bankomat-Behebungen sind in Einnahmen/Ausgaben nicht enthalten." }), fn("pdf"));
              } }]} />;
          })()}
        </div>
      )}
      {showDrop ? <DropField onFiles={dropFiles} onHide={() => setShowDrop(false)} busy={!!busy} title="Kontoauszüge oder Ordner hierher ziehen" what="CSV, PDF, CAMT, MT940, Excel …"
        accept={IMPORT_ACCEPT} isOk={(f) => /\.(csv|txt|tsv|xml|sta|mt940|940|ofx|qfx|qif|json|xlsx|xlsm|xls|pdf|jpe?g|png|heic|webp)$/i.test(f.name) || /^image\//.test(f.type)} emptyMsg="Keine Kontoauszug-Dateien gefunden." />
        : !accounts.length && <button className="chip ddshow" onClick={() => setShowDrop(true)}>📥 Ablagefeld einblenden</button>}
      {busy && <ImportBar {...busy} />}
      {selProp.length > 1 && (
        <div className={"selcards" + (peek ? " peeking" : "")}>
          {cardAccounts.map((a) => { const b = accountBalance(a, txs); return (
            <div key={a.id} className={"selcard" + (peek === a.id ? " peek" : "")} title="Maus darauf = Vorschau nur dieses Kontos · Klick = Konto auswählen"
              onPointerEnter={(e) => { if (e.pointerType !== "mouse") return; clearTimeout(peekT.current); peekT.current = setTimeout(() => setPeek(a.id), 250); }}
              onPointerLeave={(e) => { if (e.pointerType !== "mouse") return; clearTimeout(peekT.current); setPeek(""); }}
              onPointerDown={(e) => { lastPtr.current = e.pointerType; }}
              onClick={() => {
                // Touch: 1. Tippen = Vorschau, 2. Tippen = fest auswählen · Maus: Klick = fest auswählen
                if (lastPtr.current !== "mouse" && peek !== a.id) return setPeek(a.id);
                clearTimeout(peekT.current); setPeek(""); setAcc(a.id);
              }}>
              <div className="row1"><small className="muted"><AccIcon a={a} className="acci" /> {groups.find((g) => g.accounts.some((x) => x.id === a.id))?.title || ""}</small>
                <button className="x" title="Aus Auswahl entfernen" onClick={(e) => { e.stopPropagation(); accActions.onToggle(a.id); }}>×</button></div>
              <b className="one" style={accStyle(a)}>{a.name}</b>
              <b className={"big " + (b == null ? "" : b < 0 ? "neg" : "pos")}>{b != null ? fmtMoney(b) : "—"}</b>
            </div>); })}
        </div>
      )}
      {pick && <AccountPicker groups={groups} txs={txs} sel={allSel ? [] : sel} onClose={() => setPick(false)} onApply={(l) => { setSel(l); setPick(false); }} />}
      {!txs.length && (
        <div className="empty"><div style={{ fontSize: 48 }}>🏦</div>
          <p>Noch keine Umsätze.<br />Exportiere deine Umsätze im Online-Banking oder beim Broker (CSV, CAMT, MT940 …) oder nimm einfach den PDF-Kontoauszug – und importiere die Datei hier. Für Bargeld legst du ein Konto „Geldbörse“ an.</p></div>
      )}

      {!!txs.length && <div className="searchbar"><span>🔍</span><input type="search" placeholder="Umsätze durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} /></div>}

      {wideTx ? (
        <div className={"txtable" + (!acc && sel.length > 1 ? " withacc" : "")}>
          <div className={"txscroll" + (fitH ? " fit" : "")} ref={scrollRef} style={fitH ? { maxHeight: fitH } : undefined} onScroll={onListScroll}>
          <div className="txhead"><span>Datum</span><span>Empfänger</span><span>Kategorie</span>{!acc && sel.length > 1 && <span>Konto</span>}<span className="r">Betrag</span><span /></div>
          {list.slice(0, limit).map((t) => (
            <React.Fragment key={t.id}>
            <SwipeRow {...txSwipe(t)}><div className={"txrow" + (prevTx === t.id ? " open" : "")} onClick={() => openTx(t)}>
              <span className="muted">{fmtDate(t.date)}</span>
              <span className="txdesc">
                <TxIcon t={t} size={30} />
                <span className="grow"><b className="one">{t.kind === "broker" ? (t.isin ? `${t.type} · ${t.security || t.isin}` : t.type) : t.counterparty || t.purpose || t.bookingText || "Buchung"}</b>
                  {t.kind !== "broker" && t.counterparty && t.purpose && <small className="muted one block">{t.purpose}</small>}</span>
                {t.docId && <span title="Beleg verknüpft – Klick auf die Zeile zeigt ihn">📎</span>}
              </span>
              <span className="one muted">{t.kind === "broker" ? (t.shares ? `${Math.abs(t.shares).toLocaleString("de-AT")} Stk.` : "Depot") : t.category}</span>
              {!acc && sel.length > 1 && <span className="one muted">{accName(t.accountId)}</span>}
              <b className={"r amt " + (t.amount > 0 ? "pos" : "out")}>{t.amount > 0 ? "+" : ""}{fmtMoney(t.amount, t.currency)}</b>
              <TxActs t={t} />
            </div></SwipeRow>
            {prevTx === t.id && docOf(t) && <div className="txprev"><DocPreview d={docOf(t)} onOpen={() => onOpen(docOf(t).id)} /></div>}
            </React.Fragment>
          ))}
          {!list.length && <p className="muted small" style={{ padding: 16 }}>Keine Buchungen.</p>}
          {list.length > limit && <button className="btn txmore" onClick={() => setLimit(limit + 300)}>Mehr laden ({list.length - limit})</button>}
          </div>
        </div>
      ) : <div className={"txscroll" + (fitH ? " fit" : "")} ref={scrollRef} style={fitH ? { maxHeight: fitH } : undefined} onScroll={onListScroll}>{dayGroups.map((g) => (
        <section key={g.date}>
          <h3>{new Date(g.date + "T12:00").toLocaleDateString("de-AT", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</h3>
          <div className="dlist">
            {g.items.map((t) => (
              <React.Fragment key={t.id}>
              <SwipeRow {...txSwipe(t)}><div className={"ditem center" + (prevTx === t.id ? " open" : "")} onClick={() => openTx(t)}>
                <TxIcon t={t} />
                <div className="grow">
                  <b className="clamp">{t.kind === "broker" ? (t.isin ? `${t.type} · ${t.security || t.isin}` : t.type) : t.counterparty || t.purpose || t.bookingText || "Buchung"}</b>
                  <small className="muted block one">{t.kind === "broker" ? (t.shares ? `${Math.abs(t.shares).toLocaleString("de-AT")} Stk.` : "Depot") : t.category}{t.docId ? " · 📎 Beleg" : ""}{!acc && sel.length > 1 ? " · " + accName(t.accountId) : ""}</small>
                </div>
                <b className={"amt " + (t.amount > 0 ? "pos" : "out")}>{t.amount > 0 ? "+" : ""}{fmtMoney(t.amount, t.currency)}</b>
                <TxActs t={t} />
              </div></SwipeRow>
              {prevTx === t.id && docOf(t) && <DocPreview d={docOf(t)} onOpen={() => onOpen(docOf(t).id)} />}
              </React.Fragment>
            ))}
          </div>
        </section>
      ))}
      {list.length > limit && <button className="btn txmore" onClick={() => setLimit(limit + 300)}>Mehr laden ({list.length - limit})</button>}
      </div>}

      </div>
      {modals}
    </div>
  );
}

function ImportSheet({ imp, accounts, setAccounts, importTxs, token, notify, onClose }) {
  const [res, setRes] = useState(imp.result);
  const [busy, setBusy] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const metaIban = (res.meta?.iban || "").replace(/\s/g, "");
  const isBroker = res.transactions.some((t) => t.kind === "broker");
  const [accountId, setAccountId] = useState(() => accounts.find((a) => metaIban && a.iban === metaIban)?.id || accounts[0]?.id || "new");
  const [newName, setNewName] = useState(() => res.meta?.institution || imp.file.name.replace(/\.[^.]+$/, "").slice(0, 30));
  const txs = res.transactions;
  const dates = txs.map((t) => t.date).sort();

  function remap(field, idx) {
    const map = { ...res.mapping.map };
    if (idx === "") delete map[field]; else map[field] = Number(idx);
    const mapping = { ...res.mapping, map };
    setRes({ ...res, mapping, transactions: rowsToTransactions(res.rows, mapping) });
  }
  async function viaClaude() {
    setBusy(true);
    try {
      let body;
      if (res.format === "PDF" || res.format === "Bild" || /xls/i.test(res.format)) {
        let blob = res.format === "Bild" ? await prepareFile(imp.file) : imp.file;
        if (blob.type === "application/pdf" && blob.size > 3.6 * 1024 * 1024) blob = await shrinkPdf(blob, 3.6 * 1024 * 1024, 25);
        body = { data: await blobToBase64(blob), mediaType: blob.type || "application/pdf" };
      } else body = { text: res.text || (await imp.file.text()) };
      const r = await fetch("/api/statement", { method: "POST", headers: { "content-type": "application/json", "x-app-token": token }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({ error: "HTTP " + r.status }));
      if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
      const list = (j.transactions || []).filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && typeof t.amount === "number").map((t) => ({
        date: t.date, valueDate: t.value_date || null, amount: Math.round(t.amount * 100) / 100, currency: t.currency || "EUR",
        counterparty: t.counterparty || "", iban: (t.iban || "").replace(/\s/g, ""), purpose: t.purpose || "", bookingText: "", kind: t.kind === "broker" ? "broker" : "bank",
        ...(t.kind === "broker" ? { type: t.type || "Sonstiges", isin: t.isin || "", security: t.security || "", shares: t.shares, price: t.price, fee: t.fee || 0, tax: t.tax || 0 } : {})
      }));
      setRes({ ...res, format: res.format + " (Claude)", transactions: list, needsAI: false, meta: { iban: j.account_iban || "", institution: j.institution || "" } });
      if (j.institution) setNewName(j.institution);
    } catch (e) { notify("Claude-Import fehlgeschlagen: " + e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (imp.autoAi && !res.transactions.length) viaClaude(); }, []);

  const fileAccounts = [...new Set(txs.map((t) => t.accountName).filter(Boolean))];
  async function doImport() {
    setBusy(true);
    try {
      if (fileAccounts.length) {
        // Jedes Konto aus der Datei einem bestehenden (Name/IBAN) oder neuen Konto zuordnen
        const known = [...accounts]; let added = 0, dupes = 0, matched = 0; const plan = [];
        for (const name of fileAccounts) {
          const part = txs.filter((t) => t.accountName === name);
          const iban = part.find((t) => t.ownIban)?.ownIban || "";
          let a = known.find((x) => (iban && x.iban === iban) || x.name === name);
          if (!a) { a = { id: uid(), name, iban, kind: /kredit|card|visa|master/i.test(name) ? "card" : /spar/i.test(name) ? "savings" : /paypal/i.test(name) ? "wallet" : "bank" }; known.push(a); }
          plan.push([a, part]);
        }
        setAccounts(known);
        for (const [a, part] of plan) {
          const r = await importTxs(a.id, part, known.map((x) => x.iban).filter(Boolean));
          added += r.added; dupes += r.dupes; matched += r.matched;
        }
        if (res.signature && res.mapping) ls.set("mappings", { ...ls.get("mappings", {}), [res.signature]: res.mapping.map });
        notify(`${added} neu in ${fileAccounts.length} Konten${dupes ? `, ${dupes} bereits vorhanden` : ""}${matched ? `, ${matched} Rechnung(en) bezahlt` : ""}`);
        return onClose();
      }
      let id = accountId;
      if (id === "new") {
        id = uid();
        setAccounts((a) => [...a, { id, name: newName || "Konto", iban: metaIban, kind: isBroker ? "broker" : "bank" }]);
      }
      if (res.signature && res.mapping) ls.set("mappings", { ...ls.get("mappings", {}), [res.signature]: res.mapping.map });
      const r = await importTxs(id, txs, undefined, res.meta);
      notify(`${r.added} neu importiert${r.dupes ? `, ${r.dupes} bereits vorhanden` : ""}${r.matched ? `, ${r.matched} Rechnung(en) als bezahlt erkannt` : ""}`);
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <Win id="import" onClose={onClose} dirty={!busy && txs.length > 0} saveLabel="Importieren">
        <div className="panelhead"><b>Import</b>
          <button className="btn primary" disabled={busy || !txs.length} onClick={doImport}>Importieren</button>
          <XBtn />
        </div>

        <div className="tile">
          <div className="frow">
            <span className="caticon" style={{ width: 44, height: 44, background: "#0b63f622", fontSize: 20 }}>📄</span>
            <div className="grow"><b className="clamp">{imp.file.name}</b><small className="muted block">Erkannt: {res.mapping?.headers?.some((h) => /analyse-hauptkategorie/i.test(h)) ? "Finanzguru-Export" : res.format}{metaIban ? ` · ${metaIban}` : ""}</small></div>
          </div>
          {!!txs.length && (
            <div className="stats">
              <div><small>Buchungen</small><b>{txs.length}</b></div>
              <div><small>Zeitraum</small><b className="small">{shortD(dates[0])}–{shortD(dates[dates.length - 1])}</b></div>
              <div><small>Saldo</small><b>{fmtMoney(txs.reduce((s, t) => s + t.amount, 0))}</b></div>
            </div>
          )}
          {res.error && <p className="warn small">{res.error}</p>}
          {(res.needsAI || !txs.length) && (
            <>
              <p className="muted small">{res.format === "PDF" || res.format === "Bild" ? "Kontoauszüge als PDF/Foto liest Claude aus." : "Keine Buchungen automatisch erkannt – Spalten unten zuordnen oder Claude lesen lassen."}</p>
              <button className="btn primary" disabled={busy} onClick={viaClaude}>{busy ? "Claude liest …" : "✨ Mit Claude auslesen"}</button>
            </>
          )}
        </div>

        {res.mapping && (
          <fieldset>
            <legend onClick={() => setShowMap(!showMap)} style={{ cursor: "pointer" }}>Spaltenzuordnung {showMap ? "▴" : "▾"}</legend>
            {!showMap && <p className="muted small">{Object.keys(res.mapping.map).map((f) => `${FIELD_LABELS[f]} → ${res.mapping.headers[res.mapping.map[f]]}`).join(" · ")}</p>}
            {showMap && (
              <div className="grid2">
                {Object.entries(FIELD_LABELS).map(([f, l]) => (
                  <label key={f}>{l}
                    <select value={res.mapping.map[f] ?? ""} onChange={(e) => remap(f, e.target.value)}>
                      <option value="">–</option>
                      {res.mapping.headers.map((h, i) => <option key={i} value={i}>{h || `Spalte ${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <p className="muted small">Die Zuordnung wird für Dateien mit gleichem Aufbau gemerkt.</p>
          </fieldset>
        )}

        {!!fileAccounts.length && (
          <fieldset>
            <legend>Konten aus der Datei</legend>
            {fileAccounts.map((n) => <div key={n} className="kv"><span>🏦 {n}</span><small className="muted">{txs.filter((t) => t.accountName === n).length} Buchungen</small></div>)}
            <p className="muted small">Werden automatisch bestehenden Konten zugeordnet (gleicher Name/IBAN) oder neu angelegt. Umbuchungen zwischen deinen Konten zählen nicht als Ausgaben.</p>
          </fieldset>
        )}
        {!!txs.length && !fileAccounts.length && (
          <fieldset>
            <legend>Konto</legend>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="new">＋ Neues Konto anlegen</option>
            </select>
            {accountId === "new" && <label>Name<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z. B. BAWAG Giro, Scalable Depot" /></label>}
            <p className="muted small">Doppelte Buchungen werden beim Import automatisch übersprungen.</p>
          </fieldset>
        )}

        {!!txs.length && (
          <fieldset>
            <legend>Vorschau</legend>
            {txs.slice(0, 8).map((t, i) => (
              <div key={i} className="frow">
                <div className="grow"><b className="clamp small">{t.kind === "broker" ? (t.isin ? `${t.type} · ${t.security || t.isin}` : t.type) : t.counterparty || t.purpose || "–"}</b>
                  <small className="muted block one">{fmtDate(t.date)}{t.kind !== "broker" && t.counterparty && t.purpose ? " · " + t.purpose : ""}</small></div>
                <b className={"amt " + (t.amount > 0 ? "pos" : "out")}>{fmtMoney(t.amount, t.currency)}</b>
              </div>
            ))}
            {txs.length > 8 && <p className="muted small">… und {txs.length - 8} weitere</p>}
          </fieldset>
        )}
    </Win>
  );
}

/* ---------- Handy-Ansichten (Standard bis 700 px Breite) ---------- */
function useFlag(key, def) {
  const [v, setV] = useState(() => ls.get(key, def));
  useEffect(() => { const f = () => setV(ls.get(key, def)); addEventListener("findocu-flag", f); return () => removeEventListener("findocu-flag", f); }, []);
  return [v, (n) => { ls.set(key, n); dispatchEvent(new Event("findocu-flag")); }];
}
function useMobileBeta() { return useMedia("(max-width:700px)"); } // Handy-Ansichten sind Standard
function MobileBetaSetting() {
  const [on, set] = useFlag("mobileBeta", true);
  return <label className="switchrow"><span><b>Neue Handy-Ansichten (Test)</b><small className="muted block">Konten, Rechnungen, Mahnungen, Kunden, Artikel und Verträge im neuen Listen-Design (nur am Handy)</small></span>
    <input type="checkbox" className="switch" checked={on} onChange={(e) => set(e.target.checked)} /></label>;
}
/* ---------- Konten-Design für alle Reiter (Test, Einstellungen → Darstellung) ---------- */
if (typeof document !== "undefined" && ls.get("kontoLook", false)) document.documentElement.classList.add("klook");
function useKLook() { return useFlag("kontoLook", false)[0]; }
function KLookSetting() {
  const [on, set] = useFlag("kontoLook", false);
  useEffect(() => { document.documentElement.classList.toggle("klook", !!on); }, [on]);
  return <label className="switchrow"><span><b>Konten-Design für alle Reiter (Test)</b><small className="muted block">Kopfkarte mit Kennzahlen, Chip-Leiste und Tabellen mit fixer Kopfzeile wie im Reiter Konten – nur Optik, jederzeit abschaltbar</small></span>
    <input type="checkbox" className="switch" checked={!!on} onChange={(e) => set(e.target.checked)} /></label>;
}
// Kopfkarte im Konten-Stil: erster Wert groß, die übrigen als Kennzahlen-Reihe
function KHero({ items }) {
  const [a, ...rest] = items.filter(Boolean);
  if (!a) return null;
  return (
    <div className="hero hero-stable khero">
      <small>{a.label}</small>
      <div className={"hero-v" + (a.onClick ? " click" : "")} onClick={a.onClick}>{a.value}</div>
      <div className="hsub"><span>{a.sub || "\u00a0"}</span></div>
      {!!rest.length && <div className={"hero-row" + (rest.length >= 4 ? " four" : "")}>{rest.slice(0, 4).map((s, i) => <div key={i} className={s.onClick ? "click" : ""} onClick={s.onClick}><small>{s.label}</small><b>{s.value}</b></div>)}</div>}
    </div>
  );
}
// Nur im Test-Design sichtbar: Kennzahlen für Reiter, die bisher keine hatten
function KStats({ items }) { return useKLook() ? <KHero items={items} /> : null; }
const mGroup = (arr, keyFn) => { const out = []; for (const x of arr) { const k = keyFn(x); const g = out[out.length - 1]; if (g && g[0] === k) g[1].push(x); else out.push([k, [x]]); } return out; };
const MStats = ({ items }) => useKLook() ? <KHero items={items} /> : <div className="mstats">{items.filter(Boolean).map((s, i) => <div key={i} className={"tile mstatc" + (s.onClick ? " click" : "") + (s.alert ? " mwarn" : "")} onClick={s.onClick}><small className="muted">{s.label}</small><b className={s.vcls || ""}>{s.value}</b>{s.sub && <small className="muted">{s.sub}</small>}</div>)}</div>;
const MActs = ({ items }) => useKLook() ? <div className="mchips kacts">{items.filter(Boolean).map((a, i) => <button key={i} className={"chip" + (a.primary ? " on" : "")} onClick={a.run}>{a.label}</button>)}</div>
  : <div className="mactions">{items.filter(Boolean).map((a, i) => <button key={i} className={"btn" + (a.primary ? " primary" : "")} onClick={a.run}>{a.label}</button>)}</div>;
const MBar = ({ q, setQ, placeholder, chips, children }) => (
  <div className="msticky">
    {setQ && <div className="searchbar"><span>🔍</span><input type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} /></div>}
    {chips && <div className="mchips">{chips.filter(Boolean).map(([k, l, n, on, click]) => <button key={k} className={"chip" + (on ? " on" : "")} onClick={click}>{l}{n != null && <small> {n}</small>}</button>)}{children}</div>}
  </div>
);
const MHead = ({ children, right }) => <div className="mday mhead"><span>{children}</span>{right != null && <span className="muted">{right}</span>}</div>;
const MAvatar = ({ text, color = "#64748b" }) => <span className="caticon mavatar" style={{ width: 46, height: 46, color }}>{(text || "?").trim().slice(0, 1).toUpperCase()}</span>;
const MIco = ({ e }) => <span className="caticon" style={{ width: 46, height: 46, background: "var(--card2)", fontSize: 22 }}>{e}</span>;
function MItem({ icon, title, sub, tags = [], amount, amountCls = "", amountSub, pill, onClick, swipe, after, dim }) {
  return (<>
    <SwipeRow {...(swipe || {})}>
      <div className={"mtx" + (dim ? " dim" : "")} onClick={onClick}>
        {icon}
        <div className="grow"><b className="one">{title}</b>
          <div className="msub">{tags.filter(Boolean).map((t, i) => <span key={i} className="mtag" style={t.color ? { color: t.color } : undefined}>{t.label || t}</span>)}<span className="one">{sub}</span></div></div>
        <div className="mright">{amount != null && <span className={"mamt " + amountCls}>{amount}</span>}{amountSub && <small className="muted">{amountSub}</small>}{pill}</div>
      </div>
    </SwipeRow>
    {after}
  </>);
}
const MEmpty = ({ children }) => <p className="muted center-text" style={{ padding: "28px 16px" }}>{children}</p>;

/* ---------- Wischgesten (Handy & Tablet, nur Touch/Stift) ---------- */
let swipeOpenClose = null;
function SwipeRow({ left = [], right = [], children, className = "" }) {
  // left: Aktionen links (sichtbar beim Wischen nach rechts) · right: Aktionen rechts (beim Wischen nach links)
  left = left.filter(Boolean); right = right.filter(Boolean);
  const [x, setX] = useState(0), [drag, setDrag] = useState(false);
  const st = useRef(null), swallow = useRef(false);
  const W = 78, maxL = left.length * W, maxR = right.length * W;
  const close = () => setX(0);
  useEffect(() => () => { if (swipeOpenClose === close) swipeOpenClose = null; }, []);
  if (!left.length && !right.length) return children;
  const down = (e) => { if (e.pointerType === "mouse") return; st.current = { x0: e.clientX, y0: e.clientY, base: x, dir: null, id: e.pointerId }; };
  const move = (e) => {
    const s = st.current; if (!s) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (!s.dir) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      s.dir = Math.abs(dx) > Math.abs(dy) * 1.3 ? "h" : "v";
      if (s.dir !== "h") { st.current = null; return; }
      try { e.currentTarget.setPointerCapture(s.id); } catch {}
      if (swipeOpenClose && swipeOpenClose !== close) swipeOpenClose(); swipeOpenClose = close; setDrag(true);
    }
    let nx = s.base + dx;
    const hiL = maxL ? maxL + 70 : 0, hiR = maxR ? maxR + 70 : 0;
    nx = Math.max(-hiR, Math.min(hiL, nx));
    setX(nx);
  };
  const up = () => {
    const s = st.current; st.current = null; setDrag(false);
    if (!s || s.dir !== "h") return;
    swallow.current = true; setTimeout(() => (swallow.current = false), 350);
    if (maxR && x < -(maxR + 45)) { setX(0); right[0].run(); return; }   // ganz durchwischen = erste Aktion
    if (maxL && x > maxL + 45) { setX(0); left[0].run(); return; }
    setX(x < -maxR / 2 && maxR ? -maxR : x > maxL / 2 && maxL ? maxL : 0);
  };
  const Btn = (a) => <button key={a.label} className={"swbtn " + (a.cls || "")} style={{ background: a.bg }} onClick={(e) => { e.stopPropagation(); setX(0); a.run(); }}><span>{a.icon}</span>{a.label}</button>;
  return (
    <div className={"swrow " + className}>
      {maxL > 0 && x > 0 && <div className="swacts l" style={{ width: x }}>{left.map(Btn)}</div>}
      {maxR > 0 && x < 0 && <div className="swacts r" style={{ width: -x }}>{[...right].reverse().map(Btn)}</div>}
      <div className="swfront" style={{ transform: x ? `translateX(${x}px)` : undefined, transition: drag ? "none" : "transform .22s ease" }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClickCapture={(e) => { if (swallow.current || x) { e.stopPropagation(); e.preventDefault(); if (x && !swallow.current) setX(0); } }}>{children}</div>
    </div>
  );
}
// Vom linken Rand nach rechts wischen = Zurück (oberstes registriertes Ziel gewinnt)
const edgeStack = [];
let edgeInit = false;
function initEdgeSwipe() {
  if (edgeInit) return; edgeInit = true;
  let s = null;
  addEventListener("touchstart", (e) => { const t = e.touches[0]; s = e.touches.length === 1 && t.clientX < 28 && edgeStack.length ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (!s) return; const t = e.touches[0], dx = t.clientX - s.x, dy = Math.abs(t.clientY - s.y);
    if (dy > 50 && dy > dx) { s = null; return; }
    if (dx > 80) { s = null; const f = edgeStack[edgeStack.length - 1]; f && f.current && f.current(); }
  }, { passive: true });
}
function useEdgeBack(handler, active = true) {
  const ref = useRef(handler); ref.current = handler;
  useEffect(() => { if (!active) return; initEdgeSwipe(); edgeStack.push(ref); return () => { const i = edgeStack.lastIndexOf(ref); if (i >= 0) edgeStack.splice(i, 1); }; }, [active]);
}

/* ---------- Buchungsdetail (Finanzguru-Stil) ---------- */
let CP_ICONS = ls.get("cpIcons", {});
const cpKey = (t) => counterpartyKey(t) || norm(t.counterparty || t.purpose || "");
const setCpIcon = (key, ico) => { CP_ICONS = { ...CP_ICONS }; if (ico) CP_ICONS[key] = ico; else delete CP_ICONS[key]; ls.set("cpIcons", CP_ICONS); };
/* Firmenlogos (über KI-Domainzuordnung + Website-Symbol), gespeichert in IndexedDB „logos“ */
let LOGOS = {};
const logoEvt = () => window.dispatchEvent(new Event("findocu-logos"));
db.allLogos?.().then((x) => { if (x && typeof x === "object" && !Array.isArray(x)) { LOGOS = x; logoEvt(); } }).catch(() => {});
function useLogoVer() { const [v, setV] = useState(0); useEffect(() => { const f = () => setV((n) => n + 1); window.addEventListener("findocu-logos", f); return () => window.removeEventListener("findocu-logos", f); }, []); return v; }
async function setLogo(key, data) { if (data) { LOGOS = { ...LOGOS, [key]: data }; await db.putLogo(key, data); } else { LOGOS = { ...LOGOS }; delete LOGOS[key]; await db.delLogo(key); } logoEvt(); }
function shrinkLogo(src, px = 96) {
  return new Promise((res) => { const im = new Image(); im.onload = () => {
    const c = document.createElement("canvas"); c.width = c.height = px; const g = c.getContext("2d");
    const r = Math.min(px / im.width, px / im.height), w = im.width * r, h = im.height * r; g.imageSmoothingQuality = "high";
    g.drawImage(im, (px - w) / 2, (px - h) / 2, w, h); try { res(c.toDataURL("image/png")); } catch { res(src); } };
    im.onerror = () => res(null); im.src = src; });
}
// items: [{ key, name, purpose }] → lädt in Paketen; Rückgabe { found, miss, err }
async function fetchLogos(items, onProgress = () => {}) {
  const miss = ls.get("logoMiss", {}); let found = 0, nf = 0, err = "";
  for (let i = 0; i < items.length; i += 20) {
    const part = items.slice(i, i + 20);
    onProgress(i, items.length);
    try {
      const r = await fetch("/api/logo", { method: "POST", headers: { "content-type": "application/json", "x-app-token": ls.get("appToken", "") }, body: JSON.stringify({ items: part }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { err = j.error || "HTTP " + r.status; break; }
      for (const x of j.results || []) {
        const img = x.logo && await shrinkLogo(x.logo);
        if (img) { await setLogo(x.key, img); delete miss[x.key]; found++; } else { miss[x.key] = todayISO(); nf++; }
      }
    } catch (e) { err = e.message; break; }
    ls.set("logoMiss", miss);
  }
  onProgress(items.length, items.length);
  return { found, miss: nf, err };
}
// Empfänger für den Logo-Abruf sammeln (häufigste zuerst)
function logoCandidates(txs) {
  const m = new Map();
  for (const t of txs) {
    if (t.kind === "broker" || t.category === "Umbuchung" || !(t.counterparty || "").trim()) continue;
    const k = cpKey(t); if (!k || k.length < 3) continue;
    const e = m.get(k) || { key: k, name: t.counterparty, purpose: t.purpose || "", n: 0 }; e.n++; m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}
let logoAutoRunning = false;
async function autoLogos(txs) {
  if (logoAutoRunning || !ls.get("autoLogos", false)) return;
  const miss = ls.get("logoMiss", {});
  const todo = logoCandidates(txs).filter((x) => !LOGOS[x.key] && !miss[x.key] && !CP_ICONS[x.key]).slice(0, 40);
  if (!todo.length) return;
  logoAutoRunning = true; try { await fetchLogos(todo.map(({ key, name, purpose }) => ({ key, name, purpose }))); } finally { logoAutoRunning = false; }
}
function LogoWin({ txs, onClose }) {
  useLogoVer();
  const cands = useMemo(() => logoCandidates(txs), [txs]);
  const [auto, setAuto] = useState(() => ls.get("autoLogos", false));
  const [prog, setProg] = useState(null), [res, setRes] = useState(null);
  const miss = ls.get("logoMiss", {});
  const have = cands.filter((x) => LOGOS[x.key]).length, missed = cands.filter((x) => !LOGOS[x.key] && miss[x.key]).length;
  const open = cands.filter((x) => !LOGOS[x.key] && !miss[x.key]);
  const run = async (list) => { setRes(null); setProg({ i: 0, n: list.length }); const r = await fetchLogos(list.map(({ key, name, purpose }) => ({ key, name, purpose })), (i, n) => setProg({ i, n })); setProg(null); setRes(r); };
  return (
    <Win id="logos" onClose={onClose} dirty={!!prog} small defW={480}>
      <div className="panelhead"><b>✨ Firmenlogos</b><XBtn /></div>
      <p className="muted small">Die KI ordnet jedem Empfänger die offizielle Website zu (z. B. BILLA → billa.at), danach wird deren öffentliches Website-Symbol geladen. Privatpersonen und Unklares bekommen kein Logo. Gesendet werden nur Empfängername und Verwendungszweck.</p>
      <div className="invstats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="tile kpi"><small className="muted">Empfänger</small><b>{cands.length}</b></div>
        <div className="tile kpi"><small className="muted">mit Logo</small><b className="pos">{have}</b></div>
        <div className="tile kpi"><small className="muted">nicht gefunden</small><b>{missed}</b></div>
      </div>
      {prog && <div className="lookbox"><b>Logos werden geladen … {Math.min(prog.i, prog.n)} / {prog.n}</b><div className="bar"><div style={{ width: `${prog.n ? (prog.i / prog.n) * 100 : 0}%`, background: "var(--acc)" }} /></div></div>}
      {res && <div className={"lookbox" + (res.err ? " warn" : " ok")}>{res.err ? `Abbruch: ${res.err}` : `${res.found} Logo${res.found === 1 ? "" : "s"} gefunden · ${res.miss} ohne Treffer`}</div>}
      <div className="col" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        <button className="btn primary" disabled={!!prog || !open.length} onClick={() => run(open.slice(0, 300))}>Fehlende Logos laden ({Math.min(open.length, 300)}{open.length > 300 ? " von " + open.length : ""})</button>
        <button className="btn" disabled={!!prog || !missed} onClick={() => run(cands.filter((x) => !LOGOS[x.key] && miss[x.key]).slice(0, 300))}>Nicht gefundene erneut versuchen ({missed})</button>
        <button className="btn" disabled={!!prog || !cands.length} onClick={() => confirm(`Alle ${Math.min(cands.length, 300)} Logos neu laden?`) && run(cands.slice(0, 300))}>Alle neu laden</button>
        <label className="check"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); ls.set("autoLogos", e.target.checked); }} /> Für neue Empfänger automatisch laden (z. B. nach einem Kontoauszug-Import)</label>
        {have > 0 && <button className="link red" disabled={!!prog} onClick={async () => { if (!confirm("Alle geladenen Firmenlogos entfernen?")) return; for (const k of Object.keys(LOGOS)) await setLogo(k, null); ls.set("logoMiss", {}); }}>Alle Logos entfernen</button>}
      </div>
    </Win>
  );
}
function TxIcon({ t, size = 40 }) {
  useLogoVer();
  if (t.kind === "broker") return <span className="caticon" style={{ width: size, height: size, background: "#14b8a622", fontSize: size * 0.45 }}>📈</span>;
  const ico = CP_ICONS[cpKey(t)];
  if (ico) return <span className="caticon" style={{ width: size, height: size, background: catMeta(t.category).color + "22", fontSize: size * 0.5 }}>{ico}</span>;
  const lg = LOGOS[cpKey(t)];
  if (lg) return <span className="caticon logo" style={{ width: size, height: size }}><img src={lg} alt="" /></span>;
  return <CatIcon c={t.category} size={size} />;
}
const TX_EMOJIS = ["🏠", "🔥", "💡", "💧", "📱", "🌐", "📺", "🎵", "🛒", "🍞", "☕", "🍽️", "⛽", "🚗", "🚆", "✈️", "🏥", "💊", "🐶", "👕", "🎁", "📚", "🎓", "🏋️", "💼", "🏦", "💳", "🛡️", "🧾", "🔧", "👶", "🎮", "🏖️", "💰", "📈", "❤️"];
const fmtIban = (s) => (s || "").replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
const relDay = (iso) => { const d = Math.round((new Date(todayISO()) - new Date(iso)) / 864e5); return d === 0 ? "Heute" : d === 1 ? "Gestern" : fmtDate(iso); };
function sepaInfo(t) {
  const s = `${t.purpose || ""} ${t.bookingText || ""}`;
  const cred = t.creditorId || (s.match(/\b([A-Z]{2}\d{2}ZZZ[0-9A-Z]{6,28})\b/) || [])[1] || "";
  const mref = t.mandateRef || (s.match(/(?:MREF|Mandat(?:sreferenz|sref|s-?Ref)?\.?)[:\s]+([0-9A-Za-z][\w\-/.]{3,34})/i) || [])[1] || "";
  const typ = t.bookingText || (cred || mref ? "SEPA-Lastschrift" : "");
  return { cred, mref, typ };
}
function txColls() { return ls.get("txColls", []); }

function TxSheet({ scanReceiptFor, receiptFor, t, txs = [], categories, docs, onOpen, updateTx, updateTxs, resetCp, onClose, accName, deleteTx, linkTx, attachNew, addCategory, accounts = [], recurring = [], subs, goTab, onSearch, onAccount, onColl }) {
  const linkedInv = t.invoiceId ? ls.get("invoices", []).find((i) => i.id === t.invoiceId) : null;
  const doc = t.docId && docs.find((d) => d.id === t.docId);
  const key = cpKey(t), acc = accounts.find((a) => a.id === t.accountId);
  const [edit, setEdit] = useState(null);           // Bearbeiten-Formular
  const [catOpen, setCatOpen] = useState(false), [cat, setCat] = useState(t.category), [rule, setRule] = useState(false), [extraCats, setExtraCats] = useState([]);
  const [icoOpen, setIcoOpen] = useState(false), [, bump] = useState(0), [logoBusy, setLogoBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false), [note, setNote] = useState(t.note || "");
  const [collOpen, setCollOpen] = useState(false), [colls, setColls] = useState(txColls), [newColl, setNewColl] = useState("");
  const [pickDoc, setPickDoc] = useState(false), [dq, setDq] = useState(""), [showPrev, setShowPrev] = useState(false);
  const [qrOpen, setQrOpen] = useState(false); const fileRef = useRef();
  const onQr = (text) => {
    setQrOpen(false);
    const q = parseReceiptQR(text);
    if (!q) return alert("Kein Kassenbon-QR erkannt (RKSV/TSE). Tipp: Beleg stattdessen scannen – die KI liest ihn aus.");
    const diff = q.total != null && Math.abs(Math.abs(t.amount) - q.total) > 0.01;
    save({ ...t, receiptQr: q });
    if (diff) alert(`QR-Code gespeichert.\nAchtung: Kassenbon ${fmtMoney(q.total)} ≠ Buchung ${fmtMoney(Math.abs(t.amount))}`);
  };
  const withOrig = (n) => ({ ...n, orig: t.orig || { category: t.category, counterparty: t.counterparty, purpose: t.purpose, date: t.date, amount: t.amount, accountId: t.accountId } });
  const save = (n, applyRule = false) => updateTx(n, applyRule);
  const isTransfer = t.category === "Umbuchung";
  // Vertrag: eigener Vertrag (Name/Anbieter) oder erkannte Fixkosten
  const ct = ls.get("contractList", []).find((c) => !c.cancelledAt && [c.provider, c.name].filter(Boolean).some((n) => { const a = norm(n), b = norm(t.counterparty || ""); return a.length > 2 && b && (b.includes(a) || a.includes(b)); }));
  const rec = !ct && recurring.find((r) => r.txIds?.includes(t.id) && !(subs?.dismissed || []).includes(r.key));
  // Verlauf: letzte 13 Monate bei diesem Empfänger
  const same = useMemo(() => txs.filter((x) => x.kind !== "broker" && cpKey(x) === key), [txs, key]);
  const months = useMemo(() => { const out = []; const d = new Date(); d.setDate(1); for (let i = 12; i >= 0; i--) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`); } return out; }, []);
  const income = t.amount > 0;
  const vals = months.map((m) => Math.abs(same.filter((x) => x.date.startsWith(m) && (income ? x.amount > 0 : x.amount < 0)).reduce((s, x) => s + x.amount, 0)));
  const avg = vals.reduce((a, b) => a + b, 0) / months.length;
  const max = Math.max(...vals, 1);
  const sepa = sepaInfo(t);
  const inColls = colls.filter((c) => (t.colls || []).includes(c.id));
  const setTxColls = (ids) => save({ ...t, colls: ids });
  const ICO = CP_ICONS[key];
  const title = t.kind === "broker" ? (t.isin ? `${t.type} · ${t.security || t.isin}` : t.type) : t.counterparty || t.purpose || "Buchung";

  if (edit) return (
    <Win id="tx" onClose={() => setEdit(null)} dirty small defW={520}>
      <div className="panelhead"><b>Buchung bearbeiten</b>
        <button className="btn primary" onClick={() => {
          const amt = parseAmt(edit.amount);
          save(withOrig({ ...t, counterparty: edit.counterparty.trim(), purpose: edit.purpose, date: edit.date || t.date, accountId: edit.accountId, ...(t.manual && isFinite(amt) && amt ? { amount: amt } : {}) }));
          setEdit(null); onClose();
        }}>Speichern</button><XBtn /></div>
      <label>Empfänger / Name<input value={edit.counterparty} onChange={(e) => setEdit({ ...edit, counterparty: e.target.value })} /></label>
      <div className="grid2">
        <label>Buchungsdatum<input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></label>
        <label>Betrag{!t.manual && <small className="muted"> (aus Bankimport)</small>}<input inputMode="decimal" disabled={!t.manual} value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></label>
      </div>
      {accounts.length > 1 && <label>Konto<select value={edit.accountId} onChange={(e) => setEdit({ ...edit, accountId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
      <label>Zweck<textarea rows={4} value={edit.purpose} onChange={(e) => setEdit({ ...edit, purpose: e.target.value })} /></label>
    </Win>
  );

  return (
    <Win id="tx" onClose={onClose} dirty={false} small defW={520} className="txdetail">
      <div className="panelhead"><span className="grow" /><button className="link" onClick={() => setEdit({ counterparty: t.counterparty || "", purpose: t.purpose || "", date: t.date, amount: String(t.amount).replace(".", ","), accountId: t.accountId })}>Bearbeiten</button><XBtn /></div>
      <div className="txhero">
        <div className="txheroico" onClick={() => setIcoOpen(!icoOpen)} title="Symbol ändern"><TxIcon t={t} size={84} /><span className="txpen">✎</span></div>
        <h2>{title}</h2>
        {t.kind !== "broker" && <button className="txcat" onClick={() => setCatOpen(!catOpen)}><CatGlyph c={t.category} /> {t.category} <span>✎</span></button>}
      </div>
      {icoOpen && (
        <div className="tile txpick">
          <div className="emojigrid">{TX_EMOJIS.map((e) => <button key={e} className={ICO === e ? "on" : ""} onClick={() => { setCpIcon(key, e); bump((n) => n + 1); setIcoOpen(false); }}>{e}</button>)}</div>
          <div className="row"><input placeholder="Eigenes Emoji" maxLength={4} onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { setCpIcon(key, e.target.value.trim()); bump((n) => n + 1); setIcoOpen(false); } }} />
            {ICO && <button className="link" onClick={() => { setCpIcon(key, null); bump((n) => n + 1); setIcoOpen(false); }}>{LOGOS[key] ? "Logo statt Emoji" : "Standard-Symbol"}</button>}</div>
          <div className="row">
            <button className="btn sm" disabled={logoBusy} onClick={async () => { setLogoBusy(true); const r = await fetchLogos([{ key, name: t.counterparty || title, purpose: t.purpose }]); setLogoBusy(false);
              if (r.err) alert("Logo konnte nicht geladen werden: " + r.err); else if (!r.found) alert(`Für „${t.counterparty || title}“ wurde kein Firmenlogo gefunden.`); else { setCpIcon(key, null); bump((n) => n + 1); setIcoOpen(false); } }}>
              {logoBusy ? "Suche …" : "✨ Firmenlogo suchen (KI)"}</button>
            {LOGOS[key] && <button className="link red" onClick={async () => { await setLogo(key, null); bump((n) => n + 1); }}>Logo entfernen</button>}
          </div>
          <small className="muted">Gilt für alle Buchungen von „{t.counterparty || title}“. Ein gewähltes Emoji hat Vorrang vor dem Logo.</small>
        </div>
      )}
      {catOpen && (
        <div className="tile txpick">
          <select value={cat} onChange={(e) => {
            if (e.target.value !== "__new") return setCat(e.target.value);
            const n = (prompt("Name der neuen Kategorie:") || "").trim(); if (!n) return;
            addCategory?.(n); setExtraCats((x) => [...x, n]); setCat(n);
          }}>
            {[...new Set([...categories, ...extraCats, t.category])].map((c) => <option key={c}>{c}</option>)}
            <option value="__new">＋ Neue Kategorie …</option>
          </select>
          {t.counterparty && <label className="check"><input type="checkbox" checked={rule} onChange={(e) => setRule(e.target.checked)} /> Immer so für „{t.counterparty}“</label>}
          <button className="btn primary" disabled={cat === t.category && !rule} onClick={() => { save(withOrig({ ...t, category: cat }), rule); setCatOpen(false); }}>Übernehmen</button>
        </div>
      )}
      {linkedInv && <div className="lookbox ok">🧾 Zahlungseingang zu Rechnung <b>{linkedInv.number}</b> · {linkedInv.customer?.name} · {fmtMoney(invTotal(linkedInv))}</div>}

      <section className="tile txcard">
        <div className="txkv"><span>Betrag</span><b className={income ? "pos" : ""}>{income ? "+" : ""}{fmtMoney(t.amount, t.currency)}</b></div>
        <div className="txkv"><span>Buchungsdatum</span><b>{relDay(t.date)}</b></div>
        {t.valueDate && t.valueDate !== t.date && <div className="txkv"><span>Valuta</span><b>{fmtDate(t.valueDate)}</b></div>}
        {t.purpose && <div className="txkv col"><span>Zweck</span><p>{t.purpose}</p></div>}
        {t.kind === "broker" && [["ISIN", t.isin], ["Wertpapier", t.security], ["Stück", t.shares], ["Kurs", t.price != null && fmtMoney(t.price, t.currency)], ["Gebühren", t.fee ? fmtMoney(t.fee) : ""], ["Steuern", t.tax ? fmtMoney(t.tax) : ""]]
          .filter(([, v]) => v != null && v !== "" && v !== false).map(([k, v]) => <div key={k} className="txkv"><span>{k}</span><b>{String(v)}</b></div>)}
        {t.kind !== "broker" && (
          <div className="txkv"><span>🔁 Umbuchung <small className="muted block">zählt nicht als Einnahme/Ausgabe</small></span>
            <input type="checkbox" className="switch" aria-label="Umbuchung" checked={isTransfer}
              onChange={() => save(isTransfer ? { ...t, category: t.preTransferCat || t.orig?.category || (income ? "Einnahmen" : "Sonstiges"), preTransferCat: undefined } : withOrig({ ...t, category: "Umbuchung", preTransferCat: t.category }))} /></div>
        )}
        {(ct || rec) && (
          <div className="txkv col"><span>Zugehöriger Vertrag</span>
            <div className="txlink" onClick={() => { if (ct) { ls.set("ctOpenReq", ct.id); goTab?.("vertraege"); } else goTab?.("contracts"); onClose(); }}>
              <TxIcon t={t} size={44} />
              <div className="grow"><b>{ct ? ct.name || ct.provider : rec.name}</b><small className="muted block">{ct ? (ct.interval || "monatlich").replace(/^./, (c) => c.toUpperCase()) : rec.interval}{!ct && !(subs?.confirmed || []).includes(rec.key) ? " · erkannt" : ""}</small></div>
              <b>{ct ? fmtMoney(-(Number(ct.amount) || 0)) : fmtMoney(-rec.amount)}</b><span className="muted">›</span>
            </div>
          </div>
        )}
        {/* Beleg */}
        {doc ? (
          <div className="txkv col"><span>Beleg</span>
            <div className="txlink" onClick={() => setShowPrev(!showPrev)}>
              <Thumb d={doc} /><div className="grow"><b>📎 {doc.title}</b><small className="muted block">{showPrev ? "Vorschau ausblenden" : "Antippen für Vorschau"}</small></div>
              <button className="link" onClick={(e) => { e.stopPropagation(); onOpen(doc.id); }}>Öffnen</button>
              <button className="link red" onClick={(e) => { e.stopPropagation(); linkTx(t.id, null); onClose(); }}>Lösen</button>
            </div>
            {showPrev && <DocPreview d={doc} onOpen={() => onOpen(doc.id)} />}
          </div>
        ) : t.kind !== "broker" && (
          <div className="txkv col"><span>Beleg / Rechnung</span>
            <div className="expscan">
              <button className="expbig" onClick={() => { scanReceiptFor ? scanReceiptFor(t.id) : attachNew(t.id, "scan"); onClose(); }}>
                <span className="expico">📷</span><b>Beleg scannen</b><small>KI liest Firma, Betrag & Positionen</small>
              </button>
              <button className="expbig" onClick={() => setQrOpen(true)}>
                <span className="expico">▦</span><b>QR-Code</b><small>Registrierkassen-QR (RKSV)</small>
              </button>
              <button className="expbig" onClick={() => fileRef.current.click()}>
                <span className="expico">🖼</span><b>Foto / PDF</b><small>aus Galerie oder Dateien</small>
              </button>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const x = e.target.files[0]; e.target.value = ""; if (x) { receiptFor ? receiptFor(t.id, x) : attachNew(t.id, "file"); onClose(); } }} />
            </div>
            <button className="link txadd" onClick={() => setPickDoc(!pickDoc)}>🗂 Vorhandenes Dokument zuordnen</button>
            {pickDoc && (() => {
              const qn = norm(dq), amtAbs = Math.abs(t.amount);
              const cand = docs.filter((d) => !qn || norm(`${d.title} ${d.sender}`).includes(qn))
                .map((d) => ({ d, s: (Math.abs((d.amount?.total || 0) - amtAbs) < 0.01 ? 2 : 0) + (norm(d.sender || "").includes(norm(t.counterparty || "").split(" ")[0] || "#") ? 1 : 0) }))
                .sort((a, b) => b.s - a.s || (b.d.documentDate || "").localeCompare(a.d.documentDate || "")).slice(0, 8);
              return <div className="pickdocs"><input type="search" placeholder="Dokument suchen" value={dq} onChange={(e) => setDq(e.target.value)} />
                {cand.map(({ d }) => <div key={d.id} className="frow click" onClick={() => { linkTx(t.id, d.id); onClose(); }}><Thumb d={d} /><div className="grow"><b className="clamp small">{d.title}</b><small className="muted block">{d.sender} · {d.documentDate && fmtDate(d.documentDate)}{d.amount?.total ? " · " + fmtMoney(d.amount.total) : ""}</small></div></div>)}
              </div>;
            })()}
          </div>
        )}
        {!!t.items?.length && (
          <div className="txkv col"><span>Positionen ({t.items.length})</span>
            <div className="txitems">{t.items.map((it, i) => <div key={i} className="txitem"><CatIcon c={it.category} size={26} /><div className="grow"><b className="one">{it.name}</b><small className="muted">{it.qty !== 1 ? String(it.qty).replace(".", ",") + " × · " : ""}{it.category}</small></div><b>{fmtMoney(it.total)}</b></div>)}</div>
          </div>
        )}
        {t.receiptQr && <div className="txkv"><span>Kassenbon-QR</span><b className="small">{t.receiptQr.total != null ? fmtMoney(t.receiptQr.total) : "gespeichert"}{t.receiptQr.date ? " · " + fmtDate(t.receiptQr.date) : ""}</b></div>}
        {/* Sammlungen */}
        <div className="txkv col"><span>{inColls.length ? "Sammlungen" : ""}</span>
          {!!inColls.length && <div className="chips">{inColls.map((c) => <button key={c.id} className="chip" onClick={() => { onColl?.(c.id); onClose(); }}>📁 {c.name} <span className="muted" onClick={(e) => { e.stopPropagation(); setTxColls((t.colls || []).filter((x) => x !== c.id)); }}>✕</span></button>)}</div>}
          <button className="link txadd" onClick={() => setCollOpen(!collOpen)}>Zu Sammlung hinzufügen</button>
          {collOpen && (
            <div className="txpick">
              {colls.filter((c) => !(t.colls || []).includes(c.id)).map((c) => <button key={c.id} className="chip" onClick={() => { setTxColls([...(t.colls || []), c.id]); setCollOpen(false); }}>📁 {c.name}</button>)}
              <div className="row"><input placeholder="Neue Sammlung, z. B. Urlaub Kroatien" value={newColl} onChange={(e) => setNewColl(e.target.value)} />
                <button className="btn sm primary" disabled={!newColl.trim()} onClick={() => { const c = { id: uid(), name: newColl.trim() }; const l = [...colls, c]; ls.set("txColls", l); setColls(l); setTxColls([...(t.colls || []), c.id]); setNewColl(""); setCollOpen(false); }}>Anlegen</button></div>
            </div>
          )}
        </div>
        {/* Notiz */}
        <div className="txkv col"><span>{t.note && !noteOpen ? "Notiz" : ""}</span>
          {t.note && !noteOpen && <p onClick={() => setNoteOpen(true)}>{t.note}</p>}
          {!noteOpen && <button className="link txadd" onClick={() => setNoteOpen(true)}>{t.note ? "Notiz bearbeiten" : "Notiz hinzufügen"}</button>}
          {noteOpen && <div className="txpick"><textarea rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz zur Buchung" />
            <div className="row"><button className="btn sm primary" onClick={() => { save({ ...t, note: note.trim() || undefined }); setNoteOpen(false); }}>Speichern</button><button className="link" onClick={() => { setNote(t.note || ""); setNoteOpen(false); }}>Abbrechen</button></div></div>}
        </div>
      </section>

      {t.kind !== "broker" && same.length > 0 && (
        <section className="tile txcard">
          <b className="txh">{income ? "Einnahmen von" : "Ausgaben bei"} {t.counterparty || title}</b>
          <svg className="txbars" viewBox="0 0 390 150" role="img" aria-label="Verlauf der letzten 13 Monate">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="0" x2="330" y1={10 + 110 * (1 - f)} y2={10 + 110 * (1 - f)} className="grid" />)}
            {[0, 0.5, 1].map((f) => <text key={f} x="386" y={14 + 110 * (1 - f)} textAnchor="end" className="ax">{fmtMoney(max * f).replace(/,00/, "")}</text>)}
            {vals.map((v, i) => { const h = (v / max) * 110; return <g key={i}><rect x={i * 25.4 + 4} y={120 - h} width="17" height={Math.max(h, v ? 2 : 0)} rx="3" className={months[i] === t.date.slice(0, 7) ? "cur" : ""}><title>{monthLabel(months[i])}: {fmtMoney(v)}</title></rect>
              <text x={i * 25.4 + 12.5} y="138" textAnchor="middle" className="ax">{"JFMAMJJASOND"[+months[i].slice(5) - 1]}</text></g>; })}
            <line x1="0" x2="330" y1={120 - (avg / max) * 110} y2={120 - (avg / max) * 110} className="avg" />
          </svg>
          <div className="txavg">Ø {fmtMoney(avg)} <small>/ Monat</small></div>
          <button className="txlinkrow" onClick={() => { onSearch?.(t.counterparty || title); onClose(); }}>Alle Buchungen anzeigen ({same.length}) <span>›</span></button>
        </section>
      )}

      {qrOpen && createPortal(<CodeScanWin title="Kassenbon-QR scannen" onClose={() => setQrOpen(false)} onResult={(code) => onQr(code)} />, document.querySelector(".app") || document.body)}
      <h3 className="txsec">Sonstiges</h3>
      <section className="tile txcard">
        <div className="txkv col"><span>Von</span>
          <div className="txlink" onClick={() => { onAccount?.(t.accountId); onClose(); }}>
            <span className="caticon" style={{ width: 40, height: 40, background: "var(--card2)" }}>{KIND_DEFS[acc?.kind || "bank"]?.[0] || "🏦"}</span>
            <div className="grow"><b>{income ? (t.counterparty || "Absender") : accName(t.accountId)}</b><small className="muted block">{income ? fmtIban(t.iban) : fmtIban(acc?.iban)}</small></div>{!income && <span className="muted">›</span>}
          </div>
        </div>
        <div className="txkv col"><span>An</span>
          <div className="txlink plain" onClick={income ? () => { onAccount?.(t.accountId); onClose(); } : undefined}>
            {income ? <span className="caticon" style={{ width: 40, height: 40, background: "var(--card2)" }}>{KIND_DEFS[acc?.kind || "bank"]?.[0] || "🏦"}</span> : <TxIcon t={t} size={40} />}
            <div className="grow"><b>{income ? accName(t.accountId) : t.counterparty || "–"}</b><small className="muted block">{income ? fmtIban(acc?.iban) : fmtIban(t.iban)}</small></div>
          </div>
        </div>
        {sepa.typ && <div className="txkv col"><span>Typ</span><b>{sepa.typ}</b></div>}
        {sepa.cred && <div className="txkv col"><span>Gläubiger-ID</span><b className="mono">{sepa.cred}</b></div>}
        {sepa.mref && <div className="txkv col"><span>Mandatsreferenz</span><b className="mono">{sepa.mref}</b></div>}
        {t.receiptQr?.register && <div className="txkv col"><span>Registrierkasse</span><b className="mono small">{t.receiptQr.register}{t.receiptQr.receiptNo ? " · Beleg " + t.receiptQr.receiptNo : ""}</b></div>}
      </section>

      <section className="tile txcard">
        <button className="txlinkrow red" onClick={() => {
          if (!confirm(`Alle manuellen Änderungen an Buchungen von „${t.counterparty || title}“ zurücksetzen?\n\nKategorie, Name, Zweck, Datum, Symbol und die Regel „Immer so“ werden auf den Bankimport zurückgesetzt.`)) return;
          setCpIcon(key, null); resetCp?.(key, t.counterparty); onClose();
        }}>Manuelle Änderungen zurücksetzen</button>
        <small className="muted block" style={{ padding: "0 4px 6px" }}>Entfernt alle manuellen Änderungen an den Buchungen dieses Empfängers.</small>
        <button className="txlinkrow red" onClick={() => confirm(t.manual ? "Buchung löschen?" : "Diese Buchung stammt aus einem Bankimport. Trotzdem löschen?\n(Beim nächsten Import desselben Zeitraums kann sie wieder erscheinen.)") && (deleteTx(t), onClose())}>🗑 Buchung löschen</button>
      </section>
    </Win>
  );
}

/* ---------- Scanner (Docutain-Stil) ---------- */
const SCAN_FILTERS = [["original", "Original"], ["farbe", "Farbe"], ["dokument", "Dokument"], ["sw", "S/W"]];
const tick = () => new Promise((r) => setTimeout(r, 30));

function Scanner({ onDone, onClose, initial = null }) {
  const camRef = useRef(), galRef = useRef();
  const [pages, setPages] = useState([]);   // { src, corners, blob, url }
  const [edit, setEdit] = useState(null);   // { src, url, corners, idx }
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState(() => ls.get("scanFilter", "dokument"));
  const [cash, setCash] = useState(false);

  async function render(src, corners, f) {
    const out = applyFilter(warp(src, corners), f);
    const blob = await toJpeg(out);
    return { blob, url: URL.createObjectURL(blob) };
  }
  const rawRef = useRef([]);
  async function onShot(file, idx = pages.length) {
    if (!file) return;
    rawRef.current[idx] = file;
    setBusy("Foto wird geladen …"); await tick();
    try { const src = await loadImage(file); setEdit({ src, url: src.toDataURL("image/jpeg", 0.75), corners: detectCorners(src), idx }); }
    catch (e) {
      // Bearbeitung nicht möglich (z. B. Speicher am Handy) → Foto unverändert übernehmen
      if (confirm(`Das Foto konnte nicht zum Zuschneiden geladen werden (${e.message}).\n\nFoto unverändert als Beleg übernehmen?`)) onDone(file, { cash });
    }
    finally { setBusy(""); }
  }
  useEffect(() => { if (initial) onShot(initial, 0); }, []);
  function rotate() {
    const s = edit.src, c = document.createElement("canvas");
    c.width = s.height; c.height = s.width;
    const ctx = c.getContext("2d"); ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(s, 0, 0);
    setEdit({ ...edit, src: c, url: c.toDataURL("image/jpeg", 0.75), corners: detectCorners(c) });
  }
  async function confirmCrop() {
    setBusy("Wird entzerrt …"); await tick();
    try {
      const r = await render(edit.src, edit.corners, filter);
      setPages((p) => { const n = [...p]; n[edit.idx] = { src: edit.src, corners: edit.corners, ...r }; return n; });
      setEdit(null);
    } catch (e) {
      const raw = rawRef.current[edit.idx];
      if (raw && confirm(`Entzerren fehlgeschlagen (${e.message}).\n\nFoto unverändert als Beleg übernehmen?`)) onDone(raw, { cash });
    } finally { setBusy(""); }
  }
  async function changeFilter(f) {
    setFilter(f); ls.set("scanFilter", f);
    setBusy("Filter …"); await tick();
    const np = []; for (const p of pages) np.push({ ...p, ...(await render(p.src, p.corners, f)) });
    setPages(np); setBusy("");
  }
  async function finish() {
    setBusy("Wird gespeichert …"); await tick();
    try {
    const stamp = new Date().toLocaleString("sv-SE").replace(" ", "_").replace(/:/g, "-").slice(0, 16);
    const file = pages.length === 1
      ? new File([pages[0].blob], `Scan_${stamp}.jpg`, { type: "image/jpeg" })
      : new File([await pagesToPdf(pages.map((p) => p.blob))], `Scan_${stamp}.pdf`, { type: "application/pdf" });
    onDone(file, { cash });
    } catch (e) { alert("Speichern fehlgeschlagen: " + e.message); setBusy(""); }
  }

  return (
    <Win id="scanner" onClose={onClose} className="scanner" dirty={pages.length > 0} saveLabel="Fertig">
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onShot(e.target.files[0], edit?.idx ?? pages.length); e.target.value = ""; }} />
        <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => { onShot(e.target.files[0], edit?.idx ?? pages.length); e.target.value = ""; }} />
        <div className="panelhead">
          <b>{edit ? "Ecken anpassen" : "Scannen"}</b>
          {edit ? <button className="btn primary" onClick={confirmCrop}>Weiter</button>
            : <button className="btn primary" disabled={!pages.length} onClick={finish}>Fertig{pages.length > 1 ? ` (${pages.length})` : ""}</button>}
          <XBtn />
        </div>

        {!edit && !pages.length && (
          <div className="scanstart">
            <div style={{ fontSize: 56 }}>📷</div>
            <p>Bon, Rechnung oder Brief flach hinlegen – am besten auf dunklem Untergrund und mit gutem Licht.</p>
            <button className="btn primary big" onClick={() => camRef.current.click()}>📷 Foto aufnehmen</button>
            <button className="btn big" onClick={() => galRef.current.click()}>🖼 Aus Fotos wählen</button>
            <p className="muted small">Ränder werden automatisch erkannt und das Bild gerade gerückt. Mehrere Seiten werden zu einem PDF.</p>
          </div>
        )}

        {edit && (
          <>
            <CropEditor src={edit.src} url={edit.url} corners={edit.corners} onChange={(c) => setEdit({ ...edit, corners: c })} />
            <div className="actions center">
              <button className="btn" onClick={rotate}>↻ Drehen</button>
              <button className="btn" onClick={() => setEdit({ ...edit, corners: [[0, 0], [edit.src.width, 0], [edit.src.width, edit.src.height], [0, edit.src.height]] })}>⤢ Ganzes Bild</button>
              <button className="btn" onClick={() => camRef.current.click()}>📷 Neu</button>
            </div>
            <p className="muted small center-text">Ziehe die Ecken auf die Ränder des Dokuments.</p>
          </>
        )}

        {!edit && !!pages.length && (
          <>
            <div className="seg" style={{ marginTop: 8 }}>
              {SCAN_FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => changeFilter(k)}>{l}</button>)}
            </div>
            <div className="scanpages">
              {pages.map((p, i) => (
                <div key={i} className="scanpage">
                  <img src={p.url} alt={`Seite ${i + 1}`} onClick={() => setEdit({ src: p.src, url: p.src.toDataURL("image/jpeg", 0.75), corners: p.corners, idx: i })} />
                  <div className="row1"><small className="muted">Seite {i + 1} · tippen zum Zuschneiden</small>
                    <button className="link red" onClick={() => setPages(pages.filter((_, j) => j !== i))}>Entfernen</button></div>
                </div>
              ))}
              <button className="scanadd" onClick={() => camRef.current.click()}><span>＋</span>Seite hinzufügen</button>
            </div>
            <label className="check cashcheck"><input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} /> 💶 Bar bezahlt – nach dem Auslesen als Barausgabe buchen</label>
          </>
        )}
        {busy && <div className="busy"><div className="spinner" />{busy}</div>}
    </Win>
  );
}

function CropEditor({ src, url, corners, onChange }) {
  const svgRef = useRef(); const drag = useRef(-1);
  const W = src.width, H = src.height, r = Math.max(W, H) / 32;
  const pos = (e) => {
    const b = svgRef.current.getBoundingClientRect();
    return [Math.min(W, Math.max(0, ((e.clientX - b.left) / b.width) * W)), Math.min(H, Math.max(0, ((e.clientY - b.top) / b.height) * H))];
  };
  const down = (i) => (e) => { e.preventDefault(); drag.current = i; svgRef.current.setPointerCapture(e.pointerId); };
  const move = (e) => { if (drag.current < 0) return; const n = corners.map((c) => [...c]); n[drag.current] = pos(e); onChange(n); };
  const up = () => { drag.current = -1; };
  const poly = corners.map((c) => c.join(",")).join(" ");
  return (
    <div className="crop" style={{ aspectRatio: `${W} / ${H}`, width: `min(100%, calc(62dvh * ${W / H}))` }}>
      <img src={url} alt="" draggable={false} />
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <path d={`M0 0H${W}V${H}H0Z M${corners.map((c) => c.join(" ")).join(" L")}Z`} fill="#0009" fillRule="evenodd" />
        <polygon points={poly} fill="none" stroke="#0b63f6" strokeWidth={r / 5} />
        {corners.map((c, i) => (
          <circle key={i} cx={c[0]} cy={c[1]} r={r} fill="#ffffffdd" stroke="#0b63f6" strokeWidth={r / 5} onPointerDown={down(i)} style={{ cursor: "grab", touchAction: "none" }} />
        ))}
      </svg>
    </div>
  );
}

/* ---------- Bargeld & manuelle Buchungen ---------- */
function cashBalance(acc, txs) {
  // Mit Startbestand zählt nur, was ab dessen Datum passiert ist
  const own = txs.filter((t) => t.accountId === acc.id && afterOpening(t, acc)).reduce((s, t) => s + t.amount, 0);
  const atm = acc.atm ? txs.filter((t) => t.accountId !== acc.id && t.category === "Bargeld" && t.amount < 0 && afterOpening(t, acc)).reduce((s, t) => s - t.amount, 0) : 0;
  return (acc.opening || 0) + own + atm;
}

function AccountSheet({ init, onSave, onClose, onDelete, hasAtmAccount, txs = [] }) {
  const [kind, setKind] = useState(init?.kind || "cash");
  const [name, setName] = useState(init?.name ?? "Geldbörse");
  const cur = init ? accountBalance(init, txs) : null;
  const [opening, setOpening] = useState(cur != null ? String(cur.toFixed(2)).replace(".", ",") : "");
  const [atm, setAtm] = useState(init ? !!init.atm : !hasAtmAccount);
  const [iban, setIban] = useState(init?.iban || "");
  const defaultName = (k) => (k === "cash" ? "Geldbörse" : k === "savings" ? "Sparbuch" : k === "card" ? "Kreditkarte" : k === "wallet" ? "PayPal" : "");
  function save() {
    const val = opening === "" ? null : Number(String(opening).replace(/\./g, "").replace(",", "."));
    const changed = !init || (cur == null ? val != null : val == null || Math.abs(val - cur) > 0.004);
    const base = { ...(init || { id: uid() }), kind, name: name.trim(), iban: iban.replace(/\s/g, "").toUpperCase() };
    if (kind === "cash") base.atm = atm;
    if (changed) Object.assign(base, val == null ? { opening: kind === "cash" ? 0 : null, openingDate: "", openingAt: "" } : { opening: val, openingDate: todayISO(), openingAt: new Date().toISOString() });
    onSave(base);
  }
  return (
    <Win id="account" onClose={onClose} small>
        <div className="panelhead"><b>{init ? "Konto bearbeiten" : "Neues Konto"}</b>
          <button className="btn primary" disabled={!name.trim()} onClick={save}>{init ? "Speichern" : "Anlegen"}</button>
          <XBtn />
        </div>
        <fieldset>
          <legend>Art</legend>
          <div className="kindgrid">
            {Object.entries(KIND_DEFS).map(([k, [i, l]]) => (
              <button key={k} className={kind === k ? "on" : ""} onClick={() => { if (!init && (!name || name === defaultName(kind))) setName(defaultName(k)); setKind(k); }}><span>{i}</span>{l}</button>
            ))}
          </div>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. BAWAG Giro, Sparbuch Raika" /></label>
          {kind !== "cash" && <label>IBAN (optional)<input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="AT.." /></label>}
          <label>{kind === "cash" ? "Bargeldbestand jetzt" : "Kontostand jetzt (optional)"}
            <input inputMode="decimal" placeholder={kind === "cash" ? "z. B. 120,00" : "leer = kein Kontostand anzeigen"} value={opening} onChange={(e) => setOpening(e.target.value)} />
          </label>
          <p className="muted small">Ab jetzt wird der Stand mit jeder neuen Buchung fortgeschrieben.</p>
          {kind === "cash" && <label className="check"><input type="checkbox" checked={atm} onChange={(e) => setAtm(e.target.checked)} /> Bankomat-Behebungen aus importierten Konten automatisch als Einzahlung zählen</label>}
        </fieldset>
        {onDelete && <button className="btn danger" style={{ marginTop: 14 }} onClick={onDelete}>🗑 Konto löschen</button>}
    </Win>
  );
}

/* Bargeld / Buchung schnell erfassen – im Fenster, als Übersichts-Widget und im Reiter „Barausgabe“ */
function CashForm({ init, accounts, categories, onSave, onScan, addCategory, compact = false, autoFocus = false }) {
  const cashAcc = accounts.find((a) => a.kind === "cash");
  const [accountId, setAccountId] = useState(init?.accountId || cashAcc?.id || accounts[0]?.id || "new-cash");
  const [dir, setDir] = useState("out");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState("");
  const [category, setCategory] = useState("Lebensmittel & Haushalt");
  const [extra, setExtra] = useState([]);
  const [att, setAtt] = useState(null); // { file, opts, url }
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const val = Number(String(amount).replace(/\s/g, "").replace(",", "."));
  const ok = val > 0 && date && text.trim() && !busy;
  const setFile = (file, opts = {}) => setAtt((old) => { if (old?.url) URL.revokeObjectURL(old.url); return file ? { file, opts, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null } : null; });
  useEffect(() => () => att?.url && URL.revokeObjectURL(att.url), []);
  const save = async () => {
    if (!ok) return; setBusy(true);
    try {
      await onSave({ accountId, date, amount: dir === "out" ? -val : val, counterparty: text.trim(), purpose: "", category: dir === "in" && category === "Lebensmittel & Haushalt" ? "Einnahmen" : category }, att);
      setAmount(""); setText(""); setFile(null);
    } finally { setBusy(false); }
  };
  const cats = [...new Set([...categories, ...extra, category])];
  return (
    <div className={"cashform" + (compact ? " compact" : "")}>
      <div className="seg">
        <button className={dir === "out" ? "on" : ""} onClick={() => setDir("out")}>Ausgabe</button>
        <button className={dir === "in" ? "on" : ""} onClick={() => setDir("in")}>Einnahme</button>
      </div>
      <input className="bigamount" inputMode="decimal" placeholder="0,00 €" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={autoFocus}
        onKeyDown={(e) => e.key === "Enter" && save()} />
      <label>Wofür / bei wem<input value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Bäckerei, Trinkgeld, Flohmarkt" onKeyDown={(e) => e.key === "Enter" && save()} /></label>
      <div className="grid2">
        <label>Datum<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Konto
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.icon && a.icon !== "none" ? a.icon : kindIcon(a.kind)} {a.name}</option>)}
            {!cashAcc && <option value="new-cash">💶 Geldbörse (neu)</option>}
          </select>
        </label>
      </div>
      <label>Kategorie
        <select value={category} onChange={(e) => {
          if (e.target.value !== "__new") return setCategory(e.target.value);
          const n = (prompt("Name der neuen Kategorie:") || "").trim(); if (!n) return;
          addCategory?.(n); setExtra((x) => [...x, n]); setCategory(n);
        }}>
          {cats.map((c) => <option key={c}>{c}</option>)}
          {addCategory && <option value="__new">＋ Neue Kategorie …</option>}
        </select>
      </label>
      <div className="cashatt">
        <small className="muted">Beleg (optional)</small>
        {att ? (
          <div className="attchip">
            {att.url ? <img src={att.url} alt="" /> : <span className="attpdf">PDF</span>}
            <span className="grow">{att.opts?.scanned ? "Gescannter Beleg" : att.file.name}</span>
            <button className="iconbtn" title="Entfernen" aria-label="Beleg entfernen" onClick={() => setFile(null)}>✕</button>
          </div>
        ) : (
          <div className="attbtns">
            {onScan && <button className="btn" onClick={() => onScan((f, o) => setFile(f, { ...o, scanned: true }))}>📷 Scannen</button>}
            <button className="btn" onClick={() => fileRef.current.click()}>🖼 Foto / Datei</button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) setFile(f); }} />
          </div>
        )}
      </div>
      <button className="btn primary cashsave" disabled={!ok} onClick={save}>{busy ? "Speichert …" : "Speichern"}</button>
    </div>
  );
}
function ManualTxSheet({ init, onClose, ...rest }) {
  return (
    <Win id="manual" onClose={onClose} small defW={560}>
      <div className="panelhead"><b>Ausgabe / Buchung erfassen</b><XBtn /></div>
      <ExpenseForm {...rest} initAccount={init?.accountId} onSave={async (t, att) => { const r = await rest.onSave(t, att); onClose(); return r; }} />
    </Win>
  );
}

/* ---------- Detailansicht ---------- */
function PayQR({ doc, notify }) {
  const [src, setSrc] = useState("");
  const payload = epcPayload(doc);
  useEffect(() => { QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 260 }).then(setSrc).catch(() => setSrc("")); }, [payload]);
  return (
    <div className="qr">
      {src && <img src={src} alt="Zahlen-mit-Code QR" />}
      <div>
        <p className="small muted">Mit der Banking-App (z. B. George → „Scannen“) einlesen.</p>
        <button className="link" onClick={() => copy(doc.payment.iban, notify)}>IBAN kopieren</button><br />
        {doc.payment.reference && <button className="link" onClick={() => copy(doc.payment.reference, notify)}>Referenz kopieren</button>}
      </div>
    </div>
  );
}
function Detail({ doc, categories, docGroups = [], addCategoryEx, onClose, saveDoc, trashDoc, reanalyze, notify, bookCash, txs = [], accounts = [], linkTx }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [newCat, setNewCat] = useState(false);
  const [lq, setLq] = useState("");
  const [url, setUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const [d, setD] = useState(doc);
  const [showText, setShowText] = useState(false);

  useEffect(() => setD(doc), [doc]);
  useEffect(() => {
    let u;
    db.getFile(doc.id).then((b) => { if (b) { setBlob(b); u = URL.createObjectURL(b); setUrl(u); } });
    return () => u && URL.revokeObjectURL(u);
  }, [doc.id]);

  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const setC = (patch) => set({ contract: { provider: d.sender || "", active: true, ...d.contract, ...patch } });
  const setP = (patch) => set({ payment: { recipient: d.sender || "", ...d.payment, ...patch } });
  const dirty = JSON.stringify(d) !== JSON.stringify(doc);
  const setDl = (id, patch) => set({ deadlines: d.deadlines.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const ext = doc.mimeType === "application/pdf" ? "pdf" : "jpg";
  const safeName = (d.title || "dokument").replace(/[\\/:*?"<>|]/g, "-");
  const numIn = (v) => { const s = String(v).replace(",", "."); return s === "" ? null : Number(s); };

  return (
    <Win id="detail" onClose={onClose} center dirty={dirty}>
        <div className="panelhead">
          <b>Dokument</b>
          <button className="btn primary" disabled={!dirty} onClick={() => saveDoc(d)}>Speichern</button>
          <XBtn />
        </div>

        {url && (doc.mimeType.startsWith("image/")
          ? <img className="preview" src={url} alt="" onClick={() => window.open(url)} />
          : <div className="pdfbox"><Thumb d={doc} /><div className="grow"><b className="clamp">{doc.fileName || doc.title}</b></div></div>)}
        <div className="seg scopeseg" style={{ margin: "6px 0 6px" }} role="group" aria-label="Privat oder Firma">
          {SCOPES.map(([k, i, l]) => <button key={k} className={docScope(d) === k ? "on" : ""} onClick={() => set({ scope: k, scopeManual: true })}>{i} {l}</button>)}
        </div>
        <div className="seg areaseg" style={{ margin: "6px 0 10px" }}>
          {Object.entries(AREAS).map(([k, [i, l]]) => <button key={k} className={docArea(d) === k ? "on" : ""} onClick={() => set({ areaManual: k })}>{i} {l}</button>)}
        </div>
        <div className="labels" style={{ marginBottom: 4 }}><Label c={d.category} />{d.taxRelevant && <span className="label tax">Steuer</span>}{d.contract && <span className="label">Vertrag</span>}</div>

        {doc.status === "error" && <div className="err">Analyse fehlgeschlagen: {doc.error}</div>}
        {doc.status === "processing" && <div className="muted">Wird analysiert …</div>}

        <label>Titel<input value={d.title || ""} onChange={(e) => set({ title: e.target.value })} /></label>
        <div className="grid2">
          <label>Kategorie
            <select value={d.category} onChange={(e) => (e.target.value === "__new" ? setNewCat(true) : set({ category: e.target.value }))}>
              {[...new Set([...categories, d.category])].map((c) => <option key={c}>{c}</option>)}
              {addCategoryEx && <option value="__new">＋ Neue Kategorie …</option>}
            </select>
          </label>
          {newCat && createPortal(<NewCategoryWin groups={docGroups} existing={categories} defGroup={docGroups.find((g) => g.cats.includes(d.category))?.id}
            onClose={() => setNewCat(false)} onCreate={(n, gid, st) => { addCategoryEx(n, gid, st); set({ category: n }); }} />, document.querySelector(".app") || document.body)}
          <label>Typ<input value={d.docType || ""} onChange={(e) => set({ docType: e.target.value })} /></label>
          <label>Absender<input value={d.sender || ""} onChange={(e) => set({ sender: e.target.value })} /></label>
          <label>Datum<input type="date" value={d.documentDate || ""} onChange={(e) => set({ documentDate: e.target.value })} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={!!d.taxRelevant} onChange={(e) => set({ taxRelevant: e.target.checked })} /> 🧾 Steuerrelevant</label>

        <fieldset>
          <legend>Betrag</legend>
          <div className="seg">
            {[["ausgabe", "Ausgabe"], ["einnahme", "Einnahme"], ["keine", "Nur Info"]].map(([k, l]) => (
              <button key={k} className={(d.direction || "keine") === k ? "on" : ""} onClick={() => set({ direction: k })}>{l}</button>
            ))}
          </div>
          <div className="grid4">
            {[["total", "Brutto"], ["net", "Netto"], ["vat", "USt"], ["payout", "Ausbezahlt / Zahlbetrag"]].map(([k, l]) => (
              <label key={k}>{l}
                <input inputMode="decimal" value={d.amount?.[k] ?? ""} placeholder={k === "payout" && d.amount ? String(payAmt(d) ?? "") : ""}
                  onChange={(e) => set({ amount: { currency: "EUR", ...d.amount, [k]: numIn(e.target.value) } })} />
              </label>
            ))}
          </div>
          {d.amount && payAmt(d) !== d.amount.total && <p className="muted small">Gerechnet wird mit dem ausbezahlten Betrag {fmtMoney(payAmt(d))} (z. B. Netto-Auszahlung beim Lohnzettel).</p>}
          {d.amount?.total != null && d.direction === "ausgabe" && (
            <div className="row1" style={{ alignItems: "center" }}>
              <label className="check"><input type="checkbox" checked={!!d.paid} onChange={(e) => set({ paid: e.target.checked })} /> Bezahlt{doc.paidCash ? " (bar)" : ""}</label>
              {!doc.paid && <button className="btn" style={{ marginTop: 8 }} onClick={() => bookCash({ ...doc, ...d })}>💶 Bar bezahlt</button>}
            </div>
          )}
        </fieldset>


        {(() => {
          const linked = txs.find((t) => t.docId === doc.id);
          const accN = (id) => accounts.find((a) => a.id === id)?.name || "";
          const target = payAmt(d), dd = d.documentDate || doc.createdAt?.slice(0, 10) || todayISO();
          const days = (x) => Math.abs((new Date(x) - new Date(dd)) / 864e5);
          const qn = norm(lq);
          const cands = !linkOpen ? [] : txs.filter((t) => t.id !== linked?.id && t.kind !== "broker")
            .filter((t) => !qn || norm(`${t.counterparty} ${t.purpose} ${t.amount}`).includes(qn))
            .map((t) => ({ t, score: (target ? Math.abs(Math.abs(t.amount) - target) : 0) * 10 + days(t.date) }))
            .sort((a, b) => a.score - b.score).slice(0, 8).map((x) => x.t);
          return (
            <fieldset>
              <legend>Buchung</legend>
              {linked ? (
                <div className="frow">
                  <CatIcon c={linked.category} />
                  <div className="grow"><b>{linked.counterparty || linked.purpose || "Buchung"}</b><small className="muted block">{fmtDate(linked.date)} · {accN(linked.accountId)}</small></div>
                  <b className={linked.amount > 0 ? "pos" : ""}>{fmtMoney(linked.amount, linked.currency)}</b>
                  <button className="link red" onClick={() => linkTx(linked.id, null)}>Lösen</button>
                </div>
              ) : <p className="muted small">Noch keiner Kontobuchung zugeordnet.</p>}
              {!linkOpen ? <button className="btn" onClick={() => setLinkOpen(true)}>🔗 {linked ? "Andere Buchung wählen" : "Mit Buchung verknüpfen"}</button> : (
                <div className="linkpick">
                  <input type="search" placeholder="Buchung suchen (Empfänger, Betrag …)" value={lq} onChange={(e) => setLq(e.target.value)} />
                  {cands.map((t) => (
                    <button key={t.id} className="frow click linkopt" onClick={() => { linkTx(t.id, doc.id); setLinkOpen(false); notify("Beleg mit Buchung verknüpft"); }}>
                      <CatIcon c={t.category} size={32} />
                      <span className="grow"><b className="one">{t.counterparty || t.purpose || "Buchung"}</b><small className="muted block">{fmtDate(t.date)} · {accN(t.accountId)}{t.docId ? " · hat schon Beleg" : ""}</small></span>
                      <b className={t.amount > 0 ? "pos" : ""}>{fmtMoney(t.amount, t.currency)}</b>
                    </button>
                  ))}
                  {!cands.length && <p className="muted small">Keine passenden Buchungen – erst Umsätze importieren.</p>}
                  <button className="link" onClick={() => setLinkOpen(false)}>Abbrechen</button>
                </div>
              )}
            </fieldset>
          );
        })()}

        {(d.direction === "ausgabe" || d.payment) && (
          <fieldset>
            <legend>Bezahlen</legend>
            <div className="grid2">
              <label>Empfänger<input value={d.payment?.recipient ?? ""} onChange={(e) => setP({ recipient: e.target.value })} /></label>
              <label>IBAN<input value={d.payment?.iban ?? ""} onChange={(e) => setP({ iban: e.target.value.replace(/\s/g, "").toUpperCase() })} /></label>
              <label>BIC<input value={d.payment?.bic ?? ""} onChange={(e) => setP({ bic: e.target.value })} /></label>
              <label>Referenz<input value={d.payment?.reference ?? ""} onChange={(e) => setP({ reference: e.target.value })} /></label>
            </div>
            {d.payment?.iban && !d.paid && <PayQR doc={d} notify={notify} />}
          </fieldset>
        )}

        <fieldset>
          <legend>Vertrag / Abo</legend>
          <label className="check"><input type="checkbox" checked={!!d.contract && d.contract.active !== false}
            onChange={(e) => (e.target.checked ? setC({ active: true }) : d.contract && setC({ active: false }))} /> Laufender Vertrag (zählt zu Fixkosten)</label>
          {d.contract && (
            <div className="grid2">
              <label>Anbieter<input value={d.contract.provider || ""} onChange={(e) => setC({ provider: e.target.value })} /></label>
              <label>Kundennr.<input value={d.contract.customerNumber || ""} onChange={(e) => setC({ customerNumber: e.target.value })} /></label>
              <label>Betrag<input inputMode="decimal" value={d.contract.amount ?? ""} onChange={(e) => setC({ amount: numIn(e.target.value) })} /></label>
              <label>Intervall
                <select value={d.contract.interval || ""} onChange={(e) => setC({ interval: e.target.value })}>
                  <option value="">–</option>{Object.keys(INTERVAL_FACTOR).map((k) => <option key={k}>{k}</option>)}
                </select>
              </label>
              <label>Vertragsende<input type="date" value={d.contract.endDate || ""} onChange={(e) => setC({ endDate: e.target.value })} /></label>
              <label>Kündigen bis<input type="date" value={d.contract.cancelBy || ""} onChange={(e) => setC({ cancelBy: e.target.value })} /></label>
            </div>
          )}
        </fieldset>

        <label>Tags (mit Komma trennen)
          <input value={(d.tags || []).join(", ")} onChange={(e) => set({ tags: e.target.value.split(",").map((t) => norm(t).trim()).filter(Boolean) })} />
        </label>

        <fieldset>
          <legend>Fristen</legend>
          {(d.deadlines || []).map((x) => (
            <div key={x.id} className="dlrow">
              <input type="checkbox" checked={x.done} onChange={(e) => setDl(x.id, { done: e.target.checked })} />
              <input value={x.label} onChange={(e) => setDl(x.id, { label: e.target.value })} />
              <input type="date" value={x.date} onChange={(e) => setDl(x.id, { date: e.target.value })} />
              <button className="link" onClick={() => downloadIcs([[x, d]], "frist.ics")}>📅</button>
              <button className="link red" onClick={() => set({ deadlines: d.deadlines.filter((y) => y.id !== x.id) })}>✕</button>
            </div>
          ))}
          <button className="link" onClick={() => set({ deadlines: [...(d.deadlines || []), { id: uid(), label: "Frist", date: todayISO(), done: false }] })}>＋ Frist hinzufügen</button>
        </fieldset>

        {d.summary && <p className="summary">{d.summary}</p>}
        <label>Notizen<textarea rows={3} value={d.notes || ""} onChange={(e) => set({ notes: e.target.value })} /></label>

        <div className="textinfo">
          {d.fullText ? <>
            <span className="ok">✓ Text durchsuchbar</span><small className="muted">{d.fullText.length.toLocaleString("de-AT")} Zeichen – wird bei der Suche mit durchsucht</small>
            <span className="grow" />
            <button className="link" onClick={async () => { try { await navigator.clipboard.writeText(d.fullText); notify("Text kopiert"); } catch { setShowText(true); } }}>📋 Text kopieren</button>
            <button className="link" onClick={() => setShowText(!showText)}>{showText ? "Ausblenden" : "Anzeigen"}</button>
          </> : <>
            <span className="muted">Kein Text ausgelesen</span><span className="grow" />
            <button className="link" onClick={() => reanalyze(doc)}>↻ Mit Claude auslesen</button>
          </>}
        </div>
        {showText && d.fullText && <pre className="fulltext">{d.fullText}</pre>}

        <div className="actions">
          {blob && <button className="btn" onClick={() => download(blob, `${safeName}.${ext}`)}>⬇︎ Datei</button>}
          <button className="btn" onClick={() => reanalyze(doc)}>↻ Neu analysieren</button>
          <button className="btn danger" onClick={() => trashDoc(doc)}>🗑 Papierkorb</button>
        </div>
        <p className="muted small">{doc.fileName} · {(doc.size / 1024).toFixed(0)} KB · hinzugefügt {new Date(doc.createdAt).toLocaleString("de-AT")}</p>
    </Win>
  );
}

/* ---------- Einstellungen, Budgets, Papierkorb, Backup ---------- */
const SetCtx = React.createContext(null);
/* Einstellungs-Bereich: auf-/zuklappbar und per Griff verschiebbar */
function SetSec({ id, title, children }) {
  const c = React.useContext(SetCtx);
  if (!c) return <fieldset><legend>{title}</legend>{children}</fieldset>;
  const idx = c.order.indexOf(id), open = !c.collapsed.includes(id);
  return (
    <>
      {c.dnd.lineAt("sec", "s", idx) && <div className="dropline" />}
      <fieldset id={"sec-" + id} className={"ssec" + (open ? " open" : "") + (c.dnd.isDragging("sec", "s", idx) ? " dragging" : "")} data-sec-item={"s|" + idx}>
        <div className="ssechead">
          <Handle onDown={(e) => c.dnd.start(e, { kind: "sec", list: "s", index: idx, label: title })} label="Bereich verschieben" />
          <button type="button" className="ssectitle" onClick={() => c.toggle(id)} aria-expanded={open}>
            <span className="grow">{title}</span><IcoChev open={open} />
          </button>
        </div>
        {open && <div className="ssecbody">{children}</div>}
      </fieldset>
    </>
  );
}

const SET_IDS = ["darstellung", "design", "applock", "datenschutz", "import", "nav-tabs", "nav-accounts", "budgets", "meinedaten", "rechnungen", "rechnungsdesign", "mahnwesen", "artikel", "kontaktarten", "docgroups", "doccats", "rules", "trash", "backup", "verbindung"];
// gespeicherte Reihenfolge + neue Bereiche an ihrer Standardposition einfügen
function mergeOrder(cur, ids) {
  const out = cur.filter((x) => ids.includes(x));
  ids.forEach((id, i) => {
    if (out.includes(id)) return;
    const prev = ids.slice(0, i).reverse().find((x) => out.includes(x));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, id);
  });
  return out;
}

/* ---------- Design: Voreinstellungen (angelehnt an bekannte Finanz- & Dokumenten-Apps) ---------- */
const DESIGN_PRESETS = [
  { id: "fido", name: "FinDocu Blau", note: "Standard", acc: "#0b63f6", acc2: "#00b3a4", hero: ["#0b3d91", "#0b63f6", "#00b3a4"] },
  { id: "petrol", name: "Petrol", note: "inspiriert von N26", acc: "#088177", acc2: "#36a18b", hero: ["#00413e", "#088177", "#36a18b"] },
  { id: "koralle", name: "Koralle", note: "inspiriert von Monzo", acc: "#e8384f", acc2: "#007a8b", hero: ["#001e3a", "#007a8b", "#fe4b60"] },
  { id: "violett", name: "Midnight Violett", note: "inspiriert von Revolut", acc: "#494fdf", acc2: "#00a87e", hero: ["#191c1f", "#2d318f", "#494fdf"] },
  { id: "mint", name: "Fintech Mint", note: "dunkler Neobank-Look", acc: "#00a884", acc2: "#2b6cff", hero: ["#0a0f1e", "#0f2f3a", "#00d4a0"],
    dark: { bg: "#0a0f1e", card: "#111829", card2: "#172036", line: "#222c45" } },
  { id: "gold", name: "Premium Gold", note: "Private-Banking-Stil", acc: "#a67931", acc2: "#088177", hero: ["#151515", "#3a2f1d", "#c89d58"] },
  { id: "papier", name: "Papier", note: "inspiriert von Notion", acc: "#2383e2", acc2: "#e16259", hero: ["#37352f", "#55524a", "#8a8578"],
    light: { bg: "#f7f6f3", card: "#ffffff", card2: "#f1f0ec", line: "#e9e8e4", txt: "#37352f", mut: "#787774" },
    dark: { bg: "#191919", card: "#202020", card2: "#2a2a2a", line: "#333333", txt: "#e9e9e7", mut: "#9b9a97" } },
  { id: "archiv", name: "Archiv-Grün", note: "inspiriert von Evernote", acc: "#00a82d", acc2: "#166a8f", hero: ["#0e3b2b", "#166a8f", "#2dbe60"],
    light: { bg: "#f4eee5", card: "#fffdf9", card2: "#f8f3ea", line: "#e8dfd0" } },
  { id: "scanner", name: "Scanner Blau", note: "Dokumenten-Scanner-Stil", acc: "#1a73e8", acc2: "#f9ab00", hero: ["#0d2a5c", "#1a73e8", "#4fa3ff"] },
];
const POS_SWATCHES = ["#16a34a", "#22c55e", "#00a87e", "#0d9488", "#36a18b", "#0b63f6", "#2eaadc", "#494fdf", "#a67931"];
const NEG_SWATCHES = ["#e5484d", "#dc2626", "#fe4b60", "#e16259", "#b55b64", "#ec7e00", "#f59e0b", "#9333ea", "#475569"];
const mixWhite = (hex, p) => { const n = parseInt(hex.slice(1), 16), f = (c) => Math.round(c + (255 - c) * p); return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join(""); };
function applyDesign(design, theme) {
  const st = document.documentElement.style, pr = DESIGN_PRESETS.find((x) => x.id === design.preset) || DESIGN_PRESETS[0];
  const ov = design.over?.[pr.id] || {};
  const set = (k, v) => (v ? st.setProperty(k, v) : st.removeProperty(k));
  const dark = theme === "dark", def = pr.id === "fido" && !ov.acc && !ov.acc2;
  const acc = ov.acc || pr.acc, acc2 = ov.acc2 || pr.acc2;
  set("--acc", def ? null : dark ? mixWhite(acc, 0.22) : acc);
  set("--acc2", def ? null : acc2);
  set("--hero", def ? null : `linear-gradient(135deg,${pr.hero[0]} 0%,${ov.acc || pr.hero[1]} 55%,${ov.acc2 || pr.hero[2]} 100%)`);
  const surf = { ...((dark ? pr.dark : pr.light) || {}) };
  const bgOv = dark ? ov.bgDark : ov.bgLight;
  if (bgOv) { surf.bg = bgOv; surf.card = surf.card || (dark ? mixWhite(bgOv, 0.05) : "#ffffff"); }
  for (const k of ["bg", "card", "card2", "line", "txt", "mut"]) set("--" + k, surf[k]);
  set("--pos", design.pos ? (dark ? mixWhite(design.pos, 0.18) : design.pos) : null);
  set("--neg", design.neg ? (dark ? mixWhite(design.neg, 0.18) : design.neg) : null);
  document.body.classList.toggle("outneg", !!design.outNeg);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = surf.bg || (dark ? "#0d1117" : "#f3f5f9");
}
/* Farbwähler-Kreis: live Vorschau beim Ziehen, „change“ (Picker geschlossen) = übernehmen */
function ColorDot({ value, title, onInput, onCommit, className = "", children, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el || !onCommit) return;
    const h = (e) => onCommit(e.target.value); el.addEventListener("change", h); return () => el.removeEventListener("change", h);
  }, [onCommit]);
  return (
    <label className={"cdot " + className} title={title} style={style} onClick={(e) => e.stopPropagation()}>
      <input ref={ref} type="color" value={value} onChange={(e) => onInput?.(e.target.value)} />{children}
    </label>
  );
}
function Swatches({ value, list, custom = [], def, onPick, onAdd, onRemove }) {
  const isCustom = value && !list.includes(value) && !custom.includes(value);
  return (
    <div className="swatches">
      <button className={"sw def" + (!value ? " on" : "")} onClick={() => onPick(null)} title="Standard" style={{ background: def }}>A</button>
      {list.map((c) => <button key={c} className={"sw" + (value === c ? " on" : "")} style={{ background: c }} title={c} onClick={() => onPick(c)} />)}
      {custom.map((c) => (
        <span key={c} className="swwrap">
          <button className={"sw" + (value === c ? " on" : "")} style={{ background: c }} title={c + " (eigene Farbe)"} onClick={() => onPick(c)} />
          <button className="swdel" title="Eigene Farbe entfernen" onClick={() => onRemove(c)}>×</button>
        </span>
      ))}
      <ColorDot className={"sw custom" + (isCustom ? " on" : "")} title="Eigene Farbe hinzufügen" value={value || def}
        onInput={(c) => onPick(c)} onCommit={(c) => onAdd(c)}>＋</ColorDot>
    </div>
  );
}
function DesignSettings({ design, setDesign, theme }) {
  const pick = (k, v) => setDesign({ ...design, [k]: v });
  const cur = design.preset || "fido";
  const setOv = (pid, k, v) => setDesign({ ...design, preset: pid, over: { ...(design.over || {}), [pid]: { ...(design.over?.[pid] || {}), [k]: v } } });
  const resetOv = (pid) => { const o = { ...(design.over || {}) }; delete o[pid]; setDesign({ ...design, over: o }); };
  const addTo = (listKey, k) => (c) => {
    const l = design[listKey] || [], base = k === "pos" ? POS_SWATCHES : NEG_SWATCHES;
    setDesign({ ...design, [k]: c, [listKey]: base.includes(c) || l.includes(c) ? l : [...l, c].slice(-8) });
  };
  const rmFrom = (listKey, k) => (c) => setDesign({ ...design, [listKey]: (design[listKey] || []).filter((x) => x !== c), [k]: design[k] === c ? null : design[k] });
  const bgKey = theme === "dark" ? "bgDark" : "bgLight";
  return (
    <>
      <p className="muted small">Farbstil der App – Voreinstellungen angelehnt an bekannte Finanz- und Dokumenten-Apps. Auf die Kreise tippen, um einzelne Farben anzupassen (Akzent · Zweitfarbe · Hintergrund {theme === "dark" ? "Nacht" : "Tag"}).</p>
      <div className="presets">
        {DESIGN_PRESETS.map((pr) => {
          const ov = design.over?.[pr.id] || {};
          const acc = ov.acc || pr.acc, acc2 = ov.acc2 || pr.acc2;
          const bg = ov[bgKey] || (theme === "dark" ? pr.dark?.bg || "#0d1117" : pr.light?.bg || "#f3f5f9");
          const changed = Object.keys(ov).length > 0;
          return (
            <div key={pr.id} role="button" tabIndex={0} className={"preset" + (cur === pr.id ? " on" : "")} onClick={() => pick("preset", pr.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pick("preset", pr.id)}>
              <span className="pv" style={{ background: `linear-gradient(135deg,${pr.hero[0]},${ov.acc || pr.hero[1]} 55%,${ov.acc2 || pr.hero[2]})` }}>
                <ColorDot value={acc} title="Akzentfarbe ändern" style={{ background: acc }} onInput={(c) => setOv(pr.id, "acc", c)} />
                <ColorDot value={acc2} title="Zweitfarbe ändern" style={{ background: acc2 }} onInput={(c) => setOv(pr.id, "acc2", c)} />
                <ColorDot value={bg} title={`Hintergrund (${theme === "dark" ? "Nacht" : "Tag"}) ändern`} style={{ background: bg }} onInput={(c) => setOv(pr.id, bgKey, c)} />
              </span>
              <b>{pr.name}</b><small>{pr.note}</small>
              {changed && <button className="link small presetreset" onClick={(e) => { e.stopPropagation(); resetOv(pr.id); }}>↺ Originalfarben</button>}
            </div>
          );
        })}
      </div>
      <h4 className="subhead">Farben für Guthaben & Schulden</h4>
      <div className="colorrow"><span><b>Guthaben</b><small className="muted block">positive Kontostände, Eingänge, Einnahmen im Verlauf</small></span><b className="pos">+{fmtMoney(1234.56)}</b></div>
      <Swatches value={design.pos} list={POS_SWATCHES} custom={design.posList} def="#16a34a" onPick={(c) => pick("pos", c)} onAdd={addTo("posList", "pos")} onRemove={rmFrom("posList", "pos")} />
      <div className="colorrow"><span><b>Schulden</b><small className="muted block">negative Kontostände, Ausgaben im Verlauf</small></span><b className="neg">{fmtMoney(-567.89)}</b></div>
      <Swatches value={design.neg} list={NEG_SWATCHES} custom={design.negList} def="#e5484d" onPick={(c) => pick("neg", c)} onAdd={addTo("negList", "neg")} onRemove={rmFrom("negList", "neg")} />
      <label className="switchrow">
        <span><b>Ausgaben in Schulden-Farbe</b><small className="muted block">Auch einzelne Abbuchungen in Listen einfärben (sonst neutral)</small></span>
        <input type="checkbox" className="switch" checked={!!design.outNeg} onChange={(e) => pick("outNeg", e.target.checked)} />
      </label>
    </>
  );
}

function AppLockSettings({ notify }) {
  const [on, setOn] = useState(lockActive());
  const [mode, setMode] = useState(""); // "set" | "change" | "off"
  const [cur, setCur] = useState(""), [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [err, setErr] = useState("");
  const reset = () => { setMode(""); setCur(""); setPw(""); setPw2(""); setErr(""); };
  const save = async () => {
    if (mode !== "set" && !(await lockCheck(cur))) return setErr("Aktuelles Passwort stimmt nicht");
    if (mode === "off") { localStorage.removeItem("appLock"); setOn(false); reset(); return notify("App-Sperre ausgeschaltet"); }
    if (pw.length < 4) return setErr("Mindestens 4 Zeichen");
    if (pw !== pw2) return setErr("Passwörter stimmen nicht überein");
    ls.set("appLock", await lockHash(pw)); try { sessionStorage.setItem("findocuUnlocked", "1"); } catch {}
    setOn(true); reset(); notify(mode === "set" ? "App-Sperre eingeschaltet" : "Passwort geändert");
  };
  return (<>
    <label className="switchrow">
      <span><b>Passwort beim Öffnen verlangen</b><small className="muted block">Beim Start der App (und nach „Jetzt sperren“) erscheint ein Anmeldebildschirm. Standard: aus.</small></span>
      <input type="checkbox" className="switch" checked={on || mode === "set"} onChange={(e) => { reset(); setMode(e.target.checked ? "set" : on ? "off" : ""); }} />
    </label>
    {mode && <div className="bkimp">
      {mode !== "set" && <label>Aktuelles Passwort<input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label>}
      {mode !== "off" && <div className="grid2">
        <label>{mode === "change" ? "Neues Passwort" : "Passwort"} (mind. 4 Zeichen)<input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label>Wiederholen<input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      </div>}
      {err && <small className="red block">{err}</small>}
      <div className="actions"><button className="btn primary" onClick={save}>{mode === "off" ? "Sperre ausschalten" : mode === "change" ? "Passwort ändern" : "Sperre einschalten"}</button><button className="link" onClick={reset}>Abbrechen</button></div>
    </div>}
    {on && !mode && <div className="actions">
      <button className="btn" onClick={() => { try { sessionStorage.removeItem("findocuUnlocked"); } catch {} window.dispatchEvent(new Event("findocu-lock")); }}>🔒 Jetzt sperren</button>
      <button className="btn" onClick={() => { reset(); setMode("change"); }}>Passwort ändern</button>
    </div>}
    <p className="muted small">Hinweis: Die Sperre schützt vor neugierigen Blicken auf diesem Gerät. Gespeichert wird nur ein Prüfwert (PBKDF2-SHA-256), nicht das Passwort. Passwort vergessen? Dann die Website-Daten im Browser löschen und ein Backup zurückspielen.</p>
  </>);
}

/* ---------- Backup-Verschlüsselung: AES-256-GCM, Schlüssel per PBKDF2-SHA-256 aus dem Passwort ---------- */
const BK_ITER = 310000;
const u8ToB64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64ToU8 = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
async function bkKey(pw, salt, iter) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function encryptBackup(text, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await bkKey(pw, salt, BK_ITER), new TextEncoder().encode(text)));
  return JSON.stringify({ findocu: "backup-enc-v1", cipher: "AES-256-GCM", kdf: "PBKDF2-SHA-256", iter: BK_ITER, salt: u8ToB64(salt), iv: u8ToB64(iv), data: u8ToB64(ct) });
}
async function decryptBackup(j, pw) {
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToU8(j.iv) }, await bkKey(pw, b64ToU8(j.salt), j.iter || BK_ITER), b64ToU8(j.data));
    return new TextDecoder().decode(pt);
  } catch { throw new Error("Passwort falsch oder Datei beschädigt"); }
}

function Settings({ only = "", theme, design, setDesign, themeMode, setThemeMode, importTxs, hideAmounts, setHideAmounts, nav, setNav, deleteAccount, renameCategory, deleteCategory, txs, setTxs, accounts, setAccounts, rules, setRules, setTab, categories, setCategories, budgets, setBudgets, me, setMe, token, setToken, docs, setDocs, saveDoc, purgeDoc, notify }) {
  const [secOrder, setSecOrder] = useState(() => ls.get("settingsOrder", []));
  const [secClosed, setSecClosed] = useState(() => ls.get("settingsClosed", null) ?? ["design", "datenschutz", "import", "nav-tabs", "nav-accounts", "budgets", "meinedaten", "rechnungen", "rechnungsdesign", "mahnwesen", "artikel", "kontaktarten", "docgroups", "doccats", "rules", "trash", "backup", "verbindung"]);
  useEffect(() => {
    const id = ls.get("openSettingsSec", null); if (!id) return; ls.set("openSettingsSec", null);
    setSecClosed((l) => l.filter((x) => x !== id));
    setTimeout(() => document.getElementById("sec-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }, []);
  useEffect(() => ls.set("settingsOrder", secOrder), [secOrder]);
  useEffect(() => ls.set("settingsClosed", secClosed), [secClosed]);
  const secDnd = useDnd((d, over) => setSecOrder((cur) => moveBetween({ s: mergeOrder(cur, SET_IDS) }, "s", d.index, "s", over.index).s));
  const impRef = useRef();
  const [imp, setImp] = useState(null);
  const [health, setHealth] = useState(null);
  const [usage, setUsage] = useState("");
  const [busy, setBusy] = useState(false);
  const importRef = useRef();
  const trash = docs.filter((d) => d.deletedAt);

  useEffect(() => { navigator.storage?.estimate?.().then((e) => setUsage(`${(e.usage / 1048576).toFixed(1)} MB belegt`)); }, [docs.length]);

  const [bkPw, setBkPw] = useState(""), [bkPw2, setBkPw2] = useState(""), [bkPlain, setBkPlain] = useState(false), [bkShow, setBkShow] = useState(false);
  const [bkFile, setBkFile] = useState(null), [bkImpPw, setBkImpPw] = useState("");
  const bkOk = bkPlain || (bkPw.length >= 8 && bkPw === bkPw2);
  async function exportBackup() {
    setBusy(true);
    try {
      const out = [];
      for (const d of docs) { const b = await db.getFile(d.id); out.push({ doc: d, file: b ? await blobToBase64(b) : null }); }
      // alle App-Einstellungen und Firmendaten (Rechnungen, Kunden, Artikel, Verträge, Design …) – ohne Zugangscode und Zwischenstände
      const store = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!BACKUP_SKIP.test(k)) store[k] = localStorage.getItem(k); }
      const plain = JSON.stringify({ version: 5, exported: new Date().toISOString(), categories, nav, budgets, accounts, rules, txs, store, items: out });
      const enc = !bkPlain;
      download(new Blob([enc ? await encryptBackup(plain, bkPw) : plain], { type: "application/json" }),
        `findocu-backup-${todayISO()}${enc ? "-verschluesselt" : ""}.json`);
      if (enc) { setBkPw(""); setBkPw2(""); notify("Verschlüsseltes Backup erstellt – Passwort gut aufbewahren, ohne es ist das Backup nicht lesbar"); }
    } catch (e) { notify("Backup fehlgeschlagen: " + e.message); }
    finally { setBusy(false); }
  }
  async function importBackup(file, pw) {
    setBusy(true);
    try {
      let j = JSON.parse(await file.text());
      if (j.findocu === "backup-enc-v1") {
        if (!pw) { setBkFile(file); setBusy(false); return; }
        j = JSON.parse(await decryptBackup(j, pw)); setBkFile(null); setBkImpPw("");
      }
      let n = 0;
      for (const { doc, file: f } of j.items || []) { if (f) await db.putFile(doc.id, base64ToBlob(f, doc.mimeType)); await db.putDoc(doc); n++; }
      if (j.nav) setNav(j.nav); else if (j.categories) setCategories(j.categories);
      if (j.budgets) setBudgets(j.budgets);
      if (j.accounts) setAccounts(j.accounts);
      if (j.rules) setRules(j.rules);
      if (j.txs) { await db.putTxs(j.txs); setTxs(await db.allTx()); }
      setDocs(await db.allDocs());
      if (j.store) {
        for (const [k, v] of Object.entries(j.store)) if (!BACKUP_SKIP.test(k)) try { localStorage.setItem(k, v); } catch {}
        notify(`${n} Dokumente + Einstellungen, Rechnungen, Kunden importiert – App wird neu geladen`);
        setTimeout(() => location.reload(), 1200); return;
      }
      notify(`${n} Dokumente importiert`);
    } catch (e) { notify("Import fehlgeschlagen: " + e.message); }
    finally { setBusy(false); }
  }

  const sections = {
    "darstellung": <><SetSec id="darstellung" title="Darstellung">
        <TabbarSetting />
        <KLookSetting />
        <div className="themeopts" role="radiogroup" aria-label="Tag- und Nachtmodus">
          {[["auto", "💻", "Automatisch", "wie das Gerät"], ["zeit", "🕖", "Nach Uhrzeit", `Tag ${DAY_FROM}–${DAY_TO} Uhr`], ["light", "☀️", "Tag", "immer hell"], ["dark", "🌙", "Nacht", "immer dunkel"]].map(([k, i, t, sub]) => (
            <button key={k} role="radio" aria-checked={themeMode === k} className={themeMode === k ? "on" : ""} onClick={() => setThemeMode(k)}>
              <span>{i}</span><b>{t}</b><small>{sub}</small>
            </button>
          ))}
        </div>

      </SetSec></>,
    "design": <><SetSec id="design" title="Design"><DesignSettings design={design} setDesign={setDesign} theme={theme} /></SetSec></>,
    "applock": <><SetSec id="applock" title="App-Sperre">
        <AppLockSettings notify={notify} />
      </SetSec></>,
    "datenschutz": <><SetSec id="datenschutz" title="Datenschutz">
        <label className="switchrow">
          <span><b>Geldbeträge anzeigen</b><small className="muted block">Aus = alle Beträge werden als „€ •••“ verdeckt (z. B. wenn jemand mitschaut). Schnell umschalten auch mit dem Augen-Symbol oben rechts.</small></span>
          <input type="checkbox" className="switch" checked={!hideAmounts} onChange={(e) => setHideAmounts(!e.target.checked)} />
        </label>
      </SetSec></>,
    "import": <><SetSec id="import" title="Umsätze importieren">
        <p className="muted small">Kontoauszüge von Banken, Brokern & Co.: CSV · Excel · CAMT · MT940 · OFX · QIF · JSON · Finanzguru · PDF/Foto (per Claude). Doppelte Buchungen werden übersprungen, Kontostände übernommen.</p>
        <input ref={impRef} type="file" accept={IMPORT_ACCEPT} hidden onChange={async (e) => {
          const f = e.target.files[0]; e.target.value = ""; if (!f) return;
          try { setImp({ file: f, result: await parseFile(f, ls.get("mappings", {})) }); } catch (err) { notify("Datei nicht lesbar: " + err.message); }
        }} />
        <button className="btn primary" onClick={() => impRef.current.click()}>⬆︎ Datei auswählen …</button>
        {imp && <ImportSheet imp={imp} accounts={accounts} setAccounts={setAccounts} importTxs={importTxs} token={token} notify={notify} onClose={() => setImp(null)} />}
      </SetSec></>,
    "nav-tabs": <><NavSettings part="tabs" nav={nav} setNav={setNav} accounts={accounts} setAccounts={setAccounts} txs={txs} deleteAccount={deleteAccount} notify={notify} /></>,
    "nav-accounts": <><NavSettings part="accounts" nav={nav} setNav={setNav} accounts={accounts} setAccounts={setAccounts} txs={txs} deleteAccount={deleteAccount} notify={notify} /></>,
    "budgets": <><SetSec id="budgets" title="Budgets pro Monat">
        <p className="muted small">Leer lassen = kein Budget. Ausgaben werden nach Dokumentdatum gezählt.</p>
        {categories.filter((c) => c !== "Sonstiges").map((c) => (
          <div key={c} className="budrow">
            <span>{c}</span>
            <input inputMode="decimal" placeholder="€" value={budgets[c] ?? ""}
              onChange={(e) => { const v = e.target.value.replace(",", "."); setBudgets({ ...budgets, [c]: v === "" ? undefined : Number(v) }); }} />
          </div>
        ))}
      </SetSec></>,
    "meinedaten": <><SetSec id="meinedaten" title="Meine Daten">
        <label>Name<input value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} /></label>
        <label>Firma (für die Trennung Privat/Firma)<input value={me.company || ""} placeholder="z. B. Mustermann e.U." onChange={(e) => setMe({ ...me, company: e.target.value })} /></label>
        <small className="muted block">Dokumente, die an deine Firma gehen oder betrieblich sind, ordnet Claude automatisch „🏢 Firma“ zu – änderbar im Dokument.</small>
        <label>Adresse<textarea rows={2} value={me.address} onChange={(e) => setMe({ ...me, address: e.target.value })} /></label>
        <label>Ort<input value={me.city} onChange={(e) => setMe({ ...me, city: e.target.value })} /></label>
      </SetSec></>,
    "rechnungen": <><SetSec id="rechnungen" title="Rechnungen"><InvoiceSettings me={me} /></SetSec></>,
    "rechnungsdesign": <><SetSec id="rechnungsdesign" title="Rechnungsdesign"><InvoiceDesignSettings /></SetSec></>,
    "mahnwesen": <><SetSec id="mahnwesen" title="Mahnungen"><DunningSettings /></SetSec></>,
    "artikel": <><SetSec id="artikel" title="Artikel"><ArticleSettings /></SetSec></>,
    "kontaktarten": <><SetSec id="kontaktarten" title="Kunden – Kategorien"><ContactTypeSettings /></SetSec></>,
    "doccats": <><DocNavSettings part="cats" nav={nav} setNav={setNav} docs={docs.filter((d) => !d.deletedAt)} renameCategory={renameCategory} deleteCategory={deleteCategory} notify={notify} /></>,
    "docgroups": <><DocNavSettings nav={nav} setNav={setNav} docs={docs.filter((d) => !d.deletedAt)} renameCategory={renameCategory} deleteCategory={deleteCategory} notify={notify} /></>,
    "rules": <>{!!rules.length && (
        <SetSec id="rules" title={`Kategorie-Regeln (${rules.length})`}>
          {rules.map((r) => (
            <div key={r.match} className="frow">
              <div className="grow"><b className="small">„{r.match}“</b><small className="muted block">→ {r.category}</small></div>
              <button className="link red" onClick={() => setRules(rules.filter((x) => x.match !== r.match))}>✕</button>
            </div>
          ))}
        </SetSec>
      )}</>,
    "trash": <><SetSec id="trash" title={`Papierkorb (${trash.length})`}>
        <div className="trashbar">
          <p className="muted small grow">Wird nach {TRASH_DAYS} Tagen automatisch geleert.</p>
          {!!trash.length && <>
            <button className="btn" title="Alle wiederherstellen" onClick={async () => { for (const d of trash) await saveDoc({ ...d, deletedAt: null }); notify(`${trash.length} Dokument(e) wiederhergestellt`); }}>↺ Alle</button>
            <button className="btn danger trashall" title="Papierkorb leeren – alles endgültig löschen"
              onClick={async () => { if (!confirm(`Papierkorb leeren? ${trash.length} Dokument(e) werden endgültig gelöscht.`)) return; const n = trash.length; for (const d of trash) await purgeDoc(d.id); notify(`${n} Dokument(e) endgültig gelöscht`); }}>
              <IcoTrash /> Leeren</button>
          </>}
        </div>
        <ul className="list">
          {trash.map((d) => (
            <li key={d.id} className="static">
              <div className="row1"><span>{d.title}</span></div>
              <div className="actions" style={{ margin: "6px 0 0" }}>
                <button className="btn" onClick={() => saveDoc({ ...d, deletedAt: null })}>Wiederherstellen</button>
                <button className="btn danger" onClick={() => confirm("Endgültig löschen?") && purgeDoc(d.id)}>Endgültig löschen</button>
              </div>
            </li>
          ))}
        </ul>
      </SetSec></>,
    "backup": <><SetSec id="backup" title="Backup">
        <p className="muted small">Das Backup enthält Dokumente, Umsätze, Konten sowie Rechnungen, Kunden, Artikel, Verträge, Firmendaten und alle Einstellungen. Die Daten liegen nur in diesem Browser auf diesem Gerät. Regelmäßig sichern (z. B. in iCloud Drive) – darüber auch auf ein anderes Gerät übertragen.</p>
        <h4 className="bkh">🔒 Verschlüsselt exportieren</h4>
        <p className="muted small">AES-256-GCM, Schlüssel per PBKDF2 mit SHA-256 ({BK_ITER.toLocaleString("de-AT")} Durchläufe) aus deinem Passwort. Ohne Passwort kann niemand – auch nicht FinDocu – das Backup öffnen. <b>Passwort nicht vergessen!</b></p>
        {!bkPlain && <div className="grid2">
          <label>Passwort (mind. 8 Zeichen)<PwInput show={bkShow} setShow={setBkShow} autoComplete="new-password" value={bkPw} onChange={(e) => setBkPw(e.target.value)} /></label>
          <label>Passwort wiederholen<PwInput show={bkShow} setShow={setBkShow} autoComplete="new-password" value={bkPw2} onChange={(e) => setBkPw2(e.target.value)} /></label>
        </div>}
        {!bkPlain && bkPw2 && bkPw !== bkPw2 && <small className="red block">Passwörter stimmen nicht überein</small>}
        {!bkPlain && bkPw2 && bkPw === bkPw2 && <small className={"block " + (bkPw.length >= 8 ? "ok" : "warnc")}>{bkPw.length >= 8 ? "✓ Passwörter stimmen überein" : "Passwörter gleich – aber mindestens 8 Zeichen nötig"}</small>}
        <label className="check"><input type="checkbox" checked={bkPlain} onChange={(e) => setBkPlain(e.target.checked)} /> Ohne Verschlüsselung exportieren (nicht empfohlen)</label>
        <div className="actions">
          <button className="btn primary" disabled={busy || !bkOk} onClick={exportBackup}>⬇︎ Backup exportieren</button>
          <button className="btn" disabled={busy} onClick={() => importRef.current.click()}>⬆︎ Backup importieren</button>
        </div>
        {bkFile && <div className="bkimp">
          <b>🔒 „{bkFile.name}“ ist verschlüsselt</b>
          <label>Passwort<PwInput show={bkShow} setShow={setBkShow} autoFocus value={bkImpPw} onChange={(e) => setBkImpPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && bkImpPw && importBackup(bkFile, bkImpPw)} /></label>
          <div className="actions"><button className="btn primary" disabled={busy || !bkImpPw} onClick={() => importBackup(bkFile, bkImpPw)}>Entschlüsseln &amp; importieren</button><button className="link" onClick={() => { setBkFile(null); setBkImpPw(""); }}>Abbrechen</button></div>
        </div>}
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => { e.target.files[0] && importBackup(e.target.files[0]); e.target.value = ""; }} />
        <p className="muted small">{docs.length} Dokumente · {txs.length} Umsätze · {usage}</p>
        <WipeAll docs={docs.length} txs={txs.length} />
      </SetSec></>,
    "verbindung": <><SetSec id="verbindung" title="Verbindung">
        <label>App-Token (wie APP_TOKEN in Vercel)
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="geheimes Passwort" />
        </label>
        <button className="btn" onClick={async () => {
          try {
            const r = await fetch("/api/health", { headers: { "x-app-token": token } });
            const j = await r.json();
            setHealth(j);
          } catch (e) { setHealth({ error: "Server nicht erreichbar (" + e.message + ")" }); }
        }}>🔌 Verbindung prüfen</button>
        {health && (
          <div className="healthbox">
            {health.error ? <p className="red">✕ {health.error}</p> : <>
              <p className={health.key ? "ok" : "red"}>{health.key ? "✓ Claude-API-Key ist in Vercel hinterlegt" : "✕ ANTHROPIC_API_KEY fehlt in Vercel"}</p>
              <p className={health.tokenOk ? "ok" : "red"}>{!health.tokenRequired ? "⚠︎ Kein APP_TOKEN gesetzt – jeder mit der URL könnte deinen Key nutzen" : health.tokenOk ? "✓ App-Token stimmt" : "✕ App-Token stimmt nicht mit APP_TOKEN in Vercel überein"}</p>
              {(!health.key || (health.tokenRequired && !health.tokenOk)) && <p className="muted small">Vercel → Projekt → Settings → Environment Variables eintragen, danach unter Deployments → ⋯ → Redeploy (neue Variablen gelten erst nach einem neuen Deployment).</p>}
            </>}
          </div>
        )}
      </SetSec></>
  };
  if (only) return <div className="settings onlysec">{sections[only]}</div>;
  const order = mergeOrder(secOrder, SET_IDS).filter((id) => id !== "backup");
  const ctx = { order, collapsed: secClosed, dnd: secDnd,
    toggle: (id) => setSecClosed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])) };
  const allClosed = order.every((id) => secClosed.includes(id));
  return (
    <SetCtx.Provider value={ctx}>
    <div className="settings" data-sec-list={"s|" + order.length}>


      <div className="secbar">
        <small className="muted">Bereiche am Griff ⠿ ziehen zum Sortieren · Titel antippen zum Auf-/Zuklappen</small>
        <button className="link" onClick={() => setSecClosed(allClosed ? [] : order)}>{allClosed ? "Alle aufklappen" : "Alle zuklappen"}</button>
      </div>
      {order.map((id) => <React.Fragment key={id}>{sections[id]}</React.Fragment>)}
      {secDnd.lineAt("sec", "s", order.length) && <div className="dropline" />}
      {secDnd.ghost}
    </div>
    </SetCtx.Provider>
  );
}

/* ---------- Styles ---------- */
/* ======================= Rechnungen (Firma) ======================= */
const KU_NOTE = "Umsatzsteuerbefreit – Kleinunternehmer gemäß § 6 Abs. 1 Z 27 UStG.";
const KU_LIMIT = 55000;
const CO_DEFAULT = {
  name: "", owner: "", street: "", zip: "", city: "", email: "", phone: "", web: "", iban: "", bic: "", bank: "", taxNo: "", uid: "", fn: "", logo: "",
  dueDays: 14, validDays: 30, prefixR: "RE", prefixA: "AN",
  intro: "Vielen Dank für Ihren Auftrag. Ich erlaube mir, folgende Leistungen in Rechnung zu stellen:",
  introA: "Gerne unterbreite ich Ihnen folgendes Angebot:",
  outro: "Bei Fragen stehe ich Ihnen gerne zur Verfügung.",
};
const INTERVALS = { monatlich: 1, vierteljährlich: 3, halbjährlich: 6, jährlich: 12 };
const UNITS = ["Stk", "Std", "Pausch.", "Tag", "km", "m", "m²", "kg", "Monat"];
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + Number(n || 0)); return d.toLocaleDateString("sv-SE"); };
const addMonths = (iso, n) => {
  const d = new Date(iso + "T12:00:00"), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + Number(n || 0));
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toLocaleDateString("sv-SE");
};
const invTotal = (inv) => r2((inv.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0) + (Number(inv.fee) || 0));
const invDue = (inv) => (inv.date ? addDays(inv.date, inv.dueDays ?? 14) : "");
const lastReminder = (inv) => (inv.reminders || [])[(inv.reminders || []).length - 1];
const invDueEff = (inv) => lastReminder(inv)?.due || invDue(inv);
if (typeof document !== "undefined" && !window.__moreCloser) { window.__moreCloser = true; document.addEventListener("click", (e) => document.querySelectorAll("details.more[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; }), true); }
function invState(inv) {
  if (inv.kind === "angebot") return inv.status === "entwurf" ? "entwurf" : inv.status || "offen";
  if (inv.status === "entwurf" || inv.status === "storniert" || inv.status === "bezahlt") return inv.status;
  if (inv.overdue) return "überfällig";
  return daysUntil(invDueEff(inv)) < 0 ? "überfällig" : "offen";
}
const STATE_UI = {
  entwurf: ["Entwurf", "st-draft"], offen: ["Offen", "st-open"], "überfällig": ["Überfällig", "st-over"], bezahlt: ["Bezahlt", "st-paid"],
  storniert: ["Storniert", "st-void"], angenommen: ["Angenommen", "st-paid"], abgelehnt: ["Abgelehnt", "st-void"],
};
const REMIND = ["Zahlungserinnerung", "1. Mahnung", "2. Mahnung", "Letzte Mahnung"];
function nextInvNumber(list, kind, co, date) {
  const pre = (kind === "angebot" ? co.prefixA || "AN" : co.prefixR || "RE") + "-" + (date || todayISO()).slice(0, 4) + "-";
  const max = list.filter((x) => (x.number || "").startsWith(pre)).reduce((m, x) => Math.max(m, parseInt(x.number.slice(pre.length), 10) || 0), 0);
  return pre + String(max + 1).padStart(3, "0");
}
/* Bereich unterhalb eines festen Kopfes: scrollt für sich, wenn genug Platz ist (sonst normal) */
// Kopfbereich beim Scrollen in der Liste einklappen, damit die Liste mehr Platz bekommt
// Ein-/Ausklappen in einem Schritt: Box wächst bzw. schrumpft oben, der Inhalt bleibt an derselben Stelle stehen (kein Springen)
const fineMouse = typeof matchMedia !== "undefined" && matchMedia("(hover:hover) and (pointer:fine)").matches;
const hdrScroll = (e) => {
  if (!fineMouse) return;
  const el = e.currentTarget; if (el._hdrBusy) return;
  const c = document.documentElement.classList, on = c.contains("hdrmin"), t = el.scrollTop;
  const apply = (want) => {
    const top0 = el.getBoundingClientRect().top, h0 = el.offsetHeight;
    c.toggle("hdrmin", want);
    const d = top0 - el.getBoundingClientRect().top;      // > 0 beim Einklappen, < 0 beim Ausklappen
    if (!d) return;
    el.style.maxHeight = Math.max(160, h0 + d) + "px";
    el._hdrBusy = true;
    el.scrollTop = Math.max(0, t - d);
    requestAnimationFrame(() => requestAnimationFrame(() => { el._hdrBusy = false; }));
  };
  if (!on && t > 30) {
    const now = performance.now();
    if (el._hdrD == null || now - (el._hdrDt || 0) > 1500) { // Höhe des Kopfbereichs einmal messen (ohne sichtbare Änderung)
      const a = el.getBoundingClientRect().top; c.add("hdrmin"); const b = el.getBoundingClientRect().top; c.remove("hdrmin");
      el._hdrD = Math.max(0, a - b); el._hdrDt = now;
    }
    if (t > el._hdrD + 24) apply(true);
  } else if (on && t < 8) apply(false);
};
function useHdrReset() { useEffect(() => () => document.documentElement.classList.remove("hdrmin"), []); }
// Handy-Liste als abgerundete Karte mit eigener Scroll-Liste
// Handy: die Seite scrollt nativ (flüssig, mit Schwung) – Titel, Kennzahlen und Knöpfe wandern nach oben weg.
// Die Liste wirkt trotzdem wie eine feste Box: oben eine mitlaufende abgerundete Kante unter der Suchleiste,
// unten eine feste abgerundete Kante 15 px über der Leiste.
function MScroll({ children, extra = "" }) {
  const ref = useRef(null);
  const [cap, setCap] = useState(null), [guard, setGuard] = useState(false);
  useEffect(() => {
    const root = document.documentElement; root.classList.add("mnat");
    // Reiter ohne eigene Suchleiste: schmale schwarze Leiste oben fixieren, damit Safari die Statusleiste nicht grau einfärbt
    setGuard(!ref.current?.closest(".mpage, .ctpage, .invpage, .fbpage, main")?.querySelector(".msticky:not(.mguard)"));
    let raf = 0;
    const calc = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const el = ref.current; if (!el) return;
      const nb = [...document.querySelectorAll("nav.bottom")].find((b) => { const r = b.getBoundingClientRect(); return getComputedStyle(b).position === "fixed" && r.width >= innerWidth * 0.6 && r.top > innerHeight / 2; });
      const navTop = nb ? nb.getBoundingClientRect().top : innerHeight;
      const st = el.parentElement?.querySelector(".msticky:not(.mguard)") || el.closest(".mpage")?.querySelector(".msticky:not(.mguard)") || el.previousElementSibling?.classList?.contains("mguard") && el.previousElementSibling;
      const stk = st ? (st.classList.contains("mguard") ? 12 : Math.round(st.getBoundingClientRect().height)) : 0;
      root.style.setProperty("--navgap", Math.round(innerHeight - navTop) + "px");
      root.style.setProperty("--mstk", stk + "px");
      const r = el.getBoundingClientRect();
      setCap((o) => { const n = { top: Math.round(navTop - 15), left: Math.round(r.left), right: Math.round(innerWidth - r.right) }; return o && o.top === n.top && o.left === n.left && o.right === n.right ? o : n; });
    }); };
    calc();
    addEventListener("resize", calc);
    const ro = new ResizeObserver(calc); ro.observe(document.body); const st = ref.current?.closest(".mpage")?.querySelector(".msticky"); if (st) ro.observe(st);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", calc); ro.disconnect(); root.classList.remove("mnat"); };
  }, []);
  return (<>
    {guard && <div className="msticky mguard" aria-hidden="true" />}
    <div ref={ref} className={"mtxlist mscard mnative" + (extra ? " " + extra : "")}><div className="mcap" aria-hidden="true" />{children}</div>
    {cap && createPortal(<div className="mbotcap" aria-hidden="true" style={{ top: cap.top - 22 }}><i style={{ left: cap.left, right: cap.right }} /></div>, document.body)}
  </>);
}
function FitScroll({ children, className = "", cols, card = false }) {
  const ref = useRef(null);
  const h = useFitHeight(ref, card ? 160 : 200, false, card, 0, card);
  useHdrReset();
  const k = useKLook();
  const phoneW = useMedia("(max-width:700px)");
  if (card && phoneW) return <MScroll extra={"fscard" + (className ? " " + className : "")}>{children}</MScroll>;
  return <div ref={ref} className={"fitscroll" + (card ? " fscard" : "") + (h ? " fit" : "") + (className ? " " + className : "")} style={h ? { maxHeight: h } : undefined} onScroll={card ? hdrScroll : undefined}>
    {k && cols && <div className="khead"><span>{cols[0]}</span><span>{cols[1]}</span><span>{cols[2]}</span></div>}{children}</div>;
}
function useFitHeight(ref, min = 200, force = false, phone = false, phoneMin = 0, lock = false) {
  const [h, setH] = useState(null);
  useEffect(() => {
    let raf = 0;

    const calc = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const el = ref.current; if (!el) return setH(null);
      const top = el.getBoundingClientRect().top + window.scrollY;
      if (lock) {
        // Box fest bis 15 px über den unteren Rand (am Handy: über die Leiste unten), nur der Inhalt scrollt
        const nb = [...document.querySelectorAll("nav.bottom")].find((b) => { const r = b.getBoundingClientRect(); return getComputedStyle(b).position === "fixed" && r.width >= innerWidth * 0.6 && r.top > innerHeight / 2; });
        const limit = (nb ? nb.getBoundingClientRect().top : innerHeight) - 15;
        const fits = Math.floor(limit - top) >= min;
        // Seite nur sperren, wenn die Box ganz hineinpasst – sonst normal scrollen, damit nichts hinter der Leiste verschwindet
        document.documentElement.classList.toggle("fitlock", fits);
        const n = fits ? Math.floor(limit - top) : min;
        return setH((o) => (o === n ? o : n));
      }
      const bar = [...document.querySelectorAll("nav.bottom")].find((b) => b.offsetParent && b.getBoundingClientRect().top < innerHeight - 1);
      const app = document.querySelector(".app"), appPad = app ? parseFloat(getComputedStyle(app).paddingBottom) || 0 : 0;
      const bottom = Math.max(bar ? innerHeight - bar.getBoundingClientRect().top + 8 : 0, appPad + 4);
      const avail = Math.floor(innerHeight - top - bottom - 8);
      setH((o) => { const pm = innerWidth < 700 && phoneMin ? Math.round(innerHeight * phoneMin) : 0;
      const n = innerWidth < 700 && !phone ? null : Math.max(avail, pm) >= min ? Math.max(avail, pm) : force ? Math.max(min, Math.round(innerHeight * 0.62)) : null; return o === n ? o : n; });
    }); };
    calc();
    addEventListener("resize", calc);
    const ro = new ResizeObserver(calc); const root = document.querySelector(".app") || document.body;
    [...root.querySelectorAll(".maincol > :not(.txtable):not(.txscroll)")].forEach((x) => ro.observe(x)); ro.observe(root);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", calc); ro.disconnect(); if (lock) document.documentElement.classList.remove("fitlock"); };
  }, []);
  return h;
}
function useLsState(key, def) {
  const [v, setV] = useState(() => ls.get(key, def));
  const set = (f) => setV((cur) => { const n = typeof f === "function" ? f(cur) : f; ls.set(key, n); return n; });
  return [v, set];
}

/* ---------- PDF (pdf-lib, Standardschrift) ---------- */
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const pdfSafe = (t) => String(t ?? "").replace(/[   ]/g, " ").replace(/[‐‑]/g, "-").split("")
  .map((ch) => (ch.charCodeAt(0) < 256 || WIN_ANSI_EXTRA.includes(ch) ? ch : ch === "\t" ? " " : "?")).join("");
const money = (v) => (Number(v) || 0).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- Rechnungsdesign & Mahnwesen (Einstellungen) ---------- */
const INV_PRESETS = {
  klassisch: { label: "Klassisch", headerBand: false, tableStyle: "linien", totalBox: false, accentTitle: false, showPos: true, showSenderLine: true, logoPos: "rechts" },
  modern: { label: "Modern", headerBand: true, tableStyle: "streifen", totalBox: true, accentTitle: true, showPos: true, showSenderLine: true, logoPos: "links" },
  minimal: { label: "Minimal", headerBand: false, tableStyle: "schlicht", totalBox: false, accentTitle: false, showPos: false, showSenderLine: false, logoPos: "links" },
  elegant: { label: "Elegant", headerBand: false, tableStyle: "linien", totalBox: true, accentTitle: true, showPos: true, showSenderLine: true, logoPos: "mitte", font: "times" },
};
const DESIGN_DEF = { preset: "klassisch", ...INV_PRESETS.klassisch, accent: "#0b63f6", font: "helvetica", logoSize: 56, fontSize: 9.5, titleSize: 17,
  showQR: true, showUnit: true, showFooter: true, showKU: true, showArtNo: true, footerNote: "", titleR: "Rechnung", titleA: "Angebot" };
const invDesign = () => ({ ...DESIGN_DEF, ...ls.get("invoiceDesign", {}) });
const DUN_TEXT = {
  0: "sicher ist es Ihrer Aufmerksamkeit entgangen: Für die Rechnung {nummer} vom {datum} über {betrag} konnten wir bis heute keinen Zahlungseingang feststellen. Wir bitten Sie, den offenen Betrag bis {frist} zu überweisen.",
  1: "leider konnten wir trotz unserer Zahlungserinnerung noch keinen Zahlungseingang für die Rechnung {nummer} vom {datum} feststellen. Wir ersuchen Sie, den offenen Betrag bis {frist} zu begleichen.",
  2: "trotz unserer bisherigen Mahnungen ist die Rechnung {nummer} vom {datum} weiterhin offen. Wir ersuchen Sie dringend, den offenen Betrag bis {frist} zu überweisen.",
  3: "da die Rechnung {nummer} vom {datum} trotz mehrfacher Mahnung weiterhin offen ist, fordern wir Sie letztmalig auf, den offenen Betrag bis {frist} zu bezahlen. Andernfalls sehen wir uns gezwungen, weitere Schritte einzuleiten.",
};
const DUN_DEFAULT = {
  levels: [["Zahlungserinnerung", 7, 0], ["1. Mahnung", 10, 10], ["2. Mahnung", 10, 15], ["Letzte Mahnung", 7, 20]].map(([title, days, fee], i) => ({ id: "l" + i, title, days, fee, text: DUN_TEXT[i] })),
  waitDays: 7, closing: "Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.",
  salutation: "Sehr geehrte Damen und Herren,",
};
const dunning = () => { const d = ls.get("dunning", {}); return { ...DUN_DEFAULT, ...d, levels: d.levels?.length ? d.levels : DUN_DEFAULT.levels }; };
const remindName = (l) => { const lv = dunning().levels; return lv[Math.min(l, lv.length - 1)]?.title || "Mahnung"; };
const fillDun = (t, inv, r) => String(t || "").replace(/\{nummer\}/g, inv.number || "").replace(/\{datum\}/g, fmtDate(inv.date)).replace(/\{betrag\}/g, "€ " + money(invTotal({ ...inv, fee: 0 })))
  .replace(/\{frist\}/g, fmtDate(r.due)).replace(/\{faellig\}/g, fmtDate(invDue(inv))).replace(/\{kunde\}/g, inv.customer?.name || "");
const hexRgb = (h, rgb) => { const m = String(h || "#0b63f6").replace("#", ""); const n = parseInt(m.length === 3 ? m.split("").map((x) => x + x).join("") : m, 16) || 0x0b63f6; return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

/* Rechnung/Mahnung als Vorschau direkt unter der Zeile (wie bei Dokumenten) */
function InvPreview({ x, co, make, name }) {
  const mk = make || (() => buildInvoicePdf(x, co));
  const key = "inv:" + x.id + ":" + JSON.stringify([x.number, x.date, x.status, (x.items || []).length, (x.reminders || []).length, name]);
  const nm = name || invFileName(x);
  return <div className="invprev" onClick={(e) => e.stopPropagation()}>
    <DocPreview key={key} d={{ id: key, title: nm }} getBlob={mk} onPrint={async () => openPdf(await mk(), nm, "", x.customer?.email)} onOriginal={async () => openPdf(await mk(), nm, "", x.customer?.email)} />
  </div>;
}
async function buildInvoicePdf(inv, co, remind = null, design = invDesign()) {
  co = { ...CO_DEFAULT, ...co };
  const D = { ...DESIGN_DEF, ...design };
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const FF = { helvetica: ["Helvetica", "HelveticaBold"], times: ["TimesRoman", "TimesRomanBold"], courier: ["Courier", "CourierBold"] }[D.font] || ["Helvetica", "HelveticaBold"];
  const F = await pdf.embedFont(StandardFonts[FF[0]]), B = await pdf.embedFont(StandardFonts[FF[1]]);
  const W = 595.28, H = 841.89, M = 56, grey = rgb(0.38, 0.4, 0.45), dark = rgb(0.1, 0.11, 0.14), line = rgb(0.82, 0.83, 0.86), white = rgb(1, 1, 1);
  const acc = hexRgb(D.accent, rgb), accSoft = (() => { const c = acc; return rgb(1 - (1 - c.red) * 0.12, 1 - (1 - c.green) * 0.12, 1 - (1 - c.blue) * 0.12); })();
  const fs = Number(D.fontSize) || 9.5;
  let page = pdf.addPage([W, H]);
  const txt = (s, x, y, o = {}) => page.drawText(pdfSafe(s), { x, y, size: o.size || 10, font: o.bold ? B : F, color: o.color || dark });
  const width = (s, o = {}) => (o.bold ? B : F).widthOfTextAtSize(pdfSafe(s), o.size || 10);
  const right = (s, xr, y, o = {}) => txt(s, xr - width(s, o), y, o);
  const wrap = (s, maxW, o = {}) => {
    const out = [];
    for (const para of pdfSafe(s).split("\n")) {
      let cur = "";
      for (const w of para.split(" ")) { const t = cur ? cur + " " + w : w; if (width(t, o) > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
      out.push(cur);
    }
    return out;
  };
  const hr = (y, col = line) => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: col });
  const footer = () => {
    if (!D.showFooter) return;
    hr(62, D.headerBand ? acc : line);
    const cols = [
      [co.name, co.owner && co.owner !== co.name ? co.owner : "", co.street, [co.zip, co.city].filter(Boolean).join(" ")],
      [co.phone && "Tel. " + co.phone, co.email, co.web, co.fn && "FN " + co.fn],
      [co.bank, co.iban && "IBAN " + co.iban, co.bic && "BIC " + co.bic, co.uid ? "UID " + co.uid : co.taxNo && "St.-Nr. " + co.taxNo],
    ].map((c) => c.filter(Boolean));
    const cw = (W - 2 * M) / 3;
    cols.forEach((c, i) => c.slice(0, 4).forEach((l, k) => txt(l, M + i * cw, 50 - k * 9, { size: 7, color: grey })));
    if (D.footerNote) txt(D.footerNote, M, 18, { size: 7, color: grey });
  };

  // Kopf
  if (D.headerBand) page.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: acc });
  const logoH = Math.max(24, Math.min(110, Number(D.logoSize) || 56));
  let logoDrawn = false;
  if (co.logo) {
    try {
      const bytes = Uint8Array.from(atob(co.logo.split(",")[1]), (c) => c.charCodeAt(0));
      const img = co.logo.startsWith("data:image/png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const sc = Math.min(200 / img.width, logoH / img.height), w = img.width * sc, h = img.height * sc;
      const x = D.logoPos === "links" ? M : D.logoPos === "mitte" ? (W - w) / 2 : W - M - w;
      page.drawImage(img, { x, y: H - 40 - h, width: w, height: h }); logoDrawn = true;
      if (D.headerBand && co.name) (D.logoPos === "rechts" ? txt : (s, x2, y2, o) => right(s, W - M, y2, o))(co.name, M, H - 70, { bold: true, size: 15, color: white });
    } catch {}
  }
  if (!logoDrawn && co.name) {
    const o = { bold: true, size: 15, color: D.headerBand ? white : D.accentTitle ? acc : dark };
    if (D.logoPos === "links") txt(co.name, M, H - 70, o); else if (D.logoPos === "mitte") txt(co.name, (W - width(co.name, o)) / 2, H - 70, o); else right(co.name, W - M, H - 70, o);
  }
  if (D.showSenderLine) {
    const sender = [co.name, co.street, [co.zip, co.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
    txt(sender, M, H - 138, { size: 7, color: grey });
    page.drawLine({ start: { x: M, y: H - 142 }, end: { x: M + Math.min(width(sender, { size: 7 }), 240), y: H - 142 }, thickness: 0.4, color: line });
  }
  const c = inv.customer || {};
  let y = H - 158;
  [c.name, ...(c.address || "").split("\n")].filter((l) => l && l.trim()).slice(0, 6).forEach((l, i) => txt(l, M, y - i * 13, { size: fs + 1 }));
  if (c.uid) txt("UID: " + c.uid, M, y - 6 * 13, { size: 8.5, color: grey });

  // Infoblock
  const kindName = remind ? remindName(remind.level) : inv.kind === "angebot" ? D.titleA || "Angebot" : D.titleR || "Rechnung";
  const docWord = inv.kind === "angebot" ? D.titleA || "Angebot" : D.titleR || "Rechnung";
  const flds = ls.get("invoiceFields", []), invF = flds.filter((f) => f.scope === "rechnung" && inv.extra?.[f.id]), posF = flds.filter((f) => f.scope === "position");
  const info = remind
    ? [["Datum", fmtDate(remind.date)], [docWord + " Nr.", inv.number], [docWord + "sdatum", fmtDate(inv.date)], ["Zahlbar bis", fmtDate(remind.due)]]
    : [[docWord + " Nr.", inv.number || "ENTWURF"], [inv.kind === "angebot" ? "Datum" : docWord + "sdatum", fmtDate(inv.date)],
       ...(inv.kind === "angebot" ? [["Gültig bis", fmtDate(addDays(inv.date, inv.validDays ?? co.validDays ?? 30))]]
         : [["Leistung", inv.serviceTo ? `${fmtDate(inv.serviceFrom)} – ${fmtDate(inv.serviceTo)}` : fmtDate(inv.serviceFrom || inv.date)], (inv.status === "bezahlt" || inv.prePaid) ? ["Bezahlt am", fmtDate(inv.paidAt || inv.date)] : ["Zahlbar bis", fmtDate(invDue(inv))]]),
       ...(c.number ? [["Kundennr.", c.number]] : []), ...invF.map((f) => [f.label, inv.extra[f.id]])];
  info.forEach(([k, v], i) => { txt(k, W - M - 190, H - 158 - i * 14, { size: 9, color: grey }); right(v, W - M, H - 158 - i * 14, { size: 9.5, bold: i === 0 }); });

  y = Math.min(H - 270, H - 170 - info.length * 14);
  txt(kindName.toUpperCase(), M, y, { bold: true, size: Number(D.titleSize) || 17, color: D.accentTitle ? acc : dark });
  y -= 24;
  const dun = dunning(), lvl = remind ? dun.levels[Math.min(remind.level, dun.levels.length - 1)] : null;
  const intro = remind ? fillDun(lvl?.text, inv, remind) + (dun.closing ? "\n" + dun.closing : "") : inv.intro ?? (inv.kind === "angebot" ? co.introA : co.intro);
  if (remind) { txt(c.contact ? `Sehr geehrte/r ${c.contact},` : dun.salutation || "Sehr geehrte Damen und Herren,", M, y, { size: fs + 0.5 }); y -= 16; }
  for (const l of wrap(intro || "", W - 2 * M, { size: fs + 0.5 })) { txt(l, M, y, { size: fs + 0.5 }); y -= fs + 4.5; }
  y -= 10;

  // Tabelle
  const showPos = D.showPos, showUnit = D.showUnit && !remind;
  const X = { pos: M, txt: showPos ? M + 28 : M, qty: W - M - (showUnit ? 210 : 170), unit: W - M - 170, price: W - M - 70, sum: W - M };
  const hc = D.tableStyle === "schlicht" ? grey : D.headerBand || D.accentTitle ? acc : grey;
  const head = () => {
    if (D.tableStyle !== "schlicht") page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: D.headerBand || D.accentTitle ? accSoft : rgb(0.95, 0.96, 0.97) });
    const o = { size: 8.5, bold: true, color: hc };
    if (showPos) txt("Pos", X.pos + 4, y, o);
    txt("Bezeichnung", X.txt + (showPos ? 0 : 4), y, o);
    if (!remind) { right("Menge", X.qty + 20, y, o); if (showUnit) txt("Einheit", X.unit, y, o); right("Einzelpreis", X.price, y, o); }
    right("Gesamt", X.sum - 4, y, o);
    if (D.tableStyle === "schlicht") hr(y - 6, dark);
    y -= 22;
  };
  const newPageIfNeeded = (need) => { if (y - need < 120) { footer(); page = pdf.addPage([W, H]); y = H - 70; head(); } };
  head();
  const rows = remind
    ? [{ text: `${docWord} ${inv.number} vom ${fmtDate(inv.date)}, fällig seit ${fmtDate(invDue(inv))}`, qty: 1, unit: "", price: invTotal({ ...inv, fee: 0 }) },
       ...(inv.reminders || []).filter((r) => r.fee).map((r) => ({ text: `Mahnspesen ${remindName(r.level)}`, qty: 1, unit: "", price: Number(r.fee) }))]
    : (inv.items || []).filter((it) => it.text || it.price);
  rows.forEach((it, i) => {
    const tw = (remind ? X.price : X.qty - 40) - X.txt;
    const lines = wrap(it.text || "", tw, { size: fs });
    const ex = remind ? [] : [...(D.showArtNo !== false && it.artNo ? [`Art.-Nr.: ${it.artNo}`] : []), ...posF.filter((f) => it.extra?.[f.id]).map((f) => `${f.label}: ${it.extra[f.id]}`)].flatMap((t) => wrap(t, tw, { size: 8 }));
    const hgt = lines.length * (fs + 2.5) + ex.length * 10;
    newPageIfNeeded(hgt + 8);
    if (D.tableStyle === "streifen" && i % 2 === 1) page.drawRectangle({ x: M, y: y - hgt + fs - 2, width: W - 2 * M, height: hgt + 6, color: rgb(0.965, 0.97, 0.975) });
    if (showPos) txt(String(i + 1), X.pos + 4, y, { size: fs });
    lines.forEach((l, k) => txt(l, X.txt + (showPos ? 0 : 4), y - k * (fs + 2.5), { size: fs }));
    if (!remind) { right(String(it.qty ?? "").replace(".", ","), X.qty + 20, y, { size: fs }); if (showUnit) txt(it.unit || "", X.unit, y, { size: fs }); right(money(it.price), X.price, y, { size: fs }); }
    right(money((Number(it.qty) || 0) * (Number(it.price) || 0)), X.sum - 4, y, { size: fs });
    ex.forEach((l, k) => txt(l, X.txt + (showPos ? 0 : 4), y - lines.length * (fs + 2.5) - k * 10 + 1, { size: 8, color: grey }));
    y -= hgt + 6;
    if (D.tableStyle === "linien") hr(y + 2);
    y -= 10;
  });
  if (D.tableStyle !== "linien") hr(y + 8, D.tableStyle === "schlicht" ? dark : line);
  newPageIfNeeded(90);
  const total = remind ? r2(rows.reduce((s, r) => s + r.qty * r.price, 0)) : invTotal(inv);
  y -= 4;
  const tl = remind ? "Offener Betrag" : "Gesamtbetrag";
  if (D.totalBox) {
    page.drawRectangle({ x: W - M - 230, y: y - 9, width: 230, height: 28, color: acc });
    txt(tl, W - M - 220, y, { bold: true, size: 11, color: white }); right("€ " + money(total), W - M - 10, y, { bold: true, size: 12, color: white });
    y -= 10;
  } else { txt(tl, W - M - 210, y, { bold: true, size: 11 }); right("€ " + money(total), W - M - 4, y, { bold: true, size: 11 }); }
  y -= 16;
  if (D.showKU) txt(KU_NOTE, M, y, { size: 8.5, color: grey });
  y -= 26;

  // Zahlung + QR
  const isPaid = !remind && inv.kind !== "angebot" && (inv.status === "bezahlt" || inv.prePaid);
  if (isPaid) {
    newPageIfNeeded(40);
    page.drawRectangle({ x: M, y: y - 8, width: 260, height: 24, color: rgb(0.86, 0.96, 0.89) });
    txt(`Betrag dankend erhalten${inv.paidAt ? " am " + fmtDate(inv.paidAt) : ""}${inv.payMethod ? " (" + inv.payMethod + ")" : ""}.`, M + 8, y, { size: fs, bold: true, color: rgb(0.08, 0.45, 0.2) });
    y -= 34;
  } else if (inv.kind !== "angebot" && co.iban) {
    newPageIfNeeded(110);
    const ref = inv.number || "";
    if (D.showQR) try {
      const payload = ["BCD", "002", "1", "SCT", (co.bic || "").replace(/\s/g, ""), (co.name || "").slice(0, 70), co.iban.replace(/\s/g, "").toUpperCase(),
        "EUR" + total.toFixed(2), "", "", ref.slice(0, 140)].join("\n");
      const png = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 300 });
      const img = await pdf.embedPng(Uint8Array.from(atob(png.split(",")[1]), (ch) => ch.charCodeAt(0)));
      page.drawImage(img, { x: W - M - 78, y: y - 70, width: 78, height: 78 });
      txt("Zahlen mit Code", W - M - 76, y - 80, { size: 7, color: grey });
    } catch {}
    const pay = [`Bitte überweisen Sie den Betrag bis ${fmtDate(remind ? remind.due : invDue(inv))} auf folgendes Konto:`,
      `${co.name}${co.bank ? " · " + co.bank : ""}`, `IBAN ${co.iban}${co.bic ? " · BIC " + co.bic : ""}`, `Verwendungszweck: ${ref}`];
    pay.forEach((l, i) => txt(l, M, y - i * 14, { size: fs, bold: i === 3 }));
    y -= 70;
  }
  const outro = remind ? "Mit freundlichen Grüßen" : [inv.outro ?? co.outro, "Mit freundlichen Grüßen"].filter(Boolean).join("\n");
  y -= 10;
  for (const l of wrap(outro, W - 2 * M - 100, { size: fs + 0.5 })) { newPageIfNeeded(14); txt(l, M, y, { size: fs + 0.5 }); y -= 14; }
  txt(co.owner || co.name, M, y - 8, { size: fs + 0.5 });
  footer();
  pdf.getPages().forEach((p, i, all) => { if (all.length > 1) p.drawText(`Seite ${i + 1} von ${all.length}`, { x: W - M - 60, y: 72, size: 7, font: F, color: grey }); });
  return new Blob([await pdf.save()], { type: "application/pdf" });
}
const invFileName = (inv, remind) => safeName(`${remind ? remindName(remind.level) : inv.kind === "angebot" ? "Angebot" : "Rechnung"} ${inv.number || "Entwurf"} ${inv.customer?.name || ""}`) + ".pdf";
async function openPdf(blob, name = "Dokument.pdf", title = "", to = "") {
  if (pdfUi) return pdfUi({ blob, name, title: title || name.replace(/\.pdf$/, ""), to });
  const u = URL.createObjectURL(blob); const w = window.open(u, "_blank"); if (!w) location.href = u; setTimeout(() => URL.revokeObjectURL(u), 120000);
}
async function sharePdf(blob, name, title, to = "") {
  const f = new File([blob], name, { type: "application/pdf" });
  if (shareUi) return shareUi({ files: [f], title, docs: [{ title }], to });
  if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title }); } catch {} } else downloadFiles([f]);
}

/* ---------- Firmendaten ---------- */
function CompanyFields({ v, setV }) {
  const f = (k, label, ph = "", type = "text") => <label>{label}<input type={type} value={v[k] ?? ""} placeholder={ph} onChange={(e) => setV({ ...v, [k]: type === "number" ? Number(e.target.value) : e.target.value })} /></label>;
  const logoRef = useRef();
  return (<>
    <fieldset><legend>Unternehmen</legend>
      {f("name", "Firmenname", "z. B. Mustermann e.U.")}{f("owner", "Inhaber/in (Unterschrift)", "z. B. Roland Mustermann")}
      {f("street", "Straße & Nr.")}<div className="grid2">{f("zip", "PLZ")}{f("city", "Ort")}</div>
      <div className="grid2">{f("email", "E-Mail", "", "email")}{f("phone", "Telefon")}</div>
      <div className="grid2">{f("web", "Website")}{f("fn", "Firmenbuchnr. (falls vorhanden)")}</div>
      <div className="grid2">{f("taxNo", "Steuernummer")}{f("uid", "UID-Nr. (nur falls vorhanden)", "ATU…")}</div>
      <div className="logorow">
        {v.logo ? <img src={v.logo} alt="Logo" /> : <span className="muted small">Kein Logo</span>}
        <button className="btn sm" onClick={() => logoRef.current.click()}>{v.logo ? "Logo ändern" : "Logo hochladen"}</button>
        {v.logo && <button className="link red" onClick={() => setV({ ...v, logo: "" })}>Entfernen</button>}
        <input ref={logoRef} type="file" accept="image/png,image/jpeg" hidden onChange={async (e) => {
          const file = e.target.files[0]; e.target.value = ""; if (!file) return;
          const img = await loadImage(file).catch(() => null); if (!img) return alert("Bild konnte nicht gelesen werden");
          const sc = Math.min(1, 600 / img.width, 240 / img.height), cv = document.createElement("canvas");
          cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc); cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          setV({ ...v, logo: cv.toDataURL("image/png") });
        }} />
      </div>
    </fieldset>
    <fieldset><legend>Bankverbindung</legend>
      {f("iban", "IBAN", "AT..")}<div className="grid2">{f("bic", "BIC")}{f("bank", "Bank")}</div>
    </fieldset>
    <fieldset><legend>Vorgaben</legend>
      <div className="grid2">{f("dueDays", "Zahlungsziel (Tage)", "14", "number")}{f("validDays", "Angebote gültig (Tage)", "30", "number")}</div>
      <div className="grid2">{f("prefixR", "Kürzel Rechnungsnummer", "RE")}{f("prefixA", "Kürzel Angebotsnummer", "AN")}</div>
      <label>Einleitung Rechnung<textarea rows={2} value={v.intro} onChange={(e) => setV({ ...v, intro: e.target.value })} /></label>
      <label>Einleitung Angebot<textarea rows={2} value={v.introA} onChange={(e) => setV({ ...v, introA: e.target.value })} /></label>
      <label>Schlusstext<textarea rows={2} value={v.outro} onChange={(e) => setV({ ...v, outro: e.target.value })} /></label>
    </fieldset>
  </>);
}
function CompanyWin({ co, setCo, onClose }) {
  const [v, setV] = useState({ ...CO_DEFAULT, ...co });
  return (
    <Win id="company" onClose={onClose} dirty={JSON.stringify(v) !== JSON.stringify({ ...CO_DEFAULT, ...co })}>
      <div className="panelhead"><b>Firmendaten für Rechnungen</b><button className="btn primary" onClick={() => { setCo(v); onClose(); }}>Speichern</button><XBtn /></div>
      <p className="muted small">Diese Angaben erscheinen auf jeder Rechnung (Pflichtangaben nach § 11 UStG: Name und Anschrift des Unternehmens). Als Kleinunternehmer wird automatisch der Hinweis „{KU_NOTE}“ gedruckt. Auch unter Einstellungen › Rechnungen.</p>
      <CompanyFields v={v} setV={setV} />
    </Win>
  );
}
/* Einstellungen › Rechnungen */
function InvoiceSettings({ me }) {
  const [co, setCo] = useLsState("company", { ...CO_DEFAULT, name: me?.company || "", owner: me?.name || "" });
  const [articles, setArticles] = useLsState("articles", []);
  const [part, setPart] = useState("firma");
  return (<>
    <p className="muted small">Firmendaten, Nummernkreise und Texte für Rechnungen &amp; Angebote (Kleinunternehmer – ohne USt). Änderungen werden sofort gespeichert.</p>
    <div className="seg"><button className={part === "firma" ? "on" : ""} onClick={() => setPart("firma")}>🏢 Firmendaten</button><button className={part === "felder" ? "on" : ""} onClick={() => setPart("felder")}>🧩 Eigene Felder</button></div>
    {part === "firma" ? <CompanyFields v={{ ...CO_DEFAULT, ...co }} setV={setCo} /> : <InvoiceFieldsEditor />}
  </>);
}
/* Einheiten: Standardliste + eigene, über „＋ Neue Einheit …“ in jeder Auswahl erweiterbar */
const UNITS_EVT = "findocu-units";
function useUnits() {
  const [units, setUnitsRaw] = useState(() => ls.get("units", UNITS));
  useEffect(() => { const h = () => setUnitsRaw(ls.get("units", UNITS)); window.addEventListener(UNITS_EVT, h); return () => window.removeEventListener(UNITS_EVT, h); }, []);
  const setUnits = (f) => { const n = typeof f === "function" ? f(ls.get("units", UNITS)) : f; ls.set("units", n); window.dispatchEvent(new Event(UNITS_EVT)); };
  return [units, setUnits];
}
function UnitSelect({ value, onChange, className = "" }) {
  const [units, setUnits] = useUnits();
  const list = units.includes(value) || !value ? units : [...units, value];
  return (
    <select className={className} value={value} onChange={(e) => {
      if (e.target.value !== "__new") return onChange(e.target.value);
      const n = (prompt("Neue Einheit, z. B. „Paket“, „Lfm“, „Liter“:") || "").trim(); if (!n) return;
      if (!units.some((u) => u.toLowerCase() === n.toLowerCase())) setUnits([...units, n]);
      onChange(units.find((u) => u.toLowerCase() === n.toLowerCase()) || n);
    }}>
      {list.map((u) => <option key={u}>{u}</option>)}
      <option value="__new">＋ Neue Einheit …</option>
    </select>
  );
}
function UnitsEditor() {
  const [units, setUnits] = useUnits();
  const [nn, setNn] = useState("");
  const add = () => { const n = nn.trim(); if (n && !units.some((u) => u.toLowerCase() === n.toLowerCase())) setUnits([...units, n]); setNn(""); };
  return (
    <div className="unitsed">
      <small className="muted">Einheiten</small>
      <div className="chips">{units.map((u) => <span key={u} className="chip unitchip">{u}<button title="Entfernen" onClick={() => units.length > 1 && setUnits(units.filter((x) => x !== u))}>×</button></span>)}</div>
      <div className="libadd"><input value={nn} placeholder="Neue Einheit, z. B. Lfm, Paket, Liter" onChange={(e) => setNn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn sm" disabled={!nn.trim()} onClick={add}>Hinzufügen</button>
        <button className="link small" onClick={() => confirm("Einheiten auf Standard zurücksetzen?") && setUnits(UNITS)}>Standard</button></div>
    </div>
  );
}
function InvoiceFieldsEditor() {
  const [fields, setFields] = useLsState("invoiceFields", []);
  const patch = (id, p) => setFields((l) => l.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const dnd = useDnd((d, over) => setFields((l) => moveBetween({ f: l }, "f", d.index, "f", over.index).f));
  return (<>
    <p className="muted small"><b>Rechnung:</b> zusätzliche Angabe im Kopf der Rechnung (z. B. „Projekt“, „Bestellnummer“, „Objekt / Baustelle“). <b>Position:</b> eigenes Feld bei jeder Position und jedem Artikel (z. B. „Artikelnr.“, „Seriennummer“, „Farbe“) – erscheint klein unter der Bezeichnung. Leere Felder werden nicht gedruckt.</p>
    <div data-ifld-list={`f|${fields.length}`}>
      {fields.map((f, i) => (
        <React.Fragment key={f.id}>
          {dnd.lineAt("ifld", "f", i) && <div className="dropline" />}
          <div className={"acccfg catrow" + (dnd.isDragging("ifld", "f", i) ? " dragging" : "")} data-ifld-item={`f|${i}`}>
            <Handle onDown={(e) => dnd.start(e, { kind: "ifld", list: "f", index: i, label: f.label })} />
            <EditText className="grow" value={f.label} onSave={(v) => v && patch(f.id, { label: v })} />
            <select className="chip" value={f.scope} onChange={(e) => patch(f.id, { scope: e.target.value })}><option value="rechnung">Rechnung</option><option value="position">Position</option></select>
            <button className="iconbtn" title="Löschen" onClick={() => confirm(`Feld „${f.label}“ löschen? Bereits eingetragene Werte werden nicht mehr gedruckt.`) && setFields((l) => l.filter((x) => x.id !== f.id))}>🗑</button>
          </div>
        </React.Fragment>
      ))}
      {dnd.lineAt("ifld", "f", fields.length) && <div className="dropline" />}
    </div>
    <div className="actions">
      <button className="btn" onClick={() => setFields((l) => [...l, { id: "f-" + uid(), label: "Neues Feld", scope: "rechnung" }])}>＋ Feld für Rechnung</button>
      <button className="btn" onClick={() => setFields((l) => [...l, { id: "f-" + uid(), label: "Artikelnr.", scope: "position" }])}>＋ Feld für Positionen</button>
    </div>
    {dnd.ghost}
  </>);
}
function ArticlesEditor({ articles, setArticles }) {
  const [fields] = useLsState("invoiceFields", []);
  const posFields = fields.filter((f) => f.scope === "position");
  const patchA = (id, p) => setArticles((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  return (<>
    {!articles.length && <p className="muted small">Noch keine Artikel. Häufige Leistungen hier anlegen oder beim Schreiben einer Rechnung mit ☆ merken.</p>}
    {articles.map((a) => (
      <div key={a.id} className="artrow">
        <input value={a.text} placeholder="Bezeichnung" onChange={(e) => patchA(a.id, { text: e.target.value })} />
        <UnitSelect value={a.unit || "Stk"} onChange={(u) => patchA(a.id, { unit: u })} />
        <input inputMode="decimal" value={a.price ?? ""} placeholder="Preis €" onChange={(e) => patchA(a.id, { price: e.target.value.replace(",", ".") })} />
        <button className="iconbtn" title="Löschen" onClick={() => setArticles((l) => l.filter((x) => x.id !== a.id))}>✕</button>
        {!!posFields.length && <div className="itemextra artextra">{posFields.map((f) => <input key={f.id} value={a.extra?.[f.id] || ""} placeholder={f.label} onChange={(e) => patchA(a.id, { extra: { ...(a.extra || {}), [f.id]: e.target.value } })} />)}</div>}
      </div>
    ))}
    <button className="btn" onClick={() => setArticles((l) => [...l, { id: uid(), text: "", unit: "Std", price: "" }])}>＋ Artikel / Leistung</button>
    <UnitsEditor />
  </>);
}

/* ---------- Kunden & Artikel ---------- */
function MasterDataWin({ articles, setArticles, onClose }) {
  return (
    <Win id="masterdata" onClose={onClose} dirty={false}>
      <div className="panelhead"><b>Artikel &amp; Leistungen</b><XBtn /></div>
      <ArticlesEditor articles={articles} setArticles={setArticles} />
      <p className="muted small">Kunden verwaltest du im Reiter „Kunden“.</p>
    </Win>
  );
}

/* ---------- Editor ---------- */
const PAY_METHODS = ["Überweisung", "Bar", "Bankomat/Karte", "PayPal", "Sonstiges"];
function InvoiceEditor({ inv: init, co, customers, articles, onSave, onClose, onFinalize, setArticles, onPatch, onPayWin, accounts = [], txs = [], book }) {
  const [inv, setInv] = useState(init);
  const [fields] = useLsState("invoiceFields", []);
  const invFields = fields.filter((f) => f.scope === "rechnung"), posFields = fields.filter((f) => f.scope === "position");
  const setEx = (p) => setInv((x) => ({ ...x, extra: { ...(x.extra || {}), ...p } }));
  const [scanPos, setScanPos] = useState(false), [scanMsg, setScanMsg] = useState("");
  const addPos = (it) => setInv((x) => { const items = x.items.filter((i) => i.text || i.price); const same = items.findIndex((i) => it.artNo && i.artNo === it.artNo || it.ean && i.ean === it.ean);
    if (same >= 0) return { ...x, items: items.map((i, k) => (k === same ? { ...i, qty: (Number(i.qty) || 0) + 1 } : i)) };
    return { ...x, items: [...items, it] }; });
  const onScanPos = async (code, fmt) => {
    setScanPos(false);
    const a = articles.find((x) => x.ean && x.ean === code);
    if (a) { addPos({ text: a.text, qty: 1, unit: a.unit, price: a.price, artNo: a.number || "", ean: code, ...(a.extra ? { extra: { ...a.extra } } : {}) }); setScanMsg(`✓ ${a.text} hinzugefügt`); return; }
    setScanMsg(`🔎 Suche ${code} …`);
    try { const d = await lookupProduct(code, fmt); addPos({ text: d.found ? d.name : `Artikel ${code}`, qty: 1, unit: d.unit || "Stk", price: d.price_eur ?? "", ean: code });
      setScanMsg(d.found ? `✓ ${d.name} hinzugefügt – Preis prüfen; mit ☆ als Artikel merken` : `Keine Daten zu ${code} – Bezeichnung und Preis bitte ergänzen`);
    } catch (e) { addPos({ text: `Artikel ${code}`, qty: 1, unit: "Stk", price: "", ean: code }); setScanMsg("Suche nicht möglich: " + e.message); }
  };
  const setItEx = (i, p) => setInv((x) => ({ ...x, items: x.items.map((it, k) => (k === i ? { ...it, extra: { ...(it.extra || {}), ...p } } : it)) }));
  const [saveCust, setSaveCust] = useState(!customers.some((c) => c.name === init.customer?.name));
  const locked = init.status !== "entwurf";
  const set = (p) => setInv((x) => ({ ...x, ...p }));
  const setC = (p) => setInv((x) => ({ ...x, customer: { ...(x.customer || {}), ...p } }));
  const setIt = (i, p) => setInv((x) => ({ ...x, items: x.items.map((it, k) => (k === i ? { ...it, ...p } : it)) }));
  const total = invTotal(inv);
  const warn = [];
  if (!co.name || !co.street || !co.city) warn.push("Firmendaten unvollständig (Name/Anschrift)");
  if (!inv.customer?.name) warn.push("Kunde fehlt");
  if (total > 400 && !(inv.customer?.address || "").trim()) warn.push("Über € 400: Anschrift des Kunden ist Pflicht");
  if (total > 10000 && !inv.customer?.uid) warn.push("Über € 10.000: UID des Kunden ist Pflicht (falls Unternehmer)");
  if (!(inv.items || []).some((it) => it.text && Number(it.price))) warn.push("Mindestens eine Position mit Preis");
  if (inv.kind !== "angebot" && !co.iban) warn.push("IBAN fehlt in den Firmendaten (kein Zahlen-QR-Code)");
  const blocking = warn.filter((w) => !/IBAN|UID/.test(w));
  const isA = inv.kind === "angebot";
  const pick = (name) => { const c = customers.find((x) => x.name === name); if (c) { setC({ name: c.name, address: c.address, uid: c.uid, email: c.email, number: c.number }); setSaveCust(false); } else setC({ name }); };
  const pickArt = (i, text) => { const a = articles.find((x) => x.text === text); setIt(i, a ? { text, unit: a.unit, price: a.price, artNo: a.number || "", ...(a.extra ? { extra: { ...a.extra } } : {}) } : { text, artNo: "" }); };
  const doSave = (final) => {
    const out = { ...inv, items: inv.items.filter((it) => it.text || it.price), updatedAt: new Date().toISOString() };
    onSave(out, saveCust);
    if (final) onFinalize(out);
    onClose();
  };
  return (
    <Win id="invedit" defW={760} onClose={onClose} dirty={!locked && JSON.stringify(inv) !== JSON.stringify(init)}>
      <div className="panelhead"><b>{isA ? "Angebot" : "Rechnung"} {inv.number || "(Entwurf)"}</b>
        <button className="btn" onClick={async () => openPdf(await buildInvoicePdf(inv, co), invFileName(inv), "", inv.customer?.email)}>Vorschau</button>
        {!locked && <button className="btn primary" onClick={() => doSave(false)}>Speichern</button>}
        <XBtn /></div>
      {locked && <p className="warn small">Diese {isA ? "Angebot" : "Rechnung"} ist ausgestellt und kann nicht mehr geändert werden (Rechnungen dürfen nachträglich nicht verändert werden – bei Fehlern stornieren und neu ausstellen).</p>}
      <fieldset disabled={locked}>
        <legend>Kunde</legend>
        <label>Name / Firma<input list="custlist" value={inv.customer?.name || ""} onChange={(e) => pick(e.target.value)} placeholder="Name oder gespeicherten Kunden wählen" /></label>
        <datalist id="custlist">{customers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        <label>Anschrift<textarea rows={3} value={inv.customer?.address || ""} onChange={(e) => setC({ address: e.target.value })} placeholder={"Straße Nr.\nPLZ Ort"} /></label>
        <div className="grid2">
          <label>E-Mail<input value={inv.customer?.email || ""} onChange={(e) => setC({ email: e.target.value })} /></label>
          <label>UID (bei Firmenkunden)<input value={inv.customer?.uid || ""} onChange={(e) => setC({ uid: e.target.value })} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={saveCust} onChange={(e) => setSaveCust(e.target.checked)} /> Kunde merken</label>
      </fieldset>
      <fieldset disabled={locked}>
        <legend>Daten</legend>
        <div className="grid2">
          <label>{isA ? "Angebotsdatum" : "Rechnungsdatum"}<input type="date" value={inv.date} onChange={(e) => set({ date: e.target.value })} /></label>
          {isA ? <label>Gültig (Tage)<input type="number" value={inv.validDays ?? co.validDays} onChange={(e) => set({ validDays: Number(e.target.value) })} /></label>
            : <label>Zahlungsziel (Tage)<input type="number" value={inv.dueDays ?? co.dueDays} onChange={(e) => set({ dueDays: Number(e.target.value) })} /></label>}
        </div>
        {!isA && <div className="grid2">
          <label>Leistung am / ab<input type="date" value={inv.serviceFrom || ""} onChange={(e) => set({ serviceFrom: e.target.value })} /></label>
          <label>Leistung bis (optional)<input type="date" value={inv.serviceTo || ""} onChange={(e) => set({ serviceTo: e.target.value })} /></label>
        </div>}
        {!!invFields.length && <div className="grid2">{invFields.map((f) => <label key={f.id}>{f.label}<input value={inv.extra?.[f.id] || ""} onChange={(e) => setEx({ [f.id]: e.target.value })} /></label>)}</div>}
      </fieldset>
      <fieldset disabled={locked} className="itemsfs">
        <legend>Positionen</legend>
        <datalist id="artlist">{articles.filter((a) => !a.inactive && a.text).map((a) => <option key={a.id} value={a.text}>{[a.number, a.price ? "€ " + money(a.price) + " / " + (a.unit || "") : ""].filter(Boolean).join(" · ")}</option>)}</datalist>
        {inv.items.map((it, i) => (
          <div key={i} className="itemwrap">
          <div className="itemrow">
            <input className="itxt" list="artlist" value={it.text} placeholder="Leistung / Artikel" onChange={(e) => pickArt(i, e.target.value)} />
            <input className="iqty" inputMode="decimal" value={it.qty} onChange={(e) => setIt(i, { qty: e.target.value.replace(",", ".") })} aria-label="Menge" />
            <UnitSelect className="iunit" value={it.unit || "Stk"} onChange={(u) => setIt(i, { unit: u })} />
            <input className="iprice" inputMode="decimal" value={it.price} placeholder="Preis €" onChange={(e) => setIt(i, { price: e.target.value.replace(",", ".") })} aria-label="Einzelpreis" />
            <b className="isum">{fmtMoney((Number(it.qty) || 0) * (Number(it.price) || 0))}</b>
            <span className="iact">
              {it.text && !articles.some((a) => a.text === it.text) && <button type="button" className="iconbtn" title="Als Artikel merken" onClick={() => { const C = artCfg(); const no = C.autoNo ? C.prefix + String(articles.reduce((m, a) => Math.max(m, String(a.number || "").startsWith(C.prefix) ? parseInt(a.number.slice(C.prefix.length), 10) || 0 : 0), 0) + 1).padStart(3, "0") : ""; setArticles((l) => [...l, { id: uid(), text: it.text, unit: it.unit, price: it.price, extra: it.extra, number: no, ean: it.ean || "" }]); setIt(i, { artNo: no }); }}>☆</button>}
              <button type="button" className="iconbtn" title="Position löschen" onClick={() => set({ items: inv.items.filter((_, k) => k !== i) })}>✕</button>
            </span>
          </div>
          {!!posFields.length && <div className="itemextra">{posFields.map((f) => <input key={f.id} value={it.extra?.[f.id] || ""} placeholder={f.label} aria-label={f.label} onChange={(e) => setItEx(i, { [f.id]: e.target.value })} />)}</div>}
          </div>
        ))}
        <div className="posbtns">
          <button type="button" className="btn sm" onClick={() => set({ items: [...inv.items, { text: "", qty: 1, unit: "Stk", price: "" }] })}>＋ Position</button>
          <button type="button" className="btn sm" onClick={() => setScanPos(true)}>📷 Artikel scannen</button>
        </div>
        {scanMsg && <small className="muted block" style={{ marginTop: 6 }}>{scanMsg}</small>}
        <div className="invtotal"><span>Gesamt</span><b>{fmtMoney(total)}</b></div>
        <small className="muted">{KU_NOTE}</small>
      </fieldset>
      <fieldset disabled={locked}>
        <legend>Texte</legend>
        <label>Einleitung<textarea rows={2} value={inv.intro ?? (isA ? co.introA : co.intro)} onChange={(e) => set({ intro: e.target.value })} /></label>
        <label>Schlusstext<textarea rows={2} value={inv.outro ?? co.outro} onChange={(e) => set({ outro: e.target.value })} /></label>
      </fieldset>
      {!isA && init.status !== "storniert" && (() => {
        const paid = locked ? inv.status === "bezahlt" : !!inv.prePaid;
        const setPay = (p) => {
          const next = { paidAt: p.paidAt ?? inv.paidAt ?? todayISO(), payMethod: p.payMethod ?? inv.payMethod ?? "Überweisung" };
          const isPaid = p.paid ?? paid;
          if (locked && isPaid && !paid && onPayWin) { onPayWin(inv); return; }
          if (locked) { const q = { status: isPaid ? "bezahlt" : "offen", paidAt: isPaid ? next.paidAt : null, payMethod: isPaid ? next.payMethod : null }; setInv((x) => ({ ...x, ...q })); onPatch?.(inv.id, q); }
          else set({ prePaid: isPaid, paidAt: isPaid ? next.paidAt : null, payMethod: isPaid ? next.payMethod : null });
        };
        return (
          <fieldset className="payfs">
            <legend>Zahlung</legend>
            <div className="seg">
              <button className={!paid ? "on" : ""} onClick={() => setPay({ paid: false })}>⏳ Offen</button>
              <button className={paid ? "on" : ""} onClick={() => setPay({ paid: true })}>✓ Bezahlt</button>
            </div>
            {paid && <div className="grid2">
              <label>Bezahlt am<input type="date" value={inv.paidAt || todayISO()} onChange={(e) => setPay({ paidAt: e.target.value })} /></label>
              <label>Zahlungsart<select value={inv.payMethod || "Überweisung"} onChange={(e) => setPay({ payMethod: e.target.value })}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
            </div>}
            {paid && !locked && accounts.length > 0 && (
              <label>Auf Konto buchen<select value={inv.prePaidAccount ?? (ls.get("payAccount", "") || accounts.find((x) => x.kind === "bank")?.id || "")} onChange={(e) => {
                const a = accounts.find((x) => x.id === e.target.value);
                set({ prePaidAccount: e.target.value, ...(a?.kind === "cash" ? { payMethod: "Bar" } : inv.payMethod === "Bar" ? { payMethod: "Überweisung" } : {}) });
              }}>
                <option value="">– ohne Buchung –</option>
                {accounts.filter((a) => a.kind !== "broker").map((a) => <option key={a.id} value={a.id}>{a.icon && a.icon !== "none" ? a.icon : kindIcon(a.kind)} {a.name}</option>)}
              </select></label>)}
            {paid && !locked && (inv.prePaidAccount ?? (ls.get("payAccount", "") || accounts.find((x) => x.kind === "bank")?.id || "")) && (() => {
              const accId = inv.prePaidAccount ?? (ls.get("payAccount", "") || accounts.find((x) => x.kind === "bank")?.id || "");
              return (<>
                <div className="seg" style={{ marginTop: 10 }}>
                  <button className={!inv.prePaidTx ? "on" : ""} onClick={() => set({ prePaidTx: null })}>＋ Neue Buchung</button>
                  <button className={inv.prePaidTx ? "on" : ""} onClick={() => set({ prePaidTx: inv.prePaidTx || "pick" })}>🔗 Vorhandene Buchung</button>
                </div>
                {inv.prePaidTx && <TxPicker txs={txs} accountId={accId} amount={invTotal(inv)} number={inv.number} customer={inv.customer?.name} fromDate=""
                  value={inv.prePaidTx === "pick" ? "" : inv.prePaidTx} onChange={(id) => { const t = txs.find((x) => x.id === id); set({ prePaidTx: id, paidAt: t?.date || inv.paidAt }); }} />}
              </>);
            })()}
            {locked && paid && !inv.paidTx && onPayWin && accounts.length > 0 && <button className="btn" style={{ margin: "4px 0 8px" }} onClick={() => onPayWin(inv)}>🔗 Kontobuchung nachträglich zuordnen</button>}
            {locked && paid && inv.paidAccount && <small className="block" style={{ marginBottom: 4 }}>🔗 Gebucht auf „{accounts.find((a) => a.id === inv.paidAccount)?.name || "Konto"}“{inv.paidAmount ? " · " + fmtMoney(inv.paidAmount) : ""}</small>}
            {locked && paid && inv.paidTx && book && (() => { const bd = book.belegOf?.(inv.id); return bd
              ? <div className="belegchip" role="button" tabIndex={0} onClick={() => book.viewBeleg(bd)} title="Rechnung (PDF) ansehen">{bd.thumb ? <img src={bd.thumb} alt="" /> : <span>📄</span>}<span className="grow"><b>📎 Beleg angehängt</b><small className="muted block">{bd.fileName || bd.title}</small></span>
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); book.viewBeleg(bd); }}>Ansehen</button>
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); book.openDoc(bd.id); }} title="In Dokumente öffnen">Dokument</button></div>
              : <button className="btn" style={{ margin: "4px 0 8px" }} onClick={() => book.attach(inv.id, inv.paidTx)}>📎 Rechnung als Beleg an die Buchung hängen</button>; })()}
            <small className="muted">{locked ? (paid ? "Wird sofort gespeichert." : "„Bezahlt“ öffnet das Buchen des Zahlungseingangs.") : paid ? "Beim Ausstellen wird die Rechnung als bezahlt geführt und – falls ein Konto gewählt ist – der Zahlungseingang dort als Einnahme gebucht. Auf dem PDF steht „Betrag dankend erhalten“." : "Zahlungsaufforderung mit Frist und QR-Code wird gedruckt."}</small>
          </fieldset>
        );
      })()}
      {!isA && !locked && (
        <fieldset>
          <legend>Wiederkehrend</legend>
          <label className="check"><input type="checkbox" checked={!!inv.repeat} onChange={(e) => set({ repeat: e.target.checked ? { interval: "monatlich" } : null })} /> Diese Rechnung regelmäßig neu als Entwurf vorbereiten</label>
          {inv.repeat && <label>Intervall<select value={inv.repeat.interval} onChange={(e) => set({ repeat: { interval: e.target.value } })}>{Object.keys(INTERVALS).map((k) => <option key={k}>{k}</option>)}</select></label>}
        </fieldset>
      )}
      {!!warn.length && !locked && <div className="invwarn">{warn.map((w) => <div key={w}>⚠︎ {w}</div>)}</div>}
      {scanPos && createPortal(<CodeScanWin title="Artikel scannen" onClose={() => setScanPos(false)} onResult={onScanPos} />, document.querySelector(".app") || document.body)}
      {!locked && <button className="btn primary wide" disabled={!!blocking.length} onClick={() => doSave(true)}>{isA ? "Angebot ausstellen" : "Rechnung ausstellen"} – Nummer vergeben</button>}
    </Win>
  );
}

/* ---------- Mahnung ---------- */
function RemindWin({ inv, co, onDone, onClose }) {
  const level = Math.min((inv.reminders || []).length, dunning().levels.length - 1);
  const lv = dunning().levels[level] || {};
  const [days, setDays] = useState(Number(lv.days) || 7), [fee, setFee] = useState(Number(lv.fee) ? String(lv.fee) : "");
  const r = { level, date: todayISO(), due: addDays(todayISO(), days), fee: Number(String(fee).replace(",", ".")) || 0 };
  const next = { ...inv, reminders: [...(inv.reminders || []), r] };
  return (
    <Win id="remind" onClose={onClose} small center dirty={false}>
      <div className="panelhead"><b>{remindName(level)}</b><XBtn /></div>
      <p className="small">Rechnung <b>{inv.number}</b> an {inv.customer?.name} über <b>{fmtMoney(invTotal({ ...inv, fee: 0 }))}</b>, fällig seit {fmtDate(invDueEff(inv))} ({-daysUntil(invDueEff(inv))} Tage).</p>
      <div className="grid2">
        <label>Neue Frist (Tage)<input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
        <label>Mahnspesen € (optional)<input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" /></label>
      </div>
      <div className="actions">
        <button className="btn" onClick={async () => openPdf(await buildInvoicePdf(next, co, r), invFileName(inv, r))}>Vorschau</button>
        <button className="btn primary" onClick={async () => { const pdf = await buildInvoicePdf(next, co, r); onDone(next); onClose(); sharePdf(pdf, invFileName(inv, r), remindName(level) + " " + inv.number, inv.customer?.email); }}>Erstellen & senden</button>
      </div>
      <p className="muted small">Wird im Verlauf der Rechnung vermerkt. Das PDF kannst du per Mail, WhatsApp usw. teilen.</p>
    </Win>
  );
}

/* ---------- Buchung eines Kontos suchen (Betrag automatisch vorgefiltert) ---------- */
function TxPicker({ txs = [], accountId, amount, number = "", customer = "", fromDate = "", value, onChange, onConfirm }) {
  const [q, setQ] = useState("");
  const [onlyAmt, setOnlyAmt] = useState(true);
  const [older, setOlder] = useState(false);
  const num = norm(number).replace(/\s/g, ""), cust = norm(customer).split(" ")[0] || "§";
  const base = txs.filter((t) => t.amount > 0 && (!t.invoiceId || t.id === value) && (!accountId || t.accountId === accountId));
  const amtHits = base.filter((t) => Math.abs(t.amount - amount) < 0.01).length;
  const useAmt = onlyAmt && amtHits > 0 && !q;
  const qNum = Number(q.replace(/[€\s.]/g, "").replace(",", "."));
  const list = base
    .filter((t) => older || q || !fromDate || t.date >= addDays(fromDate, -7))
    .filter((t) => !useAmt || Math.abs(t.amount - amount) < 0.01)
    .filter((t) => !q || (qNum && /^[\d.,€\s]+$/.test(q) ? Math.abs(t.amount - qNum) < 0.01 || String(t.amount).startsWith(String(qNum)) : norm(`${t.counterparty} ${t.purpose} ${t.bookingText || ""}`).includes(norm(q))))
    .map((t) => ({ t, score: (Math.abs(t.amount - amount) < 0.01 ? 4 : 0) + (norm(`${t.purpose} ${t.counterparty}`).replace(/\s/g, "").includes(num) && num ? 5 : 0) + (norm(t.counterparty).includes(cust) ? 2 : 0) }))
    .sort((a, b) => b.score - a.score || b.t.date.localeCompare(a.t.date)).slice(0, 40);
  return (
    <div className="txpicker">
      <div className="searchbar"><span>🔍</span><input type="search" value={q} placeholder="Buchung suchen – Name, Text oder Betrag" onChange={(e) => setQ(e.target.value)} /></div>
      <div className="txpfilter">
        {amtHits > 0 && !q && <button className={"chip" + (onlyAmt ? " on" : "")} onClick={() => setOnlyAmt(!onlyAmt)}>Betrag {fmtMoney(amount)} ({amtHits})</button>}
        {fromDate && !q && <button className={"chip" + (older ? " on" : "")} onClick={() => setOlder(!older)}>auch vor {fmtDate(addDays(fromDate, -7))}</button>}
        <small className="muted">{list.length} Eingang{list.length === 1 ? "" : "e"}</small>
      </div>
      <div className="paycands">
        {list.map(({ t, score }) => (
          <div key={t.id} role="radio" aria-checked={value === t.id} tabIndex={0} className={"frow click" + (value === t.id ? " on" : "")}
            onClick={() => onChange(t.id)} onDoubleClick={() => { onChange(t.id); onConfirm?.(t.id); }} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(t.id); } }}>
            <span className={"txradio" + (value === t.id ? " on" : "")} />
            <div className="grow"><b>{t.counterparty || "Eingang"}{score >= 9 ? " ⭐" : ""}</b><small className="muted block">{fmtDate(t.date)} · {(t.purpose || "").slice(0, 80)}</small></div>
            <b className="pos">{fmtMoney(t.amount)}</b>
          </div>))}
        {!list.length && <p className="small muted">Keine passenden Eingänge{accountId ? " auf diesem Konto" : ""}. Suchbegriff ändern, „auch vor …“ antippen oder Umsätze importieren.</p>}
      </div>
    </div>
  );
}

/* ---------- Zahlungseingang verbuchen ---------- */
function PayWin({ inv, book, onDone, onClose }) {
  const accs = (book?.accounts || []).filter((a) => a.kind !== "broker");
  const total = invTotal(inv);
  const lastAcc = ls.get("payAccount", "");
  const [accountId, setAcc] = useState(() => (accs.find((a) => a.id === lastAcc) || accs.find((a) => a.kind === "bank") || accs[0] || {}).id || "");
  const [date, setDate] = useState(inv.paidAt || todayISO()), [amount, setAmount] = useState(String(total).replace(".", ","));
  const [method, setMethod] = useState("Überweisung");
  const acc = accs.find((a) => a.id === accountId);
  useEffect(() => { if (acc?.kind === "cash") setMethod("Bar"); else if (method === "Bar") setMethod("Überweisung"); }, [accountId]);
  const num = (inv.number || "").toLowerCase().replace(/\s/g, "");
  const val = Number(String(amount).replace(/\s/g, "").replace(",", ".")) || 0;
  // passende Eingänge: gleicher Betrag oder Rechnungsnummer im Text, ab Rechnungsdatum, noch nicht verknüpft
  const cands = (book?.txs || []).filter((t) => t.amount > 0 && !t.invoiceId && t.date >= (inv.date || "") && (!accountId || t.accountId === accountId))
    .map((t) => ({ t, score: (Math.abs(t.amount - total) < 0.01 ? 2 : 0) + (`${t.purpose} ${t.counterparty}`.toLowerCase().replace(/\s/g, "").includes(num) ? 3 : 0) + (norm(t.counterparty).includes(norm(inv.customer?.name || "").split(" ")[0] || "§") ? 1 : 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || b.t.date.localeCompare(a.t.date)).slice(0, 6);
  const [mode, setMode] = useState("link");
  let [txId, setTxId] = useState(cands[0]?.t.id || "");
  useEffect(() => { if (!(book?.txs || []).some((t) => t.id === txId && t.accountId === accountId)) setTxId(""); }, [accountId]);
  const done = async (pick) => {
    if (typeof pick === "string") { txId = pick; }
    ls.set("payAccount", accountId);
    let paidTx = null, created = false;
    if (accountId && mode === "create" && val > 0) { paidTx = await book.create({ inv, accountId, date, amount: val, method }); created = true; }
    if (mode === "link" && txId) { paidTx = await book.link(txId, inv); const t = book.txs.find((x) => x.id === txId); if (t) { setDate(t.date); } }
    const t = mode === "link" ? book.txs.find((x) => x.id === txId) : null;
    onDone({ status: "bezahlt", paidAt: t ? t.date : date, payMethod: method, paidAccount: t ? t.accountId : accountId || null, paidTx, paidTxCreated: created, paidAmount: t ? t.amount : val });
    onClose();
  };
  return (
    <Win id="paywin" onClose={onClose} small center dirty={false}>
      <div className="panelhead"><b>Zahlungseingang {inv.number}</b><button className="btn primary" disabled={mode === "link" && accountId ? !txId : false} onClick={() => done()}>{inv.status === "bezahlt" ? "Zuordnen" : "Als bezahlt buchen"}</button><XBtn /></div>
      <p className="small muted">{inv.customer?.name} · Rechnungsbetrag <b>{fmtMoney(total)}</b></p>
      {!accs.length ? <p className="small warn">Noch kein Konto angelegt – die Rechnung wird nur als bezahlt markiert. Konten legst du im Reiter „Konten“ an.</p> : <>
        <label>Konto<select value={accountId} onChange={(e) => setAcc(e.target.value)}>
          {accs.map((a) => <option key={a.id} value={a.id}>{a.icon && a.icon !== "none" ? a.icon : kindIcon(a.kind)} {a.name}</option>)}
          <option value="">– ohne Buchung (nur als bezahlt markieren) –</option>
        </select></label>
        {accountId && <div className="seg" style={{ marginTop: 10 }}>
          <button className={mode === "link" ? "on" : ""} onClick={() => setMode("link")}>🔗 Vorhandene Buchung{cands.length ? ` (${cands.length} passend)` : ""}</button>
          <button className={mode === "create" ? "on" : ""} onClick={() => setMode("create")}>＋ Neue Buchung</button>
        </div>}
        {accountId && mode === "link" && <TxPicker txs={book?.txs} accountId={accountId} amount={total} number={inv.number} customer={inv.customer?.name} fromDate={inv.date} value={txId} onChange={setTxId} onConfirm={done} />}
        {accountId && mode === "create" && <div className="grid2">
          <label>Datum<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Betrag €<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        </div>}
      </>}
      {(mode === "create" || !accountId || !accs.length) && <label>Zahlungsart<select value={method} onChange={(e) => setMethod(e.target.value)}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>}
      {(() => { const st = mode === "link" && accountId ? (book?.txs || []).find((x) => x.id === txId) : null; return (
        <div className="payfoot">
          {mode === "link" && accountId ? (st ? <span className="small"><b>✓ {st.counterparty || "Eingang"}</b> · {fmtDate(st.date)} · <b className="pos">{fmtMoney(st.amount)}</b></span> : <span className="small muted">Buchung oben antippen (Doppelklick bucht sofort)</span>) : <span />}
          <button className="btn primary" disabled={mode === "link" && accountId ? !txId : false} onClick={() => done()}>{mode === "link" && accountId ? (inv.status === "bezahlt" ? "🔗 Buchung verknüpfen" : "🔗 Verknüpfen & als bezahlt buchen") : "✓ Als bezahlt buchen"}</button>
        </div>); })()}
      <p className="muted small">{accountId && mode === "create" ? `Legt auf „${acc?.name}“ eine Einnahme mit Verwendungszweck ${inv.number} an.` : accountId && mode === "link" ? "Die gewählte Buchung wird mit der Rechnung verknüpft (Kategorie Einnahmen)." : ""}</p>
    </Win>
  );
}

/* ---------- Status-Pill mit Menü (Rechnungen + Mahnungen) ---------- */
function StatusMenu({ x, s, book, onPay, onUnpay, onPatch }) {
  const [label, cls] = STATE_UI[s] || [s, ""];
  return (
    <details className="more stmenu" onClick={(e) => e.stopPropagation()}>
      <summary className={"stpill " + cls} title="Status ändern">{label} <span className="stcaret">▾</span></summary>
      <div className="moremenu" onClick={(e) => { if (e.target.closest("button")) e.currentTarget.closest("details").open = false; }}>
        <button className={s === "bezahlt" ? "cur" : ""} onClick={() => s !== "bezahlt" && onPay(x)}>Bezahlt</button>
        <button className={s === "offen" ? "cur" : ""} onClick={async () => { if (s === "bezahlt") await onUnpay(x); onPatch(x.id, { status: "offen", overdue: false }); }}>Offen</button>
        <button className={s === "überfällig" ? "cur" : ""} onClick={async () => { if (s === "bezahlt") await onUnpay(x); onPatch(x.id, { status: "offen", overdue: true }); }}>Überfällig</button>
        {s === "bezahlt" && !x.paidTx && book?.accounts?.length > 0 && <button onClick={() => onPay(x)}>🔗 Buchung zuordnen</button>}
        {s !== "storniert" ? <button className="red" onClick={() => confirm(`Rechnung ${x.number} stornieren? Sie bleibt im Verlauf, zählt aber nicht mehr zum Umsatz.`) && onPatch(x.id, { status: "storniert" })}>Stornieren</button>
          : <button className="cur">Storniert</button>}
      </div>
    </details>
  );
}
const unpayInv = async (x, book, patch) => {
  if (x.paidTx && book) { const created = x.paidTxCreated; await book.unlink(x.paidTx, created ? confirm("Die dabei angelegte Buchung ebenfalls löschen?") : false); }
  patch(x.id, { status: "offen", paidAt: null, paidTx: null, paidTxCreated: false, paidAccount: null, payMethod: null });
};

/* ---------- Seite ---------- */
function InvoicesPage({ me, txs = [], notify, onArchive, setTab, req = 0, book }) {
  const mob = useMobileBeta();
  const [prevInv, setPrevInv] = useState(null);
  const [list, setList] = useLsState("invoices", []);
  const [templates, setTemplates] = useLsState("invoiceTemplates", []);
  const [customers, setCustomers] = useLsState("customers", []);
  const [articles, setArticles] = useLsState("articles", []);
  const [co, setCo] = useLsState("company", { ...CO_DEFAULT, name: me?.company || "", owner: me?.name || "" });
  const [edit, setEdit] = useState(null), [coOpen, setCoOpen] = useState(false), [mdOpen, setMdOpen] = useState(false), [remind, setRemind] = useState(null);
  const [payFor2, setPayFor2] = useState(null);
  const unpay = async (x) => {
    if (x.paidTx && book) { const created = x.paidTxCreated; if (created ? confirm("Die dabei angelegte Buchung ebenfalls löschen?") : true) await book.unlink(x.paidTx, created); else await book.unlink(x.paidTx, false); }
    patch(x.id, { status: "offen", paidAt: null, paidTx: null, paidTxCreated: false, paidAccount: null, payMethod: null });
  };
  const [filter, setFilter] = useState("alle"), [q, setQ] = useState("");
  const coOk = co.name && co.street && co.city;

  // wiederkehrende Rechnungen: fällige Entwürfe anlegen
  useEffect(() => {
    const today = todayISO(); let made = 0; const add = [];
    const tpl = templates.map((t) => {
      if (!t.active) return t; let next = t.next;
      while (next && next <= today && made < 24) {
        const from = next, to = addDays(addMonths(next, INTERVALS[t.interval] || 1), -1);
        add.push({ ...t.inv, id: uid(), kind: "rechnung", status: "entwurf", number: "", date: from, serviceFrom: from, serviceTo: to, fromTemplate: t.id, reminders: [], createdAt: new Date().toISOString() });
        next = addMonths(next, INTERVALS[t.interval] || 1); made++;
      }
      return { ...t, next };
    });
    if (add.length) { setList((l) => [...add, ...l]); setTemplates(tpl); notify?.(`${add.length} wiederkehrende Rechnung${add.length > 1 ? "en" : ""} als Entwurf vorbereitet`); }
  }, []);

  useEffect(() => {
    const pc = ls.get("pendingInvoice", null); if (!pc) return; ls.set("pendingInvoice", null);
    newDoc(pc.kind || "rechnung", pc.customer);
  }, [req]);
  const newDoc = (kind, cust) => setEdit({ id: uid(), kind, status: "entwurf", number: "", date: todayISO(), serviceFrom: todayISO(), dueDays: co.dueDays, validDays: co.validDays,
    customer: cust ? { name: cust.name, address: cust.address || "", uid: cust.uid || "", email: cust.email || "", number: cust.number || "", contact: cust.contact || "" } : { name: "", address: "" }, items: [{ text: "", qty: 1, unit: kind === "angebot" ? "Pausch." : "Std", price: "" }], reminders: [], createdAt: new Date().toISOString() });
  const save = (inv, saveCust) => {
    setList((l) => (l.some((x) => x.id === inv.id) ? l.map((x) => (x.id === inv.id ? inv : x)) : [inv, ...l]));
    if (saveCust && inv.customer?.name) setCustomers((l) => (l.some((c) => c.name === inv.customer.name) ? l : [...l, { id: uid(), ...inv.customer }]));
    if (inv.repeat && !inv.fromTemplate) {
      const t = { id: uid(), name: inv.customer?.name || "Wiederkehrend", interval: inv.repeat.interval, next: addMonths(inv.serviceFrom || inv.date, INTERVALS[inv.repeat.interval]), active: true,
        inv: { ...inv, repeat: null, number: "", status: "entwurf", reminders: [] } };
      setTemplates((l) => [...l, t]); setList((l) => l.map((x) => (x.id === inv.id ? { ...x, repeat: null, fromTemplate: t.id } : x)));
      notify?.(`Wiederkehrend: nächster Entwurf am ${fmtDate(t.next)}`);
    }
  };
  const finalize = (inv) => {
    const accId = inv.prePaid ? (inv.prePaidAccount ?? (ls.get("payAccount", "") || book?.accounts.find((x) => x.kind === "bank")?.id || "")) : "";
    finalizeList(inv);
    if (accId && book && inv.kind === "rechnung" && book.accounts.some((a) => a.id === accId)) {
      setTimeout(async () => {
        const cur = ls.get("invoices", []).find((x) => x.id === inv.id) || inv;
        ls.set("payAccount", accId);
        if (cur.prePaidTx === "pick") return;
        if (cur.prePaidTx) {
          const t = book.txs.find((x) => x.id === cur.prePaidTx); await book.link(cur.prePaidTx, cur);
          patch(inv.id, { paidTx: cur.prePaidTx, paidTxCreated: false, paidAccount: t?.accountId || accId, paidAmount: t?.amount, paidAt: t?.date || cur.paidAt });
        } else {
          const txId = await book.create({ inv: cur, accountId: accId, date: cur.paidAt || cur.date, amount: invTotal(cur), method: cur.payMethod });
          patch(inv.id, { paidTx: txId, paidTxCreated: true, paidAccount: accId, paidAmount: invTotal(cur) });
        }
      }, 50);
    }
  };
  const finalizeList = (inv) => setList((l) => {
    const number = nextInvNumber(l, inv.kind, co, inv.date);
    notify?.(`${inv.kind === "angebot" ? "Angebot" : "Rechnung"} ${number} ausgestellt`);
    return l.map((x) => (x.id === inv.id ? { ...x, number, status: x.prePaid && x.kind === "rechnung" ? "bezahlt" : "offen", paidAt: x.prePaid ? x.paidAt || x.date : x.paidAt, issuedAt: new Date().toISOString() } : x));
  });
  const patch = (id, p) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const toInvoice = (a) => { patch(a.id, { status: "angenommen" }); setEdit({ ...a, id: uid(), kind: "rechnung", status: "entwurf", number: "", date: todayISO(), serviceFrom: todayISO(), fromOffer: a.number, intro: undefined, dueDays: co.dueDays, reminders: [] }); };
  const copyAsNew = (x) => setEdit({ ...x, id: uid(), status: "entwurf", number: "", date: todayISO(), reminders: [], paidAt: null, fromOffer: null });

  // Zahlungseingang in Kontobuchungen erkennen (Betrag gleich + Nummer im Verwendungszweck)
  const payFor = (inv) => {
    if (inv.kind !== "rechnung" || !inv.number || invState(inv) === "bezahlt" || invState(inv) === "entwurf") return null;
    const tot = invTotal({ ...inv, fee: 0 }), num = inv.number.toLowerCase().replace(/\s/g, "");
    return txs.find((t) => t.amount > 0 && t.date >= inv.date && (Math.abs(t.amount - tot) < 0.01 || Math.abs(t.amount - invTotal(inv)) < 0.01) && `${t.purpose} ${t.counterparty}`.toLowerCase().replace(/\s/g, "").includes(num));
  };

  const year = todayISO().slice(0, 4);
  const inv = list.filter((x) => x.kind === "rechnung");
  const st = (x) => invState(x);
  const sumOf = (l) => l.reduce((s, x) => s + invTotal(x), 0);
  const openL = inv.filter((x) => ["offen", "überfällig"].includes(st(x))), overL = inv.filter((x) => st(x) === "überfällig");
  const yearRev = sumOf(inv.filter((x) => !["entwurf", "storniert"].includes(st(x)) && (x.date || "").startsWith(year)));
  const paidYear = sumOf(inv.filter((x) => st(x) === "bezahlt" && (x.paidAt || x.date || "").startsWith(year)));
  const FILTERS = [["alle", "Alle"], ["entwurf", "Entwürfe"], ["offen", "Offen"], ["überfällig", "Überfällig"], ["bezahlt", "Bezahlt"], ["angebote", "Angebote"], ["wiederkehrend", "Wiederkehrend"]];
  const cnt = (k) => (k === "alle" ? list.length : k === "angebote" ? list.filter((x) => x.kind === "angebot").length : k === "wiederkehrend" ? templates.length : inv.filter((x) => st(x) === k).length);
  const shown = list.filter((x) => (filter === "alle" ? true : filter === "angebote" ? x.kind === "angebot" : x.kind === "rechnung" && st(x) === filter))
    .filter((x) => !q || norm(`${x.number} ${x.customer?.name} ${(x.items || []).map((i) => i.text).join(" ")}`).includes(norm(q)))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.number || "").localeCompare(a.number || ""));

  return (
    <div className="invpage">
      {mob ? (
      <div className="mpage">
        {!coOk && <div className="healthbox"><b>Zuerst Firmendaten eintragen</b><button className="btn primary" onClick={() => setCoOpen(true)}>Firmendaten</button></div>}
        <MStats items={[{ label: "Offen", value: fmtMoney(sumOf(openL)), sub: `${openL.length} Rechnung${openL.length === 1 ? "" : "en"}`, onClick: () => setFilter("offen") },
          { label: "Überfällig", value: fmtMoney(sumOf(overL)), vcls: overL.length ? "neg" : "", alert: !!overL.length, sub: `${overL.length} Rechnung${overL.length === 1 ? "" : "en"}`, onClick: () => setFilter("überfällig") },
          { label: `Bezahlt ${year}`, value: fmtMoney(paidYear), vcls: "pos", onClick: () => setFilter("bezahlt") }, { label: `Umsatz ${year}`, value: fmtMoney(yearRev) }]} />
        <MActs items={[{ label: "＋ Rechnung", primary: true, run: () => newDoc("rechnung") }, { label: "＋ Angebot", run: () => newDoc("angebot") }, { label: "🏢 Firma", run: () => setCoOpen(true) }, setTab && { label: "📮 Mahnungen", run: () => setTab("mahnungen") }]} />
        <MBar q={q} setQ={setQ} placeholder="Nummer, Kunde, Leistung suchen" chips={FILTERS.map(([k, l]) => [k, l, cnt(k), filter === k, () => setFilter(k)])} />
        <MScroll>
          {filter === "wiederkehrend" ? (<>
            {!templates.length && <MEmpty>Keine wiederkehrenden Rechnungen. Beim Erstellen einer Rechnung „wiederkehrend“ wählen.</MEmpty>}
            {templates.map((t) => <MItem key={t.id} icon={<MIco e="🔁" />} title={t.name} sub={`${t.interval} · nächster Entwurf ${fmtDate(t.next)}`} amount={fmtMoney(invTotal(t.inv || {}))} dim={!t.active}
              pill={<button className={"stpill " + (t.active ? "st-paid" : "st-draft")} onClick={(e) => { e.stopPropagation(); setTemplates((l) => l.map((y) => (y.id === t.id ? { ...y, active: !y.active } : y))); }}>{t.active ? "aktiv" : "pausiert"}</button>} />)}
          </>) : (<>
            {!shown.length && <MEmpty>{list.length ? "Keine Treffer." : "Noch keine Rechnungen – mit „＋ Rechnung“ starten."}</MEmpty>}
            {mGroup(shown, (x) => (x.date || "").slice(0, 7)).map(([m, l]) => (
              <React.Fragment key={m}>
                <MHead right={fmtMoney(sumOf(l))}>{m ? monthLabel(m) : "Ohne Datum"}</MHead>
                {l.map((x) => { const sx = x.kind === "angebot" ? (x.status || "offen") : st(x), ui = STATE_UI[sx] || [sx, ""]; const payable = x.kind === "rechnung" && ["offen", "überfällig"].includes(sx); return (
                  <MItem key={x.id} icon={x.kind === "angebot" ? <MIco e="📝" /> : <MAvatar text={x.customer?.name} />} title={x.customer?.name || "Ohne Kunde"}
                    tags={[x.kind === "angebot" && "Angebot"]} sub={`${x.number || "Entwurf"} · ${fmtDate(x.date)}${payable ? " · fällig " + fmtDate(invDueEff(x)) : ""}`}
                    amount={fmtMoney(invTotal(x))} amountCls={sx === "bezahlt" ? "in" : sx === "überfällig" ? "neg" : ""} pill={<span className={"stpill " + ui[1]}>{ui[0]}</span>}
                    onClick={() => setEdit(x)}
                    swipe={{ left: [x.number && { icon: "👁", label: "Vorschau", bg: "#0ea5e9", run: () => setPrevInv(prevInv === x.id ? null : x.id) }, { icon: "⧉", label: "Kopie", bg: "#8b5cf6", run: () => copyAsNew(x) }],
                      right: [payable && { icon: "✓", label: "Bezahlt", bg: "#16a34a", run: () => setPayFor2(x) }, sx === "überfällig" && { icon: "📮", label: "Mahnen", bg: "#ef4444", run: () => setRemind(x) }] }}
                    after={prevInv === x.id && <InvPreview x={x} co={co} />} />); })}
              </React.Fragment>
            ))}
          </>)}
        </MScroll>
      </div>
      ) : (<>
      {!coOk && <div className="healthbox"><b>Zuerst Firmendaten eintragen</b><p className="small muted">Name, Anschrift, Bankverbindung und Logo erscheinen auf jeder Rechnung.</p><button className="btn primary" onClick={() => setCoOpen(true)}>Firmendaten eintragen</button></div>}
      <div className="invstats">
        <div className="tile"><small className="muted">Offen</small><b>{fmtMoney(sumOf(openL))}</b><small className="muted">{openL.length} Rechnung{openL.length === 1 ? "" : "en"} (inkl. überfällig)</small></div>
        <div className={"tile" + (overL.length ? " alert" : "")}><small className="muted">Überfällig</small><b className={overL.length ? "neg" : ""}>{fmtMoney(sumOf(overL))}</b><small className="muted">{overL.length} Rechnung{overL.length === 1 ? "" : "en"}</small></div>
        <div className="tile"><small className="muted">Bezahlt {year}</small><b className="pos">{fmtMoney(paidYear)}</b><small className="muted">eingegangen</small></div>
        <div className="tile"><small className="muted">Umsatz {year} · Kleinunternehmergrenze</small><b>{fmtMoney(yearRev)}</b>
          <div className="kubar"><i style={{ width: Math.min(100, (yearRev / KU_LIMIT) * 100) + "%", background: yearRev > KU_LIMIT * 0.9 ? "var(--red)" : yearRev > KU_LIMIT * 0.75 ? "#f59e0b" : "var(--acc)" }} /></div>
          <small className="muted">{Math.round((yearRev / KU_LIMIT) * 100)} % von € 55.000 (netto/Jahr)</small></div>
      </div>
      <div className="invbar">
        <button className="btn primary" onClick={() => newDoc("rechnung")}>＋ Rechnung</button>
        <button className="btn" onClick={() => newDoc("angebot")}>＋ Angebot</button>
        <span className="grow" />
        <button className="btn" onClick={() => setTab?.("kunden")}>👥 Kunden</button>
        <button className="btn" onClick={() => (setTab ? setTab("artikel") : setMdOpen(true))}>📦 Artikel</button>
        <button className="btn" onClick={() => setTab?.("mahnungen")}>📮 Mahnungen</button>
        <button className="btn" onClick={() => setCoOpen(true)}>🏢 Firmendaten</button>
        <ExportMenu className="btn" items={[
          { head: `${inv.length} Rechnungen · ${list.length - inv.length} Angebote` },
          { label: "📒 Rechnungsausgangsbuch Excel", sub: "alle Rechnungen und Angebote mit Status", run: () => downloadXlsx(`Rechnungsausgangsbuch-${isoToday()}.xlsx`, [{ name: "Rechnungen", head: INV_HEAD, rows: list.filter((x) => x.kind === "rechnung").map(invRow) }, { name: "Angebote", head: INV_HEAD, rows: list.filter((x) => x.kind === "angebot").map(invRow) }]) },
          { label: "📄 Rechnungsausgangsbuch CSV", run: () => downloadCsv(`Rechnungsausgangsbuch-${isoToday()}.csv`, INV_HEAD, list.filter((x) => x.kind === "rechnung").map(invRow)) },
          { label: "📮 Offene Posten PDF", run: async () => saveBlob(await openItemsPdf(list), `Offene-Posten-${isoToday()}.pdf`) },
          { label: "📮 Offene Posten CSV", run: () => downloadCsv(`Offene-Posten-${isoToday()}.csv`, OP_HEAD, openList(list).map(opRow)) },
          { label: `🗂 Rechnungen ${year} als PDF (ZIP)`, run: async () => { const l = list.filter((x) => x.kind === "rechnung" && x.number && invState(x) !== "entwurf" && (x.date || "").startsWith(year)); const files = []; for (const x of l) files.push({ name: invFileName(x), data: await buildInvoicePdf(x, co) }); saveBlob(await zipBlob(files), `Rechnungen-${year}.zip`); } }]} />
      </div>
      <div className="searchbar"><span>🔍</span><input type="search" placeholder="Nummer, Kunde, Leistung suchen" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="chips invfilter">{FILTERS.map(([k, l]) => <button key={k} className={"chip" + (filter === k ? " on" : "")} onClick={() => setFilter(k)}>{l} <small>({cnt(k)})</small></button>)}</div>

      <FitScroll card className="kinv" cols={["Kunde", "Nummer · Datum", "Betrag · Status"]}>
      {filter === "wiederkehrend" ? (
        <section className="tile">
          {!templates.length && <p className="muted small">Noch keine wiederkehrenden Rechnungen. Beim Erstellen einer Rechnung „Wiederkehrend“ anhaken – FinDocu legt dann zum Termin automatisch einen Entwurf an, den du nur noch prüfst und ausstellst.</p>}
          {templates.map((t) => (
            <div key={t.id} className="frow">
              <span className="caticon" style={{ width: 40, height: 40, background: "#0b63f622" }}>🔁</span>
              <div className="grow"><b>{t.name}</b><small className="muted block">{t.interval} · {fmtMoney(invTotal(t.inv))} · nächster Entwurf {fmtDate(t.next)}{t.active ? "" : " · pausiert"}</small></div>
              <select className="chip" value={t.interval} onChange={(e) => setTemplates((l) => l.map((x) => (x.id === t.id ? { ...x, interval: e.target.value } : x)))}>{Object.keys(INTERVALS).map((k) => <option key={k}>{k}</option>)}</select>
              <button className="btn sm" onClick={() => setTemplates((l) => l.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)))}>{t.active ? "Pausieren" : "Fortsetzen"}</button>
              <button className="iconbtn" title="Löschen" onClick={() => confirm("Wiederkehrende Rechnung löschen? Bereits erstellte Rechnungen bleiben.") && setTemplates((l) => l.filter((x) => x.id !== t.id))}>🗑</button>
            </div>
          ))}
        </section>
      ) : (
        <section className="tile invlist">
          {!shown.length && <p className="muted small">{list.length ? "Keine Einträge für diesen Filter." : "Noch keine Rechnungen. Mit „＋ Rechnung“ legst du die erste an – die Nummer wird beim Ausstellen fortlaufend vergeben."}</p>}
          {shown.map((x) => {
            const s = st(x), [label, cls] = STATE_UI[s] || [s, ""], pay = payFor(x);
            return (<React.Fragment key={x.id}>
              <div className={"invrow" + (prevInv === x.id ? " prevopen" : "")} onClick={() => setEdit(x)}>
                <div className="invmain">
                  <div className="row1"><b className="invname" title="Vorschau ein-/ausblenden" onClick={(e) => { e.stopPropagation(); setPrevInv(prevInv === x.id ? null : x.id); }}>{x.customer?.name || "Ohne Kunde"}</b></div>
                  <small className="muted block">
                    {x.kind === "angebot" ? "Angebot " : ""}{x.number || "Entwurf"} · {fmtDate(x.date)}
                    {x.kind === "rechnung" && !["entwurf", "bezahlt", "storniert"].includes(s) && ` · fällig ${fmtDate(invDueEff(x))}`}
                    {s === "bezahlt" && x.paidAt && ` · bezahlt ${fmtDate(x.paidAt)}${x.payMethod ? " (" + x.payMethod + ")" : ""}${x.paidAccount && book ? " → " + (book.accounts.find((a) => a.id === x.paidAccount)?.name || "Konto") : ""}`}
                    {(x.reminders || []).length > 0 && ` · ${remindName(lastReminder(x).level)} ${fmtDate(lastReminder(x).date)}`}
                    {x.fromOffer && ` · aus ${x.fromOffer}`}{x.fromTemplate && " · 🔁"}
                  </small>
                  {pay && <button className="link pos small" onClick={async (e) => { e.stopPropagation(); if (book) await book.link(pay.id, x); patch(x.id, { status: "bezahlt", paidAt: pay.date, paidTx: pay.id, paidAccount: pay.accountId, payMethod: "Überweisung" }); }}>💡 Zahlungseingang vom {fmtDate(pay.date)} gefunden – als bezahlt markieren</button>}
                </div>
                <b className="invamt">{fmtMoney(invTotal(x))}</b>
            {!(x.kind === "rechnung" && s !== "entwurf") && <span className={"stpill " + cls}>{label}</span>}
                <div className="invacts" onClick={(e) => e.stopPropagation()}>
                  {s !== "entwurf" && <button className="iconbtn" title="PDF ansehen / drucken" onClick={async () => openPdf(await buildInvoicePdf(x, co), invFileName(x), "", x.customer?.email)}><IcoEye /></button>}
                  {s !== "entwurf" && <button className="iconbtn" title="Teilen (Mail, WhatsApp …)" onClick={async () => sharePdf(await buildInvoicePdf(x, co), invFileName(x), `${x.kind === "angebot" ? "Angebot" : "Rechnung"} ${x.number}`, x.customer?.email)}><IcoShare /></button>}
                  {s === "überfällig" && <button className="btn sm danger" onClick={() => setRemind(x)}>{remindName((x.reminders || []).length)}</button>}
                  {x.kind === "angebot" && s === "offen" && <><button className="btn sm" onClick={() => toInvoice(x)}>→ Rechnung</button><button className="link small" onClick={() => patch(x.id, { status: "abgelehnt" })}>Abgelehnt</button></>}
                  {x.kind === "rechnung" && s !== "entwurf" && <StatusMenu x={x} s={s} book={book} onPay={setPayFor2} onUnpay={unpay} onPatch={patch} />}
                  <details className="more"><summary className="iconbtn morebtn" title="Mehr"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></summary>
                    <div className="moremenu">
                      <button onClick={() => copyAsNew(x)}>Als neue {x.kind === "angebot" ? "Angebot" : "Rechnung"} kopieren</button>
                      {s !== "entwurf" && onArchive && <button onClick={async () => { await onArchive(await buildInvoicePdf(x, co), invFileName(x), x); }}>In Dokumente ablegen</button>}
                      {s === "entwurf" && <button className="red" onClick={() => confirm("Entwurf löschen?") && setList((l) => l.filter((y) => y.id !== x.id))}>Entwurf löschen</button>}
                    </div>
                  </details>
                </div>
              </div>
              {prevInv === x.id && <InvPreview x={x} co={co} />}
            </React.Fragment>);
          })}
        </section>
      )}
      </FitScroll>
      </>)}
      {edit && <InvoiceEditor book={book} accounts={book?.accounts || []} txs={book?.txs || []} onPayWin={book ? (x) => { setEdit(null); setPayFor2(x); } : null} onPatch={(id, p) => { patch(id, p); setEdit((e) => (e ? { ...e, ...p } : e)); }} inv={edit} co={co} customers={customers} articles={articles} setArticles={setArticles} onSave={save} onFinalize={finalize} onClose={() => setEdit(null)} />}
      {coOpen && <CompanyWin co={co} setCo={setCo} onClose={() => setCoOpen(false)} />}
      {mdOpen && <MasterDataWin articles={articles} setArticles={setArticles} onClose={() => setMdOpen(false)} />}
      {remind && <RemindWin inv={remind} co={co} onClose={() => setRemind(null)} onDone={(n) => patch(n.id, { reminders: n.reminders })} />}
      {payFor2 && <PayWin inv={payFor2} book={book} onClose={() => setPayFor2(null)} onDone={(p) => patch(payFor2.id, p)} />}
    </div>
  );
}

/* ======================= Verträge (hinterlegt, Privat & Firma) ======================= */
const CT_CATS = { Internet: "🌐", Handy: "📱", "Strom & Gas": "⚡", Versicherung: "🛡️", Miete: "🏠", "Leasing & Kredit": "🚗", "Streaming & Abos": "🎬", Software: "💻", Fitness: "🏋️", Sonstiges: "📄" };
const ctCats = () => ({ ...CT_CATS, ...ls.get("ctCats", {}) });
const CT_FACTOR = { monatlich: 1, vierteljährlich: 1 / 3, halbjährlich: 1 / 6, jährlich: 1 / 12 };
// nächstes Vertragsende und letzter Kündigungstag
function contractDlDocs(list, docs) {
  const today = todayISO();
  return (list || []).filter((c) => !c.cancelledAt).map((c) => ({ c, d: ctDates(c) }))
    .filter(({ d }) => d.cancelBy && !d.open && !(d.end && d.end < today))
    .filter(({ c, d }) => !docs.some((x) => (c.docIds || []).includes(x.id) && (x.deadlines || []).some((y) => y.date === d.cancelBy)))
    .map(({ c, d }) => ({ id: "ct:" + c.id, isContract: true, ctId: c.id, title: "Vertrag " + (c.name || c.provider || "") + (c.provider && c.name && c.provider !== c.name ? " · " + c.provider : ""),
      sender: c.provider || "", category: "Verträge", docType: "Vertrag", direction: "keine", amount: null,
      deadlines: [{ id: "ctdl-" + c.id + "-" + d.cancelBy, date: d.cancelBy, label: "Kündigung bis" + (d.end ? " (Ende " + fmtDate(d.end) + ")" : ""), done: (c.dlDone || []).includes(d.cancelBy) }] }));
}
function ctDates(c) {
  if (c.cancelledAt) return { end: c.cancelledEnd || "", cancelBy: "" };
  if (!c.start) return { end: c.end || "", cancelBy: c.end && c.notice ? addMonthsOrWeeks(c.end, -c.notice, c.noticeUnit) : "" };
  let end = c.end || addDays(addMonths(c.start, Number(c.minMonths) || 0), -1);
  const ren = Number(c.renewMonths) || 0, n = Number(c.notice) || 0, today = todayISO();
  if (!(Number(c.minMonths) || c.end)) end = "";
  let cancelBy = end && n ? addMonthsOrWeeks(addDays(end, 1), -n, c.noticeUnit, -1) : end;
  let guard = 0;
  while (end && ren && (cancelBy || end) < today && guard++ < 200) {
    end = addDays(addMonths(addDays(end, 1), ren), -1);
    cancelBy = n ? addMonthsOrWeeks(addDays(end, 1), -n, c.noticeUnit, -1) : end;
  }
  if (!end && n) { // unbefristet: Kündigung jederzeit mit Frist (zum Monatsende)
    const e = new Date(addMonthsOrWeeks(today, n, c.noticeUnit) + "T12:00:00"); const last = new Date(e.getFullYear(), e.getMonth() + 1, 0);
    return { end: last.toLocaleDateString("sv-SE"), cancelBy: today, open: true };
  }
  return { end, cancelBy };
}
function addMonthsOrWeeks(iso, n, unit, plusDays = 0) { const r = unit === "Wochen" ? addDays(iso, n * 7) : unit === "Tage" ? addDays(iso, n) : addMonths(iso, n); return plusDays ? addDays(r, plusDays) : r; }

function ContractEditor({ c: init, docs, onSave, onDelete, onClose, me }) {
  const [c, setC] = useState(init);
  const set = (p) => setC((x) => ({ ...x, ...p }));
  const d = ctDates(c);
  const [letter, setLetter] = useState(false);
  const linked = docs.filter((x) => (c.docIds || []).includes(x.id));
  const cand = docs.filter((x) => !(c.docIds || []).includes(x.id)).slice(0, 300);
  return (
    <Win id="ctedit" onClose={onClose} dirty={JSON.stringify(c) !== JSON.stringify(init)}>
      <div className="panelhead"><b>{init.name ? c.name || "Vertrag" : "Neuer Vertrag"}</b>
        <button className="btn primary" disabled={!c.name} onClick={() => { onSave(c); onClose(); }}>Speichern</button><XBtn /></div>
      <div className="seg">{SCOPES.map(([k, i, l]) => <button key={k} className={(c.scope || "privat") === k ? "on" : ""} onClick={() => set({ scope: k })}>{i} {l}</button>)}</div>
      <fieldset><legend>Vertrag</legend>
        <div className="grid2">
          <label>Bezeichnung<input value={c.name || ""} placeholder="z. B. Internet Zuhause" onChange={(e) => set({ name: e.target.value })} /></label>
          <label>Anbieter<input value={c.provider || ""} placeholder="z. B. Magenta, A1, Drei" onChange={(e) => set({ provider: e.target.value })} /></label>
        </div>
        <label>Art<select value={c.cat || "Sonstiges"} onChange={(e) => {
          if (e.target.value !== "__new") return set({ cat: e.target.value });
          const n = (prompt("Neue Vertragsart, z. B. „Strom PV“, „Kfz-Versicherung“:") || "").trim(); if (!n) return;
          const em = (prompt("Symbol (Emoji) für „" + n + "“:", "📄") || "📄").trim().slice(0, 4);
          ls.set("ctCats", { ...ls.get("ctCats", {}), [n]: em }); set({ cat: n });
        }}>{Object.entries(ctCats()).map(([k, i]) => <option key={k} value={k}>{i} {k}</option>)}<option value="__new">＋ Neue Art …</option></select></label>
        <div className="grid2">
          <label>Betrag €<input inputMode="decimal" value={c.amount ?? ""} onChange={(e) => set({ amount: e.target.value.replace(",", ".") })} /></label>
          <label>Intervall<select value={c.interval || "monatlich"} onChange={(e) => set({ interval: e.target.value })}>{Object.keys(CT_FACTOR).map((k) => <option key={k}>{k}</option>)}</select></label>
        </div>
        <div className="grid2">
          <label>Kundennummer<input value={c.customerNo || ""} onChange={(e) => set({ customerNo: e.target.value })} /></label>
          <label>Vertragsnummer<input value={c.contractNo || ""} onChange={(e) => set({ contractNo: e.target.value })} /></label>
        </div>
      </fieldset>
      <fieldset><legend>Laufzeit & Kündigung</legend>
        <div className="grid2">
          <label>Vertragsbeginn<input type="date" value={c.start || ""} onChange={(e) => set({ start: e.target.value })} /></label>
          <label>Mindestlaufzeit (Monate)<input type="number" value={c.minMonths ?? ""} placeholder="z. B. 24, leer = unbefristet" onChange={(e) => set({ minMonths: e.target.value })} /></label>
        </div>
        <div className="grid2">
          <label>Kündigungsfrist<div className="inrow"><input type="number" value={c.notice ?? ""} placeholder="z. B. 1" onChange={(e) => set({ notice: e.target.value })} />
            <select value={c.noticeUnit || "Monate"} onChange={(e) => set({ noticeUnit: e.target.value })}><option>Monate</option><option>Wochen</option><option>Tage</option></select></div></label>
          <label>Verlängert sich um (Monate)<input type="number" value={c.renewMonths ?? ""} placeholder="z. B. 12 oder 1" onChange={(e) => set({ renewMonths: e.target.value })} /></label>
        </div>
        <div className="ctcalc">
          {c.cancelledAt ? <span>✕ Gekündigt am {fmtDate(c.cancelledAt)}</span>
            : d.open ? <span>Unbefristet – kündbar jederzeit, frühestens zum <b>{fmtDate(d.end)}</b></span>
            : d.end ? <span>Nächstes Vertragsende <b>{fmtDate(d.end)}</b>{d.cancelBy && <> · kündigen bis <b className={daysUntil(d.cancelBy) <= 30 ? "neg" : ""}>{fmtDate(d.cancelBy)}</b> ({daysUntil(d.cancelBy)} Tage)</>}</span>
            : <span className="muted">Beginn + Mindestlaufzeit + Frist eintragen, dann rechnet FinDocu den letzten Kündigungstag aus.</span>}
        </div>
        <div className="actions">
          {!c.cancelledAt ? <button className="btn" onClick={() => set({ cancelledAt: todayISO(), cancelledEnd: d.end })}>Als gekündigt markieren</button>
            : <button className="btn" onClick={() => set({ cancelledAt: null, cancelledEnd: null })}>Kündigung zurücknehmen</button>}
          <button className="btn" onClick={() => setLetter(true)}>✉️ Kündigungsschreiben</button>
        </div>
      </fieldset>
      <fieldset><legend>Dokumente</legend>
        {linked.map((x) => <div key={x.id} className="frow"><Thumb d={x} /><div className="grow"><b>{x.title}</b><small className="muted block">{fmtDate(x.documentDate)}</small></div>
          <button className="iconbtn" title="Öffnen" onClick={() => openOriginal(x)}>↗</button><button className="iconbtn" title="Lösen" onClick={() => set({ docIds: c.docIds.filter((i) => i !== x.id) })}>✕</button></div>)}
        <select value="" onChange={(e) => e.target.value && set({ docIds: [...(c.docIds || []), e.target.value] })}>
          <option value="">＋ Dokument verknüpfen (Vertrag, Rechnung …)</option>
          {cand.map((x) => <option key={x.id} value={x.id}>{x.title} · {fmtDate(x.documentDate)}</option>)}
        </select>
      </fieldset>
      <label>Notiz<textarea rows={2} value={c.note || ""} onChange={(e) => set({ note: e.target.value })} /></label>
      {init.name && <button className="link red" style={{ marginTop: 12 }} onClick={() => confirm(`Vertrag „${c.name}“ löschen?`) && (onDelete(c), onClose())}>Vertrag löschen</button>}
      {letter && createPortal(
        <Win id="ctletter" onClose={() => setLetter(false)} dirty={false}>
          <div className="panelhead"><b>Kündigung</b><XBtn /></div>
          <pre className="fulltext letter">{cancelLetter({ provider: c.provider, name: c.name, customerNumber: c.customerNo || c.contractNo, endDate: d.end }, me)}</pre>
          <div className="actions"><button className="btn primary" onClick={() => navigator.clipboard?.writeText(cancelLetter({ provider: c.provider, name: c.name, customerNumber: c.customerNo || c.contractNo, endDate: d.end }, me))}>Kopieren</button></div>
        </Win>, document.querySelector(".app") || document.body)}
    </Win>
  );
}

function ContractsPage({ docs, me, onOpen, onFiles, docBusy, notify = () => {} }) {
  const mob = useMobileBeta();
  const [list, setList] = useLsState("contractList", []);
  const [showDrop, setShowDrop] = useLsState("ctrDrop", true);
  const [waitIds, setWaitIds] = useLsState("ctrWait", []);
  const [prevCt, setPrevCt] = useState(null);
  const [scope, setScope] = useState(() => ls.get("ctScope", "alle"));
  useEffect(() => ls.set("ctScope", scope), [scope]);
  const [edit, setEdit] = useState(null), [showOld, setShowOld] = useState(false), [imp, setImp] = useState(false);
  const save = (c) => setList((l) => (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? c : x)) : [...l, c]));
  useEffect(() => { const id = ls.get("ctOpenReq", null); if (!id) return; ls.set("ctOpenReq", null); const c = list.find((x) => x.id === id); if (c) setEdit(c); }, []);
  const monthly = (c) => (Number(c.amount) || 0) * (CT_FACTOR[c.interval || "monatlich"] || 1);
  const active = list.filter((c) => !c.cancelledAt || (c.cancelledEnd && c.cancelledEnd >= todayISO()));
  const counting = active.filter((c) => !c.inactive);
  const inScope = (c) => scope === "alle" || (c.scope || "privat") === scope;
  const shown = list.filter(inScope).filter((c) => showOld || active.includes(c))
    .map((c) => ({ c, d: ctDates(c) })).sort((a, b) => (a.d.cancelBy || a.d.end || "9999").localeCompare(b.d.cancelBy || b.d.end || "9999"));
  const sum = (sc) => counting.filter((c) => sc === "alle" || (c.scope || "privat") === sc).reduce((s, c) => s + monthly(c), 0);
  const soon = counting.filter(inScope).map((c) => ({ c, d: ctDates(c) })).filter(({ c, d }) => !c.cancelledAt && !d.open && d.cancelBy && daysUntil(d.cancelBy) >= 0 && daysUntil(d.cancelBy) <= 60);
  const docCands = docs.filter((d) => d.contract && !list.some((c) => (c.docIds || []).includes(d.id)));
  const fromDoc = (d) => {
    const k = d.contract, cat = Object.keys(ctCats()).find((x) => norm(`${k.provider} ${k.name} ${d.category}`).includes(norm(x.split(" ")[0]))) || "Sonstiges";
    const nm = String(k.noticePeriod || "").match(/(\d+)\s*(Monat|Woche|Tag)/i);
    return { id: uid(), scope: docScope(d), name: k.name || k.provider, provider: k.provider, cat, amount: k.amount ?? "", interval: k.interval || "monatlich",
      customerNo: k.customerNumber || "", start: k.startDate || "", end: k.endDate || "", notice: nm ? nm[1] : "", noticeUnit: nm ? (/woche/i.test(nm[2]) ? "Wochen" : /tag/i.test(nm[2]) ? "Tage" : "Monate") : "Monate",
      renewMonths: "", docIds: [d.id], note: k.noticePeriod ? "Kündigungsfrist laut Dokument: " + k.noticePeriod : "" };
  };
  // abgelegte Dateien: nach dem Auslesen erkannte Verträge automatisch anlegen
  useEffect(() => {
    if (!waitIds.length) return;
    const fin = waitIds.map((id) => docs.find((d) => d.id === id)).filter((d) => d && d.status !== "processing");
    const gone = waitIds.filter((id) => !docs.some((d) => d.id === id));
    if (!fin.length && !gone.length) return;
    const add = fin.filter((d) => d.contract?.provider && !list.some((c) => (c.docIds || []).includes(d.id))).map(fromDoc);
    if (add.length) { setList((l) => [...l, ...add]); notify(`${add.length} Vertrag${add.length === 1 ? "" : "e"} erkannt und angelegt: ${add.map((c) => c.name).join(", ")}`); }
    const none = fin.filter((d) => !d.contract?.provider);
    if (none.length) notify(`${none.length} Datei${none.length === 1 ? "" : "en"} ohne erkennbaren Vertrag – liegt in Dokumente`);
    const done = new Set([...fin.map((d) => d.id), ...gone]);
    setWaitIds((w) => w.filter((id) => !done.has(id)));
  }, [docs, waitIds]);
  const dropCt = async (files) => { const ids = await onFiles(files, { stay: true }); setWaitIds((w) => [...w, ...(ids || [])]); };
  return (
    <div className="ctpage">
      {mob ? (
      <div className="mpage">
        <div className="seg scopeseg">{[["alle", "", "Alle"], ...SCOPES].map(([k, i, l]) => <button key={k} className={scope === k ? "on" : ""} onClick={() => setScope(k)}>{i} {l}</button>)}</div>
        <MStats items={[{ label: "Kosten pro Monat", value: fmtMoney(sum(scope)), sub: `${fmtMoney(sum(scope) * 12)} im Jahr` },
          { label: "Kündbar in 60 Tagen", value: soon.length, vcls: soon.length ? "neg" : "", alert: !!soon.length, sub: soon[0] ? `${soon[0].c.name} bis ${fmtDate(soon[0].d.cancelBy)}` : "nichts dringend" },
          scope === "alle" && { label: "👤 Privat / 🏢 Firma", value: fmtMoney(sum("privat")), sub: `Firma ${fmtMoney(sum("firma"))} / Monat` }]} />
        <MActs items={[{ label: "＋ Vertrag", primary: true, run: () => setEdit({ id: uid(), scope: scope === "firma" ? "firma" : "privat", interval: "monatlich", noticeUnit: "Monate", cat: "Internet", docIds: [] }) },
          !!docCands.length && { label: `📄 Aus Dokumenten (${docCands.length})`, run: () => setImp(!imp) }, { label: showOld ? "Gekündigte ausblenden" : "Gekündigte zeigen", run: () => setShowOld(!showOld) }]} />
        {imp && <section className="tile">
          {docCands.map((d) => <div key={d.id} className="frow"><Thumb d={d} /><div className="grow"><b>{d.contract.provider}</b><small className="muted block">{d.title}</small></div><button className="btn sm" onClick={() => setEdit(fromDoc(d))}>Übernehmen</button></div>)}
        </section>}
        <MScroll>
          {!shown.length && <MEmpty>Noch keine Verträge – mit „＋ Vertrag“ z. B. Internet, Handy, Strom oder Versicherungen eintragen.</MEmpty>}
          {mGroup([...shown].sort((x, y) => (x.c.cat || "~").localeCompare(y.c.cat || "~", "de") || (x.d.cancelBy || "9999").localeCompare(y.d.cancelBy || "9999")), ({ c }) => c.cat || "Sonstiges").map(([g, l]) => (
            <React.Fragment key={g}>
              <MHead right={fmtMoney(l.filter(({ c }) => !c.cancelledAt && !c.inactive).reduce((s, { c }) => s + monthly(c), 0)) + " / Mon."}>{(ctCats()[g] || "📄") + " " + g}</MHead>
              {l.map(({ c, d }) => { const cdocs = (c.docIds || []).map((id) => docs.find((x) => x.id === id)).filter(Boolean); const left = d.cancelBy ? daysUntil(d.cancelBy) : null; return (
                <MItem key={c.id} icon={<MIco e={ctCats()[c.cat] || "📄"} />} title={c.name || "Vertrag"} dim={c.cancelledAt || c.inactive}
                  tags={[c.scope === "firma" && "Firma", c.inactive && "inaktiv", cdocs.length && "📎"]}
                  sub={c.cancelledAt ? `gekündigt${c.cancelledEnd ? " zum " + fmtDate(c.cancelledEnd) : ""}` : d.open ? `${c.provider || ""} · jederzeit kündbar` : d.cancelBy ? `${c.provider ? c.provider + " · " : ""}kündigen bis ${fmtDate(d.cancelBy)}` : c.provider || "Laufzeit nicht eingetragen"}
                  amount={c.amount ? fmtMoney(Number(c.amount)) : "—"} amountSub={c.interval || "monatlich"}
                  pill={!c.cancelledAt && left != null && left >= 0 && left <= 60 && <span className={"stpill " + (left <= 30 ? "st-over" : "st-draft")}>{left === 0 ? "heute" : `in ${left} T.`}</span>}
                  onClick={() => setEdit(c)}
                  swipe={{ left: [cdocs[0] && { icon: "👁", label: "Dokument", bg: "#0ea5e9", run: () => onOpen(cdocs[0].id) }],
                    right: [{ icon: c.inactive ? "▶" : "⏸", label: c.inactive ? "Aktiv" : "Inaktiv", bg: "#64748b", run: () => save({ ...c, inactive: !c.inactive }) },
                      d.cancelBy && !c.cancelledAt && { icon: "📅", label: "Kalender", bg: "#8b5cf6", run: () => saveBlob(new Blob([["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FinDocu//DE", icsEvent({ id: "ct-" + c.id, date: d.cancelBy, label: "Kündigung bis" }, { title: `${c.name} (${c.provider || ""})` }), "END:VCALENDAR"].join("\r\n")], { type: "text/calendar" }), "kuendigung.ics") }] }} />); })}
            </React.Fragment>
          ))}
        </MScroll>
      </div>
      ) : (<>
      <div className="seg scopeseg">{[["alle", "", "Privat & Firma"], ...SCOPES].map(([k, i, l]) => <button key={k} className={scope === k ? "on" : ""} onClick={() => setScope(k)}>{i} {l} <small className="cnt">({k === "alle" ? active.length : active.filter((c) => (c.scope || "privat") === k).length})</small></button>)}</div>
      <div className="invstats">
        <div className="tile"><small className="muted">Kosten pro Monat</small><b>{fmtMoney(sum(scope))}</b><small className="muted">{fmtMoney(sum(scope) * 12)} im Jahr</small></div>
        {scope === "alle" && <><div className="tile"><small className="muted">👤 Privat</small><b>{fmtMoney(sum("privat"))}</b><small className="muted">pro Monat</small></div>
          <div className="tile"><small className="muted">🏢 Firma</small><b>{fmtMoney(sum("firma"))}</b><small className="muted">pro Monat</small></div></>}
        <div className={"tile" + (soon.length ? " alert" : "")}><small className="muted">Kündbar in 60 Tagen</small><b className={soon.length ? "neg" : ""}>{soon.length}</b><small className="muted">{soon[0] ? `${soon[0].c.name} bis ${fmtDate(soon[0].d.cancelBy)}` : "nichts dringend"}</small></div>
      </div>
      <div className="invbar">
        <button className="btn primary" onClick={() => setEdit({ id: uid(), scope: scope === "firma" ? "firma" : "privat", interval: "monatlich", noticeUnit: "Monate", cat: "Internet", docIds: [] })}>＋ Vertrag</button>
        {!!docCands.length && <button className="btn" onClick={() => setImp(!imp)}>📄 Aus Dokumenten übernehmen ({docCands.length})</button>}
        {onFiles && <button className={showDrop ? "chip on" : "chip"} title="Ablagefeld ein-/ausblenden" onClick={() => setShowDrop(!showDrop)}>📥 Ablagefeld</button>}
        <span className="grow" />
        {(() => {
          const rows = shown.map(({ c, d }) => [c.name || "", c.provider || "", c.cat || "", c.scope === "firma" ? "Firma" : "privat", r2e(c.amount), c.interval || "monatlich", r2e(monthly(c)), c.customerNo || "", c.start || "", d.end || "", d.cancelBy || "", c.cancelledAt ? "gekündigt" : c.inactive ? "inaktiv" : "aktiv"]);
          const head = ["Vertrag", "Anbieter", "Kategorie", "Bereich", "Betrag €", "Intervall", "pro Monat €", "Kundennr.", "Beginn", "Ende", "Kündigen bis", "Status"];
          const ics = () => { const ev = shown.filter(({ c, d }) => !c.cancelledAt && d.cancelBy).map(({ c, d }) => icsEvent({ id: "ct-" + c.id, date: d.cancelBy, label: "Kündigung bis" }, { title: `${c.name} (${c.provider || ""})`, summary: `Letzter Tag zum Kündigen. Vertragsende ${d.end ? fmtDate(d.end) : "–"}. Kundennr. ${c.customerNo || "–"}` }));
            saveBlob(new Blob([["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FinDocu//DE", ...ev, "END:VCALENDAR"].join("\r\n")], { type: "text/calendar" }), "kuendigungstermine.ics"); };
          return <ExportMenu className="btn" items={[{ head: `${shown.length} Verträge (aktueller Filter)` },
            { label: "🖨 Vertragsübersicht PDF", run: async () => saveBlob(await tablePdf({ title: "Vertragsübersicht", subtitle: `Stand ${fmtDate(isoToday())}`, landscape: true,
              kpis: [["Verträge", String(shown.length)], ["pro Monat", fmtMoney(sumBy(shown.filter(({ c }) => !c.cancelledAt && !c.inactive), ({ c }) => monthly(c)))], ["pro Jahr", fmtMoney(12 * sumBy(shown.filter(({ c }) => !c.cancelledAt && !c.inactive), ({ c }) => monthly(c)))], ["Kündigung in 60 Tagen", String(soon.length)]],
              columns: [{ label: "Vertrag", w: 2.4 }, { label: "Anbieter", w: 2 }, { label: "Kategorie", w: 1.4 }, { label: "Betrag", w: 1.1, align: "right" }, { label: "Intervall", w: 1.2 }, { label: "pro Monat", w: 1.1, align: "right" }, { label: "Beginn", w: 1 }, { label: "Ende", w: 1 }, { label: "Kündigen bis", w: 1.1 }, { label: "Status", w: 0.9 }],
              rows: rows.map((r) => [r[0], r[1], r[2], r[4], r[5], r[6], r[8], r[9], r[10], r[11]]) }), `vertraege-${isoToday()}.pdf`) },
            { label: "📊 Excel (.xlsx)", run: () => downloadXlsx(`vertraege-${isoToday()}.xlsx`, [{ name: "Verträge", head, rows }]) },
            { label: "📄 CSV", run: () => downloadCsv(`vertraege-${isoToday()}.csv`, head, rows) },
            { label: "📅 Kündigungstermine (.ics)", sub: "in den Kalender, mit Erinnerung 2 Tage vorher", run: ics }]} />;
        })()}
        <label className="check mini"><input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Gekündigte anzeigen</label>
      </div>
      {onFiles && showDrop && <DropField onFiles={dropCt} onHide={() => setShowDrop(false)} busy={!!docBusy} title="Verträge oder Ordner hierher ziehen" what="PDF & Fotos · Vertrag wird automatisch angelegt" />}
      {docBusy && waitIds.length > 0 && <ImportBar {...docBusy} />}
      <FitScroll card cols={["Vertrag", "Details", "Kosten · Kündigung"]}>
      {imp && <section className="tile">
        <div className="tilehead"><b>Von Claude erkannte Verträge in deinen Dokumenten</b></div>
        {docCands.map((d) => <div key={d.id} className="frow"><Thumb d={d} /><div className="grow"><b>{d.contract.provider}</b><small className="muted block">{d.title} · {d.contract.amount ? fmtMoney(d.contract.amount) + " " + (d.contract.interval || "") : ""}</small></div>
          <button className="btn sm" onClick={() => setEdit(fromDoc(d))}>Übernehmen</button></div>)}
      </section>}
      <section className="tile ctlist">
        {!shown.length && <p className="muted small">Noch keine Verträge hinterlegt. Mit „＋ Vertrag“ z. B. Internet, Handy, Strom, Versicherungen oder Miete eintragen – FinDocu rechnet den letzten Kündigungstag aus. Erkannte Abos aus deinen Kontobuchungen findest du weiterhin unter „Fixkosten & Abos“.</p>}
        {shown.map(({ c, d }) => { const cdocs = (c.docIds || []).map((id) => docs.find((x) => x.id === id)).filter(Boolean); const open = prevCt === c.id && cdocs.length; return (
          <div key={c.id} className={"dwrap ctwrap" + (open ? " open" : "")}>
          <div className={"frow click ctrow" + (c.cancelledAt ? " ended" : "") + (c.inactive ? " inactive" : "")} onClick={() => setEdit(c)}>
            {cdocs[0] ? <span onClick={(e) => { e.stopPropagation(); setPrevCt(open ? null : c.id); }} title="Vorschau ein-/ausblenden"><Thumb d={cdocs[0]} /></span>
              : <span className="caticon" style={{ width: 42, height: 42, background: "var(--card2)", fontSize: 20 }}>{ctCats()[c.cat] || "📄"}</span>}
            <div className="grow">
              <b className={cdocs.length ? "dtitle" : ""} title={cdocs.length ? "Vorschau ein-/ausblenden" : undefined} onClick={cdocs.length ? (e) => { e.stopPropagation(); setPrevCt(open ? null : c.id); } : undefined}>{c.name}</b> <small className="muted">{(c.scope || "privat") === "firma" ? "🏢" : "👤"}</small>
              <small className="muted block">{[c.provider, c.customerNo && "Nr. " + c.customerNo, cdocs.length ? `📎 ${cdocs.length}` : ""].filter(Boolean).join(" · ")}</small>
              <small className="block">{c.cancelledAt ? <span className="muted">Gekündigt{c.cancelledEnd ? " zum " + fmtDate(c.cancelledEnd) : ""}</span>
                : d.open ? <span className="muted">unbefristet · jederzeit kündbar</span>
                : d.cancelBy ? <span className={daysUntil(d.cancelBy) <= 30 ? "neg" : daysUntil(d.cancelBy) <= 60 ? "warnc" : "muted"}>kündigen bis {fmtDate(d.cancelBy)} · Ende {fmtDate(d.end)}</span>
                : d.end ? <span className="muted">Ende {fmtDate(d.end)}</span> : <span className="muted">Laufzeit nicht eingetragen</span>}</small>
            </div>
            <div className="right"><b>{c.amount ? fmtMoney(Number(c.amount)) : "—"}</b><small className="muted block">{c.interval || "monatlich"}</small></div>
            <div className="ctacts" onClick={(e) => e.stopPropagation()}>
              <button className={"stpill ctstate " + (c.inactive ? "st-draft" : "st-paid")} title={c.inactive ? "Inaktiv – zählt nicht zu den Kosten. Antippen = aktiv" : "Aktiv – antippen = inaktiv"} onClick={() => save({ ...c, inactive: !c.inactive })}>{c.inactive ? "Inaktiv" : "Aktiv"}</button>
              <button className={"iconbtn" + (open ? " on" : "")} disabled={!cdocs.length} title={cdocs.length ? "Vorschau ein-/ausblenden" : "Kein Dokument verknüpft"} onClick={() => setPrevCt(open ? null : c.id)}>{open ? <IcoEyeOff /> : <IcoEye />}</button>
              {cdocs[0] && <button className="iconbtn" title="Drucken" onClick={() => printDoc(cdocs[0])}><IcoPrint /></button>}
            </div>
          </div>
          {open && cdocs.map((x) => <DocPreview key={x.id} d={x} onOpen={() => onOpen(x.id)} />)}
          </div>); })}
      </section>
      </FitScroll>
      </>)}
      {edit && <ContractEditor c={edit} docs={docs} me={me} onSave={save} onDelete={(c) => setList((l) => l.filter((x) => x.id !== c.id))} onClose={() => setEdit(null)} />}
    </div>
  );
}


/* ======================= Kunden / Kontakte ======================= */
const CONTACT_TYPES_DEF = [["Kunde", "🧑‍💼", "#4f8cff"], ["Lieferant", "🚚", "#f59e0b"], ["Partner", "🤝", "#00b3a4"], ["Privat", "👤", "#a855f7"], ["Behörde", "🏛️", "#64748b"]]
  .map(([name, icon, color]) => ({ id: "ct-" + name, name, icon, color }));
const useContactTypes = () => useLsState("contactTypes", CONTACT_TYPES_DEF);
const TypeGlyph = ({ t }) => (t?.img ? <img className="catimg" src={t.img} alt="" /> : <>{t?.icon || "👤"}</>);
function ContactTypeSettings() {
  const [types, setTypes] = useContactTypes();
  const [list, setList] = useLsState("customers", []);
  const [styleId, setStyleId] = useState(null), [nn, setNn] = useState("");
  const patch = (id, p) => setTypes((l) => l.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const rename = (t, name) => { if (!name || name === t.name) return; patch(t.id, { name }); setList((l) => l.map((c) => ((c.type || "Kunde") === t.name ? { ...c, type: name } : c))); };
  const count = (t) => list.filter((c) => (c.type || "Kunde") === t.name).length;
  const dnd = useDnd((d, over) => setTypes((l) => moveBetween({ t: l }, "t", d.index, "t", over.index).t));
  return (<>
    <p className="muted small">Kategorien für deine Kontakte im Reiter „Kunden“. Auf das Symbol tippen für Symbol &amp; Textfarbe (auch eigenes Bild). Am Griff <b>⠿</b> sortieren.</p>
    <div data-ctt-list={`t|${types.length}`}>
      {types.map((t, i) => (
        <React.Fragment key={t.id}>
          {dnd.lineAt("ctt", "t", i) && <div className="dropline" />}
          <div className={"acccfg catrow" + (dnd.isDragging("ctt", "t", i) ? " dragging" : "")} data-ctt-item={`t|${i}`}>
            <Handle onDown={(e) => dnd.start(e, { kind: "ctt", list: "t", index: i, label: `${t.icon || ""} ${t.name}` })} />
            <button className="ki catki" title="Symbol & Textfarbe" style={{ background: (t.color || "#888") + "22", color: t.color }} onClick={() => setStyleId(styleId === t.id ? null : t.id)}><TypeGlyph t={t} /></button>
            <EditText className="grow" inputClass="catname" value={t.name} validate={(v) => (!v ? "leer" : v !== t.name && types.some((x) => x.name.toLowerCase() === v.toLowerCase()) ? "doppelt" : undefined)} onSave={(v) => rename(t, v)} />
            <small className="muted cnt">{count(t)}</small>
            <button className="iconbtn" title="Löschen" onClick={() => { if (types.length <= 1) return; if (!confirm(`Kategorie „${t.name}“ löschen?${count(t) ? ` ${count(t)} Kontakt(e) wandern nach „${types.find((x) => x.id !== t.id).name}“.` : ""}`)) return;
              const to = types.find((x) => x.id !== t.id).name; setList((l) => l.map((c) => ((c.type || "Kunde") === t.name ? { ...c, type: to } : c))); setTypes((l) => l.filter((x) => x.id !== t.id)); }}>🗑</button>
          </div>
          {styleId === t.id && <div className="catstylebox">
            <CatStylePicker icon={t.icon} color={t.color} img={t.img} onChange={(m) => patch(t.id, { icon: m.icon, color: m.color, img: m.img })} />
            <div className="asfoot"><span className="aspreview"><span className="label" style={{ color: t.color, background: (t.color || "#888") + "1f" }}><TypeGlyph t={t} /> {t.name}</span></span>
              <button className="btn sm" onClick={() => setStyleId(null)}>Fertig</button></div>
          </div>}
        </React.Fragment>
      ))}
      {dnd.lineAt("ctt", "t", types.length) && <div className="dropline" />}
    </div>
    <div className="acccfg addcat"><span className="ki">＋</span>
      <input className="grow" value={nn} placeholder="Neue Kategorie, z. B. „Handwerker“, „Stammkunde“" onChange={(e) => setNn(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && nn.trim() && !types.some((x) => x.name.toLowerCase() === nn.trim().toLowerCase())) { setTypes((l) => [...l, { id: "ct-" + uid(), name: nn.trim(), icon: "🏷️", color: ACC_COLORS[l.length % ACC_COLORS.length] }]); setNn(""); } }} />
      <button className="btn sm" disabled={!nn.trim()} onClick={() => { if (types.some((x) => x.name.toLowerCase() === nn.trim().toLowerCase())) return; setTypes((l) => [...l, { id: "ct-" + uid(), name: nn.trim(), icon: "🏷️", color: ACC_COLORS[l.length % ACC_COLORS.length] }]); setNn(""); }}>Hinzufügen</button>
    </div>
    {dnd.ghost}
  </>);
}
function ContactEditor({ c: init, onSave, onDelete, onClose }) {
  const [types] = useContactTypes();
  const [c, setC] = useState(init);
  const set = (p) => setC((x) => ({ ...x, ...p }));
  const f = (k, label, ph = "", type = "text") => <label>{label}<input type={type} value={c[k] || ""} placeholder={ph} onChange={(e) => set({ [k]: e.target.value })} /></label>;
  return (
    <Win id="contact" onClose={onClose} dirty={JSON.stringify(c) !== JSON.stringify(init)}>
      <div className="panelhead"><b>{init.name || "Neuer Kontakt"}</b><button className="btn primary" disabled={!c.name?.trim()} onClick={() => { onSave(c); onClose(); }}>Speichern</button><XBtn /></div>
      <div className="typepick">{types.map((t) => <button key={t.id} className={"chip" + ((c.type || types[0]?.name) === t.name ? " on" : "")} style={(c.type || types[0]?.name) === t.name ? undefined : { color: t.color }} onClick={() => set({ type: t.name })}><TypeGlyph t={t} /> {t.name}</button>)}</div>
      <fieldset><legend>Kontakt</legend>
        <div className="grid2">{f("name", "Name / Firma", "z. B. Muster GmbH")}{f("contact", "Ansprechperson", "z. B. Frau Huber")}</div>
        <label>Anschrift<textarea rows={3} value={c.address || ""} placeholder={"Straße Nr.\nPLZ Ort"} onChange={(e) => set({ address: e.target.value })} /></label>
        <div className="grid2">{f("email", "E-Mail", "", "email")}{f("phone", "Telefon", "", "tel")}</div>
        <div className="grid2">{f("mobile", "Mobil", "", "tel")}{f("web", "Website")}</div>
      </fieldset>
      <fieldset><legend>Geschäftlich</legend>
        <div className="grid2">{f("number", "Kundennummer")}{f("uid", "UID-Nr.", "ATU…")}</div>
        <div className="grid2">{f("iban", "IBAN")}{f("birthday", "Geburtstag", "", "date")}</div>
      </fieldset>
      <label>Notiz<textarea rows={3} value={c.note || ""} onChange={(e) => set({ note: e.target.value })} /></label>
      {init.name && <button className="link red" style={{ marginTop: 12 }} onClick={() => confirm(`Kontakt „${c.name}“ löschen?`) && (onDelete(c), onClose())}>Kontakt löschen</button>}
    </Win>
  );
}
/* Kontaktauswahl des Handys (Android/Chrome); null = nicht verfügbar → .vcf-Datei */
async function pickPhoneContacts() {
  if (!("contacts" in navigator && "select" in navigator.contacts)) return null;
  try {
    const props = await navigator.contacts.getProperties().catch(() => ["name", "email", "tel"]);
    const res = await navigator.contacts.select(props.filter((x) => ["name", "email", "tel", "address"].includes(x)), { multiple: true });
    return res.map((r) => ({ name: (r.name || [])[0] || "", email: (r.email || [])[0] || "", phone: (r.tel || [])[0] || "",
      address: r.address?.[0] ? [(r.address[0].addressLine || []).join(" "), [r.address[0].postalCode, r.address[0].city].filter(Boolean).join(" "), r.address[0].country].filter(Boolean).join("\n") : "" })).filter((c) => c.name);
  } catch (e) { return e.name === "AbortError" || e.name === "InvalidStateError" ? [] : null; }
}
/* vCard (.vcf) lesen – Export aus iPhone/Mac-Kontakten, Android, Google, Outlook */
const cityOf = (a) => { const l = String(a || "").split("\n"); return l.find((x) => /^\d{4,5}\s/.test(x.trim())) || l[l.length - 1] || ""; };
function parseVcf(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").replace(/=\n/g, "").split("\n");
  const out = []; let c = null;
  const qp = (v) => { try { return decodeURIComponent(v.replace(/=([0-9A-F]{2})/gi, "%$1")); } catch { return v; } };
  const un = (v) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
  for (const raw of lines) {
    const i = raw.indexOf(":"); if (i < 0) continue;
    const head = raw.slice(0, i), params = head.toUpperCase().split(";"), key = params[0].replace(/^ITEM\d+\./, "");
    let val = raw.slice(i + 1); if (params.some((x) => x.includes("QUOTED-PRINTABLE"))) val = qp(val);
    if (key === "BEGIN") { c = { tels: [] }; continue; }
    if (key === "END") { if (c) {
      const name = c.fn || c.n || c.org || "";
      if (name) out.push({ name, contact: c.org && c.fn && c.org !== c.fn ? c.fn : "", ...(c.org && c.fn && c.org !== c.fn ? { name: c.org } : {}),
        email: c.email || "", phone: (c.tels.find((t) => !t.cell) || {}).v || "", mobile: (c.tels.find((t) => t.cell) || {}).v || "",
        address: c.adr || "", web: c.url || "", note: c.note || "", birthday: c.bday || "" });
    } c = null; continue; }
    if (!c) continue;
    const v = un(val);
    if (key === "FN") c.fn = v;
    else if (key === "N" && !c.n) { const [last, first] = val.split(";"); c.n = [un(first || ""), un(last || "")].filter(Boolean).join(" "); }
    else if (key === "ORG") c.org = un(val.split(";")[0]);
    else if (key === "EMAIL" && !c.email) c.email = v;
    else if (key === "TEL") c.tels.push({ v, cell: params.some((x) => /CELL|MOBILE|IPHONE/.test(x)) });
    else if (key === "ADR" && !c.adr) { const p = val.split(";").map(un); c.adr = [p[2], [p[5], p[3]].filter(Boolean).join(" "), p[6]].filter(Boolean).join("\n"); }
    else if (key === "URL" && !c.url) c.url = v;
    else if (key === "NOTE") c.note = v;
    else if (key === "BDAY") { const m = v.replace(/-/g, "").match(/^(\d{4})(\d{2})(\d{2})/); if (m) c.bday = `${m[1]}-${m[2]}-${m[3]}`; }
  }
  return out;
}
function ContactImportWin({ items: init, existing, onImport, onClose }) {
  const [items, setItems] = useState(() => init.map((c) => ({ ...c, on: !existing.some((x) => norm(x.name) === norm(c.name) || (c.email && norm(x.email) === norm(c.email))) })));
  const [q, setQ] = useState("");
  const dup = (c) => existing.some((x) => norm(x.name) === norm(c.name) || (c.email && norm(x.email) === norm(c.email)));
  const shown = items.map((c, i) => [c, i]).filter(([c]) => !q || norm(`${c.name} ${c.contact} ${c.email} ${c.phone} ${c.mobile}`).includes(norm(q)));
  const sel = items.filter((c) => c.on);
  return (
    <Win id="ctimport" onClose={onClose} dirty={false}>
      <div className="panelhead"><b>Kontakte übernehmen</b><button className="btn primary" disabled={!sel.length} onClick={() => onImport(sel)}>{sel.length} übernehmen</button><XBtn /></div>
      <p className="muted small">{items.length} Kontakt{items.length === 1 ? "" : "e"} gefunden. Bereits vorhandene (gleicher Name oder E-Mail) sind abgewählt.</p>
      <div className="searchbar"><span>🔍</span><input type="search" placeholder="Filtern" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="link" onClick={() => setItems((l) => l.map((c) => ({ ...c, on: true })))}>Alle</button>
        <button className="link" onClick={() => setItems((l) => l.map((c) => ({ ...c, on: false })))}>Keine</button>
      </div>
      {shown.map(([c, i]) => (
        <label key={i} className="frow click impcontact">
          <input type="checkbox" checked={c.on} onChange={(e) => setItems((l) => l.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))} />
          <div className="grow"><b>{c.name}</b>{dup(c) && <small className="warnc"> · schon vorhanden</small>}
            <small className="muted block">{[c.contact, c.email, c.mobile || c.phone, cityOf(c.address)].filter(Boolean).join(" · ") || "—"}</small></div>
        </label>
      ))}
    </Win>
  );
}
function ContactsPage({ setTab, req = 0, busy, setBusy = () => {} }) {
  const mob = useMobileBeta();
  const [showDrop, setShowDrop] = useLsState("ctDrop", true);
  const dropVcf = async (files) => {
    let all = [];
    for (const [i, f] of files.entries()) { setBusy({ title: `Kontaktdatei ${i + 1} von ${files.length} wird gelesen …`, sub: f.name, done: i, total: files.length, n: files.length - i }); all = all.concat(parseVcf(await f.text())); }
    setBusy(null);
    if (!all.length) return alert("Keine Kontakte in den Dateien gefunden.");
    setPicked(all.map((c) => ({ ...c, on: true })));
  };
  const [list, setList] = useLsState("customers", []);
  const [types] = useContactTypes();
  const typeOf = (c) => types.find((t) => t.name === (c.type || "Kunde")) || { name: c.type || "Kunde", icon: "👤", color: "#888" };
  const [picked, setPicked] = useState(null); // Import-Vorschau
  const vcfRef = useRef();
  useEffect(() => { if (ls.get("pendingContact", null)) { ls.set("pendingContact", null); setEdit({ id: uid(), type: "Kunde", name: "", number: nextNo() }); } }, [req]);
  useEffect(() => { const l = ls.get("pendingContactImport", null); if (l) { ls.set("pendingContactImport", null); setPicked(l.map((c) => ({ ...c, on: true }))); } }, [req]);
  const fromPhone = async () => {
    const out = await pickPhoneContacts();
    if (out === null) return vcfRef.current.click();
    if (out.length) setPicked(out.map((c) => ({ ...c, on: true })));
  };
  const invoices = ls.get("invoices", []);
  const [edit, setEdit] = useState(null), [q, setQ] = useState(""), [type, setType] = useState("alle");
  const save = (c) => setList((l) => (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? c : x)) : [...l, c]));
  const nextNo = () => "K-" + String(list.reduce((m, c) => Math.max(m, parseInt(String(c.number || "").replace(/\D/g, ""), 10) || 0), 0) + 1).padStart(3, "0");
  const invOf = (c) => invoices.filter((i) => i.kind === "rechnung" && i.customer?.name === c.name && !["entwurf", "storniert"].includes(i.status));
  const shown = list.filter((c) => type === "alle" || (c.type || "Kunde") === type)
    .filter((c) => !q || norm(`${c.name} ${c.contact} ${c.email} ${c.phone} ${c.address} ${c.number}`).includes(norm(q)))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));
  const vcard = (c) => {
    const v = ["BEGIN:VCARD", "VERSION:3.0", `FN:${c.name}`, c.contact && `NOTE:Ansprechperson ${c.contact}`, c.email && `EMAIL:${c.email}`, c.phone && `TEL;TYPE=WORK:${c.phone}`, c.mobile && `TEL;TYPE=CELL:${c.mobile}`,
      c.address && `ADR;TYPE=WORK:;;${c.address.replace(/\n/g, ";")};;;;`, c.web && `URL:${c.web}`, "END:VCARD"].filter(Boolean).join("\r\n");
    downloadFiles([new File([v], safeName(c.name) + ".vcf", { type: "text/vcard" })]);
  };
  return (
    <div className="ctpage">
      <KStats items={[{ label: "Kontakte", value: list.length, sub: `${list.filter((c) => (c.type || "Kunde") === "Kunde").length} Kunden` }, { label: "Lieferanten", value: list.filter((c) => c.type === "Lieferant").length },
        { label: "Mit offenen Rechnungen", value: list.filter((c) => invOf(c).some((i) => i.status !== "bezahlt")).length }, { label: "Offen gesamt", value: fmtMoney(list.reduce((t, c) => t + invOf(c).filter((i) => i.status !== "bezahlt").reduce((a, i) => a + invTotal(i), 0), 0)) }, { label: "Umsatz gesamt", value: fmtMoney(list.reduce((t, c) => t + invOf(c).reduce((a, i) => a + invTotal(i), 0), 0)) }]} />
      {mob ? (
      <div className="mpage">
        <MActs items={[{ label: "＋ Kontakt", primary: true, run: () => setEdit({ id: uid(), type: "Kunde", name: "", number: nextNo() }) }, { label: "📱 Aus Handy", run: fromPhone }, { label: "📇 .vcf", run: () => vcfRef.current?.click() }]} />
        <input ref={vcfRef} type="file" accept=".vcf,text/vcard,text/x-vcard" multiple hidden onChange={async (e) => {
          const files = [...e.target.files]; e.target.value = ""; let all = [];
          for (const f of files) all = all.concat(parseVcf(await f.text()));
          if (!all.length) return alert("Keine Kontakte in der Datei gefunden.");
          setPicked(all.map((c) => ({ ...c, on: true })));
        }} />
        <MBar q={q} setQ={setQ} placeholder="Name, E-Mail, Telefon, Ort suchen"
          chips={[["alle", "Alle", list.length, type === "alle", () => setType("alle")], ...types.map((t) => ["t:" + t.id, <><TypeGlyph t={t} /> {t.name}</>, list.filter((c) => (c.type || "Kunde") === t.name).length, type === t.name, () => setType(t.name)])]} />
        {busy && <ImportBar {...busy} />}
        <MScroll>
          {!shown.length && <MEmpty>{list.length ? "Keine Treffer." : "Noch keine Kontakte – mit „＋ Kontakt“ anlegen oder aus dem Handy übernehmen."}</MEmpty>}
          {mGroup(shown, (c) => ((c.name || "#").trim()[0] || "#").toUpperCase()).map(([L, l]) => (
            <React.Fragment key={L}>
              <MHead right={l.length}>{L}</MHead>
              {l.map((c) => { const inv = invOf(c), open = inv.filter((i) => i.status !== "bezahlt"), tp = typeOf(c), tel = (c.mobile || c.phone || "").replace(/\s/g, ""); return (
                <MItem key={c.id} icon={<MAvatar text={c.name} color={tp.color} />} title={c.name || "Ohne Name"} tags={[{ label: <><TypeGlyph t={tp} /> {tp.name}</>, color: tp.color }]}
                  sub={[c.contact, cityOf(c.address), c.number].filter(Boolean).join(" · ")}
                  amount={inv.length ? fmtMoney(inv.reduce((s, i) => s + invTotal(i), 0)) : null} amountSub={inv.length ? `${inv.length} Rechn.${open.length ? " · " + open.length + " offen" : ""}` : null}
                  onClick={() => setEdit(c)}
                  swipe={{ left: [setTab && { icon: "🧾", label: "Rechnung", bg: "#0ea5e9", run: () => { ls.set("pendingInvoice", { kind: "rechnung", customer: c }); setTab("invoices"); } }, { icon: "📇", label: "vCard", bg: "#8b5cf6", run: () => vcard(c) }],
                    right: [tel && { icon: "📞", label: "Anrufen", bg: "#16a34a", run: () => (location.href = "tel:" + tel) }, c.email && { icon: "✉️", label: "Mail", bg: "#3b82f6", run: () => (location.href = "mailto:" + c.email) }] }} />); })}
            </React.Fragment>
          ))}
        </MScroll>
      </div>
      ) : (<>
      <div className="invbar">
        <button className="btn primary" onClick={() => setEdit({ id: uid(), type: "Kunde", name: "", number: nextNo() })}>＋ Kontakt</button>
        <button className="btn" onClick={fromPhone}>📱 Aus Handy-Kontakten</button>
        <input ref={vcfRef} type="file" accept=".vcf,text/vcard,text/x-vcard" multiple hidden onChange={async (e) => {
          const files = [...e.target.files]; e.target.value = ""; let all = [];
          for (const f of files) all = all.concat(parseVcf(await f.text()));
          if (!all.length) return alert("Keine Kontakte in der Datei gefunden.");
          setPicked(all.map((c) => ({ ...c, on: true })));
        }} />
        <span className="grow" />
        <small className="muted">{list.length} Kontakt{list.length === 1 ? "" : "e"}</small>
      </div>
      {!("contacts" in navigator && "select" in (navigator.contacts || {})) && <p className="muted small hint">📱 <b>iPhone – direkt aus dem Adressbuch:</b> Einstellungen → Apps → Safari → Erweitert → Feature Flags → „Contact Picker API“ einschalten, dann FinDocu neu öffnen. Danach öffnet „Aus Handy-Kontakten“ die Kontaktauswahl des iPhones. <b>Ohne diese Einstellung:</b> Kontakte-App → Kontakte markieren → Teilen → „In Dateien sichern“ und die .vcf-Datei hier wählen. <b>Mac:</b> Kontakte → Ablage → Exportieren → vCard. <b>Android/Chrome:</b> funktioniert direkt.</p>}
      <div className="searchbar"><span>🔍</span><input type="search" placeholder="Name, E-Mail, Telefon, Ort suchen" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <ChipBar storeKey="ctChips" className="invfilter" items={[
        { k: "drop", label: "📥 Ablagefeld", el: <button className={showDrop ? "chip on" : "chip"} title="Ablagefeld ein-/ausblenden" onClick={() => setShowDrop(!showDrop)}>📥 Ablagefeld</button> },
        { k: "alle", label: "Alle", el: <button className={"chip" + (type === "alle" ? " on" : "")} onClick={() => setType("alle")}>Alle <small>({list.length})</small></button> },
        ...types.map((t) => ({ k: "t:" + t.id, label: <><TypeGlyph t={t} /> {t.name}</>, el: <button className={"chip" + (type === t.name ? " on" : "")} style={type === t.name ? undefined : { color: t.color }} onClick={() => setType(t.name)}><TypeGlyph t={t} /> {t.name} <small>({list.filter((c) => (c.type || "Kunde") === t.name).length})</small></button> })),
        { k: "export", label: "⬇︎ Export", el: <ExportMenu items={[{ head: `${shown.length} Kontakte (aktueller Filter)` },
          { label: "📇 vCard (.vcf)", sub: "für Handy, Outlook, iCloud", run: () => saveBlob(new Blob([vcardText(shown)], { type: "text/vcard" }), `kontakte-${isoToday()}.vcf`) },
          { label: "📊 Excel (.xlsx)", run: () => downloadXlsx(`kontakte-${isoToday()}.xlsx`, [{ name: "Kontakte", head: ["Nr.", "Art", "Name", "Ansprechperson", "Anschrift", "E-Mail", "Telefon", "Mobil", "Web", "UID", "Notiz"], rows: shown.map((c) => [c.number || "", c.type || "Kunde", c.name || "", c.contact || "", String(c.address || "").replace(/\n/g, ", "), c.email || "", c.phone || "", c.mobile || "", c.web || "", c.uid || "", c.note || ""]) }]) },
          { label: "📄 CSV", run: () => downloadCsv(`kontakte-${isoToday()}.csv`, ["Nr.", "Art", "Name", "Ansprechperson", "Anschrift", "E-Mail", "Telefon", "Mobil", "Web", "UID"], shown.map((c) => [c.number || "", c.type || "Kunde", c.name || "", c.contact || "", String(c.address || "").replace(/\n/g, ", "), c.email || "", c.phone || "", c.mobile || "", c.web || "", c.uid || ""])) }]} /> },
        setTab && { k: "set", label: "⚙︎ Arten bearbeiten", el: <button className="chip" title="Kontaktarten bearbeiten" onClick={() => { ls.set("openSettingsSec", "kontaktarten"); setTab("settings"); }}>⚙︎</button> },
      ]} />
      {showDrop ? <DropField onFiles={dropVcf} onHide={() => setShowDrop(false)} busy={!!busy} title="Kontaktdateien (.vcf) oder Ordner hierher ziehen" what="vCard (.vcf)"
        accept=".vcf,text/vcard,text/x-vcard" isOk={(f) => /\.vcf$/i.test(f.name) || /vcard/i.test(f.type)} emptyMsg="Keine .vcf-Kontaktdateien gefunden." />
        : null}
      {busy && <ImportBar {...busy} />}
      <FitScroll card cols={["Name", "Art · Ort", "Offen"]}>
      <section className="tile ctlist">
        {!shown.length && <p className="muted small">{list.length ? "Keine Treffer." : "Noch keine Kontakte. Mit „＋ Kontakt“ anlegen, mit „📱 Aus Handy-Kontakten“ übernehmen – Kunden aus Rechnungen werden hier automatisch gespeichert („Kunde merken“)."}</p>}
        {shown.map((c) => { const inv = invOf(c), open = inv.filter((i) => i.status !== "bezahlt"); return (
          <div key={c.id} className="frow click contactrow" onClick={() => setEdit(c)}>
            <span className="caticon avatar" style={{ width: 42, height: 42 }}>{(c.name || "?").trim().slice(0, 1).toUpperCase()}</span>
            <div className="grow">
              <b>{c.name}</b> <small style={{ color: typeOf(c).color }}><TypeGlyph t={typeOf(c)} /> {typeOf(c).name}</small> <small className="muted">{c.number || ""}</small>
              <small className="muted block">{[c.contact, cityOf(c.address)].filter(Boolean).join(" · ")}</small>
              <div className="cactions" onClick={(e) => e.stopPropagation()}>
                {c.email && <a className="chip" href={`mailto:${c.email}`}>✉️ {c.email}</a>}
                {(c.phone || c.mobile) && <a className="chip" href={`tel:${(c.mobile || c.phone).replace(/\s/g, "")}`}>📞 {c.mobile || c.phone}</a>}
                {setTab && <button className="chip" onClick={() => { ls.set("pendingInvoice", { kind: "rechnung", customer: c }); setTab("invoices"); }}>🧾 Rechnung</button>}
                <button className="chip" onClick={() => vcard(c)}>📇 vCard</button>
              </div>
            </div>
            {!!inv.length && <div className="right"><b>{fmtMoney(inv.reduce((s, i) => s + invTotal(i), 0))}</b><small className={"block " + (open.length ? "warnc" : "muted")}>{inv.length} Rechnung{inv.length === 1 ? "" : "en"}{open.length ? ` · ${open.length} offen` : ""}</small></div>}
          </div>); })}
      </section>
      </FitScroll>
      </>)}
      {picked && <ContactImportWin items={picked} existing={list} onClose={() => setPicked(null)} onImport={(sel) => {
        let n = list.reduce((m, c) => Math.max(m, parseInt(String(c.number || "").replace(/\D/g, ""), 10) || 0), 0);
        setList((l) => [...l, ...sel.map((c) => { const { on, ...rest } = c; return { id: uid(), type: "Kunde", number: "K-" + String(++n).padStart(3, "0"), ...rest }; })]);
        setPicked(null);
      }} />}
      {edit && <ContactEditor c={edit} onSave={save} onDelete={(c) => setList((l) => l.filter((x) => x.id !== c.id))} onClose={() => setEdit(null)} />}
    </div>
  );
}

/* ======================= Rechnungsdesign (Einstellungen) ======================= */
const SAMPLE_INV = () => ({ kind: "rechnung", number: "RE-2026-001", status: "offen", date: todayISO(), serviceFrom: todayISO(), dueDays: 14,
  customer: { name: "Muster GmbH", address: "Hauptplatz 1\n4020 Linz", number: "K-001" },
  items: [{ text: "Elektroinstallation Küche", qty: 6, unit: "Std", price: 65, artNo: "ART-001" }, { text: "Material lt. Aufstellung", qty: 1, unit: "Pausch.", price: 120.5 }, { text: "Anfahrt", qty: 1, unit: "Pausch.", price: 35 }], reminders: [] });
function PdfPreview({ build, deps }) {
  const [src, setSrc] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    let dead = false; setBusy(true);
    const t = setTimeout(async () => { try { const b = await build(); const p = await blobToImages(b, 900, 1); if (!dead) setSrc(p[0]); } catch {} if (!dead) setBusy(false); }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, deps);
  return <div className={"pdfprev" + (busy ? " busy" : "")}>{src ? <img src={src} alt="Vorschau" /> : <div className="dpload">Vorschau wird erstellt …</div>}</div>;
}
function InvoiceDesignSettings() {
  const [d, setD] = useLsState("invoiceDesign", {});
  const D = { ...DESIGN_DEF, ...d };
  const co = { ...CO_DEFAULT, name: "Deine Firma e.U.", street: "Musterstraße 1", zip: "4020", city: "Linz", iban: "AT61 1904 3002 3457 3201", ...ls.get("company", {}) };
  const set = (p) => setD((x) => ({ ...x, ...p }));
  const tog = (k, l) => <label className="check mini"><input type="checkbox" checked={!!D[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {l}</label>;
  const seg = (k, opts) => <div className="seg">{opts.map(([v, l]) => <button key={v} className={D[k] === v ? "on" : ""} onClick={() => set({ [k]: v })}>{l}</button>)}</div>;
  return (
    <div className="designmod">
      <div className="dmctl">
        <small className="muted">Vorlage</small>
        <div className="presetrow">{Object.entries(INV_PRESETS).map(([k, p]) => (
          <button key={k} className={"presetcard" + (D.preset === k ? " on" : "")} onClick={() => { const { label, ...pp } = p; setD({ ...d, preset: k, ...pp, font: p.font || "helvetica" }); }}>
            <span className={"pcmini pc-" + k} style={{ "--a": D.accent }}><i /><i /><i /></span>{p.label}</button>))}</div>
        <small className="muted">Akzentfarbe</small>
        <div className="swatches">
          {ACC_COLORS.map((c) => <button key={c} className={"sw" + (D.accent === c ? " on" : "")} style={{ background: c }} onClick={() => set({ accent: c })} />)}
          <ColorDot className={"sw custom" + (!ACC_COLORS.includes(D.accent) ? " on" : "")} title="Eigene Farbe" value={D.accent} onInput={(c) => set({ accent: c })}>＋</ColorDot>
        </div>
        <small className="muted">Schrift</small>{seg("font", [["helvetica", "Helvetica"], ["times", "Times"], ["courier", "Courier"]])}
        <small className="muted">Logo-Position</small>{seg("logoPos", [["links", "Links"], ["mitte", "Mitte"], ["rechts", "Rechts"]])}
        <label className="rangel">Logo-Größe <input type="range" min="24" max="110" value={D.logoSize} onChange={(e) => set({ logoSize: Number(e.target.value) })} /><b>{D.logoSize}</b></label>
        <label className="rangel">Schriftgröße <input type="range" min="8" max="12" step="0.5" value={D.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} /><b>{D.fontSize}</b></label>
        <label className="rangel">Titelgröße <input type="range" min="12" max="28" value={D.titleSize} onChange={(e) => set({ titleSize: Number(e.target.value) })} /><b>{D.titleSize}</b></label>
        <small className="muted">Tabelle</small>{seg("tableStyle", [["linien", "Linien"], ["streifen", "Streifen"], ["schlicht", "Schlicht"]])}
        <div className="toggles">
          {tog("headerBand", "Farbiges Kopfband")}{tog("accentTitle", "Titel in Akzentfarbe")}{tog("totalBox", "Summe hervorheben")}
          {tog("showPos", "Spalte Pos.")}{tog("showUnit", "Spalte Einheit")}{tog("showSenderLine", "Absenderzeile (Fensterkuvert)")}
          {tog("showQR", "Zahlen-QR-Code")}{tog("showFooter", "Fußzeile mit Firmendaten")}{tog("showKU", "Kleinunternehmer-Hinweis")}{tog("showArtNo", "Artikelnummer drucken")}
        </div>
        <div className="grid2">
          <label>Titel Rechnung<input value={D.titleR} onChange={(e) => set({ titleR: e.target.value })} /></label>
          <label>Titel Angebot<input value={D.titleA} onChange={(e) => set({ titleA: e.target.value })} /></label>
        </div>
        <label>Zusatzzeile ganz unten (optional)<input value={D.footerNote} placeholder="z. B. Gerichtsstand Linz · Es gelten unsere AGB" onChange={(e) => set({ footerNote: e.target.value })} /></label>
        {!D.showKU && <p className="warn small">Als Kleinunternehmer ist der Hinweis auf die Steuerbefreiung auf der Rechnung Pflicht.</p>}
        <div className="actions">
          <button className="btn" onClick={async () => openPdf(await buildInvoicePdf(SAMPLE_INV(), co, null, D), "Muster-Rechnung.pdf")}>Groß ansehen</button>
          <button className="link" onClick={() => confirm("Design auf Standard (Klassisch) zurücksetzen?") && setD({})}>Zurücksetzen</button>
        </div>
      </div>
      <PdfPreview build={() => buildInvoicePdf(SAMPLE_INV(), co, null, D)} deps={[JSON.stringify(D)]} />
    </div>
  );
}

/* ======================= Mahnwesen (Einstellungen) ======================= */
function DunningSettings() {
  const [raw, setRaw] = useLsState("dunning", {});
  const dn = { ...DUN_DEFAULT, ...raw, levels: raw.levels?.length ? raw.levels : DUN_DEFAULT.levels };
  const set = (p) => setRaw((x) => ({ ...dn, ...x, ...p }));
  const setL = (i, p) => set({ levels: dn.levels.map((l, k) => (k === i ? { ...l, ...p } : l)) });
  const [open, setOpen] = useState(0);
  const co = { ...CO_DEFAULT, name: "Deine Firma e.U.", street: "Musterstraße 1", zip: "4020", city: "Linz", iban: "AT61 1904 3002 3457 3201", ...ls.get("company", {}) };
  const sample = (i) => { const inv = { ...SAMPLE_INV(), date: addDays(todayISO(), -40) }; const rs = dn.levels.slice(0, i + 1).map((l, k) => ({ level: k, date: todayISO(), due: addDays(todayISO(), l.days), fee: l.fee })); return [{ ...inv, reminders: rs }, rs[i]]; };
  return (<>
    <p className="muted small">Stufen, Fristen, Mahnspesen und Texte für Zahlungserinnerungen und Mahnungen. Platzhalter im Text: <code>{"{nummer}"}</code> <code>{"{datum}"}</code> <code>{"{betrag}"}</code> <code>{"{faellig}"}</code> <code>{"{frist}"}</code> <code>{"{kunde}"}</code>. Das Aussehen kommt aus „Rechnungsdesign“.</p>
    <div className="grid2">
      <label>Wartezeit bis zur nächsten Stufe (Tage)<input type="number" value={dn.waitDays} onChange={(e) => set({ waitDays: Number(e.target.value) })} /></label>
      <label>Anrede<input value={dn.salutation} onChange={(e) => set({ salutation: e.target.value })} /></label>
    </div>
    {dn.levels.map((l, i) => (
      <fieldset key={l.id || i} className="dunlvl">
        <div className="dunhead" onClick={() => setOpen(open === i ? -1 : i)}><b>Stufe {i + 1}: {l.title}</b><small className="muted">{l.days} Tage{Number(l.fee) ? ` · € ${money(l.fee)} Spesen` : ""}</small><IcoChev open={open === i} /></div>
        {open === i && <>
          <div className="grid2">
            <label>Bezeichnung<input value={l.title} onChange={(e) => setL(i, { title: e.target.value })} /></label>
            <div className="grid2"><label>Frist (Tage)<input type="number" value={l.days} onChange={(e) => setL(i, { days: Number(e.target.value) })} /></label>
              <label>Spesen €<input inputMode="decimal" value={l.fee} onChange={(e) => setL(i, { fee: e.target.value.replace(",", ".") })} /></label></div>
          </div>
          <label>Text<textarea rows={4} value={l.text} onChange={(e) => setL(i, { text: e.target.value })} /></label>
          <div className="actions">
            <button className="btn sm" onClick={async () => { const [inv, r] = sample(i); openPdf(await buildInvoicePdf(inv, co, r), l.title + " Muster.pdf"); }}>Vorschau</button>
            {dn.levels.length > 1 && <button className="link red" onClick={() => confirm(`Stufe „${l.title}“ entfernen?`) && set({ levels: dn.levels.filter((_, k) => k !== i) })}>Stufe entfernen</button>}
          </div>
        </>}
      </fieldset>
    ))}
    <label>Schlusssatz<textarea rows={2} value={dn.closing} onChange={(e) => set({ closing: e.target.value })} /></label>
    <div className="actions">
      {dn.levels.length < 6 && <button className="btn" onClick={() => { set({ levels: [...dn.levels, { id: "l" + uid(), title: `${dn.levels.length}. Mahnung`, days: 10, fee: 10, text: DUN_TEXT[2] }] }); setOpen(dn.levels.length); }}>＋ Stufe</button>}
      <button className="link" onClick={() => confirm("Mahnwesen auf Standard zurücksetzen?") && setRaw({})}>Zurücksetzen</button>
    </div>
  </>);
}

/* ---------- Strichcode / QR-Code scannen (Kamera oder Foto) ---------- */
async function lookupProduct(code, format) {
  const r = await fetch("/api/product", { method: "POST", headers: { "content-type": "application/json", "x-app-token": ls.get("appToken", "") }, body: JSON.stringify({ code, format }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Suche fehlgeschlagen (" + r.status + ")");
  return j;
}
function CodeScanWin({ onResult, onClose, title = "Code scannen", multi = false }) {
  const vid = useRef(), ctl = useRef(), fileRef = useRef();
  const [err, setErr] = useState(""), [manual, setManual] = useState("");
  const done = useRef(false);
  const finish = (text, fmt) => { if (done.current || !text) return; done.current = true; if (multi) setTimeout(() => (done.current = false), 1300); else try { ctl.current?.stop(); } catch {} navigator.vibrate?.(60); onResult(String(text).trim(), fmt || ""); if (multi) setManual(""); };
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const r = new BrowserMultiFormatReader();
        const c = await r.decodeFromConstraints({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } }, vid.current, (res) => { if (res && !dead) finish(res.getText(), BarcodeFormat[res.getBarcodeFormat()]); });
        if (dead) c.stop(); else ctl.current = c;
      } catch (e) { if (!dead) setErr(/Permission|NotAllowed/i.test(e.name + e.message) ? "Kamera-Zugriff verweigert – in den Browser-Einstellungen erlauben oder ein Foto wählen." : "Kamera nicht verfügbar – Foto wählen oder Code eintippen."); }
    })();
    return () => { dead = true; try { ctl.current?.stop(); } catch {} };
  }, []);
  return (
    <Win id="codescan" onClose={onClose} small center dirty={false}>
      <div className="panelhead"><b>{title}</b><XBtn /></div>
      <div className="scanview">
        <video ref={vid} playsInline muted />
        <div className="scanframe" />
        {err && <div className="scanerr">{err}</div>}
      </div>
      <p className="muted small">Strichcode (EAN) oder QR-Code in den Rahmen halten – wird automatisch erkannt.</p>
      <div className="libadd">
        <input value={manual} inputMode="numeric" placeholder="oder Code eintippen" onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === "Enter" && finish(manual, "manuell")} />
        <button className="btn sm" disabled={!manual.trim()} onClick={() => finish(manual, "manuell")}>OK</button>
        <button className="btn sm" onClick={() => fileRef.current.click()}>🖼 Foto</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files[0]; e.target.value = ""; if (!f) return;
          try { const [{ BrowserMultiFormatReader }, { BarcodeFormat }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
            const u = URL.createObjectURL(f); const res = await new BrowserMultiFormatReader().decodeFromImageUrl(u); URL.revokeObjectURL(u); finish(res.getText(), BarcodeFormat[res.getBarcodeFormat()]);
          } catch { setErr("Auf dem Foto wurde kein Code gefunden."); }
        }} />
      </div>
    </Win>
  );
}
/* ======================= Artikel (Einstellungen + Reiter) ======================= */
const ART_DEF = { prefix: "ART-", autoNo: true, defUnit: "Std", groups: ["Leistungen", "Material"] };
const artCfg = () => ({ ...ART_DEF, ...ls.get("articleCfg", {}) });
function ArticleSettings() {
  const [cfg, setCfg] = useLsState("articleCfg", {});
  const C = { ...ART_DEF, ...cfg };
  const set = (p) => setCfg((x) => ({ ...C, ...x, ...p }));
  const [ng, setNg] = useState("");
  const [units] = useUnits();
  return (<>
    <p className="muted small">Einstellungen für den Reiter „Artikel“. Eigene Felder je Position (z. B. Seriennr.) legst du unter Rechnungen › Eigene Felder an – sie erscheinen auch bei jedem Artikel.</p>
    <div className="grid2">
      <label>Kürzel Artikelnummer<input value={C.prefix} onChange={(e) => set({ prefix: e.target.value })} /></label>
      <label>Standard-Einheit<select value={C.defUnit} onChange={(e) => set({ defUnit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</select></label>
    </div>
    <label className="check"><input type="checkbox" checked={!!C.autoNo} onChange={(e) => set({ autoNo: e.target.checked })} /> Artikelnummer automatisch vergeben ({C.prefix}001, {C.prefix}002 …)</label>
    <div className="unitsed"><small className="muted">Artikelgruppen</small>
      <div className="chips">{C.groups.map((g) => <span key={g} className="chip unitchip">{g}<button title="Entfernen" onClick={() => set({ groups: C.groups.filter((x) => x !== g) })}>×</button></span>)}</div>
      <div className="libadd"><input value={ng} placeholder="Neue Gruppe, z. B. Beleuchtung" onChange={(e) => setNg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ng.trim() && !C.groups.includes(ng.trim())) { set({ groups: [...C.groups, ng.trim()] }); setNg(""); } }} />
        <button className="btn sm" disabled={!ng.trim()} onClick={() => { if (!C.groups.includes(ng.trim())) set({ groups: [...C.groups, ng.trim()] }); setNg(""); }}>Hinzufügen</button></div>
    </div>
    <UnitsEditor />
  </>);
}
function ArticleEditor({ a: init, onSave, onDelete, onClose }) {
  const [a, setA] = useState(() => { const { autoLookup, ...x } = init; return x; });
  const set = (p) => setA((x) => ({ ...x, ...p }));
  const [scan, setScan] = useState(false), [look, setLook] = useState(null); // {busy}|{data}|{error}
  const photoRef = useRef();
  const wasStock = !!ls.get("articles", []).find((x) => x.id === init.id)?.stock;
  const doSave = () => {
    const { initQty, ...n } = a; const mv = [];
    for (const k of ["ek", "min", "max"]) if (n[k] != null && n[k] !== "") n[k] = Number(String(n[k]).replace(",", ".")) || 0;
    if (n.stock && !wasStock) { n.stockFrom = n.stockFrom || todayISO(); const q = Number(String(initQty ?? "").replace(",", ".")) || 0;
      if (q) mv.push({ id: uid(), art: n.id, type: "anfang", qty: q, date: n.stockFrom, note: "Anfangsbestand", created: new Date().toISOString() }); }
    onSave(n, mv); onClose();
  };
  const locList = [...new Set(ls.get("articles", []).map((x) => x.loc).filter(Boolean))], supList = [...new Set([...ls.get("articles", []).map((x) => x.supplier), ...ls.get("customers", []).filter((c) => c.type === "Lieferant").map((c) => c.name)].filter(Boolean))];
  const runLookup = async (code, fmt) => {
    set({ ean: code }); setLook({ busy: true });
    try {
      const d = await lookupProduct(code, fmt); setLook({ data: d });
      if (d.found) setA((x) => ({ ...x, ean: code, text: x.text || d.name || x.text, price: x.price !== "" && x.price != null ? x.price : d.price_eur ?? "", unit: d.unit && !x.text ? d.unit : x.unit,
        note: x.note || [d.brand && "Marke: " + d.brand, d.manufacturer_number && "Herst.-Nr.: " + d.manufacturer_number, d.description, d.price_source && "Preis lt. " + d.price_source, d.url].filter(Boolean).join("\n") }));
    } catch (e) { setLook({ error: e.message }); }
  };
  useEffect(() => { if (init.autoLookup && init.ean) runLookup(init.ean, init.eanFormat); }, []);
  const [fields] = useLsState("invoiceFields", []);
  const posFields = fields.filter((f) => f.scope === "position");
  const C = artCfg();
  return (
    <Win id="artedit" onClose={onClose} dirty={JSON.stringify(a) !== JSON.stringify(init)}>
      <div className="panelhead"><b>{init.text || "Neuer Artikel"}</b><button className="btn primary" disabled={!a.text?.trim()} onClick={doSave}>Speichern</button><XBtn /></div>
      <div className="scanrow">
        <label className="grow">EAN / Strichcode<input value={a.ean || ""} inputMode="numeric" placeholder="scannen oder eintippen" onChange={(e) => set({ ean: e.target.value })} /></label>
        <button className="btn" onClick={() => setScan(true)}>📷 Scannen</button>
        <button className="btn" disabled={!a.ean || look?.busy} onClick={() => runLookup(a.ean, "manuell")}>🔎 Daten suchen</button>
      </div>
      {look?.busy && <div className="lookbox">🔎 Suche Artikeldaten zu {a.ean} … (Produktdatenbanken + Websuche, bis zu 30 s)</div>}
      {look?.error && <div className="lookbox err">Suche nicht möglich: {look.error}</div>}
      {look?.data && (look.data.found ? (
        <div className="lookbox ok"><b>Gefunden{look.data.source ? " · " + look.data.source : ""}:</b> {look.data.name}{look.data.price_eur ? ` · ca. € ${money(look.data.price_eur)}` : ""}
          <button className="link small" onClick={() => setA((x) => ({ ...x, text: look.data.name || x.text, price: look.data.price_eur ?? x.price, unit: look.data.unit || x.unit }))}>Alles übernehmen</button>
          <small className="muted block">Leere Felder wurden ausgefüllt – Preise bitte prüfen.</small></div>
      ) : <div className="lookbox">Zu diesem Code wurden keine Daten gefunden – bitte selbst ausfüllen.</div>)}
      <label>Bezeichnung<input value={a.text || ""} placeholder="z. B. Elektroinstallation, LED-Panel 60x60" onChange={(e) => set({ text: e.target.value })} /></label>
      <div className="grid2">
        <label>Artikelnummer<input value={a.number || ""} onChange={(e) => set({ number: e.target.value })} /></label>
        <label>Gruppe<select value={a.group || ""} onChange={(e) => {
          if (e.target.value !== "__new") return set({ group: e.target.value });
          const n = (prompt("Neue Artikelgruppe:") || "").trim(); if (!n) return;
          if (!C.groups.includes(n)) ls.set("articleCfg", { ...ls.get("articleCfg", {}), groups: [...C.groups, n] }); set({ group: n });
        }}><option value="">– keine –</option>{[...new Set([...C.groups, a.group].filter(Boolean))].map((g) => <option key={g}>{g}</option>)}<option value="__new">＋ Neue Gruppe …</option></select></label>
      </div>
      <div className="grid2">
        <label>Preis €<input inputMode="decimal" value={a.price ?? ""} onChange={(e) => set({ price: e.target.value.replace(",", ".") })} /></label>
        <label>Einheit<UnitSelect value={a.unit || C.defUnit} onChange={(u) => set({ unit: u })} /></label>
      </div>
      {!!posFields.length && <div className="grid2">{posFields.map((f) => <label key={f.id}>{f.label}<input value={a.extra?.[f.id] || ""} onChange={(e) => set({ extra: { ...(a.extra || {}), [f.id]: e.target.value } })} /></label>)}</div>}
      <div className="artstock">
        <div className="row">
          <span className="click" onClick={() => photoRef.current.click()} title="Foto ändern"><ArtIco a={a} size={54} /></span>
          <div className="grow"><button className="btn sm" onClick={() => photoRef.current.click()}>📷 {a.photo ? "Foto ändern" : "Foto hinzufügen"}</button>{a.photo && <button className="link red small" onClick={() => set({ photo: "" })}> entfernen</button>}</div>
          <input ref={photoRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) try { set({ photo: await resizeImg(f) }); } catch {} }} />
        </div>
        <div className="grid2">
          <label>Einkaufspreis netto €<input inputMode="decimal" value={a.ek ?? ""} onChange={(e) => set({ ek: e.target.value })} /></label>
          <label>Lieferant<input list="artsup" value={a.supplier || ""} onChange={(e) => set({ supplier: e.target.value })} /><datalist id="artsup">{supList.map((x) => <option key={x} value={x} />)}</datalist></label>
        </div>
        {a.ek !== "" && a.ek != null && Number(a.price) > 0 && <small className="muted">Marge: {fmtMoney(Number(a.price) - Number(String(a.ek).replace(",", ".")))} ({Math.round((1 - Number(String(a.ek).replace(",", ".")) / Number(a.price)) * 100)} %)</small>}
        <label className="check"><input type="checkbox" checked={!!a.stock} onChange={(e) => set({ stock: e.target.checked, autoSales: a.autoSales ?? true })} /> <b>Lagerartikel</b> – Bestand in „Lager & Inventur“ führen</label>
        {a.stock && <>
          <div className="grid2">
            {!wasStock && <label>Anfangsbestand<input inputMode="decimal" value={a.initQty ?? ""} placeholder="0" onChange={(e) => set({ initQty: e.target.value })} /></label>}
            <label>Lagerort<input list="artloc" value={a.loc || ""} placeholder="z. B. Regal A3, Bus" onChange={(e) => set({ loc: e.target.value })} /><datalist id="artloc">{locList.map((x) => <option key={x} value={x} />)}</datalist></label>
            <label>Mindestbestand<input inputMode="decimal" value={a.min ?? ""} placeholder="Meldebestand" onChange={(e) => set({ min: e.target.value })} /></label>
            <label>Zielbestand<input inputMode="decimal" value={a.max ?? ""} placeholder="für Bestellvorschlag" onChange={(e) => set({ max: e.target.value })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={a.autoSales !== false} onChange={(e) => set({ autoSales: e.target.checked })} /> Verkäufe aus Rechnungen automatisch abbuchen</label>
        </>}
      </div>
      <label>Interne Notiz<textarea rows={2} value={a.note || ""} onChange={(e) => set({ note: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={a.inactive !== true} onChange={(e) => set({ inactive: !e.target.checked })} /> Aktiv (in Rechnungen vorschlagen)</label>
      {init.text && <button className="link red" style={{ marginTop: 12 }} onClick={() => confirm(`Artikel „${a.text}“ löschen?`) && (onDelete(a), onClose())}>Artikel löschen</button>}
      {scan && createPortal(<CodeScanWin title="Artikel scannen" onClose={() => setScan(false)} onResult={(code, fmt) => { setScan(false); runLookup(code, fmt); }} />, document.querySelector(".app") || document.body)}
    </Win>
  );
}
function ArticlesPage({ setTab }) {
  const mob = useMobileBeta();
  const [list, setList] = useLsState("articles", []);
  const invoices = ls.get("invoices", []);
  const C = artCfg();
  const [edit, setEdit] = useState(null), [q, setQ] = useState(""), [grp, setGrp] = useState("alle"), [sort, setSort] = useState("name");
  const [scan, setScan] = useState(false);
  const nextNo = () => C.prefix + String(list.reduce((m, a) => Math.max(m, String(a.number || "").startsWith(C.prefix) ? parseInt(a.number.slice(C.prefix.length), 10) || 0 : 0), 0) + 1).padStart(3, "0");
  const usage = (a) => { let n = 0, sum = 0; for (const i of invoices) if (i.kind === "rechnung" && !["entwurf", "storniert"].includes(i.status)) for (const it of i.items || []) if (it.text === a.text) { n++; sum += (Number(it.qty) || 0) * (Number(it.price) || 0); } return { n, sum }; };
  const save = (a, mv) => { setList((l) => (l.some((x) => x.id === a.id) ? l.map((x) => (x.id === a.id ? a : x)) : [...l, a])); if (mv?.length) ls.set("stockMoves", [...ls.get("stockMoves", []), ...mv]); };
  const allMoves = [...ls.get("stockMoves", []), ...stockSales(list, invoices)];
  const stInfo = (a) => { if (!a.stock) return null; const s = stockAt(a, allMoves); return { s, low: a.min !== "" && a.min != null && s <= Number(a.min), txt: `Bestand ${fmtQty(s)} ${a.unit || ""}` }; };
  const groups = [...new Set([...C.groups, ...list.map((a) => a.group).filter(Boolean)])];
  const shown = list.filter((a) => grp === "alle" || (grp === "ohne" ? !a.group : a.group === grp))
    .filter((a) => !q || norm(`${a.text} ${a.number} ${a.group} ${a.note} ${a.ean}`).includes(norm(q)))
    .map((a) => ({ a, u: usage(a) }))
    .sort((x, y) => (sort === "umsatz" ? y.u.sum - x.u.sum : sort === "preis" ? (Number(y.a.price) || 0) - (Number(x.a.price) || 0) : (x.a.text || "").localeCompare(y.a.text || "", "de")));
  return (
    <div className="ctpage">
      <KStats items={[{ label: "Artikel & Leistungen", value: list.length, sub: `${list.filter((a) => !a.inactive).length} aktiv` }, { label: "Lagerartikel", value: list.filter((a) => a.stock).length },
        { label: "Gruppen", value: groups.length }, { label: "Verrechnet", value: fmtMoney(list.reduce((t, a) => t + usage(a).sum, 0)) }, { label: "Ø Preis", value: fmtMoney(list.length ? list.reduce((t, a) => t + (Number(a.price) || 0), 0) / list.length : 0) }]} />
      {mob ? (
      <div className="mpage">
        <MActs items={[{ label: "＋ Artikel", primary: true, run: () => setEdit({ id: uid(), text: "", unit: C.defUnit, price: "", number: C.autoNo ? nextNo() : "", group: grp !== "alle" && grp !== "ohne" ? grp : "" }) }, { label: "📷 Scannen", run: () => setScan(true) }]} />
        <MBar q={q} setQ={setQ} placeholder="Bezeichnung, Nummer, Gruppe suchen"
          chips={[["alle", "Alle", list.length], ...groups.map((g) => [g, g, list.filter((a) => a.group === g).length]), ["ohne", "Ohne Gruppe", list.filter((a) => !a.group).length]]
            .filter(([k, , n]) => k === "alle" || n || C.groups.includes(k)).map(([k, l, n]) => [k, l, n, grp === k, () => setGrp(k)])}>
          <select className="chip" value={sort} onChange={(e) => setSort(e.target.value)}><option value="name">↕ Name</option><option value="preis">↕ Preis</option><option value="umsatz">↕ Umsatz</option></select>
        </MBar>
        <MScroll>
          {!shown.length && <MEmpty>{list.length ? "Keine Treffer." : "Noch keine Artikel – mit „＋ Artikel“ anlegen."}</MEmpty>}
          {(grp === "alle" && sort === "name" ? mGroup([...shown].sort((x, y) => (x.a.group || "~").localeCompare(y.a.group || "~", "de") || (x.a.text || "").localeCompare(y.a.text || "", "de")), ({ a }) => a.group || "Ohne Gruppe") : [["", shown]]).map(([g, l]) => (
            <React.Fragment key={g || "all"}>
              {g && <MHead right={l.length}>{g}</MHead>}
              {l.map(({ a, u }) => (
                <MItem key={a.id} icon={<ArtIco a={a} />} title={a.text || "Ohne Bezeichnung"} dim={a.inactive} tags={[a.inactive && "inaktiv", stInfo(a) && { label: stInfo(a).txt, color: stInfo(a).low ? "var(--red)" : undefined }]}
                  sub={[a.number, u.n ? `${u.n}× · ${fmtMoney(u.sum)}` : "noch nicht verrechnet"].filter(Boolean).join(" · ")}
                  amount={a.price !== "" && a.price != null ? fmtMoney(Number(a.price)) : "—"} amountSub={"pro " + (a.unit || C.defUnit)} onClick={() => setEdit(a)}
                  swipe={{ left: [{ icon: "⧉", label: "Kopie", bg: "#8b5cf6", run: () => setEdit({ ...a, id: uid(), number: C.autoNo ? nextNo() : "", text: (a.text || "") + " (Kopie)" }) }],
                    right: [{ icon: a.inactive ? "▶" : "⏸", label: a.inactive ? "Aktiv" : "Inaktiv", bg: "#64748b", run: () => save({ ...a, inactive: !a.inactive }) }] }} />
              ))}
            </React.Fragment>
          ))}
        </MScroll>
      </div>
      ) : (<>
      <div className="invbar">
        <button className="btn primary" onClick={() => setEdit({ id: uid(), text: "", unit: C.defUnit, price: "", number: C.autoNo ? nextNo() : "", group: grp !== "alle" && grp !== "ohne" ? grp : "" })}>＋ Artikel</button>
        <button className="btn" onClick={() => setScan(true)}>📷 Artikel scannen</button>
        <span className="grow" />
        <ExportMenu items={[{ head: `${shown.length} Artikel (aktueller Filter)` },
          { label: "🖨 Preisliste PDF", run: async () => { const by = {}; shown.filter(({ a }) => !a.inactive).forEach(({ a }) => (by[a.group || "Ohne Gruppe"] = by[a.group || "Ohne Gruppe"] || []).push(a));
            const co = { ...CO_DEFAULT, ...ls.get("company", {}) };
            saveBlob(await tablePdf({ title: "Preisliste", subtitle: `${co.name || ""} · gültig ab ${fmtDate(isoToday())}${co.uid ? "" : " · Kleinunternehmer, Preise ohne USt"}`,
              columns: [{ label: "Art.-Nr.", w: 1.2 }, { label: "Bezeichnung", w: 5 }, { label: "Einheit", w: 1 }, { label: "Preis €", w: 1.3, align: "right" }],
              sections: Object.entries(by).map(([g, l]) => ({ heading: g, rows: l.map((a) => [a.number || "", a.text || "", a.unit || "", r2e(a.price)]) })) }), `preisliste-${isoToday()}.pdf`); } },
          { label: "📊 Excel (.xlsx)", sub: "mit Umsatz und Anzahl aus Rechnungen", run: () => downloadXlsx(`artikel-${isoToday()}.xlsx`, [{ name: "Artikel", head: ["Art.-Nr.", "Bezeichnung", "Gruppe", "Einheit", "Preis €", "EAN", "Aktiv", "Rechnungspositionen", "Umsatz €", "Notiz"], rows: shown.map(({ a, u }) => [a.number || "", a.text || "", a.group || "", a.unit || "", r2e(a.price), a.ean || "", a.inactive ? "nein" : "ja", u.n, r2e(u.sum), a.note || ""]) }]) },
          { label: "📄 CSV", run: () => downloadCsv(`artikel-${isoToday()}.csv`, ["Art.-Nr.", "Bezeichnung", "Gruppe", "Einheit", "Preis €", "EAN", "Aktiv"], shown.map(({ a }) => [a.number || "", a.text || "", a.group || "", a.unit || "", r2e(a.price), a.ean || "", a.inactive ? "nein" : "ja"])) }]} />
        <select className="chip" value={sort} onChange={(e) => setSort(e.target.value)}><option value="name">Name</option><option value="preis">Preis</option><option value="umsatz">Umsatz</option></select>
        {setTab && <button className="chip" onClick={() => setTab("inventur")}>📋 Lager</button>}
        {setTab && <button className="chip" title="Einstellungen" onClick={() => { ls.set("openSettingsSec", "artikel"); setTab("settings"); }}>⚙︎</button>}
      </div>
      <div className="searchbar"><span>🔍</span><input type="search" placeholder="Bezeichnung, Nummer, Gruppe suchen" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="chips invfilter">
        {[["alle", "Alle", list.length], ...groups.map((g) => [g, g, list.filter((a) => a.group === g).length]), ["ohne", "Ohne Gruppe", list.filter((a) => !a.group).length]]
          .filter(([k, , n]) => k === "alle" || n || C.groups.includes(k)).map(([k, l, n]) => <button key={k} className={"chip" + (grp === k ? " on" : "")} onClick={() => setGrp(k)}>{l} <small>({n})</small></button>)}
      </div>
      <FitScroll card cols={["Bezeichnung", "Nummer · Gruppe", "Preis"]}>
      <section className="tile ctlist">
        {!shown.length && <p className="muted small">{list.length ? "Keine Treffer." : "Noch keine Artikel. Mit „＋ Artikel“ anlegen oder beim Schreiben einer Rechnung mit ☆ merken – beim Tippen der Bezeichnung werden sie vorgeschlagen."}</p>}
        {shown.map(({ a, u }) => (
          <div key={a.id} className={"frow click" + (a.inactive ? " ended" : "")} onClick={() => setEdit(a)}>
            <ArtIco a={a} size={42} />
            <div className="grow"><b>{a.text || "Ohne Bezeichnung"}</b>{stInfo(a) && <span className={"stpill " + (stInfo(a).low ? "st-over" : "st-open")} style={{ marginLeft: 8 }}>{stInfo(a).txt}</span>}
              <small className="muted block">{[a.number, a.group, a.loc && "📍 " + a.loc, a.inactive && "inaktiv", u.n ? `${u.n}× verrechnet · ${fmtMoney(u.sum)}` : "noch nicht verrechnet"].filter(Boolean).join(" · ")}</small></div>
            <div className="right"><b>{a.price !== "" && a.price != null ? fmtMoney(Number(a.price)) : "—"}</b><small className="muted block">pro {a.unit || C.defUnit}</small></div>
          </div>
        ))}
      </section>
      </FitScroll>
      </>)}
      {scan && <CodeScanWin title="Artikel scannen" onClose={() => setScan(false)} onResult={(code, fmt) => {
        setScan(false);
        const hit = list.find((a) => a.ean && a.ean === code);
        setEdit(hit || { id: uid(), text: "", unit: C.defUnit, price: "", number: C.autoNo ? nextNo() : "", group: "", ean: code, eanFormat: fmt, autoLookup: true });
      }} />}
      {edit && <ArticleEditor a={edit} onSave={save} onDelete={(a) => setList((l) => l.filter((x) => x.id !== a.id))} onClose={() => setEdit(null)} />}
    </div>
  );
}

/* ======================= Besitz & Garantie (Privat + Firma) ======================= */
const ASSET_CATS = { Elektronik: "💻", Haushalt: "🍳", Werkzeug: "🔧", "Möbel": "🛋️", Fahrzeug: "🚗", "Sport & Freizeit": "⚽", Garten: "🌿", "Schmuck & Wertsachen": "💍", Sonstiges: "📦" };
const ASSET_DEF_WARR = 24; // Gewährleistung in Österreich: 2 Jahre ab Übergabe
const astEmo = (a) => ASSET_CATS[a.cat] || "📦";
const astMonths = (a, k) => Math.max(0, Number(a[k]) || 0);
const astEnd = (a, k) => (a.date && astMonths(a, k) ? addDays(addMonths(a.date, astMonths(a, k)), -1) : "");
const astWarr = (a) => astEnd(a, "warrMonths");          // gesetzliche Gewährleistung
const astExtra = (a) => astEnd(a, "extraMonths");        // Herstellergarantie
const astEndAll = (a) => { const w = astWarr(a), e = astExtra(a); return e && e > w ? e : w; };
const astOut = (a) => !!(a.soldAt || a.inactive);
const astState = (a) => { if (astOut(a)) return "aus"; const e = astEndAll(a); if (!e) return "offen"; const d = daysUntil(e); return d < 0 ? "abgelaufen" : d <= 90 ? "bald" : "aktiv"; };
const astLabel = (a) => (astExtra(a) && astExtra(a) > astWarr(a) ? "Garantie endet (Hersteller)" : "Gewährleistung endet");
// Garantie-Enden als Pseudo-Dokumente für den Fristenkalender und das Kalender-Abo
function assetDlDocs(list) {
  const out = [];
  for (const a of list || []) {
    if (astOut(a)) continue;
    const end = astEndAll(a); if (!end) continue;
    const warn = Number(a.remindDays ?? 30) || 0;
    const pre = warn ? addDays(end, -warn) : "";
    const done = a.dlDone || [];
    out.push({ id: "as:" + a.id, isAsset: true, astId: a.id, title: [astEmo(a), a.name, a.brand].filter(Boolean).join(" ").trim(),
      sender: a.dealer || "", category: "Garantie & Kaufbelege", docType: "Gerät", direction: "keine", amount: null,
      summary: [a.serial && "Seriennr. " + a.serial, a.date && "gekauft am " + fmtDate(a.date), a.price && "um " + fmtMoney(Number(a.price))].filter(Boolean).join(" · "),
      deadlines: [
        ...(pre && pre > a.date ? [{ id: "asdl-pre-" + a.id + "-" + pre, date: pre, label: `Garantie läuft in ${warn} Tagen ab`, done: done.includes(pre) }] : []),
        { id: "asdl-" + a.id + "-" + end, date: end, label: astLabel(a), done: done.includes(end) }
      ] });
  }
  return out;
}
const AstIco = ({ a, size = 46 }) => a.photo ? <img className="artphoto" src={a.photo} alt="" style={{ width: size, height: size }} />
  : <span className="caticon" style={{ width: size, height: size, background: "var(--card2)", fontSize: size * 0.45 }}>{astEmo(a)}</span>;

function AssetEditor({ a: init, docs, onScan, onUpload, onOpenDoc, onSave, onDelete, onClose, notify }) {
  const [a, setA] = useState(init);
  const set = (p) => setA((x) => ({ ...x, ...p }));
  const [busy, setBusy] = useState(false), [touched, setTouched] = useState({});
  const fileRef = useRef(), photoRef = useRef(), filled = useRef(null);
  const tset = (p) => { set(p); setTouched((t) => ({ ...t, ...Object.fromEntries(Object.keys(p).map((k) => [k, true])) })); };
  const doc = a.docId ? (docs || []).find((d) => d.id === a.docId) : null;
  const attach = async (file, opts = {}) => { setBusy(true); filled.current = null; try { const id = await onUpload(file, opts); if (id) set({ docId: id }); } finally { setBusy(false); } };
  useEffect(() => {
    if (!doc || doc.status !== "done" || filled.current === doc.id) return;
    filled.current = doc.id;
    const li = (doc.lineItems || [])[0];
    setA((x) => ({ ...x,
      name: touched.name && x.name ? x.name : x.name || li?.name || doc.title || "",
      date: touched.date ? x.date : pastOrToday(doc.purchaseDate || doc.documentDate, todayISO()),
      price: touched.price && x.price ? x.price : x.price !== "" && x.price != null ? x.price : doc.amount?.total ?? "",
      dealer: touched.dealer && x.dealer ? x.dealer : x.dealer || doc.merchant || doc.sender || "" }));
    notify?.("Beleg ausgelesen" + (doc.amount?.total != null ? ": " + fmtMoney(doc.amount.total) : ""));
  }, [doc?.status, doc?.id]);
  const w = astWarr(a), e = astExtra(a), end = astEndAll(a);
  const cats = [...new Set([...Object.keys(ASSET_CATS), a.cat].filter(Boolean))];
  return (
    <Win id="astedit" onClose={onClose} dirty={JSON.stringify(a) !== JSON.stringify(init)}>
      <div className="panelhead"><b>{init.name || "Neues Gerät"}</b><button className="btn primary" disabled={!a.name?.trim()} onClick={() => { onSave({ ...a, price: a.price === "" || a.price == null ? "" : Number(String(a.price).replace(",", ".")) || 0 }); onClose(); }}>Speichern</button><XBtn /></div>
      <div className="seg scopeseg">{SCOPES.map(([k, i, l]) => <button key={k} className={a.scope === k ? "on" : ""} onClick={() => set({ scope: k })}>{i} {l}</button>)}</div>
      {a.docId || busy ? (
        <div className="expatt">
          {doc?.thumb ? <img src={doc.thumb} alt="" /> : <span className="attpdf">📄</span>}
          <div className="grow"><b>{busy ? "Beleg wird hochgeladen …" : doc?.status === "processing" ? "KI liest den Beleg …" : doc?.status === "error" ? "Auslesen fehlgeschlagen" : "Kaufbeleg angehängt"}</b>
            <small className="muted block">{doc?.status === "processing" ? "Gerät, Preis und Datum werden gleich ausgefüllt" : doc?.status === "done" ? [doc.merchant || doc.sender, doc.amount?.total != null && fmtMoney(doc.amount.total)].filter(Boolean).join(" · ") : ""}</small></div>
          {doc?.status === "processing" && <span className="spin" />}
          {doc && onOpenDoc && <button className="btn sm" onClick={() => onOpenDoc(doc.id)}>Öffnen</button>}
          <button className="iconbtn" title="Beleg entfernen" aria-label="Beleg entfernen" onClick={() => set({ docId: null })}>✕</button>
        </div>
      ) : onUpload && (
        <div className="expscan two">
          <button className="expbig" onClick={() => onScan((f, o) => attach(f, { ...o, scanned: true }))}><span className="expico">📷</span><b>Kaufbeleg scannen</b><small>KI liest Gerät, Preis, Datum & Händler</small></button>
          <button className="expbig" onClick={() => fileRef.current.click()}><span className="expico">🖼</span><b>Foto / PDF</b><small>aus Galerie oder Dateien</small></button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(ev) => { const f = ev.target.files[0]; ev.target.value = ""; if (f) attach(f); }} />
        </div>
      )}
      <label>Bezeichnung<input value={a.name || ""} placeholder="z. B. PlayStation 5, Waschmaschine, Bohrmaschine" onChange={(ev) => tset({ name: ev.target.value })} /></label>
      <div className="row astphoto">
        <span className="click" onClick={() => photoRef.current.click()} title="Foto ändern"><AstIco a={a} size={54} /></span>
        <div className="grow"><button className="btn sm" onClick={() => photoRef.current.click()}>📷 {a.photo ? "Produktfoto ändern" : "Produktfoto hinzufügen"}</button>{a.photo && <button className="link red small" onClick={() => set({ photo: "" })}> entfernen</button>}</div>
        <input ref={photoRef} type="file" accept="image/*" hidden onChange={async (ev) => { const f = ev.target.files[0]; ev.target.value = ""; if (f) try { set({ photo: await resizeImg(f) }); } catch {} }} />
      </div>
      <div className="grid2">
        <label>Kategorie<select value={a.cat || "Sonstiges"} onChange={(ev) => set({ cat: ev.target.value })}>{cats.map((c) => <option key={c}>{(ASSET_CATS[c] || "📦") + " " + c}</option>)}</select></label>
        <label>Marke / Modell<input value={a.brand || ""} placeholder="z. B. Sony CFI-2016" onChange={(ev) => set({ brand: ev.target.value })} /></label>
      </div>
      <div className="grid2">
        <label>Kaufdatum<input type="date" value={a.date || ""} max={todayISO()} onChange={(ev) => tset({ date: ev.target.value })} /></label>
        <label>Kaufpreis €<input inputMode="decimal" value={a.price ?? ""} onChange={(ev) => tset({ price: ev.target.value })} /></label>
        <label>Händler<input value={a.dealer || ""} placeholder="z. B. MediaMarkt" onChange={(ev) => tset({ dealer: ev.target.value })} /></label>
        <label>Seriennummer<input value={a.serial || ""} onChange={(ev) => set({ serial: ev.target.value })} /></label>
      </div>
      <div className="astwarr">
        <small className="muted">Garantie</small>
        <div className="grid2">
          <label>Gewährleistung (Monate)<input inputMode="numeric" value={a.warrMonths ?? ASSET_DEF_WARR} onChange={(ev) => set({ warrMonths: ev.target.value })} /></label>
          <label>Herstellergarantie (Monate)<input inputMode="numeric" value={a.extraMonths ?? ""} placeholder="falls länger" onChange={(ev) => set({ extraMonths: ev.target.value })} /></label>
        </div>
        <label>Vorwarnung (Tage vorher)<input inputMode="numeric" value={a.remindDays ?? 30} onChange={(ev) => set({ remindDays: ev.target.value })} /></label>
        {a.date ? (
          <p className="small">{w ? <>Gewährleistung bis <b>{fmtDate(w)}</b></> : "Keine Gewährleistung eingetragen"}{e ? <> · Herstellergarantie bis <b>{fmtDate(e)}</b></> : ""}
            {end && <><br /><span className={daysUntil(end) < 0 ? "neg" : daysUntil(end) <= 90 ? "" : "pos"}>{daysUntil(end) < 0 ? `seit ${-daysUntil(end)} Tagen abgelaufen` : `noch ${daysUntil(end)} Tage`}</span> · erscheint im Fristen-Kalender</>}</p>
        ) : <p className="muted small">Kaufdatum eintragen – daraus wird das Garantieende berechnet.</p>}
      </div>
      <label>Notiz<textarea rows={2} value={a.note || ""} placeholder="z. B. Standort, Zubehör, Garantiebedingungen" onChange={(ev) => set({ note: ev.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={!!a.soldAt} onChange={(ev) => set({ soldAt: ev.target.checked ? todayISO() : "" })} /> Verkauft / ausgeschieden</label>
      {a.soldAt && <div className="grid2">
        <label>Datum<input type="date" value={a.soldAt} max={todayISO()} onChange={(ev) => set({ soldAt: ev.target.value })} /></label>
        <label>Verkaufspreis €<input inputMode="decimal" value={a.soldPrice ?? ""} onChange={(ev) => set({ soldPrice: ev.target.value })} /></label>
      </div>}
      {init.name && <button className="link red" style={{ marginTop: 12 }} onClick={() => confirm(`„${a.name}“ wirklich löschen?`) && (onDelete(a), onClose())}>Gerät löschen</button>}
    </Win>
  );
}

function AssetsPage({ docs, onOpen, onScan, onUpload, notify, calSync, setCalSync, token }) {
  const mob = useMobileBeta();
  const [list, setList] = useLsState("besitz", []);
  const [scope, setScope] = useLsState("astScope", "alle");
  const [filter, setFilter] = useState("alle"), [q, setQ] = useState("");
  const [mode, setMode] = useLsState("astView", "list");
  const [edit, setEdit] = useState(null), [syncOpen, setSyncOpen] = useState(false);
  useEffect(() => { const id = ls.get("assetOpenReq", null); if (!id) return; ls.set("assetOpenReq", null); const x = list.find((y) => y.id === id); if (x) setEdit(x); }, []);
  const save = (a) => setList((l) => (l.some((x) => x.id === a.id) ? l.map((x) => (x.id === a.id ? a : x)) : [...l, a]));
  const inScope = list.filter((a) => scope === "alle" || (a.scope || "privat") === scope);
  const byState = (st) => inScope.filter((a) => astState(a) === st);
  const shown = inScope.filter((a) => (filter === "alle" ? !astOut(a) : filter === "aus" ? astOut(a) : astState(a) === filter))
    .filter((a) => !q || norm(`${a.name} ${a.brand} ${a.serial} ${a.dealer} ${a.cat} ${a.note}`).includes(norm(q)))
    .sort((x, y) => (astEndAll(x) || "9999").localeCompare(astEndAll(y) || "9999") || (x.name || "").localeCompare(y.name || "", "de"));
  const value = inScope.filter((a) => !astOut(a)).reduce((s, a) => s + (Number(a.price) || 0), 0);
  const dlDocsA = useMemo(() => assetDlDocs(inScope), [inScope]);
  const calItems = dlDocsA.flatMap((d) => d.deadlines.map((dl) => [dl, d]));
  const newAsset = () => setEdit({ id: uid(), name: "", scope: scope === "firma" ? "firma" : "privat", cat: "Elektronik", date: todayISO(), price: "", warrMonths: ASSET_DEF_WARR, remindDays: 30 });
  const rows = () => shown.map((a) => [a.name, a.brand || "", a.cat || "", (a.scope || "privat") === "firma" ? "Firma" : "Privat", a.date || "", Number(a.price) || "", a.dealer || "", a.serial || "", astWarr(a) || "", astExtra(a) || "", astOut(a) ? "ausgeschieden" : astState(a), a.note || ""]);
  const head = ["Bezeichnung", "Marke/Modell", "Kategorie", "Bereich", "Kaufdatum", "Kaufpreis €", "Händler", "Seriennr.", "Gewährleistung bis", "Herstellergarantie bis", "Status", "Notiz"];
  const scopeName = scope === "alle" ? "privat-firma" : scope;
  const exportItems = [{ head: `${shown.length} Geräte · ${scope === "alle" ? "Privat & Firma" : scope === "firma" ? "Firma" : "Privat"}` },
    { label: "🖨 Inventarliste PDF", sub: "mit Kaufwert und Garantieende", run: async () => { const by = {};
      shown.forEach((a) => (by[a.cat || "Sonstiges"] = by[a.cat || "Sonstiges"] || []).push(a));
      saveBlob(await tablePdf({ title: "Inventarliste", subtitle: `${scope === "alle" ? "Privat & Firma" : scope === "firma" ? "Firma" : "Privat"} · Stand ${fmtDate(todayISO())}`, landscape: true,
        kpis: [["Geräte", String(shown.length)], ["Kaufwert", fmtMoney(shown.reduce((s, a) => s + (Number(a.price) || 0), 0))], ["In Garantie", String(shown.filter((a) => ["aktiv", "bald"].includes(astState(a))).length)]],
        columns: [{ label: "Bezeichnung", w: 3 }, { label: "Marke / Modell", w: 2 }, { label: "Seriennr.", w: 1.6 }, { label: "Gekauft", w: 1.1 }, { label: "Händler", w: 1.6 }, { label: "Preis €", w: 1.1, align: "right" }, { label: "Garantie bis", w: 1.2 }],
        sections: Object.entries(by).map(([g, l]) => ({ heading: (ASSET_CATS[g] ? "" : "") + g, rows: l.map((a) => [a.name, a.brand || "", a.serial || "", a.date ? fmtDate(a.date) : "", a.dealer || "", Number(a.price) || "", astEndAll(a) ? fmtDate(astEndAll(a)) : "—"]) })),
        note: "Gewährleistung in Österreich: 2 Jahre ab Übergabe. Eine Herstellergarantie kann länger laufen – es gilt das jeweils spätere Datum.\nFür Versicherungs- oder Steuerzwecke bitte zusätzlich die Original-Kaufbelege aufbewahren." }), `inventarliste-${scopeName}-${todayISO()}.pdf`); } },
    { label: "📊 Excel (.xlsx)", run: () => downloadXlsx(`besitz-${scopeName}-${todayISO()}.xlsx`, [{ name: "Besitz", head, rows: rows() }]) },
    { label: "📄 CSV", run: () => downloadCsv(`besitz-${scopeName}-${todayISO()}.csv`, head, rows()) },
    { label: "📅 Garantie-Termine (.ics)", sub: "einmalig herunterladen", disabled: !calItems.length, run: () => downloadIcs(calItems, `garantie-${scopeName}.ics`) }];
  const stats = [{ label: "Kaufwert", value: fmtMoney(value), sub: `${inScope.filter((a) => !astOut(a)).length} Geräte${scope === "alle" ? " (Privat & Firma)" : ""}` },
    { label: "In Garantie", value: byState("aktiv").length + byState("bald").length, sub: "von " + inScope.filter((a) => !astOut(a)).length, onClick: () => setFilter("alle") },
    { label: "Läuft bald ab", value: byState("bald").length, vcls: byState("bald").length ? "neg" : "", alert: !!byState("bald").length, sub: "in 90 Tagen", onClick: () => setFilter("bald") },
    { label: "Abgelaufen", value: byState("abgelaufen").length, sub: "ohne Garantie", onClick: () => setFilter("abgelaufen") },
    { label: "Ausgeschieden", value: inScope.filter(astOut).length, sub: "verkauft / entsorgt", onClick: () => setFilter("aus") }];
  const chips = [["alle", "Alle", inScope.filter((a) => !astOut(a)).length], ["bald", "Läuft bald ab", byState("bald").length], ["aktiv", "In Garantie", byState("aktiv").length], ["abgelaufen", "Abgelaufen", byState("abgelaufen").length], ["aus", "Ausgeschieden", inScope.filter(astOut).length]];
  const sub = (a) => { const end = astEndAll(a), st = astState(a); return [a.brand, a.date && "gekauft " + fmtDate(a.date), astOut(a) ? (a.soldAt ? "ausgeschieden " + fmtDate(a.soldAt) : "ausgeschieden") : end ? (st === "abgelaufen" ? "Garantie abgelaufen " + fmtDate(end) : "Garantie bis " + fmtDate(end)) : "kein Garantieende"].filter(Boolean).join(" · "); };
  const pill = (a) => { const st = astState(a); if (st === "bald") return <span className="stpill st-over">in {daysUntil(astEndAll(a))} T.</span>; if (st === "aktiv") return <span className="stpill st-paid">Garantie</span>; return null; };
  const cal = <MonthCalendar items={calItems} docs={dlDocsA} onOpen={(id) => { const x = list.find((y) => "as:" + y.id === id); if (x) setEdit(x); }} saveDoc={() => notify?.("Das Garantieende ergibt sich aus Kaufdatum und Dauer – bitte im Gerät ändern")} />;
  const empty = <MEmpty>{list.length ? "Keine Treffer in dieser Ansicht." : "Noch nichts erfasst. Mit „＋ Gerät“ anlegen oder den Kaufbeleg scannen – das Garantieende landet automatisch im Fristen-Kalender."}</MEmpty>;
  const scopeSeg = <div className="seg scopeseg">{[["alle", "", "Privat & Firma"], ...SCOPES].map(([k, i, l]) => <button key={k} className={scope === k ? "on" : ""} onClick={() => setScope(k)}>{i} {l} <small>({list.filter((a) => k === "alle" || (a.scope || "privat") === k).length})</small></button>)}</div>;
  const viewSeg = <div className="seg" role="group" aria-label="Ansicht"><button className={mode === "list" ? "on" : ""} onClick={() => setMode("list")}>☰ Liste</button><button className={mode === "cal" ? "on" : ""} onClick={() => setMode("cal")}>📅 Kalender</button></div>;
  return (
    <div className="ctpage astpage">
      {mob ? (
      <div className="mpage">
        {scopeSeg}
        <MStats items={stats.slice(0, 4)} />
        <MActs items={[{ label: "＋ Gerät", primary: true, run: newAsset }, { label: "📷 Beleg scannen", run: () => { newAsset(); setTimeout(() => document.querySelector(".win .expbig, .sheet .expbig")?.click(), 60); } }, { label: mode === "cal" ? "☰ Liste" : "📅 Kalender", run: () => setMode(mode === "cal" ? "list" : "cal") }]} />
        <MBar q={q} setQ={setQ} placeholder="Gerät, Marke, Seriennummer suchen" chips={chips.filter(([k, , n]) => n || k === "alle").map(([k, l, n]) => [k, l, n, filter === k, () => setFilter(k)])}><ExportMenu items={exportItems} /></MBar>
        {mode === "cal" ? cal : (
          <MScroll>
            {!shown.length && empty}
            {shown.map((a) => (
              <MItem key={a.id} icon={<AstIco a={a} />} title={a.name} dim={astOut(a)} tags={[(a.scope || "privat") === "firma" && "Firma", a.docId && "📎"]}
                sub={sub(a)} amount={a.price !== "" && a.price != null ? fmtMoney(Number(a.price)) : "—"} pill={pill(a)} onClick={() => setEdit(a)}
                swipe={{ left: [a.docId && { icon: "👁", label: "Beleg", bg: "#0ea5e9", run: () => onOpen(a.docId) }],
                  right: [{ icon: "📅", label: "Kalender", bg: "#8b5cf6", run: () => downloadIcs(assetDlDocs([a]).flatMap((d) => d.deadlines.map((dl) => [dl, d])), "garantie.ics") },
                    { icon: astOut(a) ? "▶" : "📤", label: astOut(a) ? "Aktiv" : "Aus", bg: "#64748b", run: () => save({ ...a, soldAt: astOut(a) ? "" : todayISO(), inactive: false }) }] }} />
            ))}
          </MScroll>
        )}
      </div>
      ) : (<>
      {scopeSeg}
      <div className="kbstats">{stats.map((s, i) => <div key={i} className={"tile kbstat" + (s.onClick ? " click" : "") + (s.alert ? " mwarn" : "")} onClick={s.onClick}><small className="muted">{s.label}</small><b className={s.vcls || ""}>{s.value}</b><small className="muted">{s.sub}</small></div>)}</div>
      <div className="invbar">
        <button className="btn primary" onClick={newAsset}>＋ Gerät</button>
        {viewSeg}
        <span className="grow" />
        <button className={"btn" + (calSync?.on ? " synced" : "")} onClick={() => setSyncOpen(true)}><IcoCalSync /> {calSync?.on ? "Apple Kalender verbunden" : "Mit Apple Kalender verbinden"}</button>
        <ExportMenu items={exportItems} />
      </div>
      {mode === "cal" ? cal : (<>
        <div className="searchbar"><span>🔍</span><input type="search" placeholder="Gerät, Marke, Seriennummer, Händler suchen" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips invfilter">{chips.filter(([k, , n]) => n || k === "alle").map(([k, l, n]) => <button key={k} className={"chip" + (filter === k ? " on" : "")} onClick={() => setFilter(k)}>{l} <small>({n})</small></button>)}</div>
        <FitScroll card cols={["Gerät", "Marke · Kauf · Garantie", "Kaufpreis"]}>
          <section className="tile ctlist">
            {!shown.length && empty}
            {shown.map((a) => (
              <div key={a.id} className={"frow click" + (astOut(a) ? " ended" : "")} onClick={() => setEdit(a)}>
                <AstIco a={a} size={42} />
                <div className="grow"><b>{a.name}</b>{(a.scope || "privat") === "firma" && <span className="stpill st-draft" style={{ marginLeft: 8 }}>🏢 Firma</span>}{pill(a) && <span style={{ marginLeft: 8 }}>{pill(a)}</span>}
                  <small className="muted block">{[sub(a), a.serial && "Nr. " + a.serial, a.dealer].filter(Boolean).join(" · ")}</small></div>
                <div className="right"><b>{a.price !== "" && a.price != null ? fmtMoney(Number(a.price)) : "—"}</b><small className="muted block">{a.date ? fmtDate(a.date) : ""}</small></div>
                {a.docId && <button className="chip" title="Kaufbeleg öffnen" onClick={(e) => { e.stopPropagation(); onOpen(a.docId); }}>📎</button>}
              </div>
            ))}
          </section>
          <p className="muted small fsnote">Gewährleistung in Österreich: 2 Jahre ab Übergabe; eine Herstellergarantie kann länger laufen. Garantie-Enden erscheinen automatisch im Reiter „Umtauschfrist“ und im Kalender-Abo.</p>
        </FitScroll>
      </>)}
      
      </>)}
      {edit && <AssetEditor a={edit} docs={docs} onScan={onScan} onUpload={onUpload} onOpenDoc={onOpen} notify={notify}
        onSave={save} onDelete={(a) => setList((l) => l.filter((x) => x.id !== a.id))} onClose={() => setEdit(null)} />}
      {syncOpen && <CalSyncSheet sync={calSync} setSync={setCalSync} items={calItems} token={token} notify={notify} onClose={() => setSyncOpen(false)} what="Fristen & Garantien" />}
    </div>
  );
}

/* ======================= Kassabuch (BAO § 131: Einzelaufzeichnung, unveränderbar, Storno, Kassensturz) ======================= */
const KB_CATS = {
  ein: ["Barverkauf / Erlös", "Privateinlage", "Bankabhebung (Geldtransit)", "Sonstige Einnahme"],
  aus: ["Wareneinkauf", "Büromaterial", "Porto & Versand", "Bewirtung", "Reise & Fahrt", "Kfz", "Sonstiger Aufwand", "Privatentnahme", "Bankeinzahlung (Geldtransit)", "Kassendifferenz"]
};
const KB_DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
const kbSigned = (e) => (e.kind === "ein" ? 1 : -1) * (Number(e.amount) || 0);
const kbSort = (a, b) => (a.date || "").localeCompare(b.date || "") || (a.created || "").localeCompare(b.created || "");
const kbNo = (e) => `${(e.date || "").slice(0, 4)}/${String(e.no || 0).padStart(4, "0")}`;
const kbR2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
// laufender Saldo je Buchung + erster negativer Stand (falls vorhanden)
function kbRun(entries, kasse) {
  let bal = Number(kasse.start) || 0; const saldo = {}; let neg = null;
  for (const e of entries.filter((x) => x.kasse === kasse.id).sort(kbSort)) { bal = kbR2(bal + kbSigned(e)); saldo[e.id] = bal; if (bal < 0 && !neg) neg = e; }
  return { saldo, bal, neg };
}
const kbBalAt = (entries, kasse, date, before = false) => kbR2((Number(kasse.start) || 0) + entries.filter((e) => e.kasse === kasse.id && (before ? e.date < date : e.date <= date)).reduce((s, e) => s + kbSigned(e), 0));
const kbNextNo = (entries, kasse, date) => entries.filter((e) => e.kasse === kasse.id && (e.date || "").slice(0, 4) === date.slice(0, 4)).reduce((m, e) => Math.max(m, e.no || 0), 0) + 1;
const kbNet = (e) => (e.vat ? kbR2(e.amount / (1 + e.vat / 100)) : kbR2(e.amount));

function useKassa() {
  const [kassen, setKassen] = useLsState("kassen", [{ id: "k1", name: "Hauptkassa", start: 0, startDate: todayISO() }]);
  const [entries, setEntries] = useLsState("kassaEntries", []);
  const [counts, setCounts] = useLsState("kassaCounts", []);
  return { kassen, setKassen, entries, setEntries, counts, setCounts };
}

function KassaEntryWin({ init, kasse, entries, lastCount, docs, onUpload, onScan, onOpen, notify, onSave, onClose }) {
  const [e, setE] = useState(init);
  const set = (p) => setE((x) => ({ ...x, ...p }));
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [qrOpen, setQrOpen] = useState(false), [touched, setTouched] = useState({});
  const fileRef = useRef(), filled = useRef(null);
  const minDate = lastCount?.date || kasse.startDate || "";
  const tset = (p) => { set(p); setTouched((t) => ({ ...t, ...Object.fromEntries(Object.keys(p).map((k) => [k, true])) })); };
  const clampDate = (d) => { const x = pastOrToday(d, todayISO()); return minDate && x < minDate ? minDate : x; };
  const attach = async (file, opts = {}) => { setBusy(true); filled.current = null; try { const id = await onUpload(file, opts); if (id) set({ docId: id, eigen: false }); } finally { setBusy(false); } };
  const sdoc = e.docId ? (docs || []).find((d) => d.id === e.docId) : null;
  useEffect(() => {
    if (!sdoc || sdoc.status !== "done" || filled.current === sdoc.id) return;
    filled.current = sdoc.id;
    setE((x) => ({ ...x, amount: touched.amount && x.amount ? x.amount : sdoc.amount?.total != null ? amtStr(sdoc.amount.total) : x.amount,
      date: touched.date ? x.date : clampDate(sdoc.purchaseDate || sdoc.documentDate),
      text: touched.text && x.text ? x.text : sdoc.merchant || sdoc.sender || sdoc.title || x.text,
      ...(sdoc.direction === "einnahme" && !touched.kind ? { kind: "ein", cat: KB_CATS.ein[0] } : {}) }));
    notify?.("Beleg ausgelesen" + (sdoc.amount?.total != null ? ": " + fmtMoney(sdoc.amount.total) : ""));
  }, [sdoc?.status, sdoc?.id]);
  const onQr = (text) => { setQrOpen(false); const q = parseReceiptQR(text);
    if (!q) return notify?.("Kein Kassenbon-QR erkannt (RKSV/TSE). Tipp: Beleg stattdessen scannen – die KI liest ihn aus.");
    setE((x) => ({ ...x, amount: touched.amount && x.amount ? x.amount : amtStr(q.total), date: touched.date ? x.date : clampDate(q.date), beleg: x.beleg || q.receiptNo || "" }));
    notify?.(`QR-Code gelesen: ${fmtMoney(q.total)}${q.date ? " · " + fmtDate(q.date) : ""}`); };
  const receipts = (docs || []).filter((d) => !d.trashed).sort((a, b) => (b.documentDate || b.created || "").localeCompare(a.documentDate || a.created || "")).slice(0, 80);
  const linked = docs?.find((d) => d.id === e.docId);
  const save = () => {
    const amount = kbR2(String(e.amount).replace(",", "."));
    if (!(amount > 0)) return setErr("Bitte einen Betrag größer 0 eingeben.");
    if (!e.text?.trim()) return setErr("Bitte einen Buchungstext eingeben (Einzelaufzeichnung).");
    if (!e.date || e.date > todayISO()) return setErr("Das Datum darf nicht in der Zukunft liegen.");
    if (minDate && e.date < minDate) return setErr(`Vor dem ${fmtDate(minDate)} kann nicht mehr gebucht werden (${lastCount ? "letzter Kassensturz" : "Anfangsbestand"}).`);
    if (!e.docId && !e.beleg?.trim() && !e.eigen) return setErr("Keine Buchung ohne Beleg: Beleg verknüpfen, Belegnummer eintragen oder „Eigenbeleg“ ankreuzen.");
    const n = { ...e, amount, text: e.text.trim(), kasse: kasse.id, no: kbNextNo(entries, kasse, e.date), created: new Date().toISOString() };
    const { neg } = kbRun([...entries, n], kasse);
    if (neg) return setErr(`Der Kassenstand würde am ${fmtDate(neg.date)} negativ werden – ein Kassenminus ist nicht zulässig. Fehlt eine Einnahme?`);
    onSave(n); onClose();
  };
  return (
    <Win id="kbentry" onClose={onClose} small dirty={!!(e.amount || e.text)}>
      <div className="panelhead"><b>{e.kind === "ein" ? "Bareinnahme" : "Barausgabe"} buchen</b><button className="btn primary" disabled={busy} onClick={save}>Buchen</button><XBtn /></div>
      <div className="kbkind">
        <button className={"chip" + (e.kind === "ein" ? " on pos" : "")} onClick={() => tset({ kind: "ein", cat: KB_CATS.ein[0] })}>＋ Einnahme</button>
        <button className={"chip" + (e.kind === "aus" ? " on neg" : "")} onClick={() => tset({ kind: "aus", cat: KB_CATS.aus[0] })}>− Ausgabe</button>
        <span className="muted small grow right">{kasse.name}</span>
      </div>
      {onUpload && (e.docId || busy ? (
        <div className="expatt">
          {sdoc?.thumb ? <img src={sdoc.thumb} alt="" /> : <span className="attpdf">📄</span>}
          <div className="grow"><b>{busy ? "Beleg wird hochgeladen …" : sdoc?.status === "processing" ? "KI liest den Beleg …" : sdoc?.status === "error" ? "Auslesen fehlgeschlagen" : "Beleg angehängt"}</b>
            <small className="muted block">{sdoc?.status === "processing" ? "Felder werden gleich automatisch ausgefüllt" : sdoc?.status === "done" ? (sdoc.merchant || sdoc.sender || sdoc.title || "") + (sdoc.amount?.total ? " · " + fmtMoney(sdoc.amount.total) : "") : ""}</small></div>
          {sdoc?.status === "processing" && <span className="spin" />}
          {sdoc && onOpen && <button className="btn sm" onClick={() => onOpen(sdoc.id)}>Öffnen</button>}
          <button className="iconbtn" title="Beleg entfernen" aria-label="Beleg entfernen" onClick={() => set({ docId: null })}>✕</button>
        </div>
      ) : (
        <div className="expscan">
          <button className="expbig" onClick={() => onScan((f, o) => attach(f, { ...o, scanned: true }))}><span className="expico">📷</span><b>Beleg scannen</b><small>KI liest Firma, Betrag & Datum</small></button>
          <button className="expbig" onClick={() => setQrOpen(true)}><span className="expico">▦</span><b>QR-Code</b><small>Registrierkassen-QR (RKSV)</small></button>
          <button className="expbig" onClick={() => fileRef.current.click()}><span className="expico">🖼</span><b>Foto / PDF</b><small>aus Galerie oder Dateien</small></button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(ev) => { const f = ev.target.files[0]; ev.target.value = ""; if (f) attach(f); }} />
        </div>
      ))}
      <div className="grid2">
        <label>Betrag €<input autoFocus inputMode="decimal" value={e.amount} placeholder="0,00" onChange={(ev) => tset({ amount: ev.target.value })} /></label>
        <label>Datum<input type="date" value={e.date} min={minDate || undefined} max={todayISO()} onChange={(ev) => tset({ date: ev.target.value })} /></label>
      </div>
      <label>Buchungstext<input value={e.text} placeholder={e.kind === "ein" ? "z. B. Barverkauf Tagesumsatz" : "z. B. Briefmarken Post"} onChange={(ev) => tset({ text: ev.target.value })} /></label>
      <div className="grid2">
        <label>Kategorie<select value={e.cat} onChange={(ev) => set({ cat: ev.target.value })}>{KB_CATS[e.kind].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>USt-Satz<select value={e.vat ?? ""} onChange={(ev) => set({ vat: ev.target.value === "" ? null : Number(ev.target.value) })}><option value="">– keine –</option>{[20, 13, 10, 0].map((v) => <option key={v} value={v}>{v} %</option>)}</select></label>
      </div>
      <div className="kbbeleg">
        <small className="muted">Beleg</small>
        <div className="grid2">
          <label>Belegnummer<input value={e.beleg || ""} placeholder="z. B. Rechnungs-Nr." onChange={(ev) => set({ beleg: ev.target.value })} /></label>
          <label>Dokument verknüpfen<select value={e.docId || ""} onChange={(ev) => set({ docId: ev.target.value || null })}><option value="">– keines –</option>{receipts.map((d) => <option key={d.id} value={d.id}>{fmtDate(d.documentDate || d.created)} · {d.title || d.name}</option>)}</select></label>
        </div>
        <div className="kbbelegrow">
          <label className="check"><input type="checkbox" checked={!!e.eigen} onChange={(ev) => set({ eigen: ev.target.checked })} /> Eigenbeleg (kein Fremdbeleg vorhanden)</label>
        </div>
      </div>
      {err && <div className="lookbox err">{err}</div>}
      {qrOpen && createPortal(<CodeScanWin title="Kassenbon-QR scannen" onClose={() => setQrOpen(false)} onResult={(code) => onQr(code)} />, document.querySelector(".app") || document.body)}
      <p className="muted small">🔒 Nach dem Buchen ist der Eintrag unveränderbar. Fehler werden per <b>Storno</b> korrigiert – Original und Storno bleiben sichtbar (BAO § 131).</p>
    </Win>
  );
}

function KassaCountWin({ kasse, entries, onSave, onClose }) {
  const [n, setN] = useState({}), [note, setNote] = useState(""), [book, setBook] = useState(true);
  const counted = kbR2(KB_DENOMS.reduce((s, d) => s + d * (Number(n[d]) || 0), 0));
  const soll = kbBalAt(entries, kasse, todayISO());
  const diff = kbR2(counted - soll);
  return (
    <Win id="kbcount" onClose={onClose} dirty={Object.values(n).some(Boolean)}>
      <div className="panelhead"><b>🧮 Kassensturz · {kasse.name}</b><button className="btn primary" onClick={() => { onSave({ id: uid(), kasse: kasse.id, date: todayISO(), created: new Date().toISOString(), denoms: n, counted, book: soll, diff, note, bookDiff: book && diff !== 0 }); onClose(); }}>Protokoll speichern</button><XBtn /></div>
      <p className="muted small">Bargeld nach Scheinen und Münzen zählen. Der Abgleich mit dem Buchbestand wird als Protokoll gespeichert – Buchungen vor heute sind danach gesperrt.</p>
      <div className="kbdenoms">
        {KB_DENOMS.map((d) => (
          <label key={d} className="kbden"><span>{d >= 5 ? "💶" : "🪙"} {d >= 1 ? d + " €" : Math.round(d * 100) + " ct"}</span>
            <input inputMode="numeric" value={n[d] || ""} placeholder="0" onChange={(e) => setN((x) => ({ ...x, [d]: e.target.value.replace(/\D/g, "") }))} />
            <small className="muted">{fmtMoney(d * (Number(n[d]) || 0))}</small></label>
        ))}
      </div>
      <div className="kbsum">
        <div><small className="muted">Buchbestand (Soll)</small><b>{fmtMoney(soll)}</b></div>
        <div><small className="muted">Gezählt (Ist)</small><b>{fmtMoney(counted)}</b></div>
        <div><small className="muted">Differenz</small><b className={diff < 0 ? "neg" : diff > 0 ? "pos" : ""}>{diff > 0 ? "+" : ""}{fmtMoney(diff)}</b></div>
      </div>
      {diff !== 0 && <label className="check"><input type="checkbox" checked={book} onChange={(e) => setBook(e.target.checked)} /> Differenz als Buchung „Kassendifferenz“ erfassen, damit Buch- und Istbestand übereinstimmen</label>}
      <label>Anmerkung<textarea rows={2} value={note} placeholder="z. B. Grund der Differenz, gezählt von …" onChange={(e) => setNote(e.target.value)} /></label>
    </Win>
  );
}

function KassaDetailWin({ e, kasse, saldo, entries, docs, onOpen, onStorno, onClose }) {
  const st = e.stornoBy && entries.find((x) => x.id === e.stornoBy), of = e.stornoOf && entries.find((x) => x.id === e.stornoOf);
  const doc = docs?.find((d) => d.id === e.docId);
  const Row = ({ l, v }) => v ? <div className="kbrow"><small className="muted">{l}</small><span>{v}</span></div> : null;
  return (
    <Win id="kbdetail" onClose={onClose} small dirty={false}>
      <div className="panelhead"><b>Buchung {kbNo(e)}</b><XBtn /></div>
      <div className="kbhero"><span className={e.kind === "ein" ? "pos" : "neg"}>{e.kind === "ein" ? "+" : "−"}{fmtMoney(e.amount)}</span><small className="muted">{e.text}</small>
        {e.stornoBy && <span className="stpill st-over">storniert</span>}{e.stornoOf && <span className="stpill st-draft">Storno</span>}</div>
      <Row l="Kasse" v={kasse.name} /><Row l="Datum" v={fmtDate(e.date)} /><Row l="Kategorie" v={e.cat} />
      <Row l="USt" v={e.vat != null ? `${e.vat} % · netto ${fmtMoney(kbNet(e))} · USt ${fmtMoney(kbR2(e.amount - kbNet(e)))}` : ""} />
      <Row l="Saldo danach" v={fmtMoney(saldo)} /><Row l="Belegnummer" v={e.beleg} /><Row l="Eigenbeleg" v={e.eigen ? "ja" : ""} />
      <Row l="Erfasst am" v={new Date(e.created).toLocaleString("de-AT")} />
      {st && <Row l="Storniert durch" v={`${kbNo(st)} am ${fmtDate(st.date)}`} />}
      {of && <Row l="Storno zu" v={`${kbNo(of)} · ${of.text}`} />}
      {doc && <button className="btn" onClick={() => { onOpen?.(doc.id); onClose(); }}>📎 Beleg öffnen: {doc.title || doc.name}</button>}
      {!e.stornoBy && !e.stornoOf && <button className="btn danger" style={{ marginTop: 10 }} onClick={() => onStorno(e)}>↩︎ Stornieren</button>}
      <p className="muted small">Buchungen sind unveränderbar. Ein Storno erzeugt eine Gegenbuchung mit eigener Nummer.</p>
    </Win>
  );
}

function KassaPage({ docs, onOpen, onUpload, onScan, notify }) {
  const mob = useMobileBeta();
  const { kassen, setKassen, entries, setEntries, counts, setCounts } = useKassa();
  const [sel, setSel] = useLsState("kassaSel", "k1");
  const kasse = kassen.find((k) => k.id === sel) || kassen[0];
  const [per, setPer] = useState(todayISO().slice(0, 7)), [q, setQ] = useState("");
  const [form, setForm] = useState(null), [countOpen, setCountOpen] = useState(false), [det, setDet] = useState(null), [showCounts, setShowCounts] = useState(false), [setup, setSetup] = useState(false);
  const mine = entries.filter((e) => e.kasse === kasse.id);
  const { saldo, bal } = kbRun(entries, kasse);
  const kCounts = counts.filter((c) => c.kasse === kasse.id).sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  const lastCount = kCounts[0];
  const months = [...new Set([todayISO().slice(0, 7), ...mine.map((e) => e.date.slice(0, 7))])].sort().reverse();
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const inPer = (e) => per === "alle" || e.date.startsWith(per);
  const perEntries = mine.filter(inPer).sort(kbSort);
  const shown = perEntries.filter((e) => !q || norm(`${e.text} ${e.cat} ${e.beleg} ${kbNo(e)} ${e.amount}`).includes(norm(q)));
  const sumIn = kbR2(perEntries.filter((e) => e.kind === "ein").reduce((s, e) => s + e.amount, 0)), sumOut = kbR2(perEntries.filter((e) => e.kind === "aus").reduce((s, e) => s + e.amount, 0));
  const first = per === "alle" ? "" : per.length === 4 ? per + "-01-01" : per + "-01";
  const opening = first ? kbBalAt(entries, kasse, first, true) : Number(kasse.start) || 0;
  const perLabel = per === "alle" ? "gesamt" : per.length === 4 ? per : monthLabel(per);
  const newEntry = (kind) => setForm({ id: uid(), kind, amount: "", date: todayISO(), text: "", cat: KB_CATS[kind][0], vat: null, beleg: "", docId: null, eigen: false });
  const doStorno = (e) => {
    if (!confirm(`Buchung ${kbNo(e)} („${e.text}“, ${fmtMoney(e.amount)}) stornieren?\nEs wird eine Gegenbuchung mit heutigem Datum erstellt.`)) return;
    const date = todayISO();
    const s = { id: uid(), kasse: kasse.id, kind: e.kind === "ein" ? "aus" : "ein", amount: e.amount, date, text: `Storno ${kbNo(e)}: ${e.text}`, cat: e.cat, vat: e.vat, beleg: e.beleg, docId: e.docId, eigen: e.eigen, stornoOf: e.id, no: kbNextNo(entries, kasse, date), created: new Date().toISOString() };
    const { neg } = kbRun([...entries, s], kasse);
    if (neg) return alert("Storno nicht möglich: Der Kassenstand würde negativ werden.");
    setEntries((l) => [...l.map((x) => (x.id === e.id ? { ...x, stornoBy: s.id } : x)), s]); setDet(null); notify?.("Storno gebucht");
  };
  const saveCount = (c) => {
    setCounts((l) => [...l, c]);
    if (c.bookDiff) { const date = todayISO(); setEntries((l) => [...l, { id: uid(), kasse: kasse.id, kind: c.diff > 0 ? "ein" : "aus", amount: Math.abs(c.diff), date, text: "Kassendifferenz lt. Kassensturz", cat: c.diff > 0 ? "Sonstige Einnahme" : "Kassendifferenz", eigen: true, no: kbNextNo(l, kasse, date), created: new Date().toISOString(), countId: c.id }]); }
    notify?.(c.diff ? `Kassensturz gespeichert · Differenz ${fmtMoney(c.diff)}` : "Kassensturz gespeichert · stimmt ✓");
  };
  const rows = () => perEntries.map((e) => [kbNo(e), fmtDate(e.date), e.beleg || (e.eigen ? "Eigenbeleg" : e.docId ? "Dokument" : ""), e.text + (e.stornoBy ? " (storniert)" : ""), e.cat, e.vat ?? "", e.kind === "ein" ? e.amount : "", e.kind === "aus" ? e.amount : "", saldo[e.id]]);
  const head = ["Nr.", "Datum", "Beleg", "Text", "Kategorie", "USt %", "Einnahmen €", "Ausgaben €", "Saldo €"];
  const exportItems = [{ head: `${kasse.name} · ${perLabel}` },
    { label: "🖨 Kassabuch PDF", sub: "mit Anfangs- und Endbestand", run: async () => saveBlob(await tablePdf({ title: `Kassabuch ${kasse.name} – ${perLabel}`, subtitle: `${({ ...CO_DEFAULT, ...ls.get("company", {}) }).name || ""} · Stand ${fmtDate(todayISO())}`, landscape: true,
      kpis: [["Anfangsbestand", fmtMoney(opening)], ["Einnahmen", fmtMoney(sumIn)], ["Ausgaben", fmtMoney(sumOut)], ["Endbestand", fmtMoney(kbR2(opening + sumIn - sumOut))]],
      columns: [{ label: "Nr.", w: 1 }, { label: "Datum", w: 1 }, { label: "Beleg", w: 1.3 }, { label: "Text", w: 4 }, { label: "Kategorie", w: 2 }, { label: "USt %", w: 0.7, align: "right" }, { label: "Einnahmen €", w: 1.2, align: "right" }, { label: "Ausgaben €", w: 1.2, align: "right" }, { label: "Saldo €", w: 1.2, align: "right" }],
      rows: rows(), totals: ["", "", "", "Summe", "", "", sumIn, sumOut, kbR2(opening + sumIn - sumOut)],
      note: "Einzelaufzeichnung gem. § 131 BAO. Buchungen sind unveränderbar, Korrekturen erfolgen per Storno-Gegenbuchung.\nHinweis: Dieses Kassabuch ersetzt keine Registrierkasse nach RKSV (Pflicht ab 15.000 € Jahresumsatz und 7.500 € Barumsatz)." }), `kassabuch-${kasse.name}-${per}.pdf`) },
    { label: "📊 Excel (.xlsx)", sub: "Buchungen + Kassenstürze", run: () => downloadXlsx(`kassabuch-${kasse.name}-${per}.xlsx`, [{ name: "Kassabuch", head, rows: rows() },
      { name: "Kassensturz", head: ["Datum", "Buchbestand €", "Gezählt €", "Differenz €", "Anmerkung"], rows: kCounts.filter((c) => per === "alle" || c.date.startsWith(per)).map((c) => [fmtDate(c.date), c.book, c.counted, c.diff, c.note || ""]) }]) },
    { label: "📄 CSV", run: () => downloadCsv(`kassabuch-${kasse.name}-${per}.csv`, head, rows()) }];
  const countBlob = async (c) => (await tablePdf({ title: `Kassensturz-Protokoll ${kasse.name}`, subtitle: `${new Date(c.created).toLocaleString("de-AT")}`,
    kpis: [["Buchbestand", fmtMoney(c.book)], ["Gezählt", fmtMoney(c.counted)], ["Differenz", fmtMoney(c.diff)]],
    columns: [{ label: "Stückelung", w: 2 }, { label: "Anzahl", w: 1, align: "right" }, { label: "Summe €", w: 1.5, align: "right" }],
    rows: KB_DENOMS.filter((d) => Number(c.denoms?.[d])).map((d) => [d >= 1 ? d + " €" : Math.round(d * 100) + " ct", Number(c.denoms[d]), kbR2(d * c.denoms[d])]), totals: ["Gesamt", "", c.counted],
    note: (c.note ? "Anmerkung: " + c.note + "\n" : "") + "\n\n______________________________   Unterschrift" }));
  const countName = (c) => `Kassensturz ${kasse.name} ${fmtDate(c.date)}`;
  const countShow = async (c) => openPdf(await countBlob(c), `kassensturz-${c.date}.pdf`, countName(c));
  const countPrint = async (c) => { notify?.("Druck wird vorbereitet …"); await printImages(await blobToImages(await countBlob(c)), countName(c)); };
  const perStat = (pre) => { const l = mine.filter((e) => pre === "alle" || e.date.startsWith(pre)); const i = l.filter((e) => e.kind === "ein").reduce((t, e) => t + e.amount, 0), o = l.filter((e) => e.kind === "aus").reduce((t, e) => t + e.amount, 0);
    return l.length ? `${l.length} Buchung${l.length === 1 ? "" : "en"} · +${fmtMoney(i)} / −${fmtMoney(o)}` : "keine Buchungen"; };
  const perSel = <PickMenu icon="📅" label={per === "alle" ? "Alle" : per.length === 4 ? "Jahr " + per : perLabel} title="Zeitraum" wide items={[{ head: "Monat" }, ...months.map((m) => ({ k: m, title: monthLabel(m), sub: perStat(m), on: per === m, run: () => setPer(m) })),
    { head: "Jahr" }, ...years.map((y) => ({ k: "y" + y, title: "Jahr " + y, sub: perStat(y), on: per === y, run: () => setPer(y) })), { k: "alle", title: "Alle Buchungen", sub: perStat("alle"), on: per === "alle", run: () => setPer("alle") }]} />;
  const kassaSel = <PickMenu icon="💶" label={kasse.name} title="Kasse wählen" items={kassen.map((k) => { const b = kbRun(entries, k).bal; return { k: k.id, icon: "💶", title: k.name, sub: `Kassenstand ${fmtMoney(b)} · ${entries.filter((e) => e.kasse === k.id).length} Buchungen`, on: k.id === kasse.id, run: () => setSel(k.id) }; })}
    extra={[{ label: `✎ „${kasse.name}“ bearbeiten`, run: () => setSetup(true) }, { label: "＋ Kasse hinzufügen", run: () => setSetup("neu") }]} />;
  const stats = [{ label: "Kassenstand", value: fmtMoney(bal), vcls: bal < 0 ? "neg" : "", sub: kasse.name },
    { label: "Einnahmen", value: fmtMoney(sumIn), vcls: "pos", sub: perLabel }, { label: "Ausgaben", value: fmtMoney(sumOut), vcls: "neg", sub: perLabel },
    { label: "Kassensturz", value: lastCount ? fmtDate(lastCount.date) : "noch keiner", sub: lastCount ? (lastCount.diff ? "Differenz " + fmtMoney(lastCount.diff) : "stimmte ✓") : "jetzt zählen", alert: !lastCount || daysUntil(lastCount.date) < -7, onClick: () => setCountOpen(true) }];
  const countsList = (
    <section className="tile">
      <div className="row"><b className="grow">Kassensturz-Protokolle<span className="muted small kbcnt">{kCounts.length}</span></b></div>
      {!kCounts.length && <p className="muted small">Noch kein Kassensturz. Empfehlung: mindestens wöchentlich, besser täglich zählen.</p>}
      {kCounts.map((c) => <div key={c.id} className="frow"><span className="grow"><b>{new Date(c.created).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })}</b><small className="muted block">Soll {fmtMoney(c.book)} · Ist {fmtMoney(c.counted)}{c.note ? " · " + c.note : ""}</small></span>
        <b className={c.diff < 0 ? "neg" : c.diff > 0 ? "pos" : ""}>{c.diff ? fmtMoney(c.diff) : "✓"}</b>
        <span className="invacts kbacts"><button className="iconbtn" title="Protokoll anzeigen" aria-label="Protokoll anzeigen" onClick={() => countShow(c)}><IcoEye /></button><button className="iconbtn" title="Drucken" aria-label="Drucken" onClick={() => countPrint(c)}><IcoPrint /></button></span></div>)}
    </section>
  );
  const modals = (<>
    {form && <KassaEntryWin init={form} kasse={kasse} entries={entries} lastCount={lastCount} docs={docs} onUpload={onUpload} onScan={onScan} onOpen={onOpen} notify={notify} onSave={(n) => { setEntries((l) => [...l, n]); notify?.(`Gebucht: ${kbNo(n)}`); }} onClose={() => setForm(null)} />}
    {countOpen && <KassaCountWin kasse={kasse} entries={entries} onSave={saveCount} onClose={() => setCountOpen(false)} />}
    {det && <KassaDetailWin e={entries.find((x) => x.id === det) || {}} kasse={kasse} saldo={saldo[det]} entries={entries} docs={docs} onOpen={onOpen} onStorno={doStorno} onClose={() => setDet(null)} />}
    {setup && <KassaSetupWin addNew={setup === "neu"} kassen={kassen} setKassen={setKassen} entries={entries} sel={kasse.id} setSel={setSel} onClose={() => setSetup(false)} />}
  </>);
  const rowCls = (e) => (e.stornoBy || e.stornoOf ? " kbstorno" : "");
  return (
    <div className="ctpage kbpage">
      {mob ? (
      <div className="mpage">
        <MStats items={stats} />
        <MActs items={[{ label: "＋ Einnahme", primary: true, run: () => newEntry("ein") }, { label: "− Ausgabe", run: () => newEntry("aus") }, { label: "🧮 Kassensturz", run: () => setCountOpen(true) }]} />
        <MBar q={q} setQ={setQ} placeholder="Text, Kategorie, Beleg suchen">
        </MBar>
        <div className="mchips">{kassaSel}{perSel}<ExportMenu items={exportItems} /><button className="chip" onClick={() => setSetup(true)}>⚙︎</button><button className={"chip" + (showCounts ? " on" : "")} onClick={() => setShowCounts(!showCounts)}>Protokolle</button></div>
        {showCounts && countsList}
        <MScroll>
          {!shown.length && <MEmpty>{mine.length ? "Keine Buchungen in diesem Zeitraum." : "Noch keine Buchungen – mit „＋ Einnahme“ oder „− Ausgabe“ beginnen."}</MEmpty>}
          {mGroup([...shown].reverse(), (e) => e.date).map(([d, l]) => (
            <React.Fragment key={d}>
              <MHead right={"Saldo " + fmtMoney(saldo[l[0].id])}>{fmtDate(d)}</MHead>
              {l.map((e) => <MItem key={e.id} dim={!!(e.stornoBy || e.stornoOf)} icon={<MIco e={e.kind === "ein" ? "💶" : "🧾"} />} title={e.text}
                tags={[e.stornoBy && "storniert", e.stornoOf && "Storno", !e.docId && !e.beleg && e.eigen && "Eigenbeleg"]}
                sub={`${kbNo(e)} · ${e.cat}${e.docId ? " · 📎" : ""}`} amount={(e.kind === "ein" ? "+" : "−") + fmtMoney(e.amount)} amountCls={e.kind === "ein" ? "pos" : "neg"}
                onClick={() => setDet(e.id)} swipe={!e.stornoBy && !e.stornoOf ? { right: [{ icon: "↩︎", label: "Storno", bg: "#ef4444", run: () => doStorno(e) }] } : undefined} />)}
            </React.Fragment>
          ))}
        </MScroll>
      </div>
      ) : (<>
      <div className="kbstats">{stats.map((s, i) => <div key={i} className={"tile kbstat" + (s.onClick ? " click" : "") + (s.alert ? " mwarn" : "")} onClick={s.onClick}><small className="muted">{s.label}</small><b className={s.vcls || ""}>{s.value}</b><small className="muted">{s.sub}</small></div>)}</div>
      <div className="invbar">
        <button className="btn primary" onClick={() => newEntry("ein")}>＋ Einnahme</button>
        <button className="btn" onClick={() => newEntry("aus")}>− Ausgabe</button>
        <button className="btn" onClick={() => setCountOpen(true)}>🧮 Kassensturz</button>
        <span className="grow" />
        {kassaSel}
        {perSel}
        <ExportMenu items={exportItems} />
        <button className={"chip" + (showCounts ? " on" : "")} onClick={() => setShowCounts(!showCounts)}>Protokolle ({kCounts.length})</button>
        <button className="chip" title="Kassen verwalten" onClick={() => setSetup(true)}>⚙︎</button>
      </div>
      <div className="searchbar"><span>🔍</span><input type="search" placeholder="Text, Kategorie, Beleg, Nummer suchen" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {showCounts && countsList}
      <FitScroll card>
      <section className="tile kbtable">
        <div className="kbr kbh"><span>Nr.</span><span>Datum</span><span>Text</span><span>Kategorie</span><span className="r">Einnahme</span><span className="r">Ausgabe</span><span className="r">Saldo</span></div>
        {per !== "alle" && <div className="kbr kbopen"><span /><span>{fmtDate(first)}</span><span>Anfangsbestand</span><span /><span /><span /><span className="r">{fmtMoney(opening)}</span></div>}
        {!shown.length && <p className="muted small" style={{ padding: 12 }}>{mine.length ? "Keine Buchungen in diesem Zeitraum." : "Noch keine Buchungen. Jede Bareinnahme und -ausgabe einzeln mit Beleg erfassen."}</p>}
        {shown.map((e) => (
          <div key={e.id} className={"kbr click" + rowCls(e)} onClick={() => setDet(e.id)}>
            <span className="muted kbcno">{kbNo(e)}</span><span className="kbcdate">{fmtDate(e.date)}<small className="muted kbsub">{kbNo(e)}</small></span>
            <span className="one kbctext"><b>{e.text}</b>{e.docId && " 📎"}{e.stornoBy && <span className="stpill st-over">storniert</span>}{e.stornoOf && <span className="stpill st-draft">Storno</span>}<small className="muted kbsub one">{e.cat}</small></span>
            <span className="muted one kbccat">{e.cat}</span>
            <span className="r pos">{e.kind === "ein" ? fmtMoney(e.amount) : ""}</span><span className="r neg">{e.kind === "aus" ? fmtMoney(e.amount) : ""}</span><span className="r"><b>{fmtMoney(saldo[e.id])}</b></span>
          </div>
        ))}
        {!!shown.length && <div className="kbr kbh kbfoot"><span /><span /><span>Summe {perLabel}</span><span /><span className="r pos">{fmtMoney(sumIn)}</span><span className="r neg">{fmtMoney(sumOut)}</span><span className="r">{fmtMoney(kbR2(opening + sumIn - sumOut))}</span></div>}
      </section>
      <p className="muted small fsnote">🔒 Unveränderbare Einzelaufzeichnung mit fortlaufender Nummer je Jahr, Storno statt Löschen, Kassenminus wird verhindert. Ersetzt keine Registrierkasse (RKSV).</p>
      </FitScroll>
      </>)}
      {modals}
    </div>
  );
}

function AccVisWin({ accounts, txs, onHide, onUnhide, onClose }) {
  const on = accounts.filter((a) => !a.hidden).length;
  return (
    <Win id="accvis" onClose={onClose} small dirty={false}>
      <div className="panelhead"><b>Konten aktivieren / deaktivieren</b><XBtn /></div>
      <p className="muted small">Deaktivierte Konten verschwinden aus Kontenliste, Übersicht, Analyse und Vermögen. Die Buchungen bleiben gespeichert und sind nach dem Aktivieren wieder da.</p>
      <div className="accvishead"><span className="muted small grow">{on} von {accounts.length} aktiv</span>
        <button className="chip" disabled={on === accounts.length} onClick={() => accounts.filter((a) => a.hidden).forEach((a) => onUnhide(a.id))}>Alle aktivieren</button></div>
      {accounts.map((a) => (
        <label key={a.id} className={"switchrow accvisrow" + (a.hidden ? " off" : "")}>
          <span className="accvisname"><AccIcon a={a} force /><span><b style={accStyle(a)}>{a.name}</b><small className="muted block">{txs.filter((t) => t.accountId === a.id).length} Buchungen</small></span></span>
          <input type="checkbox" className="switch" checked={!a.hidden} onChange={(e) => (e.target.checked ? onUnhide(a.id) : onHide(a.id))} />
        </label>
      ))}
    </Win>
  );
}

function KassaSetupWin({ kassen, setKassen, entries, sel, setSel, onClose, addNew = false }) {
  const [list, setList] = useState(() => addNew ? [...kassen, { id: uid(), name: "Kasse " + (kassen.length + 1), start: 0, startDate: todayISO() }] : kassen);
  const used = (k) => entries.some((e) => e.kasse === k.id);
  const upd = (id, p) => setList((l) => l.map((k) => (k.id === id ? { ...k, ...p } : k)));
  return (
    <Win id="kbsetup" onClose={onClose} small dirty={JSON.stringify(list) !== JSON.stringify(kassen)}>
      <div className="panelhead"><b>Kassen verwalten</b><button className="btn primary" onClick={() => { setKassen(list.map((k) => ({ ...k, start: kbR2(String(k.start).replace(",", ".")) }))); if (!list.some((k) => k.id === sel)) setSel(list[0].id); onClose(); }}>Speichern</button><XBtn /></div>
      <p className="muted small">Anfangsbestand und Startdatum können nur geändert werden, solange in der Kasse noch nichts gebucht ist.</p>
      {list.map((k) => (
        <div key={k.id} className="tile kbsetrow">
          <label>Name<input value={k.name} onChange={(e) => upd(k.id, { name: e.target.value })} /></label>
          <div className="grid2">
            <label>Anfangsbestand €<input inputMode="decimal" disabled={used(k)} value={k.start} onChange={(e) => upd(k.id, { start: e.target.value })} /></label>
            <label>ab Datum<input type="date" disabled={used(k)} value={k.startDate || ""} onChange={(e) => upd(k.id, { startDate: e.target.value })} /></label>
          </div>
          {!used(k) && list.length > 1 && <button className="link red small" onClick={() => setList((l) => l.filter((x) => x.id !== k.id))}>Kasse entfernen</button>}
        </div>
      ))}
      <button className="btn" onClick={() => setList((l) => [...l, { id: uid(), name: "Kasse " + (l.length + 1), start: 0, startDate: todayISO() }])}>＋ Weitere Kasse</button>
    </Win>
  );
}

/* ======================= Lager & Inventur ======================= */
const MV_TYPES = { anfang: ["Anfangsbestand", "🏁"], eingang: ["Wareneingang", "📥"], entnahme: ["Entnahme / Verbrauch", "📤"], korrektur: ["Korrektur", "✏️"], inventur: ["Inventurdifferenz", "📋"], verkauf: ["Verkauf (Rechnung)", "🧾"] };
const fmtQty = (n) => (Number(n) || 0).toLocaleString("de-AT", { maximumFractionDigits: 3 });
// Verkäufe aus Rechnungen (ab Lagerstart) als abgeleitete Bewegungen
function stockSales(arts, invoices) {
  const byText = {}; for (const a of arts) if (a.stock && a.autoSales !== false) byText[norm(a.text || "")] = a;
  const out = [];
  for (const i of invoices) if (i.kind === "rechnung" && !["entwurf", "storniert"].includes(i.status)) for (const it of i.items || []) {
    const a = (it.articleId && arts.find((x) => x.id === it.articleId && x.stock && x.autoSales !== false)) || byText[norm(it.text || "")];
    if (a && i.date && i.date >= (a.stockFrom || "")) out.push({ id: "s:" + i.id + ":" + a.id + ":" + out.length, art: a.id, date: i.date, qty: -(Number(it.qty) || 0), type: "verkauf", note: `Rechnung ${i.number || ""} · ${i.customer?.name || ""}`, derived: true });
  }
  return out;
}
const stockAt = (a, moves, upTo) => moves.reduce((s, m) => (m.art === a.id && (!upTo || m.date <= upTo) ? s + (Number(m.qty) || 0) : s), 0);
const reorderQty = (a, st) => Math.max(0, Math.ceil((Number(a.max) || (Number(a.min) || 0) * 2) - st));
const resizeImg = (file, max = 240) => new Promise((res, rej) => { const u = URL.createObjectURL(file), img = new Image(); img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg", 0.8)); }; img.onerror = rej; img.src = u; });
const ArtIco = ({ a, size = 46 }) => a.photo ? <img className="artphoto" src={a.photo} alt="" style={{ width: size, height: size }} /> : <span className="caticon" style={{ width: size, height: size, background: "var(--card2)", fontSize: size * 0.45 }}>📦</span>;

function StockMoveWin({ a, type: t0, st, onSave, onClose }) {
  const [m, setM] = useState({ type: t0 || "eingang", qty: "", date: todayISO(), note: "", ek: a.ek ?? "" });
  const set = (p) => setM((x) => ({ ...x, ...p }));
  const q = Number(String(m.qty).replace(",", ".")) || 0;
  const delta = m.type === "entnahme" ? -Math.abs(q) : m.type === "korrektur" ? q - st : Math.abs(q);
  return (
    <Win id="stockmove" onClose={onClose} small dirty={!!m.qty}>
      <div className="panelhead"><b>{a.text}</b><button className="btn primary" disabled={!m.qty || (m.type !== "korrektur" && !q)} onClick={() => { onSave({ id: uid(), art: a.id, type: m.type, qty: delta, date: m.date, note: m.note, ek: m.type === "eingang" && m.ek !== "" ? Number(String(m.ek).replace(",", ".")) : undefined, created: new Date().toISOString() }); onClose(); }}>Buchen</button><XBtn /></div>
      <div className="kbkind">{["eingang", "entnahme", "korrektur"].map((k) => <button key={k} className={"chip" + (m.type === k ? " on" : "")} onClick={() => set({ type: k })}>{MV_TYPES[k][1]} {MV_TYPES[k][0]}</button>)}</div>
      <p className="muted small">Aktueller Bestand: <b>{fmtQty(st)} {a.unit || ""}</b>{a.loc ? " · Lagerort " + a.loc : ""}</p>
      <div className="grid2">
        <label>{m.type === "korrektur" ? "Neuer Bestand" : "Menge"}<input autoFocus inputMode="decimal" value={m.qty} onChange={(e) => set({ qty: e.target.value })} /></label>
        <label>Datum<input type="date" value={m.date} max={todayISO()} onChange={(e) => set({ date: e.target.value })} /></label>
      </div>
      {m.type === "eingang" && <label>Einkaufspreis netto je {a.unit || "Stk"} €<input inputMode="decimal" value={m.ek} onChange={(e) => set({ ek: e.target.value })} /></label>}
      <label>Notiz<input value={m.note} placeholder={m.type === "eingang" ? "z. B. Lieferschein-Nr." : "z. B. Projekt / Grund"} onChange={(e) => set({ note: e.target.value })} /></label>
      {!!m.qty && <p className="small">Bestand danach: <b>{fmtQty(st + delta)} {a.unit || ""}</b> ({delta >= 0 ? "+" : ""}{fmtQty(delta)})</p>}
    </Win>
  );
}

function CountWin({ count, arts, moves, onChange, onFinish, onDelete, onClose }) {
  const [q, setQ] = useState(""), [open, setOpen] = useState(false), [scan, setScan] = useState(false), [last, setLast] = useState("");
  const scope = arts.filter((a) => (!count.loc || a.loc === count.loc) && (!count.group || a.group === count.group));
  const L = count.lines || {};
  const setLine = (id, v) => onChange({ ...count, lines: { ...L, [id]: v } });
  const shown = scope.filter((a) => !open || L[a.id] == null || L[a.id] === "").filter((a) => !q || norm(`${a.text} ${a.number} ${a.ean} ${a.loc}`).includes(norm(q)))
    .sort((x, y) => (x.loc || "").localeCompare(y.loc || "", "de") || (x.text || "").localeCompare(y.text || "", "de"));
  const done = scope.filter((a) => L[a.id] != null && L[a.id] !== "").length;
  const diffs = scope.filter((a) => L[a.id] != null && L[a.id] !== "" && Number(L[a.id]) !== stockAt(a, moves, count.date));
  return (
    <Win id="invcount" onClose={onClose} dirty={false}>
      <div className="panelhead"><b>📋 {count.name}</b><button className="btn primary" disabled={!done} onClick={() => {
        if (confirm(`Inventur abschließen?\n${done} von ${scope.length} Artikeln gezählt, ${diffs.length} Differenz${diffs.length === 1 ? "" : "en"} werden zum ${fmtDate(count.date)} gebucht.${done < scope.length ? `\n${scope.length - done} ungezählte Artikel bleiben unverändert.` : ""}`)) onFinish(count);
      }}>Abschließen</button><XBtn /></div>
      <div className="grid2">
        <label>Stichtag<input type="date" value={count.date} max={todayISO()} onChange={(e) => onChange({ ...count, date: e.target.value })} /></label>
        <label>Bezeichnung<input value={count.name} onChange={(e) => onChange({ ...count, name: e.target.value })} /></label>
      </div>
      <div className="cntprog"><div style={{ width: (scope.length ? (done / scope.length) * 100 : 0) + "%" }} /></div>
      <p className="muted small">{done} / {scope.length} gezählt · {diffs.length} Differenzen{count.loc ? " · Lagerort " + count.loc : ""}{count.group ? " · Gruppe " + count.group : ""} · wird automatisch gespeichert</p>
      <div className="row cntbar">
        <div className="searchbar grow"><span>🔍</span><input type="search" placeholder="Artikel suchen" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className={"chip" + (open ? " on" : "")} onClick={() => setOpen(!open)}>nur offene</button>
        <button className="btn" onClick={() => setScan(true)}>📷 Scan-Zählung</button>
      </div>
      {last && <div className="lookbox ok">{last}</div>}
      <div className="cntlist">
        {shown.map((a) => { const soll = stockAt(a, moves, count.date), v = L[a.id], has = v != null && v !== "", d = has ? Number(v) - soll : 0; return (
          <div key={a.id} className={"cntrow" + (has ? " done" : "")}>
            <ArtIco a={a} size={38} />
            <div className="grow"><b className="one">{a.text}</b><small className="muted block">{[a.number, a.loc, "Soll " + fmtQty(soll) + " " + (a.unit || "")].filter(Boolean).join(" · ")}</small></div>
            <button className="chip" onClick={() => setLine(a.id, String(Math.max(0, (Number(v) || 0) - 1)))}>−</button>
            <input className="cntin" inputMode="decimal" value={v ?? ""} placeholder="Ist" onChange={(e) => setLine(a.id, e.target.value.replace(",", "."))} />
            <button className="chip" onClick={() => setLine(a.id, String((Number(v) || 0) + 1))}>＋</button>
            <span className={"cntdiff " + (d < 0 ? "neg" : d > 0 ? "pos" : "")}>{has ? (d ? (d > 0 ? "+" : "") + fmtQty(d) : "✓") : ""}</span>
          </div>
        ); })}
        {!shown.length && <MEmpty>{scope.length ? "Alle Artikel gezählt 🎉" : "Keine Lagerartikel in diesem Bereich – im Artikel „Lagerartikel“ aktivieren."}</MEmpty>}
      </div>
      <button className="link red small" style={{ marginTop: 10 }} onClick={() => confirm("Diese offene Inventur verwerfen?") && (onDelete(count), onClose())}>Inventur verwerfen</button>
      {scan && createPortal(<CodeScanWin multi title="Scan-Zählung (jeder Scan +1)" onClose={() => setScan(false)} onResult={(code) => {
        const a = scope.find((x) => x.ean && x.ean === code);
        if (!a) { setLast(`Code ${code} ist keinem Artikel zugeordnet.`); return; }
        const n = (Number((count.lines || {})[a.id]) || 0) + 1; setLine(a.id, String(n)); setLast(`✓ ${a.text}: ${fmtQty(n)} ${a.unit || ""}`);
      }} />, document.querySelector(".app") || document.body)}
    </Win>
  );
}

function StockReceiptWin({ arts, docs, onScan, onUpload, onOpen, onBook, onClose }) {
  const [docId, setDocId] = useState(null), [busy, setBusy] = useState(false), [rows, setRows] = useState(null), [date, setDate] = useState(todayISO());
  const fileRef = useRef();
  const doc = docId ? (docs || []).find((d) => d.id === docId) : null;
  const attach = async (file, opts = {}) => { setBusy(true); setRows(null); try { const id = await onUpload(file, opts); if (id) setDocId(id); } finally { setBusy(false); } };
  const match = (name) => { const n = norm(name || ""); if (!n) return "";
    const hit = arts.find((a) => norm(a.text || "") === n) || arts.find((a) => { const t = norm(a.text || ""); return t.length > 3 && (n.includes(t) || t.includes(n)); });
    return hit ? hit.id : "__new"; };
  useEffect(() => {
    if (!doc || doc.status !== "done" || rows) return;
    setDate(pastOrToday(doc.purchaseDate || doc.documentDate, todayISO()));
    const li = (doc.lineItems || []).length ? doc.lineItems : [{ name: doc.title || doc.merchant || "", qty: 1, total: doc.amount?.total }];
    setRows(li.map((it) => { const q = Number(it.qty) || 1; return { id: uid(), on: true, name: it.name || "", art: match(it.name), qty: String(Math.round(q * 1000) / 1000).replace(".", ","), ek: it.total != null ? amtStr(it.total / q) : "" }; }));
  }, [doc?.status, doc?.id]);
  const upd = (id, p) => setRows((l) => l.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const sel = (rows || []).filter((r) => r.on && parseAmt(r.qty) > 0 && (r.art !== "__new" || r.name.trim()));
  const supplier = doc?.merchant || doc?.sender || "";
  return (
    <Win id="stockreceipt" onClose={onClose} dirty={!!rows}>
      <div className="panelhead"><b>🧾 Wareneingang per Beleg</b><button className="btn primary" disabled={!sel.length} onClick={() => { onBook(sel.map((r) => ({ art: r.art, name: r.name.trim(), qty: parseAmt(r.qty), ek: parseAmt(r.ek) })), { date, supplier, docId }); onClose(); }}>{sel.length ? `${sel.length} Position${sel.length === 1 ? "" : "en"} einbuchen` : "Einbuchen"}</button><XBtn /></div>
      {docId || busy ? (
        <div className="expatt">
          {doc?.thumb ? <img src={doc.thumb} alt="" /> : <span className="attpdf">📄</span>}
          <div className="grow"><b>{busy ? "Beleg wird hochgeladen …" : doc?.status === "processing" ? "KI liest den Beleg …" : doc?.status === "error" ? "Auslesen fehlgeschlagen" : "Beleg ausgelesen"}</b>
            <small className="muted block">{doc?.status === "done" ? [supplier, `${doc.lineItems?.length || 0} Positionen erkannt`].filter(Boolean).join(" · ") : doc?.status === "error" ? doc.error : "Positionen erscheinen gleich hier"}</small></div>
          {doc?.status === "processing" && <span className="spin" />}
          {doc && onOpen && <button className="btn sm" onClick={() => onOpen(doc.id)}>Öffnen</button>}
          <button className="iconbtn" title="Beleg entfernen" aria-label="Beleg entfernen" onClick={() => { setDocId(null); setRows(null); }}>✕</button>
        </div>
      ) : (<>
        <p className="muted small">Lieferschein, Rechnung oder Kassenbon scannen – die KI liest die Positionen aus. Du ordnest sie Lagerartikeln zu (oder legst neue an) und buchst alles in einem Schritt als Wareneingang.</p>
        <div className="expscan two">
          <button className="expbig" onClick={() => onScan((f, o) => attach(f, { ...o, scanned: true }))}><span className="expico">📷</span><b>Beleg scannen</b><small>KI liest Artikel, Menge & Preis</small></button>
          <button className="expbig" onClick={() => fileRef.current.click()}><span className="expico">🖼</span><b>Foto / PDF</b><small>aus Galerie oder Dateien</small></button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) attach(f); }} />
        </div>
      </>)}
      {rows && (<>
        <div className="grid2"><label>Eingangsdatum<input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></label><label>Lieferant<input value={supplier} disabled /></label></div>
        <div className="srlist">
          {rows.map((r) => (
            <div key={r.id} className={"srrow" + (r.on ? "" : " off")}>
              <input type="checkbox" checked={r.on} onChange={(e) => upd(r.id, { on: e.target.checked })} />
              <div className="grow srmain">
                <input value={r.name} placeholder="Bezeichnung" onChange={(e) => upd(r.id, { name: e.target.value })} />
                <select value={r.art} onChange={(e) => upd(r.id, { art: e.target.value })}><option value="__new">＋ Neuen Lagerartikel anlegen</option>{arts.filter((a) => !a.inactive).map((a) => <option key={a.id} value={a.id}>→ {a.text}{a.stock ? "" : " (noch kein Lagerartikel)"}</option>)}</select>
              </div>
              <label className="srnum">Menge<input inputMode="decimal" value={r.qty} onChange={(e) => upd(r.id, { qty: e.target.value })} /></label>
              <label className="srnum">Preis/Einh. €<input inputMode="decimal" value={r.ek} onChange={(e) => upd(r.id, { ek: e.target.value })} /></label>
            </div>
          ))}
        </div>
        <p className="muted small">Der Preis je Einheit wird als Einkaufspreis übernommen – so wie er am Beleg steht (bei Kassenbons meist brutto). Bitte prüfen.</p>
      </>)}
    </Win>
  );
}

function InventoryPage({ setTab, notify, docs, onOpen, onScan, onUpload }) {
  const mob = useMobileBeta();
  const [arts, setArts] = useLsState("articles", []);
  const [moves, setMoves] = useLsState("stockMoves", []);
  const [counts, setCounts] = useLsState("stockCounts", []);
  const [view, setView] = useLsState("invView", "bestand");
  const [q, setQ] = useState(""), [loc, setLoc] = useState("alle");
  const [mv, setMv] = useState(null), [scan, setScan] = useState(false), [cnt, setCnt] = useState(null), [edit, setEdit] = useState(null), [newCnt, setNewCnt] = useState(null), [rcpt, setRcpt] = useState(false);
  const bookReceipt = (lines, { date, supplier, docId }) => {
    const created = [], patch = {}, mvs = [];
    for (const l of lines) {
      let id = l.art;
      if (id === "__new") { id = uid(); created.push({ id, text: l.name, unit: "Stk", price: "", number: "", group: "", stock: true, autoSales: true, stockFrom: date, supplier, ...(l.ek > 0 ? { ek: l.ek } : {}) }); }
      else patch[id] = { stock: true, ...(l.ek > 0 ? { ek: l.ek } : {}) };
      mvs.push({ id: uid(), art: id, type: "eingang", qty: l.qty, date, note: "Beleg" + (supplier ? " · " + supplier : ""), docId, ...(l.ek > 0 ? { ek: l.ek } : {}), created: new Date().toISOString() });
    }
    setArts((l) => [...l.map((a) => (patch[a.id] ? { ...a, ...patch[a.id], stockFrom: a.stock ? a.stockFrom : a.stockFrom || date, autoSales: a.autoSales ?? true, supplier: a.supplier || supplier } : a)), ...created]);
    setMoves((l) => [...l, ...mvs]);
    notify?.(`Wareneingang gebucht: ${mvs.length} Position${mvs.length === 1 ? "" : "en"}${created.length ? ` · ${created.length} neue Artikel` : ""}`);
  };
  const invoices = ls.get("invoices", []);
  const stockArts = arts.filter((a) => a.stock && !a.inactive);
  const allMoves = useMemo(() => [...moves, ...stockSales(arts, invoices)], [moves, arts]);
  const st = (a) => stockAt(a, allMoves);
  const locs = [...new Set(stockArts.map((a) => a.loc).filter(Boolean))].sort();
  const low = stockArts.filter((a) => a.min !== "" && a.min != null && st(a) <= Number(a.min));
  const value = kbR2(stockArts.reduce((s, a) => s + Math.max(0, st(a)) * (Number(a.ek) || 0), 0));
  const lastInv = counts.filter((c) => c.status === "abgeschlossen").sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  const openCounts = counts.filter((c) => c.status !== "abgeschlossen");
  const filt = (l) => l.filter((a) => loc === "alle" || (loc === "ohne" ? !a.loc : a.loc === loc)).filter((a) => !q || norm(`${a.text} ${a.number} ${a.ean} ${a.loc} ${a.supplier}`).includes(norm(q)));
  const saveArt = (a) => setArts((l) => (l.some((x) => x.id === a.id) ? l.map((x) => (x.id === a.id ? a : x)) : [...l, a]));
  const addMove = (m) => { setMoves((l) => [...l, m]); if (m.ek != null) setArts((l) => l.map((x) => (x.id === m.art ? { ...x, ek: m.ek } : x))); notify?.(`${MV_TYPES[m.type][0]}: ${m.qty > 0 ? "+" : ""}${fmtQty(m.qty)}`); };
  const finish = (c) => {
    const scope = stockArts.filter((a) => (!c.loc || a.loc === c.loc) && (!c.group || a.group === c.group));
    const lines = scope.filter((a) => c.lines?.[a.id] != null && c.lines[a.id] !== "").map((a) => ({ art: a.id, number: a.number || "", text: a.text, unit: a.unit || "", loc: a.loc || "", soll: stockAt(a, allMoves, c.date), ist: Number(c.lines[a.id]) || 0, ek: Number(a.ek) || 0 }));
    const mvNew = lines.filter((l) => l.ist !== l.soll).map((l) => ({ id: uid(), art: l.art, type: "inventur", qty: kbR2(l.ist - l.soll), date: c.date, note: c.name, countId: c.id, created: new Date().toISOString() }));
    setMoves((l) => [...l, ...mvNew]);
    setCounts((l) => l.map((x) => (x.id === c.id ? { ...c, status: "abgeschlossen", closedAt: new Date().toISOString(), snapshot: lines } : x)));
    setCnt(null); setView("inventur"); notify?.(`Inventur abgeschlossen · ${mvNew.length} Differenzen gebucht`);
  };
  const invPdf = async (c) => { const L = c.snapshot || []; const tot = kbR2(L.reduce((s, l) => s + l.ist * l.ek, 0));
    saveBlob(await tablePdf({ title: `Inventurliste – ${c.name}`, subtitle: `Stichtag ${fmtDate(c.date)} · ${({ ...CO_DEFAULT, ...ls.get("company", {}) }).name || ""} · Bewertung zu Einstandspreisen (netto)`, landscape: true,
      kpis: [["Positionen", String(L.length)], ["Differenzen", String(L.filter((l) => l.ist !== l.soll).length)], ["Inventurwert", fmtMoney(tot)]],
      columns: [{ label: "Art.-Nr.", w: 1.1 }, { label: "Bezeichnung", w: 4 }, { label: "Lagerort", w: 1.5 }, { label: "Soll", w: 0.8, align: "right" }, { label: "Ist", w: 0.8, align: "right" }, { label: "Diff.", w: 0.8, align: "right" }, { label: "Einheit", w: 0.8 }, { label: "EK €", w: 1, align: "right" }, { label: "Wert €", w: 1.2, align: "right" }],
      rows: L.map((l) => [l.number, l.text, l.loc, fmtQty(l.soll), fmtQty(l.ist), fmtQty(l.ist - l.soll), l.unit, l.ek, kbR2(l.ist * l.ek)]), totals: ["", "Summe", "", "", "", "", "", "", tot],
      note: "\n\n______________________________   Gezählt von / Datum            ______________________________   Geprüft von" }), `inventur-${c.date}.pdf`); };
  const invXlsx = (c) => downloadXlsx(`inventur-${c.date}.xlsx`, [{ name: "Inventur", head: ["Art.-Nr.", "Bezeichnung", "Lagerort", "Soll", "Ist", "Differenz", "Einheit", "EK €", "Wert €"], rows: (c.snapshot || []).map((l) => [l.number, l.text, l.loc, l.soll, l.ist, kbR2(l.ist - l.soll), l.unit, l.ek, kbR2(l.ist * l.ek)]) }]);
  const listPdf = async (c) => { const scope = stockArts.filter((a) => (!c.loc || a.loc === c.loc) && (!c.group || a.group === c.group)); const by = {};
    scope.forEach((a) => (by[a.loc || "Ohne Lagerort"] = by[a.loc || "Ohne Lagerort"] || []).push(a));
    saveBlob(await tablePdf({ title: `Zählliste – ${c.name}`, subtitle: `Stichtag ${fmtDate(c.date)} · zum Ausfüllen`, columns: [{ label: "Art.-Nr.", w: 1.2 }, { label: "Bezeichnung", w: 4.5 }, { label: "Einheit", w: 1 }, { label: "Gezählt", w: 1.6 }],
      sections: Object.entries(by).map(([h, l]) => ({ heading: h, rows: l.sort((x, y) => (x.text || "").localeCompare(y.text || "", "de")).map((a) => [a.number || "", a.text, a.unit || "", "________"]) })) }), `zaehlliste-${c.date}.pdf`); };
  const orderPdf = async () => { const by = {}; low.forEach((a) => (by[a.supplier || "Ohne Lieferant"] = by[a.supplier || "Ohne Lieferant"] || []).push(a));
    saveBlob(await tablePdf({ title: "Bestellvorschlag", subtitle: `Stand ${fmtDate(todayISO())} · Artikel auf/unter Mindestbestand`, columns: [{ label: "Art.-Nr.", w: 1.2 }, { label: "Bezeichnung", w: 4 }, { label: "Bestand", w: 1, align: "right" }, { label: "Mindest", w: 1, align: "right" }, { label: "Bestellen", w: 1.1, align: "right" }, { label: "Einheit", w: 0.9 }, { label: "EK €", w: 1, align: "right" }],
      sections: Object.entries(by).map(([h, l]) => ({ heading: h, rows: l.map((a) => [a.number || "", a.text, fmtQty(st(a)), fmtQty(a.min), fmtQty(reorderQty(a, st(a))), a.unit || "", Number(a.ek) || ""]) })) }), `bestellvorschlag-${todayISO()}.pdf`); };
  const stockXlsx = () => downloadXlsx(`lagerbestand-${todayISO()}.xlsx`, [{ name: "Bestand", head: ["Art.-Nr.", "Bezeichnung", "Gruppe", "Lagerort", "Lieferant", "Bestand", "Einheit", "Mindestbestand", "EK €", "Wert €", "EAN"], rows: filt(stockArts).map((a) => [a.number || "", a.text, a.group || "", a.loc || "", a.supplier || "", st(a), a.unit || "", a.min ?? "", Number(a.ek) || "", kbR2(Math.max(0, st(a)) * (Number(a.ek) || 0)), a.ean || ""]) },
    { name: "Bewegungen", head: ["Datum", "Art.-Nr.", "Bezeichnung", "Art", "Menge", "Notiz"], rows: [...allMoves].sort((a, b) => b.date.localeCompare(a.date)).map((m) => { const a = arts.find((x) => x.id === m.art) || {}; return [fmtDate(m.date), a.number || "", a.text || "?", MV_TYPES[m.type]?.[0] || m.type, m.qty, m.note || ""]; }) }]);
  const startCount = (c) => { const n = { id: uid(), name: `Inventur ${fmtDate(todayISO())}`, date: todayISO(), status: "offen", lines: {}, ...c }; setCounts((l) => [...l, n]); setCnt(n.id); setNewCnt(null); };
  const exportItems = [{ head: "Lager & Inventur" }, { label: "📊 Lagerbestand Excel", sub: "Bestand + alle Bewegungen", run: stockXlsx },
    { label: "📄 Lagerbestand CSV", run: () => downloadCsv(`lagerbestand-${todayISO()}.csv`, ["Art.-Nr.", "Bezeichnung", "Lagerort", "Bestand", "Einheit", "Mindestbestand", "EK €"], filt(stockArts).map((a) => [a.number || "", a.text, a.loc || "", st(a), a.unit || "", a.min ?? "", Number(a.ek) || ""])) },
    { label: "🛒 Bestellvorschlag PDF", sub: `${low.length} Artikel`, run: orderPdf }];
  const VIEWS = [["bestand", "Bestand", stockArts.length], ["nachbestellen", "Nachbestellen", low.length], ["bewegungen", "Bewegungen"], ["inventur", "Inventuren", openCounts.length || null]];
  const stats = [{ label: "Lagerwert (EK)", value: fmtMoney(value), sub: `${stockArts.length} Lagerartikel` }, { label: "Nachbestellen", value: low.length, vcls: low.length ? "neg" : "", alert: !!low.length, sub: "auf/unter Mindestbestand", onClick: () => setView("nachbestellen") },
    { label: "Letzte Inventur", value: lastInv ? fmtDate(lastInv.date) : "noch keine", sub: openCounts.length ? `${openCounts.length} offen` : "Stichtag", onClick: () => setView("inventur") }];
  const artRow = (a) => { const s = st(a), isLow = a.min !== "" && a.min != null && s <= Number(a.min); return mob ? (
    <MItem key={a.id} icon={<ArtIco a={a} />} title={a.text} tags={[isLow && { label: "nachbestellen", color: "var(--red)" }]} sub={[a.number, a.loc, a.min != null && a.min !== "" && "min " + fmtQty(a.min)].filter(Boolean).join(" · ")}
      amount={fmtQty(s)} amountCls={isLow ? "neg" : ""} amountSub={a.unit || ""} onClick={() => setMv({ a })}
      swipe={{ left: [{ icon: "✎", label: "Artikel", bg: "#64748b", run: () => setEdit(a) }], right: [{ icon: "📥", label: "Zugang", bg: "#16a34a", run: () => setMv({ a, type: "eingang" }) }, { icon: "📤", label: "Abgang", bg: "#ef4444", run: () => setMv({ a, type: "entnahme" }) }] }} />
  ) : (
    <div key={a.id} className="frow">
      <ArtIco a={a} size={42} />
      <div className="grow click" onClick={() => setEdit(a)}><b>{a.text}</b><small className="muted block">{[a.number, a.loc && "📍 " + a.loc, a.supplier && "🚚 " + a.supplier, a.ek && "EK " + fmtMoney(Number(a.ek))].filter(Boolean).join(" · ")}</small></div>
      {view === "nachbestellen" && <span className="small">bestellen: <b>{fmtQty(reorderQty(a, s))}</b></span>}
      <div className="right invqty"><b className={isLow ? "neg" : ""}>{fmtQty(s)} <small>{a.unit || ""}</small></b><small className="muted block">{a.min != null && a.min !== "" ? "min " + fmtQty(a.min) : ""}</small></div>
      <button className="chip" title="Zugang" onClick={() => setMv({ a, type: "eingang" })}>＋</button>
      <button className="chip" title="Abgang" onClick={() => setMv({ a, type: "entnahme" })}>−</button>
    </div>
  ); };
  const moveList = [...allMoves].filter((m) => { const a = arts.find((x) => x.id === m.art); return a && (!q || norm(`${a.text} ${a.number} ${m.note}`).includes(norm(q))); }).sort((a, b) => b.date.localeCompare(a.date) || (b.created || "").localeCompare(a.created || "")).slice(0, 300);
  const body = view === "bewegungen" ? (
    mob ? mGroup(moveList, (m) => m.date).map(([d, l]) => <React.Fragment key={d}><MHead>{fmtDate(d)}</MHead>{l.map((m) => { const a = arts.find((x) => x.id === m.art); return (
      <MItem key={m.id} icon={<MIco e={MV_TYPES[m.type]?.[1] || "•"} />} title={a.text} sub={[MV_TYPES[m.type]?.[0], m.note].filter(Boolean).join(" · ")} amount={(m.qty > 0 ? "+" : "") + fmtQty(m.qty)} amountCls={m.qty < 0 ? "neg" : "pos"} amountSub={a.unit || ""}
        swipe={!m.derived ? { right: [{ icon: "🗑", label: "Löschen", bg: "#ef4444", run: () => confirm("Bewegung löschen?") && setMoves((x) => x.filter((y) => y.id !== m.id)) }] } : undefined} />); })}</React.Fragment>)
    : moveList.map((m) => { const a = arts.find((x) => x.id === m.art); return (
      <div key={m.id} className="frow"><span className="caticon" style={{ width: 36, height: 36, background: "var(--card2)" }}>{MV_TYPES[m.type]?.[1]}</span>
        <div className="grow"><b>{a.text}</b><small className="muted block">{fmtDate(m.date)} · {MV_TYPES[m.type]?.[0]}{m.note ? " · " + m.note : ""}</small></div>
        <b className={m.qty < 0 ? "neg" : "pos"}>{m.qty > 0 ? "+" : ""}{fmtQty(m.qty)} <small>{a.unit || ""}</small></b>
        {!m.derived ? <button className="chip" title="Löschen" onClick={() => confirm("Bewegung löschen?") && setMoves((x) => x.filter((y) => y.id !== m.id))}>✕</button> : <span style={{ width: 34 }} />}</div>); })
  ) : view === "inventur" ? (<>
    <div className="row"><button className="btn primary" onClick={() => setNewCnt({ loc: "", group: "" })}>＋ Neue Inventur</button><span className="muted small grow">Stichtagsinventur oder permanente Teil-Inventur je Lagerort/Gruppe</span></div>
    {!counts.length && <MEmpty>Noch keine Inventur. Starte eine Zählung – am Handy auch per Strichcode-Scan.</MEmpty>}
    {[...counts].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((c) => { const closed = c.status === "abgeschlossen", L = c.snapshot || [], tot = kbR2(L.reduce((s, l) => s + l.ist * l.ek, 0)); return (
      <div key={c.id} className={"frow" + (closed ? "" : " click")} onClick={() => !closed && setCnt(c.id)}>
        <span className="caticon" style={{ width: 40, height: 40, background: "var(--card2)" }}>{closed ? "✅" : "📝"}</span>
        <div className="grow"><b>{c.name}</b><small className="muted block">Stichtag {fmtDate(c.date)}{c.loc ? " · " + c.loc : ""}{c.group ? " · " + c.group : ""} · {closed ? `${L.length} Pos. · ${L.filter((l) => l.ist !== l.soll).length} Diff. · Wert ${fmtMoney(tot)}` : `${Object.values(c.lines || {}).filter((v) => v !== "").length} gezählt`}</small></div>
        {closed ? <><button className="chip" onClick={(e) => { e.stopPropagation(); invPdf(c); }}>🖨 PDF</button><button className="chip" onClick={(e) => { e.stopPropagation(); invXlsx(c); }}>📊</button></>
          : <><span className="stpill st-open">offen</span><button className="chip" title="Zählliste drucken" onClick={(e) => { e.stopPropagation(); listPdf(c); }}>🖨</button></>}
      </div>); })}
  </>) : (() => { const l = filt(view === "nachbestellen" ? low : stockArts).sort((x, y) => (x.text || "").localeCompare(y.text || "", "de"));
    if (!stockArts.length) return <MEmpty>Noch keine Lagerartikel. Öffne einen Artikel und aktiviere „Lagerartikel“ – oder lege direkt einen neuen an.</MEmpty>;
    if (!l.length) return <MEmpty>{view === "nachbestellen" ? "Alles ausreichend auf Lager 👍" : "Keine Treffer."}</MEmpty>;
    return mob && loc === "alle" ? mGroup([...l].sort((x, y) => (x.loc || "~").localeCompare(y.loc || "~", "de")), (a) => a.loc || "Ohne Lagerort").map(([g, x]) => <React.Fragment key={g}><MHead right={x.length}>{g}</MHead>{x.map(artRow)}</React.Fragment>) : l.map(artRow); })();
  const newArt = () => setEdit({ id: uid(), text: "", unit: "Stk", price: "", number: "", group: "", stock: true, autoSales: true, initQty: "" });
  const scanHit = (code) => { setScan(false); const a = arts.find((x) => x.ean === code); if (a?.stock) setMv({ a }); else if (a) setEdit({ ...a, stock: true }); else setEdit({ id: uid(), text: "", unit: "Stk", price: "", number: "", group: "", ean: code, stock: true, autoSales: true, initQty: "", autoLookup: true }); };
  const locChips = locs.length ? [["alle", "Alle Orte"], ...locs.map((l) => [l, l]), ["ohne", "Ohne Ort"]] : [];
  const viewChips = VIEWS.map(([k, l, n]) => <button key={k} className={"chip" + (view === k ? " on" : "")} onClick={() => setView(k)}>{l}{n ? <small> {n}</small> : ""}</button>);
  return (
    <div className="ctpage invstock">
      {mob ? (
      <div className="mpage">
        <MStats items={stats} />
        <MActs items={[{ label: "📷 Scannen", primary: true, run: () => setScan(true) }, onUpload && { label: "🧾 Beleg (KI)", run: () => setRcpt(true) }, { label: "＋ Lagerartikel", run: newArt }, { label: "📋 Inventur", run: () => setView("inventur") }]} />
        <MBar q={q} setQ={setQ} placeholder="Artikel, Nummer, Lagerort suchen">{null}</MBar>
        <div className="mchips">{viewChips}<ExportMenu items={exportItems} /></div>
        {!!locChips.length && (view === "bestand" || view === "nachbestellen") && <div className="mchips">{locChips.map(([k, l]) => <button key={k} className={"chip" + (loc === k ? " on" : "")} onClick={() => setLoc(k)}>{l}</button>)}</div>}
        <MScroll>{body}</MScroll>
      </div>
      ) : (<>
      <div className="kbstats">{stats.map((s, i) => <div key={i} className={"tile kbstat" + (s.onClick ? " click" : "") + (s.alert ? " mwarn" : "")} onClick={s.onClick}><small className="muted">{s.label}</small><b className={s.vcls || ""}>{s.value}</b><small className="muted">{s.sub}</small></div>)}</div>
      <div className="invbar">
        <button className="btn primary" onClick={() => setScan(true)}>📷 Scannen & buchen</button>
        {onUpload && <button className="btn" onClick={() => setRcpt(true)}>🧾 Wareneingang per Beleg (KI)</button>}
        <button className="btn" onClick={newArt}>＋ Lagerartikel</button>
        <button className="btn" onClick={() => setNewCnt({ loc: "", group: "" })}>📋 Neue Inventur</button>
        <span className="grow" />
        <ExportMenu items={exportItems} />
        {setTab && <button className="chip" onClick={() => setTab("artikel")}>📦 Artikel</button>}
      </div>
      <div className="chips invfilter">{viewChips}</div>
      <div className="searchbar"><span>🔍</span><input type="search" placeholder="Artikel, Nummer, Lagerort, Lieferant suchen" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!!locChips.length && (view === "bestand" || view === "nachbestellen") && <div className="chips invfilter">{locChips.map(([k, l]) => <button key={k} className={"chip" + (loc === k ? " on" : "")} onClick={() => setLoc(k)}>{l}</button>)}</div>}
      <FitScroll card cols={view === "inventur" ? ["Inventur", "Stichtag · Umfang", "Status"] : view === "bewegungen" ? ["Artikel", "Datum · Art", "Menge"] : ["Artikel", "Lagerort · Lieferant", "Bestand"]}><section className="tile ctlist">{body}</section></FitScroll>
      </>)}
      {mv && <StockMoveWin a={mv.a} type={mv.type} st={st(mv.a)} onSave={addMove} onClose={() => setMv(null)} />}
      {scan && <CodeScanWin title="Lagerartikel scannen" onClose={() => setScan(false)} onResult={scanHit} />}
      {rcpt && <StockReceiptWin arts={arts} docs={docs} onScan={onScan} onUpload={onUpload} onOpen={onOpen} onBook={bookReceipt} onClose={() => setRcpt(false)} />}
      {edit && <ArticleEditor a={edit} onSave={(a, mvs) => { saveArt(a); if (mvs?.length) setMoves((l) => [...l, ...mvs]); }} onDelete={(a) => setArts((l) => l.filter((x) => x.id !== a.id))} onClose={() => setEdit(null)} />}
      {cnt && counts.find((c) => c.id === cnt) && <CountWin count={counts.find((c) => c.id === cnt)} arts={stockArts} moves={allMoves} onChange={(c) => setCounts((l) => l.map((x) => (x.id === c.id ? c : x)))}
        onFinish={finish} onDelete={(c) => setCounts((l) => l.filter((x) => x.id !== c.id))} onClose={() => setCnt(null)} />}
      {newCnt && <Win id="newcount" onClose={() => setNewCnt(null)} small dirty={false}>
        <div className="panelhead"><b>Neue Inventur</b><button className="btn primary" onClick={() => startCount(newCnt)}>Zählung starten</button><XBtn /></div>
        <label>Umfang – Lagerort<select value={newCnt.loc} onChange={(e) => setNewCnt({ ...newCnt, loc: e.target.value })}><option value="">Alle Lagerorte (Stichtagsinventur)</option>{locs.map((l) => <option key={l}>{l}</option>)}</select></label>
        <label>Artikelgruppe<select value={newCnt.group} onChange={(e) => setNewCnt({ ...newCnt, group: e.target.value })}><option value="">Alle Gruppen</option>{[...new Set(stockArts.map((a) => a.group).filter(Boolean))].map((g) => <option key={g}>{g}</option>)}</select></label>
        <p className="muted small">Gezählt wird gegen den Sollbestand zum Stichtag. Beim Abschließen werden Differenzen als „Inventurdifferenz“ gebucht und eine Inventurliste mit Bewertung (Einstandspreis) erstellt.</p>
      </Win>}
    </div>
  );
}

/* ======================= Mahnungen (Reiter) ======================= */
function DunningPage({ setTab, book }) {
  const mob = useMobileBeta();
  const [pickOpen, setPickOpen] = useState(false);
  const [list, setList] = useLsState("invoices", []);
  const co = { ...CO_DEFAULT, ...ls.get("company", {}) };
  const dn = dunning();
  const [remind, setRemind] = useState(null), [other, setOther] = useState(""), [payX, setPayX] = useState(null), [prevInv, setPrevInv] = useState(null);
  const patch = (id, p) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const inv = list.filter((x) => x.kind === "rechnung");
  const over = inv.filter((x) => invState(x) === "überfällig").map((x) => {
    const last = lastReminder(x), since = last ? -daysUntil(last.due) : -daysUntil(invDue(x));
    return { x, last, since, ready: !last || since >= (dn.waitDays || 0), next: Math.min((x.reminders || []).length, dn.levels.length - 1) };
  }).sort((a, b) => b.since - a.since);
  const openNotOver = inv.filter((x) => invState(x) === "offen");
  const history = inv.flatMap((x) => (x.reminders || []).map((r, i) => ({ x, r, i }))).sort((a, b) => (b.r.date || "").localeCompare(a.r.date || "") || b.i - a.i);
  const year = todayISO().slice(0, 4);
  const pdfOf = (x, i) => buildInvoicePdf({ ...x, reminders: (x.reminders || []).slice(0, i + 1) }, co, x.reminders[i]);
  return (
    <div className="invpage">
      {mob ? (
      <div className="mpage">
        <MStats items={[{ label: "Überfällig", value: fmtMoney(over.reduce((s, o) => s + invTotal(o.x), 0)), vcls: over.length ? "neg" : "", alert: !!over.length, sub: `${over.length} Rechnung${over.length === 1 ? "" : "en"}` },
          { label: "Jetzt mahnen", value: over.filter((o) => o.ready).length, sub: `Wartezeit ${dn.waitDays} Tage` },
          { label: `Mahnungen ${year}`, value: history.filter((h) => (h.r.date || "").startsWith(year)).length, sub: "versendet" }]} />
        <MActs items={[{ label: "＋ Mahnung", primary: true, run: () => setPickOpen(true) }, setTab && { label: "🧾 Rechnungen", run: () => setTab("invoices") }]} />
        <MScroll>
          <MHead right={over.length}>Zu mahnen</MHead>
          {!over.length && <MEmpty>Keine überfälligen Rechnungen 🎉</MEmpty>}
          {over.map(({ x, last, since, ready, next }) => (
            <MItem key={x.id} icon={<MAvatar text={x.customer?.name} color="#ef4444" />} title={x.customer?.name || "Ohne Kunde"}
              sub={`${x.number} · ${since} T. überfällig${last ? " · zuletzt " + remindName(last.level) : ""}`} amount={fmtMoney(invTotal(x))} amountCls="neg"
              pill={<span className={"stpill " + (ready ? "st-over" : "st-draft")}>{ready ? remindName(next) : `in ${(dn.waitDays || 0) - since} T.`}</span>}
              onClick={() => setRemind(x)}
              swipe={{ left: [{ icon: "👁", label: "Vorschau", bg: "#0ea5e9", run: () => setPrevInv(prevInv === x.id ? null : x.id) }],
                right: [{ icon: "📮", label: "Mahnen", bg: "#ef4444", run: () => setRemind(x) }, { icon: "✓", label: "Bezahlt", bg: "#16a34a", run: () => setPayX(x) }] }}
              after={prevInv === x.id && <InvPreview x={x} co={co} />} />
          ))}
          <MHead right={history.length}>Mahnverlauf</MHead>
          {!history.length && <MEmpty>Noch keine Mahnungen erstellt.</MEmpty>}
          {history.map(({ x, r, i }) => { const s = invState(x); return (
            <MItem key={x.id + i} icon={<MIco e="📮" />} title={`${remindName(r.level)} · ${x.customer?.name || ""}`} sub={`${fmtDate(r.date)} · ${x.number} · Frist ${fmtDate(r.due)}`}
              amount={fmtMoney(invTotal({ ...x, reminders: x.reminders.slice(0, i + 1) }))} amountCls={s === "bezahlt" ? "in" : ""}
              pill={i === x.reminders.length - 1 && <span className={"stpill " + (STATE_UI[s]?.[1] || "")}>{STATE_UI[s]?.[0] || s}</span>}
              onClick={async () => openPdf(await pdfOf(x, i), invFileName(x, r))}
              swipe={{ left: [{ icon: "👁", label: "Vorschau", bg: "#0ea5e9", run: () => setPrevInv(prevInv === x.id + ":" + i ? null : x.id + ":" + i) }],
                right: [{ icon: "📤", label: "Teilen", bg: "#8b5cf6", run: async () => sharePdf(await pdfOf(x, i), invFileName(x, r), remindName(r.level) + " " + x.number, x.customer?.email) }] }}
              after={prevInv === x.id + ":" + i && <InvPreview x={x} co={co} make={() => pdfOf(x, i)} name={invFileName(x, r)} />} />); })}
        </MScroll>
        {pickOpen && (
          <Win id="dunpick" onClose={() => setPickOpen(false)} dirty={false} small>
            <div className="panelhead"><b>Mahnung für …</b><XBtn /></div>
            {(() => { const cand = [...over.map((o) => o.x), ...openNotOver]; return !cand.length ? <p className="muted">Keine offenen Rechnungen – alles bezahlt 🎉</p>
              : cand.map((x) => <div key={x.id} className="frow click" onClick={() => { setPickOpen(false); setRemind(x); }}><MAvatar text={x.customer?.name} /><div className="grow"><b>{x.customer?.name || "Ohne Kunde"}</b><small className="muted block">{x.number} · {fmtMoney(invTotal(x))}{invState(x) === "überfällig" ? " · überfällig" : ""}</small></div><span className="muted">›</span></div>); })()}
          </Win>
        )}
      </div>
      ) : (<>
      <div className="invstats">
        <div className={"tile" + (over.length ? " alert" : "")}><small className="muted">Überfällig</small><b className={over.length ? "neg" : ""}>{fmtMoney(over.reduce((s, o) => s + invTotal(o.x), 0))}</b><small className="muted">{over.length} Rechnung{over.length === 1 ? "" : "en"}</small></div>
        <div className="tile"><small className="muted">Jetzt mahnen</small><b>{over.filter((o) => o.ready).length}</b><small className="muted">Wartezeit {dn.waitDays} Tage je Stufe</small></div>
        <div className="tile"><small className="muted">Mahnungen {year}</small><b>{history.filter((h) => (h.r.date || "").startsWith(year)).length}</b><small className="muted">versendet</small></div>
        <div className="tile"><small className="muted">Mahnspesen {year}</small><b>{fmtMoney(history.filter((h) => (h.r.date || "").startsWith(year)).reduce((s, h) => s + (Number(h.r.fee) || 0), 0))}</b><small className="muted">verrechnet</small></div>
      </div>
      <div className="invbar">
        {(() => { const cand = [...over.map((o) => o.x), ...openNotOver]; return (
          <details className="more newdun">
            <summary className="btn primary">＋ Mahnung</summary>
            <div className="moremenu" onClick={(e) => { if (e.target.closest("button")) e.currentTarget.closest("details").open = false; }}>
              {!cand.length && <p className="muted small" style={{ margin: 8 }}>Keine offenen Rechnungen – alles bezahlt 🎉</p>}
              {cand.map((x) => <button key={x.id} onClick={() => setRemind(x)}><b>{x.number}</b> · {x.customer?.name || "Ohne Kunde"} <span className="muted">· {fmtMoney(invTotal(x))}{invState(x) === "überfällig" ? " · überfällig" : ""}</span></button>)}
            </div>
          </details>); })()}
        <span className="grow" />
        <ExportMenu className="btn" items={[{ label: "📮 Offene Posten PDF", run: async () => saveBlob(await openItemsPdf(list), `Offene-Posten-${isoToday()}.pdf`) },
          { label: "📄 Offene Posten CSV", run: () => downloadCsv(`Offene-Posten-${isoToday()}.csv`, OP_HEAD, openList(list).map(opRow)) },
          { label: "📒 Mahnverlauf CSV", run: () => downloadCsv(`Mahnverlauf-${isoToday()}.csv`, ["Datum", "Stufe", "Rechnung", "Kunde", "Frist", "Gebühr €", "Rechnungsbetrag €"], history.map(({ x, r }) => [r.date, remindName(r.level), x.number, x.customer?.name || "", r.due, r2e(r.fee), r2e(invTotal({ ...x, fee: 0 }))])) }]} />
        {setTab && <button className="btn" onClick={() => setTab("invoices")}>🧾 Rechnungen</button>}
        {setTab && <button className="btn" title="Mahnwesen einstellen" onClick={() => { ls.set("openSettingsSec", "mahnwesen"); setTab("settings"); }}>⚙︎</button>}
      </div>
      <FitScroll card className="kinv" cols={["Kunde", "Rechnung · Fälligkeit", "Betrag · Stufe"]}>
      <section className="tile invlist">
        <div className="tilehead" style={{ padding: "8px 14px 0" }}><b>Zu mahnen</b></div>
        {!over.length && <p className="muted small" style={{ padding: "0 14px" }}>Keine überfälligen Rechnungen 🎉</p>}
        {over.map(({ x, last, since, ready, next }) => (<React.Fragment key={x.id}>
          <div className={"invrow" + (prevInv === x.id ? " prevopen" : "")} onClick={() => setRemind(x)}>
            <div className="invmain">
              <div className="row1"><b className="invname" title="Vorschau ein-/ausblenden" onClick={(e) => { e.stopPropagation(); setPrevInv(prevInv === x.id ? null : x.id); }}>{x.customer?.name || "Ohne Kunde"}</b></div>
              <small className="muted block">{x.number} · fällig {fmtDate(invDueEff(x))} · {since} Tage überfällig{last ? ` · zuletzt ${remindName(last.level)} am ${fmtDate(last.date)}` : " · noch nicht gemahnt"}</small>
            </div>
            <b className="invamt neg">{fmtMoney(invTotal(x))}</b>
            <span className={"stpill " + (ready ? "st-over" : "st-draft")}>{ready ? "fällig" : `in ${(dn.waitDays || 0) - since} T.`}</span>
            <div className="invacts" onClick={(e) => e.stopPropagation()}>
              <button className={"btn sm" + (ready ? " danger" : "")} onClick={() => setRemind(x)}>{remindName(next)} erstellen</button>
              <StatusMenu x={x} s={invState(x)} book={book} onPay={setPayX} onUnpay={(y) => unpayInv(y, book, patch)} onPatch={patch} />
            </div>
          </div>
          {prevInv === x.id && <InvPreview x={x} co={co} />}
        </React.Fragment>))}
      </section>
      <section className="tile invlist">
        <div className="tilehead" style={{ padding: "8px 14px 0" }}><b>Mahnverlauf</b><small>{history.length}</small></div>
        {!history.length && <p className="muted small" style={{ padding: "0 14px" }}>Noch keine Mahnungen erstellt.</p>}
        {history.map(({ x, r, i }) => { const s = invState(x); return (
          <React.Fragment key={x.id + i}>
          <div className={"invrow" + (prevInv === x.id + ":" + i ? " prevopen" : "")} onClick={async () => openPdf(await pdfOf(x, i), invFileName(x, r))}>
            <div className="invmain">
              <div className="row1"><b className="invname" title="Vorschau ein-/ausblenden" onClick={(e) => { e.stopPropagation(); setPrevInv(prevInv === x.id + ":" + i ? null : x.id + ":" + i); }}>{remindName(r.level)} · {x.customer?.name}</b></div>
              <small className="muted block">{fmtDate(r.date)} · {x.number} · Frist {fmtDate(r.due)}{Number(r.fee) ? ` · Spesen ${fmtMoney(Number(r.fee))}` : ""}</small>
            </div>
            <b className="invamt">{fmtMoney(invTotal({ ...x, reminders: x.reminders.slice(0, i + 1) }))}</b>
            {i !== x.reminders.length - 1 && <span className={"stpill " + (STATE_UI[s]?.[1] || "")}>{STATE_UI[s]?.[0] || s}</span>}
            <div className="invacts" onClick={(e) => e.stopPropagation()}>
              <button className="iconbtn" title="PDF ansehen / drucken" onClick={async () => openPdf(await pdfOf(x, i), invFileName(x, r))}><IcoEye /></button>
              <button className="iconbtn" title="Teilen" onClick={async () => sharePdf(await pdfOf(x, i), invFileName(x, r), remindName(r.level) + " " + x.number, x.customer?.email)}><IcoShare /></button>
              {i === x.reminders.length - 1 && s !== "bezahlt" && <button className="link small red" onClick={() => confirm("Diese Mahnung aus dem Verlauf entfernen?") && patch(x.id, { reminders: x.reminders.slice(0, -1) })}>Zurücknehmen</button>}
              {i === x.reminders.length - 1 && <StatusMenu x={x} s={s} book={book} onPay={setPayX} onUnpay={(y) => unpayInv(y, book, patch)} onPatch={patch} />}
            </div>
          </div>
          {prevInv === x.id + ":" + i && <InvPreview x={x} co={co} make={() => pdfOf(x, i)} name={invFileName(x, r)} />}
          </React.Fragment>); })}
      </section>
      </FitScroll>
      </>)}
      {remind && <RemindWin inv={remind} co={co} onClose={() => setRemind(null)} onDone={(n) => patch(n.id, { reminders: n.reminders })} />}
      {payX && <PayWin inv={payX} book={book} onClose={() => setPayX(null)} onDone={(p) => patch(payX.id, p)} />}
    </div>
  );
}

const CSS = `
:root{color-scheme:light;--bg:#f3f5f9;--card:#ffffff;--card2:#f6f8fb;--line:#e6e9ef;--txt:#0f1b2d;--mut:#6b7686;--acc:#0b63f6;--acc2:#00b3a4;--red:#e5484d;--warn:#e88a00;--ok:#16a34a;
  --shadow:0 1px 2px #0f1b2d0d,0 4px 14px #0f1b2d0f;--hero:linear-gradient(135deg,#0b3d91 0%,#0b63f6 55%,#00b3a4 100%)}
@media all{:root[data-theme=dark]{color-scheme:dark;--bg:#0d1117;--card:#161b23;--card2:#1c222c;--line:#262d38;--txt:#e8ecf2;--mut:#8b95a5;--acc:#4f8cff;--acc2:#2dd4bf;--red:#ff6b6b;--warn:#ffb648;--ok:#3ecf8e;
  --shadow:0 1px 2px #0006;--hero:linear-gradient(135deg,#123a7a 0%,#1d4fd8 55%,#0f9488 100%)}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;-webkit-tap-highlight-color:transparent}
.app{max-width:760px;margin:0 auto;padding:calc(env(safe-area-inset-top) + 8px) 16px calc(env(safe-area-inset-bottom) + 96px)}
.top h1{font-size:30px;letter-spacing:-.02em;margin:10px 2px 14px}
input,select,textarea{width:100%;background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:12px;padding:11px 12px;font:inherit;font-size:16px}
input:focus,select:focus,textarea:focus{outline:2px solid var(--acc);outline-offset:-1px}
textarea{resize:vertical}label{display:block;color:var(--mut);font-size:13px;margin:10px 0 0}label>input,label>select,label>textarea{margin-top:4px}
.muted{color:var(--mut)}.small{font-size:12px}.block{display:block}.grow{flex:1;min-width:0}.right{text-align:right}
.err{color:var(--red);font-size:12px}.red{color:var(--red)!important}.warn{color:var(--warn)!important}.ok{color:var(--ok)!important}
.empty{text-align:center;color:var(--mut);padding:40px 20px}
.clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

/* Finanz-Look */
.hero{background:var(--hero);color:#fff;border-radius:22px;padding:18px 18px 14px;box-shadow:0 8px 24px #0b63f633;margin-bottom:14px}
.hero small{opacity:.85;font-size:13px}.hero-v{font-size:34px;font-weight:700;letter-spacing:-.02em;margin:2px 0 12px}
.hero-row{display:flex;gap:8px}.hero-row>div{flex:1;background:#ffffff24;border-radius:14px;padding:8px 10px}
.hero-row small{display:block;font-size:11px}.hero-row b{font-size:14px;white-space:nowrap}
.tile{background:var(--card);border-radius:18px;padding:14px;box-shadow:var(--shadow);margin-bottom:12px;display:block}
.tile.alert{display:flex;gap:12px;align-items:center;border:1px solid #e5484d40;cursor:pointer}.tile.alert small{display:block;color:var(--mut);font-size:12px}
.tilehead{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.tilehead small{color:var(--mut)}
.caticon{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;flex:none}
.frow{display:flex;gap:12px;align-items:center;padding:8px 0}.frow+.frow{border-top:1px solid var(--line)}.frow.click{cursor:pointer}
.frow small.block{margin-top:1px}
.crow+.crow{border-top:1px solid var(--line)}.crow .frow{padding-bottom:4px}
.cmeta .link{white-space:nowrap;flex:none}.cmeta{gap:8px;display:flex;justify-content:space-between;align-items:center;padding:0 0 10px 52px}
.pill{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;font-size:12px;background:var(--card2);border-radius:999px;padding:3px 9px}
.datebox{width:44px;height:44px;border-radius:12px;background:var(--card2);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;flex:none}
.datebox b{font-size:17px}.datebox small{font-size:10px;color:var(--mut);margin-top:2px}
.donutwrap{display:flex;gap:14px;align-items:center}.donut{width:140px;height:140px;flex:none}
.donut-l{font-size:10px;fill:var(--mut)}.donut-v{font-size:16px;font-weight:700;fill:var(--txt)}
.legendlist{list-style:none;margin:0;padding:0;flex:1;min-width:0;font-size:13px}.legendlist li{display:flex;gap:8px;align-items:center;padding:4px 0}
.legendlist .grow{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none}
.bar{height:6px;background:var(--card2);border-radius:3px;margin-top:6px;overflow:hidden}.bar div{height:100%;border-radius:3px}
.chart{display:flex;gap:8px;height:130px;align-items:flex-end}
.chart .col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%}
.chart .pair{flex:1;width:100%;display:flex;gap:3px;align-items:flex-end;justify-content:center}
.chart .v{width:40%;max-width:14px;border-radius:4px 4px 0 0;min-height:3px}.chart small{color:var(--mut);font-size:10px;margin-top:4px}
.v.out,.dot.out{background:var(--neg,var(--red))}.v.inc,.dot.inc{background:var(--pos,var(--ok))}
.legend{color:var(--mut);font-size:12px;margin-top:8px;display:flex;gap:6px;align-items:center}.legend .dot{margin-left:6px}

/* Dokumenten-Look */
.searchbar{display:flex;align-items:center;gap:8px;background:var(--card);border-radius:14px;padding:0 6px 0 12px;box-shadow:var(--shadow);margin-bottom:12px}
.searchbar input{border:0;background:none;padding:12px 4px;outline:none}
.iconbtn{background:var(--card2);border:0;border-radius:10px;width:38px;height:38px;color:var(--txt);font-size:18px;flex:none}
.folders{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px;scrollbar-width:none}.folders::-webkit-scrollbar{display:none}
.folder{flex:none;width:96px;text-align:left;background:var(--card);border:1.5px solid transparent;border-radius:16px;padding:10px;box-shadow:var(--shadow);color:var(--txt);font:inherit}
.folder span{font-size:22px;display:block}.folder b{display:block;font-size:12px;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.folder small{color:var(--mut);font-size:11px}
.folder.on{border-color:var(--acc)}
.chips{display:flex;gap:6px;overflow-x:auto;padding:2px 0 6px;scrollbar-width:none}.chips::-webkit-scrollbar{display:none}
.chip{flex:none;width:auto;white-space:nowrap;background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px}
select.chip{padding:6px 10px;font-size:13px;-webkit-appearance:none;appearance:none}
.chip.on{background:var(--acc);border-color:var(--acc);color:#fff}.chip:disabled{opacity:.4}
.sumbar{color:var(--mut);font-size:12px;margin:4px 2px 8px}
.dlist{background:var(--card);border-radius:18px;box-shadow:var(--shadow);overflow:hidden}
.ditem{display:flex;gap:12px;padding:12px;cursor:pointer;align-items:flex-start}.ditem+.ditem{border-top:1px solid var(--line)}
.thumb{width:54px;height:70px;border-radius:8px;background:var(--card2);border:1px solid var(--line);overflow:hidden;flex:none;display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:11px;font-weight:600}
.thumb img,.gthumb img{width:100%;height:100%;object-fit:cover;object-position:top}
.labels{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.label{white-space:nowrap;font-size:11px;font-weight:600;border-radius:6px;padding:2px 7px;background:var(--card2);color:var(--mut)}.label.tax{color:#b45309;background:#f59e0b22}.label.tag{font-weight:500}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.gcard{background:var(--card);border-radius:16px;box-shadow:var(--shadow);overflow:hidden;cursor:pointer}
.gthumb{height:150px;background:var(--card2);display:flex;align-items:center;justify-content:center;color:var(--mut);border-bottom:1px solid var(--line)}
.gbody{padding:10px;display:flex;flex-direction:column;gap:4px}.gbody b{font-size:13px}.gbody .row1{margin-top:4px;flex-direction:column;align-items:flex-start;gap:4px}
.row1{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.amt{font-weight:700;white-space:nowrap;font-size:14px}.amt.paid{color:var(--mut);text-decoration:line-through;font-weight:500}

/* Allgemein */
.list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.list li{background:var(--card);border-radius:16px;padding:12px 14px;cursor:pointer;box-shadow:var(--shadow)}.list li.static{cursor:default}.list li.done{opacity:.5}
.title{font-weight:600}.row2{display:flex;flex-wrap:wrap;gap:4px 12px;color:var(--mut);font-size:13px;margin-top:4px}
.filters{display:flex;gap:8px;align-items:center;margin:4px 0 8px}
.fab{position:fixed;right:20px;bottom:calc(env(safe-area-inset-bottom) + 80px);width:58px;height:58px;border-radius:50%;border:0;background:var(--acc);color:#fff;font-size:30px;box-shadow:0 8px 22px #0b63f659;z-index:5}
nav.bottom{position:fixed;left:0;right:0;bottom:0;display:flex;background:color-mix(in srgb,var(--card) 88%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom);z-index:4}
nav.bottom>button{flex:1;background:none;border:0;color:var(--mut);font:inherit;font-size:10.5px;padding:8px 0;display:flex;flex-direction:column;align-items:center;gap:2px;position:relative}
nav.bottom>button span{font-size:20px;filter:grayscale(1);opacity:.7}nav.bottom>button.on{color:var(--acc);font-weight:600}nav.bottom>button.on span{filter:none;opacity:1}
.badge{position:absolute;top:4px;left:calc(50% + 8px);background:var(--red);color:#fff;border-radius:999px;font-size:10px;padding:1px 6px}
.btn{display:inline-block;text-decoration:none;background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:12px;padding:9px 14px;font:inherit;font-size:14px}
.btn.primary{background:var(--acc);border-color:var(--acc);color:#fff}.btn.danger{color:var(--red)}.btn:disabled{opacity:.4}
.link{background:none;border:0;color:var(--acc);font:inherit;font-size:14px;padding:6px 0;font-weight:500}.link.red{color:var(--red)}
.check{display:flex;align-items:center;gap:8px;color:var(--txt);font-size:14px;margin:10px 0 0}.check input{width:auto;margin:0}
.sheet{position:fixed;inset:0;background:#0007;z-index:10;display:flex;justify-content:center}
.panel{background:var(--bg);width:100%;max-width:760px;overflow-y:auto;padding:0 16px calc(env(safe-area-inset-bottom) + 30px)}
.panelhead{display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--bg);padding:calc(env(safe-area-inset-top) + 10px) 0 8px;z-index:1}
.preview{width:100%;max-height:380px;object-fit:contain;background:var(--card);border-radius:16px;margin:8px 0;box-shadow:var(--shadow)}
.pdfbox{display:flex;gap:12px;align-items:center;background:var(--card);border-radius:16px;padding:12px;margin:8px 0;box-shadow:var(--shadow)}
.pdfbox .thumb{width:90px;height:120px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 8px}.grid2>*,.grid3>*{min-width:0}
fieldset{min-width:0;border:0;background:var(--card);border-radius:16px;margin:12px 0 0;padding:6px 14px 14px;box-shadow:var(--shadow)}
legend{float:left;width:100%;color:var(--txt);font-weight:600;font-size:14px;padding:8px 0 0}legend+*{clear:both}
.seg{display:flex;background:var(--card2);border-radius:10px;padding:3px;margin-top:6px}
.seg button{flex:1;background:none;border:0;color:var(--mut);font:inherit;font-size:13px;padding:7px;border-radius:8px}.seg button.on{background:var(--card);color:var(--txt);font-weight:600;box-shadow:var(--shadow)}
.dlrow{display:grid;grid-template-columns:auto 1fr 140px auto auto;gap:6px;align-items:center;margin-top:8px}.dlrow input[type=checkbox]{width:auto}
.budrow{display:grid;grid-template-columns:1fr 110px;gap:8px;align-items:center;margin-top:6px;font-size:14px}.budrow input{padding:7px 10px}
.summary{background:var(--card);border-radius:16px;padding:12px 14px;margin:12px 0 0;color:var(--mut);box-shadow:var(--shadow)}
.fulltext{white-space:pre-wrap;background:var(--card);border-radius:14px;padding:12px;font-size:12px;max-height:320px;overflow:auto}
.letter{font:14px/1.5 -apple-system,system-ui,sans-serif;max-height:none;color:var(--txt);box-shadow:var(--shadow)}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 8px}
section h3{font-size:12px;color:var(--mut);margin:18px 4px 8px;text-transform:uppercase;letter-spacing:.05em}section h3.red{color:var(--red)}
.qr{display:flex;gap:12px;align-items:center;margin-top:12px}.qr img{width:140px;height:140px;border-radius:10px;background:#fff;border:1px solid var(--line)}
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 150px);background:#0f1b2d;color:#fff;padding:10px 16px;border-radius:12px;z-index:20;max-width:90%}
.settings .btn{margin-top:10px}
.importbtn{display:flex;gap:12px;align-items:center;width:100%;border:0;text-align:left;font:inherit;color:var(--txt);cursor:pointer}
.ditem.center{align-items:center}.one{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stats{display:flex;gap:8px;margin:10px 0 4px}.stats>div{flex:1;background:var(--card2);border-radius:12px;padding:8px 10px;min-width:0}
.stats small{display:block;color:var(--mut);font-size:11px}.stats b{font-size:14px;white-space:nowrap}.stats b.small{white-space:normal;font-size:12px}
.iconbtn.ok{color:var(--ok);font-weight:700}
.kv{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid var(--line);font-size:14px}.kv:first-of-type{border-top:0}.kv span{text-align:right;word-break:break-word}
.center-text{text-align:center}
@media (max-width:420px){.dlrow{grid-template-columns:auto 1fr auto auto}.dlrow input[type=date]{grid-column:2}.donut{width:120px;height:120px}}

/* ===== Responsives Layout ===== */
.top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.addbtn,.brand,.desk-only{display:none!important}
.app{padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right))}
nav.bottom{padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}
nav.bottom>button{min-height:52px;cursor:pointer}
button,select,a,input[type=checkbox]{touch-action:manipulation}
button,.ditem,.gcard,.folder,.frow.click,.chip{cursor:pointer}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.iconbtn{min-width:40px;min-height:40px}
.frow.click{border-radius:10px}
img{max-width:100%}
@media (hover:hover){
  .ditem:hover,.frow.click:hover,.list li:hover{background:var(--card2)}
  .gcard,.folder,.importbtn,.tile.alert,.btn,.chip{transition:transform .15s,box-shadow .15s,border-color .15s,filter .15s}
  .gcard:hover,.folder:hover,.importbtn:hover,.tile.alert:hover{transform:translateY(-1px);box-shadow:0 2px 4px #0f1b2d14,0 12px 28px #0f1b2d1f}
  .btn:hover{filter:brightness(1.06)}.chip:hover{border-color:var(--acc)}
  nav.bottom>button:hover{color:var(--txt)}
}
/* Kleine Phones (iPhone SE, kleine Android) */
@media (max-width:359px){
  .top h1{font-size:25px}.hero{padding:16px 14px 12px}.hero-v{font-size:28px}
  .hero-row,.stats{flex-wrap:wrap}.hero-row>div,.stats>div{flex:1 1 40%}
  nav.bottom>button{font-size:9.5px}.folder{width:84px}
  .donutwrap{flex-direction:column;align-items:stretch}.donut{align-self:center}
  .grid{gap:8px}.gthumb{height:118px}.grid2{grid-template-columns:1fr}
  .dlrow{grid-template-columns:auto 1fr auto}.dlrow input[type=date]{grid-column:1/-1}
}
/* Tablet (iPad, große Android) */
@media (min-width:700px){
  .app{max-width:1100px}
  .top h1{font-size:32px}
  .dash{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
  .dash>.hero,.dash>.tile.alert,.dash>.empty,.dash>p{grid-column:1/-1}
  .dash .tile,.dash .hero{margin:0}
  .tab-contracts .dash{grid-template-columns:1fr}
  .hero-v{font-size:40px}.hero{padding:22px 22px 18px}
  .chart{height:160px}
  .grid{grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}.gthumb{height:180px}
  .folder{width:112px}
  .dlist .ditem{padding:12px 16px}
  .settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px;align-items:start}.settings>.tile{grid-column:1/-1;margin:0}
  .sheet{align-items:center;padding:24px}
  .panel{max-width:680px;max-height:calc(100dvh - 48px);border-radius:24px;box-shadow:0 24px 70px #0006;padding-bottom:24px;animation:popin .18s ease-out}
  .panelhead{padding-top:14px}
  .preview{max-height:460px}
}
/* Mac / Desktop-Browser: Seitenleiste */
/* Seitenleiste ab Tablet (iPad hoch: 768–1023 schmal, ab 1024 breit) */
@media (min-width:768px){
  :root{--side:224px}
  .app{max-width:none;margin:0;padding:22px 28px 48px calc(var(--side) + 28px)}
  main,.top{max-width:1240px}
  nav.bottom{top:0;bottom:0;right:auto;width:var(--side);flex-direction:column;align-items:stretch;gap:2px;padding:18px 10px 24px;border-top:0;border-right:1px solid var(--line);background:var(--card);overflow-y:auto}
  .brand{display:flex!important;align-items:center;gap:10px;padding:2px 10px 20px}
  .brand img{width:38px;height:38px;border-radius:10px;box-shadow:0 2px 8px #0b63f633}
  .brand b{display:block;font-size:19px;letter-spacing:-.01em}.brand small{display:block;color:var(--mut);font-size:11px;margin-top:-1px}
  nav.bottom>button{flex:none;flex-direction:row;justify-content:flex-start;gap:12px;font-size:15px;padding:9px 12px;border-radius:12px;min-height:42px}
  nav.bottom>button span{font-size:19px}
  nav.bottom>button.on{background:color-mix(in srgb,var(--acc) 12%,transparent)}
  .badge{position:static;margin-left:auto}
  .subtog{margin-left:auto;font-style:normal;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;color:var(--mut);transition:transform .15s;font-size:16px}
  .badge+.subtog{margin-left:4px}
  .subtog.open{transform:rotate(90deg)}.subtog:hover{background:var(--card2);color:var(--txt)}
  .subnav{display:block;margin:0 0 6px 14px;padding-left:8px;border-left:2px solid var(--line)}
  .side-hide{display:none!important}
  .mobile-only{display:none!important}
  .addbtn{display:flex!important}.fab{display:none}
  .top h1{margin:4px 0 20px}
  .split{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
  .split>.side{order:2;position:sticky;top:22px}.split>.maincol{order:1}
  .side .hero-v{font-size:30px}
  .toast{bottom:32px;left:calc(50% + var(--side) / 2)}
}
@media (min-width:768px) and (max-width:1023px){
  .dash{grid-template-columns:1fr}
  .split{grid-template-columns:1fr}.split>.side{order:0;position:static}
}
@media (min-width:1024px){
  :root{--side:280px}
  .app{padding:24px 40px 48px calc(var(--side) + 40px)}
  .split{grid-template-columns:minmax(0,1fr) 360px;gap:22px}
  .dash{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
  .tab-contracts .dash{grid-template-columns:repeat(2,minmax(0,1fr))}
  .tab-docs .folders{flex-wrap:wrap;overflow:visible}
  .tab-docs .dlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr))}
  .tab-docs .ditem+.ditem{border-top:0}.tab-docs .ditem{border-bottom:1px solid var(--line)}
  .sheet{justify-content:flex-end;align-items:stretch;padding:0;background:#0f1b2d40}
  .panel{max-width:580px;max-height:none;height:100dvh;border-radius:0;box-shadow:-24px 0 60px #0003;animation:slidein .2s ease-out;padding:0 24px 32px}
  .settings{max-width:1100px}
}
@media (min-width:1600px){ .dash{grid-template-columns:repeat(4,minmax(0,1fr))} .dash>.hero{grid-column:1/3}.dash>.tile.alert{grid-column:3/5;align-self:stretch} }
/* Phone quer */
@media (max-height:500px) and (orientation:landscape){
  .top h1{font-size:24px;margin:6px 2px 10px}.hero{padding:12px 16px}.hero-v{font-size:26px;margin-bottom:8px}
  nav.bottom>button{min-height:44px;padding:4px 0}nav.bottom>button span{font-size:17px}
  .fab{width:50px;height:50px;font-size:26px;bottom:calc(env(safe-area-inset-bottom) + 62px)}
  .dash{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}.dash>.hero,.dash>.tile.alert{grid-column:1/-1}.dash .tile{margin:0}
  .split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start}.split>.side{position:sticky;top:8px}
  .hero-row b{font-size:13px}.chart{height:110px}
  .sheet{padding:0}.panel{max-height:100dvh;border-radius:0}
}
@keyframes slidein{from{transform:translateX(40px);opacity:.6}to{transform:none;opacity:1}}
@keyframes popin{from{transform:scale(.97);opacity:.6}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

/* Scanner, Schnellmenü, Bargeld */
.addbtn{gap:8px}
.twobtn{display:flex;gap:8px;margin:-4px 0 12px}.twobtn .btn{flex:1}
.fab{transition:transform .2s}.fab.open{transform:rotate(45deg)}
.fabmenu-bg{position:fixed;inset:0;z-index:5;background:#0f1b2d59}
.fabmenu{position:fixed;right:16px;bottom:calc(env(safe-area-inset-bottom) + 146px);z-index:6;display:flex;flex-direction:column;gap:2px;width:min(300px,calc(100vw - 32px));
  background:var(--card);opacity:1;border:1px solid var(--line);border-radius:18px;padding:6px;box-shadow:0 18px 50px #0f1b2d66;animation:menuin .16s ease-out;isolation:isolate}
:root[data-theme=dark] .fabmenu{background:#1c222c;border-color:#323a47}
.fabmenu button{display:flex;align-items:center;gap:12px;width:100%;background:transparent;color:var(--txt);border:0;border-radius:12px;padding:10px 12px;font:inherit;text-align:left;min-height:56px;cursor:pointer}
.fabmenu button:hover,.fabmenu button:focus-visible{background:var(--card2)}
.fabmenu button+button{border-top:1px solid var(--line);border-radius:0 0 12px 12px}.fabmenu button:nth-child(2){border-radius:0}
.fabmenu span{font-size:22px;width:38px;height:38px;border-radius:12px;background:var(--card2);display:inline-flex;align-items:center;justify-content:center;flex:none}
.fabmenu b{display:block;font-size:15px}.fabmenu small{display:block;color:var(--mut);font-size:12px;margin-top:1px}
@keyframes menuin{from{transform:translateY(6px) scale(.98)}to{transform:none}}
.addplus{width:44px;height:44px;padding:0;border-radius:50%;font-size:26px;line-height:1;display:inline-flex;align-items:center;justify-content:center;transition:transform .2s}
.addplus.open{transform:rotate(45deg)}
.scanstart{text-align:center;padding:30px 10px;display:flex;flex-direction:column;gap:12px;align-items:center}.scanstart p{color:var(--mut);max-width:420px}
.btn.big{width:100%;max-width:360px;padding:14px;font-size:16px;font-weight:600}
.crop{position:relative;margin:10px auto;max-width:100%;touch-action:none;user-select:none;-webkit-user-select:none}
.crop img,.crop svg{position:absolute;inset:0;width:100%;height:100%;border-radius:8px}
.actions.center{justify-content:center}
.scanpages{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:14px}
.scanpage img{width:100%;border-radius:10px;box-shadow:var(--shadow);background:#fff;cursor:pointer}
.scanadd{border:2px dashed var(--line);background:none;border-radius:12px;color:var(--acc);font:inherit;font-weight:600;min-height:160px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}.scanadd span{font-size:28px}
.cashcheck{background:var(--card);border-radius:14px;padding:12px 14px;box-shadow:var(--shadow);margin-top:14px}
.busy{position:absolute;inset:0;background:color-mix(in srgb,var(--bg) 80%,transparent);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:3;font-weight:600}
.scanner .panel{position:relative}
.spinner{width:34px;height:34px;border:3px solid var(--line);border-top-color:var(--acc);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.bigamount{font-size:34px;font-weight:700;text-align:center;border:0;background:none;margin:14px 0 4px;padding:8px}
@media (min-width:700px){.small-panel{max-width:520px}}
@media (min-width:768px){.fabmenu-bg{background:transparent}.fabmenu{top:76px;right:28px;bottom:auto}}
@media (min-width:1024px){.fabmenu{right:40px}}

/* FinDocu: Seitenleiste-Unterpunkte, Kontengruppen, Bereiche */
.side-only{display:none}
@media (max-width:767px){.ph-hide{display:none!important}}
@media (min-width:768px){.subnav.side-only{display:block}.subtog.side-only{display:inline-flex}}
.acctree{display:flex;flex-direction:column}
.accdiv{height:1px;background:var(--line);margin:6px 8px}
.acctitle{display:flex;align-items:center;gap:6px;width:100%;background:none;border:0;color:var(--mut);font:inherit;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:8px 8px 4px;text-align:left;cursor:pointer}
.acctitle small{font-weight:600;background:var(--card2);border-radius:999px;padding:0 6px}
.chev{display:inline-block;transition:transform .15s;font-size:13px;width:10px}.chev.open{transform:rotate(90deg)}
.accitem{display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:var(--txt);font:inherit;font-size:13.5px;padding:7px 8px;border-radius:10px;text-align:left;cursor:pointer;min-height:34px}
.accitem:hover{background:var(--card2)}.accitem.on{background:color-mix(in srgb,var(--acc) 12%,transparent);color:var(--acc);font-weight:600}
.accitem .ki{font-size:15px;width:20px;text-align:center}.accitem .an{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.accitem .ab{font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.acctree.card .accitem{font-size:15px;padding:10px 6px;min-height:44px}.acctree.card .acctitle{font-size:12px;padding:10px 6px 4px}
.acctree.card .accitem .ab{font-size:14px;font-weight:600}
.accphone{padding:6px 10px}
.areaseg{margin-bottom:10px;overflow-x:auto}.areaseg button{white-space:nowrap}.areaseg small{opacity:.6;margin-left:2px}
.kindgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}
.kindgrid button{display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--card2);border:1.5px solid transparent;border-radius:12px;padding:10px 4px;font:inherit;font-size:12px;color:var(--txt);cursor:pointer}
.kindgrid button span{font-size:22px}.kindgrid button.on{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 10%,var(--card))}

.navcfg input:not([type=checkbox]){padding:8px 10px}.navcfg .ki{font-size:18px;text-align:center}
.mini{display:flex;align-items:center;gap:4px;margin:0;font-size:12px;color:var(--mut)}.mini input{width:auto;margin:0}
.grpcfg{background:var(--card2);border-radius:14px;padding:10px;margin-top:10px}
.grphead{display:flex;gap:6px;align-items:center}.grphead input{padding:8px 10px;font-weight:600}
.acccfg{display:flex;gap:6px;align-items:center;margin-top:6px;background:var(--card);border-radius:10px;padding:4px 6px}
.acccfg .ki{font-size:17px;width:24px;text-align:center}.link.left{text-align:left;color:var(--txt)}
.movesel{width:auto;max-width:130px;padding:6px 8px;font-size:13px}
.settings>.span2{grid-column:1/-1}


.areapick{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 2px 2px}
.areapick button{background:var(--card);border:1.5px solid var(--line);border-radius:999px;padding:5px 10px;font:inherit;font-size:12px;color:var(--txt);cursor:pointer}
.areapick button.on{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 12%,var(--card));font-weight:600}
.catname{padding:7px 10px;font-size:14px;background:transparent;border-color:transparent}.catname:hover,.catname:focus{border-color:var(--line);background:var(--card)}
.acccfg .cnt{min-width:18px;text-align:right}
.addcat{background:transparent;border:1.5px dashed var(--line)}.addcat input{padding:7px 10px;font-size:14px;background:transparent}.addcat .btn{padding:6px 12px;font-size:13px}


/* Ziehen & Ablegen, ✓/✕ */
.handle{flex:none;width:30px;height:36px;display:inline-flex;align-items:center;justify-content:center;color:var(--mut);font-size:18px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;border-radius:8px}
.handle:hover{background:var(--card2);color:var(--txt)}
body.dnd-active,body.dnd-active *{cursor:grabbing!important;user-select:none!important;-webkit-user-select:none!important}
.dragging{opacity:.35}
.dropline{height:3px;background:var(--acc);border-radius:2px;margin:3px 4px;box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 20%,transparent)}
.dropover{outline:2px dashed color-mix(in srgb,var(--acc) 55%,transparent);outline-offset:2px}
.dropzone{margin-top:6px;padding:12px;border:1.5px dashed var(--line);border-radius:10px;text-align:center;color:var(--mut);font-size:13px}
.dndghost{position:fixed;z-index:100;pointer-events:none;transform:translate(-18px,-50%) rotate(-1.5deg);background:var(--card);color:var(--txt);border:2px solid var(--acc);border-radius:12px;padding:9px 14px;font-weight:600;font-size:14px;box-shadow:0 14px 34px #0f1b2d40;white-space:nowrap}
.edittext{display:flex;align-items:center;gap:6px;min-width:0}.edittext input{flex:1;min-width:0}
.edittext.dirty input{border-color:var(--acc);background:var(--card)}
.editbtns{display:flex;gap:4px;flex:none}
.okbtn,.nobtn{width:34px;height:34px;border-radius:50%;border:0;color:#fff;font-size:17px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 6px #0002}
.okbtn{background:#16a34a}.nobtn{background:#e5484d}.okbtn:hover,.nobtn:hover{filter:brightness(1.08)}
.grptitle{font-weight:600}
.iconbtn-spacer{width:40px;flex:none}
.navcfg{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;background:var(--card2);border-radius:12px;padding:4px 8px 4px 2px}
.navcfg .edittext{flex:1 1 160px}.navcfg .edittext input{padding:8px 10px}
@media (max-width:520px){
  .catrow,.accrow{display:flex;flex-wrap:nowrap}
  .catrow .edittext.dirty{flex-basis:100%}
  .navcfg .mini{margin-left:36px}
}

input[type=date]{min-width:0;max-width:100%;display:block;-webkit-appearance:none;appearance:none;min-height:44px}
input[type=date]::-webkit-date-and-time-value{text-align:left}
.healthbox{background:var(--card2);border-radius:12px;padding:8px 12px;margin-top:10px}.healthbox p{margin:4px 0;font-size:14px;font-weight:500}

/* Freischwebende Fenster */
.win{position:fixed;display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:18px;box-shadow:0 24px 70px #0f1b2d4d,0 2px 6px #0f1b2d1f;overflow:hidden;animation:popin .14s ease-out}
.wininner{flex:1;overflow:auto;padding:0 20px 24px;overscroll-behavior:contain}
.win .panelhead{cursor:move;padding-top:12px;background:var(--bg);user-select:none;-webkit-user-select:none}
.win .panelhead b{pointer-events:none}
.win.scanner .busy{border-radius:18px}
.rz{position:absolute;z-index:3;touch-action:none}
.rz-n,.rz-s{left:14px;right:14px;height:8px;cursor:ns-resize}.rz-n{top:-3px}.rz-s{bottom:-3px}
.rz-e,.rz-w{top:14px;bottom:14px;width:8px;cursor:ew-resize}.rz-e{right:-3px}.rz-w{left:-3px}
.rz-ne,.rz-se,.rz-sw,.rz-nw{width:18px;height:18px}
.rz-ne{top:-3px;right:-3px;cursor:nesw-resize}.rz-sw{bottom:-3px;left:-3px;cursor:nesw-resize}
.rz-se{bottom:-3px;right:-3px;cursor:nwse-resize}.rz-nw{top:-3px;left:-3px;cursor:nwse-resize}
.rzgrip{position:absolute;right:5px;bottom:5px;width:12px;height:12px;pointer-events:none;opacity:.5;
  background:linear-gradient(135deg,transparent 45%,var(--mut) 45%,var(--mut) 52%,transparent 52%,transparent 68%,var(--mut) 68%,var(--mut) 75%,transparent 75%)}
body.win-moving,body.win-moving *{user-select:none!important;-webkit-user-select:none!important}
/* Seitenleiste ziehbar */
.sideresize{display:none}
@media (min-width:768px){
  .sideresize{display:block;position:fixed;top:0;bottom:0;left:calc(var(--side) - 4px);width:8px;cursor:col-resize;z-index:7;touch-action:none}
  .sideresize:hover,body.win-moving .sideresize{background:linear-gradient(90deg,transparent 3px,color-mix(in srgb,var(--acc) 60%,transparent) 3px,color-mix(in srgb,var(--acc) 60%,transparent) 5px,transparent 5px)}
}

.eyebtn{margin-left:auto;background:var(--card);border:1px solid var(--line);border-radius:50%;width:40px;height:40px;font-size:18px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none}
.top .addbtn{margin-left:8px}
.herolink{background:#ffffff26;color:#fff;border:0;border-radius:999px;padding:4px 12px;font:inherit;font-size:13px;margin:-6px 0 12px;cursor:pointer}
.switchrow{display:flex;align-items:center;justify-content:space-between;gap:14px;color:var(--txt);font-size:15px;margin:6px 0}
.switch{appearance:none;-webkit-appearance:none;width:52px;height:32px;border-radius:999px;background:var(--line);position:relative;cursor:pointer;flex:none;transition:background .2s;margin:0;padding:0;border:0}
.switch::after{content:"";position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0004;transition:transform .2s}
.switch:checked{background:var(--ok)}.switch:checked::after{transform:translateX(20px)}

/* v0.9.1 */
.topicons{margin-left:auto;display:flex;gap:4px}
.eyebtn{margin-left:0;background:transparent;border:0;color:var(--mut);width:38px;height:38px;border-radius:10px;font-size:0}
.eyebtn:hover{background:var(--card2);color:var(--txt)}
.accitem .ab .est,.est{font-style:normal;opacity:.6;margin-right:2px}
.dwrap+.dwrap{border-top:1px solid var(--line)}.dwrap .ditem{border:0}
@media (min-width:1024px){.tab-docs .dlist{align-items:start}}
.prevbtn{align-self:center;flex:none;width:34px;height:34px;border-radius:10px;border:0;background:transparent;color:var(--mut);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.prevbtn:hover,.prevbtn.on{background:var(--card2);color:var(--txt)}
.pchev{display:inline-flex;transition:transform .18s}.pchev.open{transform:rotate(180deg)}
.dprev{padding:0 12px 14px;cursor:default}
.dpages{max-height:72vh;overflow:auto;display:flex;flex-direction:column;align-items:center;gap:10px;background:var(--card2);border:1px solid var(--line);border-radius:14px;padding:12px}
.dpages img{width:100%;max-width:820px;height:auto;background:#fff;border-radius:6px;box-shadow:0 1px 6px #0003}
.dpload{color:var(--mut);font-size:13px;padding:30px}
.dprevbar{display:flex;align-items:center;gap:8px;margin-top:8px}
.btn.sm{padding:6px 12px;font-size:13px;min-height:0}
.retry{margin-left:8px;background:transparent;border:1px solid currentColor;color:inherit;border-radius:999px;padding:1px 10px;font:inherit;font-size:12px;cursor:pointer}
.themeopts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
@media (max-width:520px){.themeopts{grid-template-columns:repeat(2,1fr)}}
.themeopts button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 6px;border-radius:14px;border:1px solid var(--line);background:var(--card2);color:var(--txt);font:inherit;cursor:pointer}
.themeopts button span{font-size:22px}.themeopts button small{color:var(--mut);font-size:12px}
.themeopts button.on{border-color:var(--acc);box-shadow:0 0 0 2px color-mix(in srgb,var(--acc) 30%,transparent)}
.fabmenu button:not(:first-child):not(:last-child){border-radius:0}

/* v0.9.2 Einstellungen: Bereiche */
.settings{display:flex!important;flex-direction:column;max-width:900px}
.settings>.tile{margin:0 0 4px}
.secbar{display:flex;align-items:center;gap:10px;justify-content:space-between;margin:10px 2px 0;flex-wrap:wrap}
fieldset.ssec{padding:0}
.ssechead{display:flex;align-items:center;gap:2px;padding:4px 8px 4px 4px}
.ssectitle{flex:1;display:flex;align-items:center;gap:8px;background:transparent;border:0;color:var(--txt);font:inherit;font-weight:600;font-size:15px;text-align:left;padding:10px 6px;min-height:44px;cursor:pointer;border-radius:10px}
.ssectitle:hover{background:var(--card2)}
.ssectitle .pchev{color:var(--mut)}
.ssecbody{padding:0 14px 14px;border-top:1px solid var(--line)}
.ssecbody>p:first-child{margin-top:12px}
.ssec.dragging{opacity:.35}

/* v0.9.3 Übersicht: Widgets */
.widget{position:relative;min-width:0}
.dash>.w-2{grid-column:span 2}.dash>.w-full{grid-column:1/-1}
@media (min-width:768px) and (max-width:1023px){.dash>.w-2{grid-column:auto}}
@media (min-width:700px){.dash .widget .tile,.dash .widget .hero{margin:0}.dash .widget .tile.alert{height:100%}}
.dash.editing .widget{outline:2px dashed var(--line);outline-offset:4px;border-radius:18px}
.dash.editing .wbody{pointer-events:none;opacity:.85}
@media (max-width:699px){.dash.editing .widget{margin:0 0 18px}}
.wbar{display:flex;align-items:center;gap:6px;margin:0 0 6px;padding:2px 2px 2px 0}
.wbar b{font-size:13px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsize{display:flex;background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:2px}
.wsize button{border:0;background:transparent;color:var(--mut);width:30px;height:28px;border-radius:8px;cursor:pointer;font-size:14px}
.wsize button.on{background:var(--card);color:var(--acc);box-shadow:var(--shadow)}
@media (max-width:699px){.wsize{display:none}}
.wx{border:0;background:var(--card2);color:var(--mut);width:32px;height:32px;border-radius:10px;cursor:pointer}
.wx:hover{color:var(--red)}
.wempty{min-height:90px;display:flex;flex-direction:column;justify-content:center;gap:4px;opacity:.7}
.widget.dropbefore::before,.widget.dropafter::after{content:"";position:absolute;top:0;bottom:0;width:4px;border-radius:2px;background:var(--acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 25%,transparent);z-index:2}
.widget.dropbefore::before{left:-11px}.widget.dropafter::after{right:-11px}
.widget.w-full.dropbefore::before,.widget.w-full.dropafter::after{left:0;right:0;width:auto;height:4px;bottom:auto;top:-11px}
.widget.w-full.dropafter::after{top:auto;bottom:-11px}
@media (max-width:767px){.widget.dropbefore::before,.widget.dropafter::after{left:0;right:0;width:auto;height:4px;bottom:auto;top:-10px}.widget.dropafter::after{top:auto;bottom:-10px}}
.editbar{position:sticky;top:calc(env(safe-area-inset-top) + 6px);z-index:4;display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--acc);border-radius:16px;padding:10px 12px 10px 16px;margin:0 0 16px;box-shadow:var(--shadow)}
.editbar .btn{margin:0}
.addwidgets{margin-top:18px}
.wadd{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
.wadd button{display:flex;align-items:center;gap:10px;text-align:left;background:var(--card2);border:1px solid var(--line);border-radius:14px;padding:10px 12px;color:var(--txt);font:inherit;cursor:pointer}
.wadd button:hover{border-color:var(--acc)}
.wadd span{font-size:22px}.wadd div{flex:1;min-width:0}.wadd b{display:block;font-size:14px}.wadd small{color:var(--mut);font-size:12px}.wadd i{font-style:normal;color:var(--acc);font-size:20px}
.eyebtn.on{background:var(--card2);color:var(--acc)}
.quick{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.quick button{display:flex;flex-direction:column;align-items:center;gap:4px;background:var(--card2);border:1px solid var(--line);border-radius:14px;padding:12px 4px;color:var(--txt);font:inherit;font-size:13px;cursor:pointer}
.quick button span{font-size:22px}
.thumb.sm{width:36px;height:46px;border-radius:6px}
.hero-v.sm{font-size:26px;font-weight:700;margin:4px 0 8px}
/* v0.10 Design */
.pos{color:var(--pos,var(--ok))}.neg{color:var(--neg,var(--red))}
body.outneg .amt.out,body.outneg b.out{color:var(--neg,var(--red))}
.presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:10px}
.preset{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px;border-radius:14px;border:1px solid var(--line);background:var(--card2);color:var(--txt);font:inherit;cursor:pointer;text-align:left}
.preset.on{border-color:var(--acc);box-shadow:0 0 0 2px color-mix(in srgb,var(--acc) 30%,transparent)}
.preset .pv{width:100%;height:54px;border-radius:10px;display:flex;align-items:flex-end;gap:4px;padding:6px;margin-bottom:6px}
.preset .pv i{width:14px;height:14px;border-radius:50%;border:2px solid #fff8}
.preset b{font-size:14px}.preset small{font-size:12px;color:var(--mut)}
.subhead{margin:18px 0 6px;font-size:14px}
.colorrow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
.colorrow>b{font-size:17px;font-variant-numeric:tabular-nums}
.swatches{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 4px}
.sw{width:32px;height:32px;border-radius:50%;border:2px solid var(--card);box-shadow:0 0 0 1px var(--line);cursor:pointer;padding:0;position:relative;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700}
.sw.on{box-shadow:0 0 0 2px var(--txt)}
.sw.custom{background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);color:#fff;text-shadow:0 1px 2px #0008;font-size:16px}
.sw.custom input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;padding:0;border:0}
/* Einstellungen: alle Bereiche gleich breit */
.settings{width:100%}
fieldset.ssec{width:100%;min-width:0;box-sizing:border-box}

.dactions{display:flex;gap:2px;align-self:center;flex:none}
.dactions button{width:34px;height:34px;border-radius:10px;border:0;background:transparent;color:var(--mut);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.dactions button:hover,.dactions button.on{background:var(--card2);color:var(--acc)}
.dactions button.del:hover{color:var(--red)}
.gbody .dactions{margin-top:6px;justify-content:flex-end}
@media (max-width:520px){.ditem .dactions{flex-direction:column;gap:0}.ditem .dactions button{width:30px;height:28px}}
.panelhead{gap:8px;justify-content:flex-start}.panelhead>b:first-child{margin-right:auto}
.xbtn{flex:none;width:34px;height:34px;border-radius:50%;border:0;background:var(--card2);color:var(--mut);font-size:15px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.xbtn:hover{color:var(--txt);background:var(--line)}
.textinfo{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--card2);border:1px solid var(--line);border-radius:12px;padding:8px 12px;margin:12px 0 6px;font-size:13px}
.textinfo .link{font-size:13px}

/* Konten am Desktop: Tabelle statt Handy-Karten */
.txtable{background:var(--card);border-radius:16px;box-shadow:var(--shadow);overflow:hidden;margin-top:8px}
.txhead,.txrow{display:grid;grid-template-columns:92px minmax(0,1fr) 190px 130px;gap:14px;align-items:center;padding:0 16px}
.txtable.withacc .txhead,.txtable.withacc .txrow{grid-template-columns:92px minmax(0,1fr) 170px 150px 130px}
.txhead{font-size:12px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.04em;height:40px;border-bottom:1px solid var(--line);background:var(--card2)}
.txrow{min-height:52px;border-bottom:1px solid var(--line);cursor:pointer;font-size:14px}
.txrow:last-child{border-bottom:0}.txrow:hover{background:var(--card2)}
.txdesc{display:flex;align-items:center;gap:10px;min-width:0}.txdesc b{font-weight:600}
.txtable .r{text-align:right;font-variant-numeric:tabular-nums}
.one{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (min-width:1024px){
  .maincol .hero{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:36px;align-items:center;padding:22px 26px}
  .maincol .hero>small,.maincol .hero>.hero-v,.maincol .hero>.herolink{grid-column:1;justify-self:start}
  .maincol .hero>.hero-row{grid-column:2;grid-row:1/span 3;margin:0}
  .maincol .hero>.herolink{margin:4px 0 0}
}

/* v0.10 Übersicht: freies Raster */
.dash.gridded{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));grid-auto-rows:8px;grid-auto-flow:row dense;gap:var(--gap)!important;align-items:start}
.dash.gridded>.widget{grid-column:auto;margin:0;align-self:stretch}
.winner{display:flex;flex-direction:column}
.winner.fixed{height:100%}
.winner.fixed .wbody{flex:1;min-height:0;display:flex}
.winner.fixed .wbody>*{flex:1;min-height:0;overflow:auto;margin:0!important}
.dash.gridded .wbody>.tile,.dash.gridded .wbody>.hero{margin:0}
.dash.editing.gridded .widget{outline-offset:2px}
.wresize{position:absolute;right:-4px;bottom:-4px;width:22px;height:22px;cursor:nwse-resize;touch-action:none;z-index:3;border-radius:6px;background:var(--card);border:1px solid var(--acc);
  background-image:linear-gradient(135deg,transparent 45%,var(--acc) 45% 55%,transparent 55%,transparent 65%,var(--acc) 65% 75%,transparent 75%)}
body.rz-active,body.rz-active *{cursor:nwse-resize!important;user-select:none!important}
.wsize button{width:auto;min-width:28px;padding:0 6px;font-size:13px}
.gapctl{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mut);white-space:nowrap}
.gapctl input{width:110px;padding:0;border:0;background:transparent;accent-color:var(--acc)}
.gapctl small{min-width:34px}
@media (max-width:900px){.editbar{flex-wrap:wrap}.gapctl{order:5;width:100%}}
.widget.wfull.dropbefore::before,.widget.wfull.dropafter::after{left:0;right:0;width:auto;height:4px;bottom:auto;top:-10px}
.widget.wfull.dropafter::after{top:auto;bottom:-10px}

/* v0.10.2 Farbwahl */
.cdot{position:relative;display:inline-flex;align-items:center;justify-content:center;margin:0!important;padding:0;width:20px;height:20px;border-radius:50%;border:2px solid #fffc;box-shadow:0 1px 3px #0005;cursor:pointer;flex:none;color:#fff;font-size:0}
.cdot input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;padding:0;margin:0!important;border:0}
.cdot:hover{transform:scale(1.15)}
.preset .pv .cdot{width:20px;height:20px}
.preset{position:relative}
.presetreset{margin-top:2px;font-size:12px!important}
.swatches{align-items:center}
.swatches .sw,.swatches .cdot.sw{width:32px;height:32px;margin:0!important;flex:none;box-sizing:border-box;border:2px solid var(--card);box-shadow:0 0 0 1px var(--line);transform:none;font-size:16px}
.swatches .cdot.sw.on,.swatches .sw.on{box-shadow:0 0 0 2px var(--txt)}
.swwrap{position:relative;display:inline-flex}
.swdel{position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;border:0;background:var(--txt);color:var(--bg);font-size:11px;line-height:16px;padding:0;cursor:pointer;display:none}
.swwrap:hover .swdel{display:block}
@media (hover:none){.swdel{display:block}}

/* Leerfelder */
.spacer{height:100%;min-height:40px}
.spacer.show{border:2px dashed var(--line);border-radius:18px;display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:13px;background:repeating-linear-gradient(135deg,transparent 0 10px,color-mix(in srgb,var(--line) 40%,transparent) 10px 11px)}
.dash.gridded.nodense{grid-auto-flow:row}
.densectl{display:flex;align-items:center;gap:6px;margin:0;font-size:13px;color:var(--mut);white-space:nowrap;cursor:pointer}
.densectl input{width:auto;margin:0;accent-color:var(--acc)}
.wadd .spaceradd{border-style:dashed}
@media (max-width:699px){.widget:has(.spacer){display:none}}

/* Anpassen-Modus = gleiche Höhen wie Ansicht: Leiste schwebt über dem Widget */
.wbar.overlay{position:absolute;left:0;right:0;top:0;z-index:4;margin:0;padding:6px 8px 6px 2px;border-radius:18px 18px 0 0;
  background:color-mix(in srgb,var(--card) 78%,transparent);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
.wempty.ghost{visibility:hidden}

/* v0.10.5: kompakte Bedienleiste auf der Oberkante – verändert Größe & Position nicht */
.wchip{position:absolute;top:-15px;right:10px;z-index:6;display:flex;align-items:center;gap:1px;height:30px;padding:0 3px;border-radius:999px;
  background:var(--card);border:1px solid var(--acc);box-shadow:0 2px 10px #0003}
.wchip .handle{width:24px;height:26px;font-size:15px}
.wchip button{border:0;background:transparent;color:var(--mut);height:24px;min-width:24px;padding:0 5px;border-radius:999px;font:inherit;font-size:12px;cursor:pointer}
.wchip button.on{background:var(--acc);color:#fff}
.wchip button:hover{color:var(--txt)}.wchip button.on:hover{color:#fff}
.wchip .wx{width:24px;height:24px;background:transparent}.wchip .wx:hover{color:var(--red)}
@media (max-width:699px){.wchip{top:-13px}}
.dash.editing.gridded{padding-top:14px}

.trashbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.trashbar .btn{margin:0;display:inline-flex;align-items:center;gap:6px}

/* v0.11 Konten-Mehrfachauswahl */
.cbox{flex:none;width:18px;height:18px;border-radius:5px;border:1.5px solid color-mix(in srgb,var(--mut) 70%,transparent);background:transparent;color:#fff;font-size:12px;line-height:15px;padding:0;text-align:center;cursor:pointer;font-weight:700}
.cbox.on{background:var(--acc);border-color:var(--acc)}
.acctitle{display:flex;align-items:center;gap:8px}
.acctoggle{flex:1;display:flex;align-items:center;gap:6px;background:none;border:0;color:inherit;font:inherit;text-transform:inherit;letter-spacing:inherit;padding:0;cursor:pointer;text-align:left}
.acctoggle .chev{margin-left:auto}
.accitem{cursor:default}
.accitem .aname{flex:1;min-width:0;display:flex;align-items:center;gap:8px;background:none;border:0;color:inherit;font:inherit;padding:0;text-align:left;cursor:pointer}
.accitem.on{font-weight:500}
.aeye{flex:none;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--mut);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;opacity:0}
.aeye svg{width:15px;height:15px}
.accitem:hover .aeye,.aeye:focus-visible{opacity:1}.aeye:hover{background:var(--line);color:var(--txt)}
@media (hover:none){.aeye{opacity:.6}}
.acchidden{margin-top:10px;padding-top:6px;border-top:1px solid var(--line)}
.accitem.hid{color:var(--mut)}.accitem.hid .an{text-decoration:line-through;flex:1}
.unhide{border:1px solid var(--line);background:transparent;color:var(--mut);border-radius:999px;font:inherit;font-size:11px;padding:2px 9px;cursor:pointer}
.unhide:hover{color:var(--acc);border-color:var(--acc)}
.chipdrop span{font-size:10px;margin-left:2px}
.hero-row.four{grid-template-columns:repeat(4,minmax(0,1fr))}
@media (max-width:520px){.hero-row.four{grid-template-columns:repeat(2,minmax(0,1fr))}}
.heronames{display:block;opacity:.8;font-size:12px;margin-top:2px}
.selcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin:4px 0 12px}
.selcard{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:3px;cursor:pointer;box-shadow:var(--shadow)}
.selcard:hover{border-color:var(--acc)}
.selcard .row1{display:flex;align-items:center;justify-content:space-between}
.selcard .x{border:0;background:transparent;color:var(--mut);cursor:pointer;font-size:16px;padding:0 2px}
.selcard .big{font-size:17px}
.quickpick{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 10px}
.quickpick button{border:1px solid var(--line);background:transparent;color:var(--mut);border-radius:999px;padding:5px 12px;font:inherit;font-size:12px;cursor:pointer}
.quickpick button:hover{border-color:var(--acc);color:var(--txt)}
.picklist{border-top:1px solid var(--line);padding:4px 0}
.pickgroup,.pickitem{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;color:var(--txt);font:inherit;text-align:left;cursor:pointer;border-radius:10px}
.pickgroup{color:var(--mut);font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:12px 8px 4px}
.pickitem{padding:9px 8px 9px 36px;min-height:42px}.pickitem:hover{background:var(--card2)}
.pickgroup .cbox,.pickitem .cbox{pointer-events:none}
.pickfoot{display:flex;align-items:center;gap:10px;border-top:1px solid var(--line);padding-top:12px;margin-top:6px;position:sticky;bottom:0;background:var(--bg)}
.pickfoot .btn{margin:0}

.txdesc>.grow{min-width:0;overflow:hidden}.txdesc b.one,.txdesc small.one{display:block}
.txrow>span{min-width:0}
/* Seitenleiste: Platz für Namen */
nav .acctree .accitem .ki{display:none}
nav .acctree .accitem{gap:7px;padding:6px 4px 6px 6px}
nav .acctree .accitem .ab{font-size:11.5px}

.txhead,.txrow{grid-template-columns:84px minmax(160px,2.2fr) minmax(0,1fr) 120px}
.txtable.withacc .txhead,.txtable.withacc .txrow{grid-template-columns:84px minmax(160px,2.2fr) minmax(0,1fr) minmax(0,1fr) 120px}
.txrow>span.one,.txrow>span.muted{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* v0.12 */
.maincol{container-type:inline-size;min-width:0}
@media (min-width:1024px){
  .maincol .hero{display:block}
  .maincol .hero>.hero-row{margin-top:14px}
}
@container (min-width:780px){
  .maincol .hero{display:grid!important;grid-template-columns:minmax(0,auto) minmax(0,1fr)}
  .maincol .hero>.hero-row.four{grid-column:1/-1;grid-row:auto;margin-top:14px}
}
.heronames{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
@container (max-width:640px){
  .txhead,.txrow,.txtable.withacc .txhead,.txtable.withacc .txrow{grid-template-columns:76px minmax(0,1fr) 110px!important}
  .txhead>span:nth-child(3),.txrow>span:nth-child(3),.txtable.withacc .txhead>span:nth-child(4),.txtable.withacc .txrow>span:nth-child(4){display:none}
}
.grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
@media (max-width:620px){.grid4{grid-template-columns:repeat(2,minmax(0,1fr))}}
.scopeseg{margin-bottom:8px}
.linkpick{display:flex;flex-direction:column;gap:4px;margin-top:8px}
.linkopt{width:100%;border:1px solid var(--line);background:var(--card);color:var(--txt);font:inherit;text-align:left;border-radius:12px;padding:8px 10px;cursor:pointer}
.linkopt:hover{border-color:var(--acc)}
.attachbtns{display:flex;gap:8px;flex-wrap:wrap}.attachbtns .btn{margin:0}

@container (max-width:700px){.maincol .hero-row.four{grid-template-columns:repeat(2,minmax(0,1fr))}}
.hero-row>div{min-width:0}.hero-row b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}

/* v0.12.1 schwebende Kopf-Buttons */
.topactions{position:fixed;top:calc(env(safe-area-inset-top) + 12px);right:16px;z-index:30;display:flex;align-items:center;gap:2px;padding:4px;border-radius:999px;
  background:color-mix(in srgb,var(--card) 82%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--line);box-shadow:0 6px 20px #0003}
.topactions .topicons{margin:0}
.topactions .addbtn{margin:0 0 0 4px}
.top{padding-right:var(--topact-w,150px)}
@media (min-width:1024px){.topactions{right:40px;top:22px}}
.editbar{top:calc(env(safe-area-inset-top) + 66px)}@media (min-width:1024px){.editbar{top:86px}}
@media (min-width:768px){.fabmenu{top:80px}}
.editbar{z-index:25!important}

/* v0.13 */
.seg small.cnt{margin-left:5px;opacity:.75}
.selmode{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:var(--mut);font:inherit;font-size:11.5px;padding:4px 8px 6px;cursor:pointer;text-align:left}
.selmode .cbox{width:15px;height:15px;font-size:10px;line-height:12px;pointer-events:none}
.selmode:hover{color:var(--txt)}
@media (min-width:1024px){.split.noside{grid-template-columns:minmax(0,1fr)!important}.split.noside>.side{display:none}}
@media (min-width:1024px) and (max-width:1279px){.split{grid-template-columns:minmax(0,1fr)!important}.split>.side{order:3;position:static}}
@media (min-width:700px){.selcards{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}}

/* v0.14 Kalender */
.dlbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.dlbar .seg{margin:0;width:auto}.dlbar .btn{margin:0}
.btn.synced{border-color:var(--ok);color:var(--ok)}
.cal{background:var(--card);border-radius:18px;box-shadow:var(--shadow);padding:12px;margin-top:10px}
.calhead{display:flex;align-items:center;gap:8px;padding:4px 4px 10px}.calhead b{font-size:17px;text-transform:capitalize}
.calgrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.calwd{font-size:11px;font-weight:700;color:var(--mut);text-align:center;padding:4px 0;text-transform:uppercase;letter-spacing:.05em}
.calday{min-height:96px;border-radius:12px;background:var(--card2);padding:6px;display:flex;flex-direction:column;gap:4px;cursor:pointer;border:1.5px solid transparent;min-width:0;outline:none}
.calday:hover{border-color:var(--line)}.calday.other{opacity:.45}
.calday.today .calnum{background:var(--acc);color:#fff}
.calday.sel{border-color:var(--acc)}.calday.over{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 12%,var(--card2))}
.calnum{font-size:12px;font-weight:700;width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center}
.calev{display:flex;flex-direction:column;gap:3px;min-width:0}
.calchip{font-size:11px;line-height:1.25;padding:2px 6px;border-radius:6px;background:color-mix(in srgb,var(--acc) 18%,transparent);color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:grab}
.calchip.soon{background:color-mix(in srgb,var(--warn) 25%,transparent)}.calchip.over{background:color-mix(in srgb,var(--red) 25%,transparent)}
.calchip.done{text-decoration:line-through;opacity:.55}
.calmore{font-size:11px;color:var(--mut);padding-left:4px}
.caldots{display:none;gap:3px}.caldots i{width:6px;height:6px;border-radius:50%;background:var(--acc)}.caldots i.soon{background:var(--warn)}.caldots i.over{background:var(--red)}.caldots i.done{background:var(--mut)}
@media (max-width:700px){.calday{min-height:52px;padding:4px;align-items:center}.calchip,.calmore{display:none}.caldots{display:flex}}
.calsel{margin-top:14px;border-top:1px solid var(--line);padding-top:6px}.calsel h3{text-transform:capitalize}
.calrow{gap:10px}.calrow input[type=date]{width:auto;padding:6px 8px;font-size:13px}.calrow input[type=checkbox]{width:18px;height:18px}
.calrow.done b{text-decoration:line-through;opacity:.6}.calrow.over b{color:var(--red)}
.steps{margin:6px 0 0;padding-left:18px}.steps li{margin:3px 0}
.dlbar .seg button{display:inline-flex;flex-direction:row;align-items:center;gap:6px;white-space:nowrap;padding:8px 14px}

.selcard.peek{border-color:var(--acc);box-shadow:0 0 0 2px color-mix(in srgb,var(--acc) 35%,transparent)}
.selcards.peeking .selcard:not(.peek){opacity:.55}

.selcards.peeking .selcard:not(.peek){opacity:.4}
.maincol:has(.selcards.peeking) .hero{box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 45%,transparent),0 8px 24px #0003}

/* stabile Kontostand-Karte */
.maincol .hero.hero-stable{display:block!important}
.hero-stable .hsub{height:24px;margin:2px 0 14px;display:flex;align-items:center;min-width:0;font-size:12.5px;opacity:.9}
.hero-stable .hsub>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hero-stable .hsub .herolink{margin:0;padding:2px 10px;font-size:12.5px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.hero-stable .hero-row{margin:0!important}
.dlbar .btn,.win a.btn.primary{display:inline-flex;align-items:center;gap:7px}
.dtitle{cursor:pointer}.dtitle:hover{color:var(--acc)}

/* v0.15 Verträge */
.cdash{display:flex;flex-direction:column;gap:14px;container-type:inline-size}
.cdash>.hero,.cdash>.tile{margin:0}
.hintrow{display:flex;align-items:center;gap:12px}
.cgrid{display:grid;grid-template-columns:1fr;gap:0 24px}
@container (min-width:900px){.cgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.subctl{display:flex;gap:6px;align-items:center}.subctl .chip{margin:0}
.subtable{margin:4px -4px 0}
.subhead,.subrow{display:grid;grid-template-columns:minmax(200px,2fr) minmax(0,1.2fr) 90px 110px 110px 110px 100px 84px;gap:12px;align-items:center;padding:0 8px}
.subhead{font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;height:36px;border-bottom:1px solid var(--line)}
.subrow{min-height:54px;border-bottom:1px solid var(--line);font-size:14px}.subrow:last-child{border-bottom:0}
.subrow:hover{background:var(--card2);border-radius:10px}
.subrow.stale{opacity:.6}
.sname{display:flex;align-items:center;gap:10px;min-width:0}.sname .grow{min-width:0}
.subtable .r{text-align:right;font-variant-numeric:tabular-nums}
@container (max-width:900px){
  .subhead{display:none}
  .subrow{grid-template-columns:minmax(0,1fr) auto auto;grid-template-areas:"n b x" "n m x";row-gap:0;padding:8px}
  .subrow>span:nth-child(2),.subrow>span:nth-child(3),.subrow>span:nth-child(6),.subrow>span:nth-child(7){display:none}
  .subrow>.sname{grid-area:n}.subrow>b{grid-area:b}.subrow>span:nth-child(5){grid-area:m;font-size:12px;color:var(--mut)}.subrow>span:nth-child(8){grid-area:x}
}
.subhead>span:nth-child(7),.subrow>span:nth-child(7){padding-left:16px}

.subact{display:flex;gap:4px;justify-content:flex-end}
.subact .iconbtn{width:36px;height:36px;font-size:15px}
.subact .iconbtn.ok.on{background:color-mix(in srgb,var(--ok) 22%,transparent);color:var(--ok)}
.subact .iconbtn.no.on{background:color-mix(in srgb,var(--red) 22%,transparent);color:var(--red)}
.subact .iconbtn.ok:hover{color:var(--ok)}.subact .iconbtn.no:hover{color:var(--red)}
.subrow.stale .subact{opacity:1}.subrow.stale{opacity:1}.subrow.stale>span:not(.subact),.subrow.stale>b{opacity:.55}

/* ausklappbare Buchungen */
.sname.click{cursor:pointer}.sname .pchev{color:var(--mut);flex:none}
.subrow.open{background:var(--card2);border-radius:10px 10px 0 0;border-bottom-color:transparent}
.txfold{background:var(--card2);border-radius:0 0 12px 12px;padding:6px 14px 10px 50px;margin:0 0 8px;border-bottom:1px solid var(--line)}
.crow .txfold{border-radius:12px;padding:6px 14px 10px;margin:4px 0 10px}
.txfoldsum{display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:space-between;font-size:12.5px;padding:4px 0 8px;border-bottom:1px solid var(--line)}
.txfoldrow{display:grid;grid-template-columns:84px minmax(0,1fr) minmax(0,180px) 100px;gap:12px;align-items:center;font-size:13px;min-height:32px;border-bottom:1px dashed color-mix(in srgb,var(--line) 70%,transparent)}
.txfoldrow:last-of-type{border-bottom:0}
.txfoldrow .r{text-align:right;font-variant-numeric:tabular-nums}
@container (max-width:700px){.txfold{padding-left:14px}.txfoldrow{grid-template-columns:74px minmax(0,1fr) 90px}.txfoldrow>span:nth-child(3){display:none}}
.cmeta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.txfoldrow>span:first-child,.subrow>span:nth-child(7),.txrow>span:first-child{font-variant-numeric:tabular-nums}

/* Fristen: Tag oben, Bevorstehend ausklappbar */
.calsel.top{margin:0 0 10px;border:0;padding:4px 4px 10px;border-bottom:1px solid var(--line)}
.calsel.top h3{margin:4px 0 6px;font-size:20px}
.calupc{border-bottom:1px solid var(--line);margin-bottom:12px;padding-bottom:6px}
.calupchead{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:var(--txt);font:inherit;padding:8px 4px;cursor:pointer;text-align:left}
.calupchead .pchev{color:var(--mut)}
.calupclist{max-height:340px;overflow:auto;padding:0 4px 6px}
.calupclist .calrow{border-radius:12px;padding:6px 8px}.calupclist .calrow:hover{background:var(--card2)}
.nowrap{white-space:nowrap}
.calsel.top{display:block!important}.calsel.top>.frow{width:100%;box-sizing:border-box}.calupclist .calrow.cur{background:color-mix(in srgb,var(--acc) 14%,transparent)}

.dprevbar.float{position:sticky;top:6px;z-index:3;align-self:flex-end;margin:0 0 -46px;display:flex;align-items:center;gap:8px;padding:5px 6px 5px 12px;border-radius:999px;
  background:color-mix(in srgb,var(--card) 85%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid var(--line);box-shadow:0 4px 14px #0004}
.dprevbar.float small{color:var(--mut);font-size:12px;white-space:nowrap}
.dprevbar.float .btn{margin:0;border-radius:999px;display:inline-flex;align-items:center}.dprevbar.float .btn svg{width:16px;height:16px}
.dpages{padding-top:12px}

/* Kalender-Modi */
.calhead{flex-wrap:wrap}
.calmodes{margin:0;width:auto}.calmodes button{padding:6px 12px;font-size:13px}
.calgrid.compact .calday{min-height:46px;align-items:center;padding:4px}
.calgrid.compact .calchip,.calgrid.compact .calmore{display:none}.calgrid.compact .caldots{display:flex}
.calweek{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.wday{background:var(--card2);border-radius:12px;padding:8px;min-height:260px;display:flex;flex-direction:column;gap:6px;border:1.5px solid transparent;cursor:pointer;min-width:0}
.wday.today .calnum{background:var(--acc);color:#fff}.wday.sel{border-color:var(--acc)}.wday.over{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 12%,var(--card2))}
.wdhead{display:flex;align-items:center;justify-content:space-between;color:var(--mut);text-transform:capitalize}
.wev{background:color-mix(in srgb,var(--acc) 16%,transparent);border-radius:8px;padding:6px 8px;display:flex;flex-direction:column;gap:2px;cursor:grab;min-width:0}
.wev b{font-size:12.5px}.wev small{font-size:11.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wev .amt{color:var(--txt);font-weight:600}
.wev.soon{background:color-mix(in srgb,var(--warn) 22%,transparent)}.wev.over{background:color-mix(in srgb,var(--red) 22%,transparent)}.wev.done{opacity:.5;text-decoration:line-through}
.wempty{text-align:center;padding-top:20px}
@media (max-width:700px){.calweek{grid-template-columns:1fr}.wday{min-height:0}}
.calyear{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.ymonth{background:var(--card2);border-radius:14px;padding:10px}
.ymhead{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:var(--txt);font:inherit;padding:2px 2px 8px;cursor:pointer;text-transform:capitalize}
.ymhead .pill{margin-left:auto}
.ygrid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
.ywd{font-size:10px;color:var(--mut);font-weight:700}
.yday{border:0;background:transparent;color:var(--txt);font:inherit;font-size:11.5px;height:24px;border-radius:6px;cursor:pointer;padding:0}
.yday:hover{background:var(--line)}
.yday.has{background:color-mix(in srgb,var(--acc) 30%,transparent);font-weight:700}
.yday.soon{background:color-mix(in srgb,var(--warn) 40%,transparent);font-weight:700}
.yday.over{background:color-mix(in srgb,var(--red) 40%,transparent);font-weight:700}
.yday.done{background:color-mix(in srgb,var(--mut) 25%,transparent)}
.yday.today{outline:2px solid var(--acc)}.yday.sel{box-shadow:inset 0 0 0 2px var(--txt)}

.winguard{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px;padding:10px 12px;border-radius:14px;
  background:color-mix(in srgb,var(--warn) 18%,var(--card));border:1px solid color-mix(in srgb,var(--warn) 55%,transparent);box-shadow:0 6px 20px #0004;animation:menuin .15s ease-out}
.winguard .btn{margin:0}

/* Konto-Symbole & Farben */
.ki.custom img,.acci img,.acciconbtn img,.emojigrid img{width:18px;height:18px;border-radius:5px;object-fit:cover;display:block}
nav .acctree .accitem .ki:not(.custom){display:none}
nav .acctree .accitem .ki.custom{display:inline-flex;width:18px;justify-content:center;font-size:14px}
.acci{display:inline-flex;vertical-align:middle;font-size:inherit}
.acciconbtn{font-size:17px}
.accstyle{background:var(--card2);border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin:4px 0 10px 36px;display:flex;flex-direction:column;gap:10px}
.asrow{display:flex;flex-direction:column;gap:4px}
.emojigrid{display:flex;flex-wrap:wrap;gap:4px}
.emojigrid button{width:34px;height:34px;border-radius:9px;border:1px solid var(--line);background:var(--card);font-size:17px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;position:relative;color:var(--txt);padding:0}
.emojigrid button.on{border-color:var(--acc);box-shadow:0 0 0 2px color-mix(in srgb,var(--acc) 35%,transparent)}
.emojigrid button i{position:absolute;bottom:-1px;right:1px;font-size:8px;font-style:normal;color:var(--mut)}
.emojigrid .upl{font-size:15px;color:var(--acc)}
.asfoot{display:flex;align-items:center;justify-content:space-between}.asfoot .btn{margin:0}
.aspreview{display:flex;align-items:center;gap:8px;font-size:15px}.aspreview .ki{font-size:17px}

.libwrap{position:relative;display:inline-flex}
.libdel{position:absolute!important;top:-6px;right:-6px;width:17px!important;height:17px!important;border-radius:50%!important;border:0!important;background:var(--txt)!important;color:var(--bg)!important;font-size:11px!important;line-height:17px;padding:0;display:none!important}
.libwrap:hover .libdel{display:inline-flex!important}
@media (hover:none){.libdel{display:inline-flex!important}}
.libadd{display:flex;gap:6px;margin-top:6px;max-width:420px}.libadd input{padding:6px 10px;font-size:14px}.libadd .btn{margin:0;white-space:nowrap}

/* v0.16.6: Kachel-Ansicht – Schwebeleiste auf dem Vorschaubild, Symbole über dem Titel */
.gthumbwrap{position:relative;container-type:inline-size}
.dprevbar.float.gbar{position:absolute;top:8px;right:8px;margin:0;opacity:0;transform:translateY(-4px);transition:opacity .15s,transform .15s;pointer-events:none}
.gcard:hover .gbar,.gcard:focus-within .gbar{opacity:1;transform:none;pointer-events:auto}
@media (hover:none){.dprevbar.float.gbar{opacity:1;transform:none;pointer-events:auto}}
.gbar .btn{white-space:nowrap}.gbar{max-width:calc(100% - 16px);gap:4px;padding:4px}
@container (max-width:250px){.gbar small{display:none}}
@container (max-width:170px){.gbar .orig{display:none}}
.gbody>.dactions{align-self:center;margin:-4px 0 0}
.docprevwin .dprev{padding:0}.docprevwin .dpages{max-height:calc(100vh - 180px)}.docprevwin .panelhead{gap:6px}.docprevwin .panelhead b{flex:1;min-width:0}

/* v0.16.8: Kategorien – Symbol & Farbe, neue Kategorie */
.catki{border:0;border-radius:8px;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;flex:none}
.catki:hover{outline:2px solid var(--acc)}
.catstylebox{margin:4px 0 10px 34px;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--card2)}
.catstylebox .accstyle,.catstyle{padding:0;border:0;background:none;margin:0}
.catstylebox .asfoot{display:flex;align-items:center;gap:10px;margin-top:8px}.catstylebox .asfoot .aspreview{flex:1}

/* v0.17.0: einheitliche Eingabefelder (Auswahlfelder wie Textfelder) */
select:not(.chip){-webkit-appearance:none;appearance:none;padding-right:38px;line-height:1.3;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%238b93a7' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 14px center;background-size:12px 8px;text-overflow:ellipsis}
label>input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),label>select:not(.chip),fieldset>select:not(.chip){height:46px;min-height:46px}
input[type=date]{-webkit-appearance:none;appearance:none;display:block;line-height:1.3;text-align:left;min-width:0}
input[type=date]::-webkit-date-and-time-value{text-align:left;margin:0}
.grid2>label{min-width:0}
/* Kategorie-Bildsymbole */
.catimg{width:1.15em;height:1.15em;object-fit:contain;vertical-align:-.2em;border-radius:3px}
.caticon .catimg{width:62%;height:62%}
/* Bargeld-Formular */
.cashform .seg{margin-bottom:8px}.cashform .bigamount{margin:0 0 2px}
.cashform.compact .bigamount{font-size:26px;padding:8px 12px}
.cashatt{margin-top:12px}.cashatt>small{display:block;margin-bottom:6px}
.attbtns{display:flex;gap:8px;flex-wrap:wrap}.attbtns .btn{margin:0;flex:1 1 auto}
.attchip{display:flex;align-items:center;gap:10px;padding:6px 6px 6px 8px;border:1px solid var(--line);border-radius:12px;background:var(--card2)}
.attchip img,.attchip .attpdf{width:42px;height:42px;object-fit:cover;border-radius:8px;flex:none;background:#fff}
.attchip .attpdf{display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#e8384f}
.attchip .grow{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
.cashsave{width:100%;margin:14px 0 0}
.cashpage{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
@media (min-width:1024px){.cashpage{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}}

/* v0.17.1: Gruppen und Kategorien getrennt */
.grpcfg.catsonly{padding-top:8px}
.grplabel{display:flex;align-items:baseline;gap:8px;padding:2px 4px 8px}.grplabel b{font-size:14px}.grplabel small{font-size:12px}
.areapick .grpn{margin-left:auto}

/* v0.17.2: Fenster offen → Hintergrund fest, schwebende Knöpfe am Handy ausblenden */
html.win-open,html.win-open body{overscroll-behavior:none}
@media (max-width:767px){html.win-open .topactions,html.win-open .fab{display:none}}
.sheet .panel{overscroll-behavior:contain;-webkit-overflow-scrolling:touch}

/* v0.18.0: Teilen + Mehrfachauswahl */
.dactions button svg{width:20px;height:20px}
.gcard{position:relative}
.pickbox{position:absolute;top:8px;left:8px;z-index:4;width:26px;height:26px;border-radius:50%;border:2px solid #fff;background:#0006;color:transparent;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;box-shadow:0 1px 4px #0005}
.pickbox.on{background:var(--acc);border-color:var(--acc);color:#fff}
.pickbox.inline{position:static;flex:none;align-self:center;border-color:var(--mut);background:transparent}
.pickbox.inline.on{border-color:var(--acc);background:var(--acc)}
.gcard.picked,.ditem.picked{outline:2px solid var(--acc);outline-offset:-2px}
.pickbar{position:sticky;bottom:calc(env(safe-area-inset-bottom) + 12px);z-index:25;margin:16px 0 0;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;
  background:color-mix(in srgb,var(--card) 90%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--line);box-shadow:0 8px 28px #0005}
.pickbar .btn{margin:0;display:inline-flex;align-items:center;gap:6px}.pickbar .btn svg{width:16px;height:16px}
@media (max-width:767px){.pickbar{bottom:calc(env(safe-area-inset-bottom) + 76px)}}
.sharegrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
.sharegrid button{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px;border-radius:14px;border:1px solid var(--line);background:var(--card);color:var(--txt);font:inherit;font-size:12px;cursor:pointer}
.sharegrid button span{font-size:24px}.sharegrid button:hover{border-color:var(--acc)}

/* v0.19.0: Rechnungen & Verträge */
.invpage,.ctpage{display:flex;flex-direction:column;gap:12px}
.invstats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.invstats .tile{display:flex;flex-direction:column;gap:2px;margin:0}.invstats .tile b{font-size:20px}
.kubar{height:6px;border-radius:3px;background:var(--card2);overflow:hidden;margin:6px 0 2px}.kubar i{display:block;height:100%;border-radius:3px}
.invbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.invbar .btn{margin:0}
.invfilter{margin:0}.invfilter small{opacity:.7}
.invlist{padding:4px 0}
.invrow{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);cursor:pointer}.invrow:last-child{border-bottom:0}
.invrow:hover{background:var(--card2)}
.invmain{flex:1;min-width:0}.invmain .row1{display:flex;justify-content:space-between;gap:10px}
.invacts{display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end}.invacts .btn{margin:0}.invacts .iconbtn svg{width:18px;height:18px}
.stpill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap;flex:none}
.st-draft{background:var(--card2);color:var(--mut)}.st-open{background:#0b63f622;color:var(--acc)}.st-over{background:#ef444422;color:var(--red)}
.st-paid{background:#16a34a22;color:#16a34a}.st-void{background:var(--card2);color:var(--mut);text-decoration:line-through}
.more{position:relative}.more summary{list-style:none;cursor:pointer}.more summary::-webkit-details-marker{display:none}
.moremenu{position:absolute;right:0;top:100%;z-index:20;min-width:220px;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 30px #0005;padding:6px;display:flex;flex-direction:column}
.moremenu button{background:none;border:0;color:var(--txt);text-align:left;padding:9px 10px;border-radius:8px;font:inherit;font-size:14px;cursor:pointer}.moremenu button:hover{background:var(--card2)}.moremenu .red{color:var(--red)}
.itemrow{display:grid;grid-template-columns:minmax(0,1fr) 64px 90px 92px 88px auto;gap:6px;align-items:center;margin-bottom:6px}
.itemrow input,.itemrow select{height:42px;min-height:42px;padding:8px 10px;font-size:15px}.itemrow select{padding-right:28px;background-position:right 10px center}
.itemrow .isum{text-align:right;font-size:14px;white-space:nowrap}.itemrow .iact{display:flex}
.itemsfs{container-type:inline-size;min-width:0}.itemsfs>.itemrow,.itemsfs>.btn{clear:both}
@container (max-width:640px){.itemrow{grid-template-columns:70px minmax(0,1fr) minmax(0,1fr);padding:8px;border:1px solid var(--line);border-radius:12px;margin-bottom:8px}
  .itemrow .itxt{grid-column:1/-1}.itemrow .isum{grid-column:1/3;text-align:left}.itemrow .iact{justify-content:flex-end}}
.invtotal{display:flex;justify-content:space-between;align-items:center;margin:12px 0 4px;padding:10px 12px;border-radius:12px;background:var(--card2)}.invtotal b{font-size:18px}
.invwarn{margin:12px 0;padding:10px 12px;border-radius:12px;background:#f59e0b1f;color:#b45309;font-size:13px;display:flex;flex-direction:column;gap:4px}
[data-theme=dark] .invwarn{color:#fbbf24}
.btn.wide{width:100%;margin:12px 0 0}
.logorow{display:flex;align-items:center;gap:12px;margin-top:12px}.logorow img{max-height:48px;max-width:160px;background:#fff;border-radius:6px;padding:4px}
.artrow{display:grid;grid-template-columns:1fr 100px 100px auto;gap:6px;margin-bottom:6px}.artrow input,.artrow select{height:42px;min-height:42px}
.mdrow{margin-bottom:10px}
.inrow{display:flex;gap:6px;margin-top:4px}.inrow input{flex:1;min-width:0;height:46px}.inrow select{width:auto;flex:none;height:46px}
.ctcalc{margin:12px 0 4px;padding:10px 12px;border-radius:12px;background:var(--card2);font-size:14px}
.ctrow.ended{opacity:1}.warnc{color:#f59e0b}
fieldset:disabled{opacity:.75}

.invstats .tile.alert{text-align:left;align-items:flex-start}
.invrow .stpill{width:84px;text-align:center}
@media (min-width:900px){.invacts{width:380px}}
@media (max-width:899px){.invrow{flex-wrap:wrap}.invmain{flex-basis:calc(100% - 100px)}.invacts{width:100%;justify-content:flex-start}}

@media (max-width:699px){.invstats{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.invstats .tile{padding:12px}.invstats .tile b{font-size:17px}.invstats .tile small{font-size:11px}}

/* v0.20.0: Seitenleiste mit Linien, Überschriften, Unterreitern, eigenen Symbolen */
.tabico{display:inline-flex;align-items:center;justify-content:center}.tabico img{width:1.25em;height:1.25em;object-fit:contain;border-radius:4px}
nav.bottom .navsep{border:0;border-top:1px solid var(--line);margin:8px 10px}
nav.bottom .navhead{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);padding:10px 14px 4px}
nav.bottom .subtab{font-size:14px;padding-left:34px!important;opacity:.95}
nav.bottom .subtab .tabico{font-size:15px}
nav.bottom .subtab .badge{margin-left:auto}
@media (max-width:767px){nav.bottom .navsep,nav.bottom .navhead,nav.bottom .subtab{display:none}}
.decocfg{min-height:44px}.decocfg .sepline{flex:1;border-top:2px solid var(--line);margin:0 8px}.hdlbl{white-space:nowrap}
.childcfg{margin-left:26px}
.parentsel{max-width:150px;font-size:12px}
.tabprev{display:inline-flex;align-items:center;gap:6px;font-weight:600}
.cactions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.cactions .chip{font-size:12px;padding:4px 10px;text-decoration:none;color:var(--txt)}
.avatar{background:var(--acc)!important;color:#fff;font-weight:700;font-size:18px!important}
.contactrow{align-items:flex-start}

@media (min-width:768px){nav.bottom .navsep.side-only,nav.bottom .navhead.side-only{display:block}nav.bottom .subtab.side-only{display:flex}}

nav.bottom>button span.tl{font-size:inherit;filter:none;opacity:1}
nav.bottom>button span.tabico.custom{filter:none;opacity:1}
nav.bottom>button.subtab span.tabico{font-size:16px}

.impcontact{gap:12px;align-items:center;cursor:pointer}.impcontact input{width:auto;margin:0}

/* v0.21.0 */
.pdfviewwin .dpages{max-height:none;flex:1}
.itemsfs>.itemwrap{clear:both}.itemwrap{margin-bottom:8px}.itemwrap .itemrow{margin-bottom:4px}
.itemextra{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px}.itemextra input{height:36px;min-height:36px;padding:6px 10px;font-size:13px}
.artrow .artextra{grid-column:1/-1}
.typepick{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.typepick .chip{display:inline-flex;align-items:center;gap:4px}

.unitsed{margin-top:16px;padding-top:12px;border-top:1px solid var(--line)}.unitsed .chips{margin:6px 0}
.unitchip{display:inline-flex;align-items:center;gap:4px;padding-right:4px}.unitchip button{border:0;background:none;color:var(--mut);cursor:pointer;font-size:15px;padding:0 4px}.unitchip button:hover{color:var(--red)}

/* v0.23.0: Rechnungsdesign, Mahnungen, Artikel */
.designmod{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
@media (min-width:1100px){.designmod{grid-template-columns:minmax(0,1fr) 380px;align-items:start}.designmod .pdfprev{position:sticky;top:16px}}
.dmctl{display:flex;flex-direction:column;gap:8px}.dmctl>small{margin-top:6px}.dmctl .seg{margin:0}
.presetrow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.presetcard{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border-radius:12px;border:1.5px solid var(--line);background:var(--card);color:var(--txt);font:inherit;font-size:12px;cursor:pointer}
.presetcard.on{border-color:var(--acc);box-shadow:0 0 0 2px color-mix(in srgb,var(--acc) 30%,transparent)}
.pcmini{width:54px;height:70px;background:#fff;border-radius:4px;position:relative;display:block;box-shadow:0 1px 4px #0003;overflow:hidden}
.pcmini i{position:absolute;left:7px;right:7px;height:4px;border-radius:2px;background:#d6d9de}.pcmini i:nth-child(1){top:12px;width:22px}.pcmini i:nth-child(2){top:30px}.pcmini i:nth-child(3){top:40px}
.pc-modern::before{content:"";position:absolute;inset:0 0 auto 0;height:10px;background:var(--a)}.pc-modern i:nth-child(1){background:var(--a)}
.pc-elegant i:nth-child(1){left:16px;background:var(--a)}.pc-minimal i{background:#e8eaed}
.rangel{display:flex;align-items:center;gap:10px;margin:2px 0}.rangel input{flex:1;accent-color:var(--acc);padding:0;border:0;background:none;height:auto;min-height:0}.rangel b{width:30px;text-align:right;color:var(--txt)}
.toggles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:4px 12px;margin:6px 0}.toggles .check{margin:0}
.pdfprev{background:var(--card2);border:1px solid var(--line);border-radius:14px;padding:10px;min-height:200px;transition:opacity .2s}.pdfprev.busy{opacity:.6}.pdfprev img{width:100%;display:block;border-radius:4px;box-shadow:0 2px 10px #0004;background:#fff}
.dunlvl{padding:0}.dunhead{display:flex;align-items:center;gap:10px;padding:12px;cursor:pointer}.dunhead b{flex:1}.dunlvl>:not(.dunhead){margin-left:12px;margin-right:12px}.dunlvl .actions{margin-bottom:12px}
code{background:var(--card2);padding:1px 5px;border-radius:5px;font-size:12px}

/* v0.24.0: Artikelscan */
.scanview{position:relative;background:#000;border-radius:14px;overflow:hidden;aspect-ratio:4/3}.scanview video{width:100%;height:100%;object-fit:cover;display:block}
.scanframe{position:absolute;left:12%;right:12%;top:28%;bottom:28%;border:3px solid #fff;border-radius:14px;box-shadow:0 0 0 999px #0006}
.scanerr{position:absolute;left:12px;right:12px;bottom:12px;background:#000c;color:#fff;padding:8px 10px;border-radius:10px;font-size:13px}
.scanrow{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}.scanrow label{flex:1 1 200px}.scanrow .btn{margin:0;height:46px}
.lookbox{margin-top:10px;padding:10px 12px;border-radius:12px;background:var(--card2);font-size:13px}.lookbox.ok{background:#16a34a1f}.lookbox.err{background:#ef44441f;color:var(--red)}
.lookbox .link{margin-left:8px}
.posbtns{display:flex;gap:8px;flex-wrap:wrap}.posbtns .btn{margin:0}

/* v0.24.1: freie Platzierung der Widgets */
.dash.freegrid{grid-auto-flow:row}
.dash.freegrid.editing{background-image:linear-gradient(to right,color-mix(in srgb,var(--acc) 10%,transparent) 1px,transparent 1px);background-size:calc((100% + var(--gap)) / 12) 100%;border-radius:12px}
.dash.freedrag .widget{transition:grid-column .12s,grid-row .12s}
.widget.dragging{outline:2px dashed var(--acc);outline-offset:2px;opacity:.85;z-index:3}

/* v0.24.2: schwebendes Widget beim Ziehen, Hinzufügen per Ziehen */
.dropslot{align-self:stretch;justify-self:stretch;min-height:40px;border:2px dashed var(--acc);border-radius:16px;background:color-mix(in srgb,var(--acc) 12%,transparent);z-index:1;pointer-events:none}
.widget.floatsrc{visibility:hidden}
.floatwidget{position:fixed;z-index:9999;pointer-events:none;transform:rotate(1deg) scale(1.02);filter:drop-shadow(0 18px 40px #0008);opacity:.95;border-radius:16px;overflow:hidden}
.floatwidget .floatclone{height:100%}.floatwidget .floatclone>*{height:100%;margin:0}
.floatwidget.isnew .tile{margin:0;border:2px solid var(--acc)}
.dash.freedrag .widget{transition:none}
.addwidgets .wadd button{touch-action:none;cursor:grab}

/* v0.24.3: Seitenleiste ein-/ausklappbar */
.sidetoggle{display:none}
@media (min-width:768px){
  nav.bottom .sidetoggle.side-only{display:flex;align-items:center;gap:10px;margin-top:auto;border:0;background:none;color:var(--mut);font:inherit;font-size:13px;padding:10px 14px;border-radius:12px;cursor:pointer}
  nav.bottom .sidetoggle:hover{background:var(--card2);color:var(--txt)}
  nav.bottom .sidetoggle .tabico{font-size:18px;width:20px;filter:none!important;opacity:1!important}
  html.side-mini{--side:68px!important}
  html.side-mini nav.bottom{padding-left:8px;padding-right:8px;overflow-x:hidden}
  html.side-mini nav.bottom .tl,html.side-mini nav.bottom .brand>div,html.side-mini nav.bottom .subnav,html.side-mini nav.bottom .navhead,html.side-mini nav.bottom .subtog{display:none!important}
  html.side-mini nav.bottom .brand{justify-content:center;padding-left:0;padding-right:0}
  html.side-mini nav.bottom>button{justify-content:center;padding-left:0!important;padding-right:0!important;position:relative;font-size:0}
  html.side-mini nav.bottom>button .tabico{font-size:22px}
  html.side-mini nav.bottom .subtab .tabico{font-size:16px}
  html.side-mini nav.bottom .badge{position:absolute;top:2px;right:6px;margin:0;font-size:10px}
  html.side-mini nav.bottom .navsep{margin:6px 4px}
  html.side-mini .sideresize{display:none}
}

/* v0.24.4: nur Pfeil, Hover-Beschriftung im eingeklappten Zustand */
@media (min-width:768px){
  nav.bottom .sidetoggle.side-only{justify-content:center;width:40px;height:40px;padding:0;align-self:flex-end;margin-right:4px}
  html.side-mini nav.bottom .sidetoggle.side-only{align-self:center;margin-right:0}
  nav.bottom .sidetoggle .tabico{width:auto;font-size:20px}
}
.sidetip{position:fixed;left:76px;transform:translateY(-50%);z-index:10000;pointer-events:none;background:var(--txt);color:var(--bg);font-size:13px;font-weight:600;padding:6px 10px;border-radius:8px;white-space:nowrap;box-shadow:0 6px 18px #0005;animation:popin .1s ease-out}
.sidetip::before{content:"";position:absolute;left:-5px;top:50%;transform:translateY(-50%);border:5px solid transparent;border-left:0;border-right-color:var(--txt)}

/* v0.24.5: Pfeil bleibt immer an derselben Stelle (Mitte der eingeklappten Leiste) */
@media (min-width:768px){
  nav.bottom .sidetoggle.side-only{align-self:flex-start;margin-left:4px;margin-right:0}
  html.side-mini nav.bottom .sidetoggle.side-only{align-self:flex-start;margin-left:6px}
}

/* v0.24.6: Positionen-Layout, Zahlungsstatus */
.itemsfs>*:not(legend){clear:both}
.posbtns{width:100%;margin-top:4px}.posbtns .btn{white-space:nowrap;flex:none}
.payfs .seg{margin:0 0 6px}

/* v0.24.7: eigenes Teilen-Fenster als Standard */
.sharegrid .wide2{grid-column:1/-1;flex-direction:row;justify-content:center;gap:10px}.sharegrid .wide2 small{color:var(--mut);font-size:12px}
.sharegrid .wide2 span{font-size:20px}
.okmsg{background:#16a34a1f;padding:8px 10px;border-radius:10px}

/* v0.24.8: kompaktes Teilen-Menü wie macOS */
.sharepop{position:fixed;z-index:10001;width:300px;padding:8px;border-radius:16px;background:color-mix(in srgb,var(--card) 88%,transparent);backdrop-filter:blur(24px) saturate(1.4);-webkit-backdrop-filter:blur(24px) saturate(1.4);
  border:1px solid color-mix(in srgb,var(--txt) 18%,transparent);box-shadow:0 18px 50px #0007;animation:popin .12s ease-out;color:var(--txt)}
.sharepop::before{content:"";position:absolute;left:calc(var(--ax) - 9px);width:16px;height:16px;background:inherit;border:inherit;transform:rotate(45deg);backdrop-filter:none}
.sharepop.up::before{top:-9px;border-right:0;border-bottom:0}.sharepop.down::before{bottom:-9px;border-left:0;border-top:0}
.sphead{display:flex;align-items:center;gap:12px;padding:6px 8px 8px;position:relative}.sphead div{min-width:0}.sphead b{display:block;font-size:14px}.sphead small{color:var(--mut);font-size:12px}
.spfile{font-size:30px;width:40px;height:46px;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:6px;box-shadow:0 1px 4px #0003;flex:none}
.spsep{height:1px;background:var(--line);margin:4px 6px}
.sharepop button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;color:var(--txt);font:inherit;font-size:14px;padding:7px 10px;border-radius:8px;cursor:pointer;text-align:left;position:relative}
.sharepop button:hover{background:var(--acc);color:#fff}.sharepop button:hover small{color:#fffc}
.sharepop button span{width:20px;text-align:center;font-size:16px}.sharepop button small{color:var(--mut);font-size:11px;margin-left:auto}
.spmsg{font-size:12px;color:var(--mut);padding:6px 10px 2px}

/* v0.24.11: einheitliche Symbol-Knöpfe in Rechnungen/Mahnungen */
.invacts .iconbtn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;min-width:36px;min-height:36px;padding:0;border-radius:10px;background:transparent;color:var(--mut);font-size:16px;line-height:1}
.invacts .iconbtn:hover,.invacts .more:not(.stmenu)[open]>summary{background:var(--card2);color:var(--acc)}
.invacts .iconbtn svg{width:18px;height:18px}
.more>summary.morebtn{list-style:none}

/* v0.24.13: Betrag und Status mittig in der Zeile */
.invrow{align-items:center}
.invamt{flex:none;min-width:96px;text-align:right;font-size:15px;white-space:nowrap}
.stpill{display:inline-flex;align-items:center;justify-content:center;line-height:1;height:24px;padding:0 10px}
@media (max-width:899px){.invamt{min-width:0}}

/* v0.25.0: Zahlungseingang buchen */
.paycands{display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:260px;overflow:auto}
.paycands .frow{gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:8px 10px}.paycands .frow.on{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 10%,transparent)}
.paycands input{width:auto;margin:0}

/* v0.25.1: Einklapp-Pfeil nie in der Handy-Leiste */
nav.bottom>button.sidetoggle{display:none}
@media (min-width:768px){nav.bottom>button.sidetoggle.side-only{display:flex}}

/* v0.25.3: Buchungssuche */
.txpicker{margin-top:10px}.txpicker .searchbar{margin:0 0 6px}
.txpfilter{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px}.txpfilter .chip{margin:0}.txpfilter small{margin-left:auto}
.txpicker .paycands{max-height:300px}

.paycands .frow.click{cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.paycands .frow.on{background:color-mix(in srgb,var(--acc) 16%,transparent);outline:2px solid var(--acc);outline-offset:-2px}
.txradio{flex:none;width:20px;height:20px;border-radius:50%;border:2px solid var(--mut);box-sizing:border-box;display:inline-block}
.txradio.on{border-color:var(--acc);background:radial-gradient(circle,var(--acc) 0 5px,transparent 6px)}
.payfoot{position:sticky;bottom:-1px;display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap;margin:12px -4px 0;padding:10px 4px;background:var(--bg);border-top:1px solid var(--line)}
.payfoot .btn{margin-left:auto}

.stmenu{flex:none}.stmenu>summary.stpill{width:auto;min-width:84px;cursor:pointer;gap:4px;user-select:none;-webkit-user-select:none}
.stmenu>summary .stcaret{font-size:9px;opacity:.75}
.stmenu .moremenu{min-width:200px;top:calc(100% + 6px);right:0;left:auto;z-index:60}
.stmenu .moremenu .cur{color:var(--acc);font-weight:600}
.stmenu[open]>summary.stpill{box-shadow:0 0 0 2px var(--line)}

.belegchip{display:flex;align-items:center;gap:10px;width:100%;margin:6px 0 8px;padding:8px 10px;background:var(--card2);border:1px solid var(--line);border-radius:12px;color:var(--txt);text-align:left;font:inherit;cursor:pointer}
.belegchip img{width:38px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--line);flex:none}
.belegchip:hover{border-color:var(--acc)}

.acctree .subgrp{margin-left:12px;border-left:1px solid var(--line);padding-left:4px}
.acctree .subgrp .acctitle{text-transform:none;letter-spacing:0;font-size:12px}
.grpcfg.subcfg{margin-left:26px;border-left:3px solid var(--line)}
.subarrow{color:var(--mut);font-size:16px}
.areapick select.chip{height:30px;padding:0 10px;font-size:13px;width:auto}

.doctree .accgroup>.accitem{padding-left:26px}
.doctree .subgrp>.accitem{padding-left:22px}
.acctree.doctree .subgrp{margin-left:22px}

.docdrop{display:flex;align-items:center;gap:12px;width:25%;min-width:280px;margin:16px 0 18px;padding:14px 12px 14px 16px;border:2px dashed var(--line);border-radius:14px;background:var(--card);cursor:pointer;transition:border-color .15s,background .15s;box-sizing:border-box}
.docdrop:hover,.docdrop.over{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 10%,var(--card))}
.docdrop .ddico{font-size:26px;flex:none}
.docdrop b{font-size:14px}.docdrop small{font-size:12px}
.docdrop .ddx{flex:none;width:30px;height:30px;min-width:30px;min-height:30px;font-size:13px;color:var(--mut)}
@media (max-width:700px){.docdrop{width:100%;min-width:0}}

.chips select.chip{max-width:170px;text-overflow:ellipsis}
.chipcfg{display:inline-flex;flex:none;white-space:nowrap;align-items:center;gap:6px;height:34px;padding:0 6px 0 8px;border:1px dashed var(--acc);border-radius:999px;background:var(--card);font-size:13px;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none}
.chipcfg.off{opacity:.45;border-style:dotted;border-color:var(--line)}
.chipcfg.drag{cursor:grabbing;background:color-mix(in srgb,var(--acc) 18%,var(--card));box-shadow:0 4px 14px #0004}
.chipcfg .chh{color:var(--mut);font-size:14px}
.chipeye{background:none;border:0;cursor:pointer;font-size:14px;padding:2px 4px;border-radius:999px;color:var(--txt)}
.chipeye:hover{background:var(--card2)}
.chipset{min-width:36px;justify-content:center}
.chiphint{align-self:center;font-size:12px}
.chips.chipedit{flex-wrap:wrap;overflow:visible;row-gap:8px}
.chipset,.chiphint{flex:none;white-space:nowrap}
.chipeye{display:inline-flex;align-items:center;justify-content:center;color:var(--mut)}.chipeye svg{width:16px;height:16px}.chipcfg.off .chipeye{color:var(--txt)}
.newdun>summary.btn{list-style:none;display:inline-flex;align-items:center}.newdun>summary::-webkit-details-marker{display:none}
.newdun .moremenu{left:0;right:auto;min-width:280px;top:calc(100% + 6px)}

.importbar{display:flex;align-items:center;gap:12px;width:25%;min-width:280px;box-sizing:border-box;margin:-8px 0 16px;padding:10px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.importbar b{font-size:13px}.importbar small{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.importbar .grow{min-width:0}
.ibar{display:block;height:5px;border-radius:9px;background:var(--card2);margin-top:6px;overflow:hidden}
.ibar>span{display:block;height:100%;background:var(--acc);border-radius:9px;transition:width .4s}
.spin{display:inline-block;width:18px;height:18px;border:2.5px solid color-mix(in srgb,var(--acc) 25%,transparent);border-top-color:var(--acc);border-radius:50%;animation:spin .8s linear infinite;flex:none}
.spin.big{width:26px;height:26px;border-width:3px}
@keyframes spin{to{transform:rotate(360deg)}}
@media (max-width:700px){.importbar{width:100%;min-width:0}}
.docdrop small a{color:var(--acc);text-decoration:none;font-weight:600}.docdrop small a:hover{text-decoration:underline}

.busytab{display:inline-flex;align-items:center;gap:4px;margin-left:auto;flex:none}
.busytab .spin{width:14px;height:14px;border-width:2px}
.busytab small{font-size:11px;font-weight:700;color:var(--acc)}
.sidebusy{margin:2px 10px 6px 44px;padding:6px 8px;border-radius:10px;background:var(--card2);cursor:pointer}
.sidebusy b{display:block;font-size:11.5px;font-weight:600;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sidebusy .ibar{margin-top:5px;height:4px}
html.side-mini .sidebusy,html.side-mini .busytab small{display:none}
.chip.ddshow{margin:6px 0 10px}
.uniwidget .docdrop{width:100%;min-width:0;margin:6px 0 10px}.uniwidget .importbar{width:100%;min-width:0;margin:0 0 8px}.unilast{margin:4px 2px 0}

.ctrow .ctacts{display:flex;align-items:center;gap:4px;flex:none}
.ctrow .ctacts .iconbtn{width:36px;height:36px;min-width:36px;padding:0;display:inline-flex;align-items:center;justify-content:center;background:transparent;color:var(--mut)}
.ctrow .ctacts .iconbtn svg{width:18px;height:18px}.ctrow .ctacts .iconbtn.on{color:var(--acc)}.ctrow .ctacts .iconbtn:disabled{opacity:.3}
.ctstate{border:0;cursor:pointer;font:inherit;font-size:11px;font-weight:700}
.ctrow.inactive .grow b,.ctrow.inactive .right b,.ctrow.ended .grow b,.ctrow.ended .right b{color:var(--mut)}
.ctrow.inactive .grow small,.ctrow.ended .grow small{color:var(--mut)}
.ctrow.inactive .thumb,.ctrow.ended .thumb,.ctrow.inactive img,.ctrow.ended img{filter:grayscale(1) brightness(.85)}
.ctwrap .dprev{margin:0 0 10px}
@media (max-width:700px){.ctrow{flex-wrap:wrap}.ctrow .ctacts{width:100%;justify-content:flex-end}}

@media (max-width:767px){
  nav.bottom{overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity}
  nav.bottom::-webkit-scrollbar{display:none}
  nav.bottom>button{flex:0 0 auto;min-width:72px;padding:8px 6px;scroll-snap-align:start}
  nav.bottom>button span.tl{font-size:10.5px;white-space:nowrap}
}

/* ===== FinDocu-Design (Finanz-App-Stil) – alle Geräte ===== */
html.ios{--ios-glass:color-mix(in srgb,var(--card) 72%,transparent);--ios-sep:color-mix(in srgb,var(--txt) 9%,transparent)}
.tabico .tabsvg{display:none;width:24px;height:24px}
html.ios body,html.ios button,html.ios input,html.ios select,html.ios textarea{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",system-ui,sans-serif;letter-spacing:-.01em}
html.ios body{-webkit-font-smoothing:antialiased}
html.ios .tile{border-radius:22px;border:0;box-shadow:none;background:var(--card)}
html.ios .tilehead b{font-size:17px;font-weight:600;letter-spacing:-.01em}
html.ios .hero{border-radius:26px}
html.ios .frow,html.ios .ditem,html.ios .invrow{border-color:var(--ios-sep)}
html.ios .chip{border:0;background:var(--card2);border-radius:999px;font-weight:500;min-height:34px}
html.ios .chip.on{background:var(--acc);color:#fff}
html.ios .btn{border-radius:14px;font-weight:600}
html.ios .btn.primary{border:0}
html.ios .seg{background:color-mix(in srgb,var(--txt) 8%,transparent);border:0;border-radius:12px;padding:3px}
html.ios .seg>button{border-radius:9px;font-weight:500}
html.ios .seg>button.on{background:color-mix(in srgb,var(--txt) 16%,var(--card));box-shadow:0 3px 8px #0003,0 0 0 .5px #0000000a;color:var(--txt)}
html:not([data-theme=dark]).ios .seg>button.on{background:#fff}
html.ios .searchbar{border:0;border-radius:12px;background:color-mix(in srgb,var(--txt) 8%,transparent);min-height:40px}
html.ios .searchbar input{background:transparent!important;border:0!important}
html.ios input:not([type=checkbox]):not([type=radio]):not([type=range]),html.ios select,html.ios textarea{border-color:transparent;background:color-mix(in srgb,var(--txt) 7%,transparent);border-radius:12px}
html.ios .fabmenu,html.ios [role=menu]{border-radius:22px;border:0;background:var(--ios-glass);backdrop-filter:saturate(180%) blur(24px);-webkit-backdrop-filter:saturate(180%) blur(24px);box-shadow:0 18px 50px #0007}
html.ios .docdrop{border-width:1.5px;border-radius:18px;background:transparent}
html.ios .importbar{border:0;border-radius:16px}
nav.bottom .tabico .tabemo{font-size:inherit!important;filter:none!important;opacity:1!important}
html.fg[data-theme=dark]{--bg:#000;--card:#1f1f1f;--card2:#2b2b2b;--line:#2e2e2e;--txt:#fff;--mut:#9b9b9f;--acc:#5ee6cf;--ok:#6fd36b;--red:#ff6b6b;--warn:#f5a524;--fg-pur:#a35cff;--fg-ind:#5b5be6;--ios-glass:rgba(46,46,48,.82);--ios-sep:#2e2e2e;color-scheme:dark}
html.fg:not([data-theme=dark]){--bg:#fff;--card:#f3f3f5;--card2:#e8e8ec;--line:#e2e2e6;--txt:#0b0b0d;--mut:#6c6c72;--acc:#0fb39a;--ok:#2f9e3a;--fg-pur:#8a3ffc;--fg-ind:#4f46e5;--ios-glass:rgba(250,250,252,.85);--ios-sep:#e2e2e6}
html.fg body,html.fg button,html.fg input,html.fg select,html.fg textarea{font-family:"Outfit Variable","Outfit",-apple-system,system-ui,sans-serif;letter-spacing:0}
html.fg body,html.fg .app{background:var(--bg)}
html.fg .topicons button,html.fg .eyebtn{color:var(--acc)!important;background:none!important}
html.fg .topicons svg{width:24px;height:24px;stroke-width:2.2}
html.fg .tile{background:var(--card);border-radius:26px;padding:18px}
html.fg .tilehead b{font-size:19px;font-weight:600}
html.fg .tilehead small,html.fg .tilehead a,html.fg .tilehead .link{color:var(--acc)}
html.fg .hero{background:var(--card)!important;color:var(--txt)!important;box-shadow:none!important;border-radius:26px}
html.fg .hero small{color:var(--mut)}
html.fg .hero .hero-v,html.fg .hero b{color:var(--txt)}
html.fg .hero .hsub>div,html.fg .hero .stats>div{background:var(--card2)!important;color:var(--txt)}
html.fg .pos,html.fg .ok{color:var(--ok)!important}
html.fg b,html.fg strong{font-weight:600}
html.fg .frow,html.fg .ditem,html.fg .invrow{padding-top:14px;padding-bottom:14px;border-color:var(--line)}
html.fg .frow b,html.fg .ditem .dtitle,html.fg .invrow .row1 b{font-size:18px;font-weight:500}
html.fg .frow small,html.fg .ditem small{font-size:14px}
html.fg .thumb,html.fg .caticon{border-radius:12px}
html.fg .caticon{background:#fff!important}
html.fg main section>h3{margin:14px -16px 0;padding:9px 16px;background:var(--card2);font-size:15px;font-weight:600;color:var(--txt);border-radius:0}
html.fg .chip{background:var(--card2);border-radius:14px;font-weight:500;min-height:38px;padding:0 14px}
html.fg .chip.on{background:color-mix(in srgb,var(--acc) 22%,var(--card));color:var(--acc)}
html.fg .searchbar{background:var(--card2);border-radius:16px}
html.fg .seg{background:var(--card);border-radius:16px;padding:4px}
html.fg .seg>button{border-radius:12px}
html.fg .seg>button.on{background:var(--card2)!important;color:var(--txt);box-shadow:none}
html.fg .btn{border-radius:16px;background:var(--card2);border:0;color:var(--txt)}
html.fg .btn.primary{background:var(--acc);color:#04201b}
html.fg .link{color:var(--acc)}
html.fg input:not([type=checkbox]):not([type=radio]):not([type=range]),html.fg select,html.fg textarea{background:var(--card2);border-radius:16px}
html.fg .fab{background:var(--acc);color:#04201b;box-shadow:0 8px 24px color-mix(in srgb,var(--acc) 40%,transparent)}
html.fg .win{background:var(--bg)}
html.fg .fabmenu{background:var(--card)!important}
html.fg .stpill.st-paid{background:color-mix(in srgb,var(--ok) 20%,transparent);color:var(--ok)}
html.fg .docdrop{border-color:var(--card2)}
html.fg body{font-size:17px;line-height:1.35}
html.fg .tilehead b{font-size:24px;font-weight:600}
html.fg .tilehead small,html.fg .tilehead .link,html.fg .tilehead button.link{font-size:15px;white-space:nowrap}
html.fg .frow b,html.fg .ditem b,html.fg .ditem .dtitle,html.fg .invrow .row1 b,html.fg .contactrow b,html.fg .ctrow b{font-size:20px;font-weight:500;line-height:1.25}
html.fg .frow .right b,html.fg .ditem b.amt,html.fg .invamt,html.fg .ditem .row1 .amt{font-size:20px;font-weight:500}
html.fg .frow small,html.fg .ditem small,html.fg .invrow small,html.fg .contactrow small,html.fg .ctrow small,html.fg .muted.block{font-size:17px;line-height:1.3}
html.fg .small{font-size:15px}
html.fg .label{font-size:14px;padding:4px 10px;border-radius:8px;font-weight:500}
html.fg .hero small{font-size:18px}
html.fg .hero-v{font-size:44px;font-weight:600;letter-spacing:-.01em}
html.fg .hero .hero-row small,html.fg .hero .stats small{font-size:14px}
html.fg .hero .hero-row b,html.fg .hero .stats b{font-size:18px}
html.fg .hero .hero-row>div,html.fg .hero .stats>div{background:var(--card2)!important;color:var(--txt)}
html.fg .chip{font-size:17px;min-height:46px;padding:0 16px;border-radius:16px}
html.fg .seg>button{font-size:16px;min-height:44px}
html.fg .btn{font-size:17px;min-height:46px}
html.fg .searchbar{min-height:52px}html.fg .searchbar input{font-size:18px}
html.fg main section>h3{font-size:17px;padding:10px 16px}
html.fg .acctree .accitem,html.fg .acctree.card .accitem{font-size:19px;min-height:50px}
html.fg .acctitle{font-size:14px}
html.fg .invstats .tile b{font-size:28px}html.fg .invstats .tile small{font-size:15px}
html.fg .docdrop b{font-size:17px}html.fg .docdrop small{font-size:15px}
html.fg label{font-size:16px}
html.fg input:not([type=checkbox]):not([type=radio]):not([type=range]),html.fg select,html.fg textarea{font-size:18px}
html.fg .caticon{width:48px!important;height:48px!important;font-size:24px!important}
html.fg .fabmenu b{font-size:19px}html.fg .fabmenu small{font-size:15px}
html.fg .moremenu button{font-size:18px;padding:12px 12px}

/* ===== nur Handy: schwebende Leiste, Kopf, ＋-Button ===== */
@media (max-width:767px){
  html.ios main h1,html.ios .pagetitle,html.ios header h1{font-size:34px;font-weight:700;letter-spacing:-.025em}
  html.ios nav.bottom{left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 8px);padding:6px;border:1px solid color-mix(in srgb,var(--txt) 8%,transparent);border-radius:30px;background:var(--ios-glass);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);box-shadow:0 10px 30px #0006,0 1px 0 color-mix(in srgb,#fff 6%,transparent) inset;gap:2px}
  html.ios nav.bottom>button{min-width:64px;min-height:50px;padding:5px 8px 4px;border-radius:24px;gap:1px;color:var(--mut);transition:background .2s,color .2s}
  html.ios nav.bottom>button.on{background:color-mix(in srgb,var(--acc) 16%,transparent);color:var(--acc)}
  html.ios nav.bottom>button span.tl{font-size:10px;font-weight:600;letter-spacing:0}
  html.ios nav.bottom .tabico.hassvg .tabemo{display:none}
  html.ios nav.bottom .tabico .tabsvg{display:block}
  html.ios nav.bottom>button span.tabico{filter:none;opacity:1;font-size:22px;line-height:1}
  html.ios main{padding-bottom:calc(env(safe-area-inset-bottom) + 96px)}
  html.ios .fab{bottom:calc(env(safe-area-inset-bottom) + 84px);right:18px;width:54px;height:54px;font-size:28px;font-weight:300;background:var(--acc);box-shadow:0 8px 24px color-mix(in srgb,var(--acc) 45%,transparent),0 0 0 1px color-mix(in srgb,#fff 18%,transparent) inset}
  html.ios .topactions{background:var(--ios-glass);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid color-mix(in srgb,var(--txt) 8%,transparent);box-shadow:none}
  html.ios .ditem{flex-wrap:wrap;row-gap:4px}
  html.ios .ditem .dactions{flex-direction:row;width:100%;justify-content:flex-end;gap:2px;margin-top:-4px}
  html.ios .ditem .dactions button{width:38px;height:34px}
  html.ios .win{border-radius:22px 22px 0 0;border:0}
  html.ios .win::before{content:"";position:absolute;top:6px;left:50%;transform:translateX(-50%);width:36px;height:5px;border-radius:3px;background:color-mix(in srgb,var(--txt) 22%,transparent);z-index:3;pointer-events:none}
  html.fg header.top{padding-top:40px} /* .app hat bereits den Abstand der Statusleiste (safe-area) */
  html.fg header.top h1{font-size:44px;font-weight:600;letter-spacing:-.01em;line-height:1.05}
  html.fg .topactions{background:none!important;border:0!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important;top:calc(env(safe-area-inset-top) + 10px)!important;right:14px!important}
  html.fg nav.bottom{border-radius:34px;padding:6px;background:var(--ios-glass);border:1px solid color-mix(in srgb,var(--txt) 10%,transparent);box-shadow:0 12px 34px #000a}
  html.fg nav.bottom>button{border-radius:28px;min-height:58px;color:var(--txt)}
  html.fg nav.bottom>button.on{background:color-mix(in srgb,#000 70%,var(--card));color:var(--acc)}
  html.fg:not([data-theme=dark]) nav.bottom>button.on{background:#fff;box-shadow:0 2px 8px #0001}
  html.fg nav.bottom>button span.tl{font-size:12px;font-weight:500}
  html.fg nav.bottom .tabico .tabsvg{width:27px;height:27px;stroke-width:2.1}
  html.fg header.top h1{font-size:46px}
  html.fg nav.bottom>button span.tl{font-size:13px}
}

/* ===== Tablet/Desktop: Seitenleiste & Kopf im gleichen Stil ===== */
@media (min-width:768px){
  html.fg nav.bottom{background:var(--bg);border-right:1px solid var(--line)}
  html.fg nav.bottom>button{color:var(--txt);border-radius:16px}
  html.fg nav.bottom>button.on{background:var(--card);color:var(--acc)}
  html.fg nav.bottom>button:hover{background:var(--card)}
  html.fg nav.bottom .tabico.hassvg .tabemo{display:none}
  html.fg nav.bottom .tabico .tabsvg{display:block;width:22px;height:22px;stroke-width:2}
  html.fg nav.bottom .brand b{font-weight:600}
  html.fg header.top h1{font-size:40px;font-weight:600;letter-spacing:-.01em}
  html.fg .topactions{background:var(--card)!important;border:0!important;box-shadow:none!important}
  html.fg main section>h3{margin:18px 0 10px!important;border-radius:12px;text-transform:none;letter-spacing:0}
  html.fg .ditem .dactions{gap:2px}
}
/* Fixkosten-Vertragsordner: lange Texte umbrechen statt die Seite zu verbreitern */
.cgrid,.crow,.crow .frow{min-width:0;max-width:100%}
@media (max-width:767px){.cgrid{grid-template-columns:minmax(0,1fr)}}
.crow .frow .grow{min-width:0}
.crow .frow .grow small{white-space:normal;overflow-wrap:anywhere}
.cmeta{flex-wrap:wrap;row-gap:6px;min-width:0}
.cmeta .pill{white-space:normal;max-width:100%;overflow-wrap:anywhere;margin-left:0;border-radius:12px}
html.fg .cmeta .pill{font-size:15px;padding:5px 12px}
html.fg .cmeta .link{font-size:16px}

@media (max-width:767px){
  html.fg .topactions{position:absolute!important}
  html.fg main section>h3{margin:18px -16px 10px!important;text-transform:none;letter-spacing:0;position:relative;z-index:0}
  html.fg main section>h3+.dlist{margin-top:0}
}

/* ===== Einstellungen im FinDocu-Design ===== */
html.fg fieldset{border-radius:24px;box-shadow:none;background:var(--card);padding:10px 18px 18px}
html.fg legend{font-size:19px;font-weight:600;padding:12px 0 6px}
html.fg .ssec{padding:0;margin-top:14px}
html.fg .ssechead{padding:6px 10px 6px 6px}
html.fg .ssectitle{font-size:20px;font-weight:600;min-height:56px;padding:12px 8px;border-radius:16px}
html.fg .ssectitle:hover{background:var(--card2)}
html.fg .ssectitle .pchev{color:var(--acc)}
html.fg .ssecbody{border-top:1px solid var(--line);padding:4px 18px 18px}
html.fg .switchrow{font-size:17px;padding:12px 0;margin:0;border-bottom:1px solid var(--line)}
html.fg .switchrow:last-child{border-bottom:0}
html.fg .switchrow small{font-size:14px;margin-top:2px}
html.fg .themeopts{gap:10px}
html.fg .themeopts button{border:0;background:var(--card2);border-radius:18px;padding:16px 8px}
html.fg .themeopts button.on{background:color-mix(in srgb,var(--acc) 18%,var(--card));color:var(--acc);box-shadow:inset 0 0 0 2px var(--acc)}
html.fg .themeopts button b{font-size:16px}html.fg .themeopts button small{font-size:13px;color:var(--mut)}
html.fg .tab-settings .muted.small,html.fg .tab-settings p.small{font-size:15px;line-height:1.45}
html.fg .tab-settings .actions .link,html.fg .tab-settings button.link{color:var(--acc);font-size:16px}
html.fg .grpcfg{background:var(--card2);border-radius:18px}
html.fg .acccfg{border-radius:14px}
html.fg input.switch{accent-color:var(--acc)}
html.fg .switch:checked{background:var(--acc)}
@media (max-width:1023px){html.fg .hero .hero-row{flex-wrap:wrap}html.fg .hero .hero-row>div{flex:1 1 calc(50% - 8px);min-width:0}}
@media (min-width:768px){html.fg nav.bottom .acctree .accitem{font-size:14.5px;min-height:38px}html.fg nav.bottom .acctitle{font-size:11px}}

.txedit{width:32px;height:32px;min-width:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:0;color:var(--mut);border-radius:10px;flex:none}
.txedit svg{width:16px;height:16px}.txedit:hover{background:var(--card2);color:var(--acc)}
/* Seitenleiste (iPad/Desktop) im Verhältnis zum Inhalt */
@media (min-width:768px){
  html.fg{--side:256px}
  html.fg nav.bottom>button{font-size:18px;min-height:52px;padding:11px 14px;gap:14px}
  html.fg nav.bottom .tabico .tabsvg{width:26px;height:26px}
  html.fg nav.bottom>button span.tabico{font-size:24px}
  html.fg nav.bottom .subtab{font-size:17px}
  html.fg nav.bottom .subtab .tabico .tabsvg{width:22px;height:22px}
  html.fg nav.bottom .brand b{font-size:21px}html.fg nav.bottom .brand small{font-size:13px}
  html.fg nav.bottom .brand img{width:44px;height:44px}
  html.fg nav.bottom .acctree .accitem{font-size:16.5px;min-height:44px}
  html.fg nav.bottom .acctitle{font-size:12.5px}
  html.fg nav.bottom .navhead{font-size:12.5px}
  html.fg nav.bottom .busytab small{font-size:12px}
}
@media (min-width:1024px){html.fg{--side:300px}}
html.fg .txrow{font-size:16px}html.fg .txrow b{font-size:17px;font-weight:500}html.fg .txrow small{font-size:15px}html.fg .txhead{font-size:12.5px}
html.fg nav.bottom .acctree .accitem .ab{font-size:13.5px}

/* Kontobuchungen: Aktionsleiste hinter dem Betrag, Beleg-Vorschau darunter */
.txrow{grid-template-columns:92px minmax(0,1fr) 190px 130px 164px}
.txtable.withacc .txhead,.txtable.withacc .txrow{grid-template-columns:92px minmax(0,1fr) 170px 150px 130px 164px}
.txhead{grid-template-columns:92px minmax(0,1fr) 190px 130px 164px}
.txacts{flex-direction:row!important;justify-content:flex-end;gap:2px;width:auto!important;margin:0!important}
.txacts button:disabled{opacity:.25;cursor:default}
.txrow.open{background:var(--card2)}
.txprev{padding:0 16px 14px;border-bottom:1px solid var(--line)}
.txprev .dprev{margin:10px 0 0}
.ditem.center .txacts{flex:none}
@media (max-width:767px){.ditem.center{flex-wrap:wrap}.ditem.center .txacts{width:100%!important;justify-content:flex-end}}
/* Buchungs-Details: Felder in passender Größe */
html.fg .kv{font-size:17px;padding:12px 0;align-items:baseline}
html.fg .kv>:first-child{font-size:16px;color:var(--mut)}
html.fg .win .btn.danger{font-size:17px}
/* Kategorie-Kacheln in der Buchungstabelle: 1px kleiner, Symbol mittig */
html.fg .txrow .caticon,html.fg .ditem.center .caticon{width:47px!important;height:47px!important;display:inline-flex!important;align-items:center;justify-content:center;font-size:23px!important;line-height:1;padding:0}
.bkh{margin:16px 0 4px;font-size:18px}.bkimp{margin-top:14px;padding:14px;border-radius:16px;background:var(--card2)}

.lockscreen{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:24px;z-index:100}
.lockbox{width:100%;max-width:360px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
.lockbox .lockicon{width:84px;height:84px;border-radius:22px;margin-bottom:6px}
.lockbox h1{margin:0;font-size:36px;font-weight:600}
.lockbox p{margin:0 0 12px}
.lockbox input{width:100%;text-align:center;font-size:20px;height:56px;border-radius:18px;border:0;background:var(--card2);color:var(--txt);padding:0 16px;box-sizing:border-box}
.lockbox .btn{width:100%;min-height:52px;font-size:18px}
.shake{animation:shake .35s}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
@media (min-width:768px){
  html.fg nav.bottom button span.tabico{filter:none!important;opacity:1!important;color:inherit}
  html.fg nav.bottom .subtab{color:var(--txt);font-size:17px;min-height:46px;padding:9px 14px 9px 46px!important;border-radius:16px;gap:14px}
  html.fg nav.bottom .subtab .tabico .tabsvg{width:22px;height:22px;stroke-width:2}
  html.fg nav.bottom .subtab.on{background:var(--card);color:var(--acc)}
  html.fg nav.bottom .subtab:hover{background:var(--card)}
}
.navcfg .parentsel{width:auto;min-width:180px;max-width:220px}.navcfg .parentsel:disabled{opacity:.6}

/* v0.44: Ausgabe (Bonsy-Stil), Analyse, Vermögen */
.exppage,.anapage,.wealthpage{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
@media (min-width:1024px){.exppage{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:start}}
.expscan{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
.expbig{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:14px 12px;border-radius:16px;border:1px solid var(--line);background:var(--card2);color:var(--txt);font:inherit;cursor:pointer;min-width:0}
.expbig:first-child{background:color-mix(in srgb,var(--acc) 18%,var(--card));border-color:color-mix(in srgb,var(--acc) 45%,transparent)}
.expbig .expico{font-size:22px;line-height:1;margin-bottom:6px}.expbig b{font-size:14px}.expbig small{color:var(--mut);font-size:11.5px;line-height:1.3}
@media (max-width:520px){.expbig small{display:none}.expbig{align-items:center;text-align:center;padding:12px 6px}}
.expatt{display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--line);border-radius:14px;background:var(--card2);margin-bottom:10px}
.expatt img,.expatt .attpdf{width:46px;height:46px;object-fit:cover;border-radius:8px;flex:none;background:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#e8384f}
.expatt .grow{min-width:0}.expatt small{overflow-wrap:anywhere}
.expform .bigamount{width:100%;text-align:left;margin:4px 0 0;padding:6px 0;font-size:32px}
.expitems{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}
.expitemshead{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
.expitem{display:grid;grid-template-columns:46px 8px minmax(0,1fr) 72px minmax(0,118px) 32px;gap:6px;align-items:center;margin:6px 0}
.expitem>input,.expitem>select{width:100%;min-width:0;box-sizing:border-box}.expitem .iconbtn{width:32px;height:32px;padding:0;margin:0}
.expform input.bigamount{font-size:30px!important;font-weight:700;letter-spacing:-.01em}
.expitem input,.expitem select{margin:0;padding:8px 8px;font-size:14px;min-width:0}
.expitem .q,.expitem .p{text-align:right}.expitem .x{color:var(--mut);font-size:12px;text-align:center}
@media (max-width:620px){.expitem{grid-template-columns:40px 8px minmax(0,1fr) 70px 28px;grid-template-areas:"q x n p d" ". . c c c"}
  .expitem .q{grid-area:q}.expitem .x{grid-area:x}.expitem .n{grid-area:n}.expitem .p{grid-area:p}.expitem .c{grid-area:c;font-size:12px;padding:5px 8px}.expitem .iconbtn{grid-area:d}}
.expitemsfoot{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px}
.expdiff{font-size:12.5px;color:var(--mut);display:flex;gap:8px;align-items:center}.expdiff.warn{color:var(--warn)}
.expentry+.expentry{border-top:1px solid var(--line)}
.expdetail{padding:4px 4px 12px 50px}
.exprow{display:flex;gap:8px;align-items:center;padding:5px 0;font-size:14px}.exprow .grow{min-width:0;overflow-wrap:anywhere}
.chip.sm{padding:2px 8px;font-size:11px}
.anahead{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.anahead .seg{margin:0;flex:0 1 auto}.anahead .seg button{padding:7px 12px;white-space:nowrap}
@media (max-width:520px){.anaper{margin-left:0;width:100%;justify-content:space-between}}
.anaper{display:flex;align-items:center;gap:6px;margin-left:auto}.anaper b{min-width:120px;text-align:center;text-transform:capitalize}
.anaaccs{display:flex;gap:6px;flex-wrap:wrap}
.anakpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:760px){.anakpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
.kpi{padding:14px 16px}.kpiv{font-size:24px;font-weight:700;letter-spacing:-.02em;margin:2px 0;overflow-wrap:anywhere}.kpiv.big{font-size:40px}
.kpiv.pos,.pos{color:var(--pos,var(--ok))}.kpiv.neg{color:var(--neg,var(--red))}
.delta{font-size:12px;font-weight:600}.delta.good{color:var(--pos,var(--ok))}.delta.bad{color:var(--neg,var(--red))}
.anakpi{display:flex;gap:14px;align-items:center}
.anagrid{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
@media (min-width:900px){.anagrid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}}
.anadonut{display:flex;justify-content:center;margin:4px 0 8px}.anadonut .donut{width:170px;height:170px}
.tilehead .seg.sm{margin:0}.seg.sm button{font-size:12.5px;padding:5px 10px}
.mbars{display:flex;gap:6px;align-items:stretch}
.mcol{flex:1;display:flex;flex-direction:column;align-items:center;min-width:0;background:none;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;border-radius:8px}
.mcol.on{background:color-mix(in srgb,var(--acc) 12%,transparent)}
.mpair{flex:1;width:100%;display:flex;gap:3px;align-items:flex-end;justify-content:center}
.mpair .v{width:38%;max-width:16px;border-radius:4px 4px 0 0;min-height:2px}
.mcol small{color:var(--mut);font-size:10px;margin-top:4px;white-space:nowrap}
.mbars.diverge .mcol{cursor:default}
.mbars.diverge .dpos,.mbars.diverge .dneg{flex:1;width:100%;display:flex;justify-content:center}
.mbars.diverge .dpos{align-items:flex-end;border-bottom:1px solid var(--line)}.mbars.diverge .dneg{align-items:flex-start}
.mbars.diverge .v{width:46%;max-width:18px;border-radius:4px}
.wdbars{display:flex;gap:8px;height:110px;align-items:stretch;margin-bottom:8px}
.wdcol{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
.wdv{width:60%;max-width:26px;background:var(--acc);border-radius:5px 5px 0 0;min-height:2px}.wdcol small{color:var(--mut);font-size:11px;margin-top:4px}
.frow.on{background:color-mix(in srgb,var(--acc) 10%,transparent);border-radius:10px}
.wealthhero .seg{max-width:280px;margin:10px 0}
.wealthdelta{font-size:14px;font-weight:600}
.linechart{position:relative}.linechart svg{width:100%;height:180px;display:block;touch-action:pan-y}
.lcinfo{display:flex;gap:8px;align-items:baseline;justify-content:flex-end;font-size:14px}
.lcx{display:flex;justify-content:space-between}.lcx small{color:var(--mut);font-size:10px}
.stackbar{display:flex;height:14px;border-radius:7px;overflow:hidden;margin:4px 0 10px;background:var(--line)}
.assetedit{border:1px solid var(--line);border-radius:14px;padding:4px 12px 12px;margin-top:8px}
.assetedit .row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}

/* v0.45: Firmenauswertung, Fahrtenbuch */
.earrow{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:14px}.earrow span{min-width:0}
.earrow.total{border-bottom:0;font-size:16px;font-weight:700;padding-top:12px}.earrow b{white-space:nowrap}
.kubar{height:8px;border-radius:4px;background:var(--line);overflow:hidden;margin:2px 0 14px}.kubar>div{height:100%;border-radius:4px}
.minikpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:6px}.minikpis>div{display:flex;flex-direction:column;gap:2px;background:var(--card2);border-radius:12px;padding:10px 12px;min-width:0}.minikpis b{font-size:18px}
.tile.click,.kpi.click{cursor:pointer}
.fbpage{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
.fbempty{text-align:center;padding:36px 20px}.fbempty .fbhero{font-size:56px}.fbempty b{font-size:20px;display:block;margin:6px 0}.fbempty p{max-width:460px;margin:8px auto 18px}
.fbcarhead{display:flex;align-items:center;gap:12px}.fbcaric{font-size:30px;width:52px;height:52px;border-radius:16px;background:color-mix(in srgb,var(--acc) 16%,var(--card2));display:flex;align-items:center;justify-content:center;flex:none}
.fbcarhead b{font-size:18px}
.fbodo{margin:14px 0 6px}
.fbstats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.fbstats>div{display:flex;flex-direction:column;background:var(--card2);border-radius:12px;padding:10px;min-width:0}.fbstats b{font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:560px){.fbstats{gap:6px}.fbstats>div{padding:8px 6px}.fbstats b{font-size:15px}.fbstats small{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.fbquick{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:8px;margin-top:12px}
@media (max-width:520px){.fbquick{gap:6px}.fbquick button{font-size:11px;padding:10px 2px}.fbquick button span{font-size:20px}}
.fbquick button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 4px;border-radius:14px;border:1px solid var(--line);background:var(--card2);color:var(--txt);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.fbquick button span{font-size:22px}
.fbseg{margin:0;overflow-x:auto;scrollbar-width:none}.fbseg button{white-space:nowrap;flex:1 0 auto}
.fbic{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:19px;flex:none;background:var(--card2)}
.fbic.fuel{background:#f59e0b22}.fbic.trip{background:#3b82f622}.fbic.expense{background:#8b5cf622}
.fbrem.due .fbic{background:#ef444433}.fbrem.due b{color:var(--red)}.fbrem.soon .fbic{background:#f59e0b33}
.fbcats{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}
.fbkmhint{margin:10px 0 0;font-size:15px}
.fbbook{margin-top:10px}.fbbook select{margin-top:6px}
.fbbtns{display:flex;gap:8px;margin-top:16px}.fbbtns .btn{flex:1}

.fbinbtn{display:flex;gap:6px;align-items:center;margin-top:4px}.fbinbtn input{flex:1;min-width:0;margin:0}
.fbgps{flex:none;width:40px;height:40px}.fbnear{flex:none;white-space:nowrap;margin:0;display:inline-flex;gap:4px;align-items:center}
.fbnearlist{border:1px solid var(--line);border-radius:14px;padding:4px 10px 8px;margin-top:8px;max-height:320px;overflow:auto}
.fbbeleg{margin:10px 0 2px}.fbbeleg .expatt{margin:0}
.fbbook .seg{margin-top:4px}.fbbook select{margin-top:8px}
.fbtxpick{margin-top:8px;border:1px solid var(--line);border-radius:14px;padding:6px 10px;max-height:300px;overflow:auto}
.fblinked{border:1px solid var(--line);border-radius:12px;padding:6px 8px;margin-top:4px}

.fbspecs{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.fbspecs span{font-size:12px;background:var(--card2);border-radius:999px;padding:3px 9px;color:var(--txt)}
.fbcap{margin-top:8px}.fbcap .kubar{margin:0 0 4px}.fbcap small{color:var(--mut)}.fbcap.warn small{color:var(--red)}.fbacdc{margin-top:8px}

.fbentry+.fbentry{border-top:1px solid var(--line)}.fbentry .fbrow{border:0}
.fbrow .txacts{flex:none}.fbentry .txprev{padding:0 4px 12px;border:0}
@media (max-width:767px){.fbrow{flex-wrap:wrap}.fbrow .txacts{width:100%!important;justify-content:flex-end;margin-top:-4px!important}}

.chip.fbaddveh{min-width:40px;padding-left:12px;padding-right:12px;font-size:16px;font-weight:600}

.vehicons .libwrap{position:relative;display:inline-flex}.vehicons .libwrap .libdel{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:0;background:var(--red);color:#fff;font-size:12px;line-height:18px;padding:0;cursor:pointer;opacity:0;transition:opacity .15s}
.vehicons .libwrap:hover .libdel,.vehicons .libwrap:focus-within .libdel{opacity:1}@media (hover:none){.vehicons .libwrap .libdel{opacity:.85}}
.vehicons .chip img{width:22px;height:22px;object-fit:contain;vertical-align:middle}
.vehadd{margin-top:8px}
.vehimg{width:1.2em;height:1.2em;object-fit:contain;vertical-align:-.25em}.fbcaric .vehimg{width:34px;height:34px}

.wipezone{margin-top:22px;padding-top:14px;border-top:1px solid var(--line)}
.wipebox{border:1.5px solid var(--red);border-radius:16px;padding:14px 16px;background:color-mix(in srgb,var(--red) 8%,var(--card));margin-top:8px}
.wipebox>b{color:var(--red);font-size:16px}.wipebox ul{margin:6px 0 10px;padding-left:20px}.wipebox li{margin:3px 0}
.wipeword{color:var(--red);letter-spacing:.04em}.wipebox input:disabled{opacity:.5}
.wipebox .btn.danger:not(:disabled){background:var(--red);color:#fff;border-color:var(--red)}
.wipezone>.btn.danger{color:var(--red);border-color:color-mix(in srgb,var(--red) 50%,transparent)}

.pwinput{position:relative;display:block;margin-top:4px}.pwinput input{width:100%;padding-right:44px;margin:0;box-sizing:border-box}
.pweye{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:34px;height:34px;border:0;background:none;color:var(--mut);display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:8px;padding:0}
.pweye:hover{color:var(--txt);background:var(--card2)}.pweye svg{width:20px;height:20px}

@media (max-width:767px){.dprevbar.gbar{display:none!important}}

.tilehead{flex-wrap:wrap;gap:4px 12px}
@media (max-width:767px){html.fg .tilehead small,html.fg .tilehead .link{white-space:normal}}
.kuhead{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:-2px 0 6px}
.tbsethead{margin:4px 0 8px}.tbset{margin-bottom:16px}
@media (max-width:767px){
  html.tbicons nav.bottom>button span.tl{display:none}
  html.tbicons nav.bottom>button{flex:1 0 56px;min-height:52px;min-width:56px;padding:6px 4px;justify-content:center;align-items:center}
  html.tbicons nav.bottom>button .tabico{margin:0 auto}
  html.fg.tbicons nav.bottom>button{min-height:52px}
  html.tbicons nav.bottom .tabico .tabsvg{width:28px;height:28px}
}

/* iOS 26 Web-App: kurze Seiten verschieben die fixe Leiste nach oben – Seite immer mind. bildschirmhoch */
html,body{min-height:100%}
.app{min-height:100vh}
@supports (height:100lvh){.app{min-height:100lvh}}

.winguard>:first-child{flex:1 0 100%}.winguard .grow{display:none}.winguard .btn{flex:1 1 0;white-space:nowrap;justify-content:center}

/* Filterleisten: an die Breite anpassen statt seitlich abschneiden */
.chips.chipbar{flex-wrap:wrap!important;overflow:visible!important;row-gap:8px}
.chips.chipbar>.chip,.chips.chipbar>select.chip{flex:1 1 auto;justify-content:center;text-align:center;min-width:0}
.chips.chipbar>.chipset{flex:0 0 auto}
.chips.chipbar.chipedit>.chipcfg{flex:0 0 auto}

.chips.chipbar>.chip,.chips.chipbar>select.chip,.chips.chipbar>.chipcfg{height:43px!important;min-height:43px!important}

.expmenu{position:relative;display:inline-flex}.expmenu>summary{list-style:none;cursor:pointer}.expmenu>summary::-webkit-details-marker{display:none}
.expmenu .moremenu{min-width:250px;top:calc(100% + 6px);right:auto;left:0;z-index:60}
.expmenu .moremenu button small{font-size:11.5px;margin-top:1px}.expmenu .exphead{padding:6px 10px 4px;font-size:11.5px}
.chips.chipbar>.expmenu{flex:1 1 auto}.chips.chipbar>.expmenu>summary{width:100%;height:43px;justify-content:center;display:flex;align-items:center}
@media (max-width:600px){.expmenu .moremenu{position:fixed;left:12px;right:12px;top:auto;bottom:calc(env(safe-area-inset-bottom) + 96px);min-width:0}}

.anasegwrap{position:relative}
.anacustom{position:absolute;left:0;top:calc(100% + 8px);z-index:50;width:min(380px,calc(100vw - 32px));display:flex;flex-wrap:wrap;gap:10px;padding:14px;border-radius:18px;
  background:var(--card);border:1px solid var(--line);box-shadow:0 16px 40px #0007;animation:menuin .15s ease-out}
.anacustom label{margin:0;font-size:12px;display:flex;flex-direction:column;gap:4px;flex:1 1 40%}.anacustom input{margin:0;padding:8px 10px;width:100%;min-width:0}
.anacustom .anapresets{width:100%;justify-content:flex-start;gap:6px}.anacustom .anapresets .chip{padding:5px 11px;font-size:12.5px}
.anacustom>small{width:100%}
.anacaret{margin-left:5px;font-size:10px;opacity:.8}
.anarange{cursor:pointer;white-space:nowrap}

.anacustom .anapresets{display:flex;flex-wrap:wrap!important;overflow:visible!important}

.anacustom{width:min(400px,calc(100vw - 24px))}
.rcal{width:100%}
.rcalsel{display:flex;align-items:center;gap:8px;margin-bottom:10px}.rcalsel>span{color:var(--mut)}
.rcalsel button{flex:1;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 12px;border-radius:12px;border:1.5px solid var(--line);background:var(--card2);color:var(--txt);font:inherit;cursor:pointer}
.rcalsel button.on{border-color:var(--acc)}.rcalsel small{font-size:11px;color:var(--mut)}.rcalsel b{font-size:16px}
.rcalhead{display:flex;align-items:center;gap:6px;margin-bottom:6px}.rcalhead select{flex:1;margin:0;padding:7px 10px;font-size:15px;font-weight:600}
.rcalhead select:last-of-type{flex:0 0 96px}
.rcalgrid{display:grid;grid-template-columns:repeat(7,1fr);row-gap:3px}
.rcalwd{text-align:center;font-size:12px;color:var(--mut);padding:4px 0 6px;font-weight:600}
.rcald{height:44px;border:0;background:none;color:var(--txt);font:inherit;font-size:16px;font-weight:500;cursor:pointer;border-radius:0;position:relative}
.rcald.out{color:var(--mut);opacity:.55}.rcald:disabled{opacity:.25;cursor:default}
.rcald.in{background:color-mix(in srgb,var(--acc) 20%,transparent)}
.rcald.start{border-radius:22px 0 0 22px}.rcald.end{border-radius:0 22px 22px 0}.rcald.start.end{border-radius:22px}
.rcald.edge{background:var(--acc);color:#04201b;font-weight:700}
.rcald.today:not(.edge)::after{content:"";position:absolute;left:50%;bottom:6px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:var(--acc)}
.rcald:not(.edge):not(:disabled):hover{background:color-mix(in srgb,var(--acc) 30%,transparent)}
.rcalhint{display:block;margin-top:6px}

.rcalfield{flex:1;display:flex;flex-direction:column;gap:2px;padding:8px 12px;border-radius:12px;border:1.5px solid var(--line);background:var(--card2);margin:0;cursor:text;min-width:0}
.rcalfield.on{border-color:var(--acc)}.rcalfield.bad{border-color:var(--red)}.rcalfield small{font-size:11px;color:var(--mut)}
.rcalfield input{border:0!important;background:none!important;padding:0!important;margin:0;font:inherit;font-size:16px;font-weight:700;color:var(--txt);width:100%;min-width:0;box-shadow:none!important;outline:none;height:auto!important}

.expmenu>summary.chip,.expmenu>summary.btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;line-height:1;white-space:nowrap}
.fbdropchip{margin-left:14px}
.chips.chipbar>.expmenu>summary{height:43px!important;min-height:43px!important}

.chips:not(.chipbar)>.expmenu{margin-left:14px}.chips>.fbdropchip+.expmenu{margin-left:0}
.invbar>.expmenu{margin-left:8px}

.seg.segbar{flex-wrap:wrap;gap:4px;align-items:stretch}.seg.segbar>button{flex:1 1 auto}
.seg.segbar>.segset{flex:0 0 auto;background:none;border:0;color:var(--mut);font:inherit;font-size:14px;padding:6px 12px;border-radius:12px;cursor:pointer}
.seg.segbar>.segset.on{background:var(--card2);color:var(--acc);font-weight:600}
.seg.segbar.chipedit{padding:8px;gap:8px}.seg.segbar.chipedit>.chipcfg{flex:0 0 auto}.seg.segbar>.chiphint{width:100%;padding:2px 6px}

@media (max-width:600px){.expmenu .moremenu{position:fixed!important;left:12px!important;right:12px!important;top:auto!important;bottom:calc(env(safe-area-inset-bottom) + 96px)!important;z-index:200}}
.expmenu .moremenu{z-index:200;max-height:70vh;overflow:auto}

.wboard{display:grid;gap:16px;grid-template-columns:minmax(0,1fr);align-items:start}
@media (min-width:900px){.wboard{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.wbitem.full{grid-column:1/-1}}
.wbitem{position:relative;min-width:0}
.wbitem>.wbbody>*{margin:0}
.wboard.editing .wbitem{outline:2px dashed var(--line);outline-offset:4px;border-radius:18px}
.wbitem.dragging{opacity:.4}
.wbbar{display:flex;align-items:center;gap:8px;margin:0 0 8px;padding:6px 8px;background:var(--card);border:1px solid var(--line);border-radius:12px}
.wbbar .handle{cursor:grab;touch-action:none;font-size:18px;padding:0 4px}
.wbbar .iconbtn{width:30px;height:30px;font-size:14px}
.wbitem>.dropline{position:absolute;left:0;right:0;top:-10px}
.wbitem>.dropline:last-child{top:auto;bottom:-10px}
.wbitem[data-grid]>.dropline{left:-10px;right:auto;top:0;bottom:0;width:3px;height:auto}
.wboard.editing .wbbody{max-height:190px;overflow:hidden;pointer-events:none;-webkit-mask-image:linear-gradient(#000 60%,transparent);mask-image:linear-gradient(#000 60%,transparent)}
@media (max-width:899px){.wbwide{display:none!important}}
.calupcwin .calupclist{max-height:none;overflow:visible}
.calupbtn b{margin-left:4px;background:var(--acc);color:#000;border-radius:999px;padding:0 7px;font-size:12px}
.calupbtn.warn b{background:var(--red);color:#fff}
@media (max-width:600px){.calhead{flex-wrap:wrap}.calhead .calupbtn{order:-1;flex:1 1 100%;justify-content:center;display:flex;align-items:center}}
@media (max-width:600px){.calupcwin .calrow{display:grid;grid-template-columns:auto auto 1fr auto;grid-template-areas:"d t t btn" "d amt days btn";column-gap:10px;row-gap:2px;align-items:center}
.calupcwin .calrow>.datebox{grid-area:d}.calupcwin .calrow>.grow{grid-area:t;min-width:0}.calupcwin .calrow>b{grid-area:amt;font-size:14px}
.calupcwin .calrow>small.nowrap{grid-area:days;justify-self:start}.calupcwin .calrow>.iconbtn{grid-area:btn}}
.calupcwin .calrow .datebox{width:46px;height:46px;padding:0;overflow:hidden}
.calupcwin .calrow .datebox b{font-size:17px;line-height:1.05;color:inherit}.calupcwin .calrow .datebox small{font-size:10px;line-height:1.1;margin-top:2px}
.calupcwin .calrow.over .datebox b{color:var(--red)}
.invname{cursor:pointer}.invname:hover{text-decoration:underline;text-underline-offset:3px}
.invprev{padding:0 14px 14px}.invprev .dprev{margin:0}
.invrow.prevopen{background:color-mix(in srgb,var(--acc) 8%,transparent)}
.cactions .chip{display:inline-flex!important;align-items:center;gap:6px;line-height:1.2;vertical-align:middle;height:auto!important}
.dprevbar .btn{white-space:nowrap}@media (max-width:600px){.invprev{padding:0 6px 10px}}
/* Ausgabe-Widget in der Übersicht: kompakt bei schmaler Kachel */
.expform{container-type:inline-size}
@container (max-width:460px){
 .expform .expscan{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
 .expform .expbig{display:flex!important;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:10px 6px!important;min-height:0!important;gap:4px}
 .expform .expbig small{display:none}.expform .expbig b{font-size:13px;line-height:1.15}.expform .expico{font-size:22px}
 .expform .grid2{grid-template-columns:minmax(0,1fr)!important}
 .expform .bigamount{font-size:26px!important}
}
.txscroll.fit{overflow-y:auto;overscroll-behavior:contain}
.txmore{width:100%;margin-top:12px}.txtable .txmore{width:calc(100% - 24px);margin:12px}
.txtable{overflow:clip}
.txtable .txhead{position:sticky;top:0;z-index:3;background:var(--card)}
.txscroll.fit{overflow-y:auto}
.txtable{container-type:inline-size}
@container (max-width:820px){
 .txhead,.txrow,.txtable.withacc .txhead,.txtable.withacc .txrow{grid-template-columns:100px minmax(0,1fr) 110px 150px!important}
 .txhead>span:nth-child(3),.txrow>span:nth-child(3){display:none}
 .txtable.withacc .txhead>span:nth-child(4),.txtable.withacc .txrow>span:nth-child(4){display:none}
}
@container (max-width:560px){
 .txhead,.txrow,.txtable.withacc .txhead,.txtable.withacc .txrow{grid-template-columns:96px minmax(0,1fr) 100px!important}
 .txhead>span:last-child,.txrow>.txacts{display:none}
}
.fitscroll{display:flex;flex-direction:column;gap:inherit;min-width:0}
.fitscroll.fit{overflow-y:auto;overscroll-behavior:contain;margin:0 -6px;padding:0 6px 6px}
.fitscroll>*{flex-shrink:0}
.fbseg{position:sticky;top:env(safe-area-inset-top);z-index:6}.fbseg.stuck{box-shadow:0 6px 14px -8px #0008}
@media (min-width:700px){.fbseg{top:calc(env(safe-area-inset-top) + 84px)}.fbseg.stuck{box-shadow:0 -40px 0 4px var(--bg),0 -84px 0 4px var(--bg),0 6px 14px -8px #0008}}
.txdetail .panelhead{border:0}
.txhero{display:flex;flex-direction:column;align-items:center;gap:10px;margin:4px 0 18px;text-align:center}
.txhero h2{margin:4px 0 0;font-size:28px;line-height:1.15}
.txheroico{position:relative;cursor:pointer}.txheroico .caticon{border-radius:22px}
.txpen{position:absolute;top:-8px;right:-8px;width:28px;height:28px;border-radius:50%;background:var(--acc);color:#000;display:grid;place-items:center;font-size:14px;border:3px solid var(--bg)}
.txcat{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:12px;border:0;background:color-mix(in srgb,var(--acc) 16%,transparent);color:var(--acc);font:inherit;font-weight:600;cursor:pointer}
.txcat span{font-size:13px;opacity:.8}
.txcard{padding:4px 16px!important;margin-bottom:14px}
.txkv{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid var(--line)}
.txkv:last-child{border-bottom:0}
.txkv>span{color:var(--mut)}
.txkv>b{text-align:right}.txkv>b.pos{color:var(--ok)}
.txkv.col{flex-direction:column;align-items:stretch;gap:8px}
.txkv.col>span:empty{display:none}
.txkv.col>p{margin:0;white-space:pre-wrap;word-break:break-word;line-height:1.4}
.txkv.col>b{text-align:left}
.txlink{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:var(--card2,#ffffff0d);cursor:pointer}
.txlink.plain{background:none;padding:2px 0;cursor:default}
.txadd{text-align:left;padding:2px 0;font-size:16px}
.txpick{display:flex;flex-direction:column;gap:8px}.txpick .row{display:flex;gap:8px;align-items:center}.txpick .row input{flex:1}
.txpick.tile{margin-bottom:14px}
.emojigrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:6px}
.emojigrid button{font-size:22px;height:42px;border-radius:10px;border:1px solid var(--line);background:none;cursor:pointer}
.emojigrid button.on{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 18%,transparent)}
.txh{display:block;padding:14px 0 6px;font-size:18px}
.txbars{width:100%;height:auto;display:block}
.txbars .grid{stroke:var(--line);stroke-width:1}.txbars .ax{fill:var(--mut);font-size:10px}
.txbars rect{fill:#6366f1}.txbars rect.cur{fill:var(--acc)}
.txbars .avg{stroke:var(--txt);stroke-width:1.5;stroke-dasharray:5 4;opacity:.8}
.txavg{font-size:24px;font-weight:700;padding:6px 0 10px}.txavg small{font-size:15px;font-weight:600}
.txlinkrow{display:flex;justify-content:space-between;align-items:center;width:100%;padding:14px 0;border:0;border-top:1px solid var(--line);background:none;color:var(--acc);font:inherit;font-size:16px;cursor:pointer;text-align:left}
.txcard>.txlinkrow:first-child{border-top:0}
.txlinkrow.red{color:var(--red)}
.txsec{margin:18px 2px 10px;font-size:22px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em}
.txitems{display:flex;flex-direction:column;gap:6px}
.txitem{display:flex;align-items:center;gap:10px}.txitem .grow{min-width:0}.txitem small{display:block}
.txdetail .expscan{margin:0}
.caticon.logo{background:#fff!important;overflow:hidden;padding:12%}
.caticon.logo img{width:100%;height:100%;object-fit:contain;display:block}
/* Konten am Handy */
.mkonten{display:flex;flex-direction:column;gap:14px}
.mstat{cursor:pointer;display:flex;flex-direction:column;gap:8px}
.mstathead{display:flex;align-items:center;gap:10px}.mstathead b{font-size:18px}.mstathead .muted:first-of-type{flex:1}
.mstatval{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.mstatval b{font-size:34px;letter-spacing:-.02em}.mstatval b.neg{color:var(--red)}
.mstatbar{height:6px;border-radius:3px;background:color-mix(in srgb,var(--acc) 25%,var(--card2));overflow:hidden}.mstatbar i{display:block;height:100%;background:var(--acc);border-radius:3px}
.mgrouphead{display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:0;color:var(--txt);padding:8px 2px 4px;cursor:pointer}
.mgrouphead h2{margin:0;font-size:26px}.mgrouphead .chev{color:var(--acc);font-size:22px;transform:rotate(-90deg);transition:transform .15s}.mgrouphead .chev.open{transform:none}
.mlist{padding:0!important;overflow:hidden}
.mrow{display:flex;align-items:center;gap:14px;padding:14px 16px;border-bottom:1px solid var(--line);cursor:pointer}.mrow:last-child{border-bottom:0}
.mrow .grow{display:flex;flex-direction:column;min-width:0}.mrow .grow>span{font-size:18px}
.maccico{width:40px;height:40px;display:grid;place-items:center;font-size:26px;flex:none}
.mmoney{font-weight:500;font-size:17px}.mmoney.pos{color:var(--ok)}.mmoney.big{font-size:22px;font-weight:700;text-align:center}
.mactions{display:flex;gap:8px;flex-wrap:wrap}.mactions .btn{flex:1 1 auto}
.mtopbar{position:sticky;top:0;z-index:3;display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:6px;padding:8px 0;background:var(--bg);margin:-6px 0 0}
.mtitle{text-align:center;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mback{font-size:17px;white-space:nowrap}
.mmore{position:relative}.mmore summary{list-style:none}.mmore summary::-webkit-details-marker{display:none}
.mmore .moremenu{right:0;left:auto;min-width:230px}
.mbalrow{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}
.mmonth{appearance:none;-webkit-appearance:none;background:none!important;border:0!important;box-shadow:none!important;color:var(--mut);font:inherit;font-weight:600;padding:4px 0!important;max-width:100%;width:auto;height:auto;min-height:0}.mmonth.r{text-align:right;color:var(--acc)}
.mtxlist{margin:0 -16px}
.mday{position:sticky;top:56px;z-index:2;background:var(--card2);padding:8px 16px;font-weight:700;font-size:15px}
.mtx{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line);cursor:pointer}
.mtx .grow{min-width:0;display:flex;flex-direction:column;gap:3px}.mtx .grow>b{font-size:17px;font-weight:600}
.msub{display:flex;align-items:center;gap:6px;color:var(--mut);font-size:14px;min-width:0}
.mtag{background:var(--card2);color:var(--txt);border-radius:7px;padding:1px 7px;font-size:12px;flex:none}
.mamt{font-weight:600;font-size:16px;white-space:nowrap}.mamt.in{color:var(--ok);background:color-mix(in srgb,var(--ok) 15%,transparent);padding:4px 8px;border-radius:8px}
.mrec{width:26px;height:26px;border-radius:50%;background:var(--card2);display:grid;place-items:center;font-size:14px;flex:none;color:var(--mut)}
.one{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mmore summary{display:grid;place-items:center;font-size:20px;line-height:1}
/* Wischgesten */
.swrow{position:relative;overflow:hidden;--swbg:var(--bg)}
.tile .swrow,.txtable .swrow,.dlist .swrow{--swbg:var(--card)}
.swfront{position:relative;z-index:1;background:var(--swbg);touch-action:pan-y;will-change:transform}
.swacts{position:absolute;top:0;bottom:0;display:flex;overflow:hidden;z-index:0}
.swacts.l{left:0;justify-content:flex-start}.swacts.r{right:0;justify-content:flex-end}
.swbtn{flex:1 0 78px;min-width:78px;border:0;color:#fff;font:inherit;font-size:12px;font-weight:600;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer}
.swacts.l .swbtn:first-child,.swacts.r .swbtn:last-child{flex-grow:1}
.swbtn span{font-size:20px;line-height:1}
.deadlines ul .swrow{list-style:none}
/* Neue Handy-Ansichten */
.mpage{display:flex;flex-direction:column;gap:12px}
.mstats{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:0 16px 2px;scroll-snap-type:x mandatory}
.mstats::-webkit-scrollbar{display:none}
.mstatc{flex:0 0 auto;min-width:150px;max-width:220px;display:flex;flex-direction:column;align-items:flex-start;text-align:left;justify-content:flex-start;gap:3px;padding:12px 14px!important;scroll-snap-align:start}
.mstatc b{font-size:21px;white-space:nowrap}.mstatc small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mstatc.click{cursor:pointer}.mstatc.mwarn{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--red) 45%,transparent)}
.msticky{position:sticky;top:0;z-index:3;background:var(--bg);display:flex;flex-direction:column;gap:8px;padding:6px 0 8px;margin:0 -16px;padding-left:16px;padding-right:16px}
.mchips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:0 16px}.mchips::-webkit-scrollbar{display:none}
.mchips .chip{flex:none;white-space:nowrap}
.mhead{display:flex;justify-content:space-between;align-items:center;gap:10px}
.mpage .mtxlist .mhead{position:static}
.mright{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex:none;max-width:42%}
.mright small{font-size:12px;white-space:nowrap}
.mright .stpill{font-size:11px}
.mtx.dim{opacity:.55}
.mavatar{font-weight:700;font-size:19px;border-radius:50%!important}
.mamt.neg{color:var(--red)}
.mpage .mactions .btn{flex:1 1 0;white-space:nowrap;padding-left:10px;padding-right:10px}
.mpage .healthbox{display:flex;align-items:center;gap:10px;justify-content:space-between}
/* Haftende Leisten am Handy unter der Statusleiste halten */
.mtopbar,.msticky{top:env(safe-area-inset-top)!important;box-shadow:0 calc(-1 * env(safe-area-inset-top) - 2px) 0 var(--bg)}
.mday{top:calc(env(safe-area-inset-top) + 56px)}
.vehpick{display:inline-flex;flex:none}
.vehpickbtn .caret{font-size:12px;opacity:.7;margin-left:2px;transition:transform .15s}.vehpickbtn.open .caret{transform:rotate(180deg)}
.vehmenu{background:linear-gradient(var(--card),var(--card)),var(--bg)!important;z-index:300!important;backdrop-filter:none!important;opacity:1!important;min-width:260px;max-width:min(320px,calc(100vw - 24px));z-index:60;display:flex!important;flex-direction:column}
.vehmenu>button{display:flex;align-items:center;gap:10px;text-align:left}
.vehmenu>button.on{background:color-mix(in srgb,var(--acc) 14%,transparent)}
.vehmi{font-size:22px;width:30px;text-align:center}
.vehmenu .menusep{height:1px;background:var(--line);margin:4px 0}

/* v0.64 Kassabuch · Lager & Inventur */
.kbstats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.kbstat{display:flex;flex-direction:column;gap:2px;padding:14px 16px}.kbstat b{font-size:20px}
.kbkind{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.kbbeleg{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:8px 0;display:flex;flex-direction:column;gap:6px}
.kbbelegrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.kbtable{padding:0;overflow:hidden}
.kbr{display:grid;grid-template-columns:86px 92px minmax(0,2.4fr) minmax(0,1.3fr) 110px 110px 120px;gap:10px;align-items:center;padding:9px 14px;border-bottom:1px solid var(--line);font-size:14px}
.kbr .r{text-align:right;font-variant-numeric:tabular-nums}.kbr .stpill{margin-left:8px;min-width:0}
.kbh{font-size:12px;font-weight:700;color:var(--mut);position:sticky;top:0;background:var(--card);z-index:2}
.kbfoot{position:static;border-top:2px solid var(--line);border-bottom:0;font-size:14px;color:inherit}
.kbopen{color:var(--mut);font-style:italic}
.kbstorno b,.kbstorno .pos,.kbstorno .neg{text-decoration:line-through;opacity:.6}
.kbdenoms{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:8px 0}
.kbden{display:grid;grid-template-columns:1fr 64px;gap:2px 8px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:6px 10px;margin:0}
.kbden input{text-align:right;padding:6px 8px}.kbden small{grid-column:1/-1;text-align:right}
.kbsum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.kbsum div{background:var(--card2);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column}.kbsum b{font-size:18px}
.kbhero{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 0 14px}.kbhero>span:first-child{font-size:30px;font-weight:800}
.kbrow{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)}.kbrow span{text-align:right}
.kbsetrow{margin-bottom:10px;padding:12px}
.artphoto{border-radius:12px;object-fit:cover;flex:none}
.artstock{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:8px 0;display:flex;flex-direction:column;gap:6px}
.invqty{min-width:90px}.invqty b{font-size:17px}
.cntprog{height:6px;border-radius:99px;background:var(--card2);overflow:hidden;margin:8px 0 4px}.cntprog div{height:100%;background:var(--acc);transition:width .2s}
.cntbar{display:flex!important;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0}
.cntbar .searchbar{flex:1 1 100%}.cntbar .searchbar{margin:0;min-width:160px}
.cntlist{display:flex;flex-direction:column}
.cntrow{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)}.cntrow.done{background:color-mix(in srgb,var(--ok) 7%,transparent)}
.cntin{width:68px;text-align:center;padding:8px 4px;font-weight:700}
.cntdiff{width:48px;text-align:right;font-weight:700;font-size:13px}
@media(max-width:700px){.kbsum b{font-size:15px}.kbdenoms{grid-template-columns:1fr 1fr}.cntrow .chip{padding:6px 10px}.cntin{width:56px}}
.cntrow .grow{min-width:0}
@media(max-width:700px){.cntrow>.caticon,.cntrow>.artphoto{display:none}.cntdiff{width:38px}}

/* v0.65 */
.expscan.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.srlist{display:flex;flex-direction:column;margin:8px 0}
.srrow{display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)}.srrow.off{opacity:.45}
.srrow>input[type=checkbox]{margin-top:12px;flex:none}
.srmain{display:flex;flex-direction:column;gap:4px;min-width:0}.srmain select{font-size:13px;padding:6px 8px}
.srnum{width:84px;flex:none;margin:0;font-size:11px}.srnum input{padding:8px 6px;text-align:right}
.accvisrow{padding:8px 0;border-bottom:1px solid var(--line)}.accvisrow.off .accvisname{opacity:.5}
.accvisname{display:flex;align-items:center;gap:10px}
@media(max-width:767px){.chip.desktop-only{display:none}}
@media(max-width:700px){.srrow{flex-wrap:wrap}.srmain{flex:1 1 calc(100% - 34px)}.srnum{width:calc(50% - 4px);flex:1}}
.accvishead{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.srrow>input[type=checkbox]{width:18px;height:18px;min-height:0;padding:0}
@media(max-width:700px){.srmain{flex:1 1 0;min-width:calc(100% - 30px)}}

/* v0.66 Konten-Design für alle Reiter (Test) – nur aktiv mit html.klook */
.khero{margin:0 0 4px}.khero .hero-v.click,.khero .hero-row .click{cursor:pointer}
.khead{display:none}
html.klook .invstats,html.klook .kbstats{display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:var(--card);border-radius:26px;padding:20px 22px}
html.klook :is(.invstats,.kbstats)>.tile{flex:1 1 150px;min-width:0;background:var(--card2)!important;box-shadow:none!important;border:0!important;padding:10px 12px!important;border-radius:14px;display:flex;flex-direction:column;gap:2px;margin:0}
html.klook :is(.invstats,.kbstats)>.tile small{font-size:13px!important}
html.klook :is(.invstats,.kbstats)>.tile b{font-size:17px!important}
html.klook :is(.invstats,.kbstats)>.tile:first-child{flex:0 1 auto;min-width:230px;background:none!important;padding:0 16px 0 4px!important}
html.klook :is(.invstats,.kbstats)>.tile:first-child b{font-size:38px!important;font-weight:700;letter-spacing:-.02em;line-height:1.15}
html.klook :is(.invstats,.kbstats)>.tile:first-child small:first-child{font-size:17px!important}
html.klook .invbar .btn,html.klook .kacts .chip{background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:13px;font-weight:500;min-height:0;height:auto;box-shadow:none}
html.klook .invbar .btn.primary,html.klook .kacts .chip.on{background:color-mix(in srgb,var(--acc) 22%,var(--card));color:var(--acc);border-color:transparent}
html.klook .kacts{flex-wrap:wrap;overflow:visible;margin:0;padding:0}
@media(min-width:768px){
html.klook .fitscroll>.khead{display:grid;grid-template-columns:54px 300px minmax(0,1fr) auto;gap:12px;position:sticky;top:0;z-index:3;background:var(--card);border-radius:14px 14px 0 0;padding:10px 16px;font-size:12px;font-weight:700;color:var(--mut);border-bottom:1px solid var(--line)}
html.klook .fitscroll>.khead span:first-child{grid-column:2}html.klook .fitscroll>.khead span:last-child{text-align:right}
html.klook .fitscroll>.khead+.tile,html.klook .fitscroll>.khead~.tile{border-radius:0 0 14px 14px;margin-top:0;padding-top:0;padding-bottom:0}
html.klook .fitscroll .tile>.frow,html.klook .fitscroll .tile .dwrap>.frow{border:0;border-bottom:1px solid var(--line);border-radius:0;padding:7px 2px;gap:12px;align-items:center}
html.klook .fitscroll .tile .frow:hover{background:var(--card2)}
html.klook .fitscroll .tile .frow>.caticon,html.klook .fitscroll .tile .frow>.artphoto,html.klook .fitscroll .tile .frow>.thumb{width:34px!important;height:34px!important;font-size:16px!important;margin:0 4px}
html.klook .fitscroll .tile .frow>.grow{display:grid;grid-template-columns:300px minmax(0,1fr);column-gap:12px;align-items:center;min-width:0}
html.klook .fitscroll .tile .frow>.grow>b{grid-column:1;font-size:14px!important;font-weight:600!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
html.klook .fitscroll .tile .frow>.grow>small{grid-column:2;font-size:13px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0}
html.klook .fitscroll .tile .frow>.grow>.stpill{grid-column:2;justify-self:start;margin:0!important}
html.klook .fitscroll .tile .frow>.grow>.cactions{grid-column:2;margin:0}
html.klook .fitscroll .tile .frow .right b{font-size:14px}
html.klook .fitscroll .invrow{padding:8px 16px!important}
html.klook .fitscroll .invrow .invmain{display:grid;grid-template-columns:200px minmax(0,1fr);column-gap:12px;align-items:center}
html.klook .fitscroll .invrow .invmain>.link{grid-column:1/-1}
html.klook .fitscroll .invamt{font-size:14px!important;font-weight:600!important}
html.klook .fitscroll.kinv>.khead{grid-template-columns:0 200px minmax(0,1fr) auto;padding-left:4px}
html.klook .fitscroll.fit>.khead{flex:none}
html.klook .fitscroll>.khead{margin-bottom:-12px}
html.klook .fitscroll .invrow .row1 b{font-size:14px!important;font-weight:600!important}
html.klook .fitscroll .invrow small{font-size:13px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
}
@media(max-width:700px){html.klook .khero{margin:0}html.klook .khero .hero-row{flex-wrap:wrap}html.klook .khero .hero-row>div{flex:1 1 40%;min-width:0}}
html.klook .invbar .chip,html.klook .invbar summary.chip,html.klook .invbar select.chip{font-size:13px!important;padding:6px 12px!important;min-height:0!important;height:auto!important}
@media(min-width:768px){html.klook .fitscroll .invacts{width:auto!important;min-width:0!important;flex:none}html.klook .fitscroll .invrow .invmain{grid-template-columns:200px minmax(0,1fr)}}

/* v0.67 Besitz & Garantie */
.astpage .scopeseg{margin-bottom:12px}
.astphoto{align-items:center;gap:12px;margin:8px 0}
.astwarr{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:8px 0;display:flex;flex-direction:column;gap:6px}
.astwarr p{margin:2px 0 0}
.astpage .frow.ended{opacity:.55}
.astpage .frow .right{min-width:92px}

/* v0.67.1 Kassabuch-Tabelle ab iPad im Desktop-Design */
.kbtable{container-type:inline-size}
.kbsub{display:none}
.kbcnt{margin-left:3px;font-weight:400}
.kbr>span{min-width:0}
@container (max-width:860px){
  .kbr{grid-template-columns:96px minmax(0,1fr) 92px 92px 100px;gap:8px;padding:9px 12px}
  .kbr>.kbcno,.kbr>.kbccat,.kbh>span:nth-child(1),.kbh>span:nth-child(4),.kbopen>span:nth-child(1),.kbopen>span:nth-child(4),.kbfoot>span:nth-child(1),.kbfoot>span:nth-child(4){display:none}
  .kbr .kbsub{display:block;font-size:11px;font-weight:400;line-height:1.3}
  .kbr .kbctext{display:flex;flex-direction:column;white-space:normal}
  .kbr .kbctext>b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .kbr .kbctext .stpill{align-self:flex-start;margin:2px 0 0}
}
@container (max-width:520px){ .kbr{grid-template-columns:82px minmax(0,1fr) 80px 80px 88px;font-size:13px;gap:6px;padding:8px 10px} }

/* v0.68 Listen als abgerundete Karte mit innerer Scroll-Liste (wie Konten) */
.fitscroll.fscard{background:var(--card);border-radius:26px;box-shadow:var(--shadow);margin:0!important;padding:0!important;gap:0!important;overflow:hidden;isolation:isolate}
.fitscroll.fscard.fit{overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
.fscard>.tile,.fscard>section{background:none!important;box-shadow:none!important;border-radius:0!important;margin:0!important}
.fscard>.tile+.tile,.fscard>section+section,.fscard>.tile+section,.fscard>section+.tile{border-top:1px solid var(--line)}
.fscard>.khead{border-radius:0!important;margin-bottom:0!important}
.fscard .kbh{top:0}
.fscard>.fsnote{padding:6px 18px 16px;margin:0}
html:not(.fg) .fitscroll.fscard{border-radius:18px}

/* v0.69 Handy: Listen als abgerundete Karte mit innerer Scroll-Liste */
.mtxlist.mscard{margin:0;background:var(--card);border-radius:22px;overflow:hidden;isolation:isolate}
.mtxlist.mscard.fit{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.mscard>.mday:first-child,.mscard>.mhead:first-child{border-radius:0}
.mscard .mtx{background:transparent}
.mscard .swfront,.mscard .mtx,.fscard .swfront{background:var(--card)}
.mscard>.mday,.mscard .mday{top:0}

/* v0.69.1 Seitenleiste: Logo fixiert · Kassabuch-Tabelle mit Listen-Schrift ab iPad */
@media(min-width:768px){
  nav.bottom>.brand{position:sticky;top:-18px;z-index:5;background:inherit;margin:-18px -10px 6px;padding:18px 20px 16px!important;border-bottom:1px solid var(--line)}
  html.side-mini nav.bottom>.brand{margin-left:-8px;margin-right:-8px;padding-left:0!important;padding-right:0!important}
  .kbr{gap:10px;padding:15px 18px;font-size:17px}
  .kbr>span{line-height:1.3}
  .kbr .kbctext>b,.kbr>span>b{font-size:20px;font-weight:500}
  .kbr>.kbcno,.kbr>.kbcdate,.kbr>.kbccat,.kbopen>span{font-size:17px}
  .kbr>.r{font-size:20px;font-weight:500}
  .kbr>.r>b{font-size:20px;font-weight:600}
  .kbh{padding-top:13px;padding-bottom:13px}
  .kbh>span,.kbh>.r{font-size:14px!important;font-weight:700}
  .kbfoot>span{font-size:20px!important;font-weight:600!important}
  .kbr .stpill{font-size:12px}
  .kbr .kbsub{font-size:15px;margin-top:2px}
  @container (min-width:1001px){ .kbr{grid-template-columns:112px 116px minmax(0,2fr) minmax(0,1fr) 124px 124px 134px} }
  @container (max-width:1000px){
    .kbr{grid-template-columns:124px minmax(0,1fr) 120px 120px 132px}
    .kbr>.kbcno,.kbr>.kbccat,.kbh>span:nth-child(1),.kbh>span:nth-child(4),.kbopen>span:nth-child(1),.kbopen>span:nth-child(4),.kbfoot>span:nth-child(1),.kbfoot>span:nth-child(4){display:none}
    .kbr .kbsub{display:block;font-weight:400;line-height:1.3}
    .kbr .kbctext{display:flex;flex-direction:column;white-space:normal}
    .kbr .kbctext>b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  }
  @container (max-width:640px){
    .kbr{grid-template-columns:88px minmax(0,1fr) 74px 74px 86px;gap:8px;padding:12px 12px;font-size:15px}
    .kbr>.kbcdate,.kbopen>span{font-size:15px}
    .kbr>.r,.kbr .kbctext>b,.kbr>.r>b,.kbfoot>span{font-size:16px!important}
    .kbr .kbsub{font-size:13px}
  }
}

/* v0.70 Auswahlmenüs Kasse/Zeitraum */
.pickmenu .pickhead{display:block;padding:8px 12px 2px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.pickmenu .pickright{font-size:13px;color:var(--mut);white-space:nowrap}
.pickmenu{scrollbar-width:thin}
.kbacts{width:auto!important;flex:none;flex-wrap:nowrap;gap:4px;margin-left:6px}

/* v0.71 Listen-Box fest bis 15 px über den unteren Rand – Seite scrollt nicht mehr mit */
html.fitlock .app{min-height:0!important;padding-bottom:0!important}
html.fitlock main{padding-bottom:0!important;margin-bottom:0!important}
html.fitlock .fscard.fit,html.fitlock .mscard.fit{margin-bottom:0!important}

/* v0.72 Kopfbereich klappt beim Scrollen in der Liste ein */
html.hdrmin header.top{padding-top:10px!important;padding-bottom:4px!important}
html.hdrmin header.top h1{font-size:26px!important;line-height:1.2!important}
html.hdrmin .mpage>.mstats,html.hdrmin .mpage>.khero,html.hdrmin .ctpage>.khero,html.hdrmin .kbstats,html.hdrmin .invstats,html.hdrmin .ctpage .hero,html.hdrmin .fbstats,html.hdrmin .fbspecs{display:none!important}

/* v0.72.2 Handy: natives Scrollen mit fester Listen-Box-Optik */
html.mnat .app{padding-bottom:calc(var(--navgap,96px) + 15px)!important;min-height:0!important}
html.mnat main{padding-bottom:0!important}
.mscard.mnative{overflow:clip;isolation:auto;border-radius:22px}
.mnative .mday,.mnative .mhead{position:sticky!important;top:calc(env(safe-area-inset-top) + var(--mstk,0px))!important;z-index:2}
.mnative>.mcap{position:sticky;top:calc(env(safe-area-inset-top) + var(--mstk,0px));height:22px;margin-bottom:-22px;z-index:4;pointer-events:none;
  background:radial-gradient(circle at 100% 100%,transparent 21.5px,var(--bg) 22px) left top/22px 22px no-repeat,radial-gradient(circle at 0 100%,transparent 21.5px,var(--bg) 22px) right top/22px 22px no-repeat}
.mbotcap{position:fixed;left:0;right:0;bottom:0;z-index:3;pointer-events:none}
.mbotcap>i{position:absolute;top:0;height:22px;background:radial-gradient(circle at 100% 0,transparent 21.5px,var(--bg) 22px) left bottom/22px 22px no-repeat,radial-gradient(circle at 0 0,transparent 21.5px,var(--bg) 22px) right bottom/22px 22px no-repeat}
.mbotcap::after{content:"";position:absolute;left:0;right:0;top:22px;bottom:0;background:var(--bg)}
.mnative.fscard{overflow:clip!important;background:var(--card)}
.mnative.fscard>.tile,.mnative.fscard>section{padding-left:14px;padding-right:14px}
.msticky.mguard{height:0;min-height:0;padding:0!important;margin-top:0!important;margin-bottom:0!important;pointer-events:none;z-index:3;box-shadow:none!important;background:none!important;top:calc(env(safe-area-inset-top) + 12px)!important}
.msticky.mguard::before{content:"";position:absolute;left:0;right:0;bottom:0;height:calc(env(safe-area-inset-top) + 12px);background:var(--bg)}
.mpage>.msticky.mguard{margin-bottom:-12px!important}
@media(max-width:700px){.fbseg{top:calc(env(safe-area-inset-top) + 12px)!important}}
`;
