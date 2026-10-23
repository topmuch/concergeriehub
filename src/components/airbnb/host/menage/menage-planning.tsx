'use client';

// =============================================================
// PLANNING — onglet 1 du module « Ménage & Stock » (/airbnb/menage)
// Interventions PLANIFIÉES groupées par jour et heure :
//   • 4 compteurs KPI (fonds pleins, sans icônes) ;
//   • groupes « Aujourd'hui / Demain / date complète » (asc) ;
//   • carte intervention : créneau, bien, invité sortant, statut,
//     assignation, note + actions (Démarrer / Fait / Reporter / Rouvrir) ;
//   • création d'intervention (formulaire repliable) ;
//   • lien « Rapport photo disponible » vers l'onglet Journal.
// Les tâches DONE de plus de 7 jours n'apparaissent pas ici (Journal).
// =============================================================
import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LuxBusyDot, LUX_FIELD, LUX_GHOST_BTN } from './menage-ui';
import type { HousekeepingTask, TeamMember } from './types';
import {
  addDays,
  dayKey,
  formatFrDateTime,
  formatFrDay,
  formatFrTime,
  fromDatetimeLocalValue,
  isTaskLate,
  startOfToday,
  taskDisplayEnd,
  taskDisplayStart,
  taskStatusMeta,
  toDatetimeLocalValue,
} from './menage-utils';

interface MenagePlanningProps {
  tasks: HousekeepingTask[];
  members: TeamMember[];
  /** GET /api/airbnb/menage/tasks en échec → état vide avec réessai. */
  error: boolean;
  readOnly: boolean;
  /** Id du bien pour la création (null en vue « toutes » → bouton masqué). */
  createPropertyId: string | null;
  onReload: () => void;
  onGoToJournal: () => void;
}

interface DayGroup {
  key: string;
  label: string;
  sublabel: string | null;
  tasks: HousekeepingTask[];
}

// ── Compteurs KPI — fonds colorés pleins, encre sombre, zéro icône ──
const KPI_TONES = {
  gold: { bg: '#e9c47c', ink: '#241a05' },
  coral: { bg: '#f07d6a', ink: '#2b0d07' },
  teal: { bg: '#2dd4bf', ink: '#04211d' },
  green: { bg: '#34d399', ink: '#04211a' },
} as const;

function PlanningKpi({ label, value, tone }: { label: string; value: number; tone: keyof typeof KPI_TONES }) {
  const t = KPI_TONES[tone];
  return (
    <div
      className="rounded-2xl px-4 py-3.5 shadow-[0_16px_34px_-20px_rgba(2,6,18,0.9)]"
      style={{ backgroundColor: t.bg, color: t.ink }}
    >
      <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] opacity-80">{label}</p>
      <p className="lux-num mt-1 text-3xl font-semibold leading-none">{value}</p>
    </div>
  );
}

// ── Pastille de statut ──
function StatusChip({ task }: { task: HousekeepingTask }) {
  const meta = taskStatusMeta(task);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide',
        meta.chipClass,
      )}
    >
      <span className="lux-dot" style={{ backgroundColor: meta.color }} aria-hidden="true" />
      {meta.label.toUpperCase()}
    </span>
  );
}

