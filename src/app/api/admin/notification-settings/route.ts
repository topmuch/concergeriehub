// =============================================================
// /api/admin/notification-settings  🔒 SUPERADMIN
//
// v4.74 « SMART PROMPTS » — contrôle global + analytics.
//   GET → { ok, globalDisabled, templates, stats }
//     stats : biens configurés, logs 30 j par type, commandes
//     souvenirs (nombre + CA), taux de conversion par type de
//     notification (commandes souvenir dans les 24 h suivant
//     l'affichage d'une notification).
//   PATCH { globalDisabled?, templates? } → contrôle plateforme
//     (kill switch en cas de bug + messages par défaut des nouveaux
//     hôtes). Stockage SystemSetting :
//       notifications.global_disabled = 'true' | 'false'
//       notifications.templates = JSON (messages par défaut)
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/lib/smart-notifications';

const GLOBAL_KEY = 'notifications.global_disabled';
const TEMPLATES_KEY = 'notifications.templates';

const templatesSchema = z.object({
  breakfast: z.string().trim().min(1).max(160),
  lunch: z.string().trim().min(1).max(160),
  dinner: z.string().trim().min(1).max(160),
  checkout_reminder: z.string().trim().min(1).max(160),
});

async function readGlobalDisabled(): Promise<boolean> {
  const row = await db.systemSetting.findUnique({ where: { key: GLOBAL_KEY } });
  return row?.value === 'true';
}

async function readTemplates(): Promise<Record<string, string>> {
  const row = await db.systemSetting.findUnique({ where: { key: TEMPLATES_KEY } });
  if (row?.value) {
    try {
      const parsed: unknown = JSON.parse(row.value);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
    } catch {
      // JSON corrompu → repli sur les défauts.
    }
  }
  return {
    breakfast: DEFAULT_NOTIFICATION_SETTINGS.breakfastMessage,
    lunch: DEFAULT_NOTIFICATION_SETTINGS.lunchMessage,
    dinner: DEFAULT_NOTIFICATION_SETTINGS.dinnerMessage,
    checkout_reminder: DEFAULT_NOTIFICATION_SETTINGS.checkoutReminderMessage,
  };
}

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const [globalDisabled, templates] = await Promise.all([readGlobalDisabled(), readTemplates()]);

    const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [configuredProperties, logsByType, souvenirOrders, souvenirRevenue, recentLogs] =
      await Promise.all([
        db.notificationSettings.count(),
        db.notificationLog.groupBy({
          by: ['notificationType'],
          where: { displayedAt: { gte: since30d } },
          _count: true,
        }),
        db.souvenirOrder.count({ where: { createdAt: { gte: since30d } } }),
        db.souvenirOrder.aggregate({
          where: { createdAt: { gte: since30d }, status: { not: 'CANCELLED' } },
          _sum: { unitPrice: true },
          _count: true,
        }),
        db.notificationLog.findMany({
          where: { displayedAt: { gte: since30d } },
          select: { notificationType: true, propertyId: true, displayedAt: true },
          orderBy: { displayedAt: 'desc' },
          take: 500,
        }),
      ]);

    // Conversion par type : commandes souvenir créées dans les 24 h
    // suivant une notification du même bien (approximation plateforme).
    const orders = await db.souvenirOrder.findMany({
      where: { createdAt: { gte: since30d } },
      select: { propertyId: true, createdAt: true },
      take: 500,
    });
    const logsByProp = new Map<string, number[]>();
    for (const log of recentLogs) {
      const arr = logsByProp.get(log.propertyId) ?? [];
      arr.push(log.displayedAt.getTime());
      logsByProp.set(log.propertyId, arr);
    }
    let conversions = 0;
    for (const order of orders) {
      const times = logsByProp.get(order.propertyId);
      if (!times) continue;
      if (times.some((t) => t <= order.createdAt.getTime() && order.createdAt.getTime() - t <= 24 * 3600 * 1000)) {
        conversions += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      globalDisabled,
      templates,
      stats: {
        configuredProperties,
        logs30d: logsByType.map((g) => ({ type: g.notificationType, count: g._count })),
        souvenirOrders30d: souvenirOrders,
        souvenirRevenue30d: souvenirRevenue._sum.unitPrice ?? 0,
        conversions30d: conversions,
      },
    });
  } catch (error) {
    console.error('[admin notification-settings GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

const patchSchema = z.object({
  globalDisabled: z.boolean().optional(),
  templates: templatesSchema.partial().optional(),
});

export async function PATCH(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Formulaire invalide.' }, { status: 400 });
    }
    const { globalDisabled, templates } = parsed.data;

    if (globalDisabled !== undefined) {
      await db.systemSetting.upsert({
        where: { key: GLOBAL_KEY },
        create: { key: GLOBAL_KEY, value: globalDisabled ? 'true' : 'false' },
        update: { value: globalDisabled ? 'true' : 'false' },
      });
      await logAudit({
        actor: admin,
        action: 'notifications.global_toggle',
        entityType: 'system_setting',
        entityId: GLOBAL_KEY,
        details: { globalDisabled },
      });
    }

    if (templates && Object.keys(templates).length > 0) {
      const current = await readTemplates();
      const next = { ...current, ...templates };
      await db.systemSetting.upsert({
        where: { key: TEMPLATES_KEY },
        create: { key: TEMPLATES_KEY, value: JSON.stringify(next) },
        update: { value: JSON.stringify(next) },
      });
      await logAudit({
        actor: admin,
        action: 'notifications.templates_update',
        entityType: 'system_setting',
        entityId: TEMPLATES_KEY,
        details: { keys: Object.keys(templates) },
      });
    }

    return NextResponse.json({
      ok: true,
      globalDisabled: globalDisabled ?? (await readGlobalDisabled()),
      templates: templates ? await readTemplates() : undefined,
    });
  } catch (error) {
    console.error('[admin notification-settings PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
