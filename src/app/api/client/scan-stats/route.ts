import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { searchParams } = new URL(req.url);
    const qrCodeId = searchParams.get('qrCodeId');
    const homeId = searchParams.get('homeId');

    if (!qrCodeId && !homeId) {
      return NextResponse.json({ error: 'qrCodeId ou homeId requis' }, { status: 400 });
    }

    // Verify user owns the home or the QR code belongs to their home
    let effectiveHomeId = homeId;
    if (qrCodeId && !homeId) {
      const qr = await db.qrCode.findUnique({
        where: { id: qrCodeId },
        select: { homeId: true },
      });
      if (!qr) return NextResponse.json({ error: 'QR code introuvable' }, { status: 404 });
      effectiveHomeId = qr.homeId;
    }

    if (effectiveHomeId) {
      const membership = await db.homeMember.findFirst({
        where: { homeId: effectiveHomeId, userId },
      });
      const homeOwner = await db.home.findFirst({
        where: { id: effectiveHomeId, ownerId: userId },
      });
      if (!membership && !homeOwner) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
      }
    }

    const whereClause: Record<string, unknown> = {};
    if (qrCodeId) whereClause.qrCodeId = qrCodeId;
    if (effectiveHomeId) whereClause.homeId = effectiveHomeId;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // Monday
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(startOfDay);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    // Run all count queries in parallel
    const [totalScans, scansToday, scansThisWeek, scansThisMonth, recentScans, dailyScansRaw, topLocalesRaw] =
      await Promise.all([
        // Total scans
        db.scanLog.count({ where: whereClause }),
        // Scans today
        db.scanLog.count({
          where: { ...whereClause, createdAt: { gte: startOfDay } },
        }),
        // Scans this week
        db.scanLog.count({
          where: { ...whereClause, createdAt: { gte: startOfWeek } },
        }),
        // Scans this month
        db.scanLog.count({
          where: { ...whereClause, createdAt: { gte: startOfMonth } },
        }),
        // Recent scans (last 20)
        db.scanLog.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            createdAt: true,
            userAgent: true,
            locale: true,
          },
        }),
        // Daily scans (last 30 days)
        db.scanLog.findMany({
          where: {
            ...whereClause,
            createdAt: { gte: thirtyDaysAgo },
          },
          select: {
            createdAt: true,
          },
        }),
        // All locales for top locales
        db.scanLog.findMany({
          where: whereClause,
          select: {
            locale: true,
          },
        }),
      ]);

    // Build daily scans array
    const dailyMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(startOfDay);
      d.setDate(d.getDate() - (29 - i));
      dailyMap.set(d.toISOString().split('T')[0], 0);
    }
    for (const scan of dailyScansRaw) {
      const key = scan.createdAt.toISOString().split('T')[0];
      dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
    }
    const dailyScans = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));

    // Build top locales
    const localeMap = new Map<string, number>();
    for (const scan of topLocalesRaw) {
      const loc = scan.locale || 'inconnu';
      localeMap.set(loc, (localeMap.get(loc) || 0) + 1);
    }
    const topLocales = Array.from(localeMap.entries())
      .map(([locale, count]) => ({ locale, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      totalScans,
      scansToday,
      scansThisWeek,
      scansThisMonth,
      dailyScans,
      recentScans: recentScans.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        userAgent: s.userAgent || '',
        locale: s.locale || '',
      })),
      topLocales,
    });
  } catch (error) {
    console.error('[scan-stats] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
