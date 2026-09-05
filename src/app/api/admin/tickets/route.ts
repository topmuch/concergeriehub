// =============================================================
// /api/admin/tickets — Module 8 : tickets support
// GET  : liste filtrable ?status= ; POST : création manuelle ou
//        depuis un email en échec ?fromEmailId= ; PATCH [id] : statut.
// 🔒 Superadmin. Journalisé (audit) pour les changements de statut.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';

const STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export async function GET(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const status = req.nextUrl.searchParams.get('status') || '';
    const where: Record<string, unknown> = {};
    if (status && STATUSES.includes(status)) where.status = status;

    const [tickets, counts] = await Promise.all([
      db.supportTicket.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
      db.supportTicket.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const statMap = new Map(counts.map((c) => [c.status, c._count._all]));
    return NextResponse.json({
      stats: {
        open: statMap.get('OPEN') ?? 0,
        pending: statMap.get('PENDING') ?? 0,
        resolved: statMap.get('RESOLVED') ?? 0,
        closed: statMap.get('CLOSED') ?? 0,
      },
      data: tickets.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })),
    });
  } catch (error) {
    console.error('[GET /api/admin/tickets] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const body = (await req.json()) as {
      subject?: string;
      email?: string;
      priority?: string;
      body?: string;
      fromEmailId?: string;
    };

    // Création depuis un email en échec (pré-remplissage réel)
    if (body.fromEmailId) {
      const email = await db.emailOutbox.findUnique({
        where: { id: body.fromEmailId },
        select: { id: true, to: true, subject: true, lastError: true },
      });
      if (!email) {
        return NextResponse.json({ error: 'Email source introuvable' }, { status: 404 });
      }
      const ticket = await db.supportTicket.create({
        data: {
          subject: `Email en échec : ${email.subject}`,
          email: email.to,
          priority: 'HIGH',
          body: `Créé depuis l'outbox (${email.id}). Erreur : ${email.lastError ?? 'inconnue'}`,
        },
      });
      return NextResponse.json({ ok: true, ticket });
    }

    const subject = String(body.subject || '').trim();
    const email = String(body.email || '').trim();
    if (subject.length < 3 || !email) {
      return NextResponse.json({ error: 'Sujet (3 car. min.) et email requis' }, { status: 400 });
    }

    const ticket = await db.supportTicket.create({
      data: {
        subject: subject.slice(0, 160),
        email,
        priority: PRIORITIES.includes(body.priority ?? '') ? (body.priority as string) : 'NORMAL',
        body: body.body?.slice(0, 2000) ?? null,
      },
    });
    return NextResponse.json({ ok: true, ticket });
  } catch (error) {
    console.error('[POST /api/admin/tickets] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const body = (await req.json()) as { id?: string; status?: string };
    const id = String(body.id || '');
    const status = String(body.status || '');
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
    }
    const ticket = await db.supportTicket.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 });
    }

    await db.supportTicket.update({ where: { id }, data: { status } });
    await logAudit({
      actor: admin,
      action: 'ticket.status_change',
      entityType: 'support_ticket',
      entityId: id,
      details: { from: ticket.status, to: status },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({ ok: true, message: `Ticket → ${status}` });
  } catch (error) {
    console.error('[PATCH /api/admin/tickets] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
