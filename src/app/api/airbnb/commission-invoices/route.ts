// =============================================================
// /api/airbnb/commission-invoices — v4.69 PHASE 5
// Factures de commission RoomScan DE L'HÔTE connecté (lecture seule) :
// il voit ce qu'il doit à RoomScan chaque mois (statut, échéance,
// détail). Le paiement est géré par le Superadmin (CRM facturation).
// =============================================================
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { DEFAULT_HOST_COMMISSION_RATE } from '@/lib/commission';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  try {
    const [invoices, settings] = await Promise.all([
      db.monthlyCommissionInvoice.findMany({
        where: { hostId: session.user.id },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 60,
      }),
      db.hostSettings.findUnique({ where: { userId: session.user.id }, select: { commissionRate: true } }),
    ]);

    return NextResponse.json({
      invoices: invoices.map((i) => ({
        id: i.id,
        month: i.month,
        year: i.year,
        totalOrdersAmount: i.totalOrdersAmount,
        commissionRate: i.commissionRate,
        commissionOwed: i.commissionOwed,
        ordersCount: i.ordersCount,
        breakdown: i.breakdown,
        invoicePdfUrl: i.invoicePdfUrl,
        status: i.status,
        dueDate: i.dueDate.toISOString(),
        paidAt: i.paidAt ? i.paidAt.toISOString() : null,
      })),
      commissionRate: settings?.commissionRate ?? DEFAULT_HOST_COMMISSION_RATE,
    });
  } catch {
    return NextResponse.json({ error: 'Erreur lors du chargement de vos factures.' }, { status: 500 });
  }
}
