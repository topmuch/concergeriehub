'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Mic,
  PencilLine,
  Phone,
  Square,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { QRTNumericKeypad } from '@/components/qrtags';
import { BrandLogo } from '@/components/ui/brand-logo';
import { EmojiIcon } from '@/components/ui/emoji-icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatDistance } from '@/lib/b2b';

// =============================================================
// ÉTAPE 5 — LE HUB QR CODE (expérience de scan, ultra-mobile-first)
//
// Écran d'accueil : 2 cartes principales
//   👤 MODE INVITÉ (libre) : Wi-Fi (copie MDP), Guidebook,
//      Commander un service, Signaler un problème / Contacter l'hôte
//   🔐 MODE HÔTE (PIN 4 chiffres via QRTNumericKeypad) :
//      grille de gestion rapide — Modifier le Wi-Fi, Réclamations
//      en attente, Gérer les prestataires.
//
// Design QRTags : fond dégradé subtil slate, cartes blanches
// border-slate-200 rounded-xl p-4 shadow-sm, emojis 24–32 px.
// =============================================================

interface GuestService {
  id: string;
  name: string;
  emoji: string;
  categoryLabel: string;
  description: string;
  priceLabel: string;
}

interface HubPayload {
  active: boolean;
  property: {
    id: string;
    name: string;
    propertyType: string;
    propertyTypeLabel: string;
    propertyTypeEmoji: string;
    address: string | null;
    hasPin: boolean;
  };
  ownerName: string | null;
  guest: {
    wifi: { networkName: string; password: string; securityType: string } | null;
    guidebookSlug: string | null;
    services: GuestService[];
    contact: { name: string; phone: string | null; email: string | null };
  };
}

interface HostProvider {
  id: string;
  name: string;
  emoji: string;
  categoryLabel: string;
  distanceKm: number;
  audience: string;
  priceLabel: string;
}

interface HostData {
  wifi: {
    qrCodeId: string;
    networkName: string;
    password: string;
    securityType: string;
  } | null;
  unreadMessages: {
    id: string;
    senderName: string;
    audioUrl: string;
    durationSec: number;
    createdAt: string;
  }[];
  pendingRequests: number;
  providers: HostProvider[];
}

type HubView = 'loading' | 'error' | 'home' | 'guest' | 'host';

