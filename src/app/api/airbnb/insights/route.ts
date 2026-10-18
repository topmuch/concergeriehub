// =============================================================
// GET /api/airbnb/insights — COACH ROOMSCAN (v5.4)
// Retourne les insights actifs du bien (scope : un bien ou 'all').
//   - Insights récents (< 1 h) non résolus → renvoyés en cache
//     (fresh: false) — pas de régénération inutile.
//   - Sinon → génération via le moteur (src/lib/insight-engine.ts),
//     persistance du top 10 PAR BIEN (dédupliqué contre les non
//     résolus existants), notification PUSH + EMAIL des CRITICAL
//     (sendNotificationToMany, filtrée par CoachPreferences) et
//     incrément des CoachAnalytics du mois.
// Query params :
//   propertyId     — id du bien (absent / 'all' = tous les biens)
//   refresh=1      — force la régénération (bouton Actualiser)
//   context=xxx    — filtre serveur sur actionUrl (insights contextuels)
//   includeResolved=1 — ajoute l'historique résolu (page Coach, 90 j)
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';
import { generateInsights } from '@/lib/insight-engine';
import { sendNotificationToMany, propertyOwnerAndManagers } from '@/lib/notifications';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 h
const CRITICAL_FORCE = true; // les urgences passent (push + email)
// v5.6 — COOLDOWN DE CLÔTURE : une recommandation « Traité » ou
// « Passée » ne doit PAS ressusciter à la régénération suivante. Le
// moteur étant déterministe (mêmes données → mêmes titres), on exclut
// 14 jours les titres récemment clôturés de la déduplication.
const CLOSED_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

