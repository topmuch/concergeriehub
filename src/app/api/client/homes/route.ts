import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

// GET: List homes for the logged-in user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    // Fallback to demo user if no session (development / public demo)
    let effectiveUserId = userId;
    if (!userId) {
      const demoUser = await db.user.findFirst({
        where: { email: 'demo@qrdomotik.roomscan.pro' },
        select: { id: true },
      });
      effectiveUserId = demoUser?.id;
    }

    if (!effectiveUserId) {
      return NextResponse.json({ homes: [] });
    }

    // Get all home IDs the user belongs to
    const memberships = await db.homeMember.findMany({
      where: { userId: effectiveUserId },
      select: { homeId: true },
    });

    const homeIds = memberships.map((m) => m.homeId);

    if (homeIds.length === 0) {
      return NextResponse.json({ homes: [] });
    }

    const homes = await db.home.findMany({
      where: { id: { in: homeIds } },
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

// POST: Create a new home
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

    // Resolve user from session, fallback to demo
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    if (!userId) {
      const demoUser = await db.user.findFirst({
        where: { email: 'demo@qrdomotik.roomscan.pro' },
        select: { id: true },
      });
      userId = demoUser?.id;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur non identifié' }, { status: 401 });
    }

    const home = await db.home.create({
      data: {
        ownerId: userId,
        name,
        address: address ?? null,
        isActive: true,
      },
    });

    // Auto-add user as owner
    await db.homeMember.create({
      data: {
        homeId: home.id,
        userId,
        role: 'owner',
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

// DELETE: Delete a home and all its data (cascade)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const homeId = searchParams.get('id');

    if (!homeId) {
      return NextResponse.json(
        { error: "L'id de la maison est requis" },
        { status: 400 }
      );
    }

    const home = await db.home.findUnique({ where: { id: homeId } });
    if (!home) {
      return NextResponse.json(
        { error: 'Maison introuvable' },
        { status: 404 }
      );
    }

    await db.home.delete({ where: { id: homeId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[homes DELETE] Error:', error);
    const message = error instanceof Error ? error.message : 'Erreur interne du serveur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
