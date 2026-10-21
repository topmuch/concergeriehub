// =============================================================
// ROOMSCAN BOUCLIER V2 — FLUX A « APP CLEANER » (chargeur partagé).
//
// Le lien magique /s/[publicToken] (généré à la planification du
// séjour — API /api/shield/visits FLUX B) ouvre l'app cleaner SANS
// compte :
//   · GET  → état de la session planifiée + zones (fantômes) ;
//   · POST → capture complète (photos fantômes + vidéo ≤ 120 s)
//     qui CONSOMME la session : status A_VENIR → TERMINE, shots +
//     vidéo scellée (hash SHA-256 serveur), certificat PDF envoyé
//     automatiquement par email à l'hôte (+ invité si renseigné).
//
// Ce module partage la lecture entre la page /s/[token] et l'API
// (une seule source de vérité sur l'état d'une session cleaner).
// =============================================================
import { db } from '@/lib/db';

export type CleanerZoneView = {
  id: string;
  name: string;
  referencePhoto: string;
};

export type CleanerSessionView = {
  id: string;
  token: string;
  sessionRef: string;
  propertyId: string;
  /** Session CHECK_OUT déjà rattachée à un CHECK_IN ? */
  linkedSessionId: string | null;
  type: 'CHECK_IN' | 'CHECK_OUT';
  /** Abonnement propriétaire (envoi du certificat par email). */
  subscriptionId: string;
  /** Statut stocké (EN_RETARD est TOUJOURS calculé à la volée). */
  status: string;
  /** Statut effectif (EN_RETARD = A_VENIR dont la date est passée). */
  effectiveStatus: 'A_VENIR' | 'EN_RETARD' | 'TERMINE' | 'ANNULE';
  scheduledDate: string | null; // ISO
  completedAt: string | null; // ISO
  agentName: string;
  guestName: string | null;
  guestEmail: string | null;
  propertyName: string;
  propertyAddress: string;
  city: string;
  zones: CleanerZoneView[];
};

/** Statut effectif (même règle que /api/shield/visits — zéro cron). */
export function cleanerEffectiveStatus(status: string, scheduledDate: Date | null): string {
  if (status === 'A_VENIR' && scheduledDate && scheduledDate.getTime() < Date.now()) {
    return 'EN_RETARD';
  }
  return status;
}

/**
 * Charge une session cleaner par son token magique (24 car.).
 * Renvoie null si le token est inconnu/malformé — JAMAIS d'erreur.
 */
export async function loadCleanerSession(token: string): Promise<CleanerSessionView | null> {
  if (!token || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const s = await db.shieldSession.findUnique({
    where: { publicToken: token },
    include: {
      property: {
        select: {
          subscriptionId: true,
          propertyName: true,
          propertyAddress: true,
          city: true,
          zones: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true, referencePhoto: true },
          },
        },
      },
    },
  });
  if (!s) return null;
  return {
    id: s.id,
    token,
    sessionRef: s.sessionRef,
    propertyId: s.propertyId,
    linkedSessionId: s.linkedSessionId,
    type: s.type === 'CHECK_OUT' ? 'CHECK_OUT' : 'CHECK_IN',
    subscriptionId: s.property.subscriptionId,
    status: s.status,
    effectiveStatus: cleanerEffectiveStatus(s.status, s.scheduledDate) as CleanerSessionView['effectiveStatus'],
    scheduledDate: s.scheduledDate?.toISOString() ?? null,
    completedAt: s.completedAt?.toISOString() ?? null,
    agentName: s.agentName,
    guestName: s.guestName,
    guestEmail: s.guestEmail,
    propertyName: s.property.propertyName,
    propertyAddress: s.property.propertyAddress,
    city: s.property.city,
    zones: s.property.zones,
  };
}
