// =============================================================
// v4.54 « JOURNAL DE SÉJOUR » (amélioration 2.1) — CLIENT ONLY
// Export PDF comptable du séjour : récapitulatif complet pour
// l'organisation / la comptabilité de l'hôte.
//   Section 1 — Détails du séjour (invité, arrivée, départ, nuits)
//   Section 2 — Consommations minibar (lignes + total)
//   Section 3 — Services additionnels (départ tardif, pressing,
//               transferts / expériences payés in-app)
//   Section 4 — Frais de ménage (preuve horodatée de la rotation)
//   Total des extras (TVA incluse) + pied de page horodaté.
// Réutilise les helpers partagés pdf-image.ts (jspdf).
// =============================================================
import jsPDF from 'jspdf';
import { pdfFooter, pdfHeader, wrapText } from '@/lib/pdf-image';

export interface StayJournalPdfInput {
  propertyName: string;
  propertyAddress: string | null;
  guestName: string;
  guestEmail: string | null;
  checkIn: string | null;
  checkOut: string | null;
  lateCheckOutUntil: string | null;
  nights: number;
  guests: number;
  minibar: { lines: { name: string; emoji: string; qty: number; total: number; free: boolean }[]; total: number };
  lateCheckout: { status: string | null; amount: number | null };
  laundry: { label: string; pieces: number; pickupSlotLabel: string; amount: number; status: string }[];
  services: { items: { name: string; qty: number }[]; total: number }[];
  cleaning: { validatedAt: string | null; staffName: string | null };
  totals: { minibar: number; lateCheckout: number; laundry: number; services: number; grandTotal: number };
}

const LAUNDRY_STATUS_FR: Record<string, string> = {
  PENDING_PAYMENT: 'paiement en cours',
  REQUESTED: 'demandée',
  PAID: 'réglée',
  IN_PROGRESS: 'en cours',
  READY: 'prête à livrer',
  DELIVERED: 'livrée',
};

function frDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function frDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Bloc « info clé → valeur » gris clair. */
function infoBlock(pdf: jsPDF, rows: [string, string][], y: number, marginX: number, usable: number): number {
  pdf.setDrawColor(226, 232, 240);
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(marginX, y - 4, usable, rows.length * 8 + 6, 2, 2, 'FD');
  let cy = y;
  for (const [label, value] of rows) {
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${label} :`, marginX + 3, cy + 2);
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.text(wrapText(pdf, value, usable - 72), marginX + 56, cy + 2);
    cy += 8;
  }
  return cy + 8;
}

/** Titre de section. */
function sectionTitle(pdf: jsPDF, text: string, y: number, marginX: number): number {
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text(text, marginX, y);
  return y + 6;
}

/** Ligne facturable « libellé …… montant ». */
function chargeRow(
  pdf: jsPDF,
  label: string,
  amount: string,
  y: number,
  marginX: number,
  usable: number,
): number {
  if (y > 250) {
    pdf.addPage();
    y = 20;
  }
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(51, 65, 85);
  pdf.text(wrapText(pdf, label, usable - 46), marginX, y);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(15, 23, 42);
  pdf.text(amount, marginX + usable, y, { align: 'right' });
  pdf.setDrawColor(241, 245, 249);
  pdf.line(marginX, y + 2, marginX + usable, y + 2);
  return y + 7;
}

export function generateStayJournalPdf(input: StayJournalPdfInput): jsPDF {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const marginX = 14;
  const usable = 182;
  const eur = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  let y = pdfHeader(
    pdf,
    'Document de séjour — comptabilité',
    'Journal de Séjour',
    `${input.propertyName}${input.propertyAddress ? ` — ${input.propertyAddress}` : ''}`,
  );

  // ── Section 1 : détails du séjour ──
  y = sectionTitle(pdf, '1. Détails du séjour', y, marginX);
  y = infoBlock(
    pdf,
    [
      ['Invité', input.guestName + (input.guestEmail ? ` (${input.guestEmail})` : '')],
      ['Arrivée (check-in)', frDate(input.checkIn)],
      ['Départ (check-out)', frDate(input.checkOut)],
      ['Départ tardif validé', input.lateCheckOutUntil ? frDateTime(input.lateCheckOutUntil) : '—'],
      ['Nuits / voyageurs', `${input.nights} nuit(s) · ${input.guests} voyageur(s)`],
    ],
    y,
    marginX,
    usable,
  );

  // ── Section 2 : minibar ──
  y = sectionTitle(pdf, '2. Consommations Minibar', y, marginX);
  if (input.minibar.lines.length === 0) {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text('Aucune consommation sur ce séjour.', marginX, y);
    y += 8;
  } else {
    for (const line of input.minibar.lines) {
      y = chargeRow(pdf, `${line.emoji} ${line.name} × ${line.qty}`, line.free ? 'Offert 🎁' : eur(line.total), y, marginX, usable);
    }
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(5, 150, 105);
    pdf.text(`Sous-total minibar : ${eur(input.minibar.total)}`, marginX + usable, y + 1, { align: 'right' });
    y += 10;
  }

  // ── Section 3 : services additionnels ──
  y = sectionTitle(pdf, '3. Services additionnels', y, marginX);
  let hasServices = false;

  if (input.lateCheckout.amount != null && input.lateCheckout.amount > 0) {
    hasServices = true;
    y = chargeRow(pdf, 'Départ tardif (réglé par carte)', eur(input.lateCheckout.amount), y, marginX, usable);
  }
  for (const order of input.laundry) {
    hasServices = true;
    y = chargeRow(
      pdf,
      `Pressing — ${order.label} · récupération ${order.pickupSlotLabel} (${LAUNDRY_STATUS_FR[order.status] ?? order.status})`,
      order.status === 'PAID' ? eur(order.amount) : `${eur(order.amount)} — à régler`,
      y,
      marginX,
      usable,
    );
  }
  for (const order of input.services) {
    hasServices = true;
    const label = order.items.map((i) => `${i.qty} × ${i.name}`).join(', ');
    y = chargeRow(pdf, `Service conciergerie — ${label}`, eur(order.total), y, marginX, usable);
  }
  if (!hasServices) {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text('Aucun service additionnel sur ce séjour.', marginX, y);
    y += 8;
  }

  // ── Section 4 : ménage ──
  y = sectionTitle(pdf, '4. Ménage', y, marginX);
  y = infoBlock(
    pdf,
    [
      ['Rotation suivante', input.cleaning.validatedAt ? 'Validée' : 'En attente'],
      ['Preuve horodatée', input.cleaning.validatedAt ? frDateTime(input.cleaning.validatedAt) : '—'],
      ['Agent', input.cleaning.staffName || '—'],
    ],
    y,
    marginX,
    usable,
  );

  // ── Total des extras ──
  if (y > 240) {
    pdf.addPage();
    y = 20;
  }
  pdf.setFillColor(236, 253, 245);
  pdf.setDrawColor(167, 243, 208);
  pdf.roundedRect(marginX, y, usable, 18, 2, 2, 'FD');
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(6, 78, 59);
  pdf.text('TOTAL DES EXTRAS (minibar + services)', marginX + 4, y + 7);
  pdf.setFontSize(13);
  pdf.text(eur(input.totals.grandTotal), marginX + usable - 4, y + 12, { align: 'right' });
  y += 24;
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  pdf.text('TVA incluse. Hébergement réglé via la plateforme de réservation (non détaillé ici).', marginX, y);

  pdfFooter(pdf, `Journal de Séjour — ${input.propertyName} — Généré par RoomScan`);
  return pdf;
}

export async function downloadStayJournalPdf(input: StayJournalPdfInput): Promise<void> {
  const pdf = generateStayJournalPdf(input);
  const d = input.checkOut ? new Date(input.checkOut) : new Date();
  const stamp = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  pdf.save(`journal-de-sejour-${stamp}.pdf`);
}
