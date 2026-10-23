import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { AdaptiveVideo } from '@/components/inspection/shield/adaptive-video';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Preuve vidéo — Roomscan Inventaire',
  description:
    'Vidéo walkthrough certifiée SHA-256 — preuve de re-validation globale de la bibliothèque de référence.',
  robots: { index: false, follow: false },
};

const frDateTime = (d: Date) =>
  d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

// =============================================================
// PAGE PUBLIE « PREUVE VIDÉO » — ROOMSCAN BOUCLIER AUTOMATISÉ
// Accessible via le QR code géant du PDF (token 24 car.). Affiche
// le lecteur de la vidéo walkthrough 30 s + le hash SHA-256 +
// le certificat de session associé. Thème Bouclier (rouge/noir).
// =============================================================
export default async function ShieldVideoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const video = await db.shieldVideo.findUnique({
    where: { publicToken: token },
    include: {
      session: {
        include: {
          property: {
            select: { propertyName: true, propertyAddress: true, city: true, onboardingRef: true },
          },
          shots: { orderBy: { capturedAt: 'asc' }, select: { zoneName: true, status: true } },
        },
      },
    },
  });

  if (!video) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#141416] p-6 text-center">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-8 py-10 backdrop-blur-xl">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#C21F26] text-xl font-black text-white">
            !
          </span>
          <h1 className="text-lg font-bold text-white">Preuve vidéo introuvable</h1>
          <p className="mt-2 max-w-sm text-sm text-white/60">
            Ce lien de vérification est invalide ou la vidéo a été supprimée.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full bg-[#C21F26] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-110"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </main>
    );
  }

  const s = video.session;
  const impeccable = s.shots.filter((x) => x.status === 'IMPECCABLE').length;
  const sizeMo = (video.sizeBytes / 1_000_000).toFixed(1);

  return (
    <main className="min-h-screen bg-[#141416] pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* Bandeau rouge Bouclier */}
      <header className="bg-[#C21F26] px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-lg"
          >
            🔒
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-black tracking-wide text-white">ROOMSCAN INVENTAIRE</p>
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-white/85">
              Vidéo walkthrough certifiée — {s.property.city}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        {/* Lecteur vidéo */}
        <section
          aria-label="Vidéo walkthrough"
          className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
        >
          {/* Walkthrough sans piste audio — v5.15 : lecteur au vrai format
              de la vidéo (portrait téléphone), plus de bandes noires. */}
          <AdaptiveVideo
            src={`/api/shield/video/${video.publicToken}`}
            ariaLabel="Vidéo walkthrough"
          />
        </section>

        {/* Certificat */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-base font-bold text-white sm:text-lg">
              {s.type === 'CHECK_OUT' ? 'CHECK-OUT' : 'CHECK-IN'} — {s.property.propertyName}
            </h1>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-300">
              VIDÉO VALIDÉE
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="text-[11px] uppercase tracking-wider text-white/50">Référence</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-white">{s.sessionRef}</dd>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="text-[11px] uppercase tracking-wider text-white/50">Agent</dt>
              <dd className="mt-0.5 font-medium text-white">{s.agentName}</dd>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="text-[11px] uppercase tracking-wider text-white/50">Date &amp; heure</dt>
              <dd className="mt-0.5 font-medium text-white">{frDateTime(s.completedAt)}</dd>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="text-[11px] uppercase tracking-wider text-white/50">Fichier</dt>
              <dd className="mt-0.5 font-medium text-white">
                {video.durationSec} s · {sizeMo} Mo · {video.mimeType.replace('video/', '').toUpperCase()}
              </dd>
            </div>
          </dl>

          {/* Hash SHA-256 */}
          <div className="mt-4 rounded-xl border border-white/10 bg-[#0d0d0f] p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#C21F26]">
              Hash de vérification SHA256
            </p>
            <p className="mt-1.5 break-all font-mono text-[12px] leading-relaxed text-white/90">
              sha256: {video.sha256.toUpperCase()}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
              <span aria-hidden="true">✓</span> Intégrité vérifiée · Horodatage électronique{' '}
              {frDateTime(video.createdAt)}
            </p>
          </div>

          {/* Zones re-validées */}
          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
              Re-validation des zones ({impeccable}/{s.shots.length} impeccables)
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Zones contrôlées">
              {s.shots.map((z, i) => (
                <li
                  key={`${z.zoneName}-${i}`}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/85"
                >
                  {z.zoneName}
                  {z.status !== 'IMPECCABLE' && (
                    <span className="ml-1 font-bold text-amber-300">⚠</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-white/50">
              Cette vidéo constitue la preuve de re-validation globale de la bibliothèque de
              référence du logement (onboarding {s.property.onboardingRef ?? ''}). Les photos
              d&apos;équipements de référence restent valables — la vidéo du jour prouve leur bon
              état actuel.
            </p>
          </div>
        </section>

        <footer className="rounded-xl bg-black/40 px-4 py-3 text-center">
          <p className="text-[11px] text-white/60">
            Document automatisé <span className="font-bold text-white/85">Roomscan Inventaire</span> ·
            Conforme RGPD · Toute contestation sous 48 h
          </p>
        </footer>
      </div>
    </main>
  );
}
