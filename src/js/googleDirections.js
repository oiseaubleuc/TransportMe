/**
 * Afstand en route zoals Google Maps: Maps JavaScript API + DirectionsService.
 * (De Directions REST JSON-API werkt niet betrouwbaar vanuit de browser door CORS.)
 */

import { GOOGLE_MAPS_API_KEY } from './config.js';

function normEndpoints(origin, destination) {
  const from = typeof origin === 'object' && origin?.lat != null && origin?.lng != null ? origin : null;
  const to = typeof destination === 'object' && destination?.lat != null && destination?.lng != null ? destination : null;
  return { from, to };
}

function metersToKmRounded(distanceM) {
  const m = Number(distanceM);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.max(1, Math.round(m / 1000));
}

const CALLBACK = '__tmTransporteurGmapsCb';

let mapsScriptPromise = null;

function loadGoogleMapsScript(apiKey) {
  if (typeof window === 'undefined') return Promise.reject(new Error('Geen browser'));
  if (window.google?.maps?.DirectionsService) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-tm-google-maps="1"]');
    if (existing) {
      if (window.google?.maps?.DirectionsService) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Maps script')), { once: true });
      return;
    }

    window[CALLBACK] = () => {
      try {
        delete window[CALLBACK];
      } catch {
        window[CALLBACK] = undefined;
      }
      resolve();
    };

    const s = document.createElement('script');
    s.dataset.tmGoogleMaps = '1';
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=${CALLBACK}`;
    s.onerror = () => {
      mapsScriptPromise = null;
      reject(new Error('Google Maps kon niet laden'));
    };
    document.head.appendChild(s);
  });

  return mapsScriptPromise;
}

/**
 * @returns {{ km: number, geometry?: [number, number][] }} geometry = [lng, lat][] voor MapLibre / Leaflet
 */
export async function getDrivingRouteGoogleMaps(origin, destination) {
  const key = GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error('Geen VITE_GOOGLE_MAPS_API_KEY'));

  const { from, to } = normEndpoints(origin, destination);
  if (!from || !to) return Promise.reject(new Error('Ongeldige coördinaten'));

  await loadGoogleMapsScript(key);

  const svc = new window.google.maps.DirectionsService();
  /** Zelfde motor als Google Maps (driving); geen departureTime = stabiele routelengte i.p.v. live file. */
  const request = {
    origin: { lat: from.lat, lng: from.lng },
    destination: { lat: to.lat, lng: to.lng },
    travelMode: window.google.maps.TravelMode.DRIVING,
  };

  return new Promise((resolve, reject) => {
    svc.route(request, (result, status) => {
      if (status !== window.google.maps.DirectionsStatus.OK || !result?.routes?.[0]) {
        reject(new Error(`Google Directions: ${status}`));
        return;
      }
      const route = result.routes[0];
      let distM = 0;
      for (const leg of route.legs || []) {
        distM += leg.distance?.value ?? 0;
      }
      const km = metersToKmRounded(distM);

      /** @type {[number, number][]} */
      let geometry;
      const path = route.overview_path;
      if (path?.length) {
        geometry = path.map((p) => [p.lng(), p.lat()]);
      }

      resolve({ km, geometry });
    });
  });
}
