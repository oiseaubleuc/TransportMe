/**
 * Dashboard – KPI-kaarten, vandaag-overzicht, rit-selectie CTA, kilometerteller, grafiek, komende/lopende ritten
 */

import { PERIOD_LABELS } from './config.js';
import { totalenVoorPeriode, kmTotalen, vergoedingVoorRit, isInDay, getWeeklyFinancials, isRitVoltooid } from './calculations.js';
import { formatEuro } from './format.js';
import { getData, saveRitten } from './storage.js';

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
    const vandaagVoltooid = ritten
      .filter((r) => isInDay(r.datum, today) && isRitVoltooid(r))
      .sort((a, b) => a.datum.localeCompare(b.datum));
    if (vandaagVoltooid.length === 0) {
      lijstEl.innerHTML = '<li class="dashboard-vandaag-empty">Nog geen voltooide ritten vandaag. Kies hieronder een rit na je oproep.</li>';
      lijstEl.classList.add('is-empty');
    } else {
      lijstEl.classList.remove('is-empty');
      lijstEl.innerHTML = vandaagVoltooid
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

/** Grafiek: omzet en winst per week (laatste 8 weken) */
export function updateFinancialChart() {
  const wrap = document.getElementById('financial-chart-wrap');
  const chartEl = document.getElementById('financial-chart');
  if (!wrap || !chartEl) return;
  const weeks = getWeeklyFinancials(8);
  const maxVal = Math.max(1, ...weeks.flatMap((w) => [w.omzet, w.winst]));
  chartEl.innerHTML = weeks
    .map(
      (w) =>
        `<div class="chart-bar-group">
          <span class="chart-label">${w.label}</span>
          <div class="chart-bars">
            <div class="chart-bar chart-bar-omzet" style="width:${(w.omzet / maxVal) * 100}%" title="Omzet ${formatEuro(w.omzet)}"></div>
            <div class="chart-bar chart-bar-winst" style="width:${(w.winst / maxVal) * 100}%" title="Winst ${formatEuro(w.winst)}"></div>
          </div>
          <span class="chart-legend">${formatEuro(w.omzet)} / ${formatEuro(w.winst)}</span>
        </div>`
    )
    .join('');
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
  const todayStr = today.toISOString().slice(0, 10);
  const vandaag = ritten
    .filter((r) => isInDay(r.datum, today) && (r.status === 'komend' || r.status === 'lopend'))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  if (vandaag.length === 0) {
    lijst.innerHTML = '<li class="ritten-status-empty">Geen komende of lopende ritten vandaag.</li>';
    return;
  }
  lijst.innerHTML = vandaag
    .map((r) => {
      const verg = r.vergoeding != null ? r.vergoeding : vergoedingVoorRit(r.km || 0);
      const chauffeur = r.chauffeurName || '—';
      const voertuig = r.voertuigName || '—';
      const isLopend = r.status === 'lopend';
      const startBtn = !isLopend ? `<button type="button" class="btn btn-small btn-start-rit" data-id="${r.id}">Start rit</button>` : '';
      const voltooidBtn = isLopend ? `<button type="button" class="btn btn-small btn-primary btn-voltooid-rit" data-id="${r.id}">Rit voltooid</button>` : '';
      return `<li class="ritten-status-item" data-id="${r.id}">
        <span class="ritten-status-rit">${r.km || 0} km – ${formatEuro(verg)}</span>
        <span class="ritten-status-meta">Chauffeur: ${chauffeur} · Auto: ${voertuig}</span>
        <span class="ritten-status-buttons">${startBtn} ${voltooidBtn}</span>
      </li>`;
    })
    .join('');
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
