# FinDocu – Finanzen und Dokumente (PWA)

Dokumente (PDF/Fotos) hochladen → Claude sortiert in Kategorien, vergibt Tags, liest Absender, Datum, **Beträge** (Brutto/Netto/USt) und **Fristen** aus und liefert den Volltext für die Suche.

## v0.99.63 – Fahrtenbuch-Symbole wie in den Konten
- Eigene Fahrtenbuch-Bilder im Verlauf haben jetzt dieselbe Form wie Symbole und Logos in den Konten (beim Stil „Emoji“ abgerundetes Quadrat statt Kreis) und einen weißen Grund
- Größe folgt der Symbolgröße aus Einstellungen → Design → Symbole

## v0.99.62 – Übersicht: Konten-Kachel in normaler Größe
- Graphit, Sand, Nacht, Schiefer, Salbei, Papier: Namen und Beträge in Zeilen-Listen (Konten-Kachel, Dokumente, Rechnungen, Kunden, Verträge) am Desktop 15 px statt 20 px (Handy-Größe aus dem Finanzguru-Stil)

## v0.99.61 – Schrift- & Zahlengrößen je Design
- Einstellungen → Design → „Schrift- & Zahlengrößen“: Schalter „Eigene Größen für <Design>“ – jedes Design (Graphit, Sand, Nacht, Schiefer, Salbei, Papier, Klassisch, Glas …) kann eigene Größen haben; ohne eigene gelten die allgemeinen
- Zahlen jetzt in drei Stufen einstellbar: große Beträge (Kontostand, Saldo), Kennzahlen-Kacheln, Beträge in Listen
- Sprung-Link direkt unter der Design-Auswahl

## v0.99.60 – Fix: riesige weiße Logo-Kästen
- Firmenlogos in Buchungszeilen waren nach v0.99.59 riesig und leer: der Innenabstand war in Prozent angegeben und bezog sich auf die Breite der Tabellenzeile – jetzt fester Anteil der Symbolgröße, Logo wieder sichtbar und gleich groß wie die anderen Symbole

## v0.99.59 – Symbole auch in Buchungszeilen
- Buchungszeilen in Konten: Symbole und Firmenlogos (z. B. Raiffeisen, BILLA, Netflix) folgen jetzt der eingestellten Symbolgröße und -form – ein älterer Stil-Regelsatz hatte dort 47 px erzwungen
- Logos: gleiche Größe und Form wie die anderen Symbole (Kreis bzw. abgerundetes Quadrat bei „Emoji“)
- Umbuchungs-Pfeile (⇄) haben ein Linien-Icon

## v0.99.58 – Einheitliche Symbole
- Einstellungen → Design → „Symbole“: vier Stile – Linie im getönten Kreis, volle Farbe mit weißem Icon, Emoji auf getöntem Quadrat, nur Linie
- Größe per Regler (22–48 px, Standard 32 px) – gilt für Kategorien, Konten, Buchungen, Fahrtenbuch, Depot/Vermögen, Besitz, Verträge, Lager und Handy-Listen
- Eigene Symbole bleiben erhalten; neu anpassbar wie beim Fahrtenbuch: Kategorien und Kontoarten (Emoji, Farbe oder eigenes Bild), Fahrtenbuch-Symbole jetzt auch dort
- Linien-Icons: Tabler Icons (MIT-Lizenz)

## v0.99.57 – Kontoauszug: PDF und Liste gekoppelt
- Ansicht „Beides“: Scrollt man links im PDF, läuft die Buchungsliste rechts mit (und umgekehrt) – die gleiche Buchung steht auf beiden Seiten auf gleicher Höhe, am Ende sind beide Seiten ganz unten
- Maus über bzw. Antippen einer markierten PDF-Zeile holt die Buchung rechts ins Bild
- Schalter „🔗 Gekoppelt / Entkoppelt“ in der Leiste (wird gemerkt)

## v0.99.56 – Kassabuch: Beleg-Spalte wählbar + neue Beleg-Optionen
- Einstellungen → Design → Ansichten → „Kassabuch – Beleg-Spalte“: Icons, ein Knopf „Beleg ▾“ oder Status + Auge
- Neues Beleg-Menü: Datei hochladen, Kamera live (Webcam, iPhone als Continuity-Kamera, Handy-Kamera – danach Ecken anpassen), passende Belege vorschlagen (gleicher Betrag, Datum ±7 Tage), aus Dokumenten wählen, aus Zwischenablage einfügen (⌘V), Eigenbeleg als PDF erstellen, Belegnummer/Ablageort eintragen
- Datei per Drag & Drop direkt auf eine Kassabuch-Zeile ziehen
- Mit Beleg: Ansehen, Drucken, Teilen, Ersetzen (Datei/Kamera/Dokument/Zwischenablage), Lösen
- Punkt am ⋯ bzw. „fehlt · 2✨“ zeigt, wenn passende Belege gefunden wurden

## v0.99.55 – Kassabuch-Spalten fix, Guthaben-Farbe überall
- Kassabuch: Beleg-Spalte hat eine feste Breite – Saldo und Summen stehen in jeder Zeile genau untereinander
- Guthaben-Farbe (Einstellungen → Design) gilt jetzt überall: Kontoliste in der Seitenleiste, Konten, Buchungen, Journal, Dokumente (Einnahmen), Analyse, Vermögen (Dividenden), Firmenauswertung, Rechnungen, Kassabuch – auch in den Stilen Graphit, Sand, Nacht, Schiefer, Salbei, Papier und Glas

## v0.99.54 – Ansichten wählbar: Monate, Sortierung, Abo-Status
- Einstellungen → Design → „Ansichten“: drei Auswahlen mit Vorschau
- Steuerberater → Monate: Karten, Liste, Tabelle (Monate × Prüfpunkte), Zeitleiste, Jahres-Kacheln, Nur Offene – auch direkt im Reiter über „▦“ umschaltbar
- Sortierung in allen Listen-Reitern (Dokumente, Journal, Konten, Ausgabe, Rechnungen, Mahnungen, Kunden, Artikel, Lager, Kassabuch, Fahrtenbuch, Verträge, Fixkosten, Besitz) inkl. „Zuletzt hinzugefügt“; nochmal tippen dreht die Reihenfolge um; jeder Reiter merkt sich seine Sortierung
- Sortier-Darstellung: Dropdown-Button, Segment-Schalter oder Spaltenkopf (am Handy Dropdown)
- Fixkosten & Abos: Status als Status + ✓ ✕ (bisher), nur grüner Haken, Haken + Auswahl, Status-Auswahl oder Punkt am Symbol

## v0.99.53 – Monate, Kassabuch-Belege, Fristen-Popups, Akzentfarben
- Steuerberater → Monate: Monate ein-/ausklappbar (merkt sich den Zustand), „Alle aufklappen/zuklappen“
- Offene Punkte eines Monats öffnen ein Popup mit den Objekten (Buchungen ohne Beleg mit „Beleg zuordnen“, Firma/Privat-Auswahl, Rechnungen als PDF, Kassabuch-Belege, offene Fragen)
- Kassabuch: neue Spalte „Beleg“ – mit Beleg: Ansehen · Drucken · Teilen · ⋯ (ersetzen, scannen, anderes Dokument, lösen); ohne Beleg: 📎 Hinzufügen · 📷 Scannen · ⋯ vorhandenes Dokument; am Handy per Wischen
- Fristen: Verträge, Besitz/Garantien, Rechnungen, Steuer/SVS, Monatsabschluss und Aufbewahrung öffnen als Popup statt den Reiter zu wechseln
- Design: Markierungsfarbe für Graphit, Sand, Nacht, Schiefer, Salbei und Papier wählbar (z. B. Gold)

## v0.99.52 – Flache Stile näher an der Vorlage

- Systemschrift (San Francisco) jetzt auch für Buttons, Navigation und Eingabefelder – vorher setzte der Handy-Look dort noch Outfit durch. Eine selbst gewählte Schrift hat weiterhin Vorrang.
- Ruhigere Größen am Computer: Grundschrift 15 px, Kachel-Titel 19 px, Seitentitel 30 px, Kennzahlen 26 px mit grauer Beschriftung, Zeilen 15 px mit kleiner grauer Erklärung, Zusatzinfo im Kachelkopf grau statt farbig, mehr Innenabstand.

## v0.99.51 – Flache Designs Schiefer, Salbei, Papier

- Drei weitere flache Stile unter Einstellungen › Design: „Schiefer“ (kühles Blaugrau, Indigo), „Salbei“ (gedämpftes Grün), „Papier“ (reines Schwarz-Weiß) – jeweils hell und dunkel.
- Flache Stile verwenden ihre eigene Akzentfarbe; eine selbst gewählte Akzentfarbe hat weiterhin Vorrang.
- Papier dunkel: Häkchen und Markierungen bleiben auf weißem Akzent lesbar.

## v0.99.50 – Flache Designs Graphit, Sand, Nacht

- Neue Stile unter Einstellungen › Design: „Graphit“ (neutral, Akzent Blau), „Sand“ (warm, Ton-Orange, Titel mit Serifen), „Nacht“ (fast schwarz, Petrol) – jeweils hell und dunkel.
- Flach in der ganzen App: keine Schatten/Verläufe, feine Haarlinien, Kacheln mit getönten Kennzahl-Feldern, Hauptbutton in Textfarbe, übrige Buttons mit Umrisslinie, getönte Chips/Pills, ruhige Eingabefelder, Menüs und Fenster; Systemschrift mit zwei Strichstärken.
- Akzentfarbe bleibt über die Farbvorlagen bzw. eigene Farbe änderbar.

## v0.99.49 – Duplikaterkennung

- Gleiche Datei: Beim Hochladen wird ein Fingerabdruck (SHA-256) verglichen – sofort und vor der KI. Nachfragen (Überspringen / Vorhandenes ansehen / Trotzdem ablegen, „für alle weiteren übernehmen“), automatisch überspringen oder immer ablegen – in den Einstellungen wählbar. Beim Beleg-Zuordnen wird ein vorhandener Beleg direkt verknüpft.
- Gleicher Beleg in anderer Datei (Foto + PDF): nach dem Auslesen anhand Rechnungsnummer bzw. Absender + Betrag + Datum (± 3 Tage) – nachfragen und markieren oder nur markieren. Hinweis im Dokument (Vergleichen / Ist kein Duplikat / Papierkorb) und Filter „Mögliche Duplikate“ in Dokumente.
- Kontoauszüge: gleiche Datei wird vor dem KI-Auslesen erkannt; gleiches Konto + gleicher Zeitraum → nicht ablegen / altes ersetzen / beide behalten.
- Einstellungen › Duplikaterkennung: Verhalten wählen, vorhandene Dokumente einmal komplett prüfen.

## v0.99.48 – Aufbewahrungspflicht & Löschschutz

- Jedes Dokument zeigt „🔒 Aufbewahrungspflicht bis 31.12.JJJJ“ (7 Jahre ab Ende des Belegjahres, § 132 BAO); pro Dokument änderbar: Standard / 7 / 12 / 22 Jahre (Grundstücke) / keine.
- Geschützt sind wahlweise nur Firmenbelege oder Firmen- plus private steuerrelevante Belege (Standard).
- Löschschutz beim endgültigen Löschen (einzeln, „Papierkorb leeren“) – getrennt einstellbar für Dokumente sowie für Buchungen/Konten, Rechnungen und Kassabuch: nur Warnung, Eingabe von „LÖSCHEN“ bzw. „ALLES LÖSCHEN“, Löschschutz-Passwort, Passwort + Eingabe oder komplett gesperrt.
- Papierkorb leert geschützte Dokumente nicht mehr automatisch nach 30 Tagen.
- Einstellungen › Aufbewahrungspflicht & Löschschutz: Übersicht (geschützt / abgelaufen / Grundstücke), Liste der abgelaufenen Belege zum Prüfen und Löschen; jährliche Erinnerung in „Fristen“. Es wird nie automatisch gelöscht.

## v0.99.47 – Fristenkalender mit Steuerterminen und Erinnerungen

- Reiter „Umtauschfrist“ heißt jetzt „Fristen“ und zeigt alle Termine an einem Ort, farbig nach Art und filterbar: Steuer & SVS, Rechnungen, Monatsabschluss, Dokumente, Kündigungen, Garantien.
- Neue automatische Termine: ESt-Vorauszahlungen (15.2./15.5./15.8./15.11., bei Wochenende/Feiertag nächster Werktag), SVS-Beiträge (Ende Feb/Mai/Aug/Nov), Einkommensteuererklärung (30.6.), Zahlungseingang offener Rechnungen, Mahnung fällig, Monatsabschluss (einstellbarer Tag, Standard 10.). Bezahlte Vorauszahlungen/SVS werden anhand der Buchungen automatisch abgehakt; Betrag aus der letzten Zahlung.
- 🔔 Erinnerungen: Vorlauf in Tagen und Uhrzeit frei einstellbar (Standard 3 Tage vorher, 9:00), optional je Art und zusätzlich am Fälligkeitstag. Gilt für das Kalender-Abo (Apple, Google, Outlook) und für Benachrichtigungen am Mac bzw. im Browser, solange FinDocu offen ist.
- Mac-App: Benachrichtigungen über tauri-plugin-notification (neuer App-Build nötig).

## v0.99.46 – E-Rechnungen lesen und schreiben

- Lesen: ZUGFeRD 1.0/2.x / Factur-X (PDF mit eingebettetem XML), XRechnung (CII und UBL), Peppol-UBL, ebInterface 4.x–6.1. Daten (Nummer, Datum, Fälligkeit, Absender, UID, Netto/USt/Brutto je Satz, IBAN, Referenz, Positionen) werden exakt und kostenlos übernommen – die KI nur als Fallback. Kategorie und Firma/Privat aus früheren Belegen desselben Absenders.
- Reine XML-Rechnungen: lesbare PDF-Ansicht wird erzeugt, Original-XML ist im PDF eingebettet (ein Dokument). Im Dokument: „XML herunterladen“, „Stattdessen mit KI auslesen“.
- Schreiben: eigene Rechnungs-PDFs enthalten automatisch Factur-X/ZUGFeRD (EN 16931) – abschaltbar in den Firmendaten. Zusätzlich im ⋯-Menü der Rechnung: XRechnung 3.0 (CII-XML) und ebInterface 6.1 (XML). Kleinunternehmer: Steuerkategorie E mit Befreiungshinweis.
- Geprüft: Factur-X/XRechnung gegen das offizielle EN-16931-XSD, ebInterface gegen das offizielle 6.1-Schema (beide gültig).

## v0.99.45 – Rücklage für Einkommensteuer & SVS, Kleinunternehmergrenze

- Steuerberater → 💰 Rücklage: wie viel für Einkommensteuer und SVS zurückzulegen ist (Gewinn hochgerechnet, Gewinnfreibetrag, Veranlagungsfreibetrag, Grenzsteuersatz zusätzlich zum Gehalt, bereits bezahlte Vorauszahlungen/SVS aus den Buchungen erkannt), Empfehlung pro Monat.
- Balken zur Kleinunternehmergrenze (55.000 € / Toleranz 60.500 €) mit Hochrechnung, Vorjahr und Warnstufen.
- KI-Auswertung (Websuche, österreichisches Steuerrecht): entscheidet Betrieb/Kapital und SVS-Art, schätzt das Gehalt (KZ 245) aus den Gehaltseingängen und liefert die aktuellen Rechenwerte. Alles auch manuell wählbar (Lohnzettel, Brutto-Monatsgehalt, Gewerbeschein, Neue Selbständige, Ausnahme …).
- Anzeige in der Firmenauswertung und als Kachel in der Übersicht – ein-/ausschaltbar unter Steuerberater → Einstellungen bzw. in der Rücklage.
- Server: /api/tax mit neuem Modus „reserve“.

## v0.99.44 – Kontoverwendung als Dropdown

- Steuerberater → Einstellungen: Privat / Firma / Beides je Konto jetzt als Dropdown im gewohnten App-Format statt Umschaltleiste.

## v0.99.43 – Monatsabschluss erweitert

- Steuerberater → Monate: neue Prüfpunkte „Firmenbelege ohne Buchung“ (mit Liste, Ansehen und „Passt so“), „Ausgangsrechnungen“ (überfällig und noch nicht gemahnt) und „Kassabuch“ (Buchungen ohne Beleg, negativer Kassastand).
- Fortschrittsbalken „x von y erledigt“ in jeder Monatskarte.
- „📦 An Steuerberater senden“ öffnet das Paket direkt für diesen Monat.
- Abschluss bleibt ein Häkchen – nichts wird gesperrt.

## v0.99.42 – Fix: Beleg zuordnen ab dem 2. Mal

- Kontoauszug: Das Fenster „Beleg zuordnen“ rutschte hinter den Kontoauszug, sobald man in den Auszug klickte – weitere Klicks auf „zuordnen“ zeigten dann scheinbar nichts. Es öffnet sich jetzt bei jedem Klick neu und immer im Vordergrund.
- Handy/iPad: Das Zuordnen-Fenster lag hinter dem Vollbild-Auszug – jetzt korrekt darüber.

## v0.99.41 – Belege im Kontoauszug zuordnen

- Kontoauszug: „Beleg fehlt · zuordnen“ bzw. „📎 Beleg zuordnen“ öffnet eine Auswahl mit passenden Belegen (Betrag, Datum, Absender), mit Suche und Upload.
- Datei direkt auf eine Buchungszeile ziehen → wird hochgeladen und zugeordnet.
- „📎 Belege zuordnen“ ordnet eindeutige Treffer automatisch zu.
- Klick auf „📎 Belegname“ öffnet den Beleg; Menü „Beleg zuordnen/ändern“.
- Druck zeigt den Belegnamen; neues Kopf-Icon „Auszug mit Belegen“ (ein PDF mit allen Belegen dahinter).
- Lupe-Button bleibt in der Ansicht „Liste“ sichtbar, ist dort aber deaktiviert.

## v0.99.40 – Kontoauszug-Leiste wie vorher
- Leiste (PDF/Beides/Liste, KI neu prüfen, Lupe, Abgleichen) wieder im vorherigen Design; Drucken/Teilen/Speichern oben bleiben

## v0.99.39 – Kontoauszug-Fenster: Drucken & Teilen
- Oben rechts Drucken, Teilen und Speichern (markierter Auszug) als schlanke Icons wie in Dokumente
- Leiste (PDF/Beides/Liste, KI neu prüfen, Zoom, Lupe, Abgleichen) als kleine flache Pills im App-Design

## v0.99.38 – Kontoauszug-Farben einstellbar
- Einstellungen › Darstellung › „Kontoauszug: Farben der Markierung“: Farben für Firma, Unklar und (optional) Privat, mit Vorlagen und Vorschau
- „Gleiche Farben in der App-Ansicht“ (Standard: an) – Markieren in der App und Ausdruck sehen jetzt gleich aus

