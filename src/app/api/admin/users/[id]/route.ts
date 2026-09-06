// =============================================================
// /api/admin/users/[id] — Module 2 Gestion Clients : fiche + actions
//
// GET : détail complet de la fiche client (FIX-10) —
//   • Équipe : biens possédés + leurs membres (PropertyMember),
//     et les équipes que le compte a rejointes chez d'autres hôtes.
//   • Facturation : abonnements (actif : plan/statut/échéance),
//     commandes de service sur ses biens (total + cumul), paiements
//     enregistrés (Transaction où payerId = ce compte), références
//     Stripe réelles (User.stripeAccountId, Subscription.stripeSubscriptionId).
//
// PATCH ?action=… :
//   - toggle-active       : activer / désactiver le compte
//   - change-plan         : selectedPlan = body.plan (et sync abonnement)
//   - change-role         : role = body.role ('user' | 'superadmin')
//   - reset-password      : génère un mot de passe temporaire réel
//                           (hash bcrypt en base + renvoyé UNE fois,
//                           email de notification mis en outbox)
// DELETE : suppression définitive du compte (confirmation côté UI).
//
// Toutes les actions sont journalisées dans audit_logs.
// 🔒 Superadmin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';
import { queueEmail } from '@/lib/email';
// FIX-12 — rendu DB-first : modèle éditable 'admin_password_reset'
// (onglet Modèles), fallback silencieux sur le template codé en dur.
import { renderAdminPasswordResetEmail } from '@/lib/email-template-render';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';

