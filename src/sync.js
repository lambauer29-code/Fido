/* ============================================================
   FinDocu Cloud-Synchronisierung (v0.84)
   - Anbieter: OneDrive (App-Ordner), Google Drive (versteckter App-Datenordner),
     Dropbox (App-Ordner), MEGA (Ordner „FinDocu Sync“)
   - Alles wird vor dem Hochladen mit dem Sync-Passwort verschlüsselt (AES-256-GCM).
   - Jedes Gerät schreibt nur seine eigene Zustandsdatei (dev-<id>.fdsync) →
     keine Konfliktkopien. Zusammenführen pro Eintrag: neueste Änderung gewinnt.
   ============================================================ */

import { isTauri, API_BASE, openExternal } from "./platform.js";

const SKIP = /^(appToken|appLock|srch:|pending|openSettingsSec|win:|scanFilter|lastAutoBackup|lastAutoCheck|lastAutoHash|lastExtBackup|sync|oauth)/;
const ITER = 310000;
const enc = new TextEncoder(), dec = new TextDecoder();

/* ---------- kleine IndexedDB nur für den Sync ---------- */
let kvP;
const kvDb = () => kvP || (kvP = new Promise((res, rej) => { const r = indexedDB.open("findocu-sync", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
async function kv(mode, fn) { const d = await kvDb(); return new Promise((res, rej) => { const t = d.transaction("kv", mode); const q = fn(t.objectStore("kv")); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); }
export const kvGet = (k) => kv("readonly", (s) => s.get(k));
export const kvSet = (k, v) => kv("readwrite", (s) => s.put(v, k));
const kvDel = (k) => kv("readwrite", (s) => s.delete(k));

/* ---------- Einstellungen (localStorage, wird nicht gesichert/synchronisiert) ---------- */
export const syncCfg = () => { try { return JSON.parse(localStorage.getItem("syncCfg") || "null") || {}; } catch { return {}; } };
export const setSyncCfg = (p) => { const c = { ...syncCfg(), ...p }; localStorage.setItem("syncCfg", JSON.stringify(c)); dispatchEvent(new Event("findocu-sync")); return c; };
export const syncOn = () => { const c = syncCfg(); return !!(c.provider && c.ready); };
export function deviceId() { let c = syncCfg(); if (!c.deviceId) c = setSyncCfg({ deviceId: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }); return c.deviceId; }
export const defaultDeviceName = () => {
  const ua = navigator.userAgent;
  if (isTauri) return /Windows/.test(ua) ? "Windows-App" : "Mac-App";
  const dev = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows-PC" : "Gerät";
  const br = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : "Safari";
  return `${dev} (${br})`;
};

/* ---------- Verschlüsselung ---------- */
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
async function deriveKey(pw, salt, iter = ITER) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const MAGIC = enc.encode("FDS1");
async function seal(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  const out = new Uint8Array(4 + 12 + ct.length); out.set(MAGIC); out.set(iv, 4); out.set(ct, 16); return out;
}
async function open(key, buf) {
  const u = new Uint8Array(buf);
  if (dec.decode(u.subarray(0, 4)) !== "FDS1") throw new Error("Unbekanntes Dateiformat");
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(4, 16) }, key, u.subarray(16))); }
  catch { throw new Error("Sync-Passwort falsch oder Datei beschädigt"); }
}
async function gz(bytes, mode) {
  if (typeof CompressionStream === "undefined") return bytes;
  const s = new Blob([bytes]).stream().pipeThrough(mode === "c" ? new CompressionStream("gzip") : new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const packJson = async (key, obj) => seal(key, await gz(enc.encode(JSON.stringify(obj)), "c"));
async function unpackJson(key, buf) {
  let b = await open(key, buf);
  if (b[0] === 0x1f && b[1] === 0x8b) b = await gz(b, "d");
  return JSON.parse(dec.decode(b));
}

/* ---------- OAuth (PKCE) ---------- */
const rnd = (n = 32) => b64(crypto.getRandomValues(new Uint8Array(n))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const challenge = async (v) => b64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(v)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
// In der nativen App gibt es keine eigene Web-Adresse → Rückkehr über die Vercel-Seite, die dann findocu://oauth öffnet
export const redirectUri = () => (isTauri ? API_BASE : location.origin) + "/oauth-callback.html";
const appTok = () => { try { return JSON.parse(localStorage.getItem("appToken") || '""'); } catch { return ""; } };
let oauthCfgP;
export const oauthConfig = () => oauthCfgP || (oauthCfgP = fetch("/api/oauth", { headers: { "x-app-token": appTok() } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
async function serverToken(body) {
  const r = await fetch("/api/oauth", { method: "POST", headers: { "content-type": "application/json", "x-app-token": appTok() }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error_description || j.error || "Anmeldung fehlgeschlagen (" + r.status + ")");
  return j;
}

/* ---------- Anbieter ---------- */
const FILE_RE = /^(findocu\.meta|dev-[\w-]+\.fdsync|f-[\w-]+\.fdblob)$/;
async function jfetch(url, opt, what) {
  const r = await fetch(url, opt);
  if (r.status === 401) { const e = new Error("Anmeldung abgelaufen – bitte neu verbinden"); e.auth = true; throw e; }
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`${what || "Cloud"}: ${r.status} ${t.slice(0, 160)}`); }
  return r;
}

// gemeinsame Token-Verwaltung für OAuth-Anbieter
function oauthProvider(id, def) {
  const tokKey = "tok:" + id;
  let tok = null;
  async function token() {
    tok = tok || (await kvGet(tokKey));
    if (!tok) { const e = new Error("Nicht verbunden"); e.auth = true; throw e; }
    if (tok.exp && Date.now() < tok.exp - 60e3) return tok.access_token;
    if (!tok.refresh_token) { const e = new Error("Anmeldung abgelaufen – bitte neu verbinden"); e.auth = true; throw e; }
    const j = await def.refresh(tok.refresh_token);
    tok = { ...tok, access_token: j.access_token, refresh_token: j.refresh_token || tok.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    await kvSet(tokKey, tok); return tok.access_token;
  }
  return {
    id, ...def,
    async startLogin() {
      const cfg = await oauthConfig(); const cid = cfg[id];
      if (!cid) throw new Error(`${def.name} ist noch nicht eingerichtet (${def.env} fehlt in Vercel)`);
      const verifier = rnd(48), state = (isTauri ? "app." : "") + id + "." + rnd(12);
      localStorage.setItem("oauthPending", JSON.stringify({ id, verifier, state, at: Date.now() }));
      return def.authUrl(cid, await challenge(verifier), state);
    },
    async finishLogin(code, verifier) {
      const j = await def.exchange(code, verifier);
      tok = { access_token: j.access_token, refresh_token: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
      await kvSet(tokKey, tok);
    },
    async logout() { tok = null; await kvDel(tokKey); },
    token
  };
}

const onedrive = oauthProvider("onedrive", {
  name: "OneDrive", env: "MS_CLIENT_ID / MS_CLIENT_SECRET", where: "OneDrive → Apps → FinDocu",
  authUrl: (cid, ch, state) => "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" + new URLSearchParams({ client_id: cid, response_type: "code", redirect_uri: redirectUri(), response_mode: "query", scope: "offline_access Files.ReadWrite.AppFolder", code_challenge: ch, code_challenge_method: "S256", state, prompt: "select_account" }),
  exchange: (code, verifier) => serverToken({ provider: "onedrive", grant: "code", code, verifier, redirect_uri: redirectUri() }),
  refresh: (rt) => serverToken({ provider: "onedrive", grant: "refresh", refresh_token: rt })
});
const G = "https://graph.microsoft.com/v1.0/me/drive/special/approot";
Object.assign(onedrive, {
  async list() {
    const h = { authorization: "Bearer " + (await onedrive.token()) }, out = {};
    let url = G + "/children?$select=name,size,lastModifiedDateTime,eTag,file&$top=999";
    while (url) { const j = await (await jfetch(url, { headers: h }, "OneDrive")).json(); for (const x of j.value || []) if (x.file && FILE_RE.test(x.name)) out[x.name] = { ver: x.eTag || x.lastModifiedDateTime, size: x.size }; url = j["@odata.nextLink"]; }
    return out;
  },
  async get(name) {
    const h = { authorization: "Bearer " + (await onedrive.token()) };
    const it = await (await jfetch(`${G}:/${encodeURIComponent(name)}`, { headers: h }, "OneDrive")).json();
    const url = it["@microsoft.graph.downloadUrl"];
    return (await jfetch(url || `${G}:/${encodeURIComponent(name)}:/content`, url ? {} : { headers: h }, "OneDrive")).arrayBuffer();
  },
  async put(name, bytes) {
    const h = { authorization: "Bearer " + (await onedrive.token()), "content-type": "application/octet-stream" };
    if (bytes.length < 4e6) { await jfetch(`${G}:/${encodeURIComponent(name)}:/content`, { method: "PUT", headers: h, body: bytes }, "OneDrive"); return; }
    // große Dateien: Upload-Sitzung in 5-MB-Stücken
    const s = await (await jfetch(`${G}:/${encodeURIComponent(name)}:/createUploadSession`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }) }, "OneDrive")).json();
    const CH = 5 * 327680 * 3;
    for (let i = 0; i < bytes.length; i += CH) { const part = bytes.subarray(i, Math.min(bytes.length, i + CH)); await jfetch(s.uploadUrl, { method: "PUT", headers: { "content-range": `bytes ${i}-${i + part.length - 1}/${bytes.length}` }, body: part }, "OneDrive"); }
  },
  async del(name) { const r = await fetch(`${G}:/${encodeURIComponent(name)}`, { method: "DELETE", headers: { authorization: "Bearer " + (await onedrive.token()) } }); if (!r.ok && r.status !== 404) throw new Error("OneDrive: Löschen fehlgeschlagen (" + r.status + ")"); }
});

const gdrive = oauthProvider("gdrive", {
  name: "Google Drive", env: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET", where: "Google Drive → versteckter App-Datenordner (Verwalten unter Einstellungen → Apps verwalten)",
  authUrl: (cid, ch, state) => "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({ client_id: cid, response_type: "code", redirect_uri: redirectUri(), scope: "https://www.googleapis.com/auth/drive.appdata", access_type: "offline", prompt: "consent", code_challenge: ch, code_challenge_method: "S256", state }),
  exchange: (code, verifier) => serverToken({ provider: "gdrive", grant: "code", code, verifier, redirect_uri: redirectUri() }),
  refresh: (rt) => serverToken({ provider: "gdrive", grant: "refresh", refresh_token: rt })
});
let gIds = {};
Object.assign(gdrive, {
  async list() {
    const h = { authorization: "Bearer " + (await gdrive.token()) }, out = {}; gIds = {};
    let pt = "";
    do {
      const j = await (await jfetch("https://www.googleapis.com/drive/v3/files?" + new URLSearchParams({ spaces: "appDataFolder", pageSize: "1000", fields: "nextPageToken,files(id,name,modifiedTime,size,md5Checksum)", ...(pt ? { pageToken: pt } : {}) }), { headers: h }, "Google Drive")).json();
      for (const f of j.files || []) { if (!FILE_RE.test(f.name)) continue; if (gIds[f.name] && out[f.name].ver > f.modifiedTime) continue; gIds[f.name] = f.id; out[f.name] = { ver: f.md5Checksum || f.modifiedTime, size: +f.size || 0 }; }
      pt = j.nextPageToken;
    } while (pt);
    return out;
  },
  async get(name) { if (!gIds[name]) await gdrive.list(); if (!gIds[name]) throw new Error("Google Drive: Datei fehlt"); return (await jfetch(`https://www.googleapis.com/drive/v3/files/${gIds[name]}?alt=media`, { headers: { authorization: "Bearer " + (await gdrive.token()) } }, "Google Drive")).arrayBuffer(); },
  async put(name, bytes) {
    const t = await gdrive.token();
    if (gIds[name]) { await jfetch(`https://www.googleapis.com/upload/drive/v3/files/${gIds[name]}?uploadType=media`, { method: "PATCH", headers: { authorization: "Bearer " + t, "content-type": "application/octet-stream" }, body: bytes }, "Google Drive"); return; }
    const bnd = "fd" + rnd(8);
    const body = new Blob([`--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ["appDataFolder"] })}\r\n--${bnd}\r\nContent-Type: application/octet-stream\r\n\r\n`, bytes, `\r\n--${bnd}--`]);
    const j = await (await jfetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", headers: { authorization: "Bearer " + t, "content-type": "multipart/related; boundary=" + bnd }, body }, "Google Drive")).json();
    gIds[name] = j.id;
  },
  async del(name) { if (!gIds[name]) return; const r = await fetch(`https://www.googleapis.com/drive/v3/files/${gIds[name]}`, { method: "DELETE", headers: { authorization: "Bearer " + (await gdrive.token()) } }); if (!r.ok && r.status !== 404) throw new Error("Google Drive: Löschen fehlgeschlagen (" + r.status + ")"); delete gIds[name]; }
});

const dropbox = oauthProvider("dropbox", {
  name: "Dropbox", env: "DROPBOX_APP_KEY", where: "Dropbox → Apps → FinDocu",
  authUrl: (cid, ch, state) => "https://www.dropbox.com/oauth2/authorize?" + new URLSearchParams({ client_id: cid, response_type: "code", redirect_uri: redirectUri(), token_access_type: "offline", code_challenge: ch, code_challenge_method: "S256", state }),
  async exchange(code, verifier) {
    const cid = (await oauthConfig()).dropbox;
    return (await jfetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", body: new URLSearchParams({ code, grant_type: "authorization_code", client_id: cid, code_verifier: verifier, redirect_uri: redirectUri() }) }, "Dropbox")).json();
  },
  async refresh(rt) {
    const cid = (await oauthConfig()).dropbox;
    return (await jfetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: cid }) }, "Dropbox")).json();
  }
});
const dbxArg = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4));
Object.assign(dropbox, {
  async list() {
    const h = { authorization: "Bearer " + (await dropbox.token()), "content-type": "application/json" }, out = {};
    let j = await (await jfetch("https://api.dropboxapi.com/2/files/list_folder", { method: "POST", headers: h, body: JSON.stringify({ path: "", limit: 2000 }) }, "Dropbox")).json();
    for (;;) { for (const e of j.entries || []) if (e[".tag"] === "file" && FILE_RE.test(e.name)) out[e.name] = { ver: e.rev, size: e.size }; if (!j.has_more) break; j = await (await jfetch("https://api.dropboxapi.com/2/files/list_folder/continue", { method: "POST", headers: h, body: JSON.stringify({ cursor: j.cursor }) }, "Dropbox")).json(); }
    return out;
  },
  async get(name) { return (await jfetch("https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { authorization: "Bearer " + (await dropbox.token()), "dropbox-api-arg": dbxArg({ path: "/" + name }) } }, "Dropbox")).arrayBuffer(); },
  async put(name, bytes) { await jfetch("https://content.dropboxapi.com/2/files/upload", { method: "POST", headers: { authorization: "Bearer " + (await dropbox.token()), "content-type": "application/octet-stream", "dropbox-api-arg": dbxArg({ path: "/" + name, mode: "overwrite", mute: true }) }, body: bytes }, "Dropbox"); },
  async del(name) { const r = await fetch("https://api.dropboxapi.com/2/files/delete_v2", { method: "POST", headers: { authorization: "Bearer " + (await dropbox.token()), "content-type": "application/json" }, body: JSON.stringify({ path: "/" + name }) }); if (!r.ok && r.status !== 409) throw new Error("Dropbox: Löschen fehlgeschlagen (" + r.status + ")"); }
});

// MEGA: Anmeldung mit E-Mail + Passwort (MEGA hat keine OAuth-Freigabe). Gespeichert wird nur die Sitzung –
// verschlüsselt mit dem Sync-Schlüssel –, nicht das MEGA-Passwort.
const MEGA_DIR = "FinDocu Sync";
let megaSt = null, megaDir = null;
const megaLib = () => import("megajs");
const mega = {
  id: "mega", name: "MEGA", where: "MEGA → Cloud-Laufwerk → „FinDocu Sync“",
  async login(email, password, code) {
    const { Storage } = await megaLib();
    const st = new Storage({ email, password, secondFactorCode: code || undefined, keepalive: false });
    await st.ready;
    const j = st.toJSON(); delete j.options.password; delete j.options.secondFactorCode;
    megaSt = st; megaDir = null;
    await kvSet("tok:mega", { session: j, email: st.email, name: st.name });
  },
  async storage() {
    if (megaSt) return megaSt;
    const t = await kvGet("tok:mega"); if (!t) { const e = new Error("Nicht mit MEGA verbunden"); e.auth = true; throw e; }
    const { Storage } = await megaLib();
    const st = Storage.fromJSON(t.session);
    try { await st.reload(true); } catch (e) { const x = new Error("MEGA-Sitzung abgelaufen – bitte neu anmelden"); x.auth = true; throw x; }
    megaSt = st; return st;
  },
  async dir() {
    const st = await this.storage();
    if (megaDir) return megaDir;
    megaDir = st.root.children?.find((f) => f.directory && f.name === MEGA_DIR) || (await st.mkdir(MEGA_DIR));
    return megaDir;
  },
  async list() {
    megaDir = null; if (megaSt) await megaSt.reload(true).catch(() => {});
    const d = await this.dir(), out = {};
    for (const f of d.children || []) if (!f.directory && FILE_RE.test(f.name)) { const v = (f.timestamp || 0) + ":" + (f.nodeId || ""); if (!out[f.name] || out[f.name].ts < f.timestamp) out[f.name] = { ver: v, size: f.size, ts: f.timestamp || 0 }; }
    return out;
  },
  async get(name) {
    const d = await this.dir(), f = (d.children || []).filter((x) => x.name === name).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
    if (!f) throw new Error("MEGA: Datei fehlt");
    const b = await f.downloadBuffer(); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  },
  async put(name, bytes) {
    const d = await this.dir(), old = (d.children || []).filter((x) => x.name === name);
    await d.upload({ name, size: bytes.length }, bytes).complete;
    for (const o of old) await o.delete(true).catch(() => {}); // MEGA erlaubt doppelte Namen → alte Version entfernen
  },
  async del(name) { const d = await this.dir(); for (const o of (d.children || []).filter((x) => x.name === name)) await o.delete(true).catch(() => {}); },
  async logout() { megaSt = null; megaDir = null; await kvDel("tok:mega"); }
};

// Nur für automatische Tests: lokaler Dateispeicher (aktiv nur, wenn localStorage „syncTestUrl“ gesetzt ist)
const testBase = () => localStorage.getItem("syncTestUrl");
const test = {
  id: "test", name: "Test-Speicher", where: "lokaler Testserver",
  async list() { return (await jfetch(testBase() + "/list")).json(); },
  async get(n) { return (await jfetch(testBase() + "/f/" + n)).arrayBuffer(); },
  async put(n, b) { await jfetch(testBase() + "/f/" + n, { method: "PUT", body: b }); },
  async del(n) { await fetch(testBase() + "/f/" + n, { method: "DELETE" }); },
  async logout() {}
};
export const PROVIDERS = { onedrive, gdrive, dropbox, mega, ...(typeof localStorage !== "undefined" && testBase() ? { test } : {}) };
export const PROVIDER_LIST = [
  ["onedrive", "OneDrive", "Microsoft-Konto · eigener App-Ordner"],
  ["gdrive", "Google Drive", "Google-Konto · versteckter App-Datenordner"],
  ["dropbox", "Dropbox", "Dropbox-Konto · eigener App-Ordner"],
  ["mega", "MEGA", "E-Mail + Passwort · Ordner „FinDocu Sync“"]
];
const prov = () => PROVIDERS[syncCfg().provider];

/* ---------- OAuth-Rückkehr (Popup oder Umleitung) ---------- */
export async function completeOAuth(query) {
  const p = new URLSearchParams(query), pend = JSON.parse(localStorage.getItem("oauthPending") || "null");
  localStorage.removeItem("oauthPending"); localStorage.removeItem("oauthReturn");
  if (p.get("error")) throw new Error(p.get("error_description") || p.get("error"));
  if (!pend || p.get("state") !== pend.state) throw new Error("Anmeldung abgebrochen oder abgelaufen – bitte nochmal verbinden");
  await PROVIDERS[pend.id].finishLogin(p.get("code"), pend.verifier);
  setSyncCfg({ provider: pend.id, ready: false });
  return pend.id;
}
let appWait = null;
// native App: Deep-Link findocu://oauth?code=…&state=…
export async function handleDeepLink(url) {
  let u; try { u = new URL(url); } catch { return; }
  if (!/oauth/.test(u.host + u.pathname)) return;
  const w = appWait; appWait = null;
  try { const id = await completeOAuth(u.search); w ? w.res(id) : (localStorage.setItem("syncNext", "password"), dispatchEvent(new Event("findocu-sync"))); }
  catch (e) { w ? w.rej(e) : localStorage.setItem("syncNext", "error:" + e.message); }
}
export async function oauthLogin(id) {
  const url = await PROVIDERS[id].startLogin();
  if (isTauri) { await openExternal(url); return new Promise((res, rej) => { appWait = { res, rej }; }); }
  const coarse = matchMedia("(pointer:coarse)").matches || navigator.standalone;
  const w = coarse ? null : window.open(url, "findocu-oauth", "width=520,height=720");
  if (!w) { location.href = url; return new Promise(() => {}); } // Umleitung – geht nach der Rückkehr weiter
  return new Promise((res, rej) => {
    const on = async (e) => {
      if (e.origin !== location.origin || e.data?.type !== "findocu-oauth") return;
      removeEventListener("message", on); clearInterval(t);
      try { res(await completeOAuth(e.data.query)); } catch (x) { rej(x); }
    };
    addEventListener("message", on);
    const t = setInterval(() => { if (w.closed) { clearInterval(t); setTimeout(() => { removeEventListener("message", on); rej(new Error("Anmeldefenster geschlossen")); }, 800); } }, 600);
  });
}

/* ---------- Sync-Passwort ---------- */
export async function setupKey(pw) {
  const p = prov(); if (!p) throw new Error("Kein Anbieter gewählt");
  const files = await p.list();
  let key, fresh = false;
  if (files["findocu.meta"]) {
    const m = JSON.parse(dec.decode(new Uint8Array(await p.get("findocu.meta"))));
    key = await deriveKey(pw, unb64(m.salt), m.iter || ITER);
    try { const t = dec.decode(await open(key, unb64(m.check))); if (t !== "findocu-ok") throw 0; } catch { throw new Error("Falsches Sync-Passwort – es muss dasselbe sein wie auf deinem anderen Gerät"); }
  } else {
    const salt = crypto.getRandomValues(new Uint8Array(16)); key = await deriveKey(pw, salt); fresh = true;
    await p.put("findocu.meta", enc.encode(JSON.stringify({ app: "FinDocu", v: 1, kdf: "PBKDF2-SHA-256", iter: ITER, salt: b64(salt), check: b64(await seal(key, enc.encode("findocu-ok"))) })));
  }
  await kvSet("key", key);
  const others = Object.keys(files).filter((n) => n.startsWith("dev-") && n !== `dev-${deviceId()}.fdsync`);
  return { fresh, others: others.length };
}
// Mit MEGA: Sitzung braucht den Sync-Schlüssel nicht – Sitzung liegt nur lokal in IndexedDB.

/* ---------- lokaler Stand: localStorage + IndexedDB (docs, tx) ---------- */
function lsCollections() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i); if (SKIP.test(k)) continue;
    const raw = localStorage.getItem(k); let v; try { v = JSON.parse(raw); } catch { v = undefined; }
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && typeof x.id === "string")) {
      const c = {}; for (const x of v) c[x.id] = JSON.stringify(x); c.__order = JSON.stringify(v.map((x) => x.id)); out["ls:" + k] = c;
    } else out["ls:" + k] = { __: raw };
  }
  return out;
}
async function snapshot(db) {
  const s = lsCollections();
  const docs = await db.allDocs(), tx = await db.allTx();
  s.docs = {}; for (const d of docs) s.docs[d.id] = JSON.stringify(d);
  s.tx = {}; for (const t of tx) s.tx[t.id] = JSON.stringify(t);
  return s;
}
async function applyCollection(db, c, items) {
  if (c === "docs") return; // separat
  if (c === "tx") return;
  const k = c.slice(3);
  const hasIds = Object.keys(items).some((x) => x !== "__" && x !== "__order");
  if (items.__ !== undefined && !(hasIds && items.__ === "[]")) { if (items.__ === null) localStorage.removeItem(k); else localStorage.setItem(k, items.__); return; }
  const ids = Object.keys(items).filter((x) => x !== "__order" && x !== "__");
  if (!ids.length && !items.__order) { localStorage.removeItem(k); return; }
  let order = []; try { order = JSON.parse(items.__order || "[]"); } catch {}
  const seen = new Set(), arr = [];
  for (const id of order) if (items[id] && !seen.has(id)) { seen.add(id); arr.push(JSON.parse(items[id])); }
  for (const id of ids) if (!seen.has(id)) arr.push(JSON.parse(items[id]));
  localStorage.setItem(k, JSON.stringify(arr));
}