## v0.99.37 – Kontoauszüge: kompakte Zuordnung & Lupe-Schalter
- Firma/Privat/Unklar-Knopf und sein Menü im Stil der Status-Pills (kleiner, ohne Schatten)
- Lupe ein/aus über „🔍 Lupe“ in der Leiste des Kontoauszugs – in beiden Zoom-Varianten, Standard: aus
- Esc schließt ein offenes Menü, ohne das Fenster zu schließen

## v0.99.36 – Rechnungsdesign auch für Berichte
- Alle Berichte-PDFs (Steuerberater, Kontoauszüge-Deckblatt, Buchungsbeleg, Offene Posten …) übernehmen Logo, Akzentfarbe und Schrift aus dem Rechnungsdesign
- Eigenes Briefpapier als Hintergrund bei Berichten im Hochformat (Querformat-Tabellen mit Logo statt Briefpapier); Inhalt beginnt unter dem Briefkopf, freier Rand unten wie eingestellt

## v0.99.35 – Steuerberater: KI stellt alles passend zur Tätigkeit ein
- KI ordnet deine Kategorien passend zur Tätigkeit den E1a-Kennzahlen zu (mit Begründung, ✨ markiert; eigene Auswahl hat Vorrang)
- KI setzt Kleinunternehmer, Kilometergeld, Arbeitsplatzpauschale und Inland/Ausland der Depots – jeweils mit Begründung, jederzeit änderbar
- KI schlägt den Kontenplan für BMD/DATEV passend zur Tätigkeit vor (nur solange nicht selbst angepasst)
- KI erkennt die Wertpapierklassen für die E 1kv (Aktie, Fonds, Derivat, CFD/Future, Krypto)
- Beim Wechsel auf ein Jahr ohne KI-Werte prüft die App automatisch für dieses Jahr nach

## v0.99.34 – Steuerberater: alle Formate
- Jeder Bericht als PDF, Excel (.xlsx) und CSV (Strichpunkt, für Excel Österreich) – auch Pauschalierungsvergleich, Offene Posten, Fehlende Belege und E 1kv
- ZIP enthält PDF + Excel, auf Wunsch zusätzlich CSV
- „Angaben für die Berechnung“ zeigt die gewählte Tätigkeit (z. B. Trading auf eigene Rechnung mit den Angaben) mit „Ändern“; bei Trading werden die Pauschalierungs-Angaben ausgeblendet

## v0.99.33 – Steuerberater: Tätigkeitssuche & E 1kv
- „Art der Tätigkeit“ als Suchfeld: eingebaute Liste mit 35 häufigen Tätigkeiten in Österreich (inkl. Trading, Krypto, Prop-Trading) oder freie Suche mit KI-Recherche im Internet
- Bei Trading Rückfragen (Rechtsform, Instrumente, Broker im Ausland); die KI erstellt ein Steuerprofil: Einkunftsart, Formulare, Steuersatz, Gewerbe/Konzession, Absetzbares, Fristen, offene Fragen für den Steuerberater
- Berichte passen sich dem Profil an (z. B. bei Trading: E1a, Pauschalierung, Wareneingang, km-Geld ausgeblendet)
- Neuer Bericht „E 1kv – Kapitalerträge (Depots)“ aus den Depot-Buchungen: gleitender Durchschnittspreis, KZ 863/898/994/892/995/896/174/176/998, anrechenbare Quellensteuer, geschätzte Steuer, Hinweis auf nicht verbriefte Derivate; Depot (Ausland/Inland mit KESt) und Wertpapierklasse einstellbar

## v0.99.32 – Adresse: Stiege, Tür, Zusatz, Postfach
- Optionale Adressfelder über „＋ Stiege, Tür, Zusatz, Postfach“ (klappt automatisch auf, wenn schon Werte vorhanden sind)
- Druck in österreichischer Kurzform: Landstraße 12/2/5 (nur Tür: 12/5, nur Stiege: 12/Stg. 2); Adresszusatz/c/o über der Straße, Postfach darunter

## v0.99.31 – Adressen & Zuordnung
- Adressen überall getrennt: Straße & Hausnummer, PLZ, Ort, Land (Kunden, Rechnung, Firmendaten, Meine Daten)
- Adresssuche beim Tippen der Straße (OpenStreetMap), PLZ füllt den Ort automatisch
- Bestehende Adressen werden automatisch in die Felder aufgeteilt
- Konten › Buchung: Firma/Privat/Unklar zeigt nur die gewählte Zuordnung, Änderung über das Menü

## v0.99.30 – Journal: Leiste über dem Beleg
- Titel, Betrag und ‹ ✎ › stehen jetzt über der Belegvorschau statt darunter
- Einstellungen › Darstellung › „Journal: Leiste über dem Beleg“: schwebend auf dem Beleg (Standard) oder als eine Zeile darüber

## v0.99.29 – Kleinigkeit
- Steuerberater › Berichte: Vorschau-Auge auf gleicher Höhe wie PDF/Excel/CSV

## v0.99.28 – Einheitliche Buttons & Menüs
- Zeilen-Buttons in allen Reitern wie in Dokumente: schlanke Icons ohne Kästchen (Rechnungen, Mahnungen, Verträge, Fixkosten, Kunden, Kontoauszüge, Steuerberater, Fahrtenbuch)
- Alle Dropdown-Menüs im Stil des Teilen-Menüs, mit „Abbrechen“ unten; Klick daneben oder Esc schließt, Klick auf einen Menüpunkt schließt immer
- Konten: Buchungen ohne Beleg können als Buchungsbeleg (PDF) gedruckt und geteilt werden

## v0.99.27 – Kontoauszug: gezoomtes PDF verschieben
- Gezoomtes PDF mit gedrückter Maus in alle Richtungen verschieben (Hand-Cursor); Klick auf eine Zeile wechselt weiterhin Firma/Privat
- Shift + Mausrad scrollt seitlich, Scrollbalken immer sichtbar, Wischen am Touchscreen in alle Richtungen

## v0.99.26 – Kontoauszug: fixierte Leiste & Zoom
- Kontoauszug-Ansicht: Titel und Leiste (Firma/Privat/unklar, Ansicht, KI, Abgleichen) bleiben beim Scrollen oben fixiert
- Zoom im PDF (50–400 %), auch in der Ansicht „Beides“; Strg + Mausrad / Trackpad-Zoom; Zoom wird gemerkt
- Einstellungen › Darstellung › „Kontoauszug: Zoom im PDF“: Zoom in der Leiste oder schwebender Zoom unten rechts mit Lupe

## v0.99.25 – Kontoauszüge: Ablagefeld
- Kontoauszüge: Ablagefeld (Dateien oder Ordner hineinziehen oder klicken) statt „＋ Kontoauszug hochladen“
- Auszug hinzufügen, Auszug bearbeiten und die Vorschau schließen nicht mehr bei einem Klick daneben (✕ oder Esc schließt)
- Eigenes Augen-Symbol im Hinweistext

## v0.99.24 – Reiter Kontoauszüge
- Eigener Reiter „Kontoauszüge“ in der Seitenleiste (unter Konten, am Handy unter Firma): heruntergeladenen Auszug hochladen, KI erkennt die Buchungen und markiert die Firmenzeilen
- Monatsübersicht je Konto (vorhanden / unklare Zeilen / fehlt), Filter nach Konto und Jahr
- Je Auszug 👁 Vorschau und 🖨️ Drucken des markierten Auszugs; „Alle drucken“ mit Deckblatt (Übersicht, Summen, fehlende Belege)
- Druck-Markierung: nur Firma grün, unklar gelb, privat unmarkiert; neben Firmenzeilen Kategorie und Beleg-Status; unten auf jeder Seite Legende und Firmensumme
- Steuerberater › Berichte: Vorschau-Auge ganz am Ende der Zeile

## v0.99.23 – Steuerberater: KI-Prüfung, Vorschau & Kanzlei-Exporte
- Berichte mit Vorschau (Auge) im Popup
- „Deine Tätigkeit“: Art wählen + eigene Beschreibung, KI recherchiert im Internet Einkunftsart, Sozialversicherung, Pauschalierungssätze und Grenzen und übernimmt sie in die Berichte
- KI-Prüfung nach aktuellem österreichischem Steuerrecht (mit Websuche) automatisch vor jedem Export und vor dem Steuerberater-Paket; wählbar: nur Summen oder auch Einzelbuchungen; Ergebnis wird gemerkt, neu geprüft nur bei geänderten Zahlen
- Export für die Kanzlei-Software: BMD NTCS Buchungsimport (CSV), DATEV-Buchungsstapel (EXTF, auch für RZL), Belege + Belegliste, alles zusammen als ZIP; Kontenplan je E1a-Kennzahl anpassbar
- Steuerberater-Paket: zusätzlich Buchungsexport BMD/DATEV und Jahresbericht
- Neuer Server-Endpunkt /api/tax (braucht ANTHROPIC_API_KEY in Vercel)

## v0.99.22 – Eigenes Rechnungsdesign & Firmenlogo
- Einstellungen › Rechnungsdesign › „Eigenes Design“: Firmenlogo hochladen (PNG, JPG, WebP, SVG) und eigenes Briefpapier als PDF oder Bild (A4)
- Briefpapier liegt im Hintergrund von Rechnungen, Angeboten und Mahnungen; eigener Kopf/eigene Fußzeile, Inhalt verschiebbar, freier Rand unten einstellbar
- Folgeseiten: Seite 2 der PDF, wie Seite 1 oder ohne Briefpapier
- Logo in Firmendaten und Rechnungsdesign bleibt synchron

## v0.99.21 – Steuerberater: Berichte
- Neuer Reiter „Berichte“ im Steuerberater-Bereich (Österreich, Stand 2026): Jahresbericht, Beilage E 1a nach Kennzahlen, Einnahmen-Ausgaben-Journal, Pauschalierungsvergleich, Umsatz & Kleinunternehmergrenze, Anlagenverzeichnis mit AfA, Wareneingangsbuch, Kilometergeld, Privatentnahmen/-einlagen, offene Posten, fehlende Belege – als PDF, Excel oder CSV, ausgewählte als ZIP
- Zuordnung Kategorien → E1a-Kennzahlen anpassbar; Angaben zu Arbeitsplatzpauschale, Kilometergeld und Tätigkeit
- Monatskarte: „Als abgeschlossen markieren“ steht jetzt unter den Firmenbuchungen

## v0.99.20 – Einheitliches Augen-Symbol

In der Buchungs-Ansicht (z. B. aus dem Steuerberater-Reiter) und bei verknüpften Dokumenten wird für „Vorschau“ jetzt dasselbe Augen-Symbol verwendet wie überall sonst in der App (statt des Emoji 👁). Ebenso im Handy-Menü bei „Einblenden“.

## v0.99.19 – Seitenleiste: Konto nur im Reiter Konten markiert

Ein ausgewähltes Konto wird in der Seitenleiste nur noch hervorgehoben, solange man im Reiter **Konten** ist. In anderen Reitern (z. B. Ausgabe) ist nur noch der jeweilige Reiter markiert; die Kontoauswahl bleibt erhalten und ist beim Zurückwechseln wieder sichtbar.

## v0.99.18 – Info & Versionen

Neuer Abschnitt **Einstellungen → Info & Versionen**: zeigt die laufende Version und den kompletten Entwicklungsverlauf. Versionen sind nach Reihe gruppiert (z. B. v0.99, v0.98 …), Gruppen und einzelne Versionen lassen sich ein- und ausklappen, „Alle auf-/zuklappen“ und eine Suche im Verlauf. Die aktuelle Version ist markiert und beim Öffnen aufgeklappt.

## v0.99.17 – Seitenleiste: einklappbare Überschriften

Unter Einstellungen → Seitenleiste hat jede Überschrift (z. B. „Firma“) den Schalter **einklappbar**. Ist er an, klappt ein Klick auf die Überschrift in der Seitenleiste alle Reiter darunter ein bzw. aus – bis zur nächsten Überschrift oder Linie. Der Zustand bleibt gespeichert; der gerade geöffnete Reiter bleibt sichtbar. Gilt für Laptop und iPad (Seitenleiste).

## v0.99.16 – Journal: Bearbeiten in der Mitte

In der Prüfkarte (iPhone, iPad, Laptop) steht zwischen ‹ und › jetzt „✎ Bearbeiten“ statt „Weiter“. Bei noch unbestätigten Belegen erscheint darunter „✓ Bestätigen & weiter“; bei bestätigten Belegen blättert man mit ‹ ›.

## v0.99.15 – Journal: ‹ Bestätigen › und Summe oben

- Prüfkarte (alle Displaygrößen): eine Zeile „‹ · Bestätigen/Weiter · ›“ – ‹ und › blättern zum vorigen/nächsten Beleg ohne zu bestätigen. Die Pfeile oben im iPhone-Kopf sind entfernt; am iPad in der schmalen Leiste ebenso ‹ und ›.
- Laptop/iPad: Die Summe steht jetzt oben neben dem Monat (größer als die Einzelbeträge), die Anzahl klein darunter; die Summenzeile unten entfällt.

## v0.99.14 – Konto-Verknüpfungen

Ein Klick auf ein Konto in **Vermögen**, **Übersicht**, **Ausgabe** oder in einer Buchung öffnet jetzt überall direkt dieses Konto – am iPhone die Kontodetails (statt nur der Kontenübersicht), am Laptop/iPad das ausgewählte Konto oben am Seitenanfang. Zurück führt am iPhone wieder in den Reiter, aus dem man gekommen ist.

## v0.99.13 – Aufgeräumt + Versionsanzeige

- Code der Journal-Varianten A und B (Weitere Felder / ganzes Formular) entfernt – das Journal nutzt nur noch die Prüfkarte.
- Unten in den Einstellungen steht jetzt die laufende Version („FinDocu Version …“), damit man sieht, ob ein Update angekommen ist.

## v0.99.12 – Journal: fix Prüfkarte

- Das Journal verwendet jetzt fix die Prüfkarte (Variante C); die Auswahl in den Einstellungen ist entfernt.
- „Weiter/Bestätigen“ und „✎ Bearbeiten“ stehen oben in der Karte, bündig mit dem Inhalt.
- Klick auf die Belegvorschau öffnet das Original (wie bisher der Knopf „Original“, der entfernt wurde) – auch am iPhone.

## v0.99.11 – Fahrtenbuch ohne Sofortvorschau

Ein Eintrag im Fahrtenbuch klappt beim Anklicken keine Belegvorschau mehr auf, sondern öffnet direkt den Eintrag zum Bearbeiten. Den Beleg ansehen: Auge rechts in der Zeile (Laptop/iPad) bzw. Tipp auf 📎 neben dem Titel (iPhone) – öffnet die Vorschau als Popup.

## v0.99.10 – Journal: drei Detail-Varianten zur Auswahl

Unter **Einstellungen → Journal** wählbar (gilt für Laptop, iPad und iPhone), kein doppeltes „Details“ + „Alle Details“ mehr:
- **A · Weitere Felder aufklappen** (Standard): rechts die wichtigsten Felder, darunter „Weitere Felder ▾“ mit Typ, Steuerrelevant, Buchung, Bezahlen, Vertrag/Abo, Fristen und Text – alles in derselben Spalte.
- **B · Ganzes Dokument rechts:** die rechte Spalte ist das komplette Dokument-Formular wie im Popup.
- **C · Prüfkarte + Bearbeiten:** rechts eine kleine Karte zum Anschauen und Bestätigen, „✎ Bearbeiten“ öffnet das volle Popup; der Details-Knopf oben entfällt.

Änderungen in A und B werden automatisch gespeichert; „Bestätigen & weiter“ übernimmt auch noch nicht gespeicherte Eingaben.

## v0.99.9 – Buchung bearbeiten: Popup bleibt offen

Wird eine Buchung (z. B. im Reiter Konten) über „Bearbeiten“ geändert, schließt „Speichern“ nur noch das Bearbeiten – die Buchung bleibt mit den neuen Daten geöffnet.

## v0.99.8 – iPad: Popups wie am iPhone, in der Größe veränderbar

- Am iPad öffnen alle Popups (Dokument, Buchung, Rechnung, Vertrag, Fahrt, Kunde, Artikel, Lager, Gerät, Kassabuch, Journal-Details …) wie am iPhone als Karte von unten: Griff oben, „Abbrechen/Schließen – Titel – Speichern“, großer Speichern-Knopf unten, nach unten wischen schließt. Vorschau und Scanner bildschirmfüllend.
- **Größe veränderbar:** am Griff oben hoch-/runterziehen ändert die Höhe (ganz nach unten = schließen), an den Griffleisten links/rechts ziehen ändert die Breite. Die Größe wird pro Popup gemerkt; Doppeltippen auf einen Griff stellt die Standardgröße wieder her.
- Laptop und iPhone bleiben unverändert.

## v0.99.7 – Schwebender Zurück-Pfeil am iPhone

Am iPhone ersetzt ein runder, schwebender Zurück-Pfeil links im unteren Drittel alle Zurück-Knöpfe (z. B. „‹ Mehr“, „‹ Journal“, „‹ Zurück“ in Konten, Analyse, Einstellungen, Dokument-Unterseiten, Kundendetails). Er geht immer eine Ebene zurück; in der Journal-Belegansicht schwebt er über der Felder-Karte. In Popups bleibt „Abbrechen/Schließen“ wie gehabt, dort wird der Pfeil ausgeblendet. Wischen vom linken Rand funktioniert weiterhin.

## v0.99.6 – Journal am iPhone: Belegansicht repariert

- Solange ein Beleg im Journal offen ist, scrollt die Seite dahinter nicht mehr mit – die Ansicht springt in Safari nicht mehr und die Safari-Leiste verdeckt die Felder nicht.
- Die Felder-Karte lässt sich am Griff **hoch- und runterziehen** oder antippen; sie rastet bei „wenig“ bzw. „alle Felder“ ein. Die Felder scrollen innerhalb der Karte, „Weiter/Bestätigen“ bleibt unten sichtbar.

## v0.99.5 – Journal: Details-Knopf, iPhone-Scrollen, Monate einklappbar

- **„✎ Details“-Knopf** (Laptop & iPad) blendet die Felder zum Bearbeiten ein und aus. Ausgeblendet ist die Vorschau größer, darunter eine Leiste mit Titel, Datum, Betrag, „✎ Details“ und „Bestätigen/Weiter“.
- **iPad quer:** statt Vorschau und Felder gequetscht untereinander zeigt die rechte Spalte entweder die Vorschau oder – über „✎ Details“ – die Felder in voller Höhe.
- **iPhone:** Scrollen wie in den Dokumenten – Suche und Filter bleiben oben stehen, die Liste ist eine Karte mit runden Kanten bis über die Leiste unten, Monatsüberschriften bleiben beim Scrollen oben.
- **Monate ein-/ausklappbar** (Tippen auf die Monatsüberschrift, gespeichert), dazu „Alle auf-/zuklappen“ am Listenende.

