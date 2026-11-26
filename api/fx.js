// v0.99.80: Wechselkurs der EZB (Referenzkurs) zu einem Datum – über frankfurter (EZB-Daten), Fallback EZB-XML (aktuell)
// GET /api/fx?cur=USD&date=2026-11-20  → { cur, date, rate (Einheiten Fremdwährung je 1 EUR), source }
// Umgebungsvariablen: APP_TOKEN (optional)
export const config = { maxDuration: 20 };
const ok = (s) => /^[A-Z]{3}$/.test(s);
export default async function handler(req, res) {
  const token = process.env.APP_TOKEN;
  if (token && req.headers["x-app-token"] !== token) return res.status(401).json({ error: "Zugangscode falsch" });
  const cur = String(req.query.cur || "").toUpperCase(), date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? String(req.query.date) : "latest";
  if (!ok(cur)) return res.status(400).json({ error: "Währung fehlt" });
  if (cur === "EUR") return res.status(200).json({ cur, date, rate: 1, source: "EUR" });
  const tries = [`https://api.frankfurter.dev/v1/${date}?base=EUR&symbols=${cur}`, `https://api.frankfurter.app/${date}?from=EUR&to=${cur}`];
  for (const u of tries) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(7000) }); if (!r.ok) continue;
      const j = await r.json(), rate = j?.rates?.[cur];
      if (typeof rate === "number" && rate > 0) { res.setHeader("cache-control", "public, max-age=86400"); return res.status(200).json({ cur, date: j.date || date, rate, source: "EZB-Referenzkurs" }); }
    } catch {}
  }
  // Fallback: aktueller EZB-Tageskurs (nur für die ca. 30 EZB-Währungen)
  try {
    const r = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", { signal: AbortSignal.timeout(7000) });
    const x = await r.text(), m = x.match(new RegExp(`currency=['"]${cur}['"]\\s+rate=['"]([\\d.]+)`)), d = x.match(/time=['"](\d{4}-\d{2}-\d{2})/);
    if (m) return res.status(200).json({ cur, date: d?.[1] || date, rate: +m[1], source: "EZB-Referenzkurs (aktuell)" });
  } catch {}
  return res.status(404).json({ error: `Kein EZB-Kurs für ${cur} – bitte Kurs selbst eintragen` });
}
