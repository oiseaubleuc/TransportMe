/**
 * Weekrapport: conceptmail (mailto) met alle ritten van één kalenderweek (ma–zo, zelfde als elders in de app).
 * Automatisch: maandag 00:00–00:12 voor de zojuist afgelopen week (gisteren = zondag).
 * Geen server — verstuurt pas via het mailprogramma van de gebruiker.
 */

import { PROFILES } from './config.js';
import { toDateStr, vergoedingVoorRit, getWeekKey, getWeekLabel } from './calculations.js';
import { formatEuro, formatDatumKort } from './format.js';
import { getCurrentProfileId, getData, getFactuurGegevens } from './storage.js';

const MAILTO_MAX_BODY = 4500;

function sentKey(profileId) {
  return `transporteur_weekrapport_sent_${profileId}`;
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateStr(d);
}

/** Alle ritten waarvan rit.datum in dezelfde ISO-week valt als weekKey. */
export function buildWeekRapportBody(weekKey, labelDatumStr) {
  const { ritten } = getData();
  const pid = getCurrentProfileId();
  const profielNaam = PROFILES.find((p) => p.id === pid)?.name || pid;
  const list = ritten
    .filter((r) => getWeekKey(r.datum) === weekKey)
    .slice()
    .sort((a, b) => `${a.datum}${a.tijd || ''}`.localeCompare(`${b.datum}${b.tijd || ''}`));

  const weekLabel =
    labelDatumStr && labelDatumStr.length >= 10 ? getWeekLabel(labelDatumStr) : weekKey;

  let sumKm = 0;
  let sumVerg = 0;

  const lines = [];
  lines.push('Transporteur — weekrapport');
  lines.push(`Profiel: ${profielNaam}`);
  lines.push(`Week: ${weekKey}`);
  lines.push(`Periode: ${weekLabel}`);
  lines.push(`Aantal ritten: ${list.length}`);
  lines.push('');

  if (list.length === 0) {
    lines.push('Geen ritten in deze week.');
  } else {
    list.forEach((r, i) => {
      const verg = r.vergoeding ?? vergoedingVoorRit(r.km || 0, r.tijd);
      sumKm += Number(r.km) || 0;
      sumVerg += verg;
      const bon = Array.isArray(r.bestelArtikelen)
        ? r.bestelArtikelen.map((x) => x.bonnummer).filter(Boolean).join(', ')
        : r.bonnummer || '—';
      const route = r.fromName && r.toName ? `${r.fromName} → ${r.toName}` : '—';
      lines.push(`--- Rit ${i + 1} ---`);
      lines.push(`Volgnr: ${r.volgordeNr != null ? `#${r.volgordeNr}` : '—'}`);
      lines.push(`Wanneer: ${formatDatumKort(r.datum, r.tijd)}`);
      lines.push(`Status: ${r.status || '—'}`);
      lines.push(`Km: ${r.km ?? '—'}`);
      lines.push(`Vergoeding: ${formatEuro(verg)}`);
      lines.push(`Bon(nen): ${bon}`);
      lines.push(`Chauffeur: ${r.chauffeurName || '—'}`);
      lines.push(`Voertuig: ${r.voertuigName || '—'}`);
      lines.push(`Route: ${route}`);
      lines.push('');
    });
    lines.push('--- Totalen week ---');
    lines.push(`Km: ${sumKm}`);
    lines.push(`Vergoeding som: ${formatEuro(Math.round(sumVerg * 100) / 100)}`);
  }

  let text = lines.join('\n');
  if (text.length > MAILTO_MAX_BODY) {
    text = `${text.slice(0, MAILTO_MAX_BODY - 55)}\n… (ingekort — zie Meer → Tabellen → Ritten)`;
  }
  return text;
}

export function openWeekrapportMailto(weekKey, labelDatumStr, opts = {}) {
  const cfg = getFactuurGegevens();
  const to = String(opts.to || cfg.dagrapportOntvanger || cfg.email || '').trim();
  if (!to.includes('@')) {
    alert('Vul een ontvanger in (Meer → Factuur: e-mail of dagrapport-ontvanger) en sla factuurgegevens op.');
    return;
  }
  const body = buildWeekRapportBody(weekKey, labelDatumStr);
  const subject = `Transporteur weekrapport ${weekKey}`;
  window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function tickWeekrapportMiddernacht() {
  const cfg = getFactuurGegevens();
  if (!cfg.dagrapportEmailAan) return;
  const to = (cfg.dagrapportOntvanger || cfg.email || '').trim();
  if (!to.includes('@')) return;

  const now = new Date();
  if (now.getHours() !== 0 || now.getMinutes() > 12) return;
  /** Alleen maandag: gisteren = zondag = week net afgelopen. */
  if (now.getDay() !== 1) return;

  const y = yesterdayISO();
  const weekKey = getWeekKey(y);
  if (!weekKey) return;

  const pid = getCurrentProfileId();
  const key = sentKey(pid);
  if (localStorage.getItem(key) === weekKey) return;

  localStorage.setItem(key, weekKey);
  openWeekrapportMailto(weekKey, y);
}

function domToForWeekrapport() {
  return (
    document.getElementById('fg-dagrapport-naar')?.value?.trim() ||
    document.getElementById('fg-email')?.value?.trim() ||
    ''
  );
}

function weekKeyFromDateInputField() {
  const raw = document.getElementById('fg-weekrapport-datum')?.value?.trim() || '';
  const iso = raw.length >= 10 ? raw.slice(0, 10) : '';
  if (!iso) return { weekKey: null, labelDatum: null };
  const weekKey = getWeekKey(iso);
  return { weekKey: weekKey || null, labelDatum: iso };
}

export function initDagrapport() {
  const datumInp = document.getElementById('fg-weekrapport-datum');
  if (datumInp && !datumInp.value) {
    datumInp.value = yesterdayISO();
  }

  setInterval(() => tickWeekrapportMiddernacht(), 60 * 1000);
  tickWeekrapportMiddernacht();

  document.getElementById('fg-weekrapport-mail-selected')?.addEventListener('click', () => {
    const { weekKey, labelDatum } = weekKeyFromDateInputField();
    if (!weekKey || !labelDatum) {
      alert('Kies een datum (een dag in de week die je wilt mailen).');
      return;
    }
    const to = domToForWeekrapport();
    openWeekrapportMailto(weekKey, labelDatum, to ? { to } : {});
  });

  document.getElementById('fg-dagrapport-test')?.addEventListener('click', () => {
    const to = domToForWeekrapport();
    const y = yesterdayISO();
    const weekKey = getWeekKey(y);
    if (!weekKey) {
      alert('Kon week niet bepalen.');
      return;
    }
    if (datumInp) datumInp.value = y;
    openWeekrapportMailto(weekKey, y, to ? { to } : {});
  });
}
