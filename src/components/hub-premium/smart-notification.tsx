'use client';

// =============================================================
// v4.74 « SMART PROMPTS » — CARTE DE NOTIFICATION CONTEXTUELLE
// Modal élégante affichée au bon moment du séjour (petit-déjeuner,
// déjeuner, dîner, veille de départ) pour inciter à commander.
//
// v4.112 — nouveaux types issus du MOTEUR DE RECOMMANDATION
// CONTEXTUEL : 'minibar' (soirée/chaleur), 'food' (repas × météo ×
// chef), 'activity' (sorties en milieu de séjour). Même carte, même
// glassmorphism, mêmes barres de progression — palettes dédiées.
//
// Design « Luxe Tech » : glassmorphism, entrée slide-down + fade,
// timer visuel (barre de progression qui s'épuise sur la durée
// configurée par l'hôte), bouton de fermeture discret, responsive
// mobile-first. Jamais bloquante : la carte disparaît seule ou
// d'un geste, le hub reste utilisable dessous (pointer-events sur
// la carte uniquement).
// =============================================================

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  translateBatchAi,
  translateText,
  useHubLang,
  type HubLang,
} from '@/lib/hub-i18n';

export type SmartNotificationType =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'checkout_reminder'
  | 'minibar'
  | 'food'
  | 'activity';

interface SmartNotificationProps {
  type: SmartNotificationType;
  title: string;
  message: string;
  /** Durée d'affichage en minutes (configurée par l'hôte). */
  duration: number;
  onClose: () => void;
  onAction?: () => void;
  actionLabel?: string;
}

const TYPE_META: Record<
  SmartNotificationType,
  { emoji: string; label: string; wrap: string; ring: string; bar: string; darkText: string }
> = {
  breakfast: {
    emoji: '☕',
    label: 'Petit-déjeuner',
    wrap: 'from-amber-50/95 via-orange-50/90 to-white/90 dark:from-[#22190C]/95 dark:via-[#1A1309]/90 dark:to-[#121009]/95',
    ring: 'border-amber-200/80 dark:border-[#D4AF37]/25',
    bar: 'from-amber-400 to-orange-500 dark:from-[#D4AF37] dark:to-amber-600',
    darkText: 'text-amber-700 dark:text-[#E7C66B]',
  },
  lunch: {
    emoji: '🍽️',
    label: 'Déjeuner',
    wrap: 'from-emerald-50/95 via-teal-50/90 to-white/90 dark:from-[#0C1F16]/95 dark:via-[#0A1710]/90 dark:to-[#091009]/95',
    ring: 'border-emerald-200/80 dark:border-emerald-400/25',
    bar: 'from-emerald-400 to-teal-500 dark:from-emerald-400 dark:to-teal-500',
    darkText: 'text-emerald-700 dark:text-emerald-300',
  },
  dinner: {
    emoji: '🌙',
    label: 'Dîner',
    wrap: 'from-violet-50/95 via-purple-50/90 to-white/90 dark:from-[#1A0F22]/95 dark:via-[#130A1A]/90 dark:to-[#0E0812]/95',
    ring: 'border-violet-200/80 dark:border-violet-400/25',
    bar: 'from-violet-400 to-purple-500 dark:from-violet-400 dark:to-purple-500',
    darkText: 'text-violet-700 dark:text-violet-300',
  },
  checkout_reminder: {
    emoji: '🛍️',
    label: 'Souvenirs',
    wrap: 'from-rose-50/95 via-pink-50/90 to-white/90 dark:from-[#23100F]/95 dark:via-[#180B0B]/90 dark:to-[#120809]/95',
    ring: 'border-rose-200/80 dark:border-rose-400/25',
    bar: 'from-rose-400 to-pink-500 dark:from-rose-400 dark:to-pink-500',
    darkText: 'text-rose-700 dark:text-rose-300',
  },
  // ── v4.112 MOTEUR DE RECOMMANDATION CONTEXTUEL ──
  minibar: {
    emoji: '🍷',
    label: 'Minibar',
    wrap: 'from-fuchsia-50/95 via-purple-50/90 to-white/90 dark:from-[#1F0C1E]/95 dark:via-[#170A16]/90 dark:to-[#120812]/95',
    ring: 'border-fuchsia-200/80 dark:border-fuchsia-400/25',
    bar: 'from-fuchsia-400 to-purple-500 dark:from-fuchsia-400 dark:to-purple-500',
    darkText: 'text-fuchsia-700 dark:text-fuchsia-300',
  },
  food: {
    emoji: '👨‍🍳',
    label: 'Restauration',
    wrap: 'from-orange-50/95 via-amber-50/90 to-white/90 dark:from-[#221608]/95 dark:via-[#1A1006]/90 dark:to-[#120B04]/95',
    ring: 'border-orange-200/80 dark:border-orange-400/25',
    bar: 'from-orange-400 to-red-500 dark:from-orange-400 dark:to-red-500',
    darkText: 'text-orange-700 dark:text-orange-300',
  },
  activity: {
    emoji: '🎉',
    label: 'Sorties',
    wrap: 'from-teal-50/95 via-cyan-50/90 to-white/90 dark:from-[#06201E]/95 dark:via-[#051715]/90 dark:to-[#041010]/95',
    ring: 'border-teal-200/80 dark:border-teal-400/25',
    bar: 'from-teal-400 to-cyan-500 dark:from-teal-400 dark:to-cyan-500',
    darkText: 'text-teal-700 dark:text-teal-300',
  },
};

