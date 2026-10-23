'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Navigation } from 'lucide-react';
import { geoDirectionsUrl, type GuestVisualStep } from '@/lib/concierge';

// =============================================================
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — 2.1 GUIDE VISUEL
// « PAS À PAS » — carrousel horizontal (snap-x) du trajet
// façade → digicode → porte, photos + textes courts de l'hôte.
//
// DESIGN PREMIUM « LUXE TECH » (V4.10) — Carrousel Cinéma :
//   • slides plein cadre (h-80 → h-96), photo en cover
//   • overlay gradient bas (transparent → noir 70 %), texte blanc
//   • badge d'étape en verre dépoli, titre en font-serif
//   • zoom doux (fade + scale) sur la slide active
//   • indicateurs = barres fines (pas de dots), cliquables
//
// • Swipe natif (snap-mandatory) + boutons ‹ ›
// • v4.25 « HUB RÉEL » — TOUTES les images (locales /uploads, /demo
//   OU externes https:) → rendu DIRECT plein cadre (CSP img-src
//   https: active depuis v4.23) ; échec de chargement → repli
//   gradient + emoji — jamais de pastille « voir ailleurs ».
// • CTA final « Voir les codes d'accès » si le coffre-fort existe
// 8 AMÉLIORATIONS (PHASE 1) — 1.2 BOUTON « ALLER À L'APPARTEMENT » :
//   • gros CTA bleu marque DIRECTEMENT SOUS LES PHOTOS (avant les
//     barres de progression — WP-VISUAL), ouvre l'app GPS native
//     (Apple Maps sur iOS, Google Maps ailleurs — geoDirectionsUrl)
//     vers les coordonnées exactes du logement ;
//   • ne s'affiche QUE si le bien possède des coordonnées ;
//   • ombre teintée marque (glow discret) pour la hiérarchie visuelle ;
//   • micro-feedback Framer Motion (hover scale 1.02, tap 0.98).
// =============================================================

