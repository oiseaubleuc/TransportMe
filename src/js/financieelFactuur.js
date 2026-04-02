/**
 * Financieel-tab: PDF-factuur per dag of per bestelbon (voltooide ritten).
 */

import { getData, getFactuurGegevens, nextFactuurVolgNummer } from './storage.js';
import { isRitVoltooid, vergoedingVoorRit, toDateStr } from './calculations.js';
import { formatDatumKort } from './format.js';
import { generateFactuurPdfBlob, triggerPdfDownload } from './invoicePdf.js';

function ritVergoeding(r) {
  return r.vergoeding ?? vergoedingVoorRit(r.km || 0, r.tijd);
}

function voltooideRittenSorted() {
  const { ritten } = getData();
  return ritten
    .filter((r) => isRitVoltooid(r))
    .sort((a, b) => (a.datum + (a.tijd || '')).localeCompare(b.datum + (b.tijd || '')));
}

function bonnenUitRit(r) {
  const out = [];
  const items = Array.isArray(r.bestelArtikelen) ? r.bestelArtikelen.filter((x) => x?.bonnummer) : [];
  if (items.length) {
    for (const x of items) out.push(x.bonnummer);
  } else if (r.bonnummer) out.push(r.bonnummer);
  return out;
}

function uniekeBonnenVoltooideRitten() {
  const set = new Set();
  for (const r of voltooideRittenSorted()) {
    for (const b of bonnenUitRit(r)) set.add(b);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
}

function rittenVoorBon(bon) {
  return voltooideRittenSorted().filter((r) => bonnenUitRit(r).includes(bon));
}

function rittenVoorDatum(iso) {
  return voltooideRittenSorted().filter((r) => r.datum === iso);
}

function ritOmschrijving(r) {
  const route = r.fromName && r.toName ? `${r.fromName} → ${r.toName}` : 'Route niet ingevuld';
  const bonnen = bonnenUitRit(r);
  const bonTxt = bonnen.length ? bonnen.join(', ') : '—';
  return `${route} · Bon(nen): ${bonTxt}`;
}

function rittenNaarPdfRegels(ritten) {
  return ritten.map((r) => {
    const bedrag = ritVergoeding(r);
    return {
      titel: 'Ziekenhuisvervoer',
      detail: `${ritOmschrijving(r)} · ${formatDatumKort(r.datum, r.tijd)} · ${r.km || 0} km`,
      prijsExcl: bedrag,
      totaal: bedrag,
    };
  });
}

function buildFactuurMeta(settings) {
  const n = nextFactuurVolgNummer();
  const factuurDatum = new Date();
  const verval = new Date(factuurDatum);
  const dagen = Number(settings?.vervalDagen);
  verval.setDate(verval.getDate() + (Number.isFinite(dagen) && dagen >= 0 ? dagen : 30));
  return {
    factuurCode: n.factuurCode,
    orderDisplay: n.orderDisplay,
    factuurDatum,
    vervalDatum: verval,
  };
}

function slugFilename(s) {
  return String(s)
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 80) || 'factuur';
}

export function refreshFinancieelFactuurSelects() {
  const bonSel = document.getElementById('fin-factuur-bon');
  const datumInp = document.getElementById('fin-factuur-datum');
  if (!bonSel && !datumInp) return;

  if (datumInp && !datumInp.value) {
    datumInp.value = toDateStr(new Date());
  }

  if (bonSel) {
    const cur = bonSel.value;
    const bons = uniekeBonnenVoltooideRitten();
    bonSel.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Kies bestelbon —';
    bonSel.appendChild(placeholder);
    for (const b of bons) {
      const o = document.createElement('option');
      o.value = b;
      o.textContent = b;
      bonSel.appendChild(o);
    }
    if (cur && bons.includes(cur)) bonSel.value = cur;
  }
}

export function initFinancieelFactuur() {
  const btnDag = document.getElementById('fin-factuur-download-dag');
  const btnBon = document.getElementById('fin-factuur-download-bon');
  const datumInp = document.getElementById('fin-factuur-datum');
  const bonSel = document.getElementById('fin-factuur-bon');

  refreshFinancieelFactuurSelects();

  btnDag?.addEventListener('click', async () => {
    const iso = datumInp?.value?.trim();
    if (!iso) {
      alert('Kies een datum.');
      return;
    }
    const ritten = rittenVoorDatum(iso);
    if (ritten.length === 0) {
      alert('Geen voltooide ritten op deze datum voor dit profiel.');
      return;
    }
    const pdfRegels = rittenNaarPdfRegels(ritten);
    const settings = getFactuurGegevens();
    const meta = buildFactuurMeta(settings);
    try {
      const { blob, invoiceNr } = await generateFactuurPdfBlob({
        factuurSettings: settings,
        meta,
        regels: pdfRegels,
      });
      triggerPdfDownload(blob, `factuur-dag-${iso}-${slugFilename(invoiceNr)}.pdf`);
    } catch (err) {
      console.error(err);
      alert('PDF kon niet worden gemaakt. Probeer opnieuw.');
    }
  });

  btnBon?.addEventListener('click', async () => {
    const bon = bonSel?.value?.trim();
    if (!bon) {
      alert('Kies een bestelbon.');
      return;
    }
    const ritten = rittenVoorBon(bon);
    if (ritten.length === 0) {
      alert('Geen voltooide ritten voor deze bon.');
      return;
    }
    const pdfRegels = rittenNaarPdfRegels(ritten);
    const settings = getFactuurGegevens();
    const meta = buildFactuurMeta(settings);
    try {
      const { blob, invoiceNr } = await generateFactuurPdfBlob({
        factuurSettings: settings,
        meta,
        regels: pdfRegels,
      });
      triggerPdfDownload(blob, `factuur-bon-${slugFilename(bon)}-${slugFilename(invoiceNr)}.pdf`);
    } catch (err) {
      console.error(err);
      alert('PDF kon niet worden gemaakt. Probeer opnieuw.');
    }
  });
}
