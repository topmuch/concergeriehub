'use client';

// =============================================================
// EXPORT INTELLIGENT POUR LITIGE AIRBNB — dialog de secours
// Affichée UNIQUEMENT si la copie automatique échoue (presse-papier
// bloqué) : l'hôte peut copier le message juridique à la main.
// =============================================================
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { copyText } from './airbnb-dispute';

export function AirbnbDisputeDialog({
  open,
  message,
  onOpenChange,
}: {
  open: boolean;
  message: string;
  onOpenChange: (open: boolean) => void;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => areaRef.current?.select(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleCopy = async () => {
    if (await copyText(message)) {
      toast.success('Message copié — collez-le dans le Centre de Résolution Airbnb.');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/12 bg-[#0b1226] text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="lux-display text-lg">
            Message juridique pour Airbnb
          </DialogTitle>
          <DialogDescription className="text-sm text-[#8fabc2]">
            Le PDF certifié a été téléchargé. Copiez ce message pré-rédigé, collez-le dans le
            Centre de Résolution Airbnb puis joignez le PDF.
          </DialogDescription>
        </DialogHeader>
        <textarea
          ref={areaRef}
          readOnly
          value={message}
          rows={12}
          aria-label="Message juridique pré-rédigé pour le litige Airbnb"
          className="lux-scroll w-full resize-none rounded-xl border border-white/12 bg-white/[0.04] p-3 font-mono text-xs leading-relaxed text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/50"
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="min-h-[44px] rounded-full border-white/12 bg-white/[0.04] px-5 font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
            aria-label="Fermer la fenêtre de copie"
          >
            Fermer
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleCopy()}
            className="min-h-[44px] rounded-full bg-[#C21F26] px-5 font-bold text-white hover:bg-[#a81a20]"
            aria-label="Copier le message juridique"
          >
            Copier le message
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
