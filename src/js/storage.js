/**
 * Opslag – localStorage per profiel: ritten, brandstof, overig, ziekenhuizen, preset-routes,
 * voertuigen, factuur; planning en live-beschikbaarheid als gedeelde maps met profileId-keys.
 */

import {
  STORAGE_KEYS,
  DEFAULT_ZIEKENHUIZEN,
  PRESET_ANCHOR_ZIEKENHUIZEN,
  DEFAULT_PRESET_ROUTES,
  DEFAULT_VOERTUIGEN,
  PROFILES,
  DATA_RETENTION_DAYS,
  LIVE_AVAILABILITY_TTL_MS,
} from './config.js';
import { backfillMissingVolgordeNrs } from './ritVolgorde.js';

const VALID_PROFILE_IDS = new Set(PROFILES.map((p) => p.id));
const VALID_STATUS = new Set(['komend', 'lopend', 'voltooid', 'geannuleerd']);

function safeParseArray(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeDateStr(datum) {
  if (typeof datum !== 'string') return '';
  const d = datum.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  return d;
}

function normalizeTimeStr(tijd) {
  if (typeof tijd !== 'string') return '';
  const m = tijd.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function normalizeBestelArtikelen(rit) {
  const arr = Array.isArray(rit?.bestelArtikelen) ? rit.bestelArtikelen : [];
  const mapped = arr
    .map((a) => {
      const bonnummer = typeof a?.bonnummer === 'string' ? a.bonnummer.trim() : '';
      const rawBoxen = Number.parseInt(a?.boxen, 10);
      const boxen = Number.isFinite(rawBoxen) && rawBoxen > 0 ? rawBoxen : null;
      return bonnummer ? { bonnummer, boxen } : null;
    })
    .filter(Boolean);
  if (mapped.length > 0) return mapped;
  const legacyBon = typeof rit?.bonnummer === 'string' ? rit.bonnummer.trim() : '';
  return legacyBon ? [{ bonnummer: legacyBon, boxen: null }] : [];
}

function normalizeRit(rit) {
  if (!rit || typeof rit !== 'object') return null;
  const datum = normalizeDateStr(rit.datum);
  const kmNum = Number.parseInt(rit.km, 10);
  if (!datum || !Number.isFinite(kmNum) || kmNum < 1) return null;
  const status = VALID_STATUS.has(rit.status) ? rit.status : rit.status == null ? 'voltooid' : 'komend';
  const tijd = normalizeTimeStr(rit.tijd);
  const voltooidTijd = normalizeTimeStr(rit.voltooidTijd);
  const bonnummer = typeof rit.bonnummer === 'string' ? rit.bonnummer.trim() : '';
  const bestelArtikelen = normalizeBestelArtikelen(rit);
  const vergoeding = Number.isFinite(Number(rit.vergoeding)) ? Number(rit.vergoeding) : undefined;
  return {
    ...rit,
    datum,
    km: kmNum,
    status,
    tijd,
    voltooidTijd: status === 'voltooid' ? (voltooidTijd || tijd) : undefined,
    bonnummer: bonnummer || bestelArtikelen[0]?.bonnummer || '',
    bestelArtikelen,
    vergoeding,
  };
}

function normalizeBrandstofItem(x) {
  if (!x || typeof x !== 'object') return null;
  const datum = normalizeDateStr(x.datum);
  const liter = Number(x.liter);
  const prijs = Number(x.prijs);
  if (!datum || !Number.isFinite(liter) || liter <= 0 || !Number.isFinite(prijs) || prijs < 0) return null;
  return { ...x, datum, liter, prijs };
}

function normalizeOverigItem(x) {
  if (!x || typeof x !== 'object') return null;
  const datum = normalizeDateStr(x.datum);
  const bedrag = Number(x.bedrag);
  if (!datum || !Number.isFinite(bedrag) || bedrag < 0) return null;
  const omschrijving = typeof x.omschrijving === 'string' ? x.omschrijving.trim() : '';
  return { ...x, datum, bedrag, omschrijving };
}

function sortByDatumTijd(a, b) {
  const ka = `${a?.datum || ''}${a?.tijd || ''}${a?.id || ''}`;
  const kb = `${b?.datum || ''}${b?.tijd || ''}${b?.id || ''}`;
  return ka.localeCompare(kb);
}

function cleanupProfileData() {
  PROFILES.forEach((p) => {
    const rKey = `${STORAGE_KEYS.ritten}_${p.id}`;
    const bKey = `${STORAGE_KEYS.brandstof}_${p.id}`;
    const oKey = `${STORAGE_KEYS.overig}_${p.id}`;
    const rawR = localStorage.getItem(rKey) || '[]';
    const rawB = localStorage.getItem(bKey) || '[]';
    const rawO = localStorage.getItem(oKey) || '[]';
    const cleanR = safeParseArray(rawR).map(normalizeRit).filter(Boolean).sort(sortByDatumTijd);
    const cleanB = safeParseArray(rawB).map(normalizeBrandstofItem).filter(Boolean).sort((a, b) => a.datum.localeCompare(b.datum));
    const cleanO = safeParseArray(rawO).map(normalizeOverigItem).filter(Boolean).sort((a, b) => a.datum.localeCompare(b.datum));
    const nextR = JSON.stringify(cleanR);
    const nextB = JSON.stringify(cleanB);
    const nextO = JSON.stringify(cleanO);
    if (nextR !== rawR) localStorage.setItem(rKey, nextR);
    if (nextB !== rawB) localStorage.setItem(bKey, nextB);
    if (nextO !== rawO) localStorage.setItem(oKey, nextO);
  });
}

export function getCurrentProfileId() {
  const id = localStorage.getItem(STORAGE_KEYS.currentProfile);
  return VALID_PROFILE_IDS.has(id) ? id : PROFILES[0].id;
}

export function setCurrentProfileId(id) {
  if (!VALID_PROFILE_IDS.has(id)) return;
  localStorage.setItem(STORAGE_KEYS.currentProfile, id);
}

function profileKey(baseKey) {
  return `${baseKey}_${getCurrentProfileId()}`;
}

function profileStorageKey(baseKey, profileId) {
  const pid = VALID_PROFILE_IDS.has(profileId) ? profileId : PROFILES[0].id;
  return `${baseKey}_${pid}`;
}

/**
 * Eénmalig: oude globale sleutels voor ziekenhuizen, preset-routes en voertuigen
 * kopiëren naar elke profiel-sleutel (zelfde startdata), daarna globale sleutels verwijderen.
 */
function migrateGlobalListsToPerProfileOnce() {
  if (localStorage.getItem(STORAGE_KEYS.migrateListsPerProfileV1)) return;
  const legacyZ = localStorage.getItem(STORAGE_KEYS.ziekenhuizen);
  const legacyP = localStorage.getItem(STORAGE_KEYS.presetRoutes);
  const legacyV = localStorage.getItem(STORAGE_KEYS.voertuigen);
  for (const p of PROFILES) {
    const zk = profileStorageKey(STORAGE_KEYS.ziekenhuizen, p.id);
    const pk = profileStorageKey(STORAGE_KEYS.presetRoutes, p.id);
    const vk = profileStorageKey(STORAGE_KEYS.voertuigen, p.id);
    if (legacyZ != null && localStorage.getItem(zk) == null) localStorage.setItem(zk, legacyZ);
    if (legacyP != null && localStorage.getItem(pk) == null) localStorage.setItem(pk, legacyP);
    if (legacyV != null && localStorage.getItem(vk) == null) localStorage.setItem(vk, legacyV);
  }
  if (legacyZ != null) localStorage.removeItem(STORAGE_KEYS.ziekenhuizen);
  if (legacyP != null) localStorage.removeItem(STORAGE_KEYS.presetRoutes);
  if (legacyV != null) localStorage.removeItem(STORAGE_KEYS.voertuigen);
  localStorage.setItem(STORAGE_KEYS.migrateListsPerProfileV1, '1');
}

/** Eénmalige migratie: bestaande data zonder profiel-suffix naar eerste profiel (legacy default) */
function migrateLegacyToProfile() {
  const profileId = getCurrentProfileId();
  if (profileId !== PROFILES[0].id) return;
  const rKey = profileKey(STORAGE_KEYS.ritten);
  if (localStorage.getItem(rKey) != null) return;
  const legacy = localStorage.getItem(STORAGE_KEYS.ritten);
  if (legacy != null) {
    localStorage.setItem(rKey, legacy);
    localStorage.removeItem(STORAGE_KEYS.ritten);
  }
  const bKey = profileKey(STORAGE_KEYS.brandstof);
  if (localStorage.getItem(bKey) == null && localStorage.getItem(STORAGE_KEYS.brandstof) != null) {
    localStorage.setItem(bKey, localStorage.getItem(STORAGE_KEYS.brandstof));
    localStorage.removeItem(STORAGE_KEYS.brandstof);
  }
  const oKey = profileKey(STORAGE_KEYS.overig);
  if (localStorage.getItem(oKey) == null && localStorage.getItem(STORAGE_KEYS.overig) != null) {
    localStorage.setItem(oKey, localStorage.getItem(STORAGE_KEYS.overig));
    localStorage.removeItem(STORAGE_KEYS.overig);
  }
}

/** Eénmalig: data van profiel «test» samenvoegen in eerste profiel (zelfde browser) */
function mergeTestProfileIntoHoudaifaOnce() {
  if (localStorage.getItem(STORAGE_KEYS.mergedTestProfile)) return;
  const h = PROFILES[0].id;
  const t = 'test';
  function pair(base) {
    const rawH = localStorage.getItem(`${base}_${h}`);
    const rawT = localStorage.getItem(`${base}_${t}`);
    return {
      houd: JSON.parse(rawH || '[]'),
      tst: JSON.parse(rawT || '[]'),
    };
  }
  function mergeArrays(aHoud, aTest) {
    const ids = new Set(aHoud.map((x) => x.id));
    const out = [...aHoud];
    for (const item of aTest) {
      if (item?.id != null && !ids.has(item.id)) {
        out.push(item);
        ids.add(item.id);
      }
    }
    return out.sort((x, y) => (x.datum || '').localeCompare(y.datum || ''));
  }
  const r = pair(STORAGE_KEYS.ritten);
  const b = pair(STORAGE_KEYS.brandstof);
  const o = pair(STORAGE_KEYS.overig);
  localStorage.setItem(`${STORAGE_KEYS.ritten}_${h}`, JSON.stringify(mergeArrays(r.houd, r.tst)));
  localStorage.setItem(`${STORAGE_KEYS.brandstof}_${h}`, JSON.stringify(mergeArrays(b.houd, b.tst)));
  localStorage.setItem(`${STORAGE_KEYS.overig}_${h}`, JSON.stringify(mergeArrays(o.houd, o.tst)));
  localStorage.removeItem(`${STORAGE_KEYS.ritten}_${t}`);
  localStorage.removeItem(`${STORAGE_KEYS.brandstof}_${t}`);
  localStorage.removeItem(`${STORAGE_KEYS.overig}_${t}`);
  localStorage.setItem(STORAGE_KEYS.mergedTestProfile, '1');
  localStorage.setItem(STORAGE_KEYS.currentProfile, PROFILES[0].id);
}

function retentionCutoffMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - DATA_RETENTION_DAYS);
  return d.getTime();
}

