import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

// GET: List homes for the logged-in user (owner ou membre accepté)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const homes = await db.property.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId, acceptedAt: { not: null } } } },
        ],
      },
      include: {
        _count: {
          select: {
            rooms: true,
            members: true,
            qrCodes: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ homes });
  } catch (error) {
    console.error('[homes GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Create a new home (session obligatoire)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, address } = body as {
      name: string;
      address?: string;
    };

    if (!name) {
      return NextResponse.json(
        { error: 'Le nom de la maison est requis' },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const home = await db.property.create({
      data: {
        ownerId: userId,
        name,
        address: address ?? null,
        isActive: true,
      },
    });

    // Auto-add user as owner (invitation déjà acceptée)
    await db.propertyMember.create({
      data: {
        propertyId: home.id,
        userId,
        role: 'owner',
        acceptedAt: new Date(),
      },
    });

    return NextResponse.json(home);
  } catch (error) {
    console.error('[homes POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a home and all its data (cascade) — propriétaire ou Superadmin
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('id');

    if (!propertyId) {
      return NextResponse.json(
        { error: "L'id de la maison est requis" },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    const role = (session?.user as { role?: string } | undefined)?.role;

    if (!userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const home = await db.property.findUnique({ where: { id: propertyId } });
    if (!home) {
      return NextResponse.json(
        { error: 'Maison introuvable' },
        { status: 404 }
      );
    }

    if (home.ownerId !== userId && role !== 'superadmin') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    await db.property.delete({ where: { id: propertyId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[homes DELETE] Error:', error);
    const message = error instanceof Error ? error.message : 'Erreur interne du serveur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
