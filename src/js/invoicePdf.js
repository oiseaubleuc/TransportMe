/**
 * PDF-factuur — layout afgestemd op factuursjabloon (logo, Van/Aan, tabel, QR, voet).
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

function buildEpcSepaPayload(settings, amountEuro, remittance) {
  const iban = String(settings.iban || '')
    .replace(/\s/g, '')
    .toUpperCase();
  const name = String(settings.rekeninghouder || settings.bedrijfsnaam || '').trim().slice(0, 70);
  if (!iban.startsWith('BE') || name.length < 2 || !Number.isFinite(amountEuro) || amountEuro <= 0) return '';
  const amt = 'EUR' + amountEuro.toFixed(2);
  const rem = String(remittance || '').trim().slice(0, 140);
  return ['BCD', '002', '1', 'SCT', '', name, iban, amt, '', '', rem].join('\n');
}

async function paymentQrDataUrl(epcPayload) {
  if (!epcPayload) return '';
  const mod = await import('qrcode');
  const toDataURL = mod.default?.toDataURL || mod.toDataURL;
  return toDataURL(epcPayload, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
}

/**
 * @param {object} opts
 * @param {Record<string, unknown>} opts.factuurSettings — uit getFactuurGegevens()
 * @param {{ factuurCode: string, orderDisplay: string, factuurDatum: Date, vervalDatum: Date }} opts.meta
 * @param {{ titel: string, detail: string, prijsExcl: number, totaal: number }[]} opts.regels
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

  const epc = buildEpcSepaPayload(S, teBetalenTotaal, `Factuur ${meta.factuurCode}`);
  const qrUrl = await paymentQrDataUrl(epc);

  const drawHeaderBlock = (yStart, isContinuation) => {
    let y = yStart;
    const logoSize = 18;
    if (!isContinuation && S.logoDataUrl && String(S.logoDataUrl).startsWith('data:image')) {
      try {
        const fmt = detectImageFormat(S.logoDataUrl);
        doc.addImage(S.logoDataUrl, fmt, M.x, y, logoSize, logoSize, undefined, 'FAST');
      } catch {
        /* logo ongeldig */
      }
    }

    const rightX = 118;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(`FACTUUR ${meta.factuurCode}`, rightX, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Factuurdatum: ${formatDatumNl(meta.factuurDatum)}`, rightX, y + 11);
    doc.text(`Vervaldatum: ${formatDatumNl(meta.vervalDatum)}`, rightX, y + 16);
    doc.text(`Ordernummer: ${meta.orderDisplay}`, rightX, y + 21);
    if (isContinuation) {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text('(vervolgpagina)', rightX, y + 26);
      doc.setTextColor(0);
    }

    y = Math.max(y + logoSize, y + 24) + 6;

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
   * Vaste kolommen (mm) — te smalle tussenruimte zorgde voor overlappende tekst
   * (Prijs / Btw / Aantal stonden visueel op elkaar).
   */
  const TAB = {
    descL: M.x,
    descW: 50,
    prijsR: 90,
    btwL: 95,
    aantalC: 112,
    totaalR: M.x2,
  };

  function drawTableHeader(yy) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Beschrijving', TAB.descL, yy);
    doc.setFontSize(7);
    doc.text('Prijs excl. btw', TAB.prijsR, yy, { align: 'right' });
    doc.text('Btw-tarief', TAB.btwL, yy);
    doc.setFontSize(8);
    doc.text('Aantal', TAB.aantalC, yy, { align: 'center' });
    const totLabel = btwPct > 0 ? 'Totaal incl.' : 'Totaal';
    doc.text(totLabel, TAB.totaalR, yy, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }

  drawTableHeader(y);
  y += 2;
  doc.setLineWidth(0.25);
  doc.line(M.x, y, M.x2, y);
  y += 5;

  const rowMinY = 248;
  const lineH = 4;

  for (const r of regels) {
    const titel = String(r.titel || 'Ziekenhuisvervoer');
    const detail = String(r.detail || '—');
    const prijs = Number(r.prijsExcl ?? r.totaal) || 0;
    const tot = btwPct > 0 ? prijs * (1 + btwPct / 100) : prijs;

    const detailLines = doc.splitTextToSize(detail, TAB.descW);
    const blockH = lineH + detailLines.length * 3.6 + 2;

    if (y + blockH > rowMinY) {
      doc.addPage();
      y = drawHeaderBlock(14, true);
      drawTableHeader(y);
      y += 2;
      doc.line(M.x, y, M.x2, y);
      y += 5;
    }

    const yNums = y + lineH;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(titel, TAB.descL, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(detailLines, TAB.descL, y + lineH);

    doc.setFontSize(8);
    doc.text(formatEuroPdf(prijs), TAB.prijsR, yNums, { align: 'right' });
    doc.text(btwPct > 0 ? `${btwPct} %` : '0 %', TAB.btwL, yNums);
    doc.text('1', TAB.aantalC, yNums, { align: 'center' });
    doc.text(formatEuroPdf(tot), TAB.totaalR, yNums, { align: 'right' });

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
    doc.text(formatEuroPdf(subtotaalExcl), TAB.totaalR, y, { align: 'right' });
    y += 5;
    doc.text(`Btw ${btwPct} %`, M.x, y);
    doc.text(formatEuroPdf(sumBtwBedrag), TAB.totaalR, y, { align: 'right' });
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Te betalen', M.x, y);
    doc.text(formatEuroPdf(teBetalenTotaal), TAB.totaalR, y, { align: 'right' });
    y += 8;
  } else {
    doc.text('Te betalen', 128, y);
    doc.text(formatEuroPdf(subtotaalExcl), TAB.totaalR, y, { align: 'right' });
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

    const isLast = p === totalPages;
    if (isLast && qrUrl) {
      doc.setFontSize(8);
      doc.text('Betaal met je bank-app', M.x, footY - 18);
      try {
        doc.addImage(qrUrl, 'PNG', M.x, footY - 16, 26, 26);
      } catch {
        /* */
      }
    }

    doc.setFontSize(8);
    const cx = 120;
    const em = (S.email || '').trim();
    const tel = (S.telefoon || '').trim();
    if (em) doc.text(em, cx, footY - 14);
    if (tel) doc.text(tel, cx, footY - 9);
    doc.text(`Pagina ${p}/${totalPages}`, cx, footY - 2);
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
