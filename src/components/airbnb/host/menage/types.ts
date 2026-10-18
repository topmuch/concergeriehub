// =============================================================
// TYPES PARTAGÉS — module « Ménage & Stock » (/airbnb/menage)
// v6.0 — refonte en 5 onglets (Planning / Journal / Stock /
// Demandes / Réglages). Contrats API centralisés ici pour éviter
// les doublons entre les sous-composants menage/*.
// =============================================================

// ----- GET /api/airbnb/menage (source existante, inchangée) -----
export interface ChecklistInfo {
  source: 'default' | 'custom';
  items: string[];
}
export interface HostNoteInfo {
  propertyId: string;
  propertyName: string | null;
  audioUrl: string;
  source: string;
  text: string | null;
  durationSec: number;
  updatedAt: string;
}
export interface MenageReport {
  id: string;
  propertyId: string;
  propertyName: string | null;
  staffName: string | null;
  checklist: { label: string; done: boolean }[];
  coverPhoto: string | null;
  photoCount: number;
  hasVoice: boolean;
  voiceDurationSec: number;
  voiceUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}
export interface MenageData {
  properties: { id: string; name: string }[];
  focusPropertyId: string | null;
  checklist: ChecklistInfo;
  customChecklist: string[] | null;
  hostNote: HostNoteInfo | null;
  reports: MenageReport[];
}

// ----- GET/POST/PATCH /api/airbnb/menage/tasks (nouveau backend) -----
export type HousekeepingTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE';

/** Intervention de ménage PLANIFIÉE (contrat 6-a — backend parallèle). */
export interface HousekeepingTask {
  id: string;
  propertyId: string;
  propertyName: string;
  bookingId: string | null;
  guestName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  scheduledAt: string;
  scheduledEndAt: string | null;
  status: HousekeepingTaskStatus;
  startedAt: string | null;
  endedAt: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  reportId: string | null;
  note: string | null;
  createdAt: string;
}
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}
export interface HousekeepingTasksData {
  tasks: HousekeepingTask[];
  members: TeamMember[];
  serverTime: string;
}

// ----- Entrée fusionnée du JOURNAL (tâches DONE × rapports) -----
/** Une entrée d'historique : soit une tâche DONE (avec ou sans
 *  rapport de ménage lié), soit un rapport legacy sans tâche. */
export interface JournalEntry {
  /** id stable pour React (tâche ou rapport). */
  key: string;
  /** id du rapport de ménage s'il existe (photos, checklist, vocal). */
  reportId: string | null;
  report: MenageReport | null;
  task: HousekeepingTask | null;
  /** Heures RÉELLES affichées : rapport > tâche > créneau planifié. */
  startIso: string | null;
  endIso: string | null;
  /** Instant de classement (fin de passage) pour le tri/jour. */
  sortIso: string;
  /** Nom affiché de l'agent : assigneeName puis staffName. */
  agentName: string | null;
  propertyName: string | null;
}

// ----- Alertes stock (GET/PATCH /api/airbnb/properties/[id]/inventory-alerts) -----
export interface InventoryAlertApi {
  id: string;
  bookingId: string | null;
  item: string;
  itemLabel: string;
  itemEmoji: string;
  status: string;
  reportedBy: string | null;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

// ----- Demandes particulières (GET/PATCH /api/airbnb/special-requests) -----
export interface SpecialRequestApi {
  id: string;
  propertyId: string;
  propertyName: string | null;
  guestName: string | null;
  itemType: string;
  itemLabel: string;
  itemEmoji: string;
  quantity: number;
  note: string | null;
  status: string;
  statusLabel: string;
  source: string;
  requestedAt: string;
  handledAt: string | null;
}

// ----- États des lieux de sortie (GET/PATCH /api/airbnb/checkout-inspections) -----
export interface CheckoutInspectionApi {
  id: string;
  propertyId: string;
  propertyName: string | null;
  guestName: string;
  hasDamages: boolean;
  damagedRooms: string[];
  dirtyRooms: string[];
  selfAssessment: number;
  status: string;
  signedAt: string;
  createdAt: string;
  publicUrl: string;
}
