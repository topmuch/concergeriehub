'use client';

// =============================================================
// v4.51 « CENTRE DE CONCIERGERIE TABLETTE » — PHASE 5 BARRE FLOTTANTE
//
// Sur tablette (≥ lg), une barre d'accès rapide élégante flotte en
// bas de l'écran : une « pilule » glassmorphism centrée avec 4
// actions 1 clic (icônes Lucide + tooltips au survol) :
//   🏠 Accueil   — retour à l'écran d'entrée du hub
//   📶 Wi-Fi     — copie du mot de passe en 1 clic (toast)
//   🆘 SOS       — saut direct à la section « Besoin d'aide ? »
//   🌙 Mode Nuit — bascule du thème clair ↔ sombre du hub
//
// Position : fixed bottom-8 left-1/2 -translate-x-1/2 z-40 (le
// -translate-x-1/2 est porté par le CONTENEUR fixe, pas par le
// motion.div — framer-motion écrase sinon la transformation Tailwind).
// Masquée < lg (CSS hidden) — mobile garde ses contrôles historiques.
// Cibles tactiles ≥ 48 px (accessibilité).
// v5.0 — pilule verre clair (bg-white/85 + air-shadow-lg) alignée sur
// le design « Airbnb Pro clair » ; variante dark: conservée.
// =============================================================

import { motion } from 'framer-motion';
import { Home, Moon, Siren, Sun, Wifi, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabletQuickActionsProps {
  /** Mot de passe Wi-Fi (null → bouton désactivé). */
  wifiPassword: string | null;
  /** Thème actuel du hub (icône adaptée). */
  theme: 'light' | 'dark';
  onHome: () => void;
  onCopyWifi: () => void;
  onSos: () => void;
  onToggleTheme: () => void;
  className?: string;
}

interface QuickAction {
  key: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: string;
}

export function TabletQuickActions({
  wifiPassword,
  theme,
  onHome,
  onCopyWifi,
  onSos,
  onToggleTheme,
  className,
}: TabletQuickActionsProps) {
  const actions: QuickAction[] = [
    { key: 'home', icon: Home, label: 'Accueil', onClick: onHome },
    {
      key: 'wifi',
      icon: Wifi,
      label: 'Copier le mot de passe Wi-Fi',
      onClick: onCopyWifi,
      disabled: !wifiPassword,
    },
    { key: 'sos', icon: Siren, label: 'Urgences', onClick: onSos, tone: 'text-rose-500 dark:text-rose-300' },
    {
      key: 'night',
      icon: theme === 'dark' ? Sun : Moon,
      label: theme === 'dark' ? 'Mode jour' : 'Mode nuit',
      onClick: onToggleTheme,
    },
  ];

  return (
    // Conteneur fixe : porte le centrage (-translate-x-1/2) — le
    // motion.div intérieur n'anime que y/opacity (zéro conflit transform).
    <div
      className={cn(
        'fixed bottom-8 left-1/2 z-40 hidden -translate-x-1/2 lg:block',
        className,
      )}
    >
      <motion.nav
        aria-label="Accès rapide"
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center gap-1.5 rounded-full border border-stone-200/80 bg-white/85 px-4 py-2.5 air-shadow-lg backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/85"
      >
        {actions.map((a) => (
          <div key={a.key} className="group relative">
            <button
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              aria-label={a.label}
              title={a.label}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full text-slate-600 dark:text-slate-300',
                'transition-all duration-200 hover:bg-stone-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white active:scale-90',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066EF]/40',
                'disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent',
                a.tone,
              )}
            >
              <a.icon className="h-5 w-5" aria-hidden="true" />
            </button>
            {/* Tooltip au survol (au-dessus de la pilule) */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-stone-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 opacity-0 shadow-xl backdrop-blur-md transition-all duration-200 group-hover:-translate-y-0.5 group-hover:opacity-100 dark:border-white/15 dark:bg-slate-900/95 dark:text-slate-200"
            >
              {a.label}
            </span>
          </div>
        ))}
      </motion.nav>
    </div>
  );
}
