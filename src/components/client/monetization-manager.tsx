'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  CreditCard,
  Receipt,
  Crown,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Sparkles,
  Eye,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  SubscriptionTier,
  SubscriptionStatus,
  TransactionType,
  TransactionStatus,
} from '@/types/database';

// ── Types ──────────────────────────────────────────────────────
interface PlanData {
  id: string;
  name: string;
  tier: SubscriptionTier;
  price: number;
  currency: string;
  interval: string;
  features: string[];
  isFeatured?: boolean;
  maxProducts?: number;
  maxFlashSales?: number;
}

interface SubscriptionData {
  id: string;
  subscriberId: string;
  subscriberType: string;
  planId: string;
  planName: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  amount: number;
  currency: string;
  startDate: string;
  endDate: string | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
}

interface TransactionData {
  id: string;
  subscriberId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  reference: string;
  description: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// ── Constants ──────────────────────────────────────────────────
const userId = 'dev-user-1';

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: 'Gratuit',
  premium: 'Premium',
  featured: 'Mis en avant',
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Actif',
  cancelled: 'Annulé',
  past_due: 'En retard',
};

const TX_TYPE_LABELS: Record<TransactionType, string> = {
  flash_sale: 'Vente flash',
  commission: 'Commission',
  subscription: 'Abonnement',
  redemption: 'Encaissement',
};

const TX_STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: 'En attente',
  completed: 'Terminé',
  failed: 'Échoué',
  refunded: 'Remboursé',
};

const TIER_BADGE_VARIANT: Record<SubscriptionTier, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  free: 'secondary',
  premium: 'default',
  featured: 'default',
};

const STATUS_BADGE_VARIANT: Record<SubscriptionStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  cancelled: 'secondary',
  past_due: 'destructive',
};

const TX_TYPE_BADGE: Record<TransactionType, string> = {
  subscription: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  commission: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  flash_sale: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  redemption: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const TX_STATUS_BADGE: Record<TransactionStatus, string> = {
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  refunded: 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300',
};

// ── Helpers ────────────────────────────────────────────────────
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr));
}

function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

