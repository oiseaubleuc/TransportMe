import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter-tight/400.css";
import "@fontsource/inter-tight/500.css";
import "@fontsource/inter-tight/600.css";
import "@fontsource/inter-tight/700.css";
import "@fontsource/inter-tight/800.css";
import App from "./app/App.jsx";
import Toegang from "./app/Toegang.jsx";
import { zetStandaloneKlasse } from "./js/lopendeMelding.js";

zetStandaloneKlasse();
window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change", zetStandaloneKlasse);

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = "<p style=\"padding:1rem;font-family:sans-serif\">#root ontbreekt in index.html.</p>";
} else {
  try {
    createRoot(rootEl).render(
      <React.StrictMode>
        <Toegang>
          <App />
        </Toegang>
      </React.StrictMode>
    );
  } catch (e) {
    console.error(e);
    rootEl.innerHTML = `<p style="padding:1rem;font-family:sans-serif;color:#b00">App start mislukt. Vernieuw de pagina of wis sitegegevens. (${String(e?.message || e)})</p>`;
  }
}

const PRODUCTIE_HOST = "transport-tawny-xi.vercel.app";

function isVercelPreview() {
  const h = location.hostname;
  return h.endsWith(".vercel.app") && h !== PRODUCTIE_HOST;
}

function wisServiceWorkersEnCaches() {
  const taken = [];
  if ("serviceWorker" in navigator) {
    taken.push(
      navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister())))
    );
  }
  if ("caches" in window) {
    taken.push(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
  return Promise.all(taken);
}

if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD && !isVercelPreview()) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          reg.update();
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") reg.update();
          });
        })
        .catch(() => {});
      let herladen = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (herladen) return;
        herladen = true;
        location.reload();
      });
    });
  } else {
    wisServiceWorkersEnCaches();
  }
}
