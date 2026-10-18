'use client';

// =============================================================
// SECTION AVANT / APRÈS — split-screen émotionnel
//
//   Avant  : fond rose, icône 😫, 4 irritants avec shake au hover
//   Après  : fond émeraude, icône 🚀, 4 solutions dont la coche
//            « se dessine » (pathLength au inView)
//   Séparateur central : trait gradient vertical (desktop) /
//   horizontal (mobile). Empilé sur mobile.
//   v5.1 (COLOR-A) — eyebrow bleu logo, séparateur central
//   #0066EF→#0052C4→#3B82F6 (accent bleu), sémantique
//   rose (avant) / émeraude (après) conservée.
// =============================================================

import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Reveal } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';
import { AnimatedCheck } from './animated-check';

const BEFORE_ITEMS = [
  'Le Wi-Fi écrit sur un post-it perdu',
  '20 messages « où est la clé ? »',
  'Un guidebook papier périmé',
  'Des avis mitigés, visibles par tous',
];

const AFTER_ITEMS = [
  'Wi-Fi auto-connecté en 1 scan',
  'Accueil digitalisé, zéro allers-retours',
  'Guidebook toujours à jour, dans la poche',
  'Problèmes résolus en privé, avant l’avis public',
];

export function BeforeAfter() {
  const { t } = useLandingLang();
  return (
    <section id="avant-apres" className="relative scroll-mt-24 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* En-tête */}
        <Reveal className="mb-14 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#0052C4]">
            {t('La différence')}
          </p>
          <h2 className="display-title font-serif! mb-4 text-4xl font-bold text-slate-900 md:text-5xl">
            {t("Du chaos papier à l'expérience")}{' '}
            <span className="air-gradient-text font-serif italic">
              {t('5 étoiles')}
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-slate-600">
            {t('Vos invités ne verront que la version de droite.')}
          </p>
        </Reveal>

        <div className="relative grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10">
          {/* Séparateur central — vertical (desktop) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 hidden h-2/3 w-px -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-[#0066EF] via-[#0052C4] to-[#3B82F6] opacity-70 md:block"
          />

          {/* ── AVANT ── */}
          <Reveal>
            <div className="h-full rounded-3xl border border-rose-200/80 bg-rose-50 p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-4">
                <span className="text-4xl" aria-hidden="true">
                  😫
                </span>
                <div>
                  <h3 className="font-serif text-2xl font-bold text-rose-900">
                    {t('Avant')}
                  </h3>
                  <p className="text-sm text-rose-700/70">
                    {t("La gestion à l'ancienne")}
                  </p>
                </div>
              </div>
              <ul className="space-y-4">
                {BEFORE_ITEMS.map((item, i) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={{ duration: 0.5, delay: i * 0.1 }}
                    whileHover={{
                      x: [0, -3, 3, -2, 2, 0],
                      transition: { duration: 0.4, delay: 0 },
                    }}
                    className="flex cursor-default items-start gap-3 text-slate-700"
                  >
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-600"
                      aria-hidden="true"
                    >
                      <X className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="text-[15px] leading-relaxed">{t(item)}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </Reveal>

          {/* Séparateur central — horizontal (mobile) */}
          <div
            aria-hidden="true"
            className="mx-auto h-px w-3/4 bg-gradient-to-r from-[#0066EF] via-[#0052C4] to-[#3B82F6] opacity-70 md:hidden"
          />

          {/* ── APRÈS ── */}
          <Reveal delay={0.15}>
            <div className="h-full rounded-3xl border border-emerald-200/80 bg-emerald-50 p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-4">
                <span className="text-4xl" aria-hidden="true">
                  🚀
                </span>
                <div>
                  <h3 className="font-serif text-2xl font-bold text-emerald-900">
                    {t('Après')}
                  </h3>
                  <p className="text-sm text-emerald-700/70">
                    {t('Avec RoomScan')}
                  </p>
                </div>
              </div>
              <ul className="space-y-4">
                {AFTER_ITEMS.map((item, i) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: 16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={{ duration: 0.5, delay: i * 0.12 }}
                    className="flex items-start gap-3 text-slate-700"
                  >
                    <AnimatedCheck delay={i * 0.12} />
                    <span className="text-[15px] font-medium leading-relaxed">
                      {t(item)}
                    </span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
