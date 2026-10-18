'use client';

import { useCallback, useMemo, useRef, useState, type TouchEvent } from 'react';
import { SignaturePad } from '@/components/guest-app/signature-pad';
import { toast } from '@/hooks/use-toast';
import { fileToDefectPhotoDataUrl } from './photo';
import { isElectronicItem } from '@/lib/inspection-template';

// =============================================================
// v4.97 MODULE STANDALONE « ÉTAT DES LIEUX » — FORMULAIRE INVITÉ
// /inspection/<token> — mobile-first max-w-md, clair, strict,
// soigné (rendu premium 99 €). ZÉRO icône / ZÉRO émoji : uniquement
// de la typographie, des pastilles CSS et les glyphes ✓ ‹ › × ● ○.
//
// Parcours : micro-onboarding (3 écrans) → saisie en accordéons
// (pièces + section MÉNAGE distincte) → validation & signature
// canvas → POST /api/inspection/<token>/submit → écran succès +
// téléchargement du PDF juridique.
// Règle produit : un item « Mauvais » exige un commentaire ET une
// photo (contrôle duplicatif côté serveur) ; propreté dégradée ⇒
// photo obligatoire ; chaque item démarre à l'état « Bon » (valeur
// en base) mais la pièce n'est « vérifiée » qu'après un clic sur
// « Tout est en bon état » ou un ajustement explicite complet.
// =============================================================

export type GuestState = 'TRES_BON' | 'BON' | 'MOYEN' | 'MAUVAIS';
export type GuestCleanliness = 'IMPECCABLE' | 'CORRECT' | 'A_NETTOYER' | 'TRES_SALE';

export interface GuestInspectionItem {
  id: string;
  name: string;
  state: string;
  comment?: string | null;
  photoUrl?: string | null;
  photoOnUrl?: string | null;
  photoOffUrl?: string | null;
}

export interface GuestInspectionRoom {
  id: string;
  name: string;
  globalState: string;
  comment?: string | null;
  items: GuestInspectionItem[];
}

export interface GuestInspectionData {
  token: string;
  propertyName: string;
  propertyAddress: string;
  ownerName: string;
  guestName: string;
  type: 'ENTREE' | 'SORTIE';
  scheduledDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  completedAt: string | null;
  signedAt: string | null;
  cleanlinessScore: GuestCleanliness | null;
  cleanlinessComment: string | null;
  cleanlinessPhotoUrl: string | null;
  rooms: GuestInspectionRoom[];
}

const STATES: { key: GuestState; label: string; color: string; selected: string }[] = [
  { key: 'TRES_BON', label: 'Très bon', color: '#16a34a', selected: 'border-green-600 bg-green-50 text-green-700' },
  { key: 'BON', label: 'Bon', color: '#65a30d', selected: 'border-lime-600 bg-lime-50 text-lime-700' },
  { key: 'MOYEN', label: 'Moyen', color: '#d97706', selected: 'border-amber-600 bg-amber-50 text-amber-700' },
  { key: 'MAUVAIS', label: 'Mauvais', color: '#dc2626', selected: 'border-red-600 bg-red-50 text-red-700' },
];

const CLEAN_LEVELS: { key: GuestCleanliness; label: string; color: string; selected: string }[] = [
  { key: 'IMPECCABLE', label: 'Impeccable', color: '#16a34a', selected: 'border-green-600 bg-green-50 text-green-700' },
  { key: 'CORRECT', label: 'Correct', color: '#65a30d', selected: 'border-lime-600 bg-lime-50 text-lime-700' },
  { key: 'A_NETTOYER', label: 'À nettoyer', color: '#d97706', selected: 'border-amber-600 bg-amber-50 text-amber-700' },
  { key: 'TRES_SALE', label: 'Très sale', color: '#dc2626', selected: 'border-red-600 bg-red-50 text-red-700' },
];

const STATE_RANK: Record<string, number> = { TRES_BON: 0, BON: 1, MOYEN: 2, MAUVAIS: 3 };

