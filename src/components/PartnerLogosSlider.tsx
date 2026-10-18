'use client';

// =============================================================
// v4.113 « PARTNER LOGOS SLIDER » — bandeau de confiance page d'accueil
//
// VRAIS LOGOS des plateformes synchronisées (Airbnb, Booking.com,
// Expedia, Abritel, Google Travel) en défilement horizontal INFINI,
// affichés EN COULEUR (assets officiels fournis par le client,
// fonds rendus transparents, stockés dans /public/logos/).
//
// Premium par construction :
//   • PNG optimisés (≤ 60 Ko chacun) — rendu net sur Retina/4K ;
//   • opacité réduite au repos (ne vole pas la vedette au design),
//     pleine opacité au survol — mais TOUJOURS en couleur ;
//   • BOUCLE SANS COUPURE : 2 copies de la liste + animation
//     x: ['0%', '-50%'] — la 2ᵉ moitié est identique à la 1ʳᵉ,
//     l'œil ne détecte jamais le raccord ;
//   • fondu élégant sur les bords (dégradés latéraux, style Apple/
//     Stripe) — le conteneur est `relative` pour les contenir ;
//   • `prefers-reduced-motion` → bandeau statique (accessibilité).
// =============================================================

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';

const partners = [
  {
    name: 'Airbnb',
    src: '/logos/airbnb.png',
    w: 692,
    h: 246,
    displayH: 'h-9', // 36px
  },
  {
    name: 'Booking.com',
    src: '/logos/booking-com.png',
    w: 737,
    h: 134,
    displayH: 'h-9',
  },
  {
    name: 'Expedia',
    src: '/logos/expedia.png',
    w: 738,
    h: 162,
    displayH: 'h-9',
  },
  {
    name: 'Vrbo / Abritel',
    src: '/logos/abritel.png',
    w: 797,
    h: 199,
    displayH: 'h-9',
  },
  {
    // Icône valise Google Travel (asset fourni) + wordmark texte :
    // l'icône porte la couleur, le texte suit la baseline des autres.
    name: 'Google Travel',
    src: '/logos/google-travel.png',
    w: 273,
    h: 425,
    displayH: 'h-12', // 48px — icône seule, plus haute pour équilibrer
    withLabel: true,
  },
] as const;

export default function PartnerLogosSlider() {
  const reduceMotion = useReducedMotion();
  // 2 copies = boucle parfaite : à -50 %, la bande affiche exactement
  // le même contenu qu'à 0 % → relance invisible.
  const loop = [...partners, ...partners];

  return (
    <div
      className="relative w-full overflow-hidden border-y border-slate-200/80 bg-white/80 py-7 backdrop-blur-sm"
      aria-label="Plateformes de réservation compatibles"
    >
      <div className="relative flex">
        <motion.div
          className="flex w-max shrink-0 items-center whitespace-nowrap"
          animate={reduceMotion ? undefined : { x: ['0%', '-50%'] }}
          transition={
            reduceMotion
              ? undefined
              : { x: { repeat: Infinity, repeatType: 'loop', duration: 28, ease: 'linear' } }
          }
        >
          {loop.map((partner, index) => (
            <div
              key={`${partner.name}-${index}`}
              aria-hidden={index >= partners.length}
              title={`Compatible avec ${partner.name}`}
              className="group flex w-max shrink-0 cursor-default items-center justify-center gap-2.5 px-8 opacity-80 transition-opacity duration-300 hover:opacity-100"
            >
              <Image
                src={partner.src}
                alt={`Logo ${partner.name}`}
                width={partner.w}
                height={partner.h}
                unoptimized
                draggable={false}
                className={`${partner.displayH} w-auto select-none`}
              />
              {'withLabel' in partner && partner.withLabel ? (
                <span className="text-2xl font-semibold tracking-tight text-slate-600 select-none">
                  Google&nbsp;Travel
                </span>
              ) : null}
            </div>
          ))}
        </motion.div>
      </div>

      {/* Fondu latéral — le conteneur externe est `relative` : les
          dégradés disparaissent en douceur sur les 2 bords. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white to-transparent" />
    </div>
  );
}
