import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const VALID_ROLES = ['owner', 'admin', 'member', 'child'];

// PUT: Update member role or nickname
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { role, nickname } = body as {
      role?: string;
      nickname?: string;
    };

    if (!role && !nickname) {
      return NextResponse.json(
        { error: 'Au moins un champ (role ou nickname) est requis' },
        { status: 400 }
      );
    }

    if (role && !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'Rôle invalide. Valeurs autorisées : owner, admin, member, child' },
        { status: 400 }
      );
    }

    // Find the member
    const member = await db.homeMember.findUnique({ where: { id } });
    if (!member) {
      return NextResponse.json(
        { error: 'Membre introuvable' },
        { status: 404 }
      );
    }

    // Cannot change the owner's role
    if (member.role === 'owner' && role && role !== 'owner') {
      return NextResponse.json(
        { error: 'Impossible de modifier le rôle du propriétaire' },
        { status: 403 }
      );
    }

    const updated = await db.homeMember.update({
      where: { id },
      data: {
        ...(role ? { role } : {}),
        ...(nickname !== undefined ? { nickname } : {}),
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[members PUT] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// DELETE: Remove a member from a home
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Find the member
    const member = await db.homeMember.findUnique({ where: { id } });
    if (!member) {
      return NextResponse.json(
        { error: 'Membre introuvable' },
        { status: 404 }
      );
    }

    // Cannot remove the owner
    if (member.role === 'owner') {
      return NextResponse.json(
        { error: 'Impossible de supprimer le propriétaire de la maison' },
        { status: 403 }
      );
    }

    await db.homeMember.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[members DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
