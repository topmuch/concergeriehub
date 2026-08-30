import jsPDF from 'jspdf';

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
  const totalCellsPerPage = cols * 7;
  let currentPage = 0;

  qrCodes.forEach((qr, index) => {
    const cellIndex = index % totalCellsPerPage;
    if (cellIndex === 0 && index > 0) {
      pdf.addPage();
      currentPage++;
    }

    const col = cellIndex % cols;
    const row = Math.floor(cellIndex / cols);

    const x = margin + col * (cellWidth + hSpacing) + qrXOffset;
    const y = margin + row * (qrSize + vSpacing);

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
      `QR Domotik - ${new Date().toLocaleDateString('fr-FR')} - ${qrCodes.length} codes`,
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
