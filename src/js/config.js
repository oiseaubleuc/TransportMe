/**
 * Configuratie – vergoeding, storage keys, vaste ritten
 */

export const OPSTART_PREMIE = 15;
export const VERGOEDING_PER_20KM = 25;
export const KM_SCHIJF = 20;
/**
 * Nacht: aantal km-schijven × deze factor, daarna omhoog naar hele schijven × €25.
 * Niet op opstartpremie en niet op forfait.
 */
export const NACHT_TARIEF_FACTOR = 1.3;
/** Zelfde factor als percentage (uitleg in UI). */
export const NACHT_TOESLAG_PERCENT = Math.round((NACHT_TARIEF_FACTOR - 1) * 100);
/** Geschat verbruik voor rendabiliteit nieuwe rit: L benzine per 100 km. */
export const GESCHAT_VERBRUIK_L_PER_100KM = 5;
/** Nachttarief vanaf dit uur (inclusief), bv. 20 → vanaf 20:00. */
export const NACHT_START_UUR = 20;
/** Dagtarief vanaf dit uur ’s ochtends: uur &lt; deze waarde = nacht (dus t/m 04:59 bij waarde 5 → nacht eindigt om 5:00). */
export const NACHT_EIND_UUR = 5;

/** Forfait RKV Sango ↔ UZA Edegem (excl. btw), per rit. */
export const FORFAIT_SANGO_UZA_EXCL_BTW = 35;

export const STORAGE_KEYS = {
  ritten: 'transporteur_ritten',
  brandstof: 'transporteur_brandstof',
  overig: 'transporteur_overig',
  planning: 'transporteur_planning_beschikbaarheid',
  ziekenhuizen: 'transporteur_ziekenhuizen',
  presetRoutes: 'transporteur_preset_routes',
  voertuigen: 'transporteur_voertuigen',
  currentProfile: 'transporteur_current_profile',
  /** Eénmalig: Test-profiel is samengevoegd in houdaifa */
  mergedTestProfile: 'transporteur_merged_test_to_houdaifa_v1',
  /** Eénmalig: teller-reset gevraagd door business (ritten/brandstof/overig op nul) */
  resetAllCountersV1: 'transporteur_reset_all_counters_v1',
  /** Eénmalig: data opgeschoond en naar nieuw schema gebracht */
  dataCleanupV2: 'transporteur_data_cleanup_v2',
  /** Eénmalig: ziekenhuizen / preset-routes / voertuigen van globaal naar per profiel */
  migrateListsPerProfileV1: 'transporteur_migrate_lists_per_profile_v1',
  /** Live aanwezigheidsstatus (vervalt automatisch) */
  liveAvailability: 'transporteur_live_availability_v1',
  /** Factuurgegevens + logo per profiel (Meer-tab) */
  factuurGegevens: 'transporteur_factuur_gegevens',
  /** Oplopend factuurnummer per jaar per profiel: { "2026": 5 } */
  factuurTeller: 'transporteur_factuur_teller',
};

/** Live status "beschikbaar": vervalt automatisch na 6 uur */
export const LIVE_AVAILABILITY_TTL_MS = 6 * 60 * 60 * 1000;

/** Profielen (zelfstandigen): elk eigen dataset ritten / brandstof / overig in localStorage */
export const PROFILES = [
  { id: 'houdaifa', name: 'Houdaifa' },
  { id: 'amine', name: 'Amine' },
  { id: 'frederik', name: 'Frederik' },
];

/** Ritten, brandstof en overige kosten: max. bewaard (rolling window, dagen) */
export const DATA_RETENTION_DAYS = 62;

