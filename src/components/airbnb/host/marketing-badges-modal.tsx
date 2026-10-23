'use client';

// =============================================================
// MarketingBadgesModal — Task 42-b (PARTIE 2 : BADGES MARKETING)
// =============================================================
// Modal de telechargement des 3 badges de confiance RoomScan que
// l'hote peut afficher sur ses annonces, son site ou ses reseaux :
//   1. Securite    — degrade bleu   #055492 -> #033a66
//   2. Proprete    — degrade vert   #16a34a -> #15803d
//   3. Technologie — degrade rouge  #C41E3A -> #a3122c
//
// Chaque badge est :
//   - exportable en PNG HD via html2canvas (scale 3) ;
//   - copiable en snippet HTML autonome (styles inline + QR
//     encode en data URL extrait d'un QRCodeCanvas cache).
//
// Le QR pointe vers /verify/<propertyId> (page rendue en
// parallele par un autre agent). Design system badges :
// bleu #055492 / rouge #C41E3A / fond clair #f8fafc.
// =============================================================

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import html2canvas from 'html2canvas';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MarketingBadgesModalProps {
  propertyId: string;
  propertyName: string;
  open: boolean;
  onClose: () => void;
}

interface BadgeDefinition {
  /** Identifiant utilise dans le nom de fichier telecharge */
  id: 'securite' | 'proprete' | 'technologie';
  /** Libelle de section au-dessus du badge */
  label: string;
  /** Titre affiche sur le badge (deja en majuscules) */
  title: string;
  /** Couleurs du degrade (from -> to) */
  from: string;
  to: string;
}

const BADGES: BadgeDefinition[] = [
  {
    id: 'securite',
    label: 'Sécurité',
    title: '🛡️ CAUTION PROTÉGÉE PAR ROOMSCAN',
    from: '#055492',
    to: '#033a66',
  },
  {
    id: 'proprete',
    label: 'Propreté',
    title: '✨ MÉNAGE CERTIFIÉ & PHOTOGRAPHIÉ',
    from: '#16a34a',
    to: '#15803d',
  },
  {
    id: 'technologie',
    label: 'Technologie',
    title: 'ÉTAT DES LIEUX VIDÉO & HASH SHA256',
    from: '#C41E3A',
    to: '#a3122c',
  },
];

/** Slugifie le nom du logement pour un nom de fichier telechargeable */
function slugifyFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'logement';
}

/** Echappe les caracteres sensibles pour un fragment HTML autonome */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Copie dans le presse-papiers avec fallback execCommand (contexte non securise) */
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // on tente le fallback ci-dessous
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

// =============================================================
// BadgeCard — un badge + ses 2 actions (PNG HD / code HTML)
// =============================================================

interface BadgeCardProps {
  badge: BadgeDefinition;
  propertyName: string;
  propertyId: string;
  /** URL encodee dans le QR (origine courante + /verify/<id>) */
  verifyUrl: string;
}

