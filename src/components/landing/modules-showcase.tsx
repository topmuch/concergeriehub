'use client';

// =============================================================
// BENTO GRID PREMIUM — remplace l'ancienne grille de modules V5.
// Grille asymétrique : 1 grande carte (dashboard multi-propriétés,
// avec mini-maquette CSS animée), 2 moyennes (2×1) et 3 petites
// (1×1). Chaque carte : GlassCard (spotlight) verrouillée claire
// (bg blanc + air-shadow), emoji 48 px avec glow bleu logo, titre
// serif, hover scale 1.02 — le tout en Reveal.
// v4.61 — version claire « AIRBNB PRO » : accents décoratifs
// (glows, chips upselling, badge « Cœur du produit ») passés en
// famille bleu logo ; l'émeraude reste réservé aux états positifs.
// =============================================================

import { motion } from 'framer-motion';
import { GlassCard } from '@/components/premium/glass-card';
import { Reveal } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';

const KPIs = [
  { label: 'Revenus', value: '1 240 €' },
  { label: 'Occupation', value: '92 %' },
  { label: 'Scans', value: '348' },
];

const PROPERTIES = [
  { dot: 'bg-emerald-400', text: 'Villa Belle Rive — 2 arrivées aujourd’hui' },
  { dot: 'bg-rose-400', text: 'Studio Montmartre — départ 11 h' },
];

const SMALL_CARDS = [
  {
    emoji: '🎨',
    glow: 'drop-shadow-[0_0_24px_rgba(0,102,239,0.55)]',
    title: 'White-Label',
    description: 'Votre logo, vos couleurs, votre domaine. Vos invités ne voient que votre marque.',
  },
  {
    emoji: '👥',
    glow: 'drop-shadow-[0_0_24px_rgba(0,82,196,0.55)]',
    title: 'Équipe',
    description: 'Ménage, maintenance, co-hôtes : rôles et permissions granulaires.',
  },
  {
    emoji: '📊',
    glow: 'drop-shadow-[0_0_24px_rgba(0,71,179,0.55)]',
    title: 'Analytics',
    description: 'Scans, revenus et engagement de vos invités en temps réel.',
  },
];

/** Emoji 48 px avec glow coloré. */
function GlowingEmoji({ emoji, glow }: { emoji: string; glow: string }) {
  return (
    <span
      aria-hidden="true"
      className={`mb-5 inline-block text-5xl leading-none ${glow}`}
    >
      {emoji}
    </span>
  );
}