/** Compacte UI: korte lijsten, scrollblokken, beheer zonder eindeloze pagina */
export const UI_COMPACT = {
  dashboardVandaagRitten: 4,
  /** Komende/lopende ritten op dashboard: praktisch alles tonen (scroll in CSS) */
  dashboardStatusRitten: 500,
  ritKaartLijstMaxHoogteRem: 10,
  rittenTabelWeken: 8,
  rittenPerWeekInTabel: 15,
  dataTabelScrollMaxRem: 14,
  ziekenhuizenPreview: 12,
  kaartRitKeuzeMax: 80,
  grafiekWeken: 6,
  /** Één overzichts-feed op tab Ritten */
  rittenFeedMax: 500,
};

export const PERIOD_LABELS = {
  day: 'Vandaag',
  week: 'Deze week',
  month: 'Deze maand',
};

/** Vaste duur per rit: 2u30 = 150 minuten */
export const RIT_DUUR_MINUTEN = 150;

/** Standaard chauffeurs (keuze bij komende ritten) */
export const DEFAULT_CHAUFFEURS = [
  { id: 'chauffeur-houdaifa', naam: 'Houdaifa' },
  { id: 'chauffeur-amine', naam: 'Amine' },
  { id: 'chauffeur-frederik', naam: 'Frederik' },
  { id: 'chauffeur-student1', naam: 'Student1' },
];

/** Standaard voertuigen (worden bij eerste gebruik of merge toegevoegd) */
export const DEFAULT_VOERTUIGEN = [
  { id: 'voertuig-2HKN136', naam: 'Audi A3', kenteken: '2HKN136' },
  { id: 'voertuig-2GGW635', naam: 'BMW Serie 1', kenteken: '2GGW635' },
];

/**
 * Vaste ankertjes voor preset-routes (id’s moeten overeenkomen met DEFAULT_PRESET_ROUTES).
 * Daarna alle ziekenhuizen/locaties uit OpenStreetMap binnen Vlaams Gewest (BE-VLG).
 */
