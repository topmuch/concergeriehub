import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { randomBytes } from 'crypto';

const VALID_EVENTS = ['scan', 'doorbell', 'guestbook', 'chore_completed', 'notification'];

// GET: List all webhooks for the authenticated user's homes
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
      return NextResponse.json({ webhooks: [] });
    }

    const webhooks = await db.webhook.findMany({
      where: { homeId: { in: homeIds } },
      include: {
        home: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ webhooks });
  } catch (error) {
    console.error('[webhooks GET] Error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

// POST: Create a new webhook
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const body = await request.json();
    const { homeId, name, url, events, secret } = body as {
      homeId: string;
      name: string;
      url: string;
      events?: string[];
      secret?: string;
    };

    if (!homeId || !name || !url) {
      return NextResponse.json(
        { error: 'Les champs homeId, name et url sont requis' },
        { status: 400 }
      );
    }

    // Validate events
    const validatedEvents = events?.filter((e) => VALID_EVENTS.includes(e)) || ['scan', 'doorbell', 'guestbook'];

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

    const webhookSecret = secret || randomBytes(32).toString('hex');

    const webhook = await db.webhook.create({
      data: {
        homeId,
        name,
        url: url.replace(/\/+$/, ''),
        events: JSON.stringify(validatedEvents),
        secret: webhookSecret,
      },
      include: {
        home: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(webhook, { status: 201 });
  } catch (error) {
    console.error('[webhooks POST] Error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
