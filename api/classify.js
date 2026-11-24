import { callTool } from "./_claude.js";
// Vercel Function: schätzt für Buchungen bzw. Kontoauszug-Zeilen ein, ob sie Firma, Privat oder unklar sind.
// Eingabe: { items: [{ i, date, amount, counterparty, purpose, category, account, accountUse }], business: "Beschreibung der Firma" }
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST" });
  const token = process.env.APP_TOKEN;
  if (token && req.headers["x-app-token"] !== token) return res.status(401).json({ error: "Falscher App-Token" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY fehlt in Vercel – unter Settings → Environment Variables eintragen und danach neu deployen" });

  const { items, business } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "items erforderlich" });
  const list = items.slice(0, 400).map((x) => ({
    i: x.i, datum: x.date, betrag: x.amount, empfaenger: String(x.counterparty || "").slice(0, 80), zweck: String(x.purpose || "").slice(0, 160),
    kategorie: x.category || "", konto: x.account || "", konto_verwendung: x.accountUse || ""
  }));
  const content = [{ type: "text", text:
`Du hilfst einer Einzelperson in Österreich, ihre Bankbuchungen für den Steuerberater zu sortieren.
Die Person ist privat UND betreibt nebenbei eine eigene Firma${business ? `: ${String(business).slice(0, 400)}` : ""}.

Ordne jede Buchung ein:
- "firma": klar betrieblich (Wareneinkauf, Werkzeug, Büro, Software für die Firma, Firmen-Telefon, Zahlungseingang von Kunden, Steuer/SVS-Zahlungen, Bankgebühren des Firmenkontos …)
- "privat": klar privat (Lebensmittel, Gehalt vom Arbeitgeber, Miete der Wohnung, Freizeit, Kleidung, Urlaub, private Versicherungen …)
- "unklar": kann beides sein (Amazon, Tankstelle, Elektronik, Handy, Baumarkt …) – dann im Grund kurz schreiben, was der Steuerberater wissen müsste.
- konto_verwendung "firma" heißt Firmenkonto: dann im Zweifel "firma". Bei "privat" im Zweifel "privat", außer es ist eindeutig betrieblich.
- Umbuchungen zwischen eigenen Konten: "privat" mit Grund "Umbuchung".
Grund: höchstens 8 Wörter, deutsch. Nichts erfinden.
Rufe das Tool zuordnung_speichern auf.

Buchungen (JSON):
${JSON.stringify(list)}` }];

  const tool = {
    name: "zuordnung_speichern",
    description: "Speichert die Zuordnung Firma/Privat je Buchung.",
    input_schema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: { i: { type: "integer" }, scope: { type: "string", enum: ["firma", "privat", "unklar"] }, reason: { type: ["string", "null"] } },
            required: ["i", "scope"]
          }
        }
      },
      required: ["results"]
    }
  };
  try {
    const out = await callTool({ tool, content, maxTokens: 16000 });
    if (out.error) return res.status(out.status || 500).json({ error: out.error });
    return res.status(200).json(out.data);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
