/**
 * Transporteur – hoofdingang
 * Mobielvriendelijk: navigatie, vaste ritten, berekening (brandstof + route), kaart, ziekenhuizen
 */

import { updateKPI, updateVandaagSummary, initPeriodToggle, syncPeriodButtons, updateFinancialChart, updateRittenStatusLijst, updateRitMelding, updateBeschikbaarheidWeek, updateFinancieelProfielOverzicht } from './js/dashboard.js';
import { initFormRit, initFormBrandstof, initFinancieelTicketImport, initFormOverig, setAlleDatumsVandaag } from './js/forms.js';
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
  getLiveAvailabilityStatus,
  setLiveAvailabilityStatus,
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
let liveAvailabilityTickerStarted = false;

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

function syncProfileAvailableButton() {
  const btn = document.getElementById('btn-profile-available');
  const txt = document.getElementById('profile-available-text');
  if (!btn) return;
  const pid = getCurrentProfileId();
  const on = getLiveAvailabilityStatus(pid).active;
  btn.classList.toggle('is-on', on);
  if (txt) txt.textContent = on ? 'Beschikbaar' : 'Afwezig';
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function initProfileAvailableButton() {
  const btn = document.getElementById('btn-profile-available');
  if (!btn || btn.dataset.inited) return;
  btn.dataset.inited = '1';
  syncProfileAvailableButton();
  if (!liveAvailabilityTickerStarted) {
    liveAvailabilityTickerStarted = true;
    setInterval(syncProfileAvailableButton, 60 * 1000);
  }
  btn.addEventListener('click', () => {
    const pid = getCurrentProfileId();
    const currentlyOn = getLiveAvailabilityStatus(pid).active;
    setLiveAvailabilityStatus(pid, !currentlyOn);
    refresh();
  });
}

function refresh() {
  const profileLabel = document.getElementById('dashboard-profile-label');
  if (profileLabel) profileLabel.textContent = `Zelfstandige: ${profileDisplayName()}`;
  syncProfileSwitcher();
  syncProfileAvailableButton();

  updateRittenToolbar();

  updateKPI();
  updateVandaagSummary();
  updateBeschikbaarheidWeek();
  updateFinancieelProfielOverzicht();
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
  financieel: 'Financieel',
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

// --- Beschikbaarheid / Planning (per 2 weken) ---
function toISODateLocal(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseISODateLocal(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfCurrentWeekMonday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

let planningQuickProfileId = PROFILES[0]?.id || 'houdaifa';

function renderPlanningProfileIcons() {
  const wrap = document.getElementById('planning-profile-icons');
  if (!wrap) return;
  wrap.innerHTML = PROFILES.map((p) => {
    const initials = (p.name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .map((x) => x[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 2);
    const active = p.id === planningQuickProfileId;
    return `<button type="button"
      class="planning-profile-icon-btn ${active ? 'is-active' : ''}"
      data-profile-id="${escapeHtml(p.id)}"
      aria-pressed="${active ? 'true' : 'false'}"
      title="Snel aanpassen voor ${escapeHtml(p.name)}"
    >
      <span class="planning-profile-icon-badge" aria-hidden="true">${escapeHtml(initials)}</span>
      <span class="planning-profile-icon-name">${escapeHtml(p.name)}</span>
    </button>`;
  }).join('');
}

function renderPlanningFortnight() {
  const startInput = document.getElementById('planning-start');
  const daysEl = document.getElementById('planning-days');
  if (!startInput || !daysEl) return;

  const defaultStart = toISODateLocal(startOfCurrentWeekMonday());
  if (!startInput.value) startInput.value = defaultStart;
  const startDate = parseISODateLocal(startInput.value) || startOfCurrentWeekMonday();
  startDate.setHours(0, 0, 0, 0);
  startInput.value = toISODateLocal(startDate);

  const planning = getPlanningAvailability();
  const rows = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateISO = toISODateLocal(d);
    const monthKey = dateISO.slice(0, 7);
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
      <span class="planning-day-label" data-date-iso="${escapeHtml(dateISO)}">${escapeHtml(label)}</span>
      ${profileButtons}
    </div>`);
  }
  daysEl.innerHTML = rows.join('');
}

function initPlanningAvailabilityTab() {
  const startInput = document.getElementById('planning-start');
  const daysEl = document.getElementById('planning-days');
  const prevBtn = document.getElementById('planning-prev-2w');
  const nextBtn = document.getElementById('planning-next-2w');
  const profileIconsEl = document.getElementById('planning-profile-icons');
  if (!startInput || !daysEl || !profileIconsEl) return;

  planningQuickProfileId = getCurrentProfileId();
  if (!PROFILES.some((p) => p.id === planningQuickProfileId)) planningQuickProfileId = PROFILES[0]?.id || 'houdaifa';

  renderPlanningProfileIcons();
  renderPlanningFortnight();

  function togglePlanningAvailability(profileId, dateISO) {
    if (!profileId || !dateISO) return;
    const monthKey = dateISO.slice(0, 7);
    const planning = getPlanningAvailability();
    const currentlyOn = Boolean(planning?.[profileId]?.[monthKey]?.[dateISO]);
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
    renderPlanningProfileIcons();
    renderPlanningFortnight();
    updateBeschikbaarheidWeek();
  }

  profileIconsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.planning-profile-icon-btn');
    if (!btn) return;
    const profileId = btn.dataset.profileId;
    if (!profileId) return;
    planningQuickProfileId = profileId;
    renderPlanningProfileIcons();
  });

  startInput.addEventListener('change', () => {
    renderPlanningFortnight();
    updateBeschikbaarheidWeek();
  });

  prevBtn?.addEventListener('click', () => {
    const startDate = parseISODateLocal(startInput.value) || startOfCurrentWeekMonday();
    startDate.setDate(startDate.getDate() - 14);
    startInput.value = toISODateLocal(startDate);
    renderPlanningFortnight();
    updateBeschikbaarheidWeek();
  });

  nextBtn?.addEventListener('click', () => {
    const startDate = parseISODateLocal(startInput.value) || startOfCurrentWeekMonday();
    startDate.setDate(startDate.getDate() + 14);
    startInput.value = toISODateLocal(startDate);
    renderPlanningFortnight();
    updateBeschikbaarheidWeek();
  });

  daysEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.planning-av-toggle');
    if (btn) {
      togglePlanningAvailability(btn.dataset.profileId, btn.dataset.dateIso);
      return;
    }
    const dayLabel = e.target.closest('.planning-day-label');
    if (dayLabel?.dataset.dateIso && planningQuickProfileId) {
      // Snelle actie: klik op daglabel toggelt gekozen profiel (icoon bovenaan)
      togglePlanningAvailability(planningQuickProfileId, dayLabel.dataset.dateIso);
    }
  });

  document.getElementById('planning-reset-maand')?.addEventListener('click', () => {
    const startDate = parseISODateLocal(startInput.value) || startOfCurrentWeekMonday();
    const resetDates = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      resetDates.push(toISODateLocal(d));
    }
    const planning = getPlanningAvailability();

    PROFILES.forEach((p) => {
      resetDates.forEach((dateISO) => {
        const monthKey = dateISO.slice(0, 7);
        if (planning?.[p.id]?.[monthKey]?.[dateISO]) {
          delete planning[p.id][monthKey][dateISO];
          if (Object.keys(planning[p.id][monthKey]).length === 0) delete planning[p.id][monthKey];
        }
      });
    });

    savePlanningAvailability(planning);
    renderPlanningFortnight();
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

  // Vertrek en aankomst zijn vrij te kiezen uit alle ziekenhuizen.
  const hospitalsSorted = [...hospitals].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  vertrekSelect.innerHTML = '<option value="">— Kies vertrek —</option>';
  hospitalsSorted.forEach((h) => {
    const opt = document.createElement('option');
    opt.value = h.id;
    opt.textContent = h.name;
    vertrekSelect.appendChild(opt);
  });

  function vulBestemming() {
    const fromId = vertrekSelect.value;
    bestemmingSelect.innerHTML = '<option value="">— Kies bestemming —</option>';
    if (!fromId) {
      bestemmingSelect.disabled = true;
      return;
    }
    bestemmingSelect.disabled = false;
    hospitalsSorted
      .filter((h) => h.id !== fromId)
      .forEach((h) => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = h.name;
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
    const fromId = vertrekSelect.value;
    const toId = bestemmingSelect.value;
    const from = getHospital(fromId);
    const to = getHospital(toId);
    const destEl = document.getElementById('rit-selected-destination');
    if (!from || !to) {
      if (destEl) destEl.hidden = true;
      kmInput.value = '';
      kmInput.dispatchEvent(new Event('input'));
      return;
    }
    if (destEl) {
      destEl.textContent = `${from.name} → ${to.name}`;
      destEl.hidden = false;
    }
    const preset =
      presets.find((p) => p.fromId === fromId && p.toId === toId) ||
      presets.find((p) => p.fromId === toId && p.toId === fromId);
    if (preset?.defaultKm != null) {
      kmInput.value = preset.defaultKm;
      kmInput.dispatchEvent(new Event('input'));
      return;
    }
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
  const hasCoords = from?.lat != null && from?.lng != null && to?.lat != null && to?.lng != null;
  if (hasCoords) {
    const toCoord = encodeURIComponent(`${to.lat},${to.lng}`);
    const fromCoord = encodeURIComponent(`${from.lat},${from.lng}`);
    if (linkWaze) linkWaze.href = `https://www.waze.com/ul?ll=${toCoord}&navigate=yes`;
    if (linkGoogle)
      linkGoogle.href = `https://www.google.com/maps/dir/?api=1&origin=${fromCoord}&destination=${toCoord}&travelmode=driving`;
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
  const routeLabelEl = document.getElementById('kaart-route-label');
  const routeKmEl = document.getElementById('kaart-route-km');
  const routeSourceEl = document.getElementById('kaart-route-source');
  const fitBtn = document.getElementById('kaart-fit-route');
  const linkWaze = document.getElementById('link-waze');
  const linkGoogle = document.getElementById('link-google-nav');
  const hasORS = hasOpenRouteApiKey();
  const hospitals = getZiekenhuizen();
  let currentFrom = null;
  let currentTo = null;

  function handleNavClick(e, type) {
    const hasCoords =
      currentFrom?.lat != null &&
      currentFrom?.lng != null &&
      currentTo?.lat != null &&
      currentTo?.lng != null;
    if (!hasCoords) {
      e.preventDefault();
      alert('Kies eerst vertrek en aankomst op de kaart.');
      return;
    }
    const toCoord = encodeURIComponent(`${currentTo.lat},${currentTo.lng}`);
    const fromCoord = encodeURIComponent(`${currentFrom.lat},${currentFrom.lng}`);
    const url =
      type === 'waze'
        ? `https://www.waze.com/ul?ll=${toCoord}&navigate=yes`
        : `https://www.google.com/maps/dir/?api=1&origin=${fromCoord}&destination=${toCoord}&travelmode=driving`;
    window.open(url, '_blank', 'noopener');
    e.preventDefault();
  }

  if (linkWaze && !linkWaze.dataset.inited) {
    linkWaze.dataset.inited = '1';
    linkWaze.addEventListener('click', (e) => handleNavClick(e, 'waze'));
  }
  if (linkGoogle && !linkGoogle.dataset.inited) {
    linkGoogle.dataset.inited = '1';
    linkGoogle.addEventListener('click', (e) => handleNavClick(e, 'google'));
  }

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
    currentFrom = from;
    currentTo = to;
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
    if (!hasBoth) {
      if (routeLabelEl) routeLabelEl.textContent = '—';
      if (routeKmEl) routeKmEl.textContent = '— km';
      if (routeSourceEl) routeSourceEl.textContent = 'Schatting';
      return;
    }

    if (routeLabelEl) routeLabelEl.textContent = `${from.name || 'Vertrek'} → ${to.name || 'Aankomst'}`;

    if (hasORS && map) {
      getRouteDistanceORS(from, to)
        .then(({ km, geometry }) => {
          addRouteToMapLibreMap(map, geometry);
          if (routeKmEl) routeKmEl.textContent = `${km || 0} km`;
          if (routeSourceEl) routeSourceEl.textContent = 'ORS (exact)';
        })
        .catch(() => {
          const km = geschatteAfstandKm(from, to);
          if (routeKmEl) routeKmEl.textContent = `${km || 0} km`;
          if (routeSourceEl) routeSourceEl.textContent = 'Schatting';
        });
    } else {
      const km = geschatteAfstandKm(from, to);
      if (routeKmEl) routeKmEl.textContent = `${km || 0} km`;
      if (routeSourceEl) routeSourceEl.textContent = 'Schatting';
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
    fitBtn?.addEventListener('click', () => {
      if (!currentFrom || !currentTo) return;
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
  ['rit-voertuig', 'brandstof-voertuig', 'fin-ticket-voertuig'].forEach((id) => {
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
  const profielNaam = (PROFILES.find((p) => p.id === getCurrentProfileId())?.name || '').toLowerCase();
  const defaultChauffeurId = DEFAULT_CHAUFFEURS.find((c) => c.naam.toLowerCase() === profielNaam)?.id || '';
  ['rit-chauffeur'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">— Kies chauffeur —</option>';
    DEFAULT_CHAUFFEURS.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.naam;
      sel.appendChild(opt);
    });
    if (defaultChauffeurId && id === 'rit-chauffeur') sel.value = defaultChauffeurId;
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
        r.bonnummer,
        ...(Array.isArray(r.bestelArtikelen) ? r.bestelArtikelen.map((x) => x?.bonnummer).filter(Boolean) : []),
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
      const verg = r.vergoeding != null ? r.vergoeding : vergoedingVoorRit(r.km || 0, r.tijd);
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
  const hospitals = getZiekenhuizen();
  const hospitalIds = new Set(hospitals.map((h) => h.id));
  const valid = presets
    .filter((p) => p.fromId && p.toId && hospitalIds.has(p.fromId) && hospitalIds.has(p.toId))
    .sort((a, b) => {
      const aa = `${pSafe(a.fromName, a.fromId)} ${pSafe(a.toName, a.toId)}`;
      const bb = `${pSafe(b.fromName, b.fromId)} ${pSafe(b.toName, b.toId)}`;
      return aa.localeCompare(bb);
    });
  const verborgen = presets.length - valid.length;

  if (valid.length === 0) {
    container.innerHTML =
      '<p class="route-checklist-empty">Geen geldige ritten in de checklist. Voeg eerst ziekenhuizen/vaste ritten toe.</p>';
    return;
  }

  let html = '';
  if (verborgen > 0) {
    html += `<div class="route-checklist-note">${verborgen} route${verborgen > 1 ? 's' : ''} verborgen (locatie ontbreekt in je ziekenhuislijst).</div>`;
  }
  html += valid
    .map((p) => {
      const from = pSafe(p.fromName, p.fromId);
      const to = pSafe(p.toName, p.toId);
      return `<label class="route-checklist-item">
        <input type="checkbox" class="route-rit-cb" data-preset-id="${p.id}" />
        <span class="route-checklist-route">${escapeHtml(from)} → ${escapeHtml(to)}</span>
        <span class="route-checklist-km">${p.defaultKm != null ? p.defaultKm + ' km' : '?'}</span>
      </label>`;
    })
    .join('');
  container.innerHTML = html;
}

function pSafe(name, fallback) {
  return name && String(name).trim() ? name : fallback || '—';
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
    const hospitalIds = new Set(hospitals.map((h) => h.id));
    const selectedRitten = selectedPresetIds
      .map((id) => presets.find((p) => p.id === id))
      .filter((p) => p && p.fromId && p.toId && hospitalIds.has(p.fromId) && hospitalIds.has(p.toId));
    if (selectedRitten.length === 0) {
      alert('De geselecteerde ritten zijn niet geldig voor de huidige ziekenhuislijst.');
      return;
    }

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
  initProfileAvailableButton();
  initMeerZiekenhuizenToggle();
  initRittenPageControls();
  initPeriodToggle(refresh);
  syncPeriodButtons();
  initDashboardTabs();
  initFormRit(afterRitFormSaved);
  initFormBrandstof(refresh);
  initFinancieelTicketImport(refresh);
  initFormOverig(refresh);
  initZiekenhuizen();
  initTabs();
  initPlanningAvailabilityTab();
  refresh();
}

init();
