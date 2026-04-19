/**
 * Afstand over het wegennet (auto, incl. snelwegen volgens OSM/Google) — geen vogelvlucht.
 * Volgorde: Google Maps → gratis OSRM → OpenRouteService (optioneel).
 */

import { ORS_API_KEY, GOOGLE_MAPS_API_KEY } from './config.js';
import { getDrivingRouteGoogleMaps } from './googleDirections.js';

const ORS_DIRECTIONS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

/** OSRM `driving` = autoroute over echte wegen (E- en A-wegen waar in OSM aanwezig). */
const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';

function normEndpoints(origin, destination) {
  const from = typeof origin === 'object' && origin?.lat != null && origin?.lng != null ? origin : null;
  const to = typeof destination === 'object' && destination?.lat != null && destination?.lng != null ? destination : null;
  return { from, to };
}

export function metersToKmRounded(distanceM) {
  const m = Number(distanceM);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.max(1, Math.round(m / 1000));
}

/**
 * Afstand (km) en route-geometrie via OpenRouteService.
 */
export async function getRouteDistanceORS(origin, destination) {
  if (!ORS_API_KEY) return Promise.reject(new Error('Geen OpenRouteService API-sleutel. Zet VITE_OPENROUTE_API_KEY in .env'));

  const { from, to } = normEndpoints(origin, destination);
  if (!from || !to) return Promise.reject(new Error('Ongeldige coördinaten'));

  const body = {
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
  };

  const res = await fetch(ORS_DIRECTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ORS_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }

  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error('Geen route gevonden');

  const distanceM = route.summary?.distance ?? 0;
  const km = metersToKmRounded(distanceM);
  const geometry = route.geometry?.coordinates; // [lng, lat][]

  return { km, geometry, source: "ors" };
}

/**
 * Autoroute-afstand via OSRM (geen sleutel). Echte rijkm, geen hemelsbreed.
 */
export async function getRouteDistanceOSRM(origin, destination) {
  const { from, to } = normEndpoints(origin, destination);
  if (!from || !to) return Promise.reject(new Error('Ongeldige coördinaten'));

  const url = `${OSRM_ROUTE_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.[0]) {
    throw new Error(data.message || 'Geen route (OSRM)');
  }
  const distanceM = data.routes[0].distance ?? 0;
  const km = metersToKmRounded(distanceM);
  return { km, source: "osrm" };
}

/**
 * Rijroute-km over wegennet: Google Maps → OSRM (gratis) → OpenRouteService.
 * @returns {Promise<{ km: number, source?: string, geometry?: [number, number][] }>}
 */
export async function getDrivingRouteKm(origin, destination) {
  const { from, to } = normEndpoints(origin, destination);
  if (!from || !to) return Promise.reject(new Error('Ongeldige coördinaten'));

  if (GOOGLE_MAPS_API_KEY) {
    try {
      const g = await getDrivingRouteGoogleMaps(origin, destination);
      return { ...g, source: g.source || "google" };
    } catch (e) {
      console.warn('Google Maps Directions mislukt, volgende bron:', e);
    }
  }
  try {
    return await getRouteDistanceOSRM(origin, destination);
  } catch (e) {
    console.warn('OSRM-autoroute mislukt, probeer OpenRouteService:', e);
  }
  if (ORS_API_KEY) {
    try {
      return await getRouteDistanceORS(origin, destination);
    } catch (e) {
      console.warn('OpenRouteService mislukt:', e);
    }
  }
  throw new Error('Geen autoroute beschikbaar (internet of API-sleutel nodig).');
}

async function fetchOsrmRouteGeojson(from, to) {
  const url = `${OSRM_ROUTE_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route || data.code !== 'Ok') throw new Error(data.message || 'Geen route (OSRM)');
  const distanceM = route.distance ?? 0;
  const km = metersToKmRounded(distanceM);
  const geometry = route.geometry?.coordinates;
  return { km, geometry };
}

/**
 * Rijroute + lijn: Google → OSRM → OpenRouteService.
 */
export async function getDrivingRouteWithGeometry(origin, destination) {
  const { from, to } = normEndpoints(origin, destination);
  if (!from || !to) return Promise.reject(new Error('Ongeldige coördinaten'));

  if (GOOGLE_MAPS_API_KEY) {
    try {
      const g = await getDrivingRouteGoogleMaps(origin, destination);
      if (g.geometry?.length || g.km >= 1) return { ...g, source: 'google' };
    } catch (e) {
      console.warn('Google Maps (geometrie) mislukt, volgende bron:', e);
    }
  }

  try {
    const o = await fetchOsrmRouteGeojson(from, to);
    if (o.geometry?.length || o.km >= 1) return { ...o, source: 'osrm' };
  } catch (e) {
    console.warn('OSRM (geometrie) mislukt, probeer OpenRouteService:', e);
  }

  if (ORS_API_KEY) {
    try {
      const r = await getRouteDistanceORS(origin, destination);
      return { ...r, source: 'ors' };
    } catch (e) {
      console.warn('OpenRouteService (kaart) mislukt:', e);
    }
  }

  throw new Error('Geen autoroute voor de kaart (internet of API-sleutel nodig).');
}

export function hasOpenRouteApiKey() {
  return !!ORS_API_KEY;
}
