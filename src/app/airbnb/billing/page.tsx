import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { CreditCard } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { BillingContent, type CurrentSubscriptionView } from '@/components/airbnb/billing-content';
import { getHostPlan } from '@/lib/billing';

export const metadata: Metadata = {
  title: 'Abonnement — RoomScan',
  description: 'Gérez votre abonnement Airbnb Solo ou Airbnb Pro.',
};

// ÉTAPE 10 — Page facturation de l'Espace Hôte.
// Session requise ; charge l'abonnement actif et le mode Stripe
// (réel ou démo) puis délègue l'interactivité au composant client.
// GARDE DE RÔLE (audit 4-c — durcie) : la facturation est réservée
// au PROPRIÉTAIRE du compte — un MANAGER membre d'équipe (comme un
// CLEANER / MAINTENANCE) n'y accède pas : seuls les biens possédés
// (Property.ownerId) ouvrent cette page.
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

  // ── Garde de rôle : facturation réservée au propriétaire du compte ──
  const ownedCount = await db.property.count({ where: { ownerId: userId } });
  if (ownedCount === 0) {
    return <OwnerOnlyBilling />;
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
      // v4.95 — route la Résiliation vers Stripe ou PayPal (cf. UI).
      paymentProvider: activeSub.paymentProvider ?? 'stripe',
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

// ── Écran de garde owner-only (audit 4-c) : carte élégante, pas
// d'erreur brute. Les membres d'équipe (CLEANER / MAINTENANCE /
// MANAGER non propriétaires) retournent vers leur espace. ──
function OwnerOnlyBilling() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100"
        >
          <CreditCard className="h-7 w-7 text-slate-500" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-slate-900">
          Facturation réservée au propriétaire du compte
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Les moyens de paiement et l&apos;abonnement sont gérés par le propriétaire
          des biens. Votre rôle dans l&apos;équipe vous donne accès à vos tâches et
          aux informations de terrain, mais pas à la facturation.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Besoin d&apos;une facture ? Contactez le propriétaire du compte.
        </p>
        <Link
          href="/airbnb/dashboard"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-[#0066EF] px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#0052C4]"
        >
          ← Retour à la vue d&apos;ensemble
        </Link>
      </div>
    </div>
  );
}
