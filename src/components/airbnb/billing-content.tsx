'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, CreditCard, Download, ExternalLink, KeyRound, Loader2, Percent, ReceiptText, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { downloadCommissionInvoicePdf } from '@/lib/commission-invoice-pdf';
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
// v4.60 « AIRBNB PRO » — refonte visuelle pure (logique intacte) :
// hero abonnement air-gradient-deep, offres en cartes token
// air-shadow (Airbnb Solo mis en avant en rausch), badges
// dark-safe, historique dans une carte arrondie.
// Boutons « S'abonner » → /api/stripe/checkout.
// Bandeau mode démo quand STRIPE_SECRET_KEY n'est pas configurée.
// AUDIT 4-c : section « Historique des paiements » alimentée par
// GET /api/airbnb/billing/transactions (50 dernières transactions
// du compte — payer OU receiver).
// v4.69 — PHASE 5 « Commission & Facturation mensuelle » :
//   • carte « Paiements & Commission » — l'hôte encaisse via son
//     propre Stripe (clés pk/sk) ; taux de commission RoomScan
//     (fixé par le Superadmin) affiché en lecture seule ;
//   • liste « Factures de commission RoomScan » (lecture seule + PDF).
// v4.95 « PAYPAL SUBSCRIPTIONS » — si PayPal est activé (env
//   PAYPAL_CLIENT_ID/SECRET, cf. lib/paypal.ts) un bouton « Payer avec
//   PayPal » apparaît sous chaque offre EN PLUS du bouton Stripe
//   existant (Stripe reste dédié aux paiements hôtes : minibar,
//   services, Connect). Retour PayPal : ?paypal=approved&token=… →
//   POST /api/paypal/activate ; ?paypal=canceled → toast info.
//   Sans clés PayPal : UI strictement IDENTIQUE à aujourd'hui.
// =============================================================

/** Transaction du compte renvoyée par /api/airbnb/billing/transactions. */
interface BillingTransaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  stripePaymentId: string | null;
  createdAt: string;
}

/** v4.69 — Paramètres « Paiements & Commission » (/api/airbnb/host-settings). */
interface HostSettingsView {
  useOwnStripe: boolean;
  stripePubKey: string;
  hasStripeSecret: boolean;
  commissionRate: number;
}

/** v4.69 — Facture de commission RoomScan (/api/airbnb/commission-invoices). */
interface CommissionInvoiceView {
  id: string;
  month: number;
  year: number;
  totalOrdersAmount: number;
  commissionRate: number;
  commissionOwed: number;
  ordersCount: number;
  breakdown: { minibar?: number; services?: number; laundry?: number } | null;
  invoicePdfUrl: string | null;
  status: string;
  dueDate: string;
  paidAt: string | null;
}

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const commissionMonthLabel = (month: number, year: number) =>
  `${MONTHS_FR[Math.min(11, Math.max(0, month - 1))]} ${year}`;

const commissionEur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