function stateMeta(key: string) {
  return STATES.find((s) => s.key === key) ?? STATES[1];
}
function cleanMeta(key: string) {
  return CLEAN_LEVELS.find((s) => s.key === key) ?? CLEAN_LEVELS[1];
}

// Fuseau fixe Europe/Paris : évite tout écart d'hydratation
// serveur/navigateur autour des dates proches de minuit.
function frLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
}
function frDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

interface ItemForm {
  state: GuestState;
  comment: string;
  photoUrl: string | null;
  photoOnUrl: string | null;
  photoOffUrl: string | null;
}

/**
 * Tente une lecture GPS silencieuse (jamais bloquante, jamais
 * levante) : « 14.7167° N, 17.4677° W » ou null si refusé/indispo.
 */
async function getGpsLocation(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise<string | null>((resolve) => {
    let settled = false;
    const done = (value: string | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const timer = setTimeout(() => done(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        const { latitude, longitude } = pos.coords;
        done(
          `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}, ` +
            `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`,
        );
      },
      () => {
        clearTimeout(timer);
        done(null);
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 },
    );
  });
}

export default function InspectionGuest({ data }: { data: GuestInspectionData }) {
  // ── Document déjà signé : écran récap + PDF ──
  if (data.status === 'COMPLETED') {
    return <AlreadySignedScreen data={data} />;
  }

  return <GuestForm data={data} />;
}

// =============================================================
// Écran « Document déjà signé »
// =============================================================

function AlreadySignedScreen({ data }: { data: GuestInspectionData }) {
  const downloadPdf = () => {
    window.open(`/api/inspection/pdf/${encodeURIComponent(data.token)}`, '_blank');
  };
  const clean = data.cleanlinessScore ? cleanMeta(data.cleanlinessScore) : null;
  return (
    <main className="flex min-h-screen flex-col bg-zinc-50 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
          RoomScan · États des lieux
        </p>
        <section
          aria-label="Document déjà signé"
          className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <p className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-xl font-bold text-green-600">
            ✓
          </p>
          <h1 className="mt-4 text-center text-xl font-bold text-zinc-900">Document déjà signé</h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-zinc-500">
            Cet état des lieux a été signé
            {data.signedAt ? ` le ${frDateTime(data.signedAt)}` : ''}. Il est consultable et
            téléchargeable à tout moment.
          </p>

          <dl className="mt-6 space-y-3 rounded-2xl bg-zinc-50 p-4 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-zinc-500">Logement</dt>
              <dd className="truncate text-right font-semibold text-zinc-900">{data.propertyName}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-zinc-500">Invité</dt>
              <dd className="text-right font-semibold text-zinc-900">{data.guestName}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-zinc-500">Type</dt>
              <dd className="text-right font-semibold text-zinc-900">
                {data.type === 'SORTIE' ? 'Sortie du logement' : 'Entrée dans le logement'}
              </dd>
            </div>
            {clean && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-zinc-500">Propreté</dt>
                <dd className="flex items-center gap-1.5 text-right font-semibold" style={{ color: clean.color }}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: clean.color }} aria-hidden />
                  {clean.label}
                </dd>
              </div>
            )}
          </dl>

          <button
            type="button"
            onClick={downloadPdf}
            className="mt-6 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            Télécharger mon PDF
          </button>
          <p className="mt-3 text-center text-xs text-zinc-400">
            Un exemplaire a été enregistré par votre hôte.
          </p>
        </section>
      </div>
    </main>
  );
}

// =============================================================
// Formulaire principal (onboarding → saisie → signature → succès)
// =============================================================

type Phase = 'onboarding' | 'form' | 'success';

const ONBOARDING_STEPS = [
  {
    title: 'Sécurisez votre dépôt de garantie en 2 minutes.',
    sub: 'Un état des lieux contradictoire vous protège autant que votre hôte.',
  },
  {
    title: 'Vérifiez, photographiez les défauts, signez.',
    sub: 'Chaque pièce est contrôlée ; un défaut se décrit et se photographie.',
  },
  {
    title: 'Prêt ?',
    sub: 'Vous recevrez votre PDF signé dès la validation.',
  },
];

