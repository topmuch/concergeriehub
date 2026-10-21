'use client';

// =============================================================
// BOUCLIER V2 — DOCUMENTS (onglet 6/8).
// Archive de tous les PDF générés (master prompt §4) :
//   · Certificats d'ONBOARDING par bien (bibliothèque verrouillée)
//     → /api/shield/pdf/onboarding/[id] ;
//   · Rapports de SESSION certifiés (check-in / check-out)
//     → /api/shield/pdf/session/[id].
// =============================================================
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  FileDown,
  FileText,
  Loader2,
  LogIn,
  LogOut,
} from 'lucide-react';
import {
  fetchJson,
  formatDate,
  GhostButton,
  ShieldCard,
} from './shield-ui';

interface PropertyRow {
  id: string;
  propertyName: string;
  city: string;
  onboardingRef: string;
  onboardedAt: string;
}

interface SessionRow {
  id: string;
  type: 'CHECK_IN' | 'CHECK_OUT';
  guestName: string | null;
  completedAt: string;
  sessionRef: string;
  property: { id: string; propertyName: string };
}

export function ShieldDocuments() {
  const [properties, setProperties] = useState<PropertyRow[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ properties: PropertyRow[] }>('/api/shield/properties')
      .then((d) => setProperties(d.properties))
      .catch((e: Error) => setError(e.message));
    fetchJson<{ sessions: SessionRow[] }>('/api/shield/sessions?status=TERMINE&take=100')
      .then((d) => setSessions(d.sessions))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      </div>
    );
  }

  const loading = properties === null || sessions === null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Documents</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Archive de tous vos PDF certifiés — certificats d'onboarding et rapports de séjour.
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#1e3a8a]" aria-label="Chargement" />
        </div>
      ) : (
        <>
          {/* ── Certificats d'onboarding ── */}
          <section aria-label="Certificats d'onboarding">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Certificats d'onboarding ({properties!.length})
            </h2>
            {properties!.length === 0 ? (
              <ShieldCard className="p-6 text-center text-sm text-slate-500">
                Aucun certificat — onboarder un bien pour générer le premier.
              </ShieldCard>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {properties!.map((p) => (
                  <ShieldCard key={p.id} className="flex items-center gap-3 p-4">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1e3a8a]/10 text-[#1e3a8a]"
                    >
                      <Building2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{p.propertyName}</p>
                      <p className="truncate text-xs text-slate-500">
                        {p.onboardingRef} · onboardé le {formatDate(p.onboardedAt)}
                      </p>
                    </div>
                    <a href={`/api/shield/pdf/onboarding/${p.id}`} target="_blank" rel="noopener noreferrer">
                      <GhostButton>
                        <FileDown className="h-4 w-4" aria-hidden="true" />
                        PDF
                      </GhostButton>
                    </a>
                  </ShieldCard>
                ))}
              </div>
            )}
          </section>

          {/* ── Rapports de séjour ── */}
          <section aria-label="Rapports de séjour">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Rapports de séjour ({sessions!.length})
            </h2>
            {sessions!.length === 0 ? (
              <ShieldCard className="p-6 text-center text-sm text-slate-500">
                Aucun rapport — les PDF apparaissent dès le premier check-in / check-out validé.
              </ShieldCard>
            ) : (
              <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1 shield-scrollbar">
                {sessions!.map((s) => (
                  <ShieldCard key={s.id} className="flex flex-wrap items-center gap-3 p-4">
                    <span
                      aria-hidden="true"
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        s.type === 'CHECK_IN' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {s.type === 'CHECK_IN' ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {s.type === 'CHECK_IN' ? 'Check-in' : 'Check-out'} — {s.guestName ?? 'Invité'}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {s.property.propertyName} · {formatDate(s.completedAt)} ·{' '}
                        <span className="font-mono">{s.sessionRef}</span>
                      </p>
                    </div>
                    <a href={`/api/shield/pdf/session/${s.id}`} target="_blank" rel="noopener noreferrer">
                      <GhostButton>
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        Ouvrir le PDF
                      </GhostButton>
                    </a>
                  </ShieldCard>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
