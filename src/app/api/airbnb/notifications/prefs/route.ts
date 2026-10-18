// =============================================================
// GET / PUT /api/airbnb/notifications/prefs — HOST-5 Paramètres →
// onglet Notifications. Préférences par événement (email / push),
// stockées en base sur users.notification_prefs (JSON).
// PUT : payload { [eventKey]: { email, push } } — clés inconnues
// rejetées (catalogue src/lib/notification-prefs.ts).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { effectivePrefs, sanitizePrefsInput, type NotificationPrefsMap } from '@/lib/notification-prefs';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    const stored = (user?.notificationPrefs ?? null) as NotificationPrefsMap | null;
    return NextResponse.json({ prefs: effectivePrefs(stored) });
  } catch (error) {
    console.error('[airbnb/notifications/prefs GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const body = (await req.json().catch(() => null)) as { prefs?: unknown } | null;
    const result = sanitizePrefsInput(body?.prefs);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    await db.user.update({
      where: { id: userId },
      data: { notificationPrefs: result.prefs as unknown as Prisma.InputJsonValue },
    });
    return NextResponse.json({ prefs: effectivePrefs(result.prefs), saved: true });
  } catch (error) {
    console.error('[airbnb/notifications/prefs PUT] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
