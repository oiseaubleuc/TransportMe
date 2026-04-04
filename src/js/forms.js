/**
 * Formulieren – ritten, brandstof, overige kosten
 */

import { RIT_DUUR_MINUTEN } from './config.js';
import {
  vergoedingFromPresetOrKm,
  findPresetExact,
  rendabiliteitRitForForm,
  toDateStr,
} from './calculations.js';
import { formatEuro, formatLiter } from './format.js';
import {
  getData,
  saveRitten,
  saveBrandstof,
  saveOverig,
  getVoertuigen,
  getZiekenhuizen,
  getPresetRoutes,
} from './storage.js';
import { nextVolgordeStart } from './ritVolgorde.js';
import { parseReceiptText } from './ocr.js';
import { runReceiptOcr } from './receiptOcr.js';
import { initPlaceSearchFree } from './placeSearchFree.js';
import { scanBonBarcode } from './bonBarcodeScan.js';

function ritOpslaanModus() {
  const el = document.querySelector('input[name="rit-opslaan-modus"]:checked');
  return el?.value === 'meerdere' ? 'meerdere' : 'een';
}

function boxWeightForRow(boxen) {
  if (boxen == null || boxen === '') return 1;
  const b = Number.parseInt(String(boxen), 10);
  if (Number.isFinite(b) && b > 0) return b;
  return 1;
}

/** surplus = totaal km − n (min. 1 km per rit); verdeel surplus naar gewichten */
function splitKmWeightedAtLeastOne(totalKm, weights) {
  const n = weights.length;
  if (n === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0) || n;
  const surplus = totalKm - n;
  if (surplus < 0) return null;
  const parts = weights.map((w) => 1 + Math.round((surplus * w) / sum));
  const drift = totalKm - parts.reduce((a, b) => a + b, 0);
  parts[parts.length - 1] += drift;
  return parts;
}

function splitEuroCents(totalEuro, weights) {
  const sum = weights.reduce((a, b) => a + b, 0) || weights.length;
  const totalCents = Math.round(totalEuro * 100);
  let acc = 0;
  const out = [];
  for (let i = 0; i < weights.length; i++) {
    if (i === weights.length - 1) out.push((totalCents - acc) / 100);
    else {
      const c = Math.round((totalCents * weights[i]) / sum);
      out.push(c / 100);
      acc += c;
    }
  }
  return out;
}

function isPdfFile(file) {
  if (!file) return false;
  const t = String(file.type || '').toLowerCase();
  if (t === 'application/pdf') return true;
  return String(file.name || '').toLowerCase().endsWith('.pdf');
}

/** Afbeelding direct; PDF → eerste pagina als canvas (pdfjs lazy-load) */
async function fileToOcrSource(file) {
  if (file.type?.startsWith('image/')) return file;
  if (isPdfFile(file)) {
    const { pdfFileToCanvas } = await import('./pdfFirstPageToCanvas.js');
    return pdfFileToCanvas(file, 1.5);
  }
  return null;
}


