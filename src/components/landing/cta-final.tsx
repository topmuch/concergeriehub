'use client';

// =============================================================
// CTA FINAL — section pleine largeur sur fond clair avec halo
// signature bleu logo local (voile pastel très doux). Gros
// MagneticButton bleu (confettis) et sous-texte rassurant.
// v5.0 : textes via landing-i18n (8 langues).
// =============================================================

import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MagneticButton } from '@/components/premium/magnetic-button';
import { Reveal } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';

// v5.18 site multipages : « Choisir mon offre » mène à la page /tarifs
// (les 4 offres y sont, payables PayPal) — plus de renvoi vers l'auth.
export function CtaFinal() {
  const { t } = useLandingLang();
  const router = useRouter();
  return (
    <section className="relative overflow-hidden py-28 sm:py-36">
      {/* Halo signature local (voiles bleu logo → pastel) */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 h-[420px] w-[720px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[linear-gradient(120deg,rgba(5, 84, 146,0.16),rgba(4, 70, 122,0.10),rgba(17, 115, 199,0.10))] opacity-70 blur-3xl"
      />

      <Reveal className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="display-title font-serif! mb-5 text-4xl font-bold text-slate-900 sm:text-5xl md:text-6xl">
          {t("Prêt à offrir l'expérience")}{' '}
          <span className="air-gradient-text font-serif italic">
            {t('5 étoiles')}
          </span>{' '}
          ?
        </h2>
        <p className="mb-10 text-lg text-slate-600">
          {t('Rejoignez les 500+ hôtes qui automatisent déjà leur conciergerie.')}
        </p>
        <MagneticButton
          onClick={() => router.push('/tarifs')}
          className="px-10 py-5 text-lg"
        >
          ✨ {t('Choisir mon offre')}
          <ArrowRight className="h-5 w-5" />
        </MagneticButton>
        <p className="mt-7 text-sm text-slate-500">
          {t('Paiement sécurisé PayPal · Sans engagement')}
        </p>
      </Reveal>
    </section>
  );
}
