/**
 * Transporteur – hoofdingang
 * Mobielvriendelijk: navigatie, vaste ritten, kaart (Leaflet/ORS), ziekenhuizen
 */

import { updateKPI, updateKmTeller, updateVandaagSummary, initPeriodToggle, syncPeriodButtons, updateFinancialChart, updateRittenStatusLijst, updateRitMelding } from './js/dashboard.js';
import { initFormRit, initFormBrandstof, initFormOverig, setAlleDatumsVandaag } from './js/forms.js';
import { renderAllTables } from './js/tables.js';
import { DEFAULT_CHAUFFEURS, RIT_DUUR_MINUTEN } from './js/config.js';
import { getData, getZiekenhuizen, saveZiekenhuizen, saveRitten, getPresetRoutes, savePresetRoutes, getVoertuigen, saveVoertuigen } from './js/storage.js';
import { vergoedingVoorRit, toDateStr, isInDay, geschatteAfstandKm, isRitVoltooid } from './js/calculations.js';
import { formatEuro, formatDatumTijd } from './js/format.js';
import { getRouteDistance, hasMapsApiKey } from './js/maps.js';
import { initPlaceSearchFree } from './js/placeSearchFree.js';
import { getRouteDistanceORS, hasOpenRouteApiKey, getDistanceMatrixORS } from './js/mapLeaflet.js';
import { showMapLibreMap, addRouteToMapLibreMap } from './js/mapLibre.js';
import { buildDistanceMatrix, computeOptimalOrder } from './js/routeOptimization.js';

function refresh() {
  updateKPI();
  updateKmTeller();
  updateVandaagSummary();
  updateFinancialChart();
  updateRitMelding(refresh);
  updateRittenStatusLijst(refresh);
  renderAllTables(refresh);
  renderVasteRitten();
  renderSavedZiekenhuizen();
  fillVoertuigDropdowns();
  fillChauffeurDropdown();
  renderVoertuigen();
  renderRittenStatusPagina();
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
  if (pageId === 'dashboard') {
    updateVandaagSummary();
    updateRitMelding(refresh);
  }
}

const THEME_STORAGE_KEY = 'transporteur_theme';

function getEffectiveTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    root.setAttribute('data-theme', theme);
  }
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.content = theme === 'dark' ? '#000000' : '#f0f0f0';
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  const activeChoice = saved === 'light' || saved === 'dark' ? saved : 'system';
  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === activeChoice);
  });
}

function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') applyTheme(saved);
  else applyTheme('system');

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, theme);
      applyTheme(theme);
    });
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem(THEME_STORAGE_KEY) !== 'light' && localStorage.getItem(THEME_STORAGE_KEY) !== 'dark') {
      applyTheme('system');
    }
  });
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

