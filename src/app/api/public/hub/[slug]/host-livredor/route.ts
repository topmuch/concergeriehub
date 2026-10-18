import { NextResponse } from 'next/server';
import { z } from 'zod';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { clientIp } from '@/lib/audit';
import { parseMemoryPhotos, type GuestMemoryHost, type MiddleStayRequestHost } from '@/lib/memories';

// =============================================================
// v4.52 « LIVRE D'OR VIVANT + MIDDLE-STAY CARE » — espace HÔTE du hub
// /api/public/hub/[slug]/host-livredor  (protégé par le PIN du bien)
//
// POST body { pin }                          → GET-like : listes + stats
// POST body { pin, memoryId, action, ... }   → modération souvenirs
//   action : APPROVE | HIDE | PIN | UNPIN | REPLY | DELETE
// POST body { pin, requestId, msAction }     → suivi middle-stay
//   msAction : START | COMPLETE | REOPEN
//
// Même garde que /host : bcrypt(pin, pinHash), fail-closed, anti
// brute-force, rate limit 90/min. Un seul aller-retour pour
// rafraîchir toute la modération après une action.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  memoryId: z.string().optional(),
  requestId: z.string().optional(),
  action: z.enum(['APPROVE', 'HIDE', 'PIN', 'UNPIN', 'REPLY', 'DELETE']).optional(),
  msAction: z.enum(['START', 'COMPLETE', 'REOPEN']).optional(),
  hostReply: z.string().trim().max(500).optional().nullable(),
});

