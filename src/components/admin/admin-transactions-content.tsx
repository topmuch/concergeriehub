'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

import { CardDescription, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AdminMarketplace } from '@/components/admin/admin-marketplace';

// =============================================================
// AdminTransactionsContent — Module 6 Transactions
//  - Onglet Commandes : ServiceOrder réels (GMV, commissions,
//    statuts paiement) via /api/admin/orders
//  - Onglet Marketplace : AdminMarketplace (composant réel rebranché,
//    endpoints /api/client/* désormais superadmin-only)
//  - Onglet Reversements : payouts prestataires via
//    /api/admin/payouts (Stripe Connect si configuré, sinon manuel)
//    + workflow de litige FIX-13 : statut DISPUTED (champ String du
//    modèle Payout, sans migration), ouverture via
//    POST /api/admin/payouts/[id]/dispute, résolution via
//    POST /api/admin/payouts/[id]/resolve. Note litige (format
//    canonique documenté dans les 2 routes) :
//    `[LITIGE <YYYY-MM-DD>] <raison>` puis résolution APPEND
//    `[RÉSOLUTION <YYYY-MM-DD> RELEASE|REFUND] <note>`.
// =============================================================

interface OrderRow {
  id: string;
  guestName: string;
  guestEmail: string | null;
  itemSummary: string;
  totalAmount: number;
  commission: number;
  hostEarning: number;
  status: string;
  paymentStatus: string;
  stripePaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
  provider: { id: string; businessName: string; category: string; stripeChargesEnabled: boolean };
}

interface OrdersStats {
  gmvPaidEur: number;
  commissionEur: number;
  hostEarningsEur: number;
  pendingEur: number;
  refundedEur: number;
  payoutsPaidEur: number;
  ordersTotal: number;
}

interface PayoutProviderRow {
  id: string;
  businessName: string;
  category: string;
  stripeChargesEnabled: boolean;
  stripeConnectEnabled: boolean;
  earnedEur: number;
  paidEur: number;
  reversibleEur: number;
}

interface PayoutRow {
  id: string;
  providerName: string;
  amount: number;
  status: string;
  method: string;
  stripeTransferId: string | null;
  ordersCount: number;
  note: string | null;
  createdAt: string;
  paidAt: string | null;
}

const PAY_STATUS: Record<string, { label: string; dot: string }> = {
  PAID: { label: 'Payée', dot: '#34d399' },
  UNPAID: { label: 'Impayée', dot: '#fbbf24' },
  REFUNDED: { label: 'Remboursée', dot: '#5cadf0' },
  FAILED: { label: 'Échec', dot: '#64748b' },
};

// FIX-13 — Badges de statut des payouts (palette chaude, pas de bleu :
// DISPUTED = ambre, distinct de FAILED corail et PENDING neutre).
const PAYOUT_STATUS: Record<string, { label: string; dot: string }> = {
  PENDING: { label: 'En attente', dot: '#8fabc2' },
  PAID: { label: 'Payé', dot: '#34d399' },
  FAILED: { label: 'Échoué', dot: '#f07d6a' },
  DISPUTED: { label: 'Litige', dot: '#fbbf24' },
};

const PAYOUT_FILTERS: {
  key: 'ALL' | 'PENDING' | 'DISPUTED' | 'PAID' | 'FAILED';
  label: string;
}[] = [
  { key: 'ALL', label: 'Tous' },
  { key: 'PENDING', label: 'En attente' },
  { key: 'DISPUTED', label: 'Litiges' },
  { key: 'PAID', label: 'Payés' },
  { key: 'FAILED', label: 'Échoués' },
];

type PayoutFilterKey = (typeof PAYOUT_FILTERS)[number]['key'];