function keptInRollingWindow(datumStr) {
  if (!datumStr || typeof datumStr !== 'string' || datumStr.length < 10) return true;
  const [y, m, day] = datumStr.slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return true;
  const t = new Date(y, m - 1, day).getTime();
  if (Number.isNaN(t)) return true;
  return t >= retentionCutoffMs();
}

/** Eénmalig: zet alle teller-data (ritten/brandstof/overig) op nul voor elk profiel */
function resetAllCountersOnce() {
  if (localStorage.getItem(STORAGE_KEYS.resetAllCountersV1)) return;
  PROFILES.forEach((p) => {
    localStorage.setItem(`${STORAGE_KEYS.ritten}_${p.id}`, '[]');
    localStorage.setItem(`${STORAGE_KEYS.brandstof}_${p.id}`, '[]');
    localStorage.setItem(`${STORAGE_KEYS.overig}_${p.id}`, '[]');
  });
  localStorage.setItem(STORAGE_KEYS.resetAllCountersV1, '1');
}

function cleanupDataOnce() {
  if (localStorage.getItem(STORAGE_KEYS.dataCleanupV2)) return;
  cleanupProfileData();
  localStorage.setItem(STORAGE_KEYS.dataCleanupV2, '1');
}

/** Ritten, brandstof en overig: enkel laatste DATA_RETENTION_DAGEN bewaren */
function applyRetentionAndPersist(ritten, brandstof, overig) {
  const fR = ritten.filter((r) => keptInRollingWindow(r.datum));
  const fB = brandstof.filter((x) => keptInRollingWindow(x.datum));
  const fO = overig.filter((x) => keptInRollingWindow(x.datum));
  const changed =
    fR.length !== ritten.length || fB.length !== brandstof.length || fO.length !== overig.length;
  if (changed) {
    saveRitten(fR);
    saveBrandstof(fB);
    saveOverig(fO);
  }
  return { ritten: fR, brandstof: fB, overig: fO };
}

