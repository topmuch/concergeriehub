import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const VALID_ROLES = ['owner', 'admin', 'member', 'child'];

// GET: List all members of a home
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const home = await db.home.findUnique({ where: { id } });
    if (!home) {
      return NextResponse.json(
        { error: 'Maison introuvable' },
        { status: 404 }
      );
    }

    const members = await db.homeMember.findMany({
      where: { homeId: id },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error('[homes members GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Invite a new member to a home
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { email, role, nickname } = body as {
      email: string;
      role?: string;
      nickname?: string;
    };

    if (!email) {
      return NextResponse.json(
        { error: 'L\'email est requis' },
        { status: 400 }
      );
    }

    const memberRole = role || 'member';
    if (!VALID_ROLES.includes(memberRole)) {
      return NextResponse.json(
        { error: 'Rôle invalide. Valeurs autorisées : owner, admin, member, child' },
        { status: 400 }
      );
    }

    if (memberRole === 'owner') {
      return NextResponse.json(
        { error: 'Impossible d\'inviter un membre avec le rôle propriétaire' },
        { status: 400 }
      );
    }

    // Verify the home exists
    const home = await db.home.findUnique({ where: { id } });
    if (!home) {
      return NextResponse.json(
        { error: 'Maison introuvable' },
        { status: 404 }
      );
    }

    // Find or create the invited user
    let invitedUser = await db.user.findUnique({ where: { email } });

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
        homeId_userId: { homeId: id, userId: invitedUser.id },
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
        homeId: id,
        userId: invitedUser.id,
        role: memberRole,
        nickname: nickname ?? null,
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });

    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    console.error('[homes members POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
