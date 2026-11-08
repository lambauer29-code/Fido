# Fido – Finanzen und Dokumente (PWA)

Dokumente (PDF/Fotos) hochladen → Claude sortiert in Kategorien, vergibt Tags, liest Absender, Datum, **Beträge** (Brutto/Netto/USt) und **Fristen** aus und liefert den Volltext für die Suche.

## v0.14.3
- Kontostand-Karte hat jetzt immer denselben Aufbau (ein Konto oder mehrere) – kein Springen mehr beim Darüberfahren über die Konto-Karten. Einzelkonto zeigt Eingänge, Ausgänge, Saldo, Buchungen.

## v0.14.2
- Konto-Karten: Maus darüber = Vorschau nur dieses Kontos (Karte, Summen, Buchungen; andere Karten abgeblendet), Maus weg = zurück. Klick = Konto fest auswählen. Touch: 1. Tippen Vorschau, 2. Tippen auswählen.

## v0.14.1
- Seitenleiste: Zeile „Mehrfachauswahl“ entfernt (Schalter bleibt unter Einstellungen › Konten & Gruppen).
- Konto-Karten: Klick zeigt nur dieses Konto, solange die Maus darauf bleibt (Doppelklick = fest auswählen; am Handy antippen = an/aus).

## v0.14.0 – Kalender & Apple-Kalender-Abo
- Fristen: interaktiver Monatskalender (Standard) oder Liste. Fristen aus Bons/Rechnungen erscheinen automatisch; per Ziehen auf einen anderen Tag verschieben, Tag antippen = Details, abhaken, Datum ändern.
- „🍎 Mit Apple Kalender verbinden“: Kalender-Abo (webcal) – Fido lädt Änderungen automatisch hoch, Apple Kalender holt sie selbst ab. Benötigt einen kostenlosen Vercel-Blob-Speicher (Storage › Blob › mit Projekt verbinden, dann Redeploy). Funktioniert auch mit Google Kalender/Outlook.
- „⬇︎ .ics“ für den einmaligen Export bleibt.

## v0.13.0
- Buchung bearbeiten: „＋ Neue Kategorie …“ direkt in der Auswahl, Konto der Buchung änderbar.
- Seitenleiste: Schalter „Mehrfachauswahl“ direkt über den Konten.
- Dokumente: Anzahl in Klammern mit etwas mehr Abstand.
- Konten: Konto-Karten auch bei „Alle Konten“; volle Breite, wenn rechts nichts steht (bzw. bis 1280 px Seitenspalte unten).

## v0.12.1
- Raster, Auge, Tag/Nacht und ＋ schweben als Leiste oben rechts und bleiben beim Scrollen sichtbar – auch im Anpassen-Modus der Übersicht; „Übersicht anpassen“-Leiste bleibt darunter angeheftet.

## v0.12.0 – Privat/Firma, Belege an Buchungen, Netto-Lohn
- Dokumente: „👤 Privat / 🏢 Firma“ – Claude ordnet zu (Firmenname unter Einstellungen › Meine Daten), änderbar im Dokument, Filter in der Liste. „Steuerrelevant“ ohne Zusatz.
- Beleg ↔ Buchung: in der Buchung „Scannen / Datei / Vorhandenes Dokument“, im Dokument „Mit Buchung verknüpfen“ (passende Buchungen nach Betrag & Datum zuerst), jeweils lösbar.
- Lohnzettel: gerechnet wird der ausbezahlte Netto-Betrag; neues Feld „Ausbezahlt / Zahlbetrag“.
- Vorschau bleibt in ihrer Spalte statt eine eigene Zeile zu öffnen.
- Konten: Kontostand-Karte bricht bei schmalem Fenster sauber um, Tabelle blendet Spalten aus; eingeblendete Konten werden gleich ausgewählt; Auswahl-Kästchen abschaltbar (Einstellungen › Konten & Gruppen).

## v0.11.0 – Konten auswählen & ausblenden
- Seitenleiste: Kästchen pro Konto und pro Gruppe (Mehrfachauswahl), Name antippen = nur dieses Konto, Auge = Konto ausblenden; „Ausgeblendet“-Bereich mit „Einblenden“.
- Konten-Tab zeigt die Zusammenfassung der Auswahl: Gesamtstand, Guthaben, Schulden, Eingänge/Ausgänge, Karte je Konto, Buchungen nur der gewählten Konten.
- Chip „Alle Konten ▾“ öffnet die Kontenauswahl mit Schnellwahl (Alle, Keine, Nur Guthaben, Nur Schulden) und Summe. Auswahl wird gemerkt.
- Ausgeblendete Konten zählen auch in der Übersicht nicht mit.
- Buchungstabelle am Desktop mit flexiblen Spalten; Seitenleiste etwas breiter.

