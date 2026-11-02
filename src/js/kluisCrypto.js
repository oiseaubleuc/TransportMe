/**
 * AES-GCM (Web Crypto) + PBKDF2-SHA-256. Geen eigen algoritme.
 * De sleutel blijft in geheugen (niet-extractable); naast de data staat alleen het zout.
 */

export const KLUIS_PREFIX = "tmenc:1:";
export const KLUIS_META_KEY = "tm_kluis";
export const PBKDF2_ITER = 210_000;

function bytesToB64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof Buffer !== "undefined") return Buffer.from(arr).toString("base64");
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function b64ToBytes(s) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(s, "base64"));
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isKluisEnvelope(raw) {
  return typeof raw === "string" && raw.startsWith(KLUIS_PREFIX);
}

export function nieuweZout() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return bytesToB64(buf);
}

export function standaardMeta(zout, retentionDays = 62) {
  return {
    v: 1,
    kdf: "PBKDF2",
    hash: "SHA-256",
    iter: PBKDF2_ITER,
    zout,
    retentionDays,
  };
}

export async function leidSleutelAf(pin, meta) {
  const zout = b64ToBytes(meta.zout);
  const iter = Number(meta.iter) > 10_000 ? Number(meta.iter) : PBKDF2_ITER;
  const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: zout, iterations: iter, hash: "SHA-256" },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function versleutelBytes(key, data) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const pt = data instanceof Uint8Array ? data : new Uint8Array(data);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt));
  return { iv: bytesToB64(iv), ct: bytesToB64(ct) };
}

export async function ontsleutelBytes(key, ivB64, ctB64) {
  const iv = b64ToBytes(ivB64);
  const ct = b64ToBytes(ctB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new Uint8Array(pt);
}

export async function versleutelTekst(key, tekst) {
  const { iv, ct } = await versleutelBytes(key, new TextEncoder().encode(String(tekst)));
  return KLUIS_PREFIX + JSON.stringify({ iv, ct });
}

export async function ontsleutelTekst(key, raw) {
  if (!isKluisEnvelope(raw)) throw new Error("Geen kluiswaarde");
  const o = JSON.parse(raw.slice(KLUIS_PREFIX.length));
  const pt = await ontsleutelBytes(key, o.iv, o.ct);
  return new TextDecoder().decode(pt);
}
