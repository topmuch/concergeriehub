'use client';

// =============================================================
// ROOMSCAN INVENTAIRE V2 (ex-Bouclier) — CHECK-INS & CHECK-OUTS.
// Historique des entrées / sorties validées (statut TERMINE) :
// date effective, bien, invité, agent, nb photos, vidéo publique
// (/shield/video/[token]) et PDF certifié téléchargeable.
// Un seul composant paramétré par type (design identique).
// v4.167 — master prompt client :
//   · Problème 9 (bug crédibilité) : badge de statut RÉEL (plus de
//     « Terminé » codé en dur), agent affiché honnêtement (« Agent
//     non renseigné » au lieu du placeholder « À venir »), et
//     « Aucune photo » stylé ambre au lieu d'un sec « 0 photos » ;
//   · Problème 10 : badge rouge « Anomalie » quand le rapport
//     contient des zones À nettoyer / Dégradation ;
//   · Problème 11 : montant de la caution sécurisée ;
//   · Suggestion 5 : export CSV/Excel de la liste.
// v5.0 — DEMANDE CLIENT :
//   · BOUTONS DE SUPPRESSION (corbeille, confirmation, DELETE
//     /api/shield/sessions/[id] — hard delete owner-scoped) ;
//   · BOUTONS DE PARTAGE WhatsApp + Email par séjour (PDF certifié
//     + lien vidéo, message pré-rédigé, email invité pré-rempli) ;
//   · DESIGN « Luxe Bleuté » : cartes .luxe-card, dégradés, mode
//     sombre automatique.
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, FileDown, Loader2, LogIn, LogOut, Mail, Search, Sheet, Trash2 } from 'lucide-react';
import {
  agentLabel,
  AnomalyBadge,
  DangerButton,
  DepositChip,
  fetchJson,
  formatDateTime,
  GhostButton,
  MailButton,
  PageHeader,
  RedButton,
  ShieldCard,
  StatusBadge,
  WhatsAppButton,
  WhatsAppIcon,
} from './shield-ui';

interface SessionRow {
  id: string;
  type: 'CHECK_IN' | 'CHECK_OUT';
  status: string;
  effectiveStatus: string;
  guestName: string | null;
  guestEmail: string | null;
  agentName: string;
  scheduledDate: string | null;
  completedAt: string;
  sessionRef: string;
  shots: number;
  anomalies: number;
  depositAmount: number | null;
  videoToken: string | null;
  property: { id: string; propertyName: string; city: string };
}

