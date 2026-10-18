'use client';

// =============================================================
// MenageContent — ONGLET MÉNAGE du Dashboard Client (/airbnb/menage)
// v6.0 « REFONTE 5 ONGLETS » (demande client : l'ancienne colonne de
// 6 cartes était « fouillis », photos cachées, pas de planning) :
//
//   1. PLANNING   — interventions planifiées (nouveau backend
//                   /api/airbnb/menage/tasks), groupées par jour/heure,
//                   compteurs KPI, actions (Démarrer/Fait/Reporter/
//                   Rouvrir/Assigner), création d'intervention ;
//   2. JOURNAL    — historique horodaté (tâches DONE × rapports de
//                   ménage + historique legacy) : heures réelles,
//                   durée, TOUTES les photos en galerie + lightbox,
//                   vocal de l'équipe, PDF en 1 clic, états des lieux
//                   de sortie en bas ;
//   3. STOCK      — alertes stock ouvertes + historique par jour ;
//   4. DEMANDES   — demandes particulières des invités (Hub) ;
//   5. RÉGLAGES   — checklist de nettoyage + consigne vocale.
//
// Style « SAPHIR LUXE » inchangé, SANS ICÔNES : typographie (lux-*),
// points colorés .lux-dot et glyphes purs (✓ ▾ ‹ › ×).
// Le composant charge les DEUX sources (menage + tasks) avec le
// polling 45 s hérité, suit le sélecteur de bien du shell
// (HostContext) et passe en lecture seule en « Toutes les propriétés »
// pour ce qui exige un bien précis (actions, création, stock, config).
// =============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { DEFAULT_CLEANING_CHECKLIST } from '@/lib/housekeeping';
import { cn } from '@/lib/utils';
import { MenagePlanning, PlanningSkeleton } from './menage/menage-planning';
import { MenageJournal } from './menage/menage-journal';
import { MenageStock } from './menage/menage-stock';
import { MenageRequests } from './menage/menage-requests';
import { MenageSettings } from './menage/menage-settings';
import { LuxBusyDot, LUX_GHOST_BTN } from './menage/menage-ui';
import { isTaskLate } from './menage/menage-utils';
import type {
  ChecklistInfo,
  HostNoteInfo,
  HousekeepingTasksData,
  MenageData,
} from './menage/types';

type TabKey = 'planning' | 'journal' | 'stock' | 'demandes' | 'reglages';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'planning', label: 'Planning' },
  { key: 'journal', label: 'Journal' },
  { key: 'stock', label: 'Stock' },
  { key: 'demandes', label: 'Demandes' },
  { key: 'reglages', label: 'Réglages' },
];

