// =============================================================
// FIX-14 — Monitoring d'erreurs interne (module 6, action ⑦ de l'audit :
//         « Sentry/analytics inexistants »)
//
// SENTRY-READY — si SENTRY_DSN est fourni au déploiement, brancher ici :
//   Sentry.captureException(error, { tags: { source }, extra: context })
//   (conserver l'écriture AuditLog ci-dessous comme piste locale, ou la
//   garder en fallback si l'export Sentry échoue). Toute l'app passe par
//   ce point d'entrée unique : le branchement se fait à UN endroit.
//
// Fonctionnement réel immédiat (aucun service externe) :
//  1. console.error TOUJOURS — jamais d'erreur avalée ;
//  2. INSERT AuditLog : action='runtime.error', entityType=source
//     (ex. 'api.auth.register', 'stripe.webhook', 'hub.update'),
//     entityId=null, actorId=null, actorEmail='system',
//     detailsJson={message, name, stack (tronqué 2000 chars), context}.
//     → visible dans /admin/logs (onglet Audit, filtre « Erreurs runtime »).
//
// CONTRAT : captureError ne jette JAMAIS (try/catch interne ; en dernier
// recours console.error brut). La réponse métier de la route appelante
// n'est jamais altérée par la capture.
//
// NB : le pendant CLIENT (captureClientError → POST /api/errors) vit dans
// error-monitor-client.ts. Ce module-ci importe Prisma (db) et ne doit
// JAMAIS être importé depuis le code navigateur (il ne l'est que par les
// routes API serveur) — sinon Prisma entrerait dans le bundle client.
// =============================================================
import { db } from '@/lib/db';
import { clientIp } from '@/lib/audit';

const STACK_MAX = 2000;
const MESSAGE_MAX = 2000;

/** Tronque une chaîne (stack trop longue) — null-safe. */
function truncate(value: string | undefined | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}…[tronqué]` : value;
}

/** JSON.stringify qui ne jette jamais (références circulaires, BigInt…). */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '{}';
  } catch {
    return '{"error":"context non serialisable"}';
  }
}

/**
 * Capture une erreur serveur : console + trace persistante AuditLog.
 * Ne jette jamais — appelable dans n'importe quel catch.
 *
 * @param source  Identifiant du site d'erreur (ex. 'api.auth.register',
 *                'stripe.webhook', 'hub.update', 'payments.orderPay').
 * @param error   L'erreur attrapée (unknown — tout est accepté).
 * @param context Contexte libre sérialisable (ids métier, jamais de secret).
 * @param req     Requête optionnelle : enrichit le contexte (url, method)
 *                et journalise l'IP cliente.
 */
export async function captureError(
  source: string,
  error: unknown,
  context?: Record<string, unknown>,
  req?: Request,
): Promise<void> {
  // 1) Toujours visible en console — jamais d'erreur avalée.
  console.error(`[error-monitor:${source}]`, error, context ?? '');

  // 2) Trace persistante dans AuditLog (visible /admin/logs).
  try {
    const isErr = error instanceof Error;
    const message = isErr ? error.message : String(error ?? 'Erreur inconnue');
    const name = isErr
      ? error.name
      : error && typeof error === 'object'
        ? (error.constructor?.name ?? 'Object')
        : typeof error;
    const stack = truncate(isErr ? error.stack : undefined, STACK_MAX);

    // Contexte enrichi de l'URL/méthode quand une requête est fournie
    // (diagnostic : quelle route, quel slug/id dans l'URL).
    const fullContext: Record<string, unknown> = { ...context };
    if (req) {
      fullContext.url = req.url;
      fullContext.method = req.method;
    }

    await db.auditLog.create({
      data: {
        actorId: null,
        actorEmail: 'system',
        action: 'runtime.error',
        entityType: source,
        entityId: null,
        detailsJson: safeStringify({
          message: truncate(message, MESSAGE_MAX),
          name,
          stack,
          context: fullContext,
        }),
        ip: req ? clientIp(req.headers) : null,
      },
    });
  } catch (logError) {
    // Dernier recours : la capture ne doit JAMAIS faire remonter d'exception.
    console.error('[error-monitor] Échec de persistance de l’erreur:', logError);
  }
}
