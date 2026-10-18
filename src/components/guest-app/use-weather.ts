'use client';

import { useEffect, useState } from 'react';

// =============================================================
// DIGITAL CONCIERGE (V4.1) — Météo du header « Bonjour … »
// Passe par le proxy serveur /api/public/weather (la CSP impose
// connect-src 'self' → pas d'appel direct Open-Meteo/Nominatim
// depuis le navigateur de l'invité). Cache sessionStorage 1 h.
// Repli élégant : en cas d'échec/absence de coordonnées, le hook
// renvoie null → le header affiche un message statique.
// =============================================================

export interface WeatherInfo {
  /** Température arrondie (ex: 22). */
  temp: number;
  /** Emoji météo (ex: ☀️). */
  emoji: string;
  /** Ville détectée (reverse geocoding) — null si indisponible. */
  city: string | null;
}

/** Code météo WMO → emoji. */
const WEATHER_EMOJI: Record<number, string> = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌦️',
  56: '🌧️',
  57: '🌧️',
  61: '🌧️',
  63: '🌧️',
  65: '🌧️',
  66: '🌧️',
  67: '🌧️',
  71: '🌨️',
  73: '🌨️',
  75: '❄️',
  77: '❄️',
  80: '🌦️',
  81: '🌧️',
  82: '⛈️',
  85: '🌨️',
  86: '🌨️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

function emojiForCode(code: number): string {
  if (WEATHER_EMOJI[code]) return WEATHER_EMOJI[code];
  if (code >= 0 && code < 3) return '🌤️';
  if (code < 50) return '☁️';
  if (code < 70) return '🌧️';
  if (code < 80) return '🌨️';
  return '⛈️';
}

/** Cache session 1 h — évite de re-interroger le proxy à chaque navigation. */
const CACHE_TTL_MS = 3_600_000;

function readCache(key: string): WeatherInfo | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: WeatherInfo };
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: WeatherInfo): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* stockage indisponible — sans conséquence */
  }
}

/**
 * Météo courante aux coordonnées du bien (via proxy interne).
 * Renvoie null tant que non chargé — et RESTE null en cas d'échec
 * (le header affiche alors son message de repli).
 */
export function useWeather(
  lat: number | null | undefined,
  lng: number | null | undefined,
): WeatherInfo | null {
  const [info, setInfo] = useState<WeatherInfo | null>(null);

  useEffect(() => {
    if (typeof lat !== 'number' || typeof lng !== 'number') return;

    const key = `ch-weather-${lat.toFixed(2)},${lng.toFixed(2)}`;
    let cancelled = false;

    (async () => {
      // Sort de la pile synchrone de l'effet avant tout setState
      await Promise.resolve();
      if (cancelled) return;

      const cached = readCache(key);
      if (cached) {
        setInfo(cached);
        return;
      }

      try {
        const res = await fetch(`/api/public/weather?lat=${lat}&lng=${lng}`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { ok?: boolean; temp?: number | null; code?: number | null; city?: string | null };
        if (cancelled || !json.ok || typeof json.temp !== 'number') return;

        const data: WeatherInfo = {
          temp: json.temp,
          emoji: emojiForCode(typeof json.code === 'number' ? json.code : -1),
          city: typeof json.city === 'string' && json.city ? json.city : null,
        };
        setInfo(data);
        writeCache(key, data);
      } catch {
        /* météo indisponible → repli statique du header */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return info;
}
