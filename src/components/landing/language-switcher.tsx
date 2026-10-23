'use client';

// =============================================================
// LANGUAGE SWITCHER — sélecteur des 8 langues officielles.
//
//   • Bouton pill globe (desktop, navbar) OU grille de chips
//     (mobile, dans le menu déroulant) — via la prop `mobile`.
//   • Libellés NATIFS (Français, English, Español…) — jamais traduits.
//   • Mémorisation instantanée : setLang → localStorage
//     'roomscan-lang' (store landing-i18n).
//   • Fermeture au clic extérieur + touche Échap (desktop).
//   • Accessibilité : aria-haspopup/expanded, role listbox/option,
//     cibles tactiles ≥ 44 px (h-11).
//   • RTL-safe : position logique `end-*` (se reflète en arabe).
// =============================================================

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Globe } from 'lucide-react';
import { SUPPORTED_LOCALES, useLandingLang } from '@/lib/landing-i18n';

const ACCENT = '#04467a';

export function LanguageSwitcher({ mobile = false }: { mobile?: boolean }) {
  const { lang, setLang, t } = useLandingLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur / Échap (version dropdown desktop).
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const activeLabel =
    SUPPORTED_LOCALES.find((l) => l.code === lang)?.label ?? 'Français';

  const select = (code: (typeof SUPPORTED_LOCALES)[number]['code']) => {
    setLang(code);
    if (!mobile) setOpen(false);
  };

  // ── Version MOBILE : boîte insérée dans le menu hamburger ──
  if (mobile) {
    return (
      <div>
        <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Globe className="h-3.5 w-3.5" aria-hidden="true" />
          {t('Choisir la langue')}
        </p>
        <div
          className="grid grid-cols-2 gap-1.5"
          role="listbox"
          aria-label={t('Choisir la langue')}
        >
          {SUPPORTED_LOCALES.map((locale) => {
            const active = locale.code === lang;
            return (
              <button
                key={locale.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => select(locale.code)}
                className={`flex h-11 items-center justify-between rounded-xl border px-3 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-[#055492]/30 bg-[#dceaf5] text-[#0642A8]'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className="truncate">{locale.label}</span>
                {active && (
                  <Check
                    className="h-4 w-4 shrink-0 text-[#04467a]"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Version DESKTOP : bouton globe + dropdown listbox ──
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${t('Choisir la langue')} — ${activeLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900"
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs font-bold uppercase tracking-wider">
          {lang}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="air-shadow absolute end-0 top-full z-50 mt-2 w-48 rounded-2xl border border-slate-200 bg-white p-1.5"
          >
            <ul role="listbox" aria-label={t('Choisir la langue')}>
              {SUPPORTED_LOCALES.map((locale) => {
                const active = locale.code === lang;
                return (
                  <li key={locale.code} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => select(locale.code)}
                      className={`flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm transition-colors ${
                        active
                          ? 'bg-[#dceaf5] font-semibold text-[#0642A8]'
                          : 'font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span className="truncate">{locale.label}</span>
                      {active && (
                        <Check
                          className="h-4 w-4 shrink-0"
                          style={{ color: ACCENT }}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