## v0.10.6
- Papierkorb: „🗑 Leeren“ (alles endgültig löschen, mit Rückfrage) und „↺ Alle“ wiederherstellen.

## v0.10.5
- Übersicht anpassen: statt Titelleiste eine kompakte Bedien-Pille auf der Oberkante jedes Widgets – Inhalt bleibt sichtbar, Größe und Position identisch mit der fertigen Ansicht.

## v0.10.4
- Übersicht: Ansicht nach „Fertig“ sieht genauso aus wie im Anpassen-Modus (Bedienleiste schwebt über dem Widget statt Höhe hinzuzufügen; leere Widgets behalten ihren Platz).

## v0.10.3
- Übersicht: „Leerfeld“-Widget (beliebig oft, Größe frei ziehbar, in der Ansicht unsichtbar) für freie Zeilen/Lücken.
- Schalter „Lücken füllen“: aus = Reihenfolge strikt, Lücken bleiben frei.

## v0.10.2
- Design: Kreise in den Vorgaben antippen = Akzent, Zweitfarbe und Hintergrund (Tag/Nacht getrennt) frei wählen, „↺ Originalfarben“ setzt zurück.
- Eigene Guthaben-/Schulden-Farben werden als zusätzliche Kreise gespeichert (bis 8, mit × entfernbar); ＋-Kreis gleich groß.
- Verlauf-Widget nutzt die gewählten Guthaben-/Schulden-Farben.

## v0.10.1
- Einstellungen: überflüssige Kachel „Fristen“ entfernt (Fristen bleiben über die Seitenleiste erreichbar).

## v0.10.0 – Raster, Design & Dokument-Aktionen
- Übersicht als freies Raster: Widgets per Ecke ◢ in Breite und Höhe ziehen, Schnellbreiten ⅓ ½ ⅔ 1, „↕A“ = Höhe nach Inhalt, kleine Widgets rücken automatisch neben große, Abstand-Regler.
- Einstellungen › Design: 9 Farbstile (angelehnt an N26, Monzo, Revolut, Notion, Evernote u. a.) + Farbpalette für Guthaben & Schulden (inkl. eigener Farbe), optional Ausgaben einfärben.
- Einstellungs-Bereiche alle gleich breit.
- Dokumentliste: Symbole Bearbeiten · Vorschau · Original öffnen · Löschen. Detail-Fenster ohne „Öffnen“.
- Alle Fenster: ✕ zum Schließen statt „Zurück/Abbrechen“.
- „Erkannten Text anzeigen“ ersetzt durch Text-Status mit Kopieren bzw. „Mit Claude auslesen“.
- Konten am Desktop: Tabelle (Datum · Empfänger · Kategorie · Konto · Betrag), Kontostand-Karte quer.
- „≈“ vor Kontoständen entfernt.
- API: Fallback für Modelle ohne erzwungenes tool_choice (Fehler „tool_choice … not supported“).

## v0.9.3 – Übersicht mit Widgets
- Übersicht anpassen (Raster-Symbol oben rechts): Karten per Griff ⠿ verschieben, Breite wählen (1 Spalte / 2 Spalten / ganze Breite), mit ✕ ausblenden, unter „Weitere Widgets“ wieder hinzufügen. Wird gespeichert.
- Neue Widgets: Neueste Dokumente, Letzte Buchungen, Verträge & Fixkosten, Steuer (Jahr), Schnellzugriff.

## v0.9.2 – Einstellungen sortierbar
- Alle Einstellungs-Bereiche sind auf-/zuklappbar (Titel antippen) und am Griff ⠿ per Drag & Drop sortierbar. Reihenfolge und Zustand werden gespeichert; „Alle auf-/zuklappen“ oben.

## v0.9.1 – Tag/Nacht & Vorschau
- Tag-/Nachtmodus: Mond/Sonne oben rechts oder Einstellungen › Darstellung (Automatisch, Nach Uhrzeit 7–19 Uhr, Tag, Nacht).
- Kontostand ohne bekannten Saldo wird aus den Umsätzen berechnet („≈“) – in Seitenleiste, Konten-Karte und neuer Konten-Kachel in der Übersicht.
- ＋-Menü: „Buchung“ und „Konto anlegen“ (statt der zwei Buttons im Konten-Tab).
- Dokumentliste: ausklappbare Vorschau (Pfeil rechts), Fehler-Dokumente direkt „↻ Neu analysieren“.
- Schlichtere Linien-Symbole (Auge, Sonne/Mond).

