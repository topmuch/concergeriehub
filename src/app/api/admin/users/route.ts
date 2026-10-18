// =============================================================
// /api/admin/users — Module 2 Gestion Clients
//
// GET : liste paginée des comptes avec filtres réels
//       ?search= &role=user|superadmin &plan=airbnb_solo|…|none
//       &status=active|inactive &createdFrom=YYYY-MM-DD
//       &createdTo=YYYY-MM-DD &page= &limit=   (FIX-10 : plage createdAt,
//       bornes inclusives — createdTo s'arrête à la fin de la journée)
//       + compteurs (biens, lots) + abonnement actif éventuel.
//
// POST : CRÉATION D'UN COMPTE PAR LE SUPERADMIN (WP-BACK v4.61).
//       Remplace le détournement de /api/auth/register par l'UI admin :
//       • rôle HONORÉ ('user' | 'superadmin') — jamais choisi côté public ;
//       • AUCUNE création de bien « Ma Maison » (l'hôte crée son bien) ;
//       • PAS de gate feature-flag signups_enabled (action admin assumée) ;
//       • même politique mot de passe que l'inscription publique
//         (8 caractères min + lettres + chiffres) ;
//       • email normalisé + unicité (409 si déjà pris).
//
// 🔒 Superadmin. Mutations journalisées (audit) — création ici,
//    autres actions côté /api/admin/users/[id].
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';

// Même règle que /api/auth/register (alignée /api/airbnb/security/password) :
// 8 caractères minimum + au moins une lettre et un chiffre.
const PASSWORD_RULE = {
  minLength: 8,
  message: 'Le mot de passe doit contenir au moins 8 caracteres, avec des lettres et des chiffres',
} as const;
const isValidPassword = (pwd: string): boolean =>
  pwd.length >= PASSWORD_RULE.minLength && /[A-Za-z]/.test(pwd) && /\d/.test(pwd);

const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit contenir entre 2 et 80 caracteres').max(80),
  email: z.string().trim().toLowerCase().regex(
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    'Adresse email invalide',
  ),
  password: z.string().refine(isValidPassword, { message: PASSWORD_RULE.message }),
  role: z.enum(['user', 'superadmin']),
  isActive: z.boolean().optional(),
});

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

    // FIX-10 — filtre par date d'inscription (plage createdAt).
    // Format attendu YYYY-MM-DD ; les valeurs malformées sont ignorées
    // (l'UI ne peut de toute façon envoyer que des inputs type="date").
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const createdFromParam = searchParams.get('createdFrom') ?? '';
    const createdToParam = searchParams.get('createdTo') ?? '';
    if (createdFromParam && !DATE_RE.test(createdFromParam)) {
      return NextResponse.json({ error: 'createdFrom invalide (YYYY-MM-DD attendu)' }, { status: 400 });
    }
    if (createdToParam && !DATE_RE.test(createdToParam)) {
      return NextResponse.json({ error: 'createdTo invalide (YYYY-MM-DD attendu)' }, { status: 400 });
    }

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
    if (createdFromParam || createdToParam) {
      where.createdAt = {
        ...(createdFromParam
          ? { gte: new Date(`${createdFromParam}T00:00:00.000Z`) }
          : {}),
        ...(createdToParam
          ? { lte: new Date(`${createdToParam}T23:59:59.999Z`) }
          : {}),
      };
    }

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

// =============================================================
// POST — Création d'un compte par le Superadmin (WP-BACK v4.61).
// Body : { name, email, password, role: 'user'|'superadmin', isActive? }
// • bcrypt hash (12 rounds, identique à /api/auth/register)
// • unicité email → 409 « deja utilise »
// • rôle HONORÉ, isActive défaut true
// • AUCUNE création de propriété, AUCUN gate signups_enabled
// • audit log (pattern PATCH /api/admin/users/[id])
// =============================================================
export async function POST(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const parsed = createUserSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide' },
        { status: 400 },
      );
    }
    const { email, password, role } = parsed.data;
    const fullName = parsed.data.name;
    const isActive = parsed.data.isActive ?? true;

    // Unicité (409 — même contrat que /api/auth/register).
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: 'Cet email est deja utilise' }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);
    const user = await db.user.create({
      data: {
        email,
        fullName,
        passwordHash,
        role,
        isActive,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Audit (copie du pattern PATCH /api/admin/users/[id]).
    await logAudit({
      actor: admin,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      details: { email: user.email, role: user.role, isActive: user.isActive },
      ip: clientIp(req.headers),
    });

    // JAMAIS de password dans la réponse.
    return NextResponse.json(
      {
        ok: true,
        message: `Compte créé — ${user.email} (${user.role})`,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[POST /api/admin/users] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
