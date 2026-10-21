'use client';

// =============================================================
// BOUCLIER V2 — MÉNAGE À FAIRE (onglet 2/8).
// Liste des sessions statut « A_VENIR » / « EN_RETARD » + GROS
// bouton « + Nouveau Séjour » (FLUX B du master prompt client :
// nom invité, email invité, date check-in, date check-out,
// téléphone cleaner → 2 sessions planifiées liées A_VENIR avec
// liens magiques cleaner /s/[token]).
// =============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  X,
} from 'lucide-react';
import {
  fetchJson,
  formatDate,
  formatDateTime,
  GhostButton,
  RedButton,
  ShieldCard,
  StatusBadge,
} from './shield-ui';

interface Visit {
  id: string;
  type: 'CHECK_IN' | 'CHECK_OUT';
  guestName: string | null;
  guestEmail: string | null;
  cleanerPhone: string | null;
  scheduledDate: string;
  effectiveStatus: 'A_VENIR' | 'EN_RETARD';
  sessionRef: string;
  publicToken: string | null;
  linkedSessionId: string | null;
  property: { id: string; propertyName: string; city: string; propertyAddress: string };
}

interface PropertiesResponse {
  properties: {
    id: string;
    propertyName: string;
    propertyAddress: string;
    city: string;
  }[];
}

/** Session créée (FLUX B) — lien cleaner généré automatiquement. */
interface CreatedSession {
  type: 'CHECK_IN' | 'CHECK_OUT';
  sessionRef: string;
  publicToken: string | null;
  propertyName: string;
  guestName: string;
  whenISO: string;
  cleanerPhone: string | null;
}

