'use client';

// =============================================================
// PRICING PREMIUM V6.2 — 3 offres (Solo / Pro / États des Lieux).
//
//   Solo : carte blanche bordure slate + .air-shadow.
//   Pro  : carte blanche + BORDURE GRADIENT ANIMÉE BLEU LOGO
//          (technique double div : wrapper p-[1px] à fond gradient
//          animé #0052C4→#0047B3→#0052C4 + carte intérieure
//          blanche), badge « Populaire » air-gradient pulsant,
//          glow bleu doux, features avec coches qui se dessinent.
//   EDL  : module standalone vendu DIRECTEMENT (PayPal, 299 €/an,
//          PDF illimités) — CTA vers /edl/abonnement (parcours
//          d'achat dédié, hors inscription Hub). Grille 2 col en
//          md (carte EDL pleine largeur, contenu horizontal) puis
//          3 colonnes en lg.
//   Section claire (#F7F7F8) — l'ancienne version slate-950 est
//   passée au clair « AIRBNB PRO » (v4.61).
//   Prix en font-serif avec <CountUp> au scroll (format fr-FR).
//
// LOGIQUE D'ABONNEMENT PRÉSERVÉE : les CTA Solo/Pro appellent
// onGoToAuth('register') — parcours d'inscription → Stripe,
// identique à la V5. L'EDL sort du flux (achat direct PayPal).
// =============================================================

import { Check, FileText } from 'lucide-react';
import { CountUp } from '@/components/premium/count-up';
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
  'Jusqu’à 3 logements inclus',
  'Équipe multi-rôles (ménage, maintenance)',
  'White-label complet',
  'Analytics avancés multi-biens',
  'Support prioritaire 24/7',
  'API & Webhooks',
];

const EDL_FEATURES = [
  'Entrée & sortie en 5 étapes guidées',
  'Génération de PDF illimitée',
  'Signature électronique de l’invité',
  'Partage par lien sécurisé (sans compte)',
  'Emails automatiques hôte + invité',
];

export function PricingSection({ onGoToAuth }: { onGoToAuth?: GoToAuth }) {
  const { t } = useLandingLang();
  return (
    <section
      id="pricing"
      className="relative scroll-mt-24 overflow-hidden bg-[#F7F7F8] py-24 text-slate-900"
    >
      {/* Texture + halos d'ambiance bleu logo (section opaque) */}
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(rgba(0,102,239,0.14)_1px,transparent_1px)] bg-[length:14px_14px] opacity-40" />
      <div
        aria-hidden="true"
        className="absolute -top-44 left-1/2 h-[480px] w-[820px] max-w-none -translate-x-1/2 rounded-full bg-[#0066EF]/[0.08] blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-[12%] h-72 w-72 rounded-full bg-[#0052C4]/[0.07] blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 right-[12%] h-72 w-72 rounded-full bg-[#3B82F6]/[0.07] blur-[120px]"
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6">
        {/* En-tête */}
        <Reveal className="mb-16 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#0052C4]">
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
              "Choisissez l'offre adaptée à votre activité. 14 jours d'essai, sans engagement.",
            )}
          </p>
        </Reveal>

        <div className="grid grid-cols-1 items-stretch gap-8 md:grid-cols-2 md:gap-10 lg:grid-cols-3">
          {/* ── SOLO — carte blanche bordure slate ── */}
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
                  <CountUp end={9.9} decimals={2} /> €
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
              <button
                type="button"
                onClick={() => onGoToAuth?.('register')}
                className="mt-auto w-full rounded-2xl border border-slate-200 bg-white py-4 font-semibold text-slate-900 transition-all hover:scale-[1.02] hover:border-slate-300 hover:shadow-md"
              >
                {t("Commencer l'essai")}
              </button>
            </div>
          </Reveal>

          {/* ── PRO — bordure gradient animée + glow ── */}
          <Reveal delay={0.2} className="h-full">
            <div className="relative h-full">
              {/* Wrapper padding 1px + fond gradient animé BLEU LOGO = bordure */}
              <div className="animate-gradient h-full rounded-[1.7rem] bg-[linear-gradient(110deg,#0052C4,#0047B3,#0052C4)] bg-[length:200%_auto] p-[1px] shadow-[0_0_80px_rgba(0,82,196,0.22)]">
                <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(1.7rem-1px)] bg-white p-8">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-[#0066EF]/[0.10] blur-3xl"
                  />
                  <div className="mb-6 flex items-center justify-between">
                    <span className="text-4xl" aria-hidden="true">
                      🏢
                    </span>
                    <span className="air-gradient animate-pulse-slow rounded-full px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-[0_8px_24px_rgba(0,82,196,0.30)]">
                      {t('Populaire')}
                    </span>
                  </div>
                  <h3 className="mb-1 font-serif text-2xl font-bold">Pro</h3>
                  <p className="text-sm text-slate-500">
                    {t('Pour les conciergeries et multi-hôtes.')}
                  </p>
                  <div className="mb-8 mt-7 flex items-baseline gap-2">
                    <span className="font-serif text-5xl font-bold md:text-6xl">
                      <CountUp end={199} /> €
                    </span>
                    <span className="text-slate-400">{t('/ an')}</span>
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
                    <MagneticButton
                      onClick={() => onGoToAuth?.('register')}
                      className="w-full py-4 text-base"
                    >
                      {t('Passer à Pro')}
                      <span aria-hidden="true">→</span>
                    </MagneticButton>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* ── ÉTATS DES LIEUX — module vendu directement (PayPal) ── */}
          <Reveal delay={0.3} className="h-full md:col-span-2 lg:col-span-1">
            <div className="relative flex h-full flex-col rounded-3xl border-2 border-[#0066EF]/25 bg-white p-8 shadow-[0_6px_16px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-500 hover:border-[#0066EF]/45 hover:shadow-[0_12px_32px_rgba(0,82,196,0.14),0_2px_6px_rgba(0,0,0,0.06)]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-16 right-8 h-36 w-56 rounded-full bg-[#0066EF]/[0.07] blur-3xl"
              />
              <div className="mb-6 flex items-center justify-between">
                <span className="text-4xl" aria-hidden="true">
                  📋
                </span>
                <span className="rounded-full border border-[#0066EF]/30 bg-[#0066EF]/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#0052C4]">
                  {t('Module indépendant')}
                </span>
              </div>
              <h3 className="mb-1 font-serif text-2xl font-bold">États des Lieux</h3>
              <p className="text-sm text-slate-500">
                {t('Le module des conciergeries qui veulent des EDL impeccables.')}
              </p>
              <div className="mb-7 mt-7 flex items-baseline gap-2">
                <span className="font-serif text-5xl font-bold md:text-6xl">
                  <CountUp end={299} /> €
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
                  className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(135deg,#0066EF,#0047B3)] py-4 font-semibold text-white shadow-[0_8px_24px_rgba(0,82,196,0.28)] transition-all hover:scale-[1.02] hover:shadow-[0_12px_32px_rgba(0,82,196,0.35)]"
                >
                  <FileText className="h-5 w-5" aria-hidden="true" />
                  {t('Payer 299 € — PDF illimités')}
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
            {t('Au-delà de 3 logements,')}{' '}
            <a
              href="#contact"
              onClick={(e) => {
                e.preventDefault();
                document
                  .querySelector('#contact')
                  ?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="font-medium text-[#0052C4] underline decoration-[#0052C4]/40 underline-offset-4 transition-colors hover:text-[#0047B3]"
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
