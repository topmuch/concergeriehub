// =============================================================
// Module 8 — Journal d'audit de la Console Superadmin
// Chaque mutation réalisée depuis /admin/* appelle logAudit()
// avec l'acteur (Superadmin), l'action, la cible et des détails.
// Le journal est consulté sur /admin/logs (onglet Audit).
// =============================================================
import { db } from '@/lib/db';
import type { SuperadminSession } from '@/lib/admin';

export interface AuditInput {
  actor: SuperadminSession;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

/** Enregistre une entrée d'audit. Ne jette jamais (l'audit ne doit
 *  pas faire échouer la mutation métier qu'il trace). */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        detailsJson: JSON.stringify(input.details ?? {}),
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    console.error('[audit] Échec de journalisation:', error);
  }
}

/** Extrait l'IP cliente depuis les headers d'une requête. */
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return headers.get('x-real-ip');
}
