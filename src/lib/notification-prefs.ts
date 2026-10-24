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
  // =============================================================
  // v5.21 — MESSAGE TEXTE INVITÉ (lacune d'audit) : le message ÉCRIT
  // du livre d'or du Hub (auteur + mot + note) était muet — seul le
  // vocal notifiait. Clé dédiée (le vocal garde la sienne) rendue
  // automatiquement dans Paramètres → Notifications.
  // =============================================================
  {
    key: 'guestbook_message',
    emoji: '📖',
    label: 'Message du livre d’or',
    description:
      'Un invité laisse un mot écrit (et sa note) dans le livre d’or de votre bien.',
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
  // =============================================================
  // PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — ÉTAPE 3
  // =============================================================
  {
    key: 'guest_feedback_alert',
    emoji: '🚨',
    label: 'Alerte Guest (avis négatif)',
    description: 'Un invité signale un problème via le Bouclier d’avis (1-3 ★) — alerte critique.',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'guest_feedback',
    emoji: '⭐',
    label: 'Avis privé (Bouclier d’avis)',
    description: 'Un invité laisse un avis 4-5 ★ en privé via le Bouclier d’avis.',
    defaultEmail: true,
    defaultPush: false,
  },
  {
    key: 'late_checkout_requested',
    emoji: '⏱️',
    label: 'Demande de départ tardif',
    description: 'Un invité demande un départ tardif depuis son Hub Invité.',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'guest_arrival',
    emoji: '👋',
    label: 'Premier scan du Hub',
    description: 'Un invité vient d’ouvrir son Hub Invité pour la première fois.',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'late_checkout_paid',
    emoji: '⏱️',
    label: 'Late check-out payé',
    description: 'Un invité a réglé son départ tardif via Stripe.',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'guest_departed',
    emoji: '🚪',
    label: 'Départ définitif (alerte ménage)',
    description:
      'Le voyageur a confirmé son départ depuis son Hub — alerte automatique « Vous pouvez intervenir » pour l\'équipe de ménage.',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'minibar_order',
    emoji: '🍷',
    label: 'Commande minibar',
    description: 'Un invité a déclaré et réglé sa consommation au minibar numérique.',
    defaultEmail: true,
    defaultPush: true,
  },
  // =============================================================
  // v4.46 — ACTIVITÉ DU HUB INVITÉ (email hôte : commandes & alertes)
  // =============================================================
  {
    key: 'shop_order',
    emoji: '🛍️',
    label: 'Commande boutique (Shop the Stay)',
    description: 'Un invité commande un produit de la boutique du Hub.',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'sos_logement',
    emoji: '🚨',
    label: 'SOS Logement / casse',
    description: 'Un invité signale une urgence ou un objet cassé depuis le Hub.',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'complaint_created',
    emoji: '📝',
    label: 'Signaler un problème',
    description: 'Un invité envoie une réclamation écrite (fuite, électricité, ménage…).',
    defaultEmail: true,
    defaultPush: true,
  },
  // =============================================================
  // v4.53 « OPÉRATIONS & MAINTENANCE INTELLIGENTE »
  // =============================================================
  // =============================================================
  // v4.81 (AUDIT QA) — état des lieux signé par l'invité (push critique)
  // =============================================================
  {
    key: 'checkout_inspection',
    emoji: '🧾',
    label: 'État des lieux signé',
    description: "L'invité a signé l'état des lieux d'arrivée ou de sortie (push immédiat si dégâts signalés).",
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'checkout_report',
    emoji: '📋',
    label: 'Rapport de check-out',
    description:
      'Récapitulatif automatique au départ : consommations minibar, signalements, preuve ménage horodatée.',
    defaultEmail: true,
    defaultPush: false,
  },
  {
    key: 'ready_for_arrival',
    emoji: '🔔',
    label: '« Prêt pour l’arrivée » envoyé',
    description:
      'Le ménage est validé avant l’arrivée du prochain voyageur : notification anticipée envoyée à l’invité.',
    defaultEmail: true,
    defaultPush: false,
  },
  // =============================================================
  // v4.54 « 8 AMÉLIORATIONS » — pressing + alertes stock
  // =============================================================
  {
    key: 'pressing_order',
    emoji: '👔',
    label: 'Commande pressing / blanchisserie',
    description: 'Un invité commande un service pressing (repassage, lessive, pressing à sec) depuis le Hub.',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'inventory_alert',
    emoji: '📦',
    label: 'Alerte stock (équipe ménage)',
    description:
      'L’équipe de ménage signale un stock bas ou épuisé (serviettes, papier toilette, savon, capsules café).',
    defaultEmail: true,
    defaultPush: true,
  },
  // =============================================================
  // « DEMANDES PARTICULIÈRES » — équipements demandés par l'invité
  // (lit d'appoint, lit bébé, siège bébé, serviettes…)
  // =============================================================
  {
    key: 'special_request',
    emoji: '🛎️',
    label: 'Demandes particulières',
    description:
      'Un invité demande un équipement ou un service depuis le Hub (lit d’appoint, lit bébé, siège bébé, serviettes…).',
    defaultEmail: true,
    defaultPush: true,
  },
  // =============================================================
  // v5.4 « COACH ROOMSCAN » — recommandations critiques de l'IA
  // =============================================================
  {
    key: 'coach_insight',
    emoji: '🎓',
    label: 'Coach — urgence détectée',
    description:
      'Le Coach Roomscan détecte un problème urgent : conflit ménage/arrivée, rupture de stock, dégâts non traités, invité mécontent.',
    defaultEmail: true,
    defaultPush: true,
  },
  // =============================================================
  // v5.20 — RAPPELS QUOTIDIENS : les triggers J-3 / J+1 / Bouclier
  // d'avis du moteur d'automatisations étaient SANS clé de prefs
  // (envoyés systématiquement). Trois clés dédiées — consultables
  // dans Paramètres → Notifications. L'email au VOYAGEUR (Bouclier)
  // n'est pas affecté : ces switches contrôlent le récap à l'hôte.
  // =============================================================
  {
    key: 'checkin_j3',
    emoji: '✉️',
    label: 'Arrivée dans 3 jours (J-3)',
    description:
      'Rappel pré-arrivée : préparer le logement et envoyer les informations d’accès au voyageur.',
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'checkout_j1',
    emoji: '🧽',
    label: 'Ménage après départ (J+1)',
    description:
      'Rappel du lendemain du départ : ménage à faire ou déjà effectué.',
    defaultEmail: true,
    defaultPush: false,
  },
  {
    key: 'review_shield_today',
    emoji: '⭐',
    label: 'Bouclier d’avis au départ',
    description:
      'Récapitulatif quand le lien d’avis du jour a été envoyé à un voyageur qui part (SMS/email).',
    defaultEmail: true,
    defaultPush: true,
  },
  // =============================================================
  // v5.19 « BRIEFING DU SOIR » — bilan enrichi de la journée à 18 h
  // (activé PAR DÉFAUT — demande client ; push sans objet pour un
  // digest planifié → defaultPush false).
  // =============================================================
  {
    key: 'evening_briefing',
    emoji: '🌇',
    label: 'Briefing du soir (18 h)',
    description:
      'Bilan quotidien de votre journée : préparatifs de demain (arrivées, départs, ménage), points d\'attention, revenus encaissés, KPIs et message de motivation quand votre planning est calme.',
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