// --- Rit bestemming: twee dropdowns (Vertrek → Bestemming) ---
function renderVasteRitten() {
  const vertrekSelect = document.getElementById('rit-vertrek');
  const bestemmingSelect = document.getElementById('rit-bestemming');
  const kmInput = document.getElementById('rit-km');
  if (!vertrekSelect || !bestemmingSelect || !kmInput) return;

  const presets = getPresetRoutes();
  const hospitals = getZiekenhuizen();
  const getHospital = (id) => hospitals.find((h) => h.id === id);

  // Unieke vertrekken (fromId) met label fromName, gesorteerd op naam
  const vertrekMap = new Map();
  presets.forEach((p) => {
    if (!vertrekMap.has(p.fromId)) vertrekMap.set(p.fromId, p.fromName || p.fromId);
  });
  const vertrekIds = [...vertrekMap.entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || ''));

  vertrekSelect.innerHTML = '<option value="">— Kies vertrek —</option>';
  vertrekIds.forEach(([id, name]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name;
    vertrekSelect.appendChild(opt);
  });

  function vulBestemming() {
    const fromId = vertrekSelect.value;
    bestemmingSelect.innerHTML = '<option value="">— Kies bestemming —</option>';
    if (!fromId) return;
    const voorVertrek = presets.filter((p) => p.fromId === fromId).sort((a, b) => (a.toName || '').localeCompare(b.toName || ''));
    voorVertrek.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.defaultKm != null ? `${p.toName} (${p.defaultKm} km)` : p.toName;
      bestemmingSelect.appendChild(opt);
    });
  }

  vertrekSelect.addEventListener('change', () => {
    vulBestemming();
    bestemmingSelect.value = '';
    kmInput.value = '';
    kmInput.dispatchEvent(new Event('input'));
    const destEl = document.getElementById('rit-selected-destination');
    if (destEl) { destEl.hidden = true; destEl.textContent = ''; }
  });

  bestemmingSelect.addEventListener('change', async () => {
    const presetId = bestemmingSelect.value;
    const preset = presets.find((p) => p.id === presetId);
    const destEl = document.getElementById('rit-selected-destination');
    if (!preset) {
      if (destEl) destEl.hidden = true;
      kmInput.value = '';
      kmInput.dispatchEvent(new Event('input'));
      return;
    }
    if (destEl) {
      destEl.textContent = `${preset.fromName} → ${preset.toName}`;
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
          kmInput.value = preset.defaultKm ?? '';
          kmInput.dispatchEvent(new Event('input'));
        }
      } else if (hasMapsApiKey()) {
        try {
          const { km } = await getRouteDistance(from, to);
          kmInput.value = km;
          kmInput.dispatchEvent(new Event('input'));
        } catch (e) {
          kmInput.value = preset.defaultKm ?? '';
          kmInput.dispatchEvent(new Event('input'));
        }
      }
    }
  });

  vulBestemming();
}

