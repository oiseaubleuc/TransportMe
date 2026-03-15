/**
 * Kaart met Leaflet (OpenStreetMap) – gratis, geen sleutel nodig.
 * Afstand/route via OpenRouteService (gratis API-sleutel: https://openrouteservice.org/dev/#/signup).
 */

import L from 'leaflet';
import { getOpenRouteApiKey } from './config.js';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const ORS_DIRECTIONS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';
const ORS_MATRIX_URL = 'https://api.openrouteservice.org/v2/matrix/driving-car';
const ORS_URL = ORS_DIRECTIONS_URL;

/**
 * Afstand (km) en route-geometrie via OpenRouteService (gratis API-sleutel).
 */
export async function getRouteDistanceORS(origin, destination) {
  const key = getOpenRouteApiKey();
  if (!key) return Promise.reject(new Error('Geen OpenRouteService API-sleutel. Zet VITE_OPENROUTE_API_KEY in .env'));

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
      Authorization: key,
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

/**
 * Toon Leaflet-kaart met markers en optioneel route-lijn (als ORS-sleutel aanwezig).
 */
export function showLeafletMap(containerId, from, to) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const center = from?.lat != null ? [from.lat, from.lng] : [50.85, 4.35];
  const map = L.map(container).setView(center, 8);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  if (from?.lat != null) {
    L.marker([from.lat, from.lng]).addTo(map).bindPopup(from.name || 'Vertrek');
  }
  if (to?.lat != null) {
    L.marker([to.lat, to.lng]).addTo(map).bindPopup(to.name || 'Bestemming');
  }

  return map;
}

/**
 * Teken route als polyline op bestaande Leaflet map. Coördinaten: [lng, lat][].
 */
export function addRouteToLeafletMap(map, geometry) {
  if (!map || !geometry?.length) return;
  const latLngs = geometry.map((c) => [c[1], c[0]]);
  L.polyline(latLngs, { color: '#3fb950', weight: 4 }).addTo(map);
  map.fitBounds(latLngs, { padding: [30, 30] });
}

export function hasOpenRouteApiKey() {
  return !!getOpenRouteApiKey();
}

/**
 * Afstandsmatrix tussen meerdere punten (voor route-optimalisatie).
 * @param locations Array van { lat, lng }
 * @returns Promise<number[][]> matrix[i][j] = afstand in km (oneindig als geen route)
 */
export async function getDistanceMatrixORS(locations) {
  const key = getOpenRouteApiKey();
  if (!key) return Promise.reject(new Error('Geen OpenRouteService API-sleutel'));

  const coordinates = locations.map((p) => [p.lng, p.lat]);

  const res = await fetch(ORS_MATRIX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: key,
    },
    body: JSON.stringify({
      locations: coordinates,
      metrics: ['distance'],
    }),
  });

  if (!res.ok) throw new Error(await res.text() || res.statusText);
  const data = await res.json();
  const dist = data.distances; // matrix in meters, or null
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
