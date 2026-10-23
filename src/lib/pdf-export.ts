import jsPDF from 'jspdf';
import { ROOMSCAN_LOGO_RATIO, ROOMSCAN_LOGO_WHITE_DATAURL } from '@/lib/pdf-brand-assets';

export interface QrCodeForPdf {
  code: string;
  imageUrl: string;
}

export interface PdfExportOptions {
  qrCodes: QrCodeForPdf[];
  format?: 'a4' | 'a5';
  batchSize?: number;
  batchName?: string;
}

export function generatePdf({
  qrCodes,
  format = 'a4',
  batchName,
}: PdfExportOptions): jsPDF {
  const pageWidth = format === 'a4' ? 210 : 148;
  const pageHeight = format === 'a4' ? 297 : 210;
  const margin = format === 'a4' ? 12 : 8;

  const qrSize = format === 'a4' ? 38 : 30;
  const hSpacing = format === 'a4' ? 14 : 10;
  const vSpacing = format === 'a4' ? 18 : 14;
  const cols = format === 'a4' ? 4 : 3;
  const usableWidth = pageWidth - margin * 2;
  const cellWidth = (usableWidth - (cols - 1) * hSpacing) / cols;
  const qrXOffset = (cellWidth - qrSize) / 2;

  const pdf = new jsPDF('p', 'mm', format);
  let currentPage = 0;

  // v5.10 — LOGO OFFICIEL RoomScan en tête de planche : pastille cobalt
  // (bleu logo #055492) + logo blanc — la planche est sur fond blanc.
  const logoH = format === 'a4' ? 7 : 5;
  const logoW = logoH * ROOMSCAN_LOGO_RATIO;
  const chipPad = 2.5;
  const chipH = logoH + chipPad * 2;
  const chipW = logoW + chipPad * 2;
  const chipTop = margin - 3;
  if (ROOMSCAN_LOGO_WHITE_DATAURL) {
    try {
      pdf.setFillColor(5, 84, 146); // #055492 — bleu logo officiel
      pdf.roundedRect(margin, chipTop, chipW, chipH, 2, 2, 'F');
      pdf.addImage(ROOMSCAN_LOGO_WHITE_DATAURL, 'PNG', margin + chipPad, chipTop + chipPad, logoW, logoH);
    } catch {
      // logo absent — planche sans logo, ne plante jamais
    }
  }

  // v5.10 — pagination CORRIGÉE : l'ancien « cols * 7 » codait 7 lignes
  // par page qui débordaient de l'A4 (5ᵉ/6ᵉ lignes coupées) dès ~20
  // codes. Le nombre de lignes est désormais calculé pour tenir dans
  // la page, en réservant la pastille logo sur la 1ʳᵉ page.
  const rowH = qrSize + vSpacing;
  const FOOTER_SAFE = 10; // zone du pied de page (batch / date)
  const firstPageTop = margin + (ROOMSCAN_LOGO_WHITE_DATAURL ? chipH + 2 : 0);
  const firstPageRows = Math.max(1, Math.floor((pageHeight - firstPageTop - FOOTER_SAFE) / rowH));
  const otherRows = Math.max(1, Math.floor((pageHeight - margin * 2 - FOOTER_SAFE) / rowH));

  let cellsBeforePage = 0;
  let pageRows = firstPageRows;
  let capacity = pageRows * cols;

  qrCodes.forEach((qr, index) => {
    if (index >= capacity) {
      pdf.addPage();
      cellsBeforePage += pageRows * cols;
      currentPage += 1;
      pageRows = otherRows;
      capacity += pageRows * cols;
    }

    const cellIndex = index - cellsBeforePage;
    const col = cellIndex % cols;
    const row = Math.floor(cellIndex / cols);

    const x = margin + col * (cellWidth + hSpacing) + qrXOffset;
    const topOffset = currentPage === 0 ? firstPageTop - margin : 0;
    const y = margin + topOffset + row * rowH;

    // Add the QR code image
    pdf.addImage(qr.imageUrl, 'PNG', x, y, qrSize, qrSize);

    // Add the activation code below the QR
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(60, 60, 60);
    const codeY = y + qrSize + 3;
    pdf.text(qr.code, x + qrSize / 2, codeY, { align: 'center' });

    // Add small instruction text
    pdf.setFontSize(5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(140, 140, 140);
    pdf.text('Scannez-moi pour activer', x + qrSize / 2, codeY + 3.5, {
      align: 'center',
    });

    // Dashed border around cell
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.2);
    pdf.rect(
      x - qrXOffset + 2,
      y - 2,
      cellWidth - 4,
      qrSize + vSpacing - 3
    );
  });

  // Add header on first page
  if (batchName) {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 30, 30);
    pdf.text(batchName, pageWidth / 2, margin - 4, { align: 'center' });

    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(150, 150, 150);
    pdf.text(
      `RoomScan - ${new Date().toLocaleDateString('fr-FR')} - ${qrCodes.length} codes`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  return pdf;
}

export async function downloadPdf(options: PdfExportOptions): Promise<void> {
  const pdf = generatePdf(options);
  const fileName = options.batchName
    ? `qr-domotik-${options.batchName.toLowerCase().replace(/\s+/g, '-')}.pdf`
    : 'qr-domotik-batch.pdf';
  pdf.save(fileName);
}
