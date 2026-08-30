import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: Activity logs for a home
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const homeId = searchParams.get('homeId');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    if (!homeId) {
      return NextResponse.json(
        { error: 'Le paramètre homeId est requis' },
        { status: 400 }
      );
    }

    const logs = await db.activityLog.findMany({
      where: { homeId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
        qrCode: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('[activity GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
