'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { cn } from '@/lib/utils';

// =============================================================
// ContextualInsight — PHASE 3 « COACH ROOMSCAN » (v5.4)
// Bandeau contextuel intégré dans les pages existantes (Invités,
// Calendrier…) : n'affiche que les insights dont l'URL d'action
// correspond à la page (filtre serveur `context=` sur actionUrl).
//
//   • Discrétion absolue : rien n'est rendu tant que le chargement
//     n'est pas terminé OU qu'aucun insight contextuel n'existe —
//     la page reste inchangée le reste du temps.
//   • Actions : « Passer » (DISMISSED, journalisé) + lien d'action
//     tracké (CLICKED fire-and-forget).
//   • Design « SAPHIR LUXE » : ZÉRO icône — point coloré, chips,
//     typographie — teinte or (corail si urgence).
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

const PRIORITY_DOT: Record<InsightRow['priority'], string> = {
  CRITICAL: '#f07d6a',
  HIGH: '#e9c47c',
  MEDIUM: '#5c8af0',
  LOW: '#8fa0c2',
};

export function ContextualInsight({ context }: { context: string }) {
  const { selectedId, properties, propertiesLoading } = useHostContext();

  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ propertyId: selectedId, context });
      const res = await fetch(`/api/airbnb/insights?${qs.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { insights: InsightRow[] };
      setInsights(json.insights ?? []);
    } catch {
      setInsights([]);
    } finally {
      setReady(true);
    }
  }, [selectedId, context]);

  useEffect(() => {
    if (propertiesLoading) return;
    setReady(false);
    void load();
  }, [propertiesLoading, load]);

  async function dismiss(id: string) {
    setInsights((rows) => rows.filter((r) => r.id !== id));
    try {
      await fetch(`/api/airbnb/insights/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DISMISSED' }),
      });
    } catch {
      // best effort — le retrait local suffit côté UX
    }
  }

  function trackClick(id: string) {
    void fetch(`/api/airbnb/insights/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CLICKED' }),
    }).catch(() => undefined);
  }

  // Discrétion : aucun rendu tant que rien n'est prêt ou à montrer.
  if (!ready || insights.length === 0) return null;

  const propertyNameOf = (propertyId: string) =>
    properties.find((p) => p.id === propertyId)?.name ?? null;

  return (
    <motion.section
      aria-label="Suggestions du Coach Roomscan"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex flex-col gap-2.5"
    >
      {insights.slice(0, 3).map((insight) => {
        const critical = insight.priority === 'CRITICAL';
        const dot = PRIORITY_DOT[insight.priority] ?? PRIORITY_DOT.LOW;
        const prop = propertyNameOf(insight.propertyId);
        return (
          <motion.div
            key={insight.id}
            layout
            className={cn(
              'flex flex-col gap-2 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4',
              critical
                ? 'border-[#f07d6a]/30 bg-[#f07d6a]/[0.06]'
                : 'border-[#e9c47c]/25 bg-[#e9c47c]/[0.05]',
            )}
          >
            <span
              className="lux-dot mt-1.5 shrink-0"
              style={{ backgroundColor: dot }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">
                {insight.title}
                {prop && <span className="ml-2 text-[11px] font-normal text-[#8fa0c2]">· {prop}</span>}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#8fa0c2]">{insight.message}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link
                href={insight.actionUrl}
                onClick={() => trackClick(insight.id)}
                className={cn(
                  'inline-flex min-h-[36px] items-center rounded-full px-4 text-xs font-semibold transition-transform hover:-translate-y-px',
                  critical
                    ? 'bg-[#f07d6a]/15 text-[#ffab92] ring-1 ring-[#f07d6a]/35 hover:bg-[#f07d6a]/20'
                    : 'bg-[#e9c47c]/12 text-[#e9c47c] ring-1 ring-[#e9c47c]/30 hover:bg-[#e9c47c]/18',
                )}
              >
                {insight.actionLabel} <span aria-hidden="true" className="ml-1.5">→</span>
              </Link>
              <button
                type="button"
                onClick={() => void dismiss(insight.id)}
                aria-label="Passer cette suggestion"
                className="min-h-[36px] rounded-full px-2 text-xs font-medium text-[#8fa0c2] underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                Passer
              </button>
            </div>
          </motion.div>
        );
      })}
    </motion.section>
  );
}
