'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';

// =============================================================
// AUDIT 4-c — « Mes tâches » (Espace Hôte, membres d'équipe).
// Consomme GET /api/airbnb/my-assignments (réponse RÉELLE) :
//   - CLEANER     → séjours à ménager (guestName, dates, ménage)
//   - MAINTENANCE → réclamations techniques ouvertes
//   - MANAGER/OWNER → les deux sections
// v5.2 « SAPHIR LUXE » : refonte design profonde — nuit bleutée,
// SANS icônes ni emojis (typographie, .lux-dot, glyphes purs),
// cartes .lux-card, badges .lux-chip — logique et données intactes.
// =============================================================

interface AssignmentStay {
  id: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  cleaningStatus: string;
  status: string;
}

interface AssignmentRequest {
  id: string;
  description: string;
  status: string;
  urgencyLevel: string;
  preferredDate: string | null;
  createdAt: string;
  provider: { businessName: string; category: string } | null;
}

interface AssignmentBlock {
  property: { id: string; name: string; propertyType: string; address: string | null };
  role: string;
  cleaning: { upcoming: AssignmentStay[] };
  maintenance: { open: AssignmentRequest[] };
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propriétaire',
  MANAGER: 'Manager',
  CLEANER: 'Ménage',
  MAINTENANCE: 'Maintenance',
};

/** Couleur du point indicateur selon le rôle (design sans icônes). */
const ROLE_DOTS: Record<string, string> = {
  OWNER: '#cdb6ff',
  MANAGER: '#5c8af0',
  CLEANER: '#34d399',
  MAINTENANCE: '#fbbf24',
};

/** PENDING='À faire' (ambre) · IN_PROGRESS='En cours' (saphir) · DONE='Terminé' (émeraude). */
function cleaningBadge(status: string): { label: string; dot: string } {
  if (status === 'PENDING') return { label: 'À faire', dot: '#fbbf24' };
  if (status === 'IN_PROGRESS') return { label: 'En cours', dot: '#5c8af0' };
  if (status === 'DONE') return { label: 'Terminé', dot: '#34d399' };
  return { label: status, dot: '#8fa0c2' };
}

function requestBadge(status: string): { label: string; dot: string } {
  if (status === 'pending') return { label: 'En attente', dot: '#8fa0c2' };
  if (status === 'accepted') return { label: 'Acceptée', dot: '#e9c47c' };
  if (status === 'in_progress') return { label: 'En cours', dot: '#5c8af0' };
  return { label: status, dot: '#8fa0c2' };
}