function escapeHtml(str) {
  if (str == null) return '';
  const s = String(str);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Kaart ---
let mapPageInited = false;

function renderKaartSelect() {
  const fromSelect = document.getElementById('kaart-from');
  const toSelect = document.getElementById('kaart-to');
  if (!fromSelect || !toSelect) return;
  const locations = getZiekenhuizen();
  const opts = locations.map((h) => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('');
  fromSelect.innerHTML = '<option value="">— Kies vertrek —</option>' + opts;
  toSelect.innerHTML = '<option value="">— Kies aankomst —</option>' + opts;
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
  const fromSelect = document.getElementById('kaart-from');
  const toSelect = document.getElementById('kaart-to');
  const container = document.getElementById('map-container');
  const linkWaze = document.getElementById('link-waze');
  const linkGoogle = document.getElementById('link-google-nav');
  const intro = document.getElementById('kaart-intro');
  const btnRitVandaag = document.getElementById('kaart-rit-vandaag-btn');
  const hasORS = hasOpenRouteApiKey();
  const hospitals = getZiekenhuizen();

  function getSelectedFromTo() {
    const fromId = fromSelect?.value;
    const toId = toSelect?.value;
    if (!fromId || !toId || fromId === toId) return { from: null, to: null };
    const from = hospitals.find((h) => h.id === fromId);
    const to = hospitals.find((h) => h.id === toId);
    return { from, to };
  }

  function updateRitVandaagButton() {
    const { from, to } = getSelectedFromTo();
    const chauffeur = document.getElementById('kaart-chauffeur')?.value;
    const voertuig = document.getElementById('kaart-voertuig')?.value;
    if (btnRitVandaag) btnRitVandaag.disabled = !from || !to || !chauffeur || !voertuig;
  }

  function updateMapAndLinks() {
    const { from, to } = getSelectedFromTo();
    setNavigationLinks(from, to);
    updateRitVandaagButton();

    if (!container) return;

    container.innerHTML = '';
    const mapDiv = document.createElement('div');
    mapDiv.id = 'map-canvas';
    mapDiv.className = 'map-canvas';
    container.appendChild(mapDiv);

    const hasBoth = from?.lat != null && to?.lat != null;
    const map = showMapLibreMap('map-canvas', hasBoth ? from : null, hasBoth ? to : null);

    if (map) {
      const ro = new ResizeObserver(() => map.resize());
      ro.observe(container);
      map.on('remove', () => ro.disconnect());
      setTimeout(() => map.resize(), 150);
    }
    if (hasBoth && hasORS && map) {
      getRouteDistanceORS(from, to)
        .then(({ geometry }) => addRouteToMapLibreMap(map, geometry))
        .catch(() => {});
    }
  }

  if (fromSelect && toSelect && !mapPageInited) {
    mapPageInited = true;
    function onKaartSelectChange() {
      const { from, to } = getSelectedFromTo();
      setNavigationLinks(from, to);
      updateRitVandaagButton();
      if (container) updateMapAndLinks();
    }
    fromSelect.addEventListener('change', onKaartSelectChange);
    toSelect.addEventListener('change', onKaartSelectChange);
    const kaartChauffeur = document.getElementById('kaart-chauffeur');
    const kaartVoertuig = document.getElementById('kaart-voertuig');
    kaartChauffeur?.addEventListener('change', updateRitVandaagButton);
    kaartVoertuig?.addEventListener('change', updateRitVandaagButton);
  }

  updateMapAndLinks();

  btnRitVandaag?.addEventListener('click', async () => {
    const { from, to } = getSelectedFromTo();
    if (!from || !to) return;

    const presets = getPresetRoutes();
    const preset = presets.find((p) => p.fromId === from.id && p.toId === to.id);

    let km = preset?.defaultKm;
    if (km == null && from?.lat != null && to?.lat != null) {
      if (hasORS) {
        try {
          const res = await getRouteDistanceORS(from, to);
          km = res.km;
        } catch (e) {}
      }
      if ((km == null || km < 1) && hasMapsApiKey()) {
        try {
          const res = await getRouteDistance(from, to);
          km = res.km;
        } catch (e) {}
      }
    }
    if (km == null || km < 1) {
      km = geschatteAfstandKm(from, to);
      if (km == null || km < 1) {
        alert('Kon afstand niet bepalen. Voeg de rit handmatig toe op de pagina Ritten.');
        return;
      }
      // Afstand geschat (geen API-route beschikbaar)
      if (typeof document !== 'undefined' && document.body) {
        const notice = document.createElement('div');
        notice.setAttribute('role', 'status');
        notice.className = 'toast-notice';
        notice.textContent = 'Afstand geschat (geen route beschikbaar). Je kunt km later aanpassen in Meer → Gegevens.';
        document.body.appendChild(notice);
        setTimeout(() => notice.remove(), 4000);
      }
    }

    const chauffeurSel = document.getElementById('kaart-chauffeur');
    const voertuigSel = document.getElementById('kaart-voertuig');
    const chauffeurId = chauffeurSel?.value || '';
    const chauffeurName = chauffeurSel?.selectedOptions?.[0]?.textContent || '';
    const voertuigId = voertuigSel?.value || '';
    const voertuigName = voertuigSel?.selectedOptions?.[0]?.textContent || '';
    if (!chauffeurId || !voertuigId) {
      alert('Kies chauffeur en voertuig.');
      return;
    }
    const now = new Date();
    const datum = toDateStr(now);
    const tijd = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const vergoeding = vergoedingVoorRit(km);
    const { ritten } = getData();
    ritten.push({
      id: Date.now(),
      datum,
      tijd,
      km,
      vergoeding,
      voertuigId,
      voertuigName,
      chauffeurId,
      chauffeurName,
      status: 'komend',
      duurMinuten: RIT_DUUR_MINUTEN,
      toegevoegdVia: 'kaart',
    });
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

function fillVoertuigDropdowns() {
  const voertuigen = getVoertuigen();
  ['rit-voertuig', 'brandstof-voertuig', 'kaart-voertuig'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">— Kies voertuig —</option>';
    voertuigen.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.kenteken ? `${v.naam} (${v.kenteken})` : v.naam;
      sel.appendChild(opt);
    });
  });
}

function fillChauffeurDropdown() {
  ['rit-chauffeur', 'kaart-chauffeur'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">— Kies chauffeur —</option>';
    DEFAULT_CHAUFFEURS.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.naam;
      sel.appendChild(opt);
    });
  });
}

