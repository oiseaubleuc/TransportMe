/**
 * Dashboard – KPI-kaarten, vandaag-overzicht, rit-selectie CTA, kilometerteller, grafiek, komende/lopende ritten
 */

import { PERIOD_LABELS, UI_COMPACT, PROFILES } from './config.js';
import { totalenVoorPeriode, kmTotalen, vergoedingVoorRit, isInDay, getWeeklyFinancials, isRitVoltooid } from './calculations.js';
import { formatEuro } from './format.js';
import { getData, saveRitten } from './storage.js';

let currentPeriod = 'month';

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toISODate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeekMonday(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const day = dt.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  dt.setDate(dt.getDate() + diff);
  return dt;
}

export function getCurrentPeriod() {
  return currentPeriod;
}

export function setCurrentPeriod(period) {
  currentPeriod = period;
}

/** Vandaag-block: aantal ritten, km, vergoeding + lijst ritten vandaag */
export function updateVandaagSummary() {
  const t = totalenVoorPeriode('day');
  const rittenEl = document.getElementById('vandaag-ritten');
  const kmEl = document.getElementById('vandaag-km');
  const vergoedingEl = document.getElementById('vandaag-vergoeding');
  const lijstEl = document.getElementById('ritten-vandaag-lijst');

  if (rittenEl) rittenEl.textContent = t.aantalRitten;
  if (kmEl) kmEl.textContent = t.km;
  if (vergoedingEl) vergoedingEl.textContent = formatEuro(t.omzet);

  if (lijstEl) {
    const { ritten } = getData();
    const today = new Date();
    const vandaagVoltooid = ritten
      .filter((r) => isInDay(r.datum, today) && isRitVoltooid(r))
      .sort((a, b) => a.datum.localeCompare(b.datum));
    if (vandaagVoltooid.length === 0) {
      lijstEl.innerHTML = '<li class="dashboard-vandaag-empty">Geen voltooide ritten vandaag.</li>';
      lijstEl.classList.add('is-empty');
    } else {
      lijstEl.classList.remove('is-empty');
      const max = UI_COMPACT.dashboardVandaagRitten;
      const tail = vandaagVoltooid.slice(-max).reverse();
      const meer = vandaagVoltooid.length - tail.length;
      let html = tail
        .map((r) => {
          const verg = r.vergoeding != null ? r.vergoeding : vergoedingVoorRit(r.km || 0);
          const nr =
            r.volgordeNr != null && Number.isFinite(Number(r.volgordeNr))
              ? `<span class="dashboard-vandaag-rit-nr">#${r.volgordeNr}</span> `
              : '';
          return `<li class="dashboard-vandaag-rit">${nr}<span class="dashboard-vandaag-rit-km">${r.km || 0} km</span><span class="dashboard-vandaag-rit-vergoeding">${formatEuro(verg)}</span></li>`;
        })
        .join('');
      if (meer > 0) {
        html += `<li class="dashboard-vandaag-more" aria-hidden="true">+${meer} — zie Ritten</li>`;
      }
      lijstEl.innerHTML = html;
    }
  }
}

/** Beschikbaarheid per dag (volgende 7 dagen) op dashboard */
export function updateBeschikbaarheidWeek() {
  const lijstEl = document.getElementById('dashboard-beschikbaarheid-lijst');
  if (!lijstEl) return;

  const { planning } = getData();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Toon 7 dagen vanaf vandaag (incl. vandaag)
  const start = today;

  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateISO = toISODate(d);
    const monthKey = dateISO.slice(0, 7);

    const beschikbareNamen = PROFILES.filter((p) => planning?.[p.id]?.[monthKey]?.[dateISO]).map((p) => p.name);
    const label = d.toLocaleDateString('nl-BE', { weekday: 'short', day: '2-digit', month: '2-digit' });

    const namesHtml =
      beschikbareNamen.length > 0
        ? beschikbareNamen.map((n) => `<span class="beschikbaarheid-pill">${escapeHtml(n)}</span>`).join(' ')
        : '<span class="beschikbaarheid-none">—</span>';

    html += `<li class="dashboard-beschikbaarheid-item">
      <span class="dashboard-beschikbaarheid-day">${escapeHtml(label)}</span>
      <span class="dashboard-beschikbaarheid-names">${namesHtml}</span>
    </li>`;
  }

  lijstEl.innerHTML = html;
}

