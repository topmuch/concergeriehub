// =============================================================
// Module 7 Sécurité — Blacklist IP (lib/security.ts)
// Vérification AVANT le rate limiting sur les endpoints sensibles :
//  - connexion Superadmin (lib/auth.ts authorize)
//  - inscription hôtes (/api/auth/register)
//  - paiement de commande invitée (/api/public/service-orders/[id]/pay)
// Fail-open assumé : si la lecture DB échoue, on laisse passer
// (disponibilité > filtrage ; le rate limiting reste en place).
// =============================================================
import { db } from '@/lib/db';

/** true si l'IP est bannie (ou si l'IP est absente → non bannie). */
export async function isIpBlacklisted(ip: string | null | undefined): Promise<boolean> {
  if (!ip) return false;
  try {
    const row = await db.ipBlacklist.findUnique({ where: { ip } });
    return row !== null;
  } catch (error) {
    console.error('[security] Lecture blacklist impossible:', error);
    return false;
  }
}

/** Extrait l'IP cliente depuis les headers d'une requête NextAuth (req brut). */
export function ipFromAuthReq(req: unknown): string | null {
  const headers = (req as { headers?: Record<string, string | string[] | undefined> | undefined })?.headers;
  if (!headers) return null;
  const fwd = headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  if (first) return first.split(',')[0]?.trim() ?? null;
  const real = headers['x-real-ip'];
  return Array.isArray(real) ? real[0] ?? null : real ?? null;
}
