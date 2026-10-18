'use client';

// =============================================================
// JOURNAL — onglet 2 du module « Ménage & Stock » (/airbnb/menage)
// Historique horodaté classé par date et heure (demande client) :
//   • fusion des interventions DONE (nouveau backend) croisées avec
//     les rapports de ménage via reportId + rapports legacy sans tâche ;
//   • heures RÉELLES d'arrivée/départ du staff + durée calculée ;
//   • GALERIE de toutes les photos (miniatures chargées à la volée)
//     avec lightbox plein écran (× ‹ › + Escape + flèches clavier) ;
//   • checklist validée dépliable, vocal de l'équipe, PDF en 1 clic ;
//   • filtre par nom d'agent (le filtre logement est le sélecteur
//     global du shell) ;
//   • en bas : « États des lieux de sortie » (voir menage-edl.tsx).
// =============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { downloadCleaningReportPdf } from '@/lib/cleaning-report-pdf';
import type { HousekeepingTask, JournalEntry, MenageReport } from './types';
import {
  dayKey,
  formatDuration,
  formatFrDateTime,
  formatFrDay,
  formatFrTime,
  isSameLocalDay,
} from './menage-utils';
import { LuxBusyDot, LUX_FIELD, LUX_GHOST_BTN } from './menage-ui';
import { CheckoutInspectionsSection } from './menage-edl';
// ── Cache module des photos complètes (dataURL) par rapport — évite
//    de re-télécharger les galeries à chaque polling / changement d'onglet.
const PHOTOS_CACHE = new Map<string, string[]>();
const MAX_CACHED_REPORTS = 40;

interface MenageJournalProps {
  tasks: HousekeepingTask[];
  reports: MenageReport[];
  /** Sélecteur global du shell ('all' ou id) — pour les états des lieux. */
  selectedId: string;
}

// ── Construction des entrées fusionnées (tâches DONE × rapports) ──
function buildEntries(tasks: HousekeepingTask[], reports: MenageReport[]): JournalEntry[] {
  const reportById = new Map(reports.map((r) => [r.id, r]));
  const usedReports = new Set<string>();
  const entries: JournalEntry[] = [];

  // (a) Interventions DONE — preuves via reportId si disponible.
  for (const t of tasks) {
    if (t.status !== 'DONE') continue;
    const report = t.reportId ? reportById.get(t.reportId) ?? null : null;
    if (report) usedReports.add(report.id);
    const startIso = report?.startedAt ?? t.startedAt ?? t.scheduledAt;
    const endIso = report?.endedAt ?? t.endedAt ?? report?.createdAt ?? t.scheduledEndAt ?? t.scheduledAt;
    entries.push({
      key: `task-${t.id}`,
      reportId: report?.id ?? null,
      report,
      task: t,
      startIso,
      endIso,
      sortIso: endIso,
      agentName: t.assigneeName ?? report?.staffName ?? null,
      propertyName: t.propertyName ?? report?.propertyName ?? null,
    });
  }

  // (b) Rapports legacy sans tâche correspondante (historique antérieur).
  for (const r of reports) {
    if (usedReports.has(r.id)) continue;
    const startIso = r.startedAt ?? r.createdAt;
    const endIso = r.endedAt ?? r.createdAt;
    entries.push({
      key: `report-${r.id}`,
      reportId: r.id,
      report: r,
      task: null,
      startIso,
      endIso,
      sortIso: endIso,
      agentName: r.staffName ?? null,
      propertyName: r.propertyName ?? null,
    });
  }

  entries.sort((a, b) => new Date(b.sortIso).getTime() - new Date(a.sortIso).getTime());
  return entries;
}