/** Zet alle datumvelden in de app op vandaag (bijv. bij laden). */
export function setAlleDatumsVandaag() {
  const today = toDateStr(new Date());
  ['rit-datum', 'brandstof-datum', 'overig-datum', 'meer-rit-datum'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

export function initFormRit(onSubmit) {
  const form = document.getElementById('form-rit');
  const kmInput = document.getElementById('rit-km');
  const datumInput = document.getElementById('rit-datum');
  const preview = document.getElementById('rit-preview');
  const previewKm = document.getElementById('rit-preview-km');
  const previewBenzine = document.getElementById('rit-preview-benzine');
  const previewWinst = document.getElementById('rit-preview-winst');
  const rowBenzine = document.getElementById('rit-row-benzine');
  const rowWinst = document.getElementById('rit-row-winst');
  const geenDataEl = document.getElementById('rit-geen-data');
  const berekeningCard = document.getElementById('rit-berekening-card');
  const winstLabel = document.getElementById('rit-label-winst');

  if (!form || !datumInput) return;

  datumInput.value = toDateStr(new Date());
  const achterafCb = document.getElementById('rit-achteraf');
  const tijdRow = document.getElementById('rit-tijd-row');
  const tijdInput = document.getElementById('rit-tijd');

  function getEffectiveRitTijd() {
    if (achterafCb?.checked && tijdInput?.value) {
      const m = String(tijdInput.value).trim().match(/^(\d{1,2}):(\d{2})$/);
      if (m) {
        const h = Number(m[1]);
        const min = Number(m[2]);
        if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
          return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        }
      }
    }
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  function syncAchterafRow() {
    if (tijdRow) tijdRow.hidden = !achterafCb?.checked;
    updatePreview();
  }
  achterafCb?.addEventListener('change', syncAchterafRow);
  tijdInput?.addEventListener('input', () => updatePreview());

  const artikelLijst = document.getElementById('rit-artikelen-lijst');
  const artikelAddBtn = document.getElementById('rit-artikel-add');

  function artikelRowTemplate(bonnummer = '', boxen = '', withRemove = true) {
    const bonIdAttr = withRemove ? '' : ' id="rit-bonnummer"';
    const removeBtn = withRemove
      ? '<button type="button" class="rit-artikel-remove" title="Verwijder artikel" aria-label="Verwijder artikel">×</button>'
      : '';
    return `<div class="rit-artikel-row">
      <div class="rit-artikel-bon-cell">
        <input type="text" class="rit-artikel-bon" placeholder="Bestelnummer (verplicht)" value="${bonnummer}"${bonIdAttr} required />
        <button type="button" class="btn btn-outline btn-small btn-bon-scan" title="Bon scannen" aria-label="Bon scannen">Scan</button>
      </div>
      <input type="number" class="rit-artikel-boxen" min="1" step="1" placeholder="Boxen" value="${boxen}" />
      ${removeBtn}
    </div>`;
  }

  function bindArtikelEvents() {
    if (!artikelLijst) return;
    artikelLijst.querySelectorAll('.rit-artikel-remove').forEach((btn) => {
      btn.onclick = () => {
        btn.closest('.rit-artikel-row')?.remove();
        const rows = artikelLijst.querySelectorAll('.rit-artikel-row');
        if (rows.length === 0) {
          artikelLijst.innerHTML = artikelRowTemplate('', '', false);
          bindArtikelEvents();
        }
        syncRitOpslaanModusHint();
      };
    });
  }

  artikelAddBtn?.addEventListener('click', () => {
    if (!artikelLijst) return;
    artikelLijst.insertAdjacentHTML('beforeend', artikelRowTemplate('', '', true));
    bindArtikelEvents();
    syncRitOpslaanModusHint();
  });
  bindArtikelEvents();

  document.getElementById('rit-artikelen')?.addEventListener('click', async (e) => {
    const scanBtn = e.target.closest('.btn-bon-scan');
    if (!scanBtn || !artikelLijst?.contains(scanBtn)) return;
    e.preventDefault();
    const row = scanBtn.closest('.rit-artikel-row');
    const input = row?.querySelector('.rit-artikel-bon');
    if (!input) return;
    const text = await scanBonBarcode({ title: 'Bestelbon scannen' });
    if (text) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }
  });

  const modusHint = document.getElementById('rit-opslaan-modus-hint');
  function syncRitOpslaanModusHint() {
    if (!modusHint || !artikelLijst) return;
    const rows = artikelLijst.querySelectorAll('.rit-artikel-row');
    let totaalBoxen = 0;
    rows.forEach((row) => {
      const raw = row.querySelector('.rit-artikel-boxen')?.value;
      totaalBoxen += boxWeightForRow(raw);
    });
    const meerdereRegels = rows.length > 1;
    const veelBoxen = rows.length === 1 && totaalBoxen > 1;
    if (meerdereRegels || veelBoxen) {
      modusHint.textContent =
        'Tip: meerdere regels of meerdere boxen op één regel? Kies «Meerdere ritten» om vergoeding en km naar boxen te verdelen (min. 1 km per rit).';
    } else {
      modusHint.textContent =
        'Één rit: alle regels op dezelfde rit. Meerdere ritten: per regel een aparte rit; vergoeding en km worden verdeeld volgens het aantal boxen (of gelijk als boxen leeg).';
    }
  }
  artikelLijst?.addEventListener('input', (e) => {
    if (e.target?.classList?.contains('rit-artikel-boxen')) syncRitOpslaanModusHint();
  });
  syncRitOpslaanModusHint();

  function ritRoutePreset() {
    const v = document.getElementById('rit-vertrek')?.value?.trim() || '';
    const t = document.getElementById('rit-bestemming')?.value?.trim() || '';
    if (!v || !t) return null;
    return findPresetExact(getPresetRoutes(), v, t);
  }

  function updatePreview() {
    const km = parseFloat(kmInput?.value) || 0;
    const tijd = getEffectiveRitTijd();
    const preset = ritRoutePreset();
    if (preview) preview.textContent = formatEuro(vergoedingFromPresetOrKm(preset, km, tijd));
    if (previewKm) previewKm.textContent = km ? `${Math.round(km)} km` : '0 km';

    const rend = rendabiliteitRitForForm(km, tijd, preset);
    const hasRendabiliteit = rend && rend.geschatteWinst != null;

    if (geenDataEl) geenDataEl.hidden = hasRendabiliteit;
    if (rowBenzine) rowBenzine.hidden = !hasRendabiliteit;
    if (rowWinst) rowWinst.hidden = !hasRendabiliteit;

    if (hasRendabiliteit && rend) {
      if (previewBenzine) previewBenzine.textContent = formatEuro(rend.geschatteBenzine);
      if (previewWinst) {
        previewWinst.textContent = formatEuro(rend.geschatteWinst);
        previewWinst.classList.toggle('rit-winst--negatief', rend.geschatteWinst < 0);
        previewWinst.hidden = false;
        rowWinst?.classList.toggle('rit-winst--negatief', rend.geschatteWinst < 0);
      }
    } else if (previewWinst) {
      previewWinst.textContent = '—';
      previewWinst.classList.remove('rit-winst--negatief');
      previewWinst.hidden = true;
    }

    if (berekeningCard) berekeningCard.classList.toggle('rit-berekening-card--heeft-km', km > 0);
    if (winstLabel) winstLabel.hidden = !hasRendabiliteit;
  }

  kmInput?.addEventListener('input', updatePreview);
  document.getElementById('rit-vertrek')?.addEventListener('change', updatePreview);
  document.getElementById('rit-bestemming')?.addEventListener('change', updatePreview);
  updatePreview();

  function resetRitFormulier() {
    form.reset();
    datumInput.value = toDateStr(new Date());
    if (achterafCb) achterafCb.checked = false;
    if (tijdInput) tijdInput.value = '';
    if (tijdRow) tijdRow.hidden = true;
    updatePreview();
    const destClear = document.getElementById('rit-selected-destination');
    if (destClear) {
      destClear.textContent = '';
      destClear.hidden = true;
    }
    const vertrekSel = document.getElementById('rit-vertrek');
    const bestemmingSel = document.getElementById('rit-bestemming');
    if (vertrekSel) vertrekSel.value = '';
    if (bestemmingSel) bestemmingSel.value = '';
    if (artikelLijst) {
      artikelLijst.innerHTML = artikelRowTemplate('', '', false);
      bindArtikelEvents();
    }
    syncRitOpslaanModusHint();
  }

  document.getElementById('rit-form-leegmaken')?.addEventListener('click', () => {
    if (!confirm('Invoer wissen zonder op te slaan?')) return;
    resetRitFormulier();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const datum = datumInput.value;
    const km = parseInt(kmInput?.value, 10);
    const artikelRows = Array.from(artikelLijst?.querySelectorAll('.rit-artikel-row') || []);
    const bestelArtikelen = artikelRows
      .map((row) => {
        const bonnummer = row.querySelector('.rit-artikel-bon')?.value?.trim() || '';
        const boxenRaw = row.querySelector('.rit-artikel-boxen')?.value;
        const boxen = Number.parseInt(boxenRaw, 10);
        return {
          bonnummer,
          boxen: Number.isFinite(boxen) && boxen > 0 ? boxen : null,
        };
      })
      .filter((x) => x.bonnummer);
    const bonnummer = bestelArtikelen[0]?.bonnummer || '';
    const chauffeurSel = document.getElementById('rit-chauffeur');
    const chauffeurId = chauffeurSel?.value || '';
    const chauffeurName = chauffeurSel?.selectedOptions?.[0]?.textContent || '';
    if (!bonnummer) {
      alert('Vul minstens één bestelnummer in.');
      return;
    }
    if (!datum || !km || km < 1 || !chauffeurId) return;
    const achteraf = Boolean(achterafCb?.checked);
    if (achteraf) {
      const tv = tijdInput?.value?.trim() || '';
      if (!tv) {
        alert('Vink «Achteraf ingevoerd» uit, of vul het uur van de rit in.');
        return;
      }
    }
    const modus = ritOpslaanModus();
    const tijd = getEffectiveRitTijd();
    const voertuigSel = document.getElementById('rit-voertuig');
    const voertuigId = voertuigSel?.value || '';
    const voertuigName = voertuigSel?.selectedOptions?.[0]?.textContent || '';
    const bestemmingSel = document.getElementById('rit-bestemming');
    const vertrekSel = document.getElementById('rit-vertrek');
    const fromId = vertrekSel?.value?.trim() || '';
    const toId = bestemmingSel?.value?.trim() || '';
    const presetExact = findPresetExact(getPresetRoutes(), fromId, toId);
    const vergoedingTotaal = vergoedingFromPresetOrKm(presetExact, km, tijd);
    const ziekenhuizen = getZiekenhuizen();
    const from = fromId ? ziekenhuizen.find((h) => h.id === fromId) : null;
    const to = toId ? ziekenhuizen.find((h) => h.id === toId) : null;
    const { ritten } = getData();

    const baseRit = {
      datum,
      tijd,
      voertuigId,
      voertuigName,
      chauffeurId,
      chauffeurName,
      status: achteraf ? 'voltooid' : 'komend',
      duurMinuten: RIT_DUUR_MINUTEN,
    };
    if (achteraf) baseRit.voltooidTijd = tijd;
    if (from && to) {
      baseRit.fromId = from.id;
      baseRit.toId = to.id;
      baseRit.fromName = from.name;
      baseRit.toName = to.name;
    }

    let rijenVoorSplit = bestelArtikelen;
    if (modus === 'meerdere' && bestelArtikelen.length === 1) {
      const ene = bestelArtikelen[0];
      const n = boxWeightForRow(ene.boxen);
      if (n > 1) {
        rijenVoorSplit = Array.from({ length: n }, () => ({
          bonnummer: ene.bonnummer,
          boxen: 1,
        }));
      }
    }

    const splitInMeerdereRitten = modus === 'meerdere' && rijenVoorSplit.length > 1;
    if (splitInMeerdereRitten) {
      const weights = rijenVoorSplit.map((a) => boxWeightForRow(a.boxen));
      const kmParts = splitKmWeightedAtLeastOne(km, weights);
      if (!kmParts) {
        alert(
          `Voor ${rijenVoorSplit.length} ritten zijn minstens ${rijenVoorSplit.length} km nodig (minimaal 1 km per rit).`
        );
        return;
      }
      const euroParts = splitEuroCents(vergoedingTotaal, weights);
      let volgorde = nextVolgordeStart(ritten);
      const tBase = Date.now();
      rijenVoorSplit.forEach((art, i) => {
        ritten.push({
          ...baseRit,
          id: tBase + i,
          volgordeNr: volgorde++,
          km: kmParts[i],
          vergoeding: euroParts[i],
          bonnummer: art.bonnummer,
          bestelArtikelen: [{ bonnummer: art.bonnummer, boxen: art.boxen }],
        });
      });
    } else {
      ritten.push({
        ...baseRit,
        id: Date.now(),
        volgordeNr: nextVolgordeStart(ritten),
        km,
        vergoeding: vergoedingTotaal,
        bonnummer,
        bestelArtikelen,
      });
    }

    ritten.sort((a, b) => a.datum.localeCompare(b.datum));
    saveRitten(ritten);
    resetRitFormulier();
    onSubmit?.();
  });
}

function parseLiterInput(value) {
  if (value == null || value === '') return NaN;
  const s = String(value).trim().replace(',', '.');
  return parseFloat(s);
}

export function initFormBrandstof(onSubmit) {
  const form = document.getElementById('form-brandstof');
  const datumInput = document.getElementById('brandstof-datum');
  const literInput = document.getElementById('brandstof-liter');
  const prijsInput = document.getElementById('brandstof-prijs');
  const perLiterEl = document.getElementById('brandstof-per-liter');
  const fileInput = document.getElementById('brandstof-file');
  const resultBlock = document.getElementById('brandstof-analyse-resultaat');
  const resultText = document.getElementById('brandstof-analyse-text');

  if (!form || !datumInput) return;

  datumInput.value = toDateStr(new Date());

  function updatePerLiter() {
    const liter = parseLiterInput(literInput?.value) || 0;
    const prijs = parseFloat(prijsInput?.value) || 0;
    if (perLiterEl) perLiterEl.textContent = liter ? formatEuro(prijs / liter) : '€ 0';
  }

  literInput?.addEventListener('input', updatePerLiter);
  prijsInput?.addEventListener('input', updatePerLiter);

  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target?.files?.[0];
      const source = file ? await fileToOcrSource(file) : null;
      if (!file || !source) {
        if (file) alert('Kies een afbeelding (jpg, png) of een PDF.');
        return;
      }
      if (resultText) resultText.textContent = 'Bezig met analyseren…';
      if (resultBlock) resultBlock.hidden = false;

      try {
        const text = await runReceiptOcr(source);
        const parsed = parseReceiptText(text);
        const today = toDateStr(new Date());

        if (parsed.datum) datumInput.value = parsed.datum;
        else datumInput.value = today;
        if (parsed.liter != null) literInput.value = String(parsed.liter).replace('.', ',');
        if (parsed.prijs != null) prijsInput.value = String(parsed.prijs);

        updatePerLiter();

        const parts = [];
        if (parsed.datum) parts.push(`datum ${parsed.datum}`);
        else parts.push('datum (niet herkend, vandaag gebruikt)');
        if (parsed.liter != null) parts.push(`${parsed.liter} L`);
        else parts.push('liter (niet herkend)');
        if (parsed.prijs != null) parts.push(formatEuro(parsed.prijs));
        else parts.push('prijs (niet herkend)');
        if (resultText) resultText.textContent = parts.join(', ') + '.';
      } catch (err) {
        if (resultText) resultText.textContent = 'Analyse mislukt. Vul handmatig in.';
        console.error(err);
      }
      fileInput.value = '';
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const datum = datumInput.value;
    const liter = parseLiterInput(literInput?.value);
    const prijs = parseFloat(prijsInput?.value);
    if (!datum || !Number.isFinite(liter) || liter <= 0 || !Number.isFinite(prijs) || prijs < 0) return;
    const voertuigSel = document.getElementById('brandstof-voertuig');
    const voertuigId = voertuigSel?.value || '';
    const voertuigName = voertuigSel?.selectedOptions?.[0]?.textContent || '';
    const { brandstof } = getData();
    brandstof.push({ id: Date.now(), datum, liter, prijs, voertuigId, voertuigName });
    brandstof.sort((a, b) => a.datum.localeCompare(b.datum));
    saveBrandstof(brandstof);
    form.reset();
    datumInput.value = toDateStr(new Date());
    if (resultBlock) resultBlock.hidden = true;
    updatePerLiter();
    onSubmit?.();
  });
}

