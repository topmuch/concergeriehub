import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { error: 'Le paramètre code est requis' },
        { status: 400 }
      );
    }

    const physicalQr = await db.physicalQrCode.findUnique({
      where: { activationCode: code },
      select: {
        id: true,
        activationCode: true,
        status: true,
        designConfig: true,
      },
    });

    if (!physicalQr) {
      return NextResponse.json({
        valid: false,
        status: 'not_found' as const,
      });
    }

    const valid = physicalQr.status === 'inactive';

    return NextResponse.json({
      valid,
      status: physicalQr.status as 'inactive' | 'active' | 'lost' | 'cancelled' | 'not_found',
      physicalQr,
    });
  } catch (error) {
    console.error('[check-code] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
