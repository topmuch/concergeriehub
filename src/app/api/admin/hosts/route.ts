// =============================================================
// /api/admin/hosts — ÉTAPE 9 : Gestion des hôtes
//
// GET : liste des comptes hôtes (users sans profil prestataire)
//  avec plan (abonnement actif en priorité, sinon intention
//  selectedPlan), nombre de biens, statut du compte.
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
    const hosts = await db.user.findMany({
      where: { role: 'user', providerProfile: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        selectedPlan: true,
        isActive: true,
        onboardingCompleted: true,
        createdAt: true,
        _count: { select: { ownedProperties: true } },
      },
    });

    // Abonnements hôte les plus récents (1 par hôte) — requête séparée
    // puis regroupement en JS (SQLite : pas de DISTINCT ON).
    const hostIds = hosts.map((h) => h.id);
    const subs = await db.subscription.findMany({
      where: { userId: { in: hostIds } },
      orderBy: { createdAt: 'desc' },
      select: {
        userId: true,
        plan: true,
        status: true,
        billingCycle: true,
        amount: true,
      },
    });
    const latestSubByHost = new Map<string, (typeof subs)[number]>();
    for (const s of subs) {
      if (s.userId && !latestSubByHost.has(s.userId)) latestSubByHost.set(s.userId, s);
    }

    return NextResponse.json({
      hosts: hosts.map((h) => {
        const sub = latestSubByHost.get(h.id) ?? null;
        return {
          id: h.id,
          fullName: h.fullName,
          email: h.email,
          selectedPlan: h.selectedPlan,
          isActive: h.isActive,
          onboardingCompleted: h.onboardingCompleted,
          createdAt: h.createdAt.toISOString(),
          propertyCount: h._count.ownedProperties,
          subscription: sub
            ? { plan: sub.plan, status: sub.status, billingCycle: sub.billingCycle, amount: sub.amount }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error('[GET /api/admin/hosts] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
