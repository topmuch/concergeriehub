import { NextResponse } from 'next/server';
import { buildHubInspectionPdfBuffer, hubInspectionPdfFilename } from '@/lib/hub-inspection-pdf';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-monitor';
import { parseBranding } from '@/lib/branding';
import {
  renderCheckOutInspectionPdf,
  renderCheckInProofPdf,
} from '@/lib/inspection-pdf';

// =============================================================
// v5.0 « ÉTAT DES LIEUX » — PDF PUBLIC À LA DEMANDE (sans auth)
// GET /api/public/inspection/[token]/pdf
//
// Résout le token public :
//   1. CheckOutInspection → « État des lieux de sortie » (complet :
//      pièces, photos, inventaire, signature) ;
//   2. MinibarCheck → « Preuve d'inventaire d'arrivée » (simplifié).
// Réponse : application/pdf, Content-Disposition inline (aperçu
// navigateur — « Télécharger » reste disponible côté page publique).
// 404 si token inconnu. Le PDF est régénéré à chaque appel (toujours
// à jour, aucun stockage de fichier).
// v4.82 — le document embarque l'IDENTITÉ DU BIEN (logo white-label,
// couleur de marque, nom commercial) et les COORDONNÉES DE L'HÔTE
// (nom, email, téléphone — Property.owner + Profile).
// =============================================================

export const dynamic = 'force-dynamic';

/** v4.82/v5.1 — select commun propriété : type, branding + hôte (owner + téléphone). */
const PROPERTY_PDF_SELECT = {
  select: {
    name: true,
    address: true,
    propertyType: true,
    branding: true,
    owner: {
      select: {
        fullName: true,
        email: true,
        profile: { select: { phone: true } },
      },
    },
  },
} as const;

/** v4.82/v5.1 — ligne Prisma propriété → données enrichies du PDF. */
function pdfProperty(row: {
  name: string;
  address: string | null;
  propertyType: string;
  branding: unknown;
  owner: { fullName: string | null; email: string; profile: { phone: string | null } | null } | null;
}) {
  return {
    name: row.name,
    address: row.address,
    propertyType: row.propertyType,
    branding: parseBranding(row.branding),
    host: {
      name: row.owner?.fullName ?? null,
      email: row.owner?.email ?? null,
      phone: row.owner?.profile?.phone ?? null,
    },
  };
}

function safeFileName(base: string): string {
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const cleanToken = token.trim().slice(0, 80);
    if (!cleanToken) {
      return NextResponse.json({ error: 'Jeton manquant.' }, { status: 400 });
    }

    // ── 1. État des lieux de SORTIE ──
    const inspection = await db.checkOutInspection.findUnique({
      where: { publicToken: cleanToken },
      select: {
        id: true,
        publicToken: true,
        guestName: true,
        guestEmail: true,
        ipAddress: true,
        signedAt: true,
        type: true,
        selfAssessment: true,
        issues: true,
        damages: true,
        roomsData: true,
        inventoryCheck: true,
        minibarData: true,
        damagePhotos: true,
        guestSignature: true,
        property: PROPERTY_PDF_SELECT,
        booking: { select: { checkIn: true, checkOut: true } },
      },
    });

    if (inspection) {
      // v4.165 — modèle ROUGE « ATTESTATION D'ÉTAT DES LIEUX » (le
      // modèle actuel du site, identique aux emails) — remplace
      // l'ancien rendu bleu « document de preuve horodaté ».
      const buffer = await buildHubInspectionPdfBuffer(inspection.publicToken);
      if (buffer) {
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${hubInspectionPdfFilename(inspection.type, inspection.guestName, inspection.id)}"`,
            'Cache-Control': 'private, no-store',
          },
        });
      }
      // Rendu rouge indisponible → repli sur l'ancien rendu (jamais 404).
      const legacy = await renderCheckOutInspectionPdf({
        id: inspection.id,
        publicToken: inspection.publicToken,
        guestName: inspection.guestName,
        guestEmail: inspection.guestEmail,
        ipAddress: inspection.ipAddress,
        signedAt: inspection.signedAt,
        type: inspection.type === 'checkin' ? 'checkin' : 'checkout',
        selfAssessment: inspection.selfAssessment,
        issues: inspection.issues,
        damages: inspection.damages,
        roomsData: inspection.roomsData,
        inventoryCheck: inspection.inventoryCheck,
        minibarData: inspection.minibarData,
        damagePhotos: inspection.damagePhotos,
        guestSignature: inspection.guestSignature,
        booking: inspection.booking
          ? { checkIn: inspection.booking.checkIn, checkOut: inspection.booking.checkOut }
          : null,
        property: pdfProperty(inspection.property),
      });
      return new NextResponse(new Uint8Array(legacy), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="etat-des-lieux-${inspection.type === 'checkin' ? 'entree' : 'sortie'}-${safeFileName(inspection.guestName)}-${inspection.id.slice(-6)}.pdf"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    // ── 2. Preuve d'ARRIVÉE (inventaire validé) ──
    const check = await db.minibarCheck.findUnique({
      where: { publicToken: cleanToken },
      select: {
        id: true,
        publicToken: true,
        guestName: true,
        checkedAt: true,
        property: PROPERTY_PDF_SELECT,
        booking: { select: { checkIn: true, checkOut: true } },
      },
    });

    if (check) {
      const buffer = await renderCheckInProofPdf({
        id: check.id,
        publicToken: cleanToken,
        guestName: check.guestName,
        checkedAt: check.checkedAt,
        property: pdfProperty(check.property),
        booking: check.booking
          ? { checkIn: check.booking.checkIn, checkOut: check.booking.checkOut }
          : null,
      });
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="preuve-arrivee-${safeFileName(check.guestName ?? 'invite')}-${check.id.slice(-6)}.pdf"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    return NextResponse.json({ error: 'Preuve introuvable.' }, { status: 404 });
  } catch (error) {
    await captureError('public.inspection-pdf', error, undefined, _req);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