export const PRESET_ANCHOR_ZIEKENHUIZEN = [
  { id: 'uz-brussel', name: 'UZ Brussel', address: 'UZ Brussel', lat: 50.8824, lng: 4.2745 },
  { id: 'uz-leuven', name: 'UZ Leuven', address: 'UZ Leuven', lat: 50.8814, lng: 4.671 },
  { id: 'uza', name: 'UZA (Edegem)', address: 'UZA (Edegem)', lat: 51.1552, lng: 4.4452 },
  { id: 'deurne', name: 'AZ Deurne (AZ Monica)', address: 'AZ Deurne (AZ Monica)', lat: 51.2192, lng: 4.4653 },
  { id: 'herentals', name: 'AZ Herentals', address: 'AZ Herentals', lat: 51.1766, lng: 4.8325 },
  { id: 'mechelen', name: 'RKV Mechelen', address: 'RKV Mechelen', lat: 51.0257, lng: 4.4776 },
  { id: 'gent', name: 'AZ Gent', address: 'AZ Gent', lat: 51.0225, lng: 3.7108 },
  { id: 'genk', name: 'ZOL Genk', address: 'ZOL Genk', lat: 50.9656, lng: 5.5001 },
  { id: 'az-turnhout', name: 'AZ Turnhout', address: 'AZ Turnhout', lat: 51.3245, lng: 4.9486 },
  { id: 'mol', name: 'AZ Mol (Hart)', address: 'AZ Mol (Hart)', lat: 51.1911, lng: 5.1166 },
  { id: 'brasschaat', name: 'AZ Klina Brasschaat', address: 'AZ Klina Brasschaat', lat: 51.2912, lng: 4.4918 },
  { id: 'virga-jesse', name: 'Virga Jesse Hasselt', address: 'Virga Jesse Hasselt', lat: 50.9307, lng: 5.3378 },
  { id: 'heusden-zolder', name: 'ZOL Heusden-Zolder', address: 'ZOL Heusden-Zolder', lat: 51.0314, lng: 5.3134 },
  { id: 'az-maria-middelares-gent', name: 'AZ Maria Middelares (Gent)', address: 'AZ Maria Middelares (Gent)', lat: 51.0265, lng: 3.6821 },
  { id: 'jessa-hasselt', name: 'Jessa Hasselt', address: 'Jessa Hasselt', lat: 50.9307, lng: 5.3378 },
  { id: 'geel', name: 'AZ Geel', address: 'AZ Geel', lat: 51.1614, lng: 4.9896 },
  { id: 'lier', name: 'AZ Lier', address: 'AZ Lier', lat: 51.1313, lng: 4.5704 },
  { id: 'az-maria-middelares-deinze', name: 'AZ Maria Middelares Deinze', address: 'AZ Maria Middelares Deinze', lat: 50.9871, lng: 3.5311 },
  { id: 'diest', name: 'AZ Diest', address: 'AZ Diest', lat: 50.9894, lng: 5.0506 },
  { id: 'bornem', name: 'Bornem', address: 'Bornem', lat: 51.0972, lng: 4.2436 },
  { id: 'sint-truiden', name: 'Sint-Truiden', address: 'Sint-Truiden', lat: 50.8158, lng: 5.1863 },
  {
    id: 'st-franciscus-heusden',
    name: 'Heusden-Zolder St. Franciscus (SFZ)',
    address: 'Pastoor Paquaylaan, Heusden-Zolder',
    lat: 51.047,
    lng: 5.3153,
  },
  { id: 'hh-lier', name: 'Lier Heilig Hart', address: 'Heilig Hartziekenhuis Lier', lat: 51.1284, lng: 4.5708 },
  { id: 'az-voorkempen-malle', name: 'Malle AZ Voorkempen', address: 'AZ Voorkempen Malle', lat: 51.2995, lng: 4.7295 },
  {
    id: 'st-elisabeth-turnhout',
    name: 'Turnhout St. Elisabeth',
    address: 'Sint-Elisabethziekenhuis Turnhout',
    lat: 51.321,
    lng: 4.936,
  },
  { id: 'az-st-trudo', name: 'Sint-Truiden AZ St. Trudo', address: 'AZ St. Trudo Sint-Truiden', lat: 50.8165, lng: 5.1895 },
  { id: 'uz-gent', name: 'Gent UZ', address: 'UZ Gent', lat: 51.0361, lng: 3.7284 },
  { id: 'az-st-dimpna-geel', name: 'Geel St. Dimpna', address: 'AZ Sint-Dimpna Geel', lat: 51.1622, lng: 4.9938 },
  { id: 'az-monica-deurne', name: 'Deurne AZ Monica', address: 'AZ Monica Deurne', lat: 51.2192, lng: 4.4653 },
  { id: 'az-rivierenland-bornem', name: 'Bornem AZ Rivierenland', address: 'AZ Rivierenland Bornem', lat: 51.091, lng: 4.24 },
  { id: 'rkv-exploro', name: 'RKV Exploro', address: 'RKV Exploro (Gent)', lat: 51.0225, lng: 3.7108 },
  { id: 'zottegem', name: 'Zottegem St. Elisabeth AZ', address: 'AZ Sint-Elisabeth Zottegem', lat: 50.8637, lng: 3.8173 },
  { id: 'imelda', name: 'Bonheiden Imelda', address: 'Imelda Ziekenhuis Bonheiden', lat: 51.0175, lng: 4.5586 },
  { id: 'az-sint-maarten', name: 'Mechelen AZ Sint-Maarten', address: 'AZ Sint-Maarten Mechelen', lat: 51.0515, lng: 4.4765 },
  { id: 'upc-duffel', name: 'Duffel UPC', address: 'UPC Duffel', lat: 51.0936, lng: 4.4953 },
  { id: 'rumst', name: 'Rumst AZ Rivierenland', address: 'AZ Rivierenland Rumst', lat: 51.1063, lng: 4.3718 },
  { id: 'willebroek', name: 'Willebroek AZ Rivierenland', address: 'AZ Rivierenland Willebroek', lat: 51.0544, lng: 4.3587 },
  { id: 'halle', name: 'Halle AZ Sint-Maria', address: 'AZ Sint-Maria Halle', lat: 50.7363, lng: 4.2258 },
  { id: 'tienen', name: 'Tienen RZ Mariëndal', address: 'RZ Tienen Campus Mariëndal', lat: 50.8109, lng: 4.9334 },
  { id: 'vilvoorde', name: 'Vilvoorde AZ Jan Portaels', address: 'AZ Jan Portaels Vilvoorde', lat: 50.9276, lng: 4.4182 },
  { id: 'dendermonde', name: 'Dendermonde AZ Sint-Blasius', address: 'AZ Sint-Blasius Dendermonde', lat: 51.0264, lng: 4.114 },
  { id: 'aalst', name: 'Aalst AZORG', address: 'AZORG Aalst Moorselbaan', lat: 50.9439, lng: 4.0551 },
];

