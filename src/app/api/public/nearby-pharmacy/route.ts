import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { haversineKm } from '@/lib/concierge';

// =============================================================
// 8 AMÉLIORATIONS (PHASE 1) — 1.4 PHARMACIE DE GARDE AUTOMATIQUE
// GET /api/public/nearby-pharmacy?slug=<qrHubSlug>
// (slug en QUERY PARAM — règle sandbox : pas de segments dynamiques
// pour les nouvelles routes API)
//
// Trouve la pharmacie la plus proche du logement (rayon 5 km) :
//   • Coordonnées : lues côté SERVEUR depuis Property.latitude/
//     longitude (même résolution que /api/public/guest-app : plaque
//     QR → hub du bien) — jamais cru côté client ;
//   • Fournisseurs :
//       1. Geoapify Places API (categories=health.pharmacy,
//          filter=circle 5 km, bias=proximity) si GEOAPIFY_API_KEY
//          est configurée (plan gratuit 3 000 req/jour) ;
//       2. sinon Overpass API (OpenStreetMap, amenity=pharmacy,
//          around 5 km) — gratuit, SANS clé, disponible partout.
//   • Cache mémoire local : 6 h (succès — une pharmacie ne déménage
//     pas) / 15 min (échec) → volume de requêtes sortantes minime ;
//   • Tolérant aux pannes : renvoie ok:false (jamais de throw) ;
//   • slug demo-hub → coordonnées démo (Paris Opéra) → la démo
//     fonctionne réellement (pharmacies du 9e arrondissement).
// Réponse normalisée :
//   { ok, reason?, pharmacy: { name, address, phone, lat, lon,
//     distanceKm } | null, source }
// =============================================================

const DEMO_SLUG = 'demo-hub';
const DEMO_COORDS = { lat: 48.8672, lng: 2.3316 }; // Paris — Opéra (démo)
const RADIUS_M = 5000;
const SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 3 * 60 * 1000;
const CACHE_MAX = 500;

interface NearbyPharmacy {
  name: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lon: number;
  distanceKm: number;
}

interface PharmacyResponse {
  ok: boolean;
  reason?: 'not_found' | 'no_coords' | 'none_found' | 'provider_error';
  pharmacy: NearbyPharmacy | null;
  source: 'geoapify' | 'osm' | null;
  /** True = repli curaté du hub DÉMO (providers injoignables) — jamais en production. */
  demo?: boolean;
}

interface CacheEntry {
  at: number;
  data: PharmacyResponse;
}

const cache = new Map<string, CacheEntry>();

function readCache(key: string): PharmacyResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const ttl = entry.data.ok ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
  if (Date.now() - entry.at > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key: string, data: PharmacyResponse): void {
  if (cache.size >= CACHE_MAX) {
    // éviction simple : le plus ancien
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), data });
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(url, { signal: ctrl.signal, headers });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Requête Overpass avec miroirs de secours (production : haute dispo).
 *  Renvoie null si AUCUN miroir ne répond → provider_error. */
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function fetchOverpass(query: string): Promise<unknown | null> {
  for (const mirror of OVERPASS_MIRRORS) {
    const json = await fetchJson(
      `${mirror}?data=${encodeURIComponent(query)}`,
      { 'User-Agent': 'RoomScan/4.49 (pharmacie de garde)' },
    );
    if (json !== null) return json;
  }
  return null;
}

/** Résolution du bien (plaque QR → hub) + coordonnées, côté serveur. */
async function resolvePropertyCoords(
  slug: string,
): Promise<{ lat: number; lng: number } | null> {
  if (slug === DEMO_SLUG) return DEMO_COORDS;

  const plaque = await db.physicalQrCode.findUnique({
    where: { hubSlug: slug },
    select: { propertyId: true, isClaimed: true, status: true },
  });

  let propertyId: string | null = null;
  if (plaque && plaque.isClaimed && plaque.propertyId && plaque.status === 'active') {
    propertyId = plaque.propertyId;
  } else if (!plaque) {
    const propertyBySlug = await db.property.findUnique({
      where: { qrHubSlug: slug },
      select: { id: true, isActive: true },
    });
    if (propertyBySlug?.isActive) propertyId = propertyBySlug.id;
  }

  if (!propertyId) return null;

  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { latitude: true, longitude: true, isActive: true },
  });

  if (
    !property ||
    !property.isActive ||
    typeof property.latitude !== 'number' ||
    typeof property.longitude !== 'number'
  ) {
    return null;
  }
  return { lat: property.latitude, lng: property.longitude };
}

// ── Fournisseur 1 : Geoapify (si clé configurée) ─────────────
interface GeoapifyFeature {
  properties?: {
    name?: string;
    address_line1?: string;
    address_line2?: string;
    lat?: number;
    lon?: number;
    datasource?: { raw?: { phone?: string; 'contact:phone'?: string } };
  };
}

