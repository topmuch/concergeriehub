// =============================================================
// v4.53 — HELPERS PDF (côté client, jspdf)
// Utilitaires partagés par les 3 exports PDF du dashboard hôte :
//   • fiche assurance / inventaire (casse invité) ;
//   • rapport visuel horodaté du ménage (état des lieux) ;
//   • rapport de consommation au check-out.
// Les photos de la plateforme sont des dataURL (PNG/JPEG/WebP) ;
// jsPDF n'accepte que PNG/JPEG → conversion WebP via canvas.
// =============================================================
import jsPDF from 'jspdf';

export type PdfImageFormat = 'PNG' | 'JPEG';

/** Détecte le format d'un dataURL tel que stocké (png/jpeg/webp). */
export function detectImageFormat(dataUrl: string): PdfImageFormat | null {
  const m = /^data:image\/(png|jpe?g|webp);/i.exec(dataUrl);
  if (!m) return null;
  const type = m[1].toLowerCase();
  if (type === 'png') return 'PNG';
  if (type === 'webp') return 'JPEG'; // converti plus bas avant addImage
  return 'JPEG';
}

/**
 * Normalise un dataURL pour jsPDF : WebP → JPEG via canvas (les
 * navigateurs modernes décodent le WebP nativement). Renvoie null si
 * l'image est illisible (on saute la photo plutôt que d'échouer).
 */
export async function toPdfReadyImage(
  dataUrl: string,
): Promise<{ dataUrl: string; format: PdfImageFormat } | null> {
  const format = detectImageFormat(dataUrl);
  if (!format) return null;
  if (format === 'PNG') return { dataUrl, format };
  if (/^data:image\/webp;/i.test(dataUrl)) {
    try {
      const img = await loadImage(dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      const jpeg = canvas.toDataURL('image/jpeg', 0.92);
      return { dataUrl: jpeg, format: 'JPEG' };
    } catch {
      return null;
    }
  }
  return { dataUrl, format: 'JPEG' };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = src;
  });
}

/** Coupe un texte long en lignes qui tiennent dans la largeur utile. */
export function wrapText(
  pdf: jsPDF,
  text: string,
  maxWidthMm: number,
): string[] {
  return pdf.splitTextToSize(text, maxWidthMm) as string[];
}

/** Pied de page commun aux rapports horodatés. */
export function pdfFooter(pdf: jsPDF, label: string): void {
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(148, 163, 184);
    pdf.text(
      `${label} — généré le ${new Date().toLocaleString('fr-FR')}`,
      105,
      291,
      { align: 'center' },
    );
    pdf.text(`${i}/${pages}`, 198, 291, { align: 'right' });
  }
}

/** Bandeau d'en-tête émeraude commun (carte blanche A4). */
export function pdfHeader(
  pdf: jsPDF,
  eyebrow: string,
  title: string,
  subtitle?: string,
): number {
  // Bandeau accent
  pdf.setFillColor(5, 150, 105); // #055492 — accent plateforme
  pdf.rect(0, 0, 210, 26, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text(eyebrow.toUpperCase(), 14, 10);
  pdf.setFontSize(16);
  pdf.text(title, 14, 19);
  let y = 34;
  if (subtitle) {
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    const lines = wrapText(pdf, subtitle, 182);
    pdf.text(lines, 14, y);
    y += lines.length * 5 + 2;
  }
  return y;
}
