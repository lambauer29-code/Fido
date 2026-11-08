# FinDocu – Finanzen und Dokumente (PWA)

Dokumente (PDF/Fotos) hochladen → Claude sortiert in Kategorien, vergibt Tags, liest Absender, Datum, **Beträge** (Brutto/Netto/USt) und **Fristen** aus und liefert den Volltext für die Suche.

## v0.25.3

- **Buchungssuche beim Zahlungseingang** (Rechnungen, Mahnungen, Rechnung schreiben mit „Bezahlt“): Eingänge des gewählten Kontos durchsuchen – nach Name, Verwendungszweck oder Betrag. Automatisch vorgefiltert auf den Rechnungsbetrag (abschaltbar), ab Rechnungsdatum (ältere zuschaltbar); Treffer mit Rechnungsnummer/Kunde zuerst (⭐). Kontowechsel aktualisiert die Liste.
- Rechnung schreiben: bei „Bezahlt“ wahlweise „Neue Buchung“ oder „Vorhandene Buchung“ verknüpfen.

## v0.25.2

- Rechnung schreiben: Bei „Zahlung: Bezahlt“ gibt es jetzt **„Auf Konto buchen“** (Bankkonto, Bargeld … oder ohne Buchung). Beim Ausstellen wird der Zahlungseingang dort als Einnahme gebucht und mit der Rechnung verknüpft. Vorausgewählt: zuletzt benutztes Konto bzw. erstes Bankkonto; Bargeld setzt die Zahlungsart auf „Bar“.

## v0.25.1

- **Fix Backup**: Das Backup enthielt nur Dokumente, Umsätze, Konten, Budgets und Regeln – Rechnungen, Kunden, Artikel, Verträge, Firmendaten, Design, Mahnwesen und Einstellungen fehlten. Jetzt ist alles enthalten (ohne Zugangscode); beim Import wird die App danach neu geladen. Export auch ohne Dokumente möglich.
- **Fix Handy**: In der unteren Leiste erschien der Einklapp-Pfeil der Seitenleiste als zusätzlicher Reiter.
- Kunden: Anleitung für den direkten Kontakt-Import am iPhone (Safari-Feature-Flag „Contact Picker API“).

## v0.25.0

- **Rechnungen mit Konten verknüpft – Zahlungseingang verbuchen**: „Als bezahlt markieren“ (Rechnungen, Mahnungen, „Bezahlt“ im Rechnungsfenster) öffnet „Zahlungseingang“:
  - Konto wählen (Bank, Karte, Bargeld …; das zuletzt gewählte ist vorausgewählt) oder ohne Buchung.
  - **Vorhandene Buchung verknüpfen**: passende Eingänge (gleicher Betrag, Rechnungsnummer im Verwendungszweck, Kundenname) werden vorgeschlagen.
  - **Neue Buchung**: legt eine Einnahme mit Datum, Betrag (z. B. Teilzahlung), Kunde und Rechnungsnummer an; Bargeld-Konto → Zahlungsart Bar.
  - Rechnungsliste zeigt „bezahlt … → Kontoname“; in der Buchung steht „Zahlungseingang zu Rechnung …“.
  - „Offen“ (zurückstellen) löst die Verknüpfung; eine dabei angelegte Buchung kann mitgelöscht werden.
  - Der automatisch gefundene Zahlungseingang („💡 … gefunden“) verknüpft die Buchung ebenfalls.

## v0.24.14

- Bezahlte Rechnungen: Knopf zum Zurückstellen heißt jetzt „Offen“.

## v0.24.13

- Rechnungs- und Mahnliste: Betrag, Status und Knöpfe stehen jetzt vertikal mittig in einer Linie; Status-Text exakt zentriert.
- „Doch offen“ heißt jetzt „Noch offen“.

## v0.24.12

- Rechnungen/Mahnungen: Der Knopf „✓ Bezahlt“ heißt jetzt „Als bezahlt markieren“ – er ist eine Aktion, kein Status (der Status steht in der farbigen Markierung daneben).

## v0.24.11

- Rechnungen/Mahnungen: Symbol-Knöpfe vereinheitlicht – „⋯“ (Mehr) sauber zentriert als Symbol, PDF-Vorschau als Auge statt Emoji, gleiche Größe und Hover-Farbe.

## v0.24.10

- Teilen-Menü: WhatsApp an 3. Stelle (E-Mail, Nachrichten, WhatsApp, AirDrop, Telegram, Herunterladen).

## v0.24.9

