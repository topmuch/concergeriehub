'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Lock, Settings2, User } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { cn } from '@/lib/utils';

// =============================================================
// HUB PREMIUM — HeroLanding (page d'entrée du hub QR)
//
// v4.79 — REFONTE « VILLA IMMERSIVE » (demande client : « un bel
// image de villa luxueuse et superpose les infos ») :
//   • FOND : photo PLEIN ÉCRAN edge-to-edge d'une villa luxueuse au
//     crépuscule (photo du bien si l'hôte en a chargé une, repli
//     /villa-home-hero.jpg) + voile dégradé sombre pour la lisibilité ;
//   • INFOS EN SUPERPOSITION : bienvenue + cartes d'accès en verre
//     dépoli (même langage que l'écran de verrouillage LuxuryPinPad) ;
//   • TOUTE la logique v5.0/v4.51 est CONSERVÉE : chorégraphie en
//     cascade (badge 0.1 s → footer 0.7 s), accord de l'article
//     (welcomeTitle), FIX-16 ⚙️ accès hôte rapide, badges « Accès
//     libre » / « 2 espaces », sous-espaces Hôte/Ménage, aria-labels,
//     cibles ≥ 44 px, prefers-reduced-motion.
// La navigation (clics) reste portée par hub-content.tsx — aucune
// logique changée, uniquement l'enrobage visuel.
// =============================================================

/** Easing expo partagé. */
const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

/** Repli : villa luxueuse curated (générée — villa au crépuscule). */
const VILLA_HERO_FALLBACK = '/villa-home-hero.jpg';

interface HeroLandingProps {
  propertyName: string;
  propertyTypeEmoji: string;
  propertyTypeLabel: string;
  ownerName: string | null;
  /** v4.79 — photo principale du bien (hubPhotos.hero) : affichée à la
   *  place de la villa curated si l'hôte en a chargé une. */
  propertyImage?: string | null;
  onGuestClick: () => void;
  onHostClick: () => void;
  // v4.43 — le Mode Ménage est FUSIONNÉ dans le Mode Hôte : un seul
  // bouton, la modale propose 2 grandes cartes (Hôte / Ménage).
}

/**
 * Accorde l'article du titre d'accueil au nom du bien :
 *   « Villa Sarbacane » → « Bienvenue à la Villa Sarbacane »
 *   « Le Petit Nid »    → « Bienvenue au Petit Nid »
 *   « Les Oliviers »    → « Bienvenue aux Oliviers »
 *   « L'Atelier »       → « Bienvenue à l'Atelier »
 *   « Loft des Arts »   → « Bienvenue au Loft des Arts »
 */