// ── Lightbox plein écran (fond noir, ×, ‹ ›, Escape, flèches) ──
function Lightbox({
  photos,
  index,
  title,
  onIndex,
  onClose,
}: {
  photos: string[];
  index: number;
  title: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, photos.length, onClose, onIndex]);

  const prev = () => onIndex(Math.max(0, index - 1));
  const next = () => onIndex(Math.min(photos.length - 1, index + 1));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} sur ${photos.length} — ${title}`}
      className="fixed inset-0 z-[90] flex flex-col bg-black/95"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 truncate text-xs font-semibold text-white/80">{title}</p>
        <div className="flex shrink-0 items-center gap-3">
          <span className="lux-num text-sm text-white/80">
            {index + 1} / {photos.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer l'aperçu"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl text-white transition-colors hover:bg-white/20"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2 pb-4" onClick={(e) => e.stopPropagation()}>
        {photos.length > 1 && (
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            aria-label="Photo précédente"
            className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-2xl text-white transition-colors hover:bg-white/20 disabled:opacity-30"
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}
        <img
          src={photos[index]}
          alt={`${title} — photo ${index + 1}`}
          className="max-h-[78vh] max-w-full rounded-lg object-contain"
        />
        {photos.length > 1 && (
          <button
            type="button"
            onClick={next}
            disabled={index === photos.length - 1}
            aria-label="Photo suivante"
            className="ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-2xl text-white transition-colors hover:bg-white/20 disabled:opacity-30"
          >
            <span aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Grille de TOUTES les photos d'un rapport (clic → lightbox) ──
function PhotoGallery({
  reportId,
  coverPhoto,
  photoCount,
  title,
  onOpen,
}: {
  reportId: string | null;
  coverPhoto: string | null;
  photoCount: number;
  title: string;
  onOpen: (photos: string[], index: number, title: string) => void;
}) {
  // Photos complètes : cache module → fetch unique par rapport.
  const [photos, setPhotos] = useState<string[] | null>(
    reportId ? PHOTOS_CACHE.get(reportId) ?? (photoCount === 0 ? [] : null) : null,
  );

  useEffect(() => {
    if (!reportId || photos !== null) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/airbnb/menage?reportId=${encodeURIComponent(reportId)}&photos=full`,
          { cache: 'no-store' },
        );
        const json = (await res.json().catch(() => null)) as { report?: { photos?: string[] } } | null;
        const list = Array.isArray(json?.report?.photos) ? (json?.report?.photos as string[]) : [];
        if (PHOTOS_CACHE.size >= MAX_CACHED_REPORTS) {
          const oldest = PHOTOS_CACHE.keys().next().value;
          if (oldest) PHOTOS_CACHE.delete(oldest);
        }
        PHOTOS_CACHE.set(reportId, list);
        if (alive) setPhotos(list);
      } catch {
        if (alive) setPhotos([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [reportId, photos]);

  if (photoCount === 0 && !coverPhoto) return null;

  // Avant chargement : cover + cellules d'attente (formes, pas d'icônes).
  const shown = photos ?? (coverPhoto ? [coverPhoto] : []);
  const waiting = photos === null ? Math.max(0, photoCount - shown.length) : 0;

  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8fa0c2]">
        Photos du passage · {photoCount}
      </p>
      <ul className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
        {shown.map((src, i) => (
          <li key={`${reportId ?? 'x'}-ph-${i}`}>
            <button
              type="button"
              onClick={() => photos && onOpen(photos, i, title)}
              aria-label={`Agrandir la photo ${i + 1} — ${title}`}
              className="group block w-full overflow-hidden rounded-xl border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/60"
            >
              <img
                src={src}
                alt={`${title} — photo ${i + 1}`}
                loading="lazy"
                className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
              />
            </button>
          </li>
        ))}
        {Array.from({ length: waiting }).map((_, i) => (
          <li
            key={`${reportId ?? 'x'}-wait-${i}`}
            aria-hidden="true"
            className="aspect-square animate-pulse rounded-xl border border-white/8 bg-white/[0.04]"
          />
        ))}
      </ul>
    </div>
  );
}

