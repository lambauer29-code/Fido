// Vercel Function: Anmeldung bei OneDrive / Google Drive für die Cloud-Synchronisierung.
// Tauscht den Anmelde-Code gegen Tokens – das Client-Secret bleibt am Server.
// Dropbox braucht kein Secret (läuft direkt im Browser), hier wird nur der App-Key ausgeliefert.
//
// Env-Variablen in Vercel (nur für die Anbieter, die du nutzen willst):
//   MS_CLIENT_ID, MS_CLIENT_SECRET          – OneDrive (Azure / Entra „App-Registrierungen“)
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  – Google Drive (Google Cloud Console → OAuth-Client „Webanwendung“)
//   DROPBOX_APP_KEY                         – Dropbox (App Console, Zugriff „App folder“)
//   APP_TOKEN                               – wie bei den anderen Funktionen

const EP = {
  onedrive: { url: "https://login.microsoftonline.com/common/oauth2/v2.0/token", id: "MS_CLIENT_ID", secret: "MS_CLIENT_SECRET", scope: "offline_access Files.ReadWrite.AppFolder" },
  gdrive: { url: "https://oauth2.googleapis.com/token", id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" }
};

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const token = process.env.APP_TOKEN;
  if (token && req.headers["x-app-token"] !== token) return res.status(401).json({ error: "App-Token fehlt oder ist falsch (Einstellungen → Verbindung)" });
  const env = process.env;
  if (req.method === "GET") {
    return res.status(200).json({
      onedrive: env.MS_CLIENT_ID && env.MS_CLIENT_SECRET ? env.MS_CLIENT_ID : null,
      gdrive: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? env.GOOGLE_CLIENT_ID : null,
      dropbox: env.DROPBOX_APP_KEY || null,
      mega: true
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Nur GET/POST" });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const ep = EP[b.provider];
  if (!ep || !env[ep.id] || !env[ep.secret]) return res.status(400).json({ error: "Anbieter nicht eingerichtet" });
  const form = new URLSearchParams({ client_id: env[ep.id], client_secret: env[ep.secret] });
  if (b.grant === "code") {
    if (!b.code || !b.verifier || !b.redirect_uri) return res.status(400).json({ error: "Code fehlt" });
    form.set("grant_type", "authorization_code"); form.set("code", b.code); form.set("code_verifier", b.verifier); form.set("redirect_uri", b.redirect_uri);
  } else if (b.grant === "refresh") {
    if (!b.refresh_token) return res.status(400).json({ error: "Refresh-Token fehlt" });
    form.set("grant_type", "refresh_token"); form.set("refresh_token", b.refresh_token);
  } else return res.status(400).json({ error: "grant fehlt" });
  if (ep.scope) form.set("scope", ep.scope);
  try {
    const r = await fetch(ep.url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ error: j.error || "Token-Fehler", error_description: j.error_description || "" });
    return res.status(200).json({ access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in });
  } catch (e) {
    return res.status(502).json({ error: "Anbieter nicht erreichbar", error_description: String(e.message || e) });
  }
}