## v0.9.0 – Fenster & Kontostände
- Alle Dialoge als frei schwebende Fenster (ab Tablet-Breite): verschieben am Titel, an Rändern/Ecken skalieren, Position & Größe werden gemerkt. Am Handy weiterhin Vollbild.
- Seitenleiste in der Breite ziehbar (Doppelklick = Standard).
- Kontostand pro Konto: wird aus Importen übernommen (CAMT, MT940, OFX, CSV-Spalte „Kontostand/Saldo“) oder manuell eingetragen; unbekannt = „—“.
- 👁 Geldbeträge ein-/ausblenden (Kopfzeile + Einstellungen › Datenschutz).
- „Umsätze importieren“ in die Einstellungen verschoben.
- Kontostand-Karte oben im Konten-Tab, Bargeld-Kachel in der Übersicht.
- Große PDFs (>3,6 MB) werden vor der Analyse automatisch verkleinert (behebt HTTP 413).

## v0.8.2
- Ein einziger ＋-Knopf (Mac/Tablet oben rechts, Phone unten) mit undurchsichtigem Menü: Scannen, Datei/Foto, Barausgabe
- Einstellungen → Verbindung → „Verbindung prüfen“ (`api/health.js`): zeigt, ob API-Key und App-Token in Vercel stimmen
- iOS: Datumsfeld ragt nicht mehr über den Rand

## Bedienung (v0.8.1)
- Einstellungen: Kategorien, Gruppen, Konten und Reiter per **Ziehen am Griff ⠿** verschieben (Maus & Touch, auch zwischen Gruppen, mit Einfügelinie und Auto-Scroll)
- Textfelder mit **✓ übernehmen** (grün, Enter) und **✕ verwerfen** (rot, Esc)
- Umbenannte Kategorien behalten Symbol und Farbe

## Dokument-Kategorien (v0.8)
- Einstellungen → „Dokumente – Gruppen & Kategorien“: Gruppen mit Überschrift (Finanzen/Verträge/Sonstiges + eigene), Kategorien anlegen, umbenennen, sortieren, verschieben, löschen
- Die Gruppe bestimmt, ob ihre Dokumente als Finanzen, Verträge oder Sonstiges zählen (Sonstiges = nicht in der Analyse); im Dokument manuell übersteuerbar
- Umbenennen/Löschen zieht Dokumente, Umsätze, Budgets und Regeln mit
- Seitenleiste: Dokumente → Gruppen → Kategorien (ein-/ausklappbar, mit Anzahl); am Phone als Liste im Dokumente-Tab
- Claude bekommt die Gruppierung beim Auslesen als Kontext

## Fido (v0.7)
- Neuer Name & Icon (`public/icon.svg`, PNGs für iOS/Android inkl. maskable)
- **Seitenleiste** ab Tablet-Breite, in den Einstellungen konfigurierbar: Reiter sortieren, umbenennen, für Seitenleiste/Handy ein- oder ausblenden
- **Konten & Gruppen:** eigene Überschriften, Trennlinien, Reihenfolge; in der Seitenleiste ein-/ausklappbar mit Kontostand; am Phone als Liste im Konten-Tab
- Kontoarten: Bargeld, Girokonto, Kreditkarte, PayPal/Online, Sparkonto, Depot; optionaler Kontostand wird fortgeschrieben
- **Dokument-Bereiche:** Finanzen / Verträge / Sonstiges (Claude ordnet zu, änderbar); „Sonstiges“ zählt nicht in Übersicht & Budgets

## Scanner & Bargeld (v0.6)
- **Scannen** (＋ → Scannen): Kamera oder Foto, automatische Rand-Erkennung, Ecken verschiebbar, Entzerrung, Filter Original/Farbe/Dokument/S-W (mit Lichtausgleich), mehrere Seiten → PDF. Alles lokal im Browser (`src/scan.js`), danach wie gewohnt Auslesen durch Claude.
- **Bargeld:** Konto „Geldbörse“ mit Startbestand; Barausgaben von Hand (＋ → Barausgabe); Bon scannen mit „Bar bezahlt“ bucht automatisch; „💶 Bar bezahlt“ im Dokument; Bankomat-Behebungen aus Bankimporten erhöhen den Bestand und zählen nicht doppelt als Ausgabe.

