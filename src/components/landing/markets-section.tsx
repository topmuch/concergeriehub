'use client';

// =============================================================
// MARKETS + FAQ SECTION (SEO v4.77) — section discrète sous le
// contenu principal de la landing :
//
//   1. Bloc « 3 marchés » : Afrique de l'Ouest / Europe / Canada,
//      une ligne de texte riche par zone (Dakar, Abidjan… ;
//      Paris, Bruxelles, Genève, Luxembourg, Barcelone… ;
//      Montréal, Québec, Toronto…). Supporte les mots-clés
//      « conciergerie QR code », « guide numérique location
//      saisonnière », « house manual digital », « hub invité ».
//   2. FAQ visible (6 Q/R) — MÊME SOURCE que le JSON-LD FAQPage
//      de page.tsx (lib/seo-faq.ts) : exigence Google, le contenu
//      balisé doit être visible par l'utilisateur.
//
// Design : cohérent avec la landing V6.1 « AIRBNB PRO clair »
// (kicker uppercase #04467a, display-title serif, cartes blanches
// border-slate-200 air-shadow, Reveal au scroll, textes via
// landing-i18n t() → traductions progressives des 8 langues).
// =============================================================

import { ChevronDown, Globe2 } from 'lucide-react';
import { Reveal } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';
import { SEO_FAQ } from '@/lib/seo-faq';

/** Zones marketing — villes réelles ciblées (demande client v4.77). */
const ZONES = [
  {
    id: 'afrique',
    emoji: '🌍',
    title: 'Afrique de l’Ouest',
    cities: 'Dakar · Sénégal · Abidjan · Côte d’Ivoire',
    text: 'Conciergerie QR code pour les hôtes Airbnb de Dakar et d’Afrique de l’Ouest : plaque QR élégante, welcome book digital, Wi-Fi en 1 clic et messagerie vocale hôte-invité.',
  },
  {
    id: 'europe',
    emoji: '🏰',
    title: 'Europe',
    cities: 'Paris · Bruxelles · Genève · Luxembourg · Barcelone',
    text: 'Guide numérique de location saisonnière en France, Belgique, Suisse, Luxembourg et Espagne : guidebook digital, bouclier d’avis, départ tardif et dashboard multi-logements.',
  },
  {
    id: 'canada',
    emoji: '🍁',
    title: 'Canada',
    cities: 'Montréal · Québec · Toronto',
    text: 'House manual digital et hub invité pour Airbnb au Québec et au Canada : conciergerie QR code, minibar numérique, alertes ménage en temps réel et sync iCal.',
  },
] as const;

export function MarketsSection() {
  const { t } = useLandingLang();

  return (
    <section id="zones" className="scroll-mt-24 px-4 py-24 sm:px-6" aria-labelledby="zones-title">
      <div className="mx-auto max-w-6xl">
        {/* ── En-tête de section ── */}
        <Reveal className="mb-14 text-center">
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-[#04467a]">
            <Globe2 className="h-4 w-4" aria-hidden="true" />
            {t('Disponible sur 3 continents')}
          </p>
          <h2
            id="zones-title"
            className="display-title font-serif! mb-5 text-3xl font-bold text-slate-900 md:text-5xl"
          >
            {t('Le hub invité de votre conciergerie QR code,')}{' '}
            <span className="air-gradient-text font-serif italic">
              {t('de Dakar à Montréal')}
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-slate-600">
            {t(
              'Guide numérique de location saisonnière, welcome book digital et digital guestbook : RoomScan accompagne les hôtes Airbnb et Booking sur leurs marchés, avec une interface en 8 langues.',
            )}
          </p>
        </Reveal>

        {/* ── 3 cartes marchés ── */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {ZONES.map((zone, i) => (
            <Reveal key={zone.id} delay={0.08 * (i + 1)} className="h-full">
              <article className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 air-shadow transition-shadow duration-500 hover:shadow-[0_12px_32px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)]">
                <div className="mb-4 flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-2xl ring-1 ring-slate-100"
                  >
                    {zone.emoji}
                  </span>
                  <h3 className="font-serif text-xl font-bold text-slate-900">
                    {t(zone.title)}
                  </h3>
                </div>
                <p className="mb-3 text-sm font-semibold text-[#04467a]">
                  {t(zone.cities)}
                </p>
                <p className="text-sm leading-relaxed text-slate-600">{t(zone.text)}</p>
              </article>
            </Reveal>
          ))}
        </div>

        {/* ── FAQ visible (même source que le JSON-LD FAQPage) ── */}
        <Reveal delay={0.2}>
          <div className="mx-auto mt-20 max-w-3xl">
            <h3 className="display-title font-serif! mb-8 text-center text-2xl font-bold text-slate-900 md:text-3xl">
              {t('Questions fréquentes sur le Concierge Hub')}
            </h3>
            <div className="flex flex-col gap-3">
              {SEO_FAQ.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-2xl border border-slate-200 bg-white px-5 py-4 air-shadow [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-semibold text-slate-900 transition-colors hover:text-[#04467a]">
                    <span>{t(item.q)}</span>
                    <ChevronDown
                      className="h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300 group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{t(item.a)}</p>
                </details>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
