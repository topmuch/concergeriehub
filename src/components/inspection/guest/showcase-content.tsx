'use client';

// =============================================================
// v4.98 « SHOWCASE CONTENT » — VITRINE « EFFET WAHOU » (EDL)
// -------------------------------------------------------------
// Page vitrine marketing du module standalone « État des Lieux »,
// affichée quand un invité consulte le lien du logement HORS
// fenêtre de réservation. Langage « luxe tech » (verre dépoli,
// ambre/or sur fond noir) hérité du Hub premium :
//   • HERO immersif plein écran : photo du logement + effet
//     Ken Burns lent (26 s, mirror) + dégradé noir → slate-950 ;
//   • Cascade d'entrée (badge → titre serif → sous-titre →
//     indicateur de statut → ligne de contexte) ;
//   • Indicateur de statut DYNAMIQUE (point vert pulsant, fixe
//     une fois l'EDL signé/archivé) ;
//   • Section « Nos engagements » : 3 cartes glassmorphism ;
//   • Bouton magique « Déjà sur place ? » (fixé bas-droite) qui
//     ouvre le pavé numérique existant LuxuryPinPad — TOUT code
//     à 4 chiffres est accepté et redirige (après 450 ms de
//     feedback) vers le formulaire /inspection/<token> ;
//   • Footer RoomScan + lien direct vers l'état des lieux.
//
// Accessibilité : prefers-reduced-motion désactive Ken Burns et
// les cascades (rendu instantané) ; cibles tactiles ≥ 44 px ;
// focus visible ; aucune donnée sensible affichée.
// =============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { KeyRound, Scale, ShieldCheck, Smartphone } from 'lucide-react';
import LuxuryPinPad from '@/components/hub-premium/luxury-pin-pad';

export type ShowcasePropertyType = 'ENTREE' | 'SORTIE';
export type ShowcaseStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface ShowcaseData {
  token: string;
  propertyName: string;
  ownerName: string;
  type: ShowcasePropertyType;
  status: ShowcaseStatus;
  scheduledDate: string;
  guestName: string;
}

/** Photo curated par défaut (villa au crépuscule) — même repli que le Hub. */
const HERO_IMAGE = '/villa-home-hero.jpg';

/** Easing expo partagé (identique au Hub premium). */
const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

/** Police display luxe (Playfair) avec repli Georgia. */
const SERIF_FONT = { fontFamily: 'var(--font-playfair), Georgia, serif' } as const;

/**
 * Accord de l'article : « le X » → « Bienvenue au X », « les X » →
 * « Bienvenue aux X », « l'X » → « Bienvenue à l'X », noms masculins
 * courants (loft, studio…) → « Bienvenue au X », sinon « Bienvenue à la X ».
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

// Fuseau fixe Europe/Paris : évite tout écart d'hydratation
// serveur/navigateur autour des dates proches de minuit.
function frLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
}

/** Métadonnées de l'indicateur de statut du logement. */
const STATUS_META: Record<ShowcaseStatus, { label: string; archived: boolean }> = {
  PENDING: { label: 'Logement vérifié et prêt pour le prochain séjour', archived: false },
  IN_PROGRESS: { label: 'État des lieux en cours de réalisation', archived: false },
  COMPLETED: { label: 'État des lieux signé et archivé en toute sécurité', archived: true },
};

/** Les 3 engagements (icône, titre, texte) — spec client exacte. */
const COMMITMENTS = [
  {
    icon: ShieldCheck,
    title: 'État des Lieux Digital',
    text: 'Vos dépôts de garantie sécurisés par des preuves numériques horodatées et signées.',
  },
  {
    icon: Scale,
    title: 'Transparence Totale',
    text: 'Une expertise rigoureuse de chaque pièce, appareil et équipement, basée sur des standards juridiques stricts.',
  },
  {
    icon: Smartphone,
    title: 'Expérience Sans Friction',
    text: 'Fini le papier. Tout se fait sur votre mobile en moins de 2 minutes, avec signature électronique.',
  },
] as const;

/** Délais de cascade des cartes engagements. */
const CARD_DELAYS = [0.15, 0.3, 0.45] as const;

