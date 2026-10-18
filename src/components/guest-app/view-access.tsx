'use client';

import { useState } from 'react';
import { accessCodeRows, type GuestAccessCodes } from '@/lib/concierge';
import { HUB_VISUALS } from '@/lib/hub-visuals';
import { PhotoBand } from './photo-band';

// =============================================================
// DIGITAL CONCIERGE (V4.1) — ÉTAPE 3.2 : 🔑 Coffre-fort numérique
// Tous les codes d'accès du logement au même endroit.
// Sécurité UX : valeurs masquées (••••••) par défaut, révélation
// 👁️ à la demande + copie 📋 — et rappel de confidentialité.
// v4.25 « HUB RÉEL » — l'en-tête porte une VRAIE photo (serrure
// connectée) au lieu du grand emoji 🔑 ; repli emoji si échec.
// =============================================================

export function AccessView({ accessCodes }: { accessCodes: GuestAccessCodes | null }) {
  const rows = accessCodes ? accessCodeRows(accessCodes) : [];

  if (!accessCodes || rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden mt-2 text-center" role="status">
        <PhotoBand
          src={HUB_VISUALS.access}
          emoji="🔑"
          alt="Serrure connectée du logement"
          className="h-28"
        />
        <div className="p-6">
          <h1 className="text-lg font-bold text-card-foreground">Codes d'accès en préparation</h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Votre hôte n'a pas encore renseigné les codes (bâtiment, boîte aux lettres, parking…).
            Ils vous seront communiqués avant votre arrivée.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-2">
      {/* En-tête du coffre-fort — VRAIE PHOTO (v4.25 « hub réel ») */}
      <section
        aria-label="Coffre-fort numérique"
        className="rounded-2xl shadow-sm overflow-hidden border border-border"
      >
        <PhotoBand
          src={HUB_VISUALS.access}
          emoji="🔑"
          alt="Serrure connectée du logement"
          className="h-32"
        >
          <div className="p-5 text-left">
            <h1 className="text-lg font-bold text-white leading-tight drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
              Coffre-fort numérique
            </h1>
            <p className="mt-1 text-xs text-white/85 leading-relaxed drop-shadow-sm">
              Tous les codes d'accès du logement, au même endroit.
            </p>
          </div>
        </PhotoBand>
      </section>

      {/* Codes (masqués par défaut) */}
      <section aria-label="Codes d'accès" className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <SecretRow key={row.label} emoji={row.emoji} label={row.label} value={row.value} />
          ))}
        </ul>
      </section>

      {/* Note libre de l'hôte */}
      {accessCodes.note && (
        <section aria-label="Note de l'hôte" className="bg-accent/5 border border-accent/30 rounded-2xl p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-accent">📝 Note de votre hôte</p>
          <p className="mt-1.5 text-sm text-card-foreground leading-relaxed">{accessCodes.note}</p>
        </section>
      )}

      {/* Confidentialité */}
      <p className="px-2 text-[11px] text-muted-foreground leading-relaxed text-center" role="note">
        🔒 Ces codes sont personnels, merci de ne pas les partager.
      </p>
    </div>
  );
}

/** Ligne de code : masquée par défaut, 👁️ révéler, 📋 copier. */
function SecretRow({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <span className="text-xl select-none shrink-0" aria-hidden="true">{emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-card-foreground font-mono truncate">
          {shown ? value : '••••••'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? `Masquer le code « ${label} »` : `Afficher le code « ${label} »`}
        className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg border border-border bg-card text-sm hover:bg-secondary transition-colors cursor-pointer"
      >
        {shown ? '🙈' : '👁️'}
      </button>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copier le code « ${label} »`}
        className="h-8 shrink-0 inline-flex items-center gap-1 px-2.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 transition-opacity cursor-pointer"
      >
        {copied ? '✓ Copié' : '📋 Copier'}
      </button>
    </li>
  );
}
