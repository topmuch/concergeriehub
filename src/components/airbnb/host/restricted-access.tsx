import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

// =============================================================
// RestrictedAccess — écran de garde de rôle du Dashboard Client
// Affiché quand un membre d'équipe (CLEANER / MAINTENANCE) tente
// d'accéder à une section réservée aux gestionnaires (facturation,
// équipe, paramètres, revenus…). Réel : calculé côté serveur.
// =============================================================

export function RestrictedAccess({ feature }: { feature: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-xl border border-amber-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
          <ShieldAlert className="h-7 w-7 text-amber-600" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Accès restreint</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Votre rôle dans l&apos;équipe ne permet pas d&apos;accéder à{' '}
          <span className="font-semibold text-slate-900">{feature}</span>. Seuls les
          propriétaires et managers peuvent consulter cette section.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Besoin d&apos;un accès supplémentaire ? Demandez au propriétaire du bien de
          mettre à jour votre rôle.
        </p>
        <Link
          href="/airbnb/dashboard"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-[#E23F2B] px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#c93725]"
        >
          ← Retour à la vue d&apos;ensemble
        </Link>
      </div>
    </div>
  );
}
