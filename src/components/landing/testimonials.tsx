'use client';

// =============================================================
// LANCEMENT — section « premiers hôtes » (v5.0, honnête).
//
// REMPLACE l'ancien marquee de 6 témoignages INVENTÉS (Claire
// Dubois, Julien Marchand…) : RoomScan vient d'ouvrir, il n'y a
// pas encore d'avis réels — afficher de faux témoignages était
// mensonger (et l'aggregateRating a déjà été retiré du JSON-LD).
//
// Nouveau contenu :
//   • En-tête transparent sur le lancement.
//   • 3 cartes « Avantages fondateurs » (tarif à vie, accompagnement
//     dédié, roadmap votée) — icônes Lucide, cartes claires
//     .air-shadow, cohérence design landing (accent bleu logo).
//   • Bandeau CTA « Devenir hôte fondateur » → ouvre l'auth
//     (onGoToAuth('register'), même mécanique que Pricing/CtaFinal).
//   • Grille animée simple (Reveal) — plus de marquee ni de fausses
//     personnes/étoiles.
// =============================================================

import { ArrowRight, Handshake, Trophy, Vote } from 'lucide-react';
import { MagneticButton } from '@/components/premium/magnetic-button';
import { Reveal } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';

type GoToAuth = (mode: 'login' | 'register') => void;

/** Avantages fondateurs — clés = texte FR exact (landing-i18n). */
const FOUNDER_PERKS = [
  {
    icon: Trophy,
    title: 'Tarif fondateur garanti à vie',
    description:
      "Votre tarif d'inscription est verrouillé pour toujours — même quand de nouvelles fonctionnalités arrivent.",
  },
  {
    icon: Handshake,
    title: 'Accompagnement premium dédié',
    description:
      'Notre équipe configure vos hubs avec vous, de la plaque au guidebook. Réponse sous 24 h, 7j/7.',
  },
  {
    icon: Vote,
    title: 'Votre voix compte',
    description:
      'Les prochaines fonctionnalités sont votées par les premiers hôtes. Façonnez RoomScan avec nous.',
  },
] as const;

export function Testimonials({ onGoToAuth }: { onGoToAuth?: GoToAuth }) {
  const { t } = useLandingLang();

  return (
    <section
      id="temoignages"
      className="relative scroll-mt-24 overflow-hidden bg-white py-24 text-slate-900"
    >
      {/* Halo d'ambiance bleu logo (inchangé) */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-0 h-64 w-[700px] max-w-none -translate-x-1/2 rounded-full bg-[#055492]/[0.06] blur-[120px]"
      />

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        {/* En-tête — message honnête de lancement */}
        <Reveal className="mb-14 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#04467a]">
            {t('Lancement')}
          </p>
          <h2 className="display-title font-serif! mb-4 text-4xl font-bold md:text-5xl">
            {t('Rejoignez les premiers hôtes RoomScan')}
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-slate-600">
            {t(
              "RoomScan vient d'ouvrir. Les premiers avis hôtes arrivent dès les premiers séjours — soyez parmi ceux qui les écriront.",
            )}
          </p>
        </Reveal>

        {/* 3 cartes « Avantages fondateurs » */}
        <div
          className="grid grid-cols-1 gap-6 md:grid-cols-3"
          role="list"
          aria-label={t('Avantages fondateurs')}
        >
          {FOUNDER_PERKS.map((perk, i) => (
            <Reveal key={perk.title} delay={0.1 + i * 0.12}>
              <article
                role="listitem"
                className="air-shadow h-full rounded-3xl border border-slate-200/70 bg-white p-6 transition-transform duration-500 hover:-translate-y-1.5 sm:p-8"
              >
                {/* Icône dans un anneau gradient bleu logo (cohérence landing) */}
                <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#055492,#033a66)] text-white shadow-[0_8px_20px_rgba(4, 70, 122,0.30)]">
                  <perk.icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mb-2 font-serif text-xl font-bold text-slate-900">
                  {t(perk.title)}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  {t(perk.description)}
                </p>
              </article>
            </Reveal>
          ))}
        </div>

        {/* Bandeau CTA — devenir hôte fondateur (ouvre l'auth) */}
        <Reveal delay={0.25} className="mt-14 text-center">
          <MagneticButton
            onClick={() => onGoToAuth?.('register')}
            className="px-8 py-4 text-base"
          >
            {t('Devenir hôte fondateur')}
            <ArrowRight className="h-5 w-5" />
          </MagneticButton>
          <p className="mt-5 text-sm text-slate-500">
            {t("Places limitées à la première vague d'hôtes — sans engagement.")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
