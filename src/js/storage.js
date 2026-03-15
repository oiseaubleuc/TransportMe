/**
 * Opslag – lezen en schrijven naar localStorage
 */

import { STORAGE_KEYS, DEFAULT_ZIEKENHUIZEN, DEFAULT_PRESET_ROUTES, DEFAULT_VOERTUIGEN } from './config.js';

export function getData() {
  return {
    ritten: JSON.parse(localStorage.getItem(STORAGE_KEYS.ritten) || '[]'),
    brandstof: JSON.parse(localStorage.getItem(STORAGE_KEYS.brandstof) || '[]'),
    overig: JSON.parse(localStorage.getItem(STORAGE_KEYS.overig) || '[]'),
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
  localStorage.setItem(STORAGE_KEYS.ritten, JSON.stringify(ritten));
}

export function saveBrandstof(brandstof) {
  localStorage.setItem(STORAGE_KEYS.brandstof, JSON.stringify(brandstof));
}

export function saveOverig(overig) {
  localStorage.setItem(STORAGE_KEYS.overig, JSON.stringify(overig));
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
