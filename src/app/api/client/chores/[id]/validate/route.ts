import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST: Parent validates/rejects a completion
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { completionId, validatorUserId, action } = body as {
      completionId: string;
      validatorUserId: string;
      action: 'validate' | 'reject';
    };

    if (!completionId || !validatorUserId || !action) {
      return NextResponse.json(
        { error: 'Les champs completionId, validatorUserId et action sont requis' },
        { status: 400 }
      );
    }

    if (!['validate', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Action invalide. Valeurs autorisées : validate, reject' },
        { status: 400 }
      );
    }

    // Verify the completion exists and belongs to this chore
    const completion = await db.choreCompletion.findUnique({
      where: { id: completionId },
      include: { chore: true },
    });

    if (!completion) {
      return NextResponse.json(
        { error: 'Complétion introuvable' },
        { status: 404 }
      );
    }

    if (completion.choreId !== id) {
      return NextResponse.json(
        { error: 'Cette complétion n\'appartient pas à cette corvée' },
        { status: 400 }
      );
    }

    if (completion.status !== 'pending_validation') {
      return NextResponse.json(
        { error: 'Cette complétion a déjà été traitée' },
        { status: 400 }
      );
    }

    if (action === 'validate') {
      // Update completion status and add points to child's HomeMember
      const updated = await db.$transaction(async (tx) => {
        const validated = await tx.choreCompletion.update({
          where: { id: completionId },
          data: {
            status: 'validated',
            validatedAt: new Date(),
            validatedByUserId,
          },
          include: {
            chore: {
              select: { id: true, title: true, homeId: true, pointsValue: true },
            },
            child: {
              select: { id: true, fullName: true, email: true },
            },
            validator: {
              select: { id: true, fullName: true, email: true },
            },
          },
        });

        // Add points to child's HomeMember record
        const homeMember = await tx.homeMember.findUnique({
          where: {
            homeId_userId: {
              homeId: validated.chore.homeId,
              userId: completion.childUserId,
            },
          },
        });

        if (homeMember) {
          await tx.homeMember.update({
            where: { id: homeMember.id },
            data: { points: { increment: validated.pointsEarned } },
          });
        }

        return validated;
      });

      return NextResponse.json(updated);
    } else {
      // Reject: just update status
      const updated = await db.choreCompletion.update({
        where: { id: completionId },
        data: {
          status: 'rejected',
          validatedAt: new Date(),
          validatedByUserId,
        },
        include: {
          chore: {
            select: { id: true, title: true, pointsValue: true },
          },
          child: {
            select: { id: true, fullName: true, email: true },
          },
          validator: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      return NextResponse.json(updated);
    }
  } catch (error) {
    console.error('[chores validate POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