function GuestForm({ data }: { data: GuestInspectionData }) {
  const firstName = data.guestName.trim().split(/\s+/)[0] || data.guestName;
  const typeLabel = data.type === 'SORTIE' ? 'de sortie' : "d'entrée";

  // ── Phases ──
  const [phase, setPhase] = useState<Phase>('onboarding');
  const [onboardingStep, setOnboardingStep] = useState(0);
  const touchStartX = useRef<number | null>(null);

  // ── Saisie ──
  const [itemForms, setItemForms] = useState<Record<string, ItemForm>>(() => {
    const init: Record<string, ItemForm> = {};
    for (const room of data.rooms) {
      for (const item of room.items) {
        init[item.id] = {
          state: (item.state as GuestState) || 'BON',
          comment: item.comment ?? '',
          photoUrl: item.photoUrl ?? null,
          photoOnUrl: item.photoOnUrl ?? null,
          photoOffUrl: item.photoOffUrl ?? null,
        };
      }
    }
    return init;
  });
  const [touchedRooms, setTouchedRooms] = useState<Record<string, boolean>>({});
  const [openRoom, setOpenRoom] = useState<string | null>(data.rooms[0]?.id ?? null);
  const [cleanlinessOpen, setCleanlinessOpen] = useState(false);

  const [cleanlinessScore, setCleanlinessScore] = useState<GuestCleanliness | null>(null);
  const [cleanlinessComment, setCleanlinessComment] = useState('');
  const [cleanlinessPhoto, setCleanlinessPhoto] = useState<string | null>(null);

  const [approved, setApproved] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [busyPhoto, setBusyPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  // ── Dérivés ──
  const itemIsOk = useCallback(
    (form: ItemForm | undefined) =>
      !!form && (form.state !== 'MAUVAIS' || (form.comment.trim().length > 0 && !!form.photoUrl)),
    [],
  );

  const roomConfirmed = useCallback(
    (room: GuestInspectionRoom) =>
      !!touchedRooms[room.id] && room.items.every((item) => itemIsOk(itemForms[item.id])),
    [touchedRooms, itemForms, itemIsOk],
  );

  const confirmedCount = useMemo(
    () => data.rooms.filter((room) => roomConfirmed(room)).length,
    [data.rooms, roomConfirmed],
  );

  const worstOfRoom = useCallback(
    (room: GuestInspectionRoom): GuestState => {
      let worst: GuestState = 'TRES_BON';
      for (const item of room.items) {
        const state = itemForms[item.id]?.state ?? 'BON';
        if (STATE_RANK[state] > STATE_RANK[worst]) worst = state;
      }
      return worst;
    },
    [itemForms],
  );

  const defects = useMemo(() => {
    const list: { room: string; item: string; complete: boolean }[] = [];
    for (const room of data.rooms) {
      for (const item of room.items) {
        const form = itemForms[item.id];
        if (form?.state === 'MAUVAIS') {
          list.push({ room: room.name, item: item.name, complete: itemIsOk(form) });
        }
      }
    }
    return list;
  }, [data.rooms, itemForms, itemIsOk]);

  // ── Blocages du bouton final (liste explicite affichée en ligne) ──
  const blockers = useMemo(() => {
    const list: string[] = [];
    for (const d of defects) {
      if (!d.complete) list.push(`${d.room} — ${d.item} : description et photo attendues`);
    }
    if (!cleanlinessScore) list.push('Choisissez le niveau de propreté générale');
    else if ((cleanlinessScore === 'A_NETTOYER' || cleanlinessScore === 'TRES_SALE') && !cleanlinessPhoto)
      list.push('Propreté générale : ajoutez une photo justificative');
    if (!signature) list.push('Ajoutez votre signature dans le cadre');
    if (!approved) list.push("Cochez la case d'approbation");
    return list;
  }, [defects, cleanlinessScore, cleanlinessPhoto, signature, approved]);

  // ── Handlers ──
  const setItem = (itemId: string, patch: Partial<ItemForm>) => {
    setItemForms((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  };

  const onItemState = (room: GuestInspectionRoom, itemId: string, state: GuestState) => {
    setTouchedRooms((prev) => ({ ...prev, [room.id]: true }));
    // Retour à un état correct : on efface les justificatifs du
    // défaut (les preuves ON/OFF des appareils restent — preuves
    // de fonctionnement indépendantes de l'état déclaré).
    if (state !== 'MAUVAIS') setItem(itemId, { state, comment: '', photoUrl: null });
    else setItem(itemId, { state });
  };

  const confirmAllGood = (room: GuestInspectionRoom) => {
    setItemForms((prev) => {
      const next = { ...prev };
      for (const item of room.items) {
        next[item.id] = {
          state: 'BON',
          comment: '',
          photoUrl: null,
          photoOnUrl: next[item.id]?.photoOnUrl ?? null,
          photoOffUrl: next[item.id]?.photoOffUrl ?? null,
        };
      }
      return next;
    });
    setTouchedRooms((prev) => ({ ...prev, [room.id]: true }));
    toast({ title: `${room.name} vérifiée`, description: 'Tout est en bon état dans cette pièce.' });
  };

  const pickPhoto = async (key: string, setter: (url: string | null) => void, file?: File | null) => {
    if (!file) return;
    setBusyPhoto(key);
    try {
      const dataUrl = await fileToDefectPhotoDataUrl(file);
      if (!dataUrl) {
        toast({
          title: 'Photo illisible',
          description: 'Ce format de photo ne peut pas être traité. Essayez une image JPEG ou PNG.',
          variant: 'destructive',
        });
      } else {
        setter(dataUrl);
      }
    } finally {
      setBusyPhoto(null);
    }
  };

  const submit = async () => {
    if (blockers.length > 0 || submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      // GPS optionnel (permission navigateur) — jamais bloquant.
      const gpsLocation = await getGpsLocation().catch(() => null);
      const payload = {
        rooms: data.rooms.map((room) => {
          let worst: GuestState = 'TRES_BON';
          const items = room.items.map((item) => {
            const form = itemForms[item.id];
            const state = form?.state ?? 'BON';
            if (STATE_RANK[state] > STATE_RANK[worst]) worst = state;
            const electronic = isElectronicItem(item.name);
            return {
              id: item.id,
              state,
              comment: state === 'MAUVAIS' && form?.comment.trim() ? form.comment.trim() : undefined,
              photoUrl: state === 'MAUVAIS' && form?.photoUrl ? form.photoUrl : undefined,
              photoOnUrl: electronic && form?.photoOnUrl ? form.photoOnUrl : undefined,
              photoOffUrl: electronic && form?.photoOffUrl ? form.photoOffUrl : undefined,
            };
          });
          return { id: room.id, globalState: worst, comment: undefined, items };
        }),
        cleanliness: {
          score: cleanlinessScore as GuestCleanliness,
          comment: cleanlinessComment.trim() || undefined,
          photoUrl: cleanlinessPhoto ?? undefined,
        },
        guestSignature: signature as string,
        approved: true,
        gpsLocation: gpsLocation ?? undefined,
      };
      const res = await fetch(`/api/inspection/${encodeURIComponent(data.token)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json: { ok?: boolean; completedAt?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !json.ok) {
        const message = json.error || 'La signature a échoué. Merci de réessayer.';
        setServerError(message);
        toast({ title: 'Signature impossible', description: message, variant: 'destructive' });
        return;
      }
      setCompletedAt(json.completedAt ?? new Date().toISOString());
      setPhase('success');
      toast({ title: 'État des lieux signé', description: 'Votre PDF est prêt à être téléchargé.' });
    } catch {
      const message = 'Connexion impossible. Vérifiez votre réseau puis réessayez.';
      setServerError(message);
      toast({ title: 'Signature impossible', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPdf = () => {
    window.open(`/api/inspection/pdf/${encodeURIComponent(data.token)}`, '_blank');
  };

  // ── Onboarding : swipe + boutons ──
  const onTouchStart = (e: TouchEvent<HTMLElement>) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent<HTMLElement>) => {
    if (touchStartX.current === null) return;
    const deltaX = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (deltaX < -60 && onboardingStep < ONBOARDING_STEPS.length - 1) setOnboardingStep((s) => s + 1);
    if (deltaX > 60 && onboardingStep > 0) setOnboardingStep((s) => s - 1);
  };

  // ══════════════════════════ RENDU ══════════════════════════

  if (phase === 'success') {
    return (
      <main className="flex min-h-screen flex-col bg-zinc-50 px-4 py-10">
        <div className="mx-auto w-full max-w-md">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            RoomScan · États des lieux
          </p>
          <section
            aria-label="Signature enregistrée"
            className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-center shadow-sm"
          >
            <p className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-xl font-bold text-green-600">
              ✓
            </p>
            <h1 className="mt-4 text-xl font-bold text-zinc-900">
              Merci {firstName} ! Votre état des lieux est signé.
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Signé le {completedAt ? frDateTime(completedAt) : 'à l’instant'}.
            </p>
            <button
              type="button"
              onClick={downloadPdf}
              className="mt-6 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              Télécharger mon PDF
            </button>
            <p className="mt-3 text-xs text-zinc-400">
              Un exemplaire a été enregistré par votre hôte.
            </p>
          </section>
        </div>
      </main>
    );
  }

  if (phase === 'onboarding') {
    const step = ONBOARDING_STEPS[onboardingStep];
    const isLast = onboardingStep === ONBOARDING_STEPS.length - 1;
    return (
      <main className="flex min-h-screen flex-col bg-zinc-50 px-4 py-10">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            RoomScan · États des lieux
          </p>

          <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" aria-hidden />
              {data.propertyName} — état des lieux {typeLabel}
            </p>
            <h1 className="mt-5 text-2xl font-bold leading-snug text-zinc-900">
              {onboardingStep === ONBOARDING_STEPS.length - 1
                ? `Prêt pour ${data.propertyName} ?`
                : step.title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">{step.sub}</p>

            <div className="mt-8 flex items-center justify-center gap-2" aria-hidden>
              {ONBOARDING_STEPS.map((_, i) => (
                <span
                  key={i}
                  className={
                    i === onboardingStep ? 'text-sm text-zinc-900' : 'text-sm text-zinc-300'
                  }
                >
                  {i === onboardingStep ? '●' : '○'}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-8">
            <div className="flex items-center gap-3">
              {onboardingStep > 0 && (
                <button
                  type="button"
                  onClick={() => setOnboardingStep((s) => s - 1)}
                  className="flex min-h-[48px] items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
                >
                  ‹ Retour
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  isLast ? setPhase('form') : setOnboardingStep((s) => s + 1)
                }
                className={
                  isLast
                    ? 'flex min-h-[52px] flex-1 items-center justify-center rounded-xl bg-green-600 text-base font-semibold text-white transition-colors hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600'
                    : 'flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900'
                }
              >
                {isLast ? 'Commencer' : 'Suivant ›'}
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-zinc-400">
              Glissez ou appuyez sur Suivant pour parcourir l&apos;introduction.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ── Phase formulaire ──
  const totalRooms = data.rooms.length;
  const progressPct = totalRooms > 0 ? Math.round((confirmedCount / totalRooms) * 100) : 0;

  return (
    <main className="min-h-screen bg-zinc-50 pb-16">
      {/* En-tête collant */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-4 pb-3 pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="truncate text-sm font-bold text-zinc-900">{data.propertyName}</h1>
            <p className="shrink-0 text-xs text-zinc-500">
              {data.guestName} · {typeLabel}
            </p>
          </div>
          {totalRooms > 0 && (
            <div className="mt-2">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100"
                role="progressbar"
                aria-valuenow={confirmedCount}
                aria-valuemin={0}
                aria-valuemax={totalRooms}
                aria-label="Pièces vérifiées"
              >
                <div
                  className="h-full rounded-full bg-green-600 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {confirmedCount} / {totalRooms} pièces vérifiées
              </p>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-4">
        {/* Erreur serveur */}
        {serverError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {serverError}
          </div>
        )}

        {/* Contexte */}
        <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">{data.propertyName}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{data.propertyAddress}</p>
          <p className="mt-2 text-xs text-zinc-500">
            État des lieux {typeLabel} — prévu le {frLongDate(data.scheduledDate)} · Propriétaire :{' '}
            {data.ownerName}
          </p>
        </section>

        {/* Accordéons pièces */}
        <div className="mt-4 space-y-3">
          {data.rooms.map((room) => {
            const open = openRoom === room.id;
            const confirmed = roomConfirmed(room);
            const worst = worstOfRoom(room);
            const worstMeta = stateMeta(worst);
            return (
              <section
                key={room.id}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenRoom(open ? null : room.id)}
                  className="flex w-full min-h-[56px] items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-400"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-zinc-900">
                      {room.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {confirmed ? 'Vérifiée ✓' : `${room.items.length} éléments à contrôler`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{ backgroundColor: `${worstMeta.color}14`, color: worstMeta.color }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: worstMeta.color }}
                        aria-hidden
                      />
                      {worstMeta.label}
                    </span>
                    <span
                      aria-hidden
                      className={`text-base text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}
                    >
                      ›
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="border-t border-zinc-100 p-4">
                    <button
                      type="button"
                      onClick={() => confirmAllGood(room)}
                      className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-green-600 text-sm font-semibold text-white transition-colors hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
                    >
                      Tout est en bon état dans cette pièce
                    </button>

                    <div className="mt-4 space-y-5">
                      {room.items.map((item) => {
                        const form =
                          itemForms[item.id] ??
                          { state: 'BON' as GuestState, comment: '', photoUrl: null, photoOnUrl: null, photoOffUrl: null };
                        const isBad = form.state === 'MAUVAIS';
                        const isElectronic = isElectronicItem(item.name);
                        const photoKey = `item:${item.id}`;
                        return (
                          <div key={item.id}>
                            <p className="text-sm font-medium text-zinc-800">
                              {item.name}
                              {isElectronic && (
                                <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 align-middle text-[10px] font-semibold text-zinc-500">
                                  ON / OFF
                                </span>
                              )}
                            </p>
                            <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label={`État de ${item.name}`}>
                              {STATES.map((s) => {
                                const selected = form.state === s.key;
                                return (
                                  <button
                                    key={s.key}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => onItemState(room, item.id, s.key)}
                                    className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[10px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-400 ${
                                      selected
                                        ? s.selected
                                        : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50'
                                    }`}
                                  >
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: s.color }}
                                      aria-hidden
                                    />
                                    {s.label}
                                  </button>
                                );
                              })}
                            </div>

                            {isElectronic && (
                              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                                <p className="text-xs font-semibold text-zinc-700">
                                  Preuve de fonctionnement — appareil électronique
                                </p>
                                <p className="mt-0.5 text-[11px] text-zinc-500">
                                  Optionnel : une photo de l&apos;appareil allumé (ON) et une photo éteint (OFF).
                                </p>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  {(['on', 'off'] as const).map((mode) => {
                                    const isOn = mode === 'on';
                                    const url = isOn ? form.photoOnUrl : form.photoOffUrl;
                                    const slotKey = `item:${item.id}:${mode}`;
                                    const inputId = `photo-${item.id}-${mode}`;
                                    return (
                                      <div key={mode}>
                                        <input
                                          id={inputId}
                                          type="file"
                                          accept="image/*"
                                          capture="environment"
                                          className="sr-only"
                                          onChange={(e) => {
                                            void pickPhoto(slotKey, (next) =>
                                              setItem(item.id, isOn ? { photoOnUrl: next } : { photoOffUrl: next }),
                                              e.target.files?.[0],
                                            );
                                            e.target.value = '';
                                          }}
                                        />
                                        <label
                                          htmlFor={inputId}
                                          className="flex min-h-[40px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
                                        >
                                          {busyPhoto === slotKey
                                            ? '…'
                                            : url
                                              ? isOn
                                                ? 'Photo ON ✓'
                                                : 'Photo OFF ✓'
                                              : isOn
                                                ? 'Photo ON'
                                                : 'Photo OFF'}
                                        </label>
                                        {url && (
                                          <div className="relative mt-1.5 inline-block">
                                            <img
                                              src={url}
                                              alt={`Photo ${isOn ? 'appareil allumé' : 'appareil éteint'} — ${item.name}`}
                                              className="h-16 w-16 rounded-lg border border-zinc-200 object-cover"
                                            />
                                            <button
                                              type="button"
                                              aria-label={isOn ? 'Retirer la photo allumé' : 'Retirer la photo éteint'}
                                              onClick={() =>
                                                setItem(item.id, isOn ? { photoOnUrl: null } : { photoOffUrl: null })
                                              }
                                              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-900"
                                            >
                                              ×
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {isBad && (
                              <div className="mt-3 space-y-3 rounded-xl border border-red-100 bg-red-50/60 p-3">
                                <div>
                                  <label
                                    htmlFor={`comment-${item.id}`}
                                    className="block text-xs font-semibold text-zinc-700"
                                  >
                                    Décrivez le constat
                                  </label>
                                  <textarea
                                    id={`comment-${item.id}`}
                                    value={form.comment}
                                    onChange={(e) => setItem(item.id, { comment: e.target.value })}
                                    rows={2}
                                    maxLength={2000}
                                    placeholder="Ex. : rayure profonde sur le plan de travail"
                                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline focus:outline-2 focus:outline-zinc-400"
                                  />
                                </div>
                                <div>
                                  <span className="block text-xs font-semibold text-zinc-700">
                                    Photographier le défaut
                                  </span>
                                  <input
                                    id={`photo-${item.id}`}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="sr-only"
                                    onChange={(e) => {
                                      void pickPhoto(photoKey, (url) => setItem(item.id, { photoUrl: url }), e.target.files?.[0]);
                                      e.target.value = '';
                                    }}
                                  />
                                  <label
                                    htmlFor={`photo-${item.id}`}
                                    className="mt-1 flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
                                  >
                                    {busyPhoto === photoKey
                                      ? 'Compression…'
                                      : form.photoUrl
                                        ? 'Remplacer la photo'
                                        : 'Choisir une photo'}
                                  </label>
                                  {form.photoUrl && (
                                    <div className="relative mt-2 inline-block">
                                      <img
                                        src={form.photoUrl}
                                        alt={`Photo du défaut — ${item.name}`}
                                        className="h-20 w-20 rounded-lg border border-zinc-200 object-cover"
                                      />
                                      <button
                                        type="button"
                                        aria-label="Retirer la photo"
                                        onClick={() => setItem(item.id, { photoUrl: null })}
                                        className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-900"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  )}
                                  {!form.photoUrl && (
                                    <p className="mt-1 text-xs text-red-600">
                                      Photo obligatoire pour un défaut signalé.
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {room.items.length === 0 && (
                        <p className="text-xs text-zinc-400">Aucun élément répertorié pour cette pièce.</p>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          {/* Section MÉNAGE distincte */}
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <button
              type="button"
              aria-expanded={cleanlinessOpen}
              onClick={() => setCleanlinessOpen((v) => !v)}
              className="flex w-full min-h-[56px] items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-400"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-zinc-900">
                  Propreté générale du logement
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  {cleanlinessScore ? cleanMeta(cleanlinessScore).label : 'Niveau à choisir'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {cleanlinessScore && (
                  <span
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: `${cleanMeta(cleanlinessScore).color}14`,
                      color: cleanMeta(cleanlinessScore).color,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: cleanMeta(cleanlinessScore).color }}
                      aria-hidden
                    />
                    {cleanMeta(cleanlinessScore).label}
                  </span>
                )}
                <span
                  aria-hidden
                  className={`text-base text-zinc-400 transition-transform ${cleanlinessOpen ? 'rotate-90' : ''}`}
                >
                  ›
                </span>
              </span>
            </button>

            {cleanlinessOpen && (
              <div className="border-t border-zinc-100 p-4">
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Niveau de propreté générale">
                  {CLEAN_LEVELS.map((level) => {
                    const selected = cleanlinessScore === level.key;
                    return (
                      <button
                        key={level.key}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setCleanlinessScore(level.key)}
                        className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-400 ${
                          selected
                            ? level.selected
                            : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50'
                        }`}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: level.color }}
                          aria-hidden
                        />
                        {level.label}
                      </button>
                    );
                  })}
                </div>

                {cleanlinessScore && cleanlinessScore !== 'IMPECCABLE' && cleanlinessScore !== 'CORRECT' && (
                  <div className="mt-4 space-y-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                    <div>
                      <span className="block text-xs font-semibold text-zinc-700">
                        Photographier l&apos;état général
                      </span>
                      <input
                        id="photo-cleanliness"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={(e) => {
                          void pickPhoto('cleanliness', setCleanlinessPhoto, e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                      <label
                        htmlFor="photo-cleanliness"
                        className="mt-1 flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
                      >
                        {busyPhoto === 'cleanliness'
                          ? 'Compression…'
                          : cleanlinessPhoto
                            ? 'Remplacer la photo'
                            : 'Choisir une photo'}
                      </label>
                      {cleanlinessPhoto && (
                        <div className="relative mt-2 inline-block">
                          <img
                            src={cleanlinessPhoto}
                            alt="Photo de l'état général du logement"
                            className="h-20 w-20 rounded-lg border border-zinc-200 object-cover"
                          />
                          <button
                            type="button"
                            aria-label="Retirer la photo"
                            onClick={() => setCleanlinessPhoto(null)}
                            className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-900"
                          >
                            ×
                          </button>
                        </div>
                      )}
                      {!cleanlinessPhoto && (
                        <p className="mt-1 text-xs text-red-600">
                          Photo obligatoire pour un logement à nettoyer ou très sale.
                        </p>
                      )}
                    </div>
                    <div>
                      <label
                        htmlFor="comment-cleanliness"
                        className="block text-xs font-semibold text-zinc-700"
                      >
                        Commentaire (facultatif)
                      </label>
                      <textarea
                        id="comment-cleanliness"
                        value={cleanlinessComment}
                        onChange={(e) => setCleanlinessComment(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        placeholder="Ex. : sols de la cuisine non lavés, poubelles pleines"
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline focus:outline-2 focus:outline-zinc-400"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Validation & signature */}
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-zinc-900">Validation &amp; signature</h2>

          {defects.length > 0 && (
            <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
              <p className="text-xs font-semibold text-red-700">
                {defects.length} défaut{defects.length > 1 ? 's' : ''} photographié
                {defects.length > 1 ? 's' : ''}
              </p>
              <ul className="mt-1 space-y-0.5">
                {defects.map((d) => (
                  <li key={`${d.room}-${d.item}`} className="text-xs text-red-600">
                    ● {d.room} — {d.item}
                    {!d.complete && ' (à compléter)'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label
            htmlFor="approval"
            className="mt-4 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl bg-zinc-50 p-3 text-sm leading-snug text-zinc-700"
          >
            <input
              id="approval"
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-300 accent-green-600"
            />
            <span>
              J&apos;ai lu et j&apos;approuve cet état des lieux, je certifie exacte la description
              des lieux.
            </span>
          </label>

          <div className="mt-4">
            <p className="mb-2 block text-xs font-semibold text-zinc-700">
              Signature de l&apos;invité — {data.guestName}
            </p>
            <SignaturePad onChange={setSignature} />
          </div>

          {blockers.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-700">Avant de valider :</p>
              <ul className="mt-1 space-y-0.5">
                {blockers.map((b) => (
                  <li key={b} className="text-xs text-amber-700">
                    ● {b}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-green-50 px-3 py-2.5 text-xs font-semibold text-green-700">
              ✓ Tout est complet — vous pouvez valider votre état des lieux.
            </p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={blockers.length > 0 || submitting}
            className={`mt-4 flex min-h-[52px] w-full items-center justify-center rounded-xl text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 ${
              blockers.length > 0 || submitting
                ? 'cursor-not-allowed bg-zinc-200 text-zinc-400'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {submitting ? 'Envoi en cours…' : 'Valider et recevoir mon PDF'}
          </button>
        </section>

        <p className="mt-6 text-center text-xs text-zinc-400">
          RoomScan · {data.propertyName} · {frLongDate(data.scheduledDate)}
        </p>
      </div>
    </main>
  );
}
