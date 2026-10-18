import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/audit';

// =============================================================
// v4.32 — NOTIFICATIONS LUES DU MODE HÔTE
// POST /api/public/hub/[slug]/host-read   body: { pin, voiceIds?, complaints? }
//
// Le badge rouge « Réclamations en attente » du Mode Hôte doit
// s'éteindre quand l'hôte a VU la notification — même si la
// réclamation reste ouverte jusqu'à résolution.
//   • voiceIds  : vocaux écoutés dans le dialog → isRead = true
//   • complaints: 'all' (dialog ouvert → tout est vu) ou ids précis
//                 → isRead = true (statut OPEN inchangé)
//
// Sécurité : résolution bien par slug (plaque V1 / qrHubSlug) +
// PIN bcrypt FAIL-CLOSED (même garde que POST /host) + rate limit
// + zod ; never-throw.
// =============================================================

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/, { message: 'PIN invalide' }),
  voiceIds: z.array(z.string().trim().max(60)).max(30).optional(),
  complaints: z.union([z.literal('all'), z.array(z.string().trim().max(60)).max(30)]).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!(await rateLimit(`hubhostread:${slug}:${clientIp(req.headers) ?? 'local'}`, 30))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }
    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const { pin, voiceIds, complaints } = parsed.data;

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

    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { id: true, pinHash: true },
    });
    if (!property) {
      return NextResponse.json({ error: 'Logement non trouvé' }, { status: 404 });
    }
    if (!property.pinHash) {
      return NextResponse.json({ error: "Aucun PIN n'est configuré pour ce logement." }, { status: 403 });
    }
    const isValid = await compare(pin, property.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
    }

    let markedVoices = 0;
    let markedComplaints = 0;

    if (voiceIds && voiceIds.length > 0) {
      const r = await db.voiceMessage.updateMany({
        where: { propertyId: property.id, senderType: 'guest', id: { in: voiceIds } },
        data: { isRead: true },
      });
      markedVoices = r.count;
    }

    if (complaints === 'all') {
      const r = await db.guestComplaint.updateMany({
        where: { propertyId: property.id, status: 'OPEN', isRead: false },
        data: { isRead: true },
      });
      markedComplaints = r.count;
    } else if (complaints && complaints.length > 0) {
      const r = await db.guestComplaint.updateMany({
        where: { propertyId: property.id, status: 'OPEN', id: { in: complaints } },
        data: { isRead: true },
      });
      markedComplaints = r.count;
    }

    return NextResponse.json({ ok: true, markedVoices, markedComplaints });
  } catch (error) {
    console.error('Hub host-read error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
