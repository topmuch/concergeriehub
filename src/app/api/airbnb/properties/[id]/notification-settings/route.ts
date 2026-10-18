// =============================================================
// /api/airbnb/properties/[id]/notification-settings
//
// v4.74 « SMART PROMPTS » — configuration des notifications
// temporelles par le propriétaire / co-hôte du bien.
//   GET  → { ok, settings } (valeurs par défaut si jamais configuré)
//   POST → upsert complet validé par zod (messages FR explicites)
// 🔒 Session + OWNER/MANAGER (canManageTeam).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import {
  notificationSettingsSchema,
  normalizeSettings,
  type NotificationSettingsInput,
} from '@/lib/smart-notifications';

type Ctx = { params: Promise<{ id: string }> };

async function requireManager(propertyId: string, userId: string) {
  const role = await getUserRoleForProperty(userId, propertyId);
  if (!role) return { ok: false as const, status: 403, message: 'Accès refusé' };
  if (!canManageTeam(role)) {
    return {
      ok: false as const,
      status: 403,
      message: 'Seuls le propriétaire et le co-hôte peuvent gérer les notifications.',
    };
  }
  return { ok: true as const };
}

export async function GET(
  _req: NextRequest,
  { params }: Ctx,
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const { id } = await params;
    const guard = await requireManager(id, userId);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.message }, { status: guard.status });
    }

    const row = await db.notificationSettings.findUnique({
      where: { propertyId: id },
    });
    return NextResponse.json({
      ok: true,
      settings: normalizeSettings(row as unknown as Partial<NotificationSettingsInput> | null),
    });
  } catch (error) {
    console.error('[airbnb notification-settings GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: Ctx,
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — anti-abus : 30 mutations/min par hôte.
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { id } = await params;
    const guard = await requireManager(id, userId);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.message }, { status: guard.status });
    }

    const body = await req.json().catch(() => null);
    const parsed = notificationSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Formulaire invalide.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const settings = await db.notificationSettings.upsert({
      where: { propertyId: id },
      create: { propertyId: id, ...parsed.data },
      update: parsed.data,
    });

    return NextResponse.json({ ok: true, settings: normalizeSettings(settings as unknown as Partial<NotificationSettingsInput>) });
  } catch (error) {
    console.error('[airbnb notification-settings POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
