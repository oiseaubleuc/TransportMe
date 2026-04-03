/**
 * Bestelbon barcode scannen via camera (ZXing).
 * Camera met fallbacks voor iOS/Android; optioneel foto uit galerij als live scan faalt.
 */

function normalizeScannedBon(text) {
  if (typeof text !== 'string') return '';
  let s = text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!s) return '';
  s = s.split(/\r?\n/)[0].trim();
  if (s.startsWith('*') && s.endsWith('*') && s.length > 2) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/\s+/g, '');
  if (/^[A-Za-z0-9]+$/.test(s)) return s;
  const runs = s.match(/[A-Za-z0-9]+/g);
  if (!runs?.length) return s;
  runs.sort((a, b) => b.length - a.length);
  return runs[0].length >= 3 ? runs[0] : s;
}

/**
 * Camera mag alleen op “veilige” origins. iOS/Android “app op beginscherm” (standalone)
 * gebruikt soms dezelfde https-URL maar wijkt af bij isSecureContext — daarom expliciet https meenemen.
 */
function secureScanContext() {
  if (typeof window === 'undefined') return false;
  const h = location.hostname;
  if (window.isSecureContext === true) return true;
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return true;
  if (location.protocol === 'https:') return true;
  return false;
}

function isStandaloneWebApp() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
    if (window.navigator?.standalone === true) return true;
    if (window.matchMedia?.('(display-mode: fullscreen)')?.matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function isLikelyIOS() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** In standalone op iOS helpt capture=environment om rechtstreeks de (achter)camera te openen. */
function configureFotoInputForStandalone(input) {
  if (!input) return;
  if (isStandaloneWebApp() && isLikelyIOS()) {
    input.setAttribute('capture', 'environment');
  }
}

/** Probeer achtercamera eerst; daarna minder strikte constraints (nodig op veel iPhones). */
async function getVideoStreamWithFallback(statusEl) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Geen camera-API in deze browser.');
  }
  const attempts = [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
    { video: { facingMode: { ideal: 'environment' } } },
    { video: { facingMode: 'environment' } },
    { video: { facingMode: { ideal: 'user' } } },
    { video: true },
  ];
  let lastErr;
  for (const constraints of attempts) {
    try {
      if (statusEl) statusEl.textContent = 'Camera starten…';
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Camera niet beschikbaar');
}

function buildBonScanHints() {
  return import('@zxing/library').then(({ DecodeHintType }) => {
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    // Geen POSSIBLE_FORMATS: alle symbologieën toe laten (Code 128/39/…); beperkte lijst gaf op sommige toestellen geen decode.
    return hints;
  });
}

async function decodeBarcodeFromImageFile(file, reader) {
  const url = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(url);
    return normalizeScannedBon(result?.getText?.() || '');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Opent een modaal met cameravoorbeeld. Resolve met gelezen tekst, of null bij annuleren/fout zonder code.
 * @param {{ title?: string }} [options]
 * @returns {Promise<string | null>}
 */
export function scanBonBarcode(options = {}) {
  const title =
    typeof options.title === 'string' && options.title.trim() ? options.title.trim() : 'Bon scannen';

  return new Promise((resolve) => {
    let settled = false;
    let scannerControls = null;
    let readerRef = null;

    const overlay = document.createElement('div');
    overlay.className = 'bon-scan-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'bon-scan-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'bon-scan-title');

    const h2 = document.createElement('h2');
    h2.id = 'bon-scan-title';
    h2.className = 'bon-scan-title';
    h2.textContent = title;

    const hint = document.createElement('p');
    hint.className = 'bon-scan-hint';
    hint.textContent = isStandaloneWebApp()
      ? 'App op je beginscherm: kies bij de eerste keer «Toestaan» voor de camera. Werkt het niet, tik op «Foto van code» en fotografeer de streepjescode scherp.'
      : 'Richt de camera op de streepjescode. Bij problemen: gebruik «Foto van code» of beter licht.';

    const video = document.createElement('video');
    video.className = 'bon-scan-video';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.muted = true;
    video.setAttribute('autoplay', '');

    const status = document.createElement('p');
    status.className = 'bon-scan-status';
    status.setAttribute('aria-live', 'polite');

    const actions = document.createElement('div');
    actions.className = 'bon-scan-actions';

    const fotoInput = document.createElement('input');
    fotoInput.type = 'file';
    fotoInput.accept = 'image/*';
    fotoInput.className = 'bon-scan-file-input';
    fotoInput.setAttribute('aria-hidden', 'true');

    const fotoBtn = document.createElement('button');
    fotoBtn.type = 'button';
    fotoBtn.className = 'btn btn-outline';
    fotoBtn.textContent = 'Foto van code';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-outline';
    cancelBtn.textContent = 'Annuleren';

    actions.appendChild(fotoBtn);
    actions.appendChild(cancelBtn);
    dialog.appendChild(h2);
    dialog.appendChild(hint);
    dialog.appendChild(video);
    dialog.appendChild(status);
    dialog.appendChild(actions);
    dialog.appendChild(fotoInput);
    configureFotoInputForStandalone(fotoInput);
    overlay.appendChild(dialog);
    document.documentElement.classList.add('bon-scan-open');
    document.body.classList.add('bon-scan-open');
    document.body.appendChild(overlay);

    function stopScanner() {
      try {
        scannerControls?.stop();
      } catch {
        /* ignore */
      }
      scannerControls = null;
    }

    function finish(value) {
      if (settled) return;
      settled = true;
      stopScanner();
      overlay.remove();
      document.documentElement.classList.remove('bon-scan-open');
      document.body.classList.remove('bon-scan-open');
      document.removeEventListener('keydown', onKeyDown);
      resolve(value);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') finish(null);
    }

    cancelBtn.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null);
    });
    document.addEventListener('keydown', onKeyDown);

    fotoBtn.addEventListener('click', () => fotoInput.click());

    fotoInput.addEventListener('change', async () => {
      const file = fotoInput.files?.[0];
      fotoInput.value = '';
      if (!file || settled) return;
      if (!readerRef) {
        status.textContent = 'Even wachten tot de scanner geladen is…';
        return;
      }
      stopScanner();
      status.textContent = 'Foto wordt geanalyseerd…';
      status.classList.remove('bon-scan-status--error');
      try {
        const text = await decodeBarcodeFromImageFile(file, readerRef);
        if (text) {
          finish(text);
          return;
        }
        status.textContent =
          'Geen streepjescode op deze foto. Probeer scherper, recht van voren, met licht op de code.';
        status.classList.add('bon-scan-status--error');
        await startLiveScan();
      } catch (err) {
        console.warn('Bon foto-decode', err);
        status.textContent = 'Foto niet te lezen. Probeer opnieuw of gebruik de camera.';
        status.classList.add('bon-scan-status--error');
        await startLiveScan();
      }
    });

    async function startLiveScan() {
      if (settled) return;
      if (!secureScanContext()) {
        status.textContent =
          'Camera werkt alleen via HTTPS (of op localhost). Als je een snelkoppeling op je beginscherm gebruikt, moet die naar dezelfde https-site verwijzen.';
        status.classList.add('bon-scan-status--error');
        return;
      }

      try {
        const [{ BrowserMultiFormatReader }, hints] = await Promise.all([
          import('@zxing/browser'),
          buildBonScanHints(),
        ]);
        if (settled) return;

        readerRef = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 80,
          delayBetweenScanSuccess: 250,
          tryPlayVideoTimeout: 12000,
        });

        const stream = await getVideoStreamWithFallback(status);
        if (settled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        status.textContent = 'Camera actief — houd de code stil in beeld.';
        status.classList.remove('bon-scan-status--error');

        const controls = await readerRef.decodeFromStream(stream, video, (result) => {
          if (settled) return;
          if (!result) return;
          const normalized = normalizeScannedBon(result.getText?.() || '');
          if (normalized) finish(normalized);
        });
        scannerControls = controls;
      } catch (err) {
        console.warn('Bon scan start mislukt', err);
        if (settled) return;
        const name = err?.name || '';
        const msg =
          name === 'NotAllowedError' || name === 'PermissionDeniedError'
            ? isStandaloneWebApp() && isLikelyIOS()
              ? 'Cameratoegang geweigerd. iPhone: Instellingen → Privacy en beveiliging → Camera → Safari (of je browser) aan. Of gebruik «Foto van code».'
              : 'Cameratoegang geweigerd. Controleer de site-instellingen van je browser of app.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'Geen geschikte camera gevonden. Probeer «Foto van code».'
              : 'Camera starten mislukt. Probeer «Foto van code», of open de pagina één keer in Safari met dezelfde URL.';
        status.textContent = msg;
        status.classList.add('bon-scan-status--error');
      }
    }

    startLiveScan();
  });
}
