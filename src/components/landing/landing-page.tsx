'use client';

// =============================================================
// LandingPage V2 — ÉTAPE 2/3 « Effet Wahou » (style QRTags, clair)
//
// 7 blocs : Hero (badge White-Label + double CTA + démo interactive
// de l'ÉTAPE 1 intégrée) → preuve sociale → Avant/Après → 3 étapes
// → Bento Grid → Tarifs (Solo / Pro) → Footer sticky.
//
// Design system : fond slate-50 + dégradés flous, cartes blanches
// border-slate-200 rounded-2xl shadow-sm hover:shadow-md, titres de
// carte emoji + icônes lucide, animations framer-motion (fade-up +
// stagger). Police : Plus Jakarta Sans (posée par app/page.tsx).
// =============================================================

import { motion, type Variants } from 'framer-motion';
import { ArrowRight, CheckCircle2, XCircle, Zap } from 'lucide-react';
import { InteractiveDemo } from './interactive-demo';

// --- Variants d'animation Framer Motion ---
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 100, damping: 15 },
  },
};

/** Défilement doux vers une ancre de la page. */
function smoothScrollTo(selector: string) {
  if (typeof document === 'undefined') return;
  document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' });
}

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-slate-50 font-sans text-slate-900 selection:bg-emerald-100">
      <main className="flex-1">
        {/* ==========================================
            1. HERO SECTION
        ========================================== */}
        <section className="relative overflow-hidden px-4 pt-20 pb-32 sm:px-6">
          {/* Fond dégradé subtil */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-50/50 via-slate-50 to-emerald-50/50" />
          <div className="absolute -top-0 left-1/2 -z-10 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-blue-200/20 blur-[100px]" />

          <motion.div
            className="mx-auto max-w-6xl text-center"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
          >
            <motion.div
              variants={itemVariants}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-800"
            >
              <Zap className="h-4 w-4" />
              Nouveau : Mode White-Label disponible pour les pros
            </motion.div>

            <motion.h1
              variants={itemVariants}
              className="mb-6 text-4xl font-extrabold tracking-tight text-slate-900 md:text-6xl"
            >
              Transformez chaque séjour en <br className="hidden md:block" />
              <span className="bg-gradient-to-r from-blue-600 to-emerald-600 bg-clip-text text-transparent">
                expérience 5 étoiles.
              </span>{' '}
              <span className="whitespace-nowrap">Sans application.</span>
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-slate-600 md:text-xl"
            >
              Une seule plaque QR élégante. Vos invités accèdent au Wi-Fi et
              aux services en 1 scan. Vous pilotez tout depuis un dashboard
              professionnel.
            </motion.p>

            <motion.div
              variants={itemVariants}
              className="mb-14 flex flex-col items-center justify-center gap-4 sm:flex-row"
            >
              <button
                type="button"
                onClick={() => smoothScrollTo('#demo')}
                className="group flex items-center gap-2 rounded-xl bg-slate-900 px-8 py-4 font-semibold text-white shadow-lg transition-all hover:bg-slate-800 hover:shadow-xl"
              >
                Essayer la démo interactive
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={() => smoothScrollTo('#tarifs')}
                className="rounded-xl border border-slate-200 bg-white px-8 py-4 font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50"
              >
                Voir les tarifs
              </button>
            </motion.div>

            {/* Intégration de la Démo Interactive (ÉTAPE 1) */}
            <motion.div variants={itemVariants} id="demo" className="mt-8 scroll-mt-6">
              <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl md:p-10">
                <div className="mx-auto mb-8 max-w-2xl text-center">
                  <h3 className="text-2xl font-bold text-slate-900">
                    📱 La magie en 1 scan
                  </h3>
                  <p className="mt-2 text-slate-600">
                    Observez comment l&apos;expérience bascule fluidement entre
                    le mode Invité (commande de services) et le mode Hôte
                    (dashboard de gestion), le tout sans installer
                    d&apos;application.
                  </p>
                  <div className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500"
                    />
                    Démo en cours de lecture…
                  </div>
                </div>
                <InteractiveDemo />
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* ==========================================
            2. PREUVE SOCIALE
        ========================================== */}
        <section className="border-y border-slate-200 bg-white/50 py-12">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
            <p className="mb-8 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Compatible avec vos outils préférés
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8 opacity-60 grayscale transition-all duration-500 hover:grayscale-0 md:gap-16">
              {['Airbnb', 'Booking.com', 'Stripe', 'Morning Box', 'WhatsApp'].map(
                (brand) => (
                  <span
                    key={brand}
                    className="text-xl font-bold text-slate-800 md:text-2xl"
                  >
                    {brand}
                  </span>
                ),
              )}
            </div>
          </div>
        </section>

        {/* ==========================================
            3. PROBLÈME VS SOLUTION
        ========================================== */}
        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <motion.div
              className="mb-16 text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">
                Fini les fiches papier et les appels incessants
              </h2>
              <p className="text-lg text-slate-600">
                La différence entre une gestion chaotique et une conciergerie
                professionnelle.
              </p>
            </motion.div>

            <div className="grid gap-8 md:grid-cols-2">
              {/* Carte Avant */}
              <motion.div
                className="rounded-2xl border border-red-100 bg-red-50 p-8 shadow-sm"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <div className="mb-4 text-4xl">😫</div>
                <h3 className="mb-4 text-xl font-bold text-red-900">
                  Avant Conciergerie Hub
                </h3>
                <ul className="space-y-3 text-red-800/80">
                  <li className="flex items-start gap-3">
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0" /> Fiches Wi-Fi
                    illisibles ou perdues
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0" /> Guests qui
                    appellent pour chaque détail
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0" /> Avis négatifs
                    pour des malentendus
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0" /> Zéro revenu
                    additionnel généré
                  </li>
                </ul>
              </motion.div>

              {/* Carte Après */}
              <motion.div
                className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50 p-8 shadow-sm"
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-emerald-200/30 blur-3xl" />
                <div className="relative z-10 mb-4 text-4xl">🚀</div>
                <h3 className="relative z-10 mb-4 text-xl font-bold text-emerald-900">
                  Avec Conciergerie Hub
                </h3>
                <ul className="relative z-10 space-y-3 text-emerald-800/80">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    Hub digital élégant et autonome
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    Services en 1 clic (ex : Morning Box)
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    Bouclier anti-mauvais avis intégré
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    Upselling automatique et traçable
                  </li>
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ==========================================
            4. COMMENT ÇA MARCHE
        ========================================== */}
        <section className="border-y border-slate-100 bg-white px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="mb-16 text-3xl font-bold text-slate-900 md:text-4xl">
              Opérationnel en 3 minutes
            </h2>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                {
                  emoji: '📦',
                  title: 'Recevez votre Plaque',
                  desc: 'Un design premium, prêt à être posé dans le salon ou l’entrée de votre logement.',
                },
                {
                  emoji: '📱',
                  title: 'Scannez pour configurer',
                  desc: 'Wizard ultra-simple : ajoutez le Wi-Fi, les règles et définissez votre code PIN hôte.',
                },
                {
                  emoji: '🚀',
                  title: 'Vos invités sont autonomes',
                  desc: 'Ils scannent, commandent et s’informent. Vous pilotez tout à distance.',
                },
              ].map((step, i) => (
                <motion.div
                  key={step.title}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-left transition-shadow hover:shadow-md"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="mb-6 text-5xl">{step.emoji}</div>
                  <h3 className="mb-3 text-xl font-bold text-slate-900">
                    {i + 1}. {step.title}
                  </h3>
                  <p className="leading-relaxed text-slate-600">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ==========================================
            5. FONCTIONNALITÉS CLÉS (BENTO GRID)
        ========================================== */}
        <section id="fonctionnalites" className="scroll-mt-6 px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 md:text-4xl">
              Tout ce dont vous avez besoin pour scaler
            </h2>
            <div className="grid auto-rows-[minmax(180px,auto)] grid-cols-1 gap-6 md:grid-cols-3">
              {/* Grande carte */}
              <motion.div
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-all hover:shadow-md md:col-span-2"
                whileHover={{ y: -4 }}
              >
                <div>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-2xl">
                    📊
                  </div>
                  <h3 className="mb-2 text-2xl font-bold text-slate-900">
                    Dashboard Multi-Propriétés
                  </h3>
                  <p className="text-slate-600">
                    Gérez 1 ou 100 logements depuis une seule interface.
                    Invitez votre équipe (ménage, maintenance) avec des rôles
                    et permissions granulaires.
                  </p>
                </div>
              </motion.div>

              {/* Carte moyenne */}
              <motion.div
                className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-all hover:shadow-md"
                whileHover={{ y: -4 }}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-2xl">
                  💰
                </div>
                <h3 className="mb-2 text-xl font-bold text-slate-900">
                  Générez des revenus
                </h3>
                <p className="text-sm text-slate-600">
                  Upselling intégré : petit-déjeuner, transferts, late
                  check-out. Vous gardez une marge sur chaque vente.
                </p>
              </motion.div>

              {/* Carte moyenne */}
              <motion.div
                className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-all hover:shadow-md"
                whileHover={{ y: -4 }}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-2xl">
                  🛡️
                </div>
                <h3 className="mb-2 text-xl font-bold text-slate-900">
                  Anti-Mauvais Avis
                </h3>
                <p className="text-sm text-slate-600">
                  Formulaire de réclamation privé. Résolvez les problèmes avant
                  qu’ils n’atterrissent sur Airbnb.
                </p>
              </motion.div>

              {/* Grande carte */}
              <motion.div
                className="flex items-center gap-8 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-white shadow-sm transition-all hover:shadow-md md:col-span-2"
                whileHover={{ y: -4 }}
              >
                <div className="hidden text-6xl md:block">🌍</div>
                <div>
                  <h3 className="mb-2 text-2xl font-bold">White-Label Complet</h3>
                  <p className="mb-4 text-slate-300">
                    Votre logo, vos couleurs, votre nom de domaine (ex :
                    guests.votre-conciergerie.com). Vos invités ne voient que
                    votre marque.
                  </p>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400">
                    Inclus dans l&apos;offre Pro <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ==========================================
            6. TARIFICATION
        ========================================== */}
        <section id="tarifs" className="scroll-mt-6 bg-slate-100/50 px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-5xl text-center">
            <h2 className="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">
              Des tarifs simples, sans surprise
            </h2>
            <p className="mb-12 text-slate-600">
              Choisissez l&apos;offre adaptée à la taille de votre activité.
            </p>

            <div className="mx-auto grid max-w-3xl gap-8 md:grid-cols-2">
              {/* Offre Solo */}
              <motion.div
                className="rounded-2xl border border-slate-200 bg-white p-8 text-left shadow-sm"
                whileHover={{ y: -4 }}
              >
                <div className="mb-4 text-3xl">🏠</div>
                <h3 className="text-xl font-bold text-slate-900">Solo</h3>
                <p className="mb-6 text-sm text-slate-500">
                  Pour les hôtes avec 1 seul logement.
                </p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold text-slate-900">
                    9,90 €
                  </span>
                  <span className="text-slate-500"> /mois</span>
                </div>
                <ul className="mb-8 space-y-3 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> 1
                    Plaque QR Hub
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />{' '}
                    Guidebook &amp; Wi-Fi illimités
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Module
                    Upselling de base
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Support
                    par email
                  </li>
                </ul>
                <button
                  type="button"
                  className="w-full rounded-xl bg-slate-100 py-3 font-semibold text-slate-900 transition-colors hover:bg-slate-200"
                >
                  Commencer l&apos;essai
                </button>
              </motion.div>

              {/* Offre Pro */}
              <motion.div
                className="relative rounded-2xl border border-slate-800 bg-slate-900 p-8 text-left text-white shadow-xl"
                whileHover={{ y: -4 }}
              >
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-lg">
                  LE PLUS POPULAIRE
                </div>
                <div className="mb-4 text-3xl">🏢</div>
                <h3 className="text-xl font-bold">Pro</h3>
                <p className="mb-6 text-sm text-slate-400">
                  Pour les conciergeries et multi-hôtes.
                </p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold">199 €</span>
                  <span className="text-slate-400"> /an</span>
                  <p className="mt-1 text-xs font-medium text-emerald-400">
                    Équivalent à 16,50 €/mois (2 mois offerts)
                  </p>
                </div>
                <ul className="mb-8 space-y-3 text-sm text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />{' '}
                    Jusqu&apos;à 3 logements inclus
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Équipe
                    multi-rôles (Ménage, etc.)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />{' '}
                    White-Label complet (Logo &amp; Domaine)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />{' '}
                    Analytics avancés &amp; Priorité support
                  </li>
                </ul>
                <button
                  type="button"
                  className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-600"
                >
                  Passer à Pro
                </button>
              </motion.div>
            </div>
            <p className="mt-8 text-sm text-slate-500">
              Au-delà de 3 logements,{' '}
              <a
                href="#tarifs"
                className="font-medium text-slate-900 underline"
                onClick={(e) => {
                  e.preventDefault();
                  smoothScrollTo('#tarifs');
                }}
              >
                contactez-nous
              </a>{' '}
              pour un devis sur mesure.
            </p>
          </div>
        </section>
      </main>

      {/* ==========================================
          7. FOOTER (sticky en bas de viewport)
      ========================================== */}
      <footer className="mt-auto border-t border-slate-200 bg-white px-6 py-12 pb-[max(3rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              CH
            </div>
            <span className="font-bold text-slate-900">Conciergerie Hub</span>
          </div>
          <div className="flex flex-wrap justify-center gap-8 text-sm text-slate-600">
            <a href="#fonctionnalites" className="transition-colors hover:text-slate-900">
              Fonctionnalités
            </a>
            <a href="#tarifs" className="transition-colors hover:text-slate-900">
              Tarifs
            </a>
            <a href="#" className="transition-colors hover:text-slate-900">
              Mentions légales
            </a>
            <a href="#" className="transition-colors hover:text-slate-900">
              Contact
            </a>
          </div>
          <p className="text-sm text-slate-400">
            © 2025 Conciergerie Hub. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
}
