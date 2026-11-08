import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { loadImage, detectCorners, warp, applyFilter, toJpeg, pagesToPdf, shrinkPdf } from "./scan.js";
import { latestBalance, parseFile, withIds, categorize, detectRecurring, matchInvoices, portfolio, rowsToTransactions, FIELD_LABELS } from "./importers.js";

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
  if (CAT_STYLE[c]) return { icon: CAT_STYLE[c][0], color: CAT_STYLE[c][1] };
  if (CAT_META[c]) return { icon: CAT_META[c][0], color: CAT_META[c][1] };
  let h = 0; for (const ch of String(c)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { icon: "📁", color: PALETTE[h % PALETTE.length] };
}
const CatIcon = ({ c, size = 40 }) => {
  const m = catMeta(c);
  return <span className="caticon" style={{ width: size, height: size, background: m.color + "22", fontSize: size * 0.48 }}>{m.icon}</span>;
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
/* Ausklappbare Vorschau in der Dokumentliste */
function DocPreview({ d, onOpen }) {
  const [pages, setPages] = useState([]), [total, setTotal] = useState(0), [want, setWant] = useState(3), [err, setErr] = useState("");
  const pdfRef = useRef(null);
  useEffect(() => {
    let dead = false, url;
    (async () => {
      try {
        const b = await db.getFile(d.id); if (!b) throw new Error("Originaldatei nicht gefunden");
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
          {pages.map((src, i) => <img key={i} src={src} alt={`Seite ${i + 1}`} loading="lazy" />)}
          {(!pages.length || pages.length < Math.min(want, total || 1)) && <div className="dpload">Seite wird geladen …</div>}
        </div>
        <div className="dprevbar">
          <small className="muted">{total > 1 ? `${pages.length} von ${total} Seiten` : "1 Seite"}</small>
          <span className="grow" />
          {total > pages.length && pages.length >= want && <button className="btn sm" onClick={() => setWant(want + 5)}>Weitere Seiten</button>}
          <button className="btn sm primary" onClick={onOpen}>Öffnen</button>
        </div>
      </>}
    </div>
  );
}

const Thumb = ({ d, className = "thumb" }) => (
  <div className={className}>{d.thumb ? <img src={d.thumb} alt="" /> : <span>{d.mimeType === "application/pdf" ? "PDF" : "🖼"}</span>}</div>
);

const INTERVAL_FACTOR ={ monatlich: 1, vierteljährlich: 1 / 3, halbjährlich: 1 / 6, jährlich: 1 / 12 };
const INTERVAL_SHORT = { monatlich: "/ Monat", vierteljährlich: "/ Quartal", halbjährlich: "/ Halbjahr", jährlich: "/ Jahr" };
const TRASH_DAYS = 30;

/* ---------- IndexedDB ---------- */
const DB_NAME = "dokumente", DB_VER = 2;
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
const fmtDate = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("de-AT") : "–");
let HIDE_AMOUNTS = false; // Einstellungen → Datenschutz
const fmtMoney = (v, cur = "EUR") => HIDE_AMOUNTS && v != null && !isNaN(v) ? "€ •••" :
  v == null || isNaN(v) ? "" : new Intl.NumberFormat("de-AT", { style: "currency", currency: cur || "EUR" }).format(v);
const daysUntil = (iso) => Math.round((new Date(iso + "T12:00:00") - new Date(todayISO() + "T12:00:00")) / 864e5);
const monthKey = (d) => (d.documentDate || d.createdAt || "").slice(0, 7);
const monthLabel = (k) => new Date(k + "-15").toLocaleDateString("de-AT", { month: "short", year: "2-digit" });
const norm = (s) => String(s || "").toLowerCase();
const isEUR = (d) => (d.amount?.currency || "EUR") === "EUR";
const monthlyCost = (c) => (c?.amount && INTERVAL_FACTOR[c.interval] ? c.amount * INTERVAL_FACTOR[c.interval] : 0);
const Ico = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>);
const IcoEye = () => <Ico d={<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>} />;
const IcoEyeOff = () => <Ico d={<><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6C3.8 8.3 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="M3 3l18 18" /></>} />;
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
  const amount = doc.amount?.total != null ? ` (${fmtMoney(doc.amount.total, doc.amount.currency)})` : "";
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
  const num = (v) => (v == null ? "" : String(v).replace(".", ","));
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Datum", "Titel", "Absender", "Kategorie", "Typ", "Brutto", "Netto", "USt", "Währung", "Art", "Steuerrelevant", "Bezahlt", "Tags"];
  const rows = list.map((d) => [d.documentDate, d.title, d.sender, d.category, d.docType, num(d.amount?.total), num(d.amount?.net), num(d.amount?.vat),
    d.amount?.currency || "", d.direction || "", d.taxRelevant ? "ja" : "", d.paid ? "ja" : "", (d.tags || []).join(", ")].map(esc).join(";"));
  download(new Blob(["﻿" + [head.join(";"), ...rows].join("\r\n")], { type: "text/csv" }), name);
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
    me.name, me.address, "", c.provider || "", "", `${me.city ? me.city + ", " : ""}am ${new Date().toLocaleDateString("de-AT")}`, "",
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
const TAB_DEFS = { home: ["🏠", "Übersicht"], docs: ["📄", "Dokumente"], deadlines: ["⏰", "Fristen"], accounts: ["🏦", "Konten"], contracts: ["📑", "Verträge"], settings: ["⚙️", "Einstellungen"] };
const KIND_DEFS = { cash: ["💶", "Bargeld"], bank: ["🏦", "Girokonto"], card: ["💳", "Kreditkarte"], wallet: ["🌐", "PayPal / Online"], savings: ["🐷", "Sparkonto"], broker: ["📈", "Depot"] };
const kindIcon = (k) => (KIND_DEFS[k] || KIND_DEFS.bank)[0];
const DEFAULT_NAV = {
  tabs: [
    { key: "home", side: true, phone: true }, { key: "docs", side: true, phone: true }, { key: "deadlines", side: true, phone: false },
    { key: "accounts", side: true, phone: true }, { key: "contracts", side: true, phone: true }, { key: "settings", side: true, phone: true }
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
  n.docGroups = docGroups;
  const keys = n.tabs.map((t) => t.key);
  return { ...DEFAULT_NAV, ...n, tabs: [...n.tabs, ...DEFAULT_NAV.tabs.filter((t) => !keys.includes(t.key))] };
}
const tabLabel = (nav, key) => nav.tabs.find((t) => t.key === key)?.label?.trim() || TAB_DEFS[key][1];

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
const flattenCats = (docGroups) => [...new Set([...docGroups.flatMap((g) => g.cats), "Sonstiges"])];
// Kategorie → Bereich (wird bei jedem Rendern aus der Konfiguration gesetzt)
let CAT_AREA = { ...DEFAULT_CAT_AREA };

function DocTree({ docGroups, docs, selected, onSelect, onToggleGroup, variant = "", showEmpty = false }) {
  const count = (c) => docs.filter((d) => d.category === c).length;
  const shown = docGroups.map((g) => ({ ...g, cats: g.cats.filter((c) => showEmpty || count(c)) })).filter((g) => g.cats.length);
  if (!shown.length) return null;
  return (
    <div className={"acctree " + variant}>
      {shown.map((g, gi) => (
        <div key={g.id} className="accgroup">
          {gi > 0 && <div className="accdiv" />}
          {g.title?.trim() && (
            <button className="acctitle" onClick={() => onToggleGroup(g.id)} aria-expanded={!g.collapsed}>
              <span className={"chev" + (g.collapsed ? "" : " open")}>›</span><span className="grow">{g.title}</span>
              {g.collapsed && <small>{g.cats.reduce((s, c) => s + count(c), 0)}</small>}
            </button>
          )}
          {!g.collapsed && g.cats.map((c) => (
            <button key={c} className={"accitem" + (selected === c ? " on" : "")} onClick={() => onSelect(selected === c ? "" : c)}>
              <span className="ki">{catMeta(c).icon}</span><span className="an">{c}</span><span className="ab muted">{count(c)}</span>
            </button>
          ))}
        </div>
      ))}
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

function DocNavSettings({ nav, setNav, docs, renameCategory, deleteCategory, notify }) {
  const groups = nav.docGroups;
  const all = flattenCats(groups);
  const save = (g) => setNav((n) => ({ ...n, docGroups: g }));
  const patch = (gi, p) => save(groups.map((g, k) => (k === gi ? { ...g, ...p } : g)));
  const count = (c) => docs.filter((d) => d.category === c).length;
  const dnd = useDnd((d, over) => {
    if (d.kind === "dcat") {
      const m = moveBetween(Object.fromEntries(groups.map((g) => [g.id, g.cats])), d.list, d.index, over.list, over.index);
      save(groups.map((g) => ({ ...g, cats: m[g.id] })));
    } else if (d.kind === "dgrp") save(moveBetween({ g: groups }, "g", d.index, "g", over.index).g);
  });
  const delGroup = (gi) => {
    if (groups.length <= 1) return notify("Mindestens eine Gruppe wird gebraucht");
    const rest = groups.filter((_, k) => k !== gi), moved = groups[gi].cats;
    if (moved.length && !confirm(`Gruppe löschen? Die ${moved.length} Kategorien wandern in „${rest[0].title || "erste Gruppe"}“.`)) return;
    rest[0] = { ...rest[0], cats: [...rest[0].cats, ...moved] }; save(rest);
  };
  const addGroup = () => save([...groups, { id: "d-" + uid(), title: "Neue Gruppe", area: "sonstiges", cats: [] }]);
  const check = (old) => (t) => {
    if (!t) { notify("Der Name darf nicht leer sein"); return "leer"; }
    if (t.toLowerCase() !== old.toLowerCase() && all.some((c) => c.toLowerCase() === t.toLowerCase())) { notify("Diese Kategorie gibt es schon"); return "doppelt"; }
  };

  return (
    <fieldset className="span2">
      <legend>Dokumente – Gruppen & Kategorien</legend>
      <p className="muted small">Am Griff <b>⠿</b> ziehen, um Kategorien zu sortieren oder in eine andere Gruppe zu verschieben – auch ganze Gruppen. Die Gruppe legt fest, ob ihre Dokumente als Finanzen, Verträge oder Sonstiges zählen („Sonstiges“ fließt nicht in Übersicht und Budgets).</p>
      {groups.map((g, gi) => (
        <React.Fragment key={g.id}>
          {dnd.lineAt("dgrp", "g", gi) && <div className="dropline" />}
          <div className={"grpcfg" + (dnd.isDragging("dgrp", "g", gi) ? " dragging" : "") + (dnd.drag?.kind === "dcat" && dnd.drag.over?.list === g.id ? " dropover" : "")}
            data-dgrp-item={`g|${gi}`} data-dcat-list={`${g.id}|${g.cats.length}`}>
            <div className="grphead">
              <Handle onDown={(e) => dnd.start(e, { kind: "dgrp", list: "g", index: gi, label: `📁 ${g.title || "Gruppe"}` })} label="Gruppe verschieben" />
              <EditText className="grow" inputClass="grptitle" value={g.title || ""} placeholder="Ohne Überschrift (nur Trennlinie)" onSave={(t) => patch(gi, { title: t })} />
              <button className="iconbtn" onClick={() => delGroup(gi)} aria-label="Gruppe löschen" title="Gruppe löschen">🗑</button>
            </div>
            <div className="areapick">
              <small className="muted">zählt als</small>
              {Object.entries(AREAS).map(([k, [i, l]]) => <button key={k} className={g.area === k ? "on" : ""} onClick={() => patch(gi, { area: k })}>{i} {l}</button>)}
            </div>
            {g.cats.map((c, ci) => (
              <React.Fragment key={c}>
                {dnd.lineAt("dcat", g.id, ci) && <div className="dropline" />}
                <div className={"acccfg catrow" + (dnd.isDragging("dcat", g.id, ci) ? " dragging" : "")} data-dcat-item={`${g.id}|${ci}`}>
                  <Handle onDown={(e) => dnd.start(e, { kind: "dcat", list: g.id, index: ci, label: `${catMeta(c).icon} ${c}` })} />
                  <span className="ki">{catMeta(c).icon}</span>
                  <EditText className="grow" inputClass="catname" value={c} validate={check(c)} onSave={(t) => t !== c && renameCategory(c, t)} />
                  <small className="muted cnt" title="Dokumente">{count(c)}</small>
                  {c !== "Sonstiges"
                    ? <button className="iconbtn" aria-label="Kategorie löschen" title="Kategorie löschen"
                        onClick={() => confirm(`Kategorie „${c}“ löschen?${count(c) ? ` ${count(c)} Dokument(e) wandern nach „Sonstiges“.` : ""}`) && deleteCategory(c)}>🗑</button>
                    : <span className="iconbtn-spacer" />}
                </div>
              </React.Fragment>
            ))}
            {dnd.lineAt("dcat", g.id, g.cats.length) && <div className="dropline" />}
            {!g.cats.length && <div className="dropzone">Kategorie hierher ziehen</div>}
            <div className="acccfg addcat">
              <span className="ki">＋</span>
              <EditText className="grow" value="" resetOnSave placeholder="Neue Kategorie, z. B. „KFZ“, „Haustier“" validate={check("")}
                onSave={(t) => patch(gi, { cats: [...g.cats, t] })} />
            </div>
          </div>
        </React.Fragment>
      ))}
      {dnd.lineAt("dgrp", "g", groups.length) && <div className="dropline" />}
      <div className="actions" data-dgrp-list={`g|${groups.length}`}>
        <button className="btn" onClick={addGroup}>＋ Gruppe / Überschrift</button>
        <button className="link" onClick={() => confirm("Dokument-Gruppen auf Standard zurücksetzen? (Kategorien bleiben erhalten)") && save(buildDocGroups(all))}>Zurücksetzen</button>
      </div>
      {dnd.ghost}
    </fieldset>
  );
}

function NavSettings({ nav, setNav, accounts, setAccounts, txs, deleteAccount, notify }) {
  const [edit, setEdit] = useState(null);
  const resolved = resolveGroups(nav, accounts);
  const real = resolved.filter((g) => !g.auto);
  const saveGroups = (gs) => setNav((n) => ({ ...n, groups: gs.filter((g) => !g.auto).map(({ accounts: _a, ...g }) => ({ ...g, ids: g.ids })) }));
  const explicit = () => resolved.map((g) => ({ ...g, ids: g.accounts.map((a) => a.id) }));
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
      <fieldset className="span2">
        <legend>Seitenleiste – Reiter</legend>
        <p className="muted small">Am Griff <b>⠿</b> ziehen zum Sortieren. Namen ändern und mit ✓ übernehmen. „Leiste“ = Seitenleiste auf Tablet & Mac, „Handy“ = untere Leiste am Phone (am besten max. 5).</p>
        <div data-tab-list={`t|${nav.tabs.length}`}>
          {nav.tabs.map((t, i) => (
            <React.Fragment key={t.key}>
              {dnd.lineAt("tab", "t", i) && <div className="dropline" />}
              <div className={"navcfg" + (dnd.isDragging("tab", "t", i) ? " dragging" : "")} data-tab-item={`t|${i}`}>
                <Handle onDown={(e) => dnd.start(e, { kind: "tab", list: "t", index: i, label: `${TAB_DEFS[t.key][0]} ${tabLabel(nav, t.key)}` })} />
                <span className="ki">{TAB_DEFS[t.key][0]}</span>
                <EditText className="grow" value={t.label || ""} placeholder={TAB_DEFS[t.key][1]} onSave={(v) => patchTab(i, { label: v })} />
                <label className="mini"><input type="checkbox" checked={t.side} disabled={t.key === "settings"} onChange={(e) => patchTab(i, { side: e.target.checked })} />Leiste</label>
                <label className="mini"><input type="checkbox" checked={t.phone} disabled={t.key === "settings"} onChange={(e) => patchTab(i, { phone: e.target.checked })} />Handy</label>
              </div>
            </React.Fragment>
          ))}
          {dnd.lineAt("tab", "t", nav.tabs.length) && <div className="dropline" />}
        </div>
        <p className="muted small">Handy-Leiste: {nav.tabs.filter((t) => t.phone).length} Reiter{nav.tabs.filter((t) => t.phone).length > 5 ? " – mehr als 5 werden am Phone eng" : ""}</p>
      </fieldset>

      <fieldset className="span2">
        <legend>Konten & Gruppen</legend>
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
                      <span className="ki">{kindIcon(a.kind)}</span>
                      <button className="link grow left" onClick={() => setEdit(a)}>{a.name}{bal != null && <small className="muted"> · {fmtMoney(bal)}</small>}</button>
                      <button className="iconbtn" onClick={() => setEdit(a)} aria-label="Konto bearbeiten" title="Bearbeiten">✎</button>
                    </div>
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
      </fieldset>

      {edit && (
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
function Win({ id, onClose, children, className = "", defW, small = false }) {
  const wide = useMedia("(min-width:768px)");
  const [rect, setRect] = useState(() => clampRect(ls.get("win:" + id, null) || defaultRect(defW, small)));
  const [z, setZ] = useState(() => ++winZ);
  useEffect(() => { const t = setTimeout(() => ls.set("win:" + id, rect), 150); return () => clearTimeout(t); }, [rect, id]);
  useEffect(() => { const h = () => setRect((r) => clampRect(r)); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);

  if (!wide) return (
    <div className={"sheet " + className} onClick={onClose}>
      <div className={"panel" + (small ? " small-panel" : "")} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
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
    <div className={"win " + className} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z }} onPointerDown={onHead}>
      <div className="wininner">{children}</div>
      {["n", "e", "s", "w", "ne", "se", "sw", "nw"].map((d) => <span key={d} className={"rz rz-" + d} onPointerDown={edge(d)} />)}
      <span className="rzgrip" aria-hidden="true" />
    </div>
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

function AccountTree({ groups, txs, selected, onSelect, onToggleGroup, variant = "" }) {
  const shown = groups.filter((g) => g.accounts.length);
  if (!shown.length) return null;
  return (
    <div className={"acctree " + variant}>
      {shown.map((g, gi) => (
        <div key={g.id} className="accgroup">
          {gi > 0 && <div className="accdiv" />}
          {g.title?.trim() && (
            <button className="acctitle" onClick={() => onToggleGroup(g.id)} aria-expanded={!g.collapsed}>
              <span className={"chev" + (g.collapsed ? "" : " open")}>›</span><span className="grow">{g.title}</span>
              {g.collapsed && <small>{g.accounts.length}</small>}
            </button>
          )}
          {!g.collapsed && g.accounts.map((a) => {
            const bal = accountBalance(a, txs);
            return (
              <button key={a.id} className={"accitem" + (selected === a.id ? " on" : "")} onClick={() => onSelect(selected === a.id ? "" : a.id)}>
                <span className="ki">{kindIcon(a.kind)}</span><span className="an">{a.name}</span>
                {bal != null ? <span className={"ab" + (bal < 0 ? " red" : "")} title={balEstimated(a) ? "Aus Umsätzen berechnet – für den genauen Stand Kontostand eintragen oder Import mit Saldo-Spalte" : undefined}>{balEstimated(a) && <i className="est">≈</i>}{fmtMoney(bal)}</span>
                  : <span className="ab muted" title="Kontostand unbekannt – im Konto eintragen oder per Import mit Saldo übernehmen">—</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ---------- Einstellungen: Seitenleiste & Kontengruppen ---------- */
/* ============================================================ */

export default function App() {
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
  const toggleDocGroup = (id) => setNav((n) => ({ ...n, docGroups: n.docGroups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)) }));
  const [selAcc, setSelAcc] = useState("");
  const [docAreaSel, setDocAreaSel] = useState(() => ls.get("docArea", "alle"));
  const [manualTx, setManualTx] = useState(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(() => ls.get("hideAmounts", false));
  const [themeMode, setThemeMode] = useState(() => ls.get("theme", "auto"));
  const [theme, setTheme] = useState(() => effectiveTheme(ls.get("theme", "auto")));
  const [newAccReq, setNewAccReq] = useState(false);
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
  const fixExtra = confirmedSubs.reduce((s, r) => s + r.amount * (INTERVAL_FACTOR[r.interval] || 0), 0);

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
      list = list.map((x) => (x.counterparty?.toLowerCase().includes(match) ? { ...x, category: t.category } : x));
    }
    setTxs(list); await db.putTxs(list.filter((x) => x.id === t.id || (applyRule && x.counterparty?.toLowerCase().includes(t.counterparty.toLowerCase()))));
  }
  // Kategorie umbenennen/löschen: Dokumente, Umsätze, Budgets, Regeln mitziehen
  async function renameCategory(from, to) {
    const m = catMeta(from);
    setNav((n) => ({ ...n, catStyle: { ...(n.catStyle || {}), [to]: [m.icon, m.color] }, docGroups: n.docGroups.map((g) => ({ ...g, cats: g.cats.map((c) => (c === from ? to : c)) })) }));
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
        body: JSON.stringify({ data, mediaType: send.type, categories, today: todayISO(),
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
        amount: j.amount && j.amount.total != null ? { ...j.amount, currency: j.amount.currency || "EUR" } : null,
        direction: j.direction || "keine",
        area: ["finanzen", "vertraege", "sonstiges"].includes(j.area) ? j.area : undefined,
        taxRelevant: !!j.tax_relevant,
        payment: j.payment?.iban ? j.payment : null,
        contract: c?.provider ? {
          provider: c.provider, name: c.name || "", customerNumber: c.customer_number || "", amount: c.amount ?? null,
          interval: c.interval || "", startDate: c.start_date || "", endDate: c.end_date || "", noticePeriod: c.notice_period || "",
          cancelBy: c.cancel_by || "", active: true
        } : null,
        deadlines: (j.deadlines || []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date)).map((x) => ({ id: uid(), date: x.date, label: x.label, done: false })),
        paid: false
      });
      await saveDoc(done);
      if (doc.payCash && done.amount?.total && done.direction !== "einnahme") await bookCash({ ...done, direction: "ausgabe" });
    } catch (e) {
      await saveDoc({ ...doc, status: "error", error: e.message });
    }
  }

  async function onFiles(list, opts = {}) {
    const files = [...list];
    for (const f of files) {
      let blob;
      try { blob = await prepareFile(f); } catch (e) { notify(`${f.name}: ${e.message}`); continue; }
      if (blob.size > 3.6 * 1024 * 1024) notify(`${f.name}: ${(blob.size / 1048576).toFixed(0)} MB – wird zum Auslesen automatisch verkleinert`);
      const doc = {
        id: uid(), createdAt: new Date().toISOString(), fileName: f.name, mimeType: blob.type, size: blob.size,
        title: f.name, category: "Sonstiges", tags: [], deadlines: [], amount: null, paid: false, notes: "", status: "processing",
        ...(opts.cash ? { payCash: true } : {}), ...(opts.scanned ? { scanned: true } : {})
      };
      try { doc.thumb = await makeThumb(blob); } catch {}
      await db.putFile(doc.id, blob);
      await saveDoc(doc);
      queue.current = queue.current.then(() => analyze(doc, blob));
    }
    if (files.length) setTab("docs");
  }
  async function reanalyze(doc) {
    const blob = await db.getFile(doc.id);
    if (!blob) return notify("Datei nicht gefunden");
    queue.current = queue.current.then(() => analyze(doc, blob));
  }

  const openDoc = docs.find((d) => d.id === openId);
  const groups = resolveGroups(nav, accounts);
  const toggleGroup = (id) => setNav((n) => ({ ...n, groups: n.groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)) }));
  const areaCounts = Object.fromEntries(Object.keys(AREAS).map((k) => [k, active.filter((d) => docArea(d) === k).length]));

  return (
    <div className={"app tab-" + tab}>
      <style>{CSS}</style>
      <header className="top">
        <h1>{tabLabel(nav, tab)}</h1>
        <div className="topicons">
          <button className="eyebtn" onClick={() => setHideAmounts(!hideAmounts)} aria-label={hideAmounts ? "Beträge anzeigen" : "Beträge ausblenden"} title={hideAmounts ? "Beträge anzeigen" : "Beträge ausblenden"}>{hideAmounts ? <IcoEyeOff /> : <IcoEye />}</button>
          <button className="eyebtn" onClick={() => setThemeMode(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Tagmodus" : "Nachtmodus"} title={theme === "dark" ? "Tagmodus" : "Nachtmodus"}>{theme === "dark" ? <IcoSun /> : <IcoMoon />}</button>
        </div>
        <div className="addbtn">
          <button className={"btn primary addplus" + (fabOpen ? " open" : "")} onClick={() => setFabOpen(!fabOpen)} aria-label="Hinzufügen" aria-expanded={fabOpen} title="Hinzufügen">＋</button>
        </div>
      </header>

      <main>
        {tab === "home" && <Home docs={active} txs={txs} budgets={budgets} onOpen={setOpenId} setTab={setTab} fixExtra={fixExtra} hasCash={accounts.some((a) => a.kind === "cash")}
          accounts={accounts} onManual={setManualTx} openAccount={(id) => { setSelAcc(id); setTab("accounts"); }} />}
        {tab === "accounts" && <Accounts txs={txs} accounts={accounts} setAccounts={setAccounts} importTxs={importTxs} updateTx={updateTx}
          deleteAccount={deleteAccount} categories={categories} docs={active} onOpen={setOpenId} token={token} notify={notify}
          recurring={recurring} subs={subs} setSubs={setSubs} onManual={setManualTx} deleteTx={deleteTx}
          acc={selAcc} setAcc={setSelAcc} groups={groups} toggleGroup={toggleGroup} newAccReq={newAccReq} clearNewAccReq={() => setNewAccReq(false)} />}
        {tab === "docs" && <DocList reanalyze={reanalyze} docs={active} categories={categories} onOpen={setOpenId} area={docAreaSel} setArea={setDocAreaSel}
          cat={docCat} setCat={setDocCat} docGroups={nav.docGroups} toggleDocGroup={toggleDocGroup} />}
        {tab === "deadlines" && <Deadlines docs={active} onOpen={setOpenId} saveDoc={saveDoc} />}
        {tab === "contracts" && <Contracts docs={active} onOpen={setOpenId} me={me} notify={notify} extra={confirmedSubs} />}
        {tab === "settings" && (
          <Settings themeMode={themeMode} setThemeMode={setThemeMode} importTxs={importTxs} hideAmounts={hideAmounts} setHideAmounts={setHideAmounts} nav={nav} setNav={setNav} deleteAccount={deleteAccount} renameCategory={renameCategory} deleteCategory={deleteCategory} txs={txs} setTxs={setTxs} accounts={accounts} setAccounts={setAccounts} rules={rules} setRules={setRules} setTab={setTab} categories={categories} setCategories={setCategories} budgets={budgets} setBudgets={setBudgets}
            me={me} setMe={setMe} token={token} setToken={setToken}
            docs={docs} setDocs={setDocs} saveDoc={saveDoc} purgeDoc={purgeDoc} notify={notify} />
        )}
      </main>

      <input ref={fileInput} type="file" accept="application/pdf,image/*" multiple hidden
        onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      {fabOpen && <div className="fabmenu-bg" onClick={() => setFabOpen(false)} />}
      {fabOpen && (
        <div className="fabmenu" role="menu">
          <button role="menuitem" onClick={() => { setFabOpen(false); setScanOpen(true); }}><span>📷</span><div><b>Scannen</b><small>Bon oder Rechnung fotografieren</small></div></button>
          <button role="menuitem" onClick={() => { setFabOpen(false); fileInput.current.click(); }}><span>📄</span><div><b>Datei / Foto</b><small>PDF oder Bild hochladen</small></div></button>
          <button role="menuitem" onClick={() => { setFabOpen(false); setManualTx(tab === "accounts" && selAcc ? { accountId: selAcc } : {}); }}><span>💶</span><div><b>Buchung</b><small>Barausgabe oder Buchung erfassen</small></div></button>
          <button role="menuitem" onClick={() => { setFabOpen(false); setTab("accounts"); setNewAccReq(true); }}><span>🏦</span><div><b>Konto anlegen</b><small>Girokonto, Karte, Sparkonto, Bargeld …</small></div></button>
        </div>
      )}
      <button className={"fab" + (fabOpen ? " open" : "")} onClick={() => setFabOpen(!fabOpen)} aria-label="Hinzufügen">＋</button>
      {scanOpen && <Scanner onClose={() => setScanOpen(false)} onDone={(file, o) => { setScanOpen(false); onFiles([file], { ...o, scanned: true }); }} />}
      {manualTx && <ManualTxSheet init={manualTx} accounts={accounts} categories={TX_CATS(categories)} onClose={() => setManualTx(null)}
        onSave={async (t) => { await addManualTx(t); setManualTx(null); notify("Buchung gespeichert"); }} />}

      <nav className="bottom">
        <div className="brand"><img src="/icon.svg" alt="" /><div><b>Fido</b><small>Finanzen & Dokumente</small></div></div>
        {nav.tabs.filter((t) => t.side || t.phone).map((t) => {
          const sub = (t.key === "accounts" && accounts.length) || (t.key === "docs" && active.length);
          const open = t.key === "accounts" ? nav.accOpen : nav.docsOpen;
          const flag = t.key === "accounts" ? "accOpen" : "docsOpen";
          return (
            <React.Fragment key={t.key}>
              <button className={(tab === t.key ? "on" : "") + (t.phone ? "" : " ph-hide") + (t.side ? "" : " side-hide")}
                onClick={() => { setTab(t.key); if (t.key === "accounts") setSelAcc(""); if (t.key === "docs") { setDocAreaSel("alle"); setDocCat(""); } }} aria-label={tabLabel(nav, t.key)}>
                <span>{TAB_DEFS[t.key][0]}</span>{tabLabel(nav, t.key)}
                {t.key === "home" && <Badge docs={active} />}
                {sub && <i className={"subtog side-only" + (open ? " open" : "")} role="button" aria-label="ein-/ausklappen"
                  onClick={(e) => { e.stopPropagation(); setNav((n) => ({ ...n, [flag]: !n[flag] })); }}>›</i>}
              </button>
              {t.key === "accounts" && t.side && nav.accOpen && accounts.length > 0 && (
                <div className="subnav side-only">
                  <AccountTree groups={groups} txs={txs} selected={tab === "accounts" ? selAcc : ""} onToggleGroup={toggleGroup}
                    onSelect={(id) => { setSelAcc(id); setTab("accounts"); }} />
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
      </nav>

      <SideResizer />
      {openDoc && (
        <Detail doc={openDoc} categories={categories} onClose={() => setOpenId(null)} bookCash={bookCash}
          saveDoc={saveDoc} trashDoc={trashDoc} reanalyze={reanalyze} notify={notify} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
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
function Home({ docs, txs, budgets, onOpen, setTab, fixExtra, hasCash, accounts = [], onManual, openAccount }) {
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
    l.filter((d) => d.direction === "ausgabe").forEach((d) => { byCat[d.category] = (byCat[d.category] || 0) + d.amount.total; });
    return { out: l.filter((d) => d.direction === "ausgabe").reduce((s, d) => s + d.amount.total, 0), inc: l.filter((d) => d.direction === "einnahme").reduce((s, d) => s + d.amount.total, 0), byCat };
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
  const upcoming = docs.flatMap((doc) => (doc.deadlines || []).filter((x) => !x.done).map((dl) => [dl, doc]))
    .sort((a, b) => a[0].date.localeCompare(b[0].date)).slice(0, 4);
  const out = sumBy(thisMonth, "ausgabe"), inc = sumBy(thisMonth, "einnahme");
  const monthName = new Date(thisMonth + "-15").toLocaleDateString("de-AT", { month: "long" });

  return (
    <div className="dash">
      <div className="hero">
        <small>Saldo {monthName}</small>
        <div className="hero-v">{(inc - out >= 0 ? "+" : "") + fmtMoney(inc - out)}</div>
        <div className="hero-row">
          <div><small>Einnahmen</small><b>↑ {fmtMoney(inc)}</b></div>
          <div><small>Ausgaben</small><b>↓ {fmtMoney(out)}</b></div>
          <div onClick={() => setTab("contracts")}><small>Fixkosten</small><b>{fmtMoney(fix)}</b></div>
        </div>
      </div>

      {!!openInv.length && (
        <div className="tile alert" onClick={() => setTab("deadlines")}>
          <CatIcon c="Rechnungen" size={36} />
          <div className="grow"><b>{openInv.length} offene Rechnung{openInv.length > 1 ? "en" : ""}</b><small>Jetzt prüfen und per QR bezahlen</small></div>
          <b>{fmtMoney(openInv.reduce((s, d) => s + d.amount.total, 0))}</b>
        </div>
      )}

      {!!bankAccs.length && (
        <section className="tile">
          <div className="tilehead"><b>Konten</b><small>{bankTotal != null ? (bankAccs.some(balEstimated) ? "≈ " : "") + fmtMoney(bankTotal) : ""}</small></div>
          {bankAccs.map((a) => { const bal = accountBalance(a, txs); return (
            <div key={a.id} className="frow click" onClick={() => openAccount(a.id)}>
              <span className="caticon" style={{ width: 40, height: 40, background: "#0b63f622", fontSize: 20 }}>{kindIcon(a.kind)}</span>
              <div className="grow"><b>{a.name}</b><small className="muted block">{balEstimated(a) ? "aus Umsätzen berechnet" : a.openingDate ? "Stand " + fmtDate(a.openingDate) + " + neuere Buchungen" : "Kontostand"}</small></div>
              <div className="right"><b className={bal < 0 ? "red" : ""}>{bal != null ? (balEstimated(a) ? "≈ " : "") + fmtMoney(bal) : "—"}</b></div>
            </div>); })}
        </section>
      )}

      {!!cashAccs.length && (
        <section className="tile">
          <div className="tilehead"><b>Bargeld</b><button className="link" onClick={() => onManual({ accountId: cashAccs[0].id })}>＋ Barausgabe</button></div>
          {cashAccs.map((a) => (
            <div key={a.id} className="frow click" onClick={() => openAccount(a.id)}>
              <span className="caticon" style={{ width: 40, height: 40, background: "#16a34a22", fontSize: 20 }}>💶</span>
              <div className="grow"><b>{a.name}</b><small className="muted block">{txs.filter((t) => t.accountId === a.id).length} Buchungen{a.atm ? " · inkl. Bankomat-Behebungen" : ""}</small></div>
              <div className="right"><b className={cashBalance(a, txs) < 0 ? "red" : ""}>{fmtMoney(cashBalance(a, txs))}</b><small className="muted block">Bestand</small></div>
            </div>
          ))}
          {cashBalance(cashAccs[0], txs) < 0 && <p className="warn small">Bestand negativ – vermutlich fehlt eine Behebung oder der Startbestand.</p>}
        </section>
      )}

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

      {!!budgetRows.length && (
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
      )}

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
      {!docs.length && <div className="empty"><div style={{ fontSize: 48 }}>📥</div><p>Tippe auf <b>＋</b> und füge dein erstes Dokument hinzu.</p></div>}
    </div>
  );
}

/* ---------- Dokumente (Docutain-Look) ---------- */
function DocList({ reanalyze, docs, categories, onOpen, area = "alle", setArea, cat, setCat, docGroups, toggleDocGroup }) {
  const [q, setQ] = useState("");
  const [prevId, setPrevId] = useState(null);
  const [tag, setTag] = useState("");
  const [year, setYear] = useState("");
  const [sort, setSort] = useState("date");
  const [taxOnly, setTaxOnly] = useState(false);
  const [unpaid, setUnpaid] = useState(false);
  const [view, setView] = useState(() => ls.get("view", "list"));
  useEffect(() => ls.set("view", view), [view]);

  const tags = useMemo(() => [...new Set(docs.flatMap((d) => d.tags || []))].sort(), [docs]);
  const years = useMemo(() => [...new Set(docs.map((d) => monthKey(d).slice(0, 4)).filter(Boolean))].sort().reverse(), [docs]);

  const list = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    return docs
      .filter((d) => (area === "alle" || docArea(d) === area) && (!cat || d.category === cat) && (!tag || (d.tags || []).includes(tag)) && (!year || monthKey(d).startsWith(year)) &&
        (!taxOnly || d.taxRelevant) && (!unpaid || (d.direction === "ausgabe" && d.amount?.total && !d.paid)))
      .filter((d) => { if (!terms.length) return true; const h = haystack(d); return terms.every((t) => h.includes(t)); })
      .sort((a, b) => sort === "amount" ? (b.amount?.total || 0) - (a.amount?.total || 0)
        : (b.documentDate || b.createdAt).localeCompare(a.documentDate || a.createdAt));
  }, [docs, q, cat, tag, year, sort, taxOnly, unpaid, area]);

  const counts = useMemo(() => Object.fromEntries(categories.map((c) => [c, docs.filter((d) => d.category === c).length])), [docs, categories]);
  const amt = (d) => d.amount?.total != null && (
    <span className={"amt" + (d.direction === "einnahme" ? " ok" : d.paid ? " paid" : "")}>{d.direction === "einnahme" ? "+" : ""}{fmtMoney(d.amount.total, d.amount.currency)}</span>);
  const status = (d) => d.status === "processing" ? <span className="muted small">⏳ wird analysiert …</span> : d.status === "error" ? <span className="err">⚠️ {d.error}{reanalyze && <button className="retry" onClick={(e) => { e.stopPropagation(); reanalyze(d); }}>↻ Neu analysieren</button>}</span> : null;

  return (
    <>
      <div className="searchbar">
        <span>🔍</span>
        <input placeholder="Dokumente durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
        <button className="iconbtn" onClick={() => setView(view === "list" ? "grid" : "list")} aria-label="Ansicht">{view === "list" ? "▦" : "☰"}</button>
      </div>

      <div className="seg areaseg">
        {[["alle", "Alle", docs.length], ...Object.entries(AREAS).map(([k, [i, l]]) => [k, `${i} ${l}`, docs.filter((d) => docArea(d) === k).length])].map(([k, l, n]) => (
          <button key={k} className={area === k ? "on" : ""} onClick={() => setArea(k)}>{l} <small>{n}</small></button>
        ))}
      </div>
      {area === "sonstiges" && <p className="muted small" style={{ margin: "4px 2px 8px" }}>Dokumente in „Sonstiges“ zählen nicht in Übersicht, Budgets und Auswertungen.</p>}
      {!!docs.length && (
        <div className="tile mobile-only accphone">
          <DocTree docGroups={docGroups} docs={docs} selected={cat} onSelect={setCat} onToggleGroup={toggleDocGroup} variant="card" />
        </div>
      )}
      <div className="chips">
        {cat && <button className="chip on" onClick={() => setCat("")}>✕ {catMeta(cat).icon} {cat}</button>}
        <button className={taxOnly ? "chip on" : "chip"} onClick={() => setTaxOnly(!taxOnly)}>🧾 Steuerrelevant</button>
        <button className={unpaid ? "chip on" : "chip"} onClick={() => setUnpaid(!unpaid)}>💶 Unbezahlt</button>
        <select className="chip" value={year} onChange={(e) => setYear(e.target.value)}><option value="">Alle Jahre</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
        <select className="chip" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Alle Tags</option>{tags.map((t) => <option key={t}>{t}</option>)}</select>
        <select className="chip" value={sort} onChange={(e) => setSort(e.target.value)}><option value="date">Neueste</option><option value="amount">Betrag</option></select>
        <button className="chip" disabled={!list.length} onClick={() => exportCsv(list, `dokumente${year ? "-" + year : ""}${taxOnly ? "-steuer" : ""}.csv`)}>⬇︎ CSV</button>
      </div>
      <div className="sumbar">{list.length} Dokument{list.length === 1 ? "" : "e"}</div>

      {!docs.length && (
        <div className="empty"><div style={{ fontSize: 48 }}>📥</div>
          <p>Noch keine Dokumente.<br />Tippe auf <b>＋</b>, um ein PDF oder Foto hinzuzufügen – Claude sortiert, verschlagwortet und liest Beträge, Fristen &amp; Verträge aus.</p></div>
      )}

      {view === "grid" ? (
        <div className="grid">
          {list.map((d) => (
            <div key={d.id} className="gcard" onClick={() => onOpen(d.id)}>
              <Thumb d={d} className="gthumb" />
              <div className="gbody">
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
            <div className="ditem" onClick={() => onOpen(d.id)}>
              <Thumb d={d} />
              <div className="grow">
                <div className="row1"><b className="clamp">{d.title}</b>{amt(d)}</div>
                <small className="muted block">{d.sender ? d.sender + " · " : ""}{fmtDate(d.documentDate)}</small>
                <div className="labels">
                  <Label c={d.category} />
                  {d.taxRelevant && <span className="label tax">Steuer</span>}
                  {d.contract && <span className="label">Vertrag</span>}
                  {(d.tags || []).slice(0, 2).map((t) => <span key={t} className="label tag">#{t}</span>)}
                </div>
                {status(d)}
              </div>
              <button className={"prevbtn" + (prevId === d.id ? " on" : "")} title={prevId === d.id ? "Vorschau schließen" : "Vorschau anzeigen"} aria-expanded={prevId === d.id}
                onClick={(e) => { e.stopPropagation(); setPrevId(prevId === d.id ? null : d.id); }}><IcoChev open={prevId === d.id} /></button>
            </div>
            {prevId === d.id && <DocPreview d={d} onOpen={() => onOpen(d.id)} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Fristen ---------- */
function Deadlines({ docs, onOpen, saveDoc }) {
  const [showDone, setShowDone] = useState(false);
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
      <div className="filters">
        <button className="btn" onClick={() => downloadIcs(items.filter(([dl]) => !dl.done), "fristen.ics")} disabled={!items.length}>📅 Alle in Kalender</button>
        <label className="check"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Erledigte zeigen</label>
      </div>
      {!items.length && <div className="empty"><p>Keine offenen Fristen 🎉</p></div>}
      {groups.map(([name, g]) => !!g.length && (
        <section key={name}>
          <h3 className={name === "Überfällig" ? "red" : ""}>{name}</h3>
          <ul className="list">
            {g.map(([dl, doc]) => {
              const n = daysUntil(dl.date);
              return (
                <li key={dl.id} className={dl.done ? "done" : ""}>
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
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
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
function Contracts({ docs, onOpen, me, notify, extra = [] }) {
  const [letterFor, setLetterFor] = useState(null);
  useEsc(() => letterFor && setLetterFor(null));
  const list = activeContracts(docs).sort((a, b) => monthlyCost(b.contract) - monthlyCost(a.contract));
  const ended = docs.filter((d) => d.contract && d.contract.active === false);
  const month = list.reduce((s, d) => s + monthlyCost(d.contract), 0) + extra.reduce((s, r) => s + r.amount * (INTERVAL_FACTOR[r.interval] || 0), 0);
  const soon = list.filter((d) => d.contract.cancelBy && daysUntil(d.contract.cancelBy) >= 0 && daysUntil(d.contract.cancelBy) <= 60);
  const letter = letterFor ? cancelLetter(letterFor.contract, me) : "";

  return (
    <div className="dash">
      <div className="hero">
        <small>Fixkosten pro Monat</small>
        <div className="hero-v">{fmtMoney(month)}</div>
        <div className="hero-row">
          <div><small>Pro Jahr</small><b>{fmtMoney(month * 12)}</b></div>
          <div><small>Verträge</small><b>{list.length + extra.length}</b></div>
          <div><small>Bald kündbar</small><b>{soon.length}</b></div>
        </div>
      </div>

      {!list.length && <div className="empty"><p>Noch keine Verträge erkannt.<br />Lade einen Vertrag, eine Polizze oder eine Abo-Rechnung hoch.</p></div>}

      {!!list.length && (
        <section className="tile">
          <div className="tilehead"><b>Vertragsordner</b><small>nach Kosten</small></div>
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
                  <button className="link" onClick={() => setLetterFor(d)}>Kündigen ›</button>
                </div>
              </div>
            );
          })}
        </section>
      )}
      {!!extra.length && (
        <section className="tile">
          <div className="tilehead"><b>Aus Kontoumsätzen</b><small>bestätigte Abos</small></div>
          {extra.map((r) => (
            <div key={r.key} className="frow">
              <CatIcon c={r.category || "Sonstiges"} />
              <div className="grow"><b>{r.name}</b><small className="muted block">{r.count}× gebucht · zuletzt {fmtDate(r.last)}</small></div>
              <div className="right"><b>{fmtMoney(r.amount)}</b><small className="muted block">{(INTERVAL_SHORT[r.interval] || "").replace("/ ", "")}</small></div>
            </div>
          ))}
        </section>
      )}
      {!!ended.length && <p className="muted small" style={{ marginTop: 16 }}>{ended.length} beendete Verträge (im Dokument unter „Vertrag / Abo“ abgewählt)</p>}

      {letterFor && (
        <Win id="letter" onClose={() => setLetterFor(null)}>
            <div className="panelhead"><button className="link" onClick={() => setLetterFor(null)}>‹ Zurück</button><b>Kündigung</b><span /></div>
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

function Accounts({ txs, accounts, setAccounts, importTxs, updateTx, deleteAccount, categories, docs, onOpen, token, notify, recurring, subs, setSubs, onManual, deleteTx, acc, setAcc, groups, toggleGroup, newAccReq, clearNewAccReq }) {
  const [newAcc, setNewAcc] = useState(false);
  useEffect(() => { if (newAccReq) { setNewAcc(true); clearNewAccReq(); } }, [newAccReq]);
  const cashAccs = accounts.filter((a) => a.kind === "cash");
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("");
  const [imp, setImp] = useState(null);
  const [txOpen, setTxOpen] = useState(null);
  const [limit, setLimit] = useState(150);
  const fileRef = useRef();

  const scoped = useMemo(() => (acc ? txs.filter((t) => t.accountId === acc) : txs), [txs, acc]);
  const pf = useMemo(() => portfolio(scoped), [scoped]);
  const months = useMemo(() => [...new Set(scoped.map((t) => t.date.slice(0, 7)))].sort().reverse(), [scoped]);
  const list = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    return scoped.filter((t) => (!month || t.date.startsWith(month)) &&
      (!terms.length || terms.every((w) => norm(`${t.counterparty} ${t.purpose} ${t.category} ${t.security || ""} ${t.isin || ""} ${String(t.amount).replace(".", ",")}`).includes(w))))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [scoped, q, month]);
  const bank = list.filter((t) => t.kind !== "broker" && t.category !== "Umbuchung" && !(cashAccs.length && t.category === "Bargeld"));
  const inc = bank.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const out = bank.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const pending = recurring.filter((r) => !subs.confirmed.includes(r.key) && !subs.dismissed.includes(r.key));
  const accName = (id) => accounts.find((a) => a.id === id)?.name || "Konto";
  const [editAcc, setEditAcc] = useState(null);
  const selA = accounts.find((a) => a.id === acc);
  const selBal = selA ? accountBalance(selA, txs) : null;
  const knownBal = accounts.map((a) => accountBalance(a, txs)).filter((x) => x != null);

  async function onPick(file) {
    if (!file) return;
    try { setImp({ file, result: await parseFile(file, ls.get("mappings", {})) }); }
    catch (e) { notify("Datei nicht lesbar: " + e.message); }
  }

  const dayGroups = [];
  for (const t of list.slice(0, limit)) { const g = dayGroups[dayGroups.length - 1]; if (g && g.date === t.date) g.items.push(t); else dayGroups.push({ date: t.date, items: [t] }); }

  return (
    <div className="split">
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

      {pf.count > 0 && (
        <section className="tile">
          <div className="tilehead"><b>Depot</b><small>{pf.positions.length} Positionen</small></div>
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
      )}

      </aside>
      <div className="maincol">
      <div className="hero">
        {selA ? <>
          <small>Kontostand · {selA.name}</small>
          <div className="hero-v">{selBal != null ? (balEstimated(selA) ? "≈ " : "") + fmtMoney(selBal) : "—"}</div>
          {balEstimated(selA) && <button className="herolink" onClick={() => setEditAcc(selA)}>{selBal != null ? "aus Umsätzen berechnet · Kontostand eintragen ›" : "Kontostand eintragen ›"}</button>}
        </> : <>
          <small>Gesamtstand · {knownBal.length} von {accounts.length} Konten</small>
          <div className="hero-v">{knownBal.length ? (accounts.some(balEstimated) ? "≈ " : "") + fmtMoney(knownBal.reduce((s, x) => s + x, 0)) : "—"}</div>
        </>}
        <div className="hero-row">
          <div><small>Eingänge{month ? " " + monthLabel(month) : ""}</small><b>↑ {fmtMoney(inc)}</b></div>
          <div><small>Ausgänge{month ? " " + monthLabel(month) : ""}</small><b>↓ {fmtMoney(out)}</b></div>
          <div><small>Buchungen</small><b>{list.length}</b></div>
        </div>
      </div>
      {!!accounts.length && (
        <div className="tile mobile-only accphone">
          <AccountTree groups={groups} txs={txs} selected={acc} onSelect={setAcc} onToggleGroup={toggleGroup} variant="card" />
        </div>
      )}
      {!!accounts.length && (
        <div className="chips">
          <button className={!acc ? "chip on" : "chip"} onClick={() => setAcc("")}>{acc ? "✕ " + accName(acc) : "Alle Konten"}</button>
          {selA && <button className="chip" onClick={() => setEditAcc(selA)}>✎ Konto bearbeiten</button>}
          <select className="chip" value={month} onChange={(e) => setMonth(e.target.value)}><option value="">Alle Monate</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
        </div>
      )}
      {!txs.length && (
        <div className="empty"><div style={{ fontSize: 48 }}>🏦</div>
          <p>Noch keine Umsätze.<br />Exportiere deine Umsätze im Online-Banking oder beim Broker (CSV, CAMT, MT940 …) oder nimm einfach den PDF-Kontoauszug – und importiere die Datei hier. Für Bargeld legst du ein Konto „Geldbörse“ an.</p></div>
      )}

      {!!txs.length && <div className="searchbar"><span>🔍</span><input type="search" placeholder="Umsätze durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} /></div>}

      {dayGroups.map((g) => (
        <section key={g.date}>
          <h3>{new Date(g.date + "T12:00").toLocaleDateString("de-AT", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</h3>
          <div className="dlist">
            {g.items.map((t) => (
              <div key={t.id} className="ditem center" onClick={() => setTxOpen(t)}>
                {t.kind === "broker" ? <span className="caticon" style={{ width: 40, height: 40, background: "#14b8a622", fontSize: 18 }}>📈</span> : <CatIcon c={t.category} />}
                <div className="grow">
                  <b className="clamp">{t.kind === "broker" ? (t.isin ? `${t.type} · ${t.security || t.isin}` : t.type) : t.counterparty || t.purpose || t.bookingText || "Buchung"}</b>
                  <small className="muted block one">{t.kind === "broker" ? (t.shares ? `${Math.abs(t.shares).toLocaleString("de-AT")} Stk.` : "Depot") : t.category}{t.docId ? " · 📎 Beleg" : ""}{!acc && accounts.length > 1 ? " · " + accName(t.accountId) : ""}</small>
                </div>
                <b className={"amt" + (t.amount > 0 ? " ok" : "")}>{t.amount > 0 ? "+" : ""}{fmtMoney(t.amount, t.currency)}</b>
              </div>
            ))}
          </div>
        </section>
      ))}
      {list.length > limit && <button className="btn" style={{ width: "100%", marginTop: 12 }} onClick={() => setLimit(limit + 300)}>Mehr laden ({list.length - limit})</button>}
      {acc && <button className="link red" style={{ marginTop: 16 }} onClick={() => confirm(`Konto „${accName(acc)}“ samt Umsätzen löschen?`) && (deleteAccount(acc), setAcc(""))}>Konto löschen</button>}

      </div>
      {editAcc && <AccountSheet init={editAcc} txs={txs} hasAtmAccount={cashAccs.some((a) => a.atm && a.id !== editAcc.id)} onClose={() => setEditAcc(null)}
        onSave={(a) => { setAccounts((l) => l.map((x) => (x.id === a.id ? a : x))); setEditAcc(null); notify("Konto gespeichert"); }} />}
      {newAcc && <AccountSheet txs={txs} hasAtmAccount={cashAccs.some((a) => a.atm)} onClose={() => setNewAcc(false)} onSave={(a) => { setAccounts((l) => [...l, a]); setNewAcc(false); setAcc(a.id); notify(`Konto „${a.name}“ angelegt`); }} />}
      {imp && <ImportSheet imp={imp} accounts={accounts} setAccounts={setAccounts} importTxs={importTxs} token={token} notify={notify} onClose={() => setImp(null)} />}
      {txOpen && <TxSheet deleteTx={deleteTx} t={txOpen} categories={TX_CATS(categories)} docs={docs} onOpen={(id) => { setTxOpen(null); onOpen(id); }} updateTx={updateTx} onClose={() => setTxOpen(null)} accName={accName} />}
    </div>
  );
}

function ImportSheet({ imp, accounts, setAccounts, importTxs, token, notify, onClose }) {
  useEsc(onClose);
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
    <Win id="import" onClose={onClose}>
        <div className="panelhead"><button className="link" onClick={onClose}>Abbrechen</button><b>Import</b>
          <button className="btn primary" disabled={busy || !txs.length} onClick={doImport}>Importieren</button></div>

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
                <b className={"amt" + (t.amount > 0 ? " ok" : "")}>{fmtMoney(t.amount, t.currency)}</b>
              </div>
            ))}
            {txs.length > 8 && <p className="muted small">… und {txs.length - 8} weitere</p>}
          </fieldset>
        )}
    </Win>
  );
}

function TxSheet({ t, categories, docs, onOpen, updateTx, onClose, accName, deleteTx }) {
  useEsc(onClose);
  const [cat, setCat] = useState(t.category);
  const [rule, setRule] = useState(false);
  const doc = t.docId && docs.find((d) => d.id === t.docId);
  const rows = [["Datum", fmtDate(t.date)], ["Valuta", t.valueDate && fmtDate(t.valueDate)], ["Konto", accName(t.accountId)], ["Gegenpartei", t.counterparty], ["IBAN", t.iban],
    ["Verwendungszweck", t.purpose], ["Buchungstext", t.bookingText], ["ISIN", t.isin], ["Wertpapier", t.security], ["Stück", t.shares], ["Kurs", t.price != null && fmtMoney(t.price, t.currency)],
    ["Gebühren", t.fee ? fmtMoney(t.fee) : ""], ["Steuern", t.tax ? fmtMoney(t.tax) : ""]].filter(([, v]) => v != null && v !== "" && v !== false);
  return (
    <Win id="tx" onClose={onClose}>
        <div className="panelhead"><button className="link" onClick={onClose}>‹ Zurück</button><b>Buchung</b>
          <button className="btn primary" disabled={cat === t.category} onClick={() => { updateTx({ ...t, category: cat }, rule); onClose(); }}>Speichern</button></div>
        <div className="tile center-text">
          <div className={"hero-v" + (t.amount > 0 ? " ok" : "")} style={{ color: t.amount > 0 ? "var(--ok)" : "var(--txt)" }}>{t.amount > 0 ? "+" : ""}{fmtMoney(t.amount, t.currency)}</div>
          <b>{t.kind === "broker" ? (t.isin ? `${t.type} · ${t.security || t.isin}` : t.type) : t.counterparty || t.purpose}</b>
        </div>
        {t.kind !== "broker" && (
          <fieldset>
            <legend>Kategorie</legend>
            <select value={cat} onChange={(e) => setCat(e.target.value)}>{[...new Set([...categories, t.category])].map((c) => <option key={c}>{c}</option>)}</select>
            {t.counterparty && <label className="check"><input type="checkbox" checked={rule} onChange={(e) => setRule(e.target.checked)} /> Immer so für „{t.counterparty}“</label>}
          </fieldset>
        )}
        {doc && (
          <div className="tile frow click" style={{ marginTop: 12 }} onClick={() => onOpen(doc.id)}>
            <Thumb d={doc} /><div className="grow"><b>📎 {doc.title}</b><small className="muted block">Beleg automatisch zugeordnet</small></div><span className="muted">›</span>
          </div>
        )}
        <fieldset>
          <legend>Details</legend>
          {rows.map(([k, v]) => <div key={k} className="kv"><small className="muted">{k}</small><span>{String(v)}</span></div>)}
        </fieldset>
        {t.manual && <button className="btn danger" style={{ marginTop: 14 }} onClick={() => confirm("Buchung löschen?") && (deleteTx(t), onClose())}>🗑 Buchung löschen</button>}
    </Win>
  );
}

/* ---------- Scanner (Docutain-Stil) ---------- */
const SCAN_FILTERS = [["original", "Original"], ["farbe", "Farbe"], ["dokument", "Dokument"], ["sw", "S/W"]];
const tick = () => new Promise((r) => setTimeout(r, 30));

function Scanner({ onDone, onClose }) {
  useEsc(onClose);
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
  async function onShot(file, idx = pages.length) {
    if (!file) return;
    setBusy("Foto wird geladen …"); await tick();
    try { const src = await loadImage(file); setEdit({ src, url: src.toDataURL("image/jpeg", 0.75), corners: detectCorners(src), idx }); }
    catch (e) { alert("Foto konnte nicht geladen werden: " + e.message); }
    finally { setBusy(""); }
  }
  function rotate() {
    const s = edit.src, c = document.createElement("canvas");
    c.width = s.height; c.height = s.width;
    const ctx = c.getContext("2d"); ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(s, 0, 0);
    setEdit({ ...edit, src: c, url: c.toDataURL("image/jpeg", 0.75), corners: detectCorners(c) });
  }
  async function confirmCrop() {
    setBusy("Wird entzerrt …"); await tick();
    const r = await render(edit.src, edit.corners, filter);
    setPages((p) => { const n = [...p]; n[edit.idx] = { src: edit.src, corners: edit.corners, ...r }; return n; });
    setEdit(null); setBusy("");
  }
  async function changeFilter(f) {
    setFilter(f); ls.set("scanFilter", f);
    setBusy("Filter …"); await tick();
    const np = []; for (const p of pages) np.push({ ...p, ...(await render(p.src, p.corners, f)) });
    setPages(np); setBusy("");
  }
  async function finish() {
    setBusy("Wird gespeichert …"); await tick();
    const stamp = new Date().toLocaleString("sv-SE").replace(" ", "_").replace(/:/g, "-").slice(0, 16);
    const file = pages.length === 1
      ? new File([pages[0].blob], `Scan_${stamp}.jpg`, { type: "image/jpeg" })
      : new File([await pagesToPdf(pages.map((p) => p.blob))], `Scan_${stamp}.pdf`, { type: "application/pdf" });
    onDone(file, { cash });
  }

  return (
    <Win id="scanner" onClose={onClose} className="scanner">
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onShot(e.target.files[0], edit?.idx ?? pages.length); e.target.value = ""; }} />
        <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => { onShot(e.target.files[0], edit?.idx ?? pages.length); e.target.value = ""; }} />
        <div className="panelhead">
          <button className="link" onClick={onClose}>Abbrechen</button>
          <b>{edit ? "Ecken anpassen" : "Scannen"}</b>
          {edit ? <button className="btn primary" onClick={confirmCrop}>Weiter</button>
            : <button className="btn primary" disabled={!pages.length} onClick={finish}>Fertig{pages.length > 1 ? ` (${pages.length})` : ""}</button>}
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
  useEsc(onClose);
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
        <div className="panelhead"><button className="link" onClick={onClose}>Abbrechen</button><b>{init ? "Konto bearbeiten" : "Neues Konto"}</b>
          <button className="btn primary" disabled={!name.trim()} onClick={save}>{init ? "Speichern" : "Anlegen"}</button></div>
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

function ManualTxSheet({ init, accounts, categories, onSave, onClose }) {
  useEsc(onClose);
  const cashAcc = accounts.find((a) => a.kind === "cash");
  const [accountId, setAccountId] = useState(init?.accountId || cashAcc?.id || accounts[0]?.id || "new-cash");
  const [dir, setDir] = useState("out");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState("");
  const [category, setCategory] = useState("Lebensmittel & Haushalt");
  const val = Number(String(amount).replace(",", "."));
  const ok = val > 0 && date && text.trim();
  return (
    <Win id="manual" onClose={onClose} small>
        <div className="panelhead"><button className="link" onClick={onClose}>Abbrechen</button><b>Buchung erfassen</b>
          <button className="btn primary" disabled={!ok} onClick={() => onSave({ accountId, date, amount: dir === "out" ? -val : val, counterparty: text.trim(), purpose: "", category: dir === "in" && category === "Lebensmittel & Haushalt" ? "Einnahmen" : category })}>Speichern</button></div>
        <div className="seg">
          <button className={dir === "out" ? "on" : ""} onClick={() => setDir("out")}>Ausgabe</button>
          <button className={dir === "in" ? "on" : ""} onClick={() => setDir("in")}>Einnahme</button>
        </div>
        <input className="bigamount" inputMode="decimal" placeholder="0,00 €" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <fieldset>
          <label>Wofür / bei wem<input value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Bäckerei, Trinkgeld, Flohmarkt" /></label>
          <div className="grid2">
            <label>Datum<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label>Konto
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.kind === "cash" ? "💶" : a.kind === "broker" ? "📈" : "🏦"} {a.name}</option>)}
                {!cashAcc && <option value="new-cash">💶 Geldbörse (neu)</option>}
              </select>
            </label>
          </div>
          <label>Kategorie<select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
        </fieldset>
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
function Detail({ doc, categories, onClose, saveDoc, trashDoc, reanalyze, notify, bookCash }) {
  useEsc(onClose);
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
    <Win id="detail" onClose={onClose}>
        <div className="panelhead">
          <button className="link" onClick={onClose}>‹ Zurück</button>
          <button className="btn primary" disabled={!dirty} onClick={() => saveDoc(d)}>Speichern</button>
        </div>

        {url && (doc.mimeType.startsWith("image/")
          ? <img className="preview" src={url} alt="" onClick={() => window.open(url)} />
          : <div className="pdfbox"><Thumb d={doc} /><div className="grow"><b>PDF-Dokument</b><small className="muted block">{doc.fileName}</small><button className="btn" style={{ marginTop: 8 }} onClick={() => window.open(url)}>Öffnen</button></div></div>)}
        <div className="seg areaseg" style={{ margin: "6px 0 10px" }}>
          {Object.entries(AREAS).map(([k, [i, l]]) => <button key={k} className={docArea(d) === k ? "on" : ""} onClick={() => set({ areaManual: k })}>{i} {l}</button>)}
        </div>
        <div className="labels" style={{ marginBottom: 4 }}><Label c={d.category} />{d.taxRelevant && <span className="label tax">Steuer</span>}{d.contract && <span className="label">Vertrag</span>}</div>

        {doc.status === "error" && <div className="err">Analyse fehlgeschlagen: {doc.error}</div>}
        {doc.status === "processing" && <div className="muted">Wird analysiert …</div>}

        <label>Titel<input value={d.title || ""} onChange={(e) => set({ title: e.target.value })} /></label>
        <div className="grid2">
          <label>Kategorie
            <select value={d.category} onChange={(e) => set({ category: e.target.value })}>
              {[...new Set([...categories, d.category])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Typ<input value={d.docType || ""} onChange={(e) => set({ docType: e.target.value })} /></label>
          <label>Absender<input value={d.sender || ""} onChange={(e) => set({ sender: e.target.value })} /></label>
          <label>Datum<input type="date" value={d.documentDate || ""} onChange={(e) => set({ documentDate: e.target.value })} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={!!d.taxRelevant} onChange={(e) => set({ taxRelevant: e.target.checked })} /> 🧾 Steuerrelevant (Arbeitnehmerveranlagung)</label>

        <fieldset>
          <legend>Betrag</legend>
          <div className="seg">
            {[["ausgabe", "Ausgabe"], ["einnahme", "Einnahme"], ["keine", "Nur Info"]].map(([k, l]) => (
              <button key={k} className={(d.direction || "keine") === k ? "on" : ""} onClick={() => set({ direction: k })}>{l}</button>
            ))}
          </div>
          <div className="grid3">
            {[["total", "Brutto"], ["net", "Netto"], ["vat", "USt"]].map(([k, l]) => (
              <label key={k}>{l}
                <input inputMode="decimal" value={d.amount?.[k] ?? ""} onChange={(e) => set({ amount: { currency: "EUR", ...d.amount, [k]: numIn(e.target.value) } })} />
              </label>
            ))}
          </div>
          {d.amount?.total != null && d.direction === "ausgabe" && (
            <div className="row1" style={{ alignItems: "center" }}>
              <label className="check"><input type="checkbox" checked={!!d.paid} onChange={(e) => set({ paid: e.target.checked })} /> Bezahlt{doc.paidCash ? " (bar)" : ""}</label>
              {!doc.paid && <button className="btn" style={{ marginTop: 8 }} onClick={() => bookCash({ ...doc, ...d })}>💶 Bar bezahlt</button>}
            </div>
          )}
        </fieldset>

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

        {d.fullText && (
          <>
            <button className="link" onClick={() => setShowText(!showText)}>{showText ? "Text ausblenden" : "Erkannten Text anzeigen"}</button>
            {showText && <pre className="fulltext">{d.fullText}</pre>}
          </>
        )}

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
function Settings({ themeMode, setThemeMode, importTxs, hideAmounts, setHideAmounts, nav, setNav, deleteAccount, renameCategory, deleteCategory, txs, setTxs, accounts, setAccounts, rules, setRules, setTab, categories, setCategories, budgets, setBudgets, me, setMe, token, setToken, docs, setDocs, saveDoc, purgeDoc, notify }) {
  const impRef = useRef();
  const [imp, setImp] = useState(null);
  const [health, setHealth] = useState(null);
  const [usage, setUsage] = useState("");
  const [busy, setBusy] = useState(false);
  const importRef = useRef();
  const trash = docs.filter((d) => d.deletedAt);

  useEffect(() => { navigator.storage?.estimate?.().then((e) => setUsage(`${(e.usage / 1048576).toFixed(1)} MB belegt`)); }, [docs.length]);

  async function exportBackup() {
    setBusy(true);
    try {
      const out = [];
      for (const d of docs) { const b = await db.getFile(d.id); out.push({ doc: d, file: b ? await blobToBase64(b) : null }); }
      download(new Blob([JSON.stringify({ version: 4, exported: new Date().toISOString(), categories, nav, budgets, accounts, rules, txs, items: out })], { type: "application/json" }),
        `dokumente-backup-${todayISO()}.json`);
    } finally { setBusy(false); }
  }
  async function importBackup(file) {
    setBusy(true);
    try {
      const j = JSON.parse(await file.text());
      let n = 0;
      for (const { doc, file: f } of j.items || []) { if (f) await db.putFile(doc.id, base64ToBlob(f, doc.mimeType)); await db.putDoc(doc); n++; }
      if (j.nav) setNav(j.nav); else if (j.categories) setCategories(j.categories);
      if (j.budgets) setBudgets(j.budgets);
      if (j.accounts) setAccounts(j.accounts);
      if (j.rules) setRules(j.rules);
      if (j.txs) { await db.putTxs(j.txs); setTxs(await db.allTx()); }
      setDocs(await db.allDocs());
      notify(`${n} Dokumente importiert`);
    } catch (e) { notify("Import fehlgeschlagen: " + e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="settings">
      <div className="tile frow click" onClick={() => setTab("deadlines")}>
        <span className="caticon" style={{ width: 40, height: 40, background: "#e5484d22", fontSize: 18 }}>⏰</span>
        <div className="grow"><b>Fristen</b><small className="muted block">Zahlungen, Kündigungen, Termine</small></div><span className="muted">›</span>
      </div>

      <fieldset className="span2">
        <legend>Darstellung</legend>
        <div className="themeopts" role="radiogroup" aria-label="Tag- und Nachtmodus">
          {[["auto", "💻", "Automatisch", "wie das Gerät"], ["zeit", "🕖", "Nach Uhrzeit", `Tag ${DAY_FROM}–${DAY_TO} Uhr`], ["light", "☀️", "Tag", "immer hell"], ["dark", "🌙", "Nacht", "immer dunkel"]].map(([k, i, t, sub]) => (
            <button key={k} role="radio" aria-checked={themeMode === k} className={themeMode === k ? "on" : ""} onClick={() => setThemeMode(k)}>
              <span>{i}</span><b>{t}</b><small>{sub}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="span2">
        <legend>Datenschutz</legend>
        <label className="switchrow">
          <span><b>Geldbeträge anzeigen</b><small className="muted block">Aus = alle Beträge werden als „€ •••“ verdeckt (z. B. wenn jemand mitschaut). Schnell umschalten auch mit dem Augen-Symbol oben rechts.</small></span>
          <input type="checkbox" className="switch" checked={!hideAmounts} onChange={(e) => setHideAmounts(!e.target.checked)} />
        </label>
      </fieldset>

      <fieldset className="span2">
        <legend>Umsätze importieren</legend>
        <p className="muted small">Kontoauszüge von Banken, Brokern & Co.: CSV · Excel · CAMT · MT940 · OFX · QIF · JSON · Finanzguru · PDF/Foto (per Claude). Doppelte Buchungen werden übersprungen, Kontostände übernommen.</p>
        <input ref={impRef} type="file" accept={IMPORT_ACCEPT} hidden onChange={async (e) => {
          const f = e.target.files[0]; e.target.value = ""; if (!f) return;
          try { setImp({ file: f, result: await parseFile(f, ls.get("mappings", {})) }); } catch (err) { notify("Datei nicht lesbar: " + err.message); }
        }} />
        <button className="btn primary" onClick={() => impRef.current.click()}>⬆︎ Datei auswählen …</button>
        {imp && <ImportSheet imp={imp} accounts={accounts} setAccounts={setAccounts} importTxs={importTxs} token={token} notify={notify} onClose={() => setImp(null)} />}
      </fieldset>

      <NavSettings nav={nav} setNav={setNav} accounts={accounts} setAccounts={setAccounts} txs={txs} deleteAccount={deleteAccount} notify={notify} />

      <fieldset>
        <legend>Budgets pro Monat</legend>
        <p className="muted small">Leer lassen = kein Budget. Ausgaben werden nach Dokumentdatum gezählt.</p>
        {categories.filter((c) => c !== "Sonstiges").map((c) => (
          <div key={c} className="budrow">
            <span>{c}</span>
            <input inputMode="decimal" placeholder="€" value={budgets[c] ?? ""}
              onChange={(e) => { const v = e.target.value.replace(",", "."); setBudgets({ ...budgets, [c]: v === "" ? undefined : Number(v) }); }} />
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend>Meine Daten (für Kündigungsschreiben)</legend>
        <label>Name<input value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} /></label>
        <label>Adresse<textarea rows={2} value={me.address} onChange={(e) => setMe({ ...me, address: e.target.value })} /></label>
        <label>Ort<input value={me.city} onChange={(e) => setMe({ ...me, city: e.target.value })} /></label>
      </fieldset>

      <DocNavSettings nav={nav} setNav={setNav} docs={docs.filter((d) => !d.deletedAt)} renameCategory={renameCategory} deleteCategory={deleteCategory} notify={notify} />

      {!!rules.length && (
        <fieldset>
          <legend>Kategorie-Regeln ({rules.length})</legend>
          {rules.map((r) => (
            <div key={r.match} className="frow">
              <div className="grow"><b className="small">„{r.match}“</b><small className="muted block">→ {r.category}</small></div>
              <button className="link red" onClick={() => setRules(rules.filter((x) => x.match !== r.match))}>✕</button>
            </div>
          ))}
        </fieldset>
      )}

      <fieldset>
        <legend>Papierkorb ({trash.length})</legend>
        <p className="muted small">Wird nach {TRASH_DAYS} Tagen automatisch geleert.</p>
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
      </fieldset>

      <fieldset>
        <legend>Backup</legend>
        <p className="muted small">Die Dokumente liegen nur in diesem Browser auf diesem Gerät. Regelmäßig sichern (z. B. in iCloud Drive) – darüber auch auf ein anderes Gerät übertragen.</p>
        <div className="actions">
          <button className="btn" disabled={busy || (!docs.length && !txs.length)} onClick={exportBackup}>⬇︎ Backup exportieren</button>
          <button className="btn" disabled={busy} onClick={() => importRef.current.click()}>⬆︎ Backup importieren</button>
        </div>
        <input ref={importRef} type="file" accept="application/json" hidden onChange={(e) => { e.target.files[0] && importBackup(e.target.files[0]); e.target.value = ""; }} />
        <p className="muted small">{docs.length} Dokumente · {txs.length} Umsätze · {usage}</p>
      </fieldset>

      <fieldset>
        <legend>Verbindung</legend>
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
      </fieldset>
    </div>
  );
}

/* ---------- Styles ---------- */
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
.v.out,.dot.out{background:var(--acc)}.v.inc,.dot.inc{background:var(--acc2)}
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
  :root{--side:252px}
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

/* Fido: Seitenleiste-Unterpunkte, Kontengruppen, Bereiche */
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
@media (min-width:1024px){.tab-docs .dlist .dwrap.open{grid-column:1/-1}}
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
`;