/** Beperkte, herkenbare standaardlijst (geen volledige OSM-massa) */
export const DEFAULT_ZIEKENHUIZEN = [...PRESET_ANCHOR_ZIEKENHUIZEN];

/**
 * Vaste ritten — defaultKm = afgeronde OSRM rijroute (driving-car), in lijn met Google Maps.
 * Uitgebreid met factuurritten (o.a. UZA↔Brussel, Leuven↔Mechelen, Exploro→Zottegem, Genk→UZ Gent).
 */
export const DEFAULT_PRESET_ROUTES = [
  { id: 'preset-excel-1', fromId: 'uz-brussel', toId: 'uz-leuven', fromName: 'UZ Brussel', toName: 'UZ Leuven', defaultKm: 36 },
  { id: 'preset-excel-2', fromId: 'uz-brussel', toId: 'uza', fromName: 'UZ Brussel', toName: 'UZA (Edegem)', defaultKm: 41 },
  { id: 'preset-excel-3', fromId: 'uz-brussel', toId: 'deurne', fromName: 'UZ Brussel', toName: 'AZ Deurne (AZ Monica)', defaultKm: 47 },
  { id: 'preset-excel-4', fromId: 'uz-brussel', toId: 'herentals', fromName: 'UZ Brussel', toName: 'AZ Herentals', defaultKm: 74 },
  { id: 'preset-excel-5', fromId: 'uz-brussel', toId: 'mechelen', fromName: 'UZ Brussel', toName: 'RKV Mechelen', defaultKm: 31 },
  { id: 'preset-excel-6', fromId: 'uz-brussel', toId: 'gent', fromName: 'UZ Brussel', toName: 'AZ Gent', defaultKm: 49 },
  { id: 'preset-excel-7', fromId: 'uz-brussel', toId: 'genk', fromName: 'UZ Brussel', toName: 'ZOL Genk', defaultKm: 104 },
  { id: 'preset-excel-8', fromId: 'uz-brussel', toId: 'az-turnhout', fromName: 'UZ Brussel', toName: 'AZ Turnhout', defaultKm: 88 },
  { id: 'preset-excel-9', fromId: 'uz-brussel', toId: 'mol', fromName: 'UZ Brussel', toName: 'AZ Mol (Hart)', defaultKm: 99 },
  { id: 'preset-excel-10', fromId: 'uz-brussel', toId: 'brasschaat', fromName: 'UZ Brussel', toName: 'AZ Klina Brasschaat', defaultKm: 58 },
  { id: 'preset-excel-11', fromId: 'uz-brussel', toId: 'virga-jesse', fromName: 'UZ Brussel', toName: 'Virga Jesse Hasselt', defaultKm: 92 },
  { id: 'preset-excel-11a', fromId: 'virga-jesse', toId: 'genk', fromName: 'Virga Jesse Hasselt', toName: 'ZOL Genk', defaultKm: 15 },
  { id: 'preset-excel-11b', fromId: 'uz-brussel', toId: 'bornem', fromName: 'UZ Brussel', toName: 'Bornem', defaultKm: 34 },
  { id: 'preset-excel-11c', fromId: 'uz-brussel', toId: 'sint-truiden', fromName: 'UZ Brussel', toName: 'Sint-Truiden', defaultKm: 75 },
  { id: 'preset-excel-12', fromId: 'mechelen', toId: 'gent', fromName: 'RKV Mechelen', toName: 'AZ Gent', defaultKm: 78 },
  { id: 'preset-excel-13', fromId: 'mechelen', toId: 'genk', fromName: 'RKV Mechelen', toName: 'ZOL Genk', defaultKm: 90 },
  { id: 'preset-excel-14', fromId: 'mechelen', toId: 'uz-leuven', fromName: 'RKV Mechelen', toName: 'UZ Leuven', defaultKm: 39 },
  {
    id: 'preset-excel-15',
    fromId: 'mechelen',
    toId: 'uza',
    fromName: 'RKV Mechelen',
    toName: 'UZA (Edegem)',
    defaultKm: 17,
    /** Forfait RIZIV/RKV (enkel deze richting); overschrijft km-tarief bij nieuwe rit */
    forfaitVergoeding: 35,
  },
  { id: 'preset-excel-16', fromId: 'mechelen', toId: 'herentals', fromName: 'RKV Mechelen', toName: 'AZ Herentals', defaultKm: 52 },
  { id: 'preset-excel-17', fromId: 'mechelen', toId: 'uz-brussel', fromName: 'RKV Mechelen', toName: 'UZ Brussel', defaultKm: 32 },
  { id: 'preset-excel-18', fromId: 'mechelen', toId: 'heusden-zolder', fromName: 'RKV Mechelen', toName: 'ZOL Heusden-Zolder', defaultKm: 76 },
  { id: 'preset-excel-19', fromId: 'mechelen', toId: 'az-maria-middelares-gent', fromName: 'RKV Mechelen', toName: 'AZ Maria Middelares (Gent)', defaultKm: 79 },
  { id: 'preset-excel-20', fromId: 'mechelen', toId: 'jessa-hasselt', fromName: 'RKV Mechelen', toName: 'Jessa Hasselt', defaultKm: 77 },
  { id: 'preset-excel-21', fromId: 'mechelen', toId: 'geel', fromName: 'RKV Mechelen', toName: 'AZ Geel', defaultKm: 66 },
  { id: 'preset-excel-22', fromId: 'mechelen', toId: 'az-turnhout', fromName: 'RKV Mechelen', toName: 'AZ Turnhout', defaultKm: 66 },
  { id: 'preset-excel-23', fromId: 'mechelen', toId: 'mol', fromName: 'RKV Mechelen', toName: 'AZ Mol', defaultKm: 76 },
  { id: 'preset-excel-24', fromId: 'mechelen', toId: 'lier', fromName: 'RKV Mechelen', toName: 'AZ Lier', defaultKm: 17 },
  { id: 'preset-excel-25', fromId: 'mechelen', toId: 'brasschaat', fromName: 'RKV Mechelen', toName: 'Brasschaat AZ Klina', defaultKm: 37 },
  { id: 'preset-excel-26', fromId: 'az-maria-middelares-deinze', toId: 'az-maria-middelares-gent', fromName: 'AZ Maria Middelares Deinze', toName: 'AZ Maria Middelares Gent', defaultKm: 13 },
  { id: 'preset-excel-27', fromId: 'uz-leuven', toId: 'uz-brussel', fromName: 'UZ Leuven', toName: 'UZ Brussel', defaultKm: 35 },
  { id: 'preset-excel-28', fromId: 'uz-leuven', toId: 'uza', fromName: 'UZ Leuven', toName: 'UZA (Edegem)', defaultKm: 52 },
  { id: 'preset-excel-29', fromId: 'uz-leuven', toId: 'diest', fromName: 'UZ Leuven', toName: 'AZ Diest', defaultKm: 36 },
  {
    id: 'preset-mechel-sfz',
    fromId: 'mechelen',
    toId: 'st-franciscus-heusden',
    fromName: 'RKV Mechelen',
    toName: 'Heusden-Zolder St. Franciscus (SFZ)',
    defaultKm: 78,
  },
  {
    id: 'preset-mechel-hh-lier',
    fromId: 'mechelen',
    toId: 'hh-lier',
    fromName: 'RKV Mechelen',
    toName: 'Lier Heilig Hart',
    defaultKm: 16,
  },
  {
    id: 'preset-mechel-voorkempen',
    fromId: 'mechelen',
    toId: 'az-voorkempen-malle',
    fromName: 'RKV Mechelen',
    toName: 'Malle AZ Voorkempen',
    defaultKm: 51,
  },
  {
    id: 'preset-mechel-st-elisabeth',
    fromId: 'mechelen',
    toId: 'st-elisabeth-turnhout',
    fromName: 'RKV Mechelen',
    toName: 'Turnhout St. Elisabeth',
    defaultKm: 64,
  },
  {
    id: 'preset-mechel-st-trudo',
    fromId: 'mechelen',
    toId: 'az-st-trudo',
    fromName: 'RKV Mechelen',
    toName: 'Sint-Truiden AZ St. Trudo',
    defaultKm: 78,
  },
  {
    id: 'preset-mechel-uz-gent',
    fromId: 'mechelen',
    toId: 'uz-gent',
    fromName: 'RKV Mechelen',
    toName: 'Gent UZ',
    defaultKm: 78,
  },
  {
    id: 'preset-mechel-st-dimpna',
    fromId: 'mechelen',
    toId: 'az-st-dimpna-geel',
    fromName: 'RKV Mechelen',
    toName: 'Geel St. Dimpna',
    defaultKm: 65,
  },
  {
    id: 'preset-mechel-monica-deurne',
    fromId: 'mechelen',
    toId: 'az-monica-deurne',
    fromName: 'RKV Mechelen',
    toName: 'Deurne AZ Monica',
    defaultKm: 26,
  },
  {
    id: 'preset-mechel-rivierenland',
    fromId: 'mechelen',
    toId: 'az-rivierenland-bornem',
    fromName: 'RKV Mechelen',
    toName: 'Bornem AZ Rivierenland',
    defaultKm: 22,
  },
  {
    id: 'preset-uza-mechelen',
    fromId: 'uza',
    toId: 'mechelen',
    fromName: 'UZA (Edegem)',
    toName: 'RKV Mechelen',
    defaultKm: 18,
    forfaitVergoeding: 35,
  },
  {
    id: 'preset-uza-brussel',
    fromId: 'uza',
    toId: 'uz-brussel',
    fromName: 'UZA (Edegem)',
    toName: 'UZ Brussel',
    defaultKm: 40,
  },
  {
    id: 'preset-leuven-mechelen',
    fromId: 'uz-leuven',
    toId: 'mechelen',
    fromName: 'UZ Leuven',
    toName: 'RKV Mechelen',
    defaultKm: 37,
  },
  {
    id: 'preset-diest-leuven',
    fromId: 'diest',
    toId: 'uz-leuven',
    fromName: 'AZ Diest',
    toName: 'UZ Leuven',
    defaultKm: 35,
  },
  {
    id: 'preset-genk-uz-gent',
    fromId: 'genk',
    toId: 'uz-gent',
    fromName: 'ZOL Genk',
    toName: 'Gent UZ',
    defaultKm: 148,
  },
  {
    id: 'preset-exploro-zottegem',
    fromId: 'rkv-exploro',
    toId: 'zottegem',
    fromName: 'RKV Exploro',
    toName: 'Zottegem St. Elisabeth AZ',
    defaultKm: 26,
  },
  {
    id: 'preset-brussel-st-elisabeth',
    fromId: 'uz-brussel',
    toId: 'st-elisabeth-turnhout',
    fromName: 'UZ Brussel',
    toName: 'Turnhout St. Elisabeth',
    defaultKm: 86,
  },
];