export function HubPageContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [view, setView] = useState<HubView>('loading');
  const [payload, setPayload] = useState<HubPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [retryTick, setRetryTick] = useState(0);

  // Mode Hôte
  const [pinModal, setPinModal] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [keypadKey, setKeypadKey] = useState(0); // remonte le clavier après un échec
  const [verifiedPin, setVerifiedPin] = useState('');
  const [hostData, setHostData] = useState<HostData | null>(null);

  // ----- Chargement du hub (fonction async déclarée DANS l'effet) -----
  useEffect(() => {
    async function run() {
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}`);
        const json = await res.json();
        if (res.status === 410) {
          setErrorMsg(json.message || 'Cette plaque QR a été désactivée.');
          setView('error');
          return;
        }
        if (!res.ok) {
          setErrorMsg(json.message || 'Ce hub est introuvable.');
          setView('error');
          return;
        }
        setPayload(json as HubPayload);
        setView('home');
      } catch {
        setErrorMsg('Impossible de charger le hub. Vérifiez votre connexion.');
        setView('error');
      }
    }
    run();
  }, [slug, retryTick]);

  /** Bouton Réessayer : retour au chargement + relance de l'effet. */
  const retryLoad = useCallback(() => {
    setView('loading');
    setRetryTick((t) => t + 1);
  }, []);

  // ----- Vérification PIN + chargement des données hôte -----
  const verifyPin = useCallback(
    async (pin: string) => {
      setPinLoading(true);
      setPinError('');
      try {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        const json = await res.json();
        if (!res.ok) {
          setPinError(json.error || 'PIN incorrect');
          setPinLoading(false);
          setKeypadKey((k) => k + 1); // clavier neuf pour la prochaine tentative
          return;
        }
        const hostRes = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/host`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        if (!hostRes.ok) {
          setPinError('Impossible de charger les données hôte.');
          setPinLoading(false);
          return;
        }
        setHostData((await hostRes.json()) as HostData);
        setVerifiedPin(pin);
        setPinModal(false);
        setPinLoading(false);
        setView('host');
      } catch {
        setPinError('Erreur réseau. Réessayez.');
        setPinLoading(false);
      }
    },
    [slug],
  );

  // ----- Copie presse-papier -----
  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copié !`, { description: text });
    } catch {
      toast.error('Copie impossible sur ce navigateur.');
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-100 to-slate-200">
      <Toaster position="top-center" richColors />

      {view === 'loading' && <LoadingScreen />}
      {view === 'error' && <ErrorScreen message={errorMsg} onRetry={retryLoad} />}

      {view === 'home' && payload && (
        <HomeView
          payload={payload}
          onGuestClick={() => setView('guest')}
          onHostClick={() => {
            setPinError('');
            setPinModal(true);
          }}
        />
      )}

      {view === 'guest' && payload && (
        <GuestView payload={payload} slug={slug} onBack={() => setView('home')} copy={copy} />
      )}

      {view === 'host' && payload && (
        <HostView
          payload={payload}
          hostData={hostData}
          slug={slug}
          pin={verifiedPin}
          onBack={() => setView('home')}
          onHostRefresh={(d) => setHostData(d)}
        />
      )}

      {/* ----- Modale PIN Mode Hôte ----- */}
      <Dialog open={pinModal} onOpenChange={(open) => !open && !pinLoading && setPinModal(false)}>
        <DialogContent className="max-w-sm bg-white border border-slate-200 rounded-xl p-6 [&>button]:hidden">
          <DialogHeader className="items-center text-center">
            <span className="mx-auto" aria-hidden="true">
              <EmojiIcon emoji="🔐" size="lg" variant="dark" />
            </span>
            <DialogTitle className="text-lg font-bold text-slate-900 text-center">Mode Hôte</DialogTitle>
            <DialogDescription className="text-sm text-slate-600 text-center">
              Saisissez votre code à 4 chiffres pour accéder à la gestion du logement.
            </DialogDescription>
          </DialogHeader>

          {pinLoading ? (
            <div className="flex flex-col items-center gap-3 py-8" aria-busy="true">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden="true" />
              <p className="text-sm text-slate-500">Vérification du code…</p>
            </div>
          ) : (
            <div className="mt-2">
              <QRTNumericKeypad key={keypadKey} onComplete={verifyPin} />
              {pinError && (
                <p role="alert" className="mt-4 text-center text-sm font-semibold text-red-600">
                  {pinError}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className="mt-4 w-full h-11 border-slate-300 text-slate-600"
                onClick={() => setPinModal(false)}
              >
                Annuler
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================
// Écran de chargement
// =============================================================
function LoadingScreen() {
  return (
    <div className="flex-1 w-full max-w-lg mx-auto px-4 py-10 space-y-5" aria-busy="true" aria-label="Chargement du hub">
      <div className="flex justify-center">
        <BrandLogo size="sm" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

// =============================================================
// Écran d'erreur (QR introuvable / inactif / réseau)
// =============================================================
function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex-1 w-full max-w-lg mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 w-full">
        <span className="text-5xl" aria-hidden="true">🔌</span>
        <h1 className="mt-4 text-xl font-bold text-slate-900">Hub indisponible</h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">{message}</p>
        <Button
          type="button"
          onClick={onRetry}
          className="mt-6 h-11 px-6 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
        >
          Réessayer
        </Button>
        <p className="mt-6 text-xs text-slate-400">
          Propulsé par 🗝️ <span className="font-semibold text-slate-500">Conciergerie Hub</span>
        </p>
      </div>
    </div>
  );
}

// =============================================================
// ÉCRAN D'ACCUEIL — 2 cartes principales
// =============================================================
function HomeView({
  payload,
  onGuestClick,
  onHostClick,
}: {
  payload: HubPayload;
  onGuestClick: () => void;
  onHostClick: () => void;
}) {
  const { property, ownerName } = payload;
  return (
    <div className="flex-1 w-full max-w-lg mx-auto px-4 py-8 flex flex-col">
      {/* Logo */}
      <div className="flex justify-center mb-6">
        <BrandLogo size="sm" />
      </div>

      {/* Carte bienvenue */}
      <section
        aria-label="Bienvenue"
        className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex items-center gap-4"
      >
        <span className="text-4xl leading-none select-none" aria-hidden="true">
          {property.propertyTypeEmoji}
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 leading-tight">{property.name}</h1>
          {property.address && (
            <p className="text-sm text-slate-600 mt-0.5 truncate">{property.address}</p>
          )}
          <Badge className="mt-1.5 bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold hover:bg-emerald-50">
            {property.propertyTypeLabel} · Hub officiel
          </Badge>
        </div>
      </section>

      <p className="text-center text-sm text-slate-600 font-medium mt-6 mb-3">Bienvenue ! Qui êtes-vous ?</p>

      {/* 2 choix principaux */}
      <div className="grid gap-4">
        {/* 👤 MODE INVITÉ */}
        <button
          type="button"
          onClick={onGuestClick}
          aria-label="Mode Invité — Wi-Fi, Guide, Services et Contact"
          className="text-left bg-white border border-slate-200 rounded-xl shadow-sm p-5 hover:shadow-md hover:border-slate-300 active:scale-[0.99] transition-all cursor-pointer"
        >
          <ModeCardInner
            emoji="👤"
            variant="accent"
            title="MODE INVITÉ"
            subtitle="Wi-Fi, Guide, Services & Contact"
            sub2="Accès libre, sans code"
          />
        </button>

        {/* 🔐 MODE HÔTE */}
        <button
          type="button"
          onClick={onHostClick}
          aria-label="Mode Hôte — Gestion et paramètres du logement"
          className="text-left bg-white border border-slate-200 rounded-xl shadow-sm p-5 hover:shadow-md hover:border-slate-300 active:scale-[0.99] transition-all cursor-pointer"
        >
          <ModeCardInner
            emoji="🔐"
            variant="dark"
            title="MODE HÔTE"
            subtitle="Gestion et paramètres du logement"
            sub2="Protégé par code à 4 chiffres"
          />
        </button>
      </div>

      {/* Footer */}
      <footer className="mt-auto pt-10 pb-6 text-center">
        <p className="text-xs text-slate-500">
          {ownerName ? `Votre hôte : ${ownerName} · ` : ''}Propulsé par 🗝️{' '}
          <span className="font-semibold text-slate-600">Conciergerie Hub</span>
        </p>
      </footer>
    </div>
  );
}

function ModeCardInner({
  emoji,
  variant,
  title,
  subtitle,
  sub2,
}: {
  emoji: string;
  variant: 'accent' | 'dark';
  title: string;
  subtitle: string;
  sub2: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <EmojiIcon emoji={emoji} size="xl" variant={variant} />
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-bold text-slate-900 tracking-wide">{title}</h2>
        <p className="text-sm text-slate-600 mt-0.5">{subtitle}</p>
        <p className="text-[11px] text-slate-400 mt-1">{sub2}</p>
      </div>
      <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" aria-hidden="true" />
    </div>
  );
}

// =============================================================
// MODE INVITÉ — 4 cartes de service
// =============================================================
function GuestView({
  payload,
  slug,
  onBack,
  copy,
}: {
  payload: HubPayload;
  slug: string;
  onBack: () => void;
  copy: (text: string, label: string) => Promise<void>;
}) {
  const [wifiOpen, setWifiOpen] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const { property, guest } = payload;

  return (
    <div className="flex-1 w-full max-w-lg mx-auto px-4 py-8 flex flex-col">
      {/* Retour + titre */}
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour à l'accueil"
          className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 leading-tight">👤 Espace Invité</h1>
          <p className="text-xs text-slate-500 truncate">{property.name}</p>
        </div>
      </div>

      <div className="grid gap-3">
        {/* 1. 📶 Wi-Fi */}
        {guest.wifi ? (
          <GuestCard
            emoji="📶"
            title="Se connecter au Wi-Fi"
            subtitle={`${guest.wifi.networkName} · ${guest.wifi.securityType}`}
            onClick={() => setWifiOpen((v) => !v)}
            expanded={wifiOpen}
            arrow
          >
            {wifiOpen && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Réseau</p>
                    <p className="text-sm font-semibold text-slate-900 truncate">{guest.wifi.networkName}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 border-slate-300 text-slate-700"
                    onClick={() => copy(guest.wifi!.networkName, 'Nom du réseau')}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copier
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mot de passe</p>
                    <p className="text-sm font-semibold text-slate-900 truncate font-mono">
                      {showPwd ? guest.wifi.password : '••••••••••'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900"
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                      onClick={() => copy(guest.wifi!.password, 'Mot de passe Wi-Fi')}
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copier le mot de passe
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </GuestCard>
        ) : (
          <GuestCard emoji="📶" title="Wi-Fi" subtitle="Informations en cours de préparation" disabled />
        )}

        {/* 2. 📖 Guidebook */}
        {guest.guidebookSlug ? (
          <a
            href={`/view/${guest.guidebookSlug}`}
            className="block bg-white border border-slate-200 rounded-xl shadow-sm p-4 hover:shadow-md hover:border-slate-300 active:scale-[0.99] transition-all"
            aria-label="Voir le Guidebook"
          >
            <div className="flex items-center gap-3.5">
              <EmojiIcon emoji="📖" size="lg" variant="accent" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-900">Voir le Guidebook</h3>
                <p className="text-xs text-slate-500 mt-0.5">Accès, équipements, règles et bonnes adresses</p>
              </div>
              <BookOpen className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
            </div>
          </a>
        ) : (
          <GuestCard emoji="📖" title="Guidebook" subtitle="Votre hôte prépare son guide de bienvenue" disabled />
        )}

        {/* 3. 🥐 Commander un service */}
        <ServicesCard services={guest.services} contact={guest.contact} property={property} />

        {/* 4. 🚨 Signaler un problème */}
        <GuestCard
          emoji="🚨"
          title="Signaler un problème"
          subtitle="Contacter l'hôte — réponse rapide garantie"
          onClick={() => setContactOpen(true)}
          arrow
        />
      </div>

      <footer className="mt-auto pt-10 pb-6 text-center">
        <p className="text-xs text-slate-500">
          Propulsé par 🗝️ <span className="font-semibold text-slate-600">Conciergerie Hub</span>
        </p>
      </footer>

      <ContactDialog
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        slug={slug}
        contact={guest.contact}
        propertyName={property.name}
      />
    </div>
  );
}

/** Carte de service générique (accueil / invité) avec contenu dépliable.
 * NB : div role="button" (et pas <button>) car elle peut contenir des
 * boutons interactifs (copier, commander) — pas de button imbriqué. */
function GuestCard({
  emoji,
  title,
  subtitle,
  onClick,
  expanded,
  disabled,
  arrow,
  children,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  onClick?: () => void;
  expanded?: boolean;
  disabled?: boolean;
  arrow?: boolean;
  children?: React.ReactNode;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      {...(disabled || !onClick
        ? { 'aria-disabled': disabled ? true : undefined }
        : { role: 'button', tabIndex: 0, onClick, onKeyDown: handleKeyDown })}
      aria-expanded={onClick ? expanded : undefined}
      className={cn(
        'w-full text-left bg-white border border-slate-200 rounded-xl shadow-sm p-4 transition-all',
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : onClick
            ? 'hover:shadow-md hover:border-slate-300 active:scale-[0.99] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
            : 'cursor-default',
      )}
    >
      <div className="flex items-center gap-3.5">
        <EmojiIcon emoji={emoji} size="lg" variant={disabled ? 'default' : 'accent'} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        {arrow && !disabled && (
          <ChevronRight
            className={cn('h-5 w-5 text-slate-400 shrink-0 transition-transform', expanded && 'rotate-90')}
            aria-hidden="true"
          />
        )}
      </div>
      {children}
    </div>
  );
}

/** Carte "Commander un service" avec liste dépliable des expériences. */
function ServicesCard({
  services,
  contact,
  property,
}: {
  services: GuestService[];
  contact: HubPayload['guest']['contact'];
  property: HubPayload['property'];
}) {
  const [open, setOpen] = useState(false);

  const order = (svc: GuestService) => {
    if (!contact.email) {
      toast.info('Commande bientôt disponible', {
        description: 'Votre hôte n’a pas encore renseigné de email de contact.',
      });
      return;
    }
    const subject = encodeURIComponent(`Demande de service — ${svc.name} (${property.name})`);
    const body = encodeURIComponent(
      `Bonjour ${contact.name},\n\nJe séjourne au "${property.name}" et je souhaite commander :\n\n• ${svc.name} (${svc.categoryLabel}) — ${svc.priceLabel}\n\nMerci de me confirmer la disponibilité.\n\nMerci !`,
    );
    window.location.assign(`mailto:${contact.email}?subject=${subject}&body=${body}`);
  };

  return (
    <GuestCard
      emoji="🥐"
      title="Commander un service"
      subtitle={
        services.length > 0
          ? `${services.length} expérience(s) proposée(s) par votre hôte`
          : 'Aucun service pour le moment'
      }
      onClick={() => services.length > 0 && setOpen((v) => !v)}
      expanded={open}
      arrow={services.length > 0}
      disabled={services.length === 0}
    >
      {open && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
          {services.map((svc) => (
            <div key={svc.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none select-none" aria-hidden="true">
                  {svc.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-900">{svc.name}</p>
                    <Badge className="bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold hover:bg-emerald-50 shrink-0">
                      {svc.priceLabel}
                    </Badge>
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mt-0.5">
                    {svc.categoryLabel}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{svc.description}</p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2.5 h-8 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                    onClick={() => order(svc)}
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Commander
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-slate-400 text-center">
            Votre demande est transmise à votre hôte qui confirme la réservation.
          </p>
        </div>
      )}
    </GuestCard>
  );
}

// =============================================================
// MODE HÔTE — grille de gestion rapide (après PIN)
// =============================================================
function HostView({
  payload,
  hostData,
  slug,
  pin,
  onBack,
  onHostRefresh,
}: {
  payload: HubPayload;
  hostData: HostData | null;
  slug: string;
  pin: string;
  onBack: () => void;
  onHostRefresh: (d: HostData) => void;
}) {
  const [wifiEditOpen, setWifiEditOpen] = useState(false);
  const [complaintsOpen, setComplaintsOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);
  const unread = hostData?.unreadMessages.length ?? 0;

  return (
    <div className="flex-1 w-full max-w-lg mx-auto px-4 py-8 flex flex-col">
      <div className="flex items-center gap-3 mb-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour à l'accueil"
          className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 leading-tight">🔐 Espace Hôte</h1>
          <p className="text-xs text-slate-500 truncate">{payload.property.name}</p>
        </div>
        <Badge className="ml-auto bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold hover:bg-emerald-50 shrink-0">
          ✓ Déverrouillé
        </Badge>
      </div>
      <p className="text-sm text-slate-600 mb-5">Gestion rapide du logement</p>

      {!hostData ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-3">
          {/* 📶 Modifier le Wi-Fi */}
          <HostActionCard
            emoji="📶"
            title="Modifier le Wi-Fi"
            subtitle={
              hostData.wifi?.networkName ? `Réseau : ${hostData.wifi.networkName}` : 'Aucun réseau configuré'
            }
            onClick={() => setWifiEditOpen(true)}
          />
          {/* 🚨 Réclamations en attente */}
          <HostActionCard
            emoji="🚨"
            title="Réclamations en attente"
            subtitle={
              unread > 0
                ? `${unread} message(s) voyageur à traiter${
                    hostData.pendingRequests > 0 ? ` · ${hostData.pendingRequests} demande(s) de service` : ''
                  }`
                : 'Aucune réclamation en attente ✓'
            }
            badge={unread > 0 ? String(unread) : undefined}
            onClick={() => setComplaintsOpen(true)}
          />
          {/* 🧹 Gérer les prestataires */}
          <HostActionCard
            emoji="🧹"
            title="Gérer les prestataires"
            subtitle={`${hostData.providers.length} intervenant(s) autour du bien`}
            onClick={() => setProvidersOpen(true)}
          />
        </div>
      )}

      <footer className="mt-auto pt-10 pb-6 text-center">
        <p className="text-xs text-slate-500">
          Propulsé par 🗝️ <span className="font-semibold text-slate-600">Conciergerie Hub</span>
        </p>
      </footer>

      {/* ----- Dialog : Modifier le Wi-Fi ----- */}
      {hostData && wifiEditOpen && (
        <WifiEditDialog
          onClose={() => setWifiEditOpen(false)}
          slug={slug}
          pin={pin}
          wifi={hostData.wifi}
          onSaved={(w) => onHostRefresh({ ...hostData, wifi: w })}
        />
      )}

      {/* ----- Dialog : Réclamations ----- */}
      <Dialog open={complaintsOpen} onOpenChange={setComplaintsOpen}>
        <DialogContent className="max-w-md bg-white border border-slate-200 rounded-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-amber-500" aria-hidden="true" /> Réclamations en attente
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Messages vocaux laissés par vos voyageurs.
            </DialogDescription>
          </DialogHeader>
          {hostData && hostData.unreadMessages.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-4xl" aria-hidden="true">✅</span>
              <p className="mt-2 text-sm font-semibold text-slate-900">Tout est traité</p>
              <p className="text-xs text-slate-500 mt-1">Aucun message en attente.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {hostData?.unreadMessages.map((m) => (
                <div key={m.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">{m.senderName}</p>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {new Date(m.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {m.audioUrl && !m.audioUrl.startsWith('/demo/') ? (
                      <audio
                        controls
                        preload="none"
                        src={m.audioUrl}
                        className="h-9 w-full max-w-[260px]"
                        aria-label={`Message de ${m.senderName}`}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">
                        🎙️ Message vocal de {m.durationSec} s (audio indisponible en démo)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ----- Dialog : Prestataires ----- */}
      <Dialog open={providersOpen} onOpenChange={setProvidersOpen}>
        <DialogContent className="max-w-md bg-white border border-slate-200 rounded-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-slate-500" aria-hidden="true" /> Prestataires autour du bien
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Dans leur rayon d&apos;intervention. Gestion complète depuis le dashboard hôte.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(['OWNER_SERVICE', 'GUEST_EXPERIENCE'] as const).map((aud) => {
              const list = hostData?.providers.filter((p) => p.audience === aud) ?? [];
              return (
                <div key={aud}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
                    {aud === 'OWNER_SERVICE' ? '🔧 Services Propriétaire' : '🥂 Expériences Invité'} ({list.length})
                  </p>
                  {list.length === 0 ? (
                    <p className="text-xs text-slate-400">Aucun prestataire dans le rayon.</p>
                  ) : (
                    <div className="space-y-2">
                      {list.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-2.5"
                        >
                          <span className="text-xl select-none" aria-hidden="true">
                            {p.emoji}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {p.categoryLabel} · {formatDistance(p.distanceKm)}
                            </p>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-600 shrink-0">{p.priceLabel}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Carte d'action hôte. */
function HostActionCard({
  emoji,
  title,
  subtitle,
  badge,
  onClick,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full text-left bg-white border border-slate-200 rounded-xl shadow-sm p-4 hover:shadow-md hover:border-slate-300 active:scale-[0.99] transition-all cursor-pointer"
    >
      {badge && (
        <span className="absolute top-3 right-3 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold">
          {badge}
        </span>
      )}
      <div className="flex items-center gap-3.5">
        <EmojiIcon emoji={emoji} size="lg" variant="default" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{subtitle}</p>
        </div>
        <PencilLine className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
      </div>
    </button>
  );
}

/** Dialog : modification des identifiants Wi-Fi (PUT update + PIN).
 * Monté uniquement quand ouvert → l'état initial repart du contenu courant. */
function WifiEditDialog({
  onClose,
  slug,
  pin,
  wifi,
  onSaved,
}: {
  onClose: () => void;
  slug: string;
  pin: string;
  wifi: HostData['wifi'];
  onSaved: (w: HostData['wifi']) => void;
}) {
  const [ssid, setSsid] = useState(wifi?.networkName ?? '');
  const [password, setPassword] = useState(wifi?.password ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!wifi || !ssid.trim() || !password.trim()) {
      toast.error('Renseignez le nom du réseau et le mot de passe.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin,
          updates: [
            {
              qrCodeId: wifi.qrCodeId,
              content: {
                network_name: ssid.trim(),
                password: password.trim(),
                security_type: wifi.securityType || 'WPA2',
              },
            },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Échec de la mise à jour.');
        setSaving(false);
        return;
      }
      onSaved({ ...wifi, networkName: ssid.trim(), password: password.trim() });
      toast.success('Wi-Fi mis à jour ✅', {
        description: 'Vos voyageurs voient le nouveau réseau immédiatement.',
      });
      setSaving(false);
      onClose();
    } catch {
      toast.error('Erreur réseau.');
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !saving) onClose();
      }}
    >
      <DialogContent className="max-w-sm bg-white border border-slate-200 rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">📶 Modifier le Wi-Fi</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Les nouveaux identifiants sont visibles immédiatement par vos voyageurs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wifi-ssid">Nom du réseau (SSID)</Label>
            <Input
              id="wifi-ssid"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              placeholder="MonLogement_5G"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wifi-pwd">Mot de passe</Label>
            <Input
              id="wifi-pwd"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button
            type="button"
            disabled={saving}
            onClick={save}
            className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// Dialog contact hôte + message vocal (répondeur)
// =============================================================
function ContactDialog({
  open,
  onClose,
  slug,
  contact,
  propertyName,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  contact: HubPayload['guest']['contact'];
  propertyName: string;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);

  const stopTimers = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cleanup = useCallback(() => {
    stopTimers();
    setRecording(false);
    setSeconds(0);
    secondsRef.current = 0;
    recorderRef.current?.stream?.getTracks?.().forEach((t) => t.stop());
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => {
    if (!open) cleanup();
  }, [open, cleanup]);

  const stopRecording = (send: boolean) => {
    const recorder = recorderRef.current;
    stopTimers();
    if (!recorder) return;
    const duration = secondsRef.current;
    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      setRecording(false);
      if (!send) {
        toast.info('Enregistrement annulé.');
        return;
      }
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      if (blob.size === 0) {
        toast.error('Enregistrement vide. Réessayez.');
        return;
      }
      setSending(true);
      try {
        const fd = new FormData();
        fd.append('audio', new File([blob], 'message.webm', { type: 'audio/webm' }));
        fd.append('senderName', 'Invité');
        fd.append('durationSec', String(duration));
        const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/voice`, {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) throw new Error('http');
        toast.success('Message envoyé à votre hôte ✅');
        onClose();
      } catch {
        toast.error('Envoi impossible. Réessayez.');
      } finally {
        setSending(false);
      }
    };
    recorder.stop();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      secondsRef.current = 0;
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= 30) {
          stopRecording(true);
        }
      }, 1000);
    } catch {
      toast.error('Micro inaccessible. Vérifiez les autorisations du navigateur.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onClose()}>
      <DialogContent className="max-w-sm bg-white border border-slate-200 rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">🚨 Contacter votre hôte</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Un souci dans {propertyName} ? {contact.name} vous répond rapidement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {contact.phone && (
            <a
              href={`tel:${contact.phone.replace(/\s/g, '')}`}
              className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 hover:bg-slate-100 transition-colors"
            >
              <span className="text-2xl select-none" aria-hidden="true">
                📞
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900">Appeler {contact.name}</p>
                <p className="text-xs text-slate-500">{contact.phone}</p>
              </div>
              <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}?subject=${encodeURIComponent(`Message du Hub — ${propertyName}`)}`}
              className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 hover:bg-slate-100 transition-colors"
            >
              <span className="text-2xl select-none" aria-hidden="true">
                ✉️
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900">Écrire un email</p>
                <p className="text-xs text-slate-500 truncate">{contact.email}</p>
              </div>
              <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </a>
          )}

          {/* Répondeur vocal */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
            <p className="text-sm font-bold text-emerald-900">🎙️ Laisser un message vocal</p>
            <p className="text-[11px] text-emerald-800 mt-0.5">
              Décrivez le problème en 30 s max — votre hôte reçoit un audible.
            </p>
            {sending ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-emerald-800">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Envoi en cours…
              </div>
            ) : recording ? (
              <div className="mt-3 flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-red-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                  {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                  onClick={() => stopRecording(true)}
                >
                  <Square className="h-3.5 w-3.5" aria-hidden="true" /> Envoyer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 border-slate-300 text-slate-600"
                  onClick={() => stopRecording(false)}
                >
                  Annuler
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                className="mt-3 w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                onClick={startRecording}
              >
                <Mic className="h-4 w-4" aria-hidden="true" /> Démarrer l&apos;enregistrement
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
