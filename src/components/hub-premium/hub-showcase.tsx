'use client';

// =============================================================
// v4.114 « HUB SHOWCASE » — VITRINE « EFFET WAHOU » PRÉ-ARRIVÉE
// -------------------------------------------------------------
// Demande client : la page qui s'affiche quand un invité ouvre le
// lien du hub EN DEHORS de la fenêtre de réservation active doit
// devenir une vitrine marketing immersive « de luxe », tout en
// restant fonctionnelle (accès anticipé au pavé).
//
// Structure (spécification « LUXE TECH ») :
//   1. HERO IMMERSIF — photo du logement en fond FIXED avec zoom
//      lent Ken Burns + overlay sombre (from-black/70 via-black/40
//      to-black/90), badge pill « Expérience Roomscan », titre
//      massif Serif (Playfair), sous-titre, statut dynamique
//      (point vert pulsant « Logement vérifié et prêt »).
//   2. NOS ENGAGEMENTS — 3 cartes glassmorphism (backdrop-blur-xl,
//      bg-white/5, border-white/10) en cascade Framer Motion.
//   3. ARRIVÉE — carte verre avec date + compte à rebours vivant
//      jusqu'à l'OUVERTURE (checkIn − 2 h, source unique
//      lib/hub-window) — reprend l'esprit du teaser v4.109.
//   4. FOOTER + ACCÈS SMART — « Propulsé par Roomscan » + bouton
//      magique « Vous êtes déjà dans le logement ? » qui fait
//      apparaître le LuxuryPinPad en modale plein écran (fondu),
//      SANS changer de page.
//
// Bascule automatique : quand now ≥ checkIn − 2 h, onWindowOpen()
// est appelé et le parent remplace la vitrine par le pavé (même
// seuil serveur : source unique lib/hub-access.ts).
// i18n : useAdminLang (clé = texte FR source, repli FR).
// =============================================================

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  CalendarClock,
  ChevronDown,
  Handshake,
  QrCode,
  Rocket,
  Shield,
  Sparkles,
} from 'lucide-react';
import { LuxuryPinPad, type PinVerifyResult } from '@/components/hub-premium/luxury-pin-pad';
import { useAdminLang, type AdminLang } from '@/lib/admin-i18n';
import { HUB_PROPERTY_HERO } from '@/lib/hub-visuals';
// Module PUR (sans Prisma) — importable côté client.
import { HUB_ACCESS_WINDOW_HOURS } from '@/lib/hub-window';

interface HubShowcaseProps {
  /** Nom du bien (titre « Bienvenue à la … » avec élision correcte). */
  propertyName: string;
  /** Photo principale du bien (hubPhotos.hero) — fond immersif. */
  propertyImage?: string | null;
  /** Check-in ISO du prochain séjour (null → pas de compte à rebours). */
  checkIn?: string | null;
  /** Téléphone de l'hôte → ligne d'aide dans le pavé. */
  contactPhone?: string | null;
  /** Appelé quand now ≥ checkIn − 2 h → le parent affiche le pavé. */
  onWindowOpen: () => void;
  /** Vérification du code (POST access) — passée au LuxuryPinPad. */
  onVerify: (pin: string) => Promise<PinVerifyResult>;
}

const LOCALES: Record<AdminLang, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  es: 'es-ES',
  de: 'de-DE',
  zh: 'zh-CN',
};

