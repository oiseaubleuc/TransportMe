/**
 * Financieel-tab: PDF-factuur per dag, week, maand, bestelbon of aangevinkte ritten.
 */

import { getData, getFactuurGegevens, nextFactuurVolgNummer } from './storage.js';
import { isRitVoltooid, vergoedingVoorRit, toDateStr, getWeekKey } from './calculations.js';
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

/** weekValue bv. "2026-W14" (zelfde formaat als &lt;input type="week"&gt;) */
function rittenVoorWeekInput(weekValue) {
  const key = String(weekValue || '').trim();
  if (!key) return [];
  return voltooideRittenSorted().filter((r) => getWeekKey(r.datum) === key);
}

/** monthValue bv. "2026-04" */
function rittenVoorMaandInput(monthValue) {
  const prefix = String(monthValue || '').trim().slice(0, 7);
  if (prefix.length < 7) return [];
  return voltooideRittenSorted().filter((r) => (r.datum || '').slice(0, 7) === prefix);
}

function rittenVoorAangevinkteCheckboxes() {
  const ids = new Set(
    [...document.querySelectorAll('.fin-rit-factuur-cb:checked')]
      .map((cb) => cb.getAttribute('data-rit-id'))
      .filter(Boolean)
  );
  if (ids.size === 0) return [];
  return voltooideRittenSorted().filter((r) => ids.has(String(r.id)));
}

/** Leesbare factuurregel (één zin per onderdeel, geschikt voor PDF) */
function ritFactuurOmschrijving(r) {
  const route =
    r.fromName && r.toName
      ? `Vertrekpunt: ${r.fromName}. Bestemming: ${r.toName}.`
      : r.fromName || r.toName
        ? `Route: ${[r.fromName, r.toName].filter(Boolean).join(' → ')}.`
        : '';
  const bonnen = bonnenUitRit(r);
  const bonDeel =
    bonnen.length === 1
      ? `Referentie bestelbon: ${bonnen[0]}.`
      : bonnen.length > 1
        ? `Referentie bestelbonnen: ${bonnen.join(', ')}.`
        : '';
  const tijdWeergave = r.voltooidTijd || r.tijd || '';
  const uitgevoerd = `Uitvoeringsdatum: ${formatDatumKort(r.datum, tijdWeergave)}.`;
  const kmDeel = `Afgelegde afstand: ${r.km || 0} km.`;
  return [route, bonDeel, uitgevoerd, kmDeel].filter(Boolean).join(' ');
}

function rittenNaarPdfRegels(ritten) {
  return ritten.map((r) => {
    const bedrag = ritVergoeding(r);
    return {
      titel: 'Dienstverlening: ziekenhuisvervoer',
      detail: ritFactuurOmschrijving(r),
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

function huidigeWeekInputWaarde() {
  return getWeekKey(toDateStr(new Date()));
}

function huidigeMaandInputWaarde() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function downloadFactuurPdf(ritten, filenameStem) {
  if (!ritten.length) {
    alert('Geen voltooide ritten voor deze keuze.');
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
    triggerPdfDownload(blob, `${slugFilename(filenameStem)}-${slugFilename(invoiceNr)}.pdf`);
  } catch (err) {
    console.error(err);
    alert('PDF kon niet worden gemaakt. Probeer opnieuw.');
  }
}

export function refreshFinancieelFactuurSelects() {
  const bonSel = document.getElementById('fin-factuur-bon');
  const datumInp = document.getElementById('fin-factuur-datum');
  const weekInp = document.getElementById('fin-factuur-week');
  const maandInp = document.getElementById('fin-factuur-maand');
  if (!bonSel && !datumInp && !weekInp && !maandInp) return;

  if (datumInp && !datumInp.value) {
    datumInp.value = toDateStr(new Date());
  }
  if (weekInp && !weekInp.value) {
    weekInp.value = huidigeWeekInputWaarde();
  }
  if (maandInp && !maandInp.value) {
    maandInp.value = huidigeMaandInputWaarde();
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
  const btnWeek = document.getElementById('fin-factuur-download-week');
  const btnMaand = document.getElementById('fin-factuur-download-maand');
  const btnSelectie = document.getElementById('fin-factuur-download-selectie');
  const datumInp = document.getElementById('fin-factuur-datum');
  const bonSel = document.getElementById('fin-factuur-bon');
  const weekInp = document.getElementById('fin-factuur-week');
  const maandInp = document.getElementById('fin-factuur-maand');

  refreshFinancieelFactuurSelects();

  btnDag?.addEventListener('click', async () => {
    const iso = datumInp?.value?.trim();
    if (!iso) {
      alert('Kies een datum.');
      return;
    }
    await downloadFactuurPdf(rittenVoorDatum(iso), `factuur-dag-${iso}`);
  });

  btnBon?.addEventListener('click', async () => {
    const bon = bonSel?.value?.trim();
    if (!bon) {
      alert('Kies een bestelbon.');
      return;
    }
    await downloadFactuurPdf(rittenVoorBon(bon), `factuur-bon-${bon}`);
  });

  btnWeek?.addEventListener('click', async () => {
    const w = weekInp?.value?.trim();
    if (!w) {
      alert('Kies een week.');
      return;
    }
    await downloadFactuurPdf(rittenVoorWeekInput(w), `factuur-week-${w}`);
  });

  btnMaand?.addEventListener('click', async () => {
    const m = maandInp?.value?.trim();
    if (!m) {
      alert('Kies een maand.');
      return;
    }
    await downloadFactuurPdf(rittenVoorMaandInput(m), `factuur-maand-${m}`);
  });

  btnSelectie?.addEventListener('click', async () => {
    const ritten = rittenVoorAangevinkteCheckboxes();
    if (ritten.length === 0) {
      alert('Vink minstens één uitgevoerde rit aan in de lijst hierboven.');
      return;
    }
    await downloadFactuurPdf(ritten, 'factuur-selectie');
  });
}
