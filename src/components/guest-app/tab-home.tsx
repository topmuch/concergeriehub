'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ClipboardCheck } from 'lucide-react';
import { buildWifiQrString } from '@/lib/wifi-qr';
import { HUB_PROPERTY_HERO, HUB_VISUALS } from '@/lib/hub-visuals';
import { InstallButton } from './install-button';
import { TimeLimitedWelcomeVideo } from './time-limited-welcome-video';
import { VisualGuideCard } from './visual-guide';
import { ReviewShieldCard } from './review-shield';
import { LateCheckoutCard } from './late-checkout';
import {
  formatFrDate,
  daysUntil,
  type GuestPayload,
  type GuestView,
} from './types';

// =============================================================
// DIGITAL CONCIERGE (V4.1) — ÉTAPE 3.1 : Onglet 🏠 Accueil
// v4.24 « HUB RÉEL — PAGE D'ACCUEIL INVITÉ » :
//   • Héro du logement = VRAIE photo (continuité avec la landing
//     du hub) avec nom + adresse en overlay — fallback emoji si
//     la photo échoue (onError → rendu historique).
//   • Les 4 tuiles d'accès rapide = VRAIES PHOTOS (fond photo +
//     overlay dégradé, texte blanc) — « Commander un service »
//     utilise en priorité la photo réelle du 1er service du
//     payload (services.find(s => s.imageUrl)) puis la photo
//     curated. Fallback emoji inchangé si erreur de chargement.
// Héro du logement + bienvenue personnalisée + SÉJOUR en cours,
// puis GRILLE 2 COLONNES d'accès rapide :
//   🔑 Accès & Codes (coffre-fort numérique)   📶 Wi-Fi (rappel rapide)
//   🥐 Commander un service (upselling)        💬 Contacter l'hôte
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — 4 cartes optionnelles
// pilotées par la config hôte (premiumFeatures / visualGuide) :
//   👋 Vidéo de bienvenue (en tête) — 🗝️ Guide visuel pas à pas
//   ⭐ Bouclier d'avis (double branche) — ⏱️ Late check-out (upsell)
// =============================================================

