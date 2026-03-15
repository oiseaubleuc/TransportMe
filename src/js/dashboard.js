/**
 * Dashboard – KPI-kaarten, vandaag-overzicht, rit-selectie CTA, kilometerteller
 */

import { PERIOD_LABELS } from './config.js';
import { totalenVoorPeriode, kmTotalen, vergoedingVoorRit, isInDay } from './calculations.js';
import { formatEuro } from './format.js';
import { getData } from './storage.js';

let currentPeriod = 'month';

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
    const vandaag = ritten.filter((r) => isInDay(r.datum, today)).sort((a, b) => a.datum.localeCompare(b.datum));
    if (vandaag.length === 0) {
      lijstEl.innerHTML = '<li class="dashboard-vandaag-empty">Nog geen ritten vandaag. Kies hieronder een rit na je oproep.</li>';
      lijstEl.classList.add('is-empty');
    } else {
      lijstEl.classList.remove('is-empty');
      lijstEl.innerHTML = vandaag
        .slice(-8)
        .reverse()
        .map((r) => {
          const verg = r.vergoeding != null ? r.vergoeding : vergoedingVoorRit(r.km || 0);
          return `<li class="dashboard-vandaag-rit"><span class="dashboard-vandaag-rit-km">${r.km || 0} km</span><span class="dashboard-vandaag-rit-vergoeding">${formatEuro(verg)}</span></li>`;
        })
        .join('');
    }
  }
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
      onPeriodChange?.();
    });
  });
}
