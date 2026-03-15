/**
 * Configuratie – vergoeding, storage keys, vaste ritten
 */

export const OPSTART_PREMIE = 15;
export const VERGOEDING_PER_20KM = 25;
export const KM_SCHIJF = 20;

export const STORAGE_KEYS = {
  ritten: 'transporteur_ritten',
  brandstof: 'transporteur_brandstof',
  overig: 'transporteur_overig',
  ziekenhuizen: 'transporteur_ziekenhuizen',
  presetRoutes: 'transporteur_preset_routes',
  voertuigen: 'transporteur_voertuigen',
};

export const PERIOD_LABELS = {
  day: 'Vandaag',
  week: 'Deze week',
  month: 'Deze maand',
};

/** Standaard voertuigen (worden bij eerste gebruik of merge toegevoegd) */
export const DEFAULT_VOERTUIGEN = [
  { id: 'voertuig-2HKN136', naam: 'Audi A3', kenteken: '2HKN136' },
  { id: 'voertuig-2GGW635', naam: 'BMW Serie 1', kenteken: '2GGW635' },
];

/** Standaard ziekenhuizen (uit ritten_vergoeding_v2.xlsx, coördinaten België) */
export const DEFAULT_ZIEKENHUIZEN = [
  { id: 'uz-brussel', name: 'UZ Brussel', address: 'UZ Brussel', lat: 50.8824, lng: 4.2745 },
  { id: 'uz-leuven', name: 'UZ Leuven', address: 'UZ Leuven', lat: 50.8814, lng: 4.671 },
  { id: 'uza', name: 'UZA (Edegem)', address: 'UZA (Edegem)', lat: 51.1552, lng: 4.4452 },
  { id: 'deurne', name: 'AZ Deurne (AZ Monica)', address: 'AZ Deurne (AZ Monica)', lat: 51.2192, lng: 4.4653 },
  { id: 'herentals', name: 'AZ Herentals', address: 'AZ Herentals', lat: 51.1766, lng: 4.8325 },
  { id: 'mechelen', name: 'AZ Mechelen', address: 'AZ Mechelen', lat: 51.0257, lng: 4.4776 },
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
];

