/**
 * Tabellen – ritten, brandstof, overige kosten + verwijderen + totalen
 */

import { getData, saveRitten, saveBrandstof, saveOverig } from './storage.js';
import { vergoedingVoorRit, getWeekKey, getWeekLabel } from './calculations.js';
import { formatEuro } from './format.js';

function escapeHtml(str) {
  if (str == null) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderRitten(onRender) {
  const { ritten } = getData();
  const tbody = document.getElementById('tbody-ritten');
  if (!tbody) return;

  if (ritten.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="empty-state">Nog geen ritten. Voeg een rit toe boven.</td></tr>';
    return;
  }

  const totaalKm = ritten.reduce((s, r) => s + (r.km || 0), 0);
  const totaalVergoeding = ritten.reduce(
    (s, r) => s + (r.vergoeding ?? vergoedingVoorRit(r.km)),
    0
  );

  const byWeek = {};
  ritten.forEach((r) => {
    const key = getWeekKey(r.datum);
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key].push(r);
  });
  const weekKeys = Object.keys(byWeek).sort().reverse();
  weekKeys.forEach((key) => {
    byWeek[key].sort((a, b) => b.datum.localeCompare(a.datum));
  });

  let html = '';
  weekKeys.forEach((key) => {
    const weekRitten = byWeek[key];
    const label = getWeekLabel(weekRitten[0].datum);
    html += `<tr class="week-header"><td colspan="4"><strong>${escapeHtml(label)}</strong></td></tr>`;
    weekRitten.forEach(
      (r) =>
        (html += `<tr>
          <td>${escapeHtml(r.datum)}</td>
          <td class="num">${r.km} km</td>
          <td class="num">${formatEuro(r.vergoeding ?? vergoedingVoorRit(r.km))}</td>
          <td><button type="button" class="btn btn-danger btn-delete-rit" data-id="${r.id}">Verwijder</button></td>
        </tr>`)
    );
  });
  html += `<tr class="total-row">
    <td><strong>Totaal (${ritten.length} rit${ritten.length === 1 ? '' : 'ten'})</strong></td>
    <td class="num"><strong>${totaalKm} km</strong></td>
    <td class="num"><strong>${formatEuro(totaalVergoeding)}</strong></td>
    <td></td>
  </tr>`;

  tbody.innerHTML = html;

  tbody.querySelectorAll('.btn-delete-rit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const { ritten } = getData();
      saveRitten(ritten.filter((r) => r.id !== id));
      onRender?.();
    });
  });
}

export function renderBrandstof(onRender) {
  const { brandstof } = getData();
  const tbody = document.getElementById('tbody-brandstof');
  if (!tbody) return;

  if (brandstof.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="empty-state">Nog geen tankbeurten. Vul hierboven een tankbeurt in.</td></tr>';
    return;
  }

  const sorted = brandstof.slice().sort((a, b) => b.datum.localeCompare(a.datum));
  const totaalLiter = brandstof.reduce((s, b) => s + (b.liter || 0), 0);
  const totaalPrijs = brandstof.reduce((s, b) => s + (b.prijs || 0), 0);

  tbody.innerHTML =
    sorted
      .map(
        (b) =>
          `<tr>
            <td>${escapeHtml(b.datum)}</td>
            <td class="num">${Number(b.liter).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L</td>
            <td class="num">${formatEuro(b.prijs)}</td>
            <td class="num">${formatEuro(b.prijs / b.liter)}</td>
            <td><button type="button" class="btn btn-danger btn-delete-brandstof" data-id="${b.id}">Verwijder</button></td>
          </tr>`
      )
      .join('') +
    `<tr class="total-row">
      <td><strong>Totaal (${brandstof.length} tankbeurt${brandstof.length === 1 ? '' : 'en'})</strong></td>
      <td class="num"><strong>${totaalLiter.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L</strong></td>
      <td class="num"><strong>${formatEuro(totaalPrijs)}</strong></td>
      <td class="num"></td>
      <td></td>
    </tr>`;

  tbody.querySelectorAll('.btn-delete-brandstof').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const { brandstof } = getData();
      saveBrandstof(brandstof.filter((b) => b.id !== id));
      onRender?.();
    });
  });
}

export function renderOverig(onRender) {
  const { overig } = getData();
  const tbody = document.getElementById('tbody-overig');
  if (!tbody) return;

  if (overig.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Nog geen overige kosten.</td></tr>';
    return;
  }

  const sorted = overig.slice().sort((a, b) => b.datum.localeCompare(a.datum));
  const totaalBedrag = overig.reduce((s, o) => s + (o.bedrag || 0), 0);

  tbody.innerHTML =
    sorted
      .map(
        (o) =>
          `<tr>
            <td>${escapeHtml(o.datum)}</td>
            <td>${escapeHtml(o.omschrijving)}</td>
            <td class="num">${formatEuro(o.bedrag)}</td>
            <td><button type="button" class="btn btn-danger btn-delete-overig" data-id="${o.id}">Verwijder</button></td>
          </tr>`
      )
      .join('') +
    `<tr class="total-row">
      <td colspan="2"><strong>Totaal (${overig.length} post${overig.length === 1 ? '' : 'en'})</strong></td>
      <td class="num"><strong>${formatEuro(totaalBedrag)}</strong></td>
      <td></td>
    </tr>`;

  tbody.querySelectorAll('.btn-delete-overig').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const { overig } = getData();
      saveOverig(overig.filter((o) => o.id !== id));
      onRender?.();
    });
  });
}

export function renderAllTables(refreshDashboard) {
  renderRitten(refreshDashboard);
  renderBrandstof(refreshDashboard);
  renderOverig(refreshDashboard);
}
