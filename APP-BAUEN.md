# FinDocu als Mac-App bauen (Tauri 2)

Die React-App bleibt gleich. Tauri verpackt sie in eine echte App mit eigenem Icon im Dock / am Home-Bildschirm.
Die Web-Version auf Vercel läuft unverändert weiter – die App nutzt deren Server-Funktionen (KI-Scan, Anmeldung bei Cloud-Anbietern).

## Was schon vorbereitet ist
- `src-tauri/` – App-Projekt (Rust): Fenster, Icons für alle Systeme, Rechte, Kamera-/Standort-Texte für macOS und iOS
- `src/platform.js` – erkennt die App und passt an:
  - `/api/...` geht an `https://fido-five.vercel.app` (andere Adresse: Umgebungsvariable `VITE_API_BASE` beim Bauen)
  - Exporte & Backups öffnen den Dialog „Sichern unter …“
  - PDFs/Belege öffnen sich in Vorschau bzw. dem Standardprogramm, Webseiten im Browser
  - Cloud-Anmeldung (OneDrive/Google/Dropbox) im System-Browser, Rückkehr über `findocu://oauth`
- `.github/workflows/app-build.yml` – baut bei jeder neuen Version die Mac- und Windows-App auf GitHub und veröffentlicht sie als Release; die installierte App aktualisiert sich daraus selbst
- `npm`-Befehle: `app:dev`, `app:build`, `app:build:mac`, `ios:init`, `ios:dev`, `ios:build`

## Weg A – GitHub baut die App, sie aktualisiert sich selbst (empfohlen)

### Einmalig: Update-Schlüssel als Secret hinterlegen
Jedes Update ist mit einem eigenen Schlüssel signiert. Die App installiert nur Updates mit dieser Signatur.
1. GitHub → Repo **Fido** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
2. Name: `TAURI_SIGNING_PRIVATE_KEY` – Wert: den kompletten Inhalt der Datei `findocu-updater.key` (eine lange Zeile) einfügen → **Add secret**
3. Die Datei `findocu-updater.key` danach an einem sicheren Ort aufbewahren (z. B. Passwort-Manager). **Nie ins Repo hochladen.**
   Geht sie verloren, können bestehende Apps keine Updates mehr annehmen – dann einmal neu installieren.

### Ab jetzt bei jedem Update
1. Inhalt von `dokumente.zip` wie gewohnt hochladen.
2. Hat sich die Version erhöht (`package.json`), baut GitHub automatisch die Mac-App (ca. 15–25 Min.) und legt unter **Releases** „FinDocu vX.Y.Z“ an.
3. Die installierte App meldet beim nächsten Start (oder spätestens nach 6 Stunden) **„FinDocu X.Y.Z ist da · Jetzt aktualisieren“** → ein Klick, App startet neu.
   Manuell: Einstellungen → Verbindung → „Nach Updates suchen“.

### Erstinstallation am Mac
1. GitHub → Repo → **Releases** → neuestes Release → `FinDocu_…_universal.dmg` laden → FinDocu in „Programme“ ziehen.
2. Die App ist nicht von Apple signiert. Beim ersten Start daher einmal im Terminal:
   `xattr -cr /Applications/FinDocu.app`
   danach normal öffnen. Spätere Updates brauchen das nicht mehr.

## Weg B – am eigenen Mac bauen und testen
Einmalig installieren:
- Xcode-Werkzeuge: `xcode-select --install`
- Rust: `curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh` (danach Terminal neu öffnen)
- Für Intel + Apple Silicon: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`

Im Projektordner:
- `npm install`
- `npm run app:dev` → App startet mit Live-Neuladen
- `npm run app:build:mac` → fertige App + `.dmg` in `src-tauri/target/universal-apple-darwin/release/bundle/`

## iPhone / iPad
Zusätzlich nötig: **volles Xcode** aus dem App Store (einmal starten, Lizenz bestätigen) und
`rustup target add aarch64-apple-ios aarch64-apple-ios-sim` sowie `brew install cocoapods`.

1. `npm run ios:init` – legt `src-tauri/gen/apple` an (diesen Ordner danach ins Repo übernehmen)
2. In Xcode einmal mit der Apple-ID anmelden (Xcode → Settings → Accounts)
3. iPhone per Kabel anschließen, Entwicklermodus am iPhone einschalten
4. `npm run ios:dev` → Team auswählen, App wird aufs iPhone installiert
- Mit kostenloser Apple-ID läuft die App 7 Tage, dann erneut `npm run ios:dev`.
- Dauerhaft / TestFlight: Apple Developer Program (ca. 99 $/Jahr), dann `npm run ios:build`.

## Daten in die App bringen
Die App hat ihren eigenen Speicher (getrennt von Safari/Chrome). Zwei Wege:
- **Cloud-Synchronisierung** (Backup-Reiter): in der App denselben Anbieter + dasselbe Sync-Passwort → „Cloud hat Vorrang“
- **Backup**: in der Web-Version Backup speichern → in der App „Backup wiederherstellen“
App-Token unter Einstellungen → Verbindung auch in der App eintragen (für KI-Scan und Cloud-Anmeldung).

## Noch am echten Gerät zu prüfen
- Drucken (Rechnungen, Listen) im App-Fenster
- Teilen-Menü (in der App ersetzt durch „Sichern unter …“)
- Kamera-Scan (macOS/iOS fragen beim ersten Mal nach Erlaubnis)
- Rückkehr nach der Cloud-Anmeldung über `findocu://` (besonders am iPhone)

## Mac-App und Browser synchron halten
Beide nutzen dieselbe Cloud-Synchronisierung (Backup-Reiter → „☁️ Cloud-Synchronisierung“):
1. In der Mac-App: Anbieter wählen (z. B. MEGA), Sync-Passwort festlegen.
2. Im Browser (iPhone, Mac …): denselben Anbieter wählen, **dasselbe** Sync-Passwort → „Cloud hat Vorrang“.
Danach gleichen sich alle Geräte beim Öffnen, alle 90 Sekunden und beim Wechsel in eine andere App ab.
