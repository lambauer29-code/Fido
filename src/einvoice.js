// v0.99.46: E-Rechnungen lesen und schreiben
//  Lesen:    ZUGFeRD / Factur-X (PDF mit eingebettetem XML), XRechnung (CII oder UBL), Peppol-UBL, ebInterface (AT, 4.x–6.x)
//  Schreiben: Factur-X/ZUGFeRD (EN 16931, XML im PDF), XRechnung 3.0 (CII), ebInterface 6.1
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, PDFString, PDFHexString, StandardFonts, rgb, AFRelationship, decodePDFRawStream } from "pdf-lib";

/* ---------------- Lesen ---------------- */
const num = (s) => { if (s == null) return null; const t = String(s).trim(); if (!t) return null; const v = Number(t.replace(/\s/g, "").replace(/,(?=\d{1,2}$)/, ".")); return Number.isFinite(v) ? v : null; };
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const kids = (el, ln) => (el ? [...el.children].filter((c) => c.localName === ln) : []);
const k = (el, ...path) => { let cur = el; for (const p of path) { cur = kids(cur, p)[0]; if (!cur) return null; } return cur; };
const t = (el, ...path) => (k(el, ...path)?.textContent || "").trim();
const all = (el, ...path) => { let cur = [el]; for (const p of path) cur = cur.flatMap((c) => kids(c, p)); return cur; };
const d102 = (s) => { const v = (s || "").trim(); return /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : ""; };

export function isEInvoiceXml(text) {
  const s = String(text || "").slice(0, 4000);
  return /CrossIndustryInvoice|CrossIndustryDocument|urn:oasis:names:specification:ubl:schema:xsd:(Invoice|CreditNote)-2|ebinterface\.at\/schema/i.test(s);
}