export function getData() {
  migrateLegacyToProfile();
  migrateGlobalListsToPerProfileOnce();
  mergeTestProfileIntoHoudaifaOnce();
  resetAllCountersOnce();
  cleanupDataOnce();
  let ritten = safeParseArray(localStorage.getItem(profileKey(STORAGE_KEYS.ritten)));
  ritten = ritten.map(normalizeRit).filter(Boolean).sort(sortByDatumTijd);
  const bf = backfillMissingVolgordeNrs(ritten);
  if (bf.changed) {
    ritten = bf.ritten;
    saveRitten(ritten);
  }
  const brandstof = safeParseArray(localStorage.getItem(profileKey(STORAGE_KEYS.brandstof)))
    .map(normalizeBrandstofItem)
    .filter(Boolean);
  const overig = safeParseArray(localStorage.getItem(profileKey(STORAGE_KEYS.overig)))
    .map(normalizeOverigItem)
    .filter(Boolean);
  const pruned = applyRetentionAndPersist(ritten, brandstof, overig);
  return {
    ritten: pruned.ritten,
    brandstof: pruned.brandstof,
    overig: pruned.overig,
    planning: getPlanningAvailability(),
    ziekenhuizen: getZiekenhuizen(),
    presetRoutes: getPresetRoutes(),
    voertuigen: getVoertuigen(),
  };
}

