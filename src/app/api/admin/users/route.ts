// =============================================================
// /api/admin/users — Module 2 Gestion Clients
//
// GET : liste paginée des comptes avec filtres réels
//       ?search= &role=user|superadmin &plan=airbnb_solo|…|none
//       &status=active|inactive &page= &limit=
//       + compteurs (biens, lots) + abonnement actif éventuel.
//
// 🔒 Superadmin. Chaque action de mutation est journalisée
//    (audit) côté /api/admin/users/[id].
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search')?.trim() || '';
    const role = searchParams.get('role');
    const plan = searchParams.get('plan');
    const status = searchParams.get('status');
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [{ email: { contains: search } }, { fullName: { contains: search } }];
    }
    if (role === 'user' || role === 'superadmin') where.role = role;
    if (plan) {
      where.selectedPlan = plan === 'none' ? null : plan;
    }
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          selectedPlan: true,
          createdAt: true,
          providerProfile: { select: { id: true, businessName: true } },
          subscriptions: {
            where: { status: 'active' },
            select: { id: true, plan: true, amount: true, billingCycle: true, currentPeriodEnd: true },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: {
              propertyMemberships: true,
              ownedProperties: true,
              createdBatches: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.user.count({ where }),
    ]);

    // Compteurs d'en-tête (sur l'ensemble, hors pagination)
    const [totalAll, totalActive, totalHosts] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { isActive: true } }),
      db.user.count({ where: { role: 'user', providerProfile: null } }),
    ]);

    return NextResponse.json({
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        isActive: u.isActive,
        selectedPlan: u.selectedPlan,
        createdAt: u.createdAt.toISOString(),
        providerBusinessName: u.providerProfile?.businessName ?? null,
        subscription: u.subscriptions[0]
          ? {
              plan: u.subscriptions[0].plan,
              amount: u.subscriptions[0].amount,
              billingCycle: u.subscriptions[0].billingCycle,
              currentPeriodEnd: u.subscriptions[0].currentPeriodEnd?.toISOString() ?? null,
            }
          : null,
        propertyCount: u._count.ownedProperties,
        membershipCount: u._count.propertyMemberships,
        batchCount: u._count.createdBatches,
      })),
      stats: { totalAll, totalActive, totalHosts },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/admin/users] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
