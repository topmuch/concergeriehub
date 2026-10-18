import { db } from '@/lib/db';
import { GuestScope } from '@/components/guest-app/guest-scope';
import { ReviewShieldCard } from '@/components/guest-app/review-shield';
import type { Metadata } from 'next';

// =============================================================
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — ÉTAPE 3.2
// PAGE « BOUCLIER D'AVIS » TOKENISÉE
//   /app/hub/[slug]/guest/feedback?token=xxx
//
// Lien unique envoyé au matin du départ (SMS/email via l'automation
// REVIEW_SHIELD_TODAY). Validation SERVEUR du token contre
// booking.feedbackToken → rend le Review Shield PRÉ-REMPI :
//   • nom de l'invité (booking), nom du bien, lien avis public ;
//   • le retour privé est rattaché au séjour (traçabilité, anti-spam).
//
// Token invalide/expiré → page d'erreur élégante avec lien vers le
// Hub générique. Page publique (l'invité n'a pas de session) mais
// le token EST le secret — impossible à deviner (UUID v4 sans tirets).
// =============================================================

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: 'Votre avis compte — RoomScan',
  robots: { index: false },
};

async function resolvePropertyBySlug(slug: string) {
  const plaque = await db.physicalQrCode.findUnique({
    where: { hubSlug: slug },
    select: { propertyId: true, isClaimed: true, status: true },
  });
  if (plaque && plaque.isClaimed && plaque.propertyId && plaque.status === 'active') {
    const p = await db.property.findUnique({
      where: { id: plaque.propertyId },
      select: { id: true, name: true, isActive: true, premiumFeatures: true },
    });
    if (p?.isActive) return p;
  }
  if (!plaque) {
    const p = await db.property.findUnique({
      where: { qrHubSlug: slug },
      select: { id: true, name: true, isActive: true, premiumFeatures: true },
    });
    if (p?.isActive) return p;
  }
  return null;
}

export default async function GuestFeedbackPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token.trim().slice(0, 64) : '';

  // ── Validation SERVEUR : bien + token + booking ──
  let propertyName: string | null = null;
  let guestName: string | null = null;
  let bookingId: string | null = null;
  let reviewUrl: string | null = null;

  if (token) {
    const property = await resolvePropertyBySlug(slug);
    if (property) {
      propertyName = property.name;
      const booking = await db.booking.findFirst({
        where: { feedbackToken: token, propertyId: property.id },
        select: { id: true, guestName: true },
      });
      if (booking) {
        bookingId = booking.id;
        guestName = booking.guestName;
        const pf = (property.premiumFeatures ?? null) as Record<string, unknown> | null;
        const url = typeof pf?.reviewUrl === 'string' ? pf.reviewUrl : null;
        if (url && /^https?:\/\//.test(url)) reviewUrl = url;
      }
    }
  }

  return (
    <GuestScope>
      <main
        className="min-h-screen flex flex-col bg-background text-foreground"
        role="main"
      >
        <div className="flex-1 w-full max-w-lg mx-auto px-4 pt-10 pb-12">
          {/* En-tête compact */}
          <div className="text-center mb-6">
            <span className="text-4xl select-none" aria-hidden="true">⭐</span>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              RoomScan
            </p>
          </div>

          {propertyName && bookingId ? (
            <>
              <div className="text-center mb-5">
                <h1 className="text-xl font-bold text-card-foreground leading-snug">
                  {guestName
                    ? `Bonjour ${guestName.trim().split(/\s+/)[0]}, c'est votre dernier jour ! ☀️`
                    : 'Comment s\'est passé votre séjour ?'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  Votre avis sur <strong className="text-card-foreground">{propertyName}</strong> nous aide
                  énormément — 30 secondes suffisent.
                </p>
              </div>
              <ReviewShieldCard
                slug={slug}
                propertyName={propertyName}
                reviewUrl={reviewUrl}
                guestName={guestName}
                token={token}
                bookingId={bookingId}
              />
              <p className="mt-5 text-center text-[11px] text-muted-foreground leading-relaxed">
                🔒 Votre retour est privé et ne sera jamais publié.
              </p>
            </>
          ) : (
            <div
              className="bg-card border border-border rounded-2xl shadow-sm p-8 text-center"
              role="alert"
            >
              <span className="text-5xl select-none" aria-hidden="true">🔗</span>
              <h1 className="mt-4 text-lg font-bold text-card-foreground">Lien invalide ou expiré</h1>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Ce lien de retour n&apos;est plus valable. Ouvrez votre Hub Invité&nbsp;: la carte
                « Comment s&apos;est passé votre séjour&nbsp;? » s&apos;y trouve sur l&apos;accueil.
              </p>
              <a
                href={`/app/hub/${encodeURIComponent(slug)}/guest`}
                className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                🏠 Ouvrir mon Hub Invité
              </a>
            </div>
          )}
        </div>
      </main>
    </GuestScope>
  );
}
