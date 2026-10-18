// =============================================================
// v4.112 « MOTEUR DE RECOMMANDATION CONTEXTUEL LOCAL » — IA HUB INVITÉ
// src/lib/recommendation-engine.ts
//
// Transforme le Hub en concierge PROACTIF : analyse le contexte
// (heure locale du logement, météo en cache, jour du séjour) et le
// catalogue RÉEL de l'hôte (prestataires GUEST_EXPERIENCE configurés,
// minibar garni) pour suggérer le bon service au moment psychologique
// idéal — uniquement ce qui existe vraiment en base. Aucun catalogue
// inventé : pas de prestataire petit-déjeuner → pas de suggestion.
//
// Les 4 règles (spécification v4.112) :
//   1. PETIT-DÉJEUNER   07h00-09h00 + prestataire `petit_dejeuner`
//                       actif → suggestion livraison (priorité 90).
//   2. MINIBAR / VERRE  18h00-21h00 OU météo > 28 °C + minibar
//                       garni (premiumFeatures.minibar.items)
//                       → suggestion détente (priorité 70).
//   3. DÉJEUNER/DÎNER   11h30-13h30 / 18h30-20h30 + prestataire
//                       `chef` (ou traiteur/livraison) :
//                       pluie → « Chef à domicile », soleil →
//                       « terrasse partenaire » (priorité 65).
//   4. SORTIES          jour 2+ du séjour → « Visiter la ville »
//                       (coups de cœur de l'hôte, priorité 60).
//
// 100 % LOCAL : aucune API tierce pour décider — la météo vient du
// cache mémoire partagé (lib/hub-weather.ts, Open-Meteo sans clé),
// tout le reste est en base. L'anti-spam (1 affichage/jour) est
// appliqué PAR L'APPELANT via NotificationLog (route /recommendations).
// =============================================================

import { db } from '@/lib/db';
import { parseMinibar } from '@/lib/concierge';
import {
  getCachedWeather,
  localHourInTimezone,
  isRainyWeatherCode,
  type HubWeatherPayload,
} from '@/lib/hub-weather';

// ── Types publics ────────────────────────────────────────────────

/** Types de recommandations du moteur (clés NotificationLog en minuscules). */
export type RecommendationType = 'BREAKFAST' | 'MINIBAR' | 'FOOD' | 'ACTIVITY';

/** Type de notification consommé par SmartNotification + NotificationLog. */
export const RECOMMENDATION_LOG_TYPE: Record<RecommendationType, string> = {
  BREAKFAST: 'breakfast',
  MINIBAR: 'minibar',
  FOOD: 'food',
  ACTIVITY: 'activity',
};

export interface Recommendation {
  type: RecommendationType;
  title: string;
  message: string;
  /** URL d'action (ancre du hub si le slug est fourni dans le contexte). */
  actionUrl: string;
  /** Ancre de carte du hub (hub-content.tsx) pour le scroll client. */
  anchor: string;
  priority: number;
  /** Nom du prestataire réel à l'origine de la suggestion (si applicable). */
  providerName?: string;
}

export interface GuestContext {
  /** Heure locale du logement (0-23). Absente → dérivée du fuseau météo
   *  (Open-Meteo auto) ou de l'horloge serveur en dernier repli. */
  currentHour?: number | null;
  /** Jour du séjour (1 = jour d'arrivée). Absent → calculé depuis la
   *  réservation en cours du bien. */
  stayDay?: number | null;
  /** Météo déjà en cache côté appelant (payload du widget). */
  weather?: { tempC?: number | null; code?: number | null } | null;
  /** Slug du hub — sert uniquement à construire actionUrl (/hub/[slug]#ancre). */
  slug?: string | null;
}

// ── Fenêtres horaires (heure LOCALE du logement) ─────────────────

const BREAKFAST_WINDOW = { start: 7, end: 9 }; // 07:00 → 08:59
const MINIBAR_WINDOW = { start: 18, end: 21 }; // 18:00 → 20:59
/** Créneaux repas en minutes locales (11h30-13h30 / 18h30-20h30). */
const FOOD_WINDOWS: { start: number; end: number }[] = [
  { start: 11 * 60 + 30, end: 13 * 60 + 30 },
  { start: 18 * 60 + 30, end: 20 * 60 + 30 },
];
/** Seuil météo « il fait chaud, pensez au frais » (°C). */
const HOT_TEMPERATURE_C = 28;

// ── Aides ────────────────────────────────────────────────────────

interface HubProviders {
  /** Prestataires de l'annuaire (géolocalisés) joignables pour le bien. */
  breakfast: string | null;
  food: string | null;
}

/** Distance haversine (km) — copie conforme du calcul du payload hub. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Le prestataire perso de l'hôte correspond-il à une catégorie donnée ?
 *  Les HostProvider ont une catégorie libre → matching souple par mots-clés. */
function hostProviderMatches(
  category: string | null | undefined,
  name: string | null | undefined,
  keywords: string[],
): boolean {
  const haystack = `${category ?? ''} ${name ?? ''}`.toLowerCase();
  return keywords.some((k) => haystack.includes(k));
}