function parseGeoapify(json: unknown, lat: number, lng: number): NearbyPharmacy | null {
  const features = (json as { features?: GeoapifyFeature[] })?.features;
  if (!Array.isArray(features)) return null;

  const candidates: NearbyPharmacy[] = [];
  for (const f of features) {
    const p = f?.properties;
    if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number') continue;
    candidates.push({
      name: (p.name || '').trim() || 'Pharmacie',
      address: [p.address_line1, p.address_line2].filter(Boolean).join(', ').trim() || null,
      phone: p.datasource?.raw?.phone || p.datasource?.raw?.['contact:phone'] || null,
      lat: p.lat,
      lon: p.lon,
      distanceKm: haversineKm(lat, lng, p.lat, p.lon),
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  return candidates[0];
}

// ── Fournisseur 2 : Overpass / OpenStreetMap (sans clé) ──────
interface OsmElement {
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

function parseOsm(json: unknown, lat: number, lng: number): NearbyPharmacy | null {
  const elements = (json as { elements?: OsmElement[] })?.elements;
  if (!Array.isArray(elements)) return null;

  const named: NearbyPharmacy[] = [];
  const unnamed: NearbyPharmacy[] = [];
  for (const el of elements) {
    const elLat = el?.lat ?? el?.center?.lat;
    const elLon = el?.lon ?? el?.center?.lon;
    if (typeof elLat !== 'number' || typeof elLon !== 'number') continue;
    const tags = el?.tags ?? {};
    const addressParts = [
      [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ') || null,
      [tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ') || null,
    ].filter(Boolean);
    const item: NearbyPharmacy = {
      name: (tags.name || '').trim() || 'Pharmacie',
      address: addressParts.join(', ') || null,
      phone: tags.phone || tags['contact:phone'] || null,
      lat: elLat,
      lon: elLon,
      distanceKm: haversineKm(lat, lng, elLat, elLon),
    };
    if (tags.name && tags.name.trim()) named.push(item);
    else unnamed.push(item);
  }
  // Priorité aux pharmacies nommées (meilleure expérience), puis distance.
  const pool = named.length > 0 ? named : unnamed;
  if (pool.length === 0) return null;
  pool.sort((a, b) => a.distanceKm - b.distanceKm);
  return pool[0];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || '').trim();

    if (!slug || slug.length < 2) {
      return NextResponse.json(
        { ok: false, reason: 'not_found', pharmacy: null, source: null } satisfies PharmacyResponse,
        { status: 400 },
      );
    }

    const cached = readCache(slug);
    if (cached) {
      return NextResponse.json(cached, { headers: { 'Cache-Control': 'no-store' } });
    }

    const coords = await resolvePropertyCoords(slug);
    if (!coords) {
      const data: PharmacyResponse = { ok: false, reason: 'not_found', pharmacy: null, source: null };
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }

    const apiKey = (process.env.GEOAPIFY_API_KEY || '').trim();
    let pharmacy: NearbyPharmacy | null = null;
    let source: 'geoapify' | 'osm' | null = null;
    let providerFailed = false;

    if (apiKey) {
      // ── Geoapify Places API (categories=health.pharmacy, rayon 5 km) ──
      const geoUrl =
        `https://api.geoapify.com/v2/places?categories=health.pharmacy` +
        `&filter=circle:${coords.lng},${coords.lat},${RADIUS_M}` +
        `&bias=proximity:${coords.lng},${coords.lat}` +
        `&limit=10&lang=fr&apiKey=${encodeURIComponent(apiKey)}`;
      const geo = await fetchJson(geoUrl);
      if (geo === null) providerFailed = true;
      pharmacy = parseGeoapify(geo, coords.lat, coords.lng);
      if (pharmacy) source = 'geoapify';
    }

    if (!pharmacy) {
      // ── Repli / défaut : Overpass OpenStreetMap (gratuit, sans clé) ──
      const query =
        `[out:json][timeout:8];` +
        `node(around:${RADIUS_M},${coords.lat},${coords.lng})[amenity=pharmacy];` +
        `way(around:${RADIUS_M},${coords.lat},${coords.lng})[amenity=pharmacy];` +
        `out center 40;`;
      const osm = await fetchOverpass(query);
      if (osm === null) providerFailed = true;
      pharmacy = parseOsm(osm, coords.lat, coords.lng);
      if (pharmacy) source = 'osm';
    }

    // Distance lisible : 1 décimale ("1,2 km").
    if (pharmacy) {
      pharmacy.distanceKm = Math.round(pharmacy.distanceKm * 10) / 10;
    }

    // Repli DÉMO uniquement : providers injoignables (réseau restreint,
    // ex: sandbox) → pharmacie d'exemple clairement libellée, pour que
    // l'expérience démo reste démontrable. JAMAIS sur un vrai bien.
    if (!pharmacy && providerFailed && slug === DEMO_SLUG) {
      pharmacy = {
        name: "Pharmacie de l'Opéra (exemple de démo)",
        address: '12 boulevard des Capucines, 75009 Paris',
        phone: '+33142000000',
        lat: 48.871,
        lon: 2.3318,
        distanceKm: 0.3,
      };
      const data: PharmacyResponse = { ok: true, pharmacy, source: null, demo: true };
      writeCache(slug, data);
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }

    const data: PharmacyResponse = pharmacy
      ? { ok: true, pharmacy, source }
      : providerFailed
        ? { ok: false, reason: 'provider_error', pharmacy: null, source }
        : { ok: false, reason: 'none_found', pharmacy: null, source };
    writeCache(slug, data);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Nearby pharmacy GET error:', error);
    return NextResponse.json(
      { ok: false, reason: 'provider_error', pharmacy: null, source: null } satisfies PharmacyResponse,
      { status: 200 },
    );
  }
}
