// =============================================================
// /api/airbnb/places — AUTOCOMPLÉTION D'ADRESSE (v4.43)
//
// Le champ « Adresse » du dashboard (création + édition de bien)
// complète automatiquement l'adresse pendant la saisie. Le serveur
// proxifie le fournisseur (la clé API ne quitte JAMAIS le serveur) :
//
//   1. GOOGLE PLACES (si GOOGLE_MAPS_API_KEY / GOOGLE_PLACES_API_KEY
//      / NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) — Places API (New)
//      « autocomplete » ; les coordonnées exactes sont résolues à la
//      SÉLECTION via /api/airbnb/places/details?placeId=…
//      (Place Details, FieldMask location+formattedAddress).
//   2. SINON NOMINATIM (OpenStreetMap, gratuit sans clé) — renvoie
//      directement label + lat/lng (coordonnées incluses).
//
// GET ?q=<3+ caractères> → { items: [{ label, lat, lng, placeId, source }] }
// Sécurité : session obligatoire, rate limit 30/min, timeout 4 s,
// never-throw (échec fournisseur → liste vide, saisie manuelle OK).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

export interface PlaceSuggestion {
  label: string;
  lat: number | null;
  lng: number | null;
  /** Google uniquement — résolu en lat/lng via /places/details. */
  placeId: string | null;
  source: 'google' | 'osm';
}

const FETCH_TIMEOUT_MS = 4_000;

function googleApiKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    null
  );
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Google Places API (New) — autocomplete (ids seuls ; lat/lng viennent
 *  de /places/details à la sélection). */
async function googleAutocomplete(q: string, key: string): Promise<PlaceSuggestion[]> {
  const res = await fetchWithTimeout('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
    },
    body: JSON.stringify({
      input: q,
      languageCode: 'fr',
      includedPrimaryTypes: ['geocode'],
    }),
  });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
      };
    }[];
  } | null;
  const out: PlaceSuggestion[] = [];
  for (const s of json?.suggestions ?? []) {
    const p = s.placePrediction;
    const label = p?.text?.text?.trim();
    if (!p?.placeId || !label) continue;
    out.push({ label, lat: null, lng: null, placeId: p.placeId, source: 'google' });
  }
  return out.slice(0, 6);
}

/** Nominatim (OpenStreetMap) — label + lat/lng immédiats. */
async function nominatimSearch(q: string): Promise<PlaceSuggestion[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=fr&q=' +
    encodeURIComponent(q);
  const res = await fetchWithTimeout(url, {
    headers: {
      // Nominatim exige un User-Agent identifié (politique d'usage).
      'User-Agent': 'RoomScan/1.0 (https://roomscan.pro)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as
    | { display_name?: string; lat?: string; lon?: string }[]
    | null;
  if (!Array.isArray(json)) return [];
  const out: PlaceSuggestion[] = [];
  for (const row of json) {
    const label = row.display_name?.trim();
    const lat = row.lat ? Number(row.lat) : NaN;
    const lng = row.lon ? Number(row.lon) : NaN;
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ label, lat, lng, placeId: null, source: 'osm' });
  }
  return out.slice(0, 6);
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (!(await rateLimit(`places:${userId}`, 30))) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') ?? '').trim();
    if (q.length < 3) {
      return NextResponse.json({ items: [] });
    }

    const key = googleApiKey();
    try {
      if (key) {
        const items = await googleAutocomplete(q, key);
        if (items.length > 0) return NextResponse.json({ items, provider: 'google' });
        // Google sans résultat → on tente quand même OSM (adresses
        // rurales parfois manquantes côté Google).
      }
      const items = await nominatimSearch(q);
      return NextResponse.json({ items, provider: 'osm' });
    } catch (e) {
      // Fournisseur injoignable → liste vide (saisie manuelle toujours OK).
      console.warn('[airbnb/places] provider unreachable:', e instanceof Error ? e.message : e);
      return NextResponse.json({ items: [], provider: null });
    }
  } catch (error) {
    console.error('[airbnb/places GET] Error:', error);
    return NextResponse.json({ items: [], provider: null });
  }
}