function welcomeTitle(raw: string): string {
  const n = raw.trim();
  const l = n.toLowerCase();
  if (/^le\s/.test(l)) return `Bienvenue au ${n.slice(3)}`;
  if (/^les\s/.test(l)) return `Bienvenue aux ${n.slice(4)}`;
  if (/^l'/.test(l)) return `Bienvenue à l'${n.slice(2)}`;
  if (
    /^(loft|studio|chalet|gîte|gite|appartement|duplex|penthouse|bungalow|roulotte|tipi|mobile-home)\b/i.test(
      n,
    )
  ) {
    return `Bienvenue au ${n}`;
  }
  return `Bienvenue à la ${n}`;
}

/* ── Carte d'accès premium verre dépoli (Mode Invité / Mode Hôte) ── */

/** Conteneur verre commun aux 2 cartes (v4.79 — superposition photo). */
const GLASS_CARD =
  'relative overflow-hidden rounded-3xl border border-white/25 bg-white/10 p-6 ' +
  'shadow-[0_24px_60px_-24px_rgba(0,0,0,0.55)] backdrop-blur-xl ' +
  'transition-all duration-300 hover:border-white/40 hover:bg-white/[0.16] hover:scale-[1.02] group';

function AccessCard({
  tone,
  icon: Icon,
  title,
  subtitle,
  badge,
  delay,
  ctaClass,
  subOptions,
  onClick,
}: {
  /** Jeton de style présentationnel : 'emerald' → accent BLEU logo
   *  (carte Mode Invité), 'amber' → accent OR chaud (Mode Hôte). */
  tone: 'emerald' | 'amber';
  icon: typeof User;
  title: string;
  subtitle: string;
  badge: string;
  /** Délai de la cascade (0.4 = invité, 0.5 = hôte). */
  delay: number;
  /** Classes du bouton plein (bleu logo / verre blanc). */
  ctaClass: string;
  /** v4.51 carte hôte : sous-options listées SOUS une fine ligne. */
  subOptions?: { emoji: string; label: string; hint: string }[];
  onClick: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={`${title} — ${badge}. Entrer`}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: EASE_EXPO }}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        GLASS_CARD,
        'w-full cursor-pointer text-left',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30',
      )}
    >
      {/* Badge pill translucide (haut-droite) */}
      <span
        className={cn(
          'absolute right-4 top-4 z-10 inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold backdrop-blur-md',
          tone === 'emerald'
            ? 'border-[#7FB4FF]/50 bg-[#0A2C5E]/40 text-[#BBD7FF]'
            : 'border-amber-300/50 bg-amber-500/15 text-amber-200',
        )}
      >
        {badge}
      </span>

      {/* Icône en haut — grossit au survol (spec : group-hover:scale-110) */}
      <span
        aria-hidden="true"
        className="relative z-[5] mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110"
      >
        <Icon className="h-8 w-8 text-white" strokeWidth={1.5} />
      </span>

      {/* Titre serif + sous-titre */}
      <span className="relative z-[5] block">
        <span className="font-serif text-2xl font-bold text-white">{title}</span>
        <span className="mt-1.5 block text-sm leading-relaxed text-white/75">{subtitle}</span>
      </span>

      {/* v4.51 — carte hôte : les 2 sous-espaces SOUS une fine ligne */}
      {subOptions && subOptions.length > 0 && (
        <span className="relative z-[5] mt-4 block border-t border-white/20 pt-4">
          {subOptions.map((o) => (
            <span key={o.label} className="mt-1.5 flex items-center gap-2.5 first:mt-0">
              <span aria-hidden="true" className="text-base leading-none">
                {o.emoji}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">{o.label}</span>
                <span className="block truncate text-[11px] text-white/60">{o.hint}</span>
              </span>
            </span>
          ))}
        </span>
      )}

      {/* Bouton « Entrer » plein (span stylée — la carte EST le bouton) */}
      <span
        aria-hidden="true"
        className={cn(
          'relative z-[5] mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-colors duration-300',
          ctaClass,
        )}
      >
        Entrer
        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
      </span>
    </motion.button>
  );
}

/* ── Écran d'accueil immersif « VILLA LUXUEUSE EN SUPERPOSITION » ── */

export function HeroLanding({
  propertyName,
  propertyTypeEmoji,
  propertyTypeLabel,
  ownerName,
  propertyImage,
  onGuestClick,
  onHostClick,
}: HeroLandingProps) {
  const reduceMotion = useReducedMotion();

  // Titre accordé — le nom du bien est mis en évidence (gradient or)
  // seulement s'il apparaît tel quel dans le titre accordé.
  const nameToken = propertyName.trim();
  const titleParts = welcomeTitle(propertyName).split(nameToken);

  return (
    <div className="flex-1 w-full">
      {/* ── FOND IMMERSIF « VILLA LUXUEUSE » (v4.79) — photo plein écran
          edge-to-edge (photo du bien sinon villa curated), voile dégradé
          sombre pour la lisibilité des textes blancs. fixed -z-10 comme
          l'ancien fond clair (aucun ancêtre transformé → fiable). ── */}
      <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden bg-stone-950">
        <div
          className="absolute inset-0 scale-105 bg-cover bg-center"
          style={{ backgroundImage: `url(${propertyImage || VILLA_HERO_FALLBACK})` }}
        />
        {/* Voile de lisibilité : assombrit haut/bas, laisse vivre le centre */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/70" />
      </div>

      {/* ── CONTENU EN SUPERPOSITION ─────────────────────────────── */}
      <div className="relative w-full max-w-md mx-auto min-h-dvh px-5 pt-7 pb-[calc(1.75rem+env(safe-area-inset-bottom))] flex flex-col md:max-w-xl">
        {/* Header — logo + FIX-16 ⚙️ (accès hôte rapide) — delay 0 */}
        <motion.header
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_EXPO }}
          className="flex items-center justify-between"
        >
          <BrandLogo variant="light" size="sm" />
          <button
            type="button"
            onClick={onHostClick}
            aria-label="Paramètres hôte — ouvrir le mode hôte"
            className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-white/25 bg-white/10 text-white shadow-sm backdrop-blur-md hover:border-white/40 hover:bg-white/20 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Settings2 className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </motion.header>

        {/* Message d'accueil — cascade 0.1 → 0.3 s */}
        <section aria-label="Bienvenue" className="mt-12 text-center sm:mt-16">
          {/* Badge pill (0.1 s) */}
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: EASE_EXPO }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 shadow-sm backdrop-blur-md"
          >
            ✨ Expérience RoomScan
          </motion.p>

          {/* Titre principal — Playfair 4xl/5xl tracking-tight (0.2 s) */}
          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: EASE_EXPO }}
            className="mb-4 font-serif text-4xl font-bold leading-[1.08] tracking-tight text-white md:text-5xl"
            style={{ textShadow: '0 2px 24px rgba(0,0,0,0.45)' }}
          >
            {titleParts.length > 1 ? (
              <>
                {titleParts[0]}
                {/* Nom du bien en dégradé or — lisible sur la photo sombre
                    (le .text-gradient-lux global est navy en mode clair). */}
                <span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
                  {nameToken}
                </span>
              </>
            ) : (
              welcomeTitle(propertyName)
            )}
          </motion.h1>

          {/* Message chaleureux (0.3 s) */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: EASE_EXPO }}
            className="mx-auto max-w-md text-center text-lg text-white/85"
          >
            Nous avons tout préparé pour rendre votre séjour inoubliable.
          </motion.p>

          {/* Ligne de confiance (0.35 s) */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.35 }}
            className="mt-3 text-xs font-medium text-white/60"
          >
            {propertyTypeEmoji} {propertyTypeLabel} · Hub officiel du logement
          </motion.p>
        </section>

        {/* 2 cartes d'accès — cascade 0.4 / 0.5 s */}
        <div className="mt-10 grid gap-5 md:grid-cols-2 md:items-stretch">
          {/* CARTE MODE INVITÉ — verre dépoli + CTA bleu logo (accent principal) */}
          <AccessCard
            tone="emerald"
            icon={User}
            title="Mode Invité"
            subtitle="Wi-Fi, Guide, Services & Commandes"
            badge="Accès libre"
            delay={0.4}
            ctaClass="air-gradient hover:opacity-90"
            onClick={onGuestClick}
          />

          {/* CARTE MODE HÔTE — verre dépoli + CTA blanc lumineux (marine) */}
          <AccessCard
            tone="amber"
            icon={Lock}
            title="Mode Hôte"
            subtitle="Deux espaces protégés, deux codes distincts"
            badge="2 espaces"
            delay={0.5}
            ctaClass="bg-white text-[#043455] hover:bg-white/90"
            subOptions={[
              { emoji: '🔐', label: 'Hôte', hint: 'Code PIN du bien' },
              { emoji: '🧹', label: 'Ménage', hint: 'Code staff de l\u2019équipe' },
            ]}
            onClick={onHostClick}
          />
        </div>

        {/* Footer (0.7 s) */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="mt-auto pt-12 text-center"
        >
          <p className="text-xs text-white/55">
            {ownerName ? `Votre hôte : ${ownerName} · ` : ''}Propulsé par{' '}
            <span className="font-semibold text-white/75">RoomScan</span>
          </p>
        </motion.footer>
      </div>
    </div>
  );
}
