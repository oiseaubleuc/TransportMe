/**
 * Kaart met MapLibre GL JS – responsive, smooth zoom.
 * Standaard: OpenStreetMap-rastertegels (zelfde beeld als klassieke OSM-kaart).
 * Optioneel: VITE_MAPLIBRE_STYLE_URL in .env voor een andere MapLibre-style.
 */

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAPLIBRE_STYLE_URL } from './config.js';

/** OpenStreetMap-tegels (officiële tileservers a/b/c) */
const OSM_RASTER_STYLE = {
  version: 8,
  name: 'OpenStreetMap',
  sources: {
    openstreetmap: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'openstreetmap',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

function getMapStyle() {
  return MAPLIBRE_STYLE_URL || OSM_RASTER_STYLE;
}
const DEFAULT_CENTER = [4.35, 51.0];
const DEFAULT_ZOOM = 8;

/** Grenzen Vlaams Gewest (België) – standaardweergave voor vertrek/aankomst kiezen */
const FLANDERS_BOUNDS = new maplibregl.LngLatBounds([2.54, 50.68], [5.92, 51.51]);

const ROUTE_COLOR = '#6b8e23';
const ROUTE_WIDTH = 4;

/** Inzoomen op punt A–B: voldoende padding, hoog maxZoom zodat we niet uitzoomen */
const ROUTE_FIT_PADDING = 50;
const ROUTE_FIT_MAX_ZOOM = 14;

/**
 * Toon MapLibre-kaart. Zonder vertrek/aankomst: kaart van Vlaanderen. Met beide: markers en inzoomen op A–B.
 */
export function showMapLibreMap(containerId, from, to) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const hasFrom = from?.lat != null && from?.lng != null;
  const hasTo = to?.lat != null && to?.lng != null;
  const center = hasFrom ? [from.lng, from.lat] : hasTo ? [to.lng, to.lat] : DEFAULT_CENTER;

  const map = new maplibregl.Map({
    container,
    style: getMapStyle(),
    center,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

  if (hasFrom) {
    const el = document.createElement('div');
    el.className = 'maplibre-marker maplibre-marker-from';
    el.title = from.name || 'Vertrek';
    new maplibregl.Marker({ element: el })
      .setLngLat([from.lng, from.lat])
      .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`<strong>Vertrek</strong><br/>${escapeHtml(from.name || '')}`))
      .addTo(map);
  }
  if (hasTo) {
    const el = document.createElement('div');
    el.className = 'maplibre-marker maplibre-marker-to';
    el.title = to.name || 'Aankomst';
    new maplibregl.Marker({ element: el })
      .setLngLat([to.lng, to.lat])
      .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`<strong>Aankomst</strong><br/>${escapeHtml(to.name || '')}`))
      .addTo(map);
  }

  map.on('load', () => {
    if (hasFrom && hasTo) {
      const bounds = new maplibregl.LngLatBounds([from.lng, from.lat], [to.lng, to.lat]);
      map.fitBounds(bounds, { padding: ROUTE_FIT_PADDING, maxZoom: ROUTE_FIT_MAX_ZOOM, duration: 600 });
    } else {
      map.fitBounds(FLANDERS_BOUNDS, { padding: 40, maxZoom: 9, duration: 0 });
    }
  });

  return map;
}

function escapeHtml(str) {
  if (str == null) return '';
  const s = String(str);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Teken route als lijn op de MapLibre-kaart. Coördinaten: [lng, lat][].
 */
export function addRouteToMapLibreMap(map, geometry) {
  if (!map || !geometry?.length) return;

  const geojson = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: geometry,
    },
  };

  function addRouteLayer() {
    if (map.getLayer('route')) return;
    if (!map.getSource('route')) map.addSource('route', { type: 'geojson', data: geojson });
    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ROUTE_COLOR, 'line-width': ROUTE_WIDTH },
    });
    const bounds = geometry.reduce(
      (b, coord) => b.extend(coord),
      new maplibregl.LngLatBounds(geometry[0], geometry[0])
    );
    map.fitBounds(bounds, { padding: ROUTE_FIT_PADDING, maxZoom: ROUTE_FIT_MAX_ZOOM, duration: 800 });
  }

  if (map.isStyleLoaded()) {
    addRouteLayer();
  } else {
    map.once('load', addRouteLayer);
  }
}
