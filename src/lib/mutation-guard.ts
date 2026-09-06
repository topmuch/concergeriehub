// =============================================================
// FIX-15 — Durcissement sécurité : guard anti-abus des mutations
// authentifiées (audit : « pas de rate-limit sur /api/airbnb/*/admin
// mutations » — 19 routes mutantes airbnb, 0 rate-limité).
//
// Principe : un garde-fou LÉGER en tête de chaque handler mutatif
// (POST/PUT/PATCH/DELETE), adossé à lib/rate-limit.ts (in-memory,
// Redis-ready multi-instances). L'identifiant de la clé est l'userId
// de session quand il est disponible (getServerSession pattern
// existant), sinon l'IP cliente (clientIp de lib/audit.ts).
//
// Quotas retenus (documentés par famille) :
//  - airbnb-mut:*    → 30 requêtes/min par hôte (mutations client :
//    wizard, commandes, plaques, branding, préférences…)
//  - airbnb-ical:*   → 10 requêtes/min par hôte (POST /api/airbnb/ical :
//    chaque appel déclenche un fetch distant + parse + upserts —
//    coûteux, et la re-synchronisation manuelle reste largement
//    possible en dessous de 10/min)
//  - admin-mut:*     → 60 requêtes/min par admin (Console Superadmin :
//    les routes sont déjà derrière requireSuperadmin, le quota reste
//    pertinent contre un script ou un compte compromis)
//
// Le dépassement renvoie un 429 JSON { error } uniforme, sans effet
// de bord : les garde-fous métier existants restent inchangés.
// =============================================================
import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/audit';

/** Mutations client hôte : 30/min (FIX-15). */
export const MUTATIONS_LIMIT_HOST = 30;
/** Console Superadmin : 60/min par admin (FIX-15). */
export const MUTATIONS_LIMIT_ADMIN = 60;
/** Synchro iCal (fetch distant + upserts) : 10/min par hôte (FIX-15). */
export const MUTATIONS_LIMIT_ICAL = 10;

/** Réponse 429 uniforme pour toutes les mutations gardées. */
export function tooManyRequests(): NextResponse {
  return NextResponse.json(
    { error: 'Trop de requêtes. Merci de réessayer dans un instant.' },
    { status: 429 },
  );
}

/**
 * Rate-limit une mutation authentifiée.
 * @param key clé complète (ex. `airbnb-mut:user-123`) — voir mutationKey()
 * @param maxPerMinute quota (défaut : 30/min mutations client)
 * @returns null si la requête est autorisée, sinon la NextResponse 429
 *          à retourner immédiatement depuis le handler.
 */
export async function mutationGuard(
  key: string,
  maxPerMinute: number = MUTATIONS_LIMIT_HOST,
): Promise<NextResponse | null> {
  const allowed = await rateLimit(key, maxPerMinute);
  return allowed ? null : tooManyRequests();
}

/**
 * Clé de rate-limit mutations : `<scope>:<userId>` si l'userId de session
 * est disponible, sinon `<scope>:<ip>` (fallback clientIp, 'local' si
 * aucune IP dans les headers — dev/local). `req` peut être null quand le
 * handler ne reçoit pas la requête (ex. `export async function PUT()`).
 */
export function mutationKey(scope: string, req: Request | null, userId?: string | null): string {
  const ip = req ? clientIp(req.headers) : null;
  return `${scope}:${userId || ip || 'local'}`;
}
