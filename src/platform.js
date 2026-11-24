/* ============================================================
   Plattform: Browser (PWA) oder native App (Tauri 2)
   In der App gibt es keinen eigenen Server – Aufrufe von /api/... gehen an
   die FinDocu-Installation auf Vercel (über das HTTP-Plugin, ohne Browser-CORS).
   ============================================================ */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
// Adresse der eigenen Vercel-Installation (für Server-Funktionen und die Anmelde-Rückkehr)
export const API_BASE = import.meta.env.VITE_API_BASE || "https://fido-five.vercel.app";

let httpFetch = null;
export async function installPlatform() {
  if (!isTauri) return;
  document.documentElement.classList.add("tauri");
  const { fetch: tf } = await import("@tauri-apps/plugin-http");
  httpFetch = tf;
  const orig = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.startsWith("/api/")) return httpFetch(API_BASE + url, init);
    return orig(input, init);
  };
  // Downloads (<a download>): im WebView gibt es keinen Download-Ordner → „Sichern unter …“-Dialog
  const aClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute("download") && /^(blob|data):/.test(this.href)) {
      const name = this.getAttribute("download") || "FinDocu-Datei";
      fetch(this.href).then((r) => r.blob()).then((b) => saveFile(b, name)).catch((e) => alert("Speichern fehlgeschlagen: " + e.message));
      return;
    }
    return aClick.call(this);
  };
  // Neue Fenster: Webseiten im System-Browser, PDFs/Bilder mit dem Standardprogramm (Vorschau …)
  const dummy = { closed: false, close() {}, focus() {}, location: {}, document: null };
  window.open = (url) => {
    if (!url) return null;
    const u = String(url);
    if (/^(https?:|mailto:|tel:)/.test(u)) { openExternal(u); return dummy; }
    if (/^(blob|data):/.test(u)) { fetch(u).then((r) => r.blob()).then(openBlob).catch((e) => alert("Öffnen fehlgeschlagen: " + e.message)); return dummy; }
    return null;
  };
}

const EXT = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "text/csv": "csv", "application/json": "json", "text/calendar": "ics" };
// Datei speichern: System-Dialog „Sichern unter …“
export async function saveFile(blob, name) {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: name });
  if (!path) return false;
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  return true;
}
// Datei mit dem Standardprogramm öffnen (über einen temporären Ordner)
export async function openBlob(blob, name) {
  const { tempDir, join } = await import("@tauri-apps/api/path");
  const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
  const { openPath } = await import("@tauri-apps/plugin-opener");
  const dir = await join(await tempDir(), "findocu");
  await mkdir(dir, { recursive: true }).catch(() => {});
  const file = await join(dir, name || `FinDocu-${Date.now()}.${EXT[blob.type] || "bin"}`);
  await writeFile(file, new Uint8Array(await blob.arrayBuffer()));
  await openPath(file);
}

// externe Seite im System-Browser öffnen (Anmeldung bei Cloud-Anbietern)
export async function openExternal(url) {
  if (!isTauri) { window.open(url, "_blank", "noopener"); return; }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

// Deep-Links findocu://oauth?... (Rückkehr nach der Anmeldung)
export async function onDeepLink(handler) {
  if (!isTauri) return;
  const { onOpenUrl, getCurrent } = await import("@tauri-apps/plugin-deep-link");
  try { const cur = await getCurrent(); if (cur?.length) cur.forEach(handler); } catch {}
  await onOpenUrl((urls) => urls.forEach(handler));
}

/* ---------- Selbst-Update (nur Mac/Windows-App) ----------
   Neue Versionen kommen aus den GitHub-Releases (gebaut von .github/workflows/app-build.yml). */
export const canUpdate = isTauri && !/iPhone|iPad|Android/i.test(navigator.userAgent);
export async function appVersion() {
  if (!isTauri) return null;
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}
export async function checkUpdate() {
  if (!canUpdate) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  return check(); // null = aktuell, sonst { version, body, date, downloadAndInstall }
}
export async function installUpdate(update, onProgress) {
  let total = 0, got = 0;
  await update.downloadAndInstall((e) => {
    if (e.event === "Started") total = e.data.contentLength || 0;
    else if (e.event === "Progress") { got += e.data.chunkLength; onProgress?.(total ? Math.round((got / total) * 100) : null); }
    else if (e.event === "Finished") onProgress?.(100);
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
