/**
 * Export / import van alle Transporteur-localStorage — zelfde data op telefoon en pc (geen cloud).
 * Inclusief TransportMe-bundels (t_<profiel>) en actief profiel (tp).
 */

const LS_PREFIX = 'transporteur_';

/** Sleutels die in één backup-bestand horen (klassieke app + TransportMe). */
export function isBackupStorageKey(k) {
  if (typeof k !== 'string') return false;
  if (k.startsWith(LS_PREFIX)) return true;
  if (k.startsWith('t_')) return true;
  if (k === 'tp') return true;
  return false;
}

export function collectExportPayload() {
  const keys = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isBackupStorageKey(k)) keys[k] = localStorage.getItem(k);
  }
  return {
    transporteurBackupVersion: 2,
    exportedAt: new Date().toISOString(),
    keys,
  };
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export function exportTransporteurData() {
  const payload = collectExportPayload();
  const d = new Date();
  const fn = `transporteur-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  downloadJson(payload, fn);
}

export function applyImportPayload(payload, { replaceAll = false } = {}) {
  const rawKeys = payload?.keys;
  if (!rawKeys || typeof rawKeys !== 'object') throw new Error('Geen geldige sleutels in bestand');

  if (replaceAll) {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isBackupStorageKey(k)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  }

  let n = 0;
  for (const [k, v] of Object.entries(rawKeys)) {
    if (typeof k !== 'string' || !isBackupStorageKey(k)) continue;
    if (typeof v !== 'string') continue;
    localStorage.setItem(k, v);
    n++;
  }
  if (n === 0) throw new Error('Geen geldige backup-sleutels gevonden');
  return n;
}

export function initDataBackup(onImported) {
  document.getElementById('btn-data-export')?.addEventListener('click', () => {
    exportTransporteurData();
  });

  const fileInp = document.getElementById('data-import-file');
  const trigger = document.getElementById('btn-data-import-trigger');

  trigger?.addEventListener('click', () => fileInp?.click());

  fileInp?.addEventListener('change', async () => {
    const f = fileInp.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const payload = JSON.parse(text);
      const volledig = confirm(
        'Volledige vervanging op dit toestel?\n\n' +
          'OK = eerst alle Transporteur- en TransportMe-data hier wissen, daarna de backup (aanbevolen bij nieuwe telefoon).\n' +
          'Annuleren = alleen de sleutels uit het bestand overschrijven (rest blijft staan).'
      );
      const n = applyImportPayload(payload, { replaceAll: volledig });
      alert(`Import gelukt (${n} onderdelen).`);
      fileInp.value = '';
      onImported?.();
    } catch (e) {
      console.error(e);
      alert('Importeren mislukt. Kies een .json-export van deze app.');
      fileInp.value = '';
    }
  });
}