function parseCII(root) {
  const ctx = t(root, "ExchangedDocumentContext", "GuidelineSpecifiedDocumentContextParameter", "ID");
  const doc = k(root, "ExchangedDocument"), tx = k(root, "SupplyChainTradeTransaction");
  const ag = k(tx, "ApplicableHeaderTradeAgreement"), st = k(tx, "ApplicableHeaderTradeSettlement"), sum = k(st, "SpecifiedTradeSettlementHeaderMonetarySummation");
  const party = (p) => p && ({ name: t(p, "Name"), uid: all(p, "SpecifiedTaxRegistration", "ID").map((x) => x.textContent.trim()).find((x, i, a) => /^[A-Z]{2}/.test(x)) || t(p, "SpecifiedTaxRegistration", "ID"),
    street: t(p, "PostalTradeAddress", "LineOne"), zip: t(p, "PostalTradeAddress", "PostcodeCode"), city: t(p, "PostalTradeAddress", "CityName"), country: t(p, "PostalTradeAddress", "CountryID"),
    email: t(p, "URIUniversalCommunication", "URIID") || t(p, "DefinedTradeContact", "EmailURIUniversalCommunication", "URIID") });
  const taxTotals = all(sum, "TaxTotalAmount"), cur = t(st, "InvoiceCurrencyCode") || "EUR";
  const vatTotal = num((taxTotals.find((x) => !x.getAttribute("currencyID") || x.getAttribute("currencyID") === cur) || taxTotals[0])?.textContent);
  const pm = all(st, "SpecifiedTradeSettlementPaymentMeans")[0];
  const vatLines = all(st, "ApplicableTradeTax").map((x) => ({ rate: num(t(x, "RateApplicablePercent")) ?? 0, net: num(t(x, "BasisAmount")), vat: num(t(x, "CalculatedAmount")) ?? 0, cat: t(x, "CategoryCode"), reason: t(x, "ExemptionReason") }))
    .map((x) => ({ ...x, gross: r2((x.net || 0) + (x.vat || 0)) }));
  const lines = all(tx, "IncludedSupplyChainTradeLineItem").map((li) => ({
    name: t(li, "SpecifiedTradeProduct", "Name"), qty: num(t(li, "SpecifiedLineTradeDelivery", "BilledQuantity")) ?? 1, unit: k(li, "SpecifiedLineTradeDelivery", "BilledQuantity")?.getAttribute("unitCode") || "",
    price: num(t(li, "SpecifiedLineTradeAgreement", "NetPriceProductTradePrice", "ChargeAmount")), total: num(t(li, "SpecifiedLineTradeSettlement", "SpecifiedTradeSettlementLineMonetarySummation", "LineTotalAmount")),
    rate: num(t(li, "SpecifiedLineTradeSettlement", "ApplicableTradeTax", "RateApplicablePercent")) }));
  const tc = t(doc, "TypeCode");
  return {
    syntax: "CII", profile: ctx, format: /xrechnung/i.test(ctx) ? "XRechnung (CII)" : "ZUGFeRD / Factur-X",
    type: ["381", "261", "396"].includes(tc) ? "credit" : "invoice", number: t(doc, "ID"), date: d102(t(doc, "IssueDateTime", "DateTimeString")),
    due: d102(t(st, "SpecifiedTradePaymentTerms", "DueDateDateTime", "DateTimeString")), terms: t(st, "SpecifiedTradePaymentTerms", "Description"),
    currency: cur, seller: party(k(ag, "SellerTradeParty")), buyer: { ...party(k(ag, "BuyerTradeParty")), ref: t(ag, "BuyerReference") },
    net: num(t(sum, "TaxBasisTotalAmount")) ?? num(t(sum, "LineTotalAmount")), vat: vatTotal, gross: num(t(sum, "GrandTotalAmount")), payable: num(t(sum, "DuePayableAmount")),
    vatLines, iban: t(pm, "PayeePartyCreditorFinancialAccount", "IBANID").replace(/\s/g, ""), bic: t(pm, "PayeeSpecifiedCreditorFinancialInstitution", "BICID"),
    ref: t(st, "PaymentReference"), notes: all(doc, "IncludedNote").map((n) => t(n, "Content")).filter(Boolean), lines
  };
}
// ZUGFeRD 1.0 (CrossIndustryDocument, 2014–2019)
function parseZF1(root) {
  const doc = k(root, "HeaderExchangedDocument"), tx = k(root, "SpecifiedSupplyChainTradeTransaction");
  const ag = k(tx, "ApplicableSupplyChainTradeAgreement"), st = k(tx, "ApplicableSupplyChainTradeSettlement"), sum = k(st, "SpecifiedTradeSettlementMonetarySummation");
  const party = (p) => p && ({ name: t(p, "Name"), uid: t(p, "SpecifiedTaxRegistration", "ID"), street: t(p, "PostalTradeAddress", "LineOne"), zip: t(p, "PostalTradeAddress", "PostcodeCode"), city: t(p, "PostalTradeAddress", "CityName"), country: t(p, "PostalTradeAddress", "CountryID"), email: "" });
  const pm = all(st, "SpecifiedTradeSettlementPaymentMeans")[0];
  const vatLines = all(st, "ApplicableTradeTax").map((x) => ({ rate: num(t(x, "ApplicablePercent")) ?? 0, net: num(t(x, "BasisAmount")), vat: num(t(x, "CalculatedAmount")) ?? 0, cat: t(x, "CategoryCode") })).map((x) => ({ ...x, gross: r2((x.net || 0) + (x.vat || 0)) }));
  const lines = all(tx, "IncludedSupplyChainTradeLineItem").map((li) => ({ name: t(li, "SpecifiedTradeProduct", "Name"), qty: num(t(li, "SpecifiedSupplyChainTradeDelivery", "BilledQuantity")) ?? 1, unit: k(li, "SpecifiedSupplyChainTradeDelivery", "BilledQuantity")?.getAttribute("unitCode") || "",
    price: num(t(li, "SpecifiedSupplyChainTradeAgreement", "NetPriceProductTradePrice", "ChargeAmount")), total: num(t(li, "SpecifiedSupplyChainTradeSettlement", "SpecifiedTradeSettlementMonetarySummation", "LineTotalAmount")), rate: num(t(li, "SpecifiedSupplyChainTradeSettlement", "ApplicableTradeTax", "ApplicablePercent")) }));
  return { syntax: "CII", profile: t(root, "SpecifiedExchangedDocumentContext", "GuidelineSpecifiedDocumentContextParameter", "ID"), format: "ZUGFeRD 1.0", type: t(doc, "TypeCode") === "381" ? "credit" : "invoice",
    number: t(doc, "ID"), date: d102(t(doc, "IssueDateTime", "DateTimeString")), due: d102(t(st, "SpecifiedTradePaymentTerms", "DueDateDateTime", "DateTimeString")), terms: t(st, "SpecifiedTradePaymentTerms", "Description"),
    currency: t(st, "InvoiceCurrencyCode") || "EUR", seller: party(k(ag, "SellerTradeParty")), buyer: { ...party(k(ag, "BuyerTradeParty")), ref: t(ag, "BuyerReference") },
    net: num(t(sum, "TaxBasisTotalAmount")), vat: num(t(sum, "TaxTotalAmount")), gross: num(t(sum, "GrandTotalAmount")), payable: num(t(sum, "DuePayableAmount")), vatLines,
    iban: t(pm, "PayeePartyCreditorFinancialAccount", "IBANID").replace(/\s/g, ""), bic: t(pm, "PayeeSpecifiedCreditorFinancialInstitution", "BICID"), ref: t(st, "PaymentReference"), notes: all(doc, "IncludedNote").map((n) => t(n, "Content")).filter(Boolean), lines };
}
function parseUBL(root) {
  const credit = root.localName === "CreditNote", cust = t(root, "CustomizationID");
  const party = (p) => p && ({ name: t(p, "PartyName", "Name") || t(p, "PartyLegalEntity", "RegistrationName"), uid: t(p, "PartyTaxScheme", "CompanyID"),
    street: t(p, "PostalAddress", "StreetName"), zip: t(p, "PostalAddress", "PostalZone"), city: t(p, "PostalAddress", "CityName"), country: t(p, "PostalAddress", "Country", "IdentificationCode"),
    email: t(p, "Contact", "ElectronicMail") || t(p, "EndpointID") });
  const tot = k(root, "LegalMonetaryTotal"), pm = all(root, "PaymentMeans")[0];
  const taxTotal = all(root, "TaxTotal").find((x) => kids(x, "TaxSubtotal").length) || all(root, "TaxTotal")[0];
  const vatLines = all(taxTotal, "TaxSubtotal").map((x) => ({ rate: num(t(x, "TaxCategory", "Percent")) ?? 0, net: num(t(x, "TaxableAmount")), vat: num(t(x, "TaxAmount")) ?? 0, cat: t(x, "TaxCategory", "ID"), reason: t(x, "TaxCategory", "TaxExemptionReason") }))
    .map((x) => ({ ...x, gross: r2((x.net || 0) + (x.vat || 0)) }));
  const lines = all(root, credit ? "CreditNoteLine" : "InvoiceLine").map((li) => { const q = k(li, credit ? "CreditedQuantity" : "InvoicedQuantity");
    return { name: t(li, "Item", "Name") || t(li, "Item", "Description"), qty: num(q?.textContent) ?? 1, unit: q?.getAttribute("unitCode") || "", price: num(t(li, "Price", "PriceAmount")), total: num(t(li, "LineExtensionAmount")), rate: num(t(li, "Item", "ClassifiedTaxCategory", "Percent")) }; });
  return {
    syntax: "UBL", profile: cust, format: /xrechnung/i.test(cust) ? "XRechnung (UBL)" : /peppol/i.test(cust) ? "Peppol (UBL)" : "UBL",
    type: credit ? "credit" : "invoice", number: t(root, "ID"), date: d102(t(root, "IssueDate")), due: d102(t(root, "DueDate") || t(pm, "PaymentDueDate")), terms: t(root, "PaymentTerms", "Note"),
    currency: t(root, "DocumentCurrencyCode") || "EUR", seller: party(k(root, "AccountingSupplierParty", "Party")), buyer: { ...party(k(root, "AccountingCustomerParty", "Party")), ref: t(root, "BuyerReference") },
    net: num(t(tot, "TaxExclusiveAmount")), vat: num(t(taxTotal, "TaxAmount")), gross: num(t(tot, "TaxInclusiveAmount")), payable: num(t(tot, "PayableAmount")),
    vatLines, iban: t(pm, "PayeeFinancialAccount", "ID").replace(/\s/g, ""), bic: t(pm, "PayeeFinancialAccount", "FinancialInstitutionBranch", "ID"), ref: t(pm, "PaymentID"),
    notes: all(root, "Note").map((n) => n.textContent.trim()).filter(Boolean), lines
  };
}
function parseEbi(root) {
  const ns = root.namespaceURI || "", ver = (ns.match(/schema\/(\d+)p(\d+)/) || []).slice(1).join(".");
  const addr = (p) => { const a = k(p, "Address"); return a && { name: t(a, "Name"), uid: t(p, "VATIdentificationNumber").replace(/^0+$/, ""), street: t(a, "Street"), zip: t(a, "ZIP"), city: t(a, "Town"), country: k(a, "Country")?.getAttribute("CountryCode") || t(a, "Country"), email: t(a, "Email") || t(p, "Contact", "Email") }; };
  const items = all(root, "Details", "ItemList", "ListLineItem");
  const lines = items.map((li) => ({ name: t(li, "Description"), qty: num(t(li, "Quantity")) ?? 1, unit: k(li, "Quantity")?.getAttribute("Unit") || "", price: num(t(li, "UnitPrice")), total: num(t(li, "LineItemAmount")), rate: num(t(li, "TaxItem", "TaxPercent") || t(li, "VATRate")) }));
  let vatLines = all(root, "Tax", "TaxItem").map((x) => ({ rate: num(t(x, "TaxPercent")) ?? 0, net: num(t(x, "TaxableAmount")), vat: num(t(x, "TaxAmount")) ?? 0, cat: k(x, "TaxPercent")?.getAttribute("TaxCategoryCode") || "" }));
  if (!vatLines.length) vatLines = all(root, "Tax", "VAT", "VATItem").map((x) => ({ rate: num(t(x, "VATRate")) ?? 0, net: num(t(x, "TaxedAmount")), vat: num(t(x, "Amount")) ?? 0, cat: "" }));
  vatLines = vatLines.map((x) => ({ ...x, gross: r2((x.net || 0) + (x.vat || 0)) }));
  const vat = vatLines.length ? r2(vatLines.reduce((s, x) => s + (x.vat || 0), 0)) : null, gross = num(t(root, "TotalGrossAmount"));
  const bt = k(root, "PaymentMethod", "UniversalBankTransaction");
  return {
    syntax: "ebInterface", profile: ns, format: "ebInterface" + (ver ? " " + ver : ""), type: /credit/i.test(root.getAttribute("DocumentType") || "") ? "credit" : "invoice",
    number: t(root, "InvoiceNumber"), date: d102(t(root, "InvoiceDate")), due: d102(t(root, "PaymentConditions", "DueDate")), terms: t(root, "PaymentConditions", "Comment"),
    currency: root.getAttribute("InvoiceCurrency") || "EUR", seller: addr(k(root, "Biller")), buyer: { ...addr(k(root, "InvoiceRecipient")), ref: t(root, "InvoiceRecipient", "OrderReference", "OrderID") },
    net: gross != null && vat != null ? r2(gross - vat) : null, vat, gross, payable: num(t(root, "PayableAmount")) ?? gross, vatLines,
    iban: t(bt, "BeneficiaryAccount", "IBAN").replace(/\s/g, ""), bic: t(bt, "BeneficiaryAccount", "BIC"), ref: t(bt, "PaymentReference"), notes: [t(root, "Comment")].filter(Boolean), lines
  };
}
export function parseEInvoiceXml(text) {
  if (!isEInvoiceXml(text)) return null;
  const dom = new DOMParser().parseFromString(String(text).replace(/^﻿/, ""), "application/xml");
  if (dom.getElementsByTagName("parsererror").length) return null;
  const root = dom.documentElement, ln = root.localName, ns = root.namespaceURI || "";
  let r = null;
  try {
    if (ln === "CrossIndustryInvoice") r = parseCII(root);
    else if (ln === "CrossIndustryDocument") r = parseZF1(root);
    else if (/ebinterface/i.test(ns) && ln === "Invoice") r = parseEbi(root);
    else if (/ubl/i.test(ns) && (ln === "Invoice" || ln === "CreditNote")) r = parseUBL(root);
  } catch { return null; }
  if (!r) return null;
  if (r.gross == null && r.payable != null) r.gross = r.payable;
  if (r.net == null && r.gross != null && r.vat != null) r.net = r2(r.gross - r.vat);
  if (r.vat == null && r.gross != null && r.net != null) r.vat = r2(r.gross - r.net);
  if (r.gross == null || !r.number) return null;   // ohne Betrag/Nummer → KI soll ran
  return r;
}

