import { NextResponse } from 'next/server';

// =============================================================
// MODULE « OÙ SORTIR CE SOIR ? » (v4.61) — ÉVÉNEMENTS TEMPS RÉEL
// GET /api/public/events?slug=<qrHubSlug>
// (slug en QUERY PARAM — règle sandbox : pas de segments dynamiques
// pour les nouvelles routes API)
//
// Agrège les événements à venir (7 jours) autour du logement :
//   1. Ticketmaster Discovery API  (TICKETMASTER_API_KEY)
//   2. Eventbrite API v3           (EVENTBRITE_API_KEY — voir note ⚠)
//   3. Bandsintown Public API      (BANDSINTOWN_APP_ID — voir note ⚠)
//   4. Paris open data « Que Faire à Paris » (SANS CLÉ, Île-de-France)
//
// NOTE ⚠ 2026 : Eventbrite a RÉVOQUÉ son endpoint public /events/search
// (404 pour tous les comptes, le token reste valable pour la gestion
// organisateur) ; Bandsintown restreint son API publique (403). Ces
// deux sources restent branchées et réactiveront si elles rouvrent,
// mais la source principale fiable est aujourd'hui TICKETMASTER,
// complétée par l'open data Paris (aucune clé nécessaire).
//
// Au moins une source configurée → module actif (`configured:true`).
// Aucune clé ET hors Île-de-France → `{ ok:true, configured:false,
// events:[] }` : l'UI affiche un état d'attente élégant (jamais
// d'erreur pour l'invité).
//
//   • Coordonnées : résolues côté SERVEUR (plaque QR → bien), même
//     logique que /api/public/nearby-pharmacy ; jamais cru client.
//   • Cache mémoire local : 1 h (succès avec résultats) / 5 min
//     (vide ou sans clé) / 3 min (échec fournisseur) — volume
//     sortant minimal, l'appel externe n'est quasi jamais rejoué.
//   • Tolérant aux pannes : chaque source peut échouer
//     indépendamment (timeout 8 s, never throw) ; déduplication
//     par titre+date, tri chronologique, plafond 40 événements.
//   • slug demo-hub → programmation de DÉMONSTRATION (Paris,
//     dates relatives à aujourd'hui) clairement libellée
//     `demo:true` — jamais sur un vrai bien.
// Réponse :
//   { ok, reason?, configured, timeFilter, events: HubEvent[], demo? }
// =============================================================

const DEMO_SLUG = 'demo-hub';
const DEMO_COORDS = { lat: 48.8672, lng: 2.3316 }; // Paris — Opéra (démo)
const DEFAULT_RADIUS_KM = 50;
const WINDOW_DAYS = 7;
const MAX_EVENTS = 40;
const SUCCESS_TTL_MS = 60 * 60 * 1000; // 1 h
const EMPTY_TTL_MS = 5 * 60 * 1000; // 5 min
const CACHE_MAX = 300;

type EventCategory = 'concert' | 'expo' | 'market' | 'rooftop' | 'show' | 'other';
type EventSource = 'ticketmaster' | 'eventbrite' | 'bandsintown' | 'paris' | 'demo';
type TimeFilter = 'morning' | 'afternoon' | 'evening' | 'night';

interface HubEvent {
  id: string;
  title: string;
  description: string;
  /** YYYY-MM-DD (local au lieu de l'événement). */
  date: string;
  /** HH:mm ('' si inconnu). */
  time: string;
  venue: string;
  address: string;
  lat: number | null;
  lng: number | null;
  category: EventCategory;
  image: string | null;
  url: string | null;
  /** Prix lisible côté invité (« Gratuit », « Dès 25 € »…). */
  price: string | null;
  source: EventSource;
}

interface EventsResponse {
  ok: boolean;
  reason?: 'not_found' | 'no_coords' | 'provider_error';
  /** Au moins une source d'événements configurée (clés API). */
  configured: boolean;
  timeFilter: TimeFilter;
  events: HubEvent[];
  /** True = repli curaté du hub DÉMO (jamais en production réelle). */
  demo?: boolean;
}

