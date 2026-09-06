'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Ban,
  CheckCircle2,
  CreditCard,
  Eye,
  Home,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { memberRoleMeta } from '@/lib/team';

// =============================================================
// AdminUsers — Module 2 Gestion Clients & Hôtes
// Données réelles via /api/admin/users (+ [id] pour les actions).
// Actions journalisées côté serveur : activer/désactiver, changer
// de plan, changer de rôle, reset mot de passe (temporaire affiché
// une seule fois), supprimer. Confirmations pour actions critiques.
// =============================================================

const PLANS = [
  { value: 'airbnb_solo', label: 'Airbnb Solo' },
  { value: 'airbnb_pro', label: 'Airbnb Pro' },
  { value: 'agency', label: 'Agence' },
  { value: 'free', label: 'Gratuit' },
  { value: 'none', label: 'Aucun plan' },
];

/** FIX-10 — lit un paramètre date (YYYY-MM-DD) de l'URL courante. */
function readDateParam(name: string): string {
  if (typeof window === 'undefined') return '';
  const raw = new URLSearchParams(window.location.search).get(name) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
  selectedPlan: string | null;
  createdAt: string;
  providerBusinessName: string | null;
  subscription: {
    plan: string;
    amount: number;
    billingCycle: string;
    currentPeriodEnd: string | null;
  } | null;
  propertyCount: number;
  membershipCount: number;
  batchCount: number;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// =============================================================
// FIX-10 — Fiche client détaillée (GET /api/admin/users/[id]).
// Équipe = PropertyMember réels ; Facturation = Subscription +
// Transaction (payerId) + ServiceOrder sur les biens possédés.
// =============================================================

interface UserDetail {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: string;
    isActive: boolean;
    selectedPlan: string | null;
    onboardingCompleted: boolean;
    stripeAccountId: string | null;
    createdAt: string;
    phone: string | null;
    address: string | null;
    providerBusinessName: string | null;
  };
  team: {
    ownedProperties: {
      id: string;
      name: string;
      propertyType: string;
      address: string | null;
      isActive: boolean;
      createdAt: string;
      memberCount: number;
      members: {
        id: string;
        role: string;
        nickname: string | null;
        invitedAt: string;
        acceptedAt: string | null;
        user: { id: string; email: string; fullName: string | null };
      }[];
    }[];
    memberships: {
      id: string;
      role: string;
      invitedAt: string;
      acceptedAt: string | null;
      property: { id: string; name: string; ownerEmail: string; ownerName: string | null };
    }[];
  };
  billing: {
    activeSubscription: {
      id: string;
      plan: string;
      amount: number;
      currency: string;
      billingCycle: string;
      status: string;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      stripeSubscriptionId: string | null;
    } | null;
    subscriptions: {
      id: string;
      plan: string;
      amount: number;
      currency: string;
      billingCycle: string;
      status: string;
      currentPeriodEnd: string | null;
      createdAt: string;
    }[];
    serviceOrders: { count: number; totalAmount: number; hostEarnings: number };
    transactions: {
      count: number;
      totalAmount: number;
      items: {
        id: string;
        type: string;
        amount: number;
        currency: string;
        status: string;
        stripePaymentId: string | null;
        createdAt: string;
      }[];
    };
  };
}

const PLAN_LABELS: Record<string, string> = {
  airbnb_solo: 'Airbnb Solo',
  airbnb_pro: 'Airbnb Pro',
  agency: 'Agence',
  free: 'Gratuit',
};

function planLabel(plan: string | null): string {
  if (!plan) return 'Aucun plan';
  return PLAN_LABELS[plan] ?? plan;
}

function subscriptionStatusBadge(status: string) {
  if (status === 'active') return <Badge className="bg-emerald-600 hover:bg-emerald-700">Actif</Badge>;
  if (status === 'past_due') return <Badge className="bg-amber-500 hover:bg-amber-600">Paiement en retard</Badge>;
  if (status === 'trialing') return <Badge className="bg-sky-600 hover:bg-sky-700">Essai</Badge>;
  if (status === 'cancelled') return <Badge variant="outline" className="border-slate-300 text-slate-600">Annulé</Badge>;
  return <Badge variant="outline" className="border-slate-300 text-slate-600">{status}</Badge>;
}

