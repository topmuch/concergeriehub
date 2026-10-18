'use client';

import { useEffect } from 'react';

import { captureClientError } from '@/lib/error-monitor-client';

// =============================================================
// FIX-14 — GlobalErrorReporter : capture globale des erreurs navigateur
//
// Monté UNE fois dans le layout racine (src/app/layout.tsx). Entièrement
// invisible (retourne null — aucun rendu, aucune UI). Écoute les erreurs
// non rattrapées du navigateur ('error' + 'unhandledrejection') et les
// envoie en fire-and-forget à POST /api/errors (anti-doublon 30 s par
// hash message+stack — voir src/lib/error-monitor-client.ts), qui les
// trace en AuditLog → /admin/logs (filtre « Erreurs runtime »).
// =============================================================

export function GlobalErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      captureClientError({
        source: 'window',
        message: event.message || 'Erreur inconnue (window.onerror)',
        stack: event.error instanceof Error ? event.error.stack : undefined,
        context: {
          type: 'error',
          filename: event.filename || undefined,
          lineno: event.lineno || undefined,
          colno: event.colno || undefined,
        },
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      captureClientError({
        source: 'window',
        message:
          reason instanceof Error
            ? reason.message
            : typeof reason === 'string' && reason.trim()
              ? reason
              : 'Promesse rejetée sans raison exploitable',
        stack: reason instanceof Error ? reason.stack : undefined,
        context: { type: 'unhandledrejection' },
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