function formatChartAxisEuro(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return '€0';
  if (Math.abs(v) >= 1000) {
    return '€' + (v / 1000).toLocaleString('nl-BE', { maximumFractionDigits: 1 }) + 'k';
  }
  return '€' + v.toLocaleString('nl-BE');
}

/** Vloeiende lijn door punten (Catmull-Rom-achtige cubics) */
function cubicSmoothPath(pts) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  if (pts.length === 2) {
    return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} L ${pts[1].x.toFixed(2)} ${pts[1].y.toFixed(2)}`;
  }
  const t = 0.22;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i < pts.length - 2 ? pts[i + 2] : p2;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function areaPathUnderOmzetCurve(pts, bottomY) {
  if (pts.length === 0) return '';
  if (pts.length === 1) {
    const p = pts[0];
    const bw = 12;
    return `M ${(p.x - bw).toFixed(2)} ${bottomY.toFixed(2)} L ${p.x.toFixed(2)} ${p.y.toFixed(2)} L ${(p.x + bw).toFixed(2)} ${bottomY.toFixed(2)} Z`;
  }
  const curve = cubicSmoothPath(pts);
  const sub = curve.replace(/^M\s+[\d.]+\s+[\d.]+/, '');
  return `M ${pts[0].x.toFixed(2)} ${bottomY.toFixed(2)} L ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}${sub} L ${pts[pts.length - 1].x.toFixed(2)} ${bottomY.toFixed(2)} Z`;
}

/** Grafiek: SVG-trend omzet + winst per week, kaart-layout + totalen */
export function updateFinancialChart() {
  const chartEl = document.getElementById('financial-chart');
  if (!chartEl) return;
  const weeks = getWeeklyFinancials(UI_COMPACT.grafiekWeken);
  const n = weeks.length;
  const sumOmzet = weeks.reduce((s, w) => s + w.omzet, 0);
  const sumWinst = weeks.reduce((s, w) => s + w.winst, 0);

  if (n === 0) {
    chartEl.innerHTML = `
      <div class="financial-chart-toolbar">
        <div class="financial-chart-headlines">
          <h3 class="chart-title">Weektrend</h3>
          <p class="chart-subtitle">Omzet en winst per kalenderweek</p>
        </div>
      </div>
      <div class="financial-chart-empty" role="status">
        <div class="financial-chart-empty-visual" aria-hidden="true"></div>
        <p>Nog geen weekgegevens</p>
        <p class="financial-chart-empty-hint">Zodra je voltooide ritten en kosten hebt, verschijnt hier je trend.</p>
      </div>`;
    chartEl.setAttribute('aria-label', 'Geen financiële weekgegevens');
    return;
  }

  const minWinst = Math.min(...weeks.map((w) => w.winst));
  const maxOmzet = Math.max(...weeks.map((w) => w.omzet), 1);
  const maxWinst = Math.max(...weeks.map((w) => w.winst));
  let yMin = Math.min(0, minWinst);
  let yMax = Math.max(maxOmzet, maxWinst, yMin + 1);
  const span = yMax - yMin;
  const pad = span * 0.1 || 1;
  yMax += pad;
  yMin -= yMin < 0 ? pad : 0;

  const VB_W = 420;
  const VB_H = 258;
  const M = { l: 56, r: 14, t: 22, b: 46 };
  const PW = VB_W - M.l - M.r;
  const PH = VB_H - M.t - M.b;
  const bottomY = M.t + PH;
  const xAt = (i) => (n <= 1 ? M.l + PW / 2 : M.l + (PW * i) / (n - 1));
  const yAt = (v) => M.t + PH * (1 - (v - yMin) / (yMax - yMin || 1));

  const tickCount = 5;
  const ticks = [];
  for (let t = 0; t < tickCount; t++) {
    ticks.push(yMin + (t * (yMax - yMin)) / (tickCount - 1));
  }

  const ptsOmzet = weeks.map((w, i) => ({ x: xAt(i), y: yAt(w.omzet), w }));
  const ptsWinst = weeks.map((w, i) => ({ x: xAt(i), y: yAt(w.winst), w }));

  const pathOmzet = cubicSmoothPath(ptsOmzet);
  const pathWinst = cubicSmoothPath(ptsWinst);
  const areaOmzetD = areaPathUnderOmzetCurve(ptsOmzet, bottomY);

  const zeroY = yAt(0);
  const showZeroLine = yMin < 0 && yMax > 0;

  let underlay = `<line class="financial-chart-axis-y" x1="${M.l}" y1="${M.t}" x2="${M.l}" y2="${bottomY.toFixed(2)}" />`;
  for (const tv of ticks) {
    const yy = yAt(tv);
    underlay += `<line class="financial-chart-grid" x1="${M.l}" y1="${yy.toFixed(2)}" x2="${VB_W - M.r}" y2="${yy.toFixed(2)}" />`;
    underlay += `<text class="financial-chart-y-label" x="${M.l - 8}" y="${yy.toFixed(2)}" dominant-baseline="middle" text-anchor="end">${formatChartAxisEuro(tv)}</text>`;
  }
  if (showZeroLine) {
    underlay += `<line class="financial-chart-zero" x1="${M.l}" y1="${zeroY.toFixed(2)}" x2="${VB_W - M.r}" y2="${zeroY.toFixed(2)}" />`;
  }

  let dotsOmzet = '';
  let dotsWinst = '';
  for (let i = 0; i < n; i++) {
    const wo = weeks[i];
    dotsOmzet += `<circle class="financial-chart-dot financial-chart-dot--omzet" cx="${ptsOmzet[i].x.toFixed(2)}" cy="${ptsOmzet[i].y.toFixed(2)}" r="4.5" tabindex="0"><title>Omzet ${wo.shortLabel}: ${formatEuro(wo.omzet)}</title></circle>`;
    dotsWinst += `<circle class="financial-chart-dot financial-chart-dot--winst" cx="${ptsWinst[i].x.toFixed(2)}" cy="${ptsWinst[i].y.toFixed(2)}" r="4.5" tabindex="0"><title>Winst ${wo.shortLabel}: ${formatEuro(wo.winst)}</title></circle>`;
  }

  let xLabels = '';
  weeks.forEach((w, i) => {
    const x = xAt(i);
    xLabels += `<text class="financial-chart-x-label" x="${x.toFixed(2)}" y="${VB_H - 12}" text-anchor="middle">${w.shortLabel}</text>`;
  });

  const margePct = sumOmzet > 0.5 ? (sumWinst / sumOmzet) * 100 : null;
  const margeFormatted = margePct != null ? margePct.toLocaleString('nl-BE', { maximumFractionDigits: 1, minimumFractionDigits: 0 }) : null;

  const summaryClass = margeFormatted != null ? 'financial-chart-summary financial-chart-summary--triple' : 'financial-chart-summary';
  const margeBlock =
    margeFormatted != null
      ? `<div class="financial-chart-stat">
        <span class="financial-chart-stat-label">Winst / omzet</span>
        <span class="financial-chart-stat-value ${sumWinst < 0 ? 'financial-chart-stat-value--neg' : 'financial-chart-stat-value--winst'}">${margeFormatted}%</span>
        <span class="financial-chart-stat-hint">over ${n} weken</span>
      </div>`
      : '';

  const aria = `Trendgrafiek over ${n} weken. Som omzet ${formatEuro(sumOmzet)}, som winst ${formatEuro(sumWinst)}.`;
  chartEl.setAttribute('aria-label', aria);

  chartEl.innerHTML = `
    <div class="financial-chart-toolbar">
      <div class="financial-chart-headlines">
        <h3 class="chart-title">Weektrend</h3>
        <p class="chart-subtitle">Omzet en winst per kalenderweek — hover of focus op een punt voor het bedrag.</p>
      </div>
      <div class="financial-chart-legend" aria-hidden="true">
        <span class="financial-chart-legend-item financial-chart-legend-item--omzet"><span class="financial-chart-legend-swatch"></span>Omzet</span>
        <span class="financial-chart-legend-item financial-chart-legend-item--winst"><span class="financial-chart-legend-swatch"></span>Winst</span>
      </div>
    </div>
    <div class="financial-chart-svg-wrap">
      <svg class="financial-chart-svg" viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        ${underlay}
        <path class="financial-chart-area" d="${areaOmzetD}" />
        <path class="financial-chart-line financial-chart-line--omzet" d="${pathOmzet}" fill="none" />
        <path class="financial-chart-line financial-chart-line--winst" d="${pathWinst}" fill="none" />
        ${dotsOmzet}
        ${dotsWinst}
        ${xLabels}
      </svg>
    </div>
    <div class="${summaryClass}">
      <div class="financial-chart-stat">
        <span class="financial-chart-stat-label">Som omzet (${n} wk)</span>
        <span class="financial-chart-stat-value financial-chart-stat-value--omzet">${formatEuro(sumOmzet)}</span>
      </div>
      <div class="financial-chart-stat">
        <span class="financial-chart-stat-label">Som winst</span>
        <span class="financial-chart-stat-value ${sumWinst < 0 ? 'financial-chart-stat-value--neg' : 'financial-chart-stat-value--winst'}">${formatEuro(sumWinst)}</span>
      </div>
      ${margeBlock}
    </div>`;
}

/** Melding op dashboard: "Er is een rit (via Kaart). Bevestigen? Ja / Nee" → daarna kan gebruiker op Start rit drukken */
export function updateRitMelding(onUpdate) {
  const melding = document.getElementById('dashboard-rit-melding');
  const btnJa = document.getElementById('dashboard-rit-melding-ja');
  const btnNee = document.getElementById('dashboard-rit-melding-nee');
  if (!melding || !btnJa || !btnNee) return;

  const { ritten } = getData();
  const today = new Date();
  const unconfirmed = ritten
    .filter((r) => r.status === 'komend' && r.toegevoegdVia === 'kaart' && !r.bevestigd && isInDay(r.datum, today))
    .sort((a, b) => (b.id || 0) - (a.id || 0));
  const rit = unconfirmed[0];

  if (!rit) {
    melding.hidden = true;
    btnJa.onclick = null;
    btnNee.onclick = null;
    return;
  }

  melding.hidden = false;
  btnJa.onclick = () => {
    rit.bevestigd = true;
    saveRitten(ritten);
    melding.hidden = true;
    const section = document.getElementById('ritten-status-section');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    onUpdate?.();
  };
  btnNee.onclick = () => {
    rit.bevestigd = true;
    saveRitten(ritten);
    melding.hidden = true;
    onUpdate?.();
  };
}

/** Lijst komende + lopende ritten vandaag met knoppen Start rit / Rit voltooid */
export function updateRittenStatusLijst(onUpdate) {
  const lijst = document.getElementById('ritten-status-lijst');
  if (!lijst) return;
  const { ritten } = getData();
  const today = new Date();
  const vandaag = ritten
    .filter((r) => isInDay(r.datum, today) && (r.status === 'komend' || r.status === 'lopend'))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  if (vandaag.length === 0) {
    lijst.innerHTML = '<li class="ritten-status-empty">Geen ritten vandaag.</li>';
    return;
  }
  const max = UI_COMPACT.dashboardStatusRitten;
  const tonen = vandaag.slice(0, max);
  const meer = vandaag.length - tonen.length;
  let html = tonen
    .map((r) => {
      const verg = r.vergoeding != null ? r.vergoeding : vergoedingVoorRit(r.km || 0);
      const chauffeur = r.chauffeurName || '—';
      const voertuig = r.voertuigName || '—';
      const isLopend = r.status === 'lopend';
      const startBtn = !isLopend ? `<button type="button" class="btn btn-small btn-start-rit" data-id="${r.id}">Start</button>` : '';
      const voltooidBtn = isLopend ? `<button type="button" class="btn btn-small btn-primary btn-voltooid-rit" data-id="${r.id}">Klaar</button>` : '';
      const nr =
        r.volgordeNr != null && Number.isFinite(Number(r.volgordeNr))
          ? `<span class="ritten-status-nr">#${r.volgordeNr}</span> `
          : '';
      return `<li class="ritten-status-item" data-id="${r.id}">
        <span class="ritten-status-rit">${nr}${r.km || 0} km · ${formatEuro(verg)}</span>
        <span class="ritten-status-meta">${chauffeur} · ${voertuig}</span>
        <span class="ritten-status-buttons">${startBtn} ${voltooidBtn}</span>
      </li>`;
    })
    .join('');
  if (meer > 0) {
    html += `<li class="ritten-status-item ritten-status-more" aria-hidden="true">+${meer} — tab Ritten</li>`;
  }
  lijst.innerHTML = html;
  lijst.querySelectorAll('.btn-start-rit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-id]')?.dataset.id);
      const rittenList = getData().ritten;
      const rit = rittenList.find((r) => r.id === id);
      if (rit) {
        rit.status = 'lopend';
        saveRitten(rittenList);
        onUpdate?.();
      }
    });
  });
  lijst.querySelectorAll('.btn-voltooid-rit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-id]')?.dataset.id);
      const rittenList = getData().ritten;
      const rit = rittenList.find((r) => r.id === id);
      if (rit) {
        rit.status = 'voltooid';
        const now = new Date();
        rit.voltooidTijd = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        saveRitten(rittenList);
        onUpdate?.();
      }
    });
  });
}

