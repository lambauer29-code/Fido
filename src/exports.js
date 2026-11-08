// Exporte: CSV, Excel (.xlsx), PDF-Tabellen, ZIP, vCard, Kalender
import { zipSync, strToU8 } from "fflate";

export function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const deNum = (v) => (typeof v === "number" && isFinite(v) ? v.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : v);
const deDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v.split("-").reverse().join(".") : v);
const cellTxt = (v, money = true) => (v == null ? "" : typeof v === "number" ? (!money && Number.isInteger(v) ? String(v) : deNum(v)) : deDate(String(v)));
const isMoneyCol = (label) => /€|betrag|wert|preis|summe|saldo|offen|gesamt|umsatz|geb(ü|ue)hr/i.test(String(label || ""));
const pdfNum = (v, money) => (typeof v === "number" && isFinite(v) ? (money || !Number.isInteger(v) ? v.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toLocaleString("de-AT")) : null);

/* ---------- CSV (Excel-tauglich: Semikolon, BOM, Komma-Dezimal) ---------- */
export function csvBlob(head, rows) {
  const money = head.map(isMoneyCol);
  const esc = (v, i) => { const s = cellTxt(v, money[i]); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return new Blob(["﻿" + [head, ...rows].map((r) => r.map((v, i) => esc(v, i)).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
}
export const downloadCsv = (name, head, rows) => saveBlob(csvBlob(head, rows), name);

/* ---------- Excel (.xlsx, minimal) ---------- */
const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const colName = (i) => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function sheetXml(head, rows) {
  const all = [head, ...rows];
  const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const dateSerial = (v) => (Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
  const widths = head.map((_, c) => Math.min(60, Math.max(8, ...all.map((r) => String(cellTxt(r[c]) ?? "").length + 2))));
  const body = all.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = colName(ci) + (ri + 1);
    if (v == null || v === "") return "";
    if (ri > 0 && typeof v === "number" && isFinite(v)) return `<c r="${ref}" s="2"><v>${v}</v></c>`;
    if (ri > 0 && isDate(v)) return `<c r="${ref}" s="3"><v>${dateSerial(v)}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  }).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:${colName(head.length - 1)}${all.length}"/></worksheet>`;
}
/** sheets: [{ name, head, rows }] */
export function xlsxBlob(sheets) {
  const f = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(String(s.name).replace(/[\\/?*[\]:]/g, " ").slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F7F4"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/></cellXfs></styleSheet>`,
  };
  sheets.forEach((s, i) => { f[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s.head, s.rows); });
  const u = zipSync(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, strToU8(v)])));
  return new Blob([u], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
export const downloadXlsx = (name, sheets) => saveBlob(xlsxBlob(sheets), name);

/* ---------- ZIP ---------- */
/** files: [{ name, data: Blob|Uint8Array|string }] */
export async function zipBlob(files) {
  const out = {}, used = new Set();
  for (const f of files) {
    let n = String(f.name).replace(/[\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "datei";
    if (used.has(n)) { const m = n.match(/^(.*?)(\.[^.\/]*)?$/); let i = 2; while (used.has(`${m[1]} (${i})${m[2] || ""}`)) i++; n = `${m[1]} (${i})${m[2] || ""}`; }
    used.add(n);
    out[n] = f.data instanceof Blob ? new Uint8Array(await f.data.arrayBuffer()) : typeof f.data === "string" ? strToU8(f.data) : f.data;
  }
  return new Blob([zipSync(out, { level: 6 })], { type: "application/zip" });
}

/* ---------- PDF-Tabelle (A4, mehrseitig) ---------- */
const WIN = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const safe = (t) => String(t ?? "").replace(/[   ]/g, " ").replace(/[‐‑]/g, "-").replace(/⠿|[←-⇿]/g, "").split("").map((c) => (c.charCodeAt(0) < 256 || WIN.includes(c) ? c : c === "\t" ? " " : "")).join("");
/**
 * opts: { title, subtitle, columns: [{ label, w (Anteil), align: "left"|"right" }], rows: [[...]], totals?: [...],
 *         sections?: [{ heading, rows, totals }], kpis?: [[label, value]], note?, landscape?, accent? }
 */
export async function tablePdf(opts) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = opts.landscape ? [842, 595] : [595, 842];
  const M = 36, fs = opts.fontSize || 8.5, lh = fs + 5.5;
  const acc = opts.accent || [0.06, 0.55, 0.48];
  const cols = opts.columns, tw = cols.reduce((s, c) => s + (c.w || 1), 0), avail = W - 2 * M;
  const xs = []; let x = M; for (const c of cols) { xs.push(x); x += ((c.w || 1) / tw) * avail; }
  const widthOf = (i) => ((cols[i].w || 1) / tw) * avail;
  let page, y, pageNo = 0;
  const fit = (t, w, f, size) => { let s = safe(t); if (f.widthOfTextAtSize(s, size) <= w) return s; while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > w) s = s.slice(0, -1); return s + "…"; };
  const text = (t, x0, y0, f = font, size = fs, color = rgb(0.1, 0.1, 0.12)) => page.drawText(safe(t), { x: x0, y: y0, size, font: f, color });
  const header = () => {
    page = pdf.addPage([W, H]); pageNo++; y = H - M;
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: rgb(...acc) });
    text(opts.title, M, y - 14, bold, 15); y -= 30;
    if (opts.subtitle) { text(opts.subtitle, M, y, font, 9, rgb(0.4, 0.4, 0.45)); y -= 16; }
    if (pageNo === 1 && opts.kpis?.length) {
      const kw = avail / opts.kpis.length;
      opts.kpis.forEach(([l, v], i) => { const kx = M + i * kw; page.drawRectangle({ x: kx, y: y - 34, width: kw - 6, height: 38, color: rgb(0.95, 0.97, 0.97) });
        text(l, kx + 7, y - 9, font, 7.5, rgb(0.4, 0.4, 0.45)); text(v, kx + 7, y - 26, bold, 12); });
      y -= 48;
    }
    colHead();
  };
  const colHead = () => {
    page.drawRectangle({ x: M, y: y - 4, width: avail, height: lh + 2, color: rgb(0.91, 0.97, 0.96) });
    cols.forEach((c, i) => { const s = fit(c.label, widthOf(i) - 6, bold, fs); text(s, c.align === "right" ? xs[i] + widthOf(i) - 3 - bold.widthOfTextAtSize(s, fs) : xs[i] + 3, y, bold); });
    y -= lh + 3;
  };
  const row = (r, opt = {}) => {
    if (y < M + 24) header();
    if (opt.shade) page.drawRectangle({ x: M, y: y - 3.5, width: avail, height: lh, color: rgb(0.975, 0.975, 0.98) });
    if (opt.line) page.drawLine({ start: { x: M, y: y + lh - 3 }, end: { x: M + avail, y: y + lh - 3 }, thickness: 0.6, color: rgb(0.6, 0.6, 0.65) });
    r.forEach((v, i) => { const f = opt.bold ? bold : font; const s = fit(pdfNum(v, isMoneyCol(cols[i].label)) ?? cellTxt(v), widthOf(i) - 6, f, fs);
      text(s, cols[i].align === "right" ? xs[i] + widthOf(i) - 3 - f.widthOfTextAtSize(s, fs) : xs[i] + 3, y, f, fs, opt.color ? rgb(...opt.color) : undefined); });
    y -= lh;
  };
  header();
  const blocks = opts.sections || [{ rows: opts.rows, totals: opts.totals }];
  for (const b of blocks) {
    if (b.heading) { if (y < M + 60) header(); y -= 4; text(b.heading, M, y, bold, 10.5, rgb(...acc)); y -= lh + 2; }
    (b.rows || []).forEach((r, i) => row(r, { shade: i % 2 === 1 }));
    if (b.totals) row(b.totals, { bold: true, line: true });
    if (!(b.rows || []).length && b.empty) { text(b.empty, M + 3, y, font, fs, rgb(0.5, 0.5, 0.55)); y -= lh; }
    y -= 6;
  }
  if (opts.note) { if (y < M + 40) header(); y -= 6; for (const ln of String(opts.note).split("\n")) { text(ln, M, y, font, 7.5, rgb(0.45, 0.45, 0.5)); y -= 10; } }
  const pages = pdf.getPages(), stamp = `Erstellt mit FinDocu am ${new Date().toLocaleDateString("de-AT")}`;
  pages.forEach((p, i) => { p.drawText(safe(`${stamp} · Seite ${i + 1} von ${pages.length}`), { x: M, y: 18, size: 7, font, color: rgb(0.55, 0.55, 0.6) }); });
  return new Blob([await pdf.save()], { type: "application/pdf" });
}

/* ---------- vCard ---------- */
export function vcardText(list) {
  const e = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  return list.map((c) => {
    const [street = "", city = ""] = String(c.address || "").split("\n");
    const m = city.match(/^(\d{4,5})\s+(.*)$/);
    const isOrg = /gmbh|e\.u\.|og\b|kg\b|ag\b|firma|gesmbh|ges\.m\.b\.h/i.test(c.name || "") || c.type === "Lieferant" || c.type === "Behörde";
    const parts = String(c.name || "").split(" ");
    return ["BEGIN:VCARD", "VERSION:3.0", `FN:${e(c.name)}`, isOrg ? `N:;;;;` : `N:${e(parts.slice(-1)[0])};${e(parts.slice(0, -1).join(" "))};;;`, isOrg ? `ORG:${e(c.name)}` : "",
      c.contact ? `NOTE:Ansprechperson: ${e(c.contact)}` : "", c.email ? `EMAIL;TYPE=INTERNET:${c.email}` : "", c.phone ? `TEL;TYPE=WORK:${c.phone}` : "", c.mobile ? `TEL;TYPE=CELL:${c.mobile}` : "",
      c.address ? `ADR;TYPE=WORK:;;${e(street)};${e(m ? m[2] : city)};;${e(m ? m[1] : "")};Österreich` : "", c.web ? `URL:${c.web}` : "", c.number ? `X-FINDOCU-NR:${e(c.number)}` : "", "END:VCARD"].filter(Boolean).join("\r\n");
  }).join("\r\n");
}