export function AdminTransactionsContent() {
  const [stats, setStats] = useState<OrdersStats | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [payoutProviders, setPayoutProviders] = useState<PayoutProviderRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [payoutLoading, setPayoutLoading] = useState(true);
  const [payoutTarget, setPayoutTarget] = useState<PayoutProviderRow | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutBusy, setPayoutBusy] = useState(false);

  // AUD-FULL ④ — Remboursement Superadmin (moteur /api/admin/orders/[id]/refund)
  const [refundTarget, setRefundTarget] = useState<OrderRow | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);

  // FIX-13 — Litiges payouts (workflow administratif, sans appel Stripe)
  const [disputeTarget, setDisputeTarget] = useState<PayoutRow | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<PayoutRow | null>(null);
  const [resolveOutcome, setResolveOutcome] = useState<'RELEASE' | 'REFUND'>('RELEASE');
  const [resolveNote, setResolveNote] = useState('');
  const [resolveBusy, setResolveBusy] = useState(false);
  const [payoutFilter, setPayoutFilter] = useState<PayoutFilterKey>('ALL');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders?limit=50');
      if (!res.ok) throw new Error('Erreur de chargement des commandes');
      const data = await res.json();
      setStats(data.stats);
      setOrders(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPayouts = useCallback(async () => {
    setPayoutLoading(true);
    try {
      const res = await fetch('/api/admin/payouts');
      if (!res.ok) throw new Error('Erreur de chargement des reversements');
      const data = await res.json();
      setPayoutProviders(Array.isArray(data.providers) ? data.providers : []);
      setPayouts(Array.isArray(data.payouts) ? data.payouts : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setPayoutLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchPayouts();
  }, [fetchOrders, fetchPayouts]);

  // Compteurs par statut (filtre de l'historique reversements).
  const payoutCounts = useMemo(() => {
    const c: Record<PayoutFilterKey, number> = { ALL: payouts.length, PENDING: 0, DISPUTED: 0, PAID: 0, FAILED: 0 };
    for (const p of payouts) {
      if (p.status === 'PENDING' || p.status === 'DISPUTED' || p.status === 'PAID' || p.status === 'FAILED') {
        c[p.status] += 1;
      }
    }
    return c;
  }, [payouts]);

  const filteredPayouts =
    payoutFilter === 'ALL' ? payouts : payouts.filter((p) => p.status === payoutFilter);

  const createPayout = async () => {
    if (!payoutTarget) return;
    setPayoutBusy(true);
    try {
      const res = await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: payoutTarget.id, amount: Number(payoutAmount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message || 'Reversement enregistré');
      setPayoutTarget(null);
      setPayoutAmount('');
      fetchPayouts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setPayoutBusy(false);
    }
  };

  // Remboursement total de la commande via le moteur partagé avec la
  // route hôte (Stripe réel si clé configurée, sinon mode démo tracé).
  const refundOrder = async () => {
    if (!refundTarget) return;
    setRefundBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${refundTarget.id}/refund`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      const amount = data.refund?.totalAmount ?? refundTarget.totalAmount;
      toast.success(
        data.refund?.mode === 'stripe'
          ? `Remboursement Stripe de ${Number(amount).toFixed(2)} € effectué`
          : `Remboursement de ${Number(amount).toFixed(2)} € enregistré (mode démo — sans clé Stripe)`,
      );
      setRefundTarget(null);
      fetchOrders(); // refetch : statut + KPIs finance recalculés
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setRefundBusy(false);
    }
  };

  // FIX-13 — Ouvre un litige sur un payout PENDING/FAILED (l'API refuse
  // PAID en 409) : status='DISPUTED' + note `[LITIGE <date>] <raison>`.
  const openDispute = async () => {
    if (!disputeTarget) return;
    setDisputeBusy(true);
    try {
      const res = await fetch(`/api/admin/payouts/${disputeTarget.id}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: disputeReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message || 'Litige ouvert');
      setDisputeTarget(null);
      setDisputeReason('');
      fetchPayouts(); // refetch : badge Litige + note visibles
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setDisputeBusy(false);
    }
  };

  // FIX-13 — Résout un litige : RELEASE (status='PAID', paidAt=now —
  // marqué payé manuellement si method MANUAL, décision administrative
  // sans écriture Stripe) ou REFUND (status='FAILED', montant redevient
  // réversible) + note de résolution appended côté API.
  const resolveDispute = async () => {
    if (!resolveTarget) return;
    setResolveBusy(true);
    try {
      const res = await fetch(`/api/admin/payouts/${resolveTarget.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: resolveOutcome, note: resolveNote.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message || 'Litige résolu');
      setResolveTarget(null);
      setResolveNote('');
      setResolveOutcome('RELEASE');
      fetchPayouts(); // refetch : statut final + paidAt + note de résolution
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setResolveBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ----- KPIs finance réels ----- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'GMV payée (total)', value: stats ? `${stats.gmvPaidEur.toFixed(2)} €` : undefined, tone: 'luxkpi-gold' },
          { label: 'Commission plateforme', value: stats ? `${stats.commissionEur.toFixed(2)} €` : undefined, tone: 'luxkpi-sapphire' },
          { label: 'En attente de paiement', value: stats ? `${stats.pendingEur.toFixed(2)} €` : undefined, tone: 'luxkpi-violet' },
          { label: 'Reversements versés', value: stats ? `${stats.payoutsPaidEur.toFixed(2)} €` : undefined, tone: 'luxkpi-emerald' },
        ].map((kpi) => (
          <div key={kpi.label} className={`luxkpi ${kpi.tone}`}>
            <span className="luxkpi-label">{kpi.label}</span>
            <div className="luxkpi-value mt-2.5 text-[24px] leading-none sm:text-[27px]">
              {kpi.value === undefined ? (
                <span className="block h-7 w-24 animate-pulse rounded-lg bg-white/10" aria-hidden="true" />
              ) : (
                kpi.value
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="lux-card overflow-hidden">
        <div className="p-0">
          <Tabs defaultValue="commandes" className="gap-0">
            <div className="border-b border-white/8 px-4 pt-4 sm:px-6">
              <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
                <TabsTrigger value="commandes" className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white">
                  Commandes de service
                </TabsTrigger>
                <TabsTrigger value="marketplace" className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white">
                  Marketplace
                </TabsTrigger>
                <TabsTrigger value="payouts" className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white">
                  Reversements
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ----- Commandes de service ----- */}
            <TabsContent value="commandes" className="p-4 sm:p-6">
              <div className="mb-3 flex items-center justify-between">
                <CardDescription className="text-[#8fabc2]">
                  {stats ? `${stats.ordersTotal} commande(s) — remboursements : ${stats.refundedEur.toFixed(2)} €` : '…'}
                </CardDescription>
                <Button variant="outline" size="sm" className="lux-btn-ghost h-9 rounded-full px-4 text-xs" onClick={fetchOrders}>
                  Rafraîchir
                </Button>
              </div>
              {loading ? (
                <TableSkeletonRows />
              ) : orders.length === 0 ? (
                <EmptyState text="Aucune commande de service en base." />
              ) : (
                <div className="lux-scroll max-h-[32rem] overflow-y-auto rounded-xl border border-white/10">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                      <TableRow className="border-white/8">
                        <TableHead className="lux-eyebrow !text-[9.5px]">Invité / prestation</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Prestataire</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Montant</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px] hidden md:table-cell" title="Marge plateforme sur les commandes marketplace (15 %) — distincte de la commission mensuelle hôte (20 %, onglet Factures)">Marge plateforme</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Paiement</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px] hidden lg:table-cell">Date</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px] w-32">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((o) => {
                        const pay = PAY_STATUS[o.paymentStatus] ?? { label: o.paymentStatus, dot: '#8fabc2' };
                        return (
                          <TableRow key={o.id} className="border-white/8 hover:bg-white/[0.04]">
                            <TableCell>
                              <p className="font-semibold text-white">{o.guestName}</p>
                              <p className="max-w-56 truncate text-xs text-[#8fabc2]">{o.itemSummary}</p>
                            </TableCell>
                            <TableCell className="text-sm text-white/85">{o.provider.businessName}</TableCell>
                            <TableCell className="text-sm font-bold">
                              <span className={`lux-num font-bold ${o.paymentStatus === 'REFUNDED' ? 'text-[#8fabc2]/60 line-through' : 'text-white'}`}>
                                {o.totalAmount.toFixed(2)} €
                              </span>
                              {o.paymentStatus === 'REFUNDED' && (
                                <p className="text-xs font-normal text-[#8fabc2]/70">Remboursée au client</p>
                              )}
                            </TableCell>
                            <TableCell className="hidden text-sm text-[#8fabc2] md:table-cell">
                              {o.commission.toFixed(2)} €
                            </TableCell>
                            <TableCell>
                              <span className="lux-chip">
                                <span className="lux-dot" style={{ backgroundColor: pay.dot }} aria-hidden="true" />
                                {pay.label}
                              </span>
                            </TableCell>
                            <TableCell className="hidden text-sm text-[#8fabc2] lg:table-cell">
                              {format(new Date(o.createdAt), 'dd MMM yyyy', { locale: fr })}
                            </TableCell>
                            <TableCell>
                              {/* Rembourser : uniquement une commande PAID (le
                                  moteur refuse UNPAID/FAILED/REFUNDED en 409). */}
                              {o.paymentStatus === 'PAID' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-full border-[#f07d6a]/30 bg-transparent px-3 text-xs text-[#f07d6a] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]"
                                  onClick={() => setRefundTarget(o)}
                                >
                                  Rembourser
                                </Button>
                              ) : (
                                <span className="text-[#8fabc2]/40">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ----- Marketplace (composant orphelin rebranché) ----- */}
            <TabsContent value="marketplace" className="p-4 sm:p-6">
              <AdminMarketplace />
            </TabsContent>

            {/* ----- Reversements ----- */}
            <TabsContent value="payouts" className="space-y-4 p-4 sm:p-6">
              <div>
                <CardTitle className="lux-display text-lg font-semibold text-white">Gains réversibles par prestataire</CardTitle>
                <CardDescription className="mt-1 text-xs text-[#8fabc2]">
                  Part prestataire des commandes payées, non encore reversée.
                  {payoutProviders.some((p) => p.stripeChargesEnabled && p.stripeConnectEnabled)
                    ? ' Stripe Connect actif : transferts automatiques.'
                    : ' Stripe Connect non configuré : reversements manuels tracés.'}
                </CardDescription>
              </div>
              {payoutLoading ? (
                <TableSkeletonRows />
              ) : payoutProviders.length === 0 ? (
                <EmptyState text="Aucun prestataire actif." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/8">
                        <TableHead className="lux-eyebrow !text-[9.5px]">Prestataire</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Gains cumulés</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Déjà reversé</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Réversible</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px] hidden md:table-cell">Stripe Connect</TableHead>
                        <TableHead className="w-28"><span className="sr-only">Action</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payoutProviders.map((p) => (
                        <TableRow key={p.id} className="border-white/8 hover:bg-white/[0.04]">
                          <TableCell className="font-semibold text-white">{p.businessName}</TableCell>
                          <TableCell className="lux-num text-sm text-white">{p.earnedEur.toFixed(2)} €</TableCell>
                          <TableCell className="text-sm text-[#8fabc2]">{p.paidEur.toFixed(2)} €</TableCell>
                          <TableCell className="lux-num text-sm font-bold text-[#86e9cb]">
                            {p.reversibleEur.toFixed(2)} €
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {p.stripeChargesEnabled ? (
                              <span className="lux-chip">
                                <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" /> Actif
                              </span>
                            ) : (
                              <span className="lux-chip">Non onboardé</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant={p.reversibleEur > 0 ? 'default' : 'outline'}
                              className={p.reversibleEur > 0 ? 'lux-btn h-8 rounded-full px-3 text-xs' : 'lux-btn-ghost h-8 rounded-full px-3 text-xs'}
                              disabled={p.reversibleEur <= 0}
                              onClick={() => {
                                setPayoutTarget(p);
                                setPayoutAmount(p.reversibleEur.toFixed(2));
                              }}
                            >
                              Payer
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="pt-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="lux-display text-lg font-semibold text-white">Historique des reversements</CardTitle>
                  {/* FIX-13 — Filtre par statut avec compteurs (inclut DISPUTED) */}
                  {payouts.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {PAYOUT_FILTERS.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setPayoutFilter(f.key)}
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                            payoutFilter === f.key
                              ? 'border-white/25 bg-white/12 text-white'
                              : 'border-white/10 bg-white/[0.03] text-[#8fabc2] hover:bg-white/[0.06] hover:text-white'
                          }`}
                        >
                          {f.label} ({payoutCounts[f.key]})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {payouts.length === 0 ? (
                  <p className="text-sm text-[#8fabc2]">Aucun reversement encore enregistré.</p>
                ) : filteredPayouts.length === 0 ? (
                  <p className="text-sm text-[#8fabc2]">Aucun reversement pour ce filtre.</p>
                ) : (
                  <div className="lux-scroll max-h-72 overflow-auto rounded-xl border border-white/10">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                        <TableRow className="border-white/8">
                          <TableHead className="lux-eyebrow !text-[9.5px]">Prestataire</TableHead>
                          <TableHead className="lux-eyebrow !text-[9.5px]">Montant</TableHead>
                          <TableHead className="lux-eyebrow !text-[9.5px]">Méthode</TableHead>
                          <TableHead className="lux-eyebrow !text-[9.5px]">Statut</TableHead>
                          <TableHead className="lux-eyebrow !text-[9.5px] hidden sm:table-cell">Référence</TableHead>
                          <TableHead className="lux-eyebrow !text-[9.5px]">Date</TableHead>
                          <TableHead className="lux-eyebrow !text-[9.5px] w-40">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPayouts.map((p) => {
                          const st = PAYOUT_STATUS[p.status] ?? { label: p.status, dot: '#8fabc2' };
                          return (
                            <TableRow key={p.id} className="border-white/8 hover:bg-white/[0.04]">
                              <TableCell>
                                <p className="font-medium text-white">{p.providerName}</p>
                                {/* Note litige (FIX-13) : tronquée, complète au survol */}
                                {p.note && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <p className="max-w-48 truncate text-xs text-[#fbbf24]/90">{p.note}</p>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-80 whitespace-pre-wrap border-white/10 bg-[#0d1530] text-white">
                                      {p.note}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </TableCell>
                              <TableCell className="lux-num text-sm font-bold text-white">{p.amount.toFixed(2)} €</TableCell>
                              <TableCell>
                                <span className="lux-chip">{p.method === 'STRIPE_CONNECT' ? 'Stripe Connect' : 'Manuel'}</span>
                              </TableCell>
                              <TableCell>
                                <span className="lux-chip">
                                  <span className="lux-dot" style={{ backgroundColor: st.dot }} aria-hidden="true" />
                                  {st.label}
                                </span>
                              </TableCell>
                              <TableCell className="hidden font-mono text-xs text-[#8fabc2] sm:table-cell">
                                {p.stripeTransferId ?? '—'}
                              </TableCell>
                              <TableCell className="text-sm text-[#8fabc2]">
                                {format(new Date(p.paidAt ?? p.createdAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                              </TableCell>
                              <TableCell>
                                {/* FIX-13 — Actions litige : ouverture sur
                                    PENDING/FAILED (l'API refuse PAID en 409),
                                    résolution sur DISPUTED uniquement. */}
                                {p.status === 'PENDING' || p.status === 'FAILED' ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 rounded-full border-[#fbbf24]/30 bg-transparent px-2 text-xs text-[#fbbf24] hover:bg-[#fbbf24]/10 hover:text-[#fbbf24]"
                                    onClick={() => {
                                      setDisputeReason('');
                                      setDisputeTarget(p);
                                    }}
                                  >
                                    Ouvrir un litige
                                  </Button>
                                ) : p.status === 'DISPUTED' ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 rounded-full border-white/12 bg-transparent px-2 text-xs text-[#8fabc2] hover:bg-white/[0.06] hover:text-white"
                                    onClick={() => {
                                      setResolveOutcome('RELEASE');
                                      setResolveNote('');
                                      setResolveTarget(p);
                                    }}
                                  >
                                    Résoudre
                                  </Button>
                                ) : (
                                  <span className="text-[#8fabc2]/40">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ----- Dialog reversement ----- */}
      <Dialog open={payoutTarget !== null} onOpenChange={(o) => !o && setPayoutTarget(null)}>
        <DialogContent className="border-white/10 bg-[#0b1226] text-white">
          <DialogHeader>
            <DialogTitle className="lux-display text-lg text-white">Reversement — {payoutTarget?.businessName}</DialogTitle>
            <DialogDescription className="text-[#8fabc2]">
              Réversible : {payoutTarget?.reversibleEur.toFixed(2)} €.
              {payoutTarget?.stripeChargesEnabled
                ? ' Transfert Stripe Connect réel si la clé est configurée.'
                : ' Sans Stripe, le reversement est enregistré comme virement manuel.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="payout-amount" className="text-[#8fabc2]">Montant (€)</Label>
            <Input
              id="payout-amount"
              type="number"
              min="0"
              step="0.01"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
            />
          </div>
          <DialogFooter>
            <Button onClick={createPayout} disabled={payoutBusy || !(Number(payoutAmount) > 0)} className="lux-btn h-9 rounded-full px-4 text-xs">
              Confirmer le reversement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- Confirmation remboursement (irréversible) ----- */}
      <AlertDialog open={refundTarget !== null} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <AlertDialogContent className="border-white/10 bg-[#0b1226] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="lux-display text-lg text-white">Rembourser cette commande ?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8fabc2]">
              Remboursement total via Stripe sur le paiement d&apos;origine.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt className="font-medium text-[#8fabc2]">Invité</dt>
              <dd className="font-semibold text-white">{refundTarget?.guestName}</dd>
              <dt className="font-medium text-[#8fabc2]">Service</dt>
              <dd className="max-w-64 truncate font-semibold text-white">{refundTarget?.itemSummary}</dd>
              <dt className="font-medium text-[#8fabc2]">Prestataire</dt>
              <dd className="font-semibold text-white">{refundTarget?.provider.businessName}</dd>
              <dt className="font-medium text-[#8fabc2]">Montant total</dt>
              <dd className="lux-num text-base font-extrabold text-white">
                {refundTarget?.totalAmount.toFixed(2)} €
              </dd>
            </dl>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl border border-[#f07d6a]/25 bg-[#f07d6a]/8 px-3 py-2">
            <span className="lux-dot mt-2 shrink-0" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
            <p className="text-sm font-semibold text-[#f5a58f]">
              Le remboursement Stripe est irréversible. La Transaction d&apos;origine passera au statut « refunded ».
              {" "}Sans clé Stripe configurée, le remboursement est tracé en mode démo (états basculés en base, sans appel Stripe).
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refundBusy} className="lux-btn-ghost h-9 rounded-full border-white/12 bg-transparent px-4 text-xs">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="border border-[#f07d6a]/40 bg-[#f07d6a]/10 text-[#f07d6a] hover:bg-[#f07d6a]/20"
              onClick={(e) => {
                e.preventDefault();
                if (refundTarget) refundOrder();
              }}
              disabled={refundBusy}
            >
              Confirmer le remboursement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ----- FIX-13 — Dialog ouverture de litige (PENDING/FAILED) ----- */}
      <Dialog open={disputeTarget !== null} onOpenChange={(o) => !o && setDisputeTarget(null)}>
        <DialogContent className="border-white/10 bg-[#0b1226] text-white">
          <DialogHeader>
            <DialogTitle className="lux-display text-lg text-white">Ouvrir un litige — {disputeTarget?.providerName}</DialogTitle>
            <DialogDescription className="text-[#8fabc2]">
              Reversement de {disputeTarget?.amount.toFixed(2)} € (
              {disputeTarget?.method === 'STRIPE_CONNECT' ? 'Stripe Connect' : 'virement manuel'}). Le litige est un
              suivi administratif : aucun mouvement Stripe n&apos;est déclenché. Un reversement déjà payé ne peut pas
              être contesté.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="dispute-reason" className="text-[#8fabc2]">Raison du litige (min. 10 caractères)</Label>
            <Textarea
              id="dispute-reason"
              rows={4}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Ex : commande remboursée au client, le prestataire conteste le montant…"
              disabled={disputeBusy}
              className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
            />
            <p
              className={`text-xs ${
                disputeReason.trim().length >= 10 ? 'text-[#34d399]' : 'text-[#8fabc2]'
              }`}
            >
              {disputeReason.trim().length}/10 caractères minimum
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="lux-btn-ghost h-9 rounded-full px-4 text-xs" onClick={() => setDisputeTarget(null)} disabled={disputeBusy}>
              Annuler
            </Button>
            <Button
              className="h-9 rounded-full border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-4 text-xs font-semibold text-[#fbbf24] hover:bg-[#fbbf24]/20"
              onClick={openDispute}
              disabled={disputeBusy || disputeReason.trim().length < 10}
            >
              Ouvrir le litige
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- FIX-13 — Dialog résolution de litige (DISPUTED) ----- */}
      <Dialog open={resolveTarget !== null} onOpenChange={(o) => !o && setResolveTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0b1226] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="lux-display text-lg text-white">Résoudre le litige — {resolveTarget?.providerName}</DialogTitle>
            <DialogDescription className="text-[#8fabc2]">
              Reversement de {resolveTarget?.amount.toFixed(2)} € en litige.
            </DialogDescription>
          </DialogHeader>
          {/* Raison du litige (note `[LITIGE <date>] …`) affichée en clair */}
          <div className="rounded-xl border border-[#fbbf24]/25 bg-[#fbbf24]/8 p-3">
            <p className="lux-eyebrow mb-1 !text-[9.5px] text-[#fbbf24]">Raison du litige</p>
            <p className="whitespace-pre-wrap text-sm text-white/85">{resolveTarget?.note ?? '—'}</p>
          </div>
          <RadioGroup
            value={resolveOutcome}
            onValueChange={(v) => setResolveOutcome(v as 'RELEASE' | 'REFUND')}
            className="gap-2"
            disabled={resolveBusy}
          >
            <Label
              htmlFor="outcome-release"
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                resolveOutcome === 'RELEASE' ? 'border-[#34d399]/50 bg-[#34d399]/8' : 'border-white/10'
              }`}
            >
              <RadioGroupItem id="outcome-release" value="RELEASE" className="mt-0.5" />
              <span>
                <span className="block font-semibold text-white">Libérer le paiement</span>
                <span className="block text-xs font-normal text-[#8fabc2]">
                  Le reversement est marqué Payé. Virement à exécuter manuellement si méthode manuelle — aucune
                  écriture Stripe n&apos;est déclenchée (décision administrative).
                </span>
              </span>
            </Label>
            <Label
              htmlFor="outcome-refund"
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                resolveOutcome === 'REFUND' ? 'border-[#f07d6a]/50 bg-[#f07d6a]/8' : 'border-white/10'
              }`}
            >
              <RadioGroupItem id="outcome-refund" value="REFUND" className="mt-0.5" />
              <span>
                <span className="block font-semibold text-white">Marquer remboursé / annulé</span>
                <span className="block text-xs font-normal text-[#8fabc2]">
                  Le reversement passe en Échoué : le montant redevient réversible pour le prestataire.
                </span>
              </span>
            </Label>
          </RadioGroup>
          <div className="grid gap-2">
            <Label htmlFor="resolve-note" className="text-[#8fabc2]">Note de résolution (min. 3 caractères)</Label>
            <Textarea
              id="resolve-note"
              rows={3}
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="Ex : virement exécuté le … / commande remboursée au client, payout annulé"
              disabled={resolveBusy}
              className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="lux-btn-ghost h-9 rounded-full px-4 text-xs" onClick={() => setResolveTarget(null)} disabled={resolveBusy}>
              Annuler
            </Button>
            <Button
              className={
                resolveOutcome === 'REFUND'
                  ? 'h-9 rounded-full border border-[#f07d6a]/40 bg-[#f07d6a]/10 px-4 text-xs font-semibold text-[#f07d6a] hover:bg-[#f07d6a]/20'
                  : 'h-9 rounded-full border border-[#34d399]/40 bg-[#34d399]/10 px-4 text-xs font-semibold text-[#86e9cb] hover:bg-[#34d399]/20'
              }
              onClick={resolveDispute}
              disabled={resolveBusy || resolveNote.trim().length < 3}
            >
              Confirmer la résolution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="lux-empty rounded-xl px-4 py-12 text-center">
      <p className="mx-auto max-w-md text-sm text-[#8fabc2]">{text}</p>
    </div>
  );
}

function TableSkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full bg-white/8" />
      ))}
    </div>
  );
}