// ── Mini-maquette CSS du dashboard (grande carte) ─────────────
// Sidebar d'icônes + barre de fenêtre + KPI cards + sparkline SVG
// animée (pathLength) + lignes propriétés — 100 % CSS/SVG, aucune
// image, hauteurs déterministes (zéro mismatch d'hydratation).
function DashboardMockup() {
  // Points du sparkline (revenus 30 j) — fixés à l'avance.
  const sparkPoints = '0,34 14,28 28,31 42,20 56,24 70,12 84,16 98,6';
  const sparkArea = `M0,34 L14,28 L28,31 L42,20 L56,24 L70,12 L84,16 L98,6 L98,40 L0,40 Z`;

  return (
    <div
      dir="ltr"
      aria-hidden="true"
      className="mt-6 flex overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-950 shadow-inner dark:border-white/10"
    >
      {/* Mini-sidebar (nav du dashboard) */}
      <div className="flex w-9 shrink-0 flex-col items-center gap-2.5 border-r border-white/5 py-3">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[linear-gradient(135deg,#0066EF,#0047B3)] text-[9px] font-bold text-white">
          C
        </span>
        {['🏠', '🛏️', '💰', '🛡️', '📊'].map((icon, i) => (
          <span
            key={icon}
            className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] ${
              i === 0 ? 'bg-white/10' : 'opacity-40'
            }`}
          >
            {icon}
          </span>
        ))}
        <span className="mt-auto h-5 w-5 rounded-full bg-white/10" />
      </div>

      {/* Zone principale */}
      <div className="min-w-0 flex-1 p-3.5">
        {/* Barre de fenêtre */}
        <div className="mb-3 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-400" />
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="ml-2 text-[10px] font-medium text-white/40">
            Dashboard — Vue d&apos;ensemble
          </span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Temps réel
          </span>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-2">
          {KPIs.map((kpi) => (
            <div key={kpi.label} className="rounded-lg bg-white/5 p-2">
              <p className="text-[9px] text-white/40">{kpi.label}</p>
              <p className="text-xs font-bold text-white">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Sparkline (revenus) — tracé qui se dessine au scroll */}
        <div className="mt-3 rounded-lg bg-white/5 p-2.5">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[9px] text-white/40">Revenus · 30 jours</p>
            <p className="text-[9px] font-bold text-emerald-400">+18 %</p>
          </div>
          <svg
            viewBox="0 0 98 40"
            preserveAspectRatio="none"
            className="h-12 w-full"
          >
            <defs>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path
              d={sparkArea}
              fill="url(#sparkFill)"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.5 }}
            />
            <motion.polyline
              points={sparkPoints}
              fill="none"
              stroke="#34d399"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            />
          </svg>
        </div>

        {/* Propriétés */}
        <div className="mt-3 space-y-1.5">
          {PROPERTIES.map((property) => (
            <div
              key={property.text}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${property.dot}`} />
              <span className="truncate text-[10px] text-white/70">
                {property.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BentoGrid() {
  const { t } = useLandingLang();
  return (
    <section id="features" className="relative scroll-mt-24 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* En-tête */}
        <Reveal className="mb-14 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#0052C4]">
            {t('Fonctionnalités')}
          </p>
          <h2 className="display-title font-serif! mb-4 text-4xl font-bold text-slate-900 md:text-5xl">
            {t('Tout votre tableau de bord,')}{' '}
            <span className="air-gradient-text font-serif italic">
              {t('une seule plaque')}
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-slate-600">
            {t(
              'Une plateforme complète pour gérer vos locations courte durée comme un pro.',
            )}
          </p>
        </Reveal>

        {/* Rangée haute : grande carte + 2 moyennes */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-4">
          {/* Grande carte (2×2) — Dashboard multi-propriétés */}
          <Reveal className="md:col-span-2 md:row-span-2">
            <GlassCard hoverScale={1.02} className="h-full bg-white/95! border-slate-200/70! air-shadow p-6 backdrop-blur-xl backdrop-saturate-[1.4] sm:p-8">
              <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#0066EF]/25 bg-[#EAF2FF] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#0642A8]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0066EF]" />
                {t('Cœur du produit')}
              </span>
              <h3 className="mb-2 font-serif text-2xl font-bold text-slate-900 sm:text-3xl">
                {t('Dashboard multi-propriétés')}
              </h3>
              <p className="max-w-md text-slate-600">
                {t(
                  'Pilotez villas, studios et appartements depuis un seul écran : séjours, services, équipe et revenus — en temps réel.',
                )}
              </p>
              <DashboardMockup />
            </GlassCard>
          </Reveal>

          {/* Moyenne (2×1) — Upselling */}
          <Reveal className="md:col-span-2" delay={0.1}>
            <GlassCard hoverScale={1.02} className="h-full bg-white/95! border-slate-200/70! air-shadow p-6 backdrop-blur-xl backdrop-saturate-[1.4] sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <GlowingEmoji
                    emoji="💰"
                    glow="drop-shadow-[0_0_24px_rgba(0,102,239,0.55)]"
                  />
                  <h3 className="mb-2 font-serif text-xl font-bold text-slate-900 sm:text-2xl">
                    {t('Upselling automatisé')}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-600">
                    {t(
                      'Vendez petit-déjeuner, transfert ou late check-out directement depuis le hub. Revenus passifs, zéro effort.',
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:w-44">
                  {[
                    'Petit-déjeuner · +12 €',
                    'Transfert gare · +29 €',
                    'Late check-out · +45 €',
                  ].map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-[#0066EF]/25 bg-[#EAF2FF] px-3 py-1.5 text-center text-[11px] font-semibold text-[#0642A8]"
                    >
                      {t(chip)}
                    </span>
                  ))}
                  <span className="text-center text-[11px] font-bold text-emerald-600">
                    {t('≈ +340 € / mois')}
                  </span>
                </div>
              </div>
            </GlassCard>
          </Reveal>

          {/* Moyenne (2×1) — Anti-mauvais avis */}
          <Reveal className="md:col-span-2" delay={0.2}>
            <GlassCard hoverScale={1.02} className="h-full bg-white/95! border-slate-200/70! air-shadow p-6 backdrop-blur-xl backdrop-saturate-[1.4] sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <GlowingEmoji
                    emoji="🛡️"
                    glow="drop-shadow-[0_0_24px_rgba(0,71,179,0.55)]"
                  />
                  <h3 className="mb-2 font-serif text-xl font-bold text-slate-900 sm:text-2xl">
                    {t('Anti-mauvais avis')}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-600">
                    {t(
                      "Un souci ? L'invité le signale en privé depuis le hub. Vous résolvez avant que l'avis public n'existe.",
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1.5 sm:w-44">
                  {['Signalement privé', 'Résolution express', '★★★★★ préservée'].map(
                    (step, i) => (
                      <div key={step} className="flex flex-col items-center gap-1.5">
                        {i > 0 && (
                          <span
                            aria-hidden="true"
                            className="text-sm leading-none text-emerald-500/70"
                          >
                            ↓
                          </span>
                        )}
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                          {t(step)}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </GlassCard>
          </Reveal>
        </div>

        {/* Rangée basse : 3 petites cartes (1×1) */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 md:grid-cols-3">
          {SMALL_CARDS.map((card, i) => (
            <Reveal key={card.title} delay={0.1 + i * 0.1}>
              <GlassCard hoverScale={1.02} className="h-full bg-white/95! border-slate-200/70! air-shadow p-6 backdrop-blur-xl backdrop-saturate-[1.4] sm:p-7">
                <GlowingEmoji emoji={card.emoji} glow={card.glow} />
                <h3 className="mb-2 font-serif text-xl font-bold text-slate-900">
                  {t(card.title)}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  {t(card.description)}
                </p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
