import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isKluisEnvelope,
  leidSleutelAf,
  ontsleutelTekst,
  standaardMeta,
  nieuweZout,
  versleutelTekst,
  KLUIS_PREFIX,
} from "./kluisCrypto.js";

test("AES-GCM rondreis, sleutel niet in de envelop", async () => {
  const meta = standaardMeta(nieuweZout(), 62);
  const key = await leidSleutelAf("test-code-9321", meta);
  const src = JSON.stringify({ r: [{ id: "1", f: "AZ Diest", t: "UZ Leuven" }] });
  const enc = await versleutelTekst(key, src);
  assert.equal(isKluisEnvelope(enc), true);
  assert.ok(enc.startsWith(KLUIS_PREFIX));
  assert.equal(enc.includes(src), false);
  assert.equal(enc.includes("test-code-9321"), false);
  assert.equal(JSON.stringify(meta).includes("test-code-9321"), false);
  const back = await ontsleutelTekst(key, enc);
  assert.equal(back, src);
});

test("verkeerde code ontsleutelt niet", async () => {
  const meta = standaardMeta(nieuweZout(), 62);
  const goed = await leidSleutelAf("goed-8888", meta);
  const fout = await leidSleutelAf("fout-0000", meta);
  const enc = await versleutelTekst(goed, "geheim");
  await assert.rejects(() => ontsleutelTekst(fout, enc));
});

test("meta bevat zout en kdf, geen sleutel", () => {
  const meta = standaardMeta(nieuweZout(), 90);
  assert.equal(meta.kdf, "PBKDF2");
  assert.equal(meta.hash, "SHA-256");
  assert.ok(meta.zout);
  assert.equal("key" in meta, false);
  assert.equal(meta.retentionDays, 90);
});
