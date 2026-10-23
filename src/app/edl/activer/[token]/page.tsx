import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { db } from '@/lib/db';
import { EdlActivationForm } from '@/components/edl/edl-activation-form';

export const metadata: Metadata = {
  title: 'Activez votre accès — États des Lieux | RoomScan',
  robots: { index: false, follow: false },
};

// =============================================================
// /edl/activer/[token] — Création du compte APRÈS paiement PayPal
// (PUBLIC, mais protégé par le jeton secret délivré au retour).
// Le jeton doit correspondre à un achat : 'paid', non expiré (72 h),
// non déjà activé. Sinon : écran d'erreur explicite (aucun formulaire).
// =============================================================

export default async function EdlActivatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const purchase = await db.edlPurchase.findUnique({
    where: { activationToken: token },
    select: { status: true, activationExpiresAt: true, amountEur: true },
  });

  const expired = Boolean(
    purchase && purchase.activationExpiresAt.getTime() < Date.now(),
  );
  const usable = Boolean(
    purchase && purchase.status === 'paid' && !expired,
  );

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_6px_16px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] sm:p-8">
        {usable ? (
          <>
            <div className="mb-6 text-center">
              <span
                aria-hidden="true"
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600"
              >
                <ShieldCheck className="h-6 w-6" />
              </span>
              <h1 className="font-serif text-2xl font-bold sm:text-3xl">
                Paiement confirmé — activez votre accès
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Votre paiement de {purchase?.amountEur ?? 299} € est validé. Choisissez vos
                identifiants pour ouvrir votre tableau de bord des États des Lieux.
              </p>
            </div>
            <EdlActivationForm token={token} />
          </>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="font-serif text-2xl font-bold sm:text-3xl">
                {purchase?.status === 'activated'
                  ? 'Cet accès est déjà activé ✅'
                  : expired
                    ? "Lien d'activation expiré"
                    : "Lien d'activation invalide"}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {purchase?.status === 'activated'
                  ? 'Votre compte a déjà été créé avec ce paiement. Connectez-vous pour ouvrir votre tableau de bord.'
                  : expired
                    ? 'Ce lien expire 72 h après le paiement. Écrivez-nous et nous vous enverrons un nouveau lien.'
                    : "Ce lien ne correspond à aucun paiement confirmé. Vérifiez l'URL ou reprenez l'achat."}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {purchase?.status === 'activated' ? (
                <Link
                  href="/"
                  className="rounded-2xl bg-[linear-gradient(135deg,#055492,#033a66)] py-3.5 text-center font-semibold text-white transition-transform hover:scale-[1.01]"
                >
                  Se connecter
                </Link>
              ) : (
                <Link
                  href="/edl/abonnement"
                  className="rounded-2xl bg-[linear-gradient(135deg,#055492,#033a66)] py-3.5 text-center font-semibold text-white transition-transform hover:scale-[1.01]"
                >
                  Revenir à l&apos;offre
                </Link>
              )}
              <a
                href="mailto:contact@roomscan.pro"
                className="rounded-2xl border border-slate-200 bg-white py-3.5 text-center font-semibold text-slate-700 transition-colors hover:border-slate-300"
              >
                Contacter le support
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
