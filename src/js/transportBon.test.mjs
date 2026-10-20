import {
  parseTransportBonText,
  matchPlaatsNaam,
  lookupRouteKm,
  voorstelIsKlaar,
} from "./transportBon.js";

const SAMPLE = `
1 sur 1
Omschrijving Roes-249975-plaatjes
Conditionering Ambient (15 - 25)
Verpakking Exam
IHcT61062594 Lus
Extra info
Barcode verpakking
Pickup 18/10/2026 23:15
Org RKV GENT
Stop RKV K12 BBL
Afd RKV Bloedbanklab Gent
Adr Corneel Heymanslaan 10,9000 Gent
Det 1ste verdiep, route 1238
Dropoff 19/10/2026 00:45
Org Brugge AZ St.Jan AV
Stop Bloedbank
Afd Bloedbank
Adr Ruddershove 10,8000 Brugge
Det 6e verdiep Route 627
UN3373 BIOLOGICAL SUBSTANCE CATEGORY B
Drin
`;

const messy = SAMPLE.replace(/Org /g, "Org: ").replace(/IHcT/, "lHcT");
const ocrLike = `
Pickup 18/10/2026 23:15
or. RKV GENT
stp RKV K12 BBL
Dropoff 19/10/2026 00:45
org. Brugge AZ St.Jan AV
IHcT61062594 Lus
`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const p = parseTransportBonText(SAMPLE);
assert(p.bon === "IHcT61062594", "bon " + p.bon);
assert(p.datum === "2026-10-18", "datum " + p.datum);
assert(p.vertrekTijd === "23:15", "tijd " + p.vertrekTijd);
assert(/rkv gent/i.test(p.vertrek), "vertrek " + p.vertrek);
assert(/brugge az st/i.test(p.bestemming), "bestemming " + p.bestemming);

const p2 = parseTransportBonText(messy);
assert(p2.bon === "IHcT61062594", "messy bon " + p2.bon);
assert(p2.vertrekTijd === "23:15", "messy tijd");

const p3 = parseTransportBonText(ocrLike);
assert(/rkv gent/i.test(p3.vertrek), "ocr vertrek " + p3.vertrek);
assert(/brugge az st/i.test(p3.bestemming), "ocr bestemming " + p3.bestemming);

const van = matchPlaatsNaam(p.vertrek);
const naar = matchPlaatsNaam(p.bestemming);
assert(van && /rkv gent/i.test(van.name), "match vertrek " + van?.name);
assert(naar && /sint-jan/i.test(naar.name), "match bestemming " + naar?.name);

const km = lookupRouteKm(van.name, naar.name);
console.log("km prijslijst", km, van.name, "→", naar.name);

assert(
  voorstelIsKlaar({ f: van.name, t: naar.name, d: p.datum, k: 55 }),
  "voorstel klaar"
);

console.log("ok", { bon: p.bon, d: p.datum, ti: p.vertrekTijd, van: van.name, naar: naar.name, km });
