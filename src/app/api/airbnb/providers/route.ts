// =============================================================
// GET /api/airbnb/providers?propertyId=?&audience=?
// Annuaire de prestataires géolocalisé pour le Dashboard B2B.
//
// Logique de filtrage (SQLite, sans PostGIS) :
//  1. Requête Prisma : prestataires actifs dont `audience` correspond
//     ET situés dans une bounding box autour du bien (pré-filtre SQL
//     sur latitude/longitude, rayon max 100 km).
//  2. Filtrage précis en JS : distance haversine(bien ↔ prestataire)
//     ≤ serviceRadiusKm du prestataire (son rayon d'intervention).
//  3. Tri par distance croissante.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties, canAccessProperty } from '@/lib/b2b-server';
import {
  haversineKm,
  boundingBoxDegrees,
  providerCategoryMeta,
  PROVIDER_AUDIENCES,
  type ProviderAudience,
} from '@/lib/b2b';

/** Rayon (km) de la bounding-box SQL — le filtre précis se fait en JS. */
const BOUNDING_BOX_KM = 100;

interface ProviderDTO {
  id: string;
  audience: 'OWNER_SERVICE' | 'GUEST_EXPERIENCE';
  businessName: string;
  category: string;
  categoryEmoji: string;
  categoryLabel: string;
  subcategory: string | null;
  description: string | null;
  location: string | null;
  ratingAvg: number;
  totalReviews: number;
  distanceKm: number;
  serviceRadiusKm: number;
  hourlyRate: number | null;
  isVerified: boolean;
  isUrgentAvailable: boolean;
  responseTimeMinutes: number | null;
  totalJobsCompleted: number;
  contactName: string | null;
  contactEmail: string | null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const properties = await resolveUserProperties(userId);
    const { searchParams } = new URL(req.url);
    const requestedId = searchParams.get('propertyId');
    const property = requestedId
      ? properties.find((p) => p.id === requestedId) ?? properties[0]
      : properties[0];

    if (!property) {
      return NextResponse.json({
        properties: [],
        property: null,
        hasGeoloc: false,
        ownerServices: [],
        guestExperiences: [],
      });
    }
    if (!(await canAccessProperty(userId, property.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const hasGeoloc = property.latitude != null && property.longitude != null;
    const audienceParam = searchParams.get('audience') as ProviderAudience | null;
    const audiences: ProviderAudience[] =
      audienceParam && PROVIDER_AUDIENCES.includes(audienceParam)
        ? [audienceParam]
        : [...PROVIDER_AUDIENCES];

    if (!hasGeoloc) {
      return NextResponse.json({
        properties,
        property: { ...property, hasGeoloc: false },
        hasGeoloc: false,
        ownerServices: [],
        guestExperiences: [],
      });
    }

    const lat = property.latitude as number;
    const lng = property.longitude as number;
    const { dLat, dLng } = boundingBoxDegrees(lat, BOUNDING_BOX_KM);

    // ----- Requête Prisma : audience + bounding box (pré-filtre SQL) -----
    const providers = await db.provider.findMany({
      where: {
        isActive: true,
        audience: { in: audiences },
        latitude: { gte: lat - dLat, lte: lat + dLat },
        longitude: { gte: lng - dLng, lte: lng + dLng },
      },
      include: {
        user: { select: { fullName: true, email: true } },
      },
    });

    // ----- Filtre précis : distance ≤ rayon d'intervention -----
    const matched = providers
      .map((p): ProviderDTO => {
        const distanceKm =
          p.latitude != null && p.longitude != null
            ? haversineKm(lat, lng, p.latitude, p.longitude)
            : Infinity;
        const cat = providerCategoryMeta(p.category);
        return {
          id: p.id,
          audience: p.audience === 'GUEST_EXPERIENCE' ? 'GUEST_EXPERIENCE' : 'OWNER_SERVICE',
          businessName: p.businessName,
          category: p.category,
          categoryEmoji: cat.emoji,
          categoryLabel: cat.label,
          subcategory: p.subcategory,
          description: p.description,
          location: p.location,
          ratingAvg: p.ratingAvg,
          totalReviews: p.totalReviews,
          distanceKm: Math.round(distanceKm * 100) / 100,
          serviceRadiusKm: p.serviceRadiusKm,
          hourlyRate: p.hourlyRate,
          isVerified: p.isVerified,
          isUrgentAvailable: p.isUrgentAvailable,
          responseTimeMinutes: p.responseTimeMinutes,
          totalJobsCompleted: p.totalJobsCompleted,
          contactName: p.user?.fullName ?? null,
          contactEmail: p.user?.email ?? null,
        };
      })
      .filter((p) => p.distanceKm <= p.serviceRadiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const ownerServices = matched.filter((p) => p.audience === 'OWNER_SERVICE');
    const guestExperiences = matched.filter((p) => p.audience === 'GUEST_EXPERIENCE');

    return NextResponse.json({
      properties,
      property: { ...property, hasGeoloc: true },
      hasGeoloc: true,
      ownerServices,
      guestExperiences,
    });
  } catch (error) {
    console.error('[airbnb/providers] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
