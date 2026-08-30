import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST: Invite a member (creates user if not exists, then HomeMember)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { homeId, email, role, nickname } = body as {
      homeId: string;
      email: string;
      role: string;
      nickname?: string;
    };

    if (!homeId || !email || !role) {
      return NextResponse.json(
        { error: 'Les champs homeId, email et role sont requis' },
        { status: 400 }
      );
    }

    // Verify the home exists
    const home = await db.home.findUnique({ where: { id: homeId } });
    if (!home) {
      return NextResponse.json(
        { error: 'Maison introuvable' },
        { status: 404 }
      );
    }

    // Find or create the invited user
    let invitedUser = await db.user.findUnique({
      where: { email },
    });

    if (!invitedUser) {
      invitedUser = await db.user.create({
        data: {
          email,
          fullName: nickname ?? email.split('@')[0],
          role: 'user',
        },
      });
    }

    // Check if already a member
    const existingMember = await db.homeMember.findUnique({
      where: {
        homeId_userId: { homeId, userId: invitedUser.id },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: 'Cet utilisateur est déjà membre de cette maison' },
        { status: 409 }
      );
    }

    // Create the HomeMember record
    const member = await db.homeMember.create({
      data: {
        homeId,
        userId: invitedUser.id,
        role,
        nickname: nickname ?? null,
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
        home: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(member);
  } catch (error) {
    console.error('[invite POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
