'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { geoDirectionsUrl, type GuestEmergencyInfo } from '@/lib/concierge';
import { GuestMedia } from './guest-media';
import { NearbyPharmacyCard } from './nearby-pharmacy-card';
import type { GuestView } from './types';

// =============================================================
// DIGITAL CONCIERGE (V4.1) — ÉTAPE 3.5 : onglet 🆘 Urgence / SOS
// Design volontairement plus « sérieux » (bordures rouges
// subtiles) : appels directs en 1 tap (SAMU 15, Pompiers 18,
// Police 17, UE 112), urgence logement (hôte), hôpital le plus
// proche (itinéraire), pharmacie de garde et pannes courantes.
// 8 AMÉLIORATIONS (PHASE 1) — 1.4 : + carte automatique « Pharmacie
// de garde — la plus proche de vous » (Geoapify/OSM via proxy
// serveur, itinéraire GPS + appel direct), placée après l'hôpital.
// =============================================================

interface SosContact {
  name: string;
  phone: string | null;
  email: string | null;
}

export function TabSos({
  slug,
  contact,
  emergencyInfo,
  propertyLat = null,
  propertyLng = null,
  onNavigate,
}: {
  slug: string;
  contact: SosContact;
  emergencyInfo: GuestEmergencyInfo | null;
  /** Coordonnées du bien — carte pharmacie automatique (1.4). */
  propertyLat?: number | null;
  propertyLng?: number | null;
  onNavigate: (view: GuestView) => void;
}) {
  const hostPhone = emergencyInfo?.hostPhone || contact.phone;
  const police = emergencyInfo?.police || '17';

  const officialNumbers = [
    { emoji: '🚑', label: 'SAMU', number: '15' },
    { emoji: '🚒', label: 'Pompiers', number: '18' },
    { emoji: '👮', label: 'Police', number: police },
    { emoji: '🌍', label: 'Urgences UE', number: '112' },
  ];

  return (
    <div className="mt-2 space-y-4">
      {/* ── 1. Urgence logement (l'hôte) — action n°1 ── */}
      <section
        aria-label="Urgence logement"
        className="bg-card border border-rose-200 dark:border-rose-500/40 rounded-2xl shadow-sm p-5"
      >
        <h1 className="text-base font-bold text-card-foreground">🏠 Un souci dans le logement&nbsp;?</h1>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          {contact.name} est prévenu immédiatement et vous répond en priorité.
        </p>
        {hostPhone ? (
          <a
            href={`tel:${hostPhone.replace(/\s+/g, '')}`}
            className="mt-3.5 flex flex-col items-center justify-center gap-0.5 h-14 w-full rounded-xl bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] transition-all"
          >
            <span className="text-sm font-bold">📞 Appeler {contact.name}</span>
            <span className="text-xs font-semibold opacity-90">{hostPhone}</span>
          </a>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground" role="note">
            Numéro indisponible — écrivez-lui via le bouton ci-dessous.
          </p>
        )}
        <button
          type="button"
          onClick={() => onNavigate('help')}
          className="mt-2 h-10 w-full rounded-xl border border-border bg-card text-card-foreground text-sm font-semibold hover:bg-secondary transition-colors cursor-pointer"
        >
          💬 Écrire à l'hôte / Signaler un problème
        </button>
      </section>

      {/* ── 2. Numéros d'urgence officiels ── */}
      <section aria-label="Numéros d'urgence officiels" className="bg-card border border-border rounded-2xl shadow-sm p-5">
        <h2 className="text-base font-bold text-card-foreground">🚨 Numéros d'urgence</h2>
        <p className="mt-1 text-xs text-muted-foreground">Appel gratuit — 24 h/24, 7 j/7.</p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {officialNumbers.map((n) => (
            <a
              key={n.label}
              href={`tel:${n.number}`}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 py-3.5 min-h-[68px] hover:border-rose-400 dark:hover:border-rose-400 active:scale-[0.97] transition-all"
            >
              <span className="text-xl select-none" aria-hidden="true">{n.emoji}</span>
              <span className="text-xs font-bold text-rose-700 dark:text-rose-300">{n.label}</span>
              <span className="text-lg font-black text-rose-600 dark:text-rose-200 leading-none">{n.number}</span>
            </a>
          ))}
        </div>
      </section>

      {/* ── 3. Hôpital le plus proche (configuré par l'hôte) ── */}
      {emergencyInfo?.hospital && (
        <section
          aria-label="Hôpital le plus proche"
          className="bg-card border border-rose-200 dark:border-rose-500/40 rounded-2xl shadow-sm p-5"
        >
          <h2 className="text-base font-bold text-card-foreground">🏥 Hôpital le plus proche</h2>
          <p className="mt-1 text-sm text-card-foreground font-semibold">{emergencyInfo.hospital}</p>
          {typeof emergencyInfo.hospitalLat === 'number' && typeof emergencyInfo.hospitalLng === 'number' && (
            <a
              href={geoDirectionsUrl(emergencyInfo.hospitalLat, emergencyInfo.hospitalLng)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 h-10 w-full rounded-xl border border-rose-300 dark:border-rose-500/50 bg-card text-rose-700 dark:text-rose-300 text-sm font-bold hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
            >
              🧭 Itinéraire
              <span aria-hidden="true" className="opacity-70">↗</span>
            </a>
          )}
        </section>
      )}

      {/* ── 3.5 8 AMÉLIORATIONS 1.4 — Pharmacie la plus proche (auto) ── */}
      <NearbyPharmacyCard
        slug={slug}
        propertyLat={typeof propertyLat === 'number' ? propertyLat : null}
        propertyLng={typeof propertyLng === 'number' ? propertyLng : null}
      />

      {/* ── 4. Pharmacie de garde (configurée par l'hôte) ── */}
      {emergencyInfo?.pharmacy && (
        <section
          aria-label="Pharmacie de garde"
          className="bg-card border border-border rounded-2xl shadow-sm p-5"
        >
          <h2 className="text-base font-bold text-card-foreground">💊 Pharmacie de garde</h2>
          <p className="mt-1 text-sm text-card-foreground font-semibold">{emergencyInfo.pharmacy}</p>
          {emergencyInfo.pharmacyPhone && (
            <a
              href={`tel:${emergencyInfo.pharmacyPhone.replace(/\s+/g, '')}`}
              className="mt-3 flex items-center justify-center gap-1.5 h-10 w-full rounded-xl bg-secondary border border-border text-card-foreground text-sm font-semibold hover:bg-accent/10 transition-colors"
            >
              📞 Appeler la pharmacie
            </a>
          )}
        </section>
      )}

      {/* ── 5. Pannes courantes (configurées par l'hôte) ── */}
      {emergencyInfo && emergencyInfo.commonIssues.length > 0 && (
        <section aria-label="Pannes courantes" className="bg-card border border-border rounded-2xl shadow-sm p-5">
          <h2 className="text-base font-bold text-card-foreground">🔧 Pannes courantes — les bons réflexes</h2>
          <Accordion type="single" collapsible className="mt-2 -mx-1">
            {emergencyInfo.commonIssues.map((issue) => (
              <AccordionItem key={issue.id} value={issue.id} className="border-border px-1">
                <AccordionTrigger className="hover:no-underline py-3.5">
                  <span className="text-sm font-bold text-card-foreground text-left leading-snug">{issue.title}</span>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm text-card-foreground/90 leading-relaxed whitespace-pre-line">
                    {issue.instructions}
                  </p>
                  <div className="mt-3">
                    <GuestMedia imageUrl={issue.imageUrl} alt={issue.title} />
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      )}

      {/* Rappel sécurité */}
      <p className="px-2 pb-2 text-[11px] text-muted-foreground leading-relaxed text-center" role="note">
        ⚠️ En cas de danger immédiat ou de risque vital, appelez directement le <strong>112</strong>.
      </p>
    </div>
  );
}