## v0.99.4 – Handy-Menü frei sortierbar, Journal auf iPhone & iPad

- **Handy-Menü selbst anordnen:** In Privat, Firma und Mehr gibt es „⇄ Anordnen“: Reiter am Griff ⠿ ziehen, über ⋯ in einen anderen Bereich, in die Leiste unten verschieben oder ausblenden. Das ganze Menü (Leiste unten + alle Bereiche) zusätzlich unter Einstellungen → Handy-Menü. Leiste unten max. 5, „Mehr“ bleibt immer rechts; Bereiche, die nicht in der Leiste stehen, erscheinen unter „Mehr“.
- **iPhone Journal:** „Alle Details“ öffnet sich jetzt über der Belegansicht und ist bedienbar.
- **iPad quer / schmale Fenster:** Seitenleiste mit Jahren, Kontakten, Kategorien und Schlagwörtern ist immer sichtbar, Vorschau und Felder stehen rechts untereinander.
- **iPad hoch:** Journal wie am iPhone (Liste, Beleg im Vollbild).

## v0.99.3 – Journal: Monate als Baum

Die Monate stehen im Journal eingerückt unter ihrem Jahr und sind mit Baumlinien verbunden; beim gewählten Monat ist die Linie farbig.

## v0.99.2 – Journal: Abschnitte einklappbar

In der Journal-Seitenleiste lassen sich Kontakte, Kategorien und Schlagwörter per Klick auf die Überschrift ein- und ausklappen. Eingeklappt zeigt die Überschrift die Anzahl; der Zustand bleibt gespeichert.

## v0.99.1 – Volle Fensterbreite am Desktop

Der Inhaltsbereich war am Desktop auf 1240 px Breite begrenzt. Jetzt wächst er mit dem Browserfenster mit (Dokumente, Übersicht, Rechnungen, Journal usw.).

## v0.99.0 – Journal für Belege

Neuer Reiter **Journal** (unter Dokumente; am iPhone über Dokumente → „⋯“ → Journal) mit allen vier Ansichten:
1. **Drei-Spalten-Journal** (Mac, iPad quer): links Filter (Alle, Unbestätigt, Unbezahlt, Ohne Buchung, Neu), Journal nach Jahr/Monat, Kontakte, Kategorien, Schlagwörter; Mitte Belegliste mit Summe; rechts große Vorschau aller Seiten und daneben die Felder zum direkten Bearbeiten. Auf schmaleren Bildschirmen klappt die Filterspalte über „☰ Filter“ ein.
2. **Prüf-Modus „Bestätigen & weiter“:** neue, von der KI gelesene Belege sind „unbestätigt“ (blauer Punkt) und werden der Reihe nach geprüft; Tastatur ↑/↓ und Enter.
3. **Monate:** Monatskarten mit Anzahl, Ausgaben/Einnahmen, Kategorie-Balken und Prüfstatus; Antippen öffnet den Monat im Journal.
4. **iPhone:** Monatsliste → Beleg im Vollbild, Felder als Karte unten (hochziehbar), Wischen oder ‹ › für den nächsten Beleg.

**Dokumentenvorschau mit Markierungen:** In PDFs mit Text markiert FinDocu, wo die KI Datum (grün), Betrag (violett), Netto (blau) und USt (gelb) gefunden hat. Bisherige Belege gelten als bestätigt; nur neu ausgelesene starten als unbestätigt.

## v0.98.3 – Dropdown-Menüs in den Zeilen

- **Steuerberater (Prüfen, Kontoauszug):** statt der drei Knöpfe Firma/Privat/Unklar ein farbiges Dropdown mit der aktuellen Zuordnung (inkl. „Aufteilen …“); „Buchung öffnen“, „Frage an den Steuerberater“ und „Im PDF zeigen“ im „⋯“-Menü.
- **Verträge (Laptop/iPad quer):** Status „Aktiv/Inaktiv“ als Dropdown, 👁 bleibt sichtbar, Bearbeiten/Drucken/Teilen/Tags im „⋯“-Menü.
- Menüs funktionieren mit Maus und Touch und öffnen nach oben, wenn unten zu wenig Platz ist.

## v0.98.2 – Vorschau nur über das Auge, Buchung im Steuerberater als Popup

- **Rechnungen, Mahnungen, Verträge:** Klick auf Titel/Zeile öffnet die Details (Popup), nicht mehr die Vorschau. Vorschau nur über das 👁 rechts (jetzt auch am Handy in jeder Zeile) oder im Popup über „Vorschau“. Mahnungen: 👁 auch bei offenen Rechnungen; Verlaufszeilen öffnen beim Antippen nichts mehr. Vertrags-Popup hat neu den Knopf „👁 Vorschau“ für die verknüpften Dokumente.
- **Steuerberater:** Eine Buchung (aus Prüfen, Klärungsliste oder Kontoauszug) öffnet sich als Popup direkt im Reiter – kein Wechsel mehr zu den Konten. Aus dem Kontoauszug geöffnet, bleibt der Auszug dahinter offen.

## v0.98.1 – Leistung am Handy (Ruckler beseitigt)

- **Datum/Betrag formatieren:** `fmtDate`, `fmtMoney`, `monthLabel` und alle `toLocale…`-Aufrufe verwenden zwischengespeicherte Intl-Formatierer (war der größte Bremsklotz beim Öffnen von Listen).
- **Lange Listen schrittweise:** Dokumente, Rechnungen, Mahnungen, Kunden, Besitz und Fahrtenbuch-Verlauf zeigen zuerst 50–60 Einträge und laden beim Scrollen automatisch nach; Dokument-Zeilen werden nur neu gezeichnet, wenn sich das Dokument ändert; Handy-Listenzeilen außerhalb des Bildschirms werden vom Browser übersprungen (`content-visibility`).
- **Suche:** Eingabe reagiert sofort, gefiltert wird im Hintergrund (`useDeferredValue`).
- **Kunden:** Rechnungen werden einmal pro Kunde zugeordnet statt für jeden Kunden alle Rechnungen zu durchsuchen.
- **Scrollen:** keine eigene Grafikebene mehr für jede Listenzeile (nur beim Wischen), kein Weichzeichner hinter Tab-Leiste/Kopf-Knöpfen/Fenster-Leisten am Handy (außer Stil „Glas“), Fahrtenbuch-Leiste ohne Layout-Abfrage bei jedem Scroll-Ereignis, Listenhöhen-Berechnung am Handy ruht, wo sie nicht gebraucht wird.
- **Cloud-Sync:** läuft nur noch, wenn sich lokal etwas geändert hat (sonst alle 5 Min.), und wartet, bis 4 Sekunden nicht gescrollt/getippt wurde – keine Aussetzer mehr alle 90 Sekunden.

## v0.98.0 – Handy-Popups neu gestaltet

Alle Popup-Fenster am iPhone (und iPad hochkant) nach den fünf Vorschlägen:
1. **Bottom-Sheet:** Fenster kommen von unten, runde Ecken oben, Griff; kleine Fenster nur so hoch wie der Inhalt. Nach unten wischen (Griff/Kopfzeile) schließt – bei ungespeicherten Änderungen kommt zuerst die Rückfrage.
2. **Kopfzeile wie iOS:** links „Abbrechen“ bzw. „Schließen“, Mitte Titel, rechts „Speichern“.
3. **Gruppierte Abschnitte:** Felder in Karten mit Abschnittsüberschrift; einzelne Textfelder als Zeile (Bezeichnung links, Wert rechts).
4. **Feste Aktionsleiste unten:** großer Speichern-Knopf im Daumenbereich, bleibt beim Scrollen sichtbar.
5. **Kopfkarte:** Rechnung, Vertrag, Besitz, Kassabuch-Buchung und Buchung zeigen oben eine farbige Karte mit Betrag, Datum und Status.

Laptop/Mac und iPad quer behalten die schwebenden Fenster.

## v0.97.7 – Dokumente: Titel öffnet Details, Auge öffnet Vorschau

- Klick auf Titel/Zeile (Liste und Galerie) öffnet jetzt die Details, nicht mehr die Vorschau.
- Vorschau über das 👁 rechts in der Zeile (Laptop: in den Aktionen, iPhone: eigener Knopf) oder im Detailfenster über „👁 Vorschau“.
- iPhone: Nach dem Schließen eines Fensters (z. B. Dokument-Details) steht die Liste wieder an derselben Stelle statt ganz oben.

## v0.97.6 – Fahrzeugkarte 250/200 px, Einklappen nur am iPad

- Fahrzeugkarte im Fahrtenbuch: am Laptop 250 px, am iPhone 200 px hoch (etwas größere Symbole, Kacheln und Knöpfe).
- Ein-/Ausklappen des Kopfbereichs beim Scrollen wieder aktiv – aber nur auf dem iPad (und Android-Tablets); iPhone und Laptop/Mac bleiben ohne.

## v0.97.5 – Fahrzeugkarte im Fahrtenbuch kompakt

- Fahrzeugkarte nach Vorschlag 2: Name, Modell und Kilometerstand in einer Kopfzeile, vier kleine Kennzahl-Kacheln, Schnellaktionen als schmale Knöpfe. Desktop ca. 210 px statt ca. 380 px hoch, iPhone ca. 185 px; Kennzahlen jetzt auch am iPhone sichtbar.

## v0.97.4 – Hochgeladene Symbole anpassen

- Beim Hochladen eines eigenen Symbols öffnet sich „Symbol anpassen“: Größe (Zoom), Verschieben durch Ziehen, Einpassen/Füllen/Zentrieren, 90° drehen, leere/weiße Ränder abschneiden, Abstand zum Rand, Hintergrund (transparent, weiß, schwarz, eigene Farbe), runde Vorschau in drei Größen.
- Gilt überall, wo Symbole hochgeladen werden: Fahrtenbuch-Symbole, Sync-Anbieter, Konten, Kategorien und Kontaktarten, Fahrzeuge.

## v0.97.3 – Kopfbereich klappt nicht mehr ein

- Das Ein- und Ausklappen des Kopfbereichs beim Scrollen (Fahrzeugkarte, Kennzahlen, Ablagefeld, kleiner Titel) ist in allen Menüs und auf allen Geräten abgeschaltet. Der Code ist nur deaktiviert (`HDR_COLLAPSE`, `LB_MINI`), noch nicht gelöscht.

## v0.97.2 – Schriftarten wählbar

- Einstellungen → Design → **Schriftart**: 23 Schriften (Modern, Klassisch, Weich, Gut lesbar, Serif, Mono) mit Vorschau, getrennt für Text und Überschriften; „Wie Stil“ behält die Schrift des Stils. Outfit und System sind eingebaut, die übrigen kommen von Google Fonts (Internet beim ersten Laden nötig). Wird pro Konto über den Sync übernommen.

## v0.97.1 – Buchungsverlauf zum Aufklappen, Vertrags- und Belegvorschau

- Buchungsfenster (Konten): „Letzte Buchungen anzeigen“ klappt die letzten 15 Buchungen desselben Empfängers direkt auf und zu (je 15 weitere nachladbar, Zustand wird gemerkt). Antippen einer Zeile wechselt zu dieser Buchung, 📎 zeigt deren Beleg in der Vorschau. „In der Liste anzeigen“ filtert wie bisher.
- Zugehöriger Vertrag öffnet jetzt eine Vorschau mit Anbieter, Betrag, Laufzeit, Kündigungsfrist und den verknüpften Dokumenten (mit Vorschau); „In Verträgen öffnen“ springt weiter.

## v0.97.0 – Steuerberater, Kontoauszüge mit KI, Buchungsfenster neu

- **Buchungsfenster:** Umschalter Firma / Privat / Unklar je Buchung (Vorschlag aus Beleg, Konto-Verwendung oder KI), **Aufteilen** in Prozent (z. B. 60 % Firma), Beleg-**Vorschau im eigenen Fenster**, Beleg **tauschen**, Beleg lösen ohne dass das Fenster schließt, verknüpfte **Rechnung anklickbar und lösbar**, **Frage an den Steuerberater**.
- **Konten:** neues Feld „Verwendung“ (Privat / Firma / Beides); Firmen- und unklare Buchungen sind in der Liste markiert.
- **Neuer Reiter „Steuerberater“** (Bereich Firma):
  - **Monate:** Ampel je Monat – Auszüge vorhanden, Firmenausgaben ohne Beleg, unklare Buchungen, offene Fragen; Monat abschließen.
  - **Kontoauszüge:** Original-PDF hochladen → KI liest die Zeilen, gleicht sie mit den Buchungen ab (fehlende können übernommen werden) und markiert Firma (gelb) / Privat (blau) / Unklar (rot) direkt im PDF. Antippen wechselt die Farbe; Export als markiertes PDF mit Zusammenfassung.
  - **Prüfen:** offene, unklare und belegfehlende Buchungen, „✨ KI einschätzen“.
  - **Klärungsliste:** Fragen + Antworten des Steuerberaters, als PDF oder Mail senden.
  - **Paket:** ZIP für Jahr / Quartal / Monat mit Übersicht, markierten Auszügen, Buchungsliste Firma (Excel/CSV), Belegen, Ausgangsrechnungen, EAR, Fahrtenbuch, Kassabuch, Anlagen, fehlenden Belegen und Klärungsliste.
- Neue Vercel-Funktion `api/classify.js` (nutzt den vorhandenen `ANTHROPIC_API_KEY`).

## v0.96.2 – Verknüpfungen geprüft
- Datenprüfung (Demo-Daten): alle Verweise Buchung↔Konto/Dokument/Rechnung, Rechnung↔Zahlung/Beleg/Kunde, Dokument↔Datei/Rechnung, Vertrag/Besitz/Fahrtenbuch/Kassabuch↔Dokument, Lager↔Artikel/Inventur sind vollständig und gegenseitig.
- Kunden-Zuordnung eindeutig: feste ID → Kundennummer → Name (vorher passten Rechnungen bei gleichnamigen Kunden zu beiden).
- Buchung löschen, die Zahlung einer Rechnung ist: Rückfrage „Rechnung wieder auf offen setzen?“, Verweis wird gelöst (vorher blieb die Rechnung „bezahlt“ mit Verweis ins Leere). Fahrtenbuch-Verweis wird ebenfalls gelöst.
- Konto löschen: dieselbe Bereinigung für alle Buchungen des Kontos.
- Dokument endgültig löschen (auch automatisch nach 30 Tagen im Papierkorb): Verweise in Buchungen, Rechnungs-Beleg, Verträgen, Besitz & Garantie, Fahrtenbuch und Kassabuch werden entfernt.

## v0.96.1
- Einheitliche Listen-Schrift wie bei Konten (Titel 17 px, Unterzeile 16 px, Betrag 17 px) in Rechnungen, Kunden, Artikel, Lager & Inventur, Mahnungen, Verträge, Fixkosten & Abos, Kassabuch und Fahrtenbuch (vorher 20/17/20 px). Die Schriftgrößen-Einstellung (Design) wirkt weiterhin zusätzlich.

## v0.96.0 – Design-Stile & eigene Symbole
- **Einstellungen → Design → Stil:** 11 Stile mit Vorschau: Klassisch, Glas, Soft UI, Bento, Neo-Brutal, Editorial, Kompakt Pro, Clay, Aurora, Expressiv, Großer Kontrast. Jeder ändert Schriftart (Inter, Nunito, Space Grotesk, Fraunces, JetBrains Mono, Archivo Black – von Google Fonts), Ecken, Schatten/Rahmen, Kartenform, Dichte und Grundfarben; Tag/Nacht wird berücksichtigt (Aurora ist immer dunkel). Farbstil und Schriftgrößen bleiben zusätzlich einstellbar.
- **Einstellungen → Fahrtenbuch – Symbole:** je Eintragsart (Tanken, Laden, Fahrt, Ausgabe, Erinnerung und alle Ausgaben-Kategorien) eigenes Emoji/Zeichen, Kreisfarbe oder hochgeladenes Bild (PNG/JPG/SVG/WebP, 128 px). Gilt für Zeitleiste, Schnellknöpfe und Erinnerungskarten; wird gesynct.
- **Cloud-Synchronisierung → 🎨 Eigene Symbole für die Anbieter:** eigenes Bild oder Emoji für MEGA, OneDrive, Google Drive und Dropbox; ↺ setzt auf das Standard-Symbol zurück.

## v0.95.0 – Sync-Passwort ändern
- Einstellungen → Backup → Cloud-Synchronisierung → **🔑 Passwort ändern**: aktuelles Passwort + neues Passwort (2×, mind. 8 Zeichen). Alle Cloud-Dateien (Gerätestände und PDFs/Fotos) werden mit dem neuen Schlüssel neu verschlüsselt, danach wird die Prüfsumme in `findocu.meta` ersetzt.
- Abbruch-sicher: bei Unterbrechung einfach erneut starten (mit demselben neuen Passwort) – bereits umgeschlüsselte Dateien werden erkannt und übersprungen. Während des Umschlüsselns pausiert der automatische Abgleich.
- **Andere Geräte** erkennen die Änderung beim nächsten Abgleich und fragen einmal nach dem neuen Passwort (alte Passwörter werden abgelehnt); lokale Daten bleiben erhalten.

## v0.94.0
- **Kunden (Mac/iPad):** Kundendatei öffnet als schwebendes Fenster (verschieb- und größenveränderbar) statt fester rechter Spalte; Kundenliste nutzt wieder die volle Breite. Handy unverändert (eigene Seite).
- Kunden-Kürzel (Avatar) im Nachtmodus wieder sichtbar (war weiß auf weiß).
- **Fahrtenbuch-Verlauf als Zeitleiste:** oben Erinnerungs-Karten (wischbar, farbig nach Dringlichkeit: in X km · in Y Tagen), darunter je Monat eine Zusammenfassung (Kosten · km · l/100 km bzw. kWh/100 km · Zeit zwischen Tankvorgängen) und die Einträge mit farbigen Kreis-Symbolen an einer gestrichelten Linie: Titel, km · Verbrauch · Liter, rechts Betrag und Datum. Gilt auch für die Reiter Tanken, Fahrten, Ausgaben. Aktionen (✎ 🖨 ⤴ 🗑) erscheinen am Mac beim Darüberfahren.

## v0.93.1
- Konten (Mac/iPad): die Buchungsliste reicht jetzt bis ca. 10 px über den unteren Fensterrand (vorher ~50 px Lücke); passt sie nicht ganz hinein, scrollt die Seite wie bisher.

