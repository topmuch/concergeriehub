import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { randomBytes } from 'crypto';

const VALID_EVENTS = ['scan', 'doorbell', 'guestbook', 'chore_completed', 'notification'];

// PUT: Update a webhook
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
    const { name, url, events, secret, isActive, regenerateSecret } = body as {
      name?: string;
      url?: string;
      events?: string[];
      secret?: string;
      isActive?: boolean;
      regenerateSecret?: boolean;
    };

    // Verify ownership
    const webhook = await db.webhook.findUnique({
      where: { id },
      include: { home: true },
    });

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook introuvable' }, { status: 404 });
    }

    const home = await db.home.findFirst({
      where: {
        id: webhook.homeId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
    });

    if (!home) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    let validatedEvents: string[] | undefined;
    if (events) {
      validatedEvents = events.filter((e) => VALID_EVENTS.includes(e));
    }

    const newSecret = regenerateSecret ? randomBytes(32).toString('hex') : undefined;

    const updated = await db.webhook.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(url !== undefined && { url: url.replace(/\/+$/, '') }),
        ...(validatedEvents !== undefined && { events: JSON.stringify(validatedEvents) }),
        ...(newSecret !== undefined && { secret: newSecret }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { home: { select: { id: true, name: true } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[webhooks PUT] Error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

// DELETE: Delete a webhook
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
    const webhook = await db.webhook.findUnique({
      where: { id },
      include: { home: true },
    });

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook introuvable' }, { status: 404 });
    }

    const home = await db.home.findFirst({
      where: {
        id: webhook.homeId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
    });

    if (!home) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    await db.webhook.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[webhooks DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
