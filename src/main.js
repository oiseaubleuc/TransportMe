/**
 * Transporteur – hoofdingang
 * Mobielvriendelijk: navigatie, vaste ritten, berekening (brandstof + route), kaart, ziekenhuizen
 */

import { updateKPI, updateKmTeller, updateVandaagSummary, initPeriodToggle, syncPeriodButtons, updateFinancialChart, updateRittenStatusLijst, updateRitMelding, updateBeschikbaarheidWeek } from './js/dashboard.js';
import { initFormRit, initFormBrandstof, initFormOverig, initBulkRittenImport, setAlleDatumsVandaag } from './js/forms.js';
import { renderAllTables } from './js/tables.js';
import { DEFAULT_CHAUFFEURS, UI_COMPACT } from './js/config.js';
import {
  getData,
  getZiekenhuizen,
  saveZiekenhuizen,
  getPresetRoutes,
  savePresetRoutes,
  getVoertuigen,
  saveVoertuigen,
  getCurrentProfileId,
  setCurrentProfileId,
  getPlanningAvailability,
  savePlanningAvailability,
} from './js/storage.js';
import { PROFILES } from './js/config.js';
import { vergoedingVoorRit, geschatteAfstandKm, isRitVoltooid } from './js/calculations.js';
import { formatEuro, formatDatumTijd, formatDatumKort } from './js/format.js';
import { initPlaceSearchFree } from './js/placeSearchFree.js';
import { getRouteDistanceORS, hasOpenRouteApiKey, getDistanceMatrixORS } from './js/ors.js';
import { showMapLibreMap, addRouteToMapLibreMap } from './js/mapLibre.js';
import { buildDistanceMatrix, computeOptimalOrder } from './js/routeOptimization.js';

/** Ziekenhuizenlijst Meer: uitgeklapt = volledige lijst */
let ziekenhuizenLijstUitgeklapt = false;

function profileDisplayName() {
  const id = getCurrentProfileId();
  return PROFILES.find((p) => p.id === id)?.name ?? PROFILES[0].name;
}

function syncProfileSwitcher() {
  const sel = document.getElementById('profile-switcher');
  if (!sel) return;
  const cur = getCurrentProfileId();
  if (sel.options.length !== PROFILES.length) {
    sel.innerHTML = PROFILES.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  }
  sel.value = cur;
}

function refresh() {
  const profileLabel = document.getElementById('dashboard-profile-label');
  if (profileLabel) profileLabel.textContent = `Zelfstandige: ${profileDisplayName()}`;
  syncProfileSwitcher();

  updateRittenToolbar();

  updateKPI();
  updateKmTeller();
  updateVandaagSummary();
  updateBeschikbaarheidWeek();
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
  fillKaartRitDropdown();
  fillNewRouteDropdowns();
  renderRouteChecklist();
  fillRouteStartDropdown();
}

// --- Paginanavigatie + vorige tab (o.a. Ritten) ---
const TAB_LABELS = {
  dashboard: 'Dashboard',
  berekening: 'Berekening',
  ritten: 'Ritten',
  kaart: 'Kaart',
  meer: 'Meer',
};

let currentTabId = 'dashboard';
let previousTabId = null;