## v0.93.0 – Kundendatei (Varianten 2 + 3 + 4)
- **Kundenseite:** Klick auf einen Kunden öffnet seine Datei: Kopf (Art, Kundennr., Ort, ✉︎ ☎︎ ✎ ⋯), Kennzahlen (Umsatz Jahr/gesamt, Offen/Überfällig, Rechnungen, Ø Zahlungsdauer) und Reiter **Übersicht · Rechnungen · Angebote · Mahnungen · Konto**. Klick auf Rechnung/Mahnung öffnet das PDF-Fenster.
- **Konto:** Rechnungen, Mahnspesen und Zahlungen chronologisch mit laufendem Saldo; „Kundenkonto PDF“ und „Offene Posten PDF“ nur für diesen Kunden.
- **iPad quer / Mac:** Kundenliste links, Kundendatei rechts. Handy und schmale Fenster: eigene Seite mit „‹ Kunden“ und Rand-Wischen zurück.
- **Feste Zuordnung:** neue Rechnungen/Angebote speichern die Kunden-ID; bestehende werden über ID, sonst Kundennummer, sonst Name zugeordnet. „🔗 Rechnungen zuordnen“ (⋯) zeigt Rechnungen ohne passenden Kunden – Kunde wählen oder neu anlegen (Name auf der Rechnung bleibt unverändert).

## v0.92.4
- Filter-Blatt (alle Listen): „x Treffer anzeigen“ steht jetzt ganz oben unter „Zurücksetzen · Filter · Fertig“ und bleibt beim Scrollen im Blatt sichtbar.

## v0.92.3
- Verträge: aufklappende Dokument-Vorschau unter der Zeile entfernt. Klick auf Name, Vorschaubild oder 👁 öffnet das Vorschaufenster (alle verknüpften Dokumente untereinander, ✎ öffnet den Vertrag).

## v0.92.2
- Dokumente: aufklappende Vorschau unter der Zeile entfernt. Klick auf den Titel, 👁 oder Wischen → „Vorschau“ öffnen das Vorschaufenster (wie in der Galerie), mit ✎ zum Bearbeiten.
- Vorschaufenster liegt jetzt sicher über Suchleiste und Reitern (wurde vorher teilweise verdeckt).

## v0.92.1
- Rechnungen & Mahnungen: die aufklappende PDF-Vorschau unter der Zeile ist entfernt (Code gelöscht, nach Rückfrage). Klick auf den Kundennamen bzw. Wischen → „Vorschau“ am Handy öffnet jetzt überall das PDF-Fenster (wie „Vorschau“ im Rechnungsfenster) – mit Drucken und Teilen.

## v0.92.0 – neuer Listen-Kopf (Vorschläge 1 + 2 + 4 + 5 + 6)
- **Eine Zeile oben:** Suchfeld · ⚙︎ Filter (mit Zähler) · ⋯ (Neu, Auswählen, Export, Einstellungen). Gilt für Dokumente, Rechnungen, Mahnungen, Verträge, Fixkosten & Abos, Kunden, Artikel, Besitz & Garantie, Lager & Inventur, Kassabuch und alle Handy-Listen.
- **Filter-Blatt:** am Handy von unten, ab iPad quer/Mac als Fenster rechts oben – Ansicht, Privat/Firma, Kategorie, Status, Jahr, Monat, Sortierung, Tags, gespeicherte Reiter löschen; Knopf „x Treffer anzeigen“.
- **Wischbare Reiter** mit Zähler (Alle, Firma, Privat, Unbezahlt, Steuerrelevant, Bereiche … bzw. Status je Liste) + eigene Reiter: „＋ Ansicht“ speichert die aktuelle Filterkombination.
- **Smarte Suche:** „firma“, „2026“, „#tag“, „unbezahlt“, Kategorie- oder Monatsnamen tippen → Vorschlag „Als Filter übernehmen“ → wird zum Stichwort im Suchfeld (✕ oder Löschtaste entfernt es).
- **Titel klappt ein:** Handy – kleiner Titel in der fixierten Suchleiste; iPad/Mac – Kopf und Kennzahlen klappen beim Scrollen in der Liste ein.
- Dokumente: Ablage (Liste/Ordner/Akten) und Darstellung (Zeilen/Galerie) jetzt im Filter-Blatt; Ablagefeld am Handy ausgeblendet (＋ unten nutzen).

## v0.91.0
- **Einstellungen → Design → Schriftgrößen:** 9 Bereiche einzeln in 5-%-Schritten (70–170 %): Seitentitel, Karten-/Bereichsüberschriften, Gruppen-Titel, Listen-Titel, Beträge & Kennzahlen, Text & Eingabefelder, Buttons/Filter/Reiter, Kleintext, Seitenleiste. Schnellwahl Kompakt / Standard / Groß / Sehr groß, Tippen auf den %-Wert = zurück auf Standard, Live-Vorschau je Zeile.
- Gilt **pro Gerät** (iPad, Mac, Handy getrennt) – Schlüssel `dev:` werden nicht gesynct und nicht ins Backup geschrieben.

## v0.90.1
- Handy-Check aller Unterseiten (Privat: 8, Firma: 8, Mehr: 2) inkl. Bearbeitungsfenster: Alle passen in die Breite, nichts läuft seitlich über.
- Lange Seitentitel (z. B. „Firmenauswertung“) werden am Handy kleiner gesetzt statt abgeschnitten.
- Vertrag → „Kündigungsfrist“: Zahlenfeld war neben „Monate“ zusammengequetscht – jetzt normal breit.
- Firma-Startseite: Kachel „Kassabuch“ zeigt bei mehreren Kassen „· 2 Kassen“ (Summe aller Kassen; im Kassabuch selbst steht der Stand der gewählten Kasse).

## v0.90.0
- **Dokumente – Ablage frei wählbar:** Umschalter „☰ Liste · 📁 Ordner · 🗂️ Akten“ plus Darstellung „Liste ☰ / Galerie ▦“ – beliebig kombinierbar (z. B. Ordner öffnen und als Galerie ansehen). Auswahl wird gemerkt.
- **Ordner:** Kategorien als Ordner-Kacheln nach Gruppen (Finanzen, Firma, Verträge …) mit Anzahl und letztem Datum; Privat/Firma-Filter wirkt mit. Ordner öffnen → Zurück-Leiste „‹ Ordner“, am Handy auch per Wischen vom Rand.
- **Akten:** Themen-Mappen (Auto, Wohnung, Steuer <Jahr>, Firma, Gesundheit, Garantie & Käufe) mit Belegen, Verträgen, €/Monat, Unbezahltem und nächster Frist. Geöffnete Akte: Kennzahlen + Reiter Dokumente / Verträge / Fristen / Unbezahlt. Eigene Akten anlegen/bearbeiten (Symbol, Name, Kategorien, Privat/Firma, nur steuerrelevant, Jahr).
- **Einstellungen am Handy:** statt langer Klappliste jetzt iOS-artige Liste in Gruppen (Allgemein, Daten & Ablage, Navigation & Budgets, Firma) → Antippen öffnet den Bereich als eigene Seite mit „‹ Einstellungen“ und Rand-Wischen zurück. Mac/Desktop unverändert.
- „Darstellung“: Reihenfolge korrigiert (Überschrift „Tag- und Nachtmodus“ stand über „Kennzahlen“), Kennzahlen-Auswahl am Handy untereinander.

## v0.89.0
- **iPad neu**:
  - **Hochformat:** genau die iPhone-Ansicht, nur größer. Die Tab-Leiste hat Übersicht · Dokumente · Privat · Firma · Mehr, dazu Bereichs-Startseiten, Zurück-Knopf und die Kachel-Übersicht. Technisch rechnet das iPad im Hochformat mit 700 px Breite und vergrößert alles passend.
  - **Querformat:** die Ansicht wie am Mac, mit voller Seitenleiste samt Beschriftung, Konten-Baum und Übersicht. Details öffnen sich als Spalte rechts.
  - Beim Drehen wechselt die Ansicht automatisch.
- Die schmale Symbol-Seitenleiste am iPad ist entfallen. Am Mac bleibt sie über den Seitenleisten-Knopf wählbar.

## v0.88.0
- **iPhone: neue Navigation wie bei nativen Apps (Variante B)**:
  - Die Tab-Leiste hat nur noch 5 Einträge: Übersicht · Dokumente · Privat · Firma · Mehr.
  - **Privat** und **Firma** sind Startseiten mit Kacheln für die Unterbereiche, mit Kurzinfo:
    - Firma: Rechnungen (x offen), Mahnungen (x überfällig), Kunden, Artikel, Lager & Inventur, Kassabuch, Firmenauswertung, Fahrtenbuch
    - Privat: Konten, Ausgabe, Analyse, Vermögen, Fixkosten & Abos, Verträge, Besitz & Garantie, Umtauschfrist
    - Mehr: Einstellungen, Backup und alle übrigen Reiter
  - Ausgeblendete Reiter bleiben ausgeblendet.
- **Zurück-Knopf auf iPhone und iPad**: In jedem Unterbereich steht oben „‹ Firma“, „‹ Übersicht“ usw. (der Name des vorigen Bildschirms). Zurück geht auch per Wischen vom linken Rand und mit der Zurück-Taste von Browser oder Android.
- **iPad: Split View**:
  - Details (Dokument, Rechnung, Vertrag …) öffnen sich als Spalte rechts, die Liste bleibt links sichtbar.
  - Im Querformat rückt die Liste zur Seite und zeigt dann nur Titel und Betrag. Im Hochformat liegt das Detail über der Liste.
  - Antippen eines anderen Eintrags wechselt das Detail.
- Am Desktop ändert sich nichts.

## v0.87.0
- **Neue Übersicht für iPhone und iPad (Variante B, Kacheln)**:
  - Umschalter **Alle · Privat · Firma** oben. Die Wahl gilt auch für Dokumente, Verträge und Besitz & Garantie.
  - Kacheln mit den wichtigsten Zahlen, je nach Bereich:
    - **Firma:** offene Rechnungen, Mahnungen, Umsatz, Gewinn, Firmenausgaben, Kassabuch, Fristen, Kleinunternehmergrenze
    - **Privat:** Saldo, Konten, Ausgaben, Fixkosten, Fristen, Zu bezahlen, Budgets
    - **Alle:** gemischt
  - Kacheln mit Handlungsbedarf sind farbig hinterlegt. Ein Tipp öffnet den passenden Reiter.
  - „Zu erledigen“: fällige Mahnungen, bald fällige Rechnungen, zu bezahlende Belege, Fristen der nächsten 14 Tage.
  - **„Bericht für die Firma“**: Jahr wählen, dann Einnahmen-Ausgaben-Rechnung (PDF/Excel), Offene Posten oder Steuerberater-Paket mit einem Tipp.
  - Anpassen über das Layout-Symbol oben: Kacheln verschieben (◀ ▶), ausblenden (✕), wieder hinzufügen. Gilt getrennt für Alle, Privat und Firma.
- **iPad**:
  - Zwei Spalten, links „Zu erledigen“ und der Bericht, rechts Kacheln, Verlauf und Kategorien.
  - Die Seitenleiste zeigt am iPad automatisch nur Symbole, mehr Platz für den Inhalt. Mit dem Seitenleisten-Knopf lässt sie sich wie gewohnt umstellen.
- Am Desktop bleibt die Übersicht wie bisher.

## v0.86.1
- **Nur noch die Mac-App wird gebaut.** Windows ist im GitHub-Ablauf auskommentiert und lässt sich bei Bedarf wieder einschalten. Am Handy bleibt die Browser-Version.
- **Gerätenamen beim Sync** sind jetzt eindeutig: „Mac-App“, „Mac (Safari)“, „iPhone (Safari)“, „Mac (Chrome)“ usw. So sieht man in der Geräteliste, welcher Stand von wo kommt.

## v0.86.0
- **Auto-Update für die Mac- und Windows-App** (Tauri-Updater):
  - Bei jeder neuen Version baut GitHub automatisch die Apps und veröffentlicht sie als Release mit `latest.json`. Gibt es das Release zur Version schon, wird nichts gebaut.
  - Die App sucht beim Start und alle 6 Stunden nach Updates und zeigt dann das Banner „FinDocu X.Y.Z ist da · Jetzt aktualisieren“. Ein Klick lädt das Update, installiert es und startet die App neu.
  - Unter Einstellungen → Verbindung steht die App-Version, dazu „Nach Updates suchen“.
  - Updates sind signiert. Einmalig nötig: GitHub-Secret `TAURI_SIGNING_PRIVATE_KEY` (siehe `APP-BAUEN.md`).
  - Am iPhone gibt es keinen Selbst-Update, das erlaubt Apple nicht.

## v0.85.0
- **App-Bau mit Tauri 2 vorbereitet** (Mac, iPhone/iPad, Windows). Die Anleitung steht in `APP-BAUEN.md`.
  - `src-tauri/`: App-Projekt mit Fenster, Icons, Rechten, Deep-Link `findocu://` und Kamera-/Standort-Hinweisen für macOS/iOS. Der Rust-Teil kompiliert (unter Linux geprüft).
  - `src/platform.js`: In der App gehen `/api/…`-Aufrufe an Vercel. Downloads laufen über „Sichern unter …“. PDFs öffnen sich im Standardprogramm, Webseiten im System-Browser. Die Cloud-Anmeldung läuft im Browser mit Rückkehr in die App.
  - `.github/workflows/app-build.yml`: Mac- (.dmg) und Windows-App direkt auf GitHub bauen (Actions → „FinDocu App bauen“).
  - Neue npm-Befehle: `app:dev`, `app:build`, `app:build:mac`, `ios:init`, `ios:dev`, `ios:build`.
- Die Web-Version (PWA) bleibt unverändert.

## v0.84.1
- **Logos der Cloud-Anbieter**: FinDocu zeigt die Original-Logos, sobald sie im Ordner `public/brand/` liegen (`onedrive`, `gdrive`, `dropbox`, `mega`, jeweils `.svg` oder `.png`). Fehlt eine Datei, erscheint wie bisher ein neutrales Symbol. Mehr dazu in `public/brand/README.txt`.

## v0.84.0
- **Cloud-Synchronisierung** (Backup-Reiter → „☁️ Cloud-Synchronisierung“) mit **OneDrive, Google Drive, Dropbox und MEGA**:
  - Gleicht alle Daten zwischen Geräten ab: Dokumente samt PDFs/Fotos, Umsätze, Konten, Rechnungen, Kunden, Verträge, Kassabuch, Einstellungen.
  - **Ende-zu-Ende-verschlüsselt** mit eigenem Sync-Passwort (AES-256-GCM, PBKDF2 310.000×). Der Anbieter sieht nur unlesbare Dateien.
  - Jedes Gerät schreibt nur seine eigene Datei, dadurch entstehen keine Konfliktkopien. Zusammengeführt wird pro Eintrag, die neuere Änderung gewinnt. Löschungen werden mit übertragen.
  - Abgleich beim Öffnen der App, alle 90 Sekunden und beim Wechsel in eine andere App. Neue Daten anderer Geräte werden beim nächsten Öffnen übernommen, sonst über das Banner „Aktualisieren“.
  - Ablage:
    - OneDrive: „Apps/FinDocu“
    - Dropbox: „Apps/FinDocu“
    - Google Drive: versteckter App-Datenordner
    - MEGA: Ordner „FinDocu Sync“
- Neue Vercel-Funktion `api/oauth.js` (Anmeldung OneDrive/Google, Secret bleibt am Server) und Seite `public/oauth-callback.html`.
- **Neue Env-Variablen in Vercel** (nur für genutzte Anbieter): `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DROPBOX_APP_KEY`. MEGA braucht nichts. Die Schritt-für-Schritt-Anleitung steht in der App unter „Einrichtung der Anbieter“.
- Neue Abhängigkeit: `megajs` (wird nur geladen, wenn MEGA genutzt wird).

## v0.83.0
- **Listen-Aufbau wie Rechnungen** jetzt auch in Dokumente, Fixkosten & Abos, Verträge und Mahnungen:
  - Oben: Hauptaktion, „☑ Auswählen“ und „Mehr“ (Export, Ablagefeld, Sprünge in andere Reiter).
  - Filter als Chips, dazu 📅 Jahr, ↕ Sortierung und # Tags als Menüs; „☆ Ansicht merken“ speichert die Filter-Kombination.
  - Mehrfachauswahl mit fixer Leiste unten:
    - Dokumente: Teilen, ZIP, Tag, Papierkorb
    - Fixkosten: Excel, Tag, Bestätigen, Beenden
    - Verträge: Excel, Tag, Aktiv/Inaktiv
    - Mahnungen: Drucken, Excel, Tag
  - Tags in den Zeilen. Drucken direkt in der Zeile (Mahnungen, Verträge, Fixkosten über ⋯).
  - Verträge und Mahnungen haben am Handy jetzt die fixierte Suchleiste mit Filtern.
- **Suchfeld springt nicht mehr nach oben**: Beim Tippen bleibt die Suchleiste oben stehen und die Treffer beginnen direkt darunter. Die Seite schrumpft nicht mehr unter der aktuellen Position zusammen. Am Desktop springt die Liste in der Box auf den ersten Treffer.

## v0.82.1
- **✕ zum Löschen in jedem Suchfeld**: erscheint, sobald etwas eingegeben ist, leert das Feld mit einem Tipp und lässt die Tastatur offen. Ersetzt das Browser-X, das es nicht in jedem Browser gibt (z. B. Firefox) – damit sieht es überall gleich aus.

## v0.82.0
- **„Kompakt wie Konten“ fix übernommen** (iPhone/iPad): kein Test mehr. In Einstellungen → Darstellung wählst du nur noch, wie die Kennzahlen aussehen („Nur große Zahl“ oder „Kleine Kacheln“).
- **„Neue Listen“ fix übernommen** im Reiter Rechnungen (Jahr, Sortierung, Tags, gespeicherte Ansichten, Mehrfachauswahl, Drucken). Der Test-Schalter ist entfernt.
- **Artikel und Besitz & Garantie einzeilig**: Filter, Suchleiste und Sortierung/Export stehen am Handy in einer Zeile.
- **Suchvorschläge in allen Suchleisten** (21 Suchfelder, alle Geräte):
  - Ab 2 Zeichen erscheint unter dem Feld ein Dropdown mit passenden Einträgen aus der Liste, der getippte Teil ist fett.
  - Höchstens 8 Vorschläge am Handy und 10 am Desktop. Die Liste geht nie hinter die Tastatur.
  - Bei leerem Feld zeigt das Dropdown „Zuletzt gesucht“ (pro Suchfeld, mit ✕ zum Entfernen).
  - Bedienung mit ↑ ↓ Enter Esc; Screenreader-tauglich (Combobox).
  - Der Verlauf wird nicht ins Backup übernommen.
- **Eingabeverhalten**:
  - Alle Suchfelder: Tastatur zeigt „Suchen“, keine Autokorrektur oder Großschreibung.
  - Touch-Geräte: Eingabefelder mindestens 16 px, damit iOS beim Antippen nicht hineinzoomt.
  - Ganzzahl-Felder (Tage, Monate): Ziffernblock.

## v0.81.4

