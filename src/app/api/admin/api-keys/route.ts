// =============================================================
// /api/admin/api-keys — Module 7 Sécurité : clés d'API externes
//
// GET    : liste (préfixe only — la clé en clair n'est jamais stockée)
// POST   : crée une clé → { plaintext } renvoyé UNE SEULE FOIS
// DELETE : révoque (?id=…)
// 🔒 Superadmin. Journalisé (audit).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { createApiKey } from '@/lib/api-keys';
import { logAudit, clientIp } from '@/lib/audit';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const keys = await db.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json({
      data: keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix + '…',
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        revoked: k.revokedAt !== null,
      })),
    });
  } catch (error) {
    console.error('[GET /api/admin/api-keys] Error:', error);
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
    const body = (await req.json()) as { name?: string };
    const name = String(body.name || '').trim();
    if (name.length < 2) {
      return NextResponse.json({ error: 'Nom de clé requis (2 caractères min.)' }, { status: 400 });
    }

    const created = await createApiKey(name, admin.email);
    await logAudit({
      actor: admin,
      action: 'api_key.create',
      entityType: 'api_key',
      entityId: created.id,
      details: { name, prefix: created.prefix },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({
      ok: true,
      key: { id: created.id, name, prefix: created.prefix + '…' },
      // Affichée une seule fois — copiée maintenant, jamais récupérable
      plaintext: created.plaintext,
    });
  } catch (error) {
    console.error('[POST /api/admin/api-keys] Error:', error);
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
    const key = await db.apiKey.findUnique({ where: { id }, select: { id: true, name: true, revokedAt: true } });
    if (!key) {
      return NextResponse.json({ error: 'Clé introuvable' }, { status: 404 });
    }
    if (key.revokedAt) {
      return NextResponse.json({ error: 'Clé déjà révoquée' }, { status: 400 });
    }

    await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await logAudit({
      actor: admin,
      action: 'api_key.revoke',
      entityType: 'api_key',
      entityId: id,
      details: { name: key.name },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({ ok: true, message: `Clé « ${key.name} » révoquée` });
  } catch (error) {
    console.error('[DELETE /api/admin/api-keys] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