export function TabHome({
  slug,
  payload,
  onNavigate,
  bookingId = null,
}: {
  slug: string;
  payload: GuestPayload;
  onNavigate: (view: GuestView) => void;
  /** Séjour lié (mémorisé ?b=) — traçabilité des retours privés + paiement. */
  bookingId?: string | null;
}) {
  const { property, guest, ownerName } = payload;
  const booking = guest.booking;
  const firstName = booking ? booking.guestName.trim().split(/\s+/)[0] : null;
  const nightsLeft = booking ? daysUntil(booking.checkOut) : null;
  const hasAccessCodes = property.accessCodes !== null;
  const premium = property.premiumFeatures;

  // « HUB RÉEL » — la tuile « Commander un service » affiche la photo
  // RÉELLE du premier service photographié du bien (croissants du
  // prestataire petit-déjeuner, flotte du transfert…) ; fallback
  // curated viennoiseries si le catalogue n'a pas encore de photos.
  const servicePhoto = guest.services.find((s) => s.imageUrl)?.imageUrl ?? null;

  return (
    <div className="space-y-4">
      {/* Héro du logement — VRAIE PHOTO (fallback emoji si échec) */}
      <PropertyHero property={property} />

      {/* PREMIUM V5 + 8 AMÉLIORATIONS 1.1 — 👋 Vidéo de bienvenue :
          affichée au 1er scan puis pendant 1 h seulement (timestamp
          localStorage), masquée ensuite — l'invité a déjà vu l'essentiel. */}
      {premium?.videoWelcomeUrl && (
        <TimeLimitedWelcomeVideo
          slug={slug}
          url={premium.videoWelcomeUrl}
          hostName={ownerName}
          propertyName={property.name}
          bookingId={bookingId}
        />
      )}

      {/* Bienvenue personnalisé (connecté via booking) */}
      <section aria-label="Bienvenue" className="bg-card border border-border rounded-2xl shadow-sm p-5">
        <h2 className="text-lg font-bold text-card-foreground">
          {firstName ? `Bonjour ${firstName} 👋` : 'Bienvenue 👋'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {/* ÉTAPE 19 — message d'accueil white-label de la conciergerie */}
          {payload.branding?.welcomeMessage ? (
            payload.branding.welcomeMessage
          ) : booking ? (
            <>
              Votre séjour est en cours — profitez bien&nbsp;!{' '}
              {ownerName && <>En cas de besoin, {ownerName} est à votre écoute.</>}
            </>
          ) : (
            <>Tout ce dont vous avez besoin pendant votre séjour est ici : accès, guide, quartier et assistance.</>
          )}
        </p>

        {booking && (
          <div className="mt-3 rounded-xl bg-secondary border border-border p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Votre séjour</p>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-card-foreground">
              <span>
                🛬 Arrivée&nbsp;: <strong>{formatFrDate(booking.checkIn)}</strong>
              </span>
              <span>
                🛫 Départ&nbsp;: <strong>{formatFrDate(booking.checkOut)}</strong>
              </span>
              <span>
                👥 {booking.guests} voyageur{booking.guests > 1 ? 's' : ''}
              </span>
            </div>
            {nightsLeft !== null && (
              <p className="mt-2 text-xs font-semibold text-accent">
                {nightsLeft === 0
                  ? '🛫 C’est le jour du départ — pensez à rendre les clés !'
                  : `🗓️ Départ dans ${nightsLeft} jour${nightsLeft > 1 ? 's' : ''}`}
              </p>
            )}
          </div>
        )}
      </section>

      {/* v5.0 — ÉTAT DES LIEUX DE SORTIE : CTA émeraude près du bloc
          Départ. Mis en avant (bordure accentuée) le jour du départ ou
          la veille — l'invité signe son état des lieux avant de partir. */}
      <CheckoutInspectionCta
        departureImminent={nightsLeft !== null && nightsLeft <= 1}
        onClick={() => onNavigate('checkout-inspection')}
      />

      {/* PREMIUM V5 + 8 AMÉLIORATIONS 1.2 — 🗝️ Guide visuel d'arrivée
          pas à pas (carrousel) + bouton GPS « Aller à l'appartement » */}
      {property.visualGuide.length > 0 && (
        <VisualGuideCard
          steps={property.visualGuide}
          propertyLat={property.latitude}
          propertyLng={property.longitude}
          onNavigateAccess={hasAccessCodes ? () => onNavigate('access') : undefined}
        />
      )}

      {/* ── Grille d'accès rapide (2 colonnes) — VRAIES PHOTOS ── */}
      <div className="grid grid-cols-2 gap-3" role="navigation" aria-label="Accès rapide">
        <HomeTile
          emoji="🔑"
          imageUrl={HUB_VISUALS.access}
          alt="Serrure connectée du logement"
          title="Accès & Codes"
          subtitle={hasAccessCodes ? 'Codes, coffre, parking' : 'Bientôt disponible'}
          onClick={hasAccessCodes ? () => onNavigate('access') : undefined}
        />
        <WifiTile
          wifi={guest.wifi}
          open={false}
        />
        <HomeTile
          emoji="🥐"
          imageUrl={servicePhoto ?? HUB_VISUALS.breakfast}
          alt="Services & expériences du logement"
          title="Commander un service"
          subtitle="Partenaires locaux"
          onClick={() => onNavigate('services')}
        />
        <HomeTile
          emoji="💬"
          imageUrl={HUB_VISUALS.host}
          alt="Cloche de conciergerie — joindre votre hôte"
          title="Contacter l'hôte"
          subtitle={payload.guest.contact.name !== 'Votre hôte' ? payload.guest.contact.name : 'Réponse rapide'}
          onClick={() => onNavigate('help')}
        />
      </div>

      {/* PREMIUM V5 — ⭐ Bouclier d'avis (double branche 4-5★ / 1-3★) */}
      {premium?.enableReviewShield && (
        <ReviewShieldCard
          slug={slug}
          propertyName={property.name}
          reviewUrl={premium.reviewUrl ?? null}
          guestName={booking?.guestName ?? null}
          bookingId={bookingId}
        />
      )}

      {/* PREMIUM V5 — ⏱️ Late check-out (paiement Stripe Étape 3.3 ou demande) */}
      {premium?.enableLateCheckout && (
        <LateCheckoutCard
          slug={slug}
          price={premium.lateCheckoutPrice ?? null}
          guestName={booking?.guestName ?? null}
          bookingId={bookingId}
          paymentEnabled={premium.paymentEnabled ?? false}
          lateCheckoutStatus={booking?.lateCheckoutStatus ?? null}
        />
      )}

      {/* Installation PWA (discret) */}
      <InstallButton />
    </div>
  );
}

// =============================================================
// v5.0 « ÉTAT DES LIEUX DE SORTIE » — Carte CTA de l'Accueil :
// « Je quitte le logement » ouvre la sous-vue du même nom
// (formulaire signé → PDF + preuve publique). Icône ClipboardCheck,
// bouton bleu logo #0066EF (accent marque de l'app invitée), bordure
// accentuée quand le départ est imminent (aujourd'hui / demain).
// =============================================================
function CheckoutInspectionCta({
  departureImminent,
  onClick,
}: {
  departureImminent: boolean;
  onClick: () => void;
}) {
  return (
    <section
      aria-label="État des lieux de sortie"
      className={`rounded-2xl border bg-card p-5 shadow-sm transition-colors ${
        departureImminent ? 'border-[#0066EF]/60 ring-1 ring-[#0066EF]/25' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-3.5">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF2FF] text-[#0052C4] dark:bg-[#0066EF]/15 dark:text-[#3B82F6]"
          aria-hidden="true"
        >
          <ClipboardCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-card-foreground">
            Je quitte le logement — État des lieux de sortie
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {departureImminent
              ? '🛫 Votre départ approche — constatez l\'état du logement en 2 minutes avant de rendre les clés.'
              : 'Constatez l\'état du logement en 2 minutes avant de rendre les clés — signé, horodaté, envoyé à votre hôte.'}
          </p>
          <button
            type="button"
            onClick={onClick}
            className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0066EF] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#0052C4] active:scale-[0.98] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066EF]/60"
          >
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            Faire l'état des lieux
          </button>
        </div>
      </div>
    </section>
  );
}

// =============================================================
// Héro du logement — VRAIE PHOTO (v4.24 « hub réel ») : carte
// photo pleine largeur (même visuel que la landing du hub pour la
// continuité), nom + adresse + badge posés sur un voile dégradé.
// Si la photo échoue (onError) → rendu emoji historique.
// =============================================================
function PropertyHero({
  property,
}: {
  property: GuestPayload['property'];
}) {
  const [heroFailed, setHeroFailed] = useState(false);

  if (heroFailed) {
    return (
      <section
        aria-label="Logement"
        className="bg-card border border-border rounded-2xl shadow-sm p-5"
      >
        <div className="flex items-center gap-4">
          <span className="text-4xl leading-none select-none" aria-hidden="true">
            {property.propertyTypeEmoji}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-card-foreground leading-tight">{property.name}</h1>
            {property.address && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{property.address}</p>
            )}
            <span className="inline-block mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30">
              {property.propertyTypeLabel} · Hub officiel
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Logement"
      className="relative h-44 overflow-hidden rounded-2xl shadow-sm border border-border"
    >
      <img
        src={HUB_PROPERTY_HERO}
        alt={`Photo du logement — ${property.name}`}
        loading="eager"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => setHeroFailed(true)}
      />
      {/* Voile dégradé — lisibilité du texte blanc sur la photo */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/10"
      />
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
            {property.name}
          </h1>
          {property.address && (
            <p className="text-xs text-white/85 mt-0.5 line-clamp-2 drop-shadow-sm">{property.address}</p>
          )}
          <span className="inline-block mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/15 text-white border border-white/30 backdrop-blur-sm">
            {property.propertyTypeEmoji} {property.propertyTypeLabel} · Hub officiel
          </span>
        </div>
      </div>
    </section>
  );
}

// =============================================================
// Tuile de la grille — VRAIE PHOTO (v4.24 « hub réel ») : fond
// photo + voile dégradé (texte blanc en bas). Si la photo échoue
// ou n'est pas fournie → tuile emoji historique (28px + titre).
// =============================================================
function HomeTile({
  emoji,
  title,
  subtitle,
  onClick,
  imageUrl,
  alt,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  /** Vraie photo de la tuile (v4.24 « hub réel ») — optionnelle. */
  imageUrl?: string | null;
  /** Texte alternatif de la photo (défaut : vide, décoratif). */
  alt?: string;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!imageUrl && !photoFailed;
  const disabled = !onClick;

  if (!showPhoto) {
    if (disabled) {
      return (
        <div className="flex flex-col items-start gap-1.5 bg-card border border-border rounded-2xl shadow-sm p-4 opacity-60" aria-disabled="true">
          <span className="text-[28px] leading-none select-none" aria-hidden="true">{emoji}</span>
          <span className="text-sm font-bold text-card-foreground leading-tight">{title}</span>
          {subtitle && <span className="text-[11px] text-muted-foreground leading-snug">{subtitle}</span>}
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex flex-col items-start gap-1.5 text-left bg-card border border-border rounded-2xl shadow-sm p-4 hover:border-accent hover:bg-accent/5 active:scale-[0.97] transition-all cursor-pointer"
      >
        <span className="text-[28px] leading-none select-none" aria-hidden="true">{emoji}</span>
        <span className="text-sm font-bold text-card-foreground leading-tight">{title}</span>
        {subtitle && <span className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{subtitle}</span>}
      </button>
    );
  }

  // ── Tuile photo (v4.24) — min 44px tap, active:scale feedback ──
  const inner = (
    <>
      <img
        src={imageUrl ?? undefined}
        alt={alt ?? ''}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => setPhotoFailed(true)}
      />
      {/* Voile dégradé — lisibilité du texte blanc */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10"
      />
      <span className="absolute bottom-0 left-0 right-0 p-3 flex flex-col items-start gap-0.5">
        <span className="text-sm font-bold text-white leading-tight drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
          {title}
        </span>
        {subtitle && (
          <span className="text-[11px] text-white/80 leading-snug line-clamp-2 drop-shadow-sm">
            {subtitle}
          </span>
        )}
      </span>
    </>
  );

  if (disabled) {
    return (
      <div
        className="relative h-32 overflow-hidden rounded-2xl border border-border shadow-sm opacity-70 saturate-[0.6]"
        aria-disabled="true"
      >
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative h-32 overflow-hidden rounded-2xl border border-border shadow-sm text-left active:scale-[0.97] hover:border-accent transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      {inner}
    </button>
  );
}

// =============================================================
// DIGITAL CONCIERGE — Tuile Wi-Fi « rappel rapide » : réseau +
// mot de passe copiable directement dans la tuile (masqué par
// défaut, 👁️ pour révéler) + QR d'auto-connexion (audit 4-c :
// standard WIFI: — buildWifiQrString, même source que /view).
// v4.24 « hub réel » : repliée, la tuile est une VRAIE photo
// (routeur) ; dépliée, l'en-tête compact garde une vignette photo.
// =============================================================
function WifiTile({
  wifi,
  open: _open,
}: {
  wifi: NonNullable<GuestPayload['guest']['wifi']> | null;
  open?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [copied, setCopied] = useState<'ssid' | 'pwd' | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !photoFailed;

  if (!wifi) {
    return (
      <HomeTile
        emoji="📶"
        imageUrl={showPhoto ? HUB_VISUALS.wifi : null}
        alt="Routeur Wi-Fi du logement"
        title="Wi-Fi"
        subtitle="En cours de préparation par votre hôte"
      />
    );
  }

  const copy = async (text: string, which: 'ssid' | 'pwd') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  // ── Repliée : tuile PHOTO (routeur) — un clic déplie le panneau ──
  if (!expanded && showPhoto) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        aria-label={`Wi-Fi — voir le mot de passe du réseau ${wifi.networkName}`}
        className="relative h-32 overflow-hidden rounded-2xl border border-border shadow-sm text-left active:scale-[0.97] hover:border-accent transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <img
          src={HUB_VISUALS.wifi}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setPhotoFailed(true)}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10"
        />
        <span className="absolute bottom-0 left-0 right-0 p-3 flex flex-col items-start gap-0.5">
          <span className="text-sm font-bold text-white leading-tight drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
            Wi-Fi
          </span>
          <span className="text-[11px] text-white/80 leading-snug truncate max-w-full drop-shadow-sm">
            {wifi.networkName}
          </span>
        </span>
      </button>
    );
  }

  // ── Dépliée (ou photo échouée) : panneau complet historique ──
  return (
    <div
      className={`flex flex-col items-start gap-1.5 bg-card border rounded-2xl shadow-sm p-4 transition-all ${
        expanded ? 'border-accent col-span-2' : 'border-border'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex flex-col items-start gap-1.5 text-left cursor-pointer"
      >
        {showPhoto ? (
          <span className="relative h-10 w-14 overflow-hidden rounded-lg border border-border shrink-0">
            <img
              src={HUB_VISUALS.wifi}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setPhotoFailed(true)}
            />
          </span>
        ) : (
          <span className="text-[28px] leading-none select-none" aria-hidden="true">📶</span>
        )}
        <span className="text-sm font-bold text-card-foreground leading-tight">Wi-Fi</span>
        <span className="text-[11px] text-muted-foreground leading-snug truncate max-w-full">
          {wifi.networkName}
        </span>
      </button>

      {expanded && (
        <div className="w-full space-y-2 pt-2 border-t border-border mt-2">
          <div className="flex items-center justify-between gap-2 bg-secondary border border-border rounded-xl px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Réseau</p>
              <p className="text-xs font-semibold text-card-foreground truncate">{wifi.networkName}</p>
            </div>
            <button
              type="button"
              onClick={() => copy(wifi.networkName, 'ssid')}
              className="shrink-0 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 border border-border bg-card text-card-foreground hover:bg-secondary transition-colors cursor-pointer"
            >
              {copied === 'ssid' ? '✓' : '📋'}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 bg-secondary border border-border rounded-xl px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Mot de passe</p>
              <p className="text-xs font-semibold text-card-foreground truncate font-mono">
                {showPwd ? wifi.password : '••••••••'}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-border bg-card text-sm hover:bg-secondary transition-colors cursor-pointer"
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
              <button
                type="button"
                onClick={() => copy(wifi.password, 'pwd')}
                aria-label="Copier le mot de passe"
                className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity cursor-pointer"
              >
                {copied === 'pwd' ? '✓' : '📋'}
              </button>
            </div>
          </div>

          {/* AUDIT 4-c — QR d'auto-connexion : l'invité scanne et
              rejoint le réseau sans recopier le mot de passe. */}
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border bg-secondary/60 px-3 py-3">
            <QRCodeSVG
              value={buildWifiQrString(wifi.networkName, wifi.password, wifi.securityType)}
              size={120}
              aria-label="QR de connexion automatique au Wi-Fi"
            />
            <p className="text-[11px] font-semibold text-muted-foreground">
              📸 Scannez pour vous connecter
            </p>
          </div>
        </div>
      )}

      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[11px] font-semibold text-accent hover:underline cursor-pointer"
        >
          Voir le mot de passe →
        </button>
      )}
    </div>
  );
}
