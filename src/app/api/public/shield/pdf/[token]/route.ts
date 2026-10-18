// =============================================================
// /api/public/shield/pdf/[token] — CERTIFICAT BOUCLIER PUBLIC (v4.120)
// GET public (token 24 car. non devinable = publicToken de la vidéo
// walkthrough de la session) : sert le certificat PDF COMPLET de la
// session (PAGE 1 bibliothèque de référence + PAGE 2 certificat).
//
// Objectif : partage sans authentification du document généré —
// WhatsApp, email, lien copié depuis le dashboard hôte. Le token
// étant celui de la vidéo SHA-256 (présent dans le QR du PDF lui-
// même), une seule clé publique identifie le document + sa preuve.
// Toute session Shield est créée DÉJÀ complétée (6 photos + vidéo
// obligatoires) → pas de fuite de document partiel.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { renderShieldSessionPdf, type ShieldSessionPdfData } from '@/lib/shield-pdf';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token || token.length < 8) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    // 20 PDF/min/token — suffisant pour un partage WhatsApp/email.
    if (!(await rateLimit(`shield-pdf-public:${token}`, 20))) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    // Token = publicToken de la vidéo de la session (clé publique du
    // document — affichée dans son propre QR code).
    const video = await db.shieldVideo.findUnique({
      where: { publicToken: token },
      select: { sessionId: true },
    });
    if (!video) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const session = await db.shieldSession.findFirst({
      where: { id: video.sessionId },
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
        // Public mais IMMUABLE par token : le contenu d'un token ne
        // change jamais (session figée) — cache CDN autorisé 1 h.
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[public/shield/pdf/:token] GET failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
