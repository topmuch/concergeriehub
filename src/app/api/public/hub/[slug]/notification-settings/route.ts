// =============================================================
// GET /api/public/hub/[slug]/notification-settings
//
// v4.74 « SMART PROMPTS » — settings des notifications temporelles
// du bien, lus PUBLIC (aucune donnée personnelle : horaires + messages
// configurés par l'hôte). Le hook useSmartNotifications les interroge
// chaque minute pour décider d'afficher ou non la carte.
// Réponse : { ok, settings } — valeurs par défaut si jamais configuré.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import { normalizeSettings, type NotificationSettingsInput } from '@/lib/smart-notifications';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ ok: false, error: resolved.message }, { status: resolved.status });
    }

    const row = await db.notificationSettings.findUnique({
      where: { propertyId: resolved.propertyId },
    });

    const settings: NotificationSettingsInput = normalizeSettings(
      row as unknown as Partial<NotificationSettingsInput> | null,
    );

    // v4.74 — kill switch plateforme : si le superadmin a désactivé
    // GLOBALEMENT les smart prompts, le hook ne doit rien afficher.
    const globalRow = await db.systemSetting.findUnique({
      where: { key: 'notifications.global_disabled' },
    });
    const platformEnabled = globalRow?.value !== 'true';

    return NextResponse.json({ ok: true, settings, platformEnabled });
  } catch (error) {
    console.error('[public/hub notification-settings GET] Error:', error);
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
