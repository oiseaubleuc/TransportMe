import React from "react";
import { createRoot } from "react-dom/client";
import App from "./TransportMe.jsx";

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = "<p style=\"padding:1rem;font-family:sans-serif\">#root ontbreekt in index.html.</p>";
} else {
  try {
    createRoot(rootEl).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (e) {
    console.error(e);
    rootEl.innerHTML = `<p style="padding:1rem;font-family:sans-serif;color:#b00">App start mislukt. Vernieuw de pagina of wis sitegegevens. (${String(e?.message || e)})</p>`;
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
