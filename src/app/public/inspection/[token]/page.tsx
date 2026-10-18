import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { PrintButton } from './print-button';

// =============================================================
// v5.0 « ÉTAT DES LIEUX » — PAGE PUBLIQUE DE PREUVE (sans auth)
// /public/inspection/[token]
//
// Document de preuve officiel RoomScan, consultable à vie via son
// jeton (emails invité/hôte, encart du formulaire). Deux variantes :
//   • SORTIE — CheckOutInspection : pièces, badges d'état (+ badge
//     « Entrée » si l'inspection d'arrivée du séjour est connue),
//     photos, commentaires, auto-évaluation, signature, footer légal ;
//   • ENTRÉE — MinibarCheck : version simplifiée (inventaire validé).
// Server Component (dynamic = force-dynamic), design clair neutre
// stone/slate + émeraude. L'email invité est masqué (j***@domaine).
// =============================================================

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Document de preuve officiel — RoomScan',
  robots: { index: false, follow: false },
};

const frFull = (d: Date) =>
  d.toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Masque un email : j***@domaine. */
function maskEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  return `${local.charAt(0)}***@${domain}`;
}

const ROOMS: { id: string; label: string; emoji: string }[] = [
  { id: 'entrance', label: 'Entrée / Couloir', emoji: '🚪' },
  { id: 'kitchen', label: 'Cuisine', emoji: '🍳' },
  { id: 'livingRoom', label: 'Salon / Séjour', emoji: '🛋️' },
  { id: 'bedrooms', label: 'Chambres', emoji: '🛏️' },
  { id: 'bathroom', label: 'Salle de bain', emoji: '🛁' },
];

const STATUS_META: Record<string, { label: string; className: string }> = {
  good: {
    label: 'Bon état',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  dirty: {
    label: 'Sale',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  damaged: {
    label: 'Endommagé',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
};

interface RoomsDataItem {
  id: string;
  label: string;
  status: string;
  comment: string | null;
  photoCount: number;
}

function parseRooms(raw: unknown): RoomsDataItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      id: typeof r.id === 'string' ? r.id : '',
      label: typeof r.label === 'string' ? r.label : '',
      status: typeof r.status === 'string' ? r.status : 'good',
      comment: typeof r.comment === 'string' ? r.comment : null,
      photoCount: typeof r.photoCount === 'number' ? r.photoCount : 0,
    }))
    .filter((r) => r.id);
}

function parsePhotos(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === 'string' && p.startsWith('data:image/'));
}

function parseInventory(raw: unknown): { keys: number; remotes: number; towels: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  const keys = num(o.keys);
  const remotes = num(o.remotes);
  const towels = num(o.towels);
  if (keys === null && remotes === null && towels === null) return null;
  return { keys: keys ?? 0, remotes: remotes ?? 0, towels: towels ?? 0 };
}

// ---------- Sous-blocs de présentation ----------

function LegalFooter({ id, token, ip, at }: { id: string; token: string; ip?: string | null; at: Date }) {
  return (
    <footer className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4 text-[11px] leading-relaxed text-stone-500">
      <p>
        Document généré électroniquement — ID <span className="font-mono">{id}</span> · Jeton{' '}
        <span className="font-mono break-all">{token}</span>
        {ip ? (
          <>
            {' '}· IP <span className="font-mono">{ip}</span>
          </>
        ) : null}
      </p>
      <p className="mt-1">Horodatage : {frFull(at)} — Preuve éditée par RoomScan (roomscan.pro), consultable en ligne à vie.</p>
    </footer>
  );
}

