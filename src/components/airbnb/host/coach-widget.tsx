'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { cn } from '@/lib/utils';

// =============================================================
// CoachWidget — PHASE 2 « COACH ROOMSCAN » (v5.4)
// Bloc du Dashboard Hôte : les recommandations du coach IA pour le
// bien sélectionné (scope 'all' = tous les biens confondus).
//
//   • Données réelles : GET /api/airbnb/insights (cache 1 h serveur,
//     top 10 par bien trié par score, CRITICAL en tête)
//   • Actions : Résolu / Passé (PATCH …/insights/[id], journalisé +
//     CoachAnalytics) — lien d'action tracké (CLICKED fire-and-forget)
//   • Design « SAPHIR LUXE » : ZÉRO icône — typographie, points
//     colorés par priorité, chips — cohérent avec le dashboard
//   • Auto-refresh via refreshKey (bouton « Actualiser » du hero)
// =============================================================

interface InsightRow {
  id: string;
  propertyId: string;
  type: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  title: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
  isResolved: boolean;
  createdAt: string;
  expiresAt: string | null;
}

/** Priorité → libellé + encre (palette saphir, sans icône). */
const PRIORITY_META: Record<InsightRow['priority'], { label: string; dot: string; ink: string }> = {
  CRITICAL: { label: 'Urgent', dot: '#f07d6a', ink: 'text-[#ffab92]' },
  HIGH: { label: 'Important', dot: '#e9c47c', ink: 'text-[#e9c47c]' },
  MEDIUM: { label: 'À noter', dot: '#5c8af0', ink: 'text-[#a9c4ff]' },
  LOW: { label: 'Info', dot: '#8fa0c2', ink: 'text-[#8fa0c2]' },
};

const TYPE_LABELS: Record<string, string> = {
  STOCK: 'Stock',
  REVENUE: 'Revenu',
  REVIEW: 'Avis',
  UPSELL: 'Upsell',
  OPERATION: 'Opération',
  QUALITY: 'Qualité',
  BEHAVIOR: 'Comportement',
};

/** Insights affichés par défaut (le reste derrière « Afficher la suite »). */
const PREVIEW_COUNT = 4;

