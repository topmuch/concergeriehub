// =============================================================
// /api/admin/logs — Module 8 : journal d'audit + logs de scan
// GET ?type=audit (défaut) | scans
//   audit : AuditLog paginé (filtre ?action= &search=)
//   scans : ScanLog paginé (bien, QR, date, UA) — analytics réels
// 🔒 Superadmin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const type = req.nextUrl.searchParams.get('type') || 'audit';
    const search = req.nextUrl.searchParams.get('search')?.trim() || '';
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 25));

    if (type === 'scans') {
      const where: Record<string, unknown> = {};
      if (search) {
        where.OR = [
          { property: { is: { name: { contains: search } } } },
          { qrCode: { is: { name: { contains: search } } } },
          { visitorIp: { contains: search } },
        ];
      }
      const [logs, total] = await Promise.all([
        db.scanLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            visitorIp: true,
            userAgent: true,
            locale: true,
            referrer: true,
            createdAt: true,
            qrCode: { select: { name: true, type: true } },
            property: { select: { name: true } },
          },
        }),
        db.scanLog.count({ where }),
      ]);
      return NextResponse.json({
        data: logs.map((l) => ({
          id: l.id,
          qrName: l.qrCode?.name ?? '—',
          moduleType: l.qrCode?.type ?? null,
          propertyName: l.property?.name ?? '—',
          visitorIp: l.visitorIp,
          userAgent: l.userAgent,
          locale: l.locale,
          referrer: l.referrer,
          createdAt: l.createdAt.toISOString(),
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
      });
    }

    // ── audit (défaut) ──
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { actorEmail: { contains: search } },
        { action: { contains: search } },
        { entityType: { contains: search } },
        { entityId: { contains: search } },
      ];
    }
    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      data: logs.map((l) => ({
        id: l.id,
        actorEmail: l.actorEmail,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        details: l.detailsJson,
        ip: l.ip,
        createdAt: l.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    console.error('[GET /api/admin/logs] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