export function updateKPI() {
  const t = totalenVoorPeriode(currentPeriod);
  const omzetEl = document.getElementById('kpi-omzet');
  const brandstofEl = document.getElementById('kpi-brandstof');
  const overigEl = document.getElementById('kpi-overig');
  const winstEl = document.getElementById('kpi-winst');
  const omzetExtraEl = document.getElementById('kpi-omzet-extra');

  if (omzetEl) omzetEl.textContent = formatEuro(t.omzet);
  if (brandstofEl) brandstofEl.textContent = formatEuro(t.brandstofKosten);
  if (overigEl) overigEl.textContent = formatEuro(t.overigeKosten);
  if (winstEl) {
    winstEl.textContent = formatEuro(t.winst);
    winstEl.classList.toggle('negative', t.winst < 0);
  }
  if (omzetExtraEl) {
    omzetExtraEl.textContent = t.aantalRitten === 0 ? '' : `${t.aantalRitten} rit${t.aantalRitten === 1 ? '' : 'ten'}`;
  }

  ['kpi-omzet', 'kpi-brandstof', 'kpi-overig', 'kpi-winst'].forEach((id) => {
    const periodEl = document.getElementById(id + '-period');
    if (periodEl) periodEl.textContent = PERIOD_LABELS[currentPeriod];
  });
}

export function updateKmTeller() {
  const { day, week, month } = kmTotalen();
  const dayEl = document.getElementById('km-day');
  const weekEl = document.getElementById('km-week');
  const monthEl = document.getElementById('km-month');
  if (dayEl) dayEl.textContent = day + ' km';
  if (weekEl) weekEl.textContent = week + ' km';
  if (monthEl) monthEl.textContent = month + ' km';
}

/** Zet de actieve periode-knop in sync met currentPeriod (bijv. bij laden) */
export function syncPeriodButtons() {
  document.querySelectorAll('.btn-period').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.period === currentPeriod);
  });
}

export function initPeriodToggle(onPeriodChange) {
  syncPeriodButtons();
  document.querySelectorAll('.btn-period').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentPeriod = btn.dataset.period;
      document.querySelectorAll('.btn-period').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateKPI();
      updateFinancialChart();
      onPeriodChange?.();
    });
  });
}
