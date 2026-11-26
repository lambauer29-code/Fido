// Steuerberater-Berichte: KI mit Websuche nach aktuellem österreichischem Steuerrecht
//  mode "activity": Tätigkeit einordnen (Einkunftsart, Sozialversicherung, Pauschalierungen, Grenzen)
//  mode "check":    Jahreswerte vor dem Export prüfen (Hinweise mit Quellen)
//  mode "reserve":  Rücklage ESt/SVS + Kleinunternehmergrenze (Einordnung, Gehalt schätzen, Rechenwerte)
//  v0.99.73 – andere Länder (body.country = { code, name }):
//  mode "country":  Länderprofil (Formular, Zeilen/Kategorien, Grenzen, km-Satz, AfA, Wechselkurs) für die Berichte
//  mode "reserve":  mit country → Steuer-/Sozialversicherungswerte des Landes
//  mode "check":    mit country → Prüfung nach dem Recht des Landes
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

function promptReserve({ year, data }) {
  return `Du bist Steuerberater in Österreich. Heute ist ${today()}. Steuerjahr: ${year}.
Ein Angestellter hat zusätzlich eine eigene Firma (Nebentätigkeit). Er will wissen, wie viel er für Einkommensteuer und SVS-Nachzahlung zurücklegen soll, und wie nahe er an der Kleinunternehmergrenze ist.
Recherchiere im Web die für ${year} AKTUELL gültigen Werte (bevorzugt bmf.gv.at, usp.gv.at, findok.bmf.gv.at, wko.at, svs.at, ris.bka.gv.at).
Daten aus der App (JSON, Beträge in Euro):
${JSON.stringify(data)}

Aufgaben:
1. Entscheide anhand von Tätigkeit, Kategorien und Wertpapieren, wie der Firmengewinn steuerlich zu behandeln ist: "betrieb" (Tarif, Einkünfte aus Gewerbebetrieb/selbständiger Arbeit), "kapital" (Einkünfte aus Kapitalvermögen, 27,5 % Sondersteuersatz, keine SVS) oder "gemischt" (dann Anteil kapitalShare 0–1).
2. Entscheide die Sozialversicherung: "gewerbe" (GSVG mit Gewerbeschein, Mindestbeitragsgrundlage), "neu" (Neue Selbständige, Versicherungsgrenze), "ausnahme" (Kleinstunternehmer-Ausnahme, nur Unfallversicherung) oder "keine".
3. Schätze aus den Gehaltseingängen (netto je Monat, inkl. 13./14. falls erkennbar) bzw. dem Bruttogehalt das steuerpflichtige Jahreseinkommen aus der Anstellung (Lohnzettel Kennzahl 245, ohne Sonderzahlungen). Falls schon ein Wert angegeben ist, übernimm ihn.
4. Liefere die Rechenwerte für ${year}.
Antworte NUR mit einem JSON-Objekt ohne weiteren Text:
{"trade":"betrieb|kapital|gemischt","kapitalShare":Zahl oder null,"tradeWhy":"max. 20 Wörter",
 "svs":"gewerbe|neu|ausnahme|keine","svsWhy":"max. 20 Wörter",
 "salaryKz245":Zahl oder null,"salaryWhy":"max. 20 Wörter",
 "rules":{"brackets":[[Obergrenze,Grenzsteuersatz als Anteil],… letzte Stufe mit Obergrenze null],
   "gfbRate":Anteil,"gfbCap":Euro,"kv":Anteil,"pv":Anteil,"sv":Anteil,"uvMonth":Euro,"vg":Euro (Versicherungsgrenze Neue Selbständige jährlich),"mbg":Euro (Mindestbeitragsgrundlage jährlich),"hbg":Euro (Höchstbeitragsgrundlage jährlich),"kuLimit":Euro,"kuTol":Euro,"vfb":Euro (Veranlagungsfreibetrag),"kest":Anteil},
 "notes":["max. 6 kurze, konkrete Hinweise für genau diesen Fall, z. B. Mehrfachversicherung, Nachbemessung, Vorauszahlungen"],
 "sources":[{"title":"","url":""}]}
Wenn ein Wert unsicher ist, setze null und erkläre es in notes. Erfinde nichts.`;
}