function presetPairKey(fromId, toId) {
  return `${fromId}\t${toId}`;
}

/** Ontbrekende terugritten van vaste routes — zelfde km, gemarkeerd als potentieel. */
function reversePresetsMissing(actual) {
  const have = new Set(actual.map((r) => presetPairKey(r.fromId, r.toId)));
  const out = [];
  for (const r of actual) {
    const k = presetPairKey(r.toId, r.fromId);
    if (have.has(k)) continue;
    have.add(k);
    const row = {
      id: `preset-rev-${r.id}`,
      fromId: r.toId,
      toId: r.fromId,
      fromName: r.toName,
      toName: r.fromName,
      defaultKm: r.defaultKm,
      potentieel: true,
    };
    if (r.forfaitVergoeding != null) row.forfaitVergoeding = r.forfaitVergoeding;
    out.push(row);
  }
  return out;
}

/**
 * Extra potentiële ritten vanuit de hoofdhubs (Mechelen / Brussel / Leuven)
 * naar veelvoorkomende Vlaamse ziekenhuizen die nog niet als vaste rit staan.
 */
const EXTRA_POTENTIAL_PRESET_ROUTES = [
  { id: 'preset-pot-mec-imelda', fromId: 'mechelen', toId: 'imelda', fromName: 'RKV Mechelen', toName: 'Bonheiden Imelda', defaultKm: 8, potentieel: true },
  { id: 'preset-pot-mec-st-maarten', fromId: 'mechelen', toId: 'az-sint-maarten', fromName: 'RKV Mechelen', toName: 'Mechelen AZ Sint-Maarten', defaultKm: 4, potentieel: true },
  { id: 'preset-pot-mec-duffel', fromId: 'mechelen', toId: 'upc-duffel', fromName: 'RKV Mechelen', toName: 'Duffel UPC', defaultKm: 13, potentieel: true },
  { id: 'preset-pot-mec-rumst', fromId: 'mechelen', toId: 'rumst', fromName: 'RKV Mechelen', toName: 'Rumst AZ Rivierenland', defaultKm: 20, potentieel: true },
  { id: 'preset-pot-mec-willebroek', fromId: 'mechelen', toId: 'willebroek', fromName: 'RKV Mechelen', toName: 'Willebroek AZ Rivierenland', defaultKm: 11, potentieel: true },
  { id: 'preset-pot-mec-vilvoorde', fromId: 'mechelen', toId: 'vilvoorde', fromName: 'RKV Mechelen', toName: 'Vilvoorde AZ Jan Portaels', defaultKm: 19, potentieel: true },
  { id: 'preset-pot-mec-halle', fromId: 'mechelen', toId: 'halle', fromName: 'RKV Mechelen', toName: 'Halle AZ Sint-Maria', defaultKm: 54, potentieel: true },
  { id: 'preset-pot-mec-tienen', fromId: 'mechelen', toId: 'tienen', fromName: 'RKV Mechelen', toName: 'Tienen RZ Mariëndal', defaultKm: 63, potentieel: true },
  { id: 'preset-pot-mec-dendermonde', fromId: 'mechelen', toId: 'dendermonde', fromName: 'RKV Mechelen', toName: 'Dendermonde AZ Sint-Blasius', defaultKm: 30, potentieel: true },
  { id: 'preset-pot-mec-aalst', fromId: 'mechelen', toId: 'aalst', fromName: 'RKV Mechelen', toName: 'Aalst AZORG', defaultKm: 53, potentieel: true },
  { id: 'preset-pot-mec-zottegem', fromId: 'mechelen', toId: 'zottegem', fromName: 'RKV Mechelen', toName: 'Zottegem St. Elisabeth AZ', defaultKm: 70, potentieel: true },
  { id: 'preset-pot-bru-imelda', fromId: 'uz-brussel', toId: 'imelda', fromName: 'UZ Brussel', toName: 'Bonheiden Imelda', defaultKm: 37, potentieel: true },
  { id: 'preset-pot-bru-halle', fromId: 'uz-brussel', toId: 'halle', fromName: 'UZ Brussel', toName: 'Halle AZ Sint-Maria', defaultKm: 27, potentieel: true },
  { id: 'preset-pot-bru-vilvoorde', fromId: 'uz-brussel', toId: 'vilvoorde', fromName: 'UZ Brussel', toName: 'Vilvoorde AZ Jan Portaels', defaultKm: 15, potentieel: true },
  { id: 'preset-pot-bru-aalst', fromId: 'uz-brussel', toId: 'aalst', fromName: 'UZ Brussel', toName: 'Aalst AZORG', defaultKm: 26, potentieel: true },
  { id: 'preset-pot-bru-st-maarten', fromId: 'uz-brussel', toId: 'az-sint-maarten', fromName: 'UZ Brussel', toName: 'Mechelen AZ Sint-Maarten', defaultKm: 37, potentieel: true },
  { id: 'preset-pot-leu-tienen', fromId: 'uz-leuven', toId: 'tienen', fromName: 'UZ Leuven', toName: 'Tienen RZ Mariëndal', defaultKm: 33, potentieel: true },
  { id: 'preset-pot-leu-imelda', fromId: 'uz-leuven', toId: 'imelda', fromName: 'UZ Leuven', toName: 'Bonheiden Imelda', defaultKm: 25, potentieel: true },
];

