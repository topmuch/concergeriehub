// =============================================================
// /api/public/hub/[slug]/notification-log
//
// v4.74 « SMART PROMPTS » — anti-doublon des notifications.
//   GET  ?type=breakfast[&date=YYYY-MM-DD] → { shown: boolean }
//   POST { type, bookingId? }              → journalise l'affichage
//
// La fenêtre anti-doublon = le JOUR LOCAL courant (une notification
// repas s'affiche au plus une fois par jour et par bien). Le client
// garde aussi un garde-fou localStorage — le serveur reste la source
// de vérité (plusieurs onglets / appareils).
// 🔒 requireHubAccess (hub verrouillé → token invité obligatoire).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clientIp } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import { requireHubAccess } from '@/lib/hub-access';
import {
  NOTIFICATION_TYPES,
  startOfLocalDay,
  endOfLocalDay,
  type NotificationType,
} from '@/lib/smart-notifications';

type Ctx = { params: Promise<{ slug: string }> };

function parseType(raw: string | null): NotificationType | null {
  if (!raw) return null;
  return (NOTIFICATION_TYPES as readonly string[]).includes(raw)
    ? (raw as NotificationType)
    : null;
}

export async function GET(
  req: NextRequest,
  { params }: Ctx,
) {
  try {
    const { slug } = await params;
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
    }
    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const type = parseType(req.nextUrl.searchParams.get('type'));
    if (!type) {
      return NextResponse.json({ error: 'Paramètre type invalide.' }, { status: 400 });
    }
    const day = req.nextUrl.searchParams.get('date');
    const start = startOfLocalDay(day);
    const end = endOfLocalDay(start);

    const count = await db.notificationLog.count({
      where: {
        propertyId: resolved.propertyId,
        notificationType: type,
        displayedAt: { gte: start, lt: end },
      },
    });

    return NextResponse.json({ ok: true, shown: count > 0 });
  } catch (error) {
    console.error('[public/hub notification-log GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: Ctx,
) {
  try {
    const { slug } = await params;
    if (!(await rateLimit(`hubnotiflog:${slug}:${clientIp(req.headers)}`, 12))) {
      return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
    }
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
    }
    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const body = (await req.json().catch(() => null)) as { type?: string } | null;
    const type = parseType(body?.type ?? null);
    if (!type) {
      return NextResponse.json({ error: 'Type de notification invalide.' }, { status: 400 });
    }

    await db.notificationLog.create({
      data: {
        propertyId: resolved.propertyId,
        notificationType: type,
        bookingId: access.bookingId ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[public/hub notification-log POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
