// =============================================================
// GET /api/public/hub/[slug]/weather — WIDGET MÉTÉO (v4.49)
// -------------------------------------------------------------
// Demande client : « mettre un widget météo » sur le hub invité.
//
// → Météo ACTUELLE + 3 jours à venir du logement, affichée en tête
//   du hub invité (carte « Météo sur place »).
//
// v4.112 — la logique Open-Meteo + le cache mémoire sont EXTRAITS
// dans lib/hub-weather.ts pour être PARTAGÉS avec le moteur de
// recommandation contextuel (un seul appel API / 30 min / bien,
// quelle que soit la source : widget ou recommandations).
//
// Source : Open-Meteo (https://open-meteo.com) — GRATUIT, SANS CLÉ,
// usage non commercial autorisé. Zéro coût, zéro inscription.
// Sécurité : route publique (données non sensibles), coordonnées
// lues depuis le bien (Property.latitude/longitude) — jamais de
// paramètre lat/lng arbitraire depuis le client (pas d'open proxy).
// =============================================================
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import { getCachedWeather } from '@/lib/hub-weather';

export const dynamic = 'force-dynamic';

/** Coordonnées du hub de démonstration (Paris, cohérentes avec le payload démo). */
const DEMO_COORDS = { lat: 48.8686, lng: 2.3366 };
const DEMO_SLUG = 'demo-hub';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!slug || slug.length > 120) {
      return NextResponse.json({ ok: false, error: 'Slug invalide' }, { status: 400 });
    }

    // ── Coordonnées du bien (ou démo) ──
    let lat: number | null = null;
    let lng: number | null = null;
    if (slug === DEMO_SLUG) {
      lat = DEMO_COORDS.lat;
      lng = DEMO_COORDS.lng;
    } else {
      const resolved = await resolveHubPropertyId(slug);
      if (!resolved.ok) {
        return NextResponse.json(
          { ok: false, error: resolved.message ?? 'Hub introuvable' },
          { status: resolved.status || 404 },
        );
      }
      const property = await db.property.findUnique({
        where: { id: resolved.propertyId },
        select: { latitude: true, longitude: true },
      });
      lat = property?.latitude ?? null;
      lng = property?.longitude ?? null;
    }
    if (lat == null || lng == null) {
      return NextResponse.json(
        { ok: false, error: 'Coordonnées du logement non renseignées' },
        { status: 404 },
      );
    }

    // ── Open-Meteo via le cache partagé (TTL 30 min, timeout 6 s) ──
    const weather = await getCachedWeather(lat, lng);
    if (!weather) {
      return NextResponse.json({ ok: false, error: 'Météo indisponible' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, ...weather });
  } catch (error) {
    console.error('[GET /api/public/hub/[slug]/weather] Error:', error);
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
