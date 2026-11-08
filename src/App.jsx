import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { loadImage, detectCorners, warp, applyFilter, toJpeg, pagesToPdf } from "./scan.js";
import { parseFile, withIds, categorize, detectRecurring, matchInvoices, portfolio, rowsToTransactions, FIELD_LABELS } from "./importers.js";

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
function catMeta(c) {
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
async function makeThumb(blob) {
  const W = 300;
  const canvas = document.createElement("canvas");
  if (blob.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
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
const fmtMoney = (v, cur = "EUR") =>
  v == null || isNaN(v) ? "" : new Intl.NumberFormat("de-AT", { style: "currency", currency: cur || "EUR" }).format(v);
const daysUntil = (iso) => Math.round((new Date(iso + "T12:00:00") - new Date(todayISO() + "T12:00:00")) / 864e5);
const monthKey = (d) => (d.documentDate || d.createdAt || "").slice(0, 7);
const monthLabel = (k) => new Date(k + "-15").toLocaleDateString("de-AT", { month: "short", year: "2-digit" });
const norm = (s) => String(s || "").toLowerCase();
const isEUR = (d) => (d.amount?.currency || "EUR") === "EUR";
const monthlyCost = (c) => (c?.amount && INTERVAL_FACTOR[c.interval] ? c.amount * INTERVAL_FACTOR[c.interval] : 0);
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

/* ============================================================ */

export default function App() {
  const [docs, setDocs] = useState([]);
  const [tab, setTab] = useState("home");
  const [openId, setOpenId] = useState(null);
  const [categories, setCategories] = useState(() => ls.get("categories", DEFAULT_CATEGORIES));
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
  const [manualTx, setManualTx] = useState(null);
  const [fabOpen, setFabOpen] = useState(false);
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
  useEffect(() => ls.set("categories", categories), [categories]);
  useEffect(() => ls.set("budgets", budgets), [budgets]);
  useEffect(() => ls.set("me", me), [me]);
  useEffect(() => ls.set("appToken", token), [token]);
  useEffect(() => ls.set("accounts", accounts), [accounts]);
  useEffect(() => ls.set("rules", rules), [rules]);
  useEffect(() => ls.set("subs", subs), [subs]);
  useEffect(() => { db.allTx().then(setTxs); }, []);

  const notify = (m) => { setToast(m); setTimeout(() => setToast(""), 3000); };
  const active = useMemo(() => docs.filter((d) => !d.deletedAt), [docs]);
  const recurring = useMemo(() => detectRecurring(txs), [txs]);
  const confirmedSubs = useMemo(() => recurring.filter((r) => subs.confirmed.includes(r.key) &&
    !activeContracts(active).some((d) => norm(d.contract.provider).split(" ")[0] && r.key.includes(norm(d.contract.provider).split(" ")[0]))), [recurring, subs, active]);
  const fixExtra = confirmedSubs.reduce((s, r) => s + r.amount * (INTERVAL_FACTOR[r.interval] || 0), 0);

  // Umsätze importieren: IDs (Dubletten-Schutz), Kategorien, Abgleich mit Rechnungen
  async function importTxs(accountId, list, ownIbans) {
    const own = ownIbans || accounts.map((a) => a.iban).filter(Boolean);
    const current = txsRef.current;
    const existing = new Set(current.map((t) => t.id));
    const withMeta = withIds(list, accountId).map((t) => ({ ...t, category: categorize(t, rules, own), importedAt: new Date().toISOString() }));
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
      const data = await blobToBase64(blob);
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json", "x-app-token": token },
        body: JSON.stringify({ data, mediaType: blob.type, categories, today: todayISO() })
      });
      const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
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
      if (blob.size > 4.3 * 1024 * 1024) notify(`${f.name} ist größer als ~4 MB – Analyse kann scheitern`);
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
  const TABS = [["home", "🏠", "Übersicht"], ["docs", "📄", "Dokumente"], ["accounts", "🏦", "Konten"], ["contracts", "📑", "Verträge"], ["settings", "⚙️", "Mehr"]];

  return (
    <div className={"app tab-" + tab}>
      <style>{CSS}</style>
      <header className="top">
        <h1>{{ home: "Übersicht", docs: "Dokumente", deadlines: "Fristen", accounts: "Konten", contracts: "Verträge", settings: "Einstellungen" }[tab]}</h1>
        <div className="addbtn">
          <button className="btn" onClick={() => setManualTx({})}>💶 Barausgabe</button>
          <button className="btn" onClick={() => setScanOpen(true)}>📷 Scannen</button>
          <button className="btn primary" onClick={() => fileInput.current.click()}>＋ Dokument hinzufügen</button>
        </div>
      </header>

      <main>
        {tab === "home" && <Home docs={active} txs={txs} budgets={budgets} onOpen={setOpenId} setTab={setTab} fixExtra={fixExtra} hasCash={accounts.some((a) => a.kind === "cash")} />}
        {tab === "accounts" && <Accounts txs={txs} accounts={accounts} setAccounts={setAccounts} importTxs={importTxs} updateTx={updateTx}
          deleteAccount={deleteAccount} categories={categories} docs={active} onOpen={setOpenId} token={token} notify={notify}
          recurring={recurring} subs={subs} setSubs={setSubs} onManual={setManualTx} deleteTx={deleteTx} />}
        {tab === "docs" && <DocList docs={active} categories={categories} onOpen={setOpenId} />}
        {tab === "deadlines" && <Deadlines docs={active} onOpen={setOpenId} saveDoc={saveDoc} />}
        {tab === "contracts" && <Contracts docs={active} onOpen={setOpenId} me={me} notify={notify} extra={confirmedSubs} />}
        {tab === "settings" && (
          <Settings txs={txs} setTxs={setTxs} accounts={accounts} setAccounts={setAccounts} rules={rules} setRules={setRules} setTab={setTab} categories={categories} setCategories={setCategories} budgets={budgets} setBudgets={setBudgets}
            me={me} setMe={setMe} token={token} setToken={setToken}
            docs={docs} setDocs={setDocs} saveDoc={saveDoc} purgeDoc={purgeDoc} notify={notify} />
        )}
      </main>

      <input ref={fileInput} type="file" accept="application/pdf,image/*" multiple hidden
        onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      {fabOpen && <div className="fabmenu-bg" onClick={() => setFabOpen(false)} />}
      {fabOpen && (
        <div className="fabmenu">
          <button onClick={() => { setFabOpen(false); setScanOpen(true); }}><span>📷</span>Scannen</button>
          <button onClick={() => { setFabOpen(false); fileInput.current.click(); }}><span>📄</span>Datei / Foto</button>
          <button onClick={() => { setFabOpen(false); setManualTx({}); }}><span>💶</span>Barausgabe</button>
        </div>
      )}
      <button className={"fab" + (fabOpen ? " open" : "")} onClick={() => setFabOpen(!fabOpen)} aria-label="Hinzufügen">＋</button>
      {scanOpen && <Scanner onClose={() => setScanOpen(false)} onDone={(file, o) => { setScanOpen(false); onFiles([file], { ...o, scanned: true }); }} />}
      {manualTx && <ManualTxSheet init={manualTx} accounts={accounts} categories={TX_CATS(categories)} onClose={() => setManualTx(null)}
        onSave={async (t) => { await addManualTx(t); setManualTx(null); notify("Buchung gespeichert"); }} />}

      <nav className="bottom">
        <div className="brand"><span>📂</span><b>Dokumente</b></div>
        {[...TABS.slice(0, 2), ["deadlines", "⏰", "Fristen", "desk"], ...TABS.slice(2)].map(([k, i, l, only]) => (
          <button key={k} className={(tab === k ? "on" : "") + (only ? " desk-only" : "")} onClick={() => setTab(k)} aria-label={l}>
            <span>{i}</span>{l}
            {k === "home" && <Badge docs={active} />}
          </button>
        ))}
      </nav>

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
function Home({ docs, txs, budgets, onOpen, setTab, fixExtra, hasCash }) {
  const thisMonth = todayISO().slice(0, 7);
  const money = docs.filter((d) => d.amount?.total && isEUR(d));
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
  const openInv = docs.filter((d) => d.direction === "ausgabe" && !d.paid && d.amount?.total &&
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
function DocList({ docs, categories, onOpen }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
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
      .filter((d) => (!cat || d.category === cat) && (!tag || (d.tags || []).includes(tag)) && (!year || monthKey(d).startsWith(year)) &&
        (!taxOnly || d.taxRelevant) && (!unpaid || (d.direction === "ausgabe" && d.amount?.total && !d.paid)))
      .filter((d) => { if (!terms.length) return true; const h = haystack(d); return terms.every((t) => h.includes(t)); })
      .sort((a, b) => sort === "amount" ? (b.amount?.total || 0) - (a.amount?.total || 0)
        : (b.documentDate || b.createdAt).localeCompare(a.documentDate || a.createdAt));
  }, [docs, q, cat, tag, year, sort, taxOnly, unpaid]);

  const counts = useMemo(() => Object.fromEntries(categories.map((c) => [c, docs.filter((d) => d.category === c).length])), [docs, categories]);
  const amt = (d) => d.amount?.total != null && (
    <span className={"amt" + (d.direction === "einnahme" ? " ok" : d.paid ? " paid" : "")}>{d.direction === "einnahme" ? "+" : ""}{fmtMoney(d.amount.total, d.amount.currency)}</span>);
  const status = (d) => d.status === "processing" ? <span className="muted small">⏳ wird analysiert …</span> : d.status === "error" ? <span className="err">⚠️ {d.error}</span> : null;

  return (
    <>
      <div className="searchbar">
        <span>🔍</span>
        <input placeholder="Dokumente durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
        <button className="iconbtn" onClick={() => setView(view === "list" ? "grid" : "list")} aria-label="Ansicht">{view === "list" ? "▦" : "☰"}</button>
      </div>

      <div className="folders">
        <button className={!cat ? "folder on" : "folder"} onClick={() => setCat("")}><span>🗂️</span><b>Alle</b><small>{docs.length}</small></button>
        {categories.filter((c) => counts[c]).map((c) => (
          <button key={c} className={cat === c ? "folder on" : "folder"} onClick={() => setCat(cat === c ? "" : c)}
            style={cat === c ? { borderColor: catMeta(c).color } : null}>
            <span>{catMeta(c).icon}</span><b>{c}</b><small>{counts[c]}</small>
          </button>
        ))}
      </div>

      <div className="chips">
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
            <div key={d.id} className="ditem" onClick={() => onOpen(d.id)}>
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
        <div className="sheet" onClick={() => setLetterFor(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panelhead"><button className="link" onClick={() => setLetterFor(null)}>‹ Zurück</button><b>Kündigung</b><span /></div>
            {!me.name && <p className="warn small">Tipp: Name und Adresse unter „Mehr“ eintragen, dann ist das Schreiben komplett.</p>}
            <pre className="fulltext letter">{letter}</pre>
            <div className="actions">
              <button className="btn primary" onClick={() => copy(letter, notify)}>Kopieren</button>
              <a className="btn" href={`mailto:?subject=${encodeURIComponent("Kündigung " + (letterFor.contract.customerNumber || letterFor.contract.provider))}&body=${encodeURIComponent(letter)}`}>Als E-Mail</a>
              <button className="btn" onClick={() => download(new Blob([letter], { type: "text/plain" }), `Kuendigung-${letterFor.contract.provider}.txt`)}>⬇︎ .txt</button>
            </div>
            <p className="muted small">Kündigungen am besten nachweisbar schicken (Einschreiben, E-Mail mit Bestätigung oder Kundenportal). Keine Rechtsberatung.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Konten, Umsätze & Depot ---------- */
const shortD = (iso) => (iso ? new Date(iso + "T12:00").toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "");
const IMPORT_ACCEPT = ".csv,.txt,.tsv,.xml,.sta,.mt940,.940,.ofx,.qfx,.qif,.json,.xlsx,.xlsm,.xls,.pdf,image/*";
const TX_CATS = (categories) => [...new Set([...categories, "Einnahmen", "Bargeld", "Umbuchung"])];

function Accounts({ txs, accounts, setAccounts, importTxs, updateTx, deleteAccount, categories, docs, onOpen, token, notify, recurring, subs, setSubs, onManual, deleteTx }) {
  const [newAcc, setNewAcc] = useState(false);
  const cashAccs = accounts.filter((a) => a.kind === "cash");
  const [acc, setAcc] = useState("");
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

  async function onPick(file) {
    if (!file) return;
    try { setImp({ file, result: await parseFile(file, ls.get("mappings", {})) }); }
    catch (e) { notify("Datei nicht lesbar: " + e.message); }
  }

  const groups = [];
  for (const t of list.slice(0, limit)) { const g = groups[groups.length - 1]; if (g && g.date === t.date) g.items.push(t); else groups.push({ date: t.date, items: [t] }); }

  return (
    <div className="split">
      <aside className="side">
      <div className="hero">
        <small>{month ? new Date(month + "-15").toLocaleDateString("de-AT", { month: "long", year: "numeric" }) : "Alle Umsätze"}{acc ? " · " + accName(acc) : ""}</small>
        <div className="hero-v">{(inc - out >= 0 ? "+" : "") + fmtMoney(inc - out)}</div>
        <div className="hero-row">
          <div><small>Eingänge</small><b>↑ {fmtMoney(inc)}</b></div>
          <div><small>Ausgänge</small><b>↓ {fmtMoney(out)}</b></div>
          <div><small>Buchungen</small><b>{list.length}</b></div>
        </div>
      </div>

      <input ref={fileRef} type="file" accept={IMPORT_ACCEPT} hidden onChange={(e) => { onPick(e.target.files[0]); e.target.value = ""; }} />
      <button className="tile importbtn" onClick={() => fileRef.current.click()}>
        <span className="caticon" style={{ width: 40, height: 40, background: "#0b63f622", fontSize: 20 }}>⬆︎</span>
        <div className="grow"><b>Umsätze importieren</b><small className="muted block">CSV · Excel · CAMT · MT940 · OFX · QIF · JSON · PDF</small></div>
        <span className="muted">›</span>
      </button>
      <div className="twobtn">
        <button className="btn" onClick={() => onManual({ accountId: acc || undefined })}>＋ Buchung</button>
        <button className="btn" onClick={() => setNewAcc(true)}>＋ Konto</button>
      </div>

      {!!cashAccs.length && (
        <section className="tile">
          <div className="tilehead"><b>Bargeld</b><button className="link" onClick={() => onManual({ accountId: cashAccs[0].id })}>＋ Barausgabe</button></div>
          {cashAccs.map((a) => (
            <div key={a.id} className="frow click" onClick={() => setAcc(a.id)}>
              <span className="caticon" style={{ width: 40, height: 40, background: "#16a34a22", fontSize: 20 }}>💶</span>
              <div className="grow"><b>{a.name}</b><small className="muted block">{txs.filter((t) => t.accountId === a.id).length} Buchungen{a.atm ? " · inkl. Bankomat-Behebungen" : ""}</small></div>
              <div className="right"><b className={cashBalance(a, txs) < 0 ? "red" : ""}>{fmtMoney(cashBalance(a, txs))}</b><small className="muted block">Bestand</small></div>
            </div>
          ))}
          {cashBalance(cashAccs[0], txs) < 0 && <p className="warn small">Bestand negativ – vermutlich fehlt eine Behebung oder der Startbestand.</p>}
        </section>
      )}


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
      {!!accounts.length && (
        <div className="chips">
          <button className={!acc ? "chip on" : "chip"} onClick={() => setAcc("")}>Alle Konten</button>
          {accounts.map((a) => <button key={a.id} className={acc === a.id ? "chip on" : "chip"} onClick={() => setAcc(acc === a.id ? "" : a.id)}>{a.kind === "broker" ? "📈" : a.kind === "cash" ? "💶" : "🏦"} {a.name}</button>)}
          <select className="chip" value={month} onChange={(e) => setMonth(e.target.value)}><option value="">Alle Monate</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
        </div>
      )}
      {!txs.length && (
        <div className="empty"><div style={{ fontSize: 48 }}>🏦</div>
          <p>Noch keine Umsätze.<br />Exportiere deine Umsätze im Online-Banking oder beim Broker (CSV, CAMT, MT940 …) oder nimm einfach den PDF-Kontoauszug – und importiere die Datei hier. Für Bargeld legst du ein Konto „Geldbörse“ an.</p></div>
      )}

      {!!txs.length && <div className="searchbar"><span>🔍</span><input type="search" placeholder="Umsätze durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} /></div>}

      {groups.map((g) => (
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
      {newAcc && <AccountSheet hasAtmAccount={cashAccs.some((a) => a.atm)} onClose={() => setNewAcc(false)} onSave={(a) => { setAccounts((l) => [...l, a]); setNewAcc(false); setAcc(a.id); notify(`Konto „${a.name}“ angelegt`); }} />}
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
        const blob = res.format === "Bild" ? await prepareFile(imp.file) : imp.file;
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
        const known = [...accounts]; let added = 0, dupes = 0, matched = 0;
        for (const name of fileAccounts) {
          const part = txs.filter((t) => t.accountName === name);
          const iban = part.find((t) => t.ownIban)?.ownIban || "";
          let a = known.find((x) => (iban && x.iban === iban) || x.name === name);
          if (!a) { a = { id: uid(), name, iban, kind: "bank" }; known.push(a); }
          const r = await importTxs(a.id, part, known.map((x) => x.iban).filter(Boolean));
          added += r.added; dupes += r.dupes; matched += r.matched;
        }
        setAccounts(known);
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
      const r = await importTxs(id, txs);
      notify(`${r.added} neu importiert${r.dupes ? `, ${r.dupes} bereits vorhanden` : ""}${r.matched ? `, ${r.matched} Rechnung(en) als bezahlt erkannt` : ""}`);
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <div className="sheet" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>
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
    <div className="sheet" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>
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
    <div className="sheet scanner" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>
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
  const own = txs.filter((t) => t.accountId === acc.id && (!acc.openingDate || t.date >= acc.openingDate)).reduce((s, t) => s + t.amount, 0);
  const atm = acc.atm ? txs.filter((t) => t.accountId !== acc.id && t.category === "Bargeld" && t.amount < 0 && (!acc.openingDate || t.date >= acc.openingDate)).reduce((s, t) => s - t.amount, 0) : 0;
  return (acc.opening || 0) + own + atm;
}

function AccountSheet({ onSave, onClose, hasAtmAccount }) {
  useEsc(onClose);
  const [kind, setKind] = useState("cash");
  const [name, setName] = useState("Geldbörse");
  const [opening, setOpening] = useState("");
  const [atm, setAtm] = useState(!hasAtmAccount);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="panel small-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panelhead"><button className="link" onClick={onClose}>Abbrechen</button><b>Neues Konto</b>
          <button className="btn primary" disabled={!name.trim()} onClick={() => onSave({ id: uid(), kind, name: name.trim(), iban: "",
            ...(kind === "cash" ? { opening: Number(String(opening).replace(",", ".")) || 0, openingDate: todayISO(), atm } : {}) })}>Anlegen</button></div>
        <fieldset>
          <legend>Art</legend>
          <div className="seg">
            {[["cash", "💶 Bargeld"], ["bank", "🏦 Bankkonto"], ["broker", "📈 Depot"]].map(([k, l]) => (
              <button key={k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); if (name === "Geldbörse" || !name) setName(k === "cash" ? "Geldbörse" : ""); }}>{l}</button>
            ))}
          </div>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "cash" ? "Geldbörse" : "z. B. BAWAG Giro"} /></label>
          {kind === "cash" && (
            <>
              <label>Aktueller Bargeldbestand<input inputMode="decimal" placeholder="z. B. 120,00" value={opening} onChange={(e) => setOpening(e.target.value)} /></label>
              <label className="check"><input type="checkbox" checked={atm} onChange={(e) => setAtm(e.target.checked)} /> Bankomat-Behebungen aus importierten Konten automatisch als Einzahlung zählen</label>
            </>
          )}
          {kind !== "cash" && <p className="muted small">Umsätze kommen per Import dazu oder du buchst sie von Hand.</p>}
        </fieldset>
      </div>
    </div>
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
    <div className="sheet" onClick={onClose}>
      <div className="panel small-panel" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>
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
    <div className="sheet" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panelhead">
          <button className="link" onClick={onClose}>‹ Zurück</button>
          <button className="btn primary" disabled={!dirty} onClick={() => saveDoc(d)}>Speichern</button>
        </div>

        {url && (doc.mimeType.startsWith("image/")
          ? <img className="preview" src={url} alt="" onClick={() => window.open(url)} />
          : <div className="pdfbox"><Thumb d={doc} /><div className="grow"><b>PDF-Dokument</b><small className="muted block">{doc.fileName}</small><button className="btn" style={{ marginTop: 8 }} onClick={() => window.open(url)}>Öffnen</button></div></div>)}
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
      </div>
    </div>
  );
}

/* ---------- Einstellungen, Budgets, Papierkorb, Backup ---------- */
function Settings({ txs, setTxs, accounts, setAccounts, rules, setRules, setTab, categories, setCategories, budgets, setBudgets, me, setMe, token, setToken, docs, setDocs, saveDoc, purgeDoc, notify }) {
  const [catText, setCatText] = useState(categories.join("\n"));
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
      download(new Blob([JSON.stringify({ version: 3, exported: new Date().toISOString(), categories, budgets, accounts, rules, txs, items: out })], { type: "application/json" }),
        `dokumente-backup-${todayISO()}.json`);
    } finally { setBusy(false); }
  }
  async function importBackup(file) {
    setBusy(true);
    try {
      const j = JSON.parse(await file.text());
      let n = 0;
      for (const { doc, file: f } of j.items || []) { if (f) await db.putFile(doc.id, base64ToBlob(f, doc.mimeType)); await db.putDoc(doc); n++; }
      if (j.categories) { setCategories(j.categories); setCatText(j.categories.join("\n")); }
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

      <fieldset>
        <legend>Kategorien</legend>
        <textarea rows={8} value={catText} onChange={(e) => setCatText(e.target.value)} />
        <button className="btn" onClick={() => { const c = catText.split("\n").map((s) => s.trim()).filter(Boolean); if (!c.includes("Sonstiges")) c.push("Sonstiges"); setCategories(c); notify("Kategorien gespeichert"); }}>Kategorien speichern</button>
      </fieldset>

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
      </fieldset>
    </div>
  );
}

/* ---------- Styles ---------- */
const CSS = `
:root{--bg:#f3f5f9;--card:#ffffff;--card2:#f6f8fb;--line:#e6e9ef;--txt:#0f1b2d;--mut:#6b7686;--acc:#0b63f6;--acc2:#00b3a4;--red:#e5484d;--warn:#e88a00;--ok:#16a34a;
  --shadow:0 1px 2px #0f1b2d0d,0 4px 14px #0f1b2d0f;--hero:linear-gradient(135deg,#0b3d91 0%,#0b63f6 55%,#00b3a4 100%)}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--card:#161b23;--card2:#1c222c;--line:#262d38;--txt:#e8ecf2;--mut:#8b95a5;--acc:#4f8cff;--acc2:#2dd4bf;--red:#ff6b6b;--warn:#ffb648;--ok:#3ecf8e;
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
nav.bottom button{flex:1;background:none;border:0;color:var(--mut);font:inherit;font-size:10.5px;padding:8px 0;display:flex;flex-direction:column;align-items:center;gap:2px;position:relative}
nav.bottom button span{font-size:20px;filter:grayscale(1);opacity:.7}nav.bottom button.on{color:var(--acc);font-weight:600}nav.bottom button.on span{filter:none;opacity:1}
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
nav.bottom button{min-height:52px;cursor:pointer}
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
  nav.bottom button:hover{color:var(--txt)}
}
/* Kleine Phones (iPhone SE, kleine Android) */
@media (max-width:359px){
  .top h1{font-size:25px}.hero{padding:16px 14px 12px}.hero-v{font-size:28px}
  .hero-row,.stats{flex-wrap:wrap}.hero-row>div,.stats>div{flex:1 1 40%}
  nav.bottom button{font-size:9.5px}.folder{width:84px}
  .donutwrap{flex-direction:column;align-items:stretch}.donut{align-self:center}
  .grid{gap:8px}.gthumb{height:118px}.grid2{grid-template-columns:1fr}
  .dlrow{grid-template-columns:auto 1fr auto}.dlrow input[type=date]{grid-column:1/-1}
}
/* Tablet (iPad, große Android) */
@media (min-width:700px){
  .app{max-width:1100px}
  .top h1{font-size:32px}
  .desk-only{display:flex!important}
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
@media (min-width:1024px){
  .app{max-width:none;margin:0;padding:24px 40px 48px calc(248px + 40px)}
  main,.top{max-width:1240px}
  nav.bottom{top:0;bottom:0;right:auto;width:248px;flex-direction:column;align-items:stretch;gap:2px;padding:22px 12px;border-top:0;border-right:1px solid var(--line);background:var(--card)}
  .brand{display:flex!important;align-items:center;gap:10px;padding:4px 14px 24px;font-size:18px}.brand span{font-size:24px}
  nav.bottom button{flex:none;flex-direction:row;justify-content:flex-start;gap:12px;font-size:15px;padding:10px 14px;border-radius:12px;min-height:44px}
  nav.bottom button span{font-size:19px}
  nav.bottom button.on{background:color-mix(in srgb,var(--acc) 12%,transparent)}
  .badge{position:static;margin-left:auto}
  .addbtn{display:inline-block!important}.fab{display:none}
  .top h1{margin:4px 0 22px}
  .dash{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
  .tab-contracts .dash{grid-template-columns:repeat(2,minmax(0,1fr))}
  .split{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:22px;align-items:start}
  .split>.side{order:2;position:sticky;top:24px}.split>.maincol{order:1}
  .side .hero-v{font-size:32px}
  .tab-docs .folders{flex-wrap:wrap;overflow:visible}
  .tab-docs .dlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr))}
  .tab-docs .ditem+.ditem{border-top:0}.tab-docs .ditem{border-bottom:1px solid var(--line)}
  .sheet{justify-content:flex-end;align-items:stretch;padding:0;background:#0f1b2d40}
  .panel{max-width:580px;max-height:none;height:100dvh;border-radius:0;box-shadow:-24px 0 60px #0003;animation:slidein .2s ease-out;padding:0 24px 32px}
  .toast{bottom:32px;left:calc(50% + 124px)}
  .settings{max-width:1100px}
}
@media (min-width:1600px){ .dash{grid-template-columns:repeat(4,minmax(0,1fr))} .dash>.hero{grid-column:1/3}.dash>.tile.alert{grid-column:3/5;align-self:stretch} }
/* Phone quer */
@media (max-height:500px) and (orientation:landscape){
  .top h1{font-size:24px;margin:6px 2px 10px}.hero{padding:12px 16px}.hero-v{font-size:26px;margin-bottom:8px}
  nav.bottom button{min-height:44px;padding:4px 0}nav.bottom button span{font-size:17px}
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
.fabmenu-bg{position:fixed;inset:0;z-index:5;background:#0f1b2d33}
.fabmenu{position:fixed;right:20px;bottom:calc(env(safe-area-inset-bottom) + 148px);z-index:6;display:flex;flex-direction:column;gap:8px;align-items:flex-end;animation:popin .15s ease-out}
.fabmenu button{display:flex;align-items:center;gap:10px;background:var(--card);color:var(--txt);border:0;border-radius:14px;padding:12px 16px;font:inherit;font-weight:600;box-shadow:0 8px 24px #0003;min-height:48px}
.fabmenu span{font-size:20px}
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
@media (min-width:700px){.small-panel{max-width:520px}.fabmenu{bottom:calc(env(safe-area-inset-bottom) + 148px)}}
@media (min-width:1024px){.addbtn{display:flex!important}}
`;