function promptCountry({ country, year, ctx, activity }) {
  const c = ctx || {};
  return `Du bist internationaler Steuerexperte. Heute ist ${today()}. Land: ${country.name} (ISO ${country.code}). Steuerjahr: ${year}.
Ein Einzelunternehmer (natürliche Person, kleine Firma bzw. Nebentätigkeit, Gewinnermittlung möglichst einfach nach Zahlungsfluss) will seine Jahreszahlen für die Steuererklärung bzw. den Steuerberater in ${country.name} vorbereiten.
Tätigkeit: ${activity || "nicht angegeben"}
Kategorien aus der App (key = Vorzeichen + Kategorie, Jahressumme in EUR): ${JSON.stringify((c.cats || []).slice(0, 60))}
Weitere Daten: Fahrtenbuch-Fahrten ${c.trips || 0}, Anlagegüter ${c.assets || 0}, Umsatz bisher ${c.umsatz || 0} EUR.

Recherchiere im Web (bevorzugt offizielle Seiten der Steuerbehörde/des Finanzministeriums von ${country.name}) die für ${year} gültigen Regeln:
- Welches Formular/welche Anlage nutzt ein solcher Einzelunternehmer für die Gewinnermittlung (z. B. Deutschland: Anlage EÜR, Schweiz: Selbständigerwerbende, USA: Schedule C)?
- Die Zeilen/Positionen dieses Formulars für Einnahmen und Ausgaben (max. 24, nur die für Kleinunternehmer relevanten, in Formular-Reihenfolge; Bezeichnung auf Deutsch, Original-Begriff in Klammern wenn hilfreich).
- Kleinunternehmer-/Umsatzsteuer-Befreiungsgrenze, Sofortabschreibung geringwertiger Wirtschaftsgüter, Kilometerpauschale für Privat-Pkw, Abschreibungsregel im Anschaffungsjahr, Freibeträge auf den Gewinn.
- Landeswährung und durchschnittlicher Wechselkurs EUR → Landeswährung für ${year} (bzw. aktuell).
Alle Beträge in "rules" in LANDESWÄHRUNG.
Antworte NUR mit einem JSON-Objekt ohne weiteren Text:
{"country":"${country.name}","currency":"ISO-Code z. B. CHF","fxEur":Zahl (1 EUR = x Landeswährung, Jahresdurchschnitt),"fxNote":"Quelle/Stand kurz",
 "authority":"Steuerbehörde","taxSystem":"1–2 Sätze: wie wird ein Einzelunternehmer besteuert",
 "form":"Name des Formulars/der Anlage für die Gewinnermittlung","formShort":"Kurzname z. B. Anlage EÜR","lineWord":"Zeile|Position|Line|Ziffer","profitMethod":"kurz",
 "forms":["alle relevanten Formulare, max. 6"],
 "lines":[{"id":"kurze eindeutige ID z. B. Z15","label":"Bezeichnung","dir":"in|out"}],
 "special":{"revenue":"id Umsatzerlöse","otherIn":"id sonstige Einnahmen","goods":"id Waren/Material oder null","depreciation":"id Abschreibungen","travel":"id Reise-/Fahrtkosten bzw. km-Pauschale","vehicle":"id Kfz-Kosten oder null","social":"id eigene Sozialversicherung oder null (falls nicht als Betriebsausgabe absetzbar: null)","otherOut":"id übrige Ausgaben"},
 "fromAt":{"9040":"id","9090":"id","9100":"id","9110":"id","9120":"id","9130":"id","9150":"id","9160":"id","9170":"id","9180":"id","9190":"id","9200":"id","9215":"id oder skip","9217":"id oder skip","9220":"id","9225":"id oder skip","9230":"id"} (Zuordnung der österreichischen E1a-Kennzahlen auf deine Zeilen),
 "kzMap":{"<key aus der Kategorienliste>":{"kz":"id oder skip (privat/nicht absetzbar)","why":"max. 8 Wörter"}},
 "rules":{"smallLimit":Zahl oder null,"smallLabel":"z. B. Kleinunternehmerregelung § 19 UStG","smallTol":Zahl oder null (Toleranz-/zweite Grenze),"smallBasis":"brutto|netto","smallPrev":Zahl oder null (Vorjahresgrenze falls abweichend),
   "gwg":Zahl oder null,"gwgLabel":"kurz","afaFirstYear":"half|month|full|none (anteilig im Anschaffungsjahr: halbes Jahr / monatsgenau / volles Jahr / keine)",
   "kmRate":Zahl oder null (pro km),"kmMaxKm":Zahl oder null,"kmLabel":"kurz",
   "allowance":{"label":"z. B. Gewinnfreibetrag","rate":Anteil,"cap":Betrag Gewinn bis zu dem der Satz gilt} oder null,
   "vatStandard":Anteil oder null},
 "reports":{"km":true|false,"anlagen":true|false,"umsatz":true|false,"waren":true|false},
 "deadlines":["wichtige Fristen, max. 4"],"notes":["kurze konkrete Hinweise, max. 6"],"openQuestions":["mit einem Steuerberater im Land zu klären, max. 4"],
 "sources":[{"title":"","url":""}]}
Wenn ein Wert unsicher ist, setze null und erkläre es in notes. Erfinde nichts.`;
}

