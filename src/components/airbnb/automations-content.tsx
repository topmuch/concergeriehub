'use client';

// =============================================================
// AutomationsContent — ÉTAPE 13 V2
// Une carte par bien : les 7 règles du catalogue avec Switch.
// Seuls OWNER/MANAGER pilotent les règles (contrôle serveur).
// =============================================================
import { useCallback, useEffect, useState } from 'react';
import { RefreshCcw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { automationMeta, relativeFrTime } from '@/lib/automations';

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
      <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="max-w-4xl mx-auto w-full px-4 py-8">
        <Card className="border-red-200">
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----- Vide : aucun bien pilotable -----
  if (groups.length === 0) {
    return (
      <div className="max-w-4xl mx-auto w-full px-4 py-8">
        <Card>
          <CardContent className="p-10 text-center space-y-2">
            <p className="text-3xl" aria-hidden="true">
              ⚡
            </p>
            <p className="text-sm font-bold text-slate-900">Aucune automatisation à piloter</p>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Les automatisations se règlent par bien, avec un rôle de propriétaire ou de
              gestionnaire. Créez un bien depuis le dashboard ou rejoignez une équipe.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----- Contenu -----
  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-6 sm:py-8 space-y-6">
      {/* En-tête */}
      <header className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <Zap className="h-6 w-6 text-amber-500" aria-hidden="true" />
          Automatisations
        </h1>
        <p className="text-sm text-slate-500">
          Laissez la plateforme prévenir votre équipe : réservations, ménages, arrivées, départs et
          réclamations techniques. Les rappels du jour sont évalués à chaque ouverture du dashboard.
        </p>
      </header>

      {/* Une carte par bien */}
      {groups.map((group) => (
        <Card key={group.property.id} className="overflow-hidden">
          <CardHeader className="pb-3 pt-5 px-5 bg-white border-b border-slate-100">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between gap-2">
              <span className="truncate">🏠 {group.property.name}</span>
              <span className="text-xs font-semibold text-slate-400 shrink-0">
                {group.rules.filter((r) => r.isActive).length}/{group.rules.length} actives
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul role="list" className="divide-y divide-slate-50">
              {group.rules.map((rule) => {
                const meta = automationMeta(rule.key);
                const saving = savingIds.has(rule.id);
                return (
                  <li
                    key={rule.id}
                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50/60 transition-colors"
                  >
                    <span aria-hidden="true" className="text-lg leading-6 shrink-0 mt-0.5">
                      {meta?.emoji ?? '⚡'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {meta?.label ?? rule.key}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{meta?.description ?? ''}</p>
                      {rule.isActive && rule.lastRunAt && (
                        <p className="text-[11px] text-slate-400 mt-1">
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
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-slate-400 pb-4">
        💡 Astuce conciergerie : activez « Ménage à planifier » et « Départ du jour » pour que votre
        équipe de ménage reçoive tout, sans vous solliciter.
      </p>
    </div>
  );
}
