'use client';

// =============================================================
// InteractiveDemo — Landing "Conciergerie Hub" (ÉTAPE 22bis / V4)
//
// DÉMO INTERACTIVE CYCLIQUE — la pièce maîtresse de la landing.
//   Gauche  : plaque QR physique stylisée (qrcode.react) avec ligne
//             de scan animée pendant l'état 1.
//   Droite  : mockup téléphone en CSS pur (encoche, status bar,
//             home indicator) dont l'écran change toutes les 4 s.
//   Bas     : dots cliquables + bouton Pause/Lecture.
//
// Les 3 états (pitch commercial scénarisé, boucle infinie) :
//   1. L'invité scanne        → hub d'accueil (Mode Invité / Hôte)
//   2. Expérience guest        → onglet Services, commande Morning
//                                Box + toast « Commande envoyée ! »
//   3. Le dashboard hôte       → multi-propriétés temps réel
//
// Transitions : AnimatePresence (slide + fade) — jamais de saut.
// =============================================================

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  Battery,
  Bell,
  ChevronRight,
  ConciergeBell,
  Home,
  Pause,
  Play,
  ShoppingBag,
  Signal,
  User,
  Wifi,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const CYCLE_MS = 4000;

const STEP_CAPTIONS = [
  '1️⃣ L’invité scanne la plaque — hub ouvert en 1 seconde',
  '2️⃣ Il commande son petit-déjeuner depuis son téléphone',
  '3️⃣ L’hôte pilote tout depuis son dashboard temps réel',
] as const;

/** Statut affiché sous la plaque QR, synchronisé avec l'état. */
const PLAQUE_STATUS = [
  { label: 'Scannez-moi', tone: 'slate' },
  { label: '✓ Hub ouvert', tone: 'emerald' },
  { label: '✓ Commande transmise à l’hôte', tone: 'emerald' },
] as const;

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export interface InteractiveDemoProps {
  className?: string;
}

