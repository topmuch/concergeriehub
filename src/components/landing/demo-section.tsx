'use client';

// =============================================================
// DEMO SECTION (v5.18 — extrait de landing-page.tsx pour le site
// multipages) : utilisée sur la page d'accueil (#demo) ET sur la
// page /comment-ca-marche. Contenu inchangé (composant V5).
// =============================================================

import { Reveal } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';
import { InteractiveDemo } from './interactive-demo';

export function DemoSection() {
  const { t } = useLandingLang();
  return (
    <section id="demo" className="scroll-mt-24 px-4 py-24 sm:px-6">
      <Reveal>
        <div className="air-shadow-lg mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-6 md:p-10">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#04467a]">
              {t('La magie en 1 scan')}
            </p>
            <h2 className="display-title font-serif! mb-3 text-3xl font-bold text-slate-900 md:text-4xl">
              {t('Voyez le Hub')}{' '}
              <span className="air-gradient-text font-serif italic">
                {t('en action')}
              </span>
            </h2>
            <p className="text-slate-600">
              {t(
                "Observez comment l'expérience bascule fluidement entre le mode Invité (commande de services) et le mode Hôte (dashboard de gestion), le tout sans installer d'application.",
              )}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500"
              />
              {t('Démo en cours de lecture…')}
            </div>
          </div>
          <InteractiveDemo />
        </div>
      </Reveal>
    </section>
  );
}
