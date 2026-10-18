import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/audit';
import { captureError } from '@/lib/error-monitor';
import {
  renderStandaloneInspectionPdf,
  type StandaloneInspectionPdfData,
} from '@/lib/inspection-standalone-pdf';
import { computeInspectionSha256 } from '@/lib/inspection-hash';

// =============================================================
// v4.97 MODULE STANDALONE « ÉTAT DES LIEUX » — PDF PUBLIC
// GET /api/inspection/pdf/[token]
//   → 200 application/pdf (inline) — document juridique signé
//   → 404 si le token est inconnu, 500 si le rendu échoue.
//
// Le PDF est généré À LA VOLÉE (aucun fichier sur disque) à partir
// des données en base : pièces, items, photos (dataURL), signature.
// Sécurité : rate limit 20/min par token+IP (génération coûteuse) ;
// token unique ; never-throw.
// =============================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    const { token } = await params;
    if (!token || typeof token !== 'string' || token.length < 6) {
      return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 404 });
    }

    // Génération coûteuse (pdfkit + QR) : 20/min par token+IP.
    const ip = clientIp(req.headers) ?? 'local';
    if (!(await rateLimit(`insppdf:${token}:${ip}`, 20))) {
      return NextResponse.json(
        { error: 'Trop de téléchargements. Merci de patienter une minute.' },
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
        linkedInspection: { select: { scheduledDate: true } },
      },
    });
    if (!inspection) {
      return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 404 });
    }

    const data: StandaloneInspectionPdfData = {
      inspection: {
        publicToken: inspection.publicToken,
        propertyName: inspection.propertyName,
        propertyAddress: inspection.propertyAddress,
        ownerName: inspection.ownerName,
        guestName: inspection.guestName,
        type: inspection.type,
        scheduledDate: inspection.scheduledDate,
        status: inspection.status,
        signedAt: inspection.signedAt,
        completedAt: inspection.completedAt,
        cleanlinessScore: inspection.cleanlinessScore,
        cleanlinessComment: inspection.cleanlinessComment,
        // Photo de propreté incluse (dataURL) — décodage tolérant côté PDF.
        cleanlinessPhotoUrl: inspection.cleanlinessPhotoUrl,
        guestSignature: inspection.guestSignature,
        linkedEntranceDate:
          inspection.type === 'SORTIE' ? inspection.linkedInspection?.scheduledDate ?? null : null,
        // Preuve & anti-fraude (v4.110). Empreinte : stockée à la
        // signature ; pour les documents signés avant v4.110 (sans
        // empreinte en base) elle est recalculée à la volée — le
        // contenu d'un document COMPLETED étant figé, elle est stable.
        city: inspection.city,
        ipAddress: inspection.ipAddress,
        gpsLocation: inspection.gpsLocation,
        sha256Hash:
          inspection.sha256Hash ??
          (inspection.status === 'COMPLETED'
            ? computeInspectionSha256({
                publicToken: inspection.publicToken,
                propertyName: inspection.propertyName,
                propertyAddress: inspection.propertyAddress,
                ownerName: inspection.ownerName,
                guestName: inspection.guestName,
                type: inspection.type,
                scheduledDate: inspection.scheduledDate,
                status: inspection.status,
                signedAt: inspection.signedAt,
                cleanlinessScore: inspection.cleanlinessScore,
                cleanlinessComment: inspection.cleanlinessComment,
                cleanlinessPhotoUrl: inspection.cleanlinessPhotoUrl,
                guestSignature: inspection.guestSignature,
                rooms: inspection.rooms.map((room) => ({
                  name: room.name,
                  globalState: room.globalState,
                  comment: room.comment,
                  items: room.items.map((item) => ({
                    name: item.name,
                    state: item.state,
                    comment: item.comment,
                    photoUrl: item.photoUrl,
                    photoOnUrl: item.photoOnUrl,
                    photoOffUrl: item.photoOffUrl,
                  })),
                })),
              })
            : null),
      },
      rooms: inspection.rooms.map((room) => ({
        name: room.name,
        globalState: room.globalState,
        comment: room.comment,
        items: room.items.map((item) => ({
          name: item.name,
          state: item.state,
          comment: item.comment,
          photoUrl: item.photoUrl,
          photoOnUrl: item.photoOnUrl,
          photoOffUrl: item.photoOffUrl,
        })),
      })),
    };

    const buffer = await renderStandaloneInspectionPdf(data);

    const token6 = inspection.publicToken.slice(-6).toUpperCase();
    const typeSlug = inspection.type === 'SORTIE' ? 'sortie' : 'entree';
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="etat-des-lieux-${typeSlug}-${token6}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    captureError('inspection.public_pdf', error);
    return NextResponse.json(
      { error: 'Impossible de générer le PDF pour le moment. Merci de réessayer.' },
      { status: 500 },
    );
  }
}
