// =============================================================
// v4.69 — PHASE 5 « COMMISSION & FACTURATION MENSUELLE »
// CLIENT ONLY (jspdf) — export PDF d'une facture de commission
// RoomScan (utilisée par le CRM superadmin ET l'espace hôte).
// =============================================================
import jsPDF from 'jspdf';
import { pdfFooter, pdfHeader, wrapText } from '@/lib/pdf-image';

export interface CommissionInvoicePdfInput {
  monthLabel: string; // ex « Octobre 2026 »
  hostName: string;   // nom ou email de l'hôte
  hostEmail: string;
  totalOrdersAmount: number;
  commissionRate: number;
  commissionOwed: number;
  ordersCount: number;
  // v4.81 (AUDIT QA) — détail par catégorie (Json breakdown de la facture).
  breakdown?: { minibar?: number; services?: number; laundry?: number } | null;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  issuedBy: string;   // « RoomScan » ou nom du bien émetteur
}

function eur(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} €`;
}

function frDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function statusLabelFr(status: string): string {
  if (status === 'paid') return 'Payée';
  if (status === 'overdue') return 'En retard';
  return 'En attente de paiement';
}

/** Télécharge la facture de commission au format PDF. */
export function downloadCommissionInvoicePdf(input: CommissionInvoicePdfInput): void {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = pdfHeader(
    pdf,
    input.issuedBy,
    `Facture de commission — ${input.monthLabel}`,
    `Commission RoomScan sur les commandes encaissées par l'hôte via son Hub.`,
  );

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Hôte facturé', 14, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  const hostLines = wrapText(pdf, `${input.hostName} — ${input.hostEmail}`, 182);
  pdf.text(hostLines, 14, y + 6);
  y += 6 + hostLines.length * 5 + 6;

  // Tableau récapitulatif
  const b = input.breakdown ?? {};
  const rows: Array<[string, string]> = [
    ['Commandes encaissées', `${input.ordersCount} commande(s)`],
    ['Minibar', eur(b.minibar ?? 0)],
    ['Services (room service, expériences…)', eur(b.services ?? 0)],
    ['Pressing / blanchisserie', eur(b.laundry ?? 0)],
    ['Montant total encaissé', eur(input.totalOrdersAmount)],
    ['Taux de commission', `${(input.commissionRate * 100).toFixed(0)} %`],
    ['COMMISSION DUE À ROOMSCAN', eur(input.commissionOwed)],
    ['Statut', statusLabelFr(input.status)],
    ['Échéance', frDate(input.dueDate)],
    ...(input.paidAt ? ([['Payée le', frDate(input.paidAt)]] as Array<[string, string]>) : []),
  ];

  for (const [label, value] of rows) {
    const highlight = label.startsWith('COMMISSION');
    pdf.setFillColor(highlight ? 232 : 248, highlight ? 244 : 250, highlight ? 218 : 252);
    pdf.rect(14, y - 5, 182, 9, 'F');
    pdf.setTextColor(highlight ? 120 : 51, highlight ? 53 : 65, highlight ? 14 : 85);
    pdf.setFont('helvetica', highlight ? 'bold' : 'normal');
    pdf.setFontSize(10);
    pdf.text(label, 17, y);
    pdf.setFont('helvetica', 'bold');
    pdf.text(value, 193, y, { align: 'right' });
    y += 9;
    if (y > 260) {
      pdf.addPage();
      y = 30;
    }
  }

  y += 8;
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const note = wrapText(
    pdf,
    'Cette facture couvre la commission RoomScan sur les commandes (minibar, room service, pressing) encaissées par vos invités via le Hub pendant le mois indiqué. Paiement par virement — contactez facturation@roomscan.pro.',
    182,
  );
  pdf.text(note, 14, y);

  pdfFooter(pdf, 'RoomScan — Facture de commission');
  const safeMonth = input.monthLabel.toLowerCase().replace(/\s+/g, '-');
  const safeHost = (input.hostEmail || input.hostName).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  pdf.save(`facture-commission-${safeHost}-${safeMonth}.pdf`);
}