export function InteractiveDemo({ className }: InteractiveDemoProps) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  // Boucle infinie : chaque état reste 4 s, le timer repart à zéro
  // après un clic manuel sur un dot (chaîne de setTimeout par état).
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(
      () => setStep((s) => (s + 1) % STEP_CAPTIONS.length),
      CYCLE_MS,
    );
    return () => clearTimeout(t);
  }, [step, playing]);

  return (
    <div className={cn('relative mx-auto w-full max-w-4xl', className)}>
      {/* ----- Formes d'ambiance (dégradés flous) ----- */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-12 -top-12 h-72 w-72 rounded-full bg-blue-100/50 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-12 -right-12 h-72 w-72 rounded-full bg-emerald-100/60 blur-3xl"
      />

      <div className="relative flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-center lg:gap-16">
        <QrPlaque step={step} />
        <PhoneMockup step={step} />
      </div>

      {/* ----- Contrôles : légende, dots, pause ----- */}
      <div className="relative mt-10 flex flex-col items-center gap-4">
        <div className="h-6" role="status" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.p
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="text-center text-sm font-medium text-slate-600"
            >
              {STEP_CAPTIONS[step]}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2" role="tablist" aria-label="Étapes de la démo">
            {STEP_CAPTIONS.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={step === i}
                aria-label={`Étape ${i + 1}`}
                onClick={() => setStep(i)}
                className={cn(
                  'h-2.5 rounded-full transition-all duration-300',
                  step === i ? 'w-7 bg-emerald-500' : 'w-2.5 bg-slate-300 hover:bg-slate-400',
                )}
              />
            ))}
          </div>

          <span aria-hidden="true" className="h-4 w-px bg-slate-200" />

          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-pressed={!playing}
            aria-label={playing ? 'Mettre la démo en pause' : 'Reprendre la démo'}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
          >
            {playing ? (
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {playing ? 'Pause' : 'Lecture'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// Plaque QR physique (gauche)
// =============================================================

function QrPlaque({ step }: { step: number }) {
  const status = PLAQUE_STATUS[step];
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="relative"
    >
      <motion.div
        animate={step === 0 ? { scale: [1, 1.02, 1] } : { scale: 1 }}
        transition={step === 0 ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.4 }}
        className="w-60 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70"
      >
        {/* Marque de la plaque */}
        <div className="mb-3 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-sm"
          >
            🏠
          </span>
          <div className="leading-tight">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-900">Conciergerie</p>
            <p className="text-[10px] font-medium text-slate-400">Plaque Hub officielle</p>
          </div>
        </div>

        {/* Zone QR + ligne de scan */}
        <div className="relative rounded-2xl border border-slate-100 bg-white p-3">
          <QRCodeSVG
            value="https://hub.conciergerie-hub.app/loft-canal"
            size={168}
            bgColor="#FFFFFF"
            fgColor="#0F172A"
            level="H"
            className="mx-auto block h-auto w-full max-w-[168px]"
          />
          {/* Petit logo central */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-100 bg-white px-2 py-1 shadow-sm">
            <span aria-hidden="true" className="text-lg leading-none">
              🏠
            </span>
          </div>

          {/* Ligne de scan animée (état 1 uniquement) */}
          <AnimatePresence>
            {step === 0 && (
              <motion.div
                key="scanline"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                aria-hidden="true"
                className="pointer-events-none absolute inset-3 overflow-hidden rounded-xl"
              >
                <motion.div
                  animate={{ top: ['4%', '88%', '4%'] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-x-0 h-8 bg-gradient-to-b from-emerald-400/0 via-emerald-400/40 to-emerald-400/0"
                />
                <div className="absolute inset-0 rounded-xl ring-2 ring-inset ring-emerald-400/50" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Statut synchronisé */}
        <div className="mt-3 flex items-center justify-center gap-2">
          {status.tone === 'emerald' ? (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              aria-hidden="true"
              className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white"
            >
              ✓
            </motion.span>
          ) : (
            <span
              aria-hidden="true"
              className="relative flex h-2.5 w-2.5"
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          )}
          <AnimatePresence mode="wait">
            <motion.span
              key={status.label}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3 }}
              className={cn(
                'text-xs font-semibold',
                status.tone === 'emerald' ? 'text-emerald-700' : 'text-slate-500',
              )}
            >
              {status.label}
            </motion.span>
          </AnimatePresence>
        </div>

        <p className="mt-2 text-center text-[10px] text-slate-400">
          hub.conciergerie-hub.app/loft-canal
        </p>
      </motion.div>
    </motion.div>
  );
}

// =============================================================
// Mockup téléphone (droite) — CSS pur
// =============================================================

function PhoneMockup({ step }: { step: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
      className="relative"
    >
      {/* Châssis */}
      <div className="relative w-[290px] rounded-[2.8rem] border border-slate-200 bg-slate-900 p-2.5 shadow-2xl shadow-slate-400/30 sm:w-[300px]">
        {/* Boutons latéraux */}
        <div aria-hidden="true" className="absolute -left-[2px] top-24 h-10 w-[3px] rounded-l-md bg-slate-700" />
        <div aria-hidden="true" className="absolute -right-[2px] top-28 h-14 w-[3px] rounded-r-md bg-slate-700" />

        {/* Écran */}
        <div className="relative h-[560px] overflow-hidden rounded-[2.3rem] bg-slate-50">
          {/* Encoche */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-2 z-30 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-900"
          />

          {/* Status bar */}
          <div className="relative z-20 flex items-center justify-between px-6 pt-2.5 text-slate-800">
            <span className="text-[11px] font-semibold">9:41</span>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <Signal className="h-3 w-3" />
              <Wifi className="h-3 w-3" />
              <Battery className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* Écrans (transition slide + fade) */}
          <div className="absolute inset-x-0 bottom-0 top-8">
            <AnimatePresence initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 56 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -56 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="absolute inset-0"
              >
                {step === 0 && <GuestWelcomeScreen />}
                {step === 1 && <GuestServicesScreen />}
                {step === 2 && <HostDashboardScreen />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Home indicator */}
          <div
            aria-hidden="true"
            className="absolute bottom-1.5 left-1/2 z-30 h-1 w-24 -translate-x-1/2 rounded-full bg-slate-300"
          />
        </div>
      </div>
    </motion.div>
  );
}

// -------------------------------------------------------------
// Écran 1 — L'invité scanne (accueil du Hub)
// -------------------------------------------------------------

function GuestWelcomeScreen() {
  return (
    <div className="flex h-full flex-col px-4 pb-8 pt-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-base shadow-sm"
        >
          🏠
        </span>
        <div className="leading-tight">
          <p className="text-[13px] font-bold text-slate-900">Loft Canal St-Martin</p>
          <p className="text-[10px] text-slate-500">Votre hub de séjour</p>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-lg font-bold text-slate-900">Bienvenue Camille 👋</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">Que souhaitez-vous faire ?</p>
      </div>

      <div className="mt-4 space-y-3">
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 shadow-sm transition-shadow hover:shadow-md"
        >
          <span aria-hidden="true" className="text-3xl leading-none">
            👤
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-slate-900">Mode Invité</p>
            <p className="truncate text-[10px] text-slate-600">Guidebook, Wi-Fi & services</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md"
        >
          <span aria-hidden="true" className="text-3xl leading-none">
            🔐
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-slate-900">Mode Hôte</p>
            <p className="truncate text-[10px] text-slate-600">Espace propriétaire — PIN</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="mt-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
      >
        <Wifi className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
        <p className="text-[10px] font-medium text-slate-600">
          Wi-Fi <span className="font-bold text-slate-900">Loft_5GHz</span> — connexion en 1 tap
        </p>
      </motion.div>
    </div>
  );
}

// -------------------------------------------------------------
// Écran 2 — Expérience guest : upselling Services
// -------------------------------------------------------------

function GuestServicesScreen() {
  const [ordered, setOrdered] = useState(false);

  // Scénario : tap automatique à 1,1 s → toast de confirmation à 1,5 s.
  useEffect(() => {
    const t1 = setTimeout(() => setOrdered(true), 1100);
    return () => clearTimeout(t1);
  }, []);

  return (
    <div className="relative flex h-full flex-col bg-slate-50 px-4 pb-8 pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="leading-tight">
          <h3 className="text-base font-bold text-slate-900">Services</h3>
          <p className="text-[10px] text-slate-500">Livraison en 10 min · 7h–22h</p>
        </div>
        <div className="relative rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <ShoppingBag className="h-4 w-4 text-slate-700" aria-hidden="true" />
          {ordered && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white"
            >
              1
            </motion.span>
          )}
        </div>
      </div>

      {/* Catégories */}
      <div className="mt-3 flex gap-1.5">
        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white">
          🥐 Petit-déj
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600">
          🚕 Transferts
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600">
          🕯️ Expériences
        </span>
      </div>

      {/* Carte produit */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-3xl"
          >
            🥐
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-slate-900">Petit-déjeuner Morning Box</p>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
              Viennoiseries bio, jus frais pressé — déposé devant votre porte
            </p>
            <p className="mt-1 text-sm font-extrabold text-slate-900">8,50 €</p>
          </div>
        </div>

        <motion.button
          type="button"
          animate={ordered ? { scale: [0.95, 1] } : { scale: 1 }}
          transition={{ duration: 0.25 }}
          className={cn(
            'mt-3 w-full rounded-xl py-2.5 text-xs font-bold transition-colors',
            ordered
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-900 text-white hover:bg-slate-800',
          )}
          aria-label={ordered ? 'Commande envoyée' : 'Commander pour 8,50 €'}
        >
          {ordered ? '✓ Commandé' : 'Commander pour 8,50 €'}
        </motion.button>
      </div>

      {/* Produit secondaire (remplissage réaliste) */}
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 opacity-70 shadow-sm">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-2xl"
        >
          ☕
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-slate-900">Box Café & Granola</p>
          <p className="text-[10px] text-slate-500">5,90 €</p>
        </div>
        <span className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500">
          +
        </span>
      </div>

      {/* Toast de confirmation */}
      <AnimatePresence>
        {ordered && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="absolute inset-x-4 bottom-20 z-20 rounded-2xl bg-slate-900 px-4 py-3 shadow-2xl"
            role="status"
          >
            <p className="text-xs font-bold text-white">✅ Commande envoyée !</p>
            <p className="mt-0.5 text-[10px] text-slate-300">
              Morning Box prépare votre commande — l’hôte est notifié.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom nav */}
      <div className="mt-auto flex items-center justify-around rounded-2xl border border-slate-200 bg-white px-2 py-2.5 shadow-sm">
        <div className="flex flex-col items-center gap-0.5 text-slate-400">
          <Home className="h-4 w-4" aria-hidden="true" />
          <span className="text-[9px] font-medium">Accueil</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 text-emerald-600">
          <ConciergeBell className="h-4 w-4" aria-hidden="true" />
          <span className="text-[9px] font-bold">Services</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 text-slate-400">
          <User className="h-4 w-4" aria-hidden="true" />
          <span className="text-[9px] font-medium">Profil</span>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Écran 3 — Dashboard hôte multi-propriétés
// -------------------------------------------------------------

const HOST_PROPERTIES = [
  {
    emoji: '🏠',
    name: 'Loft Paris',
    detail: '2 réservations cette semaine',
    chip: { label: 'En séjour', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  },
  {
    emoji: '🏠',
    name: 'Villa Nice',
    detail: 'Check-out aujourd’hui',
    chip: { label: 'Ménage 14:00', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  },
  {
    emoji: '🏡',
    name: 'Studio Lyon',
    detail: 'Aucune arrivée prévue',
    chip: { label: 'Libre', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  },
] as const;

function HostDashboardScreen() {
  return (
    <div className="flex h-full flex-col px-4 pb-8 pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white"
          >
            M
          </span>
          <div className="leading-tight">
            <h3 className="text-sm font-bold text-slate-900">Bonjour Marie 👋</h3>
            <p className="text-[10px] text-slate-500">3 logements · tout va bien</p>
          </div>
        </div>
        <div className="relative rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <Bell className="h-4 w-4 text-slate-700" aria-hidden="true" />
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { value: '1 240 €', label: 'Ce mois' },
          { value: '4,9 ★', label: 'Note moyenne' },
          { value: '3', label: 'Notifications' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-center shadow-sm"
          >
            <p className="text-[12px] font-extrabold text-slate-900">{kpi.value}</p>
            <p className="mt-0.5 text-[8.5px] font-medium text-slate-500">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Liste multi-propriétés */}
      <div className="mt-4 space-y-2.5">
        {HOST_PROPERTIES.map((p, i) => (
          <motion.div
            key={p.name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.15, duration: 0.4, ease: EASE }}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              {p.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-bold text-slate-900">{p.name}</p>
              <p className="truncate text-[10px] text-slate-500">{p.detail}</p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold',
                p.chip.cls,
              )}
            >
              {p.chip.label}
            </span>
          </motion.div>
        ))}
      </div>

      <p className="mt-auto text-center text-[9.5px] font-medium text-slate-400">
        Pilotage temps réel · équipe synchronisée ✓
      </p>
    </div>
  );
}
