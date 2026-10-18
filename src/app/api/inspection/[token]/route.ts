import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/audit';
import { captureError } from '@/lib/error-monitor';

// =============================================================
// v4.97 MODULE STANDALONE « ÉTAT DES LIEUX » — API PUBLIQUE GET
// GET /api/inspection/[token]
//   → 200 { inspection: { …, rooms: [{ …, itemCount, items }] } }
//   → 404 si le token est inconnu.
//
// Public (l'invité ouvre le lien roomscan.pro/i/<token>) — AUCUNE
// donnée sensible : jamais d'email/téléphone de l'invité, jamais
// de photos (dataURL volumineuses) — un simple compte est renvoyé.
// Sécurité : rate limit 30/min par token+IP ; never-throw.
// =============================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;
    if (!token || typeof token !== 'string' || token.length < 6) {
      return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 404 });
    }

    // Anti-énumération : 30 consultations/min par token+IP.
    const ip = clientIp(req.headers) ?? 'local';
    if (!(await rateLimit(`inspg:${token}:${ip}`, 30))) {
      return NextResponse.json(
        { error: 'Trop de consultations. Merci de patienter une minute.' },
        { status: 429 },
      );
    }

    const inspection = await db.inspection.findUnique({
      where: { publicToken: token },
      include: {
        rooms: {
          orderBy: { sortOrder: 'asc' },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!inspection) {
      return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 404 });
    }

    // Contrat public : JAMAIS d'email/téléphone, JAMAIS de dataURL
    // (photoUrl remplacée par un simple compteur), signature omise
    // (signedAt + status suffisent côté client).
    const payload = {
      propertyName: inspection.propertyName,
      propertyAddress: inspection.propertyAddress,
      ownerName: inspection.ownerName,
      guestName: inspection.guestName,
      type: inspection.type,
      scheduledDate: inspection.scheduledDate.toISOString(),
      status: inspection.status,
      signedAt: inspection.signedAt?.toISOString() ?? null,
      completedAt: inspection.completedAt?.toISOString() ?? null,
      cleanlinessScore: inspection.cleanlinessScore,
      cleanlinessComment: inspection.cleanlinessComment,
      rooms: inspection.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        globalState: room.globalState,
        comment: room.comment,
        itemCount: room.items.length,
        items: room.items.map((item) => ({
          id: item.id,
          name: item.name,
          state: item.state,
          comment: item.comment,
        })),
      })),
    };

    return NextResponse.json({ inspection: payload });
  } catch (error) {
    captureError('inspection.public_get', error);
    return NextResponse.json(
      { error: 'Erreur inattendue. Merci de réessayer.' },
      { status: 500 },
    );
  }
}
