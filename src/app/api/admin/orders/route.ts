// =============================================================
// /api/admin/orders — Module 6 Transactions : commandes de service
//
// GET : liste paginée réelle des ServiceOrder avec filtres
//       ?status= &paymentStatus= &search= + KPIs finance
//       (GMV payée, commissions, encaissé, à reverser).
// 🔒 Superadmin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status') || '';
    const paymentStatus = searchParams.get('paymentStatus') || '';
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (search) {
      where.OR = [
        { guestName: { contains: search } },
        { provider: { is: { businessName: { contains: search } } } },
      ];
    }

    const [orders, total, allForStats, payoutsAgg] = await Promise.all([
      db.serviceOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          guestName: true,
          guestEmail: true,
          items: true,
          totalAmount: true,
          commission: true,
          hostEarning: true,
          status: true,
          paymentStatus: true,
          stripePaymentId: true,
          createdAt: true,
          paidAt: true,
          deliveryDate: true,
          provider: { select: { id: true, businessName: true, category: true, stripeChargesEnabled: true } },
        },
      }),
      db.serviceOrder.count({ where }),
      db.serviceOrder.findMany({
        select: { totalAmount: true, commission: true, hostEarning: true, paymentStatus: true },
      }),
      db.payout.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    ]);

    let gmvPaid = 0;
    let commissionPaid = 0;
    let hostEarnings = 0;
    let pendingAmount = 0;
    for (const o of allForStats) {
      if (o.paymentStatus === 'PAID') {
        gmvPaid += o.totalAmount;
        commissionPaid += o.commission;
        hostEarnings += o.hostEarning;
      } else if (o.paymentStatus === 'UNPAID') {
        pendingAmount += o.totalAmount;
      }
    }

    return NextResponse.json({
      stats: {
        gmvPaidEur: round2(gmvPaid),
        commissionEur: round2(commissionPaid),
        hostEarningsEur: round2(hostEarnings),
        pendingEur: round2(pendingAmount),
        refundedEur: round2(allForStats.filter((o) => o.paymentStatus === 'REFUNDED').reduce((s, o) => s + o.totalAmount, 0)),
        payoutsPaidEur: round2(payoutsAgg._sum.amount ?? 0),
        ordersTotal: allForStats.length,
      },
      data: orders.map((o) => {
        const items = Array.isArray(o.items) ? (o.items as { name?: string; qty?: number }[]) : [];
        return {
          id: o.id,
          guestName: o.guestName,
          guestEmail: o.guestEmail,
          itemSummary: items.map((i) => `${i.qty ?? 1}× ${i.name ?? 'Prestation'}`).join(', ') || 'Prestation',
          totalAmount: o.totalAmount,
          commission: o.commission,
          hostEarning: o.hostEarning,
          status: o.status,
          paymentStatus: o.paymentStatus,
          stripePaymentId: o.stripePaymentId,
          createdAt: o.createdAt.toISOString(),
          paidAt: o.paidAt?.toISOString() ?? null,
          provider: o.provider,
        };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    console.error('[GET /api/admin/orders] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
