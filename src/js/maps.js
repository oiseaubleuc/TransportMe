/**
 * Google Maps – afstand, kaart, zoeken ziekenhuizen
 * Vereist VITE_GOOGLE_MAPS_API_KEY in .env
 */

import { getGoogleMapsApiKey } from './config.js';

let mapsLoaded = false;
let loadPromise = null;

function loadGoogleMaps() {
  if (mapsLoaded && window.google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;
  const key = getGoogleMapsApiKey();
  if (!key) {
    return Promise.reject(new Error('Geen Google Maps API-sleutel. Zet VITE_GOOGLE_MAPS_API_KEY in .env'));
  }
  loadPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) {
      mapsLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=__transporteurMapsCallback`;
    script.async = true;
    script.defer = true;
    window.__transporteurMapsCallback = () => {
      mapsLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Kon Google Maps niet laden'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

/**
 * Bepaal afstand (km) tussen twee punten via Directions API.
 * @param origin { lat, lng } of adres-string
 * @param destination idem
 */
export async function getRouteDistance(origin, destination) {
  await loadGoogleMaps();
  const g = window.google.maps;
  const originLatLng =
    typeof origin === 'object' && origin?.lat != null
      ? new g.LatLng(origin.lat, origin.lng)
      : origin;
  const destLatLng =
    typeof destination === 'object' && destination?.lat != null
      ? new g.LatLng(destination.lat, destination.lng)
      : destination;

  return new Promise((resolve, reject) => {
    const service = new g.DirectionsService();
    service.route(
      {
        origin: originLatLng,
        destination: destLatLng,
        travelMode: g.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status !== 'OK') {
          reject(new Error(status));
          return;
        }
        const route = result.routes[0];
        if (!route?.legs?.length) {
          reject(new Error('Geen route'));
          return;
        }
        const totalMeters = route.legs.reduce((s, leg) => s + (leg.distance?.value || 0), 0);
        const km = Math.round(totalMeters / 1000);
        resolve({ km, result });
      }
    );
  });
}

/**
 * Toon kaart in element met optionele route tussen twee punten.
 */
export async function showMapWithRoute(containerId, from, to) {
  await loadGoogleMaps();
  const container = document.getElementById(containerId);
  if (!container) return null;

  const g = window.google.maps;
  const center = from?.lat != null ? from : { lat: 50.85, lng: 4.35 };

  const map = new g.Map(container, {
    zoom: 8,
    center,
    mapTypeControl: true,
    fullscreenControl: true,
    zoomControl: true,
  });

  if (from?.lat != null) {
    new g.Marker({ position: from, map, title: from.name || 'Vertrek' });
  }
  if (to?.lat != null) {
    new g.Marker({ position: to, map, title: to.name || 'Bestemming' });
  }

  if (from?.lat != null && to?.lat != null) {
    const service = new g.DirectionsService();
    const renderer = new g.DirectionsRenderer({ map, suppressMarkers: true });
    service.route(
      {
        origin: from,
        destination: to,
        travelMode: g.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK') renderer.setDirections(result);
      }
    );
  }

  return map;
}

/**
 * Koppel Places Autocomplete aan een input; bij selectie callback met place { name, address, lat, lng }.
 */
export async function initPlacesAutocomplete(inputId, onPlaceSelect) {
  await loadGoogleMaps();
  const input = document.getElementById(inputId);
  if (!input) return;

  const autocomplete = new window.google.maps.places.Autocomplete(input, {
    types: ['establishment', 'geocode'],
    fields: ['formatted_address', 'geometry', 'name'],
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place.geometry?.location) return;
    const result = {
      name: place.name || place.formatted_address || '',
      address: place.formatted_address || '',
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    };
    onPlaceSelect(result);
  });
}

export function hasMapsApiKey() {
  return !!getGoogleMapsApiKey();
}
