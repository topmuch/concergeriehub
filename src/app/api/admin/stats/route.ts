import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/admin/stats — Dashboard statistics
export async function GET() {
  try {
    // Run independent queries in parallel for speed
    const [
      totalBatches,
      totalPhysicalQrs,
      activeQrCount,
      inactiveQrCount,
      lostQrCount,
      cancelledQrCount,
      totalUsers,
      totalHomes,
      totalDynamicQrCodes,
      recentBatches,
      recentUsers,
      activationRecords,
      moduleDistributionRaw,
      qrStatusDistributionRaw,
    ] = await Promise.all([
      // 1. Total batches
      db.qrBatch.count(),

      // 2. Total physical QR codes
      db.physicalQrCode.count(),

      // 3. Active QR count
      db.physicalQrCode.count({ where: { status: 'active' } }),

      // 4. Inactive QR count
      db.physicalQrCode.count({ where: { status: 'inactive' } }),

      // 5. Lost QR count
      db.physicalQrCode.count({ where: { status: 'lost' } }),

      // 6. Cancelled QR count
      db.physicalQrCode.count({ where: { status: 'cancelled' } }),

      // 7. Total users
      db.user.count(),

      // 8. Total homes
      db.home.count(),

      // 9. Total dynamic QR codes
      db.qrCode.count(),

      // 10. Recent 5 batches
      db.qrBatch.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          _count: { select: { physicalQrCodes: true } },
          physicalQrCodes: { select: { status: true } },
        },
      }),

      // 11. Recent 5 users
      db.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),

      // 12. All activated QR codes from last 30 days (for trend grouping in JS)
      db.physicalQrCode.findMany({
        where: {
          activatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { activatedAt: true },
      }),

      // 13. Module distribution — group QR codes by type
      db.qrCode.groupBy({
        by: ['type'],
        _count: { type: true },
      }),

      // 14. QR status distribution for pie chart
      db.physicalQrCode.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
    ]);

    // ---- Activation trend (group by date in JS for SQLite compat) ----
    const trendMap = new Map<string, number>();
    const now = new Date();

    // Pre-fill all 30 days so empty days show as 0
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      trendMap.set(key, 0);
    }

    for (const record of activationRecords) {
      if (record.activatedAt) {
        const key = record.activatedAt.toISOString().slice(0, 10);
        trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
      }
    }

    const activationTrend = Array.from(trendMap.entries()).map(
      ([date, count]) => ({ date, count }),
    );

    // ---- Module distribution ----
    const moduleDistribution = moduleDistributionRaw.map((entry) => ({
      name: entry.type,
      count: entry._count.type,
    }));

    // ---- QR Status distribution ----
    const statusLabels: Record<string, string> = {
      active: 'Actifs',
      inactive: 'Inactifs',
      lost: 'Perdus',
      cancelled: 'Annulés',
    };
    const qrStatusDistribution = qrStatusDistributionRaw.map((entry) => ({
      name: statusLabels[entry.status] || entry.status,
      value: entry._count.status,
    }));

    return NextResponse.json({
      totalBatches,
      totalPhysicalQrs,
      totalPhysicalQr: totalPhysicalQrs,
      activeQrCount,
      activatedQr: activeQrCount,
      inactiveQrCount,
      lostQrCount,
      cancelledQrCount,
      totalUsers,
      totalHomes,
      totalDynamicQrCodes,
      activationTrend,
      moduleDistribution,
      qrStatusDistribution,
      recentBatches,
      recentUsers,
    });
  } catch (error) {
    console.error('[GET /api/admin/stats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 },
    );
  }
}
