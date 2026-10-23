// =============================================================
// /api/shield/sessions/[id] — ROOMSCAN INVENTAIRE (ex-Bouclier)
// v5.0 — DEMANDE CLIENT : boutons de SUPPRESSION sur les onglets
// Check-ins / Check-outs. L'hôte peut effacer une session de son
// historique (test effectué par erreur, doublon, RGPD…).
//
// DELETE ?scope=session|pair
//   · scope=session (défaut) : supprime la session visée seule ;
//   · scope=pair : supprime aussi la session liée (check-in +
//     check-out du même séjour).
// Suppression HARD DELETE en cascade (shots, vidéo) via Prisma —
// ownership vérifié par l'abonnement (jamais par id brut).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveShieldAccess } from '@/lib/shield-access';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await resolveShieldAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
    }
    const { id } = await params;
    const url = new URL(req.url);
    const scope = url.searchParams.get('scope') === 'pair' ? 'pair' : 'session';

    // Ownership par l'abonnement.
    const session = await db.shieldSession.findFirst({
      where: { id, property: { subscriptionId: access.subscriptionId } },
    });
    if (!session) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Sessions à supprimer : la visée + éventuellement sa paire liée.
    const ids = [session.id];
    if (scope === 'pair') {
      const linkedId = session.linkedSessionId ?? null;
      if (linkedId) {
        const linked = await db.shieldSession.findFirst({
          where: { id: linkedId, property: { subscriptionId: access.subscriptionId } },
          select: { id: true },
        });
        if (linked) ids.push(linked.id);
      }
    }

    // Suppression HARD DELETE : les ShieldZoneShot / ShieldVideo liés
    // sont effacés en CASCADE par Prisma (onDelete: Cascade).
    const deleted = await db.shieldSession.deleteMany({ where: { id: { in: ids } } });

    return NextResponse.json({ ok: true, deleted: deleted.count });
  } catch (err) {
    console.error('[shield/sessions/[id] DELETE] error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
