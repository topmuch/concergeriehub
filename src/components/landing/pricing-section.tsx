'use client';

// =============================================================
// PRICING V5.17 — 4 offres, 100 % PayPal, SANS essai gratuit.
//
//   Solo  : 29 €/mois  — 1 logement (carte blanche bordure slate).
//   Pro   : 99 €/mois  — conciergeries & multi-hôtes (bordure
//           gradient animée bleu logo + badge « Populaire »).
//   EDL   : 299 €/an   — 3 biens, EDL illimités (module standalone).
//   EDL Pro: 499 €/an  — jusqu'à 15 biens (module standalone).
//
// DEMANDE CLIENT (v5.17) :
//   • « enlève l'essai gratuit » → aucune mention d'essai, CTA =
//     paiement direct.
//   • « connecter toutes les offres tarifaires avec PayPal » →
//     Solo/Pro paient DIRECTEMENT via PayPal Subscriptions en public
//     (POST /api/paypal/public-subscribe → approveUrl → compte créé
//     au retour /paypal/activer) ; EDL/EDL Pro passent par le
//     parcours d'achat dédié /edl/abonnement (PayPal Orders).
//   Prix en font-serif TEXTE STATIQUE (v5.17 : plus de CountUp — le
//   compteur affichait « 0 € » tant que la carte n'était pas entrée
//   dans le viewport ; un prix ne dépend jamais d'une animation).
// =============================================================

import { useState } from 'react';
import { Check, CreditCard, FileText, Loader2 } from 'lucide-react';
import { MagneticButton } from '@/components/premium/magnetic-button';
import { Reveal } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';
import { AnimatedCheck } from './animated-check';

type GoToAuth = (mode: 'login' | 'register') => void;

const SOLO_FEATURES = [
  '1 Plaque QR Hub',
  'Wi-Fi & guidebook illimités',
  'Module upselling de base',
  'Support par email',
  'Analytics essentiels',
];

const PRO_FEATURES = [
  'Pour les conciergeries et multi-hôtes',
  'Jusqu’à 10 logements',
  'Équipe multi-rôles (ménage, maintenance)',
  'White-label complet',
  'Analytics avancés multi-biens',
  'Support prioritaire + API & Webhooks',
];

const EDL_FEATURES = [
  'Entrée & sortie en 5 étapes guidées',
  'États des lieux illimités pour 3 biens',
  'Génération de PDF illimitée',
  'Signature électronique de l’invité',
  'Partage par lien sécurisé (sans compte)',
];

const EDL_PRO_FEATURES = [
  'Tout le module États des Lieux inclus',
  'Jusqu’à 15 biens, EDL illimités',
  'Génération de PDF illimitée',
  'Signature électronique de l’invité',
  'Emails automatiques hôte + invité',
];

// ── Bouton PayPal direct (Solo / Pro — achat public sans compte) ──
type PayPalPhase = 'idle' | 'loading' | 'redirecting';