export function VisualGuideCard({
  steps,
  propertyLat = null,
  propertyLng = null,
  onNavigateAccess,
}: {
  steps: GuestVisualStep[];
  /** Coordonnées du logement — CTA GPS affiché uniquement si présentes. */
  propertyLat?: number | null;
  propertyLng?: number | null;
  onNavigateAccess?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  if (steps.length === 0) return null;

  const hasCoords = typeof propertyLat === 'number' && Number.isFinite(propertyLat)
    && typeof propertyLng === 'number' && Number.isFinite(propertyLng);

  const scrollToStep = (i: number) => {
    const clamped = Math.max(0, Math.min(steps.length - 1, i));
    const track = trackRef.current;
    if (!track) return;
    const child = track.children[clamped] as HTMLElement | undefined;
    if (child) track.scrollTo({ left: child.offsetLeft - track.offsetLeft, behavior: 'smooth' });
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const children = Array.from(track.children) as HTMLElement[];
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    children.forEach((c, i) => {
      const cCenter = c.offsetLeft - track.offsetLeft + c.clientWidth / 2;
      const d = Math.abs(cCenter - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setIndex(best);
  };

  return (
    <section
      aria-label="Guide visuel d'arrivée"
      className="bg-card border border-border rounded-2xl shadow-sm p-4"
    >
      <div className="flex items-start justify-between gap-3 px-1 pt-1">
        <div className="min-w-0">
          <h2 className="font-serif! text-lg font-bold text-card-foreground tracking-tight">
            🗝️ Votre arrivée, pas à pas
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Le chemin de votre hôte jusqu&apos;aux clés — glissez pour suivre →
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border whitespace-nowrap tabular-nums">
          {index + 1}/{steps.length}
        </span>
      </div>

      {/* Piste horizontale snap-x — slides cinéma plein cadre */}
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="mt-3 flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-1 px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label={`Étapes d'arrivée (${steps.length})`}
      >
        {steps.map((step, i) => {
          const active = i === index;
          return (
            <article
              key={step.id}
              className="relative min-w-[88%] snap-center rounded-2xl border border-border overflow-hidden aspect-[4/5] sm:aspect-[16/12] bg-secondary"
              aria-label={`Étape ${i + 1} : ${step.title}`}
            >
              <motion.div
                className="absolute inset-0"
                animate={{ scale: active ? 1 : 1.08, opacity: active ? 1 : 0.55 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <StepMedia step={step} index={i} />
              </motion.div>

              {/* Overlay cinéma : transparent → noir 70 % */}
              <div
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/35 to-transparent pointer-events-none"
              />

              {/* Badge d'étape en verre dépoli */}
              <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-widest text-white/95 bg-white/15 backdrop-blur-md border border-white/25 px-2.5 py-1 rounded-full">
                Étape {i + 1}
              </span>

              {/* Texte blanc sur l'overlay */}
              <div className="absolute inset-x-0 bottom-0 p-4">
                <h3 className="font-serif! text-lg font-bold text-white leading-snug tracking-tight [text-shadow:0_1px_12px_rgba(0,0,0,0.55)]">
                  {step.title}
                </h3>
                {step.description && (
                  <p className="mt-1 text-xs text-white/85 leading-relaxed line-clamp-2 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
                    {step.description}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* 8 AMÉLIORATIONS 1.2 — GPS « Aller à l'appartement »
          (WP-VISUAL : DIRECTEMENT sous les photos, avant la progression —
          l'action la plus importante est visible sans scroller) */}
      {hasCoords && (
        <motion.a
          href={geoDirectionsUrl(propertyLat as number, propertyLng as number)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ouvrir l'itinéraire GPS vers l'appartement"
          className="w-full mt-4 bg-[#055492] hover:bg-[#04467a] text-white font-bold py-4 rounded-2xl
                     flex items-center justify-center gap-3 shadow-lg shadow-[#055492]/30 hover:shadow-[#055492]/50 transition-all
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-[#055492]"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Navigation className="w-5 h-5" aria-hidden="true" />
          Aller à l&apos;appartement
        </motion.a>
      )}

      {/* Barres fines de progression (style cinéma) + flèches */}
      <div className="mt-3 flex items-center gap-3 px-1">
        <div className="flex-1 flex items-center gap-1.5" role="tablist" aria-label="Étape affichée">
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Aller à l'étape ${i + 1} (${s.title})`}
              onClick={() => scrollToStep(i)}
              className="group flex-1 h-4 flex items-center cursor-pointer"
            >
              <span
                className={`h-1 w-full rounded-full transition-all duration-500 ${
                  i === index
                    ? 'bg-accent shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                    : 'bg-border group-hover:bg-muted-foreground/40'
                }`}
              />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollToStep(index - 1)}
            disabled={index === 0}
            aria-label="Étape précédente"
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl glass text-card-foreground text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollToStep(index + 1)}
            disabled={index === steps.length - 1}
            aria-label="Étape suivante"
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl glass text-card-foreground text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            ›
          </button>
        </div>
      </div>

      {onNavigateAccess && (
        <button
          type="button"
          onClick={onNavigateAccess}
          className="mt-3 w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
        >
          🔑 Voir les codes d&apos;accès
        </button>
      )}
    </section>
  );
}

/** Média de la slide — v4.25 « hub réel » : rendu DIRECT (locale
 *  ou externe https:, CSP img-src ok), repli gradient + emoji si
 *  échec de chargement. */
function StepMedia({ step, index }: { step: GuestVisualStep; index: number }) {
  const [failed, setFailed] = useState(false);

  if (!step.imageUrl || failed) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-secondary via-card to-secondary" aria-hidden="true">
        <span className="text-6xl select-none drop-shadow-sm">{['🏡', '🔢', '🔑'][index % 3]}</span>
      </div>
    );
  }
  return (
    <img
      src={step.imageUrl}
      alt={`Photo de l'étape ${index + 1} : ${step.title}`}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
