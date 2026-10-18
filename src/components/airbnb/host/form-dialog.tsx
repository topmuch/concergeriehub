'use client';

import { type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// =============================================================
// FormDialog — modale générique de formulaire du Dashboard Client
// (enveloppe shadcn/ui Dialog avec en-tête + zone de contenu +
// pied d'actions. Contrastée avec AlertDialog pour les actions
// destructrices : utiliser ui/alert-dialog dans ce cas.)
// =============================================================

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Actions du pied de modale (boutons). */
  footer?: ReactNode;
  /** Largeur max du contenu ('sm' = 448px, 'md' = 640px, 'lg' = 896px). */
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
} as const;

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[90vh] overflow-y-auto ${SIZES[size]}`}>
        <DialogHeader>
          <DialogTitle className="font-bold text-slate-900">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-slate-600">{description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-4">{children}</div>
        {footer && <DialogFooter className="mt-1 gap-2">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