- Fristen-Kopf am Handy: Schrift um 3 px kleiner (KW-Anzeige 13 px, Heute 14 px, Woche/Monat/Jahr/Kompakt 13 px, Bevorstehend 14 px, Pfeile 15 px).

## v0.81.3

- Fristen/Kalender am Handy: Kopfzeile neu angeordnet – Zeile 1 „‹ KW 46 · 09.–15.11. Heute ›“, Zeile 2 Woche/Monat/Jahr/Kompakt über die ganze Breite. Vorher wurde die KW-Anzeige Buchstabe für Buchstabe untereinander gequetscht.

## v0.81.2

- Dokumente am Handy in der Größe der Verträge: Zeilenhöhe 72 statt 190 px, Vorschaubild 48 × 48, Titel und Unterzeile je eine Zeile, Betrag rechts. Etiketten und die Symbolleiste je Zeile sind am Handy ausgeblendet – Vorschau, Teilen, Bearbeiten und Löschen gehen über Wischen.

## v0.81.1

- Verträge: Zeilen in der Größe der Rechnungen – ohne Vorschaubild (ab iPad), Anbieter/Nr./Intervall/Laufzeit in einer Unterzeile, Betrag in eigener Spalte, Status-Etikett 84 px, Symbole 36 × 36 px. Vorschau weiterhin über das Auge.

## v0.81.0 – Test „Kompakt wie Konten“ (iPhone/iPad)

- Neuer Schalter **Einstellungen → Darstellung → Kompakt wie Konten (Test)** mit drei Stufen: **Aus**, **Nur große Zahl**, **Kleine Kacheln**. Wirkt nur am iPhone (≤ 700 px) und iPad (Touch, ab 701 px); am Mac bleibt alles gleich.
- iPhone: Kennzahlen als eine Zeile (große Zahl + zweite Kennzahl klein) bzw. 2×2-Kacheln in klein; Aktionen = eine kleine Hauptaktion + ⋯-Menü; Status-Chips werden zu einem Auswahlmenü links neben der Suchleiste; Suchleiste bleibt immer sichtbar; übrige Chips kleiner.
- iPad: kleinere Buttons/Chips/Suchleiste, kompaktere Zeilen; „Nur große Zahl“ zeigt die ersten zwei Kennzahlen als Zeile, „Kleine Kacheln“ verkleinert die Kacheln.
- Gilt für Rechnungen, Mahnungen, Kunden, Artikel, Lager & Inventur, Besitz & Garantie, Kassabuch (und Fixkosten/Verträge über dieselben Bausteine). Fahrtenbuch nur teilweise (eigener Aufbau).

## v0.80.1

- Einklappen des Kopfbereichs beim Scrollen (Titel wird klein, Kennzahlen/Hinweise/Ablagefeld verschwinden) in allen Reitern wieder entfernt. Abschaltbar über `HDR_COLLAPSE` im Code, falls es später wieder gewünscht ist.

## v0.80.0 – Test „Neue Listen“ (Pilot Rechnungen)

- Neuer Schalter **Einstellungen → Darstellung → Neue Listen (Test)**. Aus = alles wie bisher.
- Wenn an, im Reiter Rechnungen:
  - Aktionsleiste: ＋ Rechnung (Hauptaktion), ＋ Angebot, ☑ Auswählen, **Mehr ▾** (Kunden, Artikel, Mahnungen, Firmendaten und alle Exporte).
  - Filterzeile: gespeicherte Ansichten (☆), Status-Chips mit Anzahl, Menüs **Jahr**, **Sortierung** (Datum, Betrag, Kunde, Fälligkeit) und **Tags**, „☆ Ansicht merken“ sobald ein Filter aktiv ist (Ansichten in `views:invoices`, ✕ zum Löschen).
  - Liste: Spaltenköpfe, Tags als #Etikett beim Kunden, Drucker-Symbol je Zeile (Rechnung direkt drucken), Mahnung als 📮-Symbol; ⋯ → „# Tags bearbeiten“.
  - Mehrfachauswahl: Zeilen antippen, Leiste unten mit Drucken (alle gewählten in einem Druckauftrag), Excel, # Tag, Fertig.
  - iPhone: ＋ Rechnung, ＋ Angebot, Mehr ▾ (inkl. Auswählen); Wischen nach rechts jetzt auch „Drucken“.
- Tags werden als `tags` an der Rechnung gespeichert (im Backup enthalten).

## v0.79.2

- Abgeschlossene Inventur: Druckersymbol neben dem Auge – druckt die Inventurliste direkt (Druckdialog des Systems).

## v0.79.1

- Lager & Inventur → Inventuren: Hinweistext neben „＋ Neue Inventur“ 5 px weiter rechts.
- Abgeschlossene Inventur: neues Auge (Bericht im PDF-Fenster ansehen), PDF- und Excel-Download als Linien-Symbole in derselben Größe wie bei Rechnungen (36 × 36 px, Symbol 18 px). Bei offenen Inventuren ist „Zählliste drucken“ ebenfalls ein solches Symbol.

## v0.79.0

- **Fixkosten & Abos** im Aufbau wie Rechnungen: Kennzahlen oben, Suchleiste, Filter-Chips mit Anzahl (Alle · Verträge · Aus Umsätzen · Bald kündbar · Bestätigt · Inaktiv) und Sortierung, darunter eine feste Box mit einer gemeinsamen Liste aus Vertragsdokumenten und bestätigten Abos aus den Umsätzen.
- Jede Zeile: Anbieter + Details, Betrag mit Intervall, Status-Etikett (Vertrag / kündbar bis … / Frist verpasst / Bestätigt / Erkannt / Inaktiv / Beendet), dann Aktionen – bei Verträgen Ansehen und Kündigungsschreiben, bei Abos ✓ Bestätigen und ✕ Beenden – und ⋯ mit „Buchungen anzeigen“.

## v0.78.0

- Konten: Chip „Alle Konten ▾“ (Fenster „Konten auswählen“) entfernt – die Auswahl läuft über die Seitenleiste.
- „Konten ein/aus“: Schnellwahl **Alle · Keine · Nur Guthaben · Nur Schulden** (aktiviert passende Konten, deaktiviert die anderen). Das Emoji-Auge im Chip ist jetzt das schlichte Linien-Auge wie bei den anderen Symbolen; ebenso die Wisch-Aktionen „Vorschau/Öffnen/Beleg“.
- Umsätze-Box: Höhe wird jetzt auch neu berechnet, wenn sich darüber etwas ändert (anderes Konto gewählt, Kennzahlen/Chips neu, Seitenleiste ein-/ausgeklappt) – vorher konnte unten eine Lücke bleiben.

## v0.77.0

- **Alle Auswahlfelder (53 `<select>`) im Fahrtenbuch-Stil**: neue Komponente `PSelect` – gleiche Optionen/Logik wie vorher, aber als Auswahlmenü mit Haken bei der aktuellen Wahl. Filter-Chips bleiben Chips, Formularfelder sehen aus wie Eingabefelder. Öffnet nach oben, wenn unten kein Platz ist.
- **Alle Auswahlmenüs öffnen nur per Klick** (PickMenu standardmäßig `click`, Fahrzeugauswahl im Fahrtenbuch ebenso).
- Menüs in Fenstern schließen das Fenster nicht mehr; Klicks im Menü lösen keine Zeilen-Klicks mehr aus.
- **Dokumente-Liste wie Rechnungen** (ab iPad): Titel + Absender/Datum, Betrag, Kategorie-Etikett an der Status-Stelle, dann Bearbeiten/Drucken/Teilen/Löschen. Ohne Vorschaubild, kompakte Zeilen.

## v0.76.1

- Rechnungen/Angebote: Reihenfolge rechts jetzt Status (Offen/Bezahlt …) → Auge → Teilen → ⋯. Bei Entwürfen bleiben die Plätze von Auge/Teilen frei, damit alle Status-Etiketten untereinander stehen.

## v0.76.0

- **Dokumente** als einspaltige Liste in einer festen abgerundeten Box (wie Rechnungen): Vorschaubild, Titel/Absender/Datum/Etiketten, Betrag in eigener Spalte rechtsbündig, dann Bearbeiten/Drucken/Teilen/Löschen in einer Reihe. Am Handy dieselbe Box mit nativer Seiten-Scroll. Die Kachel-Ansicht (⇄) bleibt unverändert.
- **Rechnungen/Angebote**: Der Statushinweis bei Angeboten und Entwürfen (Offen, Angenommen, Abgelehnt, Entwurf) steht jetzt rechts an derselben Stelle wie das Status-Menü der Rechnungen – dadurch stehen alle Beträge in einer Linie. „Abgelehnt“ bei offenen Angeboten ist ins ⋯-Menü gewandert („Als abgelehnt markieren“).

## v0.75.2

- Backup → Automatische Backups: Intervall-Menü öffnet nur noch per Klick, nicht beim Drüberfahren mit der Maus.

## v0.75.1

- Erfasste Ausgaben (iPad/Desktop): Liste nach Tagen gruppiert, das Datum bleibt beim Scrollen oben in der Box stehen – wie am iPhone. Bei älteren Jahren steht die Jahreszahl dabei.

## v0.75.0

- **Ausgabe – Erfasste Ausgaben** mit Suchleiste (Firma, Notiz, Kategorie, Konto, Datum, Betrag).
- Ab iPad quer / Desktop (≥ 1100 px): zweispaltig, rechts eine feste abgerundete Box bis 15 px über den Rand, nur der Inhalt scrollt. iPad hochkant: Box unter dem Formular mit eigener Scroll-Liste (ca. 60 % Bildschirmhöhe).
- iPhone: unter dem Formular „Erfasste Ausgaben“, darunter die Suchleiste, die beim Scrollen oben stehen bleibt, und die Liste wie in den Kontodetails (nach Tagen gruppiert, Datum bleibt oben stehen, abgerundete Box).
- Details einer Ausgabe zeigen jetzt die USt je Steuersatz.
- Es werden die letzten 200 Ausgaben angezeigt (bei Suche bis 500 Treffer).

## v0.74.2

- Ausgabe: „＋ Kategorie“ (neue Kategorie anlegen) steht jetzt ganz oben im Kategorie-Menü – vorher nur am Ende der langen Liste.

## v0.74.1

- Ausgabe: **Kategorie** ebenfalls als Auswahlmenü (mit Symbolen, „＋ Neue Kategorie …“ am Ende).
- Konto- und Kategorie-Menü öffnen nur durch Anklicken, nicht beim Drüberfahren (PickMenu-Option `click`).
- Auswahlmenüs öffnen nach oben, wenn darunter zu wenig Platz ist, und enden über der unteren Leiste.

## v0.74.0

- **Ausgabe erfassen** reduziert auf: Firma, Datum, Betrag (brutto), Steuern, Konto, Kategorie, Notizen. Die Positionen-Liste ist aus dem Formular entfernt.
- **Steuern**: je Steuersatz (20 / 13 / 10 / 0 %) eine Zeile mit Brutto-Anteil, USt wird automatisch gerechnet; eine einzelne Zeile ohne Betrag gilt für den ganzen Betrag. Differenz-Hinweis, wenn die Anteile nicht zum Betrag passen. Gespeichert als `vat` an der Buchung; im Excel/CSV-Export Spalten „USt €“, „Steuersätze“, „Notizen“.
- KI-Scan liefert jetzt die USt-Aufschlüsselung je Steuersatz (`amount.vat_lines`); der RKSV-QR-Code füllt die Steuerzeilen ebenfalls.
- **Konto** als Auswahlmenü wie die Fahrzeugauswahl im Fahrtenbuch; Hinweis „alle Konten“ entfernt.

## v0.73.4

- Test „Konten-Design für alle Reiter“ (v0.66) komplett entfernt: Schalter in Darstellung, Kopfkarten, Chip-Leisten und Spaltenköpfe. Die alte Einstellung wird beim Start automatisch gelöscht.

## v0.73.3

- Kopfbereich-Einklappen (Desktop mit Maus/Trackpad) überarbeitet: Es verschwinden jetzt alle Elemente über der Liste, die Platz kosten – Kennzahlen, Hinweistexte, Ablagefeld und die Fahrzeugkarte. Vorher klappten Kunden, Artikel und Fixkosten nur ~9 px ein.
- Fahrtenbuch: Passte die Liste nicht auf den Bildschirm, scrollte die Seite und es klappte nie ein. Jetzt klappt der Kopf auch beim Scrollen der Seite ein; die Liste bekommt dann die volle Höhe.
- Beim Ausklappen springt die Liste im Fahrtenbuch an den Anfang statt irgendwohin.
- Fehlerprüfung aller Reiter auf Desktop, iPad- und Handy-Größe: keine Script-Fehler, kein seitliches Überlaufen.

## v0.73.2

- „Backup speichern“ und „Jetzt sichern“ sind nicht mehr dauerhaft hervorgehoben – die Akzentfarbe erscheint nur beim Antippen bzw. solange der Vorgang läuft.

## v0.73.1

- Auto-Backup-Intervalle **Alle 5 / 10 / 30 Minuten** und **Stündlich** ergänzt.
- Automatische Sicherungen werden nur angelegt, wenn sich die Daten seit der letzten Sicherung geändert haben (sonst würden 10 gleiche Kopien die älteren verdrängen). „Jetzt sichern“ sichert immer.
- Prüfung läuft jede Minute, solange die App offen ist.

## v0.73.0

- **Datensicherung neu** in drei Karten: *Verschlüsseltes Backup* (Speichern/Wiederherstellen), *Automatische Backups*, *Speicherverbrauch*.
- **Automatische Backups** im Browser (eigene IndexedDB), rotierend max. 10 Stück. Intervall: Aus, Bei jedem App-Start (max. alle 2 h), Täglich (Standard), Wöchentlich, Monatlich – Auswahlmenü im Stil der Fahrzeugauswahl im Fahrtenbuch.
- „Jetzt sichern“, „Auto-Backups verwalten“ (herunterladen, wiederherstellen mit vorheriger Sicherheitskopie, löschen), Anzeige letztes Auto-/externes Backup mit Warnung.
- Auto-Backups enthalten keine Originaldateien (PDFs/Fotos) und sind nicht verschlüsselt – die liegen nur im externen Backup.
- Speicherverbrauch (IndexedDB) mit Balken und Option „Dauerhafter Speicher“.

## v0.72.5

- Mahnungen: Suchleiste auch auf iPad und Desktop (über der Liste, filtert „Zu mahnen“ und Mahnverlauf, Anzahl in den Überschriften).

## v0.72.4

- Mahnungen: Suchleiste über „Zu mahnen“ (Kunde, Rechnungsnummer, Mahnstufe, Betrag) – filtert „Zu mahnen“ und den Mahnverlauf; bleibt am Handy beim Scrollen oben stehen.
- „＋ Mahnung“ heißt jetzt „📮 Mahnung erstellen“ und ist nicht mehr dauerhaft hervorgehoben (Handy und Desktop).

## v0.72.3

- Handy: In Reitern ohne eigene Suchleiste (Mahnungen, Verträge, Fixkosten & Abos, Fahrtenbuch) bleibt beim Scrollen oben eine schmale Leiste in Hintergrundfarbe stehen – wie die Suchleiste bei den Rechnungen. Dadurch färbt Safari die Statusleiste nicht mehr grau ein, wenn eine graue Überschrift („Zu mahnen“) nach oben kommt.

## v0.72.2

- Handy: Listen scrollen jetzt mit dem ganz normalen Seiten-Scrollen von iOS (mit Schwung, ohne Eingriffe per Skript). Titel, Kennzahlen und Knöpfe wandern dabei nach oben weg, die Suche/Filter bleiben oben stehen. Die Liste sieht trotzdem wie eine feste Box aus: oben eine mitlaufende abgerundete Kante direkt unter der Suchleiste, unten eine feste abgerundete Kante 15 px über der Leiste. Gilt für alle Listen-Reiter inkl. Fixkosten & Abos und Fahrtenbuch.
- Das automatische Einklappen per Skript gibt es nur noch am Desktop mit Maus; auf iPad/Touch bleibt die Box fest mit eigener Scroll-Liste.

## v0.72.1

- Einklappen des Kopfbereichs flüssig: kein Animieren der Höhe mehr (das hat bei jedem Bild die Box neu berechnet und geruckelt). Stattdessen klappt der Kopf in einem Schritt ein bzw. aus und die Liste wird dabei so verschoben, dass die Einträge unter dem Finger an derselben Stelle bleiben – die Box wächst einfach nach oben. Eingeklappt wird erst, wenn man weiter als die Höhe des Kopfbereichs gescrollt hat; ausgeklappt kurz vor dem Listenanfang. Dadurch kein Hin-und-her-Springen mehr.

## v0.72.0

- Kopfbereich klappt beim Scrollen ein: Sobald man in einer Listen-Box nach unten scrollt, wird der Seitentitel klein und die Kennzahlen-Karte blendet sich aus – die Box wird entsprechend größer (am Handy z. B. Mahnungen 448 → 613 px). Ganz nach oben scrollen klappt alles wieder auf. Gilt für alle Listen-Reiter auf Handy, iPad und Desktop.

## v0.71.0

- Listen-Box (Rechnungen, Mahnungen, Kunden, Artikel, Lager, Besitz, Kassabuch, Fixkosten, Verträge, Fahrtenbuch) ist fest: Sie reicht bis 15 px über den unteren Rand (am Handy bis 15 px über die Leiste unten), die Seite selbst scrollt nicht mehr, nur der Inhalt der Box. Ist über der Liste zu wenig Platz (unter 160 px, z. B. bei offenem Ablagefeld), scrollt die Seite wie bisher, damit nichts hinter der Leiste verschwindet.

## v0.70.2

- Kassabuch: Knöpfe für Kasse und Zeitraum sind nicht mehr dauerhaft hervorgehoben – nur solange das Menü offen ist.

## v0.70.1

- Kassensturz-Protokolle: Anzeigen und Drucken als Symbol-Knöpfe (Auge, Drucker) wie in Rechnungen und Dokumenten.

## v0.70.0

- Kassabuch: Kassenauswahl und Zeitraum als Auswahlmenü im Stil der Fahrzeugauswahl (Hover am Desktop, Tippen am Handy). Kassen mit Kassenstand und Anzahl Buchungen, dazu „bearbeiten“ und „Kasse hinzufügen“; Zeitraum nach Monat und Jahr mit Anzahl Buchungen und Einnahmen/Ausgaben.
- Kassensturz-Protokolle: neuer Knopf „👁 Anzeigen“ (PDF in der App), 🖨 öffnet direkt den Druckdialog.

## v0.69.1

- Seitenleiste: Logo „FinDocu – Finanzen & Dokumente“ bleibt oben fixiert und scrollt nicht mehr mit (iPad und Desktop).
- Kassabuch ab iPad: Tabelle mit derselben Schrift und Größe wie die anderen Listen (Text 20 px, Details 17/15 px, Beträge 20 px). Bei schmaler Tabelle stehen Belegnummer und Kategorie klein unter Datum bzw. Text, auf breiten Bildschirmen als eigene Spalten.

