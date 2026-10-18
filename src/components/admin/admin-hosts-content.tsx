'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
function hostPlan(h: HostRow): { label: string; dot: string; source: string } {
  if (h.subscription && h.subscription.status === 'active') {
    const p = planBadge(h.subscription.plan);
    return { ...p, source: h.subscription.billingCycle === 'monthly' ? 'mensuel' : 'annuel' };
  }
  const p = planBadge(h.selectedPlan);
  return { ...p, source: 'intention' };
}

function planBadge(plan: string | null): { label: string; dot: string } {
  switch (plan) {
    case 'airbnb_solo':
      return { label: 'Solo', dot: '#2dd4bf' };
    case 'airbnb_pro':
      return { label: 'Pro', dot: '#5c8af0' };
    case 'agency':
      return { label: 'Agence', dot: '#e9c47c' };
    default:
      return { label: 'Free', dot: '#64748b' };
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
          <p className="lux-eyebrow">Annuaire</p>
          <h1 className="lux-display mt-1 text-2xl font-semibold text-white sm:text-3xl">Hôtes</h1>
          <p className="text-sm text-[#8fa0c2] mt-1">
            Comptes, abonnements et biens — désactivez un compte en cas d&apos;abus.
          </p>
        </div>
        <Button variant="outline" onClick={load} className="lux-btn-ghost h-9 rounded-full px-4 text-xs" aria-label="Rafraîchir la liste">
          Actualiser
        </Button>
      </section>

      {/* ================= Recherche ================= */}
      <section>
        <div className="relative">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou email…"
            aria-label="Rechercher un hôte"
            className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
          />
        </div>
      </section>

      {/* ================= Liste ================= */}
      <section aria-label="Liste des hôtes" className="space-y-3 pb-6">
        {loading && hosts.length === 0 ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl bg-white/8" />)
        ) : error ? (
          <div className="lux-card p-6 text-center">
            <p className="text-sm text-[#8fa0c2]">{error}</p>
            <Button onClick={load} className="lux-btn mt-3 h-9 rounded-full px-4 text-xs">
              Réessayer
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="lux-empty rounded-2xl px-4 py-10 text-center">
            <p className="lux-display text-lg text-white">Aucun hôte trouvé</p>
          </div>
        ) : (
          filtered.map((h) => {
            const plan = hostPlan(h);
            const expanded = expandedId === h.id;
            return (
              <div key={h.id} className={cn('lux-card lux-card-hover p-4 sm:p-5', !h.isActive && 'opacity-80')}>
                {/* ----- Ligne principale ----- */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(h.id)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Masquer' : 'Voir'} les biens de ${h.fullName ?? h.email}`}
                    className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg text-[#8fa0c2] hover:bg-white/8 hover:text-white transition-colors"
                  >
                    <span aria-hidden="true">{expanded ? '▾' : '›'}</span>
                  </button>

                  <span
                    aria-hidden="true"
                    className="lux-num h-10 w-10 rounded-full bg-[#3d6fe0]/15 text-xs font-semibold text-[#a9c4ff] ring-1 ring-[#5c8af0]/25 inline-flex items-center justify-center shrink-0"
                  >
                    {(h.fullName ?? h.email).slice(0, 2).toUpperCase()}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white truncate">{h.fullName ?? 'Sans nom'}</p>
                      <span className="lux-chip">
                        <span className="lux-dot" style={{ backgroundColor: plan.dot }} aria-hidden="true" />
                        {plan.label}
                        {plan.label !== 'Free' && (
                          <span className="font-normal opacity-80">· {plan.source}</span>
                        )}
                      </span>
                      {!h.isActive && (
                        <span className="lux-chip">
                          <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" /> Désactivé
                        </span>
                      )}
                      {!h.onboardingCompleted && (
                        <span className="lux-chip">
                          <span className="lux-dot" style={{ backgroundColor: '#fbbf24' }} aria-hidden="true" /> onboarding incomplet
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#8fa0c2] truncate">
                      {h.email} · inscrit le {formatDay(h.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-4 shrink-0">
                    <span className="text-xs font-semibold text-[#8fa0c2] whitespace-nowrap">
                      {h.propertyCount} bien{h.propertyCount > 1 ? 's' : ''}
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch
                        checked={h.isActive}
                        onCheckedChange={(v) => toggleActive(h, v)}
                        aria-label={`Compte ${h.fullName ?? h.email} ${h.isActive ? 'actif' : 'désactivé'}`}
                      />
                      <span className="text-xs font-semibold text-[#8fa0c2] sm:whitespace-nowrap">
                        {h.isActive ? 'Actif' : 'Désactivé'}
                      </span>
                    </label>
                  </div>
                </div>

                {/* ----- Biens dépliés ----- */}
                {expanded && (
                  <div className="mt-4 pt-4 border-t border-white/8">
                    {detailLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-16 rounded-xl bg-white/8" />
                        <Skeleton className="h-16 rounded-xl bg-white/8" />
                      </div>
                    ) : detail && detail.properties.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {detail.properties.map((p) => {
                          const tm = propertyTypeMeta(p.propertyType);
                          return (
                            <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                              <div className="flex items-start gap-2.5">
                                <span
                                  aria-hidden="true"
                                  className="lux-dot mt-2 shrink-0"
                                  style={{ backgroundColor: '#2dd4bf' }}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{p.name}</p>
                                  <p className="text-[11px] text-[#8fa0c2] mt-0.5">
                                    {p.address ?? tm.label}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className="lux-chip !px-2 !py-0.5 !text-[10px]">
                                      {p.qrCount} QR code{p.qrCount > 1 ? 's' : ''}
                                    </span>
                                    <span className="lux-chip !px-2 !py-0.5 !text-[10px]">
                                      {p.plaqueCount} plaque{p.plaqueCount > 1 ? 's' : ''}
                                    </span>
                                    {p.hubSlugs.length > 0 && (
                                      <span className="lux-chip !px-2 !py-0.5 !text-[10px] truncate max-w-full">
                                        /hub/{p.hubSlugs[0]}
                                      </span>
                                    )}
                                    {!p.isActive && (
                                      <span
                                        className="lux-chip !px-2 !py-0.5 !text-[10px]"
                                        style={{ borderColor: 'rgba(240, 125, 106, 0.35)', color: '#f5a58f' }}
                                      >
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
                      <p className="text-sm text-[#8fa0c2] text-center py-4">
                        Aucune propriété pour cet hôte.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