function renderRittenStatusPagina() {
  const { ritten } = getData();
  const komend = ritten.filter((r) => r.status === 'komend').sort((a, b) => (a.datum + (a.tijd || '')).localeCompare(b.datum + (b.tijd || '')));
  const lopend = ritten.filter((r) => r.status === 'lopend').sort((a, b) => (b.datum + (b.tijd || '')).localeCompare(a.datum + (a.tijd || '')));
  const voltooid = ritten.filter((r) => isRitVoltooid(r)).sort((a, b) => (b.datum + (b.voltooidTijd || b.tijd || '')).localeCompare(a.datum + (a.voltooidTijd || a.tijd || '')));

  const leegIds = { 'ritten-lijst-komend': 'ritten-leeg-komend', 'ritten-lijst-lopend': 'ritten-leeg-lopend', 'ritten-lijst-voltooid': 'ritten-leeg-voltooid' };

  function renderList(listId, items) {
    const ul = document.getElementById(listId);
    const leegEl = document.getElementById(leegIds[listId]);
    if (!ul) return;
    if (leegEl) leegEl.hidden = items.length > 0;
    ul.hidden = items.length === 0;
    ul.innerHTML = items
      .map((r) => {
        const verg = r.vergoeding != null ? r.vergoeding : vergoedingVoorRit(r.km || 0);
        const tijdDisplay = listId === 'ritten-lijst-voltooid' ? (r.voltooidTijd || r.tijd) : r.tijd;
        const datumTijd = formatDatumTijd(r.datum, tijdDisplay);
        const meta = [r.chauffeurName, r.voertuigName].filter(Boolean).join(' · ') || '—';
        return `<li class="rit-kaart-item">
          <span class="rit-kaart-datum">${escapeHtml(datumTijd)}</span>
          <span class="rit-kaart-rit">${r.km || 0} km · ${formatEuro(verg)}</span>
          <span class="rit-kaart-meta">${escapeHtml(meta)}</span>
        </li>`;
      })
      .join('');
  }

  renderList('ritten-lijst-komend', komend);
  renderList('ritten-lijst-lopend', lopend);
  renderList('ritten-lijst-voltooid', voltooid);
}

function renderVoertuigen() {
  const ul = document.getElementById('saved-voertuigen');
  const btnAdd = document.getElementById('btn-voertuig-toevoegen');
  const inputNaam = document.getElementById('voertuig-naam');
  const inputKenteken = document.getElementById('voertuig-kenteken');
  if (!ul) return;

  const list = getVoertuigen();
  ul.innerHTML =
    list.length === 0
      ? '<li class="empty-state">Nog geen voertuigen. Voeg hierboven een voertuig toe.</li>'
      : list
          .map(
            (v) =>
              `<li>
                <span>${escapeHtml(v.naam)}${v.kenteken ? ' <em>(' + escapeHtml(v.kenteken) + ')</em>' : ''}</span>
                <button type="button" class="btn btn-danger btn-remove-voertuig" data-id="${v.id}">Verwijder</button>
              </li>`
          )
          .join('');

  ul.querySelectorAll('.btn-remove-voertuig').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      saveVoertuigen(list.filter((v) => v.id !== id));
      refresh();
    });
  });

  if (btnAdd && inputNaam) {
    btnAdd.onclick = () => {
      const naam = inputNaam.value.trim();
      if (!naam) return;
      const kenteken = inputKenteken?.value.trim() || '';
      const next = [...list, { id: String(Date.now()), naam, kenteken: kenteken || undefined }];
      saveVoertuigen(next);
      inputNaam.value = '';
      if (inputKenteken) inputKenteken.value = '';
      refresh();
    };
  }
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

  if (searchInput) {
    initPlaceSearchFree('zoek-ziekenhuis', 'zoek-suggesties', (place) => {
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
  initTheme();
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
