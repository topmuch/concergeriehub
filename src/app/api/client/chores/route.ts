import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const VALID_FREQUENCIES = ['once', 'daily', 'weekly', 'monthly'];

// GET: List chores for a home
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const homeId = searchParams.get('homeId');
    const status = searchParams.get('status') || 'active';
    const assignedTo = searchParams.get('assignedTo');

    if (!homeId) {
      return NextResponse.json(
        { error: 'Le paramètre homeId est requis' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { homeId };

    if (status === 'active') {
      where.isActive = true;
    }

    if (assignedTo) {
      where.assignedToUserId = assignedTo;
    }

    const chores = await db.chore.findMany({
      where,
      include: {
        assignedTo: {
          select: { id: true, fullName: true, email: true },
        },
        _count: {
          select: { completions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ chores });
  } catch (error) {
    console.error('[chores GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Create a chore
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      homeId,
      title,
      description,
      pointsValue,
      frequency,
      assignedToUserId,
    } = body as {
      homeId: string;
      title: string;
      description?: string;
      pointsValue?: number;
      frequency?: string;
      assignedToUserId?: string;
    };

    if (!homeId || !title) {
      return NextResponse.json(
        { error: 'Les champs homeId et title sont requis' },
        { status: 400 }
      );
    }

    if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
      return NextResponse.json(
        { error: 'Fréquence invalide. Valeurs autorisées : once, daily, weekly, monthly' },
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

    const chore = await db.chore.create({
      data: {
        homeId,
        title,
        description: description ?? null,
        pointsValue: pointsValue ?? 10,
        frequency: frequency || 'once',
        assignedToUserId: assignedToUserId ?? null,
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

    return NextResponse.json(chore, { status: 201 });
  } catch (error) {
    console.error('[chores POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
