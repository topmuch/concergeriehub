// =============================================================
// /api/admin/subscriptions — Module 4 Abonnements (liste & stats)
//
// GET :  - KPIs abonnements (MRR, actifs, par plan, churn 30 j)
//        - liste paginée des abonnements (hôtes, marchands,
//          prestataires) avec filtres ?plan= &status= &search=
//        - factures = paiements d'abonnement réels (Transaction
//          type 'subscription' | 'airbnb_subscription')
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
    const plan = searchParams.get('plan') || '';
    const status = searchParams.get('status') || '';
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));

    const where: Record<string, unknown> = {};
    if (plan) where.plan = plan;
    if (status) where.status = status;

    const [subsAll, invoices, planGroups, cancelled30d] = await Promise.all([
      db.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          merchant: { select: { id: true, name: true } },
          provider: { select: { id: true, businessName: true } },
        },
      }),
      db.transaction.findMany({
        where: { type: { in: ['subscription', 'airbnb_subscription', 'subscription_payment'] } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.subscription.groupBy({ by: ['plan'], where: { status: 'active' }, _count: { _all: true } }),
      db.subscription.count({
        where: { status: 'cancelled', createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
      }),
    ]);

    const filtered = subsAll.filter((s) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        s.user?.email?.toLowerCase().includes(q) ||
        s.user?.fullName?.toLowerCase().includes(q) ||
        s.merchant?.name?.toLowerCase().includes(q) ||
        s.provider?.businessName?.toLowerCase().includes(q)
      );
    });

    // MRR réel : abonnements ACTIFS normalisés mensuel (annual / 12)
    let mrrEur = 0;
    const active = subsAll.filter((s) => s.status === 'active');
    for (const s of active) {
      if (s.currency !== 'EUR') continue;
      mrrEur += s.billingCycle === 'monthly' ? s.amount : s.amount / 12;
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paged = filtered.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      stats: {
        mrrEur: round2(mrrEur),
        arrEur: round2(mrrEur * 12),
        activeCount: active.length,
        pastDueCount: subsAll.filter((s) => s.status === 'past_due').length,
        cancelled30d,
        byPlan: planGroups.map((g) => ({ plan: g.plan, count: g._count._all })),
      },
      data: paged.map((s) => ({
        id: s.id,
        plan: s.plan,
        amount: s.amount,
        currency: s.currency,
        billingCycle: s.billingCycle,
        status: s.status,
        stripeSubscriptionId: s.stripeSubscriptionId,
        currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
        currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
        subscriber:
          s.user
            ? { type: 'user' as const, id: s.user.id, name: s.user.fullName ?? s.user.email, email: s.user.email }
            : s.merchant
              ? { type: 'merchant' as const, id: s.merchant.id, name: s.merchant.name, email: null }
              : s.provider
                ? { type: 'provider' as const, id: s.provider.id, name: s.provider.businessName, email: null }
                : { type: 'unknown' as const, id: s.subscriberId ?? '—', name: '—', email: null },
      })),
      invoices: invoices.slice(0, 50).map((t) => ({
        id: t.id,
        amount: t.amount,
        currency: t.currency,
        status: t.status,
        stripePaymentId: t.stripePaymentId,
        createdAt: t.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    console.error('[GET /api/admin/subscriptions] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