function setRittenSubview(mode) {
  const root = document.getElementById('ritten-page-root');
  const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 720px)').matches;
  if (root) {
    root.classList.remove('ritten-page--mode-overzicht', 'ritten-page--mode-aanmaken');
    if (!desktop) {
      root.classList.add(mode === 'aanmaken' ? 'ritten-page--mode-aanmaken' : 'ritten-page--mode-overzicht');
    } else {
      root.classList.add('ritten-page--mode-overzicht');
    }
  }
  if (mode === 'aanmaken' && desktop) {
    requestAnimationFrame(() => {
      document.getElementById('ritten-toevoegen')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (mode === 'overzicht' && !desktop) {
    document.getElementById('page-ritten')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const title = document.getElementById('ritten-toolbar-title');
  if (title) {
    title.textContent = !desktop && mode === 'aanmaken' ? 'Nieuwe rit' : 'Ritten';
  }
  updateRittenToolbar();
}

function updateRittenToolbar() {
  const pageRitten = document.getElementById('page-ritten');
  if (!pageRitten?.classList.contains('active')) return;

  const root = document.getElementById('ritten-page-root');
  const desktop = window.matchMedia('(min-width: 720px)').matches;
  const isAanmaken = root?.classList.contains('ritten-page--mode-aanmaken');

  const btnAanmaken = document.getElementById('btn-rit-aanmaken');
  const backOverzicht = document.getElementById('ritten-back-overzicht');
  const backPrev = document.getElementById('ritten-back-prev-page');
  const labelPrev = document.getElementById('ritten-back-prev-label');
  if (!btnAanmaken || !backOverzicht || !backPrev || !labelPrev) return;

  const hasPrev = previousTabId != null && TAB_LABELS[previousTabId];
  labelPrev.textContent = hasPrev ? TAB_LABELS[previousTabId] : '—';

  if (desktop) {
    btnAanmaken.hidden = false;
    backOverzicht.hidden = true;
    backPrev.hidden = !hasPrev;
    return;
  }

  if (isAanmaken) {
    btnAanmaken.hidden = true;
    backOverzicht.hidden = false;
    backPrev.hidden = !hasPrev;
  } else {
    btnAanmaken.hidden = false;
    backOverzicht.hidden = true;
    backPrev.hidden = !hasPrev;
  }
}

/** Filter op tab Ritten: planning-feed (stats + chips) */
let rittenOverzichtFilter = 'alle';
let rittenOverzichtZoek = '';

function initRittenPageControls() {
  document.getElementById('btn-rit-aanmaken')?.addEventListener('click', () => setRittenSubview('aanmaken'));
  document.getElementById('ritten-back-overzicht')?.addEventListener('click', () => setRittenSubview('overzicht'));
  document.getElementById('ritten-back-prev-page')?.addEventListener('click', () => {
    if (previousTabId) showPage(previousTabId);
  });
  window.addEventListener('resize', () => {
    if (document.getElementById('page-ritten')?.classList.contains('active')) updateRittenToolbar();
  });
  initRittenOverzichtDelegation();
  initRittenOverzichtZoek();
}

function initRittenOverzichtDelegation() {
  const aside = document.getElementById('ritten-overzicht-aside');
  if (!aside || aside.dataset.overzichtDeleg) return;
  aside.dataset.overzichtDeleg = '1';
  aside.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('.ritten-filter-btn[data-filter]');
    const statTile = e.target.closest('.ritten-stat-tile[data-filter]');
    const f = filterBtn?.dataset.filter || statTile?.dataset.filter;
    if (!f) return;
    rittenOverzichtFilter = f;
    renderRittenStatusPagina();
  });
}

function initRittenOverzichtZoek() {
  const input = document.getElementById('ritten-overzicht-zoek');
  const clearBtn = document.getElementById('ritten-overzicht-zoek-clear');
  if (!input || !clearBtn || input.dataset.overzichtZoekInited) return;
  input.dataset.overzichtZoekInited = '1';

  input.value = rittenOverzichtZoek;

  input.addEventListener('input', () => {
    rittenOverzichtZoek = input.value.trim();
    renderRittenStatusPagina();
  });

  clearBtn.addEventListener('click', () => {
    rittenOverzichtZoek = '';
    input.value = '';
    renderRittenStatusPagina();
    input.focus();
  });
}

function showPage(pageId, options = {}) {
  if (pageId !== currentTabId) {
    previousTabId = currentTabId;
    currentTabId = pageId;
  }

  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => {
    n.classList.toggle('active', n.dataset.page === pageId);
    n.setAttribute('aria-current', n.dataset.page === pageId ? 'page' : 'false');
  });
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');
  if (pageId === 'ritten') {
    setRittenSubview(options.rittenMode === 'aanmaken' ? 'aanmaken' : 'overzicht');
  } else {
    updateRittenToolbar();
  }
  if (pageId === 'kaart') initMapIfNeeded();
  if (pageId === 'berekening') initRoutePageIfNeeded();
  if (pageId === 'dashboard') {
    updateVandaagSummary();
    updateRitMelding(refresh);
  }
}

