// =============================================================
// GET /api/public/hub/[slug]/recommendations — v4.112
// MOTEUR DE RECOMMANDATION CONTEXTUEL (IA HUB INVITÉ)
//
// 1. Résout le bien depuis le slug (plaque V1 ou hub du bien).
// 2. Construit le contexte invité : heure LOCALE du logement
//    (fuseau Open-Meteo), jour du séjour (réservation en cours),
//    météo (cache mémoire partagé lib/hub-weather.ts).
// 3. Appelle getActiveRecommendations() — les 4 règles contextuelles
//    (petit-déjeuner, minibar, repas × météo, sorties) vérifiées
//    contre les prestataires et le minibar RÉELLEMENT configurés.
// 4. ANTI-SPAM : filtre les types déjà affichés aujourd'hui (jour
//    local du logement) via NotificationLog — une recommandation ne
//    se montre au plus qu'UNE fois par jour et par bien.
//
// 🔒 requireHubAccess (hub verrouillé → session invité obligatoire,
//     hubs ouverts : accès libre, rétrocompatibilité).
// Jamais 5xx pour une erreur de règle : le hub fonctionne sans.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clientIp } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import { requireHubAccess } from '@/lib/hub-access';
import { parseMinibar } from '@/lib/concierge';
import {
  getActiveRecommendations,
  RECOMMENDATION_LOG_TYPE,
  type RecommendationType,
} from '@/lib/recommendation-engine';
import {
  getCachedWeather,
  localHourInTimezone,
  localDayInTimezone,
  localDayBoundsWide,
} from '@/lib/hub-weather';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    if (!slug || slug.length > 120) {
      return NextResponse.json({ ok: false, error: 'Slug invalide' }, { status: 400 });
    }
    // Polling client ~1 req/min/onglet — garde anti-abus souple.
    if (!(await rateLimit(`hubrecs:${slug}:${clientIp(req.headers)}`, 20))) {
      return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429 });
    }
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
    }
    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ ok: true, recommendations: [], context: null });
    }
    const propertyId = resolved.propertyId;

    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { latitude: true, longitude: true, premiumFeatures: true },
    });
    if (!property) {
      return NextResponse.json({ ok: true, recommendations: [], context: null });
    }

    // ── Contexte : météo (cache 30 min) → fuseau → heure locale ──
    const weather =
      property.latitude != null && property.longitude != null
        ? await getCachedWeather(property.latitude, property.longitude)
        : null;
    const timezone = weather?.timezone ?? null;
    const currentHour = localHourInTimezone(timezone);
    const localDay = localDayInTimezone(timezone);

    const minibar = parseMinibar(property.premiumFeatures);

    // ── Moteur (jamais throw — erreurs internes → []) ──
    const recs = await getActiveRecommendations(propertyId, {
      currentHour,
      slug,
      weather: weather
        ? { tempC: weather.current.temp, code: weather.current.code }
        : null,
    });

    // ── ANTI-SPAM NotificationLog : types déjà affichés aujourd'hui ──
    // (jour local du logement, bornes élargies ±14 h — voir lib).
    const bounds = localDayBoundsWide(localDay);
    const shownTypes = new Set<string>();
    try {
      const logs = await db.notificationLog.findMany({
        where: {
          propertyId,
          displayedAt: { gte: bounds.start, lt: bounds.end },
        },
        select: { notificationType: true },
        take: 100,
      });
      for (const l of logs) shownTypes.add(l.notificationType);
    } catch {
      // Log indisponible → pas de filtrage serveur (le garde local reste).
    }

    const recommendations = recs.filter(
      (r) => !shownTypes.has(RECOMMENDATION_LOG_TYPE[r.type as RecommendationType]),
    );

    return NextResponse.json({
      ok: true,
      recommendations,
      // Contexte renvoyé pour le debug/tests de scénarios (PHASE 3).
      context: {
        hour: currentHour,
        localDay,
        timezone: timezone ?? 'server',
        weather: weather ? { temp: weather.current.temp, code: weather.current.code } : null,
        minibarEnabled: minibar.enabled,
        minibarItems: minibar.items.length,
      },
    });
  } catch (error) {
    console.error('[public/hub recommendations GET] Error:', error);
    // Jamais bloquant : le hub fonctionne sans recommandations.
    return NextResponse.json({ ok: true, recommendations: [], context: null });
  }
}
