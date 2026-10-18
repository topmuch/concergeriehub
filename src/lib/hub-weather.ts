// =============================================================
// v4.112 « MÉTÉO DU HUB — CACHE MÉMOIRE PARTAGÉ SERVEUR »
// src/lib/hub-weather.ts
//
// Extrait du route /api/public/hub/[slug]/weather (v4.49) pour être
// réutilisable par le MOTEUR DE RECOMMANDATION CONTEXTUEL (v4.112)
// sans double appel Open-Meteo : un seul cache mémoire par
// coordonnées (TTL 30 min — même politique que la route d'origine).
//
// Source : Open-Meteo (https://open-meteo.com) — GRATUIT, SANS CLÉ.
// Le payload expose désormais `timezone` (IANA, « timezone=auto ») :
// le moteur de recommandation l'utilise pour évaluer les règles
// horaires (07h00-09h00, 18h-21h…) dans le fuseau du LOGEMENT et
// non celui du serveur.
// =============================================================

export interface HubWeatherDailyItem {
  date: string;
  code: number;
  tmax: number;
  tmin: number;
}

export interface HubWeatherPayload {
  current: { temp: number; code: number; wind: number };
  daily: HubWeatherDailyItem[];
  /** Fuseau IANA du logement (ex. « Europe/Paris ») — Open-Meteo auto. */
  timezone: string;
  fetchedAt: string;
}

/** Cache mémoire (par coordonnées ~100 m) — TTL 30 min. Reset au redeploy. */
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; data: HubWeatherPayload }>();

/** Réponse Open-Meteo (champs utilisés uniquement). */
interface OpenMeteoResponse {
  timezone?: string;
  current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
}

/**
 * Météo actuelle + 3 jours du logement, avec cache mémoire 30 min.
 * Retourne `null` si Open-Meteo est injoignable (le moteur continue
 * ses règles horaires sans condition météo — jamais bloquant).
 */
export async function getCachedWeather(lat: number, lng: number): Promise<HubWeatherPayload | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    '&current=temperature_2m,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&timezone=auto&forecast_days=4';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  let json: OpenMeteoResponse | null = null;
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    json = res.ok ? ((await res.json()) as OpenMeteoResponse) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  const cur = json?.current;
  if (!json || typeof cur?.temperature_2m !== 'number' || typeof cur.weather_code !== 'number') {
    return null;
  }

  const daily: HubWeatherDailyItem[] = [];
  const times = json.daily?.time ?? [];
  for (let i = 0; i < times.length && i < 4; i++) {
    const tmax = json.daily?.temperature_2m_max?.[i];
    const tmin = json.daily?.temperature_2m_min?.[i];
    const code = json.daily?.weather_code?.[i];
    if (typeof tmax === 'number' && typeof tmin === 'number' && typeof code === 'number') {
      daily.push({ date: times[i], code, tmax: Math.round(tmax), tmin: Math.round(tmin) });
    }
  }

  const payload: HubWeatherPayload = {
    current: {
      temp: Math.round(cur.temperature_2m),
      code: cur.weather_code,
      wind: typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : 0,
    },
    daily,
    timezone: typeof json.timezone === 'string' && json.timezone ? json.timezone : 'UTC',
    fetchedAt: new Date().toISOString(),
  };
  cache.set(key, { at: Date.now(), data: payload });
  return payload;
}

/** Heure locale (0-23) dans le fuseau IANA donné — repli : heure serveur. */
export function localHourInTimezone(timezone?: string | null, at: Date = new Date()): number {
  try {
    if (!timezone) return at.getHours();
    const formatted = new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(at);
    const h = Number(formatted);
    return Number.isFinite(h) ? h % 24 : at.getHours();
  } catch {
    return at.getHours();
  }
}

/** Jour local YYYY-MM-DD dans le fuseau IANA donné (anti-doublon
 *  NotificationLog cohérent avec l'heure locale du logement). */
export function localDayInTimezone(timezone?: string | null, at: Date = new Date()): string {
  try {
    if (!timezone) {
      const p = (n: number) => String(n).padStart(2, '0');
      return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
    }
    return new Intl.DateTimeFormat('fr-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    }).format(at); // fr-CA = format ISO court YYYY-MM-DD
  } catch {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
  }
}

/**
 * Codes WMO Open-Meteo considérés « mauvais temps / rester à l'abri » :
 * bruine (51-57), pluie verglaçante (56-57, 61-67), neige (71-77),
 * averses (80-82, 85-86), orages (95-99). Brouillard (45-48) et
 * couvert (2-3) ne comptent pas comme pluie.
 */
export function isRainyWeatherCode(code: number | null | undefined): boolean {
  if (code == null) return false;
  return code >= 51 && code <= 99;
}

/** Bornes du jour local (YYYY-MM-DD) élargies ±14 h — couvre tous les
 *  fuseaux (UTC-12 → UTC+14) : une recommandation journalisée « aujourd'hui
 *  » ne doit jamais se rejouer le même jour local du logement. La marge
 *  sur-supprime au pire 1-2 h en bord de journée : acceptable pour un
 *  anti-doublon (l'inverse — rejouer — serait un bug visible). */
export function localDayBoundsWide(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    const now = new Date();
    return {
      start: new Date(now.getTime() - 24 * 3_600_000),
      end: new Date(now.getTime() + 3_600_000),
    };
  }
  return {
    start: new Date(start.getTime() - 14 * 3_600_000),
    end: new Date(start.getTime() + 24 * 3_600_000 + 14 * 3_600_000),
  };
}