const PRESET_ACTUAL_KEYS = new Set(DEFAULT_PRESET_ROUTES.map((r) => presetPairKey(r.fromId, r.toId)));
const EXTRA_POTENTIAL_UNIQUE = EXTRA_POTENTIAL_PRESET_ROUTES.filter(
  (r) => !PRESET_ACTUAL_KEYS.has(presetPairKey(r.fromId, r.toId))
);

/** Terugritten + extra hub-bestemmingen (niet in de vaste lijst). */
export const POTENTIAL_PRESET_ROUTES = [
  ...EXTRA_POTENTIAL_UNIQUE,
  ...reversePresetsMissing([...DEFAULT_PRESET_ROUTES, ...EXTRA_POTENTIAL_UNIQUE]),
];

/** Vaste + potentiële presets (voor merge in localStorage / UI). */
export const ALL_PRESET_ROUTES = [...DEFAULT_PRESET_ROUTES, ...POTENTIAL_PRESET_ROUTES];

/** Zelfde rijrouting als in Google Maps (Directions in Maps JavaScript API). Vereist billing in Google Cloud. */
export const GOOGLE_MAPS_API_KEY =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY
    ? String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY).trim()
    : '';

/** Gratis: OpenRouteService API-sleutel (https://openrouteservice.org/dev/#/signup) voor route en afstand */
export const ORS_API_KEY =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENROUTE_API_KEY
    ? String(import.meta.env.VITE_OPENROUTE_API_KEY).trim()
    : '';

/**
 * Kaartweergave zonder Google-sleutel: MapLibre + OpenStreetMap-rastertegels.
 * Met VITE_GOOGLE_MAPS_API_KEY: embedded Google Maps + Directions (TransportMe + klassieke kaartpagina).
 * Optioneel: eigen MapLibre style-URL (bijv. MapTiler) via .env
 */
export const MAPLIBRE_STYLE_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAPLIBRE_STYLE_URL
    ? String(import.meta.env.VITE_MAPLIBRE_STYLE_URL).trim()
    : '';

export function getOpenRouteApiKey() {
  return ORS_API_KEY;
}

export function hasGoogleMapsApiKey() {
  return !!GOOGLE_MAPS_API_KEY;
}
