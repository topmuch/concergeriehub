'use client';

// =============================================================
// PAGE POST-PAIEMENT — « CERTIFICAT ANTI-DÉGÂTS » ACTIVÉ
//
// Objectif : rassurer (il vient de payer), justifier le prix,
// et faire agir IMMÉDIATEMENT via LE GROS BOUTON ROUGE vers le
// wizard d'onboarding dynamique. Pas de login, pas de dashboard.
//
// Design : thème clair premium (fond slate-50, cartes blanches shadow-sm)
// + rouge #C21F26 (produit), CTA exactement conforme à la spec
// (bg-red-700, texte BLANC), barre de progression 3 étapes, layout 2 colonnes.
// =============================================================

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ShieldCheck, Clock3, Camera, Sparkles } from 'lucide-react';

// ---------- Barre de progression (3 étapes) ----------

function ProgressSteps() {
  const steps = [
    { label: 'Paiement fait', state: 'done' as const, icon: <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" /> },
    { label: 'Onboarding à faire', state: 'active' as const, icon: <Camera className="h-4 w-4 sm:h-5 sm:w-5" /> },
    { label: 'Protection active', state: 'todo' as const, icon: <Clock3 className="h-4 w-4 sm:h-5 sm:w-5" /> },
  ];
  return (
    <ol className="w-full max-w-xl mx-auto" aria-label="Progression de l'activation">
      <div className="flex items-start">
        {steps.map((s, i) => (
          <div key={s.label} className="flex-1 flex flex-col items-center relative">
            {/* Ligne de connexion */}
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute top-4 right-1/2 h-0.5 w-full ${
                  s.state === 'todo' ? 'bg-gray-200' : 'bg-[#C21F26]'
                }`}
              />
            )}
            <div
              aria-current={s.state === 'active' ? 'step' : undefined}
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 sm:h-9 sm:w-9 ${
                s.state === 'done'
                  ? 'border-[#C21F26] bg-[#C21F26] text-white'
                  : s.state === 'active'
                    ? 'animate-pulse border-[#C21F26] bg-[#C21F26] text-white ring-4 ring-[#C21F26]/20'
                    : 'border-gray-300 bg-white text-gray-500'
              }`}
            >
              {s.icon}
            </div>
            <span
              className={`mt-2 text-center text-[10px] font-semibold uppercase tracking-wide sm:text-xs ${
                s.state === 'active' ? 'text-gray-900 font-bold' : s.state === 'done' ? 'text-gray-600' : 'text-gray-400'
              }`}
            >
              {i + 1}. {s.label}
            </span>
          </div>
        ))}
      </div>
    </ol>
  );
}

// ---------- Page ----------

export default function PaymentSuccess() {
  return (
    <div className="relative flex min-h-screen flex-col bg-slate-50 text-gray-900">
      {/* Halo rouge décoratif (adouci pour fond clair) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(194,31,38,0.12),transparent_65%)]"
      />

      {/* ── Header ── */}
      <header className="relative z-10 border-b border-gray-200 px-4 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-gray-900">
            Room<span className="text-[#C21F26]">Scan</span>
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Paiement confirmé
          </span>
        </div>
      </header>

      {/* ── Barre de progression ── */}
      <section className="relative z-10 px-4 pt-8 pb-2 sm:pt-10">
        <ProgressSteps />
      </section>

      {/* ── Contenu 2 colonnes ── */}
      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-10">
        <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
          {/* Colonne GAUCHE — ce qu'il a acheté (justifier le prix) */}
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
            aria-labelledby="bought-title"
          >
            <h2 id="bought-title" className="text-xl font-black leading-tight text-gray-900 sm:text-2xl">
              🛡️ Votre Certificat Anti-Dégâts est activé
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Voici exactement ce que vous avez débloqué aujourd&apos;hui :
            </p>
            <ul className="mt-6 space-y-4">
              {[
                {
                  t: 'Preuve vidéo horodatée SHA256',
                  d: 'Chaque check-in produit une vidéo walkthrough scellée par une empreinte SHA-256 infalsifiable.',
                },
                {
                  t: 'Protection caution Airbnb infalsifiable',
                  d: 'Photos + vidéo + hash + QR : un dossier incontestable pour récupérer votre caution en cas de dégâts.',
                },
                {
                  t: 'Bibliothèque de référence réutilisable à vie',
                  d: 'Vos pièces et équipements photographiés UNE seule fois, réutilisés automatiquement à chaque séjour.',
                },
              ].map((f) => (
                <li key={f.t} className="flex gap-3">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#C21F26] text-[13px] font-black text-white"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <div>
                    <p className="font-bold text-gray-900">{f.t}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-gray-600">{f.d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
              📄 À chaque état des lieux, un PDF professionnel de 2 pages est généré —
              <strong className="text-gray-800"> uniquement avec vos pièces et équipements réels</strong>.
              Aucune case vide, aucune ligne « N/A ».
            </p>
          </motion.section>

          {/* Colonne DROITE — ce qu'il doit faire (action immédiate) */}
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12, ease: 'easeOut' }}
            className="flex flex-col rounded-3xl border border-red-200 bg-white p-6 shadow-sm sm:p-8"
            aria-labelledby="todo-title"
          >
            <h2 id="todo-title" className="text-xl font-black leading-tight text-gray-900 sm:text-2xl">
              🎯 Activez votre protection en 5 minutes
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Il vous faut juste votre smartphone, 5 min, et être dans le logement.
            </p>
            <div className="mt-6 flex-1">
              <Link
                href="/onboarding/wizard?step=1"
                className="block w-full rounded-2xl bg-red-700 px-12 py-6 text-center text-xl font-bold text-white shadow-2xl transition-colors hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 active:scale-[0.99]"
              >
                COMMENCER L&apos;ONBOARDING 5 MIN →
              </Link>
              <p className="mt-3 text-center text-xs text-gray-500">
                3 questions rapides puis la capture guidée photo par photo.
              </p>
            </div>
            <ul className="mt-6 space-y-2.5 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <span className="text-[#C21F26]">①</span> Vos pièces + vos équipements (rien d&apos;autre)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[#C21F26]">②</span> 1 photo par pièce, 1 photo par équipement
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[#C21F26]">③</span> Bibliothèque verrouillée → certificat PDF généré
              </li>
            </ul>
          </motion.section>
        </div>
      </main>

      {/* ── Footer collé en bas ── */}
      <footer className="relative z-10 mt-auto border-t border-gray-200 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 text-xs text-gray-500 sm:flex-row">
          <p>© RoomScan — Certificat Anti-Dégâts • Document sécurisé SHA-256</p>
          <Link href="/airbnb/billing" className="transition-colors hover:text-gray-700">
            Voir ma facturation →
          </Link>
        </div>
      </footer>
    </div>
  );
}
