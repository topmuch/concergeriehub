// =============================================================
// /api/admin/blacklist — Module 7 Sécurité : blacklist IP
// GET    : liste ; POST : ajout { ip, reason } ; DELETE ?id=
// Appliquée réellement sur login, inscription et paiement
// (cf. lib/security.ts). Journalisé (audit).
// 🔒 Superadmin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/;

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const rows = await db.ipBlacklist.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ data: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) });
  } catch (error) {
    console.error('[GET /api/admin/blacklist] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const body = (await req.json()) as { ip?: string; reason?: string };
    const ip = String(body.ip || '').trim();
    if (!ip || ip.length > 45 || !IP_RE.test(ip)) {
      return NextResponse.json({ error: 'Adresse IP invalide' }, { status: 400 });
    }
    const exists = await db.ipBlacklist.findUnique({ where: { ip } });
    if (exists) {
      return NextResponse.json({ error: 'IP déjà blacklistée' }, { status: 409 });
    }

    const row = await db.ipBlacklist.create({
      data: { ip, reason: body.reason?.slice(0, 200) ?? null },
    });
    await logAudit({
      actor: admin,
      action: 'security.ip_blacklist_add',
      entityType: 'ip_blacklist',
      entityId: ip,
      details: { reason: row.reason },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({ ok: true, entry: { ...row, createdAt: row.createdAt.toISOString() } });
  } catch (error) {
    console.error('[POST /api/admin/blacklist] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    const row = await db.ipBlacklist.findUnique({ where: { ip: id } });
    if (!row) {
      return NextResponse.json({ error: 'Entrée introuvable' }, { status: 404 });
    }
    await db.ipBlacklist.delete({ where: { ip: row.ip } });
    await logAudit({
      actor: admin,
      action: 'security.ip_blacklist_remove',
      entityType: 'ip_blacklist',
      entityId: row.ip,
      ip: clientIp(req.headers),
    });
    return NextResponse.json({ ok: true, message: `IP ${row.ip} retirée de la blacklist` });
  } catch (error) {
    console.error('[DELETE /api/admin/blacklist] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
