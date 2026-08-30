import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: List rooms for a home
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const homeId = searchParams.get('homeId');

    if (!homeId) {
      return NextResponse.json(
        { error: 'Le paramètre homeId est requis' },
        { status: 400 }
      );
    }

    const rooms = await db.room.findMany({
      where: { homeId },
      include: {
        _count: {
          select: { qrCodes: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ rooms });
  } catch (error) {
    console.error('[rooms GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Create a room
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { homeId, name, icon } = body as {
      homeId: string;
      name: string;
      icon?: string;
    };

    if (!homeId || !name) {
      return NextResponse.json(
        { error: 'Les champs homeId et name sont requis' },
        { status: 400 }
      );
    }

    const room = await db.room.create({
      data: {
        homeId,
        name,
        icon: icon ?? null,
      },
    });

    return NextResponse.json(room);
  } catch (error) {
    console.error('[rooms POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
