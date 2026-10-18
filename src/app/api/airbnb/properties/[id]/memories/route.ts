import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { parseMemoryPhotos, type GuestMemoryHost } from '@/lib/memories';

// =============================================================
// v4.52 « LIVRE D'OR VIVANT » — MODÉRATION côté HÔTE
// /api/airbnb/properties/[id]/memories
//
// GET → TOUS les souvenirs du bien (y compris non approuvés) + stats.
// PATCH body { memoryId, action, hostReply? } :
//   • 'APPROVE' → publier dans la galerie (isApproved: true)
//   • 'HIDE'    → masquer sans supprimer (isApproved: false)
//   • 'PIN' / 'UNPIN' → coup de cœur épinglé (max 3 conseillés)
//   • 'REPLY'   → réponse de remerciement de l'hôte (hostReply + date)
// DELETE body { memoryId } → suppression définitive.
//
// Sécurité : session OWNER/MANAGER (canManageTeam) — même garde que
// minibar-ops. Anti-abus : 60/min.
// =============================================================

type Ctx = { params: Promise<{ id: string }> };

async function guard(propertyId: string, userId: string | undefined, sessionPresent: boolean) {
  if (!sessionPresent || !userId) return false;
  const myRole = await getUserRoleForProperty(userId, propertyId);
  return !!myRole && canManageTeam(myRole);
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    const { id: propertyId } = await ctx.params;
    if (!(await guard(propertyId, userId, !!session?.user))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const memories = await db.guestMemory.findMany({
      where: { propertyId },
      orderBy: [{ isApproved: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        guestName: true,
        guestCountry: true,
        rating: true,
        message: true,
        photoUrlsJson: true,
        audioUrl: true,
        isPublic: true,
        isApproved: true,
        isPinned: true,
        hostReply: true,
        createdAt: true,
        bookingId: true,
      },
    });

    const serialized: GuestMemoryHost[] = memories.map((m) => ({
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

    const approved = serialized.filter((m) => m.isApproved);
    const stats = {
      total: serialized.length,
      approved: approved.length,
      pending: serialized.length - approved.length,
      avg: approved.length
        ? Math.round((approved.reduce((a, m) => a + m.rating, 0) / approved.length) * 10) / 10
        : null,
      photos: approved.filter((m) => m.photos.length > 0).length,
      audios: approved.filter((m) => !!m.audioUrl).length,
      publicRate: approved.length
        ? Math.round((approved.filter((m) => m.isPublic).length / approved.length) * 100)
        : 0,
    };

    return NextResponse.json({ memories: serialized, stats });
  } catch (error) {
    console.error('[airbnb/properties/[id]/memories GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

const patchSchema = z.object({
  memoryId: z.string().min(1),
  action: z.enum(['APPROVE', 'HIDE', 'PIN', 'UNPIN', 'REPLY']),
  hostReply: z.string().trim().max(500).optional().nullable(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    const { id: propertyId } = await ctx.params;
    if (!(await guard(propertyId, userId, !!session?.user))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }
    const { memoryId, action, hostReply } = parsed.data;

    const memory = await db.guestMemory.findFirst({
      where: { id: memoryId, propertyId },
      select: { id: true },
    });
    if (!memory) {
      return NextResponse.json({ error: 'Souvenir introuvable' }, { status: 404 });
    }

    switch (action) {
      case 'APPROVE':
        await db.guestMemory.update({ where: { id: memoryId }, data: { isApproved: true } });
        break;
      case 'HIDE':
        await db.guestMemory.update({ where: { id: memoryId }, data: { isApproved: false, isPinned: false } });
        break;
      case 'PIN':
        await db.guestMemory.update({ where: { id: memoryId }, data: { isPinned: true, isApproved: true } });
        break;
      case 'UNPIN':
        await db.guestMemory.update({ where: { id: memoryId }, data: { isPinned: false } });
        break;
      case 'REPLY':
        if (!hostReply) {
          return NextResponse.json({ error: 'Réponse vide' }, { status: 400 });
        }
        await db.guestMemory.update({
          where: { id: memoryId },
          data: { hostReply, hostReplyAt: new Date() },
        });
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[airbnb/properties/[id]/memories PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    const { id: propertyId } = await ctx.params;
    if (!(await guard(propertyId, userId, !!session?.user))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { memoryId?: string };
    if (!body.memoryId) {
      return NextResponse.json({ error: 'memoryId requis' }, { status: 400 });
    }

    const memory = await db.guestMemory.findFirst({
      where: { id: body.memoryId, propertyId },
      select: { id: true },
    });
    if (!memory) {
      return NextResponse.json({ error: 'Souvenir introuvable' }, { status: 404 });
    }

    await db.guestMemory.delete({ where: { id: memory.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[airbnb/properties/[id]/memories DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
