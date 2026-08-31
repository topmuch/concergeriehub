'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, RefreshCw, Search, MapPin } from 'lucide-react';
import { B2BCard } from '@/components/ui/b2b-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { propertyTypeMeta, formatEur } from '@/lib/b2b';
import { cn } from '@/lib/utils';

// =============================================================
// AdminHostsContent — ÉTAPE 9.3 : gestion des hôtes.
//  - Liste des comptes hôtes avec plan (abonnement/intention)
//  - Détail des propriétés par hôte (QR, plaques, Hub)
//  - Désactivation de compte (le login est bloqué côté auth)
// =============================================================

interface HostRow {
  id: string;
  fullName: string | null;
  email: string;
  selectedPlan: string | null;
  isActive: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
  propertyCount: number;
  subscription: {
    plan: string;
    status: string;
    billingCycle: string;
    amount: number;
  } | null;
}

interface HostProperty {
  id: string;
  name: string;
  propertyType: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  createdAt: string;
  qrCount: number;
  plaqueCount: number;
  hubSlugs: string[];
}

interface HostDetail {
  host: {
    id: string;
    fullName: string | null;
    email: string;
    selectedPlan: string | null;
    isActive: boolean;
    createdAt: string;
  };
  properties: HostProperty[];
}

/** Plan affiché : abonnement actif en priorité, sinon intention. */
function hostPlan(h: HostRow): { label: string; className: string; source: string } {
  if (h.subscription && h.subscription.status === 'active') {
    const p = planBadge(h.subscription.plan);
    return { ...p, source: h.subscription.billingCycle === 'monthly' ? 'mensuel' : 'annuel' };
  }
  const p = planBadge(h.selectedPlan);
  return { ...p, source: 'intention' };
}

function planBadge(plan: string | null): { label: string; className: string } {
  switch (plan) {
    case 'airbnb_solo':
      return { label: 'Solo', className: 'bg-emerald-50 border-emerald-200 text-emerald-700' };
    case 'airbnb_pro':
      return { label: 'Pro', className: 'bg-slate-900 border-slate-900 text-white' };
    case 'agency':
      return { label: 'Agence', className: 'bg-amber-50 border-amber-200 text-amber-700' };
    default:
      return { label: 'Free', className: 'bg-slate-100 border-slate-200 text-slate-500' };
  }
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  );
}