/** Titre d'accueil avec élision française propre (« à la / au / à l' »). */
function welcomeTitle(name: string): string {
  const n = name.trim();
  if (/^l[’'\s]/i.test(n)) return `Bienvenue à l'${n.replace(/^l[’'\s]+/i, '')}`;
  if (/^le\s+/i.test(n)) return `Bienvenue au ${n.replace(/^le\s+/i, '')}`;
  if (/^les\s+/i.test(n)) return `Bienvenue aux ${n.replace(/^les\s+/i, '')}`;
  if (/^la\s+/i.test(n)) return `Bienvenue à la ${n.replace(/^la\s+/i, '')}`;
  if (/^[aeiouyàâäéèêëîïôöûüùh]/i.test(n)) return `Bienvenue à l'${n}`;
  return `Bienvenue à la ${n}`;
}

/** Les 3 engagements — icône, titre, texte (spécification exacte). */
const ENGAGEMENTS = [
  {
    icon: Shield,
    tone: 'text-amber-400',
    title: 'État des Lieux Digital',
    text: 'Vos dépôts de garantie sécurisés par des preuves numériques horodatées et signées.',
  },
  {
    icon: Handshake,
    tone: 'text-sky-300',
    title: 'Transparence Totale',
    text: 'Une expertise rigoureuse de chaque pièce, appareil et équipement, basée sur des standards juridiques stricts.',
  },
  {
    icon: Rocket,
    tone: 'text-emerald-300',
    title: 'Expérience Sans Friction',
    text: 'Fini le papier. Tout se fait sur votre mobile en moins de 2 minutes, avec signature électronique.',
  },
] as const;

export function HubShowcase({
  propertyName,
  propertyImage,
  checkIn,
  contactPhone,
  onWindowOpen,
  onVerify,
}: HubShowcaseProps) {
  const { t, lang } = useAdminLang();
  const reduceMotion = useReducedMotion();

  // ── Modale pavé numérique (accès anticipé) ─────────────────
  const [isPinOpen, setIsPinOpen] = useState(false);
  // Verrouille le scroll de la vitrine tant que la modale est ouverte.
  useEffect(() => {
    if (!isPinOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isPinOpen]);

  // ── Compte à rebours jusqu'à l'OUVERTURE (checkIn − 2 h) ────
  const opensAtMs = useMemo(
    () => (checkIn ? new Date(checkIn).getTime() - HUB_ACCESS_WINDOW_HOURS * 3_600_000 : null),
    [checkIn],
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  // Bascule automatique → pavé plein écran dès que la fenêtre s'ouvre.
  useEffect(() => {
    if (opensAtMs !== null && now >= opensAtMs) onWindowOpen();
  }, [now, opensAtMs, onWindowOpen]);

  const dateLong = useMemo(
    () =>
      checkIn
        ? new Date(checkIn).toLocaleString(LOCALES[lang] ?? 'fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
          })
        : null,
    [checkIn, lang],
  );

  const remaining = opensAtMs !== null ? Math.max(0, opensAtMs - now) : null;
  const countdown = useMemo(() => {
    if (remaining === null) return [];
    return [
      { value: Math.floor(remaining / 86_400_000), label: t('jours') },
      { value: Math.floor((remaining % 86_400_000) / 3_600_000), label: t('heures') },
      { value: Math.floor((remaining % 3_600_000) / 60_000), label: t('min') },
    ];
  }, [remaining, t]);

  const bgImage = propertyImage || HUB_PROPERTY_HERO;

  return (
    <div className="relative min-h-[100dvh] text-white" role="main" aria-label={t('Vitrine')}>
      {/* ══════════ 1. FOND FIXE — Ken Burns + overlay sombre ══════════ */}
      <div className="fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <motion.div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bgImage})` }}
          animate={reduceMotion ? undefined : { scale: [1, 1.08] }}
          transition={
            reduceMotion
              ? undefined
              : { duration: 26, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }
          }
        />
        {/* Overlay de lisibilité (spécification exacte) */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/90" />
        {/* Voile profond supplémentaire — profondeur « nuit de luxe » */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/50 via-transparent to-slate-950/70" />
      </div>

      {/* ══════════ CONTENU SCROLLABLE ══════════ */}
      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        {/* ── HERO IMMERSIF ─────────────────────────────────── */}
        <section className="relative flex min-h-[100dvh] flex-col items-center justify-center px-4 py-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 backdrop-blur-md"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
            <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/85">
              {t('Expérience Roomscan')}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="mt-6 max-w-3xl text-balance text-4xl font-bold leading-tight text-white drop-shadow-lg sm:text-5xl lg:text-6xl"
            style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
          >
            {t(welcomeTitle(propertyName))}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-4 max-w-xl text-pretty text-base font-light text-slate-200 sm:text-lg"
          >
            {t('Votre conciergerie digitale et votre espace de confiance.')}
          </motion.p>

          {/* Statut dynamique — point vert pulsant */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.45 }}
            className="mt-8 flex items-center gap-3 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 backdrop-blur-md"
          >
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold tracking-wide text-emerald-100 sm:text-sm">
              {t('Logement vérifié et prêt pour le prochain séjour')}
            </span>
          </motion.div>

          {/* Indication de défilement */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1.2 }}
            className="absolute bottom-8 flex flex-col items-center gap-1 text-white/60"
            aria-hidden="true"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.3em]">
              {t('Découvrir')}
            </span>
            <motion.div
              animate={reduceMotion ? undefined : { y: [0, 8, 0] }}
              transition={reduceMotion ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ChevronDown className="h-5 w-5" />
            </motion.div>
          </motion.div>
        </section>

        {/* ── NOS ENGAGEMENTS — cartes glassmorphism ────────── */}
        <section className="relative px-4 py-16 sm:py-20" aria-labelledby="engagements-title">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.8 }}
            className="mx-auto mb-10 max-w-2xl text-center"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300/90">
              {t('Nos engagements')}
            </p>
            <h2
              id="engagements-title"
              className="mt-2 text-3xl font-bold text-white sm:text-4xl"
              style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
            >
              {t('La sérénité, à chaque instant de votre séjour')}
            </h2>
          </motion.div>

          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3">
            {ENGAGEMENTS.map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.8, delay: 0.2 + i * 0.15 }}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:bg-white/10"
              >
                <card.icon
                  className={`mb-3 h-8 w-8 ${card.tone} transition-transform duration-300 group-hover:scale-110`}
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
                <h3 className="mb-2 text-xl font-bold text-white" style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}>
                  {t(card.title)}
                </h3>
                <p className="text-sm leading-relaxed text-slate-300">{t(card.text)}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── ARRIVÉE + COMPTE À REBOURS (si prochain séjour) ── */}
        {dateLong && countdown.length > 0 && (
          <section className="relative px-4 pb-4" aria-label={t('Prochain séjour')}>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.8 }}
              className="mx-auto max-w-xl rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl sm:p-8"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300"
                  aria-hidden="true"
                >
                  <CalendarClock className="h-5 w-5" />
                </span>
                <div className="min-w-0 text-left">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
                    {t('Prochain séjour')}
                  </p>
                  <p className="truncate text-sm font-semibold text-white" aria-live="polite">
                    <time dateTime={checkIn ?? undefined}>{dateLong}</time>
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <p className="mb-3 text-center text-xs font-semibold text-white/70">
                  {t('Ouverture du hub dans')}
                </p>
                <div className="grid grid-cols-3 gap-3" aria-hidden="true">
                  {countdown.map((cell) => (
                    <div
                      key={cell.label}
                      className="flex flex-col items-center rounded-2xl border border-white/15 bg-white/[0.07] px-2 py-3"
                    >
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={cell.value}
                          initial={{ y: 8, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -8, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="text-2xl font-bold tabular-nums text-amber-300"
                        >
                          {cell.value}
                        </motion.span>
                      </AnimatePresence>
                      <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
                        {cell.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </section>
        )}

        {/* ── FOOTER + ACCÈS SMART ──────────────────────────── */}
        <section className="relative mt-auto flex flex-col items-center gap-6 px-4 pb-10 pt-14 text-center">
          {/* Le bouton magique — ouvre le pavé en modale, sans changer de page */}
          <motion.button
            type="button"
            onClick={() => setIsPinOpen(true)}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.8 }}
            whileHover={reduceMotion ? undefined : { scale: 1.03 }}
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            className="group flex items-center gap-4 rounded-full border border-white/25 bg-white/10 px-6 py-4 shadow-2xl backdrop-blur-2xl transition-colors duration-300 hover:border-white/40 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/20 text-amber-300 transition-transform duration-300 group-hover:rotate-6"
              aria-hidden="true"
            >
              <QrCode className="h-5 w-5" />
            </span>
            <span className="text-left">
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-white/60">
                {t('Vous êtes déjà dans le logement ?')}
              </span>
              <span className="block text-sm font-bold text-white sm:text-base">
                {t('Accéder au pavé numérique')}
              </span>
            </span>
          </motion.button>

          <p className="max-w-md text-[11px] leading-relaxed text-white/45">
            {t(
              `Le hub s'ouvre automatiquement ${HUB_ACCESS_WINDOW_HOURS} h avant le début de votre séjour.`,
            )}
          </p>

          <p className="text-xs text-white/50">
            {t('Propulsé par')}{' '}
            <span className="font-bold text-white/85">Roomscan</span>
            {' — '}
            {t('La référence de la conciergerie digitale.')}
          </p>
        </section>
      </div>

      {/* ══════════ MODALE PLEIN ÉCRAN — LUXURY PIN PAD (fondu) ══════════ */}
      <AnimatePresence>
        {isPinOpen && (
          <motion.div
            key="pin-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="fixed inset-0 z-[60]"
            role="dialog"
            aria-modal="true"
          >
            <LuxuryPinPad
              variant="fullscreen"
              propertyImage={propertyImage}
              propertyName={propertyName}
              contactPhone={contactPhone}
              onVerify={onVerify}
              onCancel={() => setIsPinOpen(false)}
              footerNote="🔐 Chaque séjour a son code unique — communiqué par votre hôte."
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default HubShowcase;