function PayPalSubscribeButton({
  plan,
  label,
  variant,
}: {
  plan: 'airbnb_solo' | 'airbnb_pro';
  label: string;
  variant: 'outline' | 'primary';
}) {
  const [phase, setPhase] = useState<PayPalPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setPhase('loading');
    try {
      const res = await fetch('/api/paypal/public-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingCycle: 'monthly' }),
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

  const base =
    'flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 font-semibold transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-80 disabled:hover:scale-100';
  const style =
    variant === 'primary'
      ? 'bg-[linear-gradient(135deg,#055492,#033a66)] text-white shadow-[0_8px_24px_rgba(4,70,122,0.28)] hover:shadow-[0_12px_32px_rgba(4,70,122,0.35)]'
      : 'border border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:shadow-md';

  return (
    <div>
      <button type="button" onClick={start} disabled={phase !== 'idle'} className={`${base} ${style}`}>
        {phase === 'idle' && (
          <>
            <CreditCard className="h-5 w-5" aria-hidden="true" />
            {label}
          </>
        )}
        {phase === 'loading' && (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Ouverture de PayPal…
          </>
        )}
        {phase === 'redirecting' && (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Redirection…
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-red-600">
          {error}
        </p>
      )}
      <p className="mt-2.5 text-center text-xs text-slate-400">
        Paiement sécurisé PayPal · Sans engagement
      </p>
    </div>
  );
}

// NB (v5.17) : le prop onGoToAuth reste accepté pour compatibilité
// d'appel, mais les CTA paient désormais DIRECTEMENT via PayPal.
export function PricingSection(_props: { onGoToAuth?: GoToAuth }) {
  const { t } = useLandingLang();
  return (
    <section
      id="pricing"
      className="relative scroll-mt-24 overflow-hidden bg-[#F7F7F8] py-24 text-slate-900"
    >
      {/* Texture + halos d'ambiance bleu logo (section opaque) */}
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(rgba(5, 84, 146,0.14)_1px,transparent_1px)] bg-[length:14px_14px] opacity-40" />
      <div
        aria-hidden="true"
        className="absolute -top-44 left-1/2 h-[480px] w-[820px] max-w-none -translate-x-1/2 rounded-full bg-[#055492]/[0.08] blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-[12%] h-72 w-72 rounded-full bg-[#04467a]/[0.07] blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 right-[12%] h-72 w-72 rounded-full bg-[#1173c7]/[0.07] blur-[120px]"
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6">
        {/* En-tête */}
        <Reveal className="mb-16 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#04467a]">
            {t('Tarifs')}
          </p>
          <h2 className="display-title font-serif! mb-4 text-4xl font-bold md:text-5xl">
            {t('Simple. Transparent.')}{' '}
            <span className="air-gradient-text font-serif italic">
              {t('Sans surprise.')}
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-slate-600">
            {t(
              'Choisissez l’offre adaptée à votre activité — paiement sécurisé PayPal, sans engagement.',
            )}
          </p>
        </Reveal>

        <div className="grid grid-cols-1 items-stretch gap-8 md:grid-cols-2 md:gap-10">
          {/* ── SOLO — 29 €/mois, PayPal direct ── */}
          <Reveal delay={0.1} className="h-full">
            <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_6px_16px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-shadow duration-500 hover:shadow-[0_12px_32px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)]">
              <div className="mb-6 flex items-center justify-between">
                <span className="text-4xl" aria-hidden="true">
                  🏠
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {t('1 logement')}
                </span>
              </div>
              <h3 className="mb-1 font-serif text-2xl font-bold">Solo</h3>
              <p className="text-sm text-slate-500">
                {t('Pour les hôtes avec un seul logement.')}
              </p>
              <div className="mb-8 mt-7 flex items-baseline gap-2">
                <span className="font-serif text-5xl font-bold md:text-6xl">
                  29 €
                </span>
                <span className="text-slate-400">{t('/ mois')}</span>
              </div>
              <ul className="mb-8 space-y-3.5">
                {SOLO_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
                      aria-hidden="true"
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="text-[15px] text-slate-600">{t(feature)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <PayPalSubscribeButton
                  plan="airbnb_solo"
                  label={t('Souscrire — 29 €/mois')}
                  variant="outline"
                />
              </div>
            </div>
          </Reveal>

          {/* ── PRO — 99 €/mois, bordure gradient animée + glow ── */}
          <Reveal delay={0.2} className="h-full">
            <div className="relative h-full">
              {/* Wrapper padding 1px + fond gradient animé BLEU LOGO = bordure */}
              <div className="animate-gradient h-full rounded-[1.7rem] bg-[linear-gradient(110deg,#04467a,#033a66,#04467a)] bg-[length:200%_auto] p-[1px] shadow-[0_0_80px_rgba(4, 70, 122,0.22)]">
                <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(1.7rem-1px)] bg-white p-8">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-[#055492]/[0.10] blur-3xl"
                  />
                  <div className="mb-6 flex items-center justify-between">
                    <span className="text-4xl" aria-hidden="true">
                      🏢
                    </span>
                    <span className="air-gradient animate-pulse-slow rounded-full px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-[0_8px_24px_rgba(4, 70, 122,0.30)]">
                      {t('Populaire')}
                    </span>
                  </div>
                  <h3 className="mb-1 font-serif text-2xl font-bold">Pro</h3>
                  <p className="text-sm text-slate-500">
                    {t('Pour les conciergeries et multi-hôtes.')}
                  </p>
                  <div className="mb-8 mt-7 flex items-baseline gap-2">
                    <span className="font-serif text-5xl font-bold md:text-6xl">
                      99 €
                    </span>
                    <span className="text-slate-400">{t('/ mois')}</span>
                  </div>
                  <ul className="mb-8 space-y-3.5">
                    {PRO_FEATURES.map((feature, i) => (
                      <li key={feature} className="flex items-start gap-3">
                        <AnimatedCheck delay={i * 0.08} />
                        <span className="text-[15px] text-slate-600">
                          {t(feature)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto">
                    <PayPalSubscribeButton
                      plan="airbnb_pro"
                      label={t('Souscrire — 99 €/mois')}
                      variant="primary"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* ── ÉTATS DES LIEUX — 299 €/an pour 3 biens ── */}
          <Reveal delay={0.3} className="h-full">
            <div className="relative flex h-full flex-col rounded-3xl border-2 border-[#055492]/25 bg-white p-8 shadow-[0_6px_16px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-500 hover:border-[#055492]/45 hover:shadow-[0_12px_32px_rgba(4, 70, 122,0.14),0_2px_6px_rgba(0,0,0,0.06)]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-16 right-8 h-36 w-56 rounded-full bg-[#055492]/[0.07] blur-3xl"
              />
              <div className="mb-6 flex items-center justify-between">
                <span className="text-4xl" aria-hidden="true">
                  📋
                </span>
                <span className="rounded-full border border-[#055492]/30 bg-[#055492]/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#04467a]">
                  {t('Module indépendant')}
                </span>
              </div>
              <h3 className="mb-1 font-serif text-2xl font-bold">États des Lieux</h3>
              <p className="text-sm text-slate-500">
                {t('Pour 3 biens — états des lieux illimités.')}
              </p>
              <div className="mb-7 mt-7 flex items-baseline gap-2">
                <span className="font-serif text-5xl font-bold md:text-6xl">
                  299 €
                </span>
                <span className="text-slate-400">{t('/ an')}</span>
              </div>
              <ul className="mb-8 space-y-3.5">
                {EDL_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
                      aria-hidden="true"
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="text-[15px] text-slate-600">{t(feature)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <a
                  href="/edl/abonnement"
                  className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(135deg,#055492,#033a66)] py-4 font-semibold text-white shadow-[0_8px_24px_rgba(4, 70, 122,0.28)] transition-all hover:scale-[1.02] hover:shadow-[0_12px_32px_rgba(4, 70, 122,0.35)]"
                >
                  <FileText className="h-5 w-5" aria-hidden="true" />
                  {t('Payer 299 € avec PayPal')}
                </a>
                <p className="mt-2.5 text-center text-xs text-slate-400">
                  {t('Paiement sécurisé PayPal · Accès immédiat')}
                </p>
              </div>
            </div>
          </Reveal>

          {/* ── ÉTATS DES LIEUX PRO — 499 €/an jusqu'à 15 biens ── */}
          <Reveal delay={0.4} className="h-full">
            <div className="relative flex h-full flex-col rounded-3xl border-2 border-[#04467a]/40 bg-white p-8 shadow-[0_6px_16px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-500 hover:border-[#04467a]/60 hover:shadow-[0_12px_32px_rgba(4, 70, 122,0.16),0_2px_6px_rgba(0,0,0,0.06)]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-16 right-8 h-36 w-56 rounded-full bg-[#04467a]/[0.09] blur-3xl"
              />
              <div className="mb-6 flex items-center justify-between">
                <span className="text-4xl" aria-hidden="true">
                  🏆
                </span>
                <span className="rounded-full bg-[#04467a] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                  {t('Grandes équipes')}
                </span>
              </div>
              <h3 className="mb-1 font-serif text-2xl font-bold">
                États des Lieux <span className="italic">Pro</span>
              </h3>
              <p className="text-sm text-slate-500">
                {t('Jusqu’à 15 biens — états des lieux illimités.')}
              </p>
              <div className="mb-7 mt-7 flex items-baseline gap-2">
                <span className="font-serif text-5xl font-bold md:text-6xl">
                  499 €
                </span>
                <span className="text-slate-400">{t('/ an')}</span>
              </div>
              <ul className="mb-8 space-y-3.5">
                {EDL_PRO_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
                      aria-hidden="true"
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="text-[15px] text-slate-600">{t(feature)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <a
                  href="/edl/abonnement?plan=edl_pro_annual"
                  className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(135deg,#04467a,#022c4f)] py-4 font-semibold text-white shadow-[0_8px_24px_rgba(4, 70, 122,0.32)] transition-all hover:scale-[1.02] hover:shadow-[0_12px_32px_rgba(4, 70, 122,0.4)]"
                >
                  <FileText className="h-5 w-5" aria-hidden="true" />
                  {t('Payer 499 € avec PayPal')}
                </a>
                <p className="mt-2.5 text-center text-xs text-slate-400">
                  {t('Paiement sécurisé PayPal · Accès immédiat')}
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Note bas de section */}
        <Reveal delay={0.3} className="mt-14 text-center">
          <p className="text-sm text-slate-500">
            {t('Au-delà de 15 biens,')}{' '}
            <a
              href="#contact"
              onClick={(e) => {
                e.preventDefault();
                document
                  .querySelector('#contact')
                  ?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="font-medium text-[#04467a] underline decoration-[#04467a]/40 underline-offset-4 transition-colors hover:text-[#033a66]"
            >
              {t('contactez-nous')}
            </a>{' '}
            {t('pour un devis sur mesure.')}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
