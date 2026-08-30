import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: List notifications for a user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limitParam = searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitParam || '50', 10), 1), 100);

    if (!userId) {
      return NextResponse.json(
        { error: 'userId est requis' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { userId };
    if (unreadOnly) { where.isRead = false; }

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      db.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error('[notifications GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Create a notification
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, type, title, body: notifBody, dataJson } = body as {
      userId: string;
      type: string;
      title: string;
      body?: string;
      dataJson?: string;
    };

    if (!userId || !type || !title) {
      return NextResponse.json(
        { error: 'userId, type et title sont requis' },
        { status: 400 }
      );
    }

    const notification = await db.notification.create({
      data: {
        userId,
        type,
        title,
        body: notifBody ?? null,
        dataJson: dataJson ?? '{}',
      },
    });

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error('[notifications POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// PUT: Mark all notifications as read for a user
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body as { userId: string };

    if (!userId) {
      return NextResponse.json(
        { error: 'userId est requis' },
        { status: 400 }
      );
    }

    const result = await db.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ count: result.count });
  } catch (error) {
    console.error('[notifications PUT] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
