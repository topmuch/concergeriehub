'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, UserX, UserCheck } from 'lucide-react';
import { B2BCard } from '@/components/ui/b2b-card';
import { EmojiIcon } from '@/components/ui/emoji-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatEur, providerCategoryMeta } from '@/lib/b2b';

// =============================================================
// AdminDashboardContent — ÉTAPE 9.1 : Vue d'ensemble Superadmin.
//  - Bento stats : Hôtes actifs / Propriétés / MRR Stripe / Prestataires
//  - Derniers hôtes inscrits
//  - Dernières activités de la plateforme
// =============================================================

interface OverviewData {
  stats: {
    totalHosts: number;
    activeHosts: number;
    propertiesCount: number;
    activePropertiesCount: number;
    mrrEur: number;
    subscriptionsActive: number;
    providersTotal: number;
    providersActive: number;
    providersOwner: number;
    providersGuest: number;
  };
  recentHosts: {
    id: string;
    fullName: string | null;
    email: string;
    selectedPlan: string | null;
    isActive: boolean;
    createdAt: string;
    propertyCount: number;
  }[];
  recentActivity: {
    id: string;
    actionType: string;
    createdAt: string;
    propertyName: string | null;
    userName: string | null;
    module: string | null;
  }[];
}

// Libellés FR des plans
function planLabel(plan: string | null): { label: string; className: string } {
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

// Libellés FR des actions (activity_logs)
const ACTION_META: Record<string, { emoji: string; label: string }> = {
  qr_created: { emoji: '➕', label: 'QR code créé' },
  qr_updated: { emoji: '✏️', label: 'QR code modifié' },
  wifi_updated: { emoji: '📶', label: 'Wi-Fi mis à jour' },
  guidebook_updated: { emoji: '📖', label: 'Guidebook mis à jour' },
  scan: { emoji: '📡', label: 'Scan de la plaque' },
  voice_received: { emoji: '🎙️', label: 'Message vocal reçu' },
  complaint: { emoji: '🚨', label: 'Réclamation voyageur' },
  service_ordered: { emoji: '🥐', label: 'Service commandé' },
  property_created: { emoji: '🏠', label: 'Bien ajouté' },
  host_login: { emoji: '🔑', label: 'Connexion hôte' },
};

function actionMeta(type: string) {
  return ACTION_META[type] ?? { emoji: '•', label: type };
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function AdminDashboardContent() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/overview');
      if (!res.ok) throw new Error('http');
      setData((await res.json()) as OverviewData);
    } catch {
      setError('Impossible de charger les statistiques. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ----- Loading -----
  if (loading && !data) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6" aria-busy="true" aria-label="Chargement">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  // ----- Erreur -----
  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-16 flex justify-center">
        <B2BCard className="max-w-md w-full text-center">
          <p className="text-3xl" aria-hidden="true">😵</p>
          <p className="mt-2 font-semibold text-slate-900">Erreur de chargement</p>
          <p className="text-sm text-slate-600 mt-1">{error || 'Données indisponibles'}</p>
          <Button onClick={load} className="mt-4 bg-slate-900 hover:bg-slate-800 text-white">
            <RefreshCw className="h-4 w-4" /> Réessayer
          </Button>
        </B2BCard>
      </div>
    );
  }

  const { stats, recentHosts, recentActivity } = data;

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-8">
      {/* ================= En-tête ================= */}
      <section aria-labelledby="admin-greeting">
        <h1 id="admin-greeting" className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Vue d&apos;ensemble 🛡️
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Santé de la plateforme Conciergerie Hub — hôtes, biens, revenus et prestataires.
        </p>
      </section>

      {/* ================= Stats bento ================= */}
      <section aria-label="Statistiques globales" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 👩‍💻 Hôtes */}
        <B2BCard hover className="p-5">
          <div className="flex items-center justify-between">
            <EmojiIcon emoji="👩‍💻" size="sm" variant="accent" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 text-right">
              Hôtes actifs
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{stats.activeHosts}</p>
          <div className="mt-2">
            <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 border-slate-200 text-slate-600">
              {stats.totalHosts} inscrit{stats.totalHosts > 1 ? 's' : ''} au total
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Comptes hôtes non désactivés</p>
        </B2BCard>

        {/* 🏠 Propriétés */}
        <B2BCard hover className="p-5">
          <div className="flex items-center justify-between">
            <EmojiIcon emoji="🏠" size="sm" variant="accent" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 text-right">
              Propriétés
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{stats.propertiesCount}</p>
          <div className="mt-2">
            <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">
              {stats.activePropertiesCount} active{stats.activePropertiesCount > 1 ? 's' : ''}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Biens équipés d&apos;une plaque QR</p>
        </B2BCard>

        {/* 💰 MRR */}
        <B2BCard hover className="p-5">
          <div className="flex items-center justify-between">
            <EmojiIcon emoji="💰" size="sm" variant="accent" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 text-right">
              MRR Stripe
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{formatEur(stats.mrrEur)}</p>
          <div className="mt-2">
            {stats.subscriptionsActive > 0 ? (
              <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">
                {stats.subscriptionsActive} abonnement{stats.subscriptionsActive > 1 ? 's' : ''} actif{stats.subscriptionsActive > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-amber-700">
                💳 Paiements à l&apos;étape 10
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Revenu mensuel récurrent normalisé</p>
        </B2BCard>

        {/* 🧹 Prestataires */}
        <B2BCard hover className="p-5">
          <div className="flex items-center justify-between">
            <EmojiIcon emoji="🧹" size="sm" variant="accent" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 text-right">
              Prestataires
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{stats.providersActive}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 border-slate-200 text-slate-600">
              🔧 {stats.providersOwner} owner
            </span>
            <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 border-slate-200 text-slate-600">
              🥂 {stats.providersGuest} guest
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Gérés uniquement par le Superadmin</p>
        </B2BCard>
      </section>

      {/* ================= Listes ================= */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ----- Derniers hôtes inscrits ----- */}
        <B2BCard
          header={{
            emoji: '🆕',
            title: 'Derniers hôtes inscrits',
            subtitle: 'Les 6 comptes hôtes les plus récents',
          }}
          className="overflow-hidden"
        >
          {recentHosts.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Aucun hôte inscrit pour le moment.</p>
          ) : (
            <ul className="divide-y divide-slate-100 -mx-5 -mb-5 max-h-96 overflow-y-auto">
              {recentHosts.map((h) => {
                const plan = planLabel(h.selectedPlan);
                return (
                  <li key={h.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                    <span
                      aria-hidden="true"
                      className="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 inline-flex items-center justify-center shrink-0"
                    >
                      {(h.fullName ?? h.email).slice(0, 2).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {h.fullName ?? 'Sans nom'}
                        {!h.isActive && (
                          <span className="ml-2 text-[11px] font-semibold text-red-600">· désactivé</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{h.email}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge className={cn('font-semibold', plan.className)} variant="outline">
                        {plan.label}
                      </Badge>
                      <span className="text-[11px] text-slate-400">
                        {h.propertyCount} bien{h.propertyCount > 1 ? 's' : ''} · {formatDay(h.createdAt)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </B2BCard>

        {/* ----- Dernières activités ----- */}
        <B2BCard
          header={{
            emoji: '⚡',
            title: 'Dernières activités',
            subtitle: 'Flux d\u2019événements de la plateforme',
          }}
          className="overflow-hidden"
        >
          {recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Aucune activité enregistrée pour le moment.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 -mx-5 -mb-5 max-h-96 overflow-y-auto">
              {recentActivity.map((a) => {
                const meta = actionMeta(a.actionType);
                return (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                    <span className="text-lg leading-none mt-0.5 select-none" aria-hidden="true">
                      {meta.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {a.userName ?? 'Système'}
                        {a.propertyName ? ` · ${a.propertyName}` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0">{formatDate(a.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </B2BCard>
      </section>

      {/* ================= Rappel règle d'or ================= */}
      <section aria-label="Règle de gestion des prestataires" className="pb-4">
        <B2BCard className="bg-emerald-50/60 border-emerald-200">
          <div className="flex items-start gap-3">
            <EmojiIcon emoji="🛡️" size="sm" variant="plain" className="bg-white border-emerald-200" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Règle d&apos;or — Prestataires</p>
              <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                Seul le Superadmin (vous) ajoute et géolocalise les prestataires. Les hôtes les consultent
                depuis leur dashboard, et les voyageurs découvrent les expériences via le QR Hub.
                Gestion complète : <span className="font-semibold">onglet Prestataires</span>.
              </p>
            </div>
          </div>
        </B2BCard>
      </section>
    </div>
  );
}
