import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import {
  sendNotificationToMany,
  propertyOwnerAndManagers,
} from '@/lib/notifications';
import { renderHubAlertEmail } from '@/lib/email-template-render';
import { siteUrl } from '@/lib/site';
import { requireHubAccess } from '@/lib/hub-access';
import {
  MEMORY_LIMITS,
  parseMemoryPhotos,
  type GuestMemoryPublic,
} from '@/lib/memories';

// =============================================================
// v4.52 « LIVRE D'OR VIVANT » — mur de souvenirs partagé
// GET  /api/public/hub/[slug]/memories
//   → UNIQUEMENT les souvenirs isPublic && isApproved (modération).
//     Tri : épinglés d'abord, puis date décroissante. Stats incluses
//     (total, note moyenne, photos, vocaux) pour l'en-tête de la
//     galerie. JAMAIS d'email / bookingId dans la réponse publique.
// POST /api/public/hub/[slug]/memories
//   → création d'un souvenir (isApproved:false — pending) + notification
//     hôte UNIFIÉE (cloche + email). Garde verrouillage hub (token) si
//     le hub est protégé, rate limit 4/h/IP, plafonds dataURL stricts.
// Sécurité : lecture publique = preuve sociale (aucune donnée perso) ;
// écriture = derrière le verrou + quotas + tailles bornées.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const memorySchema = z.object({
  guestName: z.string().trim().min(1).max(60),
  guestCountry: z.string().trim().max(60).optional().nullable(),
  rating: z.number().int().min(1).max(5),
  message: z.string().trim().max(MEMORY_LIMITS.maxMessageChars).optional().nullable(),
  photoUrls: z.array(z.string().startsWith('data:').max(MEMORY_LIMITS.maxPhotoChars)).max(MEMORY_LIMITS.maxPhotos).optional(),
  audioUrl: z.string().startsWith('data:').max(MEMORY_LIMITS.maxAudioChars).optional().nullable(),
  isPublic: z.boolean().optional().default(true),
});

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // ── DEMO MODE : souvenirs de démonstration (galerie vitrine) ──
    if (isDemo(slug)) {
      const now = Date.now();
      const day = 86_400_000;
      const demo: GuestMemoryPublic[] = [
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
          hostReply: 'Merci Thomas & Sophie ! Ce fut un plaisir de vous accueillir — la terrasse vous attend pour un prochain coucher de soleil 🌅',
          createdAt: new Date(now - 12 * day).toISOString(),
        },
        {
          id: 'demo-mem-2',
          guestName: 'Marie',
          guestCountry: 'Belgique',
          rating: 5,
          message: 'Vue incroyable au coucher du soleil, maison impeccable et accueil chaleureux. Le guide du hub est ultra pratique !',
          photos: [],
          audioUrl: null,
          isPinned: true,
          hostReply: null,
          createdAt: new Date(now - 26 * day).toISOString(),
        },
        {
          id: 'demo-mem-3',
          guestName: 'Jean-Pierre',
          guestCountry: 'Suisse',
          rating: 5,
          message:
            'La maison est encore plus belle que sur les photos. Le minibar et le service de petit-déjeuner sont un vrai plus.',
          photos: [
            { url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/0e93e11bc7b1.jpg' },
            { url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/847be760d52f.jpg' },
            { url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/d07f319e2629.jpg' },
          ],
          audioUrl: null,
          isPinned: false,
          hostReply: null,
          createdAt: new Date(now - 40 * day).toISOString(),
        },
        {
          id: 'demo-mem-4',
          guestName: 'Famille Dubois',
          guestCountry: 'Canada',
          rating: 5,
          message: 'Les enfants ont adoré la piscine, nous avons adoré la cuisine équipée. Séjour parfait du début à la fin.',
          photos: [{ url: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/62d89f90c6d7.jpg' }],
          audioUrl: null,
          isPinned: false,
          hostReply: null,
          createdAt: new Date(now - 55 * day).toISOString(),
        },
      ];
      return NextResponse.json({
        ok: true,
        memories: demo,
        stats: { total: 37, avg: 4.9, photos: 6, audios: 2, publicRate: 92 },
      });
    }

    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const memories = await db.guestMemory.findMany({
      where: { propertyId: resolved.propertyId, isPublic: true, isApproved: true },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        guestName: true,
        guestCountry: true,
        rating: true,
        message: true,
        photoUrlsJson: true,
        audioUrl: true,
        isPinned: true,
        hostReply: true,
        createdAt: true,
      },
    });

    // Stats globales (tous souvenirs approuvés — y compris privés, pour
    // « X voyageurs ont partagé leur expérience » + taux de publicité).
    const [allApproved, photosCount, audiosCount] = await Promise.all([
      db.guestMemory.aggregate({
        where: { propertyId: resolved.propertyId, isApproved: true },
        _count: { id: true },
        _avg: { rating: true },
      }),
      db.guestMemory.count({
        where: { propertyId: resolved.propertyId, isApproved: true, photoUrlsJson: { not: '[]' } },
      }),
      db.guestMemory.count({
        where: { propertyId: resolved.propertyId, isApproved: true, audioUrl: { not: null } },
      }),
    ]);

    const publicCount = allApproved._count.id;
    const publicRate =
      publicCount > 0
        ? Math.round(
            (await db.guestMemory.count({
              where: { propertyId: resolved.propertyId, isApproved: true, isPublic: true },
            }) / publicCount) * 100,
          )
        : 0;

    return NextResponse.json({
      ok: true,
      memories: memories.map((m) => ({
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
      })) satisfies GuestMemoryPublic[],
      stats: {
        total: publicCount,
        avg: allApproved._avg.rating ? Math.round(allApproved._avg.rating * 10) / 10 : null,
        photos: photosCount,
        audios: audiosCount,
        publicRate,
      },
    });
  } catch (error) {
    await captureError('hub.memories.GET', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez dans un instant.' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // 4 souvenirs / heure / slug+IP — anti-spam.
    if (!(await rateLimit(`hubmemories:${slug}:${clientIp(req)}`, 4))) {
      return NextResponse.json(
        { error: 'Souvenirs déjà envoyés récemment. Merci de patienter un peu.' },
        { status: 429 },
      );
    }

    const rawBody = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = memorySchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Formulaire incomplet — vérifiez votre nom et votre note.' },
        { status: 400 },
      );
    }
    const d = parsed.data;

    // ── DEMO MODE : succès sans écriture (l'invité voit son souvenir
    // « en attente » localement, injecté côté client) ──
    if (isDemo(slug)) {
      return NextResponse.json({
        ok: true,
        demo: true,
        message: 'Merci ! Votre souvenir sera publié après validation par l’hôte.',
      });
    }

    // Garde verrouillage (session hub valide si le hub est protégé).
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
    }

    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }
    const property = await db.property.findUnique({
      where: { id: resolved.propertyId },
      select: { id: true, name: true, owner: { select: { id: true } } },
    });
    if (!property?.owner?.id) {
      return NextResponse.json({ error: 'Ce hub est introuvable.' }, { status: 404 });
    }

    const photos = (d.photoUrls ?? []).map((url) => ({ url }));
    const memory = await db.guestMemory.create({
      data: {
        propertyId: property.id,
        bookingId: access.bookingId,
        guestName: d.guestName,
        guestCountry: d.guestCountry || null,
        rating: d.rating,
        message: d.message || null,
        photoUrlsJson: JSON.stringify(photos),
        audioUrl: d.audioUrl || null,
        isPublic: d.isPublic,
        isApproved: false,
      },
      select: { id: true },
    });

    // Notification hôte UNIFIÉE (cloche + email + push).
    const audience = await propertyOwnerAndManagers(property.id);
    const hubEmail = await renderHubAlertEmail({
      heading: '📖 Nouveau souvenir à valider',
      propertyName: property.name,
      guestName: d.guestName,
      rows: [
        { label: 'Note', value: `${'⭐'.repeat(d.rating)} (${d.rating}/5)` },
        {
          label: 'Contenu',
          value:
            [
              d.message ? 'message' : null,
              photos.length > 0 ? `${photos.length} photo(s)` : null,
              d.audioUrl ? 'vocal' : null,
            ]
              .filter(Boolean)
              .join(' + ') || 'note seule',
        },
        { label: 'Partage', value: d.isPublic ? 'Souvenir public accepté ✓' : 'Souvenir privé' },
      ],
      totalLabel: 'Statut',
      totalValue: 'En attente de validation',
      introNote: 'Un invité a laissé un souvenir dans le Livre d’Or — publiez-le depuis votre espace hôte.',
      ctaLabel: 'Valider le souvenir',
      ctaUrl: `${siteUrl}/airbnb/dashboard`,
      footerNote: 'Email envoyé automatiquement depuis le Hub invité.',
    }).catch(() => null);
    const customEmail = hubEmail
      ? { subject: hubEmail.subject, html: hubEmail.html, text: hubEmail.text }
      : undefined;
    if (audience.length > 0) {
      await sendNotificationToMany(audience, 'guest_memory', {
        title: `📖 Nouveau souvenir à valider — ${property.name}`,
        body: `${d.guestName} a laissé un souvenir ${'⭐'.repeat(d.rating)} — publiez-le dans le Livre d'Or.`,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/dashboard',
        ...(customEmail ? { email: customEmail } : {}),
        meta: {
          source: 'hub',
          guestMemory: true,
          memoryId: memory.id,
          hubSlug: slug,
          guestName: d.guestName,
        },
      });
    } else {
      await db.notification.create({
        data: {
          userId: property.owner.id,
          type: 'guest_memory',
          title: `📖 Nouveau souvenir à valider — ${property.name}`,
          body: `${d.guestName} a laissé un souvenir dans le Livre d'Or.`,
          dataJson: JSON.stringify({ source: 'hub', memoryId: memory.id, hubSlug: slug }),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      message: 'Merci ! Votre souvenir sera publié après validation par l’hôte.',
    });
  } catch (error) {
    await captureError('hub.memories.POST', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez dans un instant.' }, { status: 500 });
  }
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}
