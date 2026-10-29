const TAG = "tm-lopend";
const OPTIN_KEY = "tm_melding_route";

export function isStandalone() {
  return (
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)")?.matches) ||
    (typeof navigator !== "undefined" && navigator.standalone === true)
  );
}

export function zetStandaloneKlasse() {
  try {
    document.documentElement.classList.toggle("tm-standalone", isStandalone());
  } catch {
    /* */
  }
}

export function magRouteInMelding() {
  try {
    return localStorage.getItem(OPTIN_KEY) === "1";
  } catch {
    return false;
  }
}

export function zetRouteInMelding(aan) {
  try {
    localStorage.setItem(OPTIN_KEY, aan ? "1" : "0");
  } catch {
    /* */
  }
}

export async function vraagMeldingToestemming() {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const p = await Notification.requestPermission();
    return p === "granted";
  } catch {
    return false;
  }
}

function tekst(rit) {
  if (!magRouteInMelding()) return "Rit onderweg";
  const van = String(rit?.f || "").trim();
  const naar = String(rit?.t || "").trim();
  if (van && naar) return `${van} → ${naar}`;
  return naar || van || "Rit onderweg";
}

async function sw() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function toonLopendeMelding(rit) {
  if (!rit) return;
  const body = tekst(rit);
  const titel = "Onderweg";
  const opt = {
    body,
    tag: TAG,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    silent: true,
    requireInteraction: true,
    renotify: true,
    data: { url: "/" },
  };
  try {
    const reg = await sw();
    if (reg?.showNotification) {
      await reg.showNotification(titel, opt);
      return;
    }
  } catch {
    /* */
  }
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(titel, opt);
    }
  } catch {
    /* */
  }
}

export async function wisLopendeMelding() {
  try {
    const reg = await sw();
    const list = (await reg?.getNotifications?.({ tag: TAG })) || [];
    list.forEach(n => n.close());
  } catch {
    /* */
  }
}
