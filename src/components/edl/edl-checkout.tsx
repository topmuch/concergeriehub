'use client';

// =============================================================
// /edl/abonnement — Page d'achat des offres EDL (PUBLIC).
//
// v5.17 — 2 offres (query ?plan=) :
//   • ?plan=edl_annual (défaut) : 299 €/an pour 3 biens ;
//   • ?plan=edl_pro_annual      : 499 €/an jusqu'à 15 biens.
//
// Résumé de l'offre + bouton « Payer avec PayPal » :
//   POST /api/edl/paypal/order { plan } → { approveUrl } → redirection
//   vers PayPal. Retour : /edl/paiement/retour (capture serveur) puis
//   /edl/activer/[token] (création du compte).
//   Annulation : retour ici avec ?annule=1 (+ plan conservé).
//   Échec capture : retour ici avec ?erreur=1.
// =============================================================

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Check,
  CreditCard,
  Loader2,
  ShieldCheck,
  FileSignature,
  ScanSearch,
} from 'lucide-react';
import { EDL_PLANS, EDL_PLAN, getEdlPlan, type EdlPlanId } from '@/lib/edl-paypal';

type Phase = 'idle' | 'loading' | 'redirecting';

const SHARED_FEATURES = [
  'États des lieux d’entrée et de sortie en 5 étapes guidées',
  'Génération de PDF illimitée, prête pour les assurances',
  'Signature électronique de l’invité sur place',
  'Invitation de l’invité par lien sécurisé (sans compte)',
  'Emails automatiques hôte + invité à chaque étape',
  'Historique archivé et consultable à tout moment',
];

export function EdlCheckout() {
  const params = useSearchParams();
  const requestedPlan: EdlPlanId = getEdlPlan(params.get('plan') ?? '')?.id ?? EDL_PLAN;
  const planConfig = EDL_PLANS[requestedPlan];
  const isPro = requestedPlan === 'edl_pro_annual';

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(
    params.get('erreur')
      ? "Le paiement n'a pas pu être confirmé — aucun montant n'a été débité. Vous pouvez réessayer."
      : null,
  );
  const cancelled = Boolean(params.get('annule'));

  const startPayment = async () => {
    setError(null);
    setPhase('loading');
    try {
      const res = await fetch('/api/edl/paypal/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: requestedPlan }),
      });
      const data = (await res.json().catch(() => null)) as {
        approveUrl?: string;
        error?: string;
      } | null;
      if (res.ok && data?.approveUrl) {
        setPhase('redirecting');
        window.location.href = data.approveUrl;
        return;
      }
      setError(
        data?.error ??
          'Impossible de démarrer le paiement pour le moment. Réessayez dans un instant.',
      );
      setPhase('idle');
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau et réessayez.');
      setPhase('idle');
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      {/* ── Bandeaux d'état (annulation / erreur) ── */}
      {cancelled && !error && (
        <div
          role="status"
          className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Paiement annulé — aucun montant n&apos;a été débité. Vous pouvez réessayer quand vous
          voulez.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* ── Sélecteur d'offre (299 / 499) ── */}
      <div className="mb-6 grid grid-cols-2 gap-3" role="tablist" aria-label="Choisissez votre offre">
        {(['edl_annual', 'edl_pro_annual'] as const).map((p) => {
          const cfg = EDL_PLANS[p];
          const active = p === requestedPlan;
          return (
            <a
              key={p}
              href={`/edl/abonnement?plan=${p}`}
              role="tab"
              aria-selected={active}
              className={`rounded-2xl border-2 p-4 text-center transition-all ${
                active
                  ? 'border-[#055492] bg-[#055492]/[0.06] shadow-[0_8px_24px_rgba(4,70,122,0.14)]'
                  : 'border-slate-200 bg-white hover:border-[#055492]/40'
              }`}
            >
              <p className="text-sm font-bold text-slate-900">
                {p === 'edl_pro_annual' ? (
                  <>
                    États des Lieux <span className="italic">Pro</span>
                  </>
                ) : (
                  'États des Lieux'
                )}
              </p>
              <p className="mt-1 font-serif text-2xl font-bold text-slate-900">
                {cfg.price} € <span className="text-xs font-normal text-slate-500">/ an</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {p === 'edl_pro_annual' ? "Jusqu'à 15 biens" : 'Pour 3 biens'}
              </p>
            </a>
          );
        })}
      </div>

      {/* ── Carte offre ── */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_6px_16px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#055492_0%,#033a66_100%)] px-6 py-8 text-white sm:px-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-white/80">
            Module indépendant
          </p>
          <h1 className="font-serif text-3xl font-bold sm:text-4xl">
            États des Lieux{' '}
            {isPro && <span className="font-serif italic">Pro</span>}
          </h1>
          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            <span className="font-serif text-5xl font-bold">{planConfig.price} €</span>
            <span className="text-white/80">
              / an — {isPro ? "jusqu'à 15 biens" : 'pour 3 biens'}, EDL illimités
            </span>
          </div>
        </div>

        <div className="px-6 py-7 sm:px-8">
          <ul className="mb-8 space-y-3.5">
            {SHARED_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span className="text-[15px] text-slate-600">{feature}</span>
              </li>
            ))}
          </ul>

          {/* ── CTA PayPal ── */}
          <button
            type="button"
            onClick={startPayment}
            disabled={phase !== 'idle'}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(135deg,#055492,#033a66)] py-4 font-semibold text-white shadow-[0_8px_24px_rgba(4, 70, 122,0.30)] transition-all hover:scale-[1.01] hover:shadow-[0_12px_32px_rgba(4, 70, 122,0.35)] disabled:cursor-not-allowed disabled:opacity-80 disabled:hover:scale-100"
          >
            {phase === 'idle' ? (
              <>
                <CreditCard className="h-5 w-5" aria-hidden="true" />
                Payer {planConfig.price} € avec PayPal
              </>
            ) : (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                {phase === 'loading' ? 'Ouverture de PayPal…' : 'Redirection…'}
              </>
            )}
          </button>
          <p className="mt-3 text-center text-xs text-slate-500">
            Paiement sécurisé par PayPal — carte bancaire acceptée, sans compte PayPal obligatoire.
          </p>

          {/* ── Étapes post-paiement ── */}
          <ol className="mt-8 space-y-4 border-t border-slate-100 pt-6">
            {[
              {
                icon: ShieldCheck,
                title: '1. Paiement confirmé',
                text: `PayPal nous confirme votre paiement de ${planConfig.price} €.`,
              },
              {
                icon: ScanSearch,
                title: '2. Création de votre compte',
                text: 'Vous choisissez votre email et votre mot de passe (2 minutes).',
              },
              {
                icon: FileSignature,
                title: '3. Votre tableau de bord EDL',
                text: 'Vous créez et partagez vos états des lieux immédiatement.',
              },
            ].map((step) => (
              <li key={step.title} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#055492]/10 text-[#04467a]"
                >
                  <step.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                  <p className="text-sm text-slate-500">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Déjà un compte et un abonnement actif ?{' '}
        <a href="/inspection/dashboard" className="font-medium text-[#04467a] hover:underline">
          Ouvrir mon tableau de bord
        </a>
      </p>
    </div>
  );
}
