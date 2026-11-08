// Artikel-Infos zu einem gescannten Strichcode (EAN/UPC) oder QR-Code.
// 1) Open Food/Products/Beauty Facts (frei, ohne Schlüssel)  2) Claude mit Websuche
// Umgebungsvariablen: ANTHROPIC_API_KEY (Pflicht für die Websuche), APP_TOKEN (optional), CLAUDE_MODEL (optional)
export const config = { maxDuration: 60 };

const OFF = ["world.openfoodfacts.org", "world.openproductsfacts.org", "world.openbeautyfacts.org"];

async function openFacts(code) {
  for (const host of OFF) {
    try {
      const r = await fetch(`https://${host}/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_de,brands,quantity,categories,generic_name_de,generic_name`, {
        headers: { "user-agent": "FinDocu/1.0 (Artikelscan)" }, signal: AbortSignal.timeout(6000)
      });
      if (!r.ok) continue;
      const j = await r.json();
      const p = j?.product;
      if (j?.status === 1 && p && (p.product_name_de || p.product_name)) {
        const name = [p.brands?.split(",")[0], p.product_name_de || p.product_name, p.quantity].filter(Boolean).join(" ");
        return { found: true, name, brand: p.brands || "", description: p.generic_name_de || p.generic_name || "", category: (p.categories || "").split(",")[0] || "", source: host };
      }
    } catch {}
  }
  return null;
}

async function claudeLookup(code, format, base) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
  const isUrl = /^https?:\/\//i.test(code);
  const prompt = `Ein Kleinunternehmer in Österreich (Elektro/Handwerk) hat beim Anlegen eines Artikels folgenden ${format || "Code"} gescannt:\n${code}\n` +
    (base ? `Bereits bekannt: ${JSON.stringify(base)}\n` : "") +
    (isUrl ? "Es ist ein Link – öffne bzw. suche die Seite und finde das Produkt.\n" : "Suche im Web nach diesem Code (EAN/GTIN, Herstellernummer).\n") +
    `Antworte NUR mit einem JSON-Objekt ohne weiteren Text:\n{"found":true|false,"name":"kurze Artikelbezeichnung für eine Rechnung (Marke + Produkt + Größe)","brand":"","manufacturer_number":"Hersteller-Artikelnummer falls gefunden","description":"1 Satz","category":"z. B. Beleuchtung, Kabel, Werkzeug","unit":"Stk|m|Pausch.|kg|…","price_eur":Zahl oder null (üblicher Brutto-Verkaufspreis in Österreich/Deutschland),"price_source":"Händler/Seite","url":"Quelle"}\nWenn du das Produkt nicht sicher findest: {"found":false}.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 2000, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }], messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(50000)
  });
  const j = await r.json();
  if (!r.ok) return { error: j?.error?.message || "Claude-API-Fehler" };
  const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const m = text.match(/\{[\s\S]*\}/g);
  for (const s of (m || []).reverse()) { try { return JSON.parse(s); } catch {} }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST" });
  const token = process.env.APP_TOKEN;
  if (token && req.headers["x-app-token"] !== token) return res.status(401).json({ error: "Zugangscode falsch" });
  const { code = "", format = "" } = req.body || {};
  const c = String(code).trim().slice(0, 500);
  if (!c) return res.status(400).json({ error: "Kein Code" });
  const digits = /^\d{8,14}$/.test(c);
  const base = digits ? await openFacts(c) : null;
  let ai = null;
  try { ai = await claudeLookup(c, format, base); } catch (e) { ai = { error: String(e.message || e) }; }
  if (ai?.error && !base) return res.status(502).json({ error: ai.error });
  const out = { code: c, ...(base || {}), ...(ai && ai.found ? Object.fromEntries(Object.entries(ai).filter(([, v]) => v !== "" && v != null)) : {}) };
  out.found = !!(base?.found || ai?.found);
  if (!out.source) out.source = ai?.found ? "Websuche" : "";
  return res.status(200).json(out);
}
