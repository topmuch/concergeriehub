'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { GuestAppliance, GuestSurvivalItem } from '@/lib/concierge';
import { HUB_VISUALS } from '@/lib/hub-visuals';
import { GuestMedia } from './guest-media';
import { PhotoBand } from './photo-band';
import type { GuestPayload } from './types';

// =============================================================
// ÉTAPE 16 (V3) — Onglet 📖 Guide
// Guidebook complet (contenu inline → mis en cache par le SW →
// lisible HORS-LIGNE) + règles de la maison si QR dédié.
// DIGITAL CONCIERGE (V4.1) — ÉTAPE 3.3 : + Guide des appareils
// (accordéons : instructions + vidéo tutorielle / photo / GIF).
// PREMIUM V5 — Kit de survie : les objets qu'on oublie souvent,
// avec leur emplacement exact (configuré par l'hôte).
// v4.25 « HUB RÉEL » — chaque section porte une VRAIE photo
// d'en-tête (guidebook, kit, appareils) ; repli emoji si échec.
// WP-VISUAL — 🎙️ VOIX DE L'HÔTE : si payload.property.guidebookVoice
// disponible (contrat backend parallèle), une carte compacte premium
// en TÊTE de guide embarque le mémo audio de l'hôte (player natif
// <audio>, URL /api/public/hub/<slug>/voice-messages/audio?kind=guidebook
// &lang=fr&v=<v> — audio/mpeg, repli FR géré côté serveur). Payload
// ancien (champ absent) → aucune carte. Sécurité hors-ligne : preload="none"
// (rien ne se télécharge avant un tap explicite de l'invité).
// =============================================================