interface CacheEntry {
  at: number;
  data: EventsResponse;
  ttlMs: number;
}

const cache = new Map<string, CacheEntry>();

function readCache(key: string): EventsResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > entry.ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key: string, data: EventsResponse, ttlMs: number): void {
  if (cache.size >= CACHE_MAX) {
    // Éviction simple : le plus ancien.
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), data, ttlMs });
}

function timeFilterOf(now: Date): TimeFilter {
  const h = now.getHours();
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
}

/** YYYY-MM-DD local. */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal, headers });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Résolution du bien (plaque QR → hub) + coordonnées, côté serveur. */
async function resolvePropertyCoords(
  slug: string,
): Promise<{ lat: number; lng: number } | null> {
  if (slug === DEMO_SLUG) return DEMO_COORDS;

  // Import paresseux : évite de charger Prisma sur le slug démo.
  const { db } = await import('@/lib/db');

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

// ── Catégorisation (mots-clés, toutes sources) ───────────────
function categorizeFromText(...parts: (string | undefined | null)[]): EventCategory {
  const t = parts.filter(Boolean).join(' ').toLowerCase();
  if (/rooftop|terrasse panoramique/.test(t)) return 'rooftop';
  if (/concert|musique|music|live|festival|jazz|rock|pop|electro|dj/.test(t)) return 'concert';
  if (/expo|exposition|mus[eé]e|museum|galerie|gallery|vernissage/.test(t)) return 'expo';
  if (/march[eé]|market|brocante|puces|food|gourmand|gastronom/.test(t)) return 'market';
  if (/th[eé][aâ]tre|theater|spectacle|com[eé]die|comedy|humour|cirque|danse|op[eé]ra|sport/.test(t)) return 'show';
  return 'other';
}

/** « 20:30:00 » → « 20:30 » ; '' si absent. */
function normalizeTime(raw: string | undefined | null): string {
  if (!raw) return '';
  const m = /^(\d{2}:\d{2})/.exec(raw.trim());
  return m ? m[1] : '';
}

function dedupeAndSort(events: HubEvent[]): HubEvent[] {
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    const key = `${e.title.trim().toLowerCase()}-${e.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique
    .sort((a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')))
    .slice(0, MAX_EVENTS);
}

// ── Source 1 : Ticketmaster Discovery API ────────────────────
interface TmEvent {
  id?: string;
  name?: string;
  info?: string;
  pleaseNote?: string;
  dates?: { start?: { localDate?: string; localTime?: string } };
  images?: { url?: string; width?: number }[];
  url?: string;
  priceRanges?: { min?: number; max?: number; currency?: string }[];
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
  _embedded?: {
    venues?: {
      name?: string;
      address?: { line1?: string };
      city?: { name?: string };
      location?: { latitude?: string; longitude?: string };
    }[];
  };
}

async function fetchTicketmaster(lat: number, lng: number, from: string, to: string): Promise<HubEvent[]> {
  const key = (process.env.TICKETMASTER_API_KEY || '').trim();
  if (!key) return [];
  const radius = Number(process.env.EVENT_RADIUS_KM) || DEFAULT_RADIUS_KM;
  const url =
    `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${encodeURIComponent(key)}` +
    `&latlong=${lat},${lng}&radius=${radius}&unit=km` +
    `&startDateTime=${from}T00:00:00Z&endDateTime=${to}T23:59:59Z` +
    `&size=30&sort=date,asc`;
  const json = await fetchJson(url);
  const raw = (json as { _embedded?: { events?: TmEvent[] } })?._embedded?.events;
  if (!Array.isArray(raw)) return [];

  const out: HubEvent[] = [];
  for (const e of raw) {
    const date = e.dates?.start?.localDate;
    if (!date || !e.name) continue;
    const venue = e._embedded?.venues?.[0];
    const latNum = venue?.location?.latitude ? Number(venue.location.latitude) : null;
    const lngNum = venue?.location?.longitude ? Number(venue.location.longitude) : null;
    const price = e.priceRanges?.[0];
    const currency = price?.currency === 'EUR' ? '€' : price?.currency ?? '';
    const priceLabel = price
      ? typeof price.min === 'number' && typeof price.max === 'number' && price.min !== price.max
        ? `${price.min}–${price.max} ${currency}`.trim()
        : `Dès ${String(price.min ?? price.max ?? '?')} ${currency}`.trim()
      : null;
    out.push({
      id: `tm-${e.id ?? out.length}`,
      title: e.name,
      description: (e.info || e.pleaseNote || '').trim(),
      date,
      time: normalizeTime(e.dates?.start?.localTime),
      venue: (venue?.name || '').trim(),
      address: [venue?.address?.line1, venue?.city?.name].filter(Boolean).join(', '),
      lat: Number.isFinite(latNum) ? latNum : null,
      lng: Number.isFinite(lngNum) ? lngNum : null,
      category: categorizeFromText(e.classifications?.[0]?.segment?.name, e.classifications?.[0]?.genre?.name, e.name),
      image:
        e.images
          ?.filter((i) => typeof i.url === 'string')
          .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
          .find((i) => (i.width ?? 0) >= 640)?.url ??
        e.images?.[0]?.url ??
        null,
      url: e.url || null,
      price: priceLabel,
      source: 'ticketmaster',
    });
  }
  return out;
}

// ── Source 2 : Eventbrite API v3 ─────────────────────────────
interface EbEvent {
  id?: string;
  name?: { text?: string };
  description?: { text?: string };
  start?: { local?: string };
  is_free?: boolean;
  url?: string;
  logo?: { url?: string };
  venue?: {
    name?: string;
    address?: { address_1?: string; city?: string };
    latitude?: string;
    longitude?: string;
  };
}

async function fetchEventbrite(lat: number, lng: number, from: string, to: string): Promise<HubEvent[]> {
  const key = (process.env.EVENTBRITE_API_KEY || '').trim();
  if (!key) return [];
  const radius = Number(process.env.EVENT_RADIUS_KM) || DEFAULT_RADIUS_KM;
  const url =
    `https://www.eventbriteapi.com/v3/events/search/?token=${encodeURIComponent(key)}` +
    `&location.latitude=${lat}&location.longitude=${lng}&location.within=${radius}km` +
    `&start_date.range_start=${from}T00:00:00Z&start_date.range_end=${to}T23:59:59Z` +
    `&expand=venue,logo`;
  const json = await fetchJson(url);
  const raw = (json as { events?: EbEvent[] })?.events;
  if (!Array.isArray(raw)) return [];

  const out: HubEvent[] = [];
  for (const e of raw) {
    const localStart = e.start?.local;
    if (!localStart || !e.name?.text) continue;
    const [date, timePart] = localStart.split('T');
    if (!date) continue;
    const latNum = e.venue?.latitude ? Number(e.venue.latitude) : null;
    const lngNum = e.venue?.longitude ? Number(e.venue.longitude) : null;
    out.push({
      id: `eb-${e.id ?? out.length}`,
      title: e.name.text,
      description: (e.description?.text || '').trim().slice(0, 400),
      date,
      time: normalizeTime(timePart),
      venue: (e.venue?.name || '').trim(),
      address: [e.venue?.address?.address_1, e.venue?.address?.city].filter(Boolean).join(', '),
      lat: Number.isFinite(latNum) ? latNum : null,
      lng: Number.isFinite(lngNum) ? lngNum : null,
      category: categorizeFromText(e.name.text),
      image: e.logo?.url || null,
      url: e.url || null,
      price: e.is_free ? 'Gratuit' : null,
      source: 'eventbrite',
    });
  }
  return out;
}

// ── Source 3 : Bandsintown Public API (concerts) ─────────────
interface BitEvent {
  id?: string | number;
  title?: string;
  description?: string;
  datetime?: string;
  url?: string;
  artists?: { name?: string; image_url?: string; thumb_url?: string }[];
  venue?: {
    name?: string;
    latitude?: string | number;
    longitude?: string | number;
    city?: string;
    region?: string;
    country?: string;
  };
  offers?: { url?: string; status?: string }[];
}

async function fetchBandsintown(lat: number, lng: number, from: string, to: string): Promise<HubEvent[]> {
  const appId = (process.env.BANDSINTOWN_APP_ID || 'roomscan').trim();
  const radius = Number(process.env.EVENT_RADIUS_KM) || DEFAULT_RADIUS_KM;
  const url =
    `https://rest.bandsintown.com/events/search?app_id=${encodeURIComponent(appId)}` +
    `&location=${lat},${lng}&radius=${radius}&date=${from},${to}`;
  const json = await fetchJson(url);
  if (!Array.isArray(json)) return [];

  const out: HubEvent[] = [];
  for (const e of json as BitEvent[]) {
    const datetime = e.datetime;
    if (!datetime) continue;
    const [date, timePart] = datetime.split('T');
    if (!date) continue;
    const artist = e.artists?.[0];
    const latNum = e.venue?.latitude !== undefined ? Number(e.venue.latitude) : null;
    const lngNum = e.venue?.longitude !== undefined ? Number(e.venue.longitude) : null;
    const title = e.title || (artist?.name ? `${artist.name} — Concert` : 'Concert');
    out.push({
      id: `bit-${e.id ?? out.length}`,
      title,
      description: (e.description || '').replace(/<[^>]+>/g, '').trim().slice(0, 400),
      date,
      time: normalizeTime(timePart),
      venue: (e.venue?.name || '').trim(),
      address: [e.venue?.city, e.venue?.country].filter(Boolean).join(', '),
      lat: Number.isFinite(latNum) ? latNum : null,
      lng: Number.isFinite(lngNum) ? lngNum : null,
      category: 'concert',
      image: artist?.image_url || artist?.thumb_url || null,
      url: e.offers?.find((o) => o.url)?.url || e.url || null,
      price: e.offers?.[0]?.status === 'available' ? 'Billets disponibles' : null,
      source: 'bandsintown',
    });
  }
  return out;
}

// ── Source 4 : Paris open data « Que Faire à Paris » (sans clé) ─
// Jeu de données officiel de la Ville de Paris sur opendata.paris.fr.
// Active automatiquement pour tout bien situé en Île-de-France.
const PARIS_BBOX = { minLat: 48.3, maxLat: 49.2, minLng: 1.6, maxLng: 3.0 };

function isParisRegion(lat: number, lng: number): boolean {
  return (
    lat >= PARIS_BBOX.minLat && lat <= PARIS_BBOX.maxLat &&
    lng >= PARIS_BBOX.minLng && lng <= PARIS_BBOX.maxLng
  );
}

interface ParisEvent {
  recordid?: string;
  id?: string;
  title?: string;
  lead_text?: string;
  description?: string;
  date_start?: string;
  url?: string;
  cover_url?: string;
  locations?: {
    address_name?: string;
    address_street?: string;
    address_zipCode?: string;
    address_city?: string;
  }[];
  address_name?: string;
  address_street?: string;
  address_zipcode?: string;
  address_city?: string;
  lat_lon?: { lat?: number | string; lon?: number | string };
  price_type?: string;
  price_detail?: string;
  qfap_tags?: string;
  universe_tags?: string;
}

/** Supprime les balises HTML et entités basiques d'un texte prix/description. */
function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchParisOpenData(lat: number, lng: number, from: string, to: string): Promise<HubEvent[]> {
  if (!isParisRegion(lat, lng)) return [];
  const where = `date_start >= "${from}" AND date_start <= "${to} 23:59:59"`;
  const url =
    'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records' +
    `?limit=40&order_by=date_start&where=${encodeURIComponent(where)}`;
  const json = await fetchJson(url, { 'User-Agent': 'ConciergeHub/1.0 (roomscan.pro)' });
  const rows = (json as { results?: ParisEvent[] })?.results;
  if (!Array.isArray(rows)) return [];

  const out: HubEvent[] = [];
  for (const e of rows) {
    const date = e.date_start?.slice(0, 10);
    if (!date || !e.title) continue;
    // lat_lon est un objet {lat, lon} dans ce dataset.
    const latNum = Number(e.lat_lon?.lat);
    const lngNum = Number(e.lat_lon?.lon);
    const loc = e.locations?.[0];
    const address =
      [loc?.address_street || e.address_street, loc?.address_zipCode || e.address_zipcode, loc?.address_city || e.address_city]
        .filter(Boolean)
        .join(', ');
    const priceType = (e.price_type || '').toLowerCase();
    const priceDetail = e.price_detail ? stripHtml(e.price_detail).slice(0, 60) : '';
    const price =
      priceType === 'gratuit' || priceType === 'free' ? 'Gratuit' : priceDetail || (priceType === 'payant' ? 'Payant' : null);
    out.push({
      id: `paris-${e.recordid ?? e.id ?? out.length}`,
      title: e.title,
      description: (e.lead_text || stripHtml(e.description || '')).trim().slice(0, 400),
      date,
      time: normalizeTime(e.date_start?.slice(11, 16)),
      venue: (loc?.address_name || e.address_name || '').trim(),
      address,
      lat: Number.isFinite(latNum) ? latNum : null,
      lng: Number.isFinite(lngNum) ? lngNum : null,
      category: categorizeFromText(e.qfap_tags, e.universe_tags, e.title),
      image: e.cover_url || null,
      url: e.url || null,
      price,
      source: 'paris',
    });
  }
  return out;
}

// ── Programmation de DÉMONSTRATION (slug demo-hub uniquement) ─
function demoEvents(now: Date): HubEvent[] {
  const at = (offsetDays: number): string => {
    const d = new Date(now);
    d.setDate(d.getDate() + offsetDays);
    return isoDate(d);
  };
  return [
    {
      id: 'demo-1',
      title: 'Quintet de jazz en cave voutée',
      description:
        'Trois sets live dans le club mythique de Saint-Germain. Ambiance feutrée, plan serré : arrivez 30 min avant.',
      date: at(0),
      time: '21:00',
      venue: 'Caveau de la Huchette',
      address: '5 rue de la Huchette, 75005 Paris',
      lat: 48.8534,
      lng: 2.3433,
      category: 'concert',
      image: null,
      url: null,
      price: 'Entrée 22 €',
      source: 'demo',
    },
    {
      id: 'demo-2',
      title: 'Rooftop coucher de soleil — Marais',
      description:
        'Cocktails signature et vue panoramique sur les toits de Paris, au dernier étage d’un haussmannien.',
      date: at(0),
      time: '19:30',
      venue: 'Le Perchoir Marais',
      address: '37 rue de Bretagne, 75003 Paris',
      lat: 48.8629,
      lng: 2.3627,
      category: 'rooftop',
      image: null,
      url: null,
      price: 'Entrée libre',
      source: 'demo',
    },
    {
      id: 'demo-3',
      title: 'Marché d’Aligre — antiquités & producteurs',
      description:
        'Le marché le plus authentique de Paris : fromagers, brocante et fleurs, à deux pas de la Bastille.',
      date: at(1),
      time: '09:00',
      venue: 'Marché d’Aligre',
      address: 'Place d’Aligre, 75012 Paris',
      lat: 48.8507,
      lng: 2.3765,
      category: 'market',
      image: null,
      url: null,
      price: 'Gratuit',
      source: 'demo',
    },
    {
      id: 'demo-4',
      title: 'Exposition « Lumières de la Ville »',
      description:
        'Une scénographie immersive sur Paris la nuit, de l’impressionnisme à la photographie contemporaine.',
      date: at(2),
      time: '10:30',
      venue: 'Grand Palais',
      address: '3 avenue du Général Eisenhower, 75008 Paris',
      lat: 48.8661,
      lng: 2.3125,
      category: 'expo',
      image: null,
      url: null,
      price: 'Plein tarif 16 €',
      source: 'demo',
    },
    {
      id: 'demo-5',
      title: 'Théâtre de boulevard — pièce à succès',
      description:
        'La comédie qui fait sold-out depuis six mois. Rideau à 20 h 30, bar à l’entracte.',
      date: at(3),
      time: '20:30',
      venue: 'Théâtre du Nord-Ouest',
      address: '13 rue Faubourg Montmartre, 75009 Paris',
      lat: 48.8726,
      lng: 2.3362,
      category: 'show',
      image: null,
      url: null,
      price: 'Dès 25 €',
      source: 'demo',
    },
  ];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || '').trim();

    if (!slug || slug.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'not_found',
          configured: false,
          timeFilter: timeFilterOf(new Date()),
          events: [],
        } satisfies EventsResponse,
        { status: 400 },
      );
    }

    const cached = readCache(slug);
    if (cached) {
      return NextResponse.json(cached, { headers: { 'Cache-Control': 'no-store' } });
    }

    const now = new Date();
    const timeFilter = timeFilterOf(now);

    // DÉMO : programmation curatée, dates relatives à aujourd'hui.
    if (slug === DEMO_SLUG) {
      const data: EventsResponse = {
        ok: true,
        configured: true,
        timeFilter,
        events: dedupeAndSort(demoEvents(now)),
        demo: true,
      };
      // TTL court : les dates relatives restent fraîches chaque jour.
      writeCache(slug, data, 10 * 60 * 1000);
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }

    const coords = await resolvePropertyCoords(slug);
    if (!coords) {
      const data: EventsResponse = {
        ok: false,
        reason: 'no_coords',
        configured: true,
        timeFilter,
        events: [],
      };
      writeCache(slug, data, EMPTY_TTL_MS);
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }

    const from = isoDate(now);
    const toDate = new Date(now);
    toDate.setDate(toDate.getDate() + WINDOW_DAYS - 1);
    const to = isoDate(toDate);

    // Les 4 sources en parallèle ; chacune peut renvoyer [] sans faire
    // tomber les autres (clé absente, quota, timeout, hors zone…).
    const [tm, eb, bit, paris] = await Promise.all([
      fetchTicketmaster(coords.lat, coords.lng, from, to),
      fetchEventbrite(coords.lat, coords.lng, from, to),
      fetchBandsintown(coords.lat, coords.lng, from, to),
      fetchParisOpenData(coords.lat, coords.lng, from, to),
    ]);

    const configured =
      Boolean((process.env.TICKETMASTER_API_KEY || '').trim()) ||
      Boolean((process.env.EVENTBRITE_API_KEY || '').trim()) ||
      Boolean(process.env.BANDSINTOWN_APP_ID?.trim()) ||
      isParisRegion(coords.lat, coords.lng); // open data Paris : aucune clé
    const events = dedupeAndSort([...tm, ...eb, ...bit, ...paris]);

    const data: EventsResponse = { ok: true, configured, timeFilter, events };
    // 1 h quand il y a des résultats, 5 min sinon (ou aucune clé).
    writeCache(slug, data, events.length > 0 ? SUCCESS_TTL_MS : EMPTY_TTL_MS);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Public events GET error:', error);
    return NextResponse.json(
      {
        ok: false,
        reason: 'provider_error',
        configured: true,
        timeFilter: timeFilterOf(new Date()),
        events: [],
      } satisfies EventsResponse,
      { status: 200 },
    );
  }
}