/** Financieel-tab: snelle import tankticket als brandstofkost */
export function initFinancieelTicketImport(onSubmit) {
  const fileInput = document.getElementById('fin-ticket-file');
  const resultWrap = document.getElementById('fin-ticket-result-wrap');
  const resultText = document.getElementById('fin-ticket-result-text');
  const datumInput = document.getElementById('fin-ticket-datum');
  const literInput = document.getElementById('fin-ticket-liter');
  const prijsInput = document.getElementById('fin-ticket-prijs');
  const voertuigSel = document.getElementById('fin-ticket-voertuig');
  const perLiterEl = document.getElementById('fin-ticket-per-liter');
  const saveBtn = document.getElementById('fin-ticket-save');

  if (!saveBtn || !datumInput || !literInput || !prijsInput) return;

  datumInput.value = toDateStr(new Date());

  function updatePerLiter() {
    const liter = parseLiterInput(literInput.value) || 0;
    const prijs = parseFloat(prijsInput.value) || 0;
    if (perLiterEl) perLiterEl.textContent = liter > 0 ? formatEuro(prijs / liter) : '€ 0';
  }

  literInput.addEventListener('input', updatePerLiter);
  prijsInput.addEventListener('input', updatePerLiter);

  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target?.files?.[0];
      const source = file ? await fileToOcrSource(file) : null;
      if (!file || !source) {
        if (file) alert('Kies een afbeelding (jpg, png) of een PDF.');
        return;
      }
      if (resultWrap) resultWrap.hidden = false;
      if (resultText) resultText.textContent = 'Bezig met analyseren…';

      try {
        const text = await runReceiptOcr(source);
        const parsed = parseReceiptText(text);
        if (parsed.datum) datumInput.value = parsed.datum;
        if (parsed.liter != null) literInput.value = String(parsed.liter).replace('.', ',');
        if (parsed.prijs != null) prijsInput.value = String(parsed.prijs);
        updatePerLiter();

        const parts = [];
        parts.push(parsed.datum ? `datum ${parsed.datum}` : 'datum niet herkend');
        parts.push(parsed.liter != null ? `${parsed.liter} L` : 'liter niet herkend');
        parts.push(parsed.prijs != null ? formatEuro(parsed.prijs) : 'prijs niet herkend');
        if (resultText) resultText.textContent = parts.join(', ') + '.';
      } catch (err) {
        if (resultText) resultText.textContent = 'Analyse mislukt. Vul handmatig in.';
        console.error(err);
      }
      fileInput.value = '';
    });
  }

  saveBtn.addEventListener('click', () => {
    const datum = datumInput.value;
    const liter = parseLiterInput(literInput.value);
    const prijs = parseFloat(prijsInput.value);
    if (!datum || !Number.isFinite(liter) || liter <= 0 || !Number.isFinite(prijs) || prijs < 0) {
      alert('Controleer datum, liters en prijs.');
      return;
    }

    const voertuigId = voertuigSel?.value || '';
    const voertuigName = voertuigSel?.selectedOptions?.[0]?.textContent || '';
    const { brandstof } = getData();
    brandstof.push({ id: Date.now(), datum, liter, prijs, voertuigId, voertuigName });
    brandstof.sort((a, b) => a.datum.localeCompare(b.datum));
    saveBrandstof(brandstof);

    datumInput.value = toDateStr(new Date());
    literInput.value = '';
    prijsInput.value = '';
    if (resultWrap) resultWrap.hidden = true;
    updatePerLiter();
    onSubmit?.();
  });
}

