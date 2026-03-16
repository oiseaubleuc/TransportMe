/**
 * Opslag – lezen en schrijven naar localStorage (per profiel: ritten, brandstof, overig)
 */

import { STORAGE_KEYS, DEFAULT_ZIEKENHUIZEN, DEFAULT_PRESET_ROUTES, DEFAULT_VOERTUIGEN, PROFILES } from './config.js';

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

/** Eénmalige migratie: bestaande data zonder profiel-suffix naar huidig profiel (houdaifa) */
function migrateLegacyToProfile() {
  const profileId = getCurrentProfileId();
  if (profileId !== 'houdaifa') return;
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

export function getData() {
  migrateLegacyToProfile();
  return {
    ritten: JSON.parse(localStorage.getItem(profileKey(STORAGE_KEYS.ritten)) || '[]'),
    brandstof: JSON.parse(localStorage.getItem(profileKey(STORAGE_KEYS.brandstof)) || '[]'),
    overig: JSON.parse(localStorage.getItem(profileKey(STORAGE_KEYS.overig)) || '[]'),
    ziekenhuizen: getZiekenhuizen(),
    presetRoutes: getPresetRoutes(),
    voertuigen: getVoertuigen(),
  };
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
  for (const d of DEFAULT_ZIEKENHUIZEN) {
    if (!merged.some((m) => m.id === d.id)) merged.push(d);
  }
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
  for (const d of DEFAULT_PRESET_ROUTES) {
    if (!routePairExists(merged, d.fromId, d.toId)) merged.push(d);
  }
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