async function loadHostData(propertyId: string) {
  const [memories, middleStay] = await Promise.all([
    db.guestMemory.findMany({
      where: { propertyId },
      orderBy: [{ isApproved: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    }),
    db.middleStayRequest.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
  ]);

  const memoriesHost: GuestMemoryHost[] = memories.map((m) => ({
    id: m.id,
    guestName: m.guestName,
    guestCountry: m.guestCountry,
    rating: m.rating,
    message: m.message,
    photos: parseMemoryPhotos(m.photoUrlsJson),
    audioUrl: m.audioUrl,
    isPinned: m.isPinned,
    hostReply: m.hostReply,
    createdAt: m.createdAt.toISOString(),
    isPublic: m.isPublic,
    isApproved: m.isApproved,
    bookingId: m.bookingId,
  }));

  const approved = memoriesHost.filter((m) => m.isApproved);
  const stats = {
    total: memoriesHost.length,
    approved: approved.length,
    pending: memoriesHost.length - approved.length,
    avg: approved.length
      ? Math.round((approved.reduce((a, m) => a + m.rating, 0) / approved.length) * 10) / 10
      : null,
    photos: approved.filter((m) => m.photos.length > 0).length,
    audios: approved.filter((m) => !!m.audioUrl).length,
    publicRate: approved.length
      ? Math.round((approved.filter((m) => m.isPublic).length / approved.length) * 100)
      : 0,
  };

  const middleStayHost: MiddleStayRequestHost[] = middleStay.map((r) => ({
    id: r.id,
    guestName: r.guestName,
    requestType: r.requestType,
    details: r.details,
    status: r.status,
    assignedTo: r.assignedTo,
    price: r.price,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }));

  return {
    memories: memoriesHost,
    stats,
    middleStay: middleStayHost,
    middleStayCounts: {
      pending: middleStayHost.filter((r) => r.status === 'pending').length,
      inProgress: middleStayHost.filter((r) => r.status === 'in_progress').length,
      completed: middleStayHost.filter((r) => r.status === 'completed').length,
    },
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }
    const { pin, memoryId, requestId, action, msAction, hostReply } = parsed.data;

    // Anti-abus (même clé que le mode hôte, quota large pour la modération).
    if (!(await rateLimit(`hubhostpin:${slug}:${clientIp(req.headers) ?? 'local'}`, 90))) {
      return NextResponse.json({ error: 'Trop de requêtes. Patientez un instant.' }, { status: 429 });
    }

    // ── DEMO MODE : données de démonstration, actions sans écriture
    // (chaque réponse renvoie les listes complètes — le client les
    // remplace telles quelles, aucune dérive possible). ──
    if (isDemo(slug)) {
      const demo = loadDemoData();
      if (memoryId && action) {
        return NextResponse.json({
          ok: true,
          demo: true,
          message:
            action === 'APPROVE'
              ? 'Souvenir publié (mode démo).'
              : action === 'DELETE'
                ? 'Souvenir supprimé (mode démo).'
                : 'Modification appliquée (mode démo).',
          ...demo,
        });
      }
      if (requestId && msAction) {
        return NextResponse.json({ ok: true, demo: true, message: 'Statut mis à jour (mode démo).', ...demo });
      }
      return NextResponse.json({ ok: true, ...demo });
    }

    // Résolution du bien (plaque OU slug du bien) — même logique que /host.
    const plaque = await db.physicalQrCode.findUnique({ where: { hubSlug: slug } });
    const propertyId = plaque?.propertyId
      ? plaque.propertyId
      : (await db.property.findUnique({ where: { qrHubSlug: slug }, select: { id: true } }))?.id;
    if (!propertyId) {
      return NextResponse.json({ error: 'Ce hub est introuvable.' }, { status: 404 });
    }

    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { id: true, pinHash: true },
    });
    if (!property?.pinHash) {
      return NextResponse.json(
        { error: "Aucun PIN n'est configuré pour ce logement." },
        { status: 403 },
      );
    }
    const isValid = await compare(pin, property.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
    }

    // ── Action modération souvenir ──
    if (memoryId && action) {
      const memory = await db.guestMemory.findFirst({
        where: { id: memoryId, propertyId: property.id },
        select: { id: true },
      });
      if (!memory) {
        return NextResponse.json({ error: 'Souvenir introuvable' }, { status: 404 });
      }
      if (action === 'APPROVE') {
        await db.guestMemory.update({ where: { id: memoryId }, data: { isApproved: true } });
      } else if (action === 'HIDE') {
        await db.guestMemory.update({
          where: { id: memoryId },
          data: { isApproved: false, isPinned: false },
        });
      } else if (action === 'PIN') {
        await db.guestMemory.update({
          where: { id: memoryId },
          data: { isPinned: true, isApproved: true },
        });
      } else if (action === 'UNPIN') {
        await db.guestMemory.update({ where: { id: memoryId }, data: { isPinned: false } });
      } else if (action === 'REPLY') {
        if (!hostReply) {
          return NextResponse.json({ error: 'Réponse vide' }, { status: 400 });
        }
        await db.guestMemory.update({
          where: { id: memoryId },
          data: { hostReply, hostReplyAt: new Date() },
        });
      } else if (action === 'DELETE') {
        await db.guestMemory.delete({ where: { id: memoryId } });
      }
    }

    // ── Action suivi middle-stay ──
    if (requestId && msAction) {
      const request = await db.middleStayRequest.findFirst({
        where: { id: requestId, propertyId: property.id },
        select: { id: true },
      });
      if (!request) {
        return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
      }
      if (msAction === 'START') {
        await db.middleStayRequest.update({ where: { id: requestId }, data: { status: 'in_progress' } });
      } else if (msAction === 'COMPLETE') {
        await db.middleStayRequest.update({
          where: { id: requestId },
          data: { status: 'completed', completedAt: new Date() },
        });
      } else {
        await db.middleStayRequest.update({
          where: { id: requestId },
          data: { status: 'pending', completedAt: null },
        });
      }
    }

    const data = await loadHostData(property.id);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    await captureError('hub.host-livredor', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/* ── Données de démonstration (hub vitrine) ───────────────────── */

function loadDemoData() {
  const now = Date.now();
  const day = 86_400_000;
  const memories: GuestMemoryHost[] = [
    {
      id: 'demo-mem-1',
      guestName: 'Thomas & Sophie',
      guestCountry: 'France',
      rating: 5,
      message:
        'Séjour magique dans cette villa. La vue au coucher du soleil est à couper le souffle — nous reviendrons sans hésiter !',
      photos: [{ url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/4c4f707615ba.jpg' }],
      audioUrl: null,
      isPinned: true,
      hostReply: 'Merci Thomas & Sophie ! Ce fut un plaisir de vous accueillir 🌅',
      createdAt: new Date(now - 12 * day).toISOString(),
      isPublic: true,
      isApproved: true,
      bookingId: null,
    },
    {
      id: 'demo-mem-2',
      guestName: 'Marie',
      guestCountry: 'Belgique',
      rating: 5,
      message: 'Vue incroyable au coucher du soleil, maison impeccable et accueil chaleureux.',
      photos: [],
      audioUrl: null,
      isPinned: true,
      hostReply: null,
      createdAt: new Date(now - 26 * day).toISOString(),
      isPublic: true,
      isApproved: true,
      bookingId: null,
    },
    {
      id: 'demo-mem-pending-1',
      guestName: 'Camille',
      guestCountry: 'France',
      rating: 4,
      message: 'Très beau séjour en famille — le guide du hub nous a bien aidés !',
      photos: [],
      audioUrl: null,
      isPinned: false,
      hostReply: null,
      createdAt: new Date(now - 2 * day).toISOString(),
      isPublic: true,
      isApproved: false,
      bookingId: null,
    },
  ];
  return {
    memories,
    stats: { total: 37, approved: 36, pending: 1, avg: 4.9, photos: 6, audios: 2, publicRate: 92 },
    middleStay: [
      {
        id: 'demo-ms-1',
        guestName: 'Marie',
        requestType: 'restock',
        details: 'Besoin de 4 serviettes propres et de papier toilette, merci !',
        status: 'pending',
        assignedTo: null,
        price: null,
        createdAt: new Date(now - 5 * 3_600_000).toISOString(),
        completedAt: null,
      },
      {
        id: 'demo-ms-2',
        guestName: 'Thomas & Sophie',
        requestType: 'cleaning',
        details: 'Ménage du salon et de la cuisine si possible vendredi matin.',
        status: 'in_progress',
        assignedTo: 'Équipe Sandrine',
        price: 35,
        createdAt: new Date(now - 30 * 3_600_000).toISOString(),
        completedAt: null,
      },
    ] satisfies MiddleStayRequestHost[],
    middleStayCounts: { pending: 1, inProgress: 1, completed: 0 },
  };
}