let dashboardTabsInited = false;
function initDashboardTabs() {
  if (dashboardTabsInited) return;
  const nav = document.querySelector('.dashboard-nav');
  const panels = document.querySelectorAll('.dashboard-panel');
  if (!nav || !panels.length) return;
  dashboardTabsInited = true;
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.dashboard-nav-btn');
    if (!btn || !btn.dataset.dashboardTab) return;
    const tabId = btn.dataset.dashboardTab;
    nav.querySelectorAll('.dashboard-nav-btn').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    btn.classList.add('active');
    panels.forEach((panel) => {
      const isActive = panel.id === 'dashboard-panel-' + tabId;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });
  });
}

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
  const ritKiezenBtn = document.getElementById('dashboard-rit-kiezen');
  if (ritKiezenBtn) {
    ritKiezenBtn.addEventListener('click', () => showPage('ritten', { rittenMode: 'aanmaken' }));
  }
}

function initMeerZiekenhuizenToggle() {
  document.getElementById('page-meer')?.addEventListener('click', (e) => {
    if (e.target.closest('#btn-ziekenhuizen-toggle')) {
      ziekenhuizenLijstUitgeklapt = !ziekenhuizenLijstUitgeklapt;
      refresh();
    }
  });
}

// --- Beschikbaarheid / Planning (maandelijks) ---
function getMonthKeyFromDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function isoDateFromYMD(yyyy, mm01, dd) {
  const mm = String(mm01).padStart(2, '0');
  const ddStr = String(dd).padStart(2, '0');
  return `${yyyy}-${mm}-${ddStr}`;
}

function getDaysInMonth(yyyy, mm01) {
  // mm01: 1-12
  return new Date(yyyy, mm01, 0).getDate();
}

function renderPlanningMonth() {
  const monthInput = document.getElementById('planning-maand');
  const daysEl = document.getElementById('planning-days');
  if (!monthInput || !daysEl) return;

  const monthKey = monthInput.value || getMonthKeyFromDate(new Date());
  monthInput.value = monthKey;

  const [yyyyStr, mmStr] = monthKey.split('-');
  const yyyy = Number(yyyyStr);
  const mm01 = Number(mmStr);
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm01)) return;

  const planning = getPlanningAvailability();
  const daysInMonth = getDaysInMonth(yyyy, mm01);

  const rows = [];
  for (let dd = 1; dd <= daysInMonth; dd++) {
    const dateISO = isoDateFromYMD(yyyy, mm01, dd);
    const d = new Date(yyyy, mm01 - 1, dd);
    const label = d.toLocaleDateString('nl-BE', { weekday: 'short', day: '2-digit', month: '2-digit' });

    const profileButtons = PROFILES.map((p) => {
      const available = Boolean(planning?.[p.id]?.[monthKey]?.[dateISO]);
      return `<button type="button"
          class="planning-av-toggle ${available ? 'planning-av-toggle--on' : ''}"
          data-profile-id="${escapeHtml(p.id)}"
          data-date-iso="${escapeHtml(dateISO)}"
          aria-pressed="${available ? 'true' : 'false'}"
        >
          ${available ? '✓' : '—'}
        </button>`;
    }).join('');

    rows.push(`<div class="planning-day-row">
      <span class="planning-day-label">${escapeHtml(label)}</span>
      ${profileButtons}
    </div>`);
  }

  daysEl.innerHTML = rows.join('');
}

