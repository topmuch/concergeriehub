import type { Metadata } from 'next';
import { BadgeCheck, History, MapPin, ShieldCheck, ShieldX } from 'lucide-react';
import { db } from '@/lib/db';

// =============================================================
// PWA (Task 42-a) — Page PUBLIQUE « Vérification RoomScan »
//
// Cible des QR codes imprimés sur les badges marketing affichés
// dans les logements : un visiteur (hôte, invité, agent) scanne le
// badge → cette page confirme que le logement est bien suivi par
// RoomScan (onboarding, abonnement, derniers contrôles photo/vidéo).
//
// Page 100 % serveur (lecture directe en base — pas de fetch en
// boucle locale) et STRICTEMENT publique : aucune donnée sensible
// (email, téléphone, adresse exacte, propriétaire) n'est affichée.
// Design system PWA : bleu #1e3a8a, rouge #C41E3A, fond #f8fafc,
// cartes blanches rounded-2xl shadow-sm, mobile first.
// =============================================================

// FIX-CSP-PROD : page dynamique (lecture db à chaque requête)
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: 'Vérification RoomScan' },
  description:
    'Vérification RoomScan : statut du logement, abonnement et derniers contrôles photo/vidéo.',
  robots: { index: false, follow: false },
};

type VerifiedSession = { type: string; status: string; completedAt: string };

type VerifiedShield = {
  active: boolean;
  subscriptionStatus: string;
  onboardingRef: string;
  onboardingStatus: string;
  onboardedAt: string;
  city: string;
  lastSessions: VerifiedSession[];
};

type VerificationData =
  | {
      found: true;
      propertyName: string;
      propertyType: string;
      createdAt: string;
      shield: VerifiedShield | null;
    }
  | { found: false };

/** Lecture directe en base — champs publics uniquement, jamais d'erreur. */
async function loadVerification(propertyId: string): Promise<VerificationData> {
  if (!propertyId || propertyId.length > 64) return { found: false };
  try {
    // 1) Identité primaire : le logement du dashboard hôte (model Property).
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { name: true, propertyType: true, isActive: true, ownerId: true, createdAt: true },
    });
    if (!property || !property.isActive) return { found: false };

    // 2) Enrichissement Bouclier via l'abonnement du propriétaire
    //    (InspectionSubscription.userId @unique → 1 fiche ShieldProperty).
    const subscription = await db.inspectionSubscription.findUnique({
      where: { userId: property.ownerId },
      select: { id: true, status: true, endDate: true },
    });

    let shield: VerifiedShield | null = null;

    if (subscription) {
      const shieldProperty = await db.shieldProperty.findFirst({
        where: { subscriptionId: subscription.id },
        select: {
          id: true,
          propertyName: true,
          city: true,
          onboardingRef: true,
          onboardingStatus: true,
          onboardedAt: true,
        },
      });

      if (shieldProperty) {
        const lastSessions = await db.shieldSession.findMany({
          where: { propertyId: shieldProperty.id },
          orderBy: { completedAt: 'desc' },
          take: 3,
          select: { type: true, status: true, completedAt: true },
        });

        shield = {
          active:
            subscription.status === 'active' && subscription.endDate.getTime() > Date.now(),
          subscriptionStatus: subscription.status,
          onboardingRef: shieldProperty.onboardingRef,
          onboardingStatus: shieldProperty.onboardingStatus,
          onboardedAt: shieldProperty.onboardedAt.toISOString(),
          city: shieldProperty.city,
          lastSessions: lastSessions.map((session) => ({
            type: session.type,
            status: session.status,
            completedAt: session.completedAt.toISOString(),
          })),
        };
      }
    }

    return {
      found: true,
      propertyName: property.name,
      propertyType: property.propertyType,
      createdAt: property.createdAt.toISOString(),
      shield,
    };
  } catch (error) {
    console.error('[verify] erreur de lecture :', error);
    return { found: false };
  }
}

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));

const dateTimeFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

const SESSION_TYPE_LABEL: Record<string, string> = {
  CHECK_IN: 'Entrée',
  CHECK_OUT: 'Sortie',
};

const SESSION_STATUS_LABEL: Record<string, string> = {
  TERMINE: 'Terminé',
  A_VENIR: 'Planifié',
  EN_RETARD: 'En retard',
  ANNULE: 'Annulé',
};

const ONBOARDING_STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Configuration terminée',
  PENDING_PHOTOS: 'Photos de référence en attente',
};

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  AIRBNB: 'Location saisonnière',
  BOOKING: 'Booking.com',
  GITE: 'Gîte',
  CHAMBRE_HOTE: "Chambre d'hôtes",
};

