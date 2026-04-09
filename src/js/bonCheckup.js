/**
 * Dubbelcheck: enkel bestelbonnummers uit foto’s (OCR) vergelijken met bonnummers
 * in de ritten van de gekozen dag. Verder niets.
 */

import { toDateStr } from './calculations.js';
import { getData } from './storage.js';
import { runReceiptOcr } from './receiptOcr.js';
import { parseBonSlipText, normalizeBonKey } from './bonSlipParse.js';

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isPdfFile(file) {
  if (!file) return false;
  const t = String(file.type || '').toLowerCase();
  if (t === 'application/pdf') return true;
  return String(file.name || '').toLowerCase().endsWith('.pdf');
}

async function fileToOcrSource(file) {
  if (file.type?.startsWith('image/')) return file;
  if (isPdfFile(file)) {
    const { pdfFileToCanvas } = await import('./pdfFirstPageToCanvas.js');
    return pdfFileToCanvas(file, 1.5);
  }
  return null;
}

/** Bonnen uit één rit: { key, display }[] */
function bonnenUitRit(r) {
  const out = [];
  const items = Array.isArray(r?.bestelArtikelen) ? r.bestelArtikelen : [];
  for (const x of items) {
    const b = typeof x?.bonnummer === 'string' ? x.bonnummer.trim() : '';
    if (b) out.push({ key: normalizeBonKey(b), display: b });
  }
  const leg = typeof r?.bonnummer === 'string' ? r.bonnummer.trim() : '';
  if (leg && out.length === 0) out.push({ key: normalizeBonKey(leg), display: leg });
  return out;
}

/** Unieke bonnummers uit alle ritten van één dag (elke key één weergavetekst). */
function bonnenUitDagRitten(dagRitten) {
  const map = new Map();
  for (const r of dagRitten) {
    for (const { key, display } of bonnenUitRit(r)) {
      if (key && !map.has(key)) map.set(key, display);
    }
  }
  return map;
}

