/**
 * Interactieve kaart met Google Maps (JavaScript API): basiskaart + autoroute A→B.
 * Vereist VITE_GOOGLE_MAPS_API_KEY en ingeschakelde Maps + Directions API.
 */

import { GOOGLE_MAPS_API_KEY } from './config.js';
import { loadGoogleMapsJs } from './googleDirections.js';

const FLANDERS_BOUNDS = { north: 51.51, south: 50.68, east: 5.92, west: 2.54 };

function metersToKmRounded(distanceM) {
  const m = Number(distanceM);
  if (!Number.isFinite(m) || m <= 0) return null;
  return Math.max(1, Math.round(m / 1000));
}

/**
 * @param {HTMLElement} containerEl
 * @param {{ lat: number, lng: number, name?: string } | null} from
 * @param {{ lat: number, lng: number, name?: string } | null} to
 */
export async function createGoogleRouteMap(containerEl, from, to) {
  const key = typeof GOOGLE_MAPS_API_KEY === 'string' ? GOOGLE_MAPS_API_KEY.trim() : '';
  if (!key || !containerEl) return null;

  await loadGoogleMapsJs(key);
  const g = window.google.maps;

  const hasFrom = from?.lat != null && from?.lng != null;
  const hasTo = to?.lat != null && to?.lng != null;
  const center = hasFrom
    ? { lat: from.lat, lng: from.lng }
    : hasTo
      ? { lat: to.lat, lng: to.lng }
      : { lat: 51.0, lng: 4.35 };

  const map = new g.Map(containerEl, {
    zoom: 8,
    center,
    mapTypeControl: true,
    streetViewControl: false,
    fullscreenControl: true,
  });

  const markers = [];
  let renderer = null;
  let km = null;

  if (hasFrom && hasTo) {
    renderer = new g.DirectionsRenderer({ map, suppressMarkers: false, preserveViewport: false });
    const svc = new g.DirectionsService();
    await new Promise(resolve => {
      svc.route(
        {
          origin: { lat: from.lat, lng: from.lng },
          destination: { lat: to.lat, lng: to.lng },
          travelMode: g.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === g.DirectionsStatus.OK && result?.routes?.[0]) {
            renderer.setDirections(result);
            let distM = 0;
            for (const leg of result.routes[0].legs || []) {
              distM += leg.distance?.value ?? 0;
            }
            km = metersToKmRounded(distM);
          }
          resolve();
        }
      );
    });
  } else {
    if (hasFrom) {
      markers.push(
        new g.Marker({
          map,
          position: { lat: from.lat, lng: from.lng },
          title: String(from.name || 'Vertrek'),
        })
      );
    }
    if (hasTo) {
      markers.push(
        new g.Marker({
          map,
          position: { lat: to.lat, lng: to.lng },
          title: String(to.name || 'Aankomst'),
        })
      );
    }
    if (markers.length === 2) {
      const b = new g.LatLngBounds();
      markers.forEach(m => b.extend(m.getPosition()));
      map.fitBounds(b, 50);
    } else if (markers.length === 1) {
      map.setZoom(11);
    } else {
      map.fitBounds(FLANDERS_BOUNDS);
    }
  }

  const triggerResize = () => {
    try {
      g.event.trigger(map, 'resize');
    } catch {
      /* ignore */
    }
  };

  const dispose = () => {
    try {
      renderer?.setMap(null);
    } catch {
      /* ignore */
    }
    markers.forEach(m => {
      try {
        m.setMap(null);
      } catch {
        /* ignore */
      }
    });
    try {
      containerEl.innerHTML = '';
    } catch {
      /* ignore */
    }
  };

  return { type: 'google', map, renderer, markers, km, triggerResize, dispose };
}
