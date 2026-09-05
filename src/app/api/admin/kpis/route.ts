// =============================================================
// /api/admin/kpis — Dashboard Superadmin V2 (sidebar + KPIs)
//
// GET : toutes les données du nouveau dashboard :
//  - stats : hôtes, biens, prestataires, séjours, abonnements,
//    plaques physiques (activées / totaux), finance (GMV payée,
//    commission plateforme, part hôte, commandes par statut de
//    paiement, panier moyen, remboursements)
//  - series : GMV + commission par jour sur 30 jours (pré-remplie,
//    agrégation en JS car SQLite ne supporte pas le groupby date)
//  - hostSignupTrend : inscriptions d'hôtes par jour sur 30 jours
//    (pré-remplie, agrégation JS — même contrainte SQLite)
//  - planDistribution : répartition des comptes hôtes par plan
//    (airbnb_solo | airbnb_pro | agency | free | null)
//  - paymentDistribution : répartition des commandes par statut de
//    paiement (PAID | UNPAID | REFUNDED | FAILED)
//  - categoryRevenue : GMV par catégorie de prestation (join provider)
//  - providerRevenue : top 5 prestataires par GMV
//  - recentOrders / recentHosts / recentActivity / recentActivations :
//    listes temps réel (activations de plaques via ActivationLog)
//
// Définitions métier (inchangées, cf. /api/admin/overview) :
//  - Hôte = user (role 'user') sans profil prestataire
//  - MRR = abonnements hôte actifs normalisés (annual / 12)
//  - GMV = Σ ServiceOrder.totalAmount payés (paymentStatus 'PAID')
//  - Commission = Σ ServiceOrder.commission sur les mêmes commandes
//    (invariant : totalAmount ≈ commission + hostEarning)
//
// 🔒 Réservé au Superadmin (role 'superadmin').
// =============================================================
import { NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { providerCategoryMeta } from '@/lib/b2b';

// Nombre de jours couverts par le graphique de tendance
const TREND_DAYS = 30;

function dayKey(d: Date): string {
  // Clé locale YYYY-MM-DD (sans décalage UTC)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const now = new Date();
    const since30d = new Date(now.getTime() - TREND_DAYS * 24 * 3600 * 1000);

    const [
      totalHosts,
      activeHosts,
      newHosts30d,
      propertiesCount,
      activePropertiesCount,
      providersTotal,
      providersActive,
      providersOwner,
      providersGuest,
      bookingsActive,
      bookingsUpcoming,
      subscriptions,
      orders,
      scansTotal,
      recentHosts,
      recentActivity,
      plaquesTotal,
      plaquesActive,
      plaquesInactive,
      plaquesLost,
      hostSignups30dRows,
      planGroups,
      recentActivationRows,
    ] = await Promise.all([
      // ----- Comptes -----
      db.user.count({ where: { role: 'user', providerProfile: null } }),
      db.user.count({ where: { role: 'user', providerProfile: null, isActive: true } }),
      db.user.count({
        where: { role: 'user', providerProfile: null, createdAt: { gte: since30d } },
      }),

      // ----- Biens -----
      db.property.count(),
      db.property.count({ where: { isActive: true } }),

      // ----- Prestataires -----
      db.provider.count(),
      db.provider.count({ where: { isActive: true } }),
      db.provider.count({ where: { audience: 'OWNER_SERVICE' } }),
      db.provider.count({ where: { audience: 'GUEST_EXPERIENCE' } }),

      // ----- Séjours -----
      db.booking.count({ where: { status: 'CHECKED_IN' } }),
      db.booking.count({ where: { status: 'CONFIRMED', checkIn: { gte: now } } }),

      // ----- Abonnements (MRR) -----
      db.subscription.findMany({
        where: { userId: { not: null }, status: 'active' },
        select: { amount: true, currency: true, billingCycle: true },
      }),

      // ----- Commandes de service (moteur de transaction É17) -----
      db.serviceOrder.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          guestName: true,
          items: true,
          totalAmount: true,
          commission: true,
          hostEarning: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
          paidAt: true,
          provider: { select: { id: true, businessName: true, category: true } },
        },
      }),

      // ----- Activité invité -----
      db.scanLog.count(),

      // ----- Listes -----
      db.user.findMany({
        where: { role: 'user', providerProfile: null },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          fullName: true,
          email: true,
          selectedPlan: true,
          isActive: true,
          createdAt: true,
          _count: { select: { ownedProperties: true } },
        },
      }),

      db.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          actionType: true,
          createdAt: true,
          detailsJson: true,
          property: { select: { name: true } },
          user: { select: { fullName: true, email: true } },
        },
      }),

      // ----- Plaques physiques (inventaire + activations) -----
      db.physicalQrCode.count(),
      db.physicalQrCode.count({ where: { status: 'active' } }),
      db.physicalQrCode.count({ where: { status: 'inactive' } }),
      db.physicalQrCode.count({ where: { status: 'lost' } }),

      // ----- Courbe d'inscriptions hôtes (30 j, groupée en JS) -----
      db.user.findMany({
        where: {
          role: 'user',
          providerProfile: null,
          createdAt: { gte: since30d },
        },
        select: { createdAt: true },
      }),

      // ----- Répartition des plans (comptes hôtes) -----
      db.user.groupBy({
        by: ['selectedPlan'],
        where: { role: 'user', providerProfile: null },
        _count: { _all: true },
      }),

      // ----- Dernières activations de plaques (flux temps réel) -----
      db.activationLog.findMany({
        where: { action: 'activated' },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          createdAt: true,
          physicalQrCode: {
            select: { activationCode: true, hubSlug: true },
          },
          user: { select: { fullName: true, email: true } },
        },
      }),
    ]);

    // ================= Agrégations finance =================
    // Toutes les sommes se font en JS (volume démo faible + SQLite
    // sans fonctions d'agrégation sur dates pour la série journalière).
    let gmvPaidEur = 0;
    let platformRevenueEur = 0;
    let hostEarningsEur = 0;
    let ordersPaid = 0;
    let ordersUnpaid = 0;
    let ordersRefunded = 0;
    let ordersFailed = 0;
    let gmv30dEur = 0;
    let orders30d = 0;

    const distribution: Record<string, number> = {
      PAID: 0,
      UNPAID: 0,
      REFUNDED: 0,
      FAILED: 0,
    };
    const byCategory = new Map<string, { gmv: number; orders: number }>();
    const byProvider = new Map<string, { name: string; gmv: number; orders: number }>();

    for (const o of orders) {
      distribution[o.paymentStatus] = (distribution[o.paymentStatus] ?? 0) + 1;

      const isPaid = o.paymentStatus === 'PAID';
      if (isPaid) {
        ordersPaid += 1;
        gmvPaidEur += o.totalAmount;
        platformRevenueEur += o.commission;
        hostEarningsEur += o.hostEarning;

        // GMV par catégorie / prestataire (commandes payées uniquement)
        const cat = o.provider?.category ?? 'OTHER';
        const catEntry = byCategory.get(cat) ?? { gmv: 0, orders: 0 };
        catEntry.gmv += o.totalAmount;
        catEntry.orders += 1;
        byCategory.set(cat, catEntry);

        const pid = o.provider?.id ?? 'unknown';
        const pEntry = byProvider.get(pid) ?? { name: o.provider?.businessName ?? '—', gmv: 0, orders: 0 };
        pEntry.gmv += o.totalAmount;
        pEntry.orders += 1;
        byProvider.set(pid, pEntry);
      } else if (o.paymentStatus === 'UNPAID') {
        ordersUnpaid += 1;
      } else if (o.paymentStatus === 'REFUNDED') {
        ordersRefunded += 1;
      } else if (o.paymentStatus === 'FAILED') {
        ordersFailed += 1;
      }

      // Fenêtre 30 jours (base de calcul : paidAt si payée, sinon createdAt)
      const ref = (isPaid && o.paidAt) ? o.paidAt : o.createdAt;
      if (ref >= since30d) {
        orders30d += 1;
        if (isPaid) gmv30dEur += o.totalAmount;
      }
    }

    // ================= Série 30 jours =================
    const buckets = new Map<string, { gmv: number; commission: number }>();
    for (let i = TREND_DAYS - 1; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
      buckets.set(dayKey(d), { gmv: 0, commission: 0 });
    }
    for (const o of orders) {
      if (o.paymentStatus !== 'PAID') continue;
      const key = dayKey(o.paidAt ?? o.createdAt);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.gmv = round2(bucket.gmv + o.totalAmount);
      bucket.commission = round2(bucket.commission + o.commission);
    }
    const series = Array.from(buckets.entries()).map(([date, v]) => ({
      date, // YYYY-MM-DD (formatage FR côté client)
      gmv: v.gmv,
      commission: v.commission,
    }));

    // ================= Courbe inscriptions hôtes (30 j) =================
    const signupBuckets = new Map<string, number>();
    for (let i = TREND_DAYS - 1; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
      signupBuckets.set(dayKey(d), 0);
    }
    for (const row of hostSignups30dRows) {
      const key = dayKey(row.createdAt);
      signupBuckets.set(key, (signupBuckets.get(key) ?? 0) + 1);
    }
    const hostSignupTrend = Array.from(signupBuckets.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    // ================= Répartition des plans =================
    const PLAN_ORDER = ['airbnb_solo', 'airbnb_pro', 'agency', 'free'] as const;
    const planCounts = new Map<string, number>();
    for (const g of planGroups) {
      planCounts.set(g.selectedPlan ?? 'free', g._count._all);
    }
    const planDistribution = [
      ...PLAN_ORDER.map((plan) => ({ plan, count: planCounts.get(plan) ?? 0 })),
      // Sécurité : plans inconnus / valeurs inattendues regroupées dans "free"
      ...Array.from(planCounts.entries())
        .filter(([plan]) => !PLAN_ORDER.includes(plan as (typeof PLAN_ORDER)[number]))
        .map(([plan, count]) => ({ plan, count })),
    ].filter((p) => p.count > 0);

    // ================= MRR =================
    let mrrEur = 0;
    for (const sub of subscriptions) {
      if (sub.currency !== 'EUR') continue;
      mrrEur += sub.billingCycle === 'monthly' ? sub.amount : sub.amount / 12;
    }
    mrrEur = round2(mrrEur);

    // ================= Répartitions =================
    const paymentDistribution = [
      { key: 'PAID', count: distribution.PAID ?? 0 },
      { key: 'UNPAID', count: distribution.UNPAID ?? 0 },
      { key: 'REFUNDED', count: distribution.REFUNDED ?? 0 },
      { key: 'FAILED', count: distribution.FAILED ?? 0 },
    ];

    const categoryRevenue = Array.from(byCategory.entries())
      .map(([category, v]) => {
        const meta = providerCategoryMeta(category);
        return {
          category,
          label: `${meta.emoji} ${meta.label}`,
          gmv: round2(v.gmv),
          orders: v.orders,
        };
      })
      .sort((a, b) => b.gmv - a.gmv);

    const providerRevenue = Array.from(byProvider.values())
      .map((p) => ({ ...p, gmv: round2(p.gmv) }))
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 5);

    // ================= Listes =================
    const recentOrders = orders.slice(0, 8).map((o) => {
      const items = Array.isArray(o.items) ? (o.items as { name?: string }[]) : [];
      return {
        id: o.id,
        guestName: o.guestName,
        providerName: o.provider?.businessName ?? '—',
        providerCategory: o.provider?.category ?? null,
        itemName: items[0]?.name ?? 'Prestation',
        totalAmount: o.totalAmount,
        commission: o.commission,
        status: o.status,
        paymentStatus: o.paymentStatus,
        createdAt: o.createdAt.toISOString(),
        paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      };
    });

    const activity = recentActivity.map((a) => {
      let details: Record<string, unknown> = {};
      try {
        details = JSON.parse(a.detailsJson) as Record<string, unknown>;
      } catch {
        /* {} */
      }
      return {
        id: a.id,
        actionType: a.actionType,
        createdAt: a.createdAt.toISOString(),
        propertyName: a.property?.name ?? null,
        userName: a.user?.fullName ?? a.user?.email ?? null,
        module: typeof details.module === 'string' ? details.module : null,
      };
    });

    return NextResponse.json({
      stats: {
        totalHosts,
        activeHosts,
        newHosts30d,
        propertiesCount,
        activePropertiesCount,
        providersTotal,
        providersActive,
        providersOwner,
        providersGuest,
        bookingsActive,
        bookingsUpcoming,
        subscriptionsActive: subscriptions.length,
        mrrEur,
        gmvPaidEur: round2(gmvPaidEur),
        platformRevenueEur: round2(platformRevenueEur),
        hostEarningsEur: round2(hostEarningsEur),
        ordersTotal: orders.length,
        ordersPaid,
        ordersUnpaid,
        ordersRefunded,
        ordersFailed,
        orders30d,
        gmv30dEur: round2(gmv30dEur),
        avgOrderEur: ordersPaid > 0 ? round2(gmvPaidEur / ordersPaid) : 0,
        scansTotal,
        plaquesTotal,
        plaquesActive,
        plaquesInactive,
        plaquesLost,
      },
      series,
      hostSignupTrend,
      planDistribution,
      paymentDistribution,
      categoryRevenue,
      providerRevenue,
      recentOrders,
      recentHosts: recentHosts.map((h) => ({
        id: h.id,
        fullName: h.fullName,
        email: h.email,
        selectedPlan: h.selectedPlan,
        isActive: h.isActive,
        createdAt: h.createdAt.toISOString(),
        propertyCount: h._count.ownedProperties,
      })),
      recentActivity: activity,
      recentActivations: recentActivationRows.map((a) => ({
        id: a.id,
        activationCode: a.physicalQrCode?.activationCode ?? '—',
        hubSlug: a.physicalQrCode?.hubSlug ?? null,
        userName: a.user?.fullName ?? a.user?.email ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[GET /api/admin/kpis] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
