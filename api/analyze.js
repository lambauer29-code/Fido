// Vercel Serverless Function: schickt ein Dokument (PDF oder Bild) an Claude
// und bekommt strukturierte Metadaten zurück. Der API-Key bleibt am Server.
//
// Env-Variablen in Vercel:
//   ANTHROPIC_API_KEY  (Pflicht)
//   APP_TOKEN          (empfohlen – sonst kann jeder mit der URL deinen Key nutzen)
//   CLAUDE_MODEL       (optional, Standard: claude-sonnet-5-5)

const DOC_TYPES = ["Rechnung", "Vertrag", "Bescheid", "Lohnzettel", "Kontoauszug", "Polizze", "Beleg", "Brief", "Sonstiges"];

const tool = (categories) => ({
  name: "dokument_speichern",
  description: "Speichert die aus dem Dokument extrahierten Metadaten.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Kurzer, sprechender Titel, z. B. 'Stromrechnung Oktober 2026 – Energie AG'" },
      category: { type: "string", enum: categories },
      doc_type: { type: "string", enum: DOC_TYPES },
      tags: { type: "array", items: { type: "string" }, description: "3–6 kurze Schlagwörter, kleingeschrieben" },
      sender: { type: ["string", "null"], description: "Absender / Firma / Behörde" },
      document_date: { type: ["string", "null"], description: "Datum des Dokuments, YYYY-MM-DD" },
      summary: { type: "string", description: "1–2 Sätze, worum es geht" },
      amount: {
        type: ["object", "null"],
        description: "Nur wenn das Dokument einen zu zahlenden oder erhaltenen Betrag enthält. Zahlen als Dezimalzahl (Punkt).",
        properties: {
          total: { type: ["number", "null"], description: "Bruttobetrag / Endsumme" },
          net: { type: ["number", "null"] },
          vat: { type: ["number", "null"], description: "USt-Betrag" },
          currency: { type: "string", description: "ISO-Code, meist EUR" }
        }
      },
      deadlines: {
        type: "array",
        description: "Alle konkreten Fristen: Zahlungsfrist, Kündigungsfrist, Einspruchsfrist, Vertragsende, Garantieende, Termin …",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD" },
            label: { type: "string", description: "z. B. 'Zahlung fällig' oder 'Kündigung bis'" }
          },
          required: ["date", "label"]
        }
      },
      direction: {
        type: "string", enum: ["ausgabe", "einnahme", "keine"],
        description: "ausgabe = ich muss zahlen / habe bezahlt (Rechnung, Kassabon); einnahme = Geld kommt zu mir (Lohnzettel, Gutschrift, Steuerrückzahlung); keine = reine Info (Kontoauszug, Vertrag ohne Rechnung)"
      },
      area: {
        type: "string", enum: ["finanzen", "vertraege", "sonstiges"],
        description: "finanzen = Rechnung, Kassabon, Beleg, Lohnzettel, Kontoauszug, alles mit Geldfluss für die Ausgaben-/Einnahmen-Analyse; vertraege = Vertrag, Polizze, AGB, Vertragsänderung, Kündigung; sonstiges = alles ohne Bezug zur Finanzanalyse (Zeugnis, Ausweis, Arztbrief, Bedienungsanleitung, private Briefe, Behördeninfo ohne Betrag)"
      },
      tax_relevant: { type: "boolean", description: "Relevant für die österreichische Arbeitnehmerveranlagung/Steuer (Lohnzettel L16, Werbungskosten, Sonderausgaben, außergewöhnliche Belastungen, Spenden, Kirchenbeitrag, Handwerkerbonus, Bescheide vom Finanzamt …)" },
      payment: {
        type: ["object", "null"],
        description: "Nur bei offener Zahlung per Überweisung (nicht bei Lastschrift/bereits bezahlt).",
        properties: {
          recipient: { type: ["string", "null"], description: "Empfängername laut Rechnung" },
          iban: { type: ["string", "null"], description: "IBAN ohne Leerzeichen" },
          bic: { type: ["string", "null"] },
          reference: { type: ["string", "null"], description: "Zahlungsreferenz / Verwendungszweck / Rechnungsnummer" }
        }
      },
      contract: {
        type: ["object", "null"],
        description: "Nur wenn das Dokument zu einem laufenden Vertrag/Abo gehört (Vertrag, Polizze, Strom, Handy, Internet, Versicherung, Leasing, Fitnessstudio, Streaming …).",
        properties: {
          provider: { type: "string", description: "Anbieter, z. B. 'Magenta Telekom'" },
          name: { type: ["string", "null"], description: "Tarif/Vertragsbezeichnung" },
          customer_number: { type: ["string", "null"], description: "Kunden-, Vertrags- oder Polizzennummer" },
          amount: { type: ["number", "null"], description: "Regelmäßiger Betrag pro Intervall (brutto)" },
          interval: { type: ["string", "null"], enum: ["monatlich", "vierteljährlich", "halbjährlich", "jährlich", null] },
          start_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
          end_date: { type: ["string", "null"], description: "Nächstes mögliches Vertragsende, YYYY-MM-DD" },
          notice_period: { type: ["string", "null"], description: "Kündigungsfrist im Wortlaut, z. B. '1 Monat zum Monatsende'" },
          cancel_by: { type: ["string", "null"], description: "Letzter Tag für die Kündigung zum nächsten Vertragsende, YYYY-MM-DD" }
        }
      },
      full_text: { type: "string", description: "Der vollständige lesbare Text des Dokuments (für die Volltextsuche), max. ca. 8000 Zeichen" }
    },
    required: ["title", "category", "doc_type", "tags", "summary", "deadlines", "direction", "area", "tax_relevant", "full_text"]
  }
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST" });

  const token = process.env.APP_TOKEN;
  if (token && req.headers["x-app-token"] !== token) {
    return res.status(401).json({ error: "Falscher App-Token (Einstellungen prüfen)" });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY fehlt in Vercel – unter Settings → Environment Variables eintragen und danach neu deployen" });

  const { data, mediaType, categories, today, groups } = req.body || {};
  if (!data || !mediaType) return res.status(400).json({ error: "data und mediaType erforderlich" });
  const cats = Array.isArray(categories) && categories.length ? categories : ["Sonstiges"];

  const fileBlock =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data } };

  const prompt = `Analysiere dieses Dokument (Kontext: Privatperson in Österreich). Heute ist ${today || new Date().toISOString().slice(0, 10)}.
- Wähle die passendste Kategorie aus der vorgegebenen Liste.${groups ? `\n  Die Kategorien des Nutzers sind so gruppiert:\n${groups}` : ""}
- Beträge: Endsumme brutto als "total". Österreichische Schreibweise beachten (1.234,56 € = 1234.56).
- Fristen: rechne relative Angaben ("zahlbar binnen 14 Tagen", "Einspruch binnen 4 Wochen ab Zustellung") ausgehend vom Dokumentdatum in ein konkretes Datum um. Keine erfundenen Fristen.
- Vertrag: bei Verträgen/Abos Anbieter, Kundennummer, regelmäßigen Betrag, Intervall, Vertragsende und Kündigungsfrist erfassen; "cancel_by" aus Vertragsende minus Kündigungsfrist berechnen und zusätzlich als Frist "Kündigung bis" eintragen.
- Zahlung: IBAN/BIC/Zahlungsreferenz nur übernehmen, wenn sie auf dem Dokument stehen – nichts erfinden.
- full_text: den Text so vollständig wie möglich übernehmen.
Rufe das Tool dokument_speichern auf.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
        max_tokens: 8000,
        tools: [tool(cats)],
        tool_choice: { type: "tool", name: "dokument_speichern" },
        messages: [{ role: "user", content: [fileBlock, { type: "text", text: prompt }] }]
      })
    });
    const json = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: json?.error?.message || "Claude-API-Fehler" });
    const use = json.content?.find((c) => c.type === "tool_use");
    if (!use) return res.status(502).json({ error: "Keine strukturierte Antwort erhalten" });
    return res.status(200).json(use.input);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
