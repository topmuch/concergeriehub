'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GuestPayload, GuestService } from './types';

// =============================================================
// ÉTAPE 16 (V3) — Onglet 🥐 Services
// Catalogue des prestataires GUEST_EXPERIENCE autour du bien
// (Morning Box, sommelier, transferts…). Fiche détail en bottom
// sheet. La COMMANDE transactionnelle (paiement in-app,
// commissions) arrive en ÉTAPE 17 — d'ici là, mise en relation
// par email avec l'hôte, comme sur le Hub V1.
// =============================================================

export function TabServices({ services, contact, propertyName }: {
  services: GuestService[];
  contact: GuestPayload['guest']['contact'];
  propertyName: string;
}) {
  const [selected, setSelected] = useState<GuestService | null>(null);

  if (services.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-sm p-8 text-center" role="status">
        <span className="text-5xl select-none" aria-hidden="true">🥐</span>
        <h2 className="mt-4 text-lg font-bold text-card-foreground">Aucun service pour l&apos;instant</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Votre hôte n&apos;a pas encore de partenaires autour de ce logement. Des expériences arrivent bientôt&nbsp;!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-lg font-bold text-card-foreground">Services &amp; expériences</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {services.length} proposition{services.length > 1 ? 's' : ''} de partenaires locaux vérifiés autour de {propertyName}
        </p>
      </div>

      <ul className="space-y-3">
        {services.map((svc) => (
          <li key={svc.id}>
            <button
              type="button"
              onClick={() => setSelected(svc)}
              className="w-full text-left bg-card border border-border rounded-2xl shadow-sm p-4 hover:border-accent active:scale-[0.99] transition-all cursor-pointer"
              aria-label={`Voir le service ${svc.name}`}
            >
              <div className="flex items-start gap-3.5">
                <span className="text-3xl leading-none select-none shrink-0" aria-hidden="true">
                  {svc.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-bold text-card-foreground">{svc.name}</p>
                    <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30">
                      {svc.priceLabel}
                    </span>
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5">
                    {svc.categoryLabel}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{svc.description}</p>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <p className="text-center text-[11px] text-muted-foreground px-4">
        🛍️ Paiement in-app et suivi de commande arrivent très bientôt.
      </p>

      {/* Fiche détail — bottom sheet */}
      <AnimatePresence>
        {selected && (
          <ServiceSheet
            service={selected}
            contact={contact}
            propertyName={propertyName}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ServiceSheet({ service, contact, propertyName, onClose }: {
  service: GuestService;
  contact: GuestPayload['guest']['contact'];
  propertyName: string;
  onClose: () => void;
}) {
  const [ordered, setOrdered] = useState(false);

  const order = () => {
    if (!contact.email) return;
    const subject = encodeURIComponent(`Demande de service — ${service.name} (${propertyName})`);
    const body = encodeURIComponent(
      `Bonjour ${contact.name},\n\nJe séjourne au "${propertyName}" et je souhaite commander :\n\n• ${service.name} (${service.categoryLabel}) — ${service.priceLabel}\n\nMerci de me confirmer la disponibilité.\n\nMerci !`,
    );
    window.location.assign(`mailto:${contact.email}?subject=${subject}&body=${body}`);
    setOrdered(true);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Service ${service.name}`}
    >
      {/* Fond */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 cursor-default"
      />

      <motion.div
        className="relative w-full max-w-lg rounded-t-3xl bg-card border-t border-x border-border p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        <div className="mx-auto h-1.5 w-12 rounded-full bg-border mb-4" aria-hidden="true" />

        <div className="flex items-start gap-4">
          <span className="text-4xl leading-none select-none" aria-hidden="true">
            {service.emoji}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-card-foreground">{service.name}</h2>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5">
              {service.categoryLabel} · Partenaire vérifié ✓
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm text-card-foreground/90 leading-relaxed">{service.description}</p>

        <div className="mt-4 rounded-xl bg-secondary border border-border p-3.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">Tarif</span>
          <span className="text-sm font-bold text-accent">{service.priceLabel}</span>
        </div>

        {contact.email ? (
          <button
            type="button"
            onClick={order}
            className="mt-4 w-full h-12 rounded-xl bg-accent text-accent-foreground font-bold text-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
          >
            {ordered ? '✓ Demande préparée dans votre messagerie' : `Commander — ${service.priceLabel}`}
          </button>
        ) : (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Demandez à votre hôte ({contact.name}) pour réserver ce service.
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-2.5 w-full h-11 rounded-xl border border-border bg-card text-card-foreground text-sm font-semibold hover:bg-secondary transition-colors cursor-pointer"
        >
          Fermer
        </button>
      </motion.div>
    </motion.div>
  );
}