## v0.69.0

- **Handy: Listen als abgerundete Karte mit innerer Scroll-Liste** – Rechnungen, Mahnungen, Kunden, Artikel, Lager & Inventur, Besitz & Garantie, Kassabuch, Verträge, Fixkosten & Abos und Fahrtenbuch. Die Karte ist mindestens gut halb so hoch wie der Bildschirm: Erst scrollt die Seite, bis die Karte ganz sichtbar ist, dann scrollt die Liste innen. Tages-/Gruppenüberschriften bleiben innerhalb der Karte oben haften, Wischgesten funktionieren weiter.

## v0.68.0

- **Listen als abgerundete Karte mit innerer Scroll-Liste** (wie im Reiter Konten): Rechnungen, Mahnungen, Kunden, Artikel, Lager & Inventur, Besitz & Garantie, Kassabuch, Fixkosten & Abos, Verträge und Fahrtenbuch (Listen-Ansichten). Die Karte ist oben und unten abgerundet, gescrollt wird innerhalb der Karte. Ist über der Liste wenig Platz (z. B. bei offenem Ablagefeld), bekommt die Karte trotzdem eine feste Höhe von rund 60 % des Bildschirms.
- Kassabuch: ab iPad gleiche Scroll-Karte wie die anderen Listen, Hinweistext in die Karte verschoben.
- Konten: Link „Konto löschen“ unter der Umsatzliste entfernt (Löschen weiterhin über „Konto bearbeiten“).

## v0.67.1

- Kassabuch: Die Buchungstabelle (Einnahmen/Ausgaben) bleibt ab dem iPad im Desktop-Design. Bei schmaler Tabelle stehen Belegnummer unter dem Datum und Kategorie unter dem Text, statt dass Spalten zusammenfallen.
- Kassensturz-Protokolle: Anzahl neben der Überschrift 3 px nach rechts (alle Ansichten).

## v0.67.0

- **Neuer Reiter „Besitz & Garantie“** für Anschaffungen – umschaltbar zwischen **Privat**, **Firma** und beidem.
  - Je Gerät: Foto, Kategorie, Marke/Modell, Seriennummer, Kaufdatum, Kaufpreis, Händler, Notiz, verknüpfter Kaufbeleg.
  - **Garantieende wird berechnet**: Gewährleistung (Standard 24 Monate) und optionale, längere Herstellergarantie; es gilt das spätere Datum. Vorwarnung standardmäßig 30 Tage vorher (je Gerät einstellbar).
  - **KI-Scan**: Kaufbeleg scannen oder Foto/PDF wählen – Bezeichnung, Preis, Kaufdatum und Händler werden ausgefüllt, der Beleg wird abgelegt und verknüpft.
  - **Kalender**: eigene Monatsansicht im Reiter; alle Garantie-Termine erscheinen zusätzlich im Reiter „Umtauschfrist“ und im Apple-Kalender-Abo. Erledigt-Haken wirkt in beide Richtungen.
  - Filter nach Status (in Garantie, läuft bald ab, abgelaufen, ausgeschieden), Suche, Verkauft/Ausgeschieden-Status.
  - Export: Inventarliste als PDF (nach Kategorie, mit Kaufwert), Excel, CSV und Garantie-Termine als .ics.
- Nicht getestet: echter Kamera-Scan; die KI-Auslesung wurde mit simulierter Antwort geprüft.

## v0.66.0

- **Konten-Design für alle Reiter (Test)**: Schalter unter Einstellungen → Darstellung, standardmäßig aus. Nur Optik, keine Funktionsänderung.
  - Kopfkarte mit Kennzahlen (großer Hauptwert + Kennzahlenfelder) in Rechnungen, Mahnungen, Verträge, Kassabuch, Lager & Inventur; neu mit Kennzahlen: Kunden, Artikel, Dokumente. Am Handy ersetzt die Kopfkarte die wischbaren Kacheln.
  - Chip-Leiste statt großer Buttons (Desktop und Handy).
  - Desktop: Listen als Tabelle mit fixer Kopfzeile (Name – Details – Betrag) in Rechnungen, Mahnungen, Kunden, Artikel, Verträge, Lager.
  - Unverändert: Dokumentenliste, Fixkosten & Abos (Kachelraster) und Fahrtenbuch behalten ihre Listenform.

## v0.65.0

- **Kassabuch: KI-Scan** wie bei der Ausgabe – „Beleg scannen“, „QR-Code“ (RKSV) und „Foto / PDF“. Die KI füllt Betrag, Datum und Buchungstext, der Beleg wird als Dokument abgelegt und verknüpft.
- **Lager: Wareneingang per Beleg (KI)** – Lieferschein/Rechnung/Bon scannen, die KI liest die Positionen; jede Position einem Lagerartikel zuordnen oder neu anlegen, Menge und Preis prüfen, alles in einem Schritt einbuchen.
- **Konten (Desktop): „👁 Konten ein/aus“** – Fenster mit Schalter je Konto zum Aktivieren/Deaktivieren (deaktivierte Konten fehlen in Liste, Übersicht, Analyse, Vermögen; Buchungen bleiben erhalten).
- Getestet mit simulierter KI-Antwort; echter Kamera-Scan und echte KI-Auslesung nicht getestet.

## v0.64.1

- Inventur-Zählfenster: Abstand zwischen Suchfeld, „nur offene“ und „Scan-Zählung“ korrigiert.

## v0.64.0

- **Neue Handy-Ansichten sind Standard**: Der Test-Schalter in den Einstellungen entfällt, bis 700 px Breite gelten immer die neuen Listen-Ansichten.
- **Kassabuch (neuer Reiter)**: Bareinnahmen/-ausgaben einzeln mit fortlaufender Nummer je Jahr, Kategorie, USt-Satz und Beleg (Dokument verknüpfen, fotografieren, Belegnummer oder Eigenbeleg). Buchungen sind unveränderbar – Korrektur nur per **Storno** (Gegenbuchung, Original bleibt sichtbar). Kassenminus und Rückdatieren vor den letzten Kassensturz werden verhindert. **Kassensturz** mit Zählung nach Scheinen/Münzen, Soll-Ist-Differenz, Protokoll (PDF) und optionaler Differenzbuchung. Mehrere Kassen mit Anfangsbestand. Export als PDF (Anfangs-/Endbestand), Excel, CSV. Hinweis: ersetzt keine Registrierkasse nach RKSV.
- **Lager & Inventur (neuer Reiter)**: Bestand je Lagerartikel aus Bewegungen (Anfangsbestand, Wareneingang, Entnahme, Korrektur, Inventurdifferenz) und – abschaltbar – automatisch aus Rechnungen. Scannen & buchen per Strichcode, Lagerorte, Mindest-/Zielbestand mit Liste „Nachbestellen“ und Bestellvorschlag (PDF, nach Lieferant), Lagerwert zu Einstandspreisen. **Inventur**: Stichtags- oder Teil-Inventur je Lagerort/Gruppe, Zählliste zum Ausdrucken, Zählen mit ＋/− oder Scan-Zählung (jeder Scan +1), Soll-Ist-Differenzen, Abschluss bucht Differenzen und erzeugt Inventurliste mit Bewertung (PDF/Excel).
- **Artikelverwaltung erweitert**: Foto, Einkaufspreis (mit Marge), Lieferant, Lagerartikel mit Lagerort, Mindest-/Zielbestand; Bestand wird in der Artikelliste angezeigt.
- Nicht am echten Gerät getestet: Kamera-Scan (Scan-Zählung), Beleg-Foto im Kassabuch.

## v0.63.1
- Fahrtenbuch: Die Fahrzeugauswahl ist jetzt ein Dropdown. Mit der Maus öffnet es beim Darüberfahren, per Finger beim Antippen. Es zeigt alle Fahrzeuge mit Modell/Kennzeichen, dazu „bearbeiten“ und „＋ Fahrzeug hinzufügen“.
- Scan-Knöpfe vereinheitlicht (KI-Kassenbon-Auslesung):
  - Fahrtenbuch-Eintrag: gleiche drei Knöpfe wie bei Ausgabe (📷 Beleg scannen, ▦ QR-Code, 🖼 Foto/PDF); der QR-Code füllt Betrag/Datum bzw. rechnet die Liter.
  - „＋ → Buchung“ und „manuell erfassen“ in der Übersicht nutzen jetzt das volle Ausgabe-Formular mit KI statt der alten Barausgabe-Maske.
  - Geprüft und bereits mit KI: Reiter Ausgabe, Ausgabe-Widget, Buchungsdetail, Fahrtenbuch-Ablagefeld. Der allgemeine Dokument-Scanner (＋ → Scannen, Dokumente) bleibt bewusst bei der Dokumenten-KI.

## v0.63.0
- Fahrtenbuch:
  - „Tanken“ ist nicht mehr dauerhaft hervorgehoben.
  - Der Hinweis „… Erinnerungen fällig“ ist entfernt, die Ansichtsleiste rückt nach oben. Das Hintergrundband der haftenden Leiste erscheint nur noch, wenn sie oben angeheftet ist, und überdeckt sonst nichts mehr.
  - Handy: Kennzahlen (4) und Schnellknöpfe (Tanken, Fahrt, Ausgabe, Erinnerung) stehen kompakt nebeneinander wie am Desktop.
  - **Erinnerungen → Kalender:** 📅 an jeder Erinnerung mit Datum (einzelner Termin), „⬇︎ .ics“ für alle Erinnerungen mit Datum und „Kalender-Abo“ (alle Fahrzeuge, eigener Kalender „FinDocu – Fahrzeuge“, aktualisiert sich bei Änderungen automatisch; nutzt denselben Vercel-Blob-Speicher wie das Fristen-Abo). Erinnerungen nur nach km haben kein Datum und bleiben außen vor.

## v0.62.2
- Beim ersten Start sind jetzt alle Reiter aktiv, in der Seitenleiste und in der Handy-Leiste unten (inkl. Umtauschfrist und Backup). Bestehende Installationen behalten ihre eigene Auswahl.

## v0.62.1
- iPhone/Handy: Der Abstand zwischen Statusleiste und Seitentitel war in jedem Reiter viel zu groß, weil der Statusleisten-Abstand doppelt gerechnet wurde. Jetzt steht der Titel direkt unter den Symbolen oben rechts (etwa 70 pt höher).
- Haftende Leisten der neuen Handy-Ansichten (Kontodetail, Suche/Filter, Tageskopf) bleiben jetzt unterhalb der Statusleiste statt darunter zu verschwinden.

## v0.62.0
- **Neue Handy-Ansichten (Test)**, nur bis 700 px Breite und abschaltbar unter Einstellungen → Darstellung → „Neue Handy-Ansichten (Test)“ (standardmäßig an). Ausgeschaltet gelten wieder die bisherigen Ansichten, auch in Konten.
  - Gleicher Aufbau überall: wischbare Kennzahl-Karten, Aktionsknöpfe, oben haftende Suche mit Filter-Chips, gruppierte Liste mit großem Symbol bzw. Initialen-Avatar, Betrag rechts, Status-Pill und Wischaktionen.
  - **Rechnungen:** nach Monat gruppiert mit Monatssumme. Nach links wischen: ✓ Bezahlt und 📮 Mahnen. Nach rechts: 👁 Vorschau und ⧉ Kopie. „Wiederkehrend“ zeigt die Vorlagen mit Schalter aktiv/pausiert.
  - **Mahnungen:** Abschnitte „Zu mahnen“ (mit nächster Stufe bzw. Wartezeit) und „Mahnverlauf“. „＋ Mahnung“ öffnet eine Auswahl der offenen Rechnungen. Wischaktionen: Mahnen, Bezahlt, Vorschau, Teilen.
  - **Kunden:** alphabetisch gruppiert, Avatar in der Farbe der Kontaktart, Umsatz und offene Rechnungen. Wischen: 📞 Anrufen, ✉️ Mail, 🧾 Rechnung, 📇 vCard.
  - **Artikel:** nach Gruppe, mit Preis pro Einheit und Umsatz. Sortierung als Chip. Wischen: ⧉ Kopie, ⏸ Inaktiv/▶ Aktiv.
  - **Verträge:** nach Kategorie mit Monatskosten je Kategorie, „kündigen bis“ und rote bzw. graue Pill bei Kündigungsfrist in den nächsten 60 Tagen. Wischen: 👁 Dokument, ⏸ Inaktiv, 📅 Kalender.

## v0.61.0
- **Wischgesten für Handy & Tablet** (nur per Finger/Stift; Maus bleibt unverändert):
  - Buchungen (Konten, Handy- und Tablet-Ansicht): nach links wischen zeigt 📷 Beleg scannen bzw. 📎 Beleg öffnen und 🗑 Löschen; ganz durchgewischt wird gelöscht (mit Rückfrage). Nach rechts wischen zeigt ✎ Details.
  - Dokumente (Listenansicht): nach links ✎ Bearbeiten und 🗑 Löschen, nach rechts 👁 Vorschau und 📤 Teilen.
  - Umtauschfrist (Liste): nach rechts ✓ Erledigt bzw. ↺ Offen, nach links 👁 Öffnen und 📅 Kalender.
  - Vom linken Bildschirmrand nach rechts wischen = Zurück. Das schließt Fenster und Blätter am Handy (bei ungespeicherten Änderungen kommt die Rückfrage) bzw. führt im Kontodetail zurück zur Kontenübersicht.
  - Es ist immer nur eine Zeile offen; Antippen woanders schließt sie.

## v0.60.0
- **Konten am Handy neu (bis 700 px Breite):**
  - Übersicht: Karte „Statistik“ mit verfügbaren Einnahmen des Monats (Eingänge minus Ausgaben), Tagen bis Monatsende und Fortschrittsbalken; ein Antippen öffnet die Analyse. Darunter „Alle Buchungen“ mit Gesamtstand und die Kontogruppen (Bargeld, Girokonten, Sparkonten, Depots …) als einklappbare Abschnitte mit Kontostand je Konto. Dazu ein Hinweis auf erkannte Abos und Knöpfe für ＋ Konto, Kontoauszug-Import und ✨ Logos.
  - Kontodetail: Leiste mit „‹ Zurück“, Kontoname, 🔍 Suche und ⋯-Menü (Konto bearbeiten, Import, Logos, Konto löschen). Darunter der Kontostand bzw. die Monatssumme mit Monatswahl, Sammlungsfilter und die Buchungen nach Tagen gruppiert (Tageskopf bleibt oben haften). Jede Zeile zeigt Logo, Name, „Vertrag“-Kennzeichen, Kategorie, Beleg-📎, Einnahmen grün hinterlegt und ↻ bei wiederkehrenden Buchungen. Beim Scrollen wird automatisch nachgeladen, ein Antippen öffnet die Buchungsdetailansicht.
- Desktop und Tablet bleiben unverändert.

## v0.59.0
- **Firmenlogos für Buchungen** (neue Funktion `api/logo.js`, nutzt den vorhandenen `ANTHROPIC_API_KEY`). Die KI ordnet den Empfänger der offiziellen Website zu (BILLA → billa.at), danach wird deren öffentliches Website-Symbol geladen (apple-touch-icon bzw. Favicon). Das Logo wird auf 96 px verkleinert und lokal in IndexedDB gespeichert (neuer Speicher `logos`, DB-Version 3).
  - Einzeln: im Buchungsdetail auf das Symbol tippen und „✨ Firmenlogo suchen (KI)“ wählen, dort auch „Logo entfernen“.
  - Nachträglich für alle: in Konten über „✨ Logos“ fehlende laden, nicht gefundene erneut versuchen, alle neu laden oder alle entfernen.
  - Optional automatisch für neue Empfänger, z. B. nach einem Kontoauszug-Import.
  - Ein selbst gewähltes Emoji hat Vorrang. Privatpersonen, Bankomat und Unklares bekommen kein Logo.
  - Die Logos sind nicht im Backup enthalten, lassen sich aber jederzeit neu laden. „Alle Daten löschen“ entfernt sie mit.

## v0.58.1
- Buchungsdetail, Beleg: gleiche drei Knöpfe wie im Formular „Ausgabe“ (📷 Beleg scannen, ▦ QR-Code, 🖼 Foto / PDF), dazu „Vorhandenes Dokument zuordnen“.
  - Scannen und Foto/PDF laufen über die Kassenbon-KI: Firma, Betrag und Positionen mit Kategorien werden ausgelesen, der Beleg wird verknüpft und als bezahlt markiert. Die Positionen kommen in die Buchung, sofern sie noch keine hat. Weicht der Betrag ab, erscheint ein Hinweis.
  - QR-Code: Der Registrierkassen-QR wird bei der Buchung gespeichert, mit Hinweis, falls der Betrag abweicht.
  - Die Positionen einer Buchung werden jetzt im Detail angezeigt.

## v0.58.0
- **Neue Buchungsdetailansicht** (Konten, gilt für Girokonten, Sparkonten, Karten, PayPal und Depots). Ein Klick auf eine Buchung öffnet sie immer.
  - Kopf: großes Symbol (über ✎ pro Empfänger änderbar, Emoji-Auswahl), Name, Kategorie-Chip (✎, optional „Immer so für …“).
  - Betrag, Buchungsdatum (Heute/Gestern), Valuta, Zweck, Wertpapierdaten bei Depots.
  - Umbuchung als Schalter: zählt nicht als Einnahme/Ausgabe, beim Ausschalten kommt die vorige Kategorie zurück.
  - Zugehöriger Vertrag: eigener Vertrag aus „Verträge“ oder erkannte Fixkosten, ein Klick öffnet ihn.
  - Beleg: Vorschau aufklappen, öffnen oder lösen, alternativ Scannen, Datei oder vorhandenes Dokument zuordnen.
  - **Sammlungen:** eigene Sammlungen (z. B. „Urlaub Kroatien“) anlegen und Buchungen über alle Konten hinzufügen. In Konten gibt es den Filter „📁 Sammlungen“ mit Summe.
  - Notiz zur Buchung.
  - Grafik „Ausgaben bei …“ bzw. „Einnahmen von …“ über die letzten 13 Monate mit Ø pro Monat, dazu „Alle Buchungen anzeigen“.
  - Sonstiges: Von/An mit IBAN, Typ, Gläubiger-ID, Mandatsreferenz.
  - „Manuelle Änderungen zurücksetzen“ (pro Empfänger) und „Buchung löschen“.
  - Bearbeiten: Name, Datum, Zweck und Konto, bei manuellen Buchungen auch der Betrag.
- Import: Gläubiger-ID und Mandatsreferenz werden aus CAMT-Dateien und CSV-Spalten übernommen, sonst aus dem Verwendungszweck erkannt (`MREF`, `…ZZZ…`).

