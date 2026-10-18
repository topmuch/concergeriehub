import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Vérifie que l'utilisateur est owner de la propriété
 * ou membre actif (invitation acceptée).
 */
async function canAccessProperty(userId: string, propertyId: string): Promise<boolean> {
  const property = await db.property.findFirst({
    where: {
      id: propertyId,
      OR: [
        { ownerId: userId },
        { members: { some: { userId, acceptedAt: { not: null } } } },
      ],
    },
    select: { id: true },
  });
  return property !== null;
}

async function getSessionUser(): Promise<{ id: string } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as { id?: string }).id;
  return userId ? { id: userId } : null;
}

// GET: List rooms for a home (propriété autorisée uniquement)
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');

    if (!propertyId) {
      return NextResponse.json(
        { error: 'Le paramètre propertyId est requis' },
        { status: 400 }
      );
    }

    if (!(await canAccessProperty(user.id, propertyId))) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const rooms = await db.room.findMany({
      where: { propertyId },
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

// POST: Create a room (propriété autorisée uniquement)
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = await request.json();
    const { propertyId, name, icon } = body as {
      propertyId: string;
      name: string;
      icon?: string;
    };

    if (!propertyId || !name) {
      return NextResponse.json(
        { error: 'Les champs propertyId et name sont requis' },
        { status: 400 }
      );
    }

    if (!(await canAccessProperty(user.id, propertyId))) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const room = await db.room.create({
      data: {
        propertyId,
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
