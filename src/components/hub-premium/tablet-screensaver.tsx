'use client';

// =============================================================
// v4.51 « CENTRE DE CONCIERGERIE TABLETTE » — PHASE 3 MODE AMBIANCE
//
// La fonctionnalité « Wahou » des tablettes posées dans le salon :
// après 2 MINUTES d'inactivité (souris ou tactile), l'écran se
// transforme en cadre photo numérique élégant :
//   • diaporama lent (fondu toutes les 10 s) des plus belles photos
//     de la propriété (photos de l'hôte → repli visuels curated) ;
//   • overlay dégradé sombre pour la lisibilité ;
//   • horloge digitale massive (Playfair, text-7xl/8xl) + date ;
//   • température actuelle du logement + citation inspirante sur le
//     voyage (qui change à chaque diapositive).
// Au moindre mousemove / touchstart / click / keydown / scroll, le
// voile disparaît en fondu et révèle le Hub intact en dessous.
//
// Activé UNIQUEMENT sur les grands écrans (useIsTablet ≥ 1024 px).
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useIsTablet } from '@/hooks/use-is-tablet';
import { cn } from '@/lib/utils';

/** 2 minutes d'inactivité → mode Ambiance. */
const INACTIVITY_MS = 2 * 60 * 1000;
/** Fondu toutes les 10 secondes. */
const SLIDE_MS = 10_000;

/** Citations inspirantes sur le voyage (tournent à chaque diapo). */
const TRAVEL_QUOTES: string[] = [
  '« Le monde est un livre, et ceux qui ne voyagent pas n\u2019en lisent qu\u2019une page. »',
  '« Le voyage est la seule chose qu\u2019on achète qui rend plus riche. »',
  '« Partir, c\u2019est vivre deux fois. »',
  '« Les voyages forment la jeunesse — et reposent les esprits. »',
  '« Il n\u2019y a pas de chemin trop long quand on voyage bien. »',
];

/** Emoji + phrase par code WMO (Open-Meteo) — repli sans météo. */
function ambianceWeather(code: number): string {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2 || code === 3) return '⛅';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌦️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌧️';
  if (code === 85 || code === 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}

interface TabletScreensaverProps {
  /** Liste d'URLs/photos (dataURL hôte ou CDN) du diaporama. */
  photos: string[];
  propertyName: string;
  slug: string;
  /** Interrupteur parent (défaut : activé). */
  enabled?: boolean;
}

export function TabletScreensaver({
  photos,
  propertyName,
  slug,
  enabled = true,
}: TabletScreensaverProps) {
  const isTablet = useIsTablet();
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(false);
  const [slide, setSlide] = useState(0);
  const [clock, setClock] = useState<Date | null>(null);
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const idleTimerRef = useRef<number | null>(null);

  const slideList = photos.length > 0 ? photos : ['/hub-hero-villa.jpg'];

  /** (Re)lance le chrono d'inactivité. */
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => setActive(true), INACTIVITY_MS);
  }, []);

  // ── Détection d'inactivité (souris OU tactile) ──────────────────
  useEffect(() => {
    if (!isTablet || !enabled) return;
    const events = [
      'mousemove',
      'mousedown',
      'pointerdown',
      'touchstart',
      'keydown',
      'wheel',
      'scroll',
    ] as const;
    const onActivity = () => {
      // Réveil immédiat + nouveau chrono.
      setActive((was) => (was ? false : was));
      resetIdleTimer();
    };
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
      for (const e of events) window.removeEventListener(e, onActivity);
    };
  }, [isTablet, enabled, resetIdleTimer]);

  // ── Pendant le mode Ambiance : diaporama + horloge live ────────
  // (premier tick de l'horloge à +1 s : invisible derrière le fondu
  // d'entrée de 0.8 s — pas de setState synchrone dans l'effet.)
  useEffect(() => {
    if (!active) return;
    const slideIv = window.setInterval(
      () => setSlide((s) => s + 1),
      reduceMotion ? SLIDE_MS * 2 : SLIDE_MS,
    );
    const clockIv = window.setInterval(() => setClock(new Date()), 1_000);
    return () => {
      window.clearInterval(slideIv);
      window.clearInterval(clockIv);
    };
  }, [active, reduceMotion]);

  // ── Météo récupérée à l'activation (une fois par session veille) ─
  useEffect(() => {
    if (!active || weather) return;
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
        // Silencieux — le cadre photo fonctionne sans météo.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, slug, weather]);

  if (!isTablet || !enabled) return null;

  const idx = ((slide % slideList.length) + slideList.length) % slideList.length;
  const quote = TRAVEL_QUOTES[((slide % TRAVEL_QUOTES.length) + TRAVEL_QUOTES.length) % TRAVEL_QUOTES.length];
  const dateLabel = clock
    ? clock
        .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
        .replace(/^\w/, (c) => c.toUpperCase())
    : '';
  const timeLabel = clock
    ? clock.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="tablet-screensaver"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
          // Décoratif : toute interaction le fait disparaître — il ne
          // capte pas le focus et ne masque aucun contenu au lecteur
          // d'écran plus longtemps qu'un instant.
          aria-hidden="true"
          className="fixed inset-0 z-[70] overflow-hidden bg-slate-950"
          data-testid="tablet-screensaver"
        >
          {/* ── Diaporama : toutes les couches empilées, opacité animée
              (crossfade doux à chaque changement de diapositive) ── */}
          {slideList.map((src, i) => (
            <motion.div
              key={`${i}-${src.slice(0, 48)}`}
              className="absolute inset-0"
              initial={false}
              animate={{ opacity: i === idx ? 1 : 0, scale: i === idx ? 1 : 1.04 }}
              transition={{ duration: 2.2, ease: 'easeInOut' }}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </motion.div>
          ))}

          {/* Overlay dégradé sombre — lisibilité du contenu central */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/25" />

          {/* ── Contenu central : horloge massive + météo + citation ── */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-14 text-center sm:pb-20">
            <p className="font-serif text-7xl font-bold tabular-nums leading-none tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)] sm:text-8xl">
              {timeLabel}
            </p>
            <p className="mt-3 text-base font-medium capitalize text-slate-300 sm:text-lg">
              {dateLabel}
            </p>

            <div className="mt-8 flex max-w-2xl flex-col items-center gap-2">
              {weather ? (
                <p className="flex items-center gap-2 text-lg font-semibold text-white/95">
                  <span aria-hidden="true" className="text-2xl leading-none">
                    {ambianceWeather(weather.code)}
                  </span>
                  {weather.temp}°C
                </p>
              ) : null}
              <p className="text-sm italic leading-relaxed text-slate-300/90 sm:text-base">
                {quote}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
                {propertyName}
              </p>
            </div>
          </div>

          {/* Petite pastille discrète : « touchez l'écran pour utiliser le hub » */}
          <p
            className={cn(
              'absolute top-6 right-6 rounded-full border border-white/15 bg-black/30 px-3.5 py-1.5',
              'text-[11px] font-medium text-white/60 backdrop-blur-md',
            )}
          >
            ✨ Touchez l&apos;écran pour revenir au hub
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
