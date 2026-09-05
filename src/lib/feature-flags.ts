// =============================================================
// Module 7 — Feature flags (lib/feature-flags.ts)
// Interrupteurs fonctionnels réels persistés en base.
// Les flags par défaut sont créés à la première lecture (upsert
// paresseux) afin que /admin/settings liste toujours le catalogue.
// Consommateurs réels :
//  - 'signups_enabled'    → /api/auth/register (bloque les créations)
//  - 'marketplace_enabled'→ /api/public/service-orders (bloque les commandes)
//  - 'maintenance_mode'   → bannière globale + refus des commandes
// =============================================================
import { db } from '@/lib/db';

export interface FeatureFlagDef {
  key: string;
  description: string;
  enabled: boolean;
}

export const FEATURE_FLAG_DEFAULTS: FeatureFlagDef[] = [
  {
    key: 'signups_enabled',
    description: 'Autoriser les nouvelles inscriptions d\u2019hôtes depuis la landing page.',
    enabled: true,
  },
  {
    key: 'marketplace_enabled',
    description: 'Autoriser les invités à passer des commandes auprès des prestataires (marketplace).',
    enabled: true,
  },
  {
    key: 'maintenance_mode',
    description: 'Mode maintenance : les nouvelles commandes de service sont refusées (bannière affichée).',
    enabled: false,
  },
];

/** Liste tous les flags (crée les manquants avec leur défaut). */
export async function getAllFlags(): Promise<FeatureFlagDef[]> {
  const rows = await db.featureFlag.findMany();
  const stored = new Map(rows.map((r) => [r.key, r]));

  // Création paresseuse des flags du catalogue absents de la base
  const missing = FEATURE_FLAG_DEFAULTS.filter((d) => !stored.has(d.key));
  if (missing.length > 0) {
    await db.$transaction(
      missing.map((d) =>
        db.featureFlag.create({
          data: { key: d.key, enabled: d.enabled, description: d.description },
        }),
      ),
    );
    for (const d of missing) stored.set(d.key, { ...d } as { key: string; enabled: boolean; description: string });
  }

  return FEATURE_FLAG_DEFAULTS.map((d) => ({
    key: d.key,
    description: d.description,
    enabled: stored.get(d.key)?.enabled ?? d.enabled,
  }));
}

/** Lit un flag précis (défaut si absent de la base). */
export async function isFlagEnabled(key: string): Promise<boolean> {
  try {
    const row = await db.featureFlag.findUnique({ where: { key } });
    if (row) return row.enabled;
    const def = FEATURE_FLAG_DEFAULTS.find((d) => d.key === key);
    return def?.enabled ?? false;
  } catch (error) {
    console.error(`[flags] Lecture de '${key}' impossible:`, error);
    const def = FEATURE_FLAG_DEFAULTS.find((d) => d.key === key);
    return def?.enabled ?? false;
  }
}

/** Modifie un flag (upsert — ne crée pas de clé hors catalogue). */
export async function setFlagEnabled(key: string, enabled: boolean): Promise<void> {
  const def = FEATURE_FLAG_DEFAULTS.find((d) => d.key === key);
  await db.featureFlag.upsert({
    where: { key },
    create: { key, enabled, description: def?.description ?? null },
    update: { enabled },
  });
}