/** Maandelijkse beschikbaarheden per profiel.
 *  Structuur: { [profileId]: { [monthKey: 'YYYY-MM']: { [dateISO: 'YYYY-MM-DD']: true } } }
 */
export function getPlanningAvailability() {
  const raw = localStorage.getItem(STORAGE_KEYS.planning);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function savePlanningAvailability(planning) {
  localStorage.setItem(STORAGE_KEYS.planning, JSON.stringify(planning || {}));
}

function ensureDefaultVoertuigen() {
  const key = profileKey(STORAGE_KEYS.voertuigen);
  const raw = localStorage.getItem(key);
  if (!raw) {
    localStorage.setItem(key, JSON.stringify(DEFAULT_VOERTUIGEN));
    return DEFAULT_VOERTUIGEN;
  }
  const stored = JSON.parse(raw);
  const merged = [...stored];
  let changed = false;
  for (const d of DEFAULT_VOERTUIGEN) {
    if (!merged.some((m) => m.id === d.id)) {
      merged.push(d);
      changed = true;
    }
  }
  if (changed) localStorage.setItem(key, JSON.stringify(merged));
  return merged;
}

export function getVoertuigen() {
  return ensureDefaultVoertuigen();
}

export function saveVoertuigen(voertuigen) {
  localStorage.setItem(profileKey(STORAGE_KEYS.voertuigen), JSON.stringify(voertuigen));
}

export function saveRitten(ritten) {
  const clean = (Array.isArray(ritten) ? ritten : []).map(normalizeRit).filter(Boolean).sort(sortByDatumTijd);
  localStorage.setItem(profileKey(STORAGE_KEYS.ritten), JSON.stringify(clean));
}

export function saveBrandstof(brandstof) {
  const clean = (Array.isArray(brandstof) ? brandstof : [])
    .map(normalizeBrandstofItem)
    .filter(Boolean)
    .sort((a, b) => a.datum.localeCompare(b.datum));
  localStorage.setItem(profileKey(STORAGE_KEYS.brandstof), JSON.stringify(clean));
}

export function saveOverig(overig) {
  const clean = (Array.isArray(overig) ? overig : [])
    .map(normalizeOverigItem)
    .filter(Boolean)
    .sort((a, b) => a.datum.localeCompare(b.datum));
  localStorage.setItem(profileKey(STORAGE_KEYS.overig), JSON.stringify(clean));
}

function routePairExists(routes, fromId, toId) {
  return routes.some(
    (r) => (r.fromId === fromId && r.toId === toId) || (r.fromId === toId && r.toId === fromId)
  );
}

function ensureDefaultZiekenhuizen() {
  const key = profileKey(STORAGE_KEYS.ziekenhuizen);
  const raw = localStorage.getItem(key);
  if (!raw) {
    localStorage.setItem(key, JSON.stringify(DEFAULT_ZIEKENHUIZEN));
    return DEFAULT_ZIEKENHUIZEN;
  }
  const stored = JSON.parse(raw);
  // Oude versies konden een heel grote OSM-lijst inladen; trim eenmalig hard terug.
  if (Array.isArray(stored) && stored.length > 120) {
    localStorage.setItem(key, JSON.stringify(DEFAULT_ZIEKENHUIZEN));
    return DEFAULT_ZIEKENHUIZEN;
  }

  const merged = [...stored];
  let changed = false;
  for (const d of PRESET_ANCHOR_ZIEKENHUIZEN) {
    const idx = merged.findIndex((m) => m.id === d.id);
    if (idx === -1) {
      merged.push(d);
      changed = true;
    } else {
      const cur = merged[idx];
      if (cur.name !== d.name || cur.address !== d.address) {
        merged[idx] = { ...cur, name: d.name, address: d.address };
        changed = true;
      }
    }
  }
  if (changed) localStorage.setItem(key, JSON.stringify(merged));
  return merged;
}

function ensureDefaultPresetRoutes() {
  const key = profileKey(STORAGE_KEYS.presetRoutes);
  const raw = localStorage.getItem(key);
  if (!raw) {
    localStorage.setItem(key, JSON.stringify(DEFAULT_PRESET_ROUTES));
    return DEFAULT_PRESET_ROUTES;
  }
  const stored = JSON.parse(raw);
  const merged = [...stored];
  let changed = false;
  for (const d of DEFAULT_PRESET_ROUTES) {
    const idx = merged.findIndex((m) => m.fromId === d.fromId && m.toId === d.toId);
    if (idx === -1) {
      merged.push(d);
      changed = true;
    } else {
      const cur = merged[idx];
      const km = d.defaultKm != null ? d.defaultKm : cur.defaultKm;
      if (cur.fromName !== d.fromName || cur.toName !== d.toName || cur.defaultKm !== km) {
        merged[idx] = { ...cur, fromName: d.fromName, toName: d.toName, defaultKm: km };
        changed = true;
      }
    }
  }
  if (changed) localStorage.setItem(key, JSON.stringify(merged));
  return merged;
}

export function getZiekenhuizen() {
  return ensureDefaultZiekenhuizen();
}

export function saveZiekenhuizen(ziekenhuizen) {
  localStorage.setItem(profileKey(STORAGE_KEYS.ziekenhuizen), JSON.stringify(ziekenhuizen));
}

export function getPresetRoutes() {
  return ensureDefaultPresetRoutes();
}

export function savePresetRoutes(routes) {
  localStorage.setItem(profileKey(STORAGE_KEYS.presetRoutes), JSON.stringify(routes));
}

function readLiveAvailabilityMap() {
  const raw = localStorage.getItem(STORAGE_KEYS.liveAvailability);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLiveAvailabilityMap(map) {
  localStorage.setItem(STORAGE_KEYS.liveAvailability, JSON.stringify(map || {}));
}

export function getLiveAvailabilityStatus(profileId) {
  if (!profileId) return { active: false, expiresAt: null };
  const map = readLiveAvailabilityMap();
  const ts = Number(map[profileId]);
  if (!Number.isFinite(ts)) return { active: false, expiresAt: null };
  const expiresAt = ts + LIVE_AVAILABILITY_TTL_MS;
  const now = Date.now();
  if (expiresAt <= now) {
    delete map[profileId];
    writeLiveAvailabilityMap(map);
    return { active: false, expiresAt: null };
  }
  return { active: true, expiresAt };
}

export function setLiveAvailabilityStatus(profileId, active) {
  if (!profileId) return;
  const map = readLiveAvailabilityMap();
  if (active) map[profileId] = Date.now();
  else delete map[profileId];
  writeLiveAvailabilityMap(map);
}

const DEFAULT_FACTUUR_GEGEVENS = {
  logoDataUrl: '',
  bedrijfsnaam: '',
  adresStraat: '',
  adresPostcodeStad: '',
  land: 'België',
  btwNummer: '',
  rekeninghouder: '',
  iban: '',
  email: '',
  telefoon: '',
  klantNaam: '',
  klantBedrijfsnaam: '',
  klantContactpersoon: '',
  klantBtw: '',
  klantAdres: '',
  klantLand: 'België',
  /** Zet aan om op de PDF 21%/… btw op ritbedragen te tonen en te betalen te verhogen */
  factuurBtwAanrekenen: false,
  /** Percentage (0–100), typisch 6, 12 of 21 */
  factuurBtwTarief: 21,
  btwVrijstellingTekst:
    'Bijzondere vrijstellingsregeling kleine ondernemingen - btw niet van toepassing',
  vervalDagen: 30,
};

function mergeFactuurGegevens(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const n = Number(o.vervalDagen);
  const tarief = Number(o.factuurBtwTarief);
  const merged = {
    ...DEFAULT_FACTUUR_GEGEVENS,
    ...o,
    vervalDagen: Number.isFinite(n) && n >= 0 ? Math.min(365, Math.floor(n)) : DEFAULT_FACTUUR_GEGEVENS.vervalDagen,
    factuurBtwAanrekenen: Boolean(o.factuurBtwAanrekenen),
    factuurBtwTarief: Number.isFinite(tarief) ? Math.min(100, Math.max(0, tarief)) : DEFAULT_FACTUUR_GEGEVENS.factuurBtwTarief,
  };
  const bedrijf = String(merged.klantBedrijfsnaam || '').trim();
  const legacyNaam = String(merged.klantNaam || '').trim();
  if (!bedrijf && legacyNaam) merged.klantBedrijfsnaam = legacyNaam;
  return merged;
}

export function getFactuurGegevens(profileId = getCurrentProfileId()) {
  let pid = profileId;
  if (!VALID_PROFILE_IDS.has(pid)) pid = PROFILES[0].id;
  const key = `${STORAGE_KEYS.factuurGegevens}_${pid}`;
  try {
    return mergeFactuurGegevens(JSON.parse(localStorage.getItem(key) || '{}'));
  } catch {
    return mergeFactuurGegevens({});
  }
}

export function saveFactuurGegevens(partial, profileId = getCurrentProfileId()) {
  if (!VALID_PROFILE_IDS.has(profileId)) return;
  const cur = getFactuurGegevens(profileId);
  const next = mergeFactuurGegevens({ ...cur, ...partial });
  const key = `${STORAGE_KEYS.factuurGegevens}_${profileId}`;
  localStorage.setItem(key, JSON.stringify(next));
}

/**
 * Volgende factuurcode voor dit jaar (bv. 2026-006). Telt op bij elke succesvolle PDF.
 */
export function nextFactuurVolgNummer(profileId = getCurrentProfileId()) {
  if (!VALID_PROFILE_IDS.has(profileId)) profileId = PROFILES[0].id;
  const year = new Date().getFullYear();
  const key = `${STORAGE_KEYS.factuurTeller}_${profileId}`;
  let map = {};
  try {
    map = JSON.parse(localStorage.getItem(key) || '{}');
    if (!map || typeof map !== 'object') map = {};
  } catch {
    map = {};
  }
  const yk = String(year);
  const n = (Number(map[yk]) || 0) + 1;
  map[yk] = n;
  localStorage.setItem(key, JSON.stringify(map));
  const padded = String(n).padStart(3, '0');
  return { year, volgNummer: n, factuurCode: `${year}-${padded}`, orderDisplay: padded };
}
