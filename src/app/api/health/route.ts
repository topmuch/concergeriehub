// =============================================================
// /api/health — Health-check production (AUD-FULL / FIX-7)
//
// Vérifie que le process répond ET que la base est joignable
// (ping Prisma). Utilisable par Coolify/UptimeRobot/K8s probes.
// Aucune donnée sensible exposée — statut + latence seulement.
// =============================================================
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      database: 'up',
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[health] Database ping failed:', error);
    return NextResponse.json(
      {
        status: 'error',
        database: 'down',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
