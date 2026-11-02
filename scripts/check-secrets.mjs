#!/usr/bin/env node
/**
 * Weigert gecommitte geheimen in deze publieke repo.
 * Geen VITE_* voor toegang; geen hashes, tokens of .env in git.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VERBODEN_NAMEN = new Set([".env", ".env.local", ".env.production", ".env.development"]);
const TOEGESTANE_BESTANDEN = new Set([".env.example", "scripts/check-secrets.mjs", "scripts/check-secrets.test.mjs"]);

export const PATRONEN = [
  { naam: "AUTH_PIN_HASH-waarde", re: /AUTH_PIN_HASH\s*=\s*[a-fA-F0-9]{32,}/ },
  { naam: "AUTH_PEPPER-waarde", re: /AUTH_PEPPER\s*=\s*[a-fA-F0-9]{32,}/ },
  { naam: "AUTH_PIN_SALT-waarde", re: /AUTH_PIN_SALT\s*=\s*[a-fA-F0-9]{32,}/ },
  { naam: "SESSION_SECRET-waarde", re: /SESSION_SECRET\s*=\s*[a-fA-F0-9]{32,}/ },
  { naam: "BLOB-token", re: /BLOB_READ_WRITE_TOKEN\s*=\s*\S{12,}/ },
  { naam: "Vercel-token", re: /VERCEL_TOKEN\s*=\s*\S{12,}/ },
  { naam: "toegang in VITE_", re: /VITE_(AUTH_|SESSION_|PIN_|PEPPER)/ },
];

export function isGeheimenbestand(pad) {
  const basis = pad.split("/").pop();
  if (VERBODEN_NAMEN.has(basis)) return true;
  if (basis === ".env" || /^\.env\.(?!example$).+/.test(basis)) return true;
  if (basis.endsWith(".pem") || basis === "id_rsa" || basis === "id_ed25519") return true;
  return false;
}

export function vindLekken(pad, tekst) {
  if (TOEGESTANE_BESTANDEN.has(pad)) return [];
  const hits = [];
  for (const p of PATRONEN) {
    if (p.re.test(tekst)) hits.push(p.naam);
  }
  return hits;
}

export function scanBestanden(bestanden, lees = pad => readFileSync(pad, "utf8")) {
  const fouten = [];
  for (const pad of bestanden) {
    if (!pad) continue;
    if (isGeheimenbestand(pad)) {
      fouten.push(`${pad}: geheimenbestand mag niet in git`);
      continue;
    }
    let tekst;
    try {
      tekst = lees(pad);
    } catch {
      continue;
    }
    if (typeof tekst !== "string") continue;
    for (const naam of vindLekken(pad, tekst)) fouten.push(`${pad}: ${naam}`);
  }
  return fouten;
}

function gitBestanden() {
  const raw = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  return raw.split("\0").filter(Boolean);
}

const isHoofd = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isHoofd) {
  const fouten = scanBestanden(gitBestanden());
  if (fouten.length) {
    console.error("Geheimen in de publieke repo:");
    for (const f of fouten) console.error(" -", f);
    process.exit(1);
  }
  console.log("Geen gecommitte toegangsheimen gevonden.");
}
