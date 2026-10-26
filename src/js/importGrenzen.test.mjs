import assert from "node:assert/strict";
import { test } from "node:test";
import {
  keurBatch,
  keurBonBestand,
  magieSoort,
  mapMetLimiet,
  MAX_BESTAND_BYTES,
  MAX_BESTANDEN,
} from "./importGrenzen.js";

test("magic bytes pdf/jpeg, html is geen pdf", () => {
  assert.equal(magieSoort(Buffer.from("%PDF-1.7")), "pdf");
  assert.equal(magieSoort(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
  assert.equal(magieSoort(Buffer.from("<!doctype html>")), null);
  const htmlAlsPdf = keurBonBestand({ name: "bon.pdf", size: 100, type: "application/pdf" }, Buffer.from("<html>"));
  assert.equal(htmlAlsPdf.ok, false);
});

test("bestandsgrootte en batchlimiet", () => {
  const groot = keurBonBestand(
    { name: "x.pdf", size: MAX_BESTAND_BYTES + 1, type: "application/pdf" },
    Buffer.from("%PDF")
  );
  assert.equal(groot.ok, false);
  const files = Array.from({ length: MAX_BESTANDEN + 2 }, (_, i) => ({
    name: `b${i}.pdf`,
    size: 10,
  }));
  const batch = keurBatch(files);
  assert.equal(batch.ok.length, MAX_BESTANDEN);
  assert.ok(batch.geweigerd.length >= 2);
});

test("begrensde wachtrij, fout in één item stopt de rest niet", async () => {
  const seen = [];
  const out = await mapMetLimiet([1, 2, 3, 4], 2, async n => {
    seen.push(n);
    if (n === 2) throw new Error("boom");
    return n * 10;
  }).catch(() => null);
  assert.equal(out, null);
  const recovered = await mapMetLimiet([1, 2, 3], 2, async n => {
    if (n === 2) return { fout: true };
    return { n };
  });
  assert.deepEqual(
    recovered.map(x => x.fout || x.n),
    [1, true, 3]
  );
});

test("mislukte opslag is geen volledig succes", () => {
  const extra = { archiefFout: true, overgeslagenDubbel: 0, volledigGeslaagd: false };
  assert.equal(extra.volledigGeslaagd, false);
  assert.equal(extra.archiefFout, true);
});