function ActionButtons({ token }: { token: string }) {
  return (
    <div className="mt-5 flex flex-wrap gap-3 print:hidden">
      <a
        href={`/api/public/inspection/${token}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
      >
        📄 Télécharger le PDF
      </a>
      <PrintButton />
    </div>
  );
}

function PropertyCard({ name, address }: { name: string; address: string | null }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Logement concerné</p>
      <h2 className="mt-1 text-lg font-bold text-stone-900">{name}</h2>
      {address && <p className="mt-0.5 text-sm text-stone-500">{address}</p>}
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`Auto-évaluation : ${value} sur 5`} className="text-lg leading-none text-amber-400">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= value ? '' : 'text-stone-300'}>
          ★
        </span>
      ))}
      <span className="ml-2 align-middle text-sm font-bold text-stone-700">{value}/5</span>
    </span>
  );
}

// ---------- Page ----------

export default async function PublicInspectionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cleanToken = token.trim().slice(0, 80);
  if (!cleanToken) notFound();

  // ── 1. État des lieux de SORTIE ──
  const inspection = await db.checkOutInspection.findUnique({
    where: { publicToken: cleanToken },
    select: {
      id: true,
      publicToken: true,
      guestName: true,
      guestEmail: true,
      ipAddress: true,
      signedAt: true,
      type: true,
      selfAssessment: true,
      issues: true,
      damages: true,
      roomsData: true,
      damagePhotos: true,
      inventoryCheck: true,
      minibarData: true,
      guestSignature: true,
      bookingId: true,
      property: { select: { name: true, address: true } },
      booking: { select: { checkIn: true, checkOut: true } },
    },
  });

  if (inspection) {
    const rooms = parseRooms(inspection.roomsData);
    const photos = parsePhotos(inspection.damagePhotos);
    const inventory = parseInventory(inspection.inventoryCheck);
    // v4.80 — type d'état des lieux (entrée vs sortie) + minibar déclaré.
    const isCheckin = inspection.type === 'checkin';
    const minibarRows = Array.isArray(inspection.minibarData)
      ? (inspection.minibarData as unknown[])
          .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
          .map((r) => ({
            name: typeof r.name === 'string' ? r.name : 'Article',
            consumed: typeof r.consumed === 'number' && r.consumed > 0 ? Math.round(r.consumed) : 0,
          }))
          .filter((r) => r.consumed > 0)
      : [];
    // Inspection d'ENTRÉE liée au séjour (pour les badges « Entrée : … »).
    const entryCheck = inspection.bookingId
      ? await db.minibarCheck.findFirst({
          where: { bookingId: inspection.bookingId },
          orderBy: { checkedAt: 'desc' },
          select: { publicToken: true, checkedAt: true },
        })
      : null;
    const frRange = (a: Date, b: Date) =>
      `${a.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} → ${b.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    return (
      <div className="min-h-screen bg-stone-100 text-stone-900">
        {/* Bandeau sombre officiel */}
        <header className="bg-stone-900 px-4 py-5 text-white print:bg-white print:text-stone-900">
          <div className="mx-auto max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
              RoomScan — roomscan.pro
            </p>
            <h1 className="mt-1 text-lg font-bold">Document de preuve officiel</h1>
            <p className="mt-0.5 text-xs text-stone-300">
              Émis le {frFull(new Date())} — consultable à vie via son lien sécurisé
            </p>
          </div>
        </header>

        <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
          <PropertyCard name={inspection.property.name} address={inspection.property.address} />

          {/* Invité + référence séjour */}
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Déclarant</p>
              {/* v4.80 — badge du type d'état des lieux */}
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                  isCheckin
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                {isCheckin ? '🏠 État des lieux d’arrivée' : '🚪 État des lieux de sortie'}
              </span>
            </div>
            <p className="mt-1 text-sm font-bold text-stone-900">{inspection.guestName}</p>
            <p className="text-xs text-stone-500">
              {maskEmail(inspection.guestEmail) ?? 'Email non communiqué'}
            </p>
            {inspection.booking && (
              <p className="mt-2 text-xs text-stone-500">
                🗓️ Séjour du {frRange(inspection.booking.checkIn, inspection.booking.checkOut)}
              </p>
            )}
            <p className="mt-1 text-xs text-stone-500">
              ✍️ Signé le {frFull(inspection.signedAt)}
            </p>
          </section>

          {/* Tableau des pièces */}
          <section aria-label="État des pièces" className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">État des pièces</p>
            <ul className="mt-3 space-y-2.5">
              {ROOMS.map((room) => {
                const detail = rooms.find((r) => r.id === room.id);
                const status = detail?.status ?? 'good';
                const meta = STATUS_META[status] ?? STATUS_META.good;
                const showEntryBadge =
                  status !== 'good' && entryCheck !== null;
                return (
                  <li
                    key={room.id}
                    className={`rounded-xl border p-3.5 ${status === 'good' ? 'border-stone-200 bg-stone-50' : meta.className}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-stone-900">
                        <span aria-hidden="true" className="mr-1.5">{room.emoji}</span>
                        {detail?.label || room.label}
                      </p>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${meta.className}`}>
                        {meta.label}
                      </span>
                    </div>
                    {detail?.comment && (
                      <p className="mt-1.5 text-xs italic text-stone-600">« {detail.comment} »</p>
                    )}
                    {showEntryBadge && entryCheck && (
                      <p className="mt-1.5 text-[11px] font-semibold text-stone-500">
                        Entrée : bon état (validé le{' '}
                        {new Date(entryCheck.checkedAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                        })}
                        )
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Photos */}
          {photos.length > 0 && (
            <section aria-label="Photos jointes" className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                Photos jointes ({photos.length})
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.slice(0, 20).map((photo, i) => (
                  <img
                    key={`${i}-${photo.slice(-16)}`}
                    src={photo}
                    alt={`Photo jointe ${i + 1} de la déclaration`}
                    className="h-32 w-full rounded-xl border border-stone-200 object-cover"
                  />
                ))}
              </div>
            </section>
          )}

          {/* Inventaire + auto-évaluation (sortie uniquement) */}
          {!isCheckin && (
            <section className="grid gap-4 sm:grid-cols-2">
              {inventory && (
                <div className="rounded-2xl border border-stone-200 bg-white p-5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Inventaire rendu</p>
                  <ul className="mt-2 space-y-1 text-sm text-stone-700">
                    <li>🔑 Clés : <strong>{inventory.keys}</strong></li>
                    <li>📺 Télécommandes : <strong>{inventory.remotes}</strong></li>
                    <li>🧺 Serviettes : <strong>{inventory.towels}</strong></li>
                  </ul>
                </div>
              )}
              <div className="rounded-2xl border border-stone-200 bg-white p-5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Auto-évaluation invité</p>
                <p className="mt-2">
                  <Stars value={inspection.selfAssessment} />
                </p>
              </div>
            </section>
          )}

          {/* v4.80 — Minibar déclaré (sortie) */}
          {minibarRows.length > 0 && (
            <section aria-label="Minibar déclaré" className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                🍷 Minibar — consommations déclarées
              </p>
              <ul className="mt-2 space-y-1 text-sm text-stone-700">
                {minibarRows.map((row, i) => (
                  <li key={`${i}-${row.name}`}>
                    <strong>{row.consumed} ×</strong> {row.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Dégâts + commentaires */}
          {(inspection.damages || inspection.issues) && (
            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Déclaration</p>
              {inspection.damages && (
                <p className="mt-2 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
                  {inspection.damages}
                </p>
              )}
              {inspection.issues && (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-700">
                  {inspection.issues}
                </p>
              )}
            </section>
          )}

          {/* Signature */}
          {inspection.guestSignature && (
            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Signature de l'invité</p>
              <div className="mt-2 inline-block rounded-xl border border-stone-200 bg-white p-2">
                <img
                  src={inspection.guestSignature}
                  alt={`Signature de ${inspection.guestName}`}
                  className="h-24 max-w-full object-contain"
                />
              </div>
              <p className="mt-2 text-xs italic text-stone-500">
                « Je certifie sur l'honneur l'exactitude des informations déclarées. »
              </p>
            </section>
          )}

          <LegalFooter id={inspection.id} token={inspection.publicToken} ip={inspection.ipAddress} at={inspection.signedAt} />
          <ActionButtons token={inspection.publicToken} />

          <p className="pt-2 text-center text-[11px] text-stone-400 print:hidden">
            Lien de preuve sécurisé — conservez cette page dans vos favoris.
          </p>
        </main>
      </div>
    );
  }

  // ── 2. Preuve d'ARRIVÉE (inventaire validé / état des lieux d'entrée) ──
  const entry = await db.minibarCheck.findUnique({
    where: { publicToken: cleanToken },
    select: {
      id: true,
      publicToken: true,
      guestName: true,
      checkedAt: true,
      property: { select: { name: true, address: true } },
      booking: { select: { checkIn: true, checkOut: true } },
    },
  });

  if (entry) {
    return (
      <div className="min-h-screen bg-stone-100 text-stone-900">
        <header className="bg-stone-900 px-4 py-5 text-white print:bg-white print:text-stone-900">
          <div className="mx-auto max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
              RoomScan — roomscan.pro
            </p>
            <h1 className="mt-1 text-lg font-bold">Document de preuve officiel</h1>
            <p className="mt-0.5 text-xs text-stone-300">
              Émis le {frFull(new Date())} — consultable à vie via son lien sécurisé
            </p>
          </div>
        </header>

        <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
          <PropertyCard name={entry.property.name} address={entry.property.address} />

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
              État des lieux d'entrée
            </p>
            <p className="mt-2 text-sm leading-relaxed text-emerald-900">
              ✅ L'invité a validé l'inventaire d'arrivée du logement (dont l'état du minibar photographié
              par l'hôte) — aucun défaut ni manquant constaté à l'entrée.
            </p>
            <p className="mt-2 text-xs font-semibold text-emerald-800">
              Validé le {frFull(entry.checkedAt)}
            </p>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Déclarant</p>
            <p className="mt-1 text-sm font-bold text-stone-900">{entry.guestName?.trim() || 'Invité'}</p>
            {entry.booking && (
              <p className="mt-1 text-xs text-stone-500">
                🗓️ Séjour du{' '}
                {entry.booking.checkIn.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au{' '}
                {entry.booking.checkOut.toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
          </section>

          <LegalFooter id={entry.id} token={cleanToken} ip={null} at={entry.checkedAt} />
          <ActionButtons token={cleanToken} />
        </main>
      </div>
    );
  }

  notFound();
}
