'use client';

import { useState } from 'react';
import { InstallButton } from './install-button';
import {
  formatFrDate,
  daysUntil,
  type GuestPayload,
  type GuestTab,
} from './types';

// =============================================================
// ÉTAPE 16 (V3) — Onglet 🏠 Accueil
// Message de bienvenue personnalisé (nom du guest si connecté via
// booking ?b=), Wi-Fi copiable, raccourcis, installation PWA.
// =============================================================

export function TabHome({
  payload,
  onNavigate,
}: {
  payload: GuestPayload;
  onNavigate: (tab: GuestTab) => void;
}) {
  const { property, guest, ownerName } = payload;
  const booking = guest.booking;
  const firstName = booking ? booking.guestName.trim().split(/\s+/)[0] : null;
  const nightsLeft = booking ? daysUntil(booking.checkOut) : null;

  return (
    <div className="space-y-4">
      {/* Héro du logement */}
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

      {/* Bienvenue personnalisé (connecté via booking) */}
      <section aria-label="Bienvenue" className="bg-card border border-border rounded-2xl shadow-sm p-5">
        <h2 className="text-lg font-bold text-card-foreground">
          {firstName ? `Bonjour ${firstName} 👋` : 'Bienvenue 👋'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {booking ? (
            <>
              Votre séjour est en cours — profitez bien&nbsp;!{' '}
              {ownerName && <>En cas de besoin, {ownerName} est à votre écoute.</>}
            </>
          ) : (
            <>Tout ce dont vous avez besoin pendant votre séjour est ici : Wi-Fi, guide, services et assistance.</>
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

      {/* Wi-Fi */}
      {guest.wifi ? (
        <WifiCard wifi={guest.wifi} />
      ) : (
        <EmptyCard emoji="📶" title="Wi-Fi" subtitle="Informations en cours de préparation par votre hôte" />
      )}

      {/* Raccourcis */}
      <div className="grid grid-cols-3 gap-3" role="navigation" aria-label="Raccourcis">
        <QuickAction emoji="📖" label="Le guide" onClick={() => onNavigate('guide')} />
        <QuickAction emoji="🥐" label="Services" onClick={() => onNavigate('services')} />
        <QuickAction emoji="🚨" label="Aide" onClick={() => onNavigate('help')} />
      </div>

      {/* Installation PWA (discret) */}
      <InstallButton />
    </div>
  );
}

function WifiCard({ wifi }: { wifi: NonNullable<GuestPayload['guest']['wifi']> }) {
  const [open, setOpen] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [copied, setCopied] = useState<'ssid' | 'pwd' | null>(null);

  const copy = async (text: string, which: 'ssid' | 'pwd') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <section className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden" aria-label="Wi-Fi">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3.5 p-4 text-left cursor-pointer hover:bg-secondary/50 transition-colors"
      >
        <span className="text-2xl select-none shrink-0" aria-hidden="true">
          📶
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-card-foreground">Se connecter au Wi-Fi</p>
          <p className="text-xs text-muted-foreground truncate">
            {wifi.networkName} · {wifi.securityType}
          </p>
        </div>
        <span
          className={`text-muted-foreground transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          ›
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2.5 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2 bg-secondary border border-border rounded-xl px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Réseau</p>
              <p className="text-sm font-semibold text-card-foreground truncate">{wifi.networkName}</p>
            </div>
            <button
              type="button"
              onClick={() => copy(wifi.networkName, 'ssid')}
              className="shrink-0 text-xs font-semibold rounded-lg px-3 py-1.5 border border-border bg-card text-card-foreground hover:bg-secondary transition-colors cursor-pointer"
            >
              {copied === 'ssid' ? '✓ Copié' : 'Copier'}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 bg-secondary border border-border rounded-xl px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Mot de passe</p>
              <p className="text-sm font-semibold text-card-foreground truncate font-mono">
                {showPwd ? wifi.password : '••••••••••'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-card-foreground transition-colors cursor-pointer"
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
              <button
                type="button"
                onClick={() => copy(wifi.password, 'pwd')}
                className="text-xs font-semibold rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
              >
                {copied === 'pwd' ? '✓ Copié' : 'Copier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function QuickAction({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 bg-card border border-border rounded-2xl shadow-sm p-4 hover:border-accent hover:bg-accent/5 active:scale-[0.97] transition-all cursor-pointer"
    >
      <span className="text-2xl select-none" aria-hidden="true">
        {emoji}
      </span>
      <span className="text-xs font-semibold text-card-foreground">{label}</span>
    </button>
  );
}

function EmptyCard({ emoji, title, subtitle }: { emoji: string; title: string; subtitle: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-4 opacity-60" aria-disabled="true">
      <div className="flex items-center gap-3.5">
        <span className="text-2xl select-none" aria-hidden="true">
          {emoji}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-card-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
