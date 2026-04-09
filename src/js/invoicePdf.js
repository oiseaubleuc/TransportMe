/**
 * PDF-factuur — layout afgestemd op factuursjabloon (logo, Van/Aan, tabel, voet).
 * Gegevens komen uit Meer → Factuur & logo (localStorage per profiel).
 */

/** Lazy load: jsPDF alleen bij download. */
async function loadJsPDF() {
  const { jsPDF } = await import('jspdf');
  return jsPDF;
}

function formatEuroPdf(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '€ 0,00';
  return (
    '€ ' +
    v.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function formatDatumNl(d) {
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function addDays(d, days) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

function detectImageFormat(dataUrl) {
  if (typeof dataUrl !== 'string') return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}

/**
 * @param {object} opts
 * @param {Record<string, unknown>} opts.factuurSettings — uit getFactuurGegevens()
 * @param {{ factuurCode: string, orderDisplay: string, factuurDatum: Date, vervalDatum: Date }} opts.meta
 * @param {{
 *   titel?: string,
 *   detail?: string,
 *   prijsExcl: number,
 *   totaal: number,
 *   datumWeergave?: string,
 *   orderBon?: string,
 *   ophaal?: string,
 *   aflevering?: string,
 *   km?: string,
 * }[]} opts.regels
 */
export async function generateFactuurPdfBlob(opts) {
  const jsPDF = await loadJsPDF();
  const { factuurSettings: S, meta, regels } = opts;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  const M = { x: 15, x2: pageW - 15, w: pageW - 30 };

  const btwAanrekenen = Boolean(S.factuurBtwAanrekenen);
  const btwPctRaw = Number(S.factuurBtwTarief);
  const btwPct = btwAanrekenen && Number.isFinite(btwPctRaw) ? Math.min(100, Math.max(0, btwPctRaw)) : 0;

  let subtotaalExcl = 0;
  for (const r of regels) subtotaalExcl += Number(r.totaal) || 0;
  const sumBtwBedrag = subtotaalExcl * (btwPct / 100);
  const teBetalenTotaal = subtotaalExcl + sumBtwBedrag;

  const drawHeaderBlock = (yStart, isContinuation) => {
    /** Pagina 2+: geen factuurgegevens, geen Van/Aan — alleen tabel (kop staat op pagina 1). */
    if (isContinuation) {
      return yStart + 10;
    }

    const logoSize = 18;
    const logoGap = 4;
    const hasLogo = S.logoDataUrl && String(S.logoDataUrl).startsWith('data:image');

    if (hasLogo) {
      try {
        const fmt = detectImageFormat(S.logoDataUrl);
        doc.addImage(S.logoDataUrl, fmt, M.x, yStart, logoSize, logoSize, undefined, 'FAST');
      } catch {
        /* logo ongeldig */
      }
    }

    const rightX = 118;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(`FACTUUR ${meta.factuurCode}`, rightX, yStart + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Factuurdatum: ${formatDatumNl(meta.factuurDatum)}`, rightX, yStart + 11);
    doc.text(`Vervaldatum: ${formatDatumNl(meta.vervalDatum)}`, rightX, yStart + 16);
    doc.text(`Ordernummer: ${meta.orderDisplay}`, rightX, yStart + 21);

    /** Links: logo (indien aanwezig) staat boven het blok “Van” / bedrijfsnaam. */
    let y = hasLogo
      ? yStart + logoSize + logoGap
      : Math.max(yStart + logoSize, yStart + 24) + 6;

    const colW = (M.w - 10) / 2;
    const mid = M.x + colW + 5;

    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text('Van', M.x, y);
    doc.text('Aan', mid, y);
    doc.setTextColor(0);
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const vanNaam = (S.bedrijfsnaam || '—').trim() || '—';
    const aanNaam = (S.klantBedrijfsnaam || S.klantNaam || '—').trim() || '—';
    doc.text(vanNaam, M.x, y);
    doc.text(aanNaam, mid, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const vanLines = [
      (S.adresStraat || '').trim(),
      (S.adresPostcodeStad || '').trim(),
      (S.land || '').trim(),
      S.btwNummer ? `Btw: ${S.btwNummer}` : '',
      S.rekeninghouder ? `Rekeninghouder: ${S.rekeninghouder}` : '',
      S.iban ? `IBAN: ${S.iban}` : '',
    ].filter(Boolean);

    const aanContact = (S.klantContactpersoon || '').trim();
    const aanLines = [
      aanContact ? `t.a.v. ${aanContact}` : '',
      (S.klantAdres || '').trim(),
      (S.klantLand || '').trim(),
      (S.klantBtw || '').trim() ? `BTW-nummer klant: ${String(S.klantBtw).trim()}` : '',
    ]
      .map((x) => String(x || '').trim())
      .filter(Boolean);

    const vanSplit = vanLines.flatMap((line) => doc.splitTextToSize(line, colW - 2));
    const aanSplit = aanLines.length ? aanLines.flatMap((line) => doc.splitTextToSize(line, colW - 2)) : ['—'];

    let vy = y;
    let ay = y;
    const lineH = 4.2;
    const n = Math.max(vanSplit.length, aanSplit.length);
    for (let i = 0; i < n; i++) {
      if (vanSplit[i]) doc.text(vanSplit[i], M.x, vy);
      if (aanSplit[i]) doc.text(aanSplit[i], mid, ay);
      vy += lineH;
      ay += lineH;
    }
    y = Math.max(vy, ay) + 6;

    doc.setLineWidth(0.35);
    doc.line(M.x, y, M.x2, y);
    y += 5;
    return y;
  };

  let y = drawHeaderBlock(14, false);

  /**
   * Factuurtabel: datum, ordernr., ophaal, aflevering, km, prijzen (mm vanaf M.x).
   * Totaal nuttige breedte ≈ 180 mm (A4 met marge).
   */
  const COL = {
    datumL: M.x,
    datumW: 17,
    orderL: M.x + 17,
    orderW: 20,
    vanL: M.x + 37,
    vanW: 40,
    naarL: M.x + 77,
    naarW: 40,
    kmL: M.x + 117,
    kmW: 9,
    prijsR: M.x + 125,
    prijsW: 17,
    btwL: M.x + 143,
    btwW: 10,
    aantalC: M.x + 153.5,
    aantalW: 7,
    totaalR: M.x2,
  };

  function drawTableHeader(yy) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('Datum', COL.datumL, yy);
    doc.text('Ordernr.', COL.orderL, yy);
    doc.text('Ophaalpunt', COL.vanL, yy);
    doc.text('Aflevering', COL.naarL, yy);
    doc.text('Km', COL.kmL + COL.kmW, yy, { align: 'right' });
    doc.text('Prijs excl.', COL.prijsR + COL.prijsW, yy, { align: 'right' });
    doc.text('Btw', COL.btwL, yy);
    doc.text('Aantal', COL.aantalC + COL.aantalW / 2, yy, { align: 'center' });
    const totLabel = btwPct > 0 ? 'Totaal incl.' : 'Totaal';
    doc.text(totLabel, COL.totaalR, yy, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }

  drawTableHeader(y);
  y += 2;
  doc.setLineWidth(0.25);
  doc.line(M.x, y, M.x2, y);
  y += 5;

  const rowMinY = 248;
  const lineGap = 3.35;

  for (const r of regels) {
    const prijs = Number(r.prijsExcl ?? r.totaal) || 0;
    const tot = btwPct > 0 ? prijs * (1 + btwPct / 100) : prijs;

    const hasKolommen =
      r.datumWeergave != null || r.orderBon != null || r.ophaal != null || r.aflevering != null;

    let blockH;
    /** @type {string[]} */
    let datumLines = [];
    /** @type {string[]} */
    let orderLines = [];
    /** @type {string[]} */
    let vanLines = [];
    /** @type {string[]} */
    let naarLines = [];
    /** @type {string[]} */
    let legacyLines = [];

    if (hasKolommen) {
      datumLines = doc.splitTextToSize(String(r.datumWeergave || '—'), COL.datumW - 1);
      orderLines = doc.splitTextToSize(String(r.orderBon || '—'), COL.orderW - 1);
      vanLines = doc.splitTextToSize(String(r.ophaal || '—'), COL.vanW - 1);
      naarLines = doc.splitTextToSize(String(r.aflevering || '—'), COL.naarW - 1);
      const nText = Math.max(datumLines.length, orderLines.length, vanLines.length, naarLines.length, 1);
      blockH = 2 + nText * lineGap + 2;
    } else {
      const titel = String(r.titel || 'Dienstverlening: ziekenhuisvervoer');
      const detail = String(r.detail || '—');
      const legacyW = COL.naarL + COL.naarW - COL.datumL - 1;
      legacyLines = doc.splitTextToSize(`${titel}\n${detail}`, legacyW);
      blockH = 2 + Math.max(legacyLines.length, 1) * lineGap + 2;
    }

    if (y + blockH > rowMinY) {
      doc.addPage();
      y = drawHeaderBlock(14, true);
      drawTableHeader(y);
      y += 2;
      doc.line(M.x, y, M.x2, y);
      y += 5;
    }

    const y0 = y + 3;
    const yNums = y0 + (blockH - 6) / 2 + 1;

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');

    if (hasKolommen) {
      doc.text(datumLines, COL.datumL, y0);
      doc.text(orderLines, COL.orderL, y0);
      doc.text(vanLines, COL.vanL, y0);
      doc.text(naarLines, COL.naarL, y0);
      doc.text(String(r.km != null ? r.km : '—'), COL.kmL + COL.kmW, yNums, { align: 'right' });
    } else {
      doc.text(legacyLines, COL.datumL, y0);
    }

    doc.text(formatEuroPdf(prijs), COL.prijsR + COL.prijsW, yNums, { align: 'right' });
    doc.text(btwPct > 0 ? `${btwPct} %` : '0 %', COL.btwL, yNums);
    doc.text('1', COL.aantalC + COL.aantalW / 2, yNums, { align: 'center' });
    doc.text(formatEuroPdf(tot), COL.totaalR, yNums, { align: 'right' });

    y += blockH;
  }

  doc.line(M.x, y, M.x2, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  if (btwPct > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Subtotaal excl. btw', M.x, y);
    doc.text(formatEuroPdf(subtotaalExcl), M.x2, y, { align: 'right' });
    y += 5;
    doc.text(`Btw ${btwPct} %`, M.x, y);
    doc.text(formatEuroPdf(sumBtwBedrag), M.x2, y, { align: 'right' });
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Te betalen', M.x, y);
    doc.text(formatEuroPdf(teBetalenTotaal), M.x2, y, { align: 'right' });
    y += 8;
  } else {
    doc.text('Te betalen', 128, y);
    doc.text(formatEuroPdf(subtotaalExcl), M.x2, y, { align: 'right' });
    y += 8;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const btwNote = !btwAanrekenen ? (S.btwVrijstellingTekst || '').trim() : '';
  if (btwNote) {
    const noteLines = doc.splitTextToSize(btwNote, M.w);
    doc.text(noteLines, M.x, y);
    y += noteLines.length * 3.8 + 4;
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footY = 275;
    doc.setLineWidth(0.35);
    doc.line(M.x, footY - 22, M.x2, footY - 22);

    doc.setFontSize(8);
    const cx = 120;
    doc.text(`Pagina ${p}/${totalPages}`, cx, footY - 8);
  }

  return { blob: doc.output('blob'), invoiceNr: meta.factuurCode };
}

export function triggerPdfDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
