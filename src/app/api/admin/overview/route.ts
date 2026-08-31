// =============================================================
// /api/admin/overview — ÉTAPE 9 : Vue d'ensemble Superadmin
//
// GET : statistiques globales de la plateforme
//  - Hôtes actifs / totaux (comptes "user" sans profil prestataire)
//  - Propriétés
//  - MRR Stripe (abonnements actifs : monthly = montant,
//    annual = montant / 12)
//  - Prestataires (totaux + par audience)
//  + Derniers hôtes inscrits + dernières activités.
//
// 🔒 Réservé au Superadmin (role 'superadmin').
// =============================================================
import { NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const [
      totalHosts,
      activeHosts,
      propertiesCount,
      activePropertiesCount,
      subscriptions,
      providersTotal,
      providersActive,
      providersOwner,
      providersGuest,
      recentHosts,
      recentActivity,
    ] = await Promise.all([
      // Hôtes = comptes 'user' SANS profil prestataire (les 13 comptes
      // prestataires de démo sont des users mais ne sont pas des hôtes)
      db.user.count({ where: { role: 'user', providerProfile: null } }),
      db.user.count({ where: { role: 'user', providerProfile: null, isActive: true } }),

      db.property.count(),
      db.property.count({ where: { isActive: true } }),

      db.subscription.findMany({
        where: { userId: { not: null }, status: 'active' },
        select: { amount: true, currency: true, billingCycle: true, plan: true },
      }),

      db.provider.count(),
      db.provider.count({ where: { isActive: true } }),
      db.provider.count({ where: { audience: 'OWNER_SERVICE' } }),
      db.provider.count({ where: { audience: 'GUEST_EXPERIENCE' } }),

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
    ]);

    // ---- MRR : normalisation mensuelle ----
    // monthly = montant plein, annual = montant / 12
    let mrrEur = 0;
    for (const sub of subscriptions) {
      if (sub.currency !== 'EUR') continue;
      mrrEur += sub.billingCycle === 'monthly' ? sub.amount : sub.amount / 12;
    }
    mrrEur = Math.round(mrrEur * 100) / 100;

    // ---- Dernières activités : enrichissement (label via detailsJson) ----
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
        propertiesCount,
        activePropertiesCount,
        mrrEur,
        subscriptionsActive: subscriptions.length,
        providersTotal,
        providersActive,
        providersOwner,
        providersGuest,
      },
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
    });
  } catch (error) {
    console.error('[GET /api/admin/overview] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