export function initFormOverig(onSubmit) {
  const form = document.getElementById('form-overig');
  const datumInput = document.getElementById('overig-datum');

  if (!form || !datumInput) return;

  datumInput.value = toDateStr(new Date());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const datum = datumInput.value;
    const omschrijving = document.getElementById('overig-omschrijving')?.value?.trim() || 'Overig';
    const bedrag = parseFloat(document.getElementById('overig-bedrag')?.value);
    if (!datum || !Number.isFinite(bedrag) || bedrag < 0) return;
    const { overig } = getData();
    overig.push({ id: Date.now(), datum, omschrijving, bedrag });
    overig.sort((a, b) => a.datum.localeCompare(b.datum));
    saveOverig(overig);
    form.reset();
    datumInput.value = toDateStr(new Date());
    onSubmit?.();
  });
}

let meerRitVertrek = null;
let meerRitBestemming = null;

function syncMeerHandmatigeRitDefaults() {
  const d = document.getElementById('meer-rit-datum');
  const t = document.getElementById('meer-rit-tijd');
  if (d && !d.value) d.value = toDateStr(new Date());
  if (t && !t.value) {
    const n = new Date();
    t.value = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  }
}

/** Meer-tab: rit invoeren met OSM-zoeken (zelfde aanpak als Locaties) */
export function initMeerHandmatigeRit(onSaved) {
  const btn = document.getElementById('meer-rit-opslaan');
  if (!btn || btn.dataset.inited) return;
  btn.dataset.inited = '1';

  initPlaceSearchFree('meer-rit-vertrek-zoek', 'meer-rit-vertrek-suggesties', (p) => {
    meerRitVertrek = p;
  });
  initPlaceSearchFree('meer-rit-bestemming-zoek', 'meer-rit-bestemming-suggesties', (p) => {
    meerRitBestemming = p;
  });

  syncMeerHandmatigeRitDefaults();

  function resetMeerHandmatigeRitForm() {
    const datumInput = document.getElementById('meer-rit-datum');
    const kmInput = document.getElementById('meer-rit-km');
    const bonInput = document.getElementById('meer-rit-bon');
    const statusSel = document.getElementById('meer-rit-status');
    if (kmInput) kmInput.value = '';
    if (bonInput) bonInput.value = '';
    const vz = document.getElementById('meer-rit-vertrek-zoek');
    const bz = document.getElementById('meer-rit-bestemming-zoek');
    if (vz) vz.value = '';
    if (bz) bz.value = '';
    meerRitVertrek = null;
    meerRitBestemming = null;
    if (statusSel) statusSel.value = 'komend';
    syncMeerHandmatigeRitDefaults();
    if (datumInput) datumInput.value = toDateStr(new Date());
  }

  document.getElementById('meer-rit-leegmaken')?.addEventListener('click', () => {
    if (!confirm('Velden wissen zonder op te slaan?')) return;
    resetMeerHandmatigeRitForm();
  });

  document.getElementById('meer-rit-bon-scan')?.addEventListener('click', async () => {
    const bonInput = document.getElementById('meer-rit-bon');
    if (!bonInput) return;
    const text = await scanBonBarcode({ title: 'Bestelbon scannen' });
    if (text) {
      bonInput.value = text;
      bonInput.dispatchEvent(new Event('input', { bubbles: true }));
      bonInput.focus();
    }
  });

  btn.addEventListener('click', () => {
    const datumInput = document.getElementById('meer-rit-datum');
    const tijdInput = document.getElementById('meer-rit-tijd');
    const kmInput = document.getElementById('meer-rit-km');
    const bonInput = document.getElementById('meer-rit-bon');
    const chauffeurSel = document.getElementById('meer-rit-chauffeur');
    const voertuigSel = document.getElementById('meer-rit-voertuig');
    const statusSel = document.getElementById('meer-rit-status');
    const hint = document.getElementById('meer-rit-save-hint');

    const datum = datumInput?.value?.trim();
    let tijd = tijdInput?.value?.trim() || '';
    const km = parseInt(kmInput?.value, 10);
    const bon = bonInput?.value?.trim() || '';
    const chauffeurId = chauffeurSel?.value || '';
    const chauffeurName = chauffeurSel?.selectedOptions?.[0]?.textContent?.trim() || '';
    const voertuigId = voertuigSel?.value || '';
    const voertuigName = voertuigSel?.selectedOptions?.[0]?.textContent?.trim() || '';
    const status = statusSel?.value === 'komend' ? 'komend' : 'voltooid';

    if (!tijd) {
      const n = new Date();
      tijd = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
    } else {
      const m = tijd.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) {
        alert('Vul het uur in als uu:mm.');
        return;
      }
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h < 0 || h > 23 || min < 0 || min > 59) {
        alert('Vul een geldig uur in.');
        return;
      }
      tijd = `${String(h).padStart(2, '0')}:${m[2]}`;
    }

    if (!datum || !Number.isFinite(km) || km < 1) {
      alert('Vul datum en minstens 1 km in.');
      return;
    }
    if (!chauffeurId) {
      alert('Kies een chauffeur.');
      return;
    }

    const { ritten } = getData();
    const vergoeding = vergoedingFromPresetOrKm(null, km, tijd);
    const base = Date.now();
    const rit = {
      id: base,
      datum,
      tijd,
      km,
      voertuigId,
      voertuigName,
      chauffeurId,
      chauffeurName,
      status,
      duurMinuten: RIT_DUUR_MINUTEN,
      volgordeNr: nextVolgordeStart(ritten),
      vergoeding,
      bonnummer: bon,
      bestelArtikelen: bon ? [{ bonnummer: bon, boxen: null }] : [],
    };
    if (status === 'voltooid') {
      rit.voltooidTijd = tijd;
    }
    if (meerRitVertrek) {
      rit.fromName = meerRitVertrek.name;
      rit.fromId = `osm-${base}-v`;
    }
    if (meerRitBestemming) {
      rit.toName = meerRitBestemming.name;
      rit.toId = `osm-${base}-t`;
    }

    ritten.push(rit);
    ritten.sort((a, b) => a.datum.localeCompare(b.datum));
    saveRitten(ritten);

    resetMeerHandmatigeRitForm();

    if (hint) {
      hint.hidden = false;
      setTimeout(() => {
        hint.hidden = true;
      }, 2000);
    }
    onSaved?.();
  });
}
