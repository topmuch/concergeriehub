'use client';

// =============================================================
// AutomationsContent — ÉTAPE 13 V2
// v4.60 « AIRBNB PRO » — refonte visuelle (logique intacte) :
// • Une carte par bien : air-shadow rounded-2xl token-based
// • Règles air-hoverlift avec bulle d'icône dégradée par trigger
//   (kpi-bubble-{tone}) — Switch inchangé
// • Empty state .air-empty ⚡, erreur ⚠️ + CTA air-gradient
// Seuls OWNER/MANAGER pilotent les règles (contrôle serveur).
// =============================================================
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCcw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { automationMeta, relativeFrTime } from '@/lib/automations';
import type { KPITone } from '@/components/airbnb/host/kpi-card';
import { cn } from '@/lib/utils';

interface AutomationRuleDto {
  id: string;
  propertyId: string;
  key: string;
  trigger: string;
  action: string;
  isActive: boolean;
  lastRunAt: string | null;
}

interface AutomationGroup {
  property: { id: string; name: string };
  canManage: boolean;
  rules: AutomationRuleDto[];
}

/** Tonalité de la bulle d'icône, par trigger (fallback rausch). */
const TRIGGER_TONES: Record<string, KPITone> = {
  BOOKING_CREATED: 'violet',
  CLEANING_DONE: 'teal',
  CHECK_IN_TODAY: 'amber',
  CHECK_OUT_TODAY: 'orange',
  MAINTENANCE_REQUESTED: 'rausch',
  MEMBER_ACCEPTED: 'emerald',
  ORDER_CREATED: 'emerald',
  REVIEW_SHIELD_TODAY: 'rausch',
  CHECK_IN_J3: 'amber',
  CHECK_OUT_J1: 'orange',
};

export function AutomationsContent() {
  const [groups, setGroups] = useState<AutomationGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/airbnb/automations', { cache: 'no-store' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Impossible de charger les automatisations.');
        setGroups([]);
        return;
      }
      const data = (await res.json()) as { automations: AutomationGroup[] };
      setGroups(data.automations);
    } catch {
      setError('Erreur réseau — réessayez.');
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleRule = async (group: AutomationGroup, rule: AutomationRuleDto, next: boolean) => {
    if (!group.canManage) return;
    // Optimiste
    setGroups((prev) =>
      prev
        ? prev.map((g) =>
            g.property.id === group.property.id
              ? {
                  ...g,
                  rules: g.rules.map((r) => (r.id === rule.id ? { ...r, isActive: next } : r)),
                }
              : g,
          )
        : prev,
    );
    setSavingIds((prev) => new Set(prev).add(rule.id));
    try {
      const res = await fetch(`/api/airbnb/automations?ruleId=${encodeURIComponent(rule.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Échec de la mise à jour.');
      }
      toast.success(
        next
          ? `Automatisation activée : ${automationMeta(rule.key)?.label ?? rule.key}`
          : `Automatisation désactivée : ${automationMeta(rule.key)?.label ?? rule.key}`,
      );
    } catch (err) {
      // Rollback
      setGroups((prev) =>
        prev
          ? prev.map((g) =>
              g.property.id === group.property.id
                ? {
                    ...g,
                    rules: g.rules.map((r) =>
                      r.id === rule.id ? { ...r, isActive: !next } : r,
                    ),
                  }
                : g,
            )
          : prev,
      );
      toast.error(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setSavingIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(rule.id);
        return nextSet;
      });
    }
  };

  // ----- États de chargement / erreur -----
  if (groups === null) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8" aria-busy="true" aria-label="Chargement des automatisations">
        <Skeleton className="h-9 w-72 rounded-full" aria-hidden="true" />
        <Skeleton className="h-44 w-full rounded-2xl" aria-hidden="true" />
        <Skeleton className="h-44 w-full rounded-2xl" aria-hidden="true" />
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="air-empty flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
          <span aria-hidden="true" className="air-float text-3xl">⚠️</span>
          <p className="text-sm font-semibold text-foreground">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="air-gradient inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-bold text-white shadow transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066EF]/50"
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // ----- Vide : aucun bien pilotable -----
  if (groups.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="air-empty flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
          <span aria-hidden="true" className="air-float text-3xl">⚡</span>
          <p className="text-sm font-semibold text-foreground">Aucune automatisation à piloter</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Les automatisations se règlent par bien, avec un rôle de propriétaire ou de
            gestionnaire. Créez un bien depuis le dashboard ou rejoignez une équipe.
          </p>
        </div>
      </div>
    );
  }

  // ----- Contenu -----
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:py-8">
      {/* En-tête */}
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="kpi-bubble-amber flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow"
          >
            <Zap className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Automatisations</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Laissez la plateforme prévenir votre équipe : réservations, ménages, arrivées, départs et
          réclamations techniques. Les rappels du jour sont évalués à chaque ouverture du dashboard.
        </p>
      </header>

      {/* Une carte par bien */}
      {groups.map((group, gi) => (
        <motion.section
          key={group.property.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * gi, duration: 0.3, ease: 'easeOut' }}
          className="air-shadow overflow-hidden rounded-2xl border border-border bg-card"
          aria-label={`Automatisations — ${group.property.name}`}
        >
          {/* En-tête du bien */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-base"
              >
                🏠
              </span>
              <h2 className="truncate text-sm font-bold text-foreground sm:text-base">
                {group.property.name}
              </h2>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
              {group.rules.filter((r) => r.isActive).length}/{group.rules.length} actives
            </span>
          </div>

          {/* Règles du bien */}
          <ul role="list" className="divide-y divide-border">
            {group.rules.map((rule) => {
              const meta = automationMeta(rule.key);
              const saving = savingIds.has(rule.id);
              return (
                <li
                  key={rule.id}
                  className="air-hoverlift flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-white shadow',
                      `kpi-bubble-${TRIGGER_TONES[rule.trigger] ?? 'rausch'}`,
                    )}
                  >
                    {meta?.emoji ?? '⚡'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {meta?.label ?? rule.key}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{meta?.description ?? ''}</p>
                    {rule.isActive && rule.lastRunAt && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Dernier déclenchement : {relativeFrTime(rule.lastRunAt)}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={rule.isActive}
                    disabled={saving || !group.canManage}
                    onCheckedChange={(next) => void toggleRule(group, rule, next)}
                    aria-label={`${meta?.label ?? rule.key} — ${rule.isActive ? 'désactiver' : 'activer'}`}
                  />
                </li>
              );
            })}
          </ul>
        </motion.section>
      ))}

      <p className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        💡 Astuce conciergerie : activez « Ménage à planifier » et « Départ du jour » pour que votre
        équipe de ménage reçoive tout, sans vous solliciter.
      </p>
    </div>
  );
}
