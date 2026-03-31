/**
 * Formulieren – ritten, brandstof, overige kosten
 */

import { RIT_DUUR_MINUTEN, DEFAULT_CHAUFFEURS } from './config.js';
import { vergoedingVoorRit, toDateStr, rendabiliteitRit } from './calculations.js';
import { formatEuro, formatLiter } from './format.js';
import { getData, saveRitten, saveBrandstof, saveOverig, getVoertuigen, getZiekenhuizen } from './storage.js';
import { nextVolgordeStart } from './ritVolgorde.js';
import { parseBulkRittenText, bulkRowsToRitten } from './bulkRitten.js';
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
    const bonnummer = document.getElementById('rit-bonnummer')?.value?.trim() || '';
    const chauffeurSel = document.getElementById('rit-chauffeur');
    const chauffeurId = chauffeurSel?.value || '';
    const chauffeurName = chauffeurSel?.selectedOptions?.[0]?.textContent || '';
    if (!datum || !km || km < 1 || !chauffeurId || !bonnummer) return;
    const now = new Date();
    const tijd = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const vergoeding = vergoedingVoorRit(km);
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
    onSubmit?.();
  });
}

function escBulk(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Meerdere ritten plakken (Excel / tekst), als voltooid voor achterstand-invoer */
export function initBulkRittenImport(onSubmit) {
  const btn = document.getElementById('bulk-rit-import-btn');
  const ta = document.getElementById('bulk-rit-raw');
  const feedback = document.getElementById('bulk-rit-feedback');
  if (!btn || !ta || !feedback) return;

  function getDefaults() {
    return {
      chauffeurs: DEFAULT_CHAUFFEURS,
      voertuigen: getVoertuigen(),
      defaultChauffeurId: document.getElementById('bulk-default-chauffeur')?.value?.trim() || '',
      defaultVoertuigId: document.getElementById('bulk-default-voertuig')?.value?.trim() || '',
    };
  }

  btn.addEventListener('click', () => {
    const text = ta.value;
    if (!text.trim()) {
      feedback.hidden = false;
      feedback.className = 'bulk-import-feedback bulk-import-feedback--warn';
      feedback.innerHTML = '<p>Plak eerst één of meer regels.</p>';
      return;
    }

    const { ok, errors } = parseBulkRittenText(text, getDefaults());

    if (ok.length === 0) {
      feedback.hidden = false;
      feedback.className = 'bulk-import-feedback bulk-import-feedback--error';
      const maxErr = 6;
      const errSlice = errors.slice(0, maxErr);
      let errList = errSlice
        .map(
          (e) =>
            `<li>Regel ${e.line}: ${escBulk(e.reason)} <span class="bulk-err-line">${escBulk(e.text)}</span></li>`
        )
        .join('');
      if (errors.length > maxErr) errList += `<li>… +${errors.length - maxErr} andere</li>`;
      feedback.innerHTML = `<p><strong>Geen ritten geïmporteerd.</strong></p><ul class="bulk-error-list bulk-error-list--compact">${errList}</ul>`;
      return;
    }

    const { ritten } = getData();
    const baseId = Date.now();
    const nieuw = bulkRowsToRitten(ok, baseId);
    let v = nextVolgordeStart(ritten);
    nieuw.forEach((r) => {
      r.volgordeNr = v;
      v += 1;
    });
    const merged = [...ritten, ...nieuw];
    merged.sort((a, b) => {
      const c = a.datum.localeCompare(b.datum);
      if (c !== 0) return c;
      return String(a.tijd || '').localeCompare(String(b.tijd || ''));
    });
    saveRitten(merged);

    let msg = `<p><strong>${ok.length} rit${ok.length === 1 ? '' : 'ten'} toegevoegd</strong> als voltooid.</p>`;
    if (errors.length > 0) {
      const maxErr = 6;
      const errSlice = errors.slice(0, maxErr);
      let errList = errSlice.map((e) => `<li>Regel ${e.line}: ${escBulk(e.reason)}</li>`).join('');
      if (errors.length > maxErr) errList += `<li>… +${errors.length - maxErr} andere</li>`;
      msg += `<p class="bulk-warn-title">${errors.length} regel(s) overgeslagen:</p><ul class="bulk-error-list bulk-error-list--compact">${errList}</ul>`;
    }
    feedback.hidden = false;
    feedback.className =
      errors.length > 0 ? 'bulk-import-feedback bulk-import-feedback--warn' : 'bulk-import-feedback bulk-import-feedback--ok';
    feedback.innerHTML = msg;
    if (errors.length === 0) ta.value = '';
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
      if (!file || !file.type.startsWith('image/')) {
        if (file) alert('Kies een afbeelding (jpg, png).');
        return;
      }
      if (resultWrap) resultWrap.hidden = false;
      if (resultText) resultText.textContent = 'Bezig met analyseren…';

      try {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('nld', 1);
        const { data } = await worker.recognize(file);
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
