// =============================================================
// /api/airbnb/ical — HOST-5 : flux iCal d'un bien (Calendrier)
//
// GET    ?propertyId=… → { feeds: [{id,label,url,lastSyncAt,
//                         lastStatus,lastError,lastImported}], property }
// POST   { propertyId, label, url } → crée le feed + 1re synchro réelle
// DELETE ?feedId=… → supprime le feed (les bookings ICAL déjà
//                    importés sont conservés — trace des séjours)
//
// 🔒 Session + canAccessProperty ; CLEANER/MAINTENANCE en lecture
// seule (canManage requis sur POST/DELETE).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { canAccessProperty, getUserRoleForProperty } from '@/lib/b2b-server';
import { normalizeIcalUrl, parseIcalEvents, upsertIcalBookings } from '@/lib/ical';

function canManage(role: string | null): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId') ?? '';
    if (!propertyId || !(await canAccessProperty(userId, propertyId))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }
    const feeds = await db.propertyIcalFeed.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, label: true, url: true,
        lastSyncAt: true, lastStatus: true, lastError: true, lastImported: true,
      },
    });
    return NextResponse.json({
      feeds: feeds.map((f) => ({
        ...f,
        lastSyncAt: f.lastSyncAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[airbnb/ical GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const body = (await req.json().catch(() => null)) as {
      propertyId?: string;
      label?: string;
      url?: string;
      /** Si fourni : re-synchronise ce feed existant au lieu d'en créer un. */
      feedId?: string;
    } | null;

    // ----- Re-synchronisation d'un feed existant -----
    if (body?.feedId) {
      const feed = await db.propertyIcalFeed.findUnique({
        where: { id: body.feedId },
        select: { id: true, propertyId: true, url: true },
      });
      if (!feed) {
        return NextResponse.json({ error: 'Flux introuvable' }, { status: 404 });
      }
      const role = await getUserRoleForProperty(userId, feed.propertyId);
      if (!role || !canManage(role)) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
      }
      const result = await syncFeed(feed.id, feed.url, feed.propertyId);
      return NextResponse.json({ feed: { id: feed.id, ...result } });
    }

    const propertyId = body?.propertyId ?? '';
    const label = (body?.label ?? '').trim();
    const rawUrl = normalizeIcalUrl(body?.url ?? '');

    if (!propertyId || !label || !rawUrl) {
      return NextResponse.json(
        { error: 'Bien, libellé et URL du calendrier sont requis.' },
        { status: 400 },
      );
    }
    if (!/^https:\/\/.+/.test(rawUrl)) {
      return NextResponse.json(
        { error: "L'URL doit être une URL https valide (les URL webcal:// sont acceptées et converties)." },
        { status: 400 },
      );
    }
    const role = await getUserRoleForProperty(userId, propertyId);
    if (!role || !canManage(role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const count = await db.propertyIcalFeed.count({ where: { propertyId } });
    if (count >= 5) {
      return NextResponse.json(
        { error: 'Maximum 5 calendriers par bien. Supprimez-en un avant d’ajouter.' },
        { status: 409 },
      );
    }
    const duplicate = await db.propertyIcalFeed.findFirst({
      where: { propertyId, url: rawUrl },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: 'Ce calendrier est déjà connecté à ce bien.' },
        { status: 409 },
      );
    }

    // ----- 1re synchronisation RÉELLE avant confirmation -----
    const feed = await db.propertyIcalFeed.create({
      data: { propertyId, label, url: rawUrl },
      select: { id: true, label: true, url: true },
    });
    const result = await syncFeed(feed.id, rawUrl, propertyId);
    return NextResponse.json({ feed: { ...feed, ...result } }, { status: 201 });
  } catch (error) {
    console.error('[airbnb/ical POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const feedId = searchParams.get('feedId') ?? '';
    if (!feedId) {
      return NextResponse.json({ error: 'feedId requis' }, { status: 400 });
    }
    const feed = await db.propertyIcalFeed.findUnique({
      where: { id: feedId },
      select: { id: true, propertyId: true },
    });
    if (!feed) {
      return NextResponse.json({ error: 'Flux introuvable' }, { status: 404 });
    }
    const role = await getUserRoleForProperty(userId, feed.propertyId);
    if (!role || !canManage(role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }
    await db.propertyIcalFeed.delete({ where: { id: feedId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[airbnb/ical DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// =============================================================
// Synchronisation réelle : fetch de l'URL, parse VEVENT, upsert
// Booking (source ICAL, externalRef = UID). Horodate le feed.
// =============================================================
async function syncFeed(feedId: string, url: string, propertyId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/calendar, text/plain, */*' },
      cache: 'no-store',
    });
    if (!res.ok) {
      const msg = `Le serveur distant a répondu HTTP ${res.status}.`;
      await db.propertyIcalFeed.update({
        where: { id: feedId },
        data: { lastSyncAt: new Date(), lastStatus: 'ERROR', lastError: msg, lastImported: 0 },
      });
      return { lastSyncAt: new Date().toISOString(), lastStatus: 'ERROR' as const, lastError: msg, lastImported: 0 };
    }
    const content = await res.text();
    const { events, error } = parseIcalEvents(content);
    if (error) {
      await db.propertyIcalFeed.update({
        where: { id: feedId },
        data: { lastSyncAt: new Date(), lastStatus: 'ERROR', lastError: error, lastImported: 0 },
      });
      return { lastSyncAt: new Date().toISOString(), lastStatus: 'ERROR' as const, lastError: error, lastImported: 0 };
    }
    const imported = await db.$transaction((tx) => upsertIcalBookings(tx, propertyId, events));
    await db.propertyIcalFeed.update({
      where: { id: feedId },
      data: { lastSyncAt: new Date(), lastStatus: 'OK', lastError: null, lastImported: imported },
    });
    return {
      lastSyncAt: new Date().toISOString(),
      lastStatus: 'OK' as const,
      lastError: null,
      lastImported: imported,
    };
  } catch (err) {
    const msg =
      err instanceof Error && err.name === 'AbortError'
        ? 'Délai dépassé (15 s) — le serveur distant ne répond pas.'
        : `Échec du téléchargement : ${err instanceof Error ? err.message : 'erreur réseau'}`;
    await db.propertyIcalFeed.update({
      where: { id: feedId },
      data: { lastSyncAt: new Date(), lastStatus: 'ERROR', lastError: msg, lastImported: 0 },
    });
    return { lastSyncAt: new Date().toISOString(), lastStatus: 'ERROR' as const, lastError: msg, lastImported: 0 };
  } finally {
    clearTimeout(timeout);
  }
}
