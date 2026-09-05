// =============================================================
// Module 7 — Paramètres plateforme (lib/settings.ts)
// Configuration clé-valeur persistée en base (PlatformSetting).
// Les défauts typés ci-dessous sont fusionnés avec ce qui est
// stocké : getPlatformSettings() renvoie TOUJOURS un objet complet.
// Utilisé par : /admin/settings, /api/auth/register (quota
// inscriptions), /api/admin/subscriptions (commission défaut).
// =============================================================
import { db } from '@/lib/db';

export interface PlatformSettings {
  /** Nom public de la plateforme (emails, hub, factures). */
  platformName: string;
  /** Email de support affiché aux hôtes/prestataires. */
  supportEmail: string;
  /** Commission plateforme par défaut (%) sur les commandes de service. */
  defaultCommissionPercent: number;
  /** Quota d'inscriptions hôtes par heure et par IP (rate limit réel). */
  signupHourlyLimit: number;
  /** Montant minimum (€) d'un reversement prestataire (payout). */
  payoutMinimumEur: number;
  /** Mode maintenance : bannière + blocage des nouvelles commandes. */
  maintenanceMode: boolean;
}

export const PLATFORM_SETTINGS_DEFAULTS: PlatformSettings = {
  platformName: 'Conciergerie Hub',
  supportEmail: 'support@conciergeriehub.fr',
  defaultCommissionPercent: 15,
  signupHourlyLimit: 20,
  payoutMinimumEur: 20,
  maintenanceMode: false,
};

const KEY = 'platform';

/** Lit les paramètres (fusion avec les défauts — tolérant aux erreurs). */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const row = await db.platformSetting.findUnique({ where: { key: KEY } });
    if (!row) return { ...PLATFORM_SETTINGS_DEFAULTS };
    const stored = JSON.parse(row.value) as Partial<PlatformSettings>;
    return { ...PLATFORM_SETTINGS_DEFAULTS, ...stored };
  } catch (error) {
    console.error('[settings] Lecture impossible, défauts utilisés:', error);
    return { ...PLATFORM_SETTINGS_DEFAULTS };
  }
}

/** Écrit les paramètres (validation métier avant persist). */
export async function savePlatformSettings(
  next: Partial<PlatformSettings>,
  updatedBy: string,
): Promise<PlatformSettings> {
  const current = await getPlatformSettings();
  const merged: PlatformSettings = {
    ...current,
    ...next,
    // Garde-fous de type
    platformName: String(next.platformName ?? current.platformName).slice(0, 60) || current.platformName,
    supportEmail: String(next.supportEmail ?? current.supportEmail).slice(0, 120) || current.supportEmail,
    defaultCommissionPercent: clampNumber(next.defaultCommissionPercent ?? current.defaultCommissionPercent, 0, 50),
    signupHourlyLimit: Math.round(clampNumber(next.signupHourlyLimit ?? current.signupHourlyLimit, 1, 500)),
    payoutMinimumEur: clampNumber(next.payoutMinimumEur ?? current.payoutMinimumEur, 0, 10000),
    maintenanceMode: Boolean(next.maintenanceMode ?? current.maintenanceMode),
  };

  await db.platformSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(merged), updatedBy },
    update: { value: JSON.stringify(merged), updatedBy },
  });
  return merged;
}

function clampNumber(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
