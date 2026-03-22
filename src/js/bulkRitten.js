/**
 * Meerdere ritten in één keer (plakken uit Excel / tekst).
 * Standaard: ritten worden als voltooid geboekt (achterstand invoeren).
 */

import { vergoedingVoorRit } from './calculations.js';
import { RIT_DUUR_MINUTEN } from './config.js';

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** YYYY-MM-DD of DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY */
export function parseBulkDatum(raw) {
  const s = String(raw ?? '')
    .trim()
    .split(/\s+/)[0];
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    const y = m[3];
    return `${y}-${mo}-${d}`;
  }
  return null;
}

export function parseBulkTijd(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '12:00';
  const t = s.match(TIME_RE) ? s : null;
  if (t) {
    const [h, mi] = s.split(':');
    return `${h.padStart(2, '0')}:${mi}`;
  }
  return '12:00';
}

export function parseBulkKm(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.round(n);
}

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function findChauffeur(name, chauffeurs) {
  const n = norm(name);
  if (!n) return null;
  return (
    chauffeurs.find((c) => norm(c.naam) === n) ||
    chauffeurs.find((c) => norm(c.naam).includes(n) || n.includes(norm(c.naam)))
  );
}

function findVoertuig(name, voertuigen) {
  const n = norm(name);
  if (!n) return { id: '', name: '' };
  const v =
    voertuigen.find((x) => norm(x.naam) === n || norm(x.kenteken || '') === n.replace(/\s/g, '')) ||
    voertuigen.find(
      (x) => norm(x.naam).includes(n) || n.includes(norm(x.naam)) || norm(x.kenteken || '').includes(n.replace(/\s/g, ''))
    );
  return v ? { id: v.id, name: v.kenteken ? `${v.naam} (${v.kenteken})` : v.naam } : null;
}

function splitLine(line) {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  const semi = line.split(';').map((c) => c.trim());
  if (semi.length >= 2) return semi;
  return line.split(',').map((c) => c.trim());
}

const HEADER_ALIASES = {
  datum: ['datum', 'date'],
  tijd: ['tijd', 'uur', 'time'],
  km: ['km', 'kilometer', 'kilometers', 'afstand'],
  chauffeur: ['chauffeur', 'bestuurder', 'driver'],
  voertuig: ['voertuig', 'auto', 'wagen', 'vehicle'],
};

function mapHeaderRow(cells) {
  const lower = cells.map((c) => norm(String(c).replace(/^\ufeff/, '')));
  const idx = {};
  for (const [fieldKey, aliases] of Object.entries(HEADER_ALIASES)) {
    const i = lower.findIndex((c) => aliases.some((a) => c === a));
    if (i >= 0) idx[fieldKey] = i;
  }
  if (idx.datum == null || idx.km == null) return null;
  return idx;
}

function rowFromIndices(cells, map, defaults) {
  const datum = parseBulkDatum(cells[map.datum]);
  const kmRaw = cells[map.km];
  const km = parseBulkKm(kmRaw);
  let tijd = '12:00';
  if (map.tijd != null && cells[map.tijd]) tijd = parseBulkTijd(cells[map.tijd]);
  let chauffeurName = '';
  let chauffeurId = '';
  if (map.chauffeur != null && cells[map.chauffeur]) {
    const ch = findChauffeur(cells[map.chauffeur], defaults.chauffeurs);
    if (ch) {
      chauffeurId = ch.id;
      chauffeurName = ch.naam;
    } else chauffeurName = String(cells[map.chauffeur]).trim();
  }
  if (!chauffeurId && defaults.defaultChauffeurId) {
    const ch = defaults.chauffeurs.find((c) => c.id === defaults.defaultChauffeurId);
    if (ch) {
      chauffeurId = ch.id;
      chauffeurName = ch.naam;
    }
  }
  let voertuigId = '';
  let voertuigName = '';
  if (map.voertuig != null && cells[map.voertuig]) {
    const v = findVoertuig(cells[map.voertuig], defaults.voertuigen);
    if (v && v.id) {
      voertuigId = v.id;
      voertuigName = v.name;
    }
  }
  if (!voertuigId && defaults.defaultVoertuigId) {
    const v = defaults.voertuigen.find((x) => x.id === defaults.defaultVoertuigId);
    if (v) {
      voertuigId = v.id;
      voertuigName = v.kenteken ? `${v.naam} (${v.kenteken})` : v.naam;
    }
  }
  return { datum, km, tijd, chauffeurId, chauffeurName, voertuigId, voertuigName, rawKm: kmRaw };
}

