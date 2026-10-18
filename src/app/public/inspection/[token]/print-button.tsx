'use client';

// v5.0 — Bouton « Imprimer » de la page publique de preuve.
// Petit composant client isolé : la page /public/inspection/[token]
// reste un Server Component (il ne porte que ce bouton).

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 text-sm font-bold text-stone-700 transition-colors hover:bg-stone-100 cursor-pointer"
    >
      🖨️ Imprimer
    </button>
  );
}
