// =============================================================
// /api/airbnb/notifications — ÉTAPE 13 V2 (espace hôte)
//
// GET                     : notifications de l'utilisateur connecté
//                           (session-scoped — jamais de userId en
//                           query, contrairement à la V1 client).
//                           ?unreadOnly=1 → uniquement non lues.
//                           ?limit=20 → max 50.
//                           Déclenche aussi le tick lazy des
//                           rappels arrivée/départ du jour.
// PATCH ?notificationId=  : marque une notification comme lue.
// PUT                     : marque TOUTES les notifications lues.
//
// ⚠️ notificationId passe par un QUERY PARAM (robustesse sandbox).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { runDailyAutomationsForUser } from '@/lib/automations-server';

function parseDataJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get('unreadOnly') === '1';
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? 20)));

    // Tick lazy des rappels du jour (idempotent grâce à lastRunAt)
    await runDailyAutomationsForUser(userId);

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      db.notification.count({ where: { userId, isRead: false } }),
    ]);

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: parseDataJson(n.dataJson),
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
    });
  } catch (error) {
    console.error('[airbnb/notifications GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const notificationId = new URL(req.url).searchParams.get('notificationId');
    if (!notificationId) {
      return NextResponse.json({ error: 'Query param notificationId requis.' }, { status: 400 });
    }

    const result = await db.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: 'Notification introuvable.' }, { status: 404 });
    }

    const unreadCount = await db.notification.count({ where: { userId, isRead: false } });
    return NextResponse.json({ updated: true, unreadCount });
  } catch (error) {
    console.error('[airbnb/notifications PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const result = await db.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ updated: result.count, unreadCount: 0 });
  } catch (error) {
    console.error('[airbnb/notifications PUT] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
