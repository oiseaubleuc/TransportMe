#!/usr/bin/env node
/**
 * Maakt AUTH_PIN_HASH / SALT / PEPPER / SESSION_SECRET.
 * De code wordt van stdin gelezen — niet als argument (blijft uit process lists).
 *
 *   node scripts/hash-pin.mjs
 *   printf '%s' 'jouw-code' | node scripts/hash-pin.mjs
 */
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { hashPin, SCRYPT } from "../server/authCore.mjs";

async function leesPin() {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  process.stderr.write("Toegangscode (min. 4, bij voorkeur 8+ tekens; invoer blijft onzichtbaar): ");
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const pin = await new Promise(resolve => {
    if (process.stdin.setRawMode) process.stdin.setRawMode(true);
    let s = "";
    const onData = buf => {
      const c = buf.toString("utf8");
      if (c === "\n" || c === "\r") {
        process.stdin.off("data", onData);
        if (process.stdin.setRawMode) process.stdin.setRawMode(false);
        process.stderr.write("\n");
        rl.close();
        resolve(s);
        return;
      }
      if (c === "\u0003") process.exit(1);
      if (c === "\u007f") {
        s = s.slice(0, -1);
        return;
      }
      s += c;
    };
    process.stdin.on("data", onData);
  });
  return pin;
}

const pin = await leesPin();
if (!pin || pin.length < 4 || pin.length > 64) {
  console.error("De toegangscode moet 4 tot 64 tekens zijn.");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const pepper = randomBytes(16).toString("hex");
const secret = randomBytes(32).toString("hex");
const hash = await hashPin(pin, salt, pepper);

process.stdout.write(
  [
    "# Zet deze waarden in Vercel → Project → Settings → Environment Variables",
    "# en lokaal in .env (nooit VITE_*, nooit in de frontend).",
    `# scrypt N=${SCRYPT.N} r=${SCRYPT.r} p=${SCRYPT.p} keylen=${SCRYPT.keylen}`,
    `SESSION_SECRET=${secret}`,
    `AUTH_PIN_SALT=${salt}`,
    `AUTH_PIN_HASH=${hash}`,
    `AUTH_PEPPER=${pepper}`,
    "",
  ].join("\n")
);
