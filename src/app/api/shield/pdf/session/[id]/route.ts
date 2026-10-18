// =============================================================
// /api/shield/pdf/session/[id] — ROOMSCAN BOUCLIER AUTOMATISÉ
// GET : dossier complet en UN SEUL PDF :
//   · PAGE 1 — bibliothèque de référence (onboarding, 4 appareils,
//     QR + hash, date de référence) ;
//   · PAGE 2 — CHECK-IN « ATTESTATION D'ÉTAT DES LIEUX D'ENTRÉE »
//     (6 photos ménage + vidéo + certificat hash SHA-256) ou
//     CHECK-OUT « RAPPORT DE SORTIE — COMPARATIF ENTRÉE/SORTIE »
//     (photo entrée à gauche, flèche rouge si écart, sortie à droite).
// Auth : abonnement owner.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveShieldAccess } from '@/lib/shield-access';
import { renderShieldSessionPdf, type ShieldSessionPdfData } from '@/lib/shield-pdf';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await resolveShieldAccess();
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error, message: access.message },
        { status: access.status },
      );
    }
    const { id } = await params;

    const session = await db.shieldSession.findFirst({
      where: { id, property: { subscriptionId: access.subscriptionId } },
      include: {
        property: { include: { devices: { orderBy: { sortOrder: 'asc' } } } },
        video: true,
        shots: { orderBy: { capturedAt: 'asc' } },
      },
    });
    if (!session) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Check-in lié (pour le comparatif SORTIE).
    let linked: ShieldSessionPdfData['linked'] = null;
    if (session.linkedSessionId) {
      const linkedSession = await db.shieldSession.findFirst({
        where: { id: session.linkedSessionId, propertyId: session.propertyId },
        include: { shots: { orderBy: { capturedAt: 'asc' } } },
      });
      if (linkedSession) {
        linked = {
          sessionRef: linkedSession.sessionRef,
          completedAt: linkedSession.completedAt,
          shots: linkedSession.shots.map((s) => ({
            zoneName: s.zoneName,
            photo: s.photo,
            status: s.status,
            comment: s.comment,
            capturedAt: s.capturedAt,
          })),
        };
      }
    }

    const data: ShieldSessionPdfData = {
      property: {
        propertyName: session.property.propertyName,
        propertyAddress: session.property.propertyAddress,
        city: session.property.city,
        ownerName: session.property.ownerName,
        onboardingRef: session.property.onboardingRef,
        onboardedAt: session.property.onboardedAt,
      },
      devices: session.property.devices.map((d) => ({
        name: d.name,
        kind: d.kind,
        referenceCode: d.referenceCode,
        referenceHash: d.referenceHash,
        referencePhoto: d.referencePhoto,
        referenceDate: d.referenceDate,
      })),
      session: {
        type: session.type as 'CHECK_IN' | 'CHECK_OUT',
        agentName: session.agentName,
        guestName: session.guestName,
        sessionRef: session.sessionRef,
        completedAt: session.completedAt,
      },
      video: session.video
        ? {
            publicToken: session.video.publicToken,
            sha256: session.video.sha256,
            durationSec: session.video.durationSec,
            sizeBytes: session.video.sizeBytes,
            createdAt: session.video.createdAt,
          }
        : null,
      shots: session.shots.map((s) => ({
        zoneName: s.zoneName,
        photo: s.photo,
        status: s.status,
        comment: s.comment,
        capturedAt: s.capturedAt,
      })),
      linked,
    };

    const pdf = await renderShieldSessionPdf(data);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${session.sessionRef}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[shield/pdf/session/:id] GET failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
