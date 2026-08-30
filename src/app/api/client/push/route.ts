import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

// GET: Check if user has push subscription & get VAPID key
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    const subscription = await db.pushSubscription.findFirst({
      where: { userId },
    });

    return NextResponse.json({
      vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      subscribed: !!subscription,
    });
  } catch (error) {
    console.error('[push GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST: Register a push subscription
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const body = await request.json();
    const { endpoint, keys } = body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    // Upsert: replace if same endpoint exists
    const existing = await db.pushSubscription.findFirst({
      where: { endpoint, userId },
    });

    if (existing) {
      await db.pushSubscription.update({
        where: { id: existing.id },
        data: { p256dhKey: keys.p256dh, authKey: keys.auth },
      });
    } else {
      await db.pushSubscription.create({
        data: {
          userId,
          endpoint,
          p256dhKey: keys.p256dh,
          authKey: keys.auth,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE: Remove push subscription
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const body = await request.json();
    const { endpoint } = body as { endpoint?: string };

    if (endpoint) {
      // Delete specific subscription
      await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
    } else {
      // Delete all subscriptions for this user
      await db.pushSubscription.deleteMany({ where: { userId } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
