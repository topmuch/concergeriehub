'use client';

// =============================================================
// v4.51 « CENTRE DE CONCIERGERIE TABLETTE » — PHASE 2 SMART HEADER
// v5.0 « AIRBNB PRO CLAIR PREMIUM » — verre dépoli CLAIR : la barre
// flotte au-dessus d'une page claire (fond stone), le texte passe en
// slate-900/500, les pilules gardent leur hiérarchie (prénom fort,
// heure tabulaire, météo discrète).
// v4.73 « LUXE DARK » — variantes sombres : charbon chaud translucide
// + accents or (#D4AF37), lisibilité garantie en mode sombre (la barre
// restait blanche éblouissante avant — y compris la pilule météo).
//
// Bandeau fixe (sticky visuellement : fixed top-0) en haut de
// l'écran sur TABLETTE / grands écrans (masqué < lg via la classe
// passée par le parent). Layout horizontal glassmorphism :
//   • À GAUCHE  : message personnalisé « Bonjour {prénom} 👋 »
//     (font-serif — le prénom vient du calendrier / iCal Airbnb).
//   • AU CENTRE : date + heure en TEMPS RÉEL « Mardi 14 Octobre • 14:30 ».
//   • À DROITE  : météo locale EN TEMPS RÉEL du logement — emoji,
//     température (« 22°C ») et petite phrase contextuelle
//     (« Idéal pour une balade »).
//
// TECHNIQUE MÉTÉO — Open-Meteo, API gratuite et SANS CLÉ. Le Hub
// interroge NOTRE route serveur /api/public/hub/[slug]/weather qui
// appelle Open-Meteo avec les coordonnées lues CÔTÉ SERVEUR depuis
// le bien (jamais de lat/lng depuis le client = pas d'open proxy)
// avec un cache mémoire de 30 min. En cas d'échec, le bloc météo
// disparaît silencieusement — le header reste utile (heure + nom).
// =============================================================

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/ui/brand-logo';

interface SmartHeaderProps {
  slug: string;
  /** Prénom de l'invité en cours (payload.stay.guestName) ou null. */
  guestName?: string | null;
  /** Classes additionnelles — le parent passe « hidden lg:flex ». */
  className?: string;
}

/** Emoji + phrase contextuelle par code WMO (Open-Meteo). */
function weatherVisual(code: number): { emoji: string; phrase: string } {
  if (code === 0 || code === 1) return { emoji: '☀️', phrase: 'Idéal pour une balade' };
  if (code === 2 || code === 3) return { emoji: '⛅', phrase: 'Journée agréable' };
  if (code === 45 || code === 48) return { emoji: '🌫️', phrase: 'Ambiance brumeuse' };
  if (code >= 51 && code <= 67) return { emoji: '🌦️', phrase: 'Parfait pour un musée' };
  if (code >= 71 && code <= 77) return { emoji: '❄️', phrase: 'Journée cocooning' };
  if (code >= 80 && code <= 82) return { emoji: '🌧️', phrase: 'Un parapluie, et c\'est parti' };
  if (code === 85 || code === 86) return { emoji: '🌨️', phrase: 'Journée douillette' };
  if (code >= 95) return { emoji: '⛈️', phrase: 'Restez bien au chaud' };
  return { emoji: '🌡️', phrase: 'Bonne journée' };
}

export function SmartHeader({ slug, guestName, className }: SmartHeaderProps) {
  // Horloge live (minute). Initialisation LAZY au premier rendu client :
  // ce composant n'est rendu qu'à l'intérieur de la vue invité (jamais
  // SSR) — zéro risque d'hydratation, zéro setState dans l'effet.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  // Météo locale du logement (même route que la carte météo du hub).
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/weather`);
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          current?: { temp: number; code: number };
        } | null;
        if (!cancelled && res.ok && json?.ok && json.current) {
          setWeather({ temp: json.current.temp, code: json.current.code });
        }
      } catch {
        // Silencieux — le header reste utile sans météo.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const dateLabel = now
    ? now
        .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
        .replace(/^\w/, (c) => c.toUpperCase())
    : '';
  const timeLabel = now
    ? now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';
  const wv = weather ? weatherVisual(weather.code) : null;

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 border-b border-stone-200/70 bg-white/80 backdrop-blur-xl',
        'dark:border-[#D4AF37]/15 dark:bg-[#0F0C07]/85 dark:shadow-[0_10px_40px_-18px_rgba(0,0,0,0.9)]',
        'px-4 py-3 sm:px-6',
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        {/* GAUCHE — logo RoomScan (v4.68 : le logo apparaissait uniquement sur
            l'écran d'entrée du hub, pas dans la vue invité) + message perso */}
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <BrandLogo size="sm" />
          <p className="min-w-0 truncate font-serif text-lg font-bold text-slate-900 dark:text-[#F5EFE6]">
            {guestName ? (
              <>
                {`Bonjour ${guestName}`}
                <span aria-hidden="true" className="ml-1.5">
                  👋
                </span>
              </>
            ) : (
              <>
                Bonjour
                <span aria-hidden="true" className="ml-1.5">
                  👋
                </span>
              </>
            )}
          </p>
        </div>

        {/* CENTRE — date + heure temps réel */}
        <p
          aria-label={`${dateLabel}, ${timeLabel}`}
          className="hidden min-w-0 items-baseline gap-2 text-sm text-stone-500 dark:text-[#A89F91] md:flex"
        >
          <span className="truncate font-medium capitalize">{dateLabel}</span>
          <span aria-hidden="true" className="text-stone-300 dark:text-[#5A5245]">
            •
          </span>
          <span className="shrink-0 font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-[#F5EFE6]">
            {timeLabel}
          </span>
        </p>

        {/* DROITE — météo locale temps réel */}
        {wv ? (
          <p
            aria-label={`Météo sur place : ${weather?.temp} degrés, ${wv.phrase}`}
            className="flex min-w-0 shrink-0 items-center justify-end gap-2.5 rounded-full border border-stone-200/70 bg-white/60 px-3.5 py-1.5 dark:border-[#D4AF37]/20 dark:bg-white/[0.05]"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-[#F5EFE6]">
              <span aria-hidden="true" className="text-xl leading-none">
                {wv.emoji}
              </span>
              {weather?.temp}°C
            </span>
            <span className="hidden truncate text-xs text-stone-500 dark:text-[#A89F91] xl:inline">{wv.phrase}</span>
          </p>
        ) : (
          <span aria-hidden="true" className="h-6 w-16 shrink-0 animate-pulse rounded-full bg-stone-200/80 dark:bg-white/10" />
        )}
      </div>
    </header>
  );
}