const VALID_PLANS = ['airbnb_solo', 'airbnb_pro', 'agency', 'free'];

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// =============================================================
// GET — Fiche client détaillée (FIX-10).
// Toutes les données viennent de la DB : aucune valeur simulée.
// Équipe = modèle PropertyMember réel (rôles OWNER/MANAGER/CLEANER/
// MAINTENANCE) ; Facturation = Subscription + Transaction (payerId)
// + ServiceOrder via les biens possédés.
// =============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        selectedPlan: true,
        onboardingCompleted: true,
        stripeAccountId: true,
        createdAt: true,
        profile: { select: { phone: true, address: true } },
        providerProfile: { select: { businessName: true } },
        ownedProperties: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            propertyType: true,
            address: true,
            isActive: true,
            createdAt: true,
            members: {
              orderBy: [{ joinedAt: 'asc' }],
              select: {
                id: true,
                role: true,
                nickname: true,
                invitedAt: true,
                acceptedAt: true,
                user: { select: { id: true, email: true, fullName: true } },
              },
            },
          },
        },
        propertyMemberships: {
          orderBy: { joinedAt: 'asc' },
          select: {
            id: true,
            role: true,
            invitedAt: true,
            acceptedAt: true,
            property: {
              select: {
                id: true,
                name: true,
                owner: { select: { email: true, fullName: true } },
              },
            },
          },
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            plan: true,
            amount: true,
            currency: true,
            billingCycle: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            stripeSubscriptionId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    // ----- Facturation : paiements (Transaction.payerId = ce compte)
    // et commandes de service sur les biens qu'il possède -----
    const ownedPropertyIds = user.ownedProperties.map((p) => p.id);
    const [txAggregate, txItems, orderAggregate] = await Promise.all([
      db.transaction.aggregate({
        where: { payerId: id },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      db.transaction.findMany({
        where: { payerId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          status: true,
          stripePaymentId: true,
          createdAt: true,
        },
      }),
      // ServiceOrder n'a pas de relation Prisma vers Property (champ
      // propertyId brut dans le schéma) → agrégation par liste d'ids.
      // Les commandes CANCELLED sont exclues du cumul (revenu réel).
      ownedPropertyIds.length > 0
        ? db.serviceOrder.aggregate({
            where: { propertyId: { in: ownedPropertyIds }, status: { not: 'CANCELLED' } },
            _count: { _all: true },
            _sum: { totalAmount: true, hostEarning: true },
          })
        : Promise.resolve({ _count: { _all: 0 }, _sum: { totalAmount: null, hostEarning: null } }),
    ]);

    const activeSubscription = user.subscriptions.find((s) => s.status === 'active') ?? null;

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        selectedPlan: user.selectedPlan,
        onboardingCompleted: user.onboardingCompleted,
        stripeAccountId: user.stripeAccountId,
        createdAt: user.createdAt.toISOString(),
        phone: user.profile?.phone ?? null,
        address: user.profile?.address ?? null,
        providerBusinessName: user.providerProfile?.businessName ?? null,
      },
      team: {
        ownedProperties: user.ownedProperties.map((p) => ({
          id: p.id,
          name: p.name,
          propertyType: p.propertyType,
          address: p.address,
          isActive: p.isActive,
          createdAt: p.createdAt.toISOString(),
          memberCount: p.members.length,
          members: p.members.map((m) => ({
            id: m.id,
            role: m.role,
            nickname: m.nickname,
            invitedAt: m.invitedAt.toISOString(),
            acceptedAt: m.acceptedAt?.toISOString() ?? null,
            user: m.user,
          })),
        })),
        // Équipes rejointes = adhésions à des biens possédés par
        // D'AUTRES comptes (l'adhésion OWNER sur son propre bien est
        // déjà couverte par ownedProperties ci-dessus).
        memberships: user.propertyMemberships
          .filter((m) => m.property.owner.email !== user.email)
          .map((m) => ({
            id: m.id,
            role: m.role,
            invitedAt: m.invitedAt.toISOString(),
            acceptedAt: m.acceptedAt?.toISOString() ?? null,
            property: {
              id: m.property.id,
              name: m.property.name,
              ownerEmail: m.property.owner.email,
              ownerName: m.property.owner.fullName,
            },
          })),
      },
      billing: {
        activeSubscription: activeSubscription
          ? {
              id: activeSubscription.id,
              plan: activeSubscription.plan,
              amount: activeSubscription.amount,
              currency: activeSubscription.currency,
              billingCycle: activeSubscription.billingCycle,
              status: activeSubscription.status,
              currentPeriodStart: activeSubscription.currentPeriodStart?.toISOString() ?? null,
              currentPeriodEnd: activeSubscription.currentPeriodEnd?.toISOString() ?? null,
              stripeSubscriptionId: activeSubscription.stripeSubscriptionId,
            }
          : null,
        subscriptions: user.subscriptions.map((s) => ({
          id: s.id,
          plan: s.plan,
          amount: s.amount,
          currency: s.currency,
          billingCycle: s.billingCycle,
          status: s.status,
          currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
        })),
        // Commandes de service (invités) posées sur les biens du client
        serviceOrders: {
          count: orderAggregate._count._all,
          totalAmount: orderAggregate._sum.totalAmount ?? 0,
          hostEarnings: orderAggregate._sum.hostEarning ?? 0,
        },
        // Paiements réglés par ce compte (abonnements via checkout)
        transactions: {
          count: txAggregate._count._all,
          totalAmount: txAggregate._sum.amount ?? 0,
          items: txItems.map((t) => ({
            id: t.id,
            type: t.type,
            amount: t.amount,
            currency: t.currency,
            status: t.status,
            stripePaymentId: t.stripePaymentId,
            createdAt: t.createdAt.toISOString(),
          })),
        },
      },
    });
  } catch (error) {
    console.error('[GET /api/admin/users/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const { id } = await params;
    const action = req.nextUrl.searchParams.get('action');
    const body = (await req.json().catch(() => ({}))) as { plan?: string; role?: string };

    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, selectedPlan: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }
    if (user.id === admin.id && (action === 'toggle-active' || action === 'change-role' || undefined)) {
      if (action !== 'change-plan') {
        return NextResponse.json(
          { error: 'Impossible de modifier son propre compte (verrou de sécurité)' },
          { status: 400 },
        );
      }
    }

    let message = '';
    const details: Record<string, unknown> = {};

    if (action === 'toggle-active') {
      const next = !user.isActive;
      await db.user.update({ where: { id }, data: { isActive: next } });
      message = next ? 'Compte activé' : 'Compte désactivé';
      details.isActive = next;
    } else if (action === 'change-plan') {
      const plan = String(body.plan || '');
      if (!VALID_PLANS.includes(plan)) {
        return NextResponse.json(
          { error: `Plan invalide (${VALID_PLANS.join(', ')})` },
          { status: 400 },
        );
      }
      await db.user.update({ where: { id }, data: { selectedPlan: plan } });

      // Synchronisation du seul abonnement actif de l'hôte (s'il existe)
      const activeSub = await db.subscription.findFirst({
        where: { userId: id, status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
      if (activeSub && activeSub.plan !== plan) {
        await db.subscription.update({
          where: { id: activeSub.id },
          data: { plan, status: 'cancelled' },
        });
        details.subscriptionCancelled = activeSub.id;
      }
      message = `Plan changé → ${plan}`;
      details.plan = plan;
    } else if (action === 'change-role') {
      const role = String(body.role || '');
      if (!['user', 'superadmin'].includes(role)) {
        return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 });
      }
      if (user.id === admin.id && role !== 'superadmin') {
        return NextResponse.json(
          { error: 'Impossible de retirer son propre rôle Superadmin' },
          { status: 400 },
        );
      }
      await db.user.update({ where: { id }, data: { role } });
      message = `Rôle changé → ${role}`;
      details.role = role;
    } else if (action === 'reset-password') {
      const tempPassword = randomPassword();
      const passwordHash = await hash(tempPassword, 10);
      await db.user.update({ where: { id }, data: { passwordHash } });

      // Notification réelle via l'outbox (consultable dans /admin/emails)
      try {
        const template = await renderAdminPasswordResetEmail({
          to: user.email,
          tempPassword,
          adminName: admin.name ?? admin.email,
        });
        await queueEmail({ to: user.email, subject: template.subject, html: template.html, template: 'admin_password_reset' });
      } catch (e) {
        console.error('[users/[id]] outbox reset email:', e);
      }

      message = 'Mot de passe réinitialisé';
      details.tempPasswordLength = tempPassword.length;
      // Le mot de passe en clair est renvoyé UNE fois au Superadmin
      await logAudit({
        actor: admin,
        action: 'user.reset_password',
        entityType: 'user',
        entityId: id,
        details: { email: user.email, notified: true },
        ip: clientIp(req.headers),
      });
      return NextResponse.json({ ok: true, message, tempPassword });
    } else {
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }

    await logAudit({
      actor: admin,
      action: `user.${action.replace('-', '_')}`,
      entityType: 'user',
      entityId: id,
      details: { email: user.email, ...details },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({ ok: true, message });
  } catch (error) {
    console.error('[PATCH /api/admin/users/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const { id } = await params;
    if (id === admin.id) {
      return NextResponse.json(
        { error: 'Impossible de supprimer son propre compte' },
        { status: 400 },
      );
    }
    const user = await db.user.findUnique({
      where: { id },
      select: { email: true, role: true, ownedProperties: { select: { id: true } } },
    });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }
    if (user.ownedProperties.length > 0) {
      return NextResponse.json(
        {
          error: `Ce compte possède ${user.ownedProperties.length} bien(s). Réassignez ou supprimez les biens avant suppression.`,
        },
        { status: 409 },
      );
    }

    await db.user.delete({ where: { id } });
    await logAudit({
      actor: admin,
      action: 'user.delete',
      entityType: 'user',
      entityId: id,
      details: { email: user.email, role: user.role },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({ ok: true, message: 'Compte supprimé' });
  } catch (error) {
    console.error('[DELETE /api/admin/users/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur (dépendances du compte)' }, { status: 500 });
  }
}