function promptReserveIntl({ country, year, data }) {
  return `Du bist internationaler Steuerexperte. Heute ist ${today()}. Land: ${country.name} (ISO ${country.code}). Steuerjahr: ${year}.
Ein in ${country.name} steuerpflichtiger Angestellter hat zusätzlich eine kleine eigene Firma (Einzelunternehmen). Er will wissen, wie viel er für Einkommensteuer und Sozialversicherung auf den Firmengewinn zurücklegen soll.
Recherchiere im Web (offizielle Seiten bevorzugt) die für ${year} gültigen Werte. Die App-Beträge sind in EUR; rechne Werte in "rules" in LANDESWÄHRUNG an.
Daten aus der App (JSON, Beträge in EUR):
${JSON.stringify(data)}
Aufgaben:
1. "trade": betrieb (normaler Tarif) | kapital (Kapitalerträge mit Sondersatz) | gemischt (dann kapitalShare 0–1).
2. Einkommensteuertarif für eine alleinstehende Person als Stufen [[Obergrenze, Grenzsteuersatz]] in Landeswährung (Grundfreibetrag als Stufe mit 0), letzte Stufe Obergrenze null. Bei Ländern mit Bundes- und Landes-/Gemeindesteuer: typische Gesamtbelastung angeben und in notes erklären.
3. Sozialversicherung des Selbständigen auf den Gewinn: Satz, Mindest-/Höchstbemessung, Fixbetrag pro Jahr, ob Pflicht, ob als Betriebsausgabe absetzbar.
4. Schätze das steuerpflichtige Jahreseinkommen aus der Anstellung (Landeswährung) aus den Gehaltseingängen, falls nicht angegeben.
Antworte NUR mit einem JSON-Objekt ohne weiteren Text:
{"currency":"ISO-Code","fxEur":Zahl (1 EUR = x Landeswährung),
 "trade":"betrieb|kapital|gemischt","kapitalShare":Zahl oder null,"tradeWhy":"max. 20 Wörter",
 "salaryTaxable":Zahl oder null,"salaryWhy":"max. 20 Wörter",
 "rules":{"brackets":[[Obergrenze,Satz],…,[null,Satz]],"allowanceRate":Anteil oder null,"allowanceCap":Zahl oder null,"allowanceLabel":"kurz oder null",
   "socialRate":Anteil,"socialMin":Zahl oder null,"socialMax":Zahl oder null,"socialFixed":Zahl oder null,"socialMandatory":true|false,"socialDeductible":true|false,"socialLabel":"Name der Sozialversicherung",
   "capitalRate":Anteil oder null,"taxLabel":"Name der Steuer"},
 "notes":["max. 6 kurze, konkrete Hinweise, z. B. Vorauszahlungen, Doppelbesteuerung"],
 "sources":[{"title":"","url":""}]}
Wenn ein Wert unsicher ist, setze null und erkläre es in notes. Erfinde nichts.`;
}

function promptCheckIntl({ country, year, data }) {
  return `Du bist Steuerberater in ${country.name}. Heute ist ${today()}. Prüfe die folgenden Jahreswerte ${year} eines Einzelunternehmers, BEVOR sie an den Steuerberater gehen.
Recherchiere im Web die für ${year} in ${country.name} gültigen Regeln (offizielle Seiten bevorzugt). Prüfe: Zuordnung zu den Formularzeilen, Kleinunternehmer-/USt-Grenze, Abschreibungen und GWG, Kilometerpauschale, Freibeträge, fehlende Belege, auffällige Beträge.
Daten (JSON, Beträge in EUR, umgerechnet mit dem angegebenen Kurs):
${JSON.stringify(data)}
Antworte NUR mit einem JSON-Objekt ohne weiteren Text:
{"ok":true|false,"summary":"1–2 Sätze","findings":[{"level":"error|warn|info|ok","area":"kurz","title":"kurz","detail":"1–2 Sätze mit Beträgen","fix":"optional","source":"URL optional"}],
 "rules":[{"name":"","value":"","source":""}],"sources":[{"title":"","url":""}]}
Maximal 12 findings. Erfinde nichts.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST" });
  const token = process.env.APP_TOKEN;
  if (token && req.headers["x-app-token"] !== token) return res.status(401).json({ error: "Zugangscode falsch" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY fehlt in Vercel" });
  const b = req.body || {};
  const year = String(b.year || new Date().getFullYear()).slice(0, 4);
  const cn = b.country && /^[A-Z]{2}$/.test(String(b.country.code || "")) && (b.country.code !== "AT" || b.intl) ? { code: b.country.code, name: String(b.country.name || b.country.code).slice(0, 60) } : null;
  const prompt = b.mode === "country" ? (cn ? promptCountry({ country: cn, year, ctx: b.ctx, activity: String(b.activity || "").slice(0, 600) }) : null)
    : cn && b.mode === "reserve" ? promptReserveIntl({ country: cn, year, data: b.data || {} })
    : cn && b.mode === "check" ? promptCheckIntl({ country: cn, year, data: b.data || {} })
    : b.mode === "reserve" ? promptReserve({ year, data: b.data || {} })
    : b.mode === "activity"
    ? promptActivity({ activity: String(b.activity || "").slice(0, 600), kind: String(b.kind || "").slice(0, 120), year, details: String(b.details || "").slice(0, 400), ctx: b.ctx })
    : promptCheck({ year, data: b.data || {}, detail: !!b.detail });
  if (!prompt) return res.status(400).json({ error: "Land fehlt" });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5", max_tokens: b.mode === "activity" || b.mode === "country" ? 7000 : b.mode === "reserve" ? 3000 : 4000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: b.mode === "activity" ? 4 : b.mode === "country" ? 6 : 5 }],
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
