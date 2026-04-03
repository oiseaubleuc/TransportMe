/**
 * Bestelbon barcode scannen via camera (ZXing).
 */

function normalizeScannedBon(text) {
  if (typeof text !== 'string') return '';
  let s = text.trim();
  if (s.startsWith('*') && s.endsWith('*') && s.length > 2) {
    s = s.slice(1, -1).trim();
  }
  return s;
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
    hint.textContent = 'Richt de camera op de streepjescode op de bon.';

    const video = document.createElement('video');
    video.className = 'bon-scan-video';
    video.setAttribute('playsinline', '');
    video.muted = true;

    const status = document.createElement('p');
    status.className = 'bon-scan-status';
    status.setAttribute('aria-live', 'polite');

    const actions = document.createElement('div');
    actions.className = 'bon-scan-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-outline';
    cancelBtn.textContent = 'Annuleren';

    actions.appendChild(cancelBtn);
    dialog.appendChild(h2);
    dialog.appendChild(hint);
    dialog.appendChild(video);
    dialog.appendChild(status);
    dialog.appendChild(actions);
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

    import('@zxing/browser')
      .then(({ BrowserMultiFormatReader }) => {
        if (settled) return null;
        const reader = new BrowserMultiFormatReader();
        return reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (!result || settled) return;
          const normalized = normalizeScannedBon(result.getText?.() || '');
          if (normalized) finish(normalized);
        });
      })
      .then((c) => {
        if (!c) return;
        if (settled) {
          try {
            c.stop();
          } catch {
            /* ignore */
          }
          return;
        }
        scannerControls = c;
      })
      .catch((err) => {
        console.warn('Bon scan start mislukt', err);
        if (settled) return;
        status.textContent =
          'Camera starten mislukt. Controleer toestemming, of gebruik HTTPS (of localhost).';
      });
  });
}
