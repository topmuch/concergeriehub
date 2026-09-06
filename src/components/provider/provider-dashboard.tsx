'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { providerCategoryMeta } from '@/lib/b2b';
import { ORDER_STATUS_META, ORDER_TRANSITIONS, formatEur2, type OrderStatus } from '@/lib/orders';

// =============================================================
// ÉTAPE 17.4 (V3) — Portail Prestataire : "Mes commandes"
// Le prestataire voit UNIQUEMENT les commandes qui lui sont
// adressées (résolu serveur depuis la session → providerProfile)
// et pilote son cycle de vie :
//   PENDING → CONFIRMED → PREPARING → DELIVERED (+ CANCELLED)
// ⚠️ La part hôte (hostEarning) n'est JAMAIS exposée au
// prestataire — c'est un contrat entre Conciergerie Hub et l'hôte.
// Optimiste : rollback + toast en cas d'échec.
// =============================================================

interface ProviderOrderDTO {
  id: string;
  guestName: string;
  guestEmail: string | null;
  items: unknown;
  totalAmount: number;
  commission: number;
  status: string;
  paymentStatus: string;
  paidAt: string | null;
  deliveryDate: string | null;
  createdAt: string;
  property: { name: string } | null;
}

interface ProviderStatsDTO {
  activeCount: number;
  pendingCount: number;
  preparingCount: number;
  deliveredCount: number;
  revenue: number;
  commissionTotal: number;
  paidRevenue: number;
}

interface ProviderMe {
  businessName: string;
  category: string;
  audience: string;
  ratingAvg: number;
  totalReviews: number;
}

interface ApiResponse {
  provider: ProviderMe;
  orders: ProviderOrderDTO[];
  stats: ProviderStatsDTO;
  // ÉTAPE 20 — Stripe Connect
  connect?: {
    available: boolean;
    onboarded: boolean;
    chargesEnabled: boolean;
    maskedAccountId: string | null;
  };
  error?: string;
}

// ---------- FIX-4 : documents de vérification (convention API) ----------
type VerificationDocKind = 'KBIS' | 'ASSURANCE' | 'OTHER';
type VerificationDocStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

interface VerificationDocumentDTO {
  id: string;
  kind: VerificationDocKind;
  name: string;
  url: string;
  uploadedAt: string;
  status: VerificationDocStatus;
}

const DOC_KIND_META: Record<VerificationDocKind, { label: string; emoji: string }> = {
  KBIS: { label: 'Kbis', emoji: '🏛️' },
  ASSURANCE: { label: 'Assurance', emoji: '🛡️' },
  OTHER: { label: 'Autre', emoji: '📎' },
};

/** Garde-fous côté client (le serveur re-valide tout) : MIME + 5 Mo. */
const DOC_MAX_SIZE = 5 * 1024 * 1024;
const DOC_ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Label court de la prochaine étape de cycle de vie. */
const NEXT_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Accepter',
  PREPARING: 'Démarrer la préparation',
  DELIVERED: 'Marquer livrée',
};

