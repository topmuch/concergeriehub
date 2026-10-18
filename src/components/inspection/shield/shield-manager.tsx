'use client';

// =============================================================
// ROOMSCAN BOUCLIER AUTOMATISÉ (v5.1) — GESTIONNAIRE (onglet)
// État vide (héros « ZÉRO PAPIER » + lancement onboarding),
// liste des logements onboardés, détail (bibliothèque de
// référence + QR, zones fantômes, historique des sessions) et
// lancement des sessions CHECK-IN / CHECK-OUT (90 secondes).
// =============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Camera,
  Copy,
  FileText,
  Lock,
  Mail,
  MessageCircle,
  Play,
  QrCode,
  Shield,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ShieldOnboarding } from './shield-onboarding';
import { ShieldCapture } from './shield-capture';
import { AirbnbDisputeDialog } from './airbnb-dispute-dialog';
import {
  buildShieldDisputeMessage,
  openAirbnbResolutionCenter,
  prepareAirbnbDispute,
  sanitizeFilePart,
} from './airbnb-dispute';

// ── v4.122 — THÈME CLAIR (client : « tous les fonds noirs doivent laisser
// place au mode clair »). Constante locale claire : remplace ROW_ACTION_BTN
// (dashboard-ui.tsx, fichier NON modifié). Zéro logique : classes uniquement.
const LIGHT_ROW_ACTION_BTN =
  'min-h-[44px] rounded-full px-3 py-1 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:min-h-0 sm:py-0';

// ---------- Types (contrats API /api/shield/*) ----------

interface ShieldPropertyRow {
  id: string;
  propertyName: string;
  propertyAddress: string;
  city: string;
  ownerName: string;
  onboardingRef: string;
  onboardedAt: string;
  devicesCount: number;
  zonesCount: number;
  sessionsCount: number;
  lastSessionAt: string | null;
}

interface ShieldDetail {
  property: {
    id: string;
    propertyName: string;
    propertyAddress: string;
    city: string;
    ownerName: string;
    onboardingRef: string;
    onboardedAt: string;
  };
  zones: { id: string; name: string; referencePhoto: string; sortOrder: number }[];
  devices: {
    id: string;
    name: string;
    kind: string;
    referenceCode: string;
    referenceHash: string;
    referencePhoto: string;
    referenceDate: string;
    sortOrder: number;
  }[];
  sessions: {
    id: string;
    type: string;
    agentName: string;
    sessionRef: string;
    linkedSessionId: string | null; // v4.120 — verrouillage lecture seule
    completedAt: string;
    videoToken: string | null;
    videoSha256: string | null;
    durationSec: number | null;
    impeccableCount: number;
    degradationCount: number;
    shotsCount: number;
  }[];
}

// ---------- Helpers ----------

function formatFrDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFrDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Empreinte tronquée « a3f1…d92e ». */
function shortHash(hash: string): string {
  return hash.length > 10 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash;
}

// ── v4.120 — PARTAGE PUBLIC DU CERTIFICAT (URL sans authentification) ──
// Le token de la vidéo walkthrough (24 car., non devinable, déjà dans le
// QR du PDF) sert de clé publique du document : WhatsApp, email, copie.

/** Intitulé métier du document (cohérent avec le PDF). */
function shieldDocLabel(type: string): string {
  return type === 'CHECK_OUT'
    ? 'Rapport de sortie — Comparatif entrée / sortie'
    : 'Attestation d\u2019état des lieux d\u2019entrée';
}

