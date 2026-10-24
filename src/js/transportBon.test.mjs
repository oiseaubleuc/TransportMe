import {
  parseTransportBonText,
  matchPlaatsNaam,
  lookupRouteKm,
  voorstelIsKlaar,
  splitBonStukken,
  bonInhoudRegels,
  tripUitVoorstel,
  vindBestaandeRit,
  koppelBonAanRit,
  voorstelRijKlaar,
  markeerDubbeleRijen,
  isDubbeleBon,
  dubbeleMelding,
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

/** Echte IHcT-export-PDF (labels links, waarden rechts, Pickup boven Dropoff). */
const SAMPLE_PDF = `
Omschrijving Geen Omschrijving
Conditionering Ambiënt (15° - 25°)
Drin
Verpakking Box - Large (<30 l)
IHcT61004279 Extra info
Lus
Barcode
verpakking
Pickup 02/06/2026 21:46
Org. Diest AZ
Stop Bloedbank
Afd. Labo Klinische Biologie
Adr. Statiestraat 65,3290 Diest
Det. Blauwe pijl naar 4de verd.
Dropoff 02/06/2026 23:16
Org. UZ Leuven
Stop Centrale balie
Afd. Laboratoriumgeneeskunde
Adr. Herestraat 49,3000 Leuven
Det. Blauwe straat, Poort 7, Niveau 7 (BL 7.7)
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

assert(p.aankomstTijd === "00:45", "aankomst " + p.aankomstTijd);
assert(/corneel heymanslaan/i.test(p.pickup.adr), "pickup adr " + p.pickup.adr);
assert(/ruddershove/i.test(p.dropoff.adr), "dropoff adr " + p.dropoff.adr);
assert(/rkv k12/i.test(p.pickup.stop), "pickup stop " + p.pickup.stop);
assert(/roes-249975/i.test(p.omschrijving), "omschrijving " + p.omschrijving);
assert(/ambient/i.test(p.conditionering), "conditionering " + p.conditionering);
assert(/exam/i.test(p.verpakking), "verpakking " + p.verpakking);
assert(p.lus === true, "lus");
assert(p.dringend === true, "drin");
assert(/UN3373/i.test(p.un3373), "un3373 " + p.un3373);
assert(!p.extra, "extra leeg, niet barcode: " + p.extra);

const regels = bonInhoudRegels({
  omschrijving: p.omschrijving,
  conditionering: p.conditionering,
  pickup: p.pickup,
  dropoff: p.dropoff,
  lus: true,
  dringend: true,
  un3373: p.un3373,
  aankomstTijd: p.aankomstTijd,
});
assert(regels.some(r => r.l === "Omschrijving" && /plaatjes/i.test(r.v)), "regel omschrijving");
assert(regels.some(r => r.l === "Ophalen" && /heymanslaan/i.test(r.v)), "regel ophalen");

const twee = splitBonStukken(`${SAMPLE}\nIHcT61069999 Lus\nPickup 19/10/2026 08:00\nOrg SANGO\nDropoff 19/10/2026 09:00\nOrg UZA`);
assert(twee.length === 2, "split aantal " + twee.length);
assert(/IHcT61062594/.test(twee[0]), "split eerste");
assert(/IHcT61069999/.test(twee[1]), "split tweede");

const trip = tripUitVoorstel(
  {
    bon: p.bon,
    f: van.name,
    t: naar.name,
    d: p.datum,
    ti: p.vertrekTijd,
    k: 53,
    s: "voltooid",
    inhoud: { omschrijving: p.omschrijving, pickup: p.pickup, dropoff: p.dropoff, raw: SAMPLE.trim() },
  },
  { id: "t1", chauffeur: "Houdaifa", voertuig: "V1", bestandId: "b1" }
);
assert(trip.bon === "IHcT61062594", "trip bon");
assert(trip.bonBestandId === "b1", "trip bestand");
assert(/plaatjes/i.test(trip.bonInhoud.omschrijving), "trip inhoud");
assert(/heymanslaan/i.test(trip.bonInhoud.pickup.adr), "trip pickup adr");

const pdf = parseTransportBonText(SAMPLE_PDF);
assert(pdf.bon === "IHcT61004279", "pdf bon " + pdf.bon);
assert(pdf.datum === "2026-06-02", "pdf datum " + pdf.datum);
assert(pdf.vertrekTijd === "21:46", "pdf tijd " + pdf.vertrekTijd);
assert(pdf.aankomstTijd === "23:16", "pdf aankomst " + pdf.aankomstTijd);
assert(/diest az/i.test(pdf.vertrek), "pdf vertrek " + pdf.vertrek);
assert(/uz leuven/i.test(pdf.bestemming), "pdf bestemming " + pdf.bestemming);
assert(/statiestraat/i.test(pdf.pickup.adr), "pdf pickup adr");
assert(/herestraat/i.test(pdf.dropoff.adr), "pdf dropoff adr");
assert(/geen omschrijving/i.test(pdf.omschrijving), "pdf omschrijving " + pdf.omschrijving);
assert(/ambi/i.test(pdf.conditionering), "pdf conditionering");
assert(/box/i.test(pdf.verpakking), "pdf verpakking");
assert(pdf.lus === true, "pdf lus");
assert(pdf.dringend === true, "pdf drin");
const pdfVan = matchPlaatsNaam(pdf.vertrek);
const pdfNaar = matchPlaatsNaam(pdf.bestemming);
assert(pdfVan && /diest/i.test(pdfVan.name), "pdf match vertrek " + pdfVan?.name);
assert(pdfNaar && /leuven/i.test(pdfNaar.name), "pdf match bestemming " + pdfNaar?.name);
const pdfKm = lookupRouteKm(pdfVan.name, pdfNaar.name);
assert(pdfKm === 36, "pdf km prijslijst " + pdfKm);

const gepland = {
  id: "r-oud",
  bon: "IHcT61004279",
  d: "2026-06-02",
  f: "Diest AZ",
  t: "UZ Leuven",
  s: "komend",
};
const pdfVoorstel = { bon: pdf.bon, f: pdf.vertrek, t: pdf.bestemming, d: pdf.datum, k: 36, s: "voltooid" };
assert(vindBestaandeRit([gepland], pdfVoorstel).id === "r-oud", "vind op bonnummer");
assert(vindBestaandeRit([{ ...gepland, bon: "" }], pdfVoorstel).id === "r-oud", "vind op dag+route");
const koppel = koppelBonAanRit(pdfVoorstel, [gepland]);
assert(koppel.vraagVoltooid === true, "vraag voltooid bij eerdere rit");
assert(koppel.voltooidKeuze == null, "wacht op ja/nee");
assert(!voorstelRijKlaar(koppel), "niet klaar zonder antwoord");
assert(voorstelRijKlaar({ ...koppel, f: pdf.vertrek, t: pdf.bestemming, d: pdf.datum, k: 36, voltooidKeuze: true }), "klaar na ja");

const batch = markeerDubbeleRijen([
  { id: "a", bon: "IHcT61004279", f: "Diest AZ", t: "UZ Leuven", d: "2026-06-02", k: 36 },
  { id: "b", bon: "IHcT61004279", f: "Diest AZ", t: "UZ Leuven", d: "2026-06-02", k: 36 },
  { id: "c", bon: "IHcT61069999", f: "RKV Sango", t: "UZA (Edegem)", d: "2026-10-19", k: 17 },
]);
assert(batch[0].dubbelInBatch === false, "eerste geen batch-dubbel");
assert(batch[1].dubbelInBatch === true, "tweede is batch-dubbel");
assert(batch[2].dubbelInBatch === false, "andere bon geen dubbel");
assert(isDubbeleBon({ bestaandId: "x", vraagVoltooid: false }), "al in lijst = dubbel");
assert(!isDubbeleBon({ bestaandId: "x", vraagVoltooid: true }), "open eerdere rit is geen stille dubbel");
const melding = dubbeleMelding([
  { bon: "IHcT61004279", bestaandId: "r-oud", vraagVoltooid: false },
  { bon: "IHcT61069999", dubbelInBatch: true },
]);
assert(/al in de lijst/i.test(melding), "melding lijst " + melding);
assert(/twee keer/i.test(melding), "melding batch " + melding);

assert(
  voorstelIsKlaar({ f: van.name, t: naar.name, d: p.datum, k: 55 }),
  "voorstel klaar"
);

console.log("ok", { bon: p.bon, d: p.datum, ti: p.vertrekTijd, van: van.name, naar: naar.name, km, extra: regels.length });
