/* ============================================================
   v0.99.93: Überwachter Ordner – neue Dateien (inkl. Unterordner) erkennen
   Browser (Chrome/Edge): File System Access API, Ordner-Handle in IndexedDB, Prüfung alle x Sekunden solange die App offen ist
   Mac/Windows-App (Tauri): Ordnerpfad + Datei-Ereignisse (plugin-fs watch) + Prüfung als Rückfall
   Dateien im Ordner werden nur gelesen – nie verschoben oder gelöscht.
   ============================================================ */
import { isTauri } from "./platform.js";

const DBN = "findocu-watch";
let dbp = null;
const wdb = () => dbp || (dbp = new Promise((res, rej) => { const q = indexedDB.open(DBN, 1);
  q.onupgradeneeded = () => { const d = q.result; for (const n of ["kv", "seen", "queue"]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); };
  q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }));
async function op(store, mode, fn) { const d = await wdb(); return new Promise((res, rej) => { const t = d.transaction(store, mode), st = t.objectStore(store); let r; const q = fn(st); if (q) q.onsuccess = () => { r = q.result; }; t.oncomplete = () => res(r); t.onerror = () => rej(t.error); }); }
export const kvGet = (k) => op("kv", "readonly", (s) => s.get(k));
export const kvSet = (k, v) => op("kv", "readwrite", (s) => s.put(v, k));
export const seenKeys = async () => new Set((await op("seen", "readonly", (s) => s.getAllKeys())) || []);
export const seenAdd = (keys) => op("seen", "readwrite", (s) => { for (const k of keys) s.put(1, k); });
export const queueAll = async () => ((await op("queue", "readonly", (s) => s.getAll())) || []).sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
export const queuePut = (items) => op("queue", "readwrite", (s) => { for (const x of items) s.put(x, x.key); });
export const queueDel = (keys) => op("queue", "readwrite", (s) => { for (const k of keys) s.delete(k); });
export async function resetAll() { memH = null; await op("seen", "readwrite", (s) => s.clear()); await op("queue", "readwrite", (s) => s.clear()); await op("kv", "readwrite", (s) => s.clear()); }

let memH = null;   // Handle im Speicher halten (spart IndexedDB-Lesezugriffe)
const getH = async () => memH || (memH = (await kvGet("handle")) || null);
export const fwSupported = () => isTauri || (typeof window !== "undefined" && "showDirectoryPicker" in window);
export const fwKind = () => (isTauri ? "app" : "web");
export const FW_EXT = /\.(pdf|jpe?g|png|heic|heif|webp|gif|tiff?|xml|csv|tsv|xlsx?|sta|mt940|940|camt|ofx|qif|vcf|ics|txt)$/i;
const skipName = (n) => /^(\.|~\$|\$)/.test(n) || /\.(tmp|crdownload|part|download|icloud)$/i.test(n);
const MIME = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", xml: "application/xml", csv: "text/csv", txt: "text/plain", vcf: "text/vcard", ics: "text/calendar", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel" };
const mimeOf = (n) => MIME[(n.split(".").pop() || "").toLowerCase()] || "application/octet-stream";

// Ordner wählen
export async function pickFolder() {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const p = await open({ directory: true, recursive: true, title: "Ordner für FinDocu überwachen" });
    if (!p || Array.isArray(p)) return null;
    await kvSet("path", p); await kvSet("handle", null);
    return { name: String(p).split(/[\\/]/).filter(Boolean).pop() || p, path: p };
  }
  const h = await window.showDirectoryPicker({ id: "findocu-watch", mode: "read" });
  memH = h; await kvSet("handle", h); await kvSet("path", null);
  return { name: h.name };
}
export async function folderInfo() {
  if (isTauri) { const p = await kvGet("path"); return p ? { name: String(p).split(/[\\/]/).filter(Boolean).pop() || p, path: p } : null; }
  const h = await getH(); return h ? { name: h.name } : null;
}
// Zugriff (nur Browser): granted | prompt | denied
export async function permission(ask = false) {
  if (isTauri) return (await kvGet("path")) ? "granted" : "none";
  const h = await getH(); if (!h) return "none";
  try { let s = await h.queryPermission({ mode: "read" }); if (s !== "granted" && ask) s = await h.requestPermission({ mode: "read" }); return s; } catch { return "denied"; }
}

// Alle Dateien auflisten (rekursiv) → [{ key, rel, name, size, mtime }]
export async function listFiles({ sub = true, max = 8000 } = {}) {
  const out = [];
  if (isTauri) {
    const root = await kvGet("path"); if (!root) return out;
    const { readDir, stat } = await import("@tauri-apps/plugin-fs");
    const sep = String(root).includes("\\") ? "\\" : "/";
    const walk = async (dir, rel, depth) => {
      let ents = []; try { ents = await readDir(dir); } catch { return; }
      for (const e of ents) { if (out.length >= max || skipName(e.name)) continue; const p = dir + sep + e.name, r = rel ? rel + "/" + e.name : e.name;
        if (e.isDirectory) { if (sub && depth < 10) await walk(p, r, depth + 1); continue; }
        if (!FW_EXT.test(e.name)) continue;
        let size = 0, mtime = 0; try { const st = await stat(p); size = st.size || 0; mtime = st.mtime ? +new Date(st.mtime) : 0; } catch {}
        out.push({ key: `${r}|${size}|${mtime}`, rel: r, name: e.name, size, mtime }); }
    };
    await walk(root, "", 0); return out;
  }
  const h = await getH(); if (!h) return out;
  const walk = async (dh, rel, depth) => {
    for await (const e of dh.values()) { if (out.length >= max || skipName(e.name)) continue; const r = rel ? rel + "/" + e.name : e.name;
      if (e.kind === "directory") { if (sub && depth < 10) await walk(e, r, depth + 1); continue; }
      if (!FW_EXT.test(e.name)) continue;
      try { const f = await e.getFile(); out.push({ key: `${r}|${f.size}|${f.lastModified}`, rel: r, name: e.name, size: f.size, mtime: f.lastModified }); } catch {}
    }
  };
  await walk(h, "", 0); return out;
}
// Datei per relativem Pfad lesen → File
export async function readRel(rel) {
  const parts = rel.split("/");
  if (isTauri) {
    const root = await kvGet("path"); const { readFile } = await import("@tauri-apps/plugin-fs");
    const sep = String(root).includes("\\") ? "\\" : "/"; const data = await readFile(root + sep + parts.join(sep));
    return new File([data], parts[parts.length - 1], { type: mimeOf(rel) });
  }
  let dh = await getH(); for (const p of parts.slice(0, -1)) dh = await dh.getDirectoryHandle(p);
  const f = await (await dh.getFileHandle(parts[parts.length - 1])).getFile();
  return f.type ? f : new File([f], f.name, { type: mimeOf(f.name), lastModified: f.lastModified });
}
// Datei-Ereignisse (nur App) → Funktion zum Beenden
export async function watchEvents(cb) {
  if (!isTauri) return null;
  try { const root = await kvGet("path"); if (!root) return null; const { watch } = await import("@tauri-apps/plugin-fs"); return await watch(root, () => cb(), { recursive: true, delayMs: 1500 }); } catch { return null; }
}
