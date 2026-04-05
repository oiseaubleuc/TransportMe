/**
 * Meer-tab: factuurgegevens + logo (per profiel).
 */

import { getFactuurGegevens, saveFactuurGegevens } from './storage.js';

const MAX_LOGO_CHARS = 450000;

function $(id) {
  return document.getElementById(id);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Lezen mislukt'));
    r.readAsDataURL(file);
  });
}

export function syncFactuurGegevensFormFromStorage() {
  const S = getFactuurGegevens();
  const prev = $('fg-logo-preview');
  if (prev) {
    if (S.logoDataUrl) {
      prev.src = S.logoDataUrl;
      prev.hidden = false;
    } else {
      prev.removeAttribute('src');
      prev.hidden = true;
    }
  }
  const map = [
    ['fg-bedrijfsnaam', S.bedrijfsnaam],
    ['fg-adres-straat', S.adresStraat],
    ['fg-adres-pc-stad', S.adresPostcodeStad],
    ['fg-land', S.land],
    ['fg-btw', S.btwNummer],
    ['fg-rek-naam', S.rekeninghouder],
    ['fg-iban', S.iban],
    ['fg-email', S.email],
    ['fg-tel', S.telefoon],
    ['fg-klant-bedrijf', S.klantBedrijfsnaam || S.klantNaam],
    ['fg-klant-persoon', S.klantContactpersoon],
    ['fg-klant-btw', S.klantBtw],
    ['fg-klant-adres', S.klantAdres],
    ['fg-klant-land', S.klantLand],
    ['fg-verval-dagen', String(S.vervalDagen ?? 30)],
    ['fg-btw-tekst', S.btwVrijstellingTekst],
    ['fg-factuur-btw-tarief', String(S.factuurBtwTarief ?? 21)],
    ['fg-dagrapport-naar', S.dagrapportOntvanger || ''],
  ];
  for (const [id, val] of map) {
    const el = $(id);
    if (el && 'value' in el) el.value = val ?? '';
  }
  const drAan = $('fg-dagrapport-aan');
  if (drAan) drAan.checked = Boolean(S.dagrapportEmailAan);
  const cb = $('fg-factuur-btw-aanrekenen');
  if (cb) cb.checked = Boolean(S.factuurBtwAanrekenen);
  syncFactuurBtwTariefVisibility();
}

function syncFactuurBtwTariefVisibility() {
  const cb = $('fg-factuur-btw-aanrekenen');
  const wrap = $('fg-factuur-btw-tarief-wrap');
  if (wrap) wrap.hidden = !cb?.checked;
}

function flashSaveHint(el) {
  if (!el) return;
  el.hidden = false;
  setTimeout(() => {
    el.hidden = true;
  }, 2500);
}

function saveKlantFieldsFromForm() {
  const klantBedrijf = $('fg-klant-bedrijf')?.value?.trim() || '';
  saveFactuurGegevens({
    klantBedrijfsnaam: klantBedrijf,
    klantNaam: klantBedrijf,
    klantContactpersoon: $('fg-klant-persoon')?.value?.trim() || '',
    klantBtw: $('fg-klant-btw')?.value?.trim() || '',
    klantAdres: $('fg-klant-adres')?.value?.trim() || '',
    klantLand: $('fg-klant-land')?.value?.trim() || 'België',
  });
}

export function initFactuurGegevensMeer() {
  const fileInp = $('fg-logo-file');
  const btnClear = $('fg-logo-wissen');
  const btnSave = $('fg-factuur-opslaan');
  const btnKlant = $('fg-klant-opslaan');

  $('fg-factuur-btw-aanrekenen')?.addEventListener('change', syncFactuurBtwTariefVisibility);

  fileInp?.addEventListener('change', async () => {
    const f = fileInp.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      alert('Kies een afbeeldingsbestand (PNG, JPG, …).');
      fileInp.value = '';
      return;
    }
    try {
      let dataUrl = await readFileAsDataUrl(f);
      if (dataUrl.length > MAX_LOGO_CHARS) {
        dataUrl = await downscaleDataUrl(dataUrl, 400, 0.82);
      }
      if (dataUrl.length > MAX_LOGO_CHARS) {
        alert('Logo is te groot na verkleinen. Kies een kleiner bestand.');
        fileInp.value = '';
        return;
      }
      saveFactuurGegevens({ logoDataUrl: dataUrl });
      syncFactuurGegevensFormFromStorage();
    } catch (e) {
      console.error(e);
      alert('Logo kon niet worden geladen.');
    }
    fileInp.value = '';
  });

  btnClear?.addEventListener('click', () => {
    saveFactuurGegevens({ logoDataUrl: '' });
    syncFactuurGegevensFormFromStorage();
  });

  btnKlant?.addEventListener('click', () => {
    saveKlantFieldsFromForm();
    syncFactuurGegevensFormFromStorage();
    flashSaveHint($('fg-klant-save-hint'));
  });

  btnSave?.addEventListener('click', () => {
    const verval = Number.parseInt($('fg-verval-dagen')?.value, 10);
    const klantBedrijf = $('fg-klant-bedrijf')?.value?.trim() || '';
    const btwTariefRaw = Number.parseFloat($('fg-factuur-btw-tarief')?.value || '21');
    const btwTarief = Number.isFinite(btwTariefRaw) ? Math.min(100, Math.max(0, btwTariefRaw)) : 21;
    saveFactuurGegevens({
      bedrijfsnaam: $('fg-bedrijfsnaam')?.value?.trim() || '',
      adresStraat: $('fg-adres-straat')?.value?.trim() || '',
      adresPostcodeStad: $('fg-adres-pc-stad')?.value?.trim() || '',
      land: $('fg-land')?.value?.trim() || 'België',
      btwNummer: $('fg-btw')?.value?.trim() || '',
      rekeninghouder: $('fg-rek-naam')?.value?.trim() || '',
      iban: $('fg-iban')?.value?.trim() || '',
      email: $('fg-email')?.value?.trim() || '',
      telefoon: $('fg-tel')?.value?.trim() || '',
      klantBedrijfsnaam: klantBedrijf,
      klantNaam: klantBedrijf,
      klantContactpersoon: $('fg-klant-persoon')?.value?.trim() || '',
      klantBtw: $('fg-klant-btw')?.value?.trim() || '',
      klantAdres: $('fg-klant-adres')?.value?.trim() || '',
      klantLand: $('fg-klant-land')?.value?.trim() || 'België',
      factuurBtwAanrekenen: Boolean($('fg-factuur-btw-aanrekenen')?.checked),
      factuurBtwTarief: btwTarief,
      vervalDagen: Number.isFinite(verval) && verval >= 0 ? verval : 30,
      btwVrijstellingTekst: $('fg-btw-tekst')?.value?.trim() || '',
      dagrapportEmailAan: Boolean($('fg-dagrapport-aan')?.checked),
      dagrapportOntvanger: $('fg-dagrapport-naar')?.value?.trim() || '',
    });
    syncFactuurGegevensFormFromStorage();
    flashSaveHint($('fg-factuur-save-hint'));
  });

  syncFactuurGegevensFormFromStorage();
}

/** Verklein base64-afbeelding voor localStorage-limiet. */
function downscaleDataUrl(dataUrl, maxSide, jpegQuality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', jpegQuality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Afbeelding'));
    img.src = dataUrl;
  });
}