- Teilen-Menü: neue Einträge **Nachrichten** und **AirDrop** (Datei wird direkt angehängt); „Mehr …“ entfällt.

## v0.24.8

- Teilen-Menü kompakt wie unter macOS: kleines Menü direkt beim Teilen-Knopf (Datei-Kopf mit Name/Größe, E-Mail, WhatsApp, Telegram, Herunterladen, Mehr …). Schließt per Klick daneben oder Esc.

## v0.24.7

- Teilen: Es öffnet sich jetzt **immer das FinDocu-Teilen-Fenster** (E-Mail, WhatsApp, Telegram, Herunterladen) – vorher kam je nach Situation einmal dieses Fenster, einmal das System-Menü. Neu darin: „📤 Mehr …“ öffnet das System-Teilen-Menü (Mail, Nachrichten, AirDrop mit Datei als Anhang).
- E-Mail bei Rechnungen/Mahnungen: Empfänger (E-Mail des Kunden), Betreff und Text sind vorausgefüllt.

## v0.24.6

- Fix: Knöpfe „＋ Position“ / „📷 Artikel scannen“ rutschten in schmalen Fenstern an den rechten Rand und waren abgeschnitten.
- Rechnung: neues Auswahlfeld **Zahlung – Offen / Bezahlt** mit Datum und Zahlungsart (Überweisung, Bar, Bankomat/Karte, PayPal …). Auch bei bereits ausgestellten Rechnungen umstellbar (wird sofort gespeichert). Bezahlte Rechnungen zeigen im PDF „Bezahlt am …“ und „Betrag dankend erhalten“ statt Zahlungsaufforderung und QR-Code.
- Fix: Standard-Einleitungstext fehlte im PDF, wenn die Firmendaten vor dem Update angelegt wurden.

## v0.24.5

- Seitenleiste: Der Pfeil zum Ein-/Ausklappen bleibt immer an derselben Stelle (unten links, Mitte der eingeklappten Leiste).

## v0.24.4

- Seitenleiste: Ein-/Ausklappen nur noch als Pfeil (« / »). Eingeklappt erscheint beim Darüberfahren sofort ein Hinweis mit dem Namen des Reiters.

## v0.24.3

- Seitenleiste **ein-/ausklappbar** (Mac/iPad): unten „« Einklappen“ bzw. „»“, oder ⌘\ (Strg+\ unter Windows). Eingeklappt nur Symbole (Name beim Darüberfahren), Inhalt nutzt die volle Breite; Zustand bleibt gespeichert.

## v0.24.2

- Übersicht anpassen: Das gezogene Widget **schwebt** unter dem Mauszeiger/Finger mit, eine gestrichelte Fläche zeigt den Zielplatz im Raster; andere Widgets weichen live aus. Automatisches Scrollen am oberen/unteren Rand.
- **Weitere Widgets und Leerfeld per Ziehen hinzufügen**: direkt an die gewünschte Stelle ins Raster ziehen (Antippen fügt wie bisher am ersten freien Platz ein).

## v0.24.1

- Übersicht anpassen (Mac/iPad quer, ab 1024 px): Widgets **frei platzieren** – am Griff ⠿ in jede Spalte und Höhe ziehen (links, rechts, oben, unten). Andere Widgets weichen nach unten aus, Lücken bleiben erhalten. Hilfslinien zeigen die 12 Spalten. „Nach oben rücken“ (aus = Standard) schiebt Widgets bei Bedarf automatisch nach oben. Am Handy und schmalen Tablets bleibt die Reihenfolge-Ansicht.

## v0.24.0

- **Artikelscan**: Strichcode (EAN/UPC, Code128 …) oder QR-Code mit der Kamera scannen (auch per Foto oder Eintippen).
  - Reiter Artikel: „📷 Artikel scannen“ – bekannter Code öffnet den Artikel, neuer Code legt ihn an und sucht die Daten automatisch.
  - Artikel-Fenster: Feld „EAN / Strichcode“ mit 📷 Scannen und 🔎 Daten suchen; leere Felder (Bezeichnung, Preis, Einheit, Notiz mit Marke/Herstellernr./Quelle) werden ausgefüllt.
  - Rechnung/Angebot: „📷 Artikel scannen“ fügt die Position hinzu (bekannter Artikel → mit Preis; erneut scannen erhöht die Menge).
