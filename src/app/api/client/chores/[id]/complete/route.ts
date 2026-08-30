import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST: Child completes a chore
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { childUserId } = body as { childUserId: string };

    if (!childUserId) {
      return NextResponse.json(
        { error: 'Le paramètre childUserId est requis' },
        { status: 400 }
      );
    }

    // Verify the chore exists
    const chore = await db.chore.findUnique({ where: { id } });
    if (!chore) {
      return NextResponse.json(
        { error: 'Corvée introuvable' },
        { status: 404 }
      );
    }

    if (!chore.isActive) {
      return NextResponse.json(
        { error: 'Cette corvée est désactivée' },
        { status: 400 }
      );
    }

    const completion = await db.choreCompletion.create({
      data: {
        choreId: id,
        childUserId,
        pointsEarned: chore.pointsValue,
        status: 'pending_validation',
      },
      include: {
        chore: {
          select: { id: true, title: true, pointsValue: true },
        },
        child: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return NextResponse.json(completion, { status: 201 });
  } catch (error) {
    console.error('[chores complete POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