/** Vaste ritten uit ritten_vergoeding_v2.xlsx (29 ritten, km en namen zoals in Excel) */
export const DEFAULT_PRESET_ROUTES = [
  { id: 'preset-excel-1', fromId: 'uz-brussel', toId: 'uz-leuven', fromName: 'UZ Brussel', toName: 'UZ Leuven', defaultKm: 26 },
  { id: 'preset-excel-2', fromId: 'uz-brussel', toId: 'uza', fromName: 'UZ Brussel', toName: 'UZA (Edegem)', defaultKm: 48 },
  { id: 'preset-excel-3', fromId: 'uz-brussel', toId: 'deurne', fromName: 'UZ Brussel', toName: 'AZ Deurne (AZ Monica)', defaultKm: 52 },
  { id: 'preset-excel-4', fromId: 'uz-brussel', toId: 'herentals', fromName: 'UZ Brussel', toName: 'AZ Herentals', defaultKm: 60 },
  { id: 'preset-excel-5', fromId: 'uz-brussel', toId: 'mechelen', fromName: 'UZ Brussel', toName: 'AZ Mechelen', defaultKm: 33 },
  { id: 'preset-excel-6', fromId: 'uz-brussel', toId: 'gent', fromName: 'UZ Brussel', toName: 'AZ Gent', defaultKm: 60 },
  { id: 'preset-excel-7', fromId: 'uz-brussel', toId: 'genk', fromName: 'UZ Brussel', toName: 'ZOL Genk', defaultKm: 85 },
  { id: 'preset-excel-8', fromId: 'uz-brussel', toId: 'az-turnhout', fromName: 'UZ Brussel', toName: 'AZ Turnhout', defaultKm: 72 },
  { id: 'preset-excel-9', fromId: 'uz-brussel', toId: 'mol', fromName: 'UZ Brussel', toName: 'AZ Mol (Hart)', defaultKm: 72 },
  { id: 'preset-excel-10', fromId: 'uz-brussel', toId: 'brasschaat', fromName: 'UZ Brussel', toName: 'AZ Klina Brasschaat', defaultKm: 60 },
  { id: 'preset-excel-11', fromId: 'uz-brussel', toId: 'virga-jesse', fromName: 'UZ Brussel', toName: 'Virga Jesse Hasselt', defaultKm: 72 },
  { id: 'preset-excel-11b', fromId: 'uz-brussel', toId: 'bornem', fromName: 'UZ Brussel', toName: 'Bornem', defaultKm: 28 },
  { id: 'preset-excel-11c', fromId: 'uz-brussel', toId: 'sint-truiden', fromName: 'UZ Brussel', toName: 'Sint-Truiden', defaultKm: 76 },
  { id: 'preset-excel-12', fromId: 'mechelen', toId: 'gent', fromName: 'AZ Mechelen', toName: 'AZ Gent', defaultKm: 65 },
  { id: 'preset-excel-13', fromId: 'mechelen', toId: 'genk', fromName: 'AZ Mechelen', toName: 'ZOL Genk', defaultKm: 60 },
  { id: 'preset-excel-14', fromId: 'mechelen', toId: 'uz-leuven', fromName: 'AZ Mechelen', toName: 'UZ Leuven', defaultKm: 30 },
  { id: 'preset-excel-15', fromId: 'mechelen', toId: 'uza', fromName: 'AZ Mechelen', toName: 'UZA (Edegem)', defaultKm: 28 },
  { id: 'preset-excel-16', fromId: 'mechelen', toId: 'herentals', fromName: 'AZ Mechelen', toName: 'AZ Herentals', defaultKm: 30 },
  { id: 'preset-excel-17', fromId: 'mechelen', toId: 'uz-brussel', fromName: 'AZ Mechelen', toName: 'UZ Brussel', defaultKm: 33 },
  { id: 'preset-excel-18', fromId: 'mechelen', toId: 'heusden-zolder', fromName: 'AZ Mechelen', toName: 'ZOL Heusden-Zolder', defaultKm: 55 },
  { id: 'preset-excel-19', fromId: 'mechelen', toId: 'az-maria-middelares-gent', fromName: 'AZ Mechelen', toName: 'AZ Maria Middelares (Gent)', defaultKm: 70 },
  { id: 'preset-excel-20', fromId: 'mechelen', toId: 'jessa-hasselt', fromName: 'AZ Mechelen', toName: 'Jessa Hasselt', defaultKm: 52 },
  { id: 'preset-excel-21', fromId: 'mechelen', toId: 'geel', fromName: 'AZ Mechelen', toName: 'AZ Geel', defaultKm: 38 },
  { id: 'preset-excel-22', fromId: 'mechelen', toId: 'az-turnhout', fromName: 'AZ Mechelen', toName: 'AZ Turnhout', defaultKm: 45 },
  { id: 'preset-excel-23', fromId: 'mechelen', toId: 'mol', fromName: 'AZ Mechelen', toName: 'AZ Mol', defaultKm: 50 },
  { id: 'preset-excel-24', fromId: 'mechelen', toId: 'lier', fromName: 'AZ Mechelen', toName: 'AZ Lier', defaultKm: 18 },
  { id: 'preset-excel-25', fromId: 'mechelen', toId: 'brasschaat', fromName: 'AZ Mechelen', toName: 'AZ Klina Brasschaat', defaultKm: 35 },
  { id: 'preset-excel-26', fromId: 'az-maria-middelares-deinze', toId: 'az-maria-middelares-gent', fromName: 'AZ Maria Middelares Deinze', toName: 'AZ Maria Middelares Gent', defaultKm: 22 },
  { id: 'preset-excel-27', fromId: 'uz-leuven', toId: 'uz-brussel', fromName: 'UZ Leuven', toName: 'UZ Brussel', defaultKm: 26 },
  { id: 'preset-excel-28', fromId: 'uz-leuven', toId: 'uza', fromName: 'UZ Leuven', toName: 'UZA (Edegem)', defaultKm: 65 },
  { id: 'preset-excel-29', fromId: 'uz-leuven', toId: 'diest', fromName: 'UZ Leuven', toName: 'AZ Diest', defaultKm: 28 },
];

export function getGoogleMapsApiKey() {
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY
    ? import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    : '';
}

/** Gratis: OpenRouteService API-sleutel (https://openrouteservice.org/dev/#/signup) voor route en afstand */
export function getOpenRouteApiKey() {
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENROUTE_API_KEY
    ? import.meta.env.VITE_OPENROUTE_API_KEY
    : '';
}
