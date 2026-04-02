/**
 * Formulieren – ritten, brandstof, overige kosten
 */

import { RIT_DUUR_MINUTEN } from './config.js';
import { vergoedingVoorRit, toDateStr, rendabiliteitRit } from './calculations.js';
import { formatEuro, formatLiter } from './format.js';
import { getData, saveRitten, saveBrandstof, saveOverig, getVoertuigen, getZiekenhuizen } from './storage.js';
import { nextVolgordeStart } from './ritVolgorde.js';
import { parseReceiptText } from './ocr.js';

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
    return pdfFileToCanvas(file);
  }
  return null;
}


/** Zet alle datumvelden in de app op vandaag (bijv. bij laden). */
export function setAlleDatumsVandaag() {
  const today = toDateStr(new Date());
  ['rit-datum', 'brandstof-datum', 'overig-datum'].forEach((id) => {
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
  const artikelLijst = document.getElementById('rit-artikelen-lijst');
  const artikelAddBtn = document.getElementById('rit-artikel-add');

  function artikelRowTemplate(bonnummer = '', boxen = '', withRemove = true) {
    const bonIdAttr = withRemove ? '' : ' id="rit-bonnummer"';
    const removeBtn = withRemove
      ? '<button type="button" class="rit-artikel-remove" title="Verwijder artikel" aria-label="Verwijder artikel">×</button>'
      : '';
    return `<div class="rit-artikel-row">
      <input type="text" class="rit-artikel-bon" placeholder="Bestelnummer (verplicht)" value="${bonnummer}"${bonIdAttr} required />
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
      };
    });
  }

  artikelAddBtn?.addEventListener('click', () => {
    if (!artikelLijst) return;
    artikelLijst.insertAdjacentHTML('beforeend', artikelRowTemplate('', '', true));
    bindArtikelEvents();
  });
  bindArtikelEvents();

  function updatePreview() {
    const km = parseFloat(kmInput?.value) || 0;
    const now = new Date();
    const tijd = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (preview) preview.textContent = formatEuro(vergoedingVoorRit(km, tijd));
    if (previewKm) previewKm.textContent = km ? `${Math.round(km)} km` : '0 km';

    const rend = rendabiliteitRit(km, tijd);
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
  updatePreview();

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
    const now = new Date();
    const tijd = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const vergoeding = vergoedingVoorRit(km, tijd);
    const voertuigSel = document.getElementById('rit-voertuig');
    const voertuigId = voertuigSel?.value || '';
    const voertuigName = voertuigSel?.selectedOptions?.[0]?.textContent || '';
    const bestemmingSel = document.getElementById('rit-bestemming');
    const vertrekSel = document.getElementById('rit-vertrek');
    const fromId = vertrekSel?.value?.trim() || '';
    const toId = bestemmingSel?.value?.trim() || '';
    const ziekenhuizen = getZiekenhuizen();
    const from = fromId ? ziekenhuizen.find((h) => h.id === fromId) : null;
    const to = toId ? ziekenhuizen.find((h) => h.id === toId) : null;
    const { ritten } = getData();
    const rit = {
      id: Date.now(),
      volgordeNr: nextVolgordeStart(ritten),
      datum,
      tijd,
      km,
      vergoeding,
      voertuigId,
      voertuigName,
      chauffeurId,
      chauffeurName,
      bonnummer,
      bestelArtikelen,
      status: 'komend',
      duurMinuten: RIT_DUUR_MINUTEN,
    };
    if (from && to) {
      rit.fromId = from.id;
      rit.toId = to.id;
      rit.fromName = from.name;
      rit.toName = to.name;
    }
    ritten.push(rit);
    ritten.sort((a, b) => a.datum.localeCompare(b.datum));
    saveRitten(ritten);
    form.reset();
    datumInput.value = toDateStr(new Date());
    updatePreview();
    const destClear = document.getElementById('rit-selected-destination');
    if (destClear) {
      destClear.textContent = '';
      destClear.hidden = true;
    }
    if (vertrekSel) vertrekSel.value = '';
    if (bestemmingSel) bestemmingSel.value = '';
    if (artikelLijst) {
      artikelLijst.innerHTML = artikelRowTemplate('', '', false);
      bindArtikelEvents();
    }
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
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('nld', 1);
        const { data } = await worker.recognize(source);
        await worker.terminate();

        const parsed = parseReceiptText(data?.text || '');
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
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('nld', 1);
        const { data } = await worker.recognize(source);
        await worker.terminate();

        const parsed = parseReceiptText(data?.text || '');
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
