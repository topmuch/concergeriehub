import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import CleanerCapture from '@/components/inspection/shield/cleaner-capture';
import { PwaInstallBanner } from '@/components/pwa/pwa-install-banner';
import { loadCleanerSession } from '@/lib/shield-cleaner';

// =============================================================
// ROOMSCAN BOUCLIER V2 — FLUX A « APP CLEANER » — /s/[token]
//
// Page PUBLIQUE ouverte via le lien magique partagé par l'hôte à
// son agent de ménage (WhatsApp/SMS depuis « Ménage à faire »).
//   · token inconnu            → écran sobre « Lien invalide » ;
//   · session déjà réalisée    → confirmation + référence ;
//   · session annulée par l'hôte → écran dédié ;
//   · session à réaliser       → l'app cleaner (photos fantômes +
//     vidéo walkthrough ≤ 120 s) qui CONSOMME la session.
// Aucune donnée sensible (email/téléphone) ne quitte le serveur.
// =============================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const session = await loadCleanerSession(token);
  return {
    title: session
      ? `Intervention Bouclier — ${session.propertyName}`
      : 'Intervention Bouclier — lien invalide',
    robots: { index: false, follow: false },
  };
}

function SoberScreen({
  tone,
  title,
  children,
}: {
  tone: 'error' | 'ok' | 'neutral';
  title: string;
  children: React.ReactNode;
}) {
  const toneCls =
    tone === 'error'
      ? 'bg-red-50 text-red-500'
      : tone === 'ok'
        ? 'bg-emerald-50 text-emerald-600'
        : 'bg-zinc-100 text-zinc-400';
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 py-16">
      <section
        aria-label={title}
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm"
      >
        <p
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${toneCls}`}
        >
          <ShieldCheck className="size-6" aria-hidden="true" />
        </p>
        <h1 className="mt-4 text-xl font-bold text-zinc-900">{title}</h1>
        <div className="mt-2 text-sm leading-relaxed text-zinc-500">{children}</div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          RoomScan · Bouclier
        </p>
      </section>
    </main>
  );
}

export default async function CleanerSessionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await loadCleanerSession(token);

  // ── Token inconnu : écran sobre, pas de trace technique ──
  if (!session) {
    return (
      <SoberScreen tone="error" title="Lien invalide ou expiré">
        <p>
          Cette intervention n&apos;existe pas ou le lien a été mal recopié. Demandez un nouveau
          lien à votre hôte pour poursuivre.
        </p>
      </SoberScreen>
    );
  }

  const isCheckIn = session.type === 'CHECK_IN';
  const when = session.scheduledDate
    ? new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(session.scheduledDate))
    : null;

  // ── Session déjà réalisée ──
  if (session.status === 'TERMINE') {
    return (
      <SoberScreen tone="ok" title="Intervention déjà réalisée">
        <p>
          Le {isCheckIn ? 'check-in' : 'check-out'} du logement{' '}
          <strong className="text-zinc-700">{session.propertyName}</strong> a déjà été enregistré
          {when ? ` (prévu le ${when})` : ''}. Le certificat PDF a été envoyé à l&apos;hôte.
        </p>
        <p
          className="mx-auto mt-4 inline-block rounded-xl border border-[#C21F26]/30 bg-red-50 px-4 py-2 font-mono text-sm font-bold tracking-wider text-[#C21F26]"
          aria-label="Référence de la session"
        >
          {session.sessionRef}
        </p>
      </SoberScreen>
    );
  }

  // ── Session annulée par l'hôte ──
  if (session.status === 'ANNULE') {
    return (
      <SoberScreen tone="neutral" title="Intervention annulée">
        <p>
          Ce {isCheckIn ? 'check-in' : 'check-out'} du logement{' '}
          <strong className="text-zinc-700">{session.propertyName}</strong> a été annulé par
          l&apos;hôte. Aucune action n&apos;est requise de votre part.
        </p>
      </SoberScreen>
    );
  }

  // ── Session à réaliser (A_VENIR ou EN_RETARD) → app cleaner ──
  // PWA (Task 42-a) : le bouton « Installer l'app » (en haut) capte
  // beforeinstallprompt et enregistre le Service Worker (mauvaise 4G).
  return (
    <>
      <PwaInstallBanner variant="button" />
      <CleanerCapture data={session} />
    </>
  );
}