/** URL publique du certificat PDF de la session. */
function shieldPublicPdfUrl(videoToken: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/api/public/shield/pdf/${videoToken}`;
}

/** Partage WhatsApp du certificat public. */
function shareShieldPdfWhatsApp(s: ShieldDetail['sessions'][number], propertyName: string): void {
  if (!s.videoToken) return;
  const url = shieldPublicPdfUrl(s.videoToken);
  const text = `🛡️ RoomScan — ${shieldDocLabel(s.type)}\n${propertyName} (${s.sessionRef})\n${url}`;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer',
  );
}

/** Partage email (client mail de l'hôte) du certificat public. */
function shareShieldPdfEmail(s: ShieldDetail['sessions'][number], propertyName: string): void {
  if (!s.videoToken) return;
  const url = shieldPublicPdfUrl(s.videoToken);
  const subject = `RoomScan — ${shieldDocLabel(s.type)} (${s.sessionRef})`;
  const body = `Bonjour,\n\nVoici le document officiel RoomScan pour ${propertyName} :\n${shieldDocLabel(s.type)}\nRéférence : ${s.sessionRef}\n\n📄 Certificat PDF : ${url}\n\nDocument horodaté, protégé par empreinte SHA-256 — infalsifiable.`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Copie le lien public du certificat dans le presse-papiers. */
async function copyShieldPdfLink(s: ShieldDetail['sessions'][number]): Promise<void> {
  if (!s.videoToken) return;
  const url = shieldPublicPdfUrl(s.videoToken);
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Lien public du certificat copié — collez-le où vous voulez.');
  } catch {
    toast.error('Copie impossible — réessayez.');
  }
}

function SessionTypePill({ type }: { type: string }) {
  const isCheckIn = type === 'CHECK_IN';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]',
        isCheckIn
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-red-200 bg-red-50 text-[#C21F26]',
      )}
    >
      {isCheckIn ? 'Check-in' : 'Check-out'}
    </span>
  );
}

// =============================================================
// ShieldManager — composant principal de l'onglet Bouclier
// =============================================================

export function ShieldManager({
  sessionUser,
}: {
  sessionUser: { id: string; name: string | null; email: string | null };
}) {
  const [properties, setProperties] = useState<ShieldPropertyRow[] | null>(null);
  const [subRequired, setSubRequired] = useState(false);
  const [subMessage, setSubMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShieldDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [captureType, setCaptureType] = useState<'CHECK_IN' | 'CHECK_OUT' | null>(null);
  const [disputeBusyId, setDisputeBusyId] = useState<string | null>(null);
  const [disputeMessage, setDisputeMessage] = useState<string | null>(null);

  const agentName = sessionUser.name ?? 'Agent';

  // ── v4.120 — VERROUILLAGE LECTURE SEULE : document généré = cycle figé. ──
  // Le dernier CHECK_IN définit le cycle courant : tant que son CHECK_OUT
  // n'existe pas, l'entrée est verrouillée (attestation déjà générée) et
  // le CHECK_OUT reste disponible ; dès que la sortie existe, TOUT le
  // cycle est verrouillé — un nouveau CHECK-IN (nouveau séjour) rouvre.
  const shieldLocks = useMemo(() => {
    if (!detail) return { lockCheckIn: false, lockCheckOut: false, cycleOpen: false };
    const lastCheckIn = detail.sessions.find((s) => s.type === 'CHECK_IN') ?? null;
    const outLinked = lastCheckIn
      ? detail.sessions.some((s) => s.type === 'CHECK_OUT' && s.linkedSessionId === lastCheckIn.id)
      : false;
    return {
      lockCheckIn: Boolean(lastCheckIn) && !outLinked,
      lockCheckOut: Boolean(lastCheckIn) && outLinked,
      cycleOpen: Boolean(lastCheckIn),
    };
  }, [detail]);

  // ---------- Chargement liste ----------
  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/shield/properties', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as
        | { properties?: ShieldPropertyRow[]; error?: string; message?: string }
        | null;
      if (!res.ok) {
        if (res.status === 403 && json?.error === 'abonnement_requis') {
          setSubRequired(true);
          setSubMessage(json.message ?? null);
          return;
        }
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setSubRequired(false);
      setLoadError(null);
      setProperties(json?.properties ?? []);
    } catch {
      setLoadError('Chargement du Bouclier impossible. Vérifiez votre connexion.');
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // ---------- Chargement détail ----------
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/shield/properties/${id}`, { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as
        | (ShieldDetail & { error?: string; message?: string })
        | null;
      if (!res.ok || !json?.property) {
        if (res.status === 403 && json?.error === 'abonnement_requis') {
          setSubRequired(true);
          setSubMessage(json.message ?? null);
          return;
        }
        if (res.status === 404) {
          toast.error('Logement introuvable — la liste a été actualisée.');
          setSelectedId(null);
          void loadList();
          return;
        }
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setDetail(json);
    } catch {
      setDetailError('Chargement du logement impossible. Réessayez.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDetail(null);
    void loadDetail(id);
  };

  // ---------- Export intelligent pour litige Airbnb ----------
  const handleAirbnbDispute = async (s: ShieldDetail['sessions'][number]) => {
    if (disputeBusyId) return;
    const property = detail?.property;
    if (!property) return;
    setDisputeBusyId(s.id);
    try {
      const message = buildShieldDisputeMessage({
        propertyName: property.propertyName,
        ownerName: property.ownerName,
        sessionRef: s.sessionRef,
        completedAt: s.completedAt,
        videoToken: s.videoToken,
        videoSha256: s.videoSha256,
        origin: window.location.origin,
      });
      const { copied, popupBlocked } = await prepareAirbnbDispute({
        pdfUrl: `/api/shield/pdf/session/${s.id}`,
        pdfFilename: `Roomscan_Bouclier_${sanitizeFilePart(property.propertyName)}_${sanitizeFilePart(s.sessionRef)}.pdf`,
        message,
      });
      if (copied) {
        toast.success('Dossier Airbnb prêt !', {
          description:
            '1. Le PDF certifié a été téléchargé. 2. Le message juridique est copié — collez le texte et joignez le PDF.',
          duration: 12000,
          action: popupBlocked
            ? {
                label: 'Ouvrir Airbnb',
                onClick: () => {
                  openAirbnbResolutionCenter();
                },
              }
            : undefined,
        });
      } else {
        setDisputeMessage(message);
        toast.error('Copie automatique impossible — copiez manuellement le message affiché.', {
          duration: 9000,
        });
      }
    } finally {
      setDisputeBusyId(null);
    }
  };

  // ---------- Rendu : encart abonnement ----------
  if (subRequired) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm sm:p-8"
        >
          <Shield className="size-10 text-[#C21F26]" aria-hidden="true" />
          <h2 className="lux-display text-xl font-semibold text-gray-900">Abonnement requis</h2>
          <p className="max-w-md text-sm text-gray-500">
            {subMessage ??
              "Le module Bouclier est inclus dans l'offre États des Lieux (299 €/an, PDF illimités)."}
          </p>
          <Link
            href="/edl/abonnement"
            className="mt-1 inline-flex min-h-[44px] items-center rounded-full bg-[#C21F26] px-6 text-sm font-bold text-white transition-colors hover:bg-[#a81a20]"
            aria-label="Voir l'abonnement États des Lieux"
          >
            Voir l&apos;abonnement
          </Link>
        </div>
      </div>
    );
  }

  // ---------- Rendu : onboarding ----------
  if (onboardingOpen) {
    return (
      <ShieldOnboarding
        sessionName={sessionUser.name}
        onDone={(_propertyId, onboardingRef) => {
          setOnboardingOpen(false);
          void loadList();
          toast.success(`Bouclier actif — bibliothèque ${onboardingRef} verrouillée.`);
        }}
      />
    );
  }

  // ---------- Rendu : détail ----------
  if (selectedId) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setDetail(null);
            void loadList();
          }}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          aria-label="Retour à la liste des logements"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Retour à la liste
        </button>

        {detailLoading && !detail ? (
          <div className="mt-4 space-y-3" role="status" aria-label="Chargement du logement">
            <Skeleton className="h-28 w-full rounded-2xl bg-gray-200 dark:bg-gray-200" />
            <Skeleton className="h-48 w-full rounded-2xl bg-gray-200 dark:bg-gray-200" />
            <Skeleton className="h-32 w-full rounded-2xl bg-gray-200 dark:bg-gray-200" />
          </div>
        ) : detailError && !detail ? (
          <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">{detailError}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void loadDetail(selectedId)}
              className="mt-2 min-h-[44px] rounded-full border-gray-300 bg-white px-5 text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:bg-white dark:border-gray-300 dark:hover:bg-gray-50"
            >
              Réessayer
            </Button>
          </div>
        ) : detail ? (
          <>
            {/* ----- En-tête propriété + actions ----- */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="mt-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="lux-display text-xl font-semibold text-gray-900 sm:text-2xl">
                    {detail.property.propertyName}
                  </h2>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {detail.property.propertyAddress} · {detail.property.city}
                  </p>
                  <p className="mt-2 font-mono text-sm font-bold tracking-wider text-[#C21F26]">
                    {detail.property.onboardingRef}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Bibliothèque verrouillée le {formatFrDateTime(detail.property.onboardedAt)}
                  </p>
                </div>
              </div>

              {/* ── v4.120 — Bandeau lecture seule : document généré = logement figé ── */}
              {/* v4.121 — client : « mettre ces écritures en vert, en couleur noir »
                  → fond vert PLEIN + texte noir (plus de translucide). */}
              {shieldLocks.cycleOpen ? (
                <div
                  className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-600 bg-emerald-500 px-3 py-2.5 text-xs text-black"
                  role="status"
                >
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="font-bold">Logement en lecture seule</strong> — les documents
                    d&apos;état des lieux générés sont figés et infalsifiables. Le bouton du contrôle
                    déjà généré est désactivé
                    {shieldLocks.lockCheckOut
                      ? " ; un NOUVEAU CHECK-IN ouvre un cycle pour un nouveau séjour."
                      : " ; le CHECK-OUT clôture le cycle en cours."}
                  </span>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {shieldLocks.lockCheckIn ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled
                    className="min-h-[44px] cursor-not-allowed rounded-full border border-emerald-600 bg-emerald-500 px-5 font-bold text-black disabled:pointer-events-auto disabled:opacity-100"
                    aria-label={`Document d'entrée déjà généré pour ${detail.property.propertyName} — lecture seule`}
                    title="Le certificat d'entrée a déjà été généré — lecture seule."
                  >
                    <Lock className="size-4" aria-hidden="true" /> ENTRÉE GÉNÉRÉE — LECTURE SEULE
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setCaptureType('CHECK_IN')}
                    className="min-h-[44px] rounded-full bg-[#C21F26] px-5 font-bold text-white shadow-[0_10px_28px_-12px_rgba(194,31,38,0.7)] hover:bg-[#a81a20]"
                    aria-label={`Lancer un check-in de 90 secondes pour ${detail.property.propertyName}`}
                  >
                    <Play className="size-4" aria-hidden="true" />{' '}
                    {shieldLocks.lockCheckOut ? 'NOUVEAU SÉJOUR — CHECK-IN 90 s' : 'CHECK-IN — 90 s'}
                  </Button>
                )}
                {shieldLocks.lockCheckOut ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled
                    className="min-h-[44px] cursor-not-allowed rounded-full border border-emerald-600 bg-emerald-500 px-5 font-bold text-black disabled:pointer-events-auto disabled:opacity-100"
                    aria-label={`Rapport de sortie déjà généré pour ${detail.property.propertyName} — lecture seule`}
                    title="Le rapport de sortie a déjà été généré — lecture seule."
                  >
                    <Lock className="size-4" aria-hidden="true" /> SORTIE GÉNÉRÉE — LECTURE SEULE
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setCaptureType('CHECK_OUT')}
                    className="min-h-[44px] rounded-full bg-[#C21F26] px-5 font-bold text-white shadow-[0_10px_28px_-12px_rgba(194,31,38,0.7)] hover:bg-[#a81a20]"
                    aria-label={`Lancer un check-out de 90 secondes pour ${detail.property.propertyName}`}
                  >
                    <Camera className="size-4" aria-hidden="true" /> CHECK-OUT — 90 s
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(`/api/shield/pdf/onboarding/${detail.property.id}`, '_blank')
                  }
                  className="min-h-[44px] rounded-full border-gray-300 bg-white px-5 font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:bg-white dark:border-gray-300 dark:hover:bg-gray-50"
                  aria-label="Ouvrir le certificat d'onboarding PDF"
                >
                  <FileText className="size-4" aria-hidden="true" /> Certificat d&apos;onboarding PDF
                </Button>
              </div>
            </motion.div>

            {/* ----- Bibliothèque de référence (appareils + QR) ----- */}
            <section className="mt-6" aria-label="Bibliothèque de référence réutilisable">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
                Bibliothèque de référence — <span className="text-[#C21F26]">réutilisable</span>
              </h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {detail.devices.map((d) => (
                  <div key={d.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <img
                        src={d.referencePhoto}
                        alt={`Photo de référence — ${d.name}`}
                        className="h-24 w-24 shrink-0 rounded-xl border border-gray-200 object-cover"
                      />
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="rounded-md bg-white p-1.5" aria-label={`QR code ${d.referenceCode}`}>
                          <QRCodeSVG value={d.referenceCode} size={44} />
                        </div>
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold text-[#C21F26]">
                          {d.kind}
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-sm font-bold text-gray-900">{d.name}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Photo de référence du {formatFrDate(d.referenceDate)}
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] font-bold text-[#C21F26]">
                      QR: {d.referenceCode}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-gray-500">
                      sha256: {shortHash(d.referenceHash)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* ----- Zones fixes (6) — fantômes d'angle ----- */}
            <section className="mt-6" aria-label="Zones fixes — photos fantômes">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
                Zones fixes (6) — <span className="text-[#C21F26]">fantômes d&apos;angle</span>
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {detail.zones.map((z) => (
                  <figure key={z.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
                    <img
                      src={z.referencePhoto}
                      alt={`Photo fantôme — ${z.name}`}
                      className="aspect-[3/4] w-full rounded-lg object-cover"
                    />
                    <figcaption className="mt-2 px-1 pb-1 text-xs font-bold uppercase tracking-[0.08em] text-gray-900">
                      {z.name}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>

            {/* ----- Historique des sessions ----- */}
            <section className="mt-6" aria-label="Historique des sessions">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
                Historique des sessions
              </h3>
              {detail.sessions.length === 0 ? (
                <p className="mt-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500 shadow-sm">
                  Aucune session pour le moment — lancez votre premier check-in en 90 secondes.
                </p>
              ) : (
                <div className="lux-scroll mt-3 max-h-96 overflow-y-auto rounded-2xl border border-gray-200 bg-white">
                  <ul className="divide-y divide-gray-100">
                    {detail.sessions.map((s) => {
                      const damaged = s.degradationCount > 0;
                      return (
                        <li key={s.id} className="flex flex-col gap-2 p-3 sm:px-4">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <SessionTypePill type={s.type} />
                            <span className="font-mono text-xs font-bold text-[#C21F26]">{s.sessionRef}</span>
                            <span className="text-xs text-gray-600">{formatFrDateTime(s.completedAt)}</span>
                            <span className="text-[11px] text-gray-500">
                              Agent : {s.agentName}
                              {s.shotsCount > 0
                                ? ` · ${s.impeccableCount}/${s.shotsCount} zones impeccables`
                                : ''}
                            </span>
                            {damaged ? (
                              <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#C21F26]">
                                ⚠ {s.degradationCount} dégradation{s.degradationCount > 1 ? 's' : ''}
                              </span>
                            ) : null}
                            <span className="ml-auto flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => window.open(`/api/shield/pdf/session/${s.id}`, '_blank')}
                                className={LIGHT_ROW_ACTION_BTN}
                                aria-label={`Ouvrir le certificat PDF de la session ${s.sessionRef}`}
                              >
                                PDF
                              </button>
                              {s.videoToken ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => shareShieldPdfWhatsApp(s, detail.property.propertyName)}
                                    className={cn(LIGHT_ROW_ACTION_BTN, 'text-emerald-600 hover:text-emerald-700')}
                                    aria-label={`Partager le certificat de la session ${s.sessionRef} par WhatsApp`}
                                    title="Partager par WhatsApp (lien public du certificat)"
                                  >
                                    <MessageCircle className="size-4" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => shareShieldPdfEmail(s, detail.property.propertyName)}
                                    className={LIGHT_ROW_ACTION_BTN}
                                    aria-label={`Envoyer le certificat de la session ${s.sessionRef} par email`}
                                    title="Envoyer par email (lien public du certificat)"
                                  >
                                    <Mail className="size-4" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void copyShieldPdfLink(s)}
                                    className={LIGHT_ROW_ACTION_BTN}
                                    aria-label={`Copier le lien public du certificat de la session ${s.sessionRef}`}
                                    title="Copier le lien public du certificat"
                                  >
                                    <Copy className="size-4" aria-hidden="true" />
                                  </button>
                                  <a
                                    href={`/shield/video/${s.videoToken}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={LIGHT_ROW_ACTION_BTN}
                                    aria-label={`Voir la vidéo de la session ${s.sessionRef}`}
                                  >
                                    Vidéo
                                  </a>
                                </>
                              ) : null}
                              {!damaged ? (
                                <button
                                  type="button"
                                  onClick={() => void handleAirbnbDispute(s)}
                                  disabled={disputeBusyId !== null}
                                  className={cn(LIGHT_ROW_ACTION_BTN, 'text-[#C21F26] hover:text-[#a81a20]')}
                                  aria-label={`Préparer le dossier Airbnb pour la session ${s.sessionRef}`}
                                >
                                  🛡️ Airbnb
                                </button>
                              ) : null}
                            </span>
                          </div>
                          {damaged ? (
                            <button
                              type="button"
                              onClick={() => void handleAirbnbDispute(s)}
                              disabled={disputeBusyId !== null}
                              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#C21F26] px-4 text-xs font-bold text-white shadow-[0_10px_28px_-12px_rgba(194,31,38,0.7)] transition-colors hover:bg-[#a81a20] disabled:opacity-60 sm:w-fit"
                              aria-label={`Préparer le dossier Airbnb pour la session ${s.sessionRef}`}
                            >
                              🛡️ Préparer le dossier Airbnb
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          </>
        ) : null}

        {/* ----- Session 90 secondes (plein écran) ----- */}
        {captureType && detail ? (
          <ShieldCapture
            property={{ id: detail.property.id, propertyName: detail.property.propertyName }}
            zones={detail.zones.map((z) => ({
              id: z.id,
              name: z.name,
              referencePhoto: z.referencePhoto,
            }))}
            type={captureType}
            agentName={agentName}
            onClose={() => setCaptureType(null)}
            onDone={(r) => {
              setCaptureType(null);
              toast.success(`Session ${r.sessionRef} enregistrée — certificat généré.`);
              void loadDetail(detail.property.id);
              void loadList();
            }}
          />
        ) : null}

        {/* ----- Dialog de secours : copie manuelle du message Airbnb ----- */}
        <AirbnbDisputeDialog
          open={disputeMessage !== null}
          message={disputeMessage ?? ''}
          onOpenChange={(v) => {
            if (!v) setDisputeMessage(null);
          }}
        />
      </div>
    );
  }

  // ---------- Rendu : liste ----------
  const props = properties ?? [];
  return (
    <div className="mx-auto w-full max-w-5xl">
      {properties === null && !loadError ? (
        <div className="mt-2 space-y-3" role="status" aria-label="Chargement du Bouclier">
          <Skeleton className="h-24 w-full rounded-2xl bg-gray-200 dark:bg-gray-200" />
          <Skeleton className="h-40 w-full rounded-2xl bg-gray-200 dark:bg-gray-200" />
        </div>
      ) : loadError ? (
        <div role="alert" className="mt-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          <p className="font-semibold">{loadError}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadList()}
            className="mt-2 min-h-[44px] rounded-full px-5"
          >
            Réessayer
          </Button>
        </div>
      ) : props.length === 0 ? (
        /* ----- État vide : héros « ZÉRO PAPIER » ----- */
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="mt-2 flex flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm sm:p-10"
        >
          <span className="relative flex size-16 items-center justify-center rounded-full bg-red-50">
            <Shield className="size-9 text-[#C21F26]" aria-hidden="true" />
          </span>
          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#C21F26]">
            Zéro papier
          </span>
          <h2 className="lux-display text-2xl font-semibold text-gray-900 sm:text-3xl">
            BOUCLIER AUTOMATISÉ
          </h2>
          <p className="max-w-lg text-sm text-gray-500 sm:text-base">
            Onboarding 10 min <span className="font-bold text-gray-900">UNE SEULE FOIS</span>. Puis 90
            secondes par check-in / check-out. Zéro photo d&apos;appareil à refaire, jamais.
          </p>

          <div className="mt-2 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <Camera className="size-5 text-[#C21F26]" aria-hidden="true" />
              <p className="mt-2 text-sm font-bold text-gray-900">1 · Photo initiale</p>
              <p className="mt-1 text-xs text-gray-500">
                6 zones fixes photographiées une seule fois — vos futurs fantômes d&apos;angle.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <QrCode className="size-5 text-[#C21F26]" aria-hidden="true" />
              <p className="mt-2 text-sm font-bold text-gray-900">2 · 4 équipements enregistrés</p>
              <p className="mt-1 text-xs text-gray-500">
                QR REF-xxx + empreinte SHA-256 par appareil, scellés à date.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <Lock className="size-5 text-[#C21F26]" aria-hidden="true" />
              <p className="mt-2 text-sm font-bold text-gray-900">3 · Bibliothèque verrouillée</p>
              <p className="mt-1 text-xs text-gray-500">
                Réutilisée automatiquement à chaque check-in / check-out.
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            className="mt-3 min-h-[44px] rounded-full bg-[#C21F26] px-6 text-sm font-bold text-white shadow-[0_14px_36px_-14px_rgba(194,31,38,0.8)] hover:bg-[#a81a20]"
            aria-label="Lancer l'onboarding du Bouclier (10 minutes, une seule fois)"
          >
            Lancer l&apos;onboarding (10 min — une seule fois)
          </Button>
        </motion.div>
      ) : (
        /* ----- Liste des logements protégés ----- */
        <>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <p className="text-sm text-gray-500">
              {props.length} logement{props.length > 1 ? 's' : ''} sous protection —
              sélectionnez-en un pour lancer une session.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOnboardingOpen(true)}
              className="min-h-[44px] rounded-full border-gray-300 bg-white px-4 font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:bg-white dark:border-gray-300 dark:hover:bg-gray-50"
              aria-label="Onboarder un nouveau logement"
            >
              + Nouveau logement
            </Button>
          </div>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Liste des logements protégés">
            {props.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => openDetail(p.id)}
                  className="flex h-full w-full flex-col rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
                  aria-label={`Ouvrir le logement ${p.propertyName}`}
                >
                  <p className="truncate font-semibold text-gray-900">{p.propertyName}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">{p.propertyAddress}</p>
                  <span className="mt-2 w-fit rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-600">
                    {p.city}
                  </span>
                  <p className="mt-3 font-mono text-xs font-bold tracking-wider text-[#C21F26]">
                    {p.onboardingRef}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    {p.devicesCount} appareil{p.devicesCount > 1 ? 's' : ''} · {p.zonesCount} zones ·{' '}
                    {p.sessionsCount} session{p.sessionsCount > 1 ? 's' : ''}
                  </p>
                  <p className="mt-auto pt-3 text-[11px] text-gray-500">
                    Onboarding le {formatFrDate(p.onboardedAt)}
                    {p.lastSessionAt ? ` · dernière session le ${formatFrDate(p.lastSessionAt)}` : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
