/**
 * OpenRouteService – afstand, route-geometrie en matrix (geen tweede kaart-API).
 * Vereist VITE_OPENROUTE_API_KEY in .env voor API-calls.
 */

import { ORS_API_KEY } from './config.js';

const ORS_DIRECTIONS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';
const ORS_MATRIX_URL = 'https://api.openrouteservice.org/v2/matrix/driving-car';

/**
 * Afstand (km) en route-geometrie via OpenRouteService.
 */
export async function getRouteDistanceORS(origin, destination) {
  if (!ORS_API_KEY) return Promise.reject(new Error('Geen OpenRouteService API-sleutel. Zet VITE_OPENROUTE_API_KEY in .env'));

  const from = typeof origin === 'object' && origin?.lat != null ? origin : null;
  const to = typeof destination === 'object' && destination?.lat != null ? destination : null;
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
  const km = Math.round(distanceM / 1000);
  const geometry = route.geometry?.coordinates; // [lng, lat][]

  return { km, geometry };
}

export function hasOpenRouteApiKey() {
  return !!ORS_API_KEY;
}

/**
 * Afstandsmatrix tussen meerdere punten (route-optimalisatie).
 * @param locations { lat, lng }[]
 * @returns Promise<number[][]> matrix[i][j] = km (∞ als geen route)
 */
export async function getDistanceMatrixORS(locations) {
  if (!ORS_API_KEY) return Promise.reject(new Error('Geen OpenRouteService API-sleutel'));

  const coordinates = locations.map((p) => [p.lng, p.lat]);

  const res = await fetch(ORS_MATRIX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ORS_API_KEY,
    },
    body: JSON.stringify({
      locations: coordinates,
      metrics: ['distance'],
    }),
  });

  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  const data = await res.json();
  const dist = data.distances;
  if (!dist) return Promise.reject(new Error('Geen matrix terug'));

  const n = locations.length;
  const matrix = Array(n)
    .fill(0)
    .map(() => Array(n).fill(Infinity));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const m = dist[i]?.[j];
      matrix[i][j] = m != null ? Math.round(m / 1000) : Infinity;
    }
  }
  return matrix;
}
