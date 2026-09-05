// =============================================================
// /api/admin/coupons/[id] — Module 4 : annulation d'un coupon
// PATCH ?action=cancel → status 'cancelled' (journalisé, audit).
// 🔒 Superadmin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;
    const action = req.nextUrl.searchParams.get('action');
    if (action !== 'cancel') {
      return NextResponse.json({ error: 'Action inconnue (cancel)' }, { status: 400 });
    }
    const coupon = await db.coupon.findUnique({ where: { id }, select: { id: true, code: true } });
    if (!coupon) {
      return NextResponse.json({ error: 'Coupon introuvable' }, { status: 404 });
    }

    await db.coupon.update({ where: { id }, data: { status: 'cancelled' } });
    await logAudit({
      actor: admin,
      action: 'coupon.cancel',
      entityType: 'coupon',
      entityId: id,
      details: { code: coupon.code },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({ ok: true, message: `Coupon ${coupon.code} annulé` });
  } catch (error) {
    console.error('[PATCH /api/admin/coupons/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