/** ÉTAPE 17.6 — chip paiement par commande (prestataire). */
function PaymentChip({ paymentStatus, orderStatus }: { paymentStatus: string; orderStatus: string }) {
  if (orderStatus === 'CANCELLED' && paymentStatus !== 'PAID') return null;
  const meta =
    paymentStatus === 'PAID'
      ? { label: 'Payée', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
      : paymentStatus === 'REFUNDED'
        ? { label: 'Remboursée', cls: 'bg-slate-100 text-slate-600 border-slate-300' }
        : paymentStatus === 'FAILED'
          ? { label: 'Paiement échoué', cls: 'bg-rose-100 text-rose-700 border-rose-300' }
          : { label: 'À payer', cls: 'bg-orange-100 text-orange-800 border-orange-300' };
  return (
    <Badge className={`${meta.cls} border text-[10px] px-2`} title={paymentStatus === 'PAID' ? 'Encaissé via Conciergerie Hub' : 'Paiement non finalisé'}>
      💳 {meta.label}
    </Badge>
  );
}

/** ÉTAPE 20 — bandeau Stripe Connect du prestataire (onboarding + statut payouts). */
function ConnectBanner({
  connect,
  onStart,
  busy,
}: {
  connect: NonNullable<ApiResponse['connect']>;
  onStart: () => void;
  busy: boolean;
}) {
  if (!connect.onboarded) {
    return (
      <section
        aria-label="Stripe Connect"
        className="rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
      >
        <div className="flex-1">
          <h2 className="text-sm font-bold text-amber-900 flex items-center gap-2">
            <span aria-hidden="true">🏦</span> Recevez vos paiements automatiquement
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            Connectez votre compte Stripe pour être payé directement à chaque commande —
            la commission Conciergerie Hub (15&nbsp;%) est déduite automatiquement, sans facture à gérer.
          </p>
        </div>
        <Button
          onClick={onStart}
          disabled={busy}
          className="bg-amber-600 text-white hover:bg-amber-700 shrink-0 min-h-[44px]"
        >
          {busy ? 'Connexion…' : 'Connecter mon compte Stripe'}
        </Button>
      </section>
    );
  }
  if (!connect.chargesEnabled) {
    return (
      <section
        aria-label="Stripe Connect"
        className="rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
      >
        <div className="flex-1">
          <h2 className="text-sm font-bold text-amber-900 flex items-center gap-2">
            <span aria-hidden="true">⏳</span> Onboarding Stripe incomplet
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            Votre compte Stripe est créé ({connect.maskedAccountId}) mais ne peut pas encore
            encaisser. Reprenez la configuration pour activer les virements.
          </p>
        </div>
        <Button
          onClick={onStart}
          disabled={busy}
          className="bg-amber-600 text-white hover:bg-amber-700 shrink-0 min-h-[44px]"
        >
          {busy ? 'Connexion…' : "Reprendre l'onboarding"}
        </Button>
      </section>
    );
  }
  return (
    <section
      aria-label="Stripe Connect"
      className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex-1">
        <h2 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
          <span aria-hidden="true">✅</span> Stripe Connect actif
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-emerald-800">
          Compte {connect.maskedAccountId} — les paiements de vos commandes vous sont
          reversés automatiquement (commission plateforme déduite à la source).
        </p>
      </div>
      {!connect.available && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/70 shrink-0">
          Mode démo
        </span>
      )}
    </section>
  );
}

/** Badge statut d'un document de vérification. */
function DocumentStatusBadge({ status }: { status: VerificationDocStatus }) {
  if (status === 'VERIFIED') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] px-2">
        ✓ Validé
      </Badge>
    );
  }
  if (status === 'REJECTED') {
    return (
      <Badge className="bg-rose-100 text-rose-700 border border-rose-300 text-[10px] px-2">
        ✕ Rejeté
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] px-2">
      ⏳ En attente
    </Badge>
  );
}

/**
 * FIX-4 — Carte « 📄 Documents de vérification » du portail prestataire :
 * liste des documents avec badges statut + upload (type + fichier) avec
 * validation client (MIME + 5 Mo — le serveur re-valide tout).
 * Bandeau explicatif : la vérification est faite par l'équipe Conciergerie Hub.
 */
