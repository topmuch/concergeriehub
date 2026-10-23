'use client';

// =============================================================
// COMMENT ÇA MARCHE — 3 étapes premium (cartes claires + serif).
// Garde l'ancre #how-it-works et le contenu commercial d'origine
// (plaque livrée 48 h → wizard 2 min → invités autonomes).
// v4.61 — version claire « AIRBNB PRO » : pastilles d'étapes en
// dégradés de la famille bleu logo (#055492 → #043455), eyebrow
// bleu, pill « Zéro application » émeraude (sémantique succès).
// =============================================================

import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';

const STEPS = [
  {
    number: '01',
    icon: '📦',
    title: 'Recevez votre plaque',
    description:
      'Design premium en aluminium gravé, prête à poser. Livrée chez vous en 48 h.',
    gradient: 'from-[#055492] to-[#04467a]',
  },
  {
    number: '02',
    icon: '📱',
    title: 'Scannez pour configurer',
    description:
      'Wizard guidé : Wi-Fi, guidebook, règles, PIN. 2 minutes chrono, sans compétence technique.',
    gradient: 'from-[#04467a] to-[#033a66]',
  },
  {
    number: '03',
    icon: '🚀',
    title: 'Vos invités sont autonomes',
    description:
      'Ils scannent, commandent, s\'informent. Vous pilotez tout à distance, depuis votre dashboard.',
    gradient: 'from-[#033a66] to-[#043455]',
  },
];

export function HowItWorks() {
  const { t } = useLandingLang();
  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-24 bg-white py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* En-tête */}
        <Reveal className="mb-14 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#04467a]">
            {t('Comment ça marche')}
          </p>
          <h2 className="display-title font-serif! mb-4 text-4xl font-bold text-slate-900 md:text-5xl">
            {t('Opérationnel en')}{' '}
            <span className="air-gradient-text font-serif italic">
              {t('3 minutes')}
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-slate-600">
            {t(
              "De la réception de la plaque à l'autonomie de vos invités, c'est simple comme bonjour.",
            )}
          </p>
        </Reveal>

        {/* Étapes + ligne de connexion (desktop) */}
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-24 hidden h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent lg:block"
          />
          <ol className="relative grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-8">
            {STEPS.map((step, i) => (
              <li key={step.number} className="relative">
                <Reveal delay={i * 0.15} className="h-full">
                  <div className="group relative h-full rounded-3xl border border-slate-200/70 bg-white/95 p-7 air-shadow backdrop-blur-xl backdrop-saturate-[1.4] transition-transform duration-500 hover:-translate-y-1.5 sm:p-8">
                    <div className="mb-6 flex items-start justify-between">
                      <span
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${step.gradient} text-2xl shadow-[0_8px_20px_rgba(4, 70, 122,0.30)] transition-transform duration-500 group-hover:scale-110`}
                        aria-hidden="true"
                      >
                        {step.icon}
                      </span>
                      <span className="font-serif text-5xl font-bold leading-none text-slate-200">
                        {step.number}
                      </span>
                    </div>
                    <h3 className="mb-2 font-serif text-xl font-bold text-slate-900">
                      {t(step.title)}
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-600">
                      {t(step.description)}
                    </p>
                  </div>
                </Reveal>
                {/* Flèche entre les étapes (desktop) */}
                {i < STEPS.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="absolute -right-5 top-1/2 z-10 hidden -translate-y-1/2 lg:block"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/70 bg-white/95 backdrop-blur-xl">
                      <ArrowRight className="h-4 w-4 text-[#04467a] rtl:rotate-180" />
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>

        {/* Note bas de section */}
        <Reveal delay={0.4} className="mt-12 text-center">
          <p className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-700">
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            {t('Zéro application à installer — tout fonctionne dans le navigateur')}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