function initPlanningAvailabilityTab() {
  const monthInput = document.getElementById('planning-maand');
  const daysEl = document.getElementById('planning-days');
  if (!monthInput || !daysEl) return;

  renderPlanningMonth();

  monthInput.addEventListener('change', () => {
    renderPlanningMonth();
    updateBeschikbaarheidWeek();
  });

  daysEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.planning-av-toggle');
    if (!btn) return;
    const profileId = btn.dataset.profileId;
    const dateISO = btn.dataset.dateIso;
    if (!profileId || !dateISO) return;

    const monthKey = dateISO.slice(0, 7);
    const planning = getPlanningAvailability();

    const currentlyOn = btn.getAttribute('aria-pressed') === 'true';
    const nextOn = !currentlyOn;

    if (nextOn) {
      if (!planning[profileId]) planning[profileId] = {};
      if (!planning[profileId][monthKey]) planning[profileId][monthKey] = {};
      planning[profileId][monthKey][dateISO] = true;
    } else {
      const month = planning?.[profileId]?.[monthKey];
      if (month) {
        delete month[dateISO];
        if (Object.keys(month).length === 0) delete planning[profileId][monthKey];
      }
    }

    savePlanningAvailability(planning);
    renderPlanningMonth();
    updateBeschikbaarheidWeek();
  });

  document.getElementById('planning-reset-maand')?.addEventListener('click', () => {
    const monthKey = monthInput.value || getMonthKeyFromDate(new Date());
    const planning = getPlanningAvailability();

    PROFILES.forEach((p) => {
      if (planning?.[p.id]?.[monthKey]) delete planning[p.id][monthKey];
    });

    savePlanningAvailability(planning);
    renderPlanningMonth();
    updateBeschikbaarheidWeek();
  });
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
          const est = geschatteAfstandKm(from, to);
          kmInput.value = est != null && est >= 1 ? est : preset.defaultKm ?? '';
          kmInput.dispatchEvent(new Event('input'));
        }
      } else {
        const est = geschatteAfstandKm(from, to);
        kmInput.value = est != null && est >= 1 ? est : preset.defaultKm ?? '';
        kmInput.dispatchEvent(new Event('input'));
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
  const preserveFrom = fromSelect.value;
  const preserveTo = toSelect.value;
  const locations = getZiekenhuizen();
  const opts = locations.map((h) => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('');
  fromSelect.innerHTML = '<option value="">— Kies vertrek —</option>' + opts;
  toSelect.innerHTML = '<option value="">— Kies aankomst —</option>' + opts;
  if (preserveFrom && locations.some((h) => h.id === preserveFrom)) fromSelect.value = preserveFrom;
  if (preserveTo && locations.some((h) => h.id === preserveTo)) toSelect.value = preserveTo;
}

/** Ritten met opgeslagen route (van Nieuwe rit) voor kaart-weergave */
function fillKaartRitDropdown() {
  const sel = document.getElementById('kaart-rit-kiezen');
  if (!sel) return;
  const { ritten } = getData();
  const withRoute = ritten.filter((r) => r.fromId && r.toId);
  withRoute.sort((a, b) => {
    const da = `${a.datum || ''}${a.tijd || ''}`;
    const db = `${b.datum || ''}${b.tijd || ''}`;
    return db.localeCompare(da);
  });
  const prev = sel.value;
  const limiet = UI_COMPACT.kaartRitKeuzeMax;
  const bron = withRoute.slice(0, limiet);
  sel.innerHTML =
    '<option value="">— Opgeslagen rit —</option>' +
    bron
      .map((r) => {
        const route = `${r.fromName || r.fromId} → ${r.toName || r.toId}`;
        const nrPre =
          r.volgordeNr != null && Number.isFinite(Number(r.volgordeNr)) ? `#${r.volgordeNr} ` : '';
        const label = `${nrPre}${formatDatumKort(r.datum, r.tijd)} · ${route} · ${r.km || 0} km`;
        return `<option value="${escapeHtml(String(r.id))}">${escapeHtml(label)}</option>`;
      })
      .join('');
  if (prev && withRoute.some((r) => String(r.id) === prev)) sel.value = prev;
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
  const ritKiezen = document.getElementById('kaart-rit-kiezen');
  const container = document.getElementById('map-container');
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

  function updateMapAndLinks() {
    const { from, to } = getSelectedFromTo();
    setNavigationLinks(from, to);

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
    function onKaartFromToChange() {
      if (ritKiezen) ritKiezen.value = '';
      updateMapAndLinks();
    }
    fromSelect.addEventListener('change', onKaartFromToChange);
    toSelect.addEventListener('change', onKaartFromToChange);
    ritKiezen?.addEventListener('change', () => {
      const id = ritKiezen.value;
      if (!id) return;
      const { ritten } = getData();
      const r = ritten.find((x) => String(x.id) === String(id));
      if (!r?.fromId || !r?.toId) return;
      const fromOk = hospitals.some((h) => h.id === r.fromId);
      const toOk = hospitals.some((h) => h.id === r.toId);
      if (!fromOk || !toOk) return;
      fromSelect.value = r.fromId;
      toSelect.value = r.toId;
      updateMapAndLinks();
    });
  }

  fillKaartRitDropdown();
  updateMapAndLinks();
}

// --- Ziekenhuizen zoeken en toevoegen ---
let pendingPlace = null;

function renderSavedZiekenhuizen() {
  const ul = document.getElementById('saved-ziekenhuizen');
  const btnToggle = document.getElementById('btn-ziekenhuizen-toggle');
  if (!ul) return;
  const list = getZiekenhuizen();
  const preview = UI_COMPACT.ziekenhuizenPreview;
  const uitgeklapt = ziekenhuizenLijstUitgeklapt || list.length <= preview;
  const tonen = uitgeklapt ? list : list.slice(0, preview);
  ul.innerHTML = tonen
    .map(
      (h) =>
        `<li class="saved-ziekenhuis-row">
          <span class="saved-ziekenhuis-naam" title="${escapeHtml(h.address || h.name || '')}">${escapeHtml(h.name)}</span>
          <button type="button" class="btn btn-danger btn-icon-del btn-remove-hospital" data-id="${h.id}" title="Verwijderen" aria-label="Verwijder ziekenhuis">×</button>
        </li>`
    )
    .join('');

  if (btnToggle) {
    if (list.length <= preview) {
      btnToggle.hidden = true;
    } else {
      btnToggle.hidden = false;
      btnToggle.textContent = uitgeklapt ? `Minder tonen (${list.length})` : `Alle ${list.length} tonen`;
    }
  }

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
  ['rit-voertuig', 'brandstof-voertuig', 'bulk-default-voertuig'].forEach((id) => {
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
  ['rit-chauffeur', 'bulk-default-chauffeur'].forEach((id) => {
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

const RITTEN_STATUS_RANK = { komend: 0, lopend: 1, voltooid: 2 };
const RITTEN_FEED_BADGE = { komend: 'Open', lopend: 'Onderweg', voltooid: 'Afgerond' };

function rittenTimeKey(rit, status) {
  if (status === 'voltooid') return rit.datum + (rit.voltooidTijd || rit.tijd || '');
  return rit.datum + (rit.tijd || '');
}

function buildRittenStatusBuckets(ritten) {
  const komend = ritten
    .filter((r) => r.status === 'komend')
    .sort((a, b) => rittenTimeKey(a, 'komend').localeCompare(rittenTimeKey(b, 'komend')));
  const lopend = ritten
    .filter((r) => r.status === 'lopend')
    .sort((a, b) => rittenTimeKey(b, 'lopend').localeCompare(rittenTimeKey(a, 'lopend')));
  const voltooid = ritten
    .filter((r) => isRitVoltooid(r))
    .sort((a, b) => rittenTimeKey(b, 'voltooid').localeCompare(rittenTimeKey(a, 'voltooid')));
  return { komend, lopend, voltooid };
}

function combineRittenFeedAlle(komend, lopend, voltooid) {
  const rows = [
    ...komend.map((rit) => ({ rit, status: 'komend' })),
    ...lopend.map((rit) => ({ rit, status: 'lopend' })),
    ...voltooid.map((rit) => ({ rit, status: 'voltooid' })),
  ];
  rows.sort((a, b) => {
    const ra = RITTEN_STATUS_RANK[a.status];
    const rb = RITTEN_STATUS_RANK[b.status];
    if (ra !== rb) return ra - rb;
    const ka = rittenTimeKey(a.rit, a.status);
    const kb = rittenTimeKey(b.rit, b.status);
    if (a.status === 'komend') return ka.localeCompare(kb);
    return kb.localeCompare(ka);
  });
  return rows;
}

function renderRittenStatusPagina() {
  const { ritten } = getData();
  const { komend, lopend, voltooid } = buildRittenStatusBuckets(ritten);
  const aside = document.getElementById('ritten-overzicht-aside');

  const statsEl = document.getElementById('ritten-overzicht-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <button type="button" class="ritten-stat-tile ritten-stat-tile--komend" data-filter="komend" aria-label="${komend.length} open">
        <span class="ritten-stat-val">${komend.length}</span>
        <span class="ritten-stat-lbl">Open</span>
      </button>
      <button type="button" class="ritten-stat-tile ritten-stat-tile--lopend" data-filter="lopend" aria-label="${lopend.length} onderweg">
        <span class="ritten-stat-val">${lopend.length}</span>
        <span class="ritten-stat-lbl">Onderweg</span>
      </button>
      <button type="button" class="ritten-stat-tile ritten-stat-tile--voltooid" data-filter="voltooid" aria-label="${voltooid.length} afgerond">
        <span class="ritten-stat-val">${voltooid.length}</span>
        <span class="ritten-stat-lbl">Afgerond</span>
      </button>`;
  }

  if (aside) {
    aside.querySelectorAll('.ritten-filter-btn').forEach((b) => {
      const active = b.dataset.filter === rittenOverzichtFilter;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    aside.querySelectorAll('.ritten-stat-tile').forEach((t) => {
      t.classList.toggle('active', t.dataset.filter === rittenOverzichtFilter);
    });
  }

  let feedRows;
  if (rittenOverzichtFilter === 'alle') {
    feedRows = combineRittenFeedAlle(komend, lopend, voltooid);
  } else if (rittenOverzichtFilter === 'komend') {
    feedRows = komend.map((rit) => ({ rit, status: 'komend' }));
  } else if (rittenOverzichtFilter === 'lopend') {
    feedRows = lopend.map((rit) => ({ rit, status: 'lopend' }));
  } else {
    feedRows = voltooid.map((rit) => ({ rit, status: 'voltooid' }));
  }

  const zoekRaw = rittenOverzichtZoek.trim();
  const zoek = zoekRaw.toLowerCase();
  const heeftZoek = zoek.length > 0;

  if (heeftZoek) {
    feedRows = feedRows.filter(({ rit: r, status }) => {
      const tijdDisplay = status === 'voltooid' ? r.voltooidTijd || r.tijd : r.tijd;
      const datumTijd = formatDatumKort(r.datum, tijdDisplay);
      const haystack = [
        r.chauffeurName,
        r.voertuigName,
        r.fromName,
        r.toName,
        datumTijd,
        r.volgordeNr,
        r.km,
        r.vergoeding,
        r.status,
      ]
        .filter((x) => x !== null && x !== undefined && String(x).trim() !== '')
        .join(' ')
        .toLowerCase();
      return haystack.includes(zoek);
    });
  }

  const ul = document.getElementById('ritten-overzicht-feed');
  const leeg = document.getElementById('ritten-feed-leeg');
  const max = UI_COMPACT.rittenFeedMax;
  if (!ul) return;

  if (feedRows.length === 0) {
    ul.innerHTML = '';
    ul.hidden = true;
    if (leeg) {
      leeg.hidden = false;
      leeg.textContent = heeftZoek ? `Geen resultaten voor “${zoekRaw}”.` : 'Geen ritten in dit filter.';
    }
    const shell = document.getElementById('ritten-overzicht-feed-shell');
    if (shell) shell.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }
  ul.hidden = false;
  if (leeg) leeg.hidden = true;

  const tonen = feedRows.slice(0, max);
  const meer = feedRows.length - tonen.length;

  let html = tonen
    .map(({ rit: r, status }, idx) => {
      const isMatch = heeftZoek && idx === 0;
      const verg = r.vergoeding != null ? r.vergoeding : vergoedingVoorRit(r.km || 0);
      const tijdDisplay = status === 'voltooid' ? r.voltooidTijd || r.tijd : r.tijd;
      const datumTijd = formatDatumKort(r.datum, tijdDisplay);
      const meta = [r.chauffeurName, r.voertuigName].filter(Boolean).join(' · ') || '—';
      const nr =
        r.volgordeNr != null && Number.isFinite(Number(r.volgordeNr))
          ? `<span class="ritten-feed-nr">#${r.volgordeNr}</span>`
          : '';
      const routeHint =
        r.fromName && r.toName
          ? `<div class="ritten-feed-route">${escapeHtml(r.fromName)} → ${escapeHtml(r.toName)}</div>`
          : '';
      return `<li class="ritten-feed-item ritten-feed-item--${status}${isMatch ? ' ritten-feed-item--match' : ''}">
        <div class="ritten-feed-row1">
          ${nr ? `<span class="ritten-feed-numwrap">${nr}</span>` : ''}
          <span class="ritten-feed-datum">${escapeHtml(datumTijd)}</span>
          <span class="ritten-feed-badge ritten-feed-badge--${status}">${RITTEN_FEED_BADGE[status]}</span>
        </div>
        <div class="ritten-feed-row2">${r.km || 0} km · ${formatEuro(verg)}</div>
        ${routeHint}
        <div class="ritten-feed-meta">${escapeHtml(meta)}</div>
      </li>`;
    })
    .join('');
  if (meer > 0) {
    html += `<li class="ritten-feed-more" aria-hidden="true">+${meer} meer · beperkte weergave</li>`;
  }
  ul.innerHTML = html;

  const shell = document.getElementById('ritten-overzicht-feed-shell');
  if (shell) shell.scrollTo({ top: 0, behavior: 'auto' });
  if (heeftZoek) {
    const matchEl = ul.querySelector('.ritten-feed-item--match');
    if (matchEl) {
      requestAnimationFrame(() => matchEl.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  }
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
                <button type="button" class="btn btn-danger btn-icon-del btn-remove-voertuig" data-id="${v.id}" title="Verwijderen" aria-label="Verwijder voertuig">×</button>
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
    if (km == null || km < 1) {
      km = geschatteAfstandKm(from, to);
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
function afterRitFormSaved() {
  refresh();
  setRittenSubview('overzicht');
}

function initProfileSwitcher() {
  const sel = document.getElementById('profile-switcher');
  if (!sel || sel.dataset.inited) return;
  sel.dataset.inited = '1';
  syncProfileSwitcher();
  sel.addEventListener('change', () => {
    setCurrentProfileId(sel.value);
    refresh();
  });
}

function init() {
  setAlleDatumsVandaag();
  initNavigation();
  initProfileSwitcher();
  initMeerZiekenhuizenToggle();
  initRittenPageControls();
  initPeriodToggle(refresh);
  syncPeriodButtons();
  initDashboardTabs();
  initFormRit(afterRitFormSaved);
  initBulkRittenImport(refresh);
  initFormBrandstof(refresh);
  initFormOverig(refresh);
  initZiekenhuizen();
  initTabs();
  initPlanningAvailabilityTab();
  refresh();
}

init();