function transactionStatusBadge(status: string) {
  if (status === 'completed') return <Badge className="bg-emerald-600 hover:bg-emerald-700">Complété</Badge>;
  if (status === 'refunded') return <Badge className="bg-amber-500 hover:bg-amber-600">Remboursé</Badge>;
  if (status === 'failed') return <Badge className="bg-red-600 hover:bg-red-700">Échec</Badge>;
  return <Badge variant="outline" className="border-slate-300 text-slate-600">{status}</Badge>;
}

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  subscription: 'Abonnement',
  service_order: 'Commande de service',
  order: 'Commande',
  payout: 'Reversement',
  refund: 'Remboursement',
  deposit: 'Dépôt',
};

function PlanBadge({ user }: { user: AdminUser }) {
  if (user.providerBusinessName) {
    return <Badge className="bg-slate-900 text-white hover:bg-slate-800">Prestataire</Badge>;
  }
  const plan = user.selectedPlan;
  if (!plan || plan === 'free') return <Badge variant="outline" className="border-slate-300 text-slate-700">Gratuit</Badge>;
  if (plan === 'airbnb_pro') return <Badge className="bg-emerald-600 hover:bg-emerald-700">Airbnb Pro</Badge>;
  if (plan === 'airbnb_solo') return <Badge variant="default">Airbnb Solo</Badge>;
  if (plan === 'agency') return <Badge className="bg-amber-500 hover:bg-amber-600">Agence</Badge>;
  return <Badge variant="outline" className="border-slate-300 text-slate-700">{plan}</Badge>;
}

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<{ totalAll: number; totalActive: number; totalHosts: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // FIX-10 — plage de dates d'inscription (créés du / au), initialisée
  // depuis l'URL puis re-synchronisée dans l'URL à chaque changement.
  const [dateFrom, setDateFrom] = useState(() => readDateParam('createdFrom'));
  const [dateTo, setDateTo] = useState(() => readDateParam('createdTo'));
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  // Fiche client (FIX-10) — Sheet de détail avec sections Équipe / Facturation
  const [detailTarget, setDetailTarget] = useState<AdminUser | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', fullName: '', password: '', role: 'user' as 'user' | 'superadmin' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Action dialogs state
  const [busyId, setBusyId] = useState<string | null>(null);
  const [planTarget, setPlanTarget] = useState<AdminUser | null>(null);
  const [planChoice, setPlanChoice] = useState('airbnb_solo');
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search.trim()) params.set('search', search.trim());
      if (roleFilter) params.set('role', roleFilter);
      if (planFilter) params.set('plan', planFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('createdFrom', dateFrom);
      if (dateTo) params.set('createdTo', dateTo);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error('Erreur lors du chargement des utilisateurs');
      const data = await res.json();
      setUsers(Array.isArray(data.data) ? data.data : []);
      setPagination(data.pagination ?? null);
      setStats(data.stats ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [search, page, roleFilter, planFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // FIX-10 — l'état du filtre date se reflète dans l'URL (partageable,
  // rechargement conservant la plage) sans déclencher de navigation.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (dateFrom) sp.set('createdFrom', dateFrom);
    else sp.delete('createdFrom');
    if (dateTo) sp.set('createdTo', dateTo);
    else sp.delete('createdTo');
    const qs = sp.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [dateFrom, dateTo]);

  const clearDateFilter = () => {
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  /** FIX-10 — ouvre la fiche client et charge son détail réel. */
  const openDetail = useCallback(async (user: AdminUser) => {
    setDetailTarget(user);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Erreur lors du chargement de la fiche');
      }
      setDetail((await res.json()) as UserDetail);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleCreateUser = async () => {
    if (!createForm.email.trim() || !createForm.fullName.trim() || !createForm.password.trim()) {
      setCreateError('Tous les champs sont requis');
      return;
    }
    if (createForm.password.length < 6) {
      setCreateError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    try {
      setCreateLoading(true);
      setCreateError(null);
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Erreur lors de la création');
        return;
      }
      toast.success('Utilisateur créé');
      setDialogOpen(false);
      setCreateForm({ email: '', fullName: '', password: '', role: 'user' });
      setPage(1);
      fetchUsers();
    } catch {
      setCreateError('Erreur réseau, veuillez réessayer');
    } finally {
      setCreateLoading(false);
    }
  };

  /** Appel d'action PATCH avec confirmation préalable (AlertDialog géré par l'appelant). */
  const runAction = async (user: AdminUser, action: string, body?: Record<string, unknown>) => {
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}?action=${action}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      if (action === 'reset-password' && data.tempPassword) {
        setTempPassword({ email: user.email, password: data.tempPassword });
      } else {
        toast.success(data.message || 'Action effectuée');
      }
      fetchUsers();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message || 'Compte supprimé');
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ----- Stats réelles ----- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Comptes totaux', value: stats?.totalAll, icon: Users },
          { label: 'Comptes actifs', value: stats?.totalActive, icon: CheckCircle2 },
          { label: 'Hôtes', value: stats?.totalHosts, icon: Home },
        ].map((s) => (
          <Card key={s.label} className="border-slate-200 bg-white">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <s.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="text-2xl font-extrabold text-slate-900">
                  {s.value === undefined ? <Skeleton className="h-7 w-10" /> : s.value}
                </div>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>👥 Clients & Hôtes</CardTitle>
              <CardDescription>
                Gestion complète des comptes : activation, plan, rôle, mot de passe.
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setCreateError(null);
                setCreateForm({ email: '', fullName: '', password: '', role: 'user' });
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Ajouter un utilisateur
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nouvel utilisateur</DialogTitle>
                  <DialogDescription>Créer un compte sur la plateforme</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  {createError && <p className="text-sm text-destructive">{createError}</p>}
                  <div className="grid gap-2">
                    <Label htmlFor="create-email">Email</Label>
                    <Input id="create-email" type="email" placeholder="user@example.com" value={createForm.email}
                      onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="create-name">Nom complet</Label>
                    <Input id="create-name" placeholder="Jean Dupont" value={createForm.fullName}
                      onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="create-password">Mot de passe</Label>
                    <Input id="create-password" type="password" placeholder="6 caractères minimum" value={createForm.password}
                      onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="create-role">Rôle</Label>
                    <Select value={createForm.role} onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v as 'user' | 'superadmin' }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Utilisateur</SelectItem>
                        <SelectItem value="superadmin">Superadmin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateUser} disabled={createLoading}>
                    {createLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Créer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ----- Filtres ----- */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Rechercher par email ou nom…"
                aria-label="Rechercher un utilisateur"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            {/* FIX-10 — filtre par date d'inscription (plage createdAt) */}
            <div className="flex items-center gap-1.5">
              <span className="hidden text-xs font-medium text-slate-500 xl:inline">Inscrit du</span>
              <Input
                type="date"
                aria-label="Inscrit du (date de début)"
                title="Filtrer les comptes inscrits à partir de cette date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-[9.5rem]"
              />
              <span className="text-xs text-slate-400" aria-hidden="true">au</span>
              <Input
                type="date"
                aria-label="Inscrit au (date de fin)"
                title="Filtrer les comptes inscrits jusqu'à cette date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-[9.5rem]"
              />
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDateFilter}
                  aria-label="Effacer le filtre par date d'inscription"
                  title="Effacer le filtre par date d'inscription"
                  className="shrink-0 text-slate-500 hover:text-slate-900"
                >
                  <X className="mr-1 h-4 w-4" aria-hidden="true" />
                  Effacer
                </Button>
              )}
            </div>
            <Select value={roleFilter || 'all'} onValueChange={(v) => { setRoleFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Filtrer par rôle"><SelectValue placeholder="Rôle" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rôles</SelectItem>
                <SelectItem value="user">Utilisateurs</SelectItem>
                <SelectItem value="superadmin">Superadmins</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter || 'all'} onValueChange={(v) => { setPlanFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Filtrer par plan"><SelectValue placeholder="Plan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les plans</SelectItem>
                {PLANS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Filtrer par statut"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="active">Actifs</SelectItem>
                <SelectItem value="inactive">Désactivés</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading && <TableSkeleton />}

          {!loading && !error && pagination && (
            <p className="text-sm text-slate-500" role="status" aria-live="polite">
              {pagination.total} résultat{pagination.total > 1 ? 's' : ''}
              {(dateFrom || dateTo) && (
                <>
                  {' '}
                  pour la période du <span className="font-medium text-slate-700">{dateFrom || '…'}</span> au{' '}
                  <span className="font-medium text-slate-700">{dateTo || '…'}</span>
                </>
              )}
            </p>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchUsers}>Réessayer</Button>
            </div>
          )}

          {!loading && !error && users.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="mb-4 h-12 w-12 text-slate-300" />
              <h3 className="text-lg font-medium">Aucun utilisateur</h3>
              <p className="mt-1 text-sm text-slate-500">Aucun compte ne correspond aux filtres.</p>
            </div>
          )}

          {!loading && !error && users.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Compte</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="hidden md:table-cell">Abonnement</TableHead>
                      <TableHead className="hidden text-center sm:table-cell">Biens</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="hidden lg:table-cell">Inscrit le</TableHead>
                      <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <button
                            type="button"
                            className="text-left font-semibold text-slate-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900"
                            onClick={() => openDetail(user)}
                            aria-label={`Ouvrir la fiche de ${user.fullName || user.email}`}
                          >
                            {user.fullName || '—'}
                          </button>
                          <p className="text-xs text-slate-500">{user.email}</p>
                          {user.role === 'superadmin' && (
                            <Badge className="mt-1 bg-amber-500 hover:bg-amber-600">Superadmin</Badge>
                          )}
                        </TableCell>
                        <TableCell><PlanBadge user={user} /></TableCell>
                        <TableCell className="hidden md:table-cell">
                          {user.subscription ? (
                            <span className="text-xs">
                              <span className="font-semibold">{user.subscription.amount.toFixed(2)} €</span>{' '}
                              / {user.subscription.billingCycle === 'monthly' ? 'mois' : 'an'}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-center sm:table-cell">{user.propertyCount}</TableCell>
                        <TableCell>
                          {user.isActive ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Actif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                              <Ban className="h-3.5 w-3.5" /> Désactivé
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-sm text-slate-500 lg:table-cell">
                          {format(new Date(user.createdAt), 'dd MMM yyyy', { locale: fr })}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" disabled={busyId === user.id} aria-label={`Actions pour ${user.email}`}>
                                {busyId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>Actions compte</DropdownMenuLabel>
                              <DropdownMenuItem className="cursor-pointer" onClick={() => openDetail(user)}>
                                <Eye className="h-4 w-4" /> Voir la fiche client
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => runAction(user, 'toggle-active')}
                              >
                                {user.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                                {user.isActive ? 'Désactiver le compte' : 'Activer le compte'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => { setPlanTarget(user); setPlanChoice(user.selectedPlan || 'airbnb_solo'); }}
                              >
                                <Wallet className="h-4 w-4" /> Changer de plan
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => runAction(user, 'change-role', { role: user.role === 'superadmin' ? 'user' : 'superadmin' })}
                              >
                                <ShieldCheck className="h-4 w-4" />
                                {user.role === 'superadmin' ? 'Retirer Superadmin' : 'Promouvoir Superadmin'}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer" onClick={() => runAction(user, 'reset-password')}>
                                <KeyRound className="h-4 w-4" /> Réinitialiser le mot de passe
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer text-red-600 focus:text-red-600"
                                onClick={() => setDeleteTarget(user)}
                              >
                                <Trash2 className="h-4 w-4" /> Supprimer le compte
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-slate-500">
                    Page {pagination.page} / {pagination.totalPages} — {pagination.total} résultat{pagination.total > 1 ? 's' : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      Précédent
                    </Button>
                    <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                      Suivant
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ----- Dialog changement de plan ----- */}
      <Dialog open={planTarget !== null} onOpenChange={(o) => !o && setPlanTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer de plan</DialogTitle>
            <DialogDescription>
              {planTarget?.email} — l'abonnement actif éventuel sera annulé et le plan sélectionné mis à jour.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="plan-choice">Nouveau plan</Label>
            <Select value={planChoice} onValueChange={setPlanChoice}>
              <SelectTrigger id="plan-choice" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLANS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (planTarget && (await runAction(planTarget, 'change-plan', { plan: planChoice }))) {
                  setPlanTarget(null);
                }
              }}
              disabled={busyId !== null}
            >
              {busyId !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Appliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- Confirmation suppression ----- */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Action irréversible : le compte <strong>{deleteTarget?.email}</strong> et ses données associées
              seront définitivement supprimés. Les comptes possédant des biens sont refusés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) handleDelete(deleteTarget);
              }}
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ----- Mot de passe temporaire (affiché une seule fois) ----- */}
      <Dialog open={tempPassword !== null} onOpenChange={(o) => !o && setTempPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🔑 Mot de passe temporaire</DialogTitle>
            <DialogDescription>
              Pour <strong>{tempPassword?.email}</strong>. Un email de notification a été mis en outbox.
              Copiez-le maintenant : il ne sera plus jamais affiché.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-slate-900 px-4 py-3 text-center">
            <code className="select-all text-lg font-bold tracking-widest text-emerald-400">{tempPassword?.password}</code>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (tempPassword) {
                  navigator.clipboard?.writeText(tempPassword.password).then(
                    () => toast.success('Mot de passe copié'),
                    () => toast.error('Copie impossible'),
                  );
                }
              }}
            >
              Copier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- FIX-10 : Sheet fiche client — sections Équipe / Facturation -----
           Toutes les données affichées proviennent de GET /api/admin/users/[id]
           (DB réelle). Rien n'est simulé. */}
      <Sheet
        open={detailTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDetailTarget(null);
            setDetail(null);
            setDetailError(null);
          }
        }}
      >
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-lg font-bold text-slate-900">
              Fiche client{detail ? ` — ${detail.user.fullName || detail.user.email}` : ''}
            </SheetTitle>
            <SheetDescription id="user-detail-desc">
              {detailTarget?.email} — équipe, facturation et informations du compte (données de la base).
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 px-4 pb-8">
            {detailLoading && (
              <div className="space-y-3" role="status" aria-live="polite">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-44 w-full" />
              </div>
            )}

            {detailError && !detailLoading && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-destructive">{detailError}</p>
                <Button variant="outline" size="sm" onClick={() => detailTarget && openDetail(detailTarget)}>
                  Réessayer
                </Button>
              </div>
            )}

            {detail && !detailLoading && (
              <>
                {/* ----- Badges compte ----- */}
                <div className="flex flex-wrap items-center gap-2">
                  {detail.user.role === 'superadmin' && (
                    <Badge className="bg-amber-500 hover:bg-amber-600">Superadmin</Badge>
                  )}
                  {detail.user.providerBusinessName && (
                    <Badge className="bg-slate-900 text-white hover:bg-slate-800">
                      Prestataire : {detail.user.providerBusinessName}
                    </Badge>
                  )}
                  {detail.user.selectedPlan && detail.user.selectedPlan !== 'free' ? (
                    <Badge variant="default">{planLabel(detail.user.selectedPlan)}</Badge>
                  ) : (
                    <Badge variant="outline" className="border-slate-300 text-slate-700">Gratuit</Badge>
                  )}
                  {detail.user.isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Actif
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Désactivé
                    </span>
                  )}
                </div>

                {/* ----- Profil (champs réels uniquement) ----- */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-500">Inscrit le</dt>
                  <dd className="font-medium text-slate-900">
                    {format(new Date(detail.user.createdAt), 'dd MMM yyyy', { locale: fr })}
                  </dd>
                  <dt className="text-slate-500">Téléphone</dt>
                  <dd className="font-medium text-slate-900">{detail.user.phone ?? '—'}</dd>
                  <dt className="text-slate-500">Adresse</dt>
                  <dd className="font-medium text-slate-900">{detail.user.address ?? '—'}</dd>
                </dl>

                <Separator />

                {/* ================= ÉQUIPE ================= */}
                <section aria-labelledby="detail-team-title" className="space-y-3">
                  <h3
                    id="detail-team-title"
                    className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"
                  >
                    <Users className="h-4 w-4" aria-hidden="true" /> Équipe
                  </h3>

                  {detail.team.ownedProperties.length === 0 && detail.team.memberships.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center">
                      <Users className="mx-auto mb-2 h-8 w-8 text-slate-300" aria-hidden="true" />
                      <p className="text-sm font-medium text-slate-700">Aucun membre d&apos;équipe</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Ce compte ne gère aucun bien et n&apos;appartient à l&apos;équipe d&apos;aucun autre hôte.
                      </p>
                    </div>
                  ) : (
                    <>
                      {detail.team.ownedProperties.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase text-slate-400">
                            Biens gérés ({detail.team.ownedProperties.length})
                          </h4>
                          {detail.team.ownedProperties.map((p) => (
                            <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-slate-900">{p.name}</p>
                                <span className="flex items-center gap-1.5">
                                  <Badge variant="outline">{p.propertyType}</Badge>
                                  {p.isActive ? (
                                    <Badge variant="outline" className="border-emerald-300 text-emerald-700">Actif</Badge>
                                  ) : (
                                    <Badge variant="outline" className="border-slate-300 text-slate-500">Désactivé</Badge>
                                  )}
                                </span>
                              </div>
                              {p.address && <p className="mt-0.5 text-xs text-slate-500">{p.address}</p>}
                              <p className="mt-1.5 text-xs font-medium text-slate-600">
                                {p.memberCount} membre{p.memberCount > 1 ? 's' : ''}
                              </p>
                              <ul className="mt-2 divide-y divide-slate-100">
                                {p.members.map((m) => {
                                  const meta = memberRoleMeta(m.role);
                                  return (
                                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                                      <span className="flex min-w-0 items-center gap-1.5">
                                        <span aria-hidden="true">{meta.emoji}</span>
                                        <span className="truncate font-medium text-slate-900">
                                          {m.user.fullName || m.user.email}
                                        </span>
                                        {m.user.fullName && (
                                          <span className="truncate text-xs text-slate-400">{m.user.email}</span>
                                        )}
                                      </span>
                                      <span className="flex shrink-0 flex-wrap items-center gap-1">
                                        <Badge variant="secondary">{meta.label}</Badge>
                                        {!m.acceptedAt && (
                                          <Badge variant="outline" className="border-amber-300 text-amber-700">
                                            Invitation en attente
                                          </Badge>
                                        )}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}

                      {detail.team.memberships.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold uppercase text-slate-400">
                            Équipes rejointes ({detail.team.memberships.length})
                          </h4>
                          <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                            {detail.team.memberships.map((m) => {
                              const meta = memberRoleMeta(m.role);
                              return (
                                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                                  <span className="min-w-0">
                                    <span className="block truncate font-medium text-slate-900">{m.property.name}</span>
                                    <span className="block truncate text-xs text-slate-400">
                                      hôte : {m.property.ownerName || m.property.ownerEmail}
                                    </span>
                                  </span>
                                  <span className="flex shrink-0 flex-wrap items-center gap-1">
                                    <Badge variant="secondary">{meta.label}</Badge>
                                    {!m.acceptedAt && (
                                      <Badge variant="outline" className="border-amber-300 text-amber-700">
                                        Invitation en attente
                                      </Badge>
                                    )}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </section>

                <Separator />

                {/* ================= FACTURATION ================= */}
                <section aria-labelledby="detail-billing-title" className="space-y-3">
                  <h3
                    id="detail-billing-title"
                    className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"
                  >
                    <CreditCard className="h-4 w-4" aria-hidden="true" /> Facturation
                  </h3>

                  {/* Abonnement actif : plan, statut, échéance */}
                  {detail.billing.activeSubscription ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">
                          {planLabel(detail.billing.activeSubscription.plan)}
                        </p>
                        {subscriptionStatusBadge(detail.billing.activeSubscription.status)}
                      </div>
                      <p className="mt-1 text-sm text-slate-700">
                        <span className="font-semibold">
                          {detail.billing.activeSubscription.amount.toFixed(2)} €
                        </span>{' '}
                        / {detail.billing.activeSubscription.billingCycle === 'monthly' ? 'mois' : 'an'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Échéance :{' '}
                        {detail.billing.activeSubscription.currentPeriodEnd
                          ? format(new Date(detail.billing.activeSubscription.currentPeriodEnd), 'dd MMM yyyy', { locale: fr })
                          : '—'}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">
                      Aucun abonnement actif.
                    </div>
                  )}

                  {/* Commandes de service sur les biens + cumuls réels */}
                  <dl className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-slate-200 p-2.5 text-center">
                      <dt className="text-[11px] uppercase text-slate-400">Commandes</dt>
                      <dd className="text-lg font-bold text-slate-900">{detail.billing.serviceOrders.count}</dd>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-2.5 text-center">
                      <dt className="text-[11px] uppercase text-slate-400">Cumul commandes</dt>
                      <dd className="text-lg font-bold text-slate-900">
                        {detail.billing.serviceOrders.totalAmount.toFixed(2)} €
                      </dd>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-2.5 text-center">
                      <dt className="text-[11px] uppercase text-slate-400">Part hôte</dt>
                      <dd className="text-lg font-bold text-slate-900">
                        {detail.billing.serviceOrders.hostEarnings.toFixed(2)} €
                      </dd>
                    </div>
                  </dl>
                  <p className="-mt-2 text-[11px] text-slate-400">
                    Commandes de service (hors annulées) posées par les invités sur les biens du client.
                  </p>

                  {/* Historique d'abonnements */}
                  {detail.billing.subscriptions.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-semibold uppercase text-slate-400">Historique d&apos;abonnements</h4>
                      <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                        {detail.billing.subscriptions.map((s) => (
                          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                            <span className="font-medium text-slate-900">{planLabel(s.plan)}</span>
                            <span className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">
                                {s.amount.toFixed(2)} € / {s.billingCycle === 'monthly' ? 'mois' : 'an'}
                                {s.currentPeriodEnd
                                  ? ` — échéance ${format(new Date(s.currentPeriodEnd), 'dd MMM yyyy', { locale: fr })}`
                                  : ''}
                              </span>
                              {subscriptionStatusBadge(s.status)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Paiements enregistrés (Transaction.payerId = ce compte) */}
                  <div className="space-y-1.5">
                    <h4 className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-slate-400">
                      Paiements enregistrés
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {detail.billing.transactions.count} · {detail.billing.transactions.totalAmount.toFixed(2)} €
                      </Badge>
                    </h4>
                    {detail.billing.transactions.items.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
                        Aucun paiement enregistré pour ce compte.
                      </p>
                    ) : (
                      <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                        {detail.billing.transactions.items.map((t) => (
                          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                            <span>
                              <span className="block font-medium text-slate-900">
                                {TRANSACTION_TYPE_LABELS[t.type] ?? t.type} — {t.amount.toFixed(2)} €
                              </span>
                              <span className="block text-xs text-slate-400">
                                {format(new Date(t.createdAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                                {t.stripePaymentId ? ` · ${t.stripePaymentId}` : ''}
                              </span>
                            </span>
                            {transactionStatusBadge(t.status)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Références Stripe réelles (champs existants uniquement) */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold uppercase text-slate-400">Références Stripe</h4>
                    <dl className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                      <div className="flex items-center justify-between gap-2 py-0.5">
                        <dt className="text-slate-500">Compte Connect (reversements)</dt>
                        <dd className="truncate font-mono text-slate-900">{detail.user.stripeAccountId ?? '—'}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2 py-0.5">
                        <dt className="text-slate-500">Abonnement Stripe</dt>
                        <dd className="truncate font-mono text-slate-900">
                          {detail.billing.activeSubscription?.stripeSubscriptionId ?? '—'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </section>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