export default function ShowcaseContent({ data }: { data: ShowcaseData }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;
  const [isPinOpen, setIsPinOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  // Une fois le code saisi (onVerify → true), le pad reste monté :
  // on laisse ~450 ms de feedback visuel puis on route vers le
  // formulaire d'état des lieux (SANS changement de page manuel).
  useEffect(() => {
    if (!unlocking) return;
    const timer = setTimeout(() => {
      router.push(`/inspection/${encodeURIComponent(data.token)}`);
    }, 450);
    return () => clearTimeout(timer);
  }, [unlocking, router, data.token]);

  /** TOUT code à 4 chiffres est accepté (porte d'entrée élégante). */
  const handleVerify = useCallback(async (pin: string) => {
    if (pin.length === 4) {
      setUnlocking(true);
      return true;
    }
    return false;
  }, []);

  /** Cascade d'entrée — instantanée si prefers-reduced-motion. */
  const reveal = useCallback(
    (delay: number) =>
      reduceMotion
        ? { initial: { opacity: 0, y: 0 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
        : {
            initial: { opacity: 0, y: 24 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.8, ease: EASE_EXPO, delay },
          },
    [reduceMotion],
  );

  const statusMeta = STATUS_META[data.status];

  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-slate-950 text-white">
      {/* ── FOND IMMERSE (flow normal, pas fixed) : photo plein écran
          + Ken Burns lent + dégradé de lisibilité fondu vers le bas ── */}
      <div aria-hidden="true" className="absolute inset-0 h-full overflow-hidden">
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={reduceMotion ? { scale: 1.05 } : { scale: [1, 1.12] }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 26, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }
          }
        >
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${HERO_IMAGE})` }}
          />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-slate-950/95" />
      </div>

      {/* ── HERO — cascade « Effet Wahou » ── */}
      <section
        aria-label="Vitrine du logement"
        className="relative flex min-h-[92dvh] w-full flex-col items-center justify-center px-4 text-center"
      >
        {/* Badge pill (0.1 s) */}
        <motion.p
          {...reveal(0.1)}
          className="rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-200 backdrop-blur-md"
        >
          ✨ Expérience Roomscan
        </motion.p>

        {/* Titre massif serif (0.25 s) */}
        <motion.h1
          {...reveal(0.25)}
          className="mt-6 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl"
          style={{ ...SERIF_FONT, textShadow: '0 4px 32px rgba(0, 0, 0, 0.55)' }}
        >
          {welcomeTitle(data.propertyName)}
        </motion.h1>

        {/* Sous-titre (0.4 s) */}
        <motion.p
          {...reveal(0.4)}
          className="mt-4 max-w-xl text-base text-slate-200/90 sm:text-lg"
        >
          Votre conciergerie digitale et votre espace de confiance.
        </motion.p>

        {/* Indicateur de statut dynamique (0.55 s) */}
        <motion.p
          {...reveal(0.55)}
          className="mt-8 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-white/85 backdrop-blur-md"
        >
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            {!statusMeta.archived && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          {statusMeta.label}
        </motion.p>

        {/* Ligne de contexte (0.65 s) */}
        <motion.p {...reveal(0.65)} className="mt-4 text-xs text-white/55">
          État des lieux {data.type === 'SORTIE' ? 'de sortie' : "d'entrée"} —{' '}
          {frLongDate(data.scheduledDate)}
        </motion.p>
      </section>

      {/* ── NOS ENGAGEMENTS — 3 cartes glassmorphism ── */}
      <section aria-label="Nos engagements" className="relative px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <motion.h2
            {...reveal(0)}
            className="mb-10 text-center text-2xl font-bold sm:text-3xl"
            style={SERIF_FONT}
          >
            Nos engagements
          </motion.h2>

          <div className="grid gap-5 sm:gap-6 md:grid-cols-3">
            {COMMITMENTS.map((commitment, index) => (
              <motion.div
                key={commitment.title}
                {...reveal(CARD_DELAYS[index])}
                whileHover={reduceMotion ? undefined : { y: -6 }}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-all duration-300 hover:bg-white/10"
              >
                <commitment.icon
                  className="mb-3 h-8 w-8 text-amber-400"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <h3 className="mb-2 text-xl font-bold text-white" style={SERIF_FONT}>
                  {commitment.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-300">{commitment.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER RoomScan ── */}
      <footer className="relative px-4 py-10 text-center">
        <p className="text-xs tracking-wide text-white/45">
          Propulsé par RoomScan — La référence de la conciergerie digitale.
        </p>
        <Link
          href={`/inspection/${encodeURIComponent(data.token)}`}
          className="mt-3 inline-block text-xs text-amber-300/80 underline-offset-4 transition-colors hover:text-amber-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
        >
          Accéder directement à l&apos;état des lieux →
        </Link>
        <p className="mt-2 text-[10px] text-white/30">© RoomScan · roomscan.pro</p>
      </footer>

      {/* ── BOUTON MAGIQUE « Déjà sur place ? » — cible tactile ≥ 44 px ── */}
      <button
        type="button"
        onClick={() => setIsPinOpen(true)}
        aria-label="Vous êtes déjà dans le logement ? Accéder au pavé numérique"
        className="fixed bottom-5 right-5 z-40 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.03] hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
      >
        <KeyRound className="h-4 w-4 text-amber-300" aria-hidden="true" />
        Déjà sur place ?
      </button>

      {/* ── MODALE PAVÉ NUMÉRIQUE (composant existant LuxuryPinPad) ── */}
      <AnimatePresence>
        {isPinOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-50"
          >
            <LuxuryPinPad
              variant="fullscreen"
              propertyImage={HERO_IMAGE}
              propertyName={data.propertyName}
              eyebrow="Accès invité"
              title="Votre état des lieux"
              subtitle="Appuyez sur 4 chiffres pour ouvrir votre formulaire digital"
              footerNote="Le pavé numérique ouvre votre état des lieux digital — aucune saisie n'est conservée avant votre validation finale."
              onVerify={handleVerify}
              onCancel={() => {
                setUnlocking(false);
                setIsPinOpen(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
