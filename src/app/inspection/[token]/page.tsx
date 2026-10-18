import type { Metadata } from 'next';
import { db } from '@/lib/db';
import InspectionGuest, { type GuestInspectionData } from '@/components/inspection/guest/inspection-guest';

// =============================================================
// v4.97 MODULE STANDALONE « ÉTAT DES LIEUX » — PAGE PUBLIQUE INVITÉ
// /inspection/<token> — ouverte via roomscan.pro/i/<token>.
// Server Component : charge l'inspection par publicToken (rooms →
// items) et transmet un payload minimal au formulaire client.
//
// Confidentialité : guestEmail/guestPhone ne quittent JAMAIS le
// serveur ; si l'inspection est déjà signée (status COMPLETED),
// les dataURL des photos sont exclues du payload (les compteurs
// suffisent) — avant signature il n'existe aucune photo par défaut.
// Token inconnu → écran sobre « Lien invalide ou expiré ».
// =============================================================

export const dynamic = 'force-dynamic';

async function loadInspection(token: string) {
  return db.inspection.findUnique({
    where: { publicToken: token },
    include: {
      rooms: {
        orderBy: { sortOrder: 'asc' },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      },
    },
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
      ? `État des lieux — ${inspection.propertyName}`
      : 'État des lieux — lien invalide',
    robots: { index: false, follow: false },
  };
}

export default async function InspectionGuestPage({
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

  const signed = inspection.status === 'COMPLETED';

  const data: GuestInspectionData = {
    token: inspection.publicToken,
    propertyName: inspection.propertyName,
    propertyAddress: inspection.propertyAddress,
    ownerName: inspection.ownerName,
    guestName: inspection.guestName,
    type: inspection.type === 'SORTIE' ? 'SORTIE' : 'ENTREE',
    scheduledDate: inspection.scheduledDate.toISOString(),
    status: inspection.status === 'COMPLETED' ? 'COMPLETED' : inspection.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'PENDING',
    completedAt: inspection.completedAt?.toISOString() ?? null,
    signedAt: inspection.signedAt?.toISOString() ?? null,
    cleanlinessScore:
      inspection.cleanlinessScore === 'IMPECCABLE' ||
      inspection.cleanlinessScore === 'CORRECT' ||
      inspection.cleanlinessScore === 'A_NETTOYER' ||
      inspection.cleanlinessScore === 'TRES_SALE'
        ? inspection.cleanlinessScore
        : null,
    cleanlinessComment: inspection.cleanlinessComment,
    // dataURL volumineuse : exclue une fois le document signé.
    cleanlinessPhotoUrl: signed ? null : inspection.cleanlinessPhotoUrl,
    rooms: inspection.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      globalState: room.globalState,
      comment: room.comment,
      items: room.items.map((item) => ({
        id: item.id,
        name: item.name,
        state: item.state,
        comment: item.comment,
        photoUrl: signed ? null : item.photoUrl,
        // Preuves ON/OFF (appareils électroniques) — volumineuses :
        // exclues une fois le document signé.
        photoOnUrl: signed ? null : item.photoOnUrl,
        photoOffUrl: signed ? null : item.photoOffUrl,
      })),
    })),
  };

  return <InspectionGuest data={data} />;
}
