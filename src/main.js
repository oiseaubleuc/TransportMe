/**
 * Transporteur – hoofdingang
 * Mobielvriendelijk: navigatie, vaste ritten, kaart (Leaflet/ORS), ziekenhuizen
 */

import 'leaflet/dist/leaflet.css';
import { updateKPI, updateKmTeller, updateVandaagSummary, initPeriodToggle, syncPeriodButtons } from './js/dashboard.js';
import { initFormRit, initFormBrandstof, initFormOverig, setAlleDatumsVandaag } from './js/forms.js';
import { renderAllTables } from './js/tables.js';
import { getData, getZiekenhuizen, saveZiekenhuizen, saveRitten, getPresetRoutes, savePresetRoutes } from './js/storage.js';
import { vergoedingVoorRit, toDateStr } from './js/calculations.js';
import { getRouteDistance, initPlacesAutocomplete, hasMapsApiKey } from './js/maps.js';
import { getRouteDistanceORS, showLeafletMap, addRouteToLeafletMap, hasOpenRouteApiKey, getDistanceMatrixORS } from './js/mapLeaflet.js';
import { buildDistanceMatrix, computeOptimalOrder } from './js/routeOptimization.js';

function refresh() {
  updateKPI();
  updateKmTeller();
  updateVandaagSummary();
  renderAllTables(refresh);
  renderVasteRitten();
  renderSavedZiekenhuizen();
  renderKaartSelect();
  fillNewRouteDropdowns();
  renderRouteChecklist();
  fillRouteStartDropdown();
}

// --- Paginanavigatie ---
function showPage(pageId) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => {
    n.classList.toggle('active', n.dataset.page === pageId);
    n.setAttribute('aria-current', n.dataset.page === pageId ? 'page' : 'false');
  });
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');
  if (pageId === 'kaart') initMapIfNeeded();
  if (pageId === 'route') initRoutePageIfNeeded();
  if (pageId === 'dashboard') updateVandaagSummary();
}

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
  const ritKiezenBtn = document.getElementById('dashboard-rit-kiezen');
  if (ritKiezenBtn) {
    ritKiezenBtn.addEventListener('click', () => showPage('ritten'));
  }
}

// --- Vaste ritten (gegroepeerd per vertrek) ---
function renderVasteRitten() {
  const container = document.getElementById('vaste-ritten-list');
  const kmInput = document.getElementById('rit-km');
  if (!container || !kmInput) return;

  const presets = getPresetRoutes();
  const hospitals = getZiekenhuizen();
  const getHospital = (id) => hospitals.find((h) => h.id === id);

  const byVertrek = {};
  presets.forEach((p) => {
    const key = p.fromName || p.fromId;
    if (!byVertrek[key]) byVertrek[key] = [];
    byVertrek[key].push(p);
  });
  const vertrekken = Object.keys(byVertrek).sort((a, b) => a.localeCompare(b));

  container.innerHTML = vertrekken
    .map(
      (vertrek) => `
    <section class="vaste-ritten-groep">
      <h3 class="vaste-ritten-groep-titel">${escapeHtml(vertrek)}</h3>
      <ul class="vaste-ritten-lijst">
        ${byVertrek[vertrek]
          .map((p) => {
            const km = p.defaultKm != null ? p.defaultKm : '?';
            return `<li><button type="button" class="preset-rit-btn" data-preset-id="${p.id}">
              <span class="preset-rit-bestemming">${escapeHtml(p.toName)}</span>
              <span class="preset-rit-km">${km} km</span>
            </button></li>`;
          })
          .join('')}
      </ul>
    </section>`
    )
    .join('');

  container.querySelectorAll('.preset-rit-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const preset = presets.find((p) => p.id === btn.dataset.presetId);
      if (!preset) return;

      // Visuele feedback: geselecteerde bestemming
      container.querySelectorAll('.preset-rit-btn').forEach((b) => b.classList.remove('preset-rit-btn--selected'));
      btn.classList.add('preset-rit-btn--selected');

      const destEl = document.getElementById('rit-selected-destination');
      if (destEl) {
        destEl.textContent = `Naar ${preset.toName}`;
        destEl.hidden = false;
      }

      if (preset.defaultKm != null) {
        kmInput.value = preset.defaultKm;
        kmInput.dispatchEvent(new Event('input'));
        return;
      }
      const from = getHospital(preset.fromId);
      const to = getHospital(preset.toId);
      if (from?.lat != null && to?.lat != null) {
        if (hasOpenRouteApiKey()) {
          try {
            const { km } = await getRouteDistanceORS(from, to);
            kmInput.value = km;
            kmInput.dispatchEvent(new Event('input'));
          } catch (e) {
            if (preset.defaultKm != null) kmInput.value = preset.defaultKm;
            else kmInput.value = '';
          }
        } else if (hasMapsApiKey()) {
          try {
            const { km } = await getRouteDistance(from, to);
            kmInput.value = km;
            kmInput.dispatchEvent(new Event('input'));
          } catch (e) {
            kmInput.value = preset.defaultKm ?? '';
          }
        }
      }
    });
  });

}

