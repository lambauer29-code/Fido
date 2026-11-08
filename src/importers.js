/* ============================================================
   Universeller Import für Bank-, Broker- und Zahlungsdienst-Exporte
   Formate: CSV/TXT (Auto-Erkennung), Excel (.xlsx), JSON (z. B. George),
            CAMT.052/053/054 (ISO 20022 XML), MT940/STA, OFX/QFX, QIF.
   PDF & Unbekanntes → Claude (/api/statement).
   Ergebnis immer: { format, transactions: [Tx], mapping?, headers?, meta }
   Tx = { date, valueDate, amount (± mit Vorzeichen), currency, counterparty, iban,
          purpose, bookingText, reference, kind: "bank"|"broker", type,
          isin, security, shares, price, fee, tax }
   ============================================================ */

/* ---------- Grundbausteine ---------- */
export function decodeText(buf) {
  const bytes = new Uint8Array(buf);
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder("windows-1252").decode(bytes); } // ältere Bank-Exporte
  return text.replace(/^﻿/, "");
}

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => {
  y = Number(y); m = Number(m); d = Number(d);
  if (y < 100) y += y > 70 ? 1900 : 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

export function parseDate(v, preferUS = false) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toLocaleDateString("sv-SE");
  if (typeof v === "number" && v > 20000 && v < 80000) { // Excel-Seriennummer
    const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/)) && s.length >= 8 && !s.includes(".")) return iso(m[1], m[2], m[3]); // OFX 20261102
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/))) return iso(m[3], m[2], m[1]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) {
    const a = +m[1], b = +m[2];
    if (a > 12) return iso(m[3], b, a);
    if (b > 12) return iso(m[3], a, b);
    return preferUS ? iso(m[3], a, b) : iso(m[3], b, a);
  }
  if ((m = s.match(/^(\d{1,2})\/\s?(\d{1,2})'(\d{2})/))) return iso(m[3], m[1], m[2]); // QIF 1/31'26
  if ((m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/))) return iso(m[3], m[2], m[1]);
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t).toLocaleDateString("sv-SE");
}

