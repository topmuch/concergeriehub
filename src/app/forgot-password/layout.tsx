import type { ReactNode } from 'react';

// =============================================================
// v4.108 — FIX PAGE BLANCHE /forgot-password.
// Le middleware injecte un nonce CSP unique PAR REQUÊTE : une page
// statique prérendue + cached (x-nextjs-cache HIT) servait un HTML
// dont les scripts inline n'ont pas le nonce courant → bloqués par
// 'strict-dynamic' → aucune hydratation → page blanche. Rendue
// dynamique (pattern docs Next.js : CSP-nonce ⇒ dynamic).
// Layout pass-through : la config de segment s'applique à la page.
// =============================================================

export const dynamic = 'force-dynamic';

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
