// =============================================================
// v4.53 « RAPPORT DE CONSOMMATION AUTOMATIQUE AU CHECK-OUT »
// CLIENT ONLY (jspdf) — export PDF du récapitulatif net du séjour :
// consommations minibar, signalements, preuve ménage horodatée,
// départ confirmé. Prêt à joindre à une réclamation de caution.
// =============================================================
import jsPDF from 'jspdf';
import { pdfFooter, pdfHeader, wrapText } from '@/lib/pdf-image';
import type { ReportMinibarLine, ReportSignalement } from '@/lib/checkout-report';

export interface CheckoutReportPdfInput {
  propertyName: string;
  guestName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  minibar: ReportMinibarLine[];
  minibarTotal: number;
  minibarCheckedAt: string | null;
  signalements: ReportSignalement[];
  cleaningValidatedAt: string | null;
  cleaningStaffName: string | null;
  departedAt: string | null;
  restockPending: boolean;
}

function frDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function frTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function generateCheckoutReportPdf(input: CheckoutReportPdfInput): jsPDF {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const marginX = 14;
  const usable = 182;
  const eur = (v: number) =>
    v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  let y = pdfHeader(
    pdf,
    'Récapitulatif de fin de séjour',
    'Rapport de consommation — Check-out',
    `${input.propertyName}${input.guestName ? ` · ${input.guestName}` : ''}`,
  );

  // ── Bloc séjour ──
  const infoRows: [string, string][] = [
    ['Invité', input.guestName || 'Non renseigné'],
    ['Arrivée', frDateTime(input.checkIn)],
    ['Fin de séjour', frDateTime(input.checkOut)],
    ['Départ confirmé (Hub)', input.departedAt ? frDateTime(input.departedAt) : 'Non confirmé'],
    ['Inventaire arrivée validé', input.minibarCheckedAt ? `Oui — ${frDateTime(input.minibarCheckedAt)}` : 'Non'],
  ];
  pdf.setDrawColor(226, 232, 240);
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(marginX, y - 4, usable, infoRows.length * 8 + 6, 2, 2, 'FD');
  for (const [label, value] of infoRows) {
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${label} :`, marginX + 3, y + 2);
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.text(wrapText(pdf, value, usable - 72), marginX + 56, y + 2);
    y += 8;
  }
  y += 8;

  // ── Consommations minibar ──
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Consommations Minibar', marginX, y);
  y += 6;
  if (input.minibar.length === 0) {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text('Aucune consommation déclarée sur ce séjour.', marginX, y);
    y += 7;
  } else {
    pdf.setDrawColor(226, 232, 240);
    pdf.line(marginX, y - 1, marginX + usable, y - 1);
    for (const line of input.minibar) {
      if (y > 250) {
        pdf.addPage();
        y = 20;
      }
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(51, 65, 85);
      pdf.text(`${line.emoji} ${line.name}`, marginX, y);
      pdf.text(`× ${line.qty}`, marginX + 108, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(15, 23, 42);
      pdf.text(
        line.free ? 'Offert 🎁' : eur(line.total),
        marginX + usable,
        y,
        { align: 'right' },
      );
      pdf.setDrawColor(241, 245, 249);
      pdf.line(marginX, y + 2, marginX + usable, y + 2);
      y += 7;
    }
    if (y > 245) {
      pdf.addPage();
      y = 20;
    }
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(5, 150, 105);
    pdf.text(
      `Total à régler : ${eur(input.minibarTotal)}`,
      marginX + usable,
      y + 2,
      { align: 'right' },
    );
    y += 12;
  }

  // ── Signalements ──
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Signalements du séjour', marginX, y);
  y += 6;
  if (input.signalements.length === 0) {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(5, 150, 105);
    pdf.text('Aucun. Aucun incident signalé par l’invité pendant le séjour.', marginX, y);
    y += 7;
  } else {
    for (const s of input.signalements) {
      if (y > 248) {
        pdf.addPage();
        y = 20;
      }
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(15, 23, 42);
      pdf.text(
        `${s.isUrgent ? '🚨' : '•'} ${s.label}${s.status === 'RESOLVED' ? ' (résolu)' : ' (ouvert)'}`,
        marginX,
        y,
      );
      y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(71, 85, 105);
      for (const line of wrapText(pdf, s.description || '—', usable - 4)) {
        if (y > 258) {
          pdf.addPage();
          y = 20;
        }
        pdf.text(line, marginX + 4, y);
        y += 4.6;
      }
      y += 2;
    }
  }
  y += 4;

  // ── Preuve ménage ──
  pdf.setFillColor(236, 253, 245);
  pdf.setDrawColor(167, 243, 208);
  pdf.roundedRect(marginX, y, usable, 16, 2, 2, 'FD');
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(6, 78, 59);
  pdf.text('Preuve Ménage (rotation suivante)', marginX + 4, y + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text(
    input.cleaningValidatedAt
      ? `Validée à ${frTime(input.cleaningValidatedAt)} le ${new Date(input.cleaningValidatedAt).toLocaleDateString('fr-FR')}${input.cleaningStaffName ? ` — ${input.cleaningStaffName}` : ''}`
      : 'En attente de validation par l’équipe de ménage.',
    marginX + 4,
    y + 12,
  );
  y += 22;

  if (input.restockPending) {
    pdf.setFontSize(9.5);
    pdf.setTextColor(180, 83, 9);
    pdf.text('🧊 Une demande « Recharger le frigo » reste à traiter pour ce séjour.', marginX, y);
    y += 6;
  }

  pdfFooter(
    pdf,
    'Rapport de consommation généré automatiquement à l’expiration du compte à rebours — RoomScan',
  );
  return pdf;
}

export async function downloadCheckoutReportPdf(input: CheckoutReportPdfInput): Promise<void> {
  const pdf = generateCheckoutReportPdf(input);
  const d = input.checkOut ? new Date(input.checkOut) : new Date();
  const stamp = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  pdf.save(`rapport-checkout-${stamp}.pdf`);
}