export function parseNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/\s| |€|EUR|USD|CHF|\$/gi, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^[\d.,']+$/.test(s)) return null;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > ld) s = s.replace(/[.']/g, "").replace(",", ".");          // 1.234,56
  else if (ld > lc) {
    // "1.234" ohne Komma: Tausenderpunkt (3 Nachkommastellen) vs. Dezimalpunkt
    if (lc === -1 && /^\d{1,3}(\.\d{3})+$/.test(s) && (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
    else s = s.replace(/[,']/g, "");                                    // 1,234.56
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : neg ? -n : n;
}

export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/* ---------- Format-Erkennung ---------- */
export function sniff(name, text) {
  const n = name.toLowerCase();
  if (/\.(xlsx|xlsm)$/.test(n)) return "excel";
  if (/\.xls$/.test(n)) return "xls";
  if (/\.pdf$/.test(n)) return "pdf";
  if (/\.(png|jpe?g|heic|webp)$/.test(n)) return "image";
  const t = (text || "").slice(0, 4000);
  if (/camt\.05[234]|<BkToCstmrStmt|<BkToCstmrAcctRpt|<BkToCstmrDbtCdtNtfctn/i.test(t)) return "camt";
  if (/OFXHEADER|<OFX>/i.test(t)) return "ofx";
  if (/^\s*!(Type|Account|Option)/im.test(t)) return "qif";
  if (/:20:/.test(t) && /:(60F|60M|25):/.test(t)) return "mt940";
  if (/^\s*[[{]/.test(t)) return "json";
  return "csv";
}

/* ---------- CAMT (ISO 20022) ---------- */
const kids = (el, name) => (el ? Array.from(el.childNodes).filter((c) => c.nodeType === 1 && (c.localName || c.nodeName.split(":").pop()) === name) : []);
const kid = (el, name) => kids(el, name)[0];
const path = (el, p) => p.split("/").reduce((e, n) => (e ? kid(e, n) : null), el);
const txt = (el) => (el ? clean(el.textContent) : "");
function allByName(root, name) {
  const out = [];
  const walk = (e) => { for (const c of Array.from(e.childNodes)) if (c.nodeType === 1) { if ((c.localName || c.nodeName.split(":").pop()) === name) out.push(c); walk(c); } };
  walk(root); return out;
}
export function parseCamt(text, DOMParserImpl = globalThis.DOMParser) {
  const doc = new DOMParserImpl().parseFromString(text, "application/xml");
  const stmts = [...allByName(doc, "Stmt"), ...allByName(doc, "Rpt"), ...allByName(doc, "Ntfctn")];
  const transactions = [];
  let accountIban = "", currency = "";
  for (const st of stmts) {
    accountIban = accountIban || txt(path(st, "Acct/Id/IBAN"));
    currency = currency || txt(path(st, "Acct/Ccy"));
    for (const e of kids(st, "Ntry")) {
      const amtEl = kid(e, "Amt");
      const debit = txt(kid(e, "CdtDbtInd")) === "DBIT";
      const amount = (parseFloat(txt(amtEl)) || 0) * (debit ? -1 : 1);
      const ccy = amtEl?.getAttribute?.("Ccy") || currency || "EUR";
      const date = parseDate(txt(path(e, "BookgDt/Dt")) || txt(path(e, "BookgDt/DtTm")));
      const valueDate = parseDate(txt(path(e, "ValDt/Dt")) || txt(path(e, "ValDt/DtTm")));
      const details = kids(kid(e, "NtryDtls"), "TxDtls");
      const bookingText = txt(kid(e, "AddtlNtryInf"));
      const one = (d) => {
        const party = debit ? "Cdtr" : "Dbtr";
        const name = txt(path(d, `RltdPties/${party}/Nm`)) || txt(path(d, `RltdPties/${party}/Pty/Nm`)) || txt(path(d, `RltdPties/Ultmt${party}/Nm`));
        const iban = txt(path(d, `RltdPties/${party}Acct/Id/IBAN`));
        const purpose = kids(path(d, "RmtInf"), "Ustrd").map(txt).join(" ") || txt(path(d, "RmtInf/Strd/CdtrRefInf/Ref"));
        const ref = txt(path(d, "Refs/EndToEndId"));
        const dAmt = kid(d, "Amt") || path(d, "AmtDtls/TxAmt/Amt");
        return { date, valueDate, amount: details.length > 1 && dAmt ? (parseFloat(txt(dAmt)) || 0) * (debit ? -1 : 1) : amount,
          currency: ccy, counterparty: name, iban, purpose: purpose || txt(kid(d, "AddtlTxInf")) || bookingText, bookingText,
          reference: ref && ref !== "NOTPROVIDED" ? ref : "", kind: "bank" };
      };
      if (details.length) details.forEach((d) => transactions.push(one(d)));
      else transactions.push({ date, valueDate, amount, currency: ccy, counterparty: "", iban: "", purpose: bookingText, bookingText, kind: "bank" });
    }
  }
  // Schlusssaldo (gebucht) des letzten Auszugs
  let closing = null;
  for (const st of stmts) for (const b of kids(st, "Bal")) {
    const tp = txt(path(b, "Tp/CdOrPrtry/Cd"));
    if (tp !== "CLBD" && tp !== "CLAV") continue;
    const amt = (parseFloat(txt(kid(b, "Amt"))) || 0) * (txt(kid(b, "CdtDbtInd")) === "DBIT" ? -1 : 1);
    const dt = parseDate(txt(path(b, "Dt/Dt")) || txt(path(b, "Dt/DtTm")));
    if (dt && (!closing || dt >= closing.date) && (tp === "CLBD" || !closing)) closing = { amount: amt, date: dt };
  }
  return { format: "CAMT (ISO 20022)", transactions, meta: { iban: accountIban, currency, closingBalance: closing?.amount, closingDate: closing?.date } };
}

/* ---------- MT940 / STA ---------- */
export function parseMt940(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const fields = []; let cur = null;
  for (const l of lines) {
    const m = l.match(/^:(\d{2}[A-Z]?):(.*)$/);
    if (m) { cur = { tag: m[1], val: m[2] }; fields.push(cur); }
    else if (cur && l.trim() !== "-" && l.trim() !== "") cur.val += "\n" + l;
  }
  const transactions = []; let currency = "EUR", account = "", last = null, closing = null;
  for (const f of fields) {
    if (f.tag === "25") account = f.val.trim();
    if (f.tag === "60F" || f.tag === "60M") currency = f.val.slice(7, 10) || currency;
    if (f.tag === "62F" || f.tag === "62M") {
      const m = f.val.trim().match(/^([CD])(\d{6})([A-Z]{3})([\d,]+)/);
      if (m) closing = { amount: parseFloat(m[4].replace(",", ".")) * (m[1] === "D" ? -1 : 1), date: parseDate("20" + m[2].slice(0, 2) + "-" + m[2].slice(2, 4) + "-" + m[2].slice(4, 6)) };
    }
    if (f.tag === "61") {
      const m = f.val.replace(/\n/g, "").match(/^(\d{6})(\d{4})?(R?[CD])([A-Z])?(\d+,\d*)/);
      if (!m) continue;
      const amount = parseFloat(m[5].replace(",", ".")) * (m[3].endsWith("D") ? -1 : 1) * (m[3].startsWith("R") ? -1 : 1);
      const vd = parseDate("20" + m[1].slice(0, 2) + "-" + m[1].slice(2, 4) + "-" + m[1].slice(4, 6));
      let bd = vd;
      if (m[2]) { bd = parseDate(vd.slice(0, 4) + "-" + m[2].slice(0, 2) + "-" + m[2].slice(2, 4)); if (bd && vd && bd > vd && +bd.slice(5, 7) === 12 && +vd.slice(5, 7) === 1) bd = (+vd.slice(0, 4) - 1) + bd.slice(4); }
      last = { date: bd || vd, valueDate: vd, amount, currency, counterparty: "", iban: "", purpose: "", bookingText: "", kind: "bank" };
      transactions.push(last);
    }
    if (f.tag === "86" && last) {
      const v = f.val.replace(/\n/g, "");
      if (/\?\d{2}/.test(v)) { // strukturiert (?20–?29 Zweck, ?32/?33 Name, ?31 IBAN, ?00 Buchungstext)
        const sub = {}; v.replace(/\?(\d{2})([^?]*)/g, (_, k, val) => { sub[k] = (sub[k] || "") + val; });
        last.bookingText = clean(sub["00"]);
        last.purpose = clean([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 60, 61, 62, 63].map((k) => sub[k] || "").join(" ")).replace(/^SVWZ\+/, "");
        last.counterparty = clean((sub["32"] || "") + (sub["33"] || ""));
        last.iban = clean(sub["31"]);
      } else last.purpose = clean(v);
      last = null;
    }
  }
  return { format: "MT940", transactions, meta: { account, currency, closingBalance: closing?.amount, closingDate: closing?.date } };
}

/* ---------- OFX / QFX ---------- */
export function parseOfx(text) {
  const tag = (block, t) => { const m = block.match(new RegExp(`<${t}>([^<\\r\\n]*)`, "i")); return m ? clean(m[1]) : ""; };
  const currency = tag(text, "CURDEF") || "EUR";
  const iban = tag(text, "ACCTID");
  const transactions = (text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) || []).map((b) => ({
    date: parseDate(tag(b, "DTPOSTED")), valueDate: parseDate(tag(b, "DTAVAIL")),
    amount: parseNum(tag(b, "TRNAMT").replace(",", ".")) ?? 0, currency,
    counterparty: tag(b, "NAME") || tag(b, "PAYEE"), iban: "", purpose: tag(b, "MEMO"), bookingText: tag(b, "TRNTYPE"),
    reference: tag(b, "FITID"), kind: "bank"
  }));
  const lb = (text.match(/<LEDGERBAL>[\s\S]*?(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/i) || [""])[0];
  const bal = parseNum(tag(lb, "BALAMT").replace(",", "."));
  return { format: "OFX", transactions, meta: { iban, currency, closingBalance: bal ?? undefined, closingDate: parseDate(tag(lb, "DTASOF")) || undefined } };
}

/* ---------- QIF ---------- */
export function parseQif(text) {
  const recs = text.replace(/\r/g, "").split(/^\^\s*$/m);
  const transactions = [];
  const usDates = /^D\d{1,2}\/\d{1,2}/m.test(text);
  for (const r of recs) {
    const get = (c) => (r.match(new RegExp(`^${c}(.*)$`, "m")) || [])[1];
    const d = get("D"), t = get("T") ?? get("U");
    if (!d || t == null) continue;
    transactions.push({ date: parseDate(d.trim(), usDates), amount: parseNum(t) ?? 0, currency: "EUR",
      counterparty: clean(get("P")), purpose: clean(get("M")), bookingText: clean(get("L")), kind: "bank" });
  }
  return { format: "QIF", transactions, meta: {} };
}

/* ---------- CSV ---------- */
export function parseCsvText(text) {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const cands = [";", ",", "\t", "|"];
  const delim = cands.map((d) => {
    const counts = sample.split("\n").filter(Boolean).map((l) => l.split(d).length - 1);
    const mode = counts.sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0] || 0;
    return { d, score: mode * counts.filter((c) => c === mode).length };
  }).sort((a, b) => b.score - a.score)[0].d;
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell === "") q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

// Synonyme für Spaltennamen (DE/EN, Banken, PayPal, Revolut, N26, Broker …)
export const FIELDS = {
  account: ["name referenzkonto", "kontoname", "account name", "konto name", "kontobezeichnung"],
  ownIban: ["referenzkonto", "eigenes konto", "account iban", "auftragskonto", "eigene iban"],
  category: ["analyse-hauptkategorie", "hauptkategorie", "kategorie", "category"],
  subCategory: ["analyse-unterkategorie", "unterkategorie", "subcategory"],
  transfer: ["analyse-umbuchung", "umbuchung", "transfer", "is transfer"],
  date: ["buchungsdatum", "buchungstag", "datum", "date", "booking date", "bookingdate", "booking", "transaktionsdatum", "started date", "completed date", "trade date", "handelstag", "ausführungsdatum", "zeit", "time", "buchung"],
  valueDate: ["valuta", "valutadatum", "wertstellung", "value date", "valuedate", "valuation", "wertstellungsdatum"],
  amount: ["betrag", "amount", "umsatz", "betrag (eur)", "betrag eur", "brutto", "gross", "summe", "wert", "value", "amount.value", "betrag in eur", "total", "gesamtbetrag"],
  debit: ["soll", "lastschrift", "ausgang", "debit", "belastung", "abbuchung", "money out", "paid out"],
  credit: ["haben", "gutschrift", "eingang", "credit", "money in", "paid in"],
  sign: ["soll/haben", "s/h", "cdtdbtind", "debit/credit", "d/c"],
  currency: ["währung", "waehrung", "currency", "ccy", "amount.currency", "devise"],
  counterparty: ["beguenstigter/auftraggeber", "begünstigter/auftraggeber", "empfänger", "auftraggeber", "partnername", "partner name", "name", "zahlungsempfänger", "zahlungspflichtiger", "auftraggeber/empfänger", "empfänger/auftraggeber", "beguenstigter/zahlungspflichtiger", "begünstigter/zahlungspflichtiger", "payee", "counterparty", "gegenpartei", "händler", "merchant", "partner", "kontoinhaber"],
  iban: ["iban", "partner iban", "partneraccount.iban", "kontonummer", "iban auftraggeber", "iban empfänger", "gegenkonto", "account number", "kontonummer/iban"],
  purpose: ["verwendungszweck", "zahlungsreferenz", "beschreibung", "description", "reference", "memo", "umsatztext", "details", "text", "betreff", "note", "zweck", "notiz", "mitteilung"],
  bookingText: ["buchungstext", "umsatzart", "booking text", "transaktionsart", "art", "buchungsart"],
  type: ["typ", "type", "transaktionstyp", "transaction type", "vorgang", "aktion", "action", "transaction"],
  balance: ["kontostand", "saldo", "balance", "neuer saldo", "saldo nach buchung", "kontostand nach buchung", "running balance"],
  ignore: ["split-typ", "analyse-betrag", "buchungs-id", "referenz-original-id", "analyse-woche", "analyse-monat", "analyse-quartal", "analyse-jahr"],
  isin: ["isin"],
  security: ["wertpapier", "security name", "instrument", "titel", "produkt", "asset name", "wertpapiername", "bezeichnung", "name des wertpapiers"],
  shares: ["stück", "stueck", "anzahl", "quantity", "shares", "menge", "stückzahl", "nominale", "units"],
  price: ["kurs", "price", "preis", "ausführungskurs", "share price", "price per share"],
  fee: ["gebühr", "gebühren", "fee", "fees", "kosten", "provision", "commission", "transaktionsgebühr"],
  tax: ["steuer", "steuern", "tax", "taxes", "kest", "quellensteuer", "withholding tax"]
};
const LABELS = { balance: "Kontostand nach Buchung", account: "Konto (Name)", subCategory: "Unterkategorie", ownIban: "Eigene IBAN", category: "Kategorie", transfer: "Umbuchung (ja/nein)", date: "Datum", valueDate: "Valuta", amount: "Betrag", debit: "Soll / Ausgang", credit: "Haben / Eingang", sign: "Soll/Haben-Kennz.", currency: "Währung",
  counterparty: "Gegenpartei", iban: "IBAN", purpose: "Verwendungszweck", bookingText: "Buchungstext", type: "Typ", isin: "ISIN", security: "Wertpapier",
  shares: "Stück", price: "Kurs", fee: "Gebühren", tax: "Steuern" };
export const FIELD_LABELS = LABELS;

const normH = (h) => String(h ?? "").toLowerCase().replace(/["']/g, "").replace(/\s+/g, " ").trim();
function scoreHeader(h, syns) {
  const x = normH(h); if (!x) return 0;
  let best = 0;
  for (const s of syns) { if (x === s) best = Math.max(best, 3); else if (x.startsWith(s) || x.endsWith(s)) best = Math.max(best, 2); else if (s.length > 3 && x.includes(s)) best = Math.max(best, 1); }
  return best;
}
const isDateLike = (v) => v instanceof Date || (v != null && /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/.test(String(v).trim()));
const isNumLike = (v) => typeof v === "number" || (v != null && String(v).trim() !== "" && parseNum(v) != null && /\d/.test(String(v)));

export function guessMapping(rows) {
  // Kopfzeile = erste Zeile (in den ersten 20) mit den meisten bekannten Spaltennamen
  let headerRow = -1, bestHits = 0;
  rows.slice(0, 20).forEach((r, i) => {
    const hits = r.reduce((s, c) => s + (Object.values(FIELDS).some((syn) => scoreHeader(c, syn) >= 2) ? 1 : 0), 0);
    if (hits > bestHits && r.filter((c) => String(c).trim()).length >= 2) { bestHits = hits; headerRow = i; }
  });
  if (bestHits < 2) headerRow = -1;
  const headers = headerRow >= 0 ? rows[headerRow].map((h) => clean(h)) : (rows[0] || []).map((_, i) => `Spalte ${i + 1}`);
  const data = rows.slice(headerRow + 1).filter((r) => r.length >= Math.min(2, headers.length));
  const map = {}; const used = new Set();
  if (headerRow >= 0) {
    // spezifische Felder zuerst, damit "Betrag" nicht von "Wert" etc. geschluckt wird
    headers.forEach((h, i) => { if (FIELDS.ignore.some((x) => normH(h) === x)) used.add(i); });
    for (const f of ["balance", "account", "ownIban", "transfer", "subCategory", "category", "isin", "valueDate", "date", "debit", "credit", "sign", "currency", "iban", "shares", "price", "fee", "tax", "amount", "type", "bookingText", "counterparty", "purpose", "security"]) {
      let best = -1, bs = 0;
      headers.forEach((h, i) => { if (used.has(i)) return; const s = scoreHeader(h, FIELDS[f]); if (s > bs) { bs = s; best = i; } });
      if (best >= 0 && (bs >= 2 || (bs === 1 && !["type", "sign", "security", "account", "ownIban", "category", "transfer", "subCategory"].includes(f)))) { map[f] = best; used.add(best); }
    }
  }
  // Inhaltsbasiert nachhelfen (für Exporte ohne Kopfzeile oder unbekannte Namen)
  const sample = data.slice(0, 30);
  const colStats = headers.map((_, i) => {
    const vals = sample.map((r) => r[i]).filter((v) => v != null && String(v).trim() !== "");
    return { i, date: vals.filter(isDateLike).length / (vals.length || 1), num: vals.filter(isNumLike).length / (vals.length || 1),
      len: vals.reduce((s, v) => s + String(v).length, 0) / (vals.length || 1), neg: vals.some((v) => (parseNum(v) ?? 0) < 0) };
  });
  if (map.date == null) { const c = colStats.find((c) => c.date > 0.8 && !used.has(c.i)); if (c) { map.date = c.i; used.add(c.i); } }
  if (map.amount == null && map.debit == null && map.credit == null) {
    const c = colStats.filter((c) => c.num > 0.8 && c.date < 0.5 && !used.has(c.i)).sort((a, b) => (b.neg - a.neg) || (a.len - b.len))[0];
    if (c) { map.amount = c.i; used.add(c.i); }
  }
  const junk = /status|state|zeit|time|zone|id$|nummer|number|saldo|balance|kontostand/i;
  if (map.purpose == null) { const c = colStats.filter((c) => !used.has(c.i) && c.num < 0.5 && c.date < 0.5 && !(headerRow >= 0 && junk.test(headers[c.i]))).sort((a, b) => b.len - a.len)[0]; if (c) { map.purpose = c.i; used.add(c.i); } }
  return { headerRow, headers, map };
}

const TYPE_MAP = [
  [/sparplan|savings plan/i, "Kauf"], [/kauf|buy|purchase|zeichnung/i, "Kauf"], [/verkauf|sell|sale|tilgung|rückzahlung/i, "Verkauf"],
  [/dividend|ausschüttung|distribution|ertrag/i, "Dividende"], [/zins|interest/i, "Zinsen"],
  [/einzahlung|deposit|überweisung eingang|top.?up|einlage/i, "Einzahlung"], [/auszahlung|withdraw|entnahme/i, "Auszahlung"],
  [/gebühr|fee|kosten/i, "Gebühr"], [/steuer|tax|kest/i, "Steuer"], [/split|spin|kapitalmaßnahme|corporate/i, "Kapitalmaßnahme"]
];
const brokerType = (s) => { for (const [re, t] of TYPE_MAP) if (re.test(s || "")) return t; return ""; };
const OUTFLOW = new Set(["Kauf", "Auszahlung", "Gebühr", "Steuer"]);

export function rowsToTransactions(rows, mapping) {
  const { headerRow, map } = mapping;
  const col = (r, f) => (map[f] != null ? r[map[f]] : undefined);
  const data = rows.slice(headerRow + 1);
  const isBroker = map.isin != null || map.shares != null;
  const slash = data.map((r) => String(col(r, "date") ?? "").match(/^(\d{1,2})\/(\d{1,2})\//)).filter(Boolean);
  const english = headerRow >= 0 && /^(date|time|name|type|amount|gross)$/i.test(String(rows[headerRow][map.date] ?? "").trim());
  const preferUS = slash.some((m) => +m[2] > 12) || (!slash.some((m) => +m[1] > 12) && english);
  const descIdx = headerRow >= 0 ? rows[headerRow].findIndex((h) => /^(description|beschreibung|name|titel|instrument name)$/i.test(String(h).trim())) : -1;
  const out = [];
  for (const r of data) {
    const date = parseDate(col(r, "date"), preferUS);
    if (!date) continue;
    let amount = parseNum(col(r, "amount"));
    if (amount == null && (map.debit != null || map.credit != null)) {
      const d = Math.abs(parseNum(col(r, "debit")) || 0), c = Math.abs(parseNum(col(r, "credit")) || 0);
      if (!d && !c) continue;
      amount = c - d;
    }
    const typeRaw = clean(col(r, "type")) || clean(col(r, "bookingText"));
    const bt = isBroker || map.isin != null ? brokerType(typeRaw) : "";
    if (amount == null) {
      // Broker-Zeilen ohne Betrag (z. B. Splits) trotzdem aufnehmen
      if (isBroker && (col(r, "isin") || col(r, "shares"))) amount = 0; else continue;
    }
    const sign = normH(col(r, "sign"));
    if (sign && /^(s|d|dbit|soll|debit|belastung|-)$/.test(sign) && amount > 0) amount = -amount;
    if (bt && amount > 0 && OUTFLOW.has(bt) && !data.some((x) => (parseNum(x[map.amount]) ?? 0) < 0)) amount = -amount; // Broker liefern oft nur positive Beträge
    const tx = {
      date, valueDate: parseDate(col(r, "valueDate")), amount: Math.round(amount * 100) / 100,
      currency: clean(col(r, "currency")).toUpperCase().slice(0, 3) || "EUR",
      counterparty: clean(col(r, "counterparty")), iban: clean(col(r, "iban")).replace(/\s/g, ""),
      purpose: clean(col(r, "purpose")), bookingText: clean(col(r, "bookingText")) || typeRaw, kind: "bank"
    };
    if (map.balance != null) { const b = parseNum(col(r, "balance")); if (b != null) tx.balanceAfter = b; }
    if (map.account != null) tx.accountName = clean(col(r, "account"));
    if (map.ownIban != null) tx.ownIban = clean(col(r, "ownIban")).replace(/\s/g, "");
    if (map.category != null) tx.extCategory = [clean(col(r, "category")), clean(col(r, "subCategory"))].filter(Boolean).join(" / ");
    if (map.transfer != null) tx.isTransfer = /^(ja|yes|true|1|x|wahr)$/i.test(clean(col(r, "transfer")));
    const isin = clean(col(r, "isin")).toUpperCase();
    if (isBroker || bt) {
      Object.assign(tx, {
        kind: "broker", type: bt || brokerType(tx.purpose) || "Sonstiges", isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "",
        security: clean(col(r, "security")) || (descIdx >= 0 ? clean(r[descIdx]) : "") || (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? tx.counterparty || tx.purpose : ""),
        shares: parseNum(col(r, "shares")), price: parseNum(col(r, "price")), fee: Math.abs(parseNum(col(r, "fee")) || 0), tax: Math.abs(parseNum(col(r, "tax")) || 0)
      });
      if (tx.shares != null && tx.type === "Verkauf") tx.shares = -Math.abs(tx.shares);
      if (tx.shares != null && tx.type === "Kauf") tx.shares = Math.abs(tx.shares);
    }
    out.push(tx);
  }
  return out;
}

/* ---------- JSON (z. B. George) ---------- */
function flatten(o, pre = "", out = {}) {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    if ("value" in o && "precision" in o && typeof o.value === "number") { out[pre] = o.value / 10 ** o.precision; if (o.currency) out[pre + ".currency"] = o.currency; return out; }
    for (const [k, v] of Object.entries(o)) flatten(v, pre ? `${pre}.${k}` : k, out);
  } else if (Array.isArray(o)) out[pre] = o.filter((x) => typeof x !== "object").join(" ");
  else out[pre] = o;
  return out;
}
export function jsonToRows(text) {
  const j = JSON.parse(text);
  const arr = Array.isArray(j) ? j : (Object.values(j).find((v) => Array.isArray(v) && v.length && typeof v[0] === "object") || []);
  const flat = arr.map((x) => flatten(x));
  const keys = [...new Set(flat.flatMap(Object.keys))];
  return [keys, ...flat.map((f) => keys.map((k) => f[k] ?? ""))];
}

/* ---------- Haupteinstieg ---------- */
export async function parseFile(file, savedMappings = {}) {
  const name = file.name || "datei";
  const buf = await file.arrayBuffer();
  let text = "";
  const pre = sniff(name, "");
  if (!["excel", "xls", "pdf", "image"].includes(pre)) text = decodeText(buf);
  const fmt = pre === "csv" ? sniff(name, text) : pre;

  if (fmt === "camt") return parseCamt(text);
  if (fmt === "mt940") return parseMt940(text);
  if (fmt === "ofx") return parseOfx(text);
  if (fmt === "qif") return parseQif(text);
  if (fmt === "pdf" || fmt === "image") return { format: fmt === "pdf" ? "PDF" : "Bild", needsAI: true, transactions: [] };
  if (fmt === "xls") return { format: "Excel 97 (.xls)", error: "Altes .xls-Format: bitte als .xlsx oder CSV exportieren – oder mit Claude auslesen.", needsAI: true, transactions: [] };

  let rows;
  if (fmt === "excel") {
    const { readSheet } = await import("read-excel-file/browser");
    rows = (await readSheet(new Blob([buf]))).map((r) => r.map((c) => (c == null ? "" : c)));
  } else if (fmt === "json") {
    try { rows = jsonToRows(text); } catch { rows = parseCsvText(text); }
  } else rows = parseCsvText(text);

  const guessed = guessMapping(rows);
  const sig = hash(guessed.headers.join("|"));
  const mapping = savedMappings[sig] ? { ...guessed, map: savedMappings[sig] } : guessed;
  const transactions = rowsToTransactions(rows, mapping);
  return { format: fmt === "excel" ? "Excel" : fmt === "json" ? "JSON" : "CSV", rows, mapping, signature: sig, transactions,
    needsAI: !transactions.length, text: fmt === "excel" ? "" : text };
}

/* ---------- Dubletten-Schutz: stabile IDs ---------- */
export function withIds(txs, accountId) {
  const seen = {};
  return txs.map((t) => {
    const base = [accountId, t.date, t.amount.toFixed(2), norm(t.counterparty), norm(t.purpose).slice(0, 60), t.isin || "", t.shares ?? ""].join("|");
    seen[base] = (seen[base] || 0) + 1;
    return { ...t, accountId, id: hash(base + "#" + seen[base]) + "-" + hash(base) };
  });
}
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/* ---------- Kategorisierung (Regeln, AT-typische Händler) ---------- */
export const DEFAULT_RULES = [
  [/bankomat|geldautomat|\batm\b|bargeldbehebung|behebung|bargeldauszahlung|cash withdrawal|abhebung/i, "Bargeld"],
  [/billa|spar\b|eurospar|interspar|hofer|lidl|penny|mpreis|unimarkt|nah ?& ?frisch|dm drogerie|\bdm\b|bipa|müller|metro/i, "Lebensmittel & Haushalt"],
  [/omv|\bbp\b|shell|eni\b|avanti|turmöl|\bjet\b|öbb|oebb|westbahn|wiener linien|linz ag linien|asfinag|vignette|parken|parkhaus|apcoa|öamtc|arbö|autohaus|kfz|tankstelle/i, "Auto & Mobilität"],
  [/netflix|spotify|disney|amazon prime|prime video|youtube|apple\.com|itunes|google \*|steam|playstation|xbox|nintendo|dazn|sky |audible|kino|cineplexx/i, "Freizeit & Abos"],
  [/\ba1\b|a1 telekom|magenta|drei|hutchison|\bhot\b|yesss|spusu|\bbob\b|liwest|kabelplus/i, "Verträge"],
  [/energie ag|linz ag|verbund|wien energie|evn|kelag|salzburg ag|tiwag|energie steiermark|miete|betriebskosten|hausverwaltung|wohnbau|gemeinnützige|neue heimat|gis\b|orf.?beitrag/i, "Wohnen & Energie"],
  [/uniqa|generali|allianz|wiener städtische|grawe|merkur|donau versicherung|helvetia|zurich|zürich|ergo|muki|oberösterreichische versicherung|versicherung/i, "Versicherung"],
  [/finanzamt|\bbmf\b|abgabenkonto/i, "Steuer & Finanzamt"],
  [/gehalt|lohn|bezug|bezüge|voestalpine|ams\b|arbeitslosen/i, "Lohn & Arbeit"],
  [/apotheke|arzt|ordination|ögk|oegk|\bsvs\b|\bbva\b|zahnarzt|optik|spital|klinikum|physio/i, "Gesundheit"],
  [/magistrat|gemeinde|bezirkshauptmannschaft|\bbh\b|stadtamt|land oberösterreich|ooe\.gv|gv\.at/i, "Behörden"],
  [/zinsen|kontoführung|entgelt|spesen|scalable|trade republic|flatex|bitpanda|n26|revolut|paypal/i, "Bank & Finanzen"]
];
const EXT_MAP = [
  [/umbuchung|übertrag|transfer/i, "Umbuchung"],
  [/gehalt|lohn|einkommen|einnahm|rente|pension|kindergeld|familienbeihilfe/i, "Lohn & Arbeit"],
  [/lebensmittel|supermarkt|drogerie|haushalt|groceries/i, "Lebensmittel & Haushalt"],
  [/mobilität|auto|tank|kfz|öpnv|bahn|verkehr|transport|parken/i, "Auto & Mobilität"],
  [/versicherung/i, "Versicherung"],
  [/wohnen|miete|strom|gas|energie|nebenkosten|betriebskosten|rundfunk|gis/i, "Wohnen & Energie"],
  [/kommunikation|mobilfunk|internet|telefon|handy/i, "Verträge"],
  [/freizeit|unterhaltung|streaming|abo|medien|reise|urlaub|restaurant|essen gehen|sport|hobby/i, "Freizeit & Abos"],
  [/gesundheit|apotheke|arzt|drogerie & gesundheit/i, "Gesundheit"],
  [/steuer|finanzamt/i, "Steuer & Finanzamt"],
  [/bank|finanzen|kredit|sparen|investment|depot|gebühr|zinsen/i, "Bank & Finanzen"],
  [/behörde|amt|gebühren staat/i, "Behörden"],
  [/shopping|einkauf|elektronik|kleidung/i, "Garantie & Kaufbelege"]
];
export function mapExtCategory(c) { for (const [re, cat] of EXT_MAP) if (re.test(c || "")) return cat; return null; }

export function categorize(tx, userRules = [], ownIbans = []) {
  if (tx.kind === "broker") return "Bank & Finanzen";
  if (tx.isTransfer || (tx.iban && ownIbans.includes(tx.iban))) return "Umbuchung";
  const hay = `${tx.counterparty} ${tx.purpose} ${tx.bookingText}`;
  for (const r of userRules) if (r.match && hay.toLowerCase().includes(r.match.toLowerCase())) return r.category;
  const ext = tx.extCategory && mapExtCategory(tx.extCategory);
  if (ext) return ext;
  for (const [re, c] of DEFAULT_RULES) if (re.test(hay)) return c;
  return tx.amount > 0 ? "Einnahmen" : "Sonstiges";
}

/* ---------- Abo-/Fixkosten-Erkennung aus Umsätzen ---------- */
export function counterpartyKey(tx) {
  return norm(tx.counterparty || tx.purpose).replace(/[0-9]+/g, "").replace(/[^a-zäöüß ]/g, " ").replace(/\b(gmbh|ag|kg|og|e\.?u|sepa|lastschrift|einzug|dauerauftrag)\b/g, "").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ");
}
export function detectRecurring(txs) {
  const groups = {};
  for (const t of txs.filter((t) => t.kind !== "broker" && t.amount < 0 && t.category !== "Umbuchung")) {
    const k = counterpartyKey(t); if (k.length < 3) continue;
    (groups[k] = groups[k] || []).push(t);
  }
  const res = [];
  for (const [key, list] of Object.entries(groups)) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const amts = sorted.map((t) => -t.amount).sort((a, b) => a - b);
    const med = amts[Math.floor(amts.length / 2)];
    const similar = sorted.filter((t) => Math.abs(-t.amount - med) <= Math.max(1, med * 0.15));
    if (similar.length < 3) continue;
    const gaps = similar.slice(1).map((t, i) => (new Date(t.date) - new Date(similar[i].date)) / 864e5).sort((a, b) => a - b);
    const g = gaps[Math.floor(gaps.length / 2)];
    const interval = g >= 25 && g <= 35 ? "monatlich" : g >= 80 && g <= 100 ? "vierteljährlich" : g >= 170 && g <= 200 ? "halbjährlich" : g >= 340 && g <= 390 ? "jährlich" : null;
    if (!interval) continue;
    const lastTx = similar[similar.length - 1];
    res.push({ key, name: lastTx.counterparty || key, amount: Math.round(med * 100) / 100, interval, count: similar.length, last: lastTx.date, category: lastTx.category,
      txIds: [...list].sort((a, b) => b.date.localeCompare(a.date)).map((t) => t.id) });
  }
  return res.sort((a, b) => b.amount - a.amount);
}

/* ---------- Abgleich Umsätze ↔ Rechnungen ---------- */
export function matchInvoices(docs, txs) {
  const links = []; const usedTx = new Set(txs.filter((t) => t.docId).map((t) => t.id));
  for (const d of docs) {
    if (d.deletedAt || d.paid || d.direction !== "ausgabe" || !d.amount?.total) continue;
    const base = d.documentDate || (d.createdAt || "").slice(0, 10);
    const cands = txs.filter((t) => !usedTx.has(t.id) && t.amount < 0 && Math.abs(-t.amount - d.amount.total) < 0.015 &&
      (!base || (t.date >= shift(base, -7) && t.date <= shift(base, 75))));
    if (!cands.length) continue;
    const hay = (t) => norm(`${t.counterparty} ${t.purpose} ${t.reference || ""} ${t.iban}`);
    const ref = norm(d.payment?.reference || ""), iban = (d.payment?.iban || "").toLowerCase();
    const sender = norm(d.sender || d.contract?.provider || "").split(" ")[0];
    const strong = cands.find((t) => (iban && hay(t).includes(iban)) || (ref.length > 3 && hay(t).includes(ref)) || (sender.length > 2 && hay(t).includes(sender)));
    const pick = strong || (cands.length === 1 ? cands[0] : null);
    if (pick) { usedTx.add(pick.id); links.push({ docId: d.id, txId: pick.id, date: pick.date }); }
  }
  return links;
}
function shift(isoDate, days) { const d = new Date(isoDate + "T12:00:00"); d.setDate(d.getDate() + days); return d.toLocaleDateString("sv-SE"); }

/* ---------- Depot-Auswertung ---------- */
export function portfolio(txs) {
  const b = txs.filter((t) => t.kind === "broker").sort((x, y) => x.date.localeCompare(y.date));
  const pos = {};
  let invested = 0, income = 0, costs = 0, deposits = 0;
  for (const t of b) {
    if (t.type === "Kauf" || t.type === "Verkauf") {
      const k = t.isin || t.security || "?";
      const p = (pos[k] = pos[k] || { key: k, isin: t.isin, name: t.security || t.isin, shares: 0, cost: 0 });
      if (t.security && !p.name) p.name = t.security;
      const sh = t.shares ?? 0;
      if (t.type === "Kauf") { p.shares += Math.abs(sh); p.cost += Math.abs(t.amount); invested += Math.abs(t.amount); }
      else { const avg = p.shares ? p.cost / p.shares : 0; p.cost -= avg * Math.abs(sh); p.shares -= Math.abs(sh); invested -= Math.abs(t.amount); }
    }
    if (t.type === "Dividende" || t.type === "Zinsen") income += Math.abs(t.amount);
    if (t.type === "Einzahlung") deposits += Math.abs(t.amount);
    if (t.type === "Auszahlung") deposits -= Math.abs(t.amount);
    costs += (t.fee || 0) + (t.tax || 0) + (t.type === "Gebühr" || t.type === "Steuer" ? Math.abs(t.amount) : 0);
  }
  const positions = Object.values(pos).filter((p) => Math.abs(p.shares) > 1e-6).sort((a, b) => b.cost - a.cost);
  return { positions, invested, income, costs, deposits, count: b.length };
}

/** Neuester bekannter Kontostand aus einer Importdatei (Schlusssaldo oder Saldo-Spalte) */
export function latestBalance(txs, meta) {
  if (meta?.closingBalance != null && meta.closingDate) return { amount: meta.closingBalance, date: meta.closingDate };
  const withBal = txs.filter((t) => t.balanceAfter != null);
  if (!withBal.length) return null;
  const maxDate = withBal.reduce((m, t) => (t.date > m ? t.date : m), "");
  const sameDay = withBal.filter((t) => t.date === maxDate);
  const desc = txs.length > 1 && txs[0].date >= txs[txs.length - 1].date; // Datei neueste zuerst?
  const pick = desc ? sameDay[0] : sameDay[sameDay.length - 1];
  return { amount: pick.balanceAfter, date: maxDate };
}
