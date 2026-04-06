/**
 * Bon check-up: foto's van leveringsbonnen (OCR) vergelijken met ritten op een dag;
 * ontbrekende ritten voorstellen op basis van herkende bon/tijden/km.
 */

import { RIT_DUUR_MINUTEN } from './config.js';
import { vergoedingFromPresetOrKm, toDateStr } from './calculations.js';
import { getData, saveRitten } from './storage.js';
import { nextVolgordeStart } from './ritVolgorde.js';
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

/** Alle bonnummers van een rit (genormaliseerde sleutels + weergavetekst) */
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

function ritHeeftRelevanteBon(r) {
  return bonnenUitRit(r).length > 0;
}

function ritIsOnderwegOfAfgerond(r) {
  return r?.status === 'voltooid' || r?.status === 'lopend';
}

function readChauffeurVoertuig() {
  const chauffeurSel = document.getElementById('meer-rit-chauffeur');
  const voertuigSel = document.getElementById('meer-rit-voertuig');
  const chauffeurId = chauffeurSel?.value?.trim() || '';
  const voertuigId = voertuigSel?.value?.trim() || '';
  const chauffeurName = chauffeurSel?.selectedOptions?.[0]?.textContent?.trim() || '';
  const voertuigName = voertuigSel?.selectedOptions?.[0]?.textContent?.trim() || '';
  return { chauffeurId, voertuigId, chauffeurName, voertuigName };
}

function addRitFromCheckup({
  bonDisplay,
  datum,
  vertrekTijd,
  aankomstTijd,
  km,
  chauffeurId,
  voertuigId,
  chauffeurName,
  voertuigName,
}) {
  const { ritten } = getData();
  const tijd = vertrekTijd || aankomstTijd || '12:00';
  const vTijd = vertrekTijd || tijd;
  const eTijd = aankomstTijd || vTijd;
  const kmNum = Number.isFinite(km) && km >= 1 ? Math.round(km) : 1;
  const vergoeding = vergoedingFromPresetOrKm(null, kmNum, vTijd);
  const base = Date.now();
  const rit = {
    id: base,
    datum,
    tijd: vTijd,
    km: kmNum,
    voertuigId,
    voertuigName,
    chauffeurId,
    chauffeurName,
    status: 'voltooid',
    duurMinuten: RIT_DUUR_MINUTEN,
    voltooidTijd: eTijd,
    volgordeNr: nextVolgordeStart(ritten),
    vergoeding,
    bonnummer: bonDisplay,
    bestelArtikelen: [{ bonnummer: bonDisplay, boxen: null }],
  };
  ritten.push(rit);
  ritten.sort((a, b) => a.datum.localeCompare(b.datum));
  saveRitten(ritten);
}

/**
 * @param {() => void} [onSaved]
 */
