import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { normalizeMemberRole } from '@/lib/team';
import { BillingContent, type CurrentSubscriptionView } from '@/components/airbnb/billing-content';
import { getHostPlan } from '@/lib/billing';
import { RestrictedAccess } from '@/components/airbnb/host/restricted-access';

export const metadata: Metadata = {
  title: 'Abonnement — Conciergerie Hub',
  description: 'Gérez votre abonnement Airbnb Solo ou Airbnb Pro.',
};

// ÉTAPE 10 — Page facturation de l'Espace Hôte.
// Session requise ; charge l'abonnement actif et le mode Stripe
// (réel ou démo) puis délègue l'interactivité au composant client.
// GARDE DE RÔLE : un CLEANER / MAINTENANCE (équipe, sans rôle de
// gestion sur aucun bien) n'accède pas à la facturation.
// Le shell (sidebar + header) est fourni par /airbnb/layout.tsx.
export default async function BillingPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!session?.user || !userId) {
    redirect('/');
  }
  if (role !== 'user') {
    // La console Superadmin a sa propre section /admin
    redirect('/admin/dashboard');
  }

  // ── Garde de rôle : facturation réservée aux gestionnaires ──
  const [ownedCount, memberships] = await Promise.all([
    db.property.count({ where: { ownerId: userId } }),
    db.propertyMember.findMany({
      where: { userId, acceptedAt: { not: null } },
      select: { role: true },
    }),
  ]);
  const isManagerSomewhere = memberships.some((m) => {
    const r = normalizeMemberRole(m.role);
    return r === 'OWNER' || r === 'MANAGER';
  });
  if (ownedCount === 0 && !isManagerSomewhere) {
    return <RestrictedAccess feature="la facturation" />;
  }

  const [user, activeSub, isStripeMode] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true, selectedPlan: true },
    }),
    db.subscription.findFirst({
      where: { userId, status: { in: ['active', 'trialing', 'past_due'] } },
      orderBy: { createdAt: 'desc' },
    }),
    Promise.resolve(Boolean(process.env.STRIPE_SECRET_KEY)),
  ]);

  let current: CurrentSubscriptionView | null = null;
  if (activeSub) {
    const plan = getHostPlan(activeSub.plan);
    current = {
      planId: activeSub.plan,
      planName: plan?.name ?? activeSub.plan,
      planEmoji: plan?.emoji ?? '⭐',
      status: activeSub.status,
      billingCycle: activeSub.billingCycle,
      amount: activeSub.amount,
      currentPeriodEnd: activeSub.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  return (
    <BillingContent
      host={{
        name: user?.fullName ?? null,
        email: user?.email ?? '',
        selectedPlan: user?.selectedPlan ?? null,
      }}
      current={current}
      stripeMode={isStripeMode}
    />
  );
}
