'use client';

// =============================================================
// BOUCLIER V2 — CHECK-INS (3/8) & CHECK-OUTS (4/8).
// Historique des entrées / sorties validées (statut TERMINE) :
// date effective, bien, invité, agent, nb photos, vidéo publique
// (/shield/video/[token]) et PDF certifié téléchargeable.
// Un seul composant paramétré par type (design identique).
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileDown, Loader2, LogIn, LogOut, Search } from 'lucide-react';
import {
  fetchJson,
  formatDateTime,
  GhostButton,
  RedButton,
  ShieldCard,
  StatusBadge,
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
  videoToken: string | null;
  property: { id: string; propertyName: string; city: string };
}

export function ShieldHistory({ type }: { type: 'CHECK_IN' | 'CHECK_OUT' }) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchJson<{ sessions: SessionRow[] }>(`/api/shield/sessions?type=${type}&status=TERMINE&take=100`)
      .then((d) => setRows(d.sessions))
      .catch((e: Error) => setError(e.message));
  }, [type]);

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

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {filtered === null ? 'Chargement…' : `${filtered.length} ${isCheckIn ? 'entrée' : 'sortie'}${filtered.length > 1 ? 's' : ''} validée${filtered.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Rechercher un séjour</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Invité, bien, référence…"
            className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1e3a8a] focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 dark:border-slate-200 dark:bg-white dark:text-slate-900"
          />
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {filtered === null ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#1e3a8a]" aria-label="Chargement" />
        </div>
      ) : filtered.length === 0 ? (
        <ShieldCard className="p-8 text-center sm:p-12">
          {isCheckIn ? (
            <LogIn className="mx-auto h-12 w-12 text-slate-300" aria-hidden="true" />
          ) : (
            <LogOut className="mx-auto h-12 w-12 text-slate-300" aria-hidden="true" />
          )}
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            Aucun {isCheckIn ? 'check-in' : 'check-out'} validé
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Les {title.toLowerCase()} apparaissent ici dès que votre cleaner valide sa capture
            (photos + vidéo) via son lien magique.
          </p>
        </ShieldCard>
      ) : (
        <div className="max-h-[36rem] space-y-3 overflow-y-auto pr-1 shield-scrollbar">
          {filtered.map((s) => (
            <ShieldCard key={s.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status="TERMINE" />
                    <span className="font-mono text-[11px] text-slate-400">{s.sessionRef}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {s.guestName ?? 'Invité'}{' '}
                    <span className="font-normal text-slate-500">— {s.property.propertyName}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Agent {s.agentName} ·{' '}
                    {formatDateTime(s.scheduledDate ?? s.completedAt)} · {s.shots} photos
                    {s.guestEmail ? ` · ${s.guestEmail}` : ''}
                  </p>
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