function BadgeCard({ badge, propertyName, propertyId, verifyUrl }: BadgeCardProps) {
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  /** Export PNG HD : html2canvas scale 3 puis telechargement */
  const handleDownloadPng = async () => {
    if (!badgeRef.current || downloading) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(badgeRef.current, {
        scale: 3,
        backgroundColor: null,
        useCORS: true,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `roomscan-badge-${badge.id}-${slugifyFileName(propertyName)}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Badge téléchargé en HD ✅');
    } catch {
      toast.error('Impossible de générer le PNG. Réessayez.');
    } finally {
      setDownloading(false);
    }
  };

  /** Snippet HTML autonome : styles inline + QR en data URL (canvas cache) */
  const handleCopyHtml = async () => {
    const canvas = canvasWrapRef.current?.querySelector('canvas');
    if (!canvas) {
      toast.error('QR code indisponible. Réessayez.');
      return;
    }
    const qrDataUrl = canvas.toDataURL('image/png');
    const html = [
      '<!-- Badge de confiance RoomScan — collez ce code dans votre annonce, votre site ou votre blog -->',
      `<div style="max-width:340px;margin:0 auto;border-radius:16px;overflow:hidden;background:linear-gradient(135deg,${badge.from},${badge.to});color:#ffffff;font-family:Arial,Helvetica,sans-serif;text-align:center;padding:24px 20px;box-shadow:0 10px 30px rgba(15,23,42,0.25);">`,
      `  <p style="margin:0;font-size:17px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;line-height:1.3;">${escapeHtml(badge.title)}</p>`,
      `  <p style="margin:8px 0 0;font-size:13px;font-weight:600;opacity:0.95;">${escapeHtml(propertyName)}</p>`,
      `  <img src="${qrDataUrl}" alt="QR code de vérification RoomScan" width="120" height="120" style="display:block;margin:16px auto 10px;width:120px;height:120px;background:#ffffff;border-radius:12px;padding:8px;box-sizing:border-box;" />`,
      `  <p style="margin:0;font-size:10.5px;line-height:1.5;opacity:0.9;">Vérifiez ce logement :<br /><span style="font-weight:700;word-break:break-all;">roomscan.pro/verify/${escapeHtml(propertyId)}</span></p>`,
      '</div>',
    ].join('\n');
    const ok = await copyTextToClipboard(html);
    if (ok) {
      toast.success('Code HTML copié 📋');
    } else {
      toast.error('Copie impossible sur ce navigateur.');
    }
  };

  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#055492]">
        Badge {badge.label}
      </p>

      {/* Zone visuelle du badge — cible html2canvas */}
      <div
        ref={badgeRef}
        // lux-keep-dark : échappatoire globals.css v6.1 — les utilitaires
        // text-white de CE conteneur restent BLANCS (le remap « jour noir »
        // du scope .lux les forcerait en encre #101012, y compris dans la
        // capture html2canvas).
        className="lux-keep-dark mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl shadow-sm"
        style={{ background: `linear-gradient(135deg, ${badge.from} 0%, ${badge.to} 100%)` }}
      >
        <div className="flex flex-col items-center gap-3 px-5 py-6 text-center text-white">
          <p
            className="text-lg font-extrabold uppercase leading-tight tracking-wide"
            style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)' }}
          >
            {badge.title}
          </p>
          <p className="break-words text-sm font-semibold opacity-95" title={propertyName}>
            {propertyName}
          </p>
          <div className="rounded-xl bg-white p-2 shadow-md">
            <QRCodeSVG
              value={verifyUrl}
              size={112}
              marginSize={1}
              level="M"
              fgColor="#111827"
              bgColor="#ffffff"
              title={`QR code de vérification — ${propertyName}`}
            />
          </div>
          <p className="text-[11px] leading-snug opacity-90">
            Vérifiez ce logement :{' '}
            <span className="break-all font-bold">roomscan.pro/verify/{propertyId}</span>
          </p>
        </div>
      </div>

      {/* QRCodeCanvas cache : source de la data URL injectee dans le snippet HTML */}
      <div ref={canvasWrapRef} className="hidden" aria-hidden="true">
        <QRCodeCanvas value={verifyUrl} size={256} marginSize={2} level="M" fgColor="#111827" bgColor="#ffffff" />
      </div>

      {/* Actions : PNG HD + code HTML */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={downloading}
          onClick={handleDownloadPng}
          className="min-h-[44px] rounded-xl border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-300 dark:bg-white dark:text-slate-700 dark:hover:bg-slate-100 dark:hover:text-slate-900"
        >
          {downloading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Génération…
            </>
          ) : (
            <>⬇️ Télécharger en PNG (HD)</>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleCopyHtml}
          className="min-h-[44px] rounded-xl border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-300 dark:bg-white dark:text-slate-700 dark:hover:bg-slate-100 dark:hover:text-slate-900"
        >
          📋 Copier le code HTML
        </Button>
      </div>
    </div>
  );
}

// =============================================================
// MarketingBadgesModal — modal principale
// =============================================================

export function MarketingBadgesModal({
  propertyId,
  propertyName,
  open,
  onClose,
}: MarketingBadgesModalProps) {
  // Origine courante (QR vers /verify/<id>) — initialisation lazy :
  // SSR renvoie le domaine de prod, le client reprend window.origin
  // (la modal ne rend son contenu que lorsque open = true, apres hydration).
  const [origin] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : 'https://roomscan.pro',
  );
  const verifyUrl = `${origin}/verify/${propertyId}`;

  // Fermeture a la touche Escape + verrou du scroll d'arriere-plan
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="badges-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Badges Marketing"
        >
          <motion.div
            key="badges-panel"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative mx-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-[#f8fafc] shadow-2xl"
          >
            {/* En-tete collant : titre + fermeture */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-[#055492]">🏅 Badges Marketing</h2>
                <p className="mt-1 text-xs leading-snug text-slate-600 sm:text-sm">
                  Téléchargez et affichez vos badges de confiance sur vos annonces, votre site ou
                  vos réseaux
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer la fenêtre des badges marketing"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Contenu scrollable : 3 badges */}
            <div className="flex flex-col gap-6 px-4 py-5 sm:px-5">
              {BADGES.map((badge) => (
                <BadgeCard
                  key={badge.id}
                  badge={badge}
                  propertyName={propertyName}
                  propertyId={propertyId}
                  verifyUrl={verifyUrl}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
