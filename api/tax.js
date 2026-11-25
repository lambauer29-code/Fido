// Steuerberater-Berichte: KI mit Websuche nach aktuellem österreichischem Steuerrecht
//  mode "activity": Tätigkeit einordnen (Einkunftsart, Sozialversicherung, Pauschalierungen, Grenzen)
//  mode "check":    Jahreswerte vor dem Export prüfen (Hinweise mit Quellen)
// Umgebungsvariablen: ANTHROPIC_API_KEY (Pflicht), APP_TOKEN (optional), CLAUDE_MODEL (optional)
export const config = { maxDuration: 60 };

const today = () => new Date().toISOString().slice(0, 10);

function promptActivity({ activity, kind, year, details, ctx }) {
  const c = ctx || {};
  const ctxTxt = `
Daten aus der App (zum Zuordnen):
Kategorien des Unternehmers (key = Vorzeichen + Kategorie, mit Jahressumme): ${JSON.stringify((c.cats || []).slice(0, 60))}
Wertpapiere/Instrumente in den Depots: ${JSON.stringify((c.secs || []).slice(0, 80))}
Anzahl Depots: ${c.depots || 0}, Fahrtenbuch-Fahrten: ${c.trips || 0}, Umsatz bisher: ${c.umsatz || 0} €`;
  return `Du bist Steuerexperte für Österreich. Heute ist ${today()}. Steuerjahr: ${year}.
Ein Unternehmer (meist Einnahmen-Ausgaben-Rechner) beschreibt seine Tätigkeit so:
Art: ${kind || "–"}
Beschreibung: ${activity || "–"}
Weitere Angaben: ${details || "–"}
${ctxTxt}
Bei Trading/Wertpapieren/Derivaten/Krypto beachte besonders: Einkünfte aus Kapitalvermögen (§ 27, § 27a, § 27b EStG), Sondersteuersatz 27,5 % auch im Betriebsvermögen, Ausnahme nicht verbriefte Derivate ohne KESt-Abzug (Tarif, VwGH-Rechtsprechung), Beilage E1kv mit Kennzahlen, gleitender Durchschnittspreis, Verlustausgleich, keine Abzugsfähigkeit von Anschaffungsnebenkosten/Werbungskosten bei 27,5 %, gewerblicher Handel bzw. Konzessionspflicht (WAG/FMA) bei Tätigkeit für Dritte, GmbH: KöSt.

Recherchiere im Web (bevorzugt bmf.gv.at, findok.bmf.gv.at, usp.gv.at, wko.at, svs.at, ris.bka.gv.at) die AKTUELL gültigen Werte für ${year} und ordne die Tätigkeit ein.
Antworte NUR mit einem JSON-Objekt ohne weiteren Text:
{"activity":"kurze normierte Bezeichnung",
 "incomeType":"z. B. Einkünfte aus Gewerbebetrieb / aus selbständiger Arbeit",
 "kind":"gewerbe|handel|dienst|freiberuf|neue_selbst|kuenstler|vortrag|land_forst|andere",
 "socialInsurance":"z. B. GSVG (SVS), FSVG, Neue Selbständige",
 "kuType":"gewerbe|dienst" (für die Kleinunternehmerpauschalierung: 45 % oder 20 % Dienstleistungsbetrieb),
 "kuRate":Zahl als Anteil z. B. 0.45, "kuMax":Höchstbetrag in Euro,
 "basis6":true|false (Basispauschalierung mit dem niedrigeren Satz für Beratung, Vortrag, Schriftsteller usw.),
 "basisRate":Anteil z. B. 0.15, "basisMax":Höchstbetrag in Euro, "basisLimit":Umsatzgrenze in Euro,
 "kuLimit":Kleinunternehmergrenze brutto in Euro, "kuTolerance":Toleranzgrenze in Euro,
 "branchPausch":[{"name":"branchenspezifische Pauschalierung falls für diese Tätigkeit möglich","info":"1 Satz"}],
 "notes":["kurze wichtige Hinweise für genau diese Tätigkeit, max. 6"],
 "kzMap":{"<key aus der Kategorienliste>":{"kz":"Kennzahl der Beilage E 1a (9040,9090,9100,9110,9120,9130,9150,9160,9170,9180,9190,9200,9220,9225,9230) oder skip (nicht absetzbar/privat/Anlage)","why":"max. 8 Wörter"}},
 "settings":{"ku":true|false|null (Kleinunternehmerregelung sinnvoll/zutreffend?),"km":true|false|null (Kilometergeld statt Kfz-Kosten typisch?),"apl":"0|300|1200|null (Arbeitsplatzpauschale typisch?)","depots":"ausland|inland|null","why":{"ku":"kurz","km":"kurz","apl":"kurz","depots":"kurz"}},
 "konten":{"9040":"Sachkonto nach österreichischem Einheitskontenrahmen (4-stellig)","9100":"…", "…":"nur für Kennzahlen, die für diese Tätigkeit vorkommen"},
 "secClasses":{"<Name aus der Wertpapierliste>":"aktie|fonds|derivat|derivat_nv|krypto"},
 "profile":{"capital":true|false (Haupteinkünfte sind Kapitaleinkünfte wie Trading/Krypto),
   "forms":["z. B. E1","E1a","E1kv","U1","K1"],
   "taxRate":"kurz, z. B. 27,5 % Sondersteuersatz bzw. Tarif bei …",
   "license":"Gewerbeberechtigung/Konzession nötig? kurz",
   "deductible":"was ist absetzbar, kurz",
   "deadlines":["wichtige Fristen, max. 4"],
   "openQuestions":["Punkte, die mit dem Steuerberater zu klären sind, max. 4"],
   "reports":{"e1a":true|false,"e1kv":true|false,"pausch":true|false,"waren":true|false,"km":true|false,"anlagen":true|false,"ku":true|false}},
 "sources":[{"title":"","url":""}]}
Wenn ein Wert unsicher ist, setze null und erkläre es in notes.`;
}