function fileDedupeKey(f) {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

/**
 * @param {() => void} [_onSaved] — niet gebruikt (geen wijzigingen aan ritten)
 */
export function initBonCheckup(_onSaved) {
  const runBtn = document.getElementById('bon-checkup-run');
  const datumEl = document.getElementById('bon-checkup-datum');
  const fileEl = document.getElementById('bon-checkup-files');
  const addFilesBtn = document.getElementById('bon-checkup-add-files');
  const clearFilesBtn = document.getElementById('bon-checkup-clear-files');
  const queueEl = document.getElementById('bon-checkup-file-queue');
  const queueMetaEl = document.getElementById('bon-checkup-queue-meta');
  const statusEl = document.getElementById('bon-checkup-status');
  const resultsEl = document.getElementById('bon-checkup-results');

  if (!runBtn || runBtn.dataset.inited) return;
  runBtn.dataset.inited = '1';

  /** @type {File[]} */
  const pendingFiles = [];

  function renderFileQueue() {
    if (queueMetaEl) {
      const n = pendingFiles.length;
      queueMetaEl.textContent =
        n === 0 ? '0 bestanden in wachtrij' : `${n} bestand${n === 1 ? '' : 'en'} in wachtrij`;
    }
    if (!queueEl) return;
    queueEl.innerHTML = pendingFiles
      .map(
        (f, i) =>
          `<li class="bon-checkup-file-queue__item"><span class="bon-checkup-file-queue__name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span><button type="button" class="btn btn-outline btn-sm bon-checkup-remove-file" data-idx="${i}" aria-label="Bestand verwijderen uit wachtrij">×</button></li>`
      )
      .join('');
  }

  addFilesBtn?.addEventListener('click', () => fileEl?.click());

  fileEl?.addEventListener('change', () => {
    if (!fileEl?.files?.length) return;
    const seen = new Set(pendingFiles.map(fileDedupeKey));
    for (const f of fileEl.files) {
      const k = fileDedupeKey(f);
      if (seen.has(k)) continue;
      seen.add(k);
      pendingFiles.push(f);
    }
    fileEl.value = '';
    renderFileQueue();
  });

  clearFilesBtn?.addEventListener('click', () => {
    pendingFiles.length = 0;
    renderFileQueue();
  });

  queueEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('.bon-checkup-remove-file');
    if (!btn || btn.dataset.idx == null) return;
    const i = Number(btn.dataset.idx);
    if (!Number.isFinite(i) || i < 0 || i >= pendingFiles.length) return;
    pendingFiles.splice(i, 1);
    renderFileQueue();
  });

  if (datumEl && !datumEl.value) datumEl.value = toDateStr(new Date());
  renderFileQueue();

  runBtn.addEventListener('click', async () => {
    const datum = datumEl?.value?.trim();
    const files = pendingFiles;
    if (!datum) {
      alert('Kies een datum.');
      return;
    }
    if (!files.length) {
      alert('Voeg minstens één foto of PDF toe.');
      return;
    }

    if (statusEl) statusEl.textContent = 'Bonnummer uit foto’s lezen…';
    if (resultsEl) resultsEl.innerHTML = '';

    /** @type {Map<string, string>} key → weergave van OCR */
    const uitFotos = new Map();
    /** @type {Array<{ name: string, parsed: ReturnType<typeof parseBonSlipText> }>} */
    const fileLog = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (statusEl) statusEl.textContent = `Foto ${i + 1} / ${files.length}: ${f.name}…`;
        const src = await fileToOcrSource(f);
        if (!src) continue;
        const text = await runReceiptOcr(src);
        const parsed = parseBonSlipText(text);
        fileLog.push({ name: f.name, parsed });
        for (const b of parsed.bonnummers) {
          const k = normalizeBonKey(b);
          if (!k) continue;
          if (!uitFotos.has(k)) uitFotos.set(k, b);
        }
      }
    } catch (e) {
      console.error(e);
      if (statusEl) statusEl.textContent = 'Lezen mislukt. Probeer scherpere foto’s.';
      alert('Kon de tekst op de bon niet goed lezen.');
      return;
    }

    const dagRitten = getData().ritten.filter((r) => r.datum === datum);
    const uitRitten = bonnenUitDagRitten(dagRitten);

    const keysFoto = new Set(uitFotos.keys());
    const keysRit = new Set(uitRitten.keys());

    /** @type {string[]} */
    const komtOvereen = [];
    for (const k of keysFoto) {
      if (keysRit.has(k)) komtOvereen.push(uitFotos.get(k) || k);
    }
    komtOvereen.sort((a, b) => a.localeCompare(b, 'nl'));

    /** @type {string[]} */
    const alleenFoto = [];
    for (const k of keysFoto) {
      if (!keysRit.has(k)) alleenFoto.push(uitFotos.get(k) || k);
    }
    alleenFoto.sort((a, b) => a.localeCompare(b, 'nl'));

    /** @type {string[]} */
    const alleenRit = [];
    for (const k of keysRit) {
      if (!keysFoto.has(k)) alleenRit.push(uitRitten.get(k) || k);
    }
    alleenRit.sort((a, b) => a.localeCompare(b, 'nl'));

    if (statusEl) {
      const nf = keysFoto.size;
      const nr = keysRit.size;
      const nOk = komtOvereen.length;
      statusEl.textContent =
        nf === 0
          ? nr === 0
            ? 'Geen bonnummer op de foto’s herkend; geen ritten met bon op deze dag.'
            : `Geen bonnummer op de foto’s herkend. In de ritten: ${nr} uniek bonnummer.`
          : `Foto’s: ${nf} uniek bonnummer. Ritten: ${nr} uniek bonnummer. ${nOk} komt overeen.`;
    }

    if (!resultsEl) return;

    const parts = [];
    parts.push('<h5 class="bon-checkup-block-title">Bestelbon vs ritten</h5>');
    parts.push(
      '<p class="info-text info-text--small">Alleen de nummers: wat op je foto’s staat (OCR) tegen wat je die dag in je ritten hebt staan.</p>'
    );

    if (komtOvereen.length > 0) {
      parts.push('<p class="bon-checkup-result-label bon-checkup-result-label--ok">Komt overeen</p>');
      parts.push('<ul class="bon-checkup-simple-list bon-checkup-simple-list--ok">');
      for (const b of komtOvereen) {
        parts.push(`<li>${escapeHtml(b)}</li>`);
      }
      parts.push('</ul>');
    }

    if (alleenFoto.length > 0) {
      parts.push('<p class="bon-checkup-result-label bon-checkup-result-label--warn">Alleen op de foto — niet bij ritten van deze dag</p>');
      parts.push('<ul class="bon-checkup-simple-list bon-checkup-simple-list--warn">');
      for (const b of alleenFoto) {
        parts.push(`<li>${escapeHtml(b)}</li>`);
      }
      parts.push('</ul>');
    }

    if (alleenRit.length > 0) {
      parts.push(
        '<p class="bon-checkup-result-label bon-checkup-result-label--warn">Alleen in de ritten — niet (herkend) op deze foto’s</p>'
      );
      parts.push('<ul class="bon-checkup-simple-list bon-checkup-simple-list--warn">');
      for (const b of alleenRit) {
        parts.push(`<li>${escapeHtml(b)}</li>`);
      }
      parts.push('</ul>');
    }

    if (komtOvereen.length > 0 && alleenFoto.length === 0 && alleenRit.length === 0 && keysFoto.size > 0) {
      parts.push('<p class="info-text bon-checkup-all-ok">Alle herkende bonnummers op de foto’s komen voor in je ritten, en elke bon in de ritten zit op de foto’s. Geen verschil.</p>');
    }

    if (fileLog.length && keysFoto.size === 0) {
      parts.push('<details class="bon-checkup-details"><summary>Geen nummer herkend — ruwe tekst (om te controleren)</summary>');
      for (const fl of fileLog.slice(0, 5)) {
        parts.push(`<p class="info-text info-text--small"><strong>${escapeHtml(fl.name)}</strong></p>`);
        parts.push(`<pre class="bon-checkup-pre">${escapeHtml(fl.parsed.rawSnippet.slice(0, 600))}</pre>`);
      }
      parts.push('</details>');
    }

    if (komtOvereen.length === 0 && alleenFoto.length === 0 && alleenRit.length === 0) {
      parts.push(
        '<p class="info-text info-text--small">Niets om te vergelijken: geen bonnummer herkend op de foto’s én geen ritten met bon op deze datum (of OCR heeft niets gelezen).</p>'
      );
    }

    resultsEl.innerHTML = parts.join('');
  });
}