function escapeHtml(str) {
  if (str == null) return '';
  const s = String(str);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Kaart ---
let mapPageInited = false;

function renderKaartSelect() {
  const select = document.getElementById('kaart-route-select');
  if (!select) return;
  const presets = getPresetRoutes();
  select.innerHTML =
    '<option value="">— Kies een rit —</option>' +
    presets
      .map((p) => `<option value="${p.id}">${escapeHtml(p.fromName)} → ${escapeHtml(p.toName)}</option>`)
      .join('');
}

function setNavigationLinks(from, to) {
  const linkWaze = document.getElementById('link-waze');
  const linkGoogle = document.getElementById('link-google-nav');
  if (from?.lat != null && to?.lat != null) {
    if (linkWaze) linkWaze.href = `https://waze.com/ul?ll=${to.lat},${to.lng}&navigate=yes`;
    if (linkGoogle)
      linkGoogle.href = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`;
  } else {
    if (linkWaze) linkWaze.href = '#';
    if (linkGoogle) linkGoogle.href = '#';
  }
}

function initMapIfNeeded() {
  const select = document.getElementById('kaart-route-select');
  const container = document.getElementById('map-container');
  const placeholder = document.getElementById('map-placeholder');
  const linkWaze = document.getElementById('link-waze');
  const linkGoogle = document.getElementById('link-google-nav');
  const intro = document.getElementById('kaart-intro');
  const btnRitVandaag = document.getElementById('kaart-rit-vandaag-btn');
  const hasORS = hasOpenRouteApiKey();

  function updateRitVandaagButton() {
    if (btnRitVandaag) btnRitVandaag.disabled = !select?.value;
  }

  function updateMapAndLinks() {
    const presetId = select?.value;
    const presets = getPresetRoutes();
    const hospitals = getZiekenhuizen();
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;

    const from = hospitals.find((h) => h.id === preset.fromId);
    const to = hospitals.find((h) => h.id === preset.toId);

    setNavigationLinks(from, to);
    updateRitVandaagButton();

    if (!container) return;
    if (!from?.lat || !to?.lat) {
      container.innerHTML = '';
      const ph = document.createElement('div');
      ph.className = 'map-placeholder';
      ph.textContent = 'Geen coördinaten voor deze rit.';
      container.appendChild(ph);
      return;
    }

    container.innerHTML = '';
    const mapDiv = document.createElement('div');
    mapDiv.id = 'map-canvas';
    mapDiv.style.width = '100%';
    mapDiv.style.height = '280px';
    container.appendChild(mapDiv);

    const fromLatLng = { ...from, lat: from.lat, lng: from.lng };
    const toLatLng = { ...to, lat: to.lat, lng: to.lng };
    const map = showLeafletMap('map-canvas', fromLatLng, toLatLng);

    if (hasORS && map) {
      getRouteDistanceORS(from, to)
        .then(({ geometry }) => addRouteToLeafletMap(map, geometry))
        .catch(() => {});
    }
  }

  if (select && !mapPageInited) {
    mapPageInited = true;
    select.addEventListener('change', () => {
      if (!select.value) {
        if (container) {
          container.innerHTML = '';
          const ph = document.createElement('div');
          ph.className = 'map-placeholder';
          ph.id = 'map-placeholder';
          ph.textContent = 'Kies een rit om de kaart te zien.';
          container.appendChild(ph);
        }
        setNavigationLinks(null, null);
        if (btnRitVandaag) btnRitVandaag.disabled = true;
        return;
      }
      updateMapAndLinks();
    });
  }

  btnRitVandaag?.addEventListener('click', async () => {
    const presetId = select?.value;
    if (!presetId) return;
    const presets = getPresetRoutes();
    const hospitals = getZiekenhuizen();
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;

    let km = preset.defaultKm;
    if (km == null && preset.fromId && preset.toId) {
      const from = hospitals.find((h) => h.id === preset.fromId);
      const to = hospitals.find((h) => h.id === preset.toId);
      if (from?.lat != null && to?.lat != null && hasOpenRouteApiKey()) {
        try {
          const res = await getRouteDistanceORS(from, to);
          km = res.km;
        } catch (e) {}
        if (km == null && hasMapsApiKey()) {
          try {
            const res = await getRouteDistance(from, to);
            km = res.km;
          } catch (e) {}
        }
      }
    }
    if (km == null || km < 1) {
      alert('Kon afstand niet bepalen. Voeg de rit handmatig toe op de pagina Ritten.');
      return;
    }

    const datum = toDateStr(new Date());
    const vergoeding = vergoedingVoorRit(km);
    const { ritten } = getData();
    ritten.push({ id: Date.now(), datum, km, vergoeding });
    ritten.sort((a, b) => a.datum.localeCompare(b.datum));
    saveRitten(ritten);
    refresh();
  });

  updateRitVandaagButton();
}

// --- Ziekenhuizen zoeken en toevoegen ---
let pendingPlace = null;

function renderSavedZiekenhuizen() {
  const ul = document.getElementById('saved-ziekenhuizen');
  if (!ul) return;
  const list = getZiekenhuizen();
  ul.innerHTML = list
    .map(
      (h) =>
        `<li>
          <span>${escapeHtml(h.name)}${h.address ? ' – ' + escapeHtml(h.address) : ''}</span>
          <button type="button" class="btn btn-danger btn-remove-hospital" data-id="${h.id}">Verwijder</button>
        </li>`
    )
    .join('');

  ul.querySelectorAll('.btn-remove-hospital').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const next = list.filter((h) => h.id !== id);
      saveZiekenhuizen(next);
      refresh();
    });
  });
}

function fillNewRouteDropdowns() {
  const fromSelect = document.getElementById('new-route-from');
  const toSelect = document.getElementById('new-route-to');
  if (!fromSelect || !toSelect) return;
  const list = getZiekenhuizen();
  const opts = list.map((h) => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('');
  fromSelect.innerHTML = '<option value="">— Van —</option>' + opts;
  toSelect.innerHTML = '<option value="">— Naar —</option>' + opts;
}

// --- Optimale route (meerdere ritten, kortste volgorde) ---
function renderRouteChecklist() {
  const container = document.getElementById('route-checklist');
  if (!container) return;
  const presets = getPresetRoutes();
  const byVertrek = {};
  presets.forEach((p) => {
    const key = p.fromName || p.fromId;
    if (!byVertrek[key]) byVertrek[key] = [];
    byVertrek[key].push(p);
  });
  const vertrekken = Object.keys(byVertrek).sort((a, b) => a.localeCompare(b));

  container.innerHTML = vertrekken
    .map(
      (vertrek) => `
    <div class="route-checklist-groep">
      <div class="route-checklist-groep-titel">${escapeHtml(vertrek)}</div>
      ${byVertrek[vertrek]
        .map(
          (p) =>
            `<label class="route-checklist-item"><input type="checkbox" class="route-rit-cb" data-preset-id="${p.id}" /><span class="route-checklist-to">${escapeHtml(p.toName)}</span><span class="route-checklist-km">${p.defaultKm != null ? p.defaultKm + ' km' : '?'}</span></label>`
        )
        .join('')}
    </div>`
    )
    .join('');
}

function fillRouteStartDropdown() {
  const select = document.getElementById('route-start');
  if (!select) return;
  const list = getZiekenhuizen();
  const opts = list.map((h) => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('');
  select.innerHTML = '<option value="">— Kies startpunt —</option>' + opts;
}

let routePageInited = false;

function initRoutePageIfNeeded() {
  const btn = document.getElementById('route-bereken-btn');
  if (!btn || routePageInited) return;
  routePageInited = true;

  btn.addEventListener('click', async () => {
    const startSelect = document.getElementById('route-start');
    const startId = startSelect?.value;
    if (!startId) {
      alert('Kies een startpunt.');
      return;
    }
    const checked = document.querySelectorAll('.route-rit-cb:checked');
    const selectedPresetIds = Array.from(checked).map((el) => el.dataset.presetId);
    if (selectedPresetIds.length === 0) {
      alert('Selecteer minstens één rit.');
      return;
    }

    const presets = getPresetRoutes();
    const hospitals = getZiekenhuizen();
    const selectedRitten = selectedPresetIds
      .map((id) => presets.find((p) => p.id === id))
      .filter(Boolean);

    const allIds = new Set([startId]);
    selectedRitten.forEach((r) => {
      allIds.add(r.fromId);
      allIds.add(r.toId);
    });
    const locations = Array.from(allIds)
      .map((id) => hospitals.find((h) => h.id === id))
      .filter((h) => h && h.lat != null && h.lng != null);

    if (locations.length === 0) {
      alert('Geen geldige locaties met coördinaten.');
      return;
    }

    const locationIndexById = {};
    locations.forEach((loc, i) => {
      locationIndexById[loc.id] = i;
    });
    const startIndex = locationIndexById[startId] ?? 0;

    btn.disabled = true;
    btn.textContent = 'Bezig…';

    try {
      const matrixFn = hasOpenRouteApiKey()
        ? (locs) => getDistanceMatrixORS(locs.map((l) => ({ lat: l.lat, lng: l.lng })))
        : null;
      const distMatrix = await buildDistanceMatrix(
        locations.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng })),
        matrixFn
      );

      const result = computeOptimalOrder(
        startIndex,
        selectedRitten,
        locations,
        distMatrix,
        locationIndexById
      );

      const orderList = document.getElementById('route-order-list');
      const totalenEl = document.getElementById('route-totalen');
      const resultBlock = document.getElementById('route-result');
      if (orderList) {
        orderList.innerHTML = result.order
          .map(
            (r, i) =>
              `<li>${i + 1}. ${escapeHtml(r.fromName)} → ${escapeHtml(r.toName)}${r.defaultKm != null ? ' (' + r.defaultKm + ' km)' : ''}</li>`
          )
          .join('');
      }
      if (totalenEl) {
        totalenEl.innerHTML =
          `Ritten: <strong>${result.totalRitKm} km</strong> · Lege km: <strong>${result.totalConnectingKm} km</strong> · Totaal: <strong>${result.totalKm} km</strong>`;
      }
      if (resultBlock) resultBlock.hidden = false;
    } catch (e) {
      alert('Berekenen mislukt. ' + (e.message || e));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Bereken optimale route';
    }
  });
}

function initZiekenhuizen() {
  const searchInput = document.getElementById('zoek-ziekenhuis');
  const resultDiv = document.getElementById('zoek-resultaat');
  const btnAddPreset = document.getElementById('btn-add-preset-route');

  if (hasMapsApiKey() && searchInput) {
    initPlacesAutocomplete('zoek-ziekenhuis', (place) => {
      pendingPlace = place;
      if (resultDiv) {
        resultDiv.hidden = false;
        resultDiv.innerHTML = `"${escapeHtml(place.name)}" – ${escapeHtml(place.address)} <button type="button" class="btn btn-primary" id="btn-add-hospital">Toevoegen aan lijst</button>`;
        document.getElementById('btn-add-hospital')?.addEventListener('click', () => {
          if (!pendingPlace) return;
          const list = getZiekenhuizen();
          const id = 'h-' + Date.now();
          list.push({
            id,
            name: pendingPlace.name,
            address: pendingPlace.address,
            lat: pendingPlace.lat,
            lng: pendingPlace.lng,
          });
          saveZiekenhuizen(list);
          pendingPlace = null;
          resultDiv.hidden = true;
          resultDiv.innerHTML = '';
          searchInput.value = '';
          refresh();
        });
      }
    });
  } else if (searchInput) {
    searchInput.placeholder = 'Google Maps API-sleutel nodig om te zoeken (zie README)';
    searchInput.disabled = true;
  }

  btnAddPreset?.addEventListener('click', async () => {
    const fromId = document.getElementById('new-route-from')?.value;
    const toId = document.getElementById('new-route-to')?.value;
    if (!fromId || !toId || fromId === toId) {
      alert('Kies twee verschillende ziekenhuizen.');
      return;
    }
    const list = getZiekenhuizen();
    const from = list.find((h) => h.id === fromId);
    const to = list.find((h) => h.id === toId);
    if (!from?.lat || !to?.lat) {
      alert('Gekozen ziekenhuizen hebben geen coördinaten.');
      return;
    }

    let km = null;
    if (hasOpenRouteApiKey()) {
      try {
        const res = await getRouteDistanceORS(from, to);
        km = res.km;
      } catch (e) {
        console.error(e);
      }
    }
    if (km == null && hasMapsApiKey()) {
      try {
        const res = await getRouteDistance(from, to);
        km = res.km;
      } catch (e) {
        console.error(e);
      }
    }

    const presets = getPresetRoutes();
    const newPreset = {
      id: 'preset-' + Date.now(),
      fromId,
      toId,
      fromName: from.name,
      toName: to.name,
      defaultKm: km ?? undefined,
    };
    presets.push(newPreset);
    savePresetRoutes(presets);
    refresh();
  });
}

// --- Tabs (in page Meer) ---
function initTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const panel = document.getElementById('panel-' + name);
      if (panel) panel.classList.add('active');
    });
  });
}

// --- Start ---
function init() {
  setAlleDatumsVandaag();
  initNavigation();
  initPeriodToggle(refresh);
  syncPeriodButtons();
  initFormRit(refresh);
  initFormBrandstof(refresh);
  initFormOverig(refresh);
  initZiekenhuizen();
  initTabs();
  refresh();
}

init();