export function CoachWidget({ refreshKey = 0 }: { refreshKey?: number }) {
  const { selectedId, selectedProperty, properties, propertiesLoading } = useHostContext();

  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/airbnb/insights?propertyId=${encodeURIComponent(selectedId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { insights: InsightRow[] };
      setInsights(json.insights ?? []);
    } catch {
      setInsights([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (propertiesLoading) return;
    void load();
  }, [propertiesLoading, load, refreshKey]);

  /** PATCH journalisé côté serveur + retrait optimiste de la file. */
  async function act(id: string, action: 'RESOLVED' | 'DISMISSED') {
    setBusyId(id);
    const previous = insights;
    setInsights((rows) => rows.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/airbnb/insights/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(action === 'RESOLVED' ? 'Marqué comme traité' : 'Recommandation passée');
    } catch {
      setInsights(previous);
      toast.error("L'action n'a pas pu être enregistrée");
    } finally {
      setBusyId(null);
    }
  }

  /** Suivi d'engagement (CLICKED) — fire-and-forget, jamais bloquant. */
  function trackClick(id: string) {
    void fetch(`/api/airbnb/insights/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CLICKED' }),
    }).catch(() => undefined);
  }

  const propertyNameOf = (propertyId: string) =>
    properties.find((p) => p.id === propertyId)?.name ?? null;

  const criticalCount = insights.filter((i) => i.priority === 'CRITICAL').length;
  const visible = showAll ? insights : insights.slice(0, PREVIEW_COUNT);
  const collapsible = insights.length > PREVIEW_COUNT;
  const hiddenCount = insights.length - PREVIEW_COUNT;

  return (
    <motion.section
      aria-label="Coach Roomscan"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="lux-card p-5 sm:p-6"
    >
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="lux-eyebrow">Coach Roomscan · Assistant IA</p>
          <h2 className="lux-display mt-1 text-xl font-semibold text-white sm:text-2xl">
            Recommandations du jour
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/airbnb/dashboard/coach"
            className="hidden text-xs font-semibold text-[#a9c4ff] underline-offset-4 transition-colors hover:text-white hover:underline sm:block"
          >
            Voir tout
          </Link>
          {!loading && insights.length > 0 && (
            <span
              className={cn(
                'lux-chip',
                criticalCount > 0 ? 'text-[#ffab92]' : 'text-[#8fa0c2]',
              )}
            >
              <span
                className="lux-dot"
                style={{ backgroundColor: criticalCount > 0 ? '#f07d6a' : '#34d399' }}
                aria-hidden="true"
              />
              {criticalCount > 0
                ? `${criticalCount} urgence${criticalCount > 1 ? 's' : ''}`
                : `${insights.length} recommandation${insights.length > 1 ? 's' : ''}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="lux-btn-ghost h-8 px-3 text-[11px] disabled:opacity-50"
          >
            Actualiser
          </button>
        </div>
      </div>

      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#8fa0c2]">
        {selectedProperty
          ? (
            <>
              L&apos;assistant surveille <span className="font-semibold text-white">{selectedProperty.name}</span>{' '}
              en continu et vous signale ce qui mérite votre attention maintenant.
            </>
          )
          : (
            <>L&apos;assistant surveille tous vos biens en continu et vous signale ce qui mérite votre attention maintenant.</>
          )}
      </p>

      {/* ---------- Corps ---------- */}
      {loading ? (
        <div className="mt-5 flex flex-col gap-2.5" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-white/8 bg-white/[0.03] p-4"
              aria-hidden="true"
            >
              <div className="h-3.5 w-40 rounded bg-white/8" />
              <div className="mt-2.5 h-3 w-full rounded bg-white/6" />
              <div className="mt-1.5 h-3 w-2/3 rounded bg-white/6" />
            </div>
          ))}
        </div>
      ) : insights.length === 0 ? (
        <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-8 text-center">
          <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
          <p className="lux-display text-lg text-white">Tout est sous contrôle</p>
          <p className="max-w-sm text-xs leading-relaxed text-[#8fa0c2]">
            Aucune recommandation pour le moment. Le coach vous préviendra dès qu&apos;une urgence
            ou une opportunité se présentera.
          </p>
        </div>
      ) : (
        <ul className="lux-scroll mt-5 flex max-h-[560px] flex-col gap-2.5 overflow-y-auto pr-1">
          {visible.map((insight, i) => {
            const meta = PRIORITY_META[insight.priority] ?? PRIORITY_META.LOW;
            const prop = propertyNameOf(insight.propertyId);
            const critical = insight.priority === 'CRITICAL';
            return (
              <motion.li
                key={insight.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.3, ease: 'easeOut' }}
                className={cn(
                  'rounded-xl border p-4 transition-colors',
                  critical
                    ? 'border-[#f07d6a]/30 bg-[#f07d6a]/[0.06]'
                    : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="lux-dot shrink-0"
                    style={{ backgroundColor: meta.dot }}
                    aria-hidden="true"
                  />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                    {insight.title}
                  </p>
                  <span className={cn('lux-chip shrink-0', meta.ink)}>{meta.label}</span>
                  <span className="lux-chip shrink-0 text-[#8fa0c2]">
                    {TYPE_LABELS[insight.type] ?? insight.type}
                  </span>
                </div>

                <p className="mt-2 text-[13px] leading-relaxed text-[#8fa0c2]">{insight.message}</p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Link
                    href={insight.actionUrl}
                    onClick={() => trackClick(insight.id)}
                    className={cn(
                      'inline-flex min-h-[36px] items-center rounded-full px-4 text-xs font-semibold transition-transform hover:-translate-y-px',
                      critical
                        ? 'bg-[#f07d6a]/15 text-[#ffab92] ring-1 ring-[#f07d6a]/35 hover:bg-[#f07d6a]/20'
                        : 'lux-btn-gold h-9',
                    )}
                  >
                    {insight.actionLabel} <span aria-hidden="true" className="ml-1.5">→</span>
                  </Link>
                  <button
                    type="button"
                    disabled={busyId === insight.id}
                    onClick={() => void act(insight.id, 'RESOLVED')}
                    className="lux-btn-ghost h-8 px-3 text-[11px] disabled:opacity-50"
                  >
                    Traité
                  </button>
                  <button
                    type="button"
                    disabled={busyId === insight.id}
                    onClick={() => void act(insight.id, 'DISMISSED')}
                    className="h-8 px-2 text-[11px] font-medium text-[#8fa0c2] underline-offset-4 transition-colors hover:text-white hover:underline disabled:opacity-50"
                  >
                    Passer
                  </button>
                  {prop && (
                    <span className="ml-auto hidden truncate text-[11px] text-[#8fa0c2]/70 sm:block">
                      {prop}
                    </span>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* ---------- Suite ---------- */}
      {collapsible && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 text-xs font-semibold text-[#a9c4ff] underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          {showAll
            ? 'Réduire la liste'
            : `Afficher les ${hiddenCount} autre${hiddenCount > 1 ? 's' : ''}`}
        </button>
      )}
    </motion.section>
  );
}
