// =============================================================
// /api/shield/pdf/onboarding/[id] — ROOMSCAN BOUCLIER AUTOMATISÉ
// GET : certificat d'ONBOARDING (Page 1 du template) — photo
// initiale, validation des équipements, bibliothèque de référence
// réutilisable (QR + hash par appareil). Auth : abonnement owner.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveShieldAccess } from '@/lib/shield-access';
import { renderShieldOnboardingPdf, type ShieldOnboardingPdfData } from '@/lib/shield-pdf';

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

    const property = await db.shieldProperty.findFirst({
      where: { id, subscriptionId: access.subscriptionId },
      include: {
        devices: { orderBy: { sortOrder: 'asc' } },
        zones: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!property) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const data: ShieldOnboardingPdfData = {
      property: {
        propertyName: property.propertyName,
        propertyAddress: property.propertyAddress,
        city: property.city,
        ownerName: property.ownerName,
        onboardingRef: property.onboardingRef,
        onboardedAt: property.onboardedAt,
      },
      zones: property.zones.map((z) => ({ name: z.name, referencePhoto: z.referencePhoto })),
      devices: property.devices.map((d) => ({
        name: d.name,
        kind: d.kind,
        referenceCode: d.referenceCode,
        referenceHash: d.referenceHash,
        referencePhoto: d.referencePhoto,
        referenceDate: d.referenceDate,
      })),
    };

    const pdf = await renderShieldOnboardingPdf(data);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${property.onboardingRef}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[shield/pdf/onboarding/:id] GET failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
