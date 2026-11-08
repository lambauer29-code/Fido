# FinDocu – Finanzen und Dokumente (PWA)

Dokumente (PDF/Fotos) hochladen → Claude sortiert in Kategorien, vergibt Tags, liest Absender, Datum, **Beträge** (Brutto/Netto/USt) und **Fristen** aus und liefert den Volltext für die Suche.

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