// eingebettete Dateien (Names/EmbeddedFiles + AF) eines PDFs
const pdfStr = (o) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : "");
export async function pdfEmbeddedXml(bytes) {
  let pdf; try { pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false }); } catch { return []; }
  const ctx = pdf.context, specs = [];
  const look = (o) => (o ? ctx.lookup(o) : null);
  const walk = (node, depth = 0) => {
    node = look(node); if (!(node instanceof PDFDict) || depth > 8) return;
    const names = look(node.get(PDFName.of("Names"))); if (names instanceof PDFArray) for (let i = 1; i < names.size(); i += 2) specs.push(look(names.get(i)));
    const kidsA = look(node.get(PDFName.of("Kids"))); if (kidsA instanceof PDFArray) for (let i = 0; i < kidsA.size(); i++) walk(kidsA.get(i), depth + 1);
  };
  try { const n = look(pdf.catalog.get(PDFName.of("Names"))); if (n instanceof PDFDict) walk(n.get(PDFName.of("EmbeddedFiles"))); } catch {}
  try { const af = look(pdf.catalog.get(PDFName.of("AF"))); if (af instanceof PDFArray) for (let i = 0; i < af.size(); i++) specs.push(look(af.get(i))); } catch {}
  const out = [], seen = new Set();
  for (const fs of specs) {
    if (!(fs instanceof PDFDict)) continue;
    const name = pdfStr(look(fs.get(PDFName.of("UF")))) || pdfStr(look(fs.get(PDFName.of("F")))) || "";
    const ef = look(fs.get(PDFName.of("EF"))); if (!(ef instanceof PDFDict)) continue;
    const st = look(ef.get(PDFName.of("F")) || ef.get(PDFName.of("UF"))); if (!st || seen.has(st)) continue; seen.add(st);
    if (!/\.xml$/i.test(name) && name) continue;
    try { const raw = st instanceof PDFRawStream ? decodePDFRawStream(st).decode() : st.getContents?.(); if (raw) out.push({ name, xml: new TextDecoder("utf-8").decode(raw) }); } catch {}
  }
  const pri = (n) => (/factur-x|zugferd|xrechnung/i.test(n) ? 0 : 1);
  return out.sort((a, b) => pri(a.name) - pri(b.name));
}
// Einstieg: Blob/File → { data, xml, xmlName, source } oder null
export async function readEInvoice(blob, name = "") {
  try {
    if (/pdf$/i.test(blob.type) || /\.pdf$/i.test(name)) {
      for (const a of await pdfEmbeddedXml(new Uint8Array(await blob.arrayBuffer()))) { const d = parseEInvoiceXml(a.xml); if (d) return { data: d, xml: a.xml, xmlName: a.name || "rechnung.xml", source: "pdf" }; }
      return null;
    }
    if (/xml/i.test(blob.type) || /\.xml$/i.test(name)) { const x = await blob.text(); const d = parseEInvoiceXml(x); return d ? { data: d, xml: x, xmlName: name || "rechnung.xml", source: "xml" } : null; }
  } catch {}
  return null;
}