/** v4.76 — libellé du temps restant (template, traduit hors dict pour
 *  éviter 1 appel IA par minute : le nombre change chaque minute). */
const REMAIN_LABEL: Record<Exclude<HubLang, 'fr'>, string> = {
  en: 'Available for {min} more min',
  es: 'Disponible {min} min más',
  de: 'Noch {min} Min. verfügbar',
  zh: '再显示 {min} 分钟',
};

export default function SmartNotification({
  type,
  title,
  message,
  duration,
  onClose,
  onAction,
  actionLabel = 'Voir les options',
}: SmartNotificationProps) {
  const meta = TYPE_META[type];
  const totalSec = Math.max(60, duration * 60);
  const [timeLeft, setTimeLeft] = useState(totalSec);

  // ── v4.76 — i18n : libellés statiques (dictionnaire) + IA pour le
  // titre et le message personnalisés de l'hôte (≤ 160 chars). Le hook
  // amont reste en FR (couche données) : c'est ICI que l'on traduit.
  const { lang } = useHubLang();
  const [ai, setAi] = useState<Record<string, string>>({});
  useEffect(() => {
    if (lang === 'fr') return;
    const pending = [title, message, actionLabel].filter(
      (s) => !!s && translateText(s, lang) === s && !ai[s],
    );
    if (pending.length === 0) return;
    let alive = true;
    void translateBatchAi(pending, lang).then((m) => {
      if (alive && Object.keys(m).length > 0) setAi((prev) => ({ ...prev, ...m }));
    });
    return () => {
      alive = false;
    };
  }, [title, message, actionLabel, lang]);
  const tr = (s: string): string => {
    if (lang === 'fr') return s;
    const staticTr = translateText(s, lang);
    if (staticTr !== s) return staticTr;
    return ai[s] ?? s;
  };
  const remainLabel = (min: number): string => {
    if (lang === 'fr') return `Disponible encore ${min} min`;
    return (REMAIN_LABEL[lang] ?? 'Disponible encore {min} min').replace('{min}', String(min));
  };

  // Timer de disparition automatique (1 s).
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // onClose est stable dans le hook appelant ; on ne relance PAS le
    // timer quand sa référence bouge (sinon le timer repart à zéro).
  }, []);

  const progress = (timeLeft / totalSec) * 100;

  return (
    <AnimatePresence>
      <motion.div
        role="status"
        aria-live="polite"
        aria-label={`${translateText(meta.label, lang)} — ${tr(title)}`}
        initial={{ opacity: 0, y: -48 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -32 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-x-4 top-4 z-[70] mx-auto max-w-md sm:inset-x-auto sm:left-1/2 sm:w-[min(26rem,calc(100vw-2rem))] sm:-translate-x-1/2"
      >
        <div
          className={cn(
            'relative overflow-hidden rounded-3xl border bg-gradient-to-br shadow-[0_30px_70px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]',
            meta.wrap,
            meta.ring,
          )}
        >
          {/* Barre de progression — s'épuise sur la durée d'affichage */}
          <div className="absolute inset-x-0 top-0 h-1 bg-slate-200/70 dark:bg-white/10">
            <div
              className={cn('h-full bg-gradient-to-r transition-[width] ease-linear', meta.bar)}
              style={{ width: `${progress}%`, transitionDuration: '1s' }}
            />
          </div>

          {/* Bouton fermer */}
          <button
            type="button"
            onClick={onClose}
            aria-label={translateText('Fermer la notification', lang)}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/60 text-slate-500 transition-colors hover:bg-white hover:text-slate-800 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="flex items-start gap-4 p-5 pt-6">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-3xl shadow-md dark:bg-white/10"
            >
              {meta.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-[10px] font-bold uppercase tracking-[0.18em]',
                  meta.darkText,
                )}
              >
                {translateText(meta.label, lang)}
              </p>
              <h3 className="display-title mt-0.5 font-serif! text-lg font-bold text-slate-900 dark:text-[#F5EFE6]">
                {tr(title)}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-[#C9BFAE]">
                {tr(message)}
              </p>
              {onAction && (
                <button
                  type="button"
                  onClick={onAction}
                  className="air-gradient mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white shadow-md transition-transform hover:scale-[1.03]"
                >
                  {tr(actionLabel)}
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-5 pb-3 text-[11px] text-slate-400 dark:text-slate-500">
            <span aria-hidden="true">⏳</span>
            <span>{remainLabel(Math.ceil(timeLeft / 60))}</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
