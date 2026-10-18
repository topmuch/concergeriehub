// =============================================================
// FIX-14 — Monitoring d'erreurs : pendant CLIENT (navigateur)
//
// Client-safe PAR CONSTRUCTION : aucun import serveur (Prisma, db…).
// C'est la contrepartie navigateur de src/lib/error-monitor.ts (séparée
// physiquement pour ne jamais tirer Prisma dans le bundle client).
//
// Flux : captureClientError() → POST /api/errors (fire-and-forget) →
// AuditLog action='runtime.error' entityType='client' → /admin/logs.
// Utilisé par src/components/monitoring/global-error-reporter.tsx
// (listeners window 'error' + 'unhandledrejection').
//
// SENTRY-READY — si SENTRY_DSN est fourni au déploiement, brancher ici :
//   Sentry.captureMessage(message, { extra: { stack, url, context } })
//   en plus (ou en lieu et place) du POST interne.
// =============================================================

export interface ClientErrorPayload {
  /** Origine : 'window' (hook global), nom de composant, … */
  source?: string;
  message: string;
  stack?: string;
  url?: string;
  context?: Record<string, unknown>;
}

const MESSAGE_MAX = 2000;   // miroir de la validation serveur /api/errors
const STACK_MAX = 4000;     // miroir de la validation serveur /api/errors
const DEDUP_WINDOW_MS = 30_000; // 1 envoi max / 30 s par hash message+stack
const DEDUP_MAX_KEYS = 200;     // bornage mémoire du cache de déduplication

// Anti-doublon : hash(message+stack) → timestamp du dernier envoi.
const recentHashes = new Map<string, number>();

/** Hash djb2 32 bits → hex (déduplication only, pas cryptographique). */
function hash32(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/**
 * Envoie une erreur client vers /api/errors — fire-and-forget, ne jette
 * jamais (un bug du reporter ne doit ni masquer l'erreur d'origine ni
 * casser l'app). Anti-doublon : même erreur → 1 envoi / 30 s.
 */
export function captureClientError(payload: ClientErrorPayload): void {
  try {
    if (typeof window === 'undefined') return;

    const message =
      typeof payload?.message === 'string'
        ? payload.message.trim().slice(0, MESSAGE_MAX)
        : '';
    if (!message) return;

    const stack =
      typeof payload.stack === 'string' ? payload.stack.slice(0, STACK_MAX) : undefined;

    const hash = hash32(`${message}|${stack ?? ''}`);
    const now = Date.now();
    const last = recentHashes.get(hash);
    if (last !== undefined && now - last < DEDUP_WINDOW_MS) return;

    recentHashes.set(hash, now);
    if (recentHashes.size > DEDUP_MAX_KEYS) {
      // Purge des entrées les plus anciennes.
      const sorted = [...recentHashes.entries()].sort((a, b) => a[1] - b[1]);
      for (const [key] of sorted.slice(0, sorted.length - DEDUP_MAX_KEYS)) {
        recentHashes.delete(key);
      }
    }

    const body = JSON.stringify({
      source: payload.source ?? 'window',
      message,
      stack,
      url: payload.url ?? window.location.href,
      context: payload.context,
    });

    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Volontairement silencieux — voir contrat ci-dessus.
  }
}
