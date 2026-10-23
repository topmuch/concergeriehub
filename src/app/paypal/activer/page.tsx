import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Clock, ShieldCheck, XCircle } from 'lucide-react';
import { getHostPlan } from '@/lib/billing';
import { checkHubPending } from '@/lib/hub-fulfillment';
import { HubActivationForm } from '@/components/paypal/hub-activation-form';

export const metadata: Metadata = {
  title: 'Activez votre accès — RoomScan Hub',
  robots: { index: false, follow: false },
};

// =============================================================
// /paypal/activer?token=… — Création du compte hôte APRÈS approbation
// PayPal d'un achat PUBLIC Solo/Pro (v5.17, PUBLIC mais protégé par
// le jeton secret du retour). Vérification SERVEUR de la souscription
// PayPal (statut ACTIVE requis). États gérés :
//   ok            → formulaire d'activation (compte + connexion)
//   pending_paypal→ « confirmation en cours » + re-vérif auto
//   activated     → déjà activé → connexion
//   not_found / expired / not_paid / erreur → écran d'erreur explicite
// =============================================================

export default async function HubActivationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  const check = token ? await checkHubPending(token) : { ok: false as const, state: 'not_found' as const };

  const planName = check.plan ? (getHostPlan(check.plan)?.name ?? check.plan) : '';

  let body: React.ReactNode;

  if (check.state === 'ok' && token) {
    body = (
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
            Votre abonnement <strong>{planName}</strong> est actif chez PayPal. Choisissez vos
            identifiants pour ouvrir votre Hub.
          </p>
        </div>
        <HubActivationForm token={token} defaultEmail={check.payerEmail ?? ''} />
      </>
    );
  } else if (check.state === 'pending_paypal') {
    body = (
      <div className="py-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600"
        >
          <Clock className="h-6 w-6" />
        </span>
        <h1 className="font-serif text-2xl font-bold">Confirmation en cours…</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          PayPal finalise l&apos;activation de votre abonnement. Cette page se met à jour
          automatiquement — quelques secondes suffisent généralement.
        </p>
        {/* Re-vérification auto toutes les 5 s (la page est un server
            component : un reload re-passe dans checkHubPending). */}
        <script
          dangerouslySetInnerHTML={{
            __html: "setTimeout(function(){location.reload()},5000);",
          }}
        />
      </div>
    );
  } else if (check.state === 'activated') {
    body = (
      <div className="py-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600"
        >
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <h1 className="font-serif text-2xl font-bold">Cet achat est déjà activé</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          Votre abonnement {planName} est déjà rattaché à un compte. Connectez-vous pour ouvrir
          votre Hub.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-2xl bg-[linear-gradient(135deg,#055492,#033a66)] px-6 py-3 font-semibold text-white transition-all hover:scale-[1.02]"
        >
          Se connecter
        </Link>
      </div>
    );
  } else {
    const titles: Record<string, string> = {
      not_found: "Lien d'activation invalide",
      expired: "Ce lien d'activation a expiré",
      not_paid: 'Paiement non confirmé',
      erreur: 'Une erreur est survenue',
    };
    body = (
      <div className="py-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15 text-red-600"
        >
          <XCircle className="h-6 w-6" />
        </span>
        <h1 className="font-serif text-2xl font-bold">{titles[check.state] ?? 'Lien invalide'}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          {check.state === 'expired'
            ? 'Les liens d\u2019activation sont valables 72 h. Contactez le support pour un nouveau lien.'
            : check.state === 'not_paid'
              ? "Nous n'avons pas pu confirmer votre paiement PayPal pour ce lien. Si vous avez été débité, contactez le support — sinon, relancez simplement l'achat."
              : "Ce lien d'activation est invalide ou la vérification PayPal a échoué. Relancez l'achat depuis la page d'accueil ou contactez le support."}
        </p>
        <Link
          href="/#pricing"
          className="mt-6 inline-flex rounded-2xl border border-slate-200 bg-white px-6 py-3 font-semibold text-slate-900 transition-all hover:scale-[1.02] hover:border-slate-300"
        >
          Retour aux tarifs
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_6px_16px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] sm:p-8">
        {body}
      </div>
      <p className="mt-6 text-center text-xs text-slate-400">
        Besoin d&apos;aide ?{' '}
        <a href="mailto:contact@roomscan.pro" className="font-medium text-[#04467a] hover:underline">
          contact@roomscan.pro
        </a>
      </p>
    </div>
  );
}
