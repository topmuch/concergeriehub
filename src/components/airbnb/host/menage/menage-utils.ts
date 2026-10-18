// =============================================================
// UTILITAIRES PARTAGÉS — module « Ménage & Stock » (/airbnb/menage)
// Formatage fr-FR (fuseau local navigateur, comme le code existant),
// groupement par jour, statuts des interventions planifiées.
// =============================================================
import type { HousekeepingTask } from './types';

// ----- Formatage dates & heures (fr-FR) -----

/** « 16/10/2025 14:30 » — horodatage complet compact. */
export function formatFrDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** « 14:30 » — heure locale seule. */
export function formatFrTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const DAY_FMT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** « jeudi 16 octobre » — libellé de jour (minuscules, style fr). */
export function formatFrDay(date: Date): string {
  return DAY_FMT.format(date);
}

/** « 16 octobre » — date courte pour les titres compacts. */
export function formatFrDayShort(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(date);
}

/** Clé de jour locale « 2025-10-16 » — groupe les entrées par date. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True si les deux instants tombent le même jour LOCAL. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

/** Date d'« aujourd'hui » tronquée à minuit local. */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Décale un Date de n jours (minuit local si la base est minuit). */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** « 1 h 24 » ou « 42 min » — durée entre deux instants (null si absente/négative). */
export function formatDuration(startIso: string | null, endIso: string | null): string | null {
  if (!startIso || !endIso) return null;
  const min = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
  if (!Number.isFinite(min) || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${`${m}`.padStart(2, '0')}`;
}

/** ISO → valeur pour <input type="datetime-local"> (heure locale). */
export function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valeur <input type="datetime-local"> → ISO (null si vide/invalide). */
export function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ----- Statuts des interventions planifiées -----

export interface TaskStatusMeta {
  key: 'late' | 'pending' | 'in_progress' | 'done';
  label: string;
  /** Couleur d'accent (palette Saphir Luxe). */
  color: string;
  /** Classes de la pastille (fond teinté + liseré). */
  chipClass: string;
}

const STATUS_META: Record<TaskStatusMeta['key'], Omit<TaskStatusMeta, 'key'>> = {
  late: {
    label: 'En retard',
    color: '#f07d6a',
    chipClass: 'border-[#f07d6a]/40 bg-[#f07d6a]/12 text-[#f07d6a]',
  },
  pending: {
    label: 'À faire',
    color: '#fbbf24',
    chipClass: 'border-[#fbbf24]/40 bg-[#fbbf24]/12 text-[#fbbf24]',
  },
  in_progress: {
    label: 'En cours',
    color: '#2dd4bf',
    chipClass: 'border-[#2dd4bf]/40 bg-[#2dd4bf]/12 text-[#2dd4bf]',
  },
  done: {
    label: 'Fait',
    color: '#34d399',
    chipClass: 'border-[#34d399]/40 bg-[#34d399]/12 text-[#34d399]',
  },
};

/** Règle métier « EN RETARD » : PENDING avec fin de créneau dépassée,
 *  ou PENDING dont le début dépasse de plus de 2 h sans fin connue. */
export function isTaskLate(task: HousekeepingTask, now: Date = new Date()): boolean {
  if (task.status !== 'PENDING') return false;
  const nowMs = now.getTime();
  if (task.scheduledEndAt) {
    return new Date(task.scheduledEndAt).getTime() < nowMs;
  }
  return nowMs - new Date(task.scheduledAt).getTime() > 2 * 60 * 60 * 1000;
}

/** Métadonnées d'affichage du statut d'une tâche (à l'instant « now »). */
export function taskStatusMeta(task: HousekeepingTask, now: Date = new Date()): TaskStatusMeta {
  if (task.status === 'DONE') return { key: 'done', ...STATUS_META.done };
  if (task.status === 'IN_PROGRESS') return { key: 'in_progress', ...STATUS_META.in_progress };
  if (isTaskLate(task, now)) return { key: 'late', ...STATUS_META.late };
  return { key: 'pending', ...STATUS_META.pending };
}

/** Heure de début affichée sur la carte planning : réelle si démarrée,
 *  sinon créneau planifié (les ISO UTC sont rendus en heure locale). */
export function taskDisplayStart(task: HousekeepingTask): string {
  return task.startedAt ?? task.scheduledAt;
}

/** Heure de fin affichée : réelle si terminée, sinon fin de créneau. */
export function taskDisplayEnd(task: HousekeepingTask): string | null {
  return task.endedAt ?? task.scheduledEndAt;
}