- Neue Serverfunktion `api/product.js`: sucht zuerst in Open Food/Products/Beauty Facts, dann per Claude-Websuche (Name, Marke, Herstellernummer, üblicher Preis, Quelle). Die Websuche muss im Anthropic-Konto erlaubt sein (Console › Settings › Privacy/Web search); sie kostet zusätzlich pro Suche.
- Neue Abhängigkeit: `@zxing/browser` (Code-Erkennung, wird erst beim Scannen geladen).

## v0.23.0

- Einstellungen › **Rechnungsdesign**: Designmodule mit Live-Vorschau – Vorlagen Klassisch/Modern/Minimal/Elegant, Akzentfarbe (auch eigene), Schrift (Helvetica/Times/Courier), Logo links/Mitte/rechts und Größe, Schrift- und Titelgröße, Tabelle Linien/Streifen/Schlicht, farbiges Kopfband, hervorgehobene Summe, Spalten/QR/Fußzeile/Absenderzeile/Artikelnr. ein-/ausblendbar, eigene Titel („Rechnung“/„Angebot“), Zusatzzeile. Gilt für Rechnungen, Angebote und Mahnungen.
- Neuer Reiter **Mahnungen**: überfällige Rechnungen mit nächster Stufe und Wartezeit, Mahnung erstellen (auch für noch nicht überfällige Rechnungen), Mahnverlauf mit PDF/Teilen/Zurücknehmen, Kennzahlen (überfällig, Mahnungen, Mahnspesen).
- Einstellungen › **Mahnungen**: Stufen (bis 6) mit Bezeichnung, Frist, Spesen und eigenem Text mit Platzhaltern ({nummer}, {datum}, {betrag}, {faellig}, {frist}, {kunde}), Wartezeit zwischen Stufen, Anrede, Schlusssatz, Vorschau je Stufe.
- Neuer Reiter **Artikel**: Artikel mit Nummer (automatisch ART-001 …), Gruppe, Preis, Einheit, eigenen Positionsfeldern, Notiz, aktiv/inaktiv; Suche, Gruppenfilter, Sortierung, Nutzung/Umsatz je Artikel. Artikelnummer wird beim Auswählen in die Rechnung übernommen und gedruckt.
- Einstellungen › **Artikel**: Nummernkürzel, automatische Nummern, Standard-Einheit, Artikelgruppen, Einheiten.

## v0.22.0

- App umbenannt in **FinDocu** (Browser-Titel, Seitenleiste, Home-Bildschirm-Name, Manifest, Kalender-Abo-Name, Paketname, Texte). Gespeicherte Daten, Einstellungen und Kalender-Abos bleiben erhalten.

## v0.21.2

- Schwebendes ＋: **Kunden importieren** (über „Neuer Kunde“) – Handy-Kontaktauswahl (Android) bzw. vCard-Datei (iPhone/Mac), danach Vorschau im Reiter Kunden.

## v0.21.1

- Einheiten-Auswahl (Positionen in Rechnungen/Angeboten, Artikel): „＋ Neue Einheit …“ direkt im Dropdown; eigene Einheiten gelten überall. Verwalten (entfernen, zurücksetzen) unter Einstellungen › Rechnungen › Artikel.
- Verträge: „＋ Neue Art …“ im Dropdown „Art“ mit eigenem Symbol.

## v0.21.0

- Fix: Rechnungs-Vorschau öffnet sich jetzt in einem App-Fenster (mit ✕, Drucken, Teilen) statt in einem neuen Browser-Fenster – am iPhone kam man dort nicht mehr zurück. Gilt für Vorschau, 📄 und Mahnungs-Vorschau.
- Einstellungen › **Kunden – Kategorien** (neu): eigene Kontakt-Kategorien anlegen, umbenennen, löschen, sortieren; Symbol & Textfarbe (auch eigenes Bild). Im Reiter Kunden führt ⚙︎ direkt dorthin.
- Einstellungen › Rechnungen › **Eigene Felder**: zusätzliche Felder für die Rechnung (im Kopf, z. B. Projekt, Bestellnr.) und für Positionen (unter der Bezeichnung, z. B. Artikelnr., Seriennr.); auch bei Artikeln hinterlegbar und beim Auswählen übernommen. Leere Felder werden nicht gedruckt.

## v0.20.1

- Schwebendes ＋: **Neue Rechnung** und **Neuer Kunde**.
- Kunden: **📱 Aus Handy-Kontakten** – Android/Chrome wählt Kontakte direkt aus; iPhone/Mac über vCard-Datei (.vcf, auch mehrere Kontakte in einer Datei). Vorschau mit Auswahl, bereits vorhandene (gleicher Name/E-Mail) abgewählt, Kundennummern werden fortlaufend vergeben. Übernimmt Name, Firma/Ansprechperson, E-Mail, Telefon/Mobil, Anschrift, Website, Geburtstag, Notiz.

