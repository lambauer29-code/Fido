// Vercel Function: Kalender-Abo für Apple Kalender & Co.
// POST  → die App lädt ihre Fristen als .ics hoch (in Vercel Blob gespeichert)
// GET   → Apple Kalender ruft webcal://…/api/cal?k=<geheimer Schlüssel> regelmäßig ab
// DELETE→ Abo löschen
import { put, get, del } from "@vercel/blob";

// Blob-Speicher können „private“ oder „public“ sein – beides unterstützen
async function readBlob(path) {
  for (const access of ["private", "public"]) {
    try {
      const r = await get(path, { access, useCache: false });
      if (r && r.statusCode === 200) return await new Response(r.stream).text();
    } catch {}
  }
  return null;
}
async function writeBlob(path, ics) {
  const opts = { addRandomSuffix: false, allowOverwrite: true, contentType: "text/calendar; charset=utf-8", cacheControlMaxAge: 60 };
  try { return await put(path, ics, { ...opts, access: "private" }); }
  catch (e) { return await put(path, ics, { ...opts, access: "public" }); }
}

export default async function handler(req, res) {
  const key = String(req.query?.k || req.body?.k || "");
  if (!/^[a-z0-9]{24,64}$/i.test(key)) return res.status(400).send("Ungültiger Schlüssel");
  const path = `fido-calendar/${key}.ics`;
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

  if (req.method === "GET" || req.method === "HEAD") {
    if (!hasBlob) return res.status(501).send("Kein Blob-Speicher verbunden");
    const txt = await readBlob(path);
    if (txt) {
      res.setHeader("content-type", "text/calendar; charset=utf-8");
      res.setHeader("content-disposition", 'inline; filename="findocu-fristen.ics"');
      res.setHeader("cache-control", "no-cache, max-age=0");
      return res.status(200).send(txt);
    }
    return res.status(404).send("Kalender nicht gefunden");
  }

  const token = process.env.APP_TOKEN;
  if (token && req.headers["x-app-token"] !== token) return res.status(401).json({ error: "App-Token fehlt oder ist falsch" });
  if (!hasBlob) return res.status(501).json({ error: "Kein Blob-Speicher verbunden – in Vercel unter Storage › Blob einen Speicher anlegen und mit dem Projekt verbinden, dann neu deployen." });

  if (req.method === "POST") {
    const ics = String(req.body?.ics || "");
    if (!ics.startsWith("BEGIN:VCALENDAR") || ics.length > 3_000_000) return res.status(400).json({ error: "Ungültiger Kalender" });
    try { await writeBlob(path, ics); }
    catch (e) { return res.status(500).json({ error: "Speichern fehlgeschlagen: " + (e.message || e) }); }
    return res.status(200).json({ ok: true, at: new Date().toISOString() });
  }
  if (req.method === "DELETE") {
    try { await del(path); } catch {}
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: "Methode nicht erlaubt" });
}