export function AdminHostsContent() {
  const [hosts, setHosts] = useState<HostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Détail déplié par hôte
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HostDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/hosts');
      if (!res.ok) throw new Error('http');
      const json = (await res.json()) as { hosts: HostRow[] };
      setHosts(json.hosts);
    } catch {
      setError('Impossible de charger les hôtes. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hosts;
    return hosts.filter(
      (h) => h.email.toLowerCase().includes(q) || (h.fullName ?? '').toLowerCase().includes(q),
    );
  }, [hosts, search]);

  // ----- Déplier une fiche hôte -----
  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/hosts/${id}`);
      if (!res.ok) throw new Error('http');
      setDetail((await res.json()) as HostDetail);
    } catch {
      toast.error('Impossible de charger les biens de cet hôte.');
      setExpandedId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // ----- Désactivation / réactivation -----
  const toggleActive = async (h: HostRow, next: boolean) => {
    setHosts((prev) => prev.map((x) => (x.id === h.id ? { ...x, isActive: next } : x)));
    try {
      const res = await fetch(`/api/admin/hosts/${h.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) throw new Error('http');
      toast.success(
        next
          ? `${h.fullName ?? h.email} réactivé`
          : `${h.fullName ?? h.email} désactivé — connexion bloquée`,
      );
      if (detail?.host.id === h.id) {
        setDetail({ ...detail, host: { ...detail.host, isActive: next } });
      }
    } catch {
      setHosts((prev) => prev.map((x) => (x.id === h.id ? { ...x, isActive: !next } : x)));
      toast.error('Modification impossible. Réessayez.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6">
      {/* ================= En-tête ================= */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Hôtes 🏠</h1>
          <p className="text-sm text-slate-600 mt-1">
            Comptes, abonnements et biens — désactivez un compte en cas d&apos;abus.
          </p>
        </div>
        <Button variant="outline" onClick={load} className="bg-white" aria-label="Rafraîchir la liste">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Actualiser
        </Button>
      </section>

      {/* ================= Recherche ================= */}
      <section>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou email…"
            aria-label="Rechercher un hôte"
            className="pl-9 bg-white"
          />
        </div>
      </section>

      {/* ================= Liste ================= */}
      <section aria-label="Liste des hôtes" className="space-y-3 pb-6">
        {loading && hosts.length === 0 ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : error ? (
          <B2BCard className="text-center">
            <p className="text-sm text-slate-600">{error}</p>
            <Button onClick={load} className="mt-3 bg-slate-900 hover:bg-slate-800 text-white">
              <RefreshCw className="h-4 w-4" /> Réessayer
            </Button>
          </B2BCard>
        ) : filtered.length === 0 ? (
          <B2BCard className="text-center">
            <p className="text-3xl" aria-hidden="true">🔍</p>
            <p className="mt-2 font-semibold text-slate-900">Aucun hôte trouvé</p>
          </B2BCard>
        ) : (
          filtered.map((h) => {
            const plan = hostPlan(h);
            const expanded = expandedId === h.id;
            return (
              <B2BCard key={h.id} hover className={cn(!h.isActive && 'opacity-80')}>
                {/* ----- Ligne principale ----- */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(h.id)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Masquer' : 'Voir'} les biens de ${h.fullName ?? h.email}`}
                    className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>

                  <span
                    aria-hidden="true"
                    className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 text-sm font-bold text-slate-600 inline-flex items-center justify-center shrink-0"
                  >
                    {(h.fullName ?? h.email).slice(0, 2).toUpperCase()}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900 truncate">{h.fullName ?? 'Sans nom'}</p>
                      <Badge variant="outline" className={cn('font-semibold', plan.className)}>
                        {plan.label}
                        {plan.label !== 'Free' && (
                          <span className="ml-1 font-normal opacity-80">· {plan.source}</span>
                        )}
                      </Badge>
                      {!h.isActive && (
                        <Badge variant="outline" className="bg-red-50 border-red-200 text-red-600 font-semibold">
                          ⛔ Désactivé
                        </Badge>
                      )}
                      {!h.onboardingCompleted && (
                        <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 font-semibold">
                          onboarding incomplet
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {h.email} · inscrit le {formatDay(h.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-4 shrink-0">
                    <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                      {h.propertyCount} bien{h.propertyCount > 1 ? 's' : ''}
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch
                        checked={h.isActive}
                        onCheckedChange={(v) => toggleActive(h, v)}
                        aria-label={`Compte ${h.fullName ?? h.email} ${h.isActive ? 'actif' : 'désactivé'}`}
                      />
                      <span className="text-xs font-semibold text-slate-600 sm:whitespace-nowrap">
                        {h.isActive ? 'Actif' : 'Désactivé'}
                      </span>
                    </label>
                  </div>
                </div>

                {/* ----- Biens dépliés ----- */}
                {expanded && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    {detailLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-16 rounded-xl" />
                        <Skeleton className="h-16 rounded-xl" />
                      </div>
                    ) : detail && detail.properties.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {detail.properties.map((p) => {
                          const tm = propertyTypeMeta(p.propertyType);
                          return (
                            <div key={p.id} className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
                              <div className="flex items-start gap-2.5">
                                <span className="text-lg leading-none select-none" aria-hidden="true">
                                  {tm.emoji}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                    <MapPin className="h-3 w-3" aria-hidden="true" />
                                    {p.address ?? tm.label}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-white border-slate-200 text-slate-600">
                                      {p.qrCount} QR code{p.qrCount > 1 ? 's' : ''}
                                    </span>
                                    <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-white border-slate-200 text-slate-600">
                                      {p.plaqueCount} plaque{p.plaqueCount > 1 ? 's' : ''}
                                    </span>
                                    {p.hubSlugs.length > 0 && (
                                      <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-white border-slate-200 text-slate-600 truncate max-w-full">
                                        🔗 /hub/{p.hubSlugs[0]}
                                      </span>
                                    )}
                                    {!p.isActive && (
                                      <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 border-red-200 text-red-600">
                                        bien désactivé
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 text-center py-4">
                        Aucune propriété pour cet hôte.
                      </p>
                    )}
                  </div>
                )}
              </B2BCard>
            );
          })
        )}
      </section>
    </div>
  );
}
