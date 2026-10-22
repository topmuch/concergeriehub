'use client';

// =============================================================
// BOUCLIER V2 — ABONNEMENT (onglet 8/8).
// Gestion du plan (master prompt §3) : état RÉEL de
// l'InspectionSubscription (299 €/an — module EDL), jours
// restants, progression, + catalogue des 2 formules Bouclier
// (299 € / 3 biens · 499 € / 20 biens) avec renvoi vers la
// page d'achat existante /edl/abonnement.
// =============================================================
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BadgeCheck, CalendarClock, CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { fetchJson, formatDate, GhostButton, RedButton, ShieldCard } from './shield-ui';

interface SubInfo {
  plan: string;
  status: string;
  endDate: string;
}

export function ShieldSubscription() {
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ subscription: SubInfo | null }>('/api/shield/stats')
      .then((d) => setSub(d.subscription))
      .catch((e: Error) => setError(e.message));
  }, []);

  const daysLeft = sub ? Math.max(0, Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / 86_400_000)) : null;
  const totalDays = 365;
  const progress = daysLeft !== null ? Math.min(100, Math.round((daysLeft / totalDays) * 100)) : 0;
  const active = sub?.status === 'active' && (daysLeft ?? 0) > 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="luxe-header-title">Abonnement</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Votre protection Inventaire et vos formules.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {sub === null && !error ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#1e3a8a] dark:text-[#3b82f6]" aria-label="Chargement" />
        </div>
      ) : (
        <>
          {/* ── État actuel ── */}
          <ShieldCard className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                    active
                      ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-400 dark:bg-[#22305a] dark:text-slate-500'
                  }`}
                >
                  {active ? <ShieldCheck className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {active ? 'Inventaire actif' : 'Inventaire inactif'}
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    {sub
                      ? `Formule ${sub.plan === 'edl_annual' ? '299 €/an' : sub.plan} · expire le ${formatDate(sub.endDate)}`
                      : 'Aucun abonnement trouvé sur ce compte.'}
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  active
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-[#22305a] dark:text-slate-400'
                }`}
              >
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {active ? `Actif — ${daysLeft} jour${daysLeft! > 1 ? 's' : ''} restant${daysLeft! > 1 ? 's' : ''}` : 'Expiré'}
              </span>
            </div>

            {/* Progression de l'année de protection */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                  Année de protection
                </span>
                <span>{progress}% restant</span>
              </div>
              <div
                className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-[#22305a]"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Protection restante"
              >
                <div
                  className={`h-full rounded-full ${daysLeft !== null && daysLeft <= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.max(2, progress)}%` }}
                />
              </div>
            </div>
          </ShieldCard>

          {/* ── Catalogue des formules Inventaire ── */}
          <div className="grid gap-4 md:grid-cols-2">
            <ShieldCard className="flex flex-col p-5 sm:p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Formule Essentielle</p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                299 €<span className="text-base font-medium text-slate-500 dark:text-slate-400"> / an</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#C41E3A]" aria-hidden="true" />
                  Jusqu'à 3 biens protégés
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#C41E3A]" aria-hidden="true" />
                  Check-ins / check-outs illimités
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#C41E3A]" aria-hidden="true" />
                  PDF certifiés + vidéo hashée SHA-256
                </li>
              </ul>
              <Link href="/edl/abonnement" className="mt-5">
                <GhostButton className="w-full">
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  Gérer sur la page d'abonnement
                </GhostButton>
              </Link>
            </ShieldCard>

            <ShieldCard className="relative flex flex-col border-[#C41E3A]/30 p-5 ring-1 ring-[#C41E3A]/20 sm:p-6">
              <span className="absolute -top-2.5 left-5 rounded-full bg-[#C41E3A] px-2.5 py-0.5 text-[11px] font-bold text-white">
                Recommandée
              </span>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Formule Pro</p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                499 €<span className="text-base font-medium text-slate-500 dark:text-slate-400"> / an</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#C41E3A]" aria-hidden="true" />
                  Jusqu'à 20 biens protégés
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#C41E3A]" aria-hidden="true" />
                  Multi-agents + liens cleaner illimités
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#C41E3A]" aria-hidden="true" />
                  Rapports comparatifs entrée vs sortie
                </li>
              </ul>
              <Link href="/edl/abonnement" className="mt-5">
                <RedButton className="w-full">
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  Passer à la formule Pro
                </RedButton>
              </Link>
            </ShieldCard>
          </div>
        </>
      )}
    </div>
  );
}
