// v0.99.90: Persönliche Standard-Einstellungen (Optik & Struktur, ohne Daten).
// Werden beim ersten Start bzw. nach „Alle Daten löschen“ übernommen – nur für Schlüssel, die noch nicht gesetzt sind.
// Inhalt kommt aus „Einstellungen exportieren“ (Backup-Reiter) → src/defaults.json.
import DEF from "./defaults.json";
try {
  const st = DEF && DEF.store;
  if (typeof localStorage !== "undefined" && st && typeof st === "object" && !localStorage.getItem("findocuDefaultsApplied")) {
    for (const [k, v] of Object.entries(st)) if (typeof v === "string" && localStorage.getItem(k) == null) localStorage.setItem(k, v);
    localStorage.setItem("findocuDefaultsApplied", "1");
  }
} catch {}
export default DEF;
