// Vercel Function: liest Kontoauszüge/Depotauszüge, die kein Standardformat haben
// (PDF, Foto, exotisches CSV/TXT) mit Claude aus und liefert Umsätze als JSON.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST" });
  const token = process.env.APP_TOKEN;
  if (token && req.headers["x-app-token"] !== token) return res.status(401).json({ error: "Falscher App-Token" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY fehlt in Vercel" });

  const { data, mediaType, text } = req.body || {};
  if (!data && !text) return res.status(400).json({ error: "data oder text erforderlich" });

  const content = [];
  if (data && mediaType === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
  else if (data) content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
  else content.push({ type: "text", text: "Exportdatei:\n\n" + String(text).slice(0, 180000) });
  content.push({ type: "text", text:
`Extrahiere ALLE Buchungen aus diesem Konto-, Kreditkarten- oder Depotauszug (Kontext Österreich/DE).
- amount mit Vorzeichen: Abgang/Belastung/Kauf negativ, Eingang/Gutschrift/Verkauf/Dividende positiv.
- Österreichische Zahlen (1.234,56) korrekt umrechnen. Datum YYYY-MM-DD.
- Bei Wertpapieren kind="broker" und type (Kauf, Verkauf, Dividende, Zinsen, Einzahlung, Auszahlung, Gebühr, Steuer), ISIN, Stück, Kurs.
- Keine Salden-/Summenzeilen, nichts erfinden.
Rufe das Tool umsaetze_speichern auf.` });

  const tool = {
    name: "umsaetze_speichern",
    description: "Speichert die extrahierten Buchungen.",
    input_schema: {
      type: "object",
      properties: {
        institution: { type: ["string", "null"] },
        account_iban: { type: ["string", "null"] },
        transactions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string" }, value_date: { type: ["string", "null"] }, amount: { type: "number" },
              currency: { type: "string" }, counterparty: { type: ["string", "null"] }, iban: { type: ["string", "null"] },
              purpose: { type: ["string", "null"] }, kind: { type: "string", enum: ["bank", "broker"] },
              type: { type: ["string", "null"] }, isin: { type: ["string", "null"] }, security: { type: ["string", "null"] },
              shares: { type: ["number", "null"] }, price: { type: ["number", "null"] }, fee: { type: ["number", "null"] }, tax: { type: ["number", "null"] }
            },
            required: ["date", "amount", "kind"]
          }
        }
      },
      required: ["transactions"]
    }
  };

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5", max_tokens: 32000,
        tools: [tool], tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content }]
      })
    });
    const json = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: json?.error?.message || "Claude-API-Fehler" });
    const use = json.content?.find((c) => c.type === "tool_use");
    if (!use) return res.status(502).json({ error: "Keine strukturierte Antwort" });
    return res.status(200).json(use.input);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
