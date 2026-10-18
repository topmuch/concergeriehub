import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';
import {
  specialRequestItemMeta,
  specialRequestStatusMeta,
} from '@/lib/special-requests';

// =============================================================
// « DEMANDES PARTICULIÈRES » — API HÔTE (dashboard)
// GET   /api/airbnb/special-requests?propertyId=<id|all>
//         → demandes des invités sur les biens de l'hôte authentifié
//           (session NextAuth — même pattern que /api/airbnb/*),
//           plus récentes d'abord + compteurs par statut.
// PATCH body { requestId, action: 'START' | 'COMPLETE' | 'CANCEL' | 'REOPEN' }
//         → suivi En attente → En cours → Traité (+ Annuler / Réouvrir),
//           handledAt horodaté à la prise en charge et à la clôture.
//
// Sécurité : session obligatoire (401) ; le périmètre est TOUJOURS
// recalculé serveur via resolveUserProperties (biens possédés ou
// partagés avec l'hôte) — une demande hors périmètre = 404.
// =============================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const properties = await resolveUserProperties(userId);
    if (properties.length === 0) {
      return NextResponse.json({ requests: [], counts: emptyCounts() });
    }
    const names = new Map(properties.map((p) => [p.id, p.name]));
    const allIds = properties.map((p) => p.id);

    // Filtre optionnel par bien (?propertyId=<id|all|vide>) — un id
    // hors périmètre est ignoré (retombe sur « tous les biens »).
    const requestedId = new URL(req.url).searchParams.get('propertyId');
    const scopeIds =
      requestedId && requestedId !== 'all' && names.has(requestedId)
        ? [requestedId]
        : allIds;

    const rows = await db.specialRequest.findMany({
      where: { propertyId: { in: scopeIds } },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });

    const requests = rows.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      propertyName: names.get(r.propertyId) ?? null,
      guestName: r.guestName,
      itemType: r.itemType,
      itemLabel: specialRequestItemMeta(r.itemType).label,
      itemEmoji: specialRequestItemMeta(r.itemType).emoji,
      quantity: r.quantity,
      note: r.note,
      status: r.status,
      statusLabel: specialRequestStatusMeta(r.status).label,
      source: r.source,
      requestedAt: r.requestedAt.toISOString(),
      handledAt: r.handledAt?.toISOString() ?? null,
    }));

    return NextResponse.json({
      requests,
      counts: {
        pending: requests.filter((r) => r.status === 'pending').length,
        inProgress: requests.filter((r) => r.status === 'in_progress').length,
        done: requests.filter((r) => r.status === 'done').length,
        cancelled: requests.filter((r) => r.status === 'cancelled').length,
      },
    });
  } catch (error) {
    console.error('[airbnb/special-requests GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

const patchSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(['START', 'COMPLETE', 'CANCEL', 'REOPEN']),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }
    const { requestId, action } = parsed.data;

    // ── Garde de périmètre : la demande doit appartenir à un bien de
    // l'hôte authentifié (sinon 404, pas de fuite d'existence). ──
    const properties = await resolveUserProperties(userId);
    const ownedIds = new Set(properties.map((p) => p.id));
    const request = await db.specialRequest.findUnique({
      where: { id: requestId },
      select: { id: true, propertyId: true, status: true },
    });
    if (!request || !ownedIds.has(request.propertyId)) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }

    const now = new Date();
    const nextStatus =
      action === 'START'
        ? 'in_progress'
        : action === 'COMPLETE'
          ? 'done'
          : action === 'CANCEL'
            ? 'cancelled'
            : 'pending';

    // handledAt : horodaté à la prise en charge ET à la clôture ;
    // réouverture → remis à zéro (le suivi repart de « En attente »).
    const handledAt =
      action === 'REOPEN' ? null : action === 'START' || action === 'COMPLETE' ? now : request.status === 'pending' ? null : undefined;

    await db.specialRequest.update({
      where: { id: requestId },
      data: {
        status: nextStatus,
        ...(handledAt !== undefined ? { handledAt } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      status: nextStatus,
      statusLabel: specialRequestStatusMeta(nextStatus).label,
    });
  } catch (error) {
    console.error('[airbnb/special-requests PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

function emptyCounts() {
  return { pending: 0, inProgress: 0, done: 0, cancelled: 0 };
}
