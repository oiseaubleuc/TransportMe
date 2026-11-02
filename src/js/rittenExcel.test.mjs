import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ExcelJS from "exceljs";
import {
  leesRittenExcel,
  meldingExcelInlees,
  periodeUitBestandsnaam,
  voegExcelRittenToe,
} from "./rittenExcel.js";

test("Oktober26_.xlsx wordt oktober 2026", () => {
  assert.deepEqual(periodeUitBestandsnaam("Oktober26_.xlsx", 2024), { jaar: 2026, maand: 10 });
  assert.deepEqual(periodeUitBestandsnaam("okt-26.xlsx", 2024), { jaar: 2026, maand: 10 });
  assert.deepEqual(periodeUitBestandsnaam("Ritten_augustus_2025.xlsx", 2024), { jaar: 2025, maand: 8 });
});

test("rittenlijst zonder datum-kolom gebruikt de maand in de bestandsnaam", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rittenregistratie");
  ws.getCell("A1").value = "Prijs/schijf (€):";
  ws.getCell("B1").value = 25;
  ws.getCell("C1").value = "Toeslag (€):";
  ws.getCell("D1").value = 10;
  ws.getRow(2).values = [null, "Bonnummer", "Datum", "Pickup uur", "Nachtrit", "Vertrek", "Bestemming", "KM"];
  ws.getRow(3).values = [null, "IHcT1", null, null, "Nacht", "RKV Sango", "RKV Leuven", 23];
  ws.getRow(4).values = [null, "IHcT2", null, null, "Dag", "RKV Brussel", "RKV GENT", 49];
  const buf = await wb.xlsx.writeBuffer();
  const uit = await leesRittenExcel(buf, {
    bestandsnaam: "Oktober26_.xlsx",
    nu: new Date("2026-10-29T12:00:00Z"),
    maakId: () => "id",
  });
  assert.equal(uit.ritten.length, 2);
  assert.equal(uit.overgeslagen, 0);
  assert.equal(uit.ritten[0].d, "2026-10-01");
  assert.equal(uit.ritten[0].f, "RKV Sango");
  assert.equal(uit.ritten[1].t, "RKV GENT");
  assert.equal(uit.ritten[0].bon, "IHcT1");
});

test("zelfde bon, andere route is geen duplicaat", () => {
  const a = { bon: "IHcT1", f: "RKV Sango", t: "RKV Leuven", d: "2026-10-01", k: 23 };
  const b = { bon: "IHcT1", f: "RKV Brussel", t: "Edegem UZAntwerpen", d: "2026-10-01", k: 40 };
  const uit = voegExcelRittenToe([a], [b]);
  assert.equal(uit.toegevoegd.length, 1);
  assert.equal(uit.duplicaten, 0);
});

test("melding noemt ontbrekende datum", () => {
  const t = meldingExcelInlees({ toegevoegd: 0, duplicaten: 0, overgeslagen: 58, redenen: { "geen-datum": 58 } });
  assert.match(t, /Oktober26/);
});

const echte = "/home/ubuntu/.cursor/projects/workspace/uploads/Oktober26__9e2e.xlsx";
test("klantbestand Oktober26 wordt ingelezen", async t => {
  let buf;
  try {
    buf = readFileSync(echte);
  } catch {
    t.skip("upload ontbreekt");
    return;
  }
  const uit = await leesRittenExcel(buf, {
    bestandsnaam: "Oktober26_.xlsx",
    nu: new Date("2026-10-29T12:00:00Z"),
  });
  assert.ok(uit.ritten.length >= 50, `verwacht tientallen ritten, kreeg ${uit.ritten.length}`);
  assert.equal(uit.ritten[0].d, "2026-10-01");
  assert.ok(uit.ritten.some(r => r.f === "RKV Sango"));
  assert.equal(uit.ritten.some(r => String(r.d || "").startsWith("2026-10")), true);
});
