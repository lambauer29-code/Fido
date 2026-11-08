import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/outfit/index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
