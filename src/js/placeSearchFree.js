/**
 * Gratis zoeken naar plaatsen (ziekenhuizen, adressen) via OpenStreetMap Nominatim.
 * Geen API-sleutel nodig. Gebruik: max 1 request per seconde (Nominatim policy).
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const DEBOUNCE_MS = 1200;
const USER_AGENT = 'TransporteurDashboard/1.0 (ziekenhuisvervoer; contact via app)';

/**
 * Zoek plaatsen via Nominatim. Retourneert [{ name, address, lat, lng }].
 */
export async function searchPlaces(query) {
  const q = String(query).trim();
  if (!q || q.length < 2) return [];

  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '5',
    addressdetails: '1',
  });

  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
  });

  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((item) => {
    const name = item.name || item.display_name?.split(',')[0]?.trim() || item.display_name || 'Plaats';
    const address = item.display_name || '';
    return {
      name,
      address,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    };
  });
}

/**
 * Zoeken beperkt tot België (countrycodes=be) — Wallonië, Brussel, Vlaanderen.
 */
export async function searchPlacesBelgium(query) {
  const q = String(query).trim();
  if (!q || q.length < 2) return [];

  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '10',
    addressdetails: '1',
    countrycodes: 'be',
  });

  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });

  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((item) => {
    const name = item.name || item.display_name?.split(',')[0]?.trim() || item.display_name || 'Plaats';
    const address = item.display_name || '';
    return {
      name,
      address,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    };
  });
}

/**
 * Koppel gratis zoeken aan een input: bij typen suggesties tonen, bij keuze callback met place.
 * @param {string} inputId - ID van het zoekveld
 * @param {string} resultsContainerId - ID van de div waar suggesties komen (wordt leeg/getoond/verborgen)
 * @param {(place: { name: string, address: string, lat: number, lng: number }) => void} onPlaceSelect
 */
export function initPlaceSearchFree(inputId, resultsContainerId, onPlaceSelect) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(resultsContainerId);
  if (!input || !container) return;

  let debounceTimer = null;
  let lastQuery = '';

  function hideResults() {
    container.innerHTML = '';
    container.hidden = true;
  }

  function showResults(places) {
    container.innerHTML = places
      .map((p) => {
        const addr = p.address.length > 72 ? `${p.address.slice(0, 69)}…` : p.address;
        return (
          `<button type="button" class="place-search-item" data-name="${escapeAttr(p.name)}" data-address="${escapeAttr(p.address)}" data-lat="${p.lat}" data-lng="${p.lng}">` +
          `<strong>${escapeHtml(p.name)}</strong><span class="place-search-address">${escapeHtml(addr)}</span></button>`
        );
      })
      .join('');
    container.hidden = false;

    container.querySelectorAll('.place-search-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const place = {
          name: btn.dataset.name || '',
          address: btn.dataset.address || '',
          lat: parseFloat(btn.dataset.lat),
          lng: parseFloat(btn.dataset.lng),
        };
        hideResults();
        input.value = place.name;
        onPlaceSelect(place);
      });
    });
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      hideResults();
      return;
    }
    debounceTimer = setTimeout(async () => {
      if (q !== lastQuery) {
        lastQuery = q;
        try {
          const places = await searchPlaces(q);
          showResults(places);
        } catch (e) {
          hideResults();
        }
      }
    }, DEBOUNCE_MS);
  });

  input.addEventListener('blur', () => {
    setTimeout(hideResults, 200);
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target) && e.target !== input) hideResults();
  });
}

function escapeHtml(str) {
  if (str == null) return '';
  const s = String(str);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
