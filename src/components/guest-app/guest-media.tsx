'use client';

import { isLocalMediaUrl, isYouTubeUrl } from '@/lib/concierge';

// =============================================================
// DIGITAL CONCIERGE (V4.1) — Rendu des médias invités (vidéo/
// photo) partagé par le Guide des appareils et les Pannes courantes.
// CSP assumée (FIX-8b : img/media 'self') :
//   • /uploads/… ou data: → rendu natif (<video>, <img>)
//   • lien YouTube / externe → chip cliquable (ouverture new tab)
// =============================================================

export function GuestMedia({ videoUrl, imageUrl, alt }: { videoUrl?: string; imageUrl?: string; alt: string }) {
  if (!videoUrl && !imageUrl) return null;
  return (
    <div className="space-y-2.5">
      {videoUrl && <GuestVideo url={videoUrl} />}
      {imageUrl && <GuestImage url={imageUrl} alt={alt} />}
    </div>
  );
}

function GuestVideo({ url }: { url: string }) {
  if (isLocalMediaUrl(url) && !isYouTubeUrl(url)) {
    return (
      <video
        controls
        preload="metadata"
        playsInline
        src={url}
        className="w-full rounded-xl border border-border bg-black/5"
        aria-label="Vidéo tutorielle de l'appareil"
      />
    );
  }
  const label = isYouTubeUrl(url) ? '▶️ Regarder la vidéo (YouTube)' : '▶️ Voir la vidéo';
  return <MediaChip href={url} label={label} />;
}

function GuestImage({ url, alt }: { url: string; alt: string }) {
  if (isLocalMediaUrl(url)) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="w-full rounded-xl border border-border object-cover max-h-64"
      />
    );
  }
  return <MediaChip href={url} label="🖼️ Voir la photo" />;
}

function MediaChip({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-secondary border border-border text-sm font-semibold text-card-foreground hover:border-accent hover:bg-accent/5 transition-colors"
    >
      {label}
      <span aria-hidden="true" className="text-muted-foreground">↗</span>
    </a>
  );
}