/** Positie zonder header: 2–5 kolommen */
function rowPositional(cells, defaults) {
  const n = cells.length;
  if (n < 2) return null;
  let datum;
  let tijd = '12:00';
  let km;
  let chauffeurCell = '';
  let voertuigCell = '';

  if (n >= 5) {
    datum = parseBulkDatum(cells[0]);
    tijd = parseBulkTijd(cells[1]);
    km = parseBulkKm(cells[2]);
    chauffeurCell = cells[3];
    voertuigCell = cells[4];
  } else if (n === 4) {
    datum = parseBulkDatum(cells[0]);
    if (TIME_RE.test(cells[1].trim())) {
      tijd = parseBulkTijd(cells[1]);
      km = parseBulkKm(cells[2]);
      chauffeurCell = cells[3];
    } else {
      km = parseBulkKm(cells[1]);
      chauffeurCell = cells[2];
      voertuigCell = cells[3];
    }
  } else if (n === 3) {
    datum = parseBulkDatum(cells[0]);
    km = parseBulkKm(cells[1]);
    chauffeurCell = cells[2];
  } else {
    datum = parseBulkDatum(cells[0]);
    km = parseBulkKm(cells[1]);
  }

  let chauffeurId = '';
  let chauffeurName = '';
  if (chauffeurCell) {
    const ch = findChauffeur(chauffeurCell, defaults.chauffeurs);
    if (ch) {
      chauffeurId = ch.id;
      chauffeurName = ch.naam;
    } else chauffeurName = chauffeurCell.trim();
  }
  if (!chauffeurId && defaults.defaultChauffeurId) {
    const ch = defaults.chauffeurs.find((c) => c.id === defaults.defaultChauffeurId);
    if (ch) {
      chauffeurId = ch.id;
      chauffeurName = ch.naam;
    }
  }

  let voertuigId = '';
  let voertuigName = '';
  if (voertuigCell) {
    const v = findVoertuig(voertuigCell, defaults.voertuigen);
    if (v && v.id) {
      voertuigId = v.id;
      voertuigName = v.name;
    }
  }
  if (!voertuigId && defaults.defaultVoertuigId) {
    const v = defaults.voertuigen.find((x) => x.id === defaults.defaultVoertuigId);
    if (v) {
      voertuigId = v.id;
      voertuigName = v.kenteken ? `${v.naam} (${v.kenteken})` : v.naam;
    }
  }

  return { datum, km, tijd, chauffeurId, chauffeurName, voertuigId, voertuigName, rawKm: cells[1] };
}

/**
 * @returns {{ ok: object[], errors: { line: number, text: string, reason: string }[] }}
 */
export function parseBulkRittenText(text, defaults) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  const errors = [];
  const ok = [];
  if (lines.length === 0) {
    return {
      ok: [],
      errors: [{ line: 0, text: '', reason: 'Geen geldige regels (leeg of alleen # commentaar)' }],
    };
  }

  let start = 0;
  let colMap = null;
  const firstCells = splitLine(lines[0]);
  const headerMap = mapHeaderRow(firstCells);
  if (headerMap) {
    colMap = headerMap;
    start = 1;
  }

  let lineNo = 0;
  for (let i = start; i < lines.length; i++) {
    lineNo = i + 1;
    const cells = splitLine(lines[i]);
    if (cells.every((c) => !c)) continue;

    let row;
    if (colMap) {
      row = rowFromIndices(cells, colMap, defaults);
    } else {
      row = rowPositional(cells, defaults);
    }

    if (!row) {
      errors.push({ line: lineNo, text: lines[i], reason: 'Te weinig kolommen' });
      continue;
    }
    if (!row.datum) {
      errors.push({ line: lineNo, text: lines[i], reason: 'Ongeldige datum' });
      continue;
    }
    if (row.km == null) {
      errors.push({ line: lineNo, text: lines[i], reason: 'Ongeldige km (min. 1)' });
      continue;
    }
    if (!row.chauffeurId) {
      errors.push({
        line: lineNo,
        text: lines[i],
        reason: 'Chauffeur niet herkend – kies standaardchauffeur of gebruik exacte naam',
      });
      continue;
    }

    ok.push(row);
  }

  return { ok, errors };
}

export function bulkRowsToRitten(rows, idBase = Date.now()) {
  return rows.map((row, i) => {
    const km = row.km;
    const vergoeding = vergoedingVoorRit(km);
    const tijd = row.tijd || '12:00';
    return {
      id: idBase + i,
      datum: row.datum,
      tijd,
      km,
      vergoeding,
      voertuigId: row.voertuigId || '',
      voertuigName: row.voertuigName || '',
      chauffeurId: row.chauffeurId,
      chauffeurName: row.chauffeurName,
      status: 'voltooid',
      voltooidTijd: tijd,
      duurMinuten: RIT_DUUR_MINUTEN,
      importedVia: 'bulk',
    };
  });
}
