// =============================================================
// /api/airbnb/places/details — RÉSOLUTION DES COORDONNÉES (v4.43)
//
// Avec Google Places (New), l'autocomplétion ne renvoie que des
// placeId : à la SÉLECTION d'une adresse, le client appelle cette
// route (Place Details, FieldMask `location,formattedAddress`) pour
// récupérer la latitude/longitude EXACTES à stocker en base avec
// l'adresse textuelle complète.
//
// GET ?placeId=… → { label, lat, lng }
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

const FETCH_TIMEOUT_MS = 4_000;

function googleApiKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    null
  );
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (!(await rateLimit(`places-details:${userId}`, 30))) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const key = googleApiKey();
    if (!key) {
      return NextResponse.json(
        { error: 'Fournisseur Google non configuré sur ce serveur.' },
        { status: 501 },
      );
    }

    const { searchParams } = new URL(req.url);
    const placeId = (searchParams.get('placeId') ?? '').trim();
    if (!placeId || placeId.length > 512) {
      return NextResponse.json({ error: 'placeId invalide.' }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=fr`,
        {
          headers: {
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'location,formattedAddress',
          },
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Adresse introuvable auprès du fournisseur.' },
        { status: 404 },
      );
    }
    const json = (await res.json().catch(() => null)) as {
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    } | null;
    const lat = json?.location?.latitude;
    const lng = json?.location?.longitude;
    const label = json?.formattedAddress?.trim();
    if (typeof lat !== 'number' || typeof lng !== 'number' || !label) {
      return NextResponse.json(
        { error: 'Coordonnées indisponibles pour cette adresse.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ label, lat, lng });
  } catch (error) {
    console.error('[airbnb/places/details GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
