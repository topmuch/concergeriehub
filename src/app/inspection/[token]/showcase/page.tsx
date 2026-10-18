import type { Metadata } from 'next';
import { db } from '@/lib/db';
import ShowcaseContent, { type ShowcaseData } from '@/components/inspection/guest/showcase-content';

// =============================================================
// v4.98 VITRINE « EFFET WAHOU » — ÉTAT DES LIEUX (SHOWCASE)
// /inspection/<token>/showcase — affichée quand un invité consulte
// le lien du logement HORS fenêtre de réservation.
//
// Server Component : charge l'inspection par publicToken (SANS les
// rooms — inutile pour la vitrine) et transmet un payload minimal
// au composant client immersif.
//
// Confidentialité : guestEmail/guestPhone ne quittent JAMAIS le
// serveur ; aucune donnée de document (rooms, photos, signature)
// n'est exposée ici. Token inconnu → écran sobre « Lien invalide
// ou expiré » (identique à la page principale). SEO : noindex.
// =============================================================

export const dynamic = 'force-dynamic';

async function loadInspection(token: string) {
  return db.inspection.findUnique({
    where: { publicToken: token },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const inspection = await loadInspection(token);
  return {
    title: inspection
      ? `Vitrine — ${inspection.propertyName}`
      : 'Vitrine — lien invalide',
    robots: { index: false, follow: false },
  };
}

export default async function InspectionShowcasePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const inspection = await loadInspection(token);

  // ── Token inconnu : écran sobre, pas de trace technique ──
  if (!inspection) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-16">
        <section
          aria-label="Lien invalide"
          className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm"
        >
          <p className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-xl font-bold text-zinc-400">
            ×
          </p>
          <h1 className="mt-4 text-xl font-bold text-zinc-900">Lien invalide ou expiré</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            Cet état des lieux n&apos;existe pas ou le lien a été mal recopié. Demandez un nouveau
            lien à votre hôte pour poursuivre.
          </p>
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            RoomScan · États des lieux
          </p>
        </section>
      </main>
    );
  }

  const data: ShowcaseData = {
    token: inspection.publicToken,
    propertyName: inspection.propertyName,
    ownerName: inspection.ownerName,
    type: inspection.type === 'SORTIE' ? 'SORTIE' : 'ENTREE',
    status:
      inspection.status === 'COMPLETED'
        ? 'COMPLETED'
        : inspection.status === 'IN_PROGRESS'
          ? 'IN_PROGRESS'
          : 'PENDING',
    scheduledDate: inspection.scheduledDate.toISOString(),
    guestName: inspection.guestName,
  };

  return <ShowcaseContent data={data} />;
}
