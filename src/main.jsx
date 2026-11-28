import "./defaults.js";   // v1.0.16: Standard-Einstellungen vor allem anderen setzen
import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/outfit/index.css";
import App, { db } from "./App.jsx";
import { startupSync, syncOn, completeOAuth, handleDeepLink, isContactsAuth } from "./sync.js";
import { isTauri, installPlatform, onDeepLink } from "./platform.js";

const root = createRoot(document.getElementById("root"));
const Splash = ({ text }) => (
  <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", font: "500 16px Outfit Variable, system-ui, sans-serif", color: "#64748b" }}>
    <div style={{ textAlign: "center" }}><div style={{ fontSize: 34, marginBottom: 8 }}>☁️</div>{text}</div>
  </div>
);

async function boot() {
  await installPlatform(); // native App: /api/… an Vercel weiterleiten
  onDeepLink(handleDeepLink);
  // Rückkehr von der Anmeldung (OneDrive / Google / Dropbox) per Umleitung
  const ret = localStorage.getItem("oauthReturn");
  if (ret) {
    root.render(<Splash text="Anmeldung wird abgeschlossen …" />);
    try { const id = await completeOAuth(ret); if (isContactsAuth(id)) localStorage.setItem("ctNext", id); else localStorage.setItem("syncNext", "password"); }
    catch (e) { localStorage.setItem("syncNext", "error:" + e.message); }
  }
  // Änderungen anderer Geräte übernehmen, bevor die App ihre Daten lädt
  if (syncOn()) {
    root.render(<Splash text="Synchronisiere …" />);
    await startupSync(db, (t) => root.render(<Splash text={t} />));
  }
  root.render(<App />);
}
boot();

if ("serviceWorker" in navigator && import.meta.env.PROD && !isTauri) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