/* ---------- Kern: abgleichen ----------
   mode "pull": lokal ändern erlaubt (vor dem App-Start)
   mode "push": nur eigene Änderungen hochladen, fremde nur erkennen */
let running = null;
export function syncNow(db, opts = {}) { if (running) return running; running = doSync(db, opts).finally(() => { running = null; }); return running; }

async function doSync(db, { mode = "push", first = null, onStep = () => {}, sig = null } = {}) {
  const p = prov(), key = await kvGet("key");
  if (!p || !key) throw new Error("Synchronisierung nicht eingerichtet");
  const me = `dev-${deviceId()}.fdsync`;
  const meta = (await kvGet("state")) || { base: {}, stamps: {}, tomb: {}, seen: {}, blobs: {} };
  onStep("Lese Cloud …");
  const files = await p.list();
  if (!files["findocu.meta"]) throw new Error("Sync-Daten in der Cloud fehlen – bitte Synchronisierung neu einrichten");

  // 1) eigene Änderungen seit dem letzten Abgleich mit Zeitstempel versehen
  onStep("Prüfe Änderungen …");
  const L = await snapshot(db), now = Date.now(), firstRun = !meta.init;
  let localChanged = false;
  const stampFor = firstRun ? (first === "local" ? now : 1) : now;
  for (const [c, items] of Object.entries(L)) {
    const b = meta.base[c] || {};
    for (const [i, v] of Object.entries(items)) if (b[i] !== v) { (meta.stamps[c] ||= {})[i] = stampFor; if (meta.tomb[c]) delete meta.tomb[c][i]; localChanged = true; }
  }
  if (!firstRun) for (const [c, items] of Object.entries(meta.base)) for (const i of Object.keys(items)) if (!L[c] || L[c][i] === undefined) { (meta.tomb[c] ||= {})[i] = now; if (meta.stamps[c]) delete meta.stamps[c][i]; localChanged = true; }

  // 2) fremde Geräte-Dateien, die sich geändert haben
  const others = Object.entries(files).filter(([n]) => n.startsWith("dev-") && n !== me);
  const changedOthers = others.filter(([n, f]) => meta.seen[n] !== f.ver);
  const remoteNames = [];
  if (mode === "push") {
    // nur melden – angewendet wird beim nächsten Start (sonst überschreibt die laufende App die neuen Daten)
    if (changedOthers.length) for (const [n] of changedOthers) remoteNames.push(n);
  } else {
    onStep(changedOthers.length ? `Lade Änderungen von ${changedOthers.length} Gerät(en) …` : "Keine neuen Änderungen");
    const touched = new Set(), got = [];
    for (const [n, f] of changedOthers) { try { got.push([n, f, await unpackJson(key, await p.get(n))]); } catch (e) { console.warn("Sync: übersprungen", n, e); } }
    if (sig?.aborted) { // Zeitlimit beim Start: die App läuft schon → nichts mehr lokal ändern
      setSyncCfg({ pending: changedOthers.length }); throw new Error("Zeitüberschreitung");
    }
    for (const [n, f, R] of got) {
      remoteNames.push(R.name || n);
      for (const [c, items] of Object.entries(R.state || {})) for (const [i, v] of Object.entries(items)) {
        const rs = R.stamps?.[c]?.[i] ?? 0, ls = meta.stamps[c]?.[i] ?? -1, lt = meta.tomb[c]?.[i] ?? -1;
        if (rs > ls && rs > lt && L[c]?.[i] !== v) { (L[c] ||= {})[i] = v; (meta.stamps[c] ||= {})[i] = rs; if (meta.tomb[c]) delete meta.tomb[c][i]; touched.add(c); }
        else if (rs > ls && rs > lt) { (meta.stamps[c] ||= {})[i] = rs; }
      }
      for (const [c, items] of Object.entries(R.tomb || {})) for (const [i, t] of Object.entries(items)) {
        const ls = meta.stamps[c]?.[i] ?? -1, lt = meta.tomb[c]?.[i] ?? -1;
        if (t > ls && t > lt) { (meta.tomb[c] ||= {})[i] = t; if (meta.stamps[c]) delete meta.stamps[c][i]; if (L[c] && L[c][i] !== undefined) { delete L[c][i]; touched.add(c); } }
      }
      meta.seen[n] = f.ver;
    }
    // 3) anwenden
    if (touched.size) onStep("Übernehme Änderungen …");
    for (const c of touched) {
      if (c === "docs" || c === "tx") {
        const cur = c === "docs" ? await db.allDocs() : await db.allTx(), curIds = new Set(cur.map((x) => x.id));
        const put = Object.values(L[c] || {}).map((s) => JSON.parse(s));
        const del = [...curIds].filter((id) => !(L[c] || {})[id]);
        if (c === "docs") { for (const d of put) await db.putDoc(d); for (const id of del) { await db.delDoc(id); await db.delFile(id).catch(() => {}); } }
        else { if (put.length) await db.putTxs(put); if (del.length) await db.delTxs(del); }
      } else await applyCollection(db, c, L[c] || {});
    }
    meta.applied = touched.size;
  }

  // 4) Dateien (PDFs/Fotos) – fehlende hochladen, fehlende herunterladen, gelöschte entfernen
  const docIds = Object.keys(L.docs || {});
  let up = 0, down = 0;
  for (const id of docIds) {
    const name = `f-${id}.fdblob`, has = !!files[name];
    if (!has && !meta.blobs[id]) {
      const blob = await db.getFile(id);
      if (blob) { onStep(`Lade Datei hoch (${++up}) …`); await p.put(name, await seal(key, new Uint8Array(await blob.arrayBuffer()))); meta.blobs[id] = 1; }
    } else if (has) {
      meta.blobs[id] = 1;
      if (mode === "pull" && !(await db.getFile(id))) {
        try { onStep(`Lade Datei herunter (${++down}) …`); const d = JSON.parse(L.docs[id]); const b = await open(key, await p.get(name)); await db.putFile(id, new Blob([b], { type: d.mimeType || "application/octet-stream" })); } catch (e) { console.warn("Sync: Datei", id, e); }
      }
    }
  }
  for (const id of Object.keys(meta.tomb.docs || {})) if (files[`f-${id}.fdblob`] && (meta.tomb.docs[id] > (meta.stamps.docs?.[id] ?? -1))) { await p.del(`f-${id}.fdblob`).catch(() => {}); delete meta.blobs[id]; }

  // 5) eigenen Stand hochladen (nur wenn sich etwas geändert hat)
  meta.base = L; meta.init = true;
  const needUp = localChanged || !files[me] || (mode === "pull" && meta.applied);
  if (needUp) {
    onStep("Lade eigenen Stand hoch …");
    const cfg = syncCfg();
    await p.put(me, await packJson(key, { app: "FinDocu", v: 1, device: deviceId(), name: cfg.deviceName || defaultDeviceName(), at: new Date().toISOString(), state: L, stamps: meta.stamps, tomb: meta.tomb }));
  }
  await kvSet("state", meta);
  const at = new Date().toISOString();
  setSyncCfg({ lastSync: at, lastError: "", pending: mode === "push" ? remoteNames.length : 0, devices: others.length + 1 });
  return { at, applied: mode === "pull" ? meta.applied || 0 : 0, pending: mode === "push" ? remoteNames.length : 0, uploaded: needUp, up, down };
}

