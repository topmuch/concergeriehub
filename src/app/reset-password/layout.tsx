import type { ReactNode } from 'react';

// =============================================================
// v4.108 — FIX PAGE BLANCHE /reset-password (lien des emails de
// réinitialisation). Même cause que /forgot-password : nonce CSP
// par requête vs HTML statique en cache (scripts sans nonce =>
// bloqués => aucune hydratation). Rendue dynamique (pattern docs
// Next.js : CSP-nonce ⇒ dynamic). Layout pass-through.
// =============================================================

export const dynamic = 'force-dynamic';

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
