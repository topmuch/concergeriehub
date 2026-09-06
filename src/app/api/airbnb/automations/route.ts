// =============================================================
// /api/airbnb/automations — ÉTAPE 13 V2
//
// GET              : règles d'automatisation de tous les biens
//                    accessibles (catalogue déployé à la volée +
//                    tick lazy des rappels du jour).
//                    Seuls OWNER/MANAGER voient et pilotent les
//                    règles (CLEANER/MAINTENANCE → liste vide).
// PATCH ?ruleId=   : active/désactive une règle — OWNER/MANAGER.
//
// ⚠️ ruleId passe par un QUERY PARAM (robustesse sandbox — pas de
// segment dynamique bracketé).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  resolveUserMemberships,
  getUserRoleForProperty,
} from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { ensureDefaultRules, runDailyAutomations } from '@/lib/automations-server';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const memberships = await resolveUserMemberships(userId);
    const accepted = memberships.filter((m) => m.acceptedAt !== null);

    // Biens pilotables : OWNER (possédé) ou MANAGER accepté
    const manageable = new Map<string, { id: string; name: string }>();
    for (const m of accepted) {
      if (m.role === 'OWNER' || m.role === 'MANAGER') {
        manageable.set(m.property.id, { id: m.property.id, name: m.property.name });
      }
    }
    // Biens possédés sans PropertyMember accepté (edge case V1)
    const owned = await db.property.findMany({
      where: { ownerId: userId },
      select: { id: true, name: true },
    });
    for (const p of owned) manageable.set(p.id, { id: p.id, name: p.name });

    const manageableIds = Array.from(manageable.keys());

    // Déploiement du catalogue + tick lazy des rappels du jour
    await Promise.all(manageableIds.map((id) => ensureDefaultRules(id)));
    await runDailyAutomations(manageableIds);

    const rules = await db.automationRule.findMany({
      where: { propertyId: { in: manageableIds } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        propertyId: true,
        key: true,
        trigger: true,
        action: true,
        isActive: true,
        lastRunAt: true,
      },
    });

    const automations = Array.from(manageable.values()).map((property) => ({
      property,
      canManage: true,
      rules: rules
        .filter((r) => r.propertyId === property.id)
        .map((r) => ({ ...r, lastRunAt: r.lastRunAt?.toISOString() ?? null })),
    }));

    return NextResponse.json({ automations });
  } catch (error) {
    console.error('[airbnb/automations GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const ruleId = new URL(req.url).searchParams.get('ruleId');
    if (!ruleId) {
      return NextResponse.json({ error: 'Query param ruleId requis.' }, { status: 400 });
    }

    const body = (await req.json()) as { isActive?: boolean };
    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json({ error: 'Champ isActive (boolean) requis.' }, { status: 400 });
    }

    const rule = await db.automationRule.findUnique({
      where: { id: ruleId },
      select: { id: true, propertyId: true, key: true },
    });
    if (!rule) {
      return NextResponse.json({ error: 'Règle introuvable.' }, { status: 404 });
    }

    const myRole = await getUserRoleForProperty(userId, rule.propertyId);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json(
        { error: 'Seuls le propriétaire et les gestionnaires peuvent piloter les automatisations.' },
        { status: 403 },
      );
    }

    const updated = await db.automationRule.update({
      where: { id: rule.id },
      data: { isActive: body.isActive },
      select: { id: true, propertyId: true, key: true, isActive: true, lastRunAt: true },
    });

    return NextResponse.json({
      rule: { ...updated, lastRunAt: updated.lastRunAt?.toISOString() ?? null },
    });
  } catch (error) {
    console.error('[airbnb/automations PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
