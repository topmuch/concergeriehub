// =============================================================
// /api/shield/sessions — BOUCLIER V2 · historiques (onglets
// Check-ins / Check-outs / Documents).
//
// GET ?type=CHECK_IN|CHECK_OUT&status=TERMINE|A_VENIR|TOUS&take=60
// Liste des sessions de l'abonnement avec : bien, invité, agent,
// date effective (scheduled ?? completed), nb photos, statut
// effectif, lien vidéo publique (/shield/video/[token]) et lien
// PDF certifié (/api/shield/pdf/session/[id]).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveShieldAccess } from '@/lib/shield-access';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const access = await resolveShieldAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
    }

    const url = new URL(req.url);
    const typeRaw = url.searchParams.get('type');
    const type = typeRaw === 'CHECK_IN' || typeRaw === 'CHECK_OUT' ? typeRaw : null;
    const statusRaw = url.searchParams.get('status');
    const take = Math.min(Math.max(Number(url.searchParams.get('take') ?? '60') || 60, 1), 100);

    // Statut effectif appliqué en mémoire (EN_RETARD calculé, zéro cron).
    const rows = await db.shieldSession.findMany({
      where: {
        property: { subscriptionId: access.subscriptionId },
        ...(type ? { type } : {}),
        // Filtre serveur large : les sessions planifiées (A_VENIR) et
        // terminées sont renvoyées ; le filtrage fin se fait ci-dessous.
      },
      orderBy: [{ completedAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        type: true,
        status: true,
        guestName: true,
        guestEmail: true,
        agentName: true,
        scheduledDate: true,
        completedAt: true,
        sessionRef: true,
        depositAmount: true,
        _count: { select: { shots: true } },
        video: { select: { publicToken: true, sha256: true, durationSec: true } },
        property: { select: { id: true, propertyName: true, city: true } },
      },
    });

    const filtered = rows.filter((s) => {
      if (statusRaw === 'TERMINE') return s.status === 'TERMINE';
      if (statusRaw === 'A_VENIR') {
        if (s.status !== 'A_VENIR') return false;
        return true;
      }
      if (statusRaw === 'EN_RETARD') {
        return s.status === 'A_VENIR' && !!s.scheduledDate && s.scheduledDate.getTime() < Date.now();
      }
      return true; // TOUS
    });

    // v4.167 — compte des ANOMALIES par session (zones « À nettoyer »
    // ou « Dégradation ») : alimente le badge rouge « Anomalie » des
    // historiques Check-ins / Check-outs / Documents.
    const sessionIds = filtered.map((s) => s.id);
    const anomalyShots =
      sessionIds.length > 0
        ? await db.shieldZoneShot.groupBy({
            by: ['sessionId'],
            where: { sessionId: { in: sessionIds }, status: { not: 'IMPECCABLE' } },
            _count: { _all: true },
          })
        : [];
    const anomaliesBySession = new Map<string, number>(
      anomalyShots.map((g) => [g.sessionId, g._count._all]),
    );

    return NextResponse.json({
      sessions: filtered.slice(0, take).map((s) => ({
        id: s.id,
        type: s.type,
        status: s.status,
        effectiveStatus:
          s.status === 'A_VENIR' && s.scheduledDate && s.scheduledDate.getTime() < Date.now()
            ? 'EN_RETARD'
            : s.status,
        guestName: s.guestName,
        guestEmail: s.guestEmail,
        agentName: s.agentName,
        scheduledDate: s.scheduledDate?.toISOString() ?? null,
        completedAt: s.completedAt.toISOString(),
        sessionRef: s.sessionRef,
        shots: s._count.shots,
        anomalies: anomaliesBySession.get(s.id) ?? 0,
        depositAmount: s.depositAmount ?? null,
        videoToken: s.video?.publicToken ?? null,
        videoSha256: s.video?.sha256 ?? null,
        property: s.property,
      })),
      total: filtered.length,
    });
  } catch (err) {
    console.error('[shield/sessions GET] error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
