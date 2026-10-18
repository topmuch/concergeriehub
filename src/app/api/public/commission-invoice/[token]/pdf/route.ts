// =============================================================
// v4.81 (AUDIT QA-3) — PDF PUBLIC D'UNE FACTURE DE COMMISSION
// /api/public/commission-invoice/[token]/pdf
//
// Résout la facture par pdfToken (48 hex générés crypto.randomBytes,
// stockés @unique). Aucune authentification — même pattern de
// « lien public à vie » que les états des lieux, mais le jeton est
// imprévisible (aucune donnée hors la facture elle-même).
// Génération pdfkit à la demande (jamais stockée sur disque).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { renderCommissionInvoicePdf } from '@/lib/commission-invoice-pdf-server';
import { monthLabel } from '@/lib/commission';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || !/^[A-Za-z0-9]{24,80}$/.test(token)) {
    return NextResponse.json({ error: 'Jeton invalide.' }, { status: 400 });
  }

  try {
    const invoice = await db.monthlyCommissionInvoice.findUnique({
      where: { pdfToken: token },
      include: {
        host: { select: { fullName: true, email: true } },
      },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'Facture introuvable.' }, { status: 404 });
    }

    const breakdownRaw = (invoice.breakdown ?? {}) as Record<string, unknown>;
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

    const buffer = await renderCommissionInvoicePdf({
      monthLabel: monthLabel(invoice.month, invoice.year),
      hostName: invoice.host.fullName?.trim() || invoice.host.email,
      hostEmail: invoice.host.email,
      totalOrdersAmount: invoice.totalOrdersAmount,
      commissionRate: invoice.commissionRate,
      commissionOwed: invoice.commissionOwed,
      ordersCount: invoice.ordersCount,
      breakdown: {
        minibar: num(breakdownRaw.minibar),
        services: num(breakdownRaw.services),
        laundry: num(breakdownRaw.laundry),
      },
      status: invoice.status,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      invoiceId: invoice.id,
      publicUrl: `/api/public/commission-invoice/${token}/pdf`,
    });

    const hostSlug = (invoice.host.email || 'hote').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const safeName = `facture-commission-${hostSlug}-${invoice.year}-${String(invoice.month).padStart(2, '0')}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[commission-invoice pdf] Génération impossible:', error);
    return NextResponse.json({ error: 'Erreur lors de la génération du PDF.' }, { status: 500 });
  }
}