export function ShieldHistory({ type }: { type: 'CHECK_IN' | 'CHECK_OUT' }) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // v5.0 — état de suppression en cours (id) + toast de confirmation.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Origine résolue après montage (partage WhatsApp / Email).
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const load = () => {
    fetchJson<{ sessions: SessionRow[] }>(`/api/shield/sessions?type=${type}&status=TERMINE&take=100`)
      .then((d) => setRows(d.sessions))
      .catch((e: Error) => setError(e.message));
  };

  useEffect(load, [type]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.guestName ?? '').toLowerCase().includes(q) ||
        r.property.propertyName.toLowerCase().includes(q) ||
        r.sessionRef.toLowerCase().includes(q) ||
        r.agentName.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const isCheckIn = type === 'CHECK_IN';
  const title = isCheckIn ? 'Check-ins' : 'Check-outs';

  /** v5.0 — message de partage pré-rédigé (WhatsApp / Email). */
  function shareText(s: SessionRow): string {
    const pdfUrl = `${origin}/api/shield/pdf/session/${s.id}`;
    const lines = [
      `📋 ${isCheckIn ? 'Rapport de check-in' : 'Rapport de check-out'} certifié — RoomScan Inventaire`,
      `👤 Invité : ${s.guestName ?? '—'}`,
      `🏠 Bien : ${s.property.propertyName} (${s.property.city})`,
      `📅 Date : ${formatDateTime(s.scheduledDate ?? s.completedAt)}`,
      `📄 PDF certifié : ${pdfUrl}`,
    ];
    if (s.videoToken) lines.push(`🎥 Vidéo horodatée : ${origin}/shield/video/${s.videoToken}`);
    if (s.depositAmount && s.depositAmount > 0) lines.push(`💰 Caution sécurisée : ${s.depositAmount.toLocaleString('fr-FR')} €`);
    return lines.join('\n');
  }

  /** v5.0 — partage WhatsApp : conversation libre (choix du contact). */
  function shareWhatsApp(s: SessionRow) {
    const href = `https://wa.me/?text=${encodeURIComponent(shareText(s))}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  /** v5.0 — partage Email : destinataire pré-rempli si l'invité a un email. */
  function shareEmail(s: SessionRow) {
    const subject = `Rapport ${isCheckIn ? 'de check-in' : 'de check-out'} certifié — ${s.property.propertyName}`;
    window.location.href = `mailto:${s.guestEmail ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareText(s))}`;
  }

  /** v5.0 — SUPPRESSION définitive (demande client) avec confirmation. */
  async function deleteSession(s: SessionRow) {
    if (
      !window.confirm(
        `Supprimer définitivement ce ${isCheckIn ? 'check-in' : 'check-out'} (${s.sessionRef}) ?\n\nPhotos, vidéo et PDF associés seront effacés. Cette action est irréversible.`,
      )
    )
      return;
    setDeletingId(s.id);
    setError(null);
    try {
      await fetchJson(`/api/shield/sessions/${s.id}`, { method: 'DELETE' });
      setRows((prev) => prev?.filter((r) => r.id !== s.id) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  /** v4.167 — Export CSV (suggestion 5) : comptabilité / reporting. */
  function exportCsv() {
    const list = filtered ?? [];
    const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'Référence',
      'Type',
      'Invité',
      'Email invité',
      'Bien',
      'Ville',
      'Agent',
      'Prévu le',
      'Terminé le',
      'Photos',
      'Zones signalées',
      'Caution (€)',
      'Statut',
    ];
    const lines = list.map((s) =>
      [
        s.sessionRef,
        s.type === 'CHECK_IN' ? 'Check-in' : 'Check-out',
        s.guestName ?? '',
        s.guestEmail ?? '',
        s.property.propertyName,
        s.property.city,
        s.agentName.trim() || '',
        s.scheduledDate ? new Date(s.scheduledDate).toLocaleString('fr-FR') : '',
        new Date(s.completedAt).toLocaleString('fr-FR'),
        s.shots,
        s.anomalies,
        s.depositAmount ?? '',
        s.effectiveStatus,
      ]
        .map(esc)
        .join(';'),
    );
    // BOM UTF-8 → accents corrects dans Excel.
    const csv = '\uFEFF' + [header.map(esc).join(';'), ...lines].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase()}-roomscan-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <PageHeader
        icon={isCheckIn ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
        title={title}
        subtitle={
          filtered === null
            ? 'Chargement…'
            : `${filtered.length} ${isCheckIn ? 'entrée' : 'sortie'}${filtered.length > 1 ? 's' : ''} validée${filtered.length > 1 ? 's' : ''}`
        }
        actions={
          <>
            <label className="relative w-full sm:w-72">
              <span className="sr-only">Rechercher un séjour</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Invité, bien, référence…"
                className="luxe-input w-full pl-9 pr-3"
              />
            </label>
            {/* v4.167 — Export CSV (suggestion 5) */}
            <GhostButton onClick={exportCsv} disabled={!filtered || filtered.length === 0} className="shrink-0">
              <Sheet className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Export CSV</span>
            </GhostButton>
          </>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {filtered === null ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#1e3a8a] dark:text-[#3b82f6]" aria-label="Chargement" />
        </div>
      ) : filtered.length === 0 ? (
        <ShieldCard className="p-8 text-center sm:p-12">
          {isCheckIn ? (
            <LogIn className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          ) : (
            <LogOut className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          )}
          <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Aucun {isCheckIn ? 'check-in' : 'check-out'} validé
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            Les {title.toLowerCase()} apparaissent ici dès que votre cleaner valide sa capture
            (photos + vidéo) via son lien magique.
          </p>
        </ShieldCard>
      ) : (
        <div className="max-h-[36rem] space-y-3 overflow-y-auto pr-1 shield-scrollbar">
          {filtered.map((s) => (
            <ShieldCard key={s.id} className="p-4 transition-shadow hover:shadow-lg">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* v4.167 — statut RÉEL (fix Problème 9 : plus de badge
                        « Terminé » codé en dur) + badge Anomalie (P10). */}
                    <StatusBadge status={s.effectiveStatus} />
                    <AnomalyBadge count={s.anomalies} />
                    <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">{s.sessionRef}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {s.guestName ?? 'Invité'}{' '}
                    <span className="font-normal text-slate-500 dark:text-slate-400">— {s.property.propertyName}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    {/* v4.167 — agent honnête (fix Problème 9) */}
                    <span className={s.agentName.trim() ? '' : 'italic text-slate-400 dark:text-slate-500'}>
                      {agentLabel(s.agentName)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatDateTime(s.scheduledDate ?? s.completedAt)}
                    </span>
                    <span aria-hidden="true">·</span>
                    {s.shots > 0 ? (
                      <span>{s.shots} photos</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                        Aucune photo
                      </span>
                    )}
                    {s.guestEmail && <span className="truncate">· {s.guestEmail}</span>}
                    {/* v4.167 — caution sécurisée (Problème 11) */}
                    <DepositChip amount={s.depositAmount} />
                  </p>
                  {/* v5.0 — actions de partage & suppression (demande client) */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <WhatsAppButton onClick={() => shareWhatsApp(s)}>
                      <WhatsAppIcon className="h-3.5 w-3.5" />
                      WhatsApp
                    </WhatsAppButton>
                    <MailButton onClick={() => shareEmail(s)}>
                      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                      Email
                    </MailButton>
                    <DangerButton
                      onClick={() => deleteSession(s)}
                      disabled={deletingId === s.id}
                    >
                      {deletingId === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {deletingId === s.id ? 'Suppression…' : 'Supprimer'}
                    </DangerButton>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.videoToken && (
                    <a href={`/shield/video/${s.videoToken}`} target="_blank" rel="noopener noreferrer">
                      <GhostButton>Vidéo</GhostButton>
                    </a>
                  )}
                  <a href={`/api/shield/pdf/session/${s.id}`} target="_blank" rel="noopener noreferrer">
                    <RedButton className="min-h-[40px] px-3 text-xs">
                      <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                      PDF certifié
                    </RedButton>
                  </a>
                </div>
              </div>
            </ShieldCard>
          ))}
        </div>
      )}
    </div>
  );
}
