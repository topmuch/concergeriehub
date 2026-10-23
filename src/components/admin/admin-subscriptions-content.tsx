'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HOST_PLANS } from '@/lib/billing';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { AdminPacks } from '@/components/admin/admin-packs';

// =============================================================
// AdminSubscriptions — Module 4 Abonnements
//  - KPIs réels : MRR, ARR, actifs, impayés, churn 30 j
//  - Onglet Abonnements : table (hôtes/marchands/prestataires)
//    + actions cancel / reactivate (confirmées, auditées)
//  - Onglet Factures : paiements d'abonnement (Transaction réels)
//  - Onglet Coupons : création + annulation (coupon marketplace)
//  - Onglet Packs : réutilisation du composant AdminPacks (config)
// Sources : /api/admin/subscriptions, /api/admin/coupons.
// =============================================================

interface SubRow {
  id: string;
  plan: string;
  amount: number;
  currency: string;
  billingCycle: string;
  status: string;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  subscriber: { type: string; id: string; name: string; email: string | null };
}

interface InvoiceRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  stripePaymentId: string | null;
  createdAt: string;
}

interface CouponRow {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  maxUses: number;
  currentUses: number;
  scans: number;
  status: string;
  commissionRate: number;
  validUntil: string | null;
  createdAt: string;
  merchantName: string;
  ownerEmail: string | null;
}

interface SubsStats {
  mrrEur: number;
  arrEur: number;
  activeCount: number;
  pastDueCount: number;
  cancelled30d: number;
  byPlan: { plan: string; count: number }[];
}

const STATUS_LABEL: Record<string, { label: string; dot: string }> = {
  active: { label: 'Actif', dot: '#34d399' },
  past_due: { label: 'Impayé', dot: '#fbbf24' },
  cancelled: { label: 'Annulé', dot: '#8fabc2' },
  trialing: { label: 'Essai', dot: '#5cadf0' },
};