function VerificationDocumentsCard({
  documents,
  loading,
  isVerified,
  onUploaded,
}: {
  documents: VerificationDocumentDTO[] | null;
  loading: boolean;
  isVerified: boolean;
  onUploaded: () => Promise<void> | void;
}) {
  const [docKind, setDocKind] = useState<VerificationDocKind>('KBIS');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Validation client — mêmes règles que le serveur (défense en profondeur). */
  const validateFile = (file: File): boolean => {
    if (!DOC_ALLOWED_MIME.includes(file.type)) {
      toast.error('Format non supporté — PDF, JPG, PNG ou WebP uniquement.');
      return false;
    }
    if (file.size > DOC_MAX_SIZE) {
      toast.error('Fichier trop volumineux (max 5 Mo).');
      return false;
    }
    return true;
  };

  const handleUpload = async () => {
    if (!docFile) {
      toast.error('Choisissez un fichier à envoyer.');
      return;
    }
    if (!validateFile(docFile)) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('kind', docKind);
      const res = await fetch('/api/provider/documents', { method: 'POST', body: fd });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || "L'envoi a échoué. Réessayez.");
        return;
      }
      toast.success('📄 Document envoyé — en attente de vérification.');
      setDocFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await onUploaded();
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setUploading(false);
    }
  };

  const maxReached = (documents?.length ?? 0) >= 5;

  return (
    <section
      aria-label="Documents de vérification"
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
    >
      {/* En-tête + état du badge profil */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            📄 Documents de vérification
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Vos documents sont vérifiés par l&apos;équipe Conciergerie Hub. Une fois validés,
            votre profil affiche le badge ✓ Vérifié.
          </p>
        </div>
        {isVerified && (
          <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] px-2 shrink-0">
            ✓ Vérifié
          </Badge>
        )}
      </div>

      {/* Liste des documents */}
      {loading && !documents ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : !documents || documents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
          Aucun document fourni — ajoutez votre Kbis et votre attestation d&apos;assurance
          pour accélérer la vérification.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {documents.map((doc) => {
            const kindMeta = DOC_KIND_META[doc.kind];
            return (
              <li key={doc.id} className="py-2.5 flex items-center gap-3">
                <span className="text-lg shrink-0" aria-hidden="true">{kindMeta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{kindMeta.label}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {doc.name} · envoyé le {formatDocDate(doc.uploadedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <DocumentStatusBadge status={doc.status} />
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-semibold text-slate-500 underline underline-offset-2 hover:text-slate-900"
                    aria-label={`Ouvrir le document ${kindMeta.label}`}
                  >
                    Voir
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Upload — masqué au-delà de la limite de 5 documents */}
      {maxReached ? (
        <p className="rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-800">
          Limite de 5 documents atteinte — contactez l&apos;équipe si vous devez remplacer
          un document.
        </p>
      ) : (
        <div className="border-t border-slate-100 pt-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Ajouter un document ({documents?.length ?? 0}/5)
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Select value={docKind} onValueChange={(v) => setDocKind(v as VerificationDocKind)}>
              <SelectTrigger
                aria-label="Type de document"
                className="w-full sm:w-44 bg-white shrink-0"
              >
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KBIS">🏛️ Kbis</SelectItem>
                <SelectItem value="ASSURANCE">🛡️ Assurance</SelectItem>
                <SelectItem value="OTHER">📎 Autre</SelectItem>
              </SelectContent>
            </Select>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && !validateFile(f)) {
                  e.target.value = '';
                  setDocFile(null);
                  return;
                }
                setDocFile(f);
              }}
              aria-label="Fichier du document (PDF, JPG, PNG ou WebP — 5 Mo max)"
              className="block w-full min-w-0 flex-1 text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
            />
            <Button
              onClick={handleUpload}
              disabled={uploading || !docFile}
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold min-h-[44px] sm:min-h-0 shrink-0"
            >
              {uploading ? 'Envoi…' : 'Envoyer'}
            </Button>
          </div>
          <p className="text-[11px] text-slate-400">
            PDF, JPG, PNG ou WebP — 5 Mo max. Statut initial : « En attente ».
          </p>
        </div>
      )}
    </section>
  );
}

export function ProviderDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);

  // ----- FIX-4 : documents de vérification -----
  const [documents, setDocuments] = useState<VerificationDocumentDTO[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docVerified, setDocVerified] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/provider/service-orders', { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setError(json.error || 'Impossible de charger vos commandes.');
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError('Connexion impossible. Réessayez.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  /** FIX-4 — charge les documents de vérification (GET dédié, identité
   *  résolue serveur via la session). */
  const loadDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const res = await fetch('/api/provider/documents', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as
        | { documents?: VerificationDocumentDTO[]; isVerified?: boolean; error?: string }
        | null;
      if (!res.ok || !json) {
        setDocuments(null);
        return;
      }
      setDocuments(Array.isArray(json.documents) ? json.documents : []);
      setDocVerified(Boolean(json.isVerified));
    } catch {
      setDocuments(null);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadDocuments();
    }, 0);
    return () => clearTimeout(t);
  }, [loadDocuments]);

  // ÉTAPE 20 — retour d'onboarding Stripe (?connect=success|refresh) :
  // statut rafraîchi + notification, puis nettoyage de l'URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('connect');
    if (!flag) return;
    if (flag === 'success') toast.success('🏦 Onboarding Stripe complété — vérification du compte…');
    if (flag === 'refresh') toast.info('Onboarding Stripe interrompu — vous pouvez le reprendre.');
    params.delete('connect');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    load();
  }, [load]);

  /** ÉTAPE 20 — lance l'onboarding Connect (URL Stripe ou mode démo). */
  const startConnect = async () => {
    setConnectBusy(true);
    try {
      const res = await fetch('/api/stripe/onboarding', { method: 'POST' });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; mode?: string; url?: string; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Impossible de démarrer la connexion Stripe.');
        return;
      }
      if (json.mode === 'stripe' && json.url) {
        window.location.href = json.url;
        return;
      }
      toast.success('🏦 Compte Stripe Connect activé (mode démo).');
      load();
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setConnectBusy(false);
    }
  };

  /** Transition de statut — mise à jour optimiste avec rollback. */
  const transition = async (order: ProviderOrderDTO, next: OrderStatus) => {
    const prevOrders = data?.orders ?? [];
    setBusyId(order.id);
    setData((d) =>
      d ? { ...d, orders: d.orders.map((o) => (o.id === order.id ? { ...o, status: next } : o)) } : d,
    );
    try {
      const res = await fetch(`/api/provider/service-orders?id=${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setData((d) => (d ? { ...d, orders: prevOrders } : d));
        toast.error(json?.error || 'La mise à jour a échoué.');
        return;
      }
      const meta = ORDER_STATUS_META[next];
      toast.success(
        next === 'DELIVERED'
          ? '📦 Commande marquée livrée — bravo !'
          : next === 'CONFIRMED'
            ? '✅ Commande acceptée — au travail !'
            : `${meta.emoji} Commande ${meta.label.toLowerCase()}${next === 'CANCELLED' ? 'e' : ''}.`,
      );
      load();
    } catch {
      setData((d) => (d ? { ...d, orders: prevOrders } : d));
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setBusyId(null);
    }
  };

  const cat = data ? providerCategoryMeta(data.provider.category) : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ----- En-tête portail ----- */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto w-full px-4 py-4 flex items-center justify-between gap-3">
          <BrandLogo size="sm" />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Portail Prestataire
          </p>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6">
          {loading && !data && <LoadingSkeleton />}

          {!loading && error && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center" role="alert">
              <p className="text-3xl" aria-hidden="true">🔌</p>
              <p className="mt-2 text-sm text-slate-600">{error}</p>
              <Button className="mt-4" onClick={() => load()}>
                Réessayer
              </Button>
            </div>
          )}

          {!loading && data && (
            <>
              {/* ----- Identité prestataire ----- */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <span aria-hidden="true">{cat?.emoji}</span> {data.provider.businessName}
                  </h1>
                  <p className="text-sm text-slate-500 mt-1">
                    {cat?.label}
                    {data.provider.audience === 'GUEST_EXPERIENCE' && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                        Expérience invité
                      </span>
                    )}
                    {data.provider.totalReviews > 0 && (
                      <span className="ml-2">
                        ⭐ {data.provider.ratingAvg.toFixed(1)} ({data.provider.totalReviews} avis)
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-[11px] text-slate-400 sm:text-right leading-snug">
                  Vos commandes arrivent de l&apos;app de vos clients.
                  <br />
                  Acceptez, préparez, livrez — l&apos;hôte suit en direct.
                </p>
              </div>

              {/* ----- Stats ----- */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  emoji="⏳"
                  label="À traiter"
                  value={String(data.stats.activeCount)}
                  hint={`dont ${data.stats.pendingCount} à accepter · ${data.stats.preparingCount} en préparation`}
                  tone={data.stats.pendingCount > 0 ? 'amber' : 'slate'}
                />
                <StatCard
                  emoji="💰"
                  label="CA généré"
                  value={formatEur2(data.stats.revenue)}
                  hint={`dont ${formatEur2(data.stats.paidRevenue)} encaissés`}
                  tone="slate"
                />
                <StatCard
                  emoji="🏦"
                  label="Commission Hub"
                  value={formatEur2(data.stats.commissionTotal)}
                  hint="prélevée par la plateforme"
                  tone="emerald"
                />
                <StatCard
                  emoji="📦"
                  label="Livrées"
                  value={String(data.stats.deliveredCount)}
                  hint="missions accomplies"
                  tone="slate"
                />
              </div>

              {/* ----- Stripe Connect (ÉTAPE 20) ----- */}
              {data.connect && (
                <ConnectBanner connect={data.connect} onStart={startConnect} busy={connectBusy} />
              )}

              {/* ----- Documents de vérification (FIX-4) ----- */}
              <VerificationDocumentsCard
                documents={documents}
                loading={docsLoading}
                isVerified={docVerified}
                onUploaded={loadDocuments}
              />

              {/* ----- Liste des commandes ----- */}
              {data.orders.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                  <p className="text-4xl" aria-hidden="true">🛍️</p>
                  <h2 className="mt-3 text-lg font-bold text-slate-900">Aucune commande pour l&apos;instant</h2>
                  <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                    Dès qu&apos;un invité commandera vos services depuis l&apos;app de son logement,
                    la commande apparaîtra ici avec toutes les informations de livraison.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      {data.orders.length} commande{data.orders.length > 1 ? 's' : ''}
                    </h2>
                    <p className="text-[11px] text-slate-400 hidden sm:block">
                      Cycle : à accepter → confirmée → préparation → livrée
                    </p>
                  </div>
                  <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto custom-scrollbar">
                    {data.orders.map((o) => (
                      <OrderRow key={o.id} order={o} busy={busyId === o.id} onTransition={transition} />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ----- Footer sticky (règle UI : mt-auto) ----- */}
      <footer className="mt-auto bg-white border-t border-slate-200 py-4">
        <div className="max-w-6xl mx-auto w-full px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            🔐 Portail sécurisé — vous ne voyez que vos commandes.
          </p>
          <p className="text-xs text-slate-400">
            Conciergerie Hub — le moteur de transaction de votre conciergerie
          </p>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ emoji, label, value, hint, tone }: {
  emoji: string;
  label: string;
  value: string;
  hint: string;
  tone: 'slate' | 'emerald' | 'amber';
}) {
  const accent =
    tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : 'text-slate-900';
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span aria-hidden="true">{emoji}</span> {label}
      </p>
      <p className={`mt-1.5 text-xl font-bold ${accent}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400 leading-snug">{hint}</p>
    </div>
  );
}

function OrderRow({ order, busy, onTransition }: {
  order: ProviderOrderDTO;
  busy: boolean;
  onTransition: (order: ProviderOrderDTO, next: OrderStatus) => Promise<void>;
}) {
  const status = (ORDER_STATUS_META[order.status as OrderStatus] ?? ORDER_STATUS_META.PENDING) as {
    label: string;
    emoji: string;
    badge: string;
  };
  const items = Array.isArray(order.items) ? (order.items as { name: string; qty: number; unitPrice: number }[]) : [];
  const nextSteps = ORDER_TRANSITIONS[order.status as OrderStatus] ?? [];

  return (
    <li className="px-4 py-3.5 flex flex-col lg:flex-row lg:items-center gap-3">
      {/* Contenu + invité + lignes */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-slate-900">{order.property?.name ?? 'Logement'}</p>
          <Badge className={`${status.badge} text-white border-0 text-[10px] px-2`}>
            {status.emoji} {status.label}
          </Badge>
          <PaymentChip paymentStatus={order.paymentStatus} orderStatus={order.status} />
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Invité&nbsp;: <span className="font-semibold text-slate-700">{order.guestName}</span>
          {order.guestEmail && (
            <>
              {' · '}
              <a href={`mailto:${order.guestEmail}`} className="underline underline-offset-2 hover:text-slate-700">
                {order.guestEmail}
              </a>
            </>
          )}
          {order.deliveryDate && (
            <>
              {' · '}Livraison prévue&nbsp;: {formatFr(order.deliveryDate)}
            </>
          )}
          {' · '}Commandée le {formatFr(order.createdAt)}
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
          <span className="font-semibold text-slate-600">Prestation&nbsp;: </span>
          {items.map((it) => `${it.qty}× ${it.name}`).join(' · ') || '—'}
        </p>
      </div>

      {/* Finances — total + commission Hub uniquement (jamais la part hôte) */}
      <div className="flex lg:flex-col lg:text-right items-center lg:items-end gap-1.5 shrink-0">
        <p className="text-sm font-bold text-slate-900">{formatEur2(order.totalAmount)}</p>
        <p className="text-[11px] text-slate-400">
          Commission Hub&nbsp;: {formatEur2(order.commission)}
        </p>
      </div>

      {/* Actions de cycle de vie */}
      {nextSteps.length > 0 && (
        <div className="flex gap-2 shrink-0">
          {nextSteps.filter((s) => s !== 'CANCELLED').map((s) => (
            <Button
              key={s}
              size="sm"
              disabled={busy}
              onClick={() => onTransition(order, s)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {busy ? '…' : NEXT_ACTION_LABEL[s] ?? s}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onTransition(order, 'CANCELLED')}
            className="text-rose-600 border-rose-200 hover:bg-rose-50"
          >
            Refuser
          </Button>
        </div>
      )}
    </li>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement de vos commandes">
      <Skeleton className="h-16 rounded-xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function formatFr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/** FIX-4 — date courte FR pour l'affichage des documents. */
function formatDocDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}
