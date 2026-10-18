// =============================================================
// /api/admin/settings — Module 7 Paramètres
//
// GET : paramètres plateforme + flags + rate limiting (état réel)
// PUT : enregistrement des paramètres (journalisé, audit)
// 🔒 Superadmin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { getPlatformSettings, savePlatformSettings, type PlatformSettings } from '@/lib/settings';
import { getAllFlags } from '@/lib/feature-flags';
import { logAudit, clientIp } from '@/lib/audit';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const [settings, flags] = await Promise.all([getPlatformSettings(), getAllFlags()]);
    return NextResponse.json({
      settings,
      flags,
      rateLimiting: {
        backend: process.env.REDIS_URL ? 'redis' : 'memory',
        redisConfigured: Boolean(process.env.REDIS_URL),
        loginPerMinute: 10,
        registerPerHour: settings.signupHourlyLimit,
        orderPerMinutePerProperty: 10,
        payPerMinutePerOrder: 6,
      },
    });
  } catch (error) {
    console.error('[GET /api/admin/settings] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const body = (await req.json()) as Partial<PlatformSettings>;
    const next = await savePlatformSettings(body, admin.email);
    await logAudit({
      actor: admin,
      action: 'settings.update',
      entityType: 'setting',
      entityId: 'platform',
      details: body as Record<string, unknown>,
      ip: clientIp(req.headers),
    });
    return NextResponse.json({ ok: true, settings: next, message: 'Paramètres enregistrés' });
  } catch (error) {
    console.error('[PUT /api/admin/settings] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
