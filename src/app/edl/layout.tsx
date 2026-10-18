import Link from 'next/link';
import type { ReactNode } from 'react';

// =============================================================
// Layout des parcours publics du module « États des Lieux » :
// /edl/abonnement → /edl/paiement/retour → /edl/activer/[token].
// Hors shell Hub (module standalone) — pied de page collé en bas
// (min-h-dvh flex flex-col + mt-auto), mobile-first.
//
// v4.108 — FIX PAGE BLANCHE : le middleware injecte un nonce CSP
// UNIQUE PAR REQUÊTE (pattern officiel Next.js). Une page
// prérendue statique + cached (x-nextjs-cache HIT, s-maxage 1 an)
// sert un HTML dont les scripts inline n'ont pas le nonce courant
// → bloqués par 'strict-dynamic' → aucune hydratation → page
// blanche (le fallback Suspense bg-white est invisible sur fond
// blanc). TOUTES les pages /edl/** sont donc rendues DYNAMIQUE :
// nonce frais à chaque requête, cohérent avec l'en-tête CSP.
// (Pattern docs Next.js : pages sous CSP-nonce ⇒ dynamic.)
// =============================================================

export const dynamic = 'force-dynamic';

export default function EdlLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#F7F7F8] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-serif text-lg font-bold">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#0066EF,#0047B3)] text-sm text-white"
            >
              R
            </span>
            RoomScan
          </Link>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            États des Lieux
          </span>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto border-t border-slate-200/80 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} RoomScan — Propulsé par roomscan.pro</p>
          <p>
            Besoin d&apos;aide ?{' '}
            <a
              href="mailto:contact@roomscan.pro"
              className="font-medium text-[#0052C4] hover:underline"
            >
              contact@roomscan.pro
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
