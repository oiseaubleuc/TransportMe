/**
 * Opslag – localStorage: ritten, brandstof, overig (zelfstandige dataset) + rolling retentie
 */

import {
  STORAGE_KEYS,
  DEFAULT_ZIEKENHUIZEN,
  DEFAULT_PRESET_ROUTES,
  DEFAULT_VOERTUIGEN,
  PROFILES,
  DATA_RETENTION_DAYS,
} from './config.js';
import { backfillMissingVolgordeNrs } from './ritVolgorde.js';

const VALID_PROFILE_IDS = new Set(PROFILES.map((p) => p.id));

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
  mergeTestProfileIntoHoudaifaOnce();
  let ritten = JSON.parse(localStorage.getItem(profileKey(STORAGE_KEYS.ritten)) || '[]');
  const bf = backfillMissingVolgordeNrs(ritten);
  if (bf.changed) {
    ritten = bf.ritten;
    saveRitten(ritten);
  }
  const brandstof = JSON.parse(localStorage.getItem(profileKey(STORAGE_KEYS.brandstof)) || '[]');
  const overig = JSON.parse(localStorage.getItem(profileKey(STORAGE_KEYS.overig)) || '[]');
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
  const raw = localStorage.getItem(STORAGE_KEYS.voertuigen);
  if (!raw) {
    localStorage.setItem(STORAGE_KEYS.voertuigen, JSON.stringify(DEFAULT_VOERTUIGEN));
    return DEFAULT_VOERTUIGEN;
  }
  const stored = JSON.parse(raw);
  const merged = [...stored];
  for (const d of DEFAULT_VOERTUIGEN) {
    if (!merged.some((m) => m.id === d.id)) merged.push(d);
  }
  return merged;
}

export function getVoertuigen() {
  return ensureDefaultVoertuigen();
}

export function saveVoertuigen(voertuigen) {
  localStorage.setItem(STORAGE_KEYS.voertuigen, JSON.stringify(voertuigen));
}

export function saveRitten(ritten) {
  localStorage.setItem(profileKey(STORAGE_KEYS.ritten), JSON.stringify(ritten));
}

export function saveBrandstof(brandstof) {
  localStorage.setItem(profileKey(STORAGE_KEYS.brandstof), JSON.stringify(brandstof));
}

export function saveOverig(overig) {
  localStorage.setItem(profileKey(STORAGE_KEYS.overig), JSON.stringify(overig));
}

function routePairExists(routes, fromId, toId) {
  return routes.some(
    (r) => (r.fromId === fromId && r.toId === toId) || (r.fromId === toId && r.toId === fromId)
  );
}

function ensureDefaultZiekenhuizen() {
  const raw = localStorage.getItem(STORAGE_KEYS.ziekenhuizen);
  if (!raw) {
    localStorage.setItem(STORAGE_KEYS.ziekenhuizen, JSON.stringify(DEFAULT_ZIEKENHUIZEN));
    return DEFAULT_ZIEKENHUIZEN;
  }
  const stored = JSON.parse(raw);
  const merged = [...stored];
  let changed = false;
  for (const d of DEFAULT_ZIEKENHUIZEN) {
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
  if (changed) localStorage.setItem(STORAGE_KEYS.ziekenhuizen, JSON.stringify(merged));
  return merged;
}

function ensureDefaultPresetRoutes() {
  const raw = localStorage.getItem(STORAGE_KEYS.presetRoutes);
  if (!raw) {
    localStorage.setItem(STORAGE_KEYS.presetRoutes, JSON.stringify(DEFAULT_PRESET_ROUTES));
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
  if (changed) localStorage.setItem(STORAGE_KEYS.presetRoutes, JSON.stringify(merged));
  return merged;
}

export function getZiekenhuizen() {
  return ensureDefaultZiekenhuizen();
}

export function saveZiekenhuizen(ziekenhuizen) {
  localStorage.setItem(STORAGE_KEYS.ziekenhuizen, JSON.stringify(ziekenhuizen));
}

export function getPresetRoutes() {
  return ensureDefaultPresetRoutes();
}

export function savePresetRoutes(routes) {
  localStorage.setItem(STORAGE_KEYS.presetRoutes, JSON.stringify(routes));
}
