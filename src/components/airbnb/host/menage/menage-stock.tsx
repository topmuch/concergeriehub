'use client';

// =============================================================
// STOCK — onglet 3 du module « Ménage & Stock » (/airbnb/menage)
// v4.54 « ALERTES STOCK » réorganisée (v6.0) :
//   • alertes OUVERTES en tête — cartes d'action « Marquer résolue »
//     (PATCH action:'RESOLVE', 1 clic) ;
//   • historique horodaté groupé par jour (création, signaleur,
//     état du poste, note, résolution).
// Contrat et couleurs métier inchangés (src/lib/inventory.ts).
// Vue « Toutes les propriétés » : l'API est par bien → guidance.
// =============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { INVENTORY_STATUS_META, inventoryItemMeta } from '@/lib/inventory';
import type { InventoryAlertApi } from './types';
import { dayKey, formatFrDateTime, formatFrDay, isSameLocalDay } from './menage-utils';
import { LuxBusyDot, LUX_GHOST_BTN } from './menage-ui';

interface MenageStockProps {
  /** false en vue « toutes les propriétés » (API par bien). */
  enabled: boolean;
  propertyId: string | null;
}

export function MenageStock({ enabled, propertyId }: MenageStockProps) {
  const [alerts, setAlerts] = useState<InventoryAlertApi[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async (pid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/airbnb/properties/${encodeURIComponent(pid)}/inventory-alerts`, {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as { alerts?: InventoryAlertApi[] } | null;
      if (res.ok && json) setAlerts(json.alerts ?? []);
      else setAlerts(null);
    } catch {
      setAlerts(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !propertyId) {
      setAlerts(null);
      return;
    }
    void load(propertyId);
  }, [enabled, propertyId, load]);

  const resolve = async (alertId: string) => {
    if (!propertyId || resolvingId) return;
    setResolvingId(alertId);
    try {
      const res = await fetch(`/api/airbnb/properties/${encodeURIComponent(propertyId)}/inventory-alerts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action: 'RESOLVE' }),
      });
      if (!res.ok) throw new Error('http');
      setAlerts((prev) =>
        prev
          ? prev.map((a) => (a.id === alertId ? { ...a, resolvedAt: new Date().toISOString() } : a))
          : prev,
      );
      toast.success('Alerte résolue — merci !');
    } catch {
      toast.error('Résolution impossible. Réessayez.');
    } finally {
      setResolvingId(null);
    }
  };

  const open = useMemo(() => (alerts ?? []).filter((a) => !a.resolvedAt), [alerts]);
  const history = useMemo(() => (alerts ?? []).filter((a) => a.resolvedAt), [alerts]);

  // Historique résolu groupé par jour (desc — Aujourd'hui / Hier / date).
  const historyGroups = useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const map = new Map<string, { label: string; items: InventoryAlertApi[] }>();
    for (const a of history) {
      const d = new Date(a.createdAt);
      const key = dayKey(d);
      let g = map.get(key);
      if (!g) {
        const label = isSameLocalDay(d, now)
          ? `Aujourd’hui — ${formatFrDay(d)}`
          : isSameLocalDay(d, yesterday)
            ? `Hier — ${formatFrDay(d)}`
            : formatFrDay(d);
        g = { label, items: [] };
        map.set(key, g);
      }
      g.items.push(a);
    }
    return [...map.values()];
  }, [history]);

  // ── Vue « toutes les propriétés » : guidance (l'API est par bien) ──
  if (!enabled) {
    return (
      <div className="lux-empty flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
        <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
        <p className="text-sm font-semibold text-white">Alertes stock par bien</p>
        <p className="max-w-md text-xs text-[#8fabc2]">
          Sélectionnez un bien précis dans la barre du haut pour consulter et résoudre les
          signalements de stock de ce logement.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex flex-col gap-5"
    >
      {/* ── En-tête ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="lux-eyebrow">Stock minibar &amp; consommables</p>
          <h2 className="lux-display mt-1 text-lg text-white">Alertes stock</h2>
          <p className="mt-0.5 text-xs text-[#8fabc2]">
            Signalements de l&apos;équipe de ménage (serviettes, papier toilette, savon, capsules café) —
            résolvez-les après réapprovisionnement.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-8 shrink-0 rounded-full border-white/12 bg-white/[0.04] px-3 text-xs', LUX_GHOST_BTN)}
          disabled={loading || !propertyId}
          onClick={() => propertyId && void load(propertyId)}
          aria-label="Rafraîchir les alertes stock"
        >
          {loading && <LuxBusyDot />}
          Actualiser
        </Button>
      </div>

      {alerts === null && !loading ? (
        <div className="lux-empty flex flex-col items-center gap-2 rounded-2xl p-6 text-center">
          <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
          <p className="text-sm font-semibold text-white">Chargement impossible</p>
          <p className="text-xs text-[#8fabc2]">Réessayez avec le bouton Actualiser.</p>
        </div>
      ) : loading && alerts === null ? (
        <Skeleton className="h-24 w-full rounded-2xl bg-white/8" />
      ) : (
        <div className="flex flex-col gap-5">
          {open.length === 0 && history.length === 0 && (
            <div className="lux-empty flex flex-col items-center gap-2 rounded-2xl p-6 text-center">
              <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
              <p className="text-sm font-semibold text-white">Aucune alerte pour le moment</p>
              <p className="text-xs text-[#8fabc2]">
                L&apos;équipe signale le stock depuis le Mode Ménage du Hub (« Contrôle du stock »).
              </p>
            </div>
          )}

          {/* ── Alertes ouvertes — cartes d'action ── */}
          {open.length > 0 && (
            <section aria-label="Alertes ouvertes">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">À réapprovisionner</h3>
                <span className="lux-chip">
                  <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
                  {open.length} ouverte{open.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="lux-rule mt-2" />
              <ul className="mt-3 space-y-2.5">
                {open.map((a) => {
                  const meta = inventoryItemMeta(a.item);
                  const statusMeta = INVENTORY_STATUS_META[a.status] ?? INVENTORY_STATUS_META.low;
                  return (
                    <li
                      key={a.id}
                      className={cn(
                        'flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-start sm:justify-between',
                        a.status === 'empty'
                          ? 'border-[#f07d6a]/30 bg-[#f07d6a]/8'
                          : 'border-[#fbbf24]/30 bg-[#fbbf24]/8',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                          {meta.label}{' '}
                          <span className={`ml-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-[#8fabc2]">
                          <span
                            className="lux-dot shrink-0"
                            style={{ backgroundColor: a.status === 'empty' ? '#f07d6a' : '#fbbf24' }}
                            aria-hidden="true"
                          />
                          {a.reportedBy ?? 'Équipe ménage'} · {formatFrDateTime(a.createdAt)}
                          {a.note ? ` · « ${a.note.slice(0, 120)} »` : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 shrink-0 rounded-full bg-gradient-to-br from-[#3d97e0] to-[#24479c] px-4 text-xs font-semibold text-white shadow-[0_10px_28px_-12px_rgba(61,111,224,0.55)] hover:from-[#5cadf0] hover:to-[#2c56b8]"
                        disabled={resolvingId === a.id}
                        onClick={() => void resolve(a.id)}
                        aria-label={`Marquer ${meta.label} comme réapprovisionné`}
                      >
                        {resolvingId === a.id && <LuxBusyDot />}
                        Marquer résolue
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── Historique résolu — groupé par jour ── */}
          {historyGroups.length > 0 && (
            <section aria-label="Historique des alertes résolues">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Historique résolu</h3>
                <span className="lux-chip">
                  <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
                  {history.length} résolue{history.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="lux-rule mt-2" />
              <div className="mt-3 space-y-4">
                {historyGroups.map((g) => (
                  <div key={g.label}>
                    <p className="text-xs font-semibold text-[#8fabc2]">{g.label}</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {g.items.map((a) => {
                        const meta = inventoryItemMeta(a.item);
                        return (
                          <li
                            key={a.id}
                            className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[#8fabc2]"
                          >
                            <span className="lux-dot shrink-0" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
                            <span className="font-semibold text-white">{meta.label}</span>
                            <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${INVENTORY_STATUS_META[a.status]?.className ?? INVENTORY_STATUS_META.low.className}`}>
                              {INVENTORY_STATUS_META[a.status]?.short ?? a.status}
                            </span>
                            <span>
                              {a.reportedBy ?? 'Équipe'} · signalé {formatFrDateTime(a.createdAt)}
                            </span>
                            {a.note ? <span className="text-[#d5def0]">« {a.note.slice(0, 120)} »</span> : null}
                            <span className="ml-auto flex items-center gap-1.5">
                              <span aria-hidden="true" className="font-semibold text-[#34d399]">✓</span>
                              résolue {a.resolvedAt ? formatFrDateTime(a.resolvedAt) : '—'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </motion.div>
  );
}
