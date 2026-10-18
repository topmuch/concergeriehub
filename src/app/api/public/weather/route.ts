import { NextResponse } from 'next/server';

// =============================================================
// DIGITAL CONCIERGE (V4.1) — GET /api/public/weather?lat=…&lng=…
// Proxy météo côté serveur pour le header « Bonjour … » :
//   • Open-Meteo  → température + code météo WMO (gratuit, sans clé)
//   • Nominatim   → nom de la ville (reverse geocoding, fr)
// Pourquoi un proxy ? La CSP du projet (FIX-8b) impose
// connect-src 'self' → l'app invitée ne peut PAS appeler ces API
// directement depuis le navigateur de l'invité.
// Cache mémoire local (30 min / lat,lng arrondis) → volume de
// requêtes sortantes minime même avec beaucoup d'invités.
// Tolérant aux pannes : renvoie ok:false (jamais de throw).
// =============================================================

interface WeatherEntry {
  at: number;
  data: WeatherResponse;
}

interface WeatherResponse {
  ok: boolean;
  /** Température arrondie (°C) — null si indisponible. */
  temp: number | null;
  /** Code météo WMO (0 = soleil…) — null si indisponible. */
  code: number | null;
  /** Ville (reverse geocoding) — null si indisponible. */
  city: string | null;
}

const SUCCESS_TTL_MS = 30 * 60 * 1000;
const FAILURE_TTL_MS = 3 * 60 * 1000;
/** Cache mémoire par instance (règle projet : pas de middleware externe). */
const cache = new Map<string, WeatherEntry>();
const CACHE_MAX = 500;

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal, headers });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function readCache(key: string): WeatherResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const ttl = entry.data.ok ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
  if (Date.now() - entry.at > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key: string, data: WeatherResponse): void {
  if (cache.size >= CACHE_MAX) {
    // éviction simple : le plus ancien
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), data });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ ok: false, temp: null, code: null, city: null } satisfies WeatherResponse, { status: 400 });
    }

    // Clé arrondie au 100e (~1 km) → cache efficace par quartier
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const cached = readCache(key);
    if (cached) {
      return NextResponse.json(cached, { headers: { 'Cache-Control': 'no-store' } });
    }

    // 1. Température + code WMO (Open-Meteo)
    const w = (await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`,
    )) as { current?: { temperature_2m?: number; weather_code?: number } } | null;
    const temp = typeof w?.current?.temperature_2m === 'number' ? Math.round(w.current.temperature_2m) : null;
    const code = typeof w?.current?.weather_code === 'number' ? w.current.weather_code : null;

    // 2. Ville (Nominatim — best effort, UA conforme à leur policy)
    const geo = (await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=fr&zoom=10`,
      { 'User-Agent': 'RoomScan/4.1 (guest app weather header)' },
    )) as { address?: Record<string, string> } | null;
    const addr = geo?.address;
    const city = addr ? (addr.city || addr.town || addr.village || addr.municipality || null) ?? null : null;

    const data: WeatherResponse = { ok: temp !== null, temp, code, city };
    writeCache(key, data);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Weather GET error:', error);
    return NextResponse.json({ ok: false, temp: null, code: null, city: null } satisfies WeatherResponse, { status: 200 });
  }
}