## v0.20.0

- „Fristen“ heißt jetzt **Umtauschfrist** und steht in der Seitenleiste als Unterpunkt unter **Dokumente** (plus Knopf „⏰ Umtauschfrist“ in der Dokumentenliste, Zähler für Fristen der nächsten 7 Tage).
- Neuer Reiter **Kunden**: Kontakte verwalten (Kunde, Lieferant, Partner, Privat, Behörde), Anschrift, E-Mail, Telefon, Kundennr. (automatisch K-001 …), UID, IBAN, Notiz; Suche/Filter, Mail/Anruf-Knöpfe, vCard-Export, „Rechnung“ startet eine Rechnung mit diesem Kunden, Umsatz/offene Rechnungen je Kunde. Gleiche Kundenliste wie in den Rechnungen.
- Einstellungen › **Rechnungen**: Firmendaten, Logo, Bank, Nummernkreise, Texte sowie Artikel & Leistungen.
- Einstellungen › **Seitenleiste** (vorher „Seitenleiste – Reiter“): Symbol & Textfarbe je Reiter (auch eigenes Bild), **Linien** und **Überschriften** einfügen und per Griff platzieren, Reiter als Unterpunkt eines anderen Reiters („unter Dokumente“ …).
- Dokumente – Kategorien: eigene Farbe färbt jetzt auch den Kategorienamen in der Seitenleiste.
- Schwebendes ＋: neuer Eintrag **Umsätze importieren**.

## v0.19.0

- Neuer Reiter **Rechnungen** (Firma, Kleinunternehmer):
  - Rechnungen und Angebote erstellen, fortlaufende Nummer beim Ausstellen (RE-2026-001 / AN-2026-001, Kürzel einstellbar), Entwürfe; ausgestellte Rechnungen sind gesperrt (Storno statt Ändern).
  - PDF im klassischen Briefformat (Logo, Anschrift fürs Fensterkuvert, Positionstabelle, Kleinunternehmer-Hinweis § 6 Abs. 1 Z 27 UStG, Zahlen-QR-Code, Bankdaten in der Fußzeile) – ansehen/drucken, teilen (Mail, WhatsApp …), in Dokumente ablegen.
  - Verlauf mit Status Entwurf/Offen/Überfällig/Bezahlt/Storniert, Suche, Filter, Kennzahlen inkl. Fortschritt zur Kleinunternehmergrenze (€ 55.000).
  - Zahlungseingang wird in Kontobuchungen erkannt (Betrag + Rechnungsnummer im Verwendungszweck).
  - Zahlungserinnerung, 1./2./letzte Mahnung als PDF (neue Frist, optionale Mahnspesen).
  - Angebot → Rechnung mit einem Klick, Angebot abgelehnt markieren.
  - Wiederkehrende Rechnungen: monatlich/vierteljährlich/halbjährlich/jährlich automatisch als Entwurf mit Leistungszeitraum; pausieren/löschen.
  - Kunden & Artikel merken (Auswahl beim Tippen), Pflichtangaben-Prüfung (Anschrift ab € 400, UID ab € 10.000).
  - Firmendaten: Name, Anschrift, Kontakt, Steuernummer/UID, FN, Bank, Logo, Zahlungsziel, Texte.
- Neuer Reiter **Verträge** für hinterlegte Verträge (Privat & Firma): Internet, Handy, Strom, Versicherung, Miete …; Betrag/Intervall, Beginn, Mindestlaufzeit, Kündigungsfrist, automatische Verlängerung → berechnet nächstes Vertragsende und letzten Kündigungstag; Kosten pro Monat (Privat/Firma), „kündbar in 60 Tagen“, Dokumente verknüpfen, Kündigungsschreiben, als gekündigt markieren, Übernahme von Claude erkannten Verträgen aus Dokumenten.
- Bisheriger Reiter „Verträge“ heißt jetzt **Fixkosten & Abos** (unverändert).

## v0.18.0

- **Teilen** in der Symbolleiste jedes Dokuments (zwischen Drucken und Löschen): System-Teilen-Menü mit der Originaldatei – Nachrichten, WhatsApp, Mail, AirDrop usw.
- **Mehrere Dokumente teilen**: „☑︎ Auswählen“ bei den Filtern, Dokumente antippen, unten „Teilen“.
- Browser ohne Datei-Teilen: Fenster mit E-Mail, WhatsApp, Telegram und Herunterladen.

