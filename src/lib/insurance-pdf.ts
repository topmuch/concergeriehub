// =============================================================
// v4.53 « GÉNÉRATEUR DE FICHE D'ASSURANCE / INVENTAIRE EN 1 CLIC »
// CLIENT ONLY (jspdf) — lorsqu'un client déclare un objet cassé
// (photo SOS), le tableau de bord calcule l'estimation des dégâts et
// génère directement un rapport PDF pré-rempli pour les réclamations
// de caution (Airbnb / assurance habitation).
// =============================================================
import jsPDF from 'jspdf';
import { pdfFooter, pdfHeader, toPdfReadyImage, wrapText } from '@/lib/pdf-image';

export interface InsurancePdfInput {
  propertyName: string;
  propertyAddress?: string | null;
  guestName?: string | null;
  /** Date/heure du signalement (ISO ou label déjà formaté). */
  reportedAtLabel: string;
  categoryLabel: string;
  description: string;
  photos: string[];
  /** Champs éditables par l'hôte dans la modal. */
  damagedItems: string;
  damageEstimate: number;
  hostComment: string;
  /** Résolution du signalement (ouvert/résolu) pour la traçabilité. */
  statusLabel: string;
}

export async function generateInsurancePdf(input: InsurancePdfInput): Promise<jsPDF> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const marginX = 14;
  const usable = 182;

  let y = pdfHeader(
    pdf,
    'Fiche assurance / dépôt de garantie',
    "Rapport d'incident — objet endommagé",
    `${input.propertyName}${input.propertyAddress ? ` · ${input.propertyAddress}` : ''}`,
  );

  // ── Bloc infos (2 colonnes étroites) ──
  const infoRows: [string, string][] = [
    ['Logement', input.propertyName],
    ['Invité concerné', input.guestName || 'Non renseigné'],
    ['Type de dégât', input.categoryLabel],
    ['Signalé le', input.reportedAtLabel],
    ['Statut du signalement', input.statusLabel],
    ['Objet(s) endommagé(s)', input.damagedItems || 'Voir description'],
  ];
  pdf.setDrawColor(226, 232, 240);
  pdf.setFillColor(248, 250, 252);
  const boxTop = y;
  const rowH = 8;
  pdf.roundedRect(marginX, y - 4, usable, infoRows.length * rowH + 6, 2, 2, 'FD');
  for (const [label, value] of infoRows) {
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${label} :`, marginX + 3, y + 2);
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.text(wrapText(pdf, value, usable - 62), marginX + 46, y + 2);
    y += rowH;
  }
  y = Math.max(boxTop + infoRows.length * rowH + 6, y) + 6;

  // ── Estimation (mise en avant) ──
  pdf.setFillColor(236, 253, 245); // émeraude très clair
  pdf.setDrawColor(167, 243, 208);
  pdf.roundedRect(marginX, y, usable, 14, 2, 2, 'FD');
  pdf.setTextColor(6, 78, 59);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Estimation des dégâts :', marginX + 4, y + 9);
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  pdf.text(
    `${input.damageEstimate.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`,
    marginX + usable - 4,
    y + 9.5,
    { align: 'right' },
  );
  y += 20;

  // ── Description du signalement ──
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Description du signalement', marginX, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  const descLines = wrapText(pdf, input.description || '—', usable);
  for (const line of descLines) {
    if (y > 250) {
      pdf.addPage();
      y = 20;
    }
    pdf.text(line, marginX, y);
    y += 5;
  }
  y += 3;

  // ── Commentaire hôte / contexte ──
  if (input.hostComment.trim()) {
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text("Commentaire de l'hôte", marginX, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(51, 65, 85);
    for (const line of wrapText(pdf, input.hostComment.trim(), usable)) {
      if (y > 250) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(line, marginX, y);
      y += 5;
    }
    y += 3;
  }

  // ── Photos de la casse (preuves) ──
  if (input.photos.length > 0) {
    if (y > 190) {
      pdf.addPage();
      y = 20;
    }
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Photos jointes au signalement (${input.photos.length})`, marginX, y);
    y += 6;
    const imgW = 86;
    const imgH = 60;
    for (let i = 0; i < input.photos.length; i += 1) {
      const col = i % 2;
      if (col === 0 && i > 0) y += imgH + 8;
      if (y + imgH > 262) {
        pdf.addPage();
        y = 20;
      }
      const x = marginX + col * (imgW + 10);
      try {
        const ready = await toPdfReadyImage(input.photos[i]);
        if (ready) {
          pdf.addImage(ready.dataUrl, ready.format, x, y, imgW, imgH, undefined, 'FAST');
        }
      } catch {
        // photo illisible → on continue (jamais bloquant)
      }
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Preuve ${i + 1} — signalement du ${input.reportedAtLabel}`, x, y + imgH + 4);
    }
    y += imgH + 14;
  }

  // ── Bloc signatures ──
  if (y > 220) {
    pdf.addPage();
    y = 20;
  }
  pdf.setDrawColor(203, 213, 225);
  const sigY = Math.max(y + 6, 232);
  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  pdf.text("Signature de l'hôte :", marginX, sigY);
  pdf.text('Signature du voyageur :', marginX + 100, sigY);
  pdf.setLineWidth(0.3);
  pdf.line(marginX, sigY + 18, marginX + 80, sigY + 18);
  pdf.line(marginX + 100, sigY + 18, marginX + 180, sigY + 18);

  pdfFooter(
    pdf,
    "Fiche incident pré-remplie pour réclamation caution (Airbnb / assurance habitation) — RoomScan",
  );
  return pdf;
}

export async function downloadInsurancePdf(input: InsurancePdfInput): Promise<void> {
  const pdf = await generateInsurancePdf(input);
  const slugName = input.propertyName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  pdf.save(`fiche-assurance-${slugName || 'incident'}.pdf`);
}
