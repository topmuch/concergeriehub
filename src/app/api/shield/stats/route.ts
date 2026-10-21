// =============================================================
// /api/shield/stats — BOUCLIER V2 · Tableau de bord (design
// « dashboard premium » validé client : KPI donuts, cartes
// gradient, aire 14 jours, barres hebdo, donut répartition,
// timeline des prochains événements, derniers séjours).
//
// GET : agrégats RÉELS de l'abonnement courant (guard
// resolveShieldAccess — même entitlement que le module EDL).
// Les sessions planifiées A_VENIR dont la date est dépassée
// sont comptées EN_RETARD (calcul à la volée, zéro cron).
// =============================================================
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveShieldAccess } from '@/lib/shield-access';

export const dynamic = 'force-dynamic';

type SessionLite = {
  type: string;
  status: string;
  scheduledDate: Date | null;
  completedAt: Date;
};

/** Statut effectif : A_VENIR dont la date est dépassée → EN_RETARD. */
function effectiveStatus(s: Pick<SessionLite, 'status' | 'scheduledDate'>): string {
  if (s.status === 'A_VENIR' && s.scheduledDate && s.scheduledDate.getTime() < Date.now()) {
    return 'EN_RETARD';
  }
  return s.status;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export async function GET() {
  try {
    const access = await resolveShieldAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
    }

    const now = new Date();
    const nowMs = now.getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    // ── 1. Données brutes (volumes faibles : agrégation en JS) ──
    const [propertiesCount, subscription, allSessions] = await Promise.all([
      db.shieldProperty.count({ where: { subscriptionId: access.subscriptionId } }),
      db.inspectionSubscription.findUnique({ where: { id: access.subscriptionId } }),
      db.shieldSession.findMany({
        where: {
          status: { not: 'ANNULE' },
          property: { subscriptionId: access.subscriptionId },
        },
        select: { type: true, status: true, scheduledDate: true, completedAt: true },
      }),
    ]);

    // ── 2. Compteurs par statut effectif ──
    let aVenir = 0;
    let enRetard = 0;
    let termine = 0;
    for (const s of allSessions) {
      const st = effectiveStatus(s);
      if (st === 'A_VENIR') aVenir += 1;
      else if (st === 'EN_RETARD') enRetard += 1;
      else if (st === 'TERMINE') termine += 1;
    }

    const checkInsTotal = allSessions.filter((s) => s.type === 'CHECK_IN' && s.status === 'TERMINE').length;
    const checkOutsTotal = allSessions.filter((s) => s.type === 'CHECK_OUT' && s.status === 'TERMINE').length;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sessionsCeMois = allSessions.filter(
      (s) => s.status === 'TERMINE' && s.completedAt.getTime() >= monthStart.getTime(),
    ).length;

    // Taux de protection : part des séjours planifiés effectivement
    // terminés (KPI donut « protection » du tableau de bord).
    const planifies = termine + aVenir + enRetard;
    const tauxProtection = planifies === 0 ? 0 : Math.round((termine / planifies) * 100);

    // ── 3. Série 14 jours (check-ins vs check-outs terminés) ──
    const series14: { date: string; label: string; checkins: number; checkouts: number }[] = [];
    const days = new Map<string, { checkins: number; checkouts: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = startOfDay(new Date(nowMs - i * dayMs));
      const key = d.toISOString().slice(0, 10);
      days.set(key, { checkins: 0, checkouts: 0 });
      series14.push({ date: key, label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, checkins: 0, checkouts: 0 });
    }
    for (const s of allSessions) {
      if (s.status !== 'TERMINE') continue;
      const ref = s.scheduledDate ?? s.completedAt;
      const key = startOfDay(ref).toISOString().slice(0, 10);
      const bucket = days.get(key);
      if (!bucket) continue;
      if (s.type === 'CHECK_IN') bucket.checkins += 1;
      else if (s.type === 'CHECK_OUT') bucket.checkouts += 1;
    }
    for (const row of series14) {
      const b = days.get(row.date);
      if (b) {
        row.checkins = b.checkins;
        row.checkouts = b.checkouts;
      }
    }

    // ── 4. Barres 8 semaines (empilées) ──
    const mondayOf = (d: Date) => {
      const m = startOfDay(d);
      const dow = (m.getDay() + 6) % 7; // lundi = 0
      return new Date(m.getTime() - dow * dayMs);
    };
    const weeks: { label: string; checkins: number; checkouts: number }[] = [];
    const weekMap = new Map<string, { checkins: number; checkouts: number }>();
    for (let i = 7; i >= 0; i--) {
      const m = mondayOf(new Date(nowMs - i * 7 * dayMs));
      const key = m.toISOString().slice(0, 10);
      weekMap.set(key, { checkins: 0, checkouts: 0 });
      weeks.push({ label: `${pad(m.getDate())}/${pad(m.getMonth() + 1)}`, checkins: 0, checkouts: 0 });
    }
    for (const s of allSessions) {
      if (s.status !== 'TERMINE') continue;
      const ref = s.scheduledDate ?? s.completedAt;
      const wk = mondayOf(ref);
      const key = wk.toISOString().slice(0, 10);
      const bucket = weekMap.get(key);
      if (!bucket) continue;
      if (s.type === 'CHECK_IN') bucket.checkins += 1;
      else if (s.type === 'CHECK_OUT') bucket.checkouts += 1;
    }
    for (let i = 0; i < weeks.length; i++) {
      const key = mondayOf(new Date(nowMs - (7 - i) * 7 * dayMs)).toISOString().slice(0, 10);
      const b = weekMap.get(key);
      if (b) {
        weeks[i].checkins = b.checkins;
        weeks[i].checkouts = b.checkouts;
      }
    }

    // ── 5. Prochains événements (timeline) + derniers séjours (tableau) ──
    const [upcoming, recent] = await Promise.all([
      db.shieldSession.findMany({
        where: { status: 'A_VENIR', property: { subscriptionId: access.subscriptionId } },
        orderBy: { scheduledDate: 'asc' },
        take: 6,
        select: {
          id: true,
          type: true,
          guestName: true,
          scheduledDate: true,
          createdAt: true,
          sessionRef: true,
          property: { select: { propertyName: true, city: true } },
        },
      }),
      db.shieldSession.findMany({
        where: { status: 'TERMINE', property: { subscriptionId: access.subscriptionId } },
        orderBy: { completedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          type: true,
          guestName: true,
          agentName: true,
          completedAt: true,
          sessionRef: true,
          _count: { select: { shots: true } },
          video: { select: { publicToken: true } },
          property: { select: { propertyName: true } },
        },
      }),
    ]);

    return NextResponse.json({
      kpis: {
        properties: propertiesCount,
        aVenir,
        enRetard,
        termine,
        checkInsTotal,
        checkOutsTotal,
        sessionsCeMois,
        tauxProtection,
      },
      repartition: [
        { name: 'À venir', value: aVenir, color: '#f59e0b' },
        { name: 'En retard', value: enRetard, color: '#dc2626' },
        { name: 'Terminés', value: termine, color: '#059669' },
      ],
      series14,
      weeks,
      upcoming: upcoming.map((s) => ({
        id: s.id,
        type: s.type,
        guestName: s.guestName,
        scheduledDate: (s.scheduledDate ?? s.createdAt).toISOString(),
        sessionRef: s.sessionRef,
        propertyName: s.property.propertyName,
        city: s.property.city,
      })),
      recent: recent.map((s) => ({
        id: s.id,
        type: s.type,
        guestName: s.guestName,
        agentName: s.agentName,
        completedAt: s.completedAt.toISOString(),
        sessionRef: s.sessionRef,
        shots: s._count.shots,
        videoToken: s.video?.publicToken ?? null,
        propertyName: s.property.propertyName,
      })),
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            endDate: subscription.endDate.toISOString(),
          }
        : null,
    });
  } catch (err) {
    console.error('[shield/stats] error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