## v0.17.2

- Handy: Solange ein Fenster offen ist, werden Auge/Tag-Nacht und ＋ ausgeblendet.
- Offenes Fenster sperrt den Hintergrund (kein Mitscrollen), Scrollposition bleibt erhalten.

## v0.17.1

- Einstellungen: „Dokumente – Gruppen“ und „Dokumente – Kategorien“ getrennt.
- Fix: „0“ neben „Dokumente“ in der Seitenleiste.

## v0.17.0

- Neuer Reiter **Barausgabe** in der Seitenleiste (vor Einstellungen; am iPhone in Einstellungen › Seitenleiste zuschaltbar): Eingabe für Bargeld links, rechts Bestand und letzte Barbuchungen.
- Neues Übersicht-Widget **Barausgabe erfassen** (Sofort-Eingabe direkt auf der Übersicht).
- Bargeld-Eingabe überall (Fenster, Widget, Reiter): Beleg per **📷 Scannen** oder **🖼 Foto/Datei** anhängen – wird nach dem Speichern ausgelesen und der Buchung zugeordnet. Neue Kategorie direkt in der Auswahl.
- Einheitliche Auswahlfelder in der ganzen App: Kategorie, Konto, Gruppe usw. haben jetzt dieselbe Höhe und Optik wie Textfelder (eigener Pfeil statt Safari-Standard); Datumsfelder gleich hoch.
- Kategorien: eigene Symbole hochladen (Bilder) bzw. eigenes Emoji – gemeinsame Sammlung mit den Konto-Symbolen.

## v0.16.8

- Dokument bearbeiten: In der Kategorie-Auswahl gibt es „＋ Neue Kategorie …“ – Fenster mit Name, Gruppe (bestimmt Finanzen/Verträge/Sonstiges), Symbol und Farbe; die neue Kategorie wird gleich zugewiesen.
- Einstellungen › Dokumente – Gruppen & Kategorien: Tipp aufs Symbol einer Kategorie öffnet Symbol- und Farbauswahl (inkl. eigenem Emoji/Zeichen und eigener Farbe, „Standard“ setzt zurück).

## v0.16.7

- Kacheln: Symbole zentriert, Druckersymbol in der Schwebeleiste.
- Klick auf eine Kachel öffnet die Vorschau in einem eigenen Fenster (mit ✎ zum Bearbeiten), nicht mehr direkt das Bearbeiten-Fenster.

## v0.16.6

- Dokumente als Kacheln: Schwebeleiste wie in der Vorschau (Seitenzahl + „Original öffnen“) oben rechts auf dem Vorschaubild – am Computer beim Darüberfahren, auf iPhone/iPad immer sichtbar.
- Bearbeiten/Drucken/Löschen-Symbole stehen jetzt in der obersten Reihe der Kachel, darunter der Titel.

## v0.16.5

- Seitenleiste: Klick auf **Dokumente** bzw. **Konten** klappt alle Untergruppen auf einmal auf; ein weiterer Klick (wenn schon alles offen ist) klappt alle zu. Beim Wechsel aus einem anderen Bereich wird immer aufgeklappt.

## v0.16.4

- App umbenannt in **Fidocu** (Titel, Seitenleiste, Home-Bildschirm-Name, Manifest, Kalender-Abo-Name). Interne IDs (gespeichertes Design, Kalender-Speicherpfad) bleiben gleich, damit Einstellungen und bestehende Kalender-Abos weiter funktionieren.

## v0.16.3
- Eigene Symbole: hochgeladene Bilder (auch mehrere auf einmal) und eigene Emojis/Zeichen landen in einer Sammlung „Eigene Symbole“, die für alle Konten verfügbar ist; mit × löschbar. Wird im Backup mitgesichert.

## v0.16.2
- Einstellungen › Konten & Gruppen: pro Konto 🎨 Textfarbe (Palette oder eigene) und Symbol vor dem Namen (Standard, keins, Emoji-Auswahl oder eigenes Bild hochladen). Gilt in Seitenleiste, Konto-Karten, Kontenauswahl und Übersicht.

## v0.16.1
- Alle schwebenden Fenster: Klick daneben (oder Esc / ✕) schließt sie. Bei ungespeicherten Änderungen erscheint oben „Speichern · Verwerfen · Weiter bearbeiten“ (beim Import „Importieren“, im Scanner „Fertig“).

