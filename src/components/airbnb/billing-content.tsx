'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, CreditCard, ExternalLink, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { B2BCard } from '@/components/ui/b2b-card';
import { Button } from '@/components/ui/button';
import {
  HOST_PLANS,
  formatEur,
  monthlyEquivalent,
  planPrice,
  subscriptionStatusMeta,
  type BillingCycle,
} from '@/lib/billing';

// =============================================================
// BillingContent — ÉTAPE 10 : page d'abonnement de l'Espace Hôte.
// Style QRTags : fond slate-50 + cartes blanches ; Airbnb Solo
// mis en avant ; boutons « S'abonner » → /api/stripe/checkout.
// Bandeau mode démo quand STRIPE_SECRET_KEY n'est pas configurée.
// =============================================================

export interface CurrentSubscriptionView {
  planId: string;
  planName: string;
  planEmoji: string;
  status: string;
  billingCycle: string;
  amount: number;
  currentPeriodEnd: string | null;
}

interface BillingContentProps {
  host: { name: string | null; email: string; selectedPlan: string | null };
  current: CurrentSubscriptionView | null;
  stripeMode: boolean;
}

export function BillingContent({ host, current, stripeMode }: BillingContentProps) {
  const params = useSearchParams();
  const success = params.get('success') === '1';
  const canceled = params.get('canceled') === '1';

  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const activePlanId = current?.status === 'active' || current?.status === 'trialing'
    ? current.planId
    : null;

  async function subscribe(planId: string, billingCycle: BillingCycle) {
    setBusyPlan(`${planId}:${billingCycle}`);
    setNotice(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, billingCycle }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setNotice({ kind: 'error', text: data.error ?? 'Impossible de démarrer le paiement.' });
        setBusyPlan(null);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setNotice({ kind: 'error', text: 'Erreur réseau — réessayez.' });
      setBusyPlan(null);
    }
  }

  async function openPortal() {
    setManaging(true);
    setNotice(null);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = (await res.json()) as { url?: string; error?: string; hint?: string };
      if (!res.ok) {
        setNotice({
          kind: 'info',
          text: data.hint ? `${data.error} — ${data.hint}` : (data.error ?? 'Portail indisponible.'),
        });
        setManaging(false);
        return;
      }
      if (data.url) window.location.assign(data.url);
    } catch {
      setNotice({ kind: 'error', text: 'Erreur réseau — réessayez.' });
      setManaging(false);
    }
  }

  async function cancelSubscription() {
    if (!window.confirm('Résilier votre abonnement ?')) return;
    setCanceling(true);
    setNotice(null);
    try {
      const res = await fetch('/api/stripe/cancel', { method: 'POST' });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        setNotice({ kind: 'error', text: data.error ?? 'Résiliation impossible.' });
        setCanceling(false);
        return;
      }
      window.location.assign('/airbnb/billing');
    } catch {
      setNotice({ kind: 'error', text: 'Erreur réseau — réessayez.' });
      setCanceling(false);
    }
  }

  const statusMeta = current ? subscriptionStatusMeta(current.status) : null;

  return (
    <div className="flex-1 bg-slate-50">
      <div className="max-w-5xl mx-auto w-full px-4 py-8 md:py-12">
        {/* ---------- En-tête ---------- */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-3">
            <span aria-hidden="true" className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm">
              <CreditCard className="h-5 w-5 text-slate-700" />
            </span>
            Abonnement
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Bonjour {host.name ?? host.email} — gérez votre plan et votre facturation.
          </p>
        </div>

        {/* ---------- Bandeaux ---------- */}
        {success && (
          <div role="status" className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <strong>Paiement confirmé — bienvenue !</strong> Votre abonnement est actif et vos
              fonctionnalités premium sont débloquées.
              {params.get('demo') === '1' && ' (mode démo : aucune carte n’a été débitée)'}
            </span>
          </div>
        )}
        {canceled && (
          <div role="status" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>Paiement annulé — aucun prélèvement n’a été effectué.</span>
          </div>
        )}
        {!stripeMode && (
          <div role="note" className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 flex items-start gap-2">
            <span aria-hidden="true">🧪</span>
            <span>
              <strong>Mode démo</strong> — Stripe n’est pas configuré sur cet environnement.
              Les abonnements sont activés instantanément sans paiement réel. Ajoutez
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">STRIPE_SECRET_KEY</code>
              pour activer le paiement réel.
            </span>
          </div>
        )}
        {notice && (
          <div
            role="alert"
            className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
              notice.kind === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-sky-200 bg-sky-50 text-sky-800'
            }`}
          >
            {notice.text}
          </div>
        )}

        {/* ---------- Abonnement courant ---------- */}
        {current && (
          <B2BCard className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Votre abonnement actuel
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span aria-hidden="true">{current.planEmoji}</span>
                  {current.planName}
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusMeta?.className}`}>
                    {statusMeta?.label}
                  </span>
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  {formatEur(current.amount)} ·{' '}
                  {current.billingCycle === 'annual' ? 'facturation annuelle' : 'facturation mensuelle'}
                  {current.currentPeriodEnd && (
                    <>
                      {' '}· prochaine échéance le{' '}
                      {new Date(current.currentPeriodEnd).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button variant="outline" onClick={openPortal} disabled={managing || !stripeMode}>
                  {managing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Gérer la facturation
                </Button>
                <Button
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={cancelSubscription}
                  disabled={canceling}
                >
                  {canceling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Résilier
                </Button>
              </div>
            </div>
          </B2BCard>
        )}

        {/* ---------- Toggle mensuel / annuel ---------- */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className={`text-sm font-semibold ${cycle === 'monthly' ? 'text-slate-900' : 'text-slate-400'}`}>
            Mensuel
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={cycle === 'annual'}
            aria-label="Basculer entre facturation mensuelle et annuelle"
            onClick={() => setCycle((c) => (c === 'monthly' ? 'annual' : 'monthly'))}
            className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                cycle === 'annual' ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className={`text-sm font-semibold ${cycle === 'annual' ? 'text-slate-900' : 'text-slate-400'}`}>
            Annuel
          </span>
          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            2 mois offerts
          </span>
        </div>

        {/* ---------- Cartes d'offres ---------- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {HOST_PLANS.map((plan) => {
            const price = planPrice(plan, cycle);
            const isCurrent = activePlanId === plan.id;
            const perMonth = monthlyEquivalent(plan, cycle);

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl bg-white border p-6 transition-shadow ${
                  plan.highlight
                    ? 'border-amber-300 shadow-lg shadow-amber-100'
                    : 'border-slate-200 shadow-sm'
                }`}
              >
                {plan.badge && (
                  <span
                    className={`absolute -top-3 left-6 rounded-full border px-3 py-1 text-xs font-bold ${
                      plan.highlight
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {plan.badge}
                  </span>
                )}

                <div className="flex items-center gap-3 mb-3">
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-lg ${
                      plan.highlight ? 'bg-amber-50 border border-amber-200' : 'bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {plan.emoji}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
                  {isCurrent && (
                    <span className="ml-auto rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                      ✓ Plan actuel
                    </span>
                  )}
                </div>

                <p className="text-sm text-slate-600 mb-4">{plan.description}</p>

                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-extrabold text-slate-900">
                    {price === null ? '—' : formatEur(price)}
                  </span>
                  {price !== null && (
                    <span className="text-sm text-slate-500">
                      /{cycle === 'annual' ? 'an' : 'mois'}
                    </span>
                  )}
                </div>
                {cycle === 'annual' && perMonth !== null && (
                  <p className="text-xs text-slate-500 mb-4">soit {formatEur(perMonth)} / mois</p>
                )}
                {price === null && (
                  <p className="text-xs text-slate-500 mb-4">
                    Disponible en facturation annuelle uniquement
                  </p>
                )}

                <ul className="space-y-2.5 my-5">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
                          f.included ? 'bg-emerald-100' : 'bg-slate-100'
                        }`}
                      >
                        {f.included ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <span className="h-1 w-1 rounded-full bg-slate-400" />
                        )}
                      </span>
                      <span className={`text-sm ${f.included ? 'text-slate-700' : 'text-slate-400'}`}>
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full h-11 font-semibold ${
                    plan.highlight
                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                  disabled={isCurrent || price === null || busyPlan !== null}
                  onClick={() => subscribe(plan.id, cycle)}
                >
                  {busyPlan === `${plan.id}:${cycle}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrent ? (
                    'Votre plan actuel'
                  ) : price === null ? (
                    'Annuel uniquement'
                  ) : (
                    "S'abonner"
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-slate-400 mt-10">
          🔒 Paiement sécurisé par Stripe · Annulation à tout moment · TVA incluse
        </p>
      </div>
    </div>
  );
}