const BREAKFAST_KEYWORDS = ['petit', 'déjeuner', 'dejeuner', 'breakfast', 'boulanger', 'viennoiserie'];
const FOOD_KEYWORDS = ['chef', 'traiteur', 'restaurant', 'livraison', 'food', 'cuisine', 'repas'];

/**
 * Trouve les prestataires RÉELS du bien (annuaire GUEST_EXPERIENCE dans
 * le rayon + prestataires perso de l'hôte) pour les règles petit-déjeuner
 * et repas. Même sémantique que le payload hub (bounding box 200 km,
 * rayon propre du prestataire, toggle hôte respecté) — 2 requêtes max.
 */
async function findHubProviders(property: {
  id: string;
  latitude: number | null;
  longitude: number | null;
  disabledProviders: string[];
}): Promise<HubProviders> {
  const result: HubProviders = { breakfast: null, food: null };

  // ── Annuaire géolocalisé (identique au payload : sans coordonnées,
  //    les prestataires annuaire ne sont pas proposés au hub) ──
  if (property.latitude != null && property.longitude != null) {
    const RADIUS_MAX_KM = 200;
    const geoProviders = await db.provider.findMany({
      where: {
        isActive: true,
        audience: 'GUEST_EXPERIENCE',
        latitude: {
          gte: property.latitude - RADIUS_MAX_KM / 111,
          lte: property.latitude + RADIUS_MAX_KM / 111,
        },
        longitude: {
          gte: property.longitude - RADIUS_MAX_KM / 74,
          lte: property.longitude + RADIUS_MAX_KM / 74,
        },
      },
      take: 200,
    });
    const inRadius = geoProviders
      .filter(
        (p) =>
          p.latitude != null &&
          p.longitude != null &&
          haversineKm(property.latitude!, property.longitude!, p.latitude, p.longitude) <=
            p.serviceRadiusKm,
      )
      .filter((p) => !property.disabledProviders.includes(p.id));
    result.breakfast = inRadius.find((p) => p.category === 'petit_dejeuner')?.businessName ?? null;
    result.food = inRadius.find((p) => p.category === 'chef')?.businessName ?? null;
  }

  // ── Prestataires PERSO de l'hôte (rattachés au bien, sans géoloc) ──
  try {
    const hostProviders = await db.hostProvider.findMany({
      where: { propertyId: property.id, isActive: true, audience: 'GUEST_EXPERIENCE' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { name: true, category: true },
    });
    if (!result.breakfast) {
      const match = hostProviders.find((hp) =>
        hostProviderMatches(hp.category, hp.name, BREAKFAST_KEYWORDS),
      );
      if (match) result.breakfast = match.name;
    }
    if (!result.food) {
      const match = hostProviders.find((hp) => hostProviderMatches(hp.category, hp.name, FOOD_KEYWORDS));
      if (match) result.food = match.name;
    }
  } catch {
    // Dégradation gracieuse : les prestataires perso sont optionnels.
  }

  return result;
}

/** Jour du séjour (1 = arrivée) depuis la réservation en cours —
 *  même définition du « séjour courant » que le payload hub
 *  (réservation couvrant aujourd'hui, la plus récente gagne). */
async function computeStayDay(propertyId: string, now: Date): Promise<number | null> {
  try {
    const stays = await db.booking.findMany({
      where: {
        propertyId,
        status: { notIn: ['CANCELLED'] },
        checkIn: { lte: now },
        checkOut: { gte: now },
      },
      orderBy: { checkIn: 'desc' },
      take: 3,
      select: { checkIn: true },
    });
    if (stays.length === 0) return null;
    const checkIn = stays[0].checkIn;
    const day = Math.floor((now.getTime() - checkIn.getTime()) / 86_400_000) + 1;
    return day >= 1 ? day : 1;
  } catch {
    return null;
  }
}

// ── Le moteur ────────────────────────────────────────────────────

/**
 * Retourne les recommandations ACTIVES pour ce bien, triées par
 * priorité décroissante (la plus haute d'abord). Ne lève jamais :
 * en cas d'erreur de données, la règle concernée est simplement
 * sautée (le hub reste fonctionnel sans recommandations).
 *
 * @param propertyId  Le bien (source de vérité : prestataires + minibar).
 * @param guestContext Contexte invité (heure, jour de séjour, météo).
 */
export async function getActiveRecommendations(
  propertyId: string,
  guestContext: GuestContext = {},
): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];
  const push = (rec: Recommendation) => {
    if (!recommendations.some((r) => r.type === rec.type)) recommendations.push(rec);
  };

  try {
    // ── 1. Le bien : coordonnées, minibar, prestataires désactivés ──
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        premiumFeatures: true,
        disabledProviders: true,
      },
    });
    if (!property) return [];

    // ── 2. Contexte : heure locale + météo (cache) + jour du séjour ──
    let weather: HubWeatherPayload | null = null;
    if (guestContext.weather && (guestContext.weather.tempC != null || guestContext.weather.code != null)) {
      weather = {
        current: {
          temp: Math.round(guestContext.weather.tempC ?? 0),
          code: guestContext.weather.code ?? 0,
          wind: 0,
        },
        daily: [],
        timezone: 'UTC',
        fetchedAt: new Date().toISOString(),
      };
    } else if (property.latitude != null && property.longitude != null) {
      weather = await getCachedWeather(property.latitude, property.longitude);
    }
    const timezone = weather?.timezone ?? null;
    const currentHour =
      typeof guestContext.currentHour === 'number'
        ? guestContext.currentHour
        : localHourInTimezone(timezone);
    const tempC = weather?.current.temp ?? null;
    const weatherCode = weather?.current.code ?? null;
    const rainy = isRainyWeatherCode(weatherCode);

    const stayDay =
      typeof guestContext.stayDay === 'number'
        ? guestContext.stayDay
        : await computeStayDay(propertyId, new Date());

    // ── 3. Catalogue RÉEL : prestataires + minibar ──
    const providers = await findHubProviders({
      id: property.id,
      latitude: property.latitude ?? null,
      longitude: property.longitude ?? null,
      disabledProviders: Array.isArray(property.disabledProviders)
        ? (property.disabledProviders as unknown[]).filter(
            (x): x is string => typeof x === 'string',
          )
        : [],
    });
    const minibar = parseMinibar(property.premiumFeatures);
    const minibarReady = minibar.enabled && minibar.items.length > 0;

    const anchorUrl = (anchor: string) =>
      guestContext.slug ? `/hub/${guestContext.slug}#${anchor}` : `#${anchor}`;

    // ══ RÈGLE 1 — PETIT-DÉJEUNER (07h00-09h00, prestataire actif) ══
    if (
      providers.breakfast &&
      currentHour >= BREAKFAST_WINDOW.start &&
      currentHour < BREAKFAST_WINDOW.end
    ) {
      push({
        type: 'BREAKFAST',
        title: '🥐 Petit-déjeuner livré',
        message: `Il est l'heure ! ${providers.breakfast} livre des produits frais avant 08h30.`,
        actionUrl: anchorUrl('hub-card-minibar'),
        anchor: 'hub-card-minibar',
        priority: 90,
        providerName: providers.breakfast,
      });
    }

    // ══ RÈGLE 2 — MINIBAR / VERRE (soirée OU forte chaleur) ══
    const eveningOrHot =
      (currentHour >= MINIBAR_WINDOW.start && currentHour < MINIBAR_WINDOW.end) ||
      (tempC != null && tempC > HOT_TEMPERATURE_C);
    if (minibarReady && eveningOrHot) {
      push({
        type: 'MINIBAR',
        title: '🍷 Détente & Rafraîchissement',
        message:
          tempC != null && tempC > HOT_TEMPERATURE_C && !(currentHour >= MINIBAR_WINDOW.start && currentHour < MINIBAR_WINDOW.end)
            ? `${tempC} °C dehors ? Une petite soif ? Votre minibar est garni. Commandez en 1 clic.`
            : 'Une petite soif ? Votre minibar est garni. Commandez en 1 clic.',
        actionUrl: anchorUrl('hub-card-minibar'),
        anchor: 'hub-card-minibar',
        priority: 70,
      });
    }

    // ══ RÈGLE 3 — DÉJEUNER / DÎNER (créneaux repas × météo × chef) ══
    const minutes = currentHour * 60;
    const inFoodWindow = FOOD_WINDOWS.some((w) => minutes >= w.start && minutes <= w.end);
    if (providers.food && inFoodWindow) {
      if (rainy) {
        push({
          type: 'FOOD',
          title: '🌧️ Chef à domicile',
          message:
            'Il pleut aujourd\u2019hui ? Pas besoin de sortir : un chef vient cuisiner chez vous.',
          actionUrl: anchorUrl('hub-card-minibar'),
          anchor: 'hub-card-minibar',
          priority: 65,
          providerName: providers.food,
        });
      } else {
        push({
          type: 'FOOD',
          title: '☀️ Déjeuner au soleil',
          message: `Grand soleil aujourd'hui ! ${providers.food} vous prépare un repas à savourer en terrasse ou au bord de la piscine.`,
          actionUrl: anchorUrl('hub-card-minibar'),
          anchor: 'hub-card-minibar',
          priority: 65,
          providerName: providers.food,
        });
      }
    }

    // ══ RÈGLE 4 — SORTIES & ÉVÉNEMENTS (milieu de séjour, jour 2+) ══
    if (stayDay != null && stayDay >= 2) {
      push({
        type: 'ACTIVITY',
        title: '🎉 Envie de sortir ?',
        message:
          "Découvrez les coups de cœur de l'hôte et les événements de ce week-end à proximité.",
        actionUrl: anchorUrl('hub-card-spots'),
        anchor: 'hub-card-spots',
        priority: 60,
      });
    }

    // ── 4. La plus prioritaire d'abord ──
    return recommendations.sort((a, b) => b.priority - a.priority);
  } catch (error) {
    // Jamais bloquant : le hub fonctionne sans recommandations.
    console.error('[recommendation-engine] getActiveRecommendations error:', error);
    return [];
  }
}
