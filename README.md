# Fido – Finanzen und Dokumente (PWA)

Dokumente (PDF/Fotos) hochladen → Claude sortiert in Kategorien, vergibt Tags, liest Absender, Datum, **Beträge** (Brutto/Netto/USt) und **Fristen** aus und liefert den Volltext für die Suche.

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