export function AdminSubscriptionsContent() {
  const [stats, setStats] = useState<SubsStats | null>(null);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [couponDialog, setCouponDialog] = useState(false);
  const [couponForm, setCouponForm] = useState({ code: '', discountType: 'percentage', discountValue: '10', maxUses: '50', commissionRate: '5' });
  const [couponBusy, setCouponBusy] = useState(false);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/subscriptions');
      if (!res.ok) throw new Error('Erreur de chargement');
      const data = await res.json();
      setStats(data.stats);
      setSubs(Array.isArray(data.data) ? data.data : []);
      setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCoupons = useCallback(async () => {
    setCouponsLoading(true);
    try {
      const res = await fetch('/api/admin/coupons');
      if (!res.ok) throw new Error('Erreur de chargement des coupons');
      const data = await res.json();
      setCoupons(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setCouponsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubs();
    fetchCoupons();
  }, [fetchSubs, fetchCoupons]);

  const subAction = async (sub: SubRow, action: 'cancel' | 'reactivate') => {
    setBusyId(sub.id);
    try {
      const res = await fetch(`/api/admin/subscriptions/${sub.id}?action=${action}`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message || 'OK');
      fetchSubs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setBusyId(null);
    }
  };

  // ── v4.71 — ÉDITION D'UN ABONNEMENT (plan / cycle / montant / statut) ──
  const [editSub, setEditSub] = useState<SubRow | null>(null);
  const [editForm, setEditForm] = useState({
    plan: 'airbnb_solo',
    billingCycle: 'annual',
    amount: '',
    status: 'active',
  });
  const [editBusy, setEditBusy] = useState(false);

  const openEdit = (sub: SubRow) => {
    const isHostPlan = HOST_PLANS.some((p) => p.id === sub.plan);
    setEditSub(sub);
    setEditForm({
      plan: isHostPlan ? sub.plan : 'custom',
      billingCycle: sub.billingCycle === 'monthly' ? 'monthly' : 'annual',
      amount: sub.amount.toFixed(2),
      status: sub.status,
    });
  };

  /** Prix du plan × cycle (recalcul immédiat côté serveur via HOST_PLANS). */
  const editPricePreview = (): { price: number | null; cycle: string } | null => {
    const hp = HOST_PLANS.find((p) => p.id === editForm.plan);
    if (!hp) return null;
    const cycle = editForm.billingCycle === 'monthly' ? 'monthly' : 'annual';
    return { price: hp.prices[cycle] ?? hp.prices.annual, cycle: hp.prices[cycle] != null ? cycle : 'annual' };
  };

  const saveEdit = async () => {
    if (!editSub) return;
    setEditBusy(true);
    try {
      const body: Record<string, unknown> = { status: editForm.status };
      if (editForm.plan === 'custom') {
        const amount = Number(editForm.amount.replace(',', '.'));
        if (!Number.isFinite(amount) || amount < 0) throw new Error('Montant invalide');
        body.plan = 'custom';
        body.amount = amount;
        body.billingCycle = editForm.billingCycle;
      } else {
        body.plan = editForm.plan;
        body.billingCycle = editPricePreview()?.cycle ?? editForm.billingCycle;
      }
      const res = await fetch(`/api/admin/subscriptions/${editSub.id}?action=edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message || 'Abonnement mis à jour');
      setEditSub(null);
      fetchSubs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setEditBusy(false);
    }
  };

  const createCoupon = async () => {
    setCouponBusy(true);
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponForm.code || undefined,
          discountType: couponForm.discountType,
          discountValue: Number(couponForm.discountValue),
          maxUses: Number(couponForm.maxUses),
          commissionRate: Number(couponForm.commissionRate),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(`Coupon ${data.coupon.code} créé`);
      setCouponDialog(false);
      setCouponForm({ code: '', discountType: 'percentage', discountValue: '10', maxUses: '50', commissionRate: '5' });
      fetchCoupons();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setCouponBusy(false);
    }
  };

  const cancelCoupon = async (coupon: CouponRow) => {
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}?action=cancel`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message || 'Coupon annulé');
      fetchCoupons();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ----- KPIs réels ----- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'MRR (revenu mensuel récurrent)', value: stats ? `${stats.mrrEur.toFixed(2)} €` : undefined, tone: 'luxkpi-gold' },
          { label: 'ARR (projections 12 mois)', value: stats ? `${stats.arrEur.toFixed(2)} €` : undefined, tone: 'luxkpi-sapphire' },
          { label: 'Abonnements actifs', value: stats?.activeCount, tone: 'luxkpi-emerald' },
          { label: 'Impayés / churn 30 j', value: stats ? `${stats.pastDueCount} / ${stats.cancelled30d}` : undefined, tone: 'luxkpi-coral' },
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
          <Tabs defaultValue="abonnements" className="gap-0">
            <div className="border-b border-white/8 px-4 pt-4 sm:px-6">
              <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
                <TabsTrigger value="abonnements" className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white">
                  Abonnements
                </TabsTrigger>
                <TabsTrigger value="factures" className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white">
                  Factures
                </TabsTrigger>
                <TabsTrigger value="coupons" className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white">
                  Coupons
                </TabsTrigger>
                <TabsTrigger value="packs" className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white">
                  Packs &amp; Config
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ----- Onglet Abonnements ----- */}
            <TabsContent value="abonnements" className="p-4 sm:p-6">
              {loading ? (
                <TableSkeletonRows />
              ) : subs.length === 0 ? (
                <EmptyState text="Aucun abonnement en base — les abonnements apparaissent dès le premier paiement (Stripe ou démo)." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/8">
                        <TableHead className="lux-eyebrow !text-[9.5px]">Souscripteur</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Plan</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Montant</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px] hidden md:table-cell">Statut</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px] hidden lg:table-cell">Fin de période</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px] hidden xl:table-cell">Créé le</TableHead>
                        <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subs.map((s) => {
                        const st = STATUS_LABEL[s.status] ?? { label: s.status, dot: '#8fabc2' };
                        return (
                          <TableRow key={s.id} className="border-white/8 hover:bg-white/[0.04]">
                            <TableCell>
                              <p className="font-semibold text-white">{s.subscriber.name}</p>
                              <p className="text-xs text-[#8fabc2]">
                                {s.subscriber.type === 'user' ? s.subscriber.email : s.subscriber.type}
                              </p>
                            </TableCell>
                            <TableCell>
                              <span className="lux-chip">{s.plan}</span>
                            </TableCell>
                            <TableCell className="text-sm">
                              <span className="lux-num font-semibold text-white">{s.amount.toFixed(2)} €</span>
                              <span className="text-[#8fabc2]"> / {s.billingCycle === 'monthly' ? 'mois' : 'an'}</span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="lux-chip">
                                <span className="lux-dot" style={{ backgroundColor: st.dot }} aria-hidden="true" />
                                {st.label}
                              </span>
                            </TableCell>
                            <TableCell className="hidden text-sm text-[#8fabc2] lg:table-cell">
                              {s.currentPeriodEnd ? format(new Date(s.currentPeriodEnd), 'dd MMM yyyy', { locale: fr }) : '—'}
                            </TableCell>
                            <TableCell className="hidden text-sm text-[#8fabc2] xl:table-cell">
                              {format(new Date(s.createdAt), 'dd MMM yyyy', { locale: fr })}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                {/* v4.71 — Modifier (plan / cycle / montant / statut) */}
                                <Button variant="ghost" size="sm" className="h-8 rounded-full px-2.5 text-[11px] font-semibold text-[#8fabc2] hover:bg-white/8 hover:text-white"
                                  onClick={() => openEdit(s)} disabled={busyId === s.id}
                                  aria-label="Modifier cet abonnement">
                                  Modifier
                                </Button>
                                {s.status === 'active' && (
                                  <Button variant="ghost" size="sm" className="h-8 rounded-full px-2.5 text-[11px] font-semibold text-[#f07d6a] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]"
                                    onClick={() => subAction(s, 'cancel')} disabled={busyId === s.id}
                                    aria-label="Annuler cet abonnement">
                                    Annuler
                                  </Button>
                                )}
                                {s.status !== 'active' && (
                                  <Button variant="ghost" size="sm" className="h-8 rounded-full px-2.5 text-[11px] font-semibold text-[#5cadf0] hover:bg-[#5cadf0]/10 hover:text-[#a9d8ff]"
                                    onClick={() => subAction(s, 'reactivate')} disabled={busyId === s.id}
                                    aria-label="Réactiver cet abonnement">
                                    Réactiver
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ----- Onglet Factures ----- */}
            <TabsContent value="factures" className="p-4 sm:p-6">
              {invoices.length === 0 ? (
                <EmptyState text="Aucune facture — les paiements d'abonnement (webhook Stripe / démo) y apparaissent." />
              ) : (
                <div className="lux-scroll max-h-96 overflow-y-auto rounded-xl border border-white/10">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                      <TableRow className="border-white/8">
                        <TableHead className="lux-eyebrow !text-[9.5px]">Facture</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Montant</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Statut</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px] hidden sm:table-cell">Référence Stripe</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((i) => (
                        <TableRow key={i.id} className="border-white/8 hover:bg-white/[0.04]">
                          <TableCell className="font-mono text-xs text-white">#{i.id.slice(0, 8)}</TableCell>
                          <TableCell className="lux-num text-sm font-semibold text-white">{i.amount.toFixed(2)} €</TableCell>
                          <TableCell>
                            <span className="lux-chip">
                              <span
                                className="lux-dot"
                                style={{ backgroundColor: i.status === 'completed' || i.status === 'PAID' ? '#34d399' : '#8fabc2' }}
                                aria-hidden="true"
                              />
                              {i.status}
                            </span>
                          </TableCell>
                          <TableCell className="hidden font-mono text-xs text-[#8fabc2] sm:table-cell">
                            {i.stripePaymentId ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm text-[#8fabc2]">
                            {format(new Date(i.createdAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ----- Onglet Coupons ----- */}
            <TabsContent value="coupons" className="p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-[#8fabc2]">Coupons marketplace — réductions et scans réels.</p>
                <Button size="sm" className="lux-btn h-9 rounded-full px-4 text-xs" onClick={() => setCouponDialog(true)}>
                  Nouveau coupon
                </Button>
              </div>
              {couponsLoading ? (
                <TableSkeletonRows />
              ) : coupons.length === 0 ? (
                <EmptyState text="Aucun coupon en base." />
              ) : (
                <div className="lux-scroll max-h-96 overflow-y-auto rounded-xl border border-white/10">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                      <TableRow className="border-white/8">
                        <TableHead className="lux-eyebrow !text-[9.5px]">Code</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Réduction</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Usage</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px] hidden sm:table-cell">Marchand</TableHead>
                        <TableHead className="lux-eyebrow !text-[9.5px]">Statut</TableHead>
                        <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coupons.map((c) => (
                        <TableRow key={c.id} className="border-white/8 hover:bg-white/[0.04]">
                          <TableCell className="font-mono text-sm font-bold text-[#e9c47c]">{c.code}</TableCell>
                          <TableCell className="lux-num text-sm text-white">
                            {c.discountType === 'percentage'
                              ? `-${c.discountValue}%`
                              : c.discountType === 'fixed'
                                ? `-${c.discountValue.toFixed(2)} €`
                                : 'BOGO'}
                          </TableCell>
                          <TableCell className="text-xs text-[#8fabc2]">
                            {c.currentUses}/{c.maxUses} · {c.scans} scan{c.scans > 1 ? 's' : ''}
                          </TableCell>
                          <TableCell className="hidden text-sm text-white/85 sm:table-cell">{c.merchantName}</TableCell>
                          <TableCell>
                            <span className="lux-chip">
                              <span
                                className="lux-dot"
                                style={{ backgroundColor: c.status === 'active' ? '#34d399' : '#8fabc2' }}
                                aria-hidden="true"
                              />
                              {c.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            {c.status === 'active' && (
                              <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0 text-[#f07d6a] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]"
                                onClick={() => cancelCoupon(c)} aria-label={`Annuler le coupon ${c.code}`}>
                                <span aria-hidden="true">×</span>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ----- Onglet Packs (composant orphelin rebranché) ----- */}
            <TabsContent value="packs" className="p-4 sm:p-6">
              <AdminPacks />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ----- Dialog création coupon ----- */}
      <Dialog open={couponDialog} onOpenChange={setCouponDialog}>
        <DialogContent className="border-white/10 bg-[#0b1226] text-white">
          <DialogHeader>
            <DialogTitle className="lux-display text-lg text-white">Nouveau coupon marketplace</DialogTitle>
            <DialogDescription className="text-[#8fabc2]">
              Code généré automatiquement si vide (format HUB-XXXXXXXX).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="coupon-code" className="text-[#8fabc2]">Code (optionnel)</Label>
              <Input id="coupon-code" placeholder="HUB-XXXXXX" value={couponForm.code}
                className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
                onChange={(e) => setCouponForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="coupon-type" className="text-[#8fabc2]">Type</Label>
                <select
                  id="coupon-type"
                  className="h-9 rounded-xl border border-white/12 bg-[#0b1226] px-3 text-sm text-white [&>option]:bg-[#0b1226] [&>option]:text-white"
                  value={couponForm.discountType}
                  onChange={(e) => setCouponForm((f) => ({ ...f, discountType: e.target.value }))}
                >
                  <option value="percentage">Pourcentage (%)</option>
                  <option value="fixed">Montant fixe (€)</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="coupon-value" className="text-[#8fabc2]">Valeur</Label>
                <Input id="coupon-value" type="number" min="1" value={couponForm.discountValue}
                  className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
                  onChange={(e) => setCouponForm((f) => ({ ...f, discountValue: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="coupon-uses" className="text-[#8fabc2]">Utilisations max</Label>
                <Input id="coupon-uses" type="number" min="1" value={couponForm.maxUses}
                  className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
                  onChange={(e) => setCouponForm((f) => ({ ...f, maxUses: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="coupon-commission" className="text-[#8fabc2]">Commission (%)</Label>
                <Input id="coupon-commission" type="number" min="0" max="100" value={couponForm.commissionRate}
                  className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
                  onChange={(e) => setCouponForm((f) => ({ ...f, commissionRate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createCoupon} disabled={couponBusy} className="lux-btn h-9 rounded-full px-4 text-xs">
              Créer le coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── v4.71 — Dialog « Modifier l'abonnement » ── */}
      <Dialog open={!!editSub} onOpenChange={(v) => !v && setEditSub(null)}>
        <DialogContent className="max-w-md rounded-2xl border-white/10 bg-[#0b1226] text-white">
          <DialogHeader>
            <DialogTitle className="lux-display text-lg text-white">Modifier l'abonnement</DialogTitle>
            <DialogDescription className="text-[#8fabc2]">
              {editSub
                ? `${editSub.subscriber.name}${editSub.subscriber.email ? ` — ${editSub.subscriber.email}` : ''} · plan actuel : ${editSub.plan}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Plan */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-plan" className="text-[#8fabc2]">Plan</Label>
              <Select
                value={editForm.plan}
                onValueChange={(v) => {
                  const hp = HOST_PLANS.find((p) => p.id === v);
                  const cycle = editForm.billingCycle === 'monthly' ? 'monthly' : 'annual';
                  setEditForm((f) => ({
                    ...f,
                    plan: v,
                    amount: hp ? String(hp.prices[cycle] ?? hp.prices.annual) : f.amount,
                  }));
                }}
              >
                <SelectTrigger id="edit-plan" className="rounded-xl border-white/12 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0b1226] text-white">
                  {HOST_PLANS.map((p) => (
                    <SelectItem key={p.id} className="focus:bg-white/8 focus:text-white" value={p.id}>
                      {p.name} — {p.maxProperties} bien{p.maxProperties > 1 ? 's' : ''}
                    </SelectItem>
                  ))}
                  <SelectItem className="focus:bg-white/8 focus:text-white" value="custom">Personnalisé (montant libre)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Cycle */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-cycle" className="text-[#8fabc2]">Cycle de facturation</Label>
              <Select
                value={editForm.billingCycle}
                onValueChange={(v) => {
                  const hp = HOST_PLANS.find((p) => p.id === editForm.plan);
                  setEditForm((f) => ({
                    ...f,
                    billingCycle: v,
                    ...(hp ? { amount: String(hp.prices[v as 'monthly' | 'annual'] ?? hp.prices.annual) } : {}),
                  }));
                }}
              >
                <SelectTrigger id="edit-cycle" className="rounded-xl border-white/12 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0b1226] text-white">
                  <SelectItem className="focus:bg-white/8 focus:text-white" value="monthly">Mensuel</SelectItem>
                  <SelectItem className="focus:bg-white/8 focus:text-white" value="annual">Annuel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Montant (custom uniquement) */}
            {editForm.plan === 'custom' && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-amount" className="text-[#8fabc2]">Montant (€ / cycle)</Label>
                <Input
                  id="edit-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.amount}
                  onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                  className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
                />
              </div>
            )}
            {/* Statut */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-status" className="text-[#8fabc2]">Statut</Label>
              <Select
                value={editForm.status}
                onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger id="edit-status" className="rounded-xl border-white/12 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0b1226] text-white">
                  <SelectItem className="focus:bg-white/8 focus:text-white" value="active">Actif</SelectItem>
                  <SelectItem className="focus:bg-white/8 focus:text-white" value="trialing">Essai</SelectItem>
                  <SelectItem className="focus:bg-white/8 focus:text-white" value="past_due">Impayé</SelectItem>
                  <SelectItem className="focus:bg-white/8 focus:text-white" value="cancelled">Annulé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Aperçu prix recalculé */}
            {editForm.plan !== 'custom' && editPricePreview() && (
              <p className="rounded-xl border border-[#5cadf0]/25 bg-[#5cadf0]/8 px-3 py-2 text-xs font-semibold text-[#a9d8ff]">
                Prix recalculé immédiatement :{' '}
                <span className="lux-num font-bold text-white">
                  {(editPricePreview()!.price ?? 0).toFixed(2)} € / {editPricePreview()!.cycle === 'monthly' ? 'mois' : 'an'}
                </span>{' '}
                · {HOST_PLANS.find((p) => p.id === editForm.plan)?.maxProperties} bien(s) inclus
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="lux-btn-ghost h-9 rounded-full px-4 text-xs" onClick={() => setEditSub(null)} disabled={editBusy}>
              Annuler
            </Button>
            <Button onClick={saveEdit} disabled={editBusy} className="lux-btn h-9 rounded-full px-4 text-xs">
              Enregistrer
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