function urgencyBadge(level: string): { label: string; dot: string } | null {
  if (level === 'urgent') return { label: 'Urgent', dot: '#fbbf24' };
  if (level === 'emergency') return { label: 'Urgence', dot: '#f07d6a' };
  return null; // 'normal' → pas de badge bruyant
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatDayTime(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function MyAssignmentsContent() {
  const [assignments, setAssignments] = useState<AssignmentBlock[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Charge les affectations réelles. mode='retry' (bouton Réessayer)
  // repasse par le skeleton ; l'effet initial est déjà « loading ».
  const load = useCallback(async (mode: 'initial' | 'retry') => {
    if (mode === 'retry') setLoading(true);
    try {
      const res = await fetch('/api/airbnb/my-assignments', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as
        | { assignments?: AssignmentBlock[]; error?: string }
        | null;
      if (!res.ok || !json) {
        setError(json?.error ?? 'Impossible de charger vos tâches.');
        setAssignments(null);
        return;
      }
      setError('');
      setAssignments(json.assignments ?? []);
    } catch {
      setError('Connexion impossible. Réessayez.');
      setAssignments(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const hasNoTask =
    (assignments ?? []).length === 0 ||
    (assignments ?? []).every(
      (a) => a.cleaning.upcoming.length === 0 && a.maintenance.open.length === 0,
    );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col">
      {/* ----- En-tête ----- */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mb-6"
      >
        <h1 className="lux-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">Mes tâches</h1>
        <p className="mt-1.5 text-sm text-[#8fa0c2]">
          Vos interventions à venir sur les biens de l&apos;équipe.
        </p>
      </motion.div>

      {/* ----- Chargement (skeleton) ----- */}
      {loading && (
        <div className="space-y-4" aria-busy="true" aria-label="Chargement de vos tâches">
          {[0, 1].map((i) => (
            <div key={i} className="lux-card space-y-3 p-4">
              <Skeleton className="h-6 w-44 rounded-lg bg-white/8" />
              <Skeleton className="h-16 w-full rounded-xl bg-white/8" />
              <Skeleton className="h-16 w-full rounded-xl bg-white/8" />
            </div>
          ))}
        </div>
      )}

      {/* ----- Erreur + Réessayer ----- */}
      {!loading && error && (
        <div className="lux-card flex flex-col items-center gap-3 p-8 text-center" role="alert">
          <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
          <p className="text-sm font-semibold text-white">{error}</p>
          <button
            type="button"
            onClick={() => void load('retry')}
            className="lux-btn mt-1"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* ----- État vide ----- */}
      {!loading && !error && hasNoTask && (
        <div className="lux-empty rounded-2xl p-10 text-center">
          <p className="lux-display text-lg text-white">Aucune tâche pour le moment</p>
          <p className="mx-auto mt-2 max-w-sm text-xs text-[#8fa0c2] sm:text-sm">
            Les nouveaux séjours et réclamations apparaîtront ici automatiquement.
          </p>
        </div>
      )}

      {/* ----- Tâches par bien ----- */}
      {!loading && !error && !hasNoTask && (
        <div className="space-y-5">
          {(assignments ?? []).map((block, i) => {
            const roleLabel = ROLE_LABELS[block.role] ?? block.role;
            const propertyEmpty =
              block.cleaning.upcoming.length === 0 && block.maintenance.open.length === 0;
            if (propertyEmpty) return null;
            return (
              <motion.section
                key={block.property.id}
                aria-label={`Tâches pour ${block.property.name}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 * i, duration: 0.3, ease: 'easeOut' }}
                className="lux-card p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="lux-rule w-8 shrink-0" aria-hidden="true" />
                    <h2 className="lux-display truncate text-lg font-semibold text-white">
                      {block.property.name}
                    </h2>
                  </div>
                  <span className="lux-chip whitespace-nowrap">
                    <span
                      className="lux-dot"
                      style={{ backgroundColor: ROLE_DOTS[block.role] ?? '#8fa0c2' }}
                      aria-hidden="true"
                    />
                    {roleLabel}
                  </span>
                </div>

                {/* — Séjours à ménager (CLEANER / MANAGER / OWNER) — */}
                {block.cleaning.upcoming.length > 0 && (
                  <div className="mt-4">
                    <p className="lux-eyebrow">Séjours à ménager</p>
                    <ul className="mt-2 space-y-2">
                      {block.cleaning.upcoming.map((stay) => {
                        const badge = cleaningBadge(stay.cleaningStatus);
                        return (
                          <li
                            key={stay.id}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-white/8 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">
                                {stay.guestName || 'Invité'}
                              </p>
                              <p className="mt-0.5 text-xs text-[#8fa0c2]">
                                {formatDay(stay.checkIn)} → {formatDay(stay.checkOut)} ·{' '}
                                {stay.guests} voyageur{stay.guests > 1 ? 's' : ''}
                              </p>
                            </div>
                            <span className="lux-chip whitespace-nowrap">
                              <span
                                className="lux-dot"
                                style={{ backgroundColor: badge.dot }}
                                aria-hidden="true"
                              />
                              {badge.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* — Réclamations ouvertes (MAINTENANCE / MANAGER / OWNER) — */}
                {block.maintenance.open.length > 0 && (
                  <div className="mt-4">
                    <p className="lux-eyebrow">Réclamations ouvertes</p>
                    <ul className="mt-2 space-y-2">
                      {block.maintenance.open.map((req) => {
                        const badge = requestBadge(req.status);
                        const urgency = urgencyBadge(req.urgencyLevel);
                        return (
                          <li
                            key={req.id}
                            className="flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-xl border border-white/8 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-sm font-semibold text-white">
                                {req.description || 'Réclamation sans description'}
                              </p>
                              <p className="mt-0.5 text-xs text-[#8fa0c2]">
                                {formatDayTime(req.preferredDate ?? req.createdAt)}
                                {req.provider?.businessName
                                  ? ` · ${req.provider.businessName}`
                                  : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {urgency && (
                                <span className="lux-chip whitespace-nowrap">
                                  <span
                                    className="lux-dot"
                                    style={{ backgroundColor: urgency.dot }}
                                    aria-hidden="true"
                                  />
                                  {urgency.label}
                                </span>
                              )}
                              <span className="lux-chip whitespace-nowrap">
                                <span
                                  className="lux-dot"
                                  style={{ backgroundColor: badge.dot }}
                                  aria-hidden="true"
                                />
                                {badge.label}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </motion.section>
            );
          })}

          <p className="text-center text-xs text-[#8fa0c2]">
            Une question ? <Link href="/airbnb/messages" className="font-semibold text-[#a9c4ff] underline underline-offset-2 transition-colors hover:text-white">Écrivez à l&apos;équipe</Link>
          </p>
        </div>
      )}
    </div>
  );
}
