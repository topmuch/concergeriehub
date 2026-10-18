'use client';

import { useState } from 'react';
import { isLocalMediaUrl, isYouTubeUrl } from '@/lib/concierge';

// =============================================================
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — 2.2 VIDÉO DE BIENVENUE
// Carte « 👋 Un mot de votre hôte » en tête de l'Accueil.
//
// Sources supportées (CSP V5 : frame-src youtube-nocookie / Vimeo /
// Loom uniquement) :
//   • vidéo locale (/uploads/…, /demo/…) → <video> natif
//   • YouTube / Vimeo / Loom → CLICK-TO-LOAD : couverture (miniature
//     YouTube i.ytimg.com pour YT, visuel sobre sinon) + bouton ▶.
//     L'iframe n'est montée qu'au clic (aucun cookie/script tiers
//     avant une action volontaire de l'invité) et démarre en autoplay
//     (action utilisateur = autorisée par les navigateurs).
// =============================================================

type EmbedInfo =
  | { kind: 'youtube'; videoId: string; embedUrl: string; thumb: string }
  | { kind: 'vimeo'; embedUrl: string }
  | { kind: 'loom'; embedUrl: string }
  | { kind: 'video'; src: string }
  | null;

/**
 * AUDIT 4-c — distingue « pas d'URL » (rien à rendre) d'une URL NON
 * RECONNUE (YouTube/Vimeo/Loom/local) : dans ce cas on affiche la
 * carte avec un message d'attente au lieu de ne rien rendre
 * silencieusement (l'hôte a configuré une vidéo non encore lue).
 */
function isUnrecognizedUrl(url: string): boolean {
  return url.trim().length > 0 && resolveEmbed(url) === null;
}

function resolveEmbed(url: string): EmbedInfo {
  const u = url.trim();
  if (!u) return null;

  // Vidéo hébergée sur l'app → lecture native
  if (isLocalMediaUrl(u) && !isYouTubeUrl(u)) {
    return { kind: 'video', src: u };
  }

  // YouTube (watch, youtu.be, shorts, embed)
  const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(u);
  if (yt) {
    return {
      kind: 'youtube',
      videoId: yt[1],
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&autoplay=1`,
      thumb: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`,
    };
  }

  // Vimeo (vimeo.com/123456 ou /video/123456)
  const vimeo = /vimeo\.com\/(?:video\/)?(\d{6,})/.exec(u);
  if (vimeo) {
    return { kind: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1` };
  }

  // Loom (loom.com/share/<id> ou /embed/<id>)
  const loom = /loom\.com\/(?:share|embed)\/([a-f0-9]{16,})/i.exec(u);
  if (loom) {
    return { kind: 'loom', embedUrl: `https://www.loom.com/embed/${loom[1]}?autoplay=1` };
  }

  return null;
}

export function WelcomeVideoCard({
  url,
  hostName,
  propertyName,
}: {
  url: string;
  hostName: string | null;
  propertyName: string;
}) {
  const [playing, setPlaying] = useState(false);
  const embed = resolveEmbed(url);
  const title = hostName ? `👋 Un mot de ${hostName.split(/\s+/)[0]}` : '👋 Un mot de votre hôte';

  // AUDIT 4-c — URL configurée mais non reconnue (ni YouTube/Vimeo/
  // Loom, ni vidéo locale) → carte d'attente, PAS d'iframe.
  if (!embed) {
    if (!isUnrecognizedUrl(url)) return null;
    return (
      <section
        aria-label="Vidéo de bienvenue"
        className="bg-card border border-border rounded-2xl shadow-sm p-5"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none select-none" aria-hidden="true">👋</span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-card-foreground leading-tight">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Petit message de bienvenue pour {propertyName}</p>
          </div>
        </div>
        <div className="mt-3.5 flex items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/60 px-4 py-5">
          <span className="text-2xl shrink-0" aria-hidden="true">🎬</span>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Vidéo de bienvenue bientôt disponible — votre hôte la configure.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Vidéo de bienvenue"
      className="bg-card border border-border rounded-2xl shadow-sm p-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="text-2xl leading-none select-none" aria-hidden="true">👋</span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-card-foreground leading-tight">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Petite vidéo de bienvenue pour {propertyName} — appuyez sur ▶
          </p>
        </div>
      </div>

      <div className="mt-3.5">
        {embed.kind === 'video' ? (
          <video
            controls
            preload="metadata"
            playsInline
            src={embed.src}
            className="w-full aspect-video rounded-xl border border-border bg-black/5 object-cover"
            aria-label="Vidéo de bienvenue de votre hôte"
          />
        ) : playing ? (
          <iframe
            src={embed.embedUrl}
            title="Vidéo de bienvenue de votre hôte"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full aspect-video rounded-xl border border-border bg-black"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Lire la vidéo de bienvenue"
            className="group relative block w-full aspect-video rounded-xl border border-border overflow-hidden bg-secondary cursor-pointer"
          >
            {embed.kind === 'youtube' ? (
              <img
                src={embed.thumb}
                alt="Aperçu de la vidéo de bienvenue"
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="absolute inset-0 bg-gradient-to-br from-secondary via-card to-secondary" aria-hidden="true" />
            )}
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-card/90 border border-border shadow-lg text-2xl transition-transform group-hover:scale-110 group-active:scale-95">
                ▶️
              </span>
            </span>
            <span className="absolute bottom-2 left-0 right-0 text-center">
              <span className="inline-block rounded-full bg-card/90 border border-border px-3 py-1 text-[11px] font-bold text-card-foreground">
                Lire la vidéo de {hostName ? hostName.split(/\s+/)[0] : 'votre hôte'}
              </span>
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