function BrandHeader() {
  return (
    <header className="flex items-center justify-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-xl bg-[#1e3a8a] text-white shadow-sm"
      >
        <ShieldCheck className="size-5" />
      </span>
      <p className="text-lg font-bold tracking-tight text-[#1e3a8a]">
        Room<span className="text-[#C41E3A]">Scan</span>
      </p>
    </header>
  );
}

function NotFoundScreen() {
  return (
    <main className="flex min-h-dvh flex-col bg-[#f8fafc]">
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <BrandHeader />
        <section
          aria-label="Logement introuvable"
          className="mt-8 rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm"
        >
          <p
            aria-hidden="true"
            className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-50 text-amber-500"
          >
            <ShieldX className="size-7" />
          </p>
          <h1 className="mt-4 text-xl font-bold text-gray-900">Logement introuvable</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Aucun logement ne correspond à cette vérification. Le QR code a peut-être été mal
            scanné ou le lien est incomplet.
          </p>
          <a
            href="https://roomscan.pro"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#1e3a8a] px-6 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1a3278]"
          >
            Aller sur roomscan.pro
          </a>
        </section>
      </div>
      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
        roomscan.pro — La preuve en images
      </footer>
    </main>
  );
}

export default async function VerifyPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const data = await loadVerification(propertyId);

  if (!data.found) {
    return <NotFoundScreen />;
  }

  const isVerified = !!data.shield?.active;
  const isCheckIn = (type: string) => type !== 'CHECK_OUT';
  const sessions = data.shield?.lastSessions ?? [];

  return (
    <main className="flex min-h-dvh flex-col bg-[#f8fafc]">
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <BrandHeader />

        {/* ── Carte principale : statut du logement ── */}
        <section aria-label="Statut du logement" className="mt-8 rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
          {isVerified ? (
            <p className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <BadgeCheck className="size-4" aria-hidden="true" />
              Logement vérifié
            </p>
          ) : data.shield ? (
            <p className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Informations limitées
            </p>
          ) : (
            <p className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-[#1e3a8a]">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Logement déclaré
            </p>
          )}

          <h1 className="mt-3 break-words text-xl font-bold text-gray-900">{data.propertyName}</h1>
          <div className="mt-1 flex justify-center">
            <p className="inline-flex items-center gap-1 text-sm text-gray-500">
              <MapPin className="size-4" aria-hidden="true" />
              {data.shield?.city ?? PROPERTY_TYPE_LABEL[data.propertyType] ?? 'Location saisonnière'}
            </p>
          </div>

          {data.shield && (
            <p
              aria-label="Référence d'onboarding"
              className="mx-auto mt-4 inline-block rounded-xl border border-[#1e3a8a]/20 bg-[#f8fafc] px-4 py-2 font-mono text-sm font-bold tracking-wider text-[#1e3a8a]"
            >
              {data.shield.onboardingRef}
            </p>
          )}

          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            {data.shield
              ? `${ONBOARDING_STATUS_LABEL[data.shield.onboardingStatus] ?? 'Logement suivi par RoomScan'}${
                  data.shield.onboardedAt ? ` — configuré le ${dateFr(data.shield.onboardedAt)}` : ''
                } · abonnement ${data.shield.subscriptionStatus}`
              : 'Ce logement est enregistré sur roomscan.pro. Le suivi Bouclier (états des lieux certifiés) nest pas encore actif.'}
          </p>
        </section>

        {/* ── Historique : derniers contrôles ── */}
        <section
          aria-label="Derniers contrôles"
          className="mt-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h2 className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-700">
            <History className="size-4 text-[#1e3a8a]" aria-hidden="true" />
            Derniers contrôles
          </h2>

          {sessions.length === 0 ? (
            <p className="mt-4 text-sm leading-relaxed text-gray-500">
              {data.shield
                ? 'Aucun contrôle enregistré pour le moment.'
                : 'Les contrôles photo et vidéo apparaîtront ici dès que le suivi Bouclier sera actif pour ce logement.'}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-100">
              {sessions.map((session, index) => (
                <li key={`${session.type}-${session.completedAt}-${index}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                        isCheckIn(session.type)
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-red-200 bg-red-50 text-[#C41E3A]'
                      }`}
                    >
                      {SESSION_TYPE_LABEL[session.type] ?? 'Contrôle'}
                    </p>
                    <p className="mt-1 truncate text-xs text-gray-500">
                      {SESSION_STATUS_LABEL[session.status] ?? session.status}
                    </p>
                  </div>
                  <time dateTime={session.completedAt} className="shrink-0 text-xs text-gray-400">
                    {dateTimeFr(session.completedAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-6 text-center text-xs leading-relaxed text-gray-400">
          Ce statut est fourni par RoomScan à partir des contrôles photo et vidéo réalisés à
          l&apos;entrée et à la sortie du logement.
        </p>
      </div>

      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
        roomscan.pro — La preuve en images
      </footer>
    </main>
  );
}
