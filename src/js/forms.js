/**
 * Formulieren – ritten, brandstof, overige kosten
 */

import { vergoedingVoorRit, toDateStr, rendabiliteitRit } from './calculations.js';
import { formatEuro } from './format.js';
import { getData, saveRitten, saveBrandstof, saveOverig } from './storage.js';
import { parseReceiptText } from './ocr.js';

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

  function updatePreview() {
    const km = parseFloat(kmInput?.value) || 0;
    if (preview) preview.textContent = formatEuro(vergoedingVoorRit(km));
    if (previewKm) previewKm.textContent = km ? `${Math.round(km)} km` : '0 km';

    const rend = rendabiliteitRit(km);
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
    if (!datum || !km || km < 1) return;
    const vergoeding = vergoedingVoorRit(km);
    const { ritten } = getData();
    ritten.push({ id: Date.now(), datum, km, vergoeding });
    ritten.sort((a, b) => a.datum.localeCompare(b.datum));
    saveRitten(ritten);
    form.reset();
    datumInput.value = toDateStr(new Date());
    updatePreview();
    const destEl = document.getElementById('rit-selected-destination');
    if (destEl) {
      destEl.textContent = '';
      destEl.hidden = true;
    }
    document.querySelectorAll('.preset-rit-btn--selected').forEach((b) => b.classList.remove('preset-rit-btn--selected'));
    onSubmit?.();
  });
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
    const liter = parseFloat(literInput?.value) || 0;
    const prijs = parseFloat(prijsInput?.value) || 0;
    if (perLiterEl) perLiterEl.textContent = liter ? formatEuro(prijs / liter) : '€ 0';
  }

  literInput?.addEventListener('input', updatePerLiter);
  prijsInput?.addEventListener('input', updatePerLiter);

  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target?.files?.[0];
      if (!file || !file.type.startsWith('image/')) {
        if (file) alert('Kies een afbeelding (jpg, png).');
        return;
      }
      if (resultText) resultText.textContent = 'Bezig met analyseren…';
      if (resultBlock) resultBlock.hidden = false;

      try {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('nld', 1);
        const { data } = await worker.recognize(file);
        await worker.terminate();

        const parsed = parseReceiptText(data?.text || '');
        const today = toDateStr(new Date());

        if (parsed.datum) datumInput.value = parsed.datum;
        else datumInput.value = today;
        if (parsed.liter != null) literInput.value = String(parsed.liter);
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
    const liter = parseFloat(literInput?.value);
    const prijs = parseFloat(prijsInput?.value);
    if (!datum || !Number.isFinite(liter) || liter <= 0 || !Number.isFinite(prijs) || prijs < 0) return;
    const { brandstof } = getData();
    brandstof.push({ id: Date.now(), datum, liter, prijs });
    brandstof.sort((a, b) => a.datum.localeCompare(b.datum));
    saveBrandstof(brandstof);
    form.reset();
    datumInput.value = toDateStr(new Date());
    if (resultBlock) resultBlock.hidden = true;
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
