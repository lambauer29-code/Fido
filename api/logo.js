// Firmenlogos für Buchungen: Claude ordnet Empfängernamen der offiziellen Website (Domain) zu,
// danach wird das öffentliche Website-Symbol (apple-touch-icon / Favicon) geladen und als Data-URL zurückgegeben.
// POST { items: [{ key, name, purpose? }] }  → { results: [{ key, domain, logo }] }
// Umgebungsvariablen: ANTHROPIC_API_KEY, APP_TOKEN (optional), CLAUDE_MODEL (optional)
import { callTool } from "./_claude.js";
export const config = { maxDuration: 60 };

const UA = "Mozilla/5.0 (FinDocu Logo-Abruf)";
const MAX = 250 * 1024;

async function grab(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "image/*" }, redirect: "follow", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const type = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\//.test(type) || /svg/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 250 || buf.length > MAX) return null; // winzige Platzhalter-Icons verwerfen
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch { return null; }
}
async function iconFor(domain) {
  const d = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const tries = [
    `https://${d}/apple-touch-icon.png`, `https://www.${d.replace(/^www\./, "")}/apple-touch-icon.png`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(d)}.ico`
  ];
  for (const u of tries) { const x = await grab(u); if (x) return x; }
  return null;
}

export default async function handler(req, res) {
  const token = process.env.APP_TOKEN;
  if (token && req.headers["x-app-token"] !== token) return res.status(401).json({ error: "Falscher App-Token" });
  if (req.method !== "POST") return res.status(405).json({ error: "POST erwartet" });
  const items = (req.body?.items || []).filter((x) => x && x.key && x.name).slice(0, 30);
  if (!items.length) return res.json({ results: [] });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY fehlt" });

  const list = items.map((x, i) => `${i + 1}. ${x.name}${x.purpose ? ` (Verwendungszweck: ${String(x.purpose).slice(0, 80)})` : ""}`).join("\n");
  const r = await callTool({
    maxTokens: 3000,
    tool: {
      name: "domains", description: "Ordnet Empfänger von Banküberweisungen der offiziellen Website zu",
      input_schema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: {
        n: { type: "integer", description: "laufende Nummer aus der Liste" },
        domain: { type: ["string", "null"], description: "Domain der offiziellen Website, z. B. billa.at – null bei Privatpersonen, unbekannt oder unsicher" }
      }, required: ["n", "domain"] } } }, required: ["items"] }
    },
    content: [{ type: "text", text:
      "Ordne jeden Empfänger aus österreichischen Kontoauszügen der offiziellen Website des Unternehmens zu (bevorzugt die österreichische Domain, z. B. billa.at, hofer.at, spar.at, magenta.at, a1.net, linzag.at, oebb.at). " +
      "Bei Privatpersonen, Bankomat/Geldautomat, Umbuchungen oder wenn du dir nicht sicher bist: domain = null. Nur die Domain ohne https:// und ohne Pfad.\n\n" + list }]
  });
  if (r.error) return res.status(r.status || 502).json({ error: r.error });
  const map = new Map((r.data?.items || []).map((x) => [x.n, x.domain]));
  const results = await Promise.all(items.map(async (x, i) => {
    const domain = (map.get(i + 1) || "").trim().toLowerCase();
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { key: x.key, domain: null, logo: null };
    return { key: x.key, domain, logo: await iconFor(domain) };
  }));
  res.json({ results });
}