// ── Onglet JOURNAL ──
export function MenageJournal({ tasks, reports, selectedId }: MenageJournalProps) {
  const [agentQuery, setAgentQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number; title: string } | null>(null);

  const entries = useMemo(() => buildEntries(tasks, reports), [tasks, reports]);

  const openLightbox = useCallback((photos: string[], index: number, title: string) => {
    setLightbox({ photos, index, title });
  }, []);

  // ── Filtre par nom d'agent (le logement = sélecteur global du shell) ──
  const q = agentQuery.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? entries.filter((e) => (e.agentName ?? '').toLowerCase().includes(q)) : entries),
    [entries, q],
  );

  // ── Groupes par jour (desc) : Aujourd'hui / Hier / date complète ──
  const groups = useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const map = new Map<string, { label: string; entries: JournalEntry[] }>();
    for (const e of filtered) {
      const d = new Date(e.sortIso);
      const key = dayKey(d);
      let g = map.get(key);
      if (!g) {
        const label = isSameLocalDay(d, now)
          ? `Aujourd’hui — ${formatFrDay(d)}`
          : isSameLocalDay(d, yesterday)
            ? `Hier — ${formatFrDay(d)}`
            : formatFrDay(d);
        g = { label, entries: [] };
        map.set(key, g);
      }
      g.entries.push(e);
    }
    return [...map.values()];
  }, [filtered]);

  // ── Export PDF (logique existante v4.53, inchangée) ──
  const exportPdf = useCallback(async (entry: JournalEntry) => {
    const r = entry.report;
    if (!r) {
      toast.error('Aucun rapport de ménage lié à ce passage.');
      return;
    }
    setExportingId(entry.key);
    try {
      const res = await fetch(
        `/api/airbnb/menage?reportId=${encodeURIComponent(r.id)}&photos=full`,
        { cache: 'no-store' },
      );
      const json = (await res.json().catch(() => null)) as {
        report?: {
          photos: string[];
          checklist: { label: string; done: boolean }[];
          staffName: string | null;
          startedAt: string | null;
          endedAt: string | null;
          createdAt: string;
          startLat: number | null;
          startLng: number | null;
        } | null;
      } | null;
      if (!res.ok || !json?.report) throw new Error('rapport introuvable');
      await downloadCleaningReportPdf({
        propertyName: r.propertyName,
        staffName: json.report.staffName,
        checklist: json.report.checklist,
        photos: json.report.photos,
        startedAt: json.report.startedAt,
        endedAt: json.report.endedAt,
        createdAt: json.report.createdAt,
        startLat: json.report.startLat,
        startLng: json.report.startLng,
      });
      toast.success('Rapport visuel horodaté exporté en PDF ✓');
    } catch {
      toast.error('Export impossible. Réessayez.');
    } finally {
      setExportingId(null);
    }
  }, []);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* ── En-tête + filtre agent ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="lux-eyebrow">Historique classé par date et heure</p>
          <h2 className="lux-display mt-1 text-lg text-white">Journal des passages</h2>
          <p className="mt-0.5 text-xs text-[#8fa0c2]">
            Chaque passage réalisé : horaires réels de l’équipe, photos, vocal et checklist validée.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Input
            value={agentQuery}
            onChange={(e) => setAgentQuery(e.target.value)}
            placeholder="Filtrer par nom d’agent…"
            aria-label="Filtrer le journal par nom d'agent"
            className={cn('h-10', LUX_FIELD)}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="lux-empty flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
          <span className="lux-dot" style={{ backgroundColor: '#5c8af0' }} aria-hidden="true" />
          <p className="text-sm font-semibold text-white">
            {q ? 'Aucun passage ne correspond à ce filtre' : 'Aucun passage pour le moment'}
          </p>
          <p className="max-w-md text-xs text-[#8fa0c2]">
            {q
              ? 'Essayez un autre nom d’agent ou videz le champ de recherche.'
              : 'Votre femme de ménage valide son passage depuis le Mode Ménage du Hub (code staff) : les preuves apparaîtront ici, classées par jour.'}
          </p>
        </div>
      ) : (
        groups.map((g, gi) => (
          <motion.section
            key={g.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut', delay: Math.min(gi * 0.03, 0.18) }}
          >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">{g.label}</h3>
              <span className="lux-chip">
                {g.entries.length} passage{g.entries.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="lux-rule mt-2" />
            <ul className="mt-3 space-y-3">
              {g.entries.map((e) => {
                const r = e.report;
                const doneCount = r ? r.checklist.filter((c) => c.done).length : 0;
                const isOpen = expanded.has(e.key);
                const title = `${e.propertyName ?? 'Logement'} — ${formatFrDateTime(e.sortIso)}`;
                return (
                  <li
                    key={e.key}
                    className="lux-card p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      {/* Horaires réels — le héros de la carte */}
                      <div className="shrink-0 sm:w-44">
                        <p className="lux-num text-2xl font-semibold leading-tight text-white">
                          {e.startIso ? formatFrTime(e.startIso) : '—'}
                          {e.endIso ? <span className="text-[#8fa0c2]"> → {formatFrTime(e.endIso)}</span> : null}
                        </p>
                        <p className="mt-1 text-xs text-[#8fa0c2]">Arrivée → départ</p>
                        {formatDuration(e.startIso, e.endIso) && (
                          <span className="lux-chip mt-2">
                            <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
                            {formatDuration(e.startIso, e.endIso)}
                          </span>
                        )}
                      </div>

                      {/* Détails du passage */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">
                              {e.propertyName ?? 'Logement'}
                            </p>
                            <p className="mt-0.5 text-xs text-[#8fa0c2]">
                              {formatFrDateTime(e.sortIso)}
                              {e.task ? ' · passage planifié' : ' · passage enregistré'}
                            </p>
                          </div>
                          <span className="lux-chip shrink-0">
                            <span className="lux-dot" style={{ backgroundColor: '#2dd4bf' }} aria-hidden="true" />
                            {e.agentName ?? 'Équipe ménage'}
                          </span>
                        </div>

                        {/* Galerie — TOUTES les photos, clic = lightbox */}
                        {r && (
                          <PhotoGallery
                            reportId={r.id}
                            coverPhoto={r.coverPhoto}
                            photoCount={r.photoCount}
                            title={title}
                            onOpen={openLightbox}
                          />
                        )}

                        {/* Vocal de l'équipe */}
                        {r?.voiceUrl && (
                          <div className="mt-3 rounded-2xl border border-[#2dd4bf]/20 bg-[#2dd4bf]/8 p-3">
                            <p className="flex items-center gap-2 text-xs font-semibold text-[#86e9cb]">
                              <span className="lux-dot" style={{ backgroundColor: '#2dd4bf' }} aria-hidden="true" />
                              Message vocal de l’équipe
                              {r.voiceDurationSec > 0 ? ` (${r.voiceDurationSec} s)` : ''}
                            </p>
                            <audio controls preload="none" src={r.voiceUrl} className="mt-1 w-full" />
                          </div>
                        )}

                        {/* Checklist validée — dépliable */}
                        {r && r.checklist.length > 0 && (
                          <div className="mt-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={cn('h-8 rounded-full border-white/12 bg-white/[0.04] text-xs', LUX_GHOST_BTN)}
                              onClick={() => toggle(e.key)}
                              aria-expanded={isOpen}
                            >
                              <span
                                aria-hidden="true"
                                className={cn('text-[10px] transition-transform', isOpen && 'rotate-180')}
                              >
                                ▾
                              </span>
                              {doneCount}/{r.checklist.length} points validés · {isOpen ? 'Masquer' : 'Voir le détail'}
                            </Button>
                            {isOpen && (
                              <ul className="mt-2 space-y-1 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                {r.checklist.map((c, i) => (
                                  <li
                                    key={`${e.key}-c-${i}`}
                                    className={cn('flex items-center gap-2 text-sm', c.done ? 'text-white' : 'text-[#8fa0c2]/70')}
                                  >
                                    <span
                                      className="lux-dot shrink-0"
                                      style={{ backgroundColor: c.done ? '#34d399' : 'rgba(143,160,194,0.35)' }}
                                      aria-hidden="true"
                                    />
                                    {c.label}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        {/* Rapport visuel (PDF) — logique existante */}
                        {r && (
                          <div className="mt-3">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-full border-[#2dd4bf]/30 bg-[#2dd4bf]/8 text-xs font-semibold text-[#2dd4bf] hover:bg-[#2dd4bf]/15 hover:text-[#86e9cb]"
                              disabled={exportingId === e.key}
                              onClick={() => void exportPdf(e)}
                              aria-label="Extraire le rapport visuel horodaté du ménage (PDF)"
                            >
                              {exportingId === e.key && <LuxBusyDot color="#2dd4bf" />}
                              Rapport visuel (PDF)
                            </Button>
                          </div>
                        )}

                        {/* Tâche DONE sans rapport lié — transparence */}
                        {!r && e.task && (
                          <p className="mt-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 text-xs text-[#8fa0c2]">
                            Passage marqué fait sans preuve photo : aucun rapport de ménage n’a été
                            déposé par l’équipe.
                          </p>
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

      {/* ── v5.0 « ÉTATS DES LIEUX DE SORTIE » — preuves horodatées de départ ── */}
      <CheckoutInspectionsSection selectedId={selectedId} />
      {lightbox && (
        <Lightbox
          photos={lightbox.photos}
          index={lightbox.index}
          title={lightbox.title}
          onIndex={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
