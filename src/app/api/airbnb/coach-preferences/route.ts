// =============================================================
// GET  /api/airbnb/coach-preferences — préférences du Coach (v5.4)
// POST /api/airbnb/coach-preferences — upsert des préférences
// Contrôlent les canaux de notification (critiques / revenus /
// qualité), les conseils éducatifs, la fréquence du rapport
// quotidien et les types d'insights affichés (JSON array SQLite).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { INSIGHT_TYPES } from '@/lib/insight-engine';

const DEFAULT_ENABLED_TYPES = JSON.stringify([
  'STOCK',
  'REVENUE',
  'REVIEW',
  'UPSELL',
  'OPERATION',
  'QUALITY',
  'BEHAVIOR',
]);

function getDefaultPreferences() {
  return {
    enableCriticalPush: true,
    enableCriticalEmail: true,
    enableCriticalSMS: false,
    enableRevenueEmail: true,
    enableRevenuePush: false,
    enableQualityEmail: true,
    enableQualityDashboard: true,
    enableEducational: true,
    reportFrequency: 'daily',
    reportTime: '07:00',
    enabledInsightTypes: JSON.parse(DEFAULT_ENABLED_TYPES) as string[],
  };
}

/** Validation stricte de l'heure « HH:mm ». */
function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // FIX v4.98 — les défauts affichés deviennent la VRAIE configuration :
    // avant, ce GET renvoyait des défauts virtuels (reportFrequency 'daily',
    // 07:00) SANS les écrire en base. Or le rapport quotidien part du cron
    // /api/admin/trigger-coach-reports qui ne sélectionne que les lignes
    // CoachPreferences réelles (reportFrequency daily/weekly) → un compte
    // n'ayant jamais cliqué « Enregistrer » recevait l'affichage « activé »
    // mais AUCUN briefing (processed: 0 côté cron). On crée désormais la
    // ligne à la première consultation (idempotent, ne réécrit jamais une
    // config existante).
    let preferences = await db.coachPreferences.findUnique({ where: { userId } });
    if (!preferences) {
      const defaults = getDefaultPreferences();
      preferences = await db.coachPreferences.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          enableCriticalPush: defaults.enableCriticalPush,
          enableCriticalEmail: defaults.enableCriticalEmail,
          enableCriticalSMS: defaults.enableCriticalSMS,
          enableRevenueEmail: defaults.enableRevenueEmail,
          enableRevenuePush: defaults.enableRevenuePush,
          enableQualityEmail: defaults.enableQualityEmail,
          enableQualityDashboard: defaults.enableQualityDashboard,
          enableEducational: defaults.enableEducational,
          reportFrequency: defaults.reportFrequency,
          reportTime: defaults.reportTime,
          enabledInsightTypes: JSON.stringify(defaults.enabledInsightTypes),
        },
      });
    }
    return NextResponse.json({
      preferences: {
        ...preferences,
        enabledInsightTypes: safeParseTypes(preferences.enabledInsightTypes),
      },
    });
  } catch (error) {
    console.error('[airbnb/coach-preferences GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Whitelist stricte + coercition booléenne.
    const boolKeys = [
      'enableCriticalPush',
      'enableCriticalEmail',
      'enableCriticalSMS',
      'enableRevenueEmail',
      'enableRevenuePush',
      'enableQualityEmail',
      'enableQualityDashboard',
      'enableEducational',
    ] as const;
    const data: Record<string, unknown> = {};
    for (const key of boolKeys) {
      if (typeof raw[key] === 'boolean') data[key] = raw[key];
    }

    if (
      typeof raw.reportFrequency === 'string' &&
      ['daily', 'weekly', 'never'].includes(raw.reportFrequency)
    ) {
      data.reportFrequency = raw.reportFrequency;
    }
    if (isValidTime(raw.reportTime)) {
      data.reportTime = raw.reportTime;
    }
    if (Array.isArray(raw.enabledInsightTypes)) {
      const allowed = raw.enabledInsightTypes.filter(
        (t): t is string => typeof t === 'string' && (INSIGHT_TYPES as string[]).includes(t),
      );
      data.enabledInsightTypes = JSON.stringify(
        allowed.length > 0 ? Array.from(new Set(allowed)) : INSIGHT_TYPES,
      );
    }

    const preferences = await db.coachPreferences.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    return NextResponse.json({
      preferences: {
        ...preferences,
        enabledInsightTypes: safeParseTypes(preferences.enabledInsightTypes),
      },
    });
  } catch (error) {
    console.error('[airbnb/coach-preferences POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

function safeParseTypes(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}