export function initBonCheckup(onSaved) {
  const runBtn = document.getElementById('bon-checkup-run');
  const datumEl = document.getElementById('bon-checkup-datum');
  const fileEl = document.getElementById('bon-checkup-files');
  const statusEl = document.getElementById('bon-checkup-status');
  const resultsEl = document.getElementById('bon-checkup-results');

  if (!runBtn || runBtn.dataset.inited) return;
  runBtn.dataset.inited = '1';

  if (datumEl && !datumEl.value) datumEl.value = toDateStr(new Date());

  runBtn.addEventListener('click', async () => {
    const datum = datumEl?.value?.trim();
    const files = fileEl?.files;
    if (!datum) {
      alert('Kies een datum.');
      return;
    }
    if (!files?.length) {
      alert('Kies minstens één foto (of PDF) van een bon.');
      return;
    }

    if (statusEl) statusEl.textContent = 'Bezig met lezen van de bonnen…';
    if (resultsEl) resultsEl.innerHTML = '';

    /** @type {Map<string, { display: string, parsed: ReturnType<typeof parseBonSlipText> }>} */
    const uitFotos = new Map();
    /** @type {Array<{ name: string, parsed: ReturnType<typeof parseBonSlipText> }>} */
    const fileLog = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (statusEl) statusEl.textContent = `OCR ${i + 1} / ${files.length}: ${f.name}…`;
        const src = await fileToOcrSource(f);
        if (!src) continue;
        const text = await runReceiptOcr(src);
        const parsed = parseBonSlipText(text);
        fileLog.push({ name: f.name, parsed });
        for (const b of parsed.bonnummers) {
          const k = normalizeBonKey(b);
          if (!k) continue;
          if (!uitFotos.has(k)) uitFotos.set(k, { display: b, parsed });
        }
      }
    } catch (e) {
      console.error(e);
      if (statusEl) statusEl.textContent = 'OCR mislukt. Probeer scherpere foto’s of kleinere PDF.';
      alert('Kon de bon niet goed lezen. Probeer opnieuw met beter licht of een andere foto.');
      return;
    }

    const { ritten } = getData();
    const dagRitten = ritten.filter((r) => r.datum === datum);

    const appBons = new Set();
    for (const r of dagRitten) {
      for (const { key } of bonnenUitRit(r)) {
        if (key) appBons.add(key);
      }
    }

    const opFotoNietInApp = [];
    for (const [key, v] of uitFotos) {
      if (!appBons.has(key)) opFotoNietInApp.push({ key, ...v });
    }

    const inAppGeenFoto = [];
    for (const r of dagRitten) {
      if (!ritIsOnderwegOfAfgerond(r) || !ritHeeftRelevanteBon(r)) continue;
      for (const { key, display } of bonnenUitRit(r)) {
        if (!key) continue;
        if (!uitFotos.has(key)) inAppGeenFoto.push({ rit: r, bon: display, key });
      }
    }

    if (statusEl) {
      const nFoto = uitFotos.size;
      const nHerken = fileLog.reduce((a, x) => a + x.parsed.bonnummers.length, 0);
      statusEl.textContent =
        nFoto > 0
          ? `${nFoto} uniek(e) bonnummer(s) op foto’s. ${opFotoNietInApp.length} ontbreken in de app.`
          : nHerken === 0
            ? 'Geen bestelnummer herkend — controleer de foto’s of vul handmatig in bij Rit handmatig.'
            : 'Geen match met unieke nummers — tekst wel gelezen; bonformaat kan afwijken.';
    }

    if (!resultsEl) return;

    const parts = [];

    if (opFotoNietInApp.length > 0) {
      parts.push('<h5 class="bon-checkup-block-title">Op de foto, nog niet in de app</h5>');
      parts.push('<p class="info-text info-text--small">Controleer de gegevens en kies chauffeur/voertuig bij <strong>Rit handmatig toevoegen</strong> hieronder vóór je opslaat.</p>');
      parts.push('<ul class="bon-checkup-list">');
      for (const row of opFotoNietInApp) {
        const p = row.parsed;
        const d = p.datum || datum;
        const vt = p.vertrekTijd || p.tijden[0] || '';
        const at = p.aankomstTijd || p.tijden[p.tijden.length - 1] || vt;
        const km = p.km;
        const payloadEnc = encodeURIComponent(
          JSON.stringify({
            bonDisplay: row.display,
            datum: d,
            vertrekTijd: vt || '12:00',
            aankomstTijd: at || vt || '12:00',
            km: km ?? null,
          })
        );
        parts.push(`<li class="bon-checkup-item">`);
        parts.push(`<div class="bon-checkup-item-head"><strong>Bon</strong> ${escapeHtml(row.display)}</div>`);
        parts.push(
          `<div class="bon-checkup-item-meta">Datum: ${escapeHtml(d)} · Vertrek: ${escapeHtml(vt || '—')} · Aankomst: ${escapeHtml(at || '—')} · km: ${km != null ? escapeHtml(String(km)) : '—'}</div>`
        );
        parts.push(
          `<button type="button" class="btn btn-primary btn-sm bon-checkup-add" data-payload="${payloadEnc}">Rit toevoegen (afgerond)</button>`
        );
        parts.push(`</li>`);
      }
      parts.push('</ul>');
    }

    if (inAppGeenFoto.length > 0) {
      parts.push('<h5 class="bon-checkup-block-title">In de app, niet gevonden op deze foto’s</h5>');
      parts.push('<p class="info-text info-text--small">Misschien vergeten te fotograferen, of OCR heeft het nummer niet gelezen. Controleer je rol.</p>');
      parts.push('<ul class="bon-checkup-list bon-checkup-list--warn">');
      for (const { bon, rit } of inAppGeenFoto) {
        const st = rit.status === 'voltooid' ? 'Afgerond' : 'Onderweg';
        parts.push(
          `<li class="bon-checkup-item"><span class="bon-checkup-warn-mark" aria-hidden="true">!</span> Bon <strong>${escapeHtml(bon)}</strong> — ${escapeHtml(st)}, ${escapeHtml(rit.tijd || '')}, ${escapeHtml(String(rit.km || ''))} km</li>`
        );
      }
      parts.push('</ul>');
    }

    if (opFotoNietInApp.length === 0 && inAppGeenFoto.length === 0 && uitFotos.size > 0) {
      parts.push('<p class="info-text">Alle herkende bonnen van vandaag staan al in je ritten. Goed zo.</p>');
    }

    if (fileLog.length && uitFotos.size === 0) {
      parts.push('<details class="bon-checkup-details"><summary>Tekstfragment (debug)</summary>');
      for (const fl of fileLog.slice(0, 3)) {
        parts.push(`<p class="info-text info-text--small"><strong>${escapeHtml(fl.name)}</strong></p>`);
        parts.push(`<pre class="bon-checkup-pre">${escapeHtml(fl.parsed.rawSnippet.slice(0, 600))}</pre>`);
      }
      parts.push('</details>');
    }

    resultsEl.innerHTML = parts.join('');

    resultsEl.querySelectorAll('.bon-checkup-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.getAttribute('data-payload');
        if (!raw) return;
        let data;
        try {
          data = JSON.parse(decodeURIComponent(raw));
        } catch {
          return;
        }
        const { chauffeurId, voertuigId, chauffeurName, voertuigName } = readChauffeurVoertuig();
        if (!chauffeurId) {
          alert('Kies eerst een chauffeur bij «Rit handmatig toevoegen».');
          return;
        }
        if (!voertuigId) {
          alert('Kies eerst een voertuig bij «Rit handmatig toevoegen».');
          return;
        }
        const kmLine =
          data.km != null && Number.isFinite(Number(data.km))
            ? `${Number(data.km)} km`
            : '1 km (standaard — pas later aan indien nodig)';
        if (
          !confirm(
            `Rit toevoegen als afgerond?\n\nBon: ${data.bonDisplay}\nDatum: ${data.datum}\n${data.vertrekTijd} → ${data.aankomstTijd}\n${kmLine}`
          )
        ) {
          return;
        }
        addRitFromCheckup({
          bonDisplay: data.bonDisplay,
          datum: data.datum,
          vertrekTijd: data.vertrekTijd,
          aankomstTijd: data.aankomstTijd,
          km: data.km != null ? Number(data.km) : 1,
          chauffeurId,
          voertuigId,
          chauffeurName,
          voertuigName,
        });
        btn.disabled = true;
        btn.textContent = 'Toegevoegd';
        onSaved?.();
      });
    });
  });
}
