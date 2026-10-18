'use client';

import type { GuestView } from './types';

// =============================================================
// DIGITAL CONCIERGE (V4.1) — SOUS-ÉTAPE A : teasers des onglets
// 🗺️ Quartier et 🆘 Urgence (structure + navigation validables).
// → Remplacés à l'ÉTAPE 3 par les pages complètes :
//   tab-local (carte secrète + filtres) et tab-sos (SOS + pannes).
// =============================================================

function ModuleTeaser({
  emoji,
  title,
  subtitle,
  children,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="bg-card border border-border rounded-2xl shadow-sm p-8 text-center mt-6"
    >
      <span className="text-5xl select-none" aria-hidden="true">
        {emoji}
      </span>
      <h2 className="mt-4 text-lg font-bold text-card-foreground leading-snug">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
      {children}
    </section>
  );
}

/** Onglet 🗺️ Quartier — « La Carte Secrète de l'Hôte » (Étape 3.4). */
export function TabLocal() {
  return (
    <ModuleTeaser
      emoji="🗺️"
      title="La Carte Secrète de l'Hôte"
      subtitle="Les meilleures adresses du quartier, sélectionnées par votre hôte : restaurants, bars, courses et balades. Ce module arrive très bientôt !"
    />
  );
}

/** Onglet 🆘 Urgence — SOS + pannes courantes (Étape 3.5). */
export function TabSos({ onNavigate }: { onNavigate: (view: GuestView) => void }) {
  return (
    <>
      <ModuleTeaser
        emoji="🆘"
        title="Urgences & Dépannage"
        subtitle="Numéros d'urgence, hôpital et pharmacie de garde, pannes courantes avec les bons gestes. Ce module est en cours de configuration par votre hôte."
      />

      {/* Accès direct au contact hôte existant (en attendant l'Étape 3.5) */}
      <section
        aria-label="Contacter l'hôte"
        className="bg-card border border-border rounded-2xl shadow-sm p-5 mt-4"
      >
        <p className="text-sm font-bold text-card-foreground">Besoin de votre hôte maintenant ?</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Un souci dans le logement ? Écrivez-lui ou appelez-le directement.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('help')}
          className="mt-3.5 w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
        >
          💬 Contacter l&apos;hôte
        </button>
      </section>
    </>
  );
}
