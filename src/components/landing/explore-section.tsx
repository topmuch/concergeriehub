'use client';

// =============================================================
// EXPLORE SECTION (v5.18 — site multipages) : l'accueil condensé
// renvoie vers les 4 pages dédiées via ces cartes de navigation.
// =============================================================

import Link from 'next/link';
import { ArrowRight, Camera, LayoutGrid, ListChecks, Tags } from 'lucide-react';
import { Reveal } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';

const CARDS = [
  {
    icon: LayoutGrid,
    title: 'Fonctionnalités',
    text: 'Tout ce que la plaque QR et le dashboard font pour vous : Wi-Fi, guidebook, upselling, avis, white-label…',
    href: '/fonctionnalites',
  },
  {
    icon: ListChecks,
    title: 'Comment ça marche',
    text: 'De la réception de la plaque au premier scan de vos invités : installé en 3 minutes, sans application.',
    href: '/comment-ca-marche',
  },
  {
    icon: Camera,
    title: 'États des Lieux',
    text: 'Preuves photo et vidéo, signature de l’invité et PDF certifié — l’état des lieux sans litige.',
    href: '/etats-des-lieux',
  },
  {
    icon: Tags,
    title: 'Tarifs',
    text: 'Solo 29 €/mois · Pro 99 €/mois · États des Lieux dès 299 €/an — paiement PayPal, sans engagement.',
    href: '/tarifs',
  },
] as const;

export function ExploreSection() {
  const { t } = useLandingLang();
  return (
    <section className="relative px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-12 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#04467a]">
            {t('Explorez la plateforme')}
          </p>
          <h2 className="display-title font-serif! mb-4 text-3xl font-bold text-slate-900 md:text-4xl">
            {t('Tout RoomScan,')}{' '}
            <span className="air-gradient-text font-serif italic">
              {t('page par page')}
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-slate-600">
            {t(
              'Un site clair : chaque sujet a sa page dédiée — fonctionnalités, mise en route, états des lieux, tarifs et contact.',
            )}
          </p>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card, i) => (
            <Reveal key={card.href} delay={0.08 * i}>
              <Link
                href={card.href}
                className="group flex h-full flex-col rounded-3xl border border-slate-200/80 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#055492]/30 hover:shadow-[0_16px_40px_rgba(4,70,122,0.12)]"
              >
                <span
                  aria-hidden="true"
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#055492]/10 text-[#04467a] transition-colors group-hover:bg-[#055492] group-hover:text-white"
                >
                  <card.icon className="h-5 w-5" />
                </span>
                <h3 className="mb-2 text-lg font-bold text-slate-900">{t(card.title)}</h3>
                <p className="mb-5 flex-1 text-sm leading-relaxed text-slate-600">
                  {t(card.text)}
                </p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#04467a]">
                  {t('Découvrir')}
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
