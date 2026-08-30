import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const qrCode = await db.qrCode.findUnique({
    where: { publicSlug: slug, isActive: true },
    include: { content: true, home: true },
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
  if (qrCode.homeId) {
    const plaque = await db.physicalQrCode.findFirst({
      where: { homeId: qrCode.homeId, isClaimed: true, hubSlug: { not: null } },
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
      homeId: qrCode.homeId,
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
      homeName: qrCode.home?.name || null,
      homeId: qrCode.homeId,
    },
    hubSlug,
    content: parsedContent,
    scanCount,
  });
}
