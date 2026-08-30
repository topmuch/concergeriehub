import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const VALID_FREQUENCIES = ['once', 'daily', 'weekly', 'monthly'];

// PUT: Update a chore
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      title,
      description,
      pointsValue,
      frequency,
      assignedToUserId,
      isActive,
    } = body as {
      title?: string;
      description?: string;
      pointsValue?: number;
      frequency?: string;
      assignedToUserId?: string | null;
      isActive?: boolean;
    };

    if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
      return NextResponse.json(
        { error: 'Fréquence invalide. Valeurs autorisées : once, daily, weekly, monthly' },
        { status: 400 }
      );
    }

    const existing = await db.chore.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Corvée introuvable' },
        { status: 404 }
      );
    }

    const updated = await db.chore.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description: description ?? null } : {}),
        ...(pointsValue !== undefined ? { pointsValue } : {}),
        ...(frequency !== undefined ? { frequency } : {}),
        ...(assignedToUserId !== undefined ? { assignedToUserId: assignedToUserId ?? null } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      include: {
        assignedTo: {
          select: { id: true, fullName: true, email: true },
        },
        _count: {
          select: { completions: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[chores PUT] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a chore and its completions
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.chore.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Corvée introuvable' },
        { status: 404 }
      );
    }

    await db.chore.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[chores DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
