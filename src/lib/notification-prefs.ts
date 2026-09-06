// =============================================================
// Catalogue des événements notifiables du Dashboard Client
// (page Paramètres → onglet Notifications). Utilisé côté serveur
// (validation PUT /api/airbnb/notifications/prefs) et côté client
// (rendu des switches). Une clé absente des préférences stockées
// = comportement par défaut (défini ici).
// =============================================================

export interface NotificationEventMeta {
  key: string;
  emoji: string;
  label: string;
  description: string;
  defaultEmail: boolean;
  defaultPush: boolean;
}

export const NOTIFICATION_EVENTS: NotificationEventMeta[] = [
  {
    key: 'booking_created',
    emoji: '📅',
    label: 'Nouvelle réservation',
    description: 'Un séjour est ajouté au planning (manuel, OTA ou iCal).',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'checkin_today',
    emoji: '🔑',
    label: 'Arrivée du jour',
    description: 'Un invité arrive aujourd’hui — rappel matin.',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'checkout_today',
    emoji: '🧳',
    label: 'Départ du jour',
    description: 'Un invité part aujourd’hui — rappel ménage.',
    defaultEmail: true,
    defaultPush: false,
  },
  {
    key: 'new_order',
    emoji: '💰',
    label: 'Nouvelle commande invité',
    description: 'Un invité commande un service (Morning Box, transfert…).',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'guest_message',
    emoji: '🎙️',
    label: 'Message vocal invité',
    description: 'Un invité laisse un message via la plaque QR.',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'cleaning_done',
    emoji: '🧹',
    label: 'Ménage terminé',
    description: 'Un membre de l’équipe clôture le ménage d’un départ.',
    defaultEmail: true,
    defaultPush: false,
  },
  {
    key: 'maintenance_alert',
    emoji: '🔧',
    label: 'Réclamation technique',
    description: 'Un problème technique est signalé sur un bien.',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'team_updates',
    emoji: '👥',
    label: 'Équipe & invitations',
    description: 'Invitation acceptée, nouveau membre, changements de rôle.',
    defaultEmail: true,
    defaultPush: false,
  },
];

export interface NotificationPref {
  email: boolean;
  push: boolean;
}

export type NotificationPrefsMap = Record<string, NotificationPref>;

/** Préférences effectives : stockées, complétées par les défauts. */
export function effectivePrefs(
  stored: NotificationPrefsMap | null | undefined,
): NotificationPrefsMap {
  const out: NotificationPrefsMap = {};
  for (const ev of NOTIFICATION_EVENTS) {
    const s = stored?.[ev.key];
    out[ev.key] = {
      email: s?.email ?? ev.defaultEmail,
      push: s?.push ?? ev.defaultPush,
    };
  }
  return out;
}

/** Valide et normalise un payload PUT (clés inconnues rejetées). */
export function sanitizePrefsInput(
  input: unknown,
): { ok: true; prefs: NotificationPrefsMap } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Préférences invalides.' };
  }
  const known = new Set(NOTIFICATION_EVENTS.map((e) => e.key));
  const raw = input as Record<string, unknown>;
  const out: NotificationPrefsMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key)) continue;
    if (typeof value !== 'object' || value === null) continue;
    const v = value as Record<string, unknown>;
    out[key] = { email: Boolean(v.email), push: Boolean(v.push) };
  }
  return { ok: true, prefs: out };
}
