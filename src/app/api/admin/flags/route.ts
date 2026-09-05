// =============================================================
// /api/admin/flags — Module 7 : feature flags
// GET : tous les flags (catalogue garanti) ; PUT : bascule réelle.
// Les flags consommés : signups_enabled, marketplace_enabled,
// maintenance_mode (cf. lib/feature-flags.ts pour les points
// d'application réels). Journalisé (audit).
// 🔒 Superadmin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { getAllFlags, setFlagEnabled } from '@/lib/feature-flags';
import { logAudit, clientIp } from '@/lib/audit';

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    return NextResponse.json({ flags: await getAllFlags() });
  } catch (error) {
    console.error('[GET /api/admin/flags] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const body = (await req.json()) as { key?: string; enabled?: boolean };
    const key = String(body.key || '');
    if (!key) return NextResponse.json({ error: 'Clé de flag manquante' }, { status: 400 });

    await setFlagEnabled(key, Boolean(body.enabled));
    await logAudit({
      actor: admin,
      action: 'feature_flag.toggle',
      entityType: 'feature_flag',
      entityId: key,
      details: { enabled: Boolean(body.enabled) },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({ ok: true, message: `Flag ${key} → ${body.enabled ? 'activé' : 'désactivé'}` });
  } catch (error) {
    console.error('[PUT /api/admin/flags] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