## v0.57.0
- **Fester Kopfbereich in weiteren Reitern** (am Desktop und Tablet ab 700 px Breite). Der obere Teil bleibt stehen, nur die Liste darunter scrollt:
  - Dokumente (alle Kategorien wie Ausgangsrechnung, Versicherung, Verträge): unterhalb des Ablagefelds
  - Fixkosten & Abos: unterhalb der Kopfkachel
  - Rechnungen: unterhalb der Filterleiste (Alle, Entwürfe …)
  - Mahnungen: unterhalb von „＋ Mahnung“
  - Kunden: unterhalb des Ablagefelds
  - Artikel: unterhalb der Gruppenleiste
  - Verträge: unterhalb des Ablagefelds
- **Fahrtenbuch:** Der Kopf mit Fahrzeugkarte ist höher als der Bildschirm. Deshalb bleibt dort die Leiste „Verlauf · Tanken · Fahrten · … · Berichte“ beim Scrollen oben haften, auch am Handy.
- Reicht der Platz nicht oder bei Handy-Breite, scrollt die Seite wie bisher normal.

## v0.56.2
- **Konten: fester Kopfbereich.** Kontostand, Leiste, Suche und die Spaltenüberschrift (Datum, Empfänger, Kategorie, Betrag) bleiben stehen, nur die Umsatzliste scrollt. Das gilt für alle Konten und Auswahlen. Weitere Buchungen werden beim Scrollen automatisch nachgeladen. Reicht der Platz nicht (z. B. „Alle Konten“ mit Kontokarten oder am Handy), scrollt die Seite normal, die Spaltenüberschrift bleibt dabei oben haften.
- In schmalen Tabellen, etwa mit Seitenspalte, wird die Kategorie-Spalte ausgeblendet, statt den Empfänger auf null zusammenzudrücken.

## v0.56.1
- Übersicht: Das Widget „Barausgabe erfassen“ wurde durch das vollständige Formular „Ausgabe erfassen“ aus dem Reiter Ausgabe ersetzt. Es bietet Beleg scannen (KI), Registrierkassen-QR, Foto/PDF, Ausgabe/Einnahme, Firma, Betrag, Datum, alle Konten, Kategorie, Positionen und Notiz und verknüpft den Beleg. In schmalen Kacheln wird es automatisch kompakt dargestellt.

## v0.56.0
- **Rechnungen & Mahnungen wie Dokumente:** Ein Klick auf den Namen öffnet die Rechnung als Vorschau direkt unter der Zeile, mit Drucken und „Original öffnen“. Ein zweiter Klick schließt sie wieder. Im Mahnverlauf zeigt die Vorschau das jeweilige Mahnschreiben. Ein Klick auf die übrige Zeile funktioniert wie bisher: bearbeiten, Mahnung erstellen oder PDF öffnen.
- Kunden: E-Mail- und Telefon-Chips sind jetzt genauso vertikal zentriert wie „Rechnung“ und „vCard“.

## v0.55.3
- Kalender: Der Knopf „⏰ Bevorstehend“ steht jetzt ganz links vor dem ‹-Pfeil, am Handy in einer eigenen Zeile oben.
- Bevorstehend-Fenster: Die Datumsfelder sind an die Schriftgröße angepasst und fester bemessen, nichts ragt mehr über den Rand.

## v0.55.2
- Umtauschfrist-Kalender: „Bevorstehend“ ist jetzt ein schwebendes Fenster. Der Knopf „⏰ Bevorstehend“ in der Kalenderleiste zeigt die Anzahl offener Fristen und wird rot, wenn etwas überfällig ist. Das Fenster ist am Desktop verschieb- und größenveränderbar, am Handy ein Vollbild-Blatt. Ein Klick auf eine Zeile springt zum Tag im Kalender, › öffnet die Rechnung.

## v0.55.1
- Umtauschfrist (Kalender und Liste): Ein Klick auf eine Frist öffnet jetzt direkt die verknüpfte Rechnung bzw. den Beleg als Vorschau, mit Drucken und „Original öffnen“. Bearbeiten geht über ✎ im Fenster. Vertragsfristen öffnen weiterhin den Vertrag.

## v0.55.0
- **Widget-Raster wie in der Übersicht** jetzt auch in Analyse, Vermögen und Firmenauswertung. Am Desktop lassen sich die Kacheln frei platzieren und an der Ecke ◢ in Breite und Höhe ziehen. Dazu kommen Abstand-Regler, „Nach oben rücken“, Leerfelder und die Liste „Weitere Widgets“ zum Ein- und Ausblenden. Technisch nutzen alle Reiter dieselbe Raster-Komponente (`DashGrid`). Die Anordnung aus v0.54.0 wird übernommen (Schlüssel `anaGrid`, `wealthGrid`, `bizGrid`).
- **Depot-Positionen** stehen nicht mehr rechts im Reiter Konten, sondern als eigenes Widget im Reiter Vermögen. Sie richten sich nach der Kontenauswahl dort.

## v0.54.2
- Dokumente, Kachelansicht: Die schwebende Leiste „Drucken / Original öffnen“ auf den Kacheln wurde in allen Kategorien entfernt. Drucken bleibt über das Drucker-Symbol auf der Karte, das Original lässt sich in der Detailansicht öffnen.

## v0.54.1
- **Kündigungstermine aus „Verträge“ im Reiter Umtauschfrist:** Für jeden laufenden Vertrag mit Kündigungsfrist erscheint der Termin „Kündigung bis“ im Kalender, in der Liste, im Fristen-Widget der Übersicht, im Zähler, im .ics-Export und im Apple-Kalender-Abo. Ein Klick öffnet den Vertrag, abhaken markiert den Termin als erledigt. Bei Verträgen mit Verlängerung erscheint automatisch der nächste Termin. Nicht aufgenommen: gekündigte und abgelaufene Verträge sowie unbefristete Verträge („jederzeit kündbar“). Gibt es dieselbe Frist schon im verknüpften Dokument, erscheint sie nur einmal.

## v0.54.0
- **Verschiebbare Widgets** in den Reitern Analyse, Vermögen und Firmenauswertung: Über das Layout-Symbol oben rechts lässt sich jede Kachel verschieben (⠿ ziehen oder ▲▼), auf halbe oder ganze Breite stellen (am Desktop) und aus- oder wieder einblenden. Die Anordnung wird pro Reiter gespeichert (`anaBoard`, `wealthBoard`, `bizBoard`). Die Übersicht hat das bereits über „Übersicht anpassen“.
- **Export-Prüfung:** Alle 38 Exportfunktionen in 11 Reitern wurden mit den Demodaten ausgelöst und die Dateien geprüft (Excel, PDF, ZIP, CSV, vCard, ICS).
- Fix: Die Dokumente-CSV hat jetzt das gleiche Format wie die anderen Exporte (Datum TT.MM.JJJJ, Beträge mit Komma).

## v0.53.2
- Fix: Export-Menü im Fahrtenbuch (und in Konten/Vermögen/Analyse-Leisten) öffnete sich unsichtbar, weil die Leiste es abgeschnitten hat. Das Menü schwebt jetzt frei unter dem Knopf (am Handy unten als Blatt) und ist in allen Reitern sichtbar.

## v0.53.1
- Fahrtenbuch: Hinweis „Erinnerungen fällig“ bleibt auch im Bereich Erinnerungen stehen – die Leiste springt beim Umschalten nicht mehr nach oben.

## v0.53.0
- Fahrtenbuch: Leiste Verlauf/Tanken/Fahrten/Ausgaben/Erinnerungen/Berichte anpassbar – über ⇄ am Ende: am Griff ⠿ verschieben, mit dem Auge aus- und einblenden. Ist der gerade offene Bereich ausgeblendet, springt die Ansicht auf den ersten sichtbaren.

## v0.52.3
- Export-Knopf in Artikel, Firmenauswertung, Konten und Vermögen wie im Fahrtenbuch: mittig beschriftet, gleiche Höhe, mit Abstand zu den Filter-Knöpfen davor.

## v0.52.2
- Export-Knopf: Text mittig ausgerichtet und gleich hoch wie die anderen Knöpfe der Leiste. Fahrtenbuch: Abstand zwischen „＋“ und „Ablagefeld“.

## v0.52.1
- Zeitraum-Kalender: „von“ und „bis“ lassen sich jetzt direkt eintippen (TT.MM.JJJJ, auch 1.3.23) – praktisch für Zeiträume über mehrere Jahre. Beim Ändern des Startdatums bleibt das Enddatum erhalten. Ein Klick in den Kalender direkt nach dem Antippen eines Felds geht nicht mehr verloren.

## v0.52.0
- Analyse, eigener Zeitraum: großer eigener Kalender statt der kleinen Browser-Datumsauswahl – Start- und Enddatum antippen, Bereich farbig markiert, Monat/Jahr per Auswahl, Felder „von/bis“. Anzeige oben nur noch das gewählte Datum (ohne Pfeile).

## v0.51.3
- Analyse, eigener Zeitraum: Anzeige im gleichen Stil wie die anderen Zeiträume („01. Jän. 26 – 08. Nov. 26“) mit ‹ › zum Blättern um die gleiche Anzahl Tage; Klick auf das Datum öffnet die Auswahl.

## v0.51.2
- Analyse: Fenster „Eigener Zeitraum“ zentriert unter dem Knopf (am Handy innerhalb des Bildschirms gehalten).

## v0.51.1
- Analyse: „Eigener Zeitraum“ öffnet ein schwebendes Fenster links unterhalb des Knopfs; erneutes Klicken schließt es. Der gewählte Zeitraum steht rechts und öffnet das Fenster ebenfalls.

## v0.51.0
- Analyse: neuer Zeitraum „Eigener Zeitraum“ mit Von/Bis-Datum (tagesgenau) und Schnellwahl (Dieses Jahr, Letzte 30 Tage, Letzte 90 Tage, Letztes Jahr). Der Vergleich läuft gegen gleich viele Tage direkt davor; der Verlauf zeigt die Monate des Zeitraums (max. 36).

## v0.50.0 – Exporte
Neuer Knopf „⬇︎ Export“ in vielen Reitern (Excel = echte .xlsx-Datei, CSV mit Semikolon für Excel, PDF zum Drucken):
- **Konten**: Umsätze der gewählten Konten/Monate als Excel (inkl. Blatt Kategorien), CSV oder PDF (je Konto mit Summen).
- **Vermögen**: Vermögensaufstellung zum Stichtag als PDF (Konten, Vermögenswerte, Schulden, Verlauf), Excel, CSV.
- **Firmenauswertung**: Steuerberater-Paket (ZIP: Einnahmen-Ausgaben-Rechnung als Excel + PDF, Rechnungsausgangsbuch, offene Posten, alle Rechnungs-PDFs und Firmenbelege), EAR einzeln, Rechnungsausgangsbuch, offene Posten.
- **Rechnungen**: Rechnungsausgangsbuch (Excel/CSV), offene Posten (PDF/CSV), alle Rechnungen eines Jahres als PDF-ZIP.
- **Mahnungen**: offene Posten (PDF/CSV), Mahnverlauf (CSV).
- **Kunden**: vCard (.vcf), Excel, CSV – jeweils für den aktuellen Filter.
- **Artikel**: Preisliste als PDF (nach Gruppen), Excel mit Umsatz, CSV.
- **Fahrtenbuch**: Fahrtenbuch je Jahr als PDF (Monatssummen, Kilometergeld), Excel (Fahrten, Tanken & Kosten), Tank- & Kostenliste CSV.
- **Verträge**: Vertragsübersicht PDF/Excel/CSV, Kündigungstermine als Kalenderdatei (.ics) mit Erinnerung.
- **Ausgabe**: Einkäufe mit allen Positionen als Excel (Positionen, Einkäufe, Warengruppen) oder CSV.
- **Dokumente**: gefilterte oder ausgewählte Dokumente als ZIP (Originaldateien nach Kategorie-Ordnern + Übersicht.csv), Liste als CSV.
- Neue Abhängigkeit: `fflate` (ZIP/Excel).

## v0.49.2
- Filterleisten: Felder 3 px niedriger (46 → 43 px).

## v0.49.1
- Dokumente: Filterleiste (Umtauschfrist, Steuerrelevant, Unbezahlt, Monat, Jahr, Tags, Sortierung, Auswählen, CSV, Ablagefeld) passt sich der Breite an und bricht um statt abgeschnitten zu werden. Über ⇄ lassen sich alle Einträge sortieren und ein-/ausblenden – jetzt auch die Leisten „Privat / Firma“ und „Bereiche“.

## v0.49.0
- Fahrtenbuch: Ablagefeld wie bei Konten (ein-/ausblendbar). Tank-, Lade- und Werkstattbelege (PDF/Fotos, auch Ordner) ablegen → KI liest aus → Eintrag Tanken/Laden/Ausgabe wird für das gewählte Fahrzeug angelegt, Beleg angehängt und – wenn vorhanden – mit der passenden Kontobuchung (Betrag + Datum ±4 Tage) verknüpft.
- Fenster „Ungespeicherte Änderungen“: Text oben, die drei Knöpfe gleich breit in einer Zeile.

## v0.48.2
- iPhone (iOS 26, Web-App vom Home-Bildschirm): untere Leiste saß auf kurzen Seiten (z. B. Fahrtenbuch, Artikel) zu hoch. Die Seite ist jetzt immer mindestens bildschirmhoch, damit die Leiste überall gleich weit unten sitzt.

## v0.48.1
- Symbolleiste „Nur Symbole“: Symbole gleichmäßig über die ganze Leiste verteilt und zentriert.

## v0.48.0
- Einstellungen › Darstellung: Symbolleiste unten am Handy wählbar „Symbole & Text“ oder „Nur Symbole“ (kompakter).
- Kachel-Überschriften brechen am Handy sauber um statt über den Rand zu laufen; Firmenauswertung: Kleinunternehmergrenze als eigene Zeile über dem Balken.

## v0.47.2
- Dokumente (Kachelansicht) im Handy-Modus: schwebende Leiste „Drucken / Original öffnen“ über den Vorschaubildern entfernt – Drucken bleibt in der Aktionsleiste darunter.

## v0.47.1
- Backup: Passwortfelder mit Auge zum Anzeigen/Verbergen (beide Felder gemeinsam, zum Vergleichen) und Hinweis „✓ Passwörter stimmen überein“. Auch beim Importieren eines verschlüsselten Backups.

## v0.47.0
- Backup: neue „Gefahrenzone“ mit „Alle Daten löschen“. Warnung mit Übersicht, was gelöscht wird, Bestätigungs-Häkchen und Eingabe von „ALLES LÖSCHEN“ (genau so, in Großbuchstaben). Löscht Dokumente, Dateien, Umsätze und alle gespeicherten Daten/Einstellungen auf diesem Gerät und lädt die App neu.

## v0.46.4
- Fahrtenbuch: eigene Fahrzeug-Symbole über „＋“ – Emoji eintippen oder Bild hochladen. Eigene Symbole bleiben für alle Fahrzeuge verfügbar und lassen sich über „×“ wieder löschen.

## v0.46.3
- Fahrtenbuch: Button „＋ Fahrzeug“ ist jetzt nur ein „＋“ (Tooltip „Fahrzeug hinzufügen“).

## v0.46.2
- Fahrtenbuch: jede Zeile hat die Aktionsleiste wie bei den Konten (Bearbeiten, Beleg drucken, Beleg teilen, Löschen). Klick auf einen Eintrag mit Beleg öffnet die Beleg-Vorschau direkt darunter (ohne Beleg öffnet sich der Eintrag zum Bearbeiten). Fehlender km-Stand wird nicht mehr als „—“ angezeigt.

## v0.46.1
- Fahrtenbuch: Fahrzeuge mit Akku bekommen „Akku nutzbar (kWh)“ und „Ladeleistung AC/DC (kW)“, Verbrenner/Hybride das Tankvolumen. Die Fahrzeugkarte zeigt Tank, Akku, Ladeleistung und die geschätzte Reichweite.
- Beim Laden/Tanken: Füllstand-Balken (Anteil vom Akku/Tank), Warnung bei mehr als möglich und geschätzte Ladedauer (AC oder DC wählbar).

## v0.46.0
- Fahrtenbuch: Hybrid- und Plug-in-Hybrid-Fahrzeuge (Benzin/Diesel). Plug-in und Elektro bekommen „⚡ Laden“ (kWh), der Verbrauch wird getrennt in l/100 km und kWh/100 km berechnet.
- 📍 Standort: „In der Nähe“ zeigt Tankstellen (Österreich mit aktuellen Preisen vom E-Control Spritpreisrechner, sonst OpenStreetMap) bzw. Ladestationen (OpenStreetMap). Auswahl übernimmt Name, Adresse und Preis. Bei Fahrten setzt 📍 den aktuellen Ort bei Von/Nach ein. Neue Serverfunktion `api/nearby.js`.
- Tanken/Laden/Ausgaben mit Konten verknüpfen: nicht buchen, neu buchen oder mit einer vorhandenen Kontobuchung verknüpfen (Vorschläge nach Betrag und Datum).
- Belege direkt im Fahrtenbuch scannen oder hochladen: die KI füllt Betrag, Tankstelle, Datum und – wenn erkennbar – Liter und Preis aus; der Beleg wird auch an die Kontobuchung gehängt.

## v0.45.0
- Analyse: Konto-Auswahl bricht jetzt in mehrere Zeilen um (statt seitlich zu scrollen).
- Vermögen: einzelne Konten (und „Weitere Werte“) auswählbar – Verlauf, Verteilung und Konten rechnen nur mit der Auswahl.
- Neuer Reiter **„Firmenauswertung“**: Fakturiert, Eingegangen, Offen/Überfällig, Ø Zahlungsdauer & Pünktlichkeit, vereinfachte Einnahmen-Ausgaben-Rechnung (bezahlte Rechnungen − Dokumente „Firma“ − Kilometergeld), Umsatz pro Monat mit Kleinunternehmergrenze, Kunden, Leistungen & Artikel, Angebote (Annahmequote), Mahnwesen (versendet, Gebühren, überfällige Rechnungen). Jahr oder Gesamt.
- Neuer Reiter **„Fahrtenbuch“** (Stil Drivvo): mehrere Fahrzeuge, Tanken (Preis/Liter/Gesamt rechnen sich gegenseitig, Volltank-Verbrauch), Ausgaben (Service, Reifen, Versicherung, Pickerl, Vignette …), Fahrten geschäftlich/privat/Arbeitsweg mit km-Ständen, Zweck und Kilometergeld (0,50 €/km, einstellbar), Erinnerungen nach Datum oder km-Stand, Berichte (Kosten/Monat, Verbrauchsverlauf, Kosten nach Art, km-Aufteilung) und CSV-Export fürs Finanzamt. Tanken/Ausgaben optional direkt im Konto buchen.

