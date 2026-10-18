// =============================================================
// GET /api/airbnb/coach-analytics — COACH ROOMSCAN (v5.5, PHASE 4)
//
// Alimente l'onglet « Analytics » de la page Coach dédiée
// (/airbnb/dashboard/coach) :
//   • `months`  — 12 derniers mois de CoachAnalytics de tous les
//     biens de l'utilisateur, agrégés par (year, month) :
//     insightsGenerated / Resolved / Dismissed, estimatedRevenue,
//     disputesAvoided, adoptionRate (moyenne pondérée).
//   • `summary` — totaux sur la période + taux d'adoption global
//     (resolved / (resolved + dismissed)) et mois en cours.
//   • `typeStats` — répartition par TYPE des insights des 90 derniers
//     jours (actifs + résolus) pour la répartition « Ce que le coach voit ».
// Aucune donnée sensible — compteurs uniquement. Lecture seule.
// =============================================================
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';

export const dynamic = 'force-dynamic';

interface MonthBucket {
  year: number;
  month: number; // 1-12
  label: string; // « oct. 2026 »
  insightsGenerated: number;
  insightsResolved: number;
  insightsDismissed: number;
  estimatedRevenue: number;
  disputesAvoided: number;
  adoptionRate: number; // 0-1
}

const MONTH_LABELS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const properties = await resolveUserProperties(userId);
    if (properties.length === 0) {
      return NextResponse.json({
        months: [],
        summary: {
          insightsGenerated: 0,
          insightsResolved: 0,
          insightsDismissed: 0,
          estimatedRevenue: 0,
          disputesAvoided: 0,
          adoptionRate: 0,
          currentMonth: null as MonthBucket | null,
        },
        typeStats: [],
      });
    }
    const propertyIds = properties.map((p) => p.id);

    // ── 1. 12 derniers mois de CoachAnalytics ──────────────────
    const rows = await db.coachAnalytics.findMany({
      where: { propertyId: { in: propertyIds } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    const now = new Date();
    const buckets = new Map<string, MonthBucket>();
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      buckets.set(key, {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: `${MONTH_LABELS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${String(d.getFullYear()).slice(2)}` : ''}`,
        insightsGenerated: 0,
        insightsResolved: 0,
        insightsDismissed: 0,
        estimatedRevenue: 0,
        disputesAvoided: 0,
        adoptionRate: 0,
      });
    }

    for (const row of rows) {
      const key = `${row.year}-${row.month}`;
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.insightsGenerated += row.insightsGenerated;
      bucket.insightsResolved += row.insightsResolved;
      bucket.insightsDismissed += row.insightsDismissed;
      bucket.estimatedRevenue += row.estimatedRevenue;
      bucket.disputesAvoided += row.disputesAvoided;
    }
    // Adoption pondérée par mois : resolved / (resolved + dismissed).
    for (const bucket of buckets.values()) {
      const denom = bucket.insightsResolved + bucket.insightsDismissed;
      bucket.adoptionRate = denom > 0 ? bucket.insightsResolved / denom : 0;
    }
    const months = Array.from(buckets.values()).sort(
      (a, b) => a.year - b.year || a.month - b.month,
    );

    // ── 2. Totaux + mois en cours ──────────────────────────────
    const summary = months.reduce(
      (acc, m) => {
        acc.insightsGenerated += m.insightsGenerated;
        acc.insightsResolved += m.insightsResolved;
        acc.insightsDismissed += m.insightsDismissed;
        acc.estimatedRevenue += m.estimatedRevenue;
        acc.disputesAvoided += m.disputesAvoided;
        return acc;
      },
      {
        insightsGenerated: 0,
        insightsResolved: 0,
        insightsDismissed: 0,
        estimatedRevenue: 0,
        disputesAvoided: 0,
        adoptionRate: 0,
        currentMonth: null as MonthBucket | null,
      },
    );
    const adoptDenom = summary.insightsResolved + summary.insightsDismissed;
    summary.adoptionRate = adoptDenom > 0 ? summary.insightsResolved / adoptDenom : 0;
    summary.currentMonth =
      months.find((m) => m.year === now.getFullYear() && m.month === now.getMonth() + 1) ?? null;

    // ── 3. Répartition par type (90 derniers jours) ────────────
    const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const recent = await db.dashboardInsight.findMany({
      where: { propertyId: { in: propertyIds }, createdAt: { gte: since } },
      select: { type: true },
    });
    const typeCounts = new Map<string, number>();
    for (const r of recent) {
      typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
    }
    const typeStats = Array.from(typeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ months, summary, typeStats });
  } catch (error) {
    console.error('[coach-analytics] GET error:', error);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
