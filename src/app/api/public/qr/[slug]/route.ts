import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // SÉCURITÉ : seuls les QR publics ET actifs sont servis — un module
    // privé ne doit jamais exposer son contenu (codes de porte, etc.).
    const qrCode = await db.qrCode.findFirst({
      where: { publicSlug: slug, isActive: true, isPrivate: false },
      include: { content: true, property: true },
    });

  if (!qrCode || !qrCode.isActive) {
    return NextResponse.json(
      { error: 'QR code not found or inactive' },
      { status: 404 }
    );
  }

  let parsedContent;
  try {
    parsedContent = JSON.parse(qrCode.content?.contentJson ?? '{}');
  } catch {
    parsedContent = {};
  }

  // Find hub slug for this QR code's home
  let hubSlug: string | null = null;
  if (qrCode.propertyId) {
    const plaque = await db.physicalQrCode.findFirst({
      where: { propertyId: qrCode.propertyId, isClaimed: true, hubSlug: { not: null } },
      select: { hubSlug: true },
    });
    hubSlug = plaque?.hubSlug || null;
  }

  // Get scan count
  const scanCount = await db.scanLog.count({
    where: { qrCodeId: qrCode.id },
  });

  // Fire-and-forget: log the scan (don't await, don't block response)
  const visitorIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const userAgent = request.headers.get('user-agent') || null;
  const acceptLanguage = request.headers.get('accept-language') || 'fr';
  const locale = acceptLanguage.split(',')[0]?.split('-')[0]?.toLowerCase() || 'fr';
  const referrer = request.headers.get('referer') || null;

  // Fire and forget
  db.scanLog.create({
    data: {
      qrCodeId: qrCode.id,
      propertyId: qrCode.propertyId,
      visitorIp,
      userAgent,
      locale,
      referrer,
    },
  }).catch(() => {
    // Silently ignore scan log failures
  });

  return NextResponse.json({
    qrCode: {
      id: qrCode.id,
      name: qrCode.name,
      type: qrCode.type,
      publicSlug: qrCode.publicSlug,
      isActive: qrCode.isActive,
      homeName: qrCode.property?.name || null,
      propertyId: qrCode.propertyId,
    },
    hubSlug,
    content: parsedContent,
    scanCount,
  });
  } catch (error) {
    console.error('[GET /api/public/qr/[slug]] Error:', error);
    return NextResponse.json(
      { error: 'QR code introuvable' },
      { status: 404 }
    );
  }
}