/* ---------------- Lesbare PDF-Ansicht für reine XML-Rechnungen (XML wird eingebettet) ---------------- */
const WA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const safe = (s) => String(s ?? "").replace(/[\t\r]/g, " ").split("").map((c) => (c.charCodeAt(0) < 256 || WA.includes(c) ? c : (c.normalize("NFD").replace(/[̀-ͯ]/g, "") || "?").replace(/[^\x00-\xff]/g, "?"))).join("");
const money = (v, cur = "EUR") => (v == null ? "–" : new Intl.NumberFormat("de-AT", { style: "currency", currency: /^[A-Z]{3}$/.test(cur) ? cur : "EUR" }).format(v));
const dAT = (iso) => (iso ? iso.split("-").reverse().join(".") : "–");
const UNIT_TXT = { H87: "Stk", C62: "Stk", EA: "Stk", HUR: "Std", DAY: "Tag", MON: "Monat", KMT: "km", MTR: "m", MTK: "m²", KGM: "kg", LTR: "l", LS: "Pausch.", MIN: "Min", XPP: "Stk" };
export async function eInvoiceViewPdf(data, xml, xmlName = "rechnung.xml") {
  const pdf = await PDFDocument.create(), F = await pdf.embedFont(StandardFonts.Helvetica), B = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 50, grey = rgb(0.4, 0.42, 0.46), line = rgb(0.85, 0.86, 0.88), cur = data.currency;
  let pg = pdf.addPage([W, H]), y = H - M;
  const wrap = (s, w, f = F, size = 9) => { const out = []; for (const para of safe(s).split("\n")) { let l = ""; for (const wd of para.split(" ")) { const tt = l ? l + " " + wd : wd; if (f.widthOfTextAtSize(tt, size) > w && l) { out.push(l); l = wd; } else l = tt; } out.push(l); } return out; };
  const txt = (s, x, yy, o = {}) => pg.drawText(safe(s), { x, y: yy, size: o.size || 9, font: o.bold ? B : F, color: o.color || rgb(0.1, 0.1, 0.12) });
  const need = (h) => { if (y - h < M + 20) { pg = pdf.addPage([W, H]); y = H - M; } };
  txt(data.type === "credit" ? "Gutschrift" : "Rechnung", M, y, { size: 18, bold: true }); txt(`Ansicht der E-Rechnung (${data.format})`, M, y - 16, { size: 8.5, color: grey });
  txt("Nr. " + data.number, W - M - 160, y, { size: 11, bold: true }); txt("Datum: " + dAT(data.date), W - M - 160, y - 15); if (data.due) txt("Fällig: " + dAT(data.due), W - M - 160, y - 28);
  y -= 56;
  const block = (title, p, x) => { if (!p) return 0; txt(title, x, y, { size: 8, color: grey }); const l = [p.name, p.street, [p.zip, p.city].filter(Boolean).join(" "), p.country, p.uid && "UID: " + p.uid, p.email, p.ref && "Referenz: " + p.ref].filter(Boolean); l.forEach((s, i) => txt(s, x, y - 13 - i * 12, { bold: i === 0 })); return l.length; };
  const n = Math.max(block("Rechnungssteller", data.seller, M), block("Rechnungsempfänger", data.buyer, W / 2 + 10)); y -= 22 + n * 12;
  const cols = [M, M + 250, M + 300, M + 360, M + 420, W - M];
  pg.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 16, color: rgb(0.94, 0.95, 0.96) });
  ["Bezeichnung", "Menge", "Einheit", "Einzelpreis", "USt %", "Betrag"].forEach((h, i) => (i === 5 ? txt(h, W - M - B.widthOfTextAtSize(h, 8.5) - 4, y, { size: 8.5, bold: true }) : txt(h, cols[i] + 4, y, { size: 8.5, bold: true }))); y -= 18;
  for (const li of data.lines || []) {
    const ls = wrap(li.name || "Position", 240); need(ls.length * 11 + 6);
    ls.forEach((s, i) => txt(s, M + 4, y - i * 11));
    txt(String(li.qty ?? "").replace(".", ","), cols[1] + 4, y); txt(UNIT_TXT[li.unit] || li.unit || "", cols[2] + 4, y); txt(li.price != null ? money(li.price, cur) : "", cols[3] + 4, y); txt(li.rate != null ? String(li.rate).replace(".", ",") : "", cols[4] + 4, y);
    const a = money(li.total, cur); txt(a, W - M - F.widthOfTextAtSize(safe(a), 9) - 4, y);
    y -= ls.length * 11 + 5; pg.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.5, color: line });
  }
  need(110); y -= 8;
  const sumRow = (l, v, bold) => { txt(l, W - M - 220, y, { bold }); const s = money(v, cur); txt(s, W - M - (bold ? B : F).widthOfTextAtSize(safe(s), 9) - 4, y, { bold }); y -= 14; };
  sumRow("Netto", data.net);
  for (const v of data.vatLines || []) sumRow(`USt ${String(v.rate).replace(".", ",")} %${v.net != null ? " von " + money(v.net, cur) : ""}`, v.vat);
  sumRow("Gesamt", data.gross, true); if (data.payable != null && Math.abs(data.payable - data.gross) > 0.005) sumRow("Zahlbetrag", data.payable, true);
  y -= 8;
  const info = [data.iban && `IBAN: ${data.iban}${data.bic ? "  ·  BIC: " + data.bic : ""}`, data.ref && "Zahlungsreferenz: " + data.ref, data.terms, ...(data.vatLines || []).map((v) => v.reason).filter(Boolean), ...(data.notes || [])].filter(Boolean);
  for (const s of info) for (const l of wrap(s, W - 2 * M)) { need(12); txt(l, M, y, { color: grey }); y -= 12; }
  pdf.getPages().forEach((p, i, a) => p.drawText(safe(`Erzeugt von FinDocu aus ${xmlName} · Original-XML ist in dieser PDF eingebettet${a.length > 1 ? ` · Seite ${i + 1}/${a.length}` : ""}`), { x: M, y: 28, size: 7, font: F, color: grey }));
  await pdf.attach(new TextEncoder().encode(xml), xmlName.replace(/[\\/]/g, "_") || "rechnung.xml", { mimeType: "application/xml", description: "Original E-Rechnung (" + data.format + ")", afRelationship: AFRelationship.Source, creationDate: new Date(), modificationDate: new Date() });
  pdf.setTitle(`${data.type === "credit" ? "Gutschrift" : "Rechnung"} ${data.number} – ${data.seller?.name || ""}`); pdf.setProducer("FinDocu");
  return new Blob([await pdf.save()], { type: "application/pdf" });
}