## v0.16.0 – Kalender-Ansichten
- Fristen-Kalender: Woche (mit Kalenderwoche, Fristen ausgeschrieben, ziehbar), Monat, Jahr (12 Monate, farbige Tage, Monat antippen = Monatsansicht) und Kompakt (Monat mit Punkten). Ansicht wird gemerkt.
- Dokumente: Bearbeiten-Symbol wieder in der Zeile; aus der schwebenden Vorschau-Leiste entfernt.

## v0.15.6
- Drucken: Druckersymbol neben dem Papierkorb und in der Vorschau-Leiste – druckt alle Seiten (PDF oder Bild) über den normalen Druckdialog.

## v0.15.5
- Vorschau: „Original öffnen“ und „Bearbeiten“ schweben oben über dem Dokument (bleiben beim Scrollen sichtbar).
- Dokumentliste: Symbole Bearbeiten/Vorschau/Öffnen entfernt – Titel = Vorschau, Zeile = Bearbeiten, 🗑 bleibt.

## v0.15.4
- Fristen-Kalender: ausgewählter Tag (anfangs heute) mit seinen Fristen ganz oben, darunter ein-/ausklappbare Liste „Bevorstehend“ (überfällige zuerst, Tage bis zur Frist, Klick springt im Kalender hin), dann der Monatskalender.

## v0.15.3
- Datum überall einheitlich als TT.MM.JJJJ (z. B. 05.11.2026), Spalten mit gleich breiten Ziffern.

## v0.15.2
- Verträge: Buchungen je Abo/Vertrag ausklappbar (Pfeil bzw. Name antippen) – mit Summe gesamt und pro Jahr, Konto, Verwendungszweck und Beleg-Hinweis. Vertragsdokumente: „Buchungen (n) ▾“.

## v0.15.1
- Abos aus Kontoumsätzen: ✓ bestätigen (zählt immer zu den Fixkosten, auch wenn länger nicht gebucht) und ✕ deaktivieren (Vertrag beendet, zählt nicht mehr; unter „beendet / inaktiv“ wieder aktivierbar).

## v0.15.0 – Verträge für große Displays
- Abos aus Kontoumsätzen als Tabelle (Anbieter, Kategorie, Intervall, Betrag, pro Monat, pro Jahr, zuletzt), sortierbar, mit ✕ entfernbar; schmal automatisch als Liste.
- „Vermutlich beendet“: Abos ohne Buchung seit deutlich mehr als einem Intervall zählen nicht mehr zu den Fixkosten (einblendbar).
- Vertragsordner zweispaltig ab breiten Bildschirmen; statt großer Leer-Meldung ein kompakter Hinweis.

## v0.14.5
- Dokumentliste: Klick auf den Titel öffnet/schließt die Vorschau.
- Dokument-Fenster öffnet ab iPad-Breite immer mittig (Größe wird gemerkt).

## v0.14.3
- Kontostand-Karte hat jetzt immer denselben Aufbau (ein Konto oder mehrere) – kein Springen mehr beim Darüberfahren über die Konto-Karten. Einzelkonto zeigt Eingänge, Ausgänge, Saldo, Buchungen.

## v0.14.2
- Konto-Karten: Maus darüber = Vorschau nur dieses Kontos (Karte, Summen, Buchungen; andere Karten abgeblendet), Maus weg = zurück. Klick = Konto fest auswählen. Touch: 1. Tippen Vorschau, 2. Tippen auswählen.

## v0.14.1
- Seitenleiste: Zeile „Mehrfachauswahl“ entfernt (Schalter bleibt unter Einstellungen › Konten & Gruppen).
- Konto-Karten: Klick zeigt nur dieses Konto, solange die Maus darauf bleibt (Doppelklick = fest auswählen; am Handy antippen = an/aus).

## v0.14.0 – Kalender & Apple-Kalender-Abo
- Fristen: interaktiver Monatskalender (Standard) oder Liste. Fristen aus Bons/Rechnungen erscheinen automatisch; per Ziehen auf einen anderen Tag verschieben, Tag antippen = Details, abhaken, Datum ändern.
- „Mit Apple Kalender verbinden“: Kalender-Abo (webcal) – FinDocu lädt Änderungen automatisch hoch, Apple Kalender holt sie selbst ab. Benötigt einen kostenlosen Vercel-Blob-Speicher (Storage › Blob › mit Projekt verbinden, dann Redeploy). Funktioniert auch mit Google Kalender/Outlook.
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
