import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'Code requis' }, { status: 400 });
  }

  const physicalQr = await db.physicalQrCode.findUnique({
    where: { activationCode: code },
    select: { dynamicQrCodeId: true },
  });

  if (!physicalQr?.dynamicQrCodeId) {
    return NextResponse.json({ slug: null });
  }

  const qrCode = await db.qrCode.findUnique({
    where: { id: physicalQr.dynamicQrCodeId },
    select: { publicSlug: true, isActive: true },
  });

  if (!qrCode?.isActive) {
    return NextResponse.json({ slug: null });
  }

  return NextResponse.json({ slug: qrCode.publicSlug });
}