export function TabGuide({ guidebook, houseRules, appliances, survivalItems, slug, guidebookVoice }: {
  guidebook: GuestPayload['guest']['guidebook'];
  houseRules: string[] | null;
  appliances: GuestAppliance[];
  survivalItems: GuestSurvivalItem[];
  /** WP-VISUAL — slug du hub → construit l'URL du mémo audio. */
  slug: string;
  /** WP-VISUAL — contrat : payload.property.guidebookVoice
   *  (absent/null sur payload ancien → carte non rendue). */
  guidebookVoice?: GuestPayload['property']['guidebookVoice'];
}) {
  const hasGuide = guidebook && guidebook.body.trim();
  const hasAppliances = appliances.length > 0;

  // ── WP-VISUAL — 🎙️ VOIX DE L'HÔTE (contrat backend parallèle) ──
  // Card rendue UNIQUEMENT si le payload déclare guidebookVoice.available
  // avec une version numérique (v sert de cache-bust à l'URL audio).
  const voice = guidebookVoice && guidebookVoice.available === true
    && typeof guidebookVoice.v === 'number' && Number.isFinite(guidebookVoice.v)
    ? guidebookVoice
    : null;
  const voiceUrl = voice
    ? `/api/public/hub/${encodeURIComponent(slug)}/voice-messages/audio?kind=guidebook&lang=fr&v=${voice.v}`
    : null;

  // ── 8 AMÉLIORATIONS (PHASE 1) — 1.3 KIT DE SURVIE CONDITIONNEL ──
  // Contrat strict : la section « Kit de survie » n'est rendue QUE si
  // `survivalKitItems` existe ET contient au moins 1 item (parseSurvivalKit
  // filtre déjà les entrées invalides côté API). Sans item → la section est
  // simplement OMISE (jamais de carte vide). Si en PLUS il n'y a ni guidebook
  // ni appareils, l'état vide global « Guide en préparation » s'affiche.
  const hasSurvival = Array.isArray(survivalItems) && survivalItems.length > 0;

  // Rien du tout → état vide encourageant (photo d'intérieur)
  // WP-VISUAL : le mémo vocal de l'hôte compte comme du contenu.
  if (!hasGuide && !hasAppliances && !hasSurvival && !voice) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden text-center" role="status">
        <PhotoBand
          src={HUB_VISUALS.guidebook}
          emoji="📖"
          alt="Intérieur du logement — guide de la maison"
          className="h-28"
        />
        <div className="p-8 pt-5">
          <h2 className="text-lg font-bold text-card-foreground">Guide en préparation</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Votre hôte prépare son guide de bienvenue&nbsp;: accès, équipements, bonnes adresses… Revenez très vite&nbsp;!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── WP-VISUAL — 🎙️ Voix de l'hôte (en tête du guide) ── */}
      {voice && voiceUrl && (
        <section
          className="bg-card border border-accent/30 rounded-2xl shadow-sm p-5"
          aria-label="Message vocal de l'hôte"
        >
          <h2 className="text-base font-bold text-card-foreground leading-snug">
            🎙️ L'hôte vous explique le guide
          </h2>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Écoutez l'essentiel en une minute — parfait en arrivant devant la porte.
          </p>
          <div className="mt-3 rounded-xl bg-secondary border border-border p-2.5">
            <audio controls preload="none" src={voiceUrl} className="w-full">
              Votre navigateur ne prend pas en charge la lecture audio.
            </audio>
          </div>
        </section>
      )}

      {hasGuide && (
        <>
          <section
            className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden"
            aria-label="Guide de bienvenue"
          >
            {/* En-tête photo — VRAIE PHOTO (v4.25 « hub réel ») */}
            <PhotoBand
              src={HUB_VISUALS.guidebook}
              emoji="📖"
              alt="Intérieur du logement — guide de la maison"
              className="h-28"
            >
              <div className="p-4">
                <h1 className="text-lg font-bold text-white leading-snug drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
                  {guidebook!.title}
                </h1>
              </div>
            </PhotoBand>
            <div className="p-5 pt-4">
              <div className="flex items-start justify-between gap-3">
                <span
                  className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-accent/10 text-accent border border-accent/30"
                  title="Consultable même sans réseau"
                >
                  📴 Hors-ligne
                </span>
              </div>
              <div className="mt-3 space-y-3.5">
                {guidebook!.body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).map((block, i) => (
                  <GuideBlock key={i} block={block} />
                ))}
              </div>
            </div>
          </section>

          {houseRules && houseRules.length > 0 && (
            <section className="bg-card border border-border rounded-2xl shadow-sm p-5" aria-label="Règles de la maison">
              <h2 className="text-base font-bold text-card-foreground">🛡️ Règles de la maison</h2>
              <ul className="mt-3 space-y-2">
                {houseRules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-card-foreground leading-relaxed">
                    <span className="mt-0.5 select-none shrink-0" aria-hidden="true">✅</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Merci de les respecter — les voisins (et votre hôte) vous disent merci&nbsp;🙏
              </p>
            </section>
          )}
        </>
      )}

      {/* ── PREMIUM V5 — Kit de survie ── */}
      {hasSurvival && (
        <section className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden" aria-label="Kit de survie">
          {/* En-tête photo — entrée rangée (v4.25 « hub réel ») */}
          <PhotoBand
            src={HUB_VISUALS.survival}
            emoji="🧰"
            alt="Entrée du logement — patères et parapluie"
            className="h-24"
          >
            <div className="p-4">
              <h2 className="text-base font-bold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">Kit de survie</h2>
            </div>
          </PhotoBand>
          <div className="p-5 pt-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Les objets qu&apos;on oublie souvent — ils sont déjà là pour vous, à ces endroits&nbsp;:
            </p>
            <ul className="mt-3 space-y-2">
              {survivalItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-2.5 rounded-xl bg-secondary border border-border px-3.5 py-2.5"
                >
                  <span className="text-base leading-none mt-0.5 select-none shrink-0" aria-hidden="true">🧷</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-card-foreground leading-snug">{item.name}</p>
                    {item.location && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">📍 {item.location}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── DIGITAL CONCIERGE — Guide des appareils (accordéons) ── */}
      {hasAppliances && (
        <section className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden" aria-label="Guide des appareils">
          {/* En-tête photo — coin café / appareils (v4.25 « hub réel ») */}
          <PhotoBand
            src={HUB_VISUALS.appliances}
            emoji="🛠️"
            alt="Équipements du logement — coin café"
            className="h-24"
          >
            <div className="p-4">
              <h2 className="text-base font-bold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">Comment ça marche&nbsp;?</h2>
            </div>
          </PhotoBand>
          <div className="p-5 pt-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Les équipements du logement expliqués simplement — cliquez pour dérouler.
            </p>
            <Accordion type="single" collapsible className="mt-2 -mx-1">
              {appliances.map((app) => (
                <AccordionItem key={app.id} value={app.id} className="border-border px-1">
                  <AccordionTrigger className="hover:no-underline py-3.5">
                    <span className="flex items-center gap-2.5 text-left">
                      <span className="text-xl leading-none select-none shrink-0" aria-hidden="true">
                        {app.emoji ?? '🛠️'}
                      </span>
                      <span className="text-sm font-bold text-card-foreground leading-snug">{app.name}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <p className="text-sm text-card-foreground/90 leading-relaxed whitespace-pre-line">
                      {app.instructions}
                    </p>
                    <div className="mt-3">
                      <GuestMedia videoUrl={app.videoUrl} imageUrl={app.imageUrl} alt={app.name} />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      )}
    </div>
  );
}

/** Heuristique de rendu : une ligne courte (≤ 48 caractères, sans
    ponctuation finale) est traitée comme un intertitre de section
    (ex: "🔑 Accès"), le reste comme un paragraphe. */
function GuideBlock({ block }: { block: string }) {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const first = lines[0];
  const isHeading =
    lines.length === 1 && first.length <= 48 && !/[.!?;]$/.test(first);

  if (isHeading) {
    return <h2 className="text-base font-bold text-card-foreground pt-1">{first}</h2>;
  }

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-card-foreground/90 leading-relaxed whitespace-pre-line">
          {line}
        </p>
      ))}
    </div>
  );
}
