// =============================================================
// /api/shield/visits/[id] — BOUCLIER V2 · annulation d'un séjour
// planifié (statut ⚪ ANNULE du master prompt client).
//
// PATCH { action: 'annuler' } :
//   · CHECK_IN planifié  → annule AUSSI le CHECK_OUT lié (pair) ;
//   · CHECK_OUT planifié → annule lui seul ;
//   · jamais une session TERMINE (preuve légale inamovible).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveShieldAccess } from '@/lib/shield-access';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await resolveShieldAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
    }
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
    if (!body || body.action !== 'annuler') {
      return NextResponse.json({ error: 'action_invalide' }, { status: 400 });
    }

    // Ownership par l'abonnement (jamais par id brut).
    const session = await db.shieldSession.findFirst({
      where: { id, status: 'A_VENIR', property: { subscriptionId: access.subscriptionId } },
    });
    if (!session) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    await db.shieldSession.update({ where: { id: session.id }, data: { status: 'ANNULE' } });

    // Pair CHECK_IN ↔ CHECK_OUT : annulation des deux.
    let linkedCancelled = 0;
    if (session.type === 'CHECK_IN') {
      const res = await db.shieldSession.updateMany({
        where: { linkedSessionId: session.id, status: 'A_VENIR' },
        data: { status: 'ANNULE' },
      });
      linkedCancelled = res.count;
    }

    return NextResponse.json({ ok: true, cancelled: 1 + linkedCancelled });
  } catch (err) {
    console.error('[shield/visits/[id] PATCH] error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