## v0.44.0
- Reiter „Barausgabe“ heißt jetzt **„Ausgabe“** und wurde neu gebaut (Vorbild Bonsy): Beleg scannen, QR-Code oder Foto/PDF; Firma, Gesamtbetrag, Datum, Konto (alle Konten), Kategorie und **einzelne Positionen mit Warengruppe** (z. B. 1× Red Bull 0,95 € · Getränke). Die KI füllt alles nach dem Scannen selbst aus; Datum nur, wenn es heute oder in der Vergangenheit liegt. Differenz zwischen Positionen und Gesamtbetrag wird angezeigt.
- **QR-Scanner für Kassenbons**: österreichischer Registrierkassen-QR (RKSV) und deutscher TSE-QR – übernimmt Betrag, Datum, Beleg-Nr. und Steuersätze. Händlername steht nicht im QR; wird gemerkt, sobald die Kasse einmal zugeordnet wurde.
- Neuer Reiter **„Analyse“** (Vorbild Finanzguru): Monat/Jahr/12 Monate, Kontofilter, Einnahmen/Ausgaben/Saldo/Sparquote mit Vergleich zur Vorperiode, In & Out-Verlauf, Kategorien mit Drilldown (Verlauf, Händler, Buchungen), Top-Händler, größte Ausgaben, Wochentage, Einkaufs-Positionen aus Belegen.
- Neuer Reiter **„Vermögen“**: Nettovermögen mit Verlauf (6 M/1 J/3 J/Alles), Verteilung nach Kontoart, Veränderung pro Monat, Konten mit Zuwachs und manuelle Vermögenswerte/Schulden (Immobilie, Auto, Gold, Kredit …).
- KI-Auslesen (api/analyze.js) liefert bei Kassenbons zusätzlich Händler, Kaufdatum und Positionen.

## v0.43.2
- Einstellungen → Seitenleiste: „Backup“ zeigt korrekt „unter Einstellungen“ (Einstellungen ist jetzt als Elternreiter wählbar)
- „Einstellungen“, „Übersicht“ und Reiter mit Unterreitern zeigen fest „Hauptreiter“; Ebenen-Auswahl breiter, Text nicht mehr abgeschnitten

## v0.43.1
- Seitenleiste: Unterreiter (z. B. „Backup“, „Umtauschfrist“) im gleichen Stil wie die Hauptreiter – Symbol nicht mehr grau, passende Größe, aktiver Unterreiter als Kachel in Akzentfarbe

## v0.43.0
- Optionale App-Sperre (Standard: aus): Einstellungen → App-Sperre → „Passwort beim Öffnen verlangen“
  - Anmeldebildschirm beim Start, falsches Passwort wird abgewiesen; „Jetzt sperren“ und „Passwort ändern“; Ausschalten nur mit aktuellem Passwort
  - gespeichert wird nur ein PBKDF2-SHA-256-Prüfwert mit Salt, nicht das Passwort; wird nicht ins Backup übernommen

## v0.42.0
- Backup verschlüsselt: AES-256-GCM, Schlüssel per PBKDF2 mit SHA-256 (310.000 Durchläufe, zufälliges Salt) aus einem Passwort (mind. 8 Zeichen, doppelte Eingabe)
- Import erkennt verschlüsselte Backups und fragt nach dem Passwort; alte unverschlüsselte Backups lassen sich weiter importieren
- Unverschlüsselter Export nur noch mit ausdrücklichem Haken; Dateiname jetzt „findocu-backup-…“

## v0.41.1
- Backup aus den Einstellungen in einen eigenen Reiter „Backup“ verschoben – in der Seitenleiste direkt unter „Einstellungen“ (am Handy über Einstellungen → Seitenleiste einblendbar)

## v0.41.0
- Kontobuchungen: Klick auf eine Buchung mit Beleg klappt die Beleg-Vorschau darunter auf (wie bei Dokumente, mit Seitenanzahl, Drucken, „Original öffnen“); nochmal klicken schließt sie
- Kontobuchungen: Aktionsleiste hinter dem Betrag – Bearbeiten, Beleg drucken, Beleg teilen, Buchung löschen (Drucken/Teilen nur mit Beleg)
- Buchungs-Details: Beschriftungen und Werte in einheitlicher, größerer Schrift
- Kategorie-Kacheln in den Buchungen 1 px kleiner, Symbol mittig

## v0.40.1
- Seitenleiste (iPad/Desktop) größer und im Verhältnis zum Inhalt: breiter, größere Schrift und Symbole, größere Konto-/Kategorie-Einträge
- Buchung mit angehängtem Beleg (📎): Klick auf die Zeile öffnet direkt den Beleg; Bearbeiten über den Stift in der Zeile
- Dokument-Fenster: statt „PDF-Dokument“ nur noch der Dateiname
- Buchungstabelle am Desktop: einheitliche Schriftgrößen

## v0.40.0
- **Neues Standard-Design** (vorher Testmodus „Finanz-App-Stil“) auf allen Geräten: Handy, iPad und Desktop
  - tiefschwarz bzw. weiß, Mint als Akzent, Schrift „Outfit“, große Titel, flache stark gerundete Karten, Linien-Symbole
  - Handy: schwebende Leiste; iPad/Desktop: Seitenleiste mit Linien-Symbolen, aktiver Reiter als Kachel in Mint
- Einstellungen im neuen Design: große Bereichstitel, Zeilen mit Trennlinien, Mint-Schalter und -Auswahlkacheln
- Testmodus und Auswahl „Handy-Design“ entfernt (Links mit ?ios / ?fg haben keine Wirkung mehr)

## v0.39.4
- Scannen repariert: Der Scanner öffnete sich bei „Barausgabe / Buchung erfassen“ (Fenster) hinter dem Fenster und war nicht bedienbar – liegt jetzt immer ganz oben
- Scannen öffnet die Kamera jetzt direkt beim Antippen (＋-Menü, Schnellzugriff, Barausgabe, Buchung, Beleg an Buchung) und geht danach gleich zum Zuschneiden
- Kann ein Foto am Handy nicht verarbeitet werden, wird angeboten, es unverändert als Beleg zu übernehmen; Fotos werden für die Verarbeitung etwas stärker verkleinert (weniger Speicher)

## v0.39.3
- Finanz-App-Stil: Symbole oben rechts scrollen mit der Seite mit (überdecken beim Scrollen keine Inhalte mehr)
- Finanz-App-Stil: Abstand zwischen Datumsbalken und Buchungen, Datum in normaler Schreibweise

## v0.39.2
- Fixkosten & Abos (Handy): lange Texte (Vertragsnummer, Kündigungsfrist) brechen jetzt um, statt die Seite zu verbreitern – Karten wieder in voller Breite

## v0.39.1
- Finanz-App-Stil (Testmodus): Schriftgrößen nach den Vorbild-Screenshots vergrößert – Seitentitel 46 px, Kartentitel 24 px, Listentitel & Beträge 20 px, Untertitel 17 px, Chips/Buttons 17 px, Grundschrift 17 px, Saldo 44 px, Leiste 13 px
- Saldo-Kacheln im Finanz-App-Stil zweispaltig (Beträge nicht mehr abgeschnitten), größere Kategorie-Einträge und Symbol-Kacheln

## v0.39.0
- Zweites Handy-Testdesign „Finanz-App-Stil“ (Testmodus, standardmäßig aus): Einstellungen → Darstellung → Handy-Design „Finanz-App-Stil“ oder Link `?fg=1` (aus: `?fg=0`)
  - tiefschwarzer Hintergrund (bzw. weiß im Tagmodus), Mint als Akzentfarbe, grüne Plus-Beträge
  - geometrische Schrift „Outfit“, sehr große Seitentitel, Symbole oben rechts in Mint ohne Rahmen
  - stark gerundete flache Karten, Hero-Karte ohne Farbverlauf, große Listenschrift, Logos in weißen Kacheln, graue Tagesbalken
  - schwebende dunkle Leiste, aktiver Reiter als dunkle Kapsel mit Mint-Symbol; ＋-Button in Mint
- Einstellung „Handy-Design“ jetzt mit Auswahl Standard / iOS-Stil / Finanz-App-Stil
- Geplant: eigener Reiter „Analysen“

## v0.38.0
- Neues Handy-Design im iOS-Stil als **Testmodus** (standardmäßig aus): Einstellungen → Darstellung → „📱 Neues Handy-Design (Test)“ oder Link mit `?ios=1` (aus: `?ios=0`)
  - schwebende Glas-Tableiste mit Linien-Symbolen und hervorgehobenem aktiven Reiter
  - iOS-Systemschrift, große Titel, weichere Karten ohne Ränder, Kapsel-Chips, iOS-Segmentsteuerung, gefüllte Eingabe-/Suchfelder
  - Dokumente: Aktionen waagrecht unter dem Eintrag
- Betrifft nur Bildschirme unter 768 px – iPad/Desktop unverändert

## v0.37.1
- Handy: Ein-/Ausblenden der unteren Leiste wieder entfernt (Griff & Wischen); seitliches Scrollen bleibt

## v0.37.0
- Handy: untere Leiste seitlich scrollbar (beliebig viele Reiter), gleich große Beschriftungen (Fehler bei Unterreitern wie „Umtauschfrist“ behoben)
- Handy: Leiste ein-/ausblendbar – Griff mit Pfeil über der Leiste antippen oder nach unten/oben wischen; Zustand wird gemerkt, ＋-Button rutscht mit

## v0.36.1
- Verträge: inaktive/gekündigte Verträge nicht mehr per Transparenz abgeblendet (wirkte verschwommen), sondern gestochen scharf in grauer Schrift mit grauem Vorschaubild

## v0.36.0
- Verträge: Vorschau der verknüpften Dokumente direkt in der Liste – Klick auf Titel, Vorschaubild oder Auge klappt sie auf/zu (wie bei Dokumente, mit Drucken & „Original öffnen“)
- Verträge: Status „Aktiv“ / „Inaktiv“ per Klick auf die Pill; inaktive Verträge werden abgeblendet und zählen nicht zu Kosten und Kündigungs-Hinweisen

## v0.35.0
- Verträge: Ablagefeld (Dateien & Ordner, ein-/ausblendbar über „📥 Ablagefeld“) – Dateien werden als Dokumente gespeichert und ausgelesen; erkennt die KI einen Vertrag, wird er automatisch in der Vertragsliste angelegt (mit Dokument verknüpft)
- Fortschrittsanzeige auch in Verträge

## v0.34.0
- Universal-Ablage mit KI-Erkennung: PDFs/Fotos werden ausgelesen; erkennt die KI einen Kontoauszug (Dokumenttyp „Kontoauszug“), werden die Umsätze automatisch zum Import vorbereitet – das Dokument bleibt zusätzlich in Dokumente
- Kontoauszug-PDFs/-Fotos aus der Ablage werden im Import-Fenster automatisch mit Claude ausgelesen (kein extra Klick)

## v0.33.0
- Neues Übersicht-Widget „Universal-Ablage“: beliebige Dateien und ganze Ordner ablegen – wird automatisch erkannt und einsortiert:
  PDFs/Fotos → Dokumente (KI liest aus), CSV/CAMT/MT940/OFX/Excel und PDFs mit „Konto/Auszug/Umsatz“ im Namen → Kontoauszug-Import (nacheinander), .vcf → Kunden-Import; Rest wird übersprungen
- Zusammenfassung „Erkannt: …“ im Widget, Fortschritt für Dokumente und Kontoauszüge
- Konten: Ablagefeld direkt unter der Leiste (vor den Kontokarten)

## v0.32.2
- Konten: „📥 Ablagefeld“ an erster Stelle der Zeile; bei Kunden standardmäßig ebenfalls vorne

## v0.32.1
- Konten: Ablagefeld-Schalter „📥 Ablagefeld“ in der Zeile neben „Alle Konten“ / „Alle Monate“
- Kunden: Ablagefeld-Schalter in der Kontaktarten-Leiste (wie bei Dokumenten)

## v0.32.0
- Seitenleiste: laufender Import wird beim jeweiligen Reiter angezeigt (Lade-Kreis + Anzahl, Fortschrittszeile unter dem Reiter)
- Konten: Ablagefeld für Kontoauszüge (CSV, PDF, CAMT, MT940, Excel …) inkl. Ordner – mehrere Dateien werden nacheinander importiert, mit Fortschritt
- Kunden: Ablagefeld für vCard-Dateien (.vcf) inkl. Ordner
- Kunden: Kontaktarten-Leiste seitlich verschiebbar und ein-/ausblendbar (⇄), gleiche Funktion wie bei den Dokumenten
- Ablagefeld, Fortschrittsanzeige und anpassbare Leiste als gemeinsame Bausteine

## v0.31.1
- Ablagefeld: ganze Ordner (inkl. Unterordner) hineinziehen oder über „Ordner wählen“ auswählen – PDFs und Fotos darin werden importiert, andere Dateien übersprungen

## v0.31.0
- Dokumente: Fortschrittsanzeige beim Import – „Datei x von y wird hochgeladen …“, danach „KI liest n Dokumente aus …“ mit Dateinamen, Balken und Zähler
- Ablagefeld zeigt während des Imports einen Lade-Kreis

## v0.30.2
- Mahnungen: Auswahlfeld durch Button „＋ Mahnung“ ersetzt – öffnet eine Liste der offenen/überfälligen Rechnungen (Hinweis, wenn keine offen ist)
- Buttons „Rechnungen“ und ⚙︎ in Mahnungen in derselben Größe wie bei den Rechnungen

## v0.30.1
- Filterleiste bearbeiten: schlichtes Linien-Augensymbol (wie „Beträge ausblenden“), durchgestrichen bei ausgeblendeten Feldern

## v0.30.0
- Dokumente: Filterleiste anpassbar – über ⚙︎ Bearbeiten-Modus, Felder am Griff ⠿ seitlich verschieben und mit 👁 ein-/ausblenden (wird gemerkt)
- Auswahlfelder in der Filterleiste maximal 170 px breit (z. B. „Alle Tags“)

## v0.29.1
- Dokumente: Jahresfilter aufsteigend sortiert (ältestes oben)
- Neuer Monatsfilter (Jänner–Dezember), mit dem Jahr kombinierbar; aktive Filter blau hervorgehoben; CSV-Dateiname enthält Monat

## v0.29.0
- Dokumente: Ablagefeld zum Hineinziehen mehrerer Dateien (PDF & Fotos) unter den Filtern, ca. ¼ Breite; antippen öffnet die Dateiauswahl
- Ein-/ausblendbar über ✕ im Feld bzw. den Filter-Chip „📥 Ablagefeld“ (wird gemerkt)

## v0.28.1
- Dokument-Kategorien unter den Gruppen-Überschriften eingerückt (Seitenleiste und Dokumente), Untergruppen zusätzlich

## v0.28.0
- Dokument-Gruppen: Untergruppen (eine Ebene) – „＋ Untergruppe“ je Hauptgruppe, Zuordnung über „gehört zu“; Anzeige eingerückt in Seitenleiste und Dokumenten
- Neue Gruppe „Firma“ mit Kategorie „Ausgangsrechnung“; Rechnungsbelege landen dort (bestehende werden einmalig verschoben)
- Button „＋ Gruppe / Überschrift“ heißt jetzt „＋ Gruppe“

## v0.27.4
- Status-Menü: neue Option „Überfällig“ (setzt eine Rechnung manuell auf überfällig, unabhängig vom Fälligkeitsdatum); „Offen“ hebt das wieder auf
- Beleg-Kachel in der Rechnung: Klick bzw. „Ansehen“ öffnet direkt das Rechnungs-PDF, „Dokument“ öffnet den Eintrag in Dokumente

## v0.27.3
- Rechnung (bezahlt, mit Buchung): angehängter Beleg wird im Bereich „Zahlung“ angezeigt und öffnet das Dokument
- Fehlt der Beleg (z. B. bei älteren Buchungen): Button „Rechnung als Beleg an die Buchung hängen“
- Zahlungseingang öffnet immer zuerst „Vorhandene Buchung“

## v0.27.2
- Button „Als bezahlt markieren“ in der Rechnungsliste entfernt – geht jetzt nur noch über die Status-Pill
- Häkchen im Status-Menü entfernt (aktueller Status bleibt farbig hervorgehoben)

## v0.27.1
- Status-Pill sitzt jetzt am Ende der Zeile (vor „…“), Menü öffnet nach links
- Mahnungen: Status-Pill mit Menü (Bezahlt, Offen, Buchung zuordnen, Stornieren) bei „Zu mahnen“ und im Mahnverlauf (letzte Mahnung je Rechnung)

## v0.27.0
- Rechnungsliste: Status-Pill ist jetzt antippbar – Menü mit Bezahlt, Offen, Buchung zuordnen und Stornieren
- Separater „Offen“-Link und „Buchung zuordnen“-Button entfernt, Stornieren aus dem „…“-Menü in die Pill verschoben
- Aufklappmenüs schließen sich bei Klick daneben bzw. nach Auswahl

## v0.26.3
- Mahnungen → Mahnverlauf: „🔗 Buchung zuordnen“ für bezahlte Rechnungen ohne Kontobuchung, „Als bezahlt markieren“ für noch offene

## v0.26.2
- Bereits bezahlte Rechnungen ohne Kontobuchung lassen sich nachträglich verknüpfen: Button „🔗 Buchung zuordnen“ in der Liste bzw. „Kontobuchung nachträglich zuordnen“ in der Rechnung
- Beim nachträglichen Anlegen einer neuen Buchung wird das bisherige Bezahlt-Datum übernommen

## v0.26.1
- Zahlungseingang: Buchungen lassen sich zuverlässiger auswählen (ganze Zeile antippbar, deutliche Markierung)
- Neue Leiste unten im Fenster zeigt die gewählte Buchung und den Button „Verknüpfen & als bezahlt buchen“
- Doppelklick auf eine Buchung verknüpft und bucht sofort

## v0.26.0

- **Rechnung/Mahnung als Beleg an der Buchung**: Wird eine Rechnung mit einer Kontobuchung verknüpft oder ihr Zahlungseingang gebucht (Rechnungen, Mahnungen, beim Ausstellen), legt FinDocu das Rechnungs-PDF – inkl. aller Mahnungen als weitere Seiten – unter Dokumente ab (Firma, Einnahme, bezahlt) und hängt es als Beleg an die Buchung. Wird die Zahlung zurückgenommen, wird der Beleg von der Buchung gelöst.
- **Gescannte/hochgeladene Dokumente automatisch an Buchungen hängen**: Nach dem Auslesen sucht FinDocu die passende Kontobuchung (gleicher Betrag – Brutto, Auszahlung oder Netto –, Datum passend, Absender/IBAN/Zahlungsreferenz) und hängt den Beleg an. Gilt jetzt für Ausgaben **und** Einnahmen (z. B. Lohnzettel ↔ Gehaltseingang), auch beim späteren Umsatz-Import.

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
