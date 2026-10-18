'use client';

// =============================================================
// v4.109 « ANIMATION PRÉ-ARRIVÉE » — ÉCRAN D'ACCUEIL DU HUB VERROUILLÉ
// -------------------------------------------------------------
// Demande client : « des animations sur la page du hub qui cachaient
// le clavier et laissaient place à une animation, jusqu'à 2 h avant
// l'arrivée de l'invité pour ouvrir le hub ».
//
// Quand le hub est verrouillé et que le prochain séjour est encore à
// plus de HUB_ACCESS_WINDOW_HOURS (2 h), cette animation remplace le
// pavé numérique (dont le code serait de toute façon refusé par
// l'API — même seuil serveur, source unique lib/hub-access.ts) :
//   • photo immersive du logement (même traitement que LuxuryPinPad) ;
//   • carte verre « luxe » : arrivée prévue + compte à rebours vivant ;
//   • bascule AUTOMATIQUE vers le pavé à l'ouverture (tick 15 s,
//     sans rechargement de page) via onWindowOpen().
// Le compte à rebours cible l'OUVERTURE (checkIn − 2 h), pas l'arrivée.
// Aucune donnée personnelle : la date d'arrivée seule est affichée.
// i18n : useAdminLang (clé = texte FR source, repli FR).
// =============================================================

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarClock, KeyRound, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HUB_PROPERTY_HERO } from '@/lib/hub-visuals';
import { useAdminLang, type AdminLang } from '@/lib/admin-i18n';
// Module PUR (sans Prisma) — importable côté client.
import { HUB_ACCESS_WINDOW_HOURS } from '@/lib/hub-window';

interface HubArrivalTeaserProps {
  /** Check-in ISO du prochain séjour (payload.nextArrival). */
  checkIn: string;
  propertyName: string;
  /** Photo principale du bien (hubPhotos.hero) — même fond que le pavé. */
  propertyImage?: string | null;
  /** Téléphone de l'hôte → ligne d'aide. */
  contactPhone?: string | null;
  /** Appelé quand now ≥ checkIn − fenêtre → le parent affiche le pavé. */
  onWindowOpen: () => void;
}

const LOCALES: Record<AdminLang, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  es: 'es-ES',
  de: 'de-DE',
  zh: 'zh-CN',
};

export function HubArrivalTeaser({
  checkIn,
  propertyName,
  propertyImage,
  contactPhone,
  onWindowOpen,
}: HubArrivalTeaserProps) {
  const { t, lang } = useAdminLang();
  const reduceMotion = useReducedMotion();

  // Instant d'OUVERTURE du hub (checkIn − 2 h) — même calcul serveur.
  const opensAtMs = useMemo(
    () => new Date(checkIn).getTime() - HUB_ACCESS_WINDOW_HOURS * 3_600_000,
    [checkIn],
  );

  // Horloge locale (tick 15 s — précision minute largement suffisante
  // pour un compte à rebours en jours/heures/minutes).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // Bascule automatique → pavé dès que la fenêtre s'ouvre.
  useEffect(() => {
    if (now >= opensAtMs) onWindowOpen();
  }, [now, opensAtMs, onWindowOpen]);

  const dateLong = useMemo(
    () =>
      new Date(checkIn).toLocaleString(LOCALES[lang] ?? 'fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }),
    [checkIn, lang],
  );

  const remaining = Math.max(0, opensAtMs - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);

  const cells = [
    { value: days, label: t('jours') },
    { value: hours, label: t('heures') },
    { value: minutes, label: t('min') },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label={`${t('Votre séjour approche')} — ${propertyName}`}
    >
      {/* ── Photo immersive du logement + overlay sombre (identique pavé) ── */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center"
          style={{
            backgroundImage: `url(${propertyImage || HUB_PROPERTY_HERO})`,
            filter: 'blur(10px) brightness(0.62) saturate(1.05)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-900/40 to-slate-950/80" />
      </div>

      {/* ── Carte verre centrale ── */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative z-10 my-auto w-full max-w-sm"
      >
        <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
          {/* Étincelles flottantes (désactivées si prefers-reduced-motion) */}
          {!reduceMotion && (
            <div aria-hidden="true">
              {[
                { left: '8%', top: '18%', delay: 0, duration: 4.2 },
                { left: '86%', top: '24%', delay: 1.1, duration: 5 },
                { left: '74%', top: '74%', delay: 0.6, duration: 4.6 },
                { left: '14%', top: '78%', delay: 1.7, duration: 5.4 },
              ].map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute text-amber-300/70"
                  style={{ left: s.left, top: s.top }}
                  animate={{ y: [0, -14, 0], opacity: [0.15, 0.85, 0.15], scale: [0.8, 1.15, 0.8] }}
                  transition={{ duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Sparkles className="h-4 w-4" />
                </motion.span>
              ))}
            </div>
          )}

          {/* Icône clé + anneaux pulsants */}
          <div className="mb-6 flex justify-center" aria-hidden="true">
            <div className="relative flex h-20 w-20 items-center justify-center">
              {[0, 1].map((r) => (
                <motion.span
                  key={r}
                  className="absolute inset-0 rounded-full border border-amber-400/40"
                  animate={reduceMotion ? undefined : { scale: [1, 1.35], opacity: [0.55, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, delay: r * 1.2, ease: 'easeOut' }}
                />
              ))}
              <motion.div
                className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/50 bg-amber-500/20 shadow-[0_0_32px_rgba(245,158,11,0.25)]"
                animate={reduceMotion ? undefined : { y: [0, -4, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <KeyRound className="h-8 w-8 text-amber-400" strokeWidth={1.8} />
              </motion.div>
            </div>
          </div>

          {/* En-tête */}
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300/80">
              {t('Hub sécurisé')}
            </p>
            <h2
              className="mt-1 text-2xl font-bold text-white"
              style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
            >
              {t('Votre séjour approche')}
            </h2>
            <p className="mt-1 truncate text-sm text-slate-300" title={propertyName}>
              {propertyName}
            </p>
          </div>

          {/* Arrivée prévue */}
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.07] px-4 py-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0066EF]/25 text-sky-200"
              aria-hidden="true"
            >
              <CalendarClock className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
                {t('Arrivée prévue')}
              </p>
              <p className="truncate text-sm font-semibold text-white" aria-live="polite">
                <time dateTime={checkIn}>{dateLong}</time>
              </p>
            </div>
          </div>

          {/* Compte à rebours jusqu'à l'OUVERTURE (checkIn − 2 h) */}
          <div className="mt-6">
            <p className="mb-3 text-center text-xs font-semibold text-white/70">
              {t('Ouverture du hub dans')}
            </p>
            <div className="grid grid-cols-3 gap-3" aria-hidden="true">
              {cells.map((cell) => (
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

          {/* Note de bas de carte */}
          <p className={cn('mt-5 text-center text-xs leading-relaxed text-white/60')}>
            {t('Le pavé d’accès apparaîtra automatiquement à l’ouverture.')}
          </p>
          {contactPhone && (
            <p className="mt-2 text-center text-xs text-white/60">
              {t("Besoin d'aide ?")}{' '}
              <a
                href={`tel:${contactPhone}`}
                className="font-semibold text-amber-300 underline-offset-2 hover:underline"
              >
                {t('Contactez votre hôte')}
              </a>
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default HubArrivalTeaser;
