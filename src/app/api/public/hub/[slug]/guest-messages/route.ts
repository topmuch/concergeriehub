import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/audit';

// =============================================================
// v4.32 — ONGLET « MESSAGES » DE « CONTACTER L'HÔTE »
// GET /api/public/hub/[slug]/guest-messages?ids=id1,id2,...
//
// L'invité qui écrit à son hôte (répondeur vocal) voit désormais
// ses messages EN ATTENTE dans le dialog : cette route renvoie le
// STATUT des messages envoyés depuis son appareil :
//   • isRead=false → « En attente ⏳ » (pas encore consulté par l'hôte)
//   • isRead=true  → « Lu par l'hôte ✓ »
//
// Vie privée : seule la propriété appartient-elle au hub ; seuls des
// STATUTS sont renvoyés (aucun audio, aucun contenu). Les ids proviennent
// du localStorage de l'appareil de l'invité — la route revalide qu'ils
// appartiennent bien à CE hub (anti-énumération : réponse vide sinon).
// Sécurité : rate limit 30/min/slug+IP ; zod ; never-throw.
// =============================================================

const MAX_IDS = 30;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!(await rateLimit(`hubguestmsgs:${slug}:${clientIp(req.headers) ?? 'local'}`, 30))) {
      return NextResponse.json({ error: 'Trop de requêtes. Réessayez dans un instant.' }, { status: 429 });
    }

    const url = new URL(req.url);
    const ids = (url.searchParams.get('ids') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[A-Za-z0-9_-]{6,60}$/.test(s))
      .slice(0, MAX_IDS);
    if (ids.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    // ── Résolution du bien : plaque V1 OU hub du bien (É12) ──
    let propertyId: string | null = null;
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true },
    });
    if (plaque) {
      if (!plaque.isClaimed || !plaque.propertyId) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      propertyId = plaque.propertyId;
    } else {
      const propertyBySlug = await db.property.findUnique({
        where: { qrHubSlug: slug },
        select: { id: true, isActive: true },
      });
      if (!propertyBySlug) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      if (!propertyBySlug.isActive) {
        return NextResponse.json({ error: 'Ce bien a été désactivé par son hôte.' }, { status: 410 });
      }
      propertyId = propertyBySlug.id;
    }

    // Statuts SEULEMENT, revalidés par bien (aucun contenu exposé).
    const rows = await db.voiceMessage.findMany({
      where: { propertyId, id: { in: ids }, senderType: 'guest' },
      select: { id: true, isRead: true, createdAt: true },
    });

    const byId = new Map(rows.map((r) => [r.id, r]));
    const messages = ids.map((id) => {
      const row = byId.get(id);
      return {
        id,
        status: row ? (row.isRead ? 'read' : 'pending') : 'unknown',
        createdAt: row?.createdAt.toISOString() ?? null,
      };
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Hub guest-messages error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
