/**
 * Versleutelde kluis-snapshot (zelfde ritten op telefoon en computer).
 * De server bewaart alleen ciphertext + kluismeta (zout), nooit de toegangscode.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { trimEnv } from "./authCore.mjs";

export const SYNC_VERSION = 1;
export const MAX_SYNC_BYTES = 3_500_000;
export const BLOB_PATH = "transportme/kluis-sync.json";
const KLUIS_PREFIX = "tmenc:1:";
const KLUIS_META_KEY = "tm_kluis";
const LS_PREFIX = "transporteur_";

export function isSyncSleutel(k) {
  if (typeof k !== "string") return false;
  if (k.startsWith(LS_PREFIX)) return true;
  if (k.startsWith("t_")) return true;
  if (k === "tp") return true;
  if (k === KLUIS_META_KEY) return true;
  return false;
}

export function syncBestandPad() {
  const extra = trimEnv("TM_SYNC_FILE");
  if (extra) return extra;
  return join(process.cwd(), "server/data/kluis-sync.json");
}

export function syncOpslagSoort() {
  if (trimEnv("TM_SYNC_FILE")) return "file";
  if (trimEnv("BLOB_READ_WRITE_TOKEN")) return "blob";
  if (process.env.VERCEL) return "geen";
  return "file";
}

export function syncOntbreekt() {
  if (syncOpslagSoort() !== "geen") return [];
  return ["BLOB_READ_WRITE_TOKEN"];
}

export function snapshotHeeftData(keys) {
  return Object.keys(keys || {}).some(k => k.startsWith("t_") || k.startsWith("transporteur_"));
}

function isEnvelope(raw) {
  return typeof raw === "string" && raw.startsWith(KLUIS_PREFIX);
}

function metaOk(raw) {
  if (typeof raw !== "string" || !raw) return false;
  try {
    const o = JSON.parse(raw);
    return !!(o && o.v === 1 && typeof o.zout === "string" && o.zout.length > 8);
  } catch {
    return false;
  }
}

/** Weigert plaintext ritten en alles wat geen kluissleutel is. */
export function schoonSnapshot(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Ongeldige kluis." };
  }
  const rawKeys = input.keys;
  if (!rawKeys || typeof rawKeys !== "object" || Array.isArray(rawKeys)) {
    return { ok: false, error: "Geen kluissleutels." };
  }
  const keys = {};
  for (const [k, v] of Object.entries(rawKeys)) {
    if (!isSyncSleutel(k)) continue;
    if (typeof v !== "string" || !v) continue;
    if (k === KLUIS_META_KEY) {
      if (!metaOk(v)) return { ok: false, error: "Kluismeta ongeldig." };
      keys[k] = v;
      continue;
    }
    if (!isEnvelope(v)) {
      return { ok: false, error: "Alleen versleutelde gegevens mogen naar de server." };
    }
    keys[k] = v;
  }
  if (!keys[KLUIS_META_KEY]) return { ok: false, error: "Kluismeta ontbreekt." };
  const updatedAt = Number(input.updatedAt);
  const snap = {
    v: SYNC_VERSION,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : Date.now(),
    keys,
  };
  const bytes = Buffer.byteLength(JSON.stringify(snap), "utf8");
  if (bytes > MAX_SYNC_BYTES) {
    return { ok: false, error: "Kluis is te groot om te delen." };
  }
  return { ok: true, snap, bytes };
}

async function leesBestand() {
  try {
    const raw = await readFile(syncBestandPad(), "utf8");
    const o = JSON.parse(raw);
    const uit = schoonSnapshot(o);
    return uit.ok ? uit.snap : null;
  } catch {
    return null;
  }
}

async function schrijfBestand(snap) {
  const pad = syncBestandPad();
  await mkdir(dirname(pad), { recursive: true });
  await writeFile(pad, JSON.stringify(snap), "utf8");
}

async function leesBlob() {
  const token = trimEnv("BLOB_READ_WRITE_TOKEN");
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: BLOB_PATH, token, limit: 8 });
  const hit = blobs.find(b => b.pathname === BLOB_PATH || b.pathname.endsWith("/kluis-sync.json"));
  if (!hit?.url) return null;
  const res = await fetch(hit.url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Kluis lezen mislukt.");
  const o = await res.json();
  const uit = schoonSnapshot(o);
  return uit.ok ? uit.snap : null;
}

async function schrijfBlob(snap) {
  const token = trimEnv("BLOB_READ_WRITE_TOKEN");
  const { put } = await import("@vercel/blob");
  await put(BLOB_PATH, JSON.stringify(snap), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token,
  });
}

export async function leesSnapshot() {
  const soort = syncOpslagSoort();
  if (soort === "geen") return { ok: false, ontbreekt: syncOntbreekt() };
  if (soort === "blob") return { ok: true, snap: await leesBlob() };
  return { ok: true, snap: await leesBestand() };
}

export async function schrijfSnapshot(input) {
  const soort = syncOpslagSoort();
  if (soort === "geen") {
    return { ok: false, status: 503, error: "Kluis-sync is niet ingesteld op de server.", ontbreekt: syncOntbreekt() };
  }
  const uit = schoonSnapshot(input);
  if (!uit.ok) return { ok: false, status: 400, error: uit.error };
  if (soort === "blob") await schrijfBlob(uit.snap);
  else await schrijfBestand(uit.snap);
  return { ok: true, updatedAt: uit.snap.updatedAt, bytes: uit.bytes };
}