// ── Component ──────────────────────────────────────────────────
export function MonetizationManager() {
  // Active tab
  const [activeTab, setActiveTab] = useState('plans');

  // ── Tab 1: Plans state ──
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [choosePlanDialogOpen, setChoosePlanDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanData | null>(null);
  const [subscriberType, setSubscriberType] = useState<'merchant' | 'professional'>('merchant');
  const [subscribing, setSubscribing] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  // ── Tab 2: Subscription state ──
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [changingPlanId, setChangingPlanId] = useState<string | null>(null);
  const [newPlanId, setNewPlanId] = useState('');
  const [changePlanDialogOpen, setChangePlanDialogOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // ── Tab 3: Transactions state ──
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txTypeFilter, setTxTypeFilter] = useState<string>('all');
  const [txStatusFilter, setTxStatusFilter] = useState<string>('all');

  // ── Fetch functions ──────────────────────────────────────────
  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/client/billing/plans');
      const data = await res.json();
      return (data.plans || []) as PlanData[];
    } catch {
      return [];
    }
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/subscriptions?subscriberId=${userId}`);
      const data = await res.json();
      return (data.subscriptions || []) as SubscriptionData[];
    } catch {
      return [];
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/transactions?limit=50`);
      const data = await res.json();
      return (data.transactions || []) as TransactionData[];
    } catch {
      return [];
    }
  }, []);

  // ── Load all data on mount ──
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setPlansLoading(true);
      const plansData = await fetchPlans();
      if (!cancelled) {
        setPlans(plansData);
        setPlansLoading(false);
      }
    })();

    (async () => {
      setSubsLoading(true);
      const subsData = await fetchSubscriptions();
      if (!cancelled) {
        setSubscriptions(subsData);
        setSubsLoading(false);
      }
    })();

    (async () => {
      setTxLoading(true);
      const txData = await fetchTransactions();
      if (!cancelled) {
        setTransactions(txData);
        setTxLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [fetchPlans, fetchSubscriptions, fetchTransactions]);

  // ── Derived data ──
  const currentSubscription = subscriptions.find(
    (s) => s.status === 'active' || s.status === 'past_due'
  );

  const completedThisMonth = transactions.filter((t) => {
    if (t.status !== 'completed') return false;
    const now = new Date();
    const txDate = new Date(t.createdAt);
    return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
  });

  const revenueThisMonth = completedThisMonth
    .filter((t) => t.type === 'redemption' || t.type === 'commission')
    .reduce((sum, t) => sum + t.amount, 0);

  const transactionsThisMonth = completedThisMonth.length;
  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active').length;

  const filteredTransactions = transactions.filter((t) => {
    if (txTypeFilter !== 'all' && t.type !== txTypeFilter) return false;
    if (txStatusFilter !== 'all' && t.status !== txStatusFilter) return false;
    return true;
  });

  // ── Handlers ──
  const handleChoosePlan = (plan: PlanData) => {
    if (plan.tier === 'free') {
      toast.info('Le plan gratuit est activé par défaut.');
      return;
    }
    setSelectedPlan(plan);
    setCheckoutUrl(null);
    setChoosePlanDialogOpen(true);
  };

  const handleConfirmSubscribe = async () => {
    if (!selectedPlan) return;
    setSubscribing(true);
    try {
      const res = await fetch('/api/client/billing/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriberId: userId,
          subscriberType,
          planId: selectedPlan.id,
        }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        setCheckoutUrl(data.checkoutUrl);
        toast.success('Redirection vers le paiement…');
      } else if (data.simulation) {
        toast.success(`Plan ${selectedPlan.name} activé (simulation) !`);
        setChoosePlanDialogOpen(false);
        // Refresh subscriptions
        const subsData = await fetchSubscriptions();
        setSubscriptions(subsData);
      } else {
        toast.success('Abonnement créé avec succès !');
        setChoosePlanDialogOpen(false);
        const subsData = await fetchSubscriptions();
        setSubscriptions(subsData);
      }
    } catch {
      toast.error('Erreur lors de la souscription.');
    } finally {
      setSubscribing(false);
    }
  };

  const handleOpenPortal = async (subId: string) => {
    setPortalLoading(true);
    try {
      const res = await fetch(`/api/client/subscriptions/${subId}/portal`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        toast.info('Portail non disponible en mode simulation.');
      }
    } catch {
      toast.error('Erreur lors de l\'ouverture du portail.');
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!cancellingId) return;
    try {
      const res = await fetch(`/api/client/subscriptions/${cancellingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (res.ok) {
        toast.success('Abonnement annulé. Vous conservez l\'accès jusqu\'à la fin de la période.');
        const subsData = await fetchSubscriptions();
        setSubscriptions(subsData);
        const txData = await fetchTransactions();
        setTransactions(txData);
      } else {
        toast.error('Impossible d\'annuler l\'abonnement.');
      }
    } catch {
      toast.error('Erreur lors de l\'annulation.');
    } finally {
      setCancelDialogOpen(false);
      setCancellingId(null);
    }
  };

  const handleChangePlan = async () => {
    if (!changingPlanId || !newPlanId) return;
    const plan = plans.find((p) => p.id === newPlanId);
    if (!plan) return;
    try {
      const res = await fetch(`/api/client/subscriptions/${changingPlanId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlanId, amount: plan.price }),
      });
      if (res.ok) {
        toast.success(`Plan changé vers ${plan.name}.`);
        const subsData = await fetchSubscriptions();
        setSubscriptions(subsData);
        const txData = await fetchTransactions();
        setTransactions(txData);
      } else {
        toast.error('Impossible de changer de plan.');
      }
    } catch {
      toast.error('Erreur lors du changement de plan.');
    } finally {
      setChangePlanDialogOpen(false);
      setChangingPlanId(null);
      setNewPlanId('');
    }
  };

  // ── Sub-renderers ─────────────────────────────────────────────

  // -- Stat cards --
  const renderStatCards = () => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/40 p-2.5">
              <ArrowUpRight className="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Revenus ce mois</p>
              <p className="text-xl font-bold">{formatCurrency(revenueThisMonth)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 dark:bg-purple-900/40 p-2.5">
              <Crown className="size-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Abonnements actifs</p>
              <p className="text-xl font-bold">{activeSubscriptions}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 dark:bg-blue-900/40 p-2.5">
              <Receipt className="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Transactions ce mois</p>
              <p className="text-xl font-bold">{transactionsThisMonth}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // -- Plan cards --
  const renderPlanCards = () => {
    if (plansLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-6 w-24 mb-4" />
              <Skeleton className="h-10 w-32 mb-6" />
              <div className="space-y-3">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
              <Skeleton className="mt-6 h-10 w-full" />
            </Card>
          ))}
        </div>
      );
    }

    if (plans.length === 0) {
      return (
        <Card className="p-6 text-center">
          <Sparkles className="mx-auto size-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Aucun plan disponible pour le moment.</p>
        </Card>
      );
    }

    const isCurrentlyOnTier = (tier: SubscriptionTier) =>
      currentSubscription?.tier === tier;

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isFeatured = plan.isFeatured;
          const isCurrent = isCurrentlyOnTier(plan.tier);
          return (
            <Card
              key={plan.id}
              className={`relative p-6 flex flex-col ${
                isFeatured
                  ? 'border-2 border-transparent bg-gradient-to-br from-primary/10 via-background to-purple-500/10 ring-2 ring-primary/30'
                  : ''
              }`}
            >
              {isFeatured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-primary to-purple-500 text-white border-0 px-3 py-0.5">
                    <Sparkles className="size-3 mr-1" />
                    Populaire
                  </Badge>
                </div>
              )}
              <CardHeader className="p-0 mb-2">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
              </CardHeader>
              <div className="mb-4">
                <span className="text-3xl font-bold">
                  {plan.price === 0 ? 'Gratuit' : `${formatCurrency(plan.price)}`}
                </span>
                {plan.price > 0 && (
                  <span className="text-muted-foreground">/{plan.interval || 'mois'}</span>
                )}
              </div>
              <ul className="flex-1 space-y-2.5 mb-6">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                variant={isFeatured ? 'default' : 'outline'}
                disabled={isCurrent}
                onClick={() => handleChoosePlan(plan)}
              >
                {isCurrent ? 'Plan actuel' : 'Choisir ce plan'}
              </Button>
            </Card>
          );
        })}
      </div>
    );
  };

  // -- Tab 1: Plans & Tarifs --
  const renderPlansTab = () => (
    <div className="space-y-6">
      {renderStatCards()}
      {renderPlanCards()}
    </div>
  );

  // -- Tab 2: Mon Abonnement --
  const renderSubscriptionTab = () => {
    if (subsLoading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {currentSubscription ? (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-purple-100 dark:bg-purple-900/40 p-2.5">
                    <Crown className="size-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">
                      {currentSubscription.planName}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={TIER_BADGE_VARIANT[currentSubscription.tier]}>
                        {TIER_LABELS[currentSubscription.tier]}
                      </Badge>
                      <Badge variant={STATUS_BADGE_VARIANT[currentSubscription.status]}>
                        {STATUS_LABELS[currentSubscription.status]}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenPortal(currentSubscription.id)}
                    disabled={portalLoading}
                  >
                    {portalLoading ? (
                      <Loader2 className="size-4 animate-spin mr-1.5" />
                    ) : (
                      <ExternalLink className="size-4 mr-1.5" />
                    )}
                    Gérer sur Stripe
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setChangingPlanId(currentSubscription.id);
                      setChangePlanDialogOpen(true);
                    }}
                  >
                    Changer de plan
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setCancellingId(currentSubscription.id);
                      setCancelDialogOpen(true);
                    }}
                  >
                    <XCircle className="size-4 mr-1.5" />
                    Annuler
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Montant</p>
                  <p className="font-semibold">{formatCurrency(currentSubscription.amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Début</p>
                  <p className="font-semibold">{formatDate(currentSubscription.startDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Fin</p>
                  <p className="font-semibold">
                    {currentSubscription.endDate ? formatDate(currentSubscription.endDate) : '—'}
                  </p>
                </div>
              </div>
              {currentSubscription.cancelAtPeriodEnd && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    Votre abonnement sera résilié à la fin de la période en cours.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="p-8 text-center">
            <Crown className="mx-auto size-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Vous n'avez pas encore d'abonnement</h3>
            <p className="text-muted-foreground mb-6">
              Choisissez un plan pour accéder à toutes les fonctionnalités avancées.
            </p>
            <Button onClick={() => setActiveTab('plans')}>
              <Sparkles className="size-4 mr-1.5" />
              Voir les plans
            </Button>
          </Card>
        )}

        {/* Subscription history */}
        {subscriptions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historique des abonnements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent space-y-3">
                {subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard className="size-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{sub.planName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(sub.startDate)}
                          {sub.endDate ? ` → ${formatDate(sub.endDate)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={TIER_BADGE_VARIANT[sub.tier]} className="text-xs">
                        {TIER_LABELS[sub.tier]}
                      </Badge>
                      <Badge variant={STATUS_BADGE_VARIANT[sub.status]} className="text-xs">
                        {STATUS_LABELS[sub.status]}
                      </Badge>
                      <span className="text-sm font-medium">{formatCurrency(sub.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // -- Tab 3: Transactions --
  const renderTransactionsTab = () => {
    if (txLoading) {
      return (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={txTypeFilter} onValueChange={setTxTypeFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="flash_sale">Vente flash</SelectItem>
              <SelectItem value="commission">Commission</SelectItem>
              <SelectItem value="subscription">Abonnement</SelectItem>
              <SelectItem value="redemption">Encaissement</SelectItem>
            </SelectContent>
          </Select>
          <Select value={txStatusFilter} onValueChange={setTxStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="completed">Terminé</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="failed">Échoué</SelectItem>
              <SelectItem value="refunded">Remboursé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Transaction list */}
        {filteredTransactions.length === 0 ? (
          <Card className="p-8 text-center">
            <Receipt className="mx-auto size-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucune transaction</h3>
            <p className="text-muted-foreground">
              Les transactions apparaîtront ici dès votre première activité.
            </p>
          </Card>
        ) : (
          <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent space-y-2">
            {filteredTransactions.map((tx) => {
              const isReceived = tx.type === 'redemption' || tx.type === 'commission';
              return (
                <div
                  key={tx.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="rounded-lg bg-muted p-2 shrink-0">
                      {isReceived ? (
                        <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="size-4 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-xs border-0 ${TX_TYPE_BADGE[tx.type]}`}>
                          {TX_TYPE_LABELS[tx.type]}
                        </Badge>
                        <Badge className={`text-xs border-0 ${TX_STATUS_BADGE[tx.status]}`}>
                          {TX_STATUS_LABELS[tx.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {tx.description || tx.reference}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(tx.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`font-semibold ${
                        isReceived
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {isReceived ? '+' : '-'}
                      {formatCurrency(tx.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {tx.reference.slice(0, 12)}…
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Main render ──────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="plans" className="gap-1.5">
            <CreditCard className="size-4" />
            <span className="hidden sm:inline">Plans & Tarifs</span>
            <span className="sm:hidden">Plans</span>
          </TabsTrigger>
          <TabsTrigger value="subscription" className="gap-1.5">
            <Crown className="size-4" />
            <span className="hidden sm:inline">Mon Abonnement</span>
            <span className="sm:hidden">Abonnement</span>
          </TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5">
            <Receipt className="size-4" />
            <span className="hidden sm:inline">Transactions</span>
            <span className="sm:hidden">Tx</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-6">
          {renderPlansTab()}
        </TabsContent>

        <TabsContent value="subscription" className="mt-6">
          {renderSubscriptionTab()}
        </TabsContent>

        <TabsContent value="transactions" className="mt-6">
          {renderTransactionsTab()}
        </TabsContent>
      </Tabs>

      {/* ── Choose Plan Dialog ── */}
      <Dialog open={choosePlanDialogOpen} onOpenChange={(open) => {
        setChoosePlanDialogOpen(open);
        if (!open) setCheckoutUrl(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la souscription</DialogTitle>
          </DialogHeader>
          {checkoutUrl ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="size-4 text-emerald-500" />
                Prêt à procéder au paiement.
              </div>
              <Button asChild className="w-full">
                <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4 mr-2" />
                  Payer sur Stripe
                </a>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-4">
                <p className="font-medium">{selectedPlan?.name}</p>
                <p className="text-2xl font-bold mt-1">
                  {selectedPlan ? formatCurrency(selectedPlan.price) : ''}/mois
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type de souscripteur</label>
                <Select value={subscriberType} onValueChange={(v) => setSubscriberType(v as 'merchant' | 'professional')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merchant">Marchand</SelectItem>
                    <SelectItem value="professional">Professionnel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {!checkoutUrl && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setChoosePlanDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleConfirmSubscribe} disabled={subscribing}>
                {subscribing && <Loader2 className="size-4 animate-spin mr-1.5" />}
                Confirmer
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Cancel Subscription Dialog ── */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler l'abonnement</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr de vouloir annuler votre abonnement ? Vous conserverez l'accès aux
            fonctionnalités premium jusqu'à la fin de la période de facturation en cours.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Retour
            </Button>
            <Button variant="destructive" onClick={handleCancelSubscription}>
              <XCircle className="size-4 mr-1.5" />
              Confirmer l'annulation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change Plan Dialog ── */}
      <Dialog open={changePlanDialogOpen} onOpenChange={setChangePlanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer de plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={newPlanId} onValueChange={setNewPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un plan" />
              </SelectTrigger>
              <SelectContent>
                {plans
                  .filter((p) => p.tier !== 'free')
                  .filter((p) => currentSubscription && p.id !== currentSubscription.planId)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatCurrency(p.price)}/mois
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleChangePlan} disabled={!newPlanId}>
              Confirmer le changement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