function promptCheck({ year, data, detail }) {
  return `Du bist Steuerberater in Österreich. Heute ist ${today()}. Prüfe die folgenden Jahreswerte ${year} eines Einzelunternehmers (Einnahmen-Ausgaben-Rechnung, Beilage E 1a) BEVOR sie an den Steuerberater gehen.
Recherchiere dazu im Web die für ${year} gültigen Regeln und Grenzen (bevorzugt bmf.gv.at, findok.bmf.gv.at, usp.gv.at, wko.at, svs.at).
Prüfe insbesondere: Zuordnung zu den E1a-Kennzahlen, Kleinunternehmergrenze/Toleranz, Gewinnfreibetrag (Grundfreibetrag), GWG-Grenze und AfA (Halbjahres-AfA, Nutzungsdauer), Kilometergeld (Satz, Höchstgrenze, Kfz im Betriebsvermögen?), Arbeitsplatzpauschale, Pauschalierungsvergleich, SVS-Beiträge, Privatentnahmen, fehlende Belege, auffällige Beträge.${detail ? " Prüfe auch die einzelnen Buchungen auf falsche Zuordnung oder nicht absetzbare Ausgaben (z. B. privat, Repräsentation, Strafen)." : ""}
Daten (JSON, Beträge in Euro):
${JSON.stringify(data)}

Antworte NUR mit einem JSON-Objekt ohne weiteren Text:
{"ok":true|false (false nur bei echten Fehlern, die vor dem Export korrigiert werden sollten),
 "summary":"1–2 Sätze Gesamtergebnis",
 "findings":[{"level":"error|warn|info|ok","area":"z. B. KZ 9160 / Kleinunternehmergrenze / Anlagen","title":"kurz","detail":"1–2 Sätze, konkret mit Beträgen","fix":"was zu tun ist (optional)","source":"URL (optional)"}],
 "rules":[{"name":"z. B. Kleinunternehmergrenze","value":"z. B. 55.000 € brutto","source":"URL"}],
 "sources":[{"title":"","url":""}]}
Maximal 12 findings, die wichtigsten zuerst. Erfinde nichts – wenn du etwas nicht prüfen kannst, schreibe es als info.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST" });
  const token = process.env.APP_TOKEN;
  if (token && req.headers["x-app-token"] !== token) return res.status(401).json({ error: "Zugangscode falsch" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY fehlt in Vercel" });
  const b = req.body || {};
  const year = String(b.year || new Date().getFullYear()).slice(0, 4);
  const prompt = b.mode === "activity"
    ? promptActivity({ activity: String(b.activity || "").slice(0, 600), kind: String(b.kind || "").slice(0, 120), year, details: String(b.details || "").slice(0, 400), ctx: b.ctx })
    : promptCheck({ year, data: b.data || {}, detail: !!b.detail });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5", max_tokens: b.mode === "activity" ? 7000 : 4000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: b.mode === "activity" ? 4 : 5 }],
        messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(55000)
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j?.error?.message || "Claude-API-Fehler" });
    const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    // Quellen aus den Suchergebnissen ergänzen
    const cites = [];
    for (const c of j.content || []) for (const x of c.citations || []) if (x.url && !cites.some((y) => y.url === x.url)) cites.push({ title: x.title || x.url, url: x.url });
    const m = text.match(/\{[\s\S]*\}/g);
    let out = null;
    for (const s of (m || []).sort((a, b2) => b2.length - a.length)) { try { out = JSON.parse(s); break; } catch {} }
    if (!out) return res.status(502).json({ error: "Keine auswertbare Antwort erhalten" });
    out.sources = [...(out.sources || []), ...cites].filter((x, i, a) => x?.url && a.findIndex((y) => y.url === x.url) === i).slice(0, 10);
    out.at = new Date().toISOString();
    return res.status(200).json(out);
  } catch (e) {
    return res.status(504).json({ error: /timeout|abort/i.test(String(e?.message || e)) ? "Zeitüberschreitung – bitte nochmal versuchen" : String(e?.message || e) });
  }
}