const inputClass =
  'min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1e3a8a] focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 dark:border-slate-200 dark:bg-white dark:text-slate-900';

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ShieldVisits() {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [properties, setProperties] = useState<PropertiesResponse['properties']>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedSession[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Origine résolue APRÈS montage (évite tout mismatch d'hydratation SSR).
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  // ── Formulaire contrôlé ──
  const [propertyId, setPropertyId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [cleanerPhone, setCleanerPhone] = useState('');
  const [checkInDate, setCheckInDate] = useState(() => toDatetimeLocal(new Date(Date.now() + 86_400_000)));
  const [checkOutDate, setCheckOutDate] = useState(() => toDatetimeLocal(new Date(Date.now() + 5 * 86_400_000)));

  const load = useCallback(() => {
    fetchJson<{ visits: Visit[] }>('/api/shield/visits')
      .then((d) => setVisits(d.visits))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    fetchJson<PropertiesResponse>('/api/shield/properties')
      .then((d) => setProperties(d.properties))
      .catch(() => setProperties([]));
  }, [load]);

  const enRetard = useMemo(() => visits?.filter((v) => v.effectiveStatus === 'EN_RETARD').length ?? 0, [visits]);

  const submit = async () => {
    setFormError(null);
    if (!propertyId) return setFormError('Sélectionnez le logement concerné.');
    if (!guestName.trim()) return setFormError("Le nom de l'invité est obligatoire.");
    setBusy(true);
    try {
      const res = await fetchJson<{
        ok: true;
        checkIn: { sessionRef: string; publicToken: string | null };
        checkOut: { sessionRef: string; publicToken: string | null };
      }>('/api/shield/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim() || undefined,
          cleanerPhone: cleanerPhone.trim() || undefined,
          checkInDate: new Date(checkInDate).toISOString(),
          checkOutDate: new Date(checkOutDate).toISOString(),
        }),
      });
      const propertyName = properties.find((p) => p.id === propertyId)?.propertyName ?? '';
      setCreated([
        {
          type: 'CHECK_IN',
          sessionRef: res.checkIn.sessionRef,
          publicToken: res.checkIn.publicToken,
          propertyName,
          guestName: guestName.trim(),
          whenISO: new Date(checkInDate).toISOString(),
          cleanerPhone: cleanerPhone.trim() || null,
        },
        {
          type: 'CHECK_OUT',
          sessionRef: res.checkOut.sessionRef,
          publicToken: res.checkOut.publicToken,
          propertyName,
          guestName: guestName.trim(),
          whenISO: new Date(checkOutDate).toISOString(),
          cleanerPhone: cleanerPhone.trim() || null,
        },
      ]);
      setFormOpen(false);
      setGuestName('');
      setGuestEmail('');
      setCleanerPhone('');
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (v: Visit) => {
    if (!window.confirm(`Annuler le ${v.type === 'CHECK_IN' ? 'check-in' : 'check-out'} de ${v.guestName ?? 'cet invité'} ?${v.type === 'CHECK_IN' ? ' Le check-out lié sera annulé aussi.' : ''}`)) return;
    setBusy(true);
    try {
      await fetchJson(`/api/shield/visits/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'annuler' }),
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (token: string | null) => {
    if (!token) return;
    const url = `${window.location.origin}/s/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt('Copiez ce lien :', url);
    }
  };

  /** Message de partage prêt à envoyer (WhatsApp / email). */
  const shareText = (c: CreatedSession): string => {
    const url = `${window.location.origin}/s/${c.publicToken}`;
    return (
      `Ménage « ${c.propertyName} » — ${c.type === 'CHECK_IN' ? 'check-in' : 'check-out'} prévu le ${formatDateTime(c.whenISO)}` +
      ` (invité : ${c.guestName}). Ouvrez ce lien pour la capture guidée photos + vidéo, sans compte : ${url}`
    );
  };

  const shareWhatsApp = (c: CreatedSession) => {
    if (!c.publicToken) return;
    const digits = (c.cleanerPhone ?? '').replace(/\D/g, '');
    const href = `https://wa.me/${digits}?text=${encodeURIComponent(shareText(c))}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const shareEmail = (c: CreatedSession) => {
    if (!c.publicToken) return;
    const subject = `Lien intervention ménage — ${c.propertyName}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareText(c))}`;
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      {/* ── En-tête + GROS bouton ── */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Ménage à faire</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {visits === null
              ? 'Chargement…'
              : `${visits.length} séjour${visits.length > 1 ? 's' : ''} planifié${visits.length > 1 ? 's' : ''}${enRetard > 0 ? ` — ${enRetard} en retard 🔴` : ''}`}
          </p>
        </div>
        <RedButton onClick={() => { setFormOpen(true); setCreated(null); setFormError(null); }}>
          <Plus className="h-5 w-5" aria-hidden="true" />
          Nouveau Séjour
        </RedButton>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* ── Confirmation de création : liens cleaner GÉNÉRÉS + partage 1 clic ── */}
      <AnimatePresence>
        {created && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <ShieldCard className="border-emerald-200 bg-emerald-50/60 p-4 sm:p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <Check className="h-4 w-4" aria-hidden="true" />
                Séjour créé — 2 sessions planifiées
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                Les liens de capture de votre cleaner sont générés ci-dessous —
                partagez-les en un clic ou ouvrez-les pour vérifier.
              </p>
              <ul className="mt-3 space-y-3">
                {created.map((c) => {
                  const url = c.publicToken ? `${origin}/s/${c.publicToken}` : null;
                  return (
                    <li
                      key={c.sessionRef}
                      className="rounded-xl border border-emerald-200 bg-white p-3"
                    >
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-emerald-900">
                        {c.type === 'CHECK_IN' ? (
                          <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {c.type === 'CHECK_IN' ? 'Check-in' : 'Check-out'}
                        <span className="font-mono text-[11px] font-normal text-slate-400">
                          {c.sessionRef}
                        </span>
                        <span className="text-xs font-normal text-slate-500">
                          {formatDateTime(c.whenISO)}
                        </span>
                      </p>
                      {url ? (
                        <>
                          <p
                            className="mt-2 break-all rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-600"
                            aria-label="Lien cleaner public"
                          >
                            {url}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => shareWhatsApp(c)}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                              aria-label="Partager le lien cleaner par WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
                            </button>
                            <button
                              type="button"
                              onClick={() => shareEmail(c)}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                              aria-label="Partager le lien cleaner par email"
                            >
                              <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email
                            </button>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#1e3a8a] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#15295e]"
                              aria-label="Ouvrir le lien public de capture"
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Ouvrir le lien
                              public
                            </a>
                            <button
                              type="button"
                              onClick={() => copyLink(c.publicToken)}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                              aria-label="Copier le lien cleaner"
                            >
                              {copied === c.publicToken ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              {copied === c.publicToken ? 'Lien copié !' : 'Copier'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-amber-700">
                          Lien indisponible pour cette session.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <GhostButton className="mt-3" onClick={() => setCreated(null)}>
                Fermer
              </GhostButton>
            </ShieldCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Liste des séjours planifiés ── */}
      {visits === null ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#1e3a8a]" aria-label="Chargement" />
        </div>
      ) : visits.length === 0 ? (
        <ShieldCard className="p-8 text-center sm:p-12">
          <CalendarDays className="mx-auto h-12 w-12 text-slate-300" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Aucun séjour planifié</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Créez votre premier séjour : le check-in et le check-out seront planifiés automatiquement,
            avec un lien magique pour votre cleaner.
          </p>
          <RedButton className="mt-5" onClick={() => { setFormOpen(true); setCreated(null); setFormError(null); }}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            + Nouveau Séjour
          </RedButton>
        </ShieldCard>
      ) : (
        <div className="max-h-[36rem] space-y-3 overflow-y-auto pr-1 shield-scrollbar">
          {visits.map((v) => (
            <ShieldCard key={v.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        v.type === 'CHECK_IN' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {v.type === 'CHECK_IN' ? (
                        <LogIn className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <LogOut className="h-3 w-3" aria-hidden="true" />
                      )}
                      {v.type === 'CHECK_IN' ? 'Check-in' : 'Check-out'}
                    </span>
                    <StatusBadge status={v.effectiveStatus} />
                    <span className="font-mono text-[11px] text-slate-400">{v.sessionRef}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {v.guestName ?? 'Invité'} <span className="font-normal text-slate-500">— {v.property.propertyName}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      Prévu le {formatDateTime(v.scheduledDate)}
                    </span>
                    {v.cleanerPhone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                        {v.cleanerPhone}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <GhostButton onClick={() => copyLink(v.publicToken)}>
                    {copied === v.publicToken ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {copied === v.publicToken ? 'Copié !' : 'Lien cleaner'}
                  </GhostButton>
                  <button
                    type="button"
                    onClick={() => cancel(v)}
                    disabled={busy}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Annuler
                  </button>
                </div>
              </div>
            </ShieldCard>
          ))}
        </div>
      )}

      {/* ── Formulaire « + Nouveau Séjour » (dialog) ── */}
      <AnimatePresence>
        {formOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-900/50"
              onClick={() => !busy && setFormOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Nouveau séjour"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="fixed left-1/2 top-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2"
            >
              <ShieldCard className="max-h-[88vh] overflow-y-auto p-5 shield-scrollbar sm:p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold tracking-tight text-slate-900">Nouveau Séjour</h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Check-in + check-out planifiés automatiquement.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => !busy && setFormOpen(false)}
                    aria-label="Fermer"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-4 space-y-3.5">
                  <div>
                    <label htmlFor="v-property" className="mb-1 block text-sm font-medium text-slate-700">
                      Logement *
                    </label>
                    <select
                      id="v-property"
                      value={propertyId}
                      onChange={(e) => setPropertyId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">— Sélectionner un bien —</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.propertyName} · {p.city}
                        </option>
                      ))}
                    </select>
                    {properties.length === 0 && (
                      <p className="mt-1 text-xs text-amber-700">
                        Aucun bien onboardé —{' '}
                        <Link href="/inspection/biens" className="font-semibold underline">
                          onboarder un bien d'abord
                        </Link>
                        .
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="v-guest" className="mb-1 block text-sm font-medium text-slate-700">
                      Nom de l'invité *
                    </label>
                    <input
                      id="v-guest"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="ex. Fatou Ndiaye"
                      className={inputClass}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="v-email" className="mb-1 block text-sm font-medium text-slate-700">
                      Email de l'invité <span className="text-slate-400">(reçoit le PDF)</span>
                    </label>
                    <input
                      id="v-email"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="invite@exemple.com"
                      className={inputClass}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="v-phone" className="mb-1 block text-sm font-medium text-slate-700">
                      Téléphone du cleaner
                    </label>
                    <input
                      id="v-phone"
                      type="tel"
                      value={cleanerPhone}
                      onChange={(e) => setCleanerPhone(e.target.value)}
                      placeholder="+221 77 000 00 00"
                      className={inputClass}
                      autoComplete="off"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="v-in" className="mb-1 block text-sm font-medium text-slate-700">
                        Date check-in *
                      </label>
                      <input
                        id="v-in"
                        type="datetime-local"
                        value={checkInDate}
                        onChange={(e) => setCheckInDate(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="v-out" className="mb-1 block text-sm font-medium text-slate-700">
                        Date check-out *
                      </label>
                      <input
                        id="v-out"
                        type="datetime-local"
                        value={checkOutDate}
                        onChange={(e) => setCheckOutDate(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>

                {formError && (
                  <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {formError}
                  </p>
                )}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <GhostButton onClick={() => setFormOpen(false)} className={busy ? 'opacity-50' : ''}>
                    Annuler
                  </GhostButton>
                  <RedButton onClick={submit} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                    Créer le séjour
                  </RedButton>
                </div>
              </ShieldCard>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
