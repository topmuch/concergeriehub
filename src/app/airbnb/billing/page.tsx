import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { DashboardShell } from '@/components/airbnb/dashboard-shell';
import { BillingContent, type CurrentSubscriptionView } from '@/components/airbnb/billing-content';
import { getHostPlan } from '@/lib/billing';

export const metadata: Metadata = {
  title: 'Abonnement — Conciergerie Hub',
  description: 'Gérez votre abonnement Airbnb Solo ou Airbnb Pro.',
};

// ÉTAPE 10 — Page facturation de l'Espace Hôte.
// Session requise ; charge l'abonnement actif et le mode Stripe
// (réel ou démo) puis délègue l'interactivité au composant client.
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
    <DashboardShell userName={user?.fullName ?? user?.email ?? null}>
      <BillingContent
        host={{
          name: user?.fullName ?? null,
          email: user?.email ?? '',
          selectedPlan: user?.selectedPlan ?? null,
        }}
        current={current}
        stripeMode={isStripeMode}
      />
    </DashboardShell>
  );
}