export function MenageContent() {
  const { selectedId, selectedProperty } = useHostContext();
  const scopeLabel = selectedId === 'all' ? 'Toutes les propriétés' : selectedProperty?.name ?? '';
  // Configuration (checklist + vocal), stock et actions planning :
  // possible uniquement sur un bien précis — « all » = lecture seule.
  const isAll = selectedId === 'all';

  const [data, setData] = useState<MenageData | null>(null);
  const [tasksData, setTasksData] = useState<HousekeepingTasksData | null>(null);
  const [tasksError, setTasksError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('planning');

  // ── Source 1 : configuration + preuves de ménage (existant) ──
  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'refresh') setRefreshing(true);
      try {
        const res = await fetch(`/api/airbnb/menage?propertyId=${encodeURIComponent(selectedId)}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as MenageData;
        setData(json);
      } catch {
        if (mode === 'initial') {
          setData(null);
          toast.error('Impossible de charger l’onglet Ménage. Réessayez.');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedId],
  );

  // ── Source 2 : planning des interventions (nouveau backend 6-a) ──
  const loadTasks = useCallback(
    async (mode: 'initial' | 'refresh') => {
      try {
        const res = await fetch(`/api/airbnb/menage/tasks?propertyId=${encodeURIComponent(selectedId)}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as HousekeepingTasksData;
        setTasksData(json);
        setTasksError(false);
      } catch {
        if (mode === 'initial') setTasksError(true);
        // Rafraîchissement : silencieux (données précédentes conservées).
      }
    },
    [selectedId],
  );

  // Chargement initial des deux sources en parallèle.
  useEffect(() => {
    setLoading(true);
    void load('initial');
    void loadTasks('initial');
  }, [load, loadTasks]);

  // Polling 45 s hérité — recharge discret des deux sources.
  useEffect(() => {
    const poll = setInterval(() => {
      void load('refresh');
      void loadTasks('refresh');
    }, 45_000);
    return () => clearInterval(poll);
  }, [load, loadTasks]);

  const reloadAll = useCallback(() => {
    void load('refresh');
    void loadTasks('refresh');
  }, [load, loadTasks]);

  // Compteur « En retard » pour le badge de l'onglet Planning.
  const lateCount = useMemo(
    () => (tasksData?.tasks ?? []).filter((t) => isTaskLate(t)).length,
    [tasksData],
  );

  const focusPropertyId = data?.focusPropertyId ?? null;
  const configEnabled = !isAll && !!focusPropertyId;

  // ── Handlers Réglages (mise à jour locale optimiste, comme avant) ──
  const onChecklistSaved = useCallback((c: ChecklistInfo) => {
    setData((d) => (d ? { ...d, checklist: c, customChecklist: c.source === 'custom' ? c.items : null } : d));
  }, []);
  const onNoteSaved = useCallback((note: HostNoteInfo) => {
    setData((d) => (d ? { ...d, hostNote: note } : d));
  }, []);
  const onNoteDeleted = useCallback(() => {
    setData((d) => (d ? { ...d, hostNote: null } : d));
  }, []);

  if (loading && data === null && tasksData === null) {
    return (
      <div className="flex max-w-4xl flex-col gap-6" role="status" aria-label="Chargement de l'onglet Ménage">
        <Skeleton className="h-10 w-56 rounded-full bg-white/8" />
        <PlanningSkeleton />
        <Skeleton className="h-56 w-full rounded-2xl bg-white/8" />
      </div>
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {/* ----- En-tête ----- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="lux-eyebrow">Ménage &amp; stock</p>
          <h1 className="lux-display mt-1.5 text-2xl font-semibold text-white sm:text-3xl">Ménage</h1>
          <p className="mt-1 text-sm text-[#8fa0c2]">
            Planning, preuves horodatées et organisation — {scopeLabel}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={reloadAll}
          disabled={refreshing}
          className={cn('h-9 gap-2 self-start rounded-full px-4 text-xs sm:self-auto', LUX_GHOST_BTN)}
          aria-label="Rafraîchir"
        >
          {refreshing && <LuxBusyDot />}
          Rafraîchir
        </Button>
      </div>

      {isAll && (
        <div
          className="flex items-start gap-3 rounded-2xl border border-[#e9c47c]/25 bg-[#e9c47c]/8 p-4 text-sm text-[#f3d795]"
          role="note"
        >
          <span className="lux-dot mt-2 shrink-0" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
          <p>
            Vous voyez <strong>toutes les propriétés</strong>. Le planning et le journal restent
            consultables ; sélectionnez un bien précis dans la barre du haut pour agir sur les
            interventions, gérer le stock et configurer la checklist ou le message vocal.
          </p>
        </div>
      )}

      {/* ----- Barre d'onglets (scrollable horizontalement sur mobile) ----- */}
      <div
        className="lux-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label="Sections du module Ménage & stock"
      >
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`menage-panel-${t.key}`}
              id={`menage-tab-${t.key}`}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'inline-flex h-11 min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/60',
                active
                  ? 'border-white bg-white text-[#c81e42] shadow-[0_10px_24px_-12px_rgba(255,255,255,0.35)]'
                  : 'border-white/12 bg-white/[0.04] text-[#d5def0] hover:bg-white/8 hover:text-white',
              )}
            >
              {t.label}
              {t.key === 'planning' && lateCount > 0 && (
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f07d6a] px-1.5 text-[10px] font-bold text-white"
                  aria-label={`${lateCount} intervention${lateCount > 1 ? 's' : ''} en retard`}
                >
                  {lateCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ----- Panneaux (tous montés, un seul visible — l'état local
              des onglets survit aux changements et au polling) ----- */}
      <div
        role="tabpanel"
        id="menage-panel-planning"
        aria-labelledby="menage-tab-planning"
        hidden={activeTab !== 'planning'}
      >
        {tasksData === null && !tasksError && loading ? (
          <PlanningSkeleton />
        ) : (
          <MenagePlanning
            tasks={tasksData?.tasks ?? []}
            members={tasksData?.members ?? []}
            error={tasksError && tasksData === null}
            readOnly={isAll}
            createPropertyId={isAll ? null : selectedId}
            onReload={reloadAll}
            onGoToJournal={() => setActiveTab('journal')}
          />
        )}
      </div>

      <div
        role="tabpanel"
        id="menage-panel-journal"
        aria-labelledby="menage-tab-journal"
        hidden={activeTab !== 'journal'}
      >
        <MenageJournal
          tasks={tasksData?.tasks ?? []}
          reports={data?.reports ?? []}
          selectedId={selectedId}
        />
      </div>

      <div
        role="tabpanel"
        id="menage-panel-stock"
        aria-labelledby="menage-tab-stock"
        hidden={activeTab !== 'stock'}
      >
        <MenageStock enabled={configEnabled} propertyId={focusPropertyId} />
      </div>

      <div
        role="tabpanel"
        id="menage-panel-demandes"
        aria-labelledby="menage-tab-demandes"
        hidden={activeTab !== 'demandes'}
      >
        <MenageRequests selectedId={selectedId} />
      </div>

      <div
        role="tabpanel"
        id="menage-panel-reglages"
        aria-labelledby="menage-tab-reglages"
        hidden={activeTab !== 'reglages'}
      >
        <MenageSettings
          propertyId={focusPropertyId}
          enabled={configEnabled}
          checklist={data?.checklist ?? { source: 'default', items: DEFAULT_CLEANING_CHECKLIST }}
          hostNote={data?.hostNote ?? null}
          onChecklistSaved={onChecklistSaved}
          onNoteSaved={onNoteSaved}
          onNoteDeleted={onNoteDeleted}
        />
      </div>
    </div>
  );
}