/* Vor dem App-Start: fremde Änderungen übernehmen (mit Zeitlimit, damit die App offline trotzdem startet) */
export async function startupSync(db, onStep) {
  if (!syncOn()) return null;
  const sig = { aborted: false };
  try {
    return await Promise.race([syncNow(db, { mode: "pull", onStep, sig }), new Promise((_, rej) => setTimeout(() => { sig.aborted = true; rej(new Error("Zeitüberschreitung – Abgleich läuft im Hintergrund weiter")); }, 15000))]);
  } catch (e) { setSyncCfg({ lastError: e.message, needsAuth: !!e.auth }); return { error: e.message }; }
}

export async function disconnect() {
  const p = prov(); try { await p?.logout?.(); } catch {}
  await kvDel("key"); await kvDel("state");
  const c = syncCfg(); localStorage.setItem("syncCfg", JSON.stringify({ deviceId: c.deviceId, deviceName: c.deviceName }));
  dispatchEvent(new Event("findocu-sync"));
}
export async function remoteDevices() {
  const p = prov(), key = await kvGet("key"); if (!p || !key) return [];
  const files = await p.list(), out = [];
  for (const n of Object.keys(files).filter((x) => x.startsWith("dev-"))) { try { const R = await unpackJson(key, await p.get(n)); out.push({ file: n, name: R.name, at: R.at, me: n === `dev-${deviceId()}.fdsync` }); } catch { out.push({ file: n, name: "?", at: "" }); } }
  return out.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}

/* Zustand in der Cloud (vor dem Passwort-Schritt) */
export async function cloudState() {
  const p = prov(); if (!p) return null;
  const files = await p.list();
  return { hasMeta: !!files["findocu.meta"], devices: Object.keys(files).filter((n) => n.startsWith("dev-") && n !== `dev-${deviceId()}.fdsync`).length, files: Object.keys(files).length };
}
