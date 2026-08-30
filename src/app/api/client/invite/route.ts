import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST: Invite a member (creates user if not exists, then PropertyMember)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { propertyId, email, role, nickname } = body as {
      propertyId: string;
      email: string;
      role: string;
      nickname?: string;
    };

    if (!propertyId || !email || !role) {
      return NextResponse.json(
        { error: 'Les champs propertyId, email et role sont requis' },
        { status: 400 }
      );
    }

    // Verify the home exists
    const home = await db.property.findUnique({ where: { id: propertyId } });
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
    const existingMember = await db.propertyMember.findUnique({
      where: {
        propertyId_userId: { propertyId, userId: invitedUser.id },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: 'Cet utilisateur est déjà membre de cette maison' },
        { status: 409 }
      );
    }

    // Create the PropertyMember record
    const member = await db.propertyMember.create({
      data: {
        propertyId,
        userId: invitedUser.id,
        role,
        nickname: nickname ?? null,
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
        property: {
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