## Responsive (v0.5)
- Phone: untere Navigation, Plus-Button; kleine Phones (ab 320 px) und Querformat eigens angepasst
- Tablet (ab 700 px): Dashboard zweispaltig, Dokument-Raster, Dialoge als zentrierte Fenster
- Mac/Desktop (ab 1024 px): Seitenleiste, Dashboard drei- bis vierspaltig, Konten mit Seitenspalte, Details als Schublade von rechts, Esc schließt Dialoge

## Import (v0.4) – Tab „Konten“
- **Formate:** CSV/TXT (Trennzeichen, Kodierung, Kopfzeile & Spalten werden automatisch erkannt, auch ohne Kopfzeile), Excel (.xlsx), JSON (z. B. George), CAMT.052/053/054, MT940/STA, OFX/QFX, QIF
- **PDF-Kontoauszüge, Fotos, exotische Formate:** werden von Claude ausgelesen (`api/statement.js`)
- **Finanzguru-Export** (.xlsx / .csv): alle Konten der Datei werden automatisch angelegt, Finanzguru-Kategorien übernommen, Umbuchungen erkannt
- Getestet mit Beispieldateien im Stil von George, Raiffeisen ELBA (ohne Kopfzeile), PayPal, Revolut, Soll/Haben-Exporten, Scalable, Trade Republic
- Spaltenzuordnung anpassbar und pro Dateiaufbau gemerkt; Dubletten-Schutz bei erneutem Import
- Automatisch: Kategorien (AT-Händler), Abgleich Umsatz ↔ Rechnung (= bezahlt), Abo-/Fixkosten-Erkennung, Depot (Positionen, Einstand, Dividenden, Kosten)

## Design (v0.3)
- Finanzbereiche (Übersicht, Verträge) im Finanz-App-Look: Saldo-Karte, Ringdiagramm, Icon-Kreise
- Dokumente im Scanner-App-Look: Vorschaubilder (PDF via pdf.js), Liste/Raster, Ordner, farbige Etiketten
- Hell/Dunkel automatisch nach Systemeinstellung

## Funktionen (v0.2)
- **Übersicht:** Ausgaben/Einnahmen pro Monat, 6-Monats-Verlauf, Budgets je Kategorie, nächste Fristen
- **Dokumente:** Volltextsuche, Filter (Kategorie, Tag, Jahr, steuerrelevant, unbezahlt), CSV-Export für Excel
- **Fristen:** gruppiert, `.ics`-Export; Zahlungsfrist abhaken = Rechnung bezahlt
- **Verträge:** Fixkosten/Monat & Jahr, „Kündigen bis“, fertiges Kündigungsschreiben
- **Bezahlen:** EPC-QR („Zahlen mit Code“) aus IBAN/Referenz der Rechnung
- **Papierkorb** (30 Tage), Backup-Export/-Import

## Deploy (Working Copy → GitHub → Vercel)
1. Ordner als Repo pushen, in Vercel importieren (Framework: **Vite** wird erkannt).
2. In Vercel → Settings → Environment Variables:
   - `ANTHROPIC_API_KEY` – dein Claude-API-Key
   - `APP_TOKEN` – frei gewähltes Passwort (schützt deinen API-Key)
   - optional `CLAUDE_MODEL` (Standard `claude-sonnet-5-5`, günstiger: `claude-haiku-5-5`)
3. Redeploy, App öffnen → **Einstellungen** → denselben App-Token eintragen.
4. iPhone: Safari → Teilen → „Zum Home-Bildschirm“.

## Struktur
- `src/App.jsx` – die ganze App (Single-File)
- `api/analyze.js` – Vercel-Funktion, spricht mit der Claude-API (Key bleibt am Server)
- `public/` – Manifest, Service Worker, Icons

## Wichtig
- Daten liegen **lokal** im Browser (IndexedDB) – pro Gerät getrennt. Backup-Export/Import in den Einstellungen.
- Upload-Limit der Vercel-Funktion: ~4,5 MB pro Datei (Fotos werden automatisch verkleinert).
- Fristen: in der App unter „Fristen“ + Export als `.ics` in den Apple-Kalender (Erinnerung 2 Tage vorher und am Vortag, 9:00).

## Lokal entwickeln
`npm install && npx vercel dev` (startet App + API-Funktion)
