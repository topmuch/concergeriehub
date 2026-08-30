import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

const VALID_PROVIDERS = ['home_assistant', 'jeedom'];

// PUT: Update an automation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { id } = await params;
    const body = await request.json();
    const { name, provider, baseUrl, apiToken, isActive } = body as {
      name?: string;
      provider?: string;
      baseUrl?: string;
      apiToken?: string;
      isActive?: boolean;
    };

    // Verify ownership through home
    const automation = await db.homeAutomation.findUnique({
      where: { id },
      include: { home: true },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automatisation introuvable' }, { status: 404 });
    }

    const home = await db.home.findFirst({
      where: {
        id: automation.homeId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
    });

    if (!home) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    if (provider && !VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: 'Provider invalide. Valeurs autorisées : home_assistant, jeedom' },
        { status: 400 }
      );
    }

    const cleanUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : undefined;

    const updated = await db.homeAutomation.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(provider !== undefined && { provider }),
        ...(cleanUrl !== undefined && { baseUrl: cleanUrl }),
        ...(apiToken !== undefined && { apiToken: apiToken || null }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { home: { select: { id: true, name: true } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[automations PUT] Error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

// DELETE: Delete an automation
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { id } = await params;

    // Verify ownership
    const automation = await db.homeAutomation.findUnique({
      where: { id },
      include: { home: true },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automatisation introuvable' }, { status: 404 });
    }

    const home = await db.home.findFirst({
      where: {
        id: automation.homeId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
    });

    if (!home) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    await db.homeAutomation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[automations DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
