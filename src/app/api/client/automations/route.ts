import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

const VALID_PROVIDERS = ['home_assistant', 'jeedom'];

// GET: List all automations for the authenticated user's homes
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    const homes = await db.home.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      select: { id: true },
    });

    const homeIds = homes.map((h) => h.id);

    if (homeIds.length === 0) {
      return NextResponse.json({ automations: [] });
    }

    const automations = await db.homeAutomation.findMany({
      where: { homeId: { in: homeIds } },
      include: {
        home: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ automations });
  } catch (error) {
    console.error('[automations GET] Error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

// POST: Create a new automation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const body = await request.json();
    const { homeId, name, provider, baseUrl, apiToken } = body as {
      homeId: string;
      name: string;
      provider: string;
      baseUrl: string;
      apiToken?: string;
    };

    if (!homeId || !name || !provider || !baseUrl) {
      return NextResponse.json(
        { error: 'Les champs homeId, name, provider et baseUrl sont requis' },
        { status: 400 }
      );
    }

    if (!VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: 'Provider invalide. Valeurs autorisées : home_assistant, jeedom' },
        { status: 400 }
      );
    }

    // Verify user has access to this home
    const home = await db.home.findFirst({
      where: {
        id: homeId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
    });

    if (!home) {
      return NextResponse.json({ error: 'Maison introuvable' }, { status: 404 });
    }

    // Clean baseUrl
    const cleanUrl = baseUrl.replace(/\/+$/, '');

    const automation = await db.homeAutomation.create({
      data: {
        homeId,
        name,
        provider,
        baseUrl: cleanUrl,
        apiToken: apiToken || null,
      },
      include: {
        home: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(automation, { status: 201 });
  } catch (error) {
    console.error('[automations POST] Error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