function commissionStatusBadge(status: string): { label: string; className: string } {
  if (status === 'paid') return { label: 'Payée', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  if (status === 'overdue') return { label: 'En retard', className: 'bg-red-100 text-red-800 border-red-200' };
  return { label: 'À payer', className: 'bg-amber-100 text-amber-800 border-amber-200' };
}

const TX_TYPE_LABELS: Record<string, string> = {
  subscription: 'Abonnement',
  service_order: 'Commande service',
  late_checkout: 'Départ tardif',
};

function txTypeLabel(type: string): string {
  return TX_TYPE_LABELS[type] ?? type;
}

function txStatusBadge(status: string): { label: string; className: string } {
  if (status === 'completed')
    return { label: 'Payée', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300' };
  if (status === 'failed')
    return { label: 'Échouée', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-300' };
  return { label: status, className: 'border-border bg-muted text-muted-foreground' };
}

function formatTxDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTxAmount(amount: number, currency: string): string {
  return amount.toLocaleString('fr-FR', {
    style: 'currency',
    currency: currency || 'EUR',
  });
}

export interface CurrentSubscriptionView {
  planId: string;
  planName: string;
  planEmoji: string;
  status: string;
  billingCycle: string;
  amount: number;
  currentPeriodEnd: string | null;
  /** v4.95 — 'paypal' | 'stripe' : route la Résiliation vers le bon fournisseur. */
  paymentProvider?: string | null;
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

  // ── AUDIT 4-c : historique des paiements du compte ──
  const [transactions, setTransactions] = useState<BillingTransaction[] | null>(null);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState(false);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    setTxError(false);
    try {
      const res = await fetch('/api/airbnb/billing/transactions', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as { transactions?: BillingTransaction[] } | null;
      if (!res.ok || !json) throw new Error(`HTTP ${res.status}`);
      setTransactions(json.transactions ?? []);
    } catch {
      setTxError(true);
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  // ── v4.69 PHASE 5 — Paiements & Commission (HostSettings + factures) ──
  const [hostSettings, setHostSettings] = useState<HostSettingsView | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [ownStripeToggle, setOwnStripeToggle] = useState(false);
  const [pubKeyInput, setPubKeyInput] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [invoices, setInvoices] = useState<CommissionInvoiceView[] | null>(null);

  const loadHostSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const [sRes, iRes] = await Promise.all([
        fetch('/api/airbnb/host-settings', { cache: 'no-store' }),
        fetch('/api/airbnb/commission-invoices', { cache: 'no-store' }),
      ]);
      const sJson = (await sRes.json().catch(() => null)) as (HostSettingsView & { error?: string }) | null;
      const iJson = (await iRes.json().catch(() => null)) as { invoices?: CommissionInvoiceView[] } | null;
      if (sRes.ok && sJson) {
        setHostSettings({
          useOwnStripe: sJson.useOwnStripe,
          stripePubKey: sJson.stripePubKey ?? '',
          hasStripeSecret: !!sJson.hasStripeSecret,
          commissionRate: sJson.commissionRate,
        });
        setOwnStripeToggle(!!sJson.useOwnStripe);
        setPubKeyInput(sJson.stripePubKey ?? '');
      }
      if (iRes.ok && iJson) setInvoices(iJson.invoices ?? []);
    } catch {
      // silencieux : cartes optionnelles
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHostSettings();
  }, [loadHostSettings]);

  async function saveHostSettings(next: {
    useOwnStripe?: boolean;
    stripePubKey?: string | null;
    stripeSecretKey?: string | null;
  }) {
    setSettingsSaving(true);
    try {
      const res = await fetch('/api/airbnb/host-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; settings?: HostSettingsView };
      if (!res.ok || !json.ok) {
        toast.error(json.error || 'Sauvegarde impossible.');
        return false;
      }
      if (json.settings) {
        setHostSettings({
          useOwnStripe: json.settings.useOwnStripe,
          stripePubKey: json.settings.stripePubKey ?? '',
          hasStripeSecret: !!json.settings.hasStripeSecret,
          commissionRate: json.settings.commissionRate,
        });
        setOwnStripeToggle(json.settings.useOwnStripe);
        setPubKeyInput(json.settings.stripePubKey ?? '');
        setSecretInput('');
      }
      toast.success('Paramètres de paiement enregistrés ✓');
      return true;
    } catch {
      toast.error('Connexion impossible. Réessayez.');
      return false;
    } finally {
      setSettingsSaving(false);
    }
  }

  const activePlanId = current?.status === 'active' || current?.status === 'trialing'
    ? current.planId
    : null;

  // ── v4.95 PayPal activé ? (env PAYPAL_CLIENT_ID/SECRET côté serveur) ──
  // null = chargement → aucun bouton PayPal affiché (pas de layout shift) ;
  // false = non configuré → UI STRICTEMENT identique à avant (Stripe/démo).
  const [paypalEnabled, setPaypalEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/paypal/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { enabled?: boolean } | null) => {
        if (alive) setPaypalEnabled(!!j?.enabled);
      })
      .catch(() => {
        if (alive) setPaypalEnabled(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // ── v4.95 Retour PayPal après approbation/annulation sur paypal.com ──
  // ?paypal=approved&token=<subscriptionId> → POST /api/paypal/activate
  // (vérification serveur via l'API PayPal) puis refresh de l'état.
  // ?paypal=canceled → toast info. Guard par ref : React StrictMode
  // monte les effets deux fois — jamais deux POST d'activation.
  const paypalReturnHandled = useRef(false);

  useEffect(() => {
    const paypalReturn = params.get('paypal');
    if (!paypalReturn || paypalReturnHandled.current) return;
    paypalReturnHandled.current = true;

    if (paypalReturn === 'canceled') {
      toast.info('Paiement PayPal annulé — aucun prélèvement n’a été effectué.');
      window.history.replaceState(null, '', '/airbnb/billing');
      return;
    }

    if (paypalReturn !== 'approved') return;
    const token = params.get('token');
    if (!token) {
      toast.error('Retour PayPal incomplet (jeton absent) — réessayez.');
      window.history.replaceState(null, '', '/airbnb/billing');
      return;
    }

    void (async () => {
      try {
        const res = await fetch('/api/paypal/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptionId: token }),
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !data?.ok) {
          toast.error(data?.error ?? 'Activation de l’abonnement PayPal impossible.');
          window.history.replaceState(null, '', '/airbnb/billing');
          return;
        }
        toast.success('Abonnement PayPal activé — bienvenue ! 🎉');
        // Recharge la page serveur : la carte « abonnement actuel » reflète
        // le nouveau plan (l'URL est nettoyée au passage).
        window.location.assign('/airbnb/billing');
      } catch {
        toast.error('Erreur réseau lors de l’activation — réessayez.');
        window.history.replaceState(null, '', '/airbnb/billing');
      }
    })();
  }, [params]);

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

  /** v4.95 — démarrage du paiement PayPal : approveUrl → redirect. */
  async function subscribeWithPaypal(planId: string, billingCycle: BillingCycle) {
    setBusyPlan(`paypal:${planId}:${billingCycle}`);
    setNotice(null);
    try {
      const res = await fetch('/api/paypal/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, billingCycle }),
      });
      const data = (await res.json()) as { approveUrl?: string; error?: string };
      if (!res.ok || !data.approveUrl) {
        setNotice({ kind: 'error', text: data.error ?? 'Impossible de démarrer le paiement PayPal.' });
        setBusyPlan(null);
        return;
      }
      window.location.assign(data.approveUrl);
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
    // v4.95 — route selon le fournisseur de l'abonnement en cours :
    // PayPal → /api/paypal/cancel, Stripe → /api/stripe/cancel (inchangé).
    const isPaypalSub = current?.paymentProvider === 'paypal';
    try {
      const res = await fetch(isPaypalSub ? '/api/paypal/cancel' : '/api/stripe/cancel', {
        method: 'POST',
      });
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
    <div className="flex-1">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-8 md:py-12">
        {/* ---------- En-tête ---------- */}
        <div className="mb-8">
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            <span aria-hidden="true" className="kpi-bubble-rausch inline-flex h-11 w-11 items-center justify-center rounded-xl text-white shadow">
              <CreditCard className="h-5 w-5" />
            </span>
            Abonnement
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Bonjour {host.name ?? host.email} — gérez votre plan et votre facturation.
          </p>
        </div>

        {/* ---------- Bandeaux ---------- */}
        {success && (
          <div role="status" className="air-shadow mb-6 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <strong>Paiement confirmé — bienvenue !</strong> Votre abonnement est actif et vos
              fonctionnalités premium sont débloquées.
              {params.get('demo') === '1' && ' (mode démo : aucune carte n’a été débitée)'}
            </span>
          </div>
        )}
        {canceled && (
          <div role="status" className="air-shadow mb-6 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>Paiement annulé — aucun prélèvement n’a été effectué.</span>
          </div>
        )}
        {!stripeMode && (
          <div role="note" className="mb-6 flex items-start gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground">
            <span aria-hidden="true">🧪</span>
            <span>
              <strong>Mode démo</strong> — Stripe n’est pas configuré sur cet environnement.
              Les abonnements sont activés instantanément sans paiement réel. Ajoutez
              <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">STRIPE_SECRET_KEY</code>
              pour activer le paiement réel.
            </span>
          </div>
        )}
        {notice && (
          <div
            role="alert"
            className={cn(
              'mb-6 rounded-2xl border px-4 py-3 text-sm',
              notice.kind === 'error'
                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-300'
                : 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-300',
            )}
          >
            {notice.text}
          </div>
        )}

        {/* ---------- Abonnement courant ---------- */}
        {current && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="air-gradient-deep air-shadow-lg relative mb-8 overflow-hidden rounded-3xl p-6 text-white"
          >
            <span aria-hidden="true" className="air-float pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
                  Votre abonnement actuel
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-lg font-bold">
                  <span aria-hidden="true">{current.planEmoji}</span>
                  {current.planName}
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusMeta?.className}`}>
                    {statusMeta?.label}
                  </span>
                </p>
                <p className="mt-1 text-sm text-white/85">
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
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="rounded-full border-transparent bg-white text-[#033a66] hover:bg-white/90"
                  onClick={openPortal}
                  disabled={managing || !stripeMode || current.paymentProvider === 'paypal'}
                  title={current.paymentProvider === 'paypal' ? 'Facturation gérée via PayPal — utilisez votre compte PayPal pour gérer la souscription.' : undefined}
                >
                  {managing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Gérer la facturation
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-full text-white/90 hover:bg-white/15 hover:text-white"
                  onClick={cancelSubscription}
                  disabled={canceling}
                >
                  {canceling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Résilier
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ---------- Toggle mensuel / annuel ----------
            v5.17 : catalogue 100 % mensuel (Solo 29 €/mois, Pro
            99 €/mois — demande client, plus de facturation annuelle
            Hub). Toggle retiré ; cycle forcé à 'monthly'. */}
        {(() => {
          const annualAvailable = HOST_PLANS.some((p) => planPrice(p, 'annual') !== null);
          if (annualAvailable) {
            return (
              <div className="mb-8 flex items-center justify-center gap-3">
                <span className={cn('text-sm font-semibold', cycle === 'monthly' ? 'text-foreground' : 'text-muted-foreground')}>
                  Mensuel
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cycle === 'annual'}
                  aria-label="Basculer entre facturation mensuelle et annuelle"
                  onClick={() => setCycle((c) => (c === 'monthly' ? 'annual' : 'monthly'))}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#055492]/50 focus-visible:ring-offset-2',
                    cycle === 'annual' ? 'air-gradient shadow' : 'border border-border bg-muted',
                  )}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      cycle === 'annual' ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className={cn('text-sm font-semibold', cycle === 'annual' ? 'text-foreground' : 'text-muted-foreground')}>
                  Annuel
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
                  2 mois offerts
                </span>
              </div>
            );
          }
          // Catalogue mensuel seul : garder le cycle cohérent au rendu.
          if (cycle !== 'monthly') setCycle('monthly');
          return null;
        })()}

        {/* ---------- Cartes d'offres ---------- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {HOST_PLANS.map((plan, i) => {
            const price = planPrice(plan, cycle);
            const isCurrent = activePlanId === plan.id;
            const perMonth = monthlyEquivalent(plan, cycle);

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 * i, duration: 0.3, ease: 'easeOut' }}
              >
                <div
                  className={cn(
                    'air-shadow air-hoverlift relative rounded-2xl border bg-card p-6',
                    plan.highlight
                      ? 'border-[#055492]/60 ring-2 ring-[#055492]/25'
                      : 'border-border',
                  )}
                >
                  {plan.badge && (
                    <span
                      className={cn(
                        'absolute -top-3 left-6 rounded-full border px-3 py-1 text-xs font-bold shadow',
                        plan.highlight
                          ? 'air-gradient border-transparent text-white'
                          : 'border-border bg-card text-muted-foreground',
                      )}
                    >
                      {plan.badge}
                    </span>
                  )}

                  <div className="mb-3 flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-flex h-10 w-10 items-center justify-center rounded-xl text-lg shadow',
                        plan.highlight ? 'kpi-bubble-rausch text-white' : 'bg-muted',
                      )}
                    >
                      {plan.emoji}
                    </span>
                    <h2 className="text-lg font-bold text-foreground">{plan.name}</h2>
                    {isCurrent && (
                      <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
                        ✓ Plan actuel
                      </span>
                    )}
                  </div>

                  <p className="mb-4 text-sm text-muted-foreground">{plan.description}</p>

                  <div className="mb-1 flex items-baseline gap-1">
                    <span
                      className={cn(
                        'text-4xl font-extrabold tracking-tight tabular-nums',
                        plan.highlight && price !== null ? 'air-gradient-text' : 'text-foreground',
                      )}
                    >
                      {price === null ? '—' : formatEur(price)}
                    </span>
                    {price !== null && (
                      <span className="text-sm text-muted-foreground">
                        /{cycle === 'annual' ? 'an' : 'mois'}
                      </span>
                    )}
                  </div>
                  {cycle === 'annual' && perMonth !== null && (
                    <p className="mb-4 text-xs text-muted-foreground">soit {formatEur(perMonth)} / mois</p>
                  )}
                  {price === null && (
                    <p className="mb-4 text-xs text-muted-foreground">
                      Disponible en facturation annuelle uniquement
                    </p>
                  )}

                  <ul className="my-5 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f.text} className="flex items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mt-0.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full',
                            f.included ? 'bg-emerald-100 dark:bg-emerald-500/15' : 'bg-muted',
                          )}
                        >
                          {f.included ? (
                            <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                          )}
                        </span>
                        <span className={cn('text-sm', f.included ? 'text-foreground' : 'text-muted-foreground/70')}>
                          {f.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    disabled={isCurrent || price === null || busyPlan !== null}
                    onClick={() => subscribe(plan.id, cycle)}
                    className={cn(
                      'inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-bold shadow transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#055492]/50 disabled:pointer-events-none disabled:opacity-60',
                      plan.highlight
                        ? 'air-gradient text-white hover:scale-[1.02]'
                        : 'border border-border bg-background text-foreground hover:bg-muted/60',
                    )}
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
                  </button>

                  {/* v4.95 — PayPal (activé par env) : bouton EN PLUS du
                      bouton Stripe ci-dessus, style distinct aux couleurs
                      de la marque PayPal. Aucune trace si non configuré. */}
                  {paypalEnabled && price !== null && !isCurrent && (
                    <button
                      type="button"
                      disabled={busyPlan !== null}
                      onClick={() => subscribeWithPaypal(plan.id, cycle)}
                      className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#F5B928] bg-[#FFC439] text-sm font-bold text-[#003087] shadow transition-all hover:bg-[#F5B928] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003087]/40 disabled:pointer-events-none disabled:opacity-60"
                    >
                      {busyPlan === `paypal:${plan.id}:${cycle}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <span aria-hidden="true" className="text-base font-extrabold italic tracking-tight">
                          <span className="text-[#003087]">Pay</span>
                          <span className="text-[#009CDE]">Pal</span>
                        </span>
                      )}
                      Payer avec PayPal
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ---------- Historique des paiements (audit 4-c) ---------- */}
        <section aria-label="Historique des paiements" className="mt-12">
          <div className="mb-4 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="kpi-bubble-emerald inline-flex h-10 w-10 items-center justify-center rounded-xl text-white shadow"
            >
              <ReceiptText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-foreground">Historique des paiements</h2>
              <p className="text-xs text-muted-foreground">Les 50 dernières transactions de votre compte.</p>
            </div>
          </div>

          {txLoading && (
            <div className="space-y-2" aria-busy="true" aria-label="Chargement de l'historique">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-2xl" aria-hidden="true" />
              ))}
            </div>
          )}

          {!txLoading && txError && (
            <div className="air-empty flex flex-col items-center gap-2 rounded-2xl p-6 text-center" role="alert">
              <span className="air-float text-3xl" aria-hidden="true">⚠️</span>
              <p className="text-sm font-semibold text-foreground">Impossible de charger l&apos;historique des paiements.</p>
              <button
                type="button"
                onClick={() => void loadTransactions()}
                aria-label="Réessayer le chargement de l'historique"
                className="air-gradient mt-1 inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-bold text-white shadow transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#055492]/50"
              >
                Réessayer
              </button>
            </div>
          )}

          {!txLoading && !txError && (
            (transactions ?? []).length === 0 ? (
              <div className="air-empty flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
                <span className="air-float text-3xl" aria-hidden="true">🧾</span>
                <p className="text-sm font-semibold text-foreground">Aucun paiement pour le moment.</p>
              </div>
            ) : (
              <div className="air-shadow overflow-hidden rounded-2xl border border-border bg-card">
                <ul className="divide-y divide-border">
                  {(transactions ?? []).map((tx) => {
                    const badge = txStatusBadge(tx.status);
                    return (
                      <li
                        key={tx.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-muted/60 sm:px-5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{txTypeLabel(tx.type)}</p>
                          <p className="text-xs text-muted-foreground">{formatTxDate(tx.createdAt)}</p>
                        </div>
                        <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatTxAmount(tx.amount, tx.currency)}
                        </p>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {tx.stripePaymentId && (
                          <a
                            href={`https://dashboard.stripe.com/payments/${tx.stripePaymentId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            title="Voir le paiement dans le tableau de bord Stripe"
                          >
                            Stripe
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">— ouvre le tableau de bord Stripe dans un nouvel onglet</span>
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          )}
        </section>

        {/* ---------- v4.69 PHASE 5 — Paiements & Commission ---------- */}
        <section aria-label="Paiements et commission" className="mt-12">
          <div className="mb-4 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="air-gradient inline-flex h-10 w-10 items-center justify-center rounded-xl text-white shadow"
            >
              <Percent className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-foreground">Paiements &amp; Commission</h2>
              <p className="text-xs text-muted-foreground">
                Vous encaissez les commandes de votre Hub — RoomScan prélève sa commission en fin de mois.
              </p>
            </div>
          </div>

          {settingsLoading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-28 w-full rounded-2xl" aria-hidden="true" />
              <Skeleton className="h-20 w-full rounded-2xl" aria-hidden="true" />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Carte taux de commission */}
              <div className="air-shadow rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">Taux de commission RoomScan</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Fixé par la plateforme selon votre offre.
                    </p>
                  </div>
                  <span className="air-gradient inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold text-white shadow">
                    <Percent className="h-3.5 w-3.5" aria-hidden="true" />
                    {/* v4.73 — plus JAMAIS de valeur par défaut inventée :
                        « … » pendant le chargement, sinon la valeur RÉELLE
                        renvoyée par l'API (celle fixée par le superadmin). */}
                    {settingsLoading
                      ? '…'
                      : `${Math.round((hostSettings?.commissionRate ?? 0) * 100)} %`}
                  </span>
                </div>
                <div className="mt-4 space-y-1.5 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                  <p>
                    📦 Exemple : pour <strong className="text-foreground">100 €</strong> de commandes encaissées, la
                    commission RoomScan est de{' '}
                    <strong className="text-foreground">
                      {settingsLoading
                        ? '…'
                        : commissionEur(100 * (hostSettings?.commissionRate ?? 0))}
                    </strong>
                    , facturée en fin de mois.
                  </p>
                  <p>Les commandes comptabilisées : minibar réglé, room service livré, pressing confirmé.</p>
                </div>
              </div>

              {/* Carte Stripe propre */}
              <div className="air-shadow rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">Encaisser avec mon propre Stripe</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Les paiements de vos invités arrivent directement sur votre compte Stripe.
                    </p>
                  </div>
                  <Switch
                    checked={ownStripeToggle}
                    onCheckedChange={(v) => void saveHostSettings({ useOwnStripe: v })}
                    disabled={settingsSaving}
                    aria-label="Utiliser mon propre compte Stripe"
                  />
                </div>
                {ownStripeToggle && (
                  <div className="mt-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="stripe-pub" className="text-xs">
                        Clé publique (pk_test_… / pk_live_…)
                      </Label>
                      <Input
                        id="stripe-pub"
                        value={pubKeyInput}
                        onChange={(e) => setPubKeyInput(e.target.value)}
                        placeholder="pk_live_…"
                        className="font-mono text-xs"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="stripe-secret" className="text-xs">
                        Clé secrète {hostSettings?.hasStripeSecret && (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            ✓ enregistrée (laisser vide pour conserver)
                          </span>
                        )}
                      </Label>
                      <Input
                        id="stripe-secret"
                        type="password"
                        value={secretInput}
                        onChange={(e) => setSecretInput(e.target.value)}
                        placeholder={hostSettings?.hasStripeSecret ? '••••••••••••••••' : 'sk_live_…'}
                        className="font-mono text-xs"
                        autoComplete="off"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        void saveHostSettings({
                          stripePubKey: pubKeyInput.trim() || null,
                          ...(secretInput.trim() ? { stripeSecretKey: secretInput.trim() } : {}),
                        })
                      }
                      disabled={settingsSaving || (!pubKeyInput.trim() && !secretInput.trim() && !hostSettings?.hasStripeSecret)}
                    >
                      {settingsSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
                      Enregistrer mes clés
                    </Button>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      🔒 Vos clés sont chiffrées côté serveur et ne sont jamais affichées à nouveau. La commission
                      RoomScan reste facturée mensuellement.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ---------- v4.69 PHASE 5 — Factures de commission RoomScan ---------- */}
        <section aria-label="Factures de commission RoomScan" className="mt-12">
          <div className="mb-4 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-lg text-white shadow"
            >
              🧾
            </span>
            <div>
              <h2 className="text-lg font-bold text-foreground">Factures de commission RoomScan</h2>
              <p className="text-xs text-muted-foreground">Une facture par mois, calculée sur vos commandes encaissées.</p>
            </div>
          </div>

          {!invoices || invoices.length === 0 ? (
            <div className="air-empty flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
              <span className="air-float text-3xl" aria-hidden="true">🧾</span>
              <p className="text-sm font-semibold text-foreground">Aucune facture de commission pour le moment.</p>
              <p className="text-xs text-muted-foreground">Elle apparaîtra ici après la clôture de votre premier mois d&apos;activité.</p>
            </div>
          ) : (
            <div className="air-shadow overflow-hidden rounded-2xl border border-border bg-card">
              <ul className="divide-y divide-border">
                {invoices.map((inv) => {
                  const badge = commissionStatusBadge(inv.status);
                  return (
                    <li
                      key={inv.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-muted/60 sm:px-5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {commissionMonthLabel(inv.month, inv.year)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {inv.ordersCount} commande(s) · {commissionEur(inv.totalOrdersAmount)} encaissé(s) · échéance{' '}
                          {new Date(inv.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <p className="text-sm font-bold tabular-nums text-primary">
                        {commissionEur(inv.commissionOwed)}
                      </p>
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          downloadCommissionInvoicePdf({
                            monthLabel: commissionMonthLabel(inv.month, inv.year),
                            hostName: host.name || 'Hôte',
                            hostEmail: host.email,
                            totalOrdersAmount: inv.totalOrdersAmount,
                            commissionRate: inv.commissionRate,
                            commissionOwed: inv.commissionOwed,
                            ordersCount: inv.ordersCount,
                            breakdown: inv.breakdown,
                            status: inv.status,
                            dueDate: inv.dueDate,
                            paidAt: inv.paidAt,
                            issuedBy: 'RoomScan',
                          })
                        }
                        aria-label={`Télécharger la facture de commission de ${commissionMonthLabel(inv.month, inv.year)}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        PDF
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          🔒 Paiement sécurisé par {paypalEnabled ? 'Stripe · PayPal' : 'Stripe'} · Annulation à tout moment · TVA incluse
        </p>
      </div>
    </div>
  );
}
