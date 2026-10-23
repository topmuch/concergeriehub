// =============================================================
// v4.81 (AUDIT QA-3) — FACTURE DE COMMISSION : PDF SERVER-SIDE
// (pdfkit) — génération à la demande depuis un jeton public.
//
// /api/public/commission-invoice/[token]/pdf résout la facture par
// pdfToken (48 hex, unguessable — même pattern que les états des
// lieux) et appelle renderCommissionInvoicePdf().
//
// Contenu : en-tête de marque, hôte facturé, récapitulatif (commandes,
// montants encaissés PAR CATÉGORIE minibar / services / pressing),
// commission due, statut, échéance, mention légale.
// Style sobre légal : Helvetica, A4 — AUCUN émoji (fontes standard).
// =============================================================

type PdfDoc = typeof import('pdfkit');
import { loadRoomscanLogoBlue } from '@/lib/pdf-brand-file';

const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = 595.28 - MARGIN * 2; // 495.28
const BRAND = '#055492';
const INK = '#111827';
const MUTED = '#6B7280';
const LINE = '#D6D3D1';

export interface CommissionInvoicePdfData {
  monthLabel: string; // « Octobre 2026 »
  hostName: string;
  hostEmail: string;
  totalOrdersAmount: number;
  commissionRate: number;
  commissionOwed: number;
  ordersCount: number;
  breakdown: { minibar: number; services: number; laundry: number };
  status: string;
  dueDate: Date | null;
  paidAt: Date | null;
  invoiceId: string;
  publicUrl: string;
}

const eur = (n: number): string => `${n.toFixed(2).replace('.', ',')} €`;
const frDate = (d: Date | null): string =>
  d
    ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

function statusLabelFr(status: string): string {
  if (status === 'paid') return 'Payée';
  if (status === 'overdue') return 'En retard';
  return 'En attente de paiement';
}

/** Génère le PDF de facture de commission (Buffer, jamais throw côté caller). */
export async function renderCommissionInvoicePdf(data: CommissionInvoicePdfData): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: { Title: `Facture de commission — ${data.monthLabel}` },
  });
  // v5.10 — LOGO OFFICIEL (bleu, fond blanc) en en-tête de facture
  const logoBlue = await loadRoomscanLogoBlue();
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // ── En-tête de marque ──
  doc.rect(MARGIN, MARGIN, CONTENT_W, 4).fill(BRAND);
  // v5.10 — logo officiel calé à droite, au-dessus du titre
  if (logoBlue) {
    try {
      doc.image(logoBlue, MARGIN + CONTENT_W - 69, MARGIN - 2, { height: 26 });
    } catch {
      // logo illisible — facture sans logo
    }
  }
  doc.moveDown(0.6);
  doc
    .font('Helvetica-Bold')
    .fontSize(17)
    .fillColor(INK)
    .text(`Facture de commission — ${data.monthLabel}`, MARGIN, doc.y, { width: CONTENT_W });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      'Commission RoomScan sur les commandes encaissées par vos invités via le Hub.',
      MARGIN,
      doc.y + 2,
      { width: CONTENT_W },
    );
  doc.moveDown(1);

  // ── Bloc hôte ──
  const boxTop = doc.y;
  doc.roundedRect(MARGIN, boxTop, CONTENT_W, 46, 6).fillAndStroke('#F8FAFC', LINE);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Hôte facturé', MARGIN + 12, boxTop + 10);
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor('#334155')
    .text(`${data.hostName} — ${data.hostEmail}`, MARGIN + 12, boxTop + 26, { width: CONTENT_W - 24 });
  doc.y = boxTop + 46 + 16;

  // ── Récapitulatif ──
  const rows: Array<{ label: string; value: string; highlight?: boolean }> = [
    { label: 'Commandes encaissées', value: `${data.ordersCount} commande(s)` },
    { label: 'Minibar', value: eur(data.breakdown.minibar) },
    { label: 'Services (room service, expériences…)', value: eur(data.breakdown.services) },
    { label: 'Pressing / blanchisserie', value: eur(data.breakdown.laundry) },
    { label: 'MONTANT TOTAL ENCAISSÉ', value: eur(data.totalOrdersAmount) },
    { label: 'Taux de commission', value: `${(data.commissionRate * 100).toFixed(0)} %` },
    { label: 'COMMISSION DUE À ROOMSCAN', value: eur(data.commissionOwed), highlight: true },
    { label: 'Statut', value: statusLabelFr(data.status) },
    { label: 'Échéance', value: frDate(data.dueDate) },
    ...(data.paidAt ? [{ label: 'Payée le', value: frDate(data.paidAt) }] : []),
  ];

  for (const row of rows) {
    const highlight = Boolean(row.highlight);
    doc
      .rect(MARGIN, doc.y - 5, CONTENT_W, 20)
      .fill(highlight ? '#FDF6E3' : '#F8FAFC');
    doc
      .font(highlight ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(10)
      .fillColor(highlight ? '#B45309' : INK)
      .text(row.label, MARGIN + 10, doc.y - 1, { lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(highlight ? '#B45309' : INK)
      .text(row.value, MARGIN + CONTENT_W - 110, doc.y - 1, {
        width: 100,
        align: 'right',
        lineBreak: false,
      });
    doc.x = MARGIN;
    doc.y += 18;
  }

  doc.moveDown(1.4);

  // ── Mention légale ──
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text(
      'Cette facture couvre la commission RoomScan sur les commandes (minibar, room service, pressing) encaissées ' +
        'par vos invités via le Hub pendant le mois indiqué. Les montants sont exprimés TTC encaissé, frais bancaires ' +
        'non déduits. Paiement par virement — contactez facturation@roomscan.pro. ' +
        `Facture consultable en ligne à vie : ${data.publicUrl}`,
      MARGIN,
      doc.y,
      { width: CONTENT_W },
    );

  // ── Pied de page (toutes pages) ──
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(
        `RoomScan — facture ${data.invoiceId} — ${data.monthLabel}`,
        MARGIN,
        PAGE_H - MARGIN - 18,
        { width: CONTENT_W, align: 'center', lineBreak: false },
      );
  }

  doc.end();
  return finished;
}