/* ---------------- Schreiben ---------------- */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const amt = (v) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
const qty = (v) => String(Math.round((Number(v) || 0) * 10000) / 10000);
const ymd = (iso) => (iso || "").replace(/-/g, "");
const UNIT_CODES = { stk: "H87", "stück": "H87", std: "HUR", h: "HUR", stunde: "HUR", "pausch.": "LS", pauschale: "LS", tag: "DAY", km: "KMT", m: "MTR", "m²": "MTK", m2: "MTK", kg: "KGM", monat: "MON", l: "LTR" };
const unitCode = (u) => UNIT_CODES[String(u || "").trim().toLowerCase()] || "C62";
const COUNTRY = { "österreich": "AT", austria: "AT", deutschland: "DE", germany: "DE", schweiz: "CH", switzerland: "CH", italien: "IT", italy: "IT", liechtenstein: "LI", ungarn: "HU", tschechien: "CZ", slowenien: "SI", slowakei: "SK" };
export function splitAddress(text, fallbackCountry = "AT") {
  const ls = String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  let zip = "", city = "", country = fallbackCountry, street = "";
  for (const l of ls) {
    const c = COUNTRY[l.toLowerCase()]; if (c) { country = c; continue; }
    const m = l.match(/^(?:([A-Z]{1,2})[- ])?(\d{4,5})\s+(.+)$/); if (m && !zip) { zip = m[2]; city = m[3]; if (m[1]) country = m[1] === "D" ? "DE" : m[1] === "A" ? "AT" : m[1] === "CH" ? "CH" : m[1]; if (/^\d{5}$/.test(zip) && !m[1]) country = "DE"; continue; }
    if (!street) street = l;
  }
  return { street, zip, city, country };
}
export function invoiceModel(inv, co, kuNote) {
  const items = (inv.items || []).filter((it) => (it.text || "").trim() || Number(it.price)).map((it, i) => ({ id: i + 1, name: String(it.text || "Position").split("\n")[0].slice(0, 200), desc: String(it.text || "").split("\n").slice(1).join(" ").trim(),
    qty: Number(it.qty) || 0, unit: unitCode(it.unit), price: Number(it.price) || 0, total: Math.round((Number(it.qty) || 0) * (Number(it.price) || 0) * 100) / 100 }));
  const lineSum = Math.round(items.reduce((s, x) => s + x.total, 0) * 100) / 100, fee = Number(inv.fee) || 0, total = Math.round((lineSum + fee) * 100) / 100;
  const ca = splitAddress(inv.customer?.address), sa = { street: co.street || "", zip: co.zip || "", city: co.city || "", country: co.country || "AT" };
  const due = inv.date ? new Date(new Date(inv.date + "T12:00:00").getTime() + (Number(inv.dueDays ?? co.dueDays ?? 14)) * 864e5).toLocaleDateString("sv-SE") : "";
  return { items, lineSum, fee, total, ca, sa, due, note: kuNote, credit: false };
}
export function buildCII(inv, co, { kuNote, xrechnung = false } = {}) {
  const m = invoiceModel(inv, co, kuNote), c = inv.customer || {};
  const guide = xrechnung ? "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0" : "urn:cen.eu:en16931:2017";
  const tax = (base) => `<ram:ApplicableTradeTax><ram:CalculatedAmount>0.00</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:ExemptionReason>${esc(kuNote)}</ram:ExemptionReason><ram:BasisAmount>${amt(base)}</ram:BasisAmount><ram:CategoryCode>E</ram:CategoryCode><ram:RateApplicablePercent>0</ram:RateApplicablePercent></ram:ApplicableTradeTax>`;
  const addr = (a) => `<ram:PostalTradeAddress>${a.zip ? `<ram:PostcodeCode>${esc(a.zip)}</ram:PostcodeCode>` : ""}${a.street ? `<ram:LineOne>${esc(a.street)}</ram:LineOne>` : ""}${a.city ? `<ram:CityName>${esc(a.city)}</ram:CityName>` : ""}<ram:CountryID>${esc(a.country || "AT")}</ram:CountryID></ram:PostalTradeAddress>`;
  const sellerTax = co.uid ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(co.uid.replace(/\s/g, ""))}</ram:ID></ram:SpecifiedTaxRegistration>` : co.taxNo ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(co.taxNo)}</ram:ID></ram:SpecifiedTaxRegistration>` : "";
  const lines = m.items.map((x) => `<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>${x.id}</ram:LineID></ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct><ram:Name>${esc(x.name)}</ram:Name>${x.desc ? `<ram:Description>${esc(x.desc)}</ram:Description>` : ""}</ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${amt(x.price)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${x.unit}">${qty(x.qty)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>E</ram:CategoryCode><ram:RateApplicablePercent>0</ram:RateApplicablePercent></ram:ApplicableTradeTax><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(x.total)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`).join("");
  const charge = m.fee ? `<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>true</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>${amt(m.fee)}</ram:ActualAmount><ram:Reason>Gebühren</ram:Reason><ram:CategoryTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>E</ram:CategoryCode><ram:RateApplicablePercent>0</ram:RateApplicablePercent></ram:CategoryTradeTax></ram:SpecifiedTradeAllowanceCharge>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocumentContext>${xrechnung ? `<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>` : ""}<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${guide}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument><ram:ID>${esc(inv.number)}</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${ymd(inv.date)}</udt:DateTimeString></ram:IssueDateTime><ram:IncludedNote><ram:Content>${esc(kuNote)}</ram:Content></ram:IncludedNote></rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>${lines}
<ram:ApplicableHeaderTradeAgreement><ram:BuyerReference>${esc(c.leitwegId || c.number || inv.number)}</ram:BuyerReference><ram:SellerTradeParty><ram:Name>${esc(co.name || co.owner)}</ram:Name><ram:DefinedTradeContact><ram:PersonName>${esc(co.owner || co.name)}</ram:PersonName>${co.phone ? `<ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(co.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : ""}${co.email ? `<ram:EmailURIUniversalCommunication><ram:URIID>${esc(co.email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : ""}</ram:DefinedTradeContact>${addr(m.sa)}${co.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(co.email)}</ram:URIID></ram:URIUniversalCommunication>` : ""}${sellerTax}</ram:SellerTradeParty><ram:BuyerTradeParty><ram:Name>${esc(c.name || "Kunde")}</ram:Name>${addr(m.ca)}${c.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(c.email)}</ram:URIID></ram:URIUniversalCommunication>` : ""}${c.uid ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(c.uid.replace(/\s/g, ""))}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}</ram:BuyerTradeParty></ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${ymd(inv.deliveryDate || inv.date)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>
<ram:ApplicableHeaderTradeSettlement><ram:PaymentReference>${esc(inv.number)}</ram:PaymentReference><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>${co.iban ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(co.iban.replace(/\s/g, ""))}</ram:IBANID><ram:AccountName>${esc(co.owner || co.name)}</ram:AccountName></ram:PayeePartyCreditorFinancialAccount>${co.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(co.bic.replace(/\s/g, ""))}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}</ram:SpecifiedTradeSettlementPaymentMeans>` : ""}${tax(m.total)}${charge}<ram:SpecifiedTradePaymentTerms><ram:Description>${esc(m.due ? "Zahlbar bis " + m.due.split("-").reverse().join(".") + " ohne Abzug" : "Zahlbar ohne Abzug")}</ram:Description>${m.due ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${ymd(m.due)}</udt:DateTimeString></ram:DueDateDateTime>` : ""}</ram:SpecifiedTradePaymentTerms><ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${amt(m.lineSum)}</ram:LineTotalAmount>${m.fee ? `<ram:ChargeTotalAmount>${amt(m.fee)}</ram:ChargeTotalAmount>` : ""}<ram:TaxBasisTotalAmount>${amt(m.total)}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount><ram:GrandTotalAmount>${amt(m.total)}</ram:GrandTotalAmount><ram:DuePayableAmount>${amt(m.total)}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}
export function buildEbInterface(inv, co, { kuNote } = {}) {
  const m = invoiceModel(inv, co, kuNote), c = inv.customer || {};
  const country = (cc) => `<Country CountryCode="${esc(cc || "AT")}">${esc({ AT: "Österreich", DE: "Deutschland", CH: "Schweiz" }[cc] || cc || "Österreich")}</Country>`;
  const address = (name, a, email) => `<Address><Name>${esc(name)}</Name><Street>${esc(a.street || "-")}</Street><Town>${esc(a.city || "-")}</Town><ZIP>${esc(a.zip || "0000")}</ZIP>${country(a.country)}${email ? `<Email>${esc(email)}</Email>` : ""}</Address>`;
  const taxItem = (base) => `<TaxItem><TaxableAmount>${amt(base)}</TaxableAmount><TaxPercent TaxCategoryCode="E">0</TaxPercent><TaxAmount>0.00</TaxAmount></TaxItem>`;
  const items = m.items.map((x) => `<ListLineItem><PositionNumber>${x.id}</PositionNumber><Description>${esc(x.name + (x.desc ? " – " + x.desc : ""))}</Description><Quantity Unit="${x.unit}">${qty(x.qty)}</Quantity><UnitPrice>${amt(x.price)}</UnitPrice>${taxItem(x.total)}<LineItemAmount>${amt(x.total)}</LineItemAmount></ListLineItem>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://www.ebinterface.at/schema/6p1/" GeneratingSystem="FinDocu" DocumentType="Invoice" InvoiceCurrency="EUR" Language="de">
<InvoiceNumber>${esc(inv.number)}</InvoiceNumber><InvoiceDate>${esc(inv.date)}</InvoiceDate>
<Delivery><Date>${esc(inv.deliveryDate || inv.date)}</Date></Delivery>
<Biller><VATIdentificationNumber>${esc((co.uid || "00000000").replace(/\s/g, ""))}</VATIdentificationNumber>${address(co.name || co.owner, m.sa, co.email)}</Biller>
<InvoiceRecipient><VATIdentificationNumber>${esc((c.uid || "00000000").replace(/\s/g, ""))}</VATIdentificationNumber>${address(c.name || "Kunde", m.ca, c.email)}${c.number ? `<BillersInvoiceRecipientID>${esc(c.number)}</BillersInvoiceRecipientID>` : ""}</InvoiceRecipient>
<Details><ItemList>${items}</ItemList></Details>${m.fee ? `
<ReductionAndSurchargeDetails><Surcharge><BaseAmount>${amt(m.lineSum)}</BaseAmount><Amount>${amt(m.fee)}</Amount><Comment>Gebühren</Comment><TaxItem><TaxableAmount>${amt(m.fee)}</TaxableAmount><TaxPercent TaxCategoryCode="E">0</TaxPercent><TaxAmount>0.00</TaxAmount></TaxItem></Surcharge></ReductionAndSurchargeDetails>` : ""}
<Tax><TaxItem><TaxableAmount>${amt(m.total)}</TaxableAmount><TaxPercent TaxCategoryCode="E">0</TaxPercent><TaxAmount>0.00</TaxAmount><Comment>${esc(kuNote)}</Comment></TaxItem></Tax>
<TotalGrossAmount>${amt(m.total)}</TotalGrossAmount><PayableAmount>${amt(m.total)}</PayableAmount>
${co.iban ? `<PaymentMethod><UniversalBankTransaction><BeneficiaryAccount>${co.bic ? `<BIC>${esc(co.bic.replace(/\s/g, ""))}</BIC>` : ""}<IBAN>${esc(co.iban.replace(/\s/g, ""))}</IBAN><BankAccountOwner>${esc(co.owner || co.name)}</BankAccountOwner></BeneficiaryAccount><PaymentReference>${esc(inv.number)}</PaymentReference></UniversalBankTransaction></PaymentMethod>` : `<PaymentMethod><NoPayment/></PaymentMethod>`}
${m.due ? `<PaymentConditions><DueDate>${m.due}</DueDate></PaymentConditions>` : ""}
<Comment>${esc(kuNote)}</Comment>
</Invoice>`;
}
// Factur-X/ZUGFeRD: XML ins Rechnungs-PDF einbetten (+ XMP-Kennzeichnung)
export async function embedFacturX(pdfBlob, xml, { title = "", author = "" } = {}) {
  const pdf = await PDFDocument.load(await pdfBlob.arrayBuffer(), { updateMetadata: false });
  const now = new Date();
  await pdf.attach(new TextEncoder().encode(xml), "factur-x.xml", { mimeType: "text/xml", description: "Factur-X / ZUGFeRD Rechnung (EN 16931)", afRelationship: AFRelationship.Alternative, creationDate: now, modificationDate: now });
  const iso = now.toISOString().replace(/\.\d+Z$/, "Z");
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title><dc:creator><rdf:Seq><rdf:li>${esc(author)}</rdf:li></rdf:Seq></dc:creator></rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>FinDocu</xmp:CreatorTool><xmp:CreateDate>${iso}</xmp:CreateDate><xmp:ModifyDate>${iso}</xmp:ModifyDate></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>FinDocu</pdf:Producer></rdf:Description>
<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#"><pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource"><pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema><pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI><pdfaSchema:prefix>fx</pdfaSchema:prefix><pdfaSchema:property><rdf:Seq>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>Name of the embedded XML invoice file</pdfaProperty:description></rdf:li>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>INVOICE</pdfaProperty:description></rdf:li>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>Version of the Factur-X XML schema</pdfaProperty:description></rdf:li>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>Conformance level of the embedded XML</pdfaProperty:description></rdf:li>
</rdf:Seq></pdfaSchema:property></rdf:li></rdf:Bag></pdfaExtension:schemas></rdf:Description>
</rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
  const stream = pdf.context.stream(new TextEncoder().encode(xmp), { Type: "Metadata", Subtype: "XML" });
  pdf.catalog.set(PDFName.of("Metadata"), pdf.context.register(stream));
  if (title) pdf.setTitle(title); if (author) pdf.setAuthor(author); pdf.setProducer("FinDocu"); pdf.setCreator("FinDocu");
  return new Blob([await pdf.save()], { type: "application/pdf" });
}