export function MenagePlanning({
  tasks,
  members,
  error,
  readOnly,
  createPropertyId,
  onReload,
  onGoToJournal,
}: MenagePlanningProps) {
  const [actingId, setActingId] = useState<string | null>(null);
  const [postponeId, setPostponeId] = useState<string | null>(null);
  const [postponeValue, setPostponeValue] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ start: '', end: '', assigneeId: '', note: '' });

  // « now » recalculé à chaque rechargement (polling 45 s) — évite un timer.
  const now = useMemo(() => new Date(), [tasks]);
  const today = useMemo(() => startOfToday(), [tasks]);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);

  // ── Compteurs KPI ──
  const kpis = useMemo(() => {
    const nowMs = now.getTime();
    const in7 = nowMs + 7 * 24 * 3600 * 1000;
    const sevenDaysAgo = addDays(today, -7).getTime();
    let todayCount = 0;
    let late = 0;
    let upcoming = 0;
    let doneRecent = 0;
    for (const t of tasks) {
      if (t.status !== 'DONE' && dayKey(new Date(t.scheduledAt)) === dayKey(now)) todayCount += 1;
      if (isTaskLate(t, now)) late += 1;
      const sched = new Date(t.scheduledAt).getTime();
      if (t.status !== 'DONE' && sched >= nowMs && sched <= in7) upcoming += 1;
      if (t.status === 'DONE') {
        const stamp = new Date(t.endedAt ?? t.scheduledAt).getTime();
        if (stamp >= sevenDaysAgo) doneRecent += 1;
      }
    }
    return { todayCount, late, upcoming, doneRecent };
  }, [tasks, now, today]);

  // ── Groupes par jour (asc) — DONE archivé (> 7 j) exclu du planning ──
  const groups = useMemo<DayGroup[]>(() => {
    const cutoff = addDays(today, -7).getTime();
    const visible = tasks.filter((t) => {
      if (t.status === 'DONE') {
        return new Date(t.endedAt ?? t.scheduledAt).getTime() >= cutoff;
      }
      return true;
    });
    const map = new Map<string, DayGroup>();
    for (const t of visible) {
      const d = new Date(t.scheduledAt);
      const key = dayKey(d);
      let g = map.get(key);
      if (!g) {
        const isToday = key === dayKey(now);
        const isTomorrow = key === dayKey(tomorrow);
        g = {
          key,
          label: isToday ? 'Aujourd’hui' : isTomorrow ? 'Demain' : formatFrDay(d),
          sublabel: isToday || isTomorrow ? formatFrDay(d) : null,
          tasks: [],
        };
        map.set(key, g);
      }
      g.tasks.push(t);
    }
    for (const g of map.values()) {
      g.tasks.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [tasks, today, tomorrow, now]);

  // ── Mutation générique + rechargement discret ──
  const patchTask = useCallback(
    async (taskId: string, body: Record<string, unknown>, successMsg: string) => {
      setActingId(taskId);
      try {
        const res = await fetch('/api/airbnb/menage/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, ...body }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast.error(json.error ?? 'Action impossible. Réessayez.');
          return;
        }
        toast.success(successMsg);
        onReload();
      } catch {
        toast.error('Erreur réseau. Réessayez dans un instant.');
      } finally {
        setActingId(null);
      }
    },
    [onReload],
  );

  const submitPostpone = useCallback(
    async (task: HousekeepingTask) => {
      const iso = fromDatetimeLocalValue(postponeValue);
      if (!iso) {
        toast.error('Choisissez la nouvelle date et l’heure de l’intervention.');
        return;
      }
      // Si la tâche avait une fin planifiée, on décale la même durée
      // (envoyée uniquement si elle reste après le nouveau début).
      const body: Record<string, unknown> = { action: 'postpone', scheduledAt: iso };
      if (task.scheduledEndAt) {
        const duration =
          new Date(task.scheduledEndAt).getTime() - new Date(task.scheduledAt).getTime();
        const newEnd = new Date(new Date(iso).getTime() + duration);
        if (newEnd.getTime() > new Date(iso).getTime()) {
          body.scheduledEndAt = newEnd.toISOString();
        }
      }
      await patchTask(task.id, body, `Intervention reportée au ${formatFrDateTime(iso)}.`);
      setPostponeId(null);
      setPostponeValue('');
    },
    [postponeValue, patchTask],
  );

  const submitAssign = useCallback(
    async (task: HousekeepingTask, assigneeId: string) => {
      const member = members.find((m) => m.id === assigneeId) ?? null;
      await patchTask(
        task.id,
        { action: 'assign', assigneeId: assigneeId || null },
        member ? `Intervention assignée à ${member.name}.` : 'Assignation retirée.',
      );
    },
    [members, patchTask],
  );

  const createTask = useCallback(async () => {
    if (!createPropertyId) return;
    const startIso = fromDatetimeLocalValue(form.start);
    if (!startIso) {
      toast.error('Choisissez la date et l’heure de l’intervention.');
      return;
    }
    const endIso = fromDatetimeLocalValue(form.end);
    if (endIso && new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      toast.error('L’heure de fin doit être après l’heure de début.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/airbnb/menage/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: createPropertyId,
          scheduledAt: startIso,
          ...(endIso ? { scheduledEndAt: endIso } : {}),
          ...(form.assigneeId ? { assigneeId: form.assigneeId } : {}),
          ...(form.note.trim() ? { note: form.note.trim() } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? 'Planification impossible. Réessayez.');
        return;
      }
      toast.success('Intervention planifiée.');
      setForm({ start: '', end: '', assigneeId: '', note: '' });
      setFormOpen(false);
      onReload();
    } catch {
      toast.error('Erreur réseau. Réessayez dans un instant.');
    } finally {
      setCreating(false);
    }
  }, [createPropertyId, form, onReload]);

  // ── États d'affichage ──
  if (error) {
    return (
      <div className="lux-empty flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
        <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
        <p className="text-sm font-semibold text-white">Planning indisponible pour le moment</p>
        <p className="max-w-md text-xs text-[#8fabc2]">
          Impossible de charger les interventions planifiées. Vos preuves de ménage restent
          accessibles dans l’onglet Journal.
        </p>
        <button type="button" className="lux-btn mt-1" onClick={onReload}>
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Compteurs KPI ── */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" aria-label="Compteurs du planning">
        <PlanningKpi label="Aujourd’hui" value={kpis.todayCount} tone="gold" />
        <PlanningKpi label="En retard" value={kpis.late} tone="coral" />
        <PlanningKpi label="À venir 7 j" value={kpis.upcoming} tone="teal" />
        <PlanningKpi label="Terminés" value={kpis.doneRecent} tone="green" />
      </div>

      {/* ── Barre d'actions : nouvelle intervention ── */}
      {!readOnly && createPropertyId && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="lux-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/60"
            onClick={() => setFormOpen((o) => !o)}
            aria-expanded={formOpen}
          >
            {formOpen ? 'Annuler' : 'Nouvelle intervention'}
          </button>
          {!formOpen && (
            <span className="text-xs text-[#8fabc2]">
              Planifiez un passage pour votre équipe — elle le voit dans le Hub.
            </span>
          )}
        </div>
      )}

      {formOpen && createPropertyId && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="lux-card p-4 sm:p-5"
          aria-label="Planifier une intervention"
        >
          <p className="lux-eyebrow">Nouveau passage</p>
          <h2 className="lux-display mt-1 text-lg text-white">Planifier une intervention</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#8fabc2]">
              Début — obligatoire
              <Input
                type="datetime-local"
                value={form.start}
                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                className={cn('h-10 [color-scheme:dark]', LUX_FIELD)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#8fabc2]">
              Fin prévue — optionnelle
              <Input
                type="datetime-local"
                value={form.end}
                onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                className={cn('h-10 [color-scheme:dark]', LUX_FIELD)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#8fabc2]">
              Assignée à — optionnel
              <select
                value={form.assigneeId}
                onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                className="h-10 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/50"
              >
                <option value="">Non assignée</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#8fabc2]">
              Note pour l’équipe — optionnelle
              <Input
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                maxLength={300}
                placeholder="Ex. : prévoir un séchage, draps dans le placard…"
                className={cn('h-10', LUX_FIELD)}
              />
            </label>
          </div>
          <div className="mt-4">
            <button
              type="button"
              className="lux-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/60 disabled:pointer-events-none disabled:opacity-60"
              onClick={() => void createTask()}
              disabled={creating}
            >
              {creating && <LuxBusyDot />}
              Planifier l’intervention
            </button>
          </div>
        </motion.section>
      )}

      {/* ── Groupes par jour ── */}
      {groups.length === 0 ? (
        <div className="lux-empty flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
          <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
          <p className="text-sm font-semibold text-white">Aucune intervention planifiée</p>
          <p className="max-w-md text-xs text-[#8fabc2]">
            {readOnly
              ? 'Créez des interventions depuis un bien précis (barre du haut) — elles apparaîtront ici, classées par jour et heure.'
              : 'Planifiez votre premier passage avec « Nouvelle intervention » — l’historique des passages réalisés vit dans l’onglet Journal.'}
          </p>
        </div>
      ) : (
        groups.map((g, gi) => (
          <motion.section
            key={g.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut', delay: Math.min(gi * 0.04, 0.2) }}
            aria-label={g.sublabel ?? g.label}
          >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">{g.label}</h3>
              {g.sublabel && <span className="text-xs text-[#8fabc2]">— {g.sublabel}</span>}
              <span className="lux-chip">
                {g.tasks.length} intervention{g.tasks.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="lux-rule mt-2" />
            <ul className="mt-3 space-y-3">
              {g.tasks.map((task) => {
                const start = taskDisplayStart(task);
                const end = taskDisplayEnd(task);
                const busy = actingId === task.id;
                const openPostpone = postponeId === task.id;
                const hasReport = !!task.reportId && task.status === 'DONE';
                return (
                  <li
                    key={task.id}
                    className={cn(
                      'lux-card p-4 sm:p-5',
                      taskStatusMeta(task).key === 'late' && 'border-[#f07d6a]/35 bg-[#f07d6a]/[0.06]',
                    )}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      {/* Créneau — le héros de la carte */}
                      <div className="shrink-0 sm:w-44">
                        <p className="lux-num text-2xl font-semibold leading-tight text-white">
                          {formatFrTime(start)}
                          {end ? <span className="text-[#8fabc2]"> → {formatFrTime(end)}</span> : null}
                        </p>
                        <p className="mt-1 text-xs text-[#8fabc2]">
                          {task.startedAt ? 'Heures réelles' : 'Créneau planifié'}
                        </p>
                        <div className="mt-2">
                          <StatusChip task={task} />
                        </div>
                      </div>

                      {/* Détails */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">{task.propertyName}</p>
                        {task.guestName && (
                          <p className="mt-0.5 flex items-center gap-2 text-xs text-[#8fabc2]">
                            <span className="lux-dot shrink-0" style={{ backgroundColor: '#5cadf0' }} aria-hidden="true" />
                            Invité sortant : {task.guestName}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-[#8fabc2]">
                          Prévu le {formatFrDateTime(task.scheduledAt)}
                        </p>

                        {/* Assignation : select natif (hors lecture seule) ou texte */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-[#8fabc2]">Assignée à :</span>
                          {readOnly ? (
                            <span className="lux-chip">{task.assigneeName ?? 'Non assignée'}</span>
                          ) : (
                            <select
                              value={task.assigneeId ?? ''}
                              onChange={(e) => void submitAssign(task, e.target.value)}
                              disabled={busy}
                              aria-label={`Assignation de l’intervention ${task.propertyName} du ${formatFrDateTime(task.scheduledAt)}`}
                              className="h-9 max-w-56 rounded-full border border-white/12 bg-white/[0.04] px-3 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/50 disabled:opacity-60"
                            >
                              <option value="">Non assignée</option>
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          )}
                          {busy && <LuxBusyDot color="#2dd4bf" />}
                        </div>

                        {task.note && (
                          <p className="mt-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-[#d5def0]">
                            {task.note}
                          </p>
                        )}

                        {hasReport && (
                          <button
                            type="button"
                            onClick={onGoToJournal}
                            className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-[#2dd4bf]/30 bg-[#2dd4bf]/8 px-3 text-xs font-semibold text-[#2dd4bf] transition-colors hover:bg-[#2dd4bf]/15 hover:text-[#86e9cb]"
                          >
                            Rapport photo disponible
                            <span aria-hidden="true" className="text-[10px]">›</span>
                          </button>
                        )}

                        {/* Actions — masquées en lecture seule (« toutes ») */}
                        {!readOnly && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {task.status === 'PENDING' && (
                              <Button
                                type="button"
                                size="sm"
                                className="h-9 rounded-full bg-gradient-to-br from-[#2fa77a] to-[#1c6e52] px-4 text-xs font-semibold text-white shadow-[0_10px_28px_-12px_rgba(47,167,122,0.55)] hover:from-[#3ec292] hover:to-[#23815f]"
                                disabled={busy}
                                onClick={() => void patchTask(task.id, { action: 'start' }, 'Intervention démarrée — l’équipe est sur le coup.')}
                              >
                                {busy && <LuxBusyDot />}
                                Démarrer
                              </Button>
                            )}
                            {task.status !== 'DONE' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className={cn('h-9 rounded-full px-4 text-xs', LUX_GHOST_BTN)}
                                disabled={busy}
                                onClick={() => void patchTask(task.id, { action: 'done' }, 'Intervention marquée faite ✓')}
                              >
                                Marquer fait
                              </Button>
                            )}
                            {task.status !== 'DONE' && !openPostpone && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className={cn('h-9 rounded-full px-4 text-xs', LUX_GHOST_BTN)}
                                disabled={busy}
                                onClick={() => {
                                  setPostponeId(task.id);
                                  setPostponeValue(toDatetimeLocalValue(task.scheduledAt));
                                }}
                              >
                                Reporter
                              </Button>
                            )}
                            {task.status === 'DONE' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className={cn('h-9 rounded-full px-4 text-xs', LUX_GHOST_BTN)}
                                disabled={busy}
                                onClick={() => void patchTask(task.id, { action: 'reopen' }, 'Intervention réouverte.')}
                              >
                                Rouvrir
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Reporter — saisie repliée */}
                        {openPostpone && !readOnly && (
                          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-[#e9c47c]/25 bg-[#e9c47c]/8 p-3">
                            <label className="flex min-w-52 flex-col gap-1 text-xs font-semibold text-[#f3d795]">
                              Nouveau créneau
                              <Input
                                type="datetime-local"
                                value={postponeValue}
                                onChange={(e) => setPostponeValue(e.target.value)}
                                className={cn('h-10 [color-scheme:dark]', LUX_FIELD)}
                              />
                            </label>
                            <Button
                              type="button"
                              size="sm"
                              className="h-10 rounded-full bg-gradient-to-br from-[#e9c47c] to-[#b78a3d] px-4 text-xs font-semibold text-[#1a1206] hover:from-[#f3d795] hover:to-[#c99a4b]"
                              disabled={busy}
                              onClick={() => void submitPostpone(task)}
                            >
                              {busy && <LuxBusyDot color="#1a1206" />}
                              Confirmer
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={cn('h-10 rounded-full px-4 text-xs', LUX_GHOST_BTN)}
                              onClick={() => {
                                setPostponeId(null);
                                setPostponeValue('');
                              }}
                            >
                              Annuler
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.section>
        ))
      )}
    </div>
  );
}

/** Squelette de chargement du planning (premier rendu). */
export function PlanningSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Chargement du planning">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {['a', 'b', 'c', 'd'].map((k) => (
          <Skeleton key={k} className="h-20 rounded-2xl bg-white/8" />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-2xl bg-white/8" />
      <Skeleton className="h-40 w-full rounded-2xl bg-white/8" />
    </div>
  );
}