// v5.7 — CLÉ DE DÉDUP TOLÉRANTE : certains titres contiennent une
// VARIABLE (température « Belle journée demain (28°C) », pourcentage
// « Baisse d'occupation de 43 % », produit star…). Une régénération
// avec une valeur différente produisait un titre « nouveau » qui
// échappait au cooldown → la recommandation clôturée ressuscitait.
// On normalise : minuscules + SUPPRESSION DES CHIFFRES + espaces
// compactés — « Baisse d'occupation de 43% » ≡ « Baisse d'occupation de 51% ».
const titleKey = (title: string): string =>
  title
    .toLowerCase()
    .replace(/\d/g, '')
    .replace(/[’']\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Audience critique filtrée par les CoachPreferences de chacun. */
async function filterCriticalAudience(propertyId: string, userIds: string[]): Promise<string[]> {
  const keep: string[] = [];
  for (const userId of userIds) {
    try {
      const prefs = await db.coachPreferences.findUnique({
        where: { userId },
        select: { enableCriticalPush: true, enableCriticalEmail: true },
      });
      // Pas de préférences = défauts (push + email activés) → on envoie.
      if (!prefs || prefs.enableCriticalPush || prefs.enableCriticalEmail) keep.push(userId);
    } catch {
      keep.push(userId);
    }
  }
  return keep;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const properties = await resolveUserProperties(userId);
    if (properties.length === 0) {
      return NextResponse.json({ insights: [], fresh: false, scope: 'all', property: null });
    }

    const { searchParams } = new URL(req.url);
    const requestedId = searchParams.get('propertyId');
    const forceRefresh = searchParams.get('refresh') === '1';
    const context = searchParams.get('context');
    const includeResolved = searchParams.get('includeResolved') === '1';
    const scopeAll = !requestedId || requestedId === 'all';
    const target = scopeAll ? null : properties.find((p) => p.id === requestedId) ?? properties[0];
    const targetIds = target ? [target.id] : properties.map((p) => p.id);
    const propertyNameOf = (id: string) => properties.find((p) => p.id === id)?.name ?? 'Bien';
    const now = new Date();

    // 1. Insights actifs existants (non résolus, non expirés).
    const existing = await db.dashboardInsight.findMany({
      where: {
        propertyId: { in: targetIds },
        isResolved: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 60,
    });

    // 2. Cache : s'il existe déjà des insights créés < 1 h → réponse directe.
    //    v5.6 — on compte AUSSI les insights fraîchement clôturés : sans
    //    ça, résoudre la dernière recommandation active (existing vide)
    //    relançait une régénération à CHAQUE chargement de page.
    const recentCutoff = new Date(now.getTime() - CACHE_TTL_MS);
    const freshAny = await db.dashboardInsight.findFirst({
      where: { propertyId: { in: targetIds }, createdAt: { gte: recentCutoff } },
      select: { id: true },
    });
    const hasFresh =
      existing.some((i) => i.createdAt >= recentCutoff) || freshAny !== null;
    if (hasFresh && !forceRefresh) {
      return NextResponse.json({
        insights: context ? existing.filter((i) => i.actionUrl.includes(context)) : existing,
        fresh: false,
        scope: target ? ('single' as const) : ('all' as const),
        property: target ? { id: target.id, name: target.name } : null,
      });
    }

    // 3. Régénération (par bien, dédupliquée, top 10 par bien).
    const existingTitlesByProperty = new Map<string, Set<string>>();
    for (const i of existing) {
      const set = existingTitlesByProperty.get(i.propertyId) ?? new Set<string>();
      set.add(titleKey(i.title));
      existingTitlesByProperty.set(i.propertyId, set);
    }

    // v5.6 — les titres traités/ignorés des 14 derniers jours sont
    // EXCLUS de la régénération : « Traité » reste traité (le même
    // conseil ne revient plus à chaque régénération du cache).
    const closedRecent = await db.dashboardInsight.findMany({
      where: {
        propertyId: { in: targetIds },
        isResolved: true,
        resolvedAt: { gte: new Date(now.getTime() - CLOSED_COOLDOWN_MS) },
      },
      select: { propertyId: true, title: true },
    });
    for (const row of closedRecent) {
      const set = existingTitlesByProperty.get(row.propertyId) ?? new Set<string>();
      set.add(titleKey(row.title));
      existingTitlesByProperty.set(row.propertyId, set);
    }

    const created: Awaited<ReturnType<typeof db.dashboardInsight.create>>[] = [];
    for (const propertyId of targetIds) {
      try {
        const generated = await generateInsights(propertyId);
        const taken = existingTitlesByProperty.get(propertyId) ?? new Set<string>();
        const propertyName = propertyNameOf(propertyId);

        for (const insight of generated) {
          if (created.length >= 10 * targetIds.length) break;
          const key = titleKey(insight.title);
          if (taken.has(key)) continue;
          taken.add(key);
          const row = await db.dashboardInsight.create({
            data: {
              propertyId,
              type: insight.type,
              priority: insight.priority,
              score: insight.score,
              title: insight.title,
              message: insight.message,
              actionLabel: insight.actionLabel,
              actionUrl: insight.actionUrl,
              expiresAt: insight.timeSensitive
                ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
                : null,
            },
          });
          created.push(row);

          // Analytics du mois (best effort).
          const month = now.getMonth() + 1;
          const year = now.getFullYear();
          await db.coachAnalytics
            .upsert({
              where: { propertyId_month_year: { propertyId, month, year } },
              update: { insightsGenerated: { increment: 1 } },
              create: { propertyId, month, year, insightsGenerated: 1 },
            })
            .catch(() => undefined);
        }

        // 4. Notifications critiques (push + email forcés, préférences respectées).
        const criticals = created.filter(
          (c) => c.priority === 'CRITICAL' && c.propertyId === propertyId,
        );
        for (const insight of criticals) {
          try {
            const audience = await filterCriticalAudience(
              propertyId,
              await propertyOwnerAndManagers(propertyId),
            );
            if (audience.length > 0) {
              await sendNotificationToMany(audience, 'coach_insight', {
                title: `Coach · ${insight.title}`,
                body: insight.message,
                url: insight.actionUrl,
                propertyId,
                propertyName,
                force: CRITICAL_FORCE,
                meta: { insightId: insight.id, priority: insight.priority, kind: 'coach' },
              });
            }
          } catch (error) {
            console.error('[airbnb/insights] notification critique échouée :', error);
          }
        }
      } catch (error) {
        console.error(`[airbnb/insights] génération échouée pour ${propertyId} :`, error);
      }
    }

    // 5. Réponse : fusion existants + nouveaux, triés par score.
    const merged = [...created, ...existing]
      .sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime())
      .filter((i, idx, arr) => arr.findIndex((x) => x.id === i.id) === idx);

    // Nettoyage best effort : expirés non résolus depuis > 7 j.
    await db.dashboardInsight
      .deleteMany({
        where: {
          propertyId: { in: targetIds },
          isResolved: false,
          expiresAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      })
      .catch(() => undefined);

    // Historique résolu (page Coach dédiée — Phase 3).
    let resolvedHistory: typeof merged = [];
    if (includeResolved) {
      resolvedHistory = await db.dashboardInsight.findMany({
        where: {
          propertyId: { in: targetIds },
          isResolved: true,
          resolvedAt: { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { resolvedAt: 'desc' },
        take: 30,
      });
    }

    const visible = context ? merged.filter((i) => i.actionUrl.includes(context)) : merged;

    return NextResponse.json({
      insights: visible,
      resolvedHistory: includeResolved ? resolvedHistory : undefined,
      fresh: true,
      scope: target ? ('single' as const) : ('all' as const),
      property: target ? { id: target.id, name: target.name } : null,
    });
  } catch (error) {
    console.error('[airbnb/insights GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
