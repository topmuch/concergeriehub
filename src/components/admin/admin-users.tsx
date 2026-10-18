'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
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
  const meta: Record<string, { label: string; dot: string }> = {
    active: { label: 'Actif', dot: '#34d399' },
    past_due: { label: 'Paiement en retard', dot: '#fbbf24' },
    trialing: { label: 'Essai', dot: '#5c8af0' },
    cancelled: { label: 'Annulé', dot: '#8fa0c2' },
  };
  const m = meta[status] ?? { label: status, dot: '#8fa0c2' };
  return (
    <span className="lux-chip">
      <span className="lux-dot" style={{ backgroundColor: m.dot }} aria-hidden="true" />
      {m.label}
    </span>
  );
}

function transactionStatusBadge(status: string) {
  const meta: Record<string, { label: string; dot: string }> = {
    completed: { label: 'Complété', dot: '#34d399' },
    refunded: { label: 'Remboursé', dot: '#fbbf24' },
    failed: { label: 'Échec', dot: '#f07d6a' },
  };
  const m = meta[status] ?? { label: status, dot: '#8fa0c2' };
  return (
    <span className="lux-chip">
      <span className="lux-dot" style={{ backgroundColor: m.dot }} aria-hidden="true" />
      {m.label}
    </span>
  );
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
    return (
      <span className="lux-chip">
        <span className="lux-dot" style={{ backgroundColor: '#cdb6ff' }} aria-hidden="true" /> Prestataire
      </span>
    );
  }
  const plan = user.selectedPlan;
  if (!plan || plan === 'free') return <span className="lux-chip">Gratuit</span>;
  const dot =
    plan === 'airbnb_pro' ? '#34d399' : plan === 'airbnb_solo' ? '#5c8af0' : plan === 'agency' ? '#fbbf24' : '#8fa0c2';
  const label = PLAN_LABELS[plan] ?? plan;
  return (
    <span className="lux-chip">
      <span className="lux-dot" style={{ backgroundColor: dot }} aria-hidden="true" /> {label}
    </span>
  );
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
    // WP-BACK v4.61 — même politique que le serveur (8 car. min + lettres + chiffres).
    if (createForm.password.length < 8 || !/[A-Za-z]/.test(createForm.password) || !/\d/.test(createForm.password)) {
      setCreateError('Le mot de passe doit contenir au moins 8 caractères, avec des lettres et des chiffres');
      return;
    }
    try {
      setCreateLoading(true);
      setCreateError(null);
      // WP-BACK v4.61 — création via l'API admin dédiée : le rôle choisi
      // est honoré (plus de détournement de /api/auth/register qui
      // hardcodait role='user', était gated par signups_enabled et créait
      // un bien « Ma Maison » fantôme).
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.fullName.trim(),
          email: createForm.email.trim(),
          password: createForm.password,
          role: createForm.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Erreur lors de la création');
        return;
      }
      toast.success(`Utilisateur créé — ${createForm.email.trim()} (${createForm.role})`);
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
          { label: 'Comptes totaux', value: stats?.totalAll, dot: '#5c8af0' },
          { label: 'Comptes actifs', value: stats?.totalActive, dot: '#34d399' },
          { label: 'Hôtes', value: stats?.totalHosts, dot: '#e9c47c' },
        ].map((s) => (
          <div key={s.label} className="lux-card relative p-5">
            <span className="lux-eyebrow">{s.label}</span>
            <p className="lux-num mt-2 text-3xl leading-none text-white">
              {s.value === undefined ? (
                <span className="inline-block h-7 w-12 animate-pulse rounded-lg bg-white/8" aria-hidden="true" />
              ) : (
                s.value
              )}
            </p>
            <span className="lux-dot absolute right-5 top-5 opacity-70" style={{ backgroundColor: s.dot }} aria-hidden="true" />
          </div>
        ))}
      </div>

      <div className="lux-card">
        <div className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="lux-eyebrow">Comptes</p>
              <h2 className="lux-display mt-1 text-xl text-white">Clients &amp; Hôtes</h2>
              <p className="mt-0.5 text-xs text-[#8fa0c2]">
                Gestion complète des comptes : activation, plan, rôle, mot de passe.
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setCreateError(null);
                setCreateForm({ email: '', fullName: '', password: '', role: 'user' });
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm" className="lux-btn h-9 rounded-full px-4 text-xs">
                  Ajouter un utilisateur
                </Button>
              </DialogTrigger>
              <DialogContent className="border-white/10 bg-[#0b1226] text-white">
                <DialogHeader>
                  <DialogTitle className="lux-display text-lg text-white">Nouvel utilisateur</DialogTitle>
                  <DialogDescription className="text-[#8fa0c2]">Créer un compte sur la plateforme</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  {createError && <p className="text-sm text-[#f07d6a]">{createError}</p>}
                  <div className="grid gap-2">
                    <Label htmlFor="create-email" className="text-[#8fa0c2]">Email</Label>
                    <Input id="create-email" type="email" placeholder="user@example.com" value={createForm.email}
                      className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                      onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="create-name" className="text-[#8fa0c2]">Nom complet</Label>
                    <Input id="create-name" placeholder="Jean Dupont" value={createForm.fullName}
                      className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                      onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="create-password" className="text-[#8fa0c2]">Mot de passe</Label>
                    <Input id="create-password" type="password" placeholder="8 caractères minimum (lettres et chiffres)" value={createForm.password}
                      className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                      onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="create-role" className="text-[#8fa0c2]">Rôle</Label>
                    <Select value={createForm.role} onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v as 'user' | 'superadmin' }))}>
                      <SelectTrigger className="w-full rounded-xl border-white/12 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#0b1226] text-white">
                        <SelectItem className="focus:bg-white/8 focus:text-white" value="user">Utilisateur</SelectItem>
                        <SelectItem className="focus:bg-white/8 focus:text-white" value="superadmin">Superadmin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateUser} disabled={createLoading} className="lux-btn h-9 rounded-full px-4 text-xs">
                    Créer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          {/* ----- Filtres ----- */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1 sm:max-w-xs">
              <Input
                placeholder="Rechercher par email ou nom…"
                aria-label="Rechercher un utilisateur"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
              />
            </div>
            {/* FIX-10 — filtre par date d'inscription (plage createdAt) */}
            <div className="flex items-center gap-1.5">
              <span className="hidden text-xs font-medium text-[#8fa0c2] xl:inline">Inscrit du</span>
              <Input
                type="date"
                aria-label="Inscrit du (date de début)"
                title="Filtrer les comptes inscrits à partir de cette date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-[9.5rem] rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
              />
              <span className="text-xs text-[#8fa0c2]/70" aria-hidden="true">au</span>
              <Input
                type="date"
                aria-label="Inscrit au (date de fin)"
                title="Filtrer les comptes inscrits jusqu'à cette date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-[9.5rem] rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
              />
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDateFilter}
                  aria-label="Effacer le filtre par date d'inscription"
                  title="Effacer le filtre par date d'inscription"
                  className="shrink-0 text-[#8fa0c2] hover:bg-white/8 hover:text-white"
                >
                  Effacer
                </Button>
              )}
            </div>
            <Select value={roleFilter || 'all'} onValueChange={(v) => { setRoleFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-full rounded-xl border-white/12 bg-white/[0.04] text-white sm:w-40" aria-label="Filtrer par rôle"><SelectValue placeholder="Rôle" /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b1226] text-white">
                <SelectItem className="focus:bg-white/8 focus:text-white" value="all">Tous les rôles</SelectItem>
                <SelectItem className="focus:bg-white/8 focus:text-white" value="user">Utilisateurs</SelectItem>
                <SelectItem className="focus:bg-white/8 focus:text-white" value="superadmin">Superadmins</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter || 'all'} onValueChange={(v) => { setPlanFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-full rounded-xl border-white/12 bg-white/[0.04] text-white sm:w-44" aria-label="Filtrer par plan"><SelectValue placeholder="Plan" /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b1226] text-white">
                <SelectItem className="focus:bg-white/8 focus:text-white" value="all">Tous les plans</SelectItem>
                {PLANS.map((p) => (
                  <SelectItem key={p.value} className="focus:bg-white/8 focus:text-white" value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-full rounded-xl border-white/12 bg-white/[0.04] text-white sm:w-40" aria-label="Filtrer par statut"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b1226] text-white">
                <SelectItem className="focus:bg-white/8 focus:text-white" value="all">Tous statuts</SelectItem>
                <SelectItem className="focus:bg-white/8 focus:text-white" value="active">Actifs</SelectItem>
                <SelectItem className="focus:bg-white/8 focus:text-white" value="inactive">Désactivés</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading && <TableSkeleton />}

          {!loading && !error && pagination && (
            <p className="text-sm text-[#8fa0c2]" role="status" aria-live="polite">
              {pagination.total} résultat{pagination.total > 1 ? 's' : ''}
              {(dateFrom || dateTo) && (
                <>
                  {' '}
                  pour la période du <span className="font-medium text-white">{dateFrom || '…'}</span> au{' '}
                  <span className="font-medium text-white">{dateTo || '…'}</span>
                </>
              )}
            </p>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-[#f07d6a]">{error}</p>
              <Button variant="outline" size="sm" className="lux-btn-ghost mt-3 h-9 rounded-full px-4 text-xs" onClick={fetchUsers}>Réessayer</Button>
            </div>
          )}

          {!loading && !error && users.length === 0 && (
            <div className="lux-empty rounded-2xl px-4 py-12 text-center">
              <h3 className="lux-display text-lg text-white">Aucun utilisateur</h3>
              <p className="mt-1 text-sm text-[#8fa0c2]">Aucun compte ne correspond aux filtres.</p>
            </div>
          )}

          {!loading && !error && users.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/8">
                      <TableHead className="lux-eyebrow !text-[9.5px]">Compte</TableHead>
                      <TableHead className="lux-eyebrow !text-[9.5px]">Plan</TableHead>
                      <TableHead className="lux-eyebrow !text-[9.5px] hidden md:table-cell">Abonnement</TableHead>
                      <TableHead className="lux-eyebrow !text-[9.5px] hidden text-center sm:table-cell">Biens</TableHead>
                      <TableHead className="lux-eyebrow !text-[9.5px]">Statut</TableHead>
                      <TableHead className="lux-eyebrow !text-[9.5px] hidden lg:table-cell">Inscrit le</TableHead>
                      <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id} className="border-white/8 hover:bg-white/[0.04]">
                        <TableCell>
                          <button
                            type="button"
                            className="text-left font-semibold text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5c8af0]"
                            onClick={() => openDetail(user)}
                            aria-label={`Ouvrir la fiche de ${user.fullName || user.email}`}
                          >
                            {user.fullName || '—'}
                          </button>
                          <p className="text-xs text-[#8fa0c2]">{user.email}</p>
                          {user.role === 'superadmin' && (
                            <span className="lux-chip mt-1">
                              <span className="lux-dot" style={{ backgroundColor: '#fbbf24' }} aria-hidden="true" /> Superadmin
                            </span>
                          )}
                        </TableCell>
                        <TableCell><PlanBadge user={user} /></TableCell>
                        <TableCell className="hidden md:table-cell">
                          {user.subscription ? (
                            <>
                              <span className="lux-num text-xs font-semibold text-white">
                                {user.subscription.amount.toFixed(2)} €
                              </span>{' '}
                              <span className="text-xs text-[#8fa0c2]">
                                / {user.subscription.billingCycle === 'monthly' ? 'mois' : 'an'}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-[#8fa0c2]/60">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-center text-sm text-white sm:table-cell">{user.propertyCount}</TableCell>
                        <TableCell>
                          {user.isActive ? (
                            <span className="lux-chip">
                              <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" /> Actif
                            </span>
                          ) : (
                            <span className="lux-chip">
                              <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" /> Désactivé
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-sm text-[#8fa0c2] lg:table-cell">
                          {format(new Date(user.createdAt), 'dd MMM yyyy', { locale: fr })}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" disabled={busyId === user.id} aria-label={`Actions pour ${user.email}`} className="text-[#8fa0c2] hover:bg-white/8 hover:text-white">
                                <span aria-hidden="true">▾</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 border-white/10 bg-[#0b1226] text-white">
                              <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8fa0c2]/70">
                                Actions compte
                              </DropdownMenuLabel>
                              <DropdownMenuItem className="cursor-pointer focus:bg-white/8 focus:text-white" onClick={() => openDetail(user)}>
                                Voir la fiche client
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-white/10" />
                              <DropdownMenuItem
                                className="cursor-pointer focus:bg-white/8 focus:text-white"
                                onClick={() => runAction(user, 'toggle-active')}
                              >
                                {user.isActive ? 'Désactiver le compte' : 'Activer le compte'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer focus:bg-white/8 focus:text-white"
                                onClick={() => { setPlanTarget(user); setPlanChoice(user.selectedPlan || 'airbnb_solo'); }}
                              >
                                Changer de plan
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer focus:bg-white/8 focus:text-white"
                                onClick={() => runAction(user, 'change-role', { role: user.role === 'superadmin' ? 'user' : 'superadmin' })}
                              >
                                {user.role === 'superadmin' ? 'Retirer Superadmin' : 'Promouvoir Superadmin'}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer focus:bg-white/8 focus:text-white" onClick={() => runAction(user, 'reset-password')}>
                                Réinitialiser le mot de passe
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-white/10" />
                              <DropdownMenuItem
                                className="cursor-pointer text-[#f07d6a] focus:bg-[#f07d6a]/10 focus:text-[#f07d6a]"
                                onClick={() => setDeleteTarget(user)}
                              >
                                Supprimer le compte
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
                  <p className="text-sm text-[#8fa0c2]">
                    Page {pagination.page} / {pagination.totalPages} — {pagination.total} résultat{pagination.total > 1 ? 's' : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="lux-btn-ghost h-9 rounded-full px-4 text-xs" disabled={pagination.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      Précédent
                    </Button>
                    <Button variant="outline" size="sm" className="lux-btn-ghost h-9 rounded-full px-4 text-xs" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                      Suivant
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ----- Dialog changement de plan ----- */}
      <Dialog open={planTarget !== null} onOpenChange={(o) => !o && setPlanTarget(null)}>
        <DialogContent className="border-white/10 bg-[#0b1226] text-white">
          <DialogHeader>
            <DialogTitle className="lux-display text-lg text-white">Changer de plan</DialogTitle>
            <DialogDescription className="text-[#8fa0c2]">
              {planTarget?.email} — l'abonnement actif éventuel sera annulé et le plan sélectionné mis à jour.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="plan-choice" className="text-[#8fa0c2]">Nouveau plan</Label>
            <Select value={planChoice} onValueChange={setPlanChoice}>
              <SelectTrigger id="plan-choice" className="w-full rounded-xl border-white/12 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b1226] text-white">
                {PLANS.map((p) => (
                  <SelectItem key={p.value} className="focus:bg-white/8 focus:text-white" value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              className="lux-btn h-9 rounded-full px-4 text-xs"
              onClick={async () => {
                if (planTarget && (await runAction(planTarget, 'change-plan', { plan: planChoice }))) {
                  setPlanTarget(null);
                }
              }}
              disabled={busyId !== null}
            >
              Appliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- Confirmation suppression ----- */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/10 bg-[#0b1226] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="lux-display text-lg text-white">Supprimer ce compte ?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8fa0c2]">
              Action irréversible : le compte <strong>{deleteTarget?.email}</strong> et ses données associées
              seront définitivement supprimés. Les comptes possédant des biens sont refusés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="lux-btn-ghost h-9 rounded-full border-white/12 bg-transparent px-4 text-xs">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="border border-[#f07d6a]/40 bg-[#f07d6a]/10 text-[#f07d6a] hover:bg-[#f07d6a]/20"
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
        <DialogContent className="border-white/10 bg-[#0b1226] text-white">
          <DialogHeader>
            <DialogTitle className="lux-display text-lg text-white">Mot de passe temporaire</DialogTitle>
            <DialogDescription className="text-[#8fa0c2]">
              Pour <strong>{tempPassword?.email}</strong>. Un email de notification a été mis en outbox.
              Copiez-le maintenant : il ne sera plus jamais affiché.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center">
            <code className="lux-num select-all text-lg font-bold tracking-widest text-[#e9c47c]">{tempPassword?.password}</code>
          </div>
          <DialogFooter>
            <Button
              className="lux-btn h-9 rounded-full px-4 text-xs"
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
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto border-white/10 bg-[#0b1226] text-white sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="lux-display text-lg font-bold text-white">
              Fiche client{detail ? ` — ${detail.user.fullName || detail.user.email}` : ''}
            </SheetTitle>
            <SheetDescription id="user-detail-desc" className="text-[#8fa0c2]">
              {detailTarget?.email} — équipe, facturation et informations du compte (données de la base).
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 px-4 pb-8">
            {detailLoading && (
              <div className="space-y-3" role="status" aria-live="polite">
                <Skeleton className="h-5 w-44 bg-white/8" />
                <Skeleton className="h-16 w-full bg-white/8" />
                <Skeleton className="h-36 w-full bg-white/8" />
                <Skeleton className="h-44 w-full bg-white/8" />
              </div>
            )}

            {detailError && !detailLoading && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-[#f07d6a]">{detailError}</p>
                <Button variant="outline" size="sm" className="lux-btn-ghost h-9 rounded-full px-4 text-xs" onClick={() => detailTarget && openDetail(detailTarget)}>
                  Réessayer
                </Button>
              </div>
            )}

            {detail && !detailLoading && (
              <>
                {/* ----- Badges compte ----- */}
                <div className="flex flex-wrap items-center gap-2">
                  {detail.user.role === 'superadmin' && (
                    <span className="lux-chip">
                      <span className="lux-dot" style={{ backgroundColor: '#fbbf24' }} aria-hidden="true" /> Superadmin
                    </span>
                  )}
                  {detail.user.providerBusinessName && (
                    <span className="lux-chip">
                      <span className="lux-dot" style={{ backgroundColor: '#cdb6ff' }} aria-hidden="true" />
                      Prestataire : {detail.user.providerBusinessName}
                    </span>
                  )}
                  {detail.user.selectedPlan && detail.user.selectedPlan !== 'free' ? (
                    <span className="lux-chip">{planLabel(detail.user.selectedPlan)}</span>
                  ) : (
                    <span className="lux-chip">Gratuit</span>
                  )}
                  {detail.user.isActive ? (
                    <span className="lux-chip">
                      <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" /> Actif
                    </span>
                  ) : (
                    <span className="lux-chip">
                      <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" /> Désactivé
                    </span>
                  )}
                </div>

                {/* ----- Profil (champs réels uniquement) ----- */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-[#8fa0c2]">Inscrit le</dt>
                  <dd className="font-medium text-white">
                    {format(new Date(detail.user.createdAt), 'dd MMM yyyy', { locale: fr })}
                  </dd>
                  <dt className="text-[#8fa0c2]">Téléphone</dt>
                  <dd className="font-medium text-white">{detail.user.phone ?? '—'}</dd>
                  <dt className="text-[#8fa0c2]">Adresse</dt>
                  <dd className="font-medium text-white">{detail.user.address ?? '—'}</dd>
                </dl>

                <Separator className="bg-white/10" />

                {/* ================= ÉQUIPE ================= */}
                <section aria-labelledby="detail-team-title" className="space-y-3">
                  <h3 id="detail-team-title" className="lux-eyebrow">Équipe</h3>

                  {detail.team.ownedProperties.length === 0 && detail.team.memberships.length === 0 ? (
                    <div className="lux-empty rounded-xl p-6 text-center">
                      <p className="text-sm font-medium text-white">Aucun membre d&apos;équipe</p>
                      <p className="mt-1 text-xs text-[#8fa0c2]">
                        Ce compte ne gère aucun bien et n&apos;appartient à l&apos;équipe d&apos;aucun autre hôte.
                      </p>
                    </div>
                  ) : (
                    <>
                      {detail.team.ownedProperties.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="lux-eyebrow">
                            Biens gérés ({detail.team.ownedProperties.length})
                          </h4>
                          {detail.team.ownedProperties.map((p) => (
                            <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-white">{p.name}</p>
                                <span className="flex items-center gap-1.5">
                                  <span className="lux-chip">{p.propertyType}</span>
                                  {p.isActive ? (
                                    <span className="lux-chip">
                                      <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" /> Actif
                                    </span>
                                  ) : (
                                    <span className="lux-chip">Désactivé</span>
                                  )}
                                </span>
                              </div>
                              {p.address && <p className="mt-0.5 text-xs text-[#8fa0c2]">{p.address}</p>}
                              <p className="mt-1.5 text-xs font-medium text-[#8fa0c2]">
                                {p.memberCount} membre{p.memberCount > 1 ? 's' : ''}
                              </p>
                              <ul className="mt-2 divide-y divide-white/8">
                                {p.members.map((m) => {
                                  const meta = memberRoleMeta(m.role);
                                  return (
                                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                                      <span className="flex min-w-0 items-center gap-1.5">
                                        <span className="truncate font-medium text-white">
                                          {m.user.fullName || m.user.email}
                                        </span>
                                        {m.user.fullName && (
                                          <span className="truncate text-xs text-[#8fa0c2]/70">{m.user.email}</span>
                                        )}
                                      </span>
                                      <span className="flex shrink-0 flex-wrap items-center gap-1">
                                        <span className="lux-chip">{meta.label}</span>
                                        {!m.acceptedAt && (
                                          <span className="lux-chip">
                                            <span className="lux-dot" style={{ backgroundColor: '#fbbf24' }} aria-hidden="true" /> Invitation en attente
                                          </span>
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
                          <h4 className="lux-eyebrow">
                            Équipes rejointes ({detail.team.memberships.length})
                          </h4>
                          <ul className="divide-y divide-white/8 rounded-xl border border-white/10 bg-white/[0.02]">
                            {detail.team.memberships.map((m) => {
                              const meta = memberRoleMeta(m.role);
                              return (
                                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                                  <span className="min-w-0">
                                    <span className="block truncate font-medium text-white">{m.property.name}</span>
                                    <span className="block truncate text-xs text-[#8fa0c2]/70">
                                      hôte : {m.property.ownerName || m.property.ownerEmail}
                                    </span>
                                  </span>
                                  <span className="flex shrink-0 flex-wrap items-center gap-1">
                                    <span className="lux-chip">{meta.label}</span>
                                    {!m.acceptedAt && (
                                      <span className="lux-chip">
                                        <span className="lux-dot" style={{ backgroundColor: '#fbbf24' }} aria-hidden="true" /> Invitation en attente
                                      </span>
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

                <Separator className="bg-white/10" />

                {/* ================= FACTURATION ================= */}
                <section aria-labelledby="detail-billing-title" className="space-y-3">
                  <h3 id="detail-billing-title" className="lux-eyebrow">Facturation</h3>

                  {/* Abonnement actif : plan, statut, échéance */}
                  {detail.billing.activeSubscription ? (
                    <div className="rounded-xl border border-[#34d399]/25 bg-[#34d399]/8 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-white">
                          {planLabel(detail.billing.activeSubscription.plan)}
                        </p>
                        {subscriptionStatusBadge(detail.billing.activeSubscription.status)}
                      </div>
                      <p className="mt-1 text-sm text-white/85">
                        <span className="lux-num font-semibold text-white">
                          {detail.billing.activeSubscription.amount.toFixed(2)} €
                        </span>{' '}
                        / {detail.billing.activeSubscription.billingCycle === 'monthly' ? 'mois' : 'an'}
                      </p>
                      <p className="mt-0.5 text-xs text-[#8fa0c2]">
                        Échéance :{' '}
                        {detail.billing.activeSubscription.currentPeriodEnd
                          ? format(new Date(detail.billing.activeSubscription.currentPeriodEnd), 'dd MMM yyyy', { locale: fr })
                          : '—'}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-[#8fa0c2]">
                      Aucun abonnement actif.
                    </div>
                  )}

                  {/* Commandes de service sur les biens + cumuls réels */}
                  <dl className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-center">
                      <dt className="lux-eyebrow !text-[9.5px]">Commandes</dt>
                      <dd className="lux-num text-lg font-bold text-white">{detail.billing.serviceOrders.count}</dd>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-center">
                      <dt className="lux-eyebrow !text-[9.5px]">Cumul commandes</dt>
                      <dd className="lux-num text-lg font-bold text-white">
                        {detail.billing.serviceOrders.totalAmount.toFixed(2)} €
                      </dd>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-center">
                      <dt className="lux-eyebrow !text-[9.5px]">Part hôte</dt>
                      <dd className="lux-num text-lg font-bold text-white">
                        {detail.billing.serviceOrders.hostEarnings.toFixed(2)} €
                      </dd>
                    </div>
                  </dl>
                  <p className="-mt-2 text-[11px] text-[#8fa0c2]/70">
                    Commandes de service (hors annulées) posées par les invités sur les biens du client.
                  </p>

                  {/* Historique d'abonnements */}
                  {detail.billing.subscriptions.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="lux-eyebrow">Historique d&apos;abonnements</h4>
                      <ul className="divide-y divide-white/8 rounded-xl border border-white/10 bg-white/[0.02]">
                        {detail.billing.subscriptions.map((s) => (
                          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                            <span className="font-medium text-white">{planLabel(s.plan)}</span>
                            <span className="flex items-center gap-2">
                              <span className="text-xs text-[#8fa0c2]">
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
                    <h4 className="flex flex-wrap items-center gap-2 lux-eyebrow">
                      Paiements enregistrés
                      <span className="lux-chip font-mono !text-[11px]">
                        {detail.billing.transactions.count} · {detail.billing.transactions.totalAmount.toFixed(2)} €
                      </span>
                    </h4>
                    {detail.billing.transactions.items.length === 0 ? (
                      <p className="lux-empty rounded-xl p-3 text-xs text-[#8fa0c2]">
                        Aucun paiement enregistré pour ce compte.
                      </p>
                    ) : (
                      <ul className="divide-y divide-white/8 rounded-xl border border-white/10 bg-white/[0.02]">
                        {detail.billing.transactions.items.map((t) => (
                          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                            <span>
                              <span className="block font-medium text-white">
                                {TRANSACTION_TYPE_LABELS[t.type] ?? t.type} — {t.amount.toFixed(2)} €
                              </span>
                              <span className="block text-xs text-[#8fa0c2]/70">
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
                    <h4 className="lux-eyebrow">Références Stripe</h4>
                    <dl className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                      <div className="flex items-center justify-between gap-2 py-0.5">
                        <dt className="text-[#8fa0c2]">Compte Connect (reversements)</dt>
                        <dd className="truncate font-mono text-white">{detail.user.stripeAccountId ?? '—'}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2 py-0.5">
                        <dt className="text-[#8fa0c2]">Abonnement Stripe</dt>
                        <dd className="truncate font-mono text-white">
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
          <Skeleton className="h-4 w-40 bg-white/8" />
          <Skeleton className="h-4 w-32 bg-white/8" />
          <Skeleton className="h-5 w-24 bg-white/8" />
          <Skeleton className="h-4 w-12 bg-white/8" />
          <Skeleton className="h-4 w-12 bg-white/8" />
          <Skeleton className="h-4 w-24 bg-white/8" />
        </div>
      ))}
    </div>
  );
}
