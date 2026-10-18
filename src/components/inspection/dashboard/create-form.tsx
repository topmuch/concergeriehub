'use client';

// =============================================================
// FORMULAIRE DE CRÉATION — module standalone « État des Lieux »
// Section repliable du dashboard : logement, adresse, propriétaire,
// invité (nom/email/téléphone), type ENTRÉE/SORTIE (boutons
// segmentés), date visée (défaut : demain 10:00) et liaison à une
// entrée existante (visible pour une SORTIE). À la création, le
// lien public est copié dans le presse-papier.
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { LUX_FIELD } from './dashboard-ui';
import {
  defaultScheduledDate,
  formatFrDateTime,
  type InspectionRow,
} from './inspection-types';

export interface CreateFormPrefill {
  propertyName?: string;
  propertyAddress?: string;
  ownerName?: string;
  guestName?: string;
  guestEmail?: string;
  type?: 'ENTREE' | 'SORTIE';
}

interface CreateFormProps {
  /** Entrées existantes disponibles pour la liaison (type ENTREE). */
  entreeOptions: InspectionRow[];
  prefill?: CreateFormPrefill | null;
  onSuccess: () => void;
  onClose: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function InspectionCreateForm({
  entreeOptions,
  prefill,
  onSuccess,
  onClose,
}: CreateFormProps) {
  const [propertyName, setPropertyName] = useState(prefill?.propertyName ?? '');
  const [propertyAddress, setPropertyAddress] = useState(prefill?.propertyAddress ?? '');
  const [city, setCity] = useState('');
  const [ownerName, setOwnerName] = useState(prefill?.ownerName ?? '');
  const [guestName, setGuestName] = useState(prefill?.guestName ?? '');
  const [guestEmail, setGuestEmail] = useState(prefill?.guestEmail ?? '');
  const [guestPhone, setGuestPhone] = useState('');
  const [type, setType] = useState<'ENTREE' | 'SORTIE'>(prefill?.type ?? 'ENTREE');
  const [scheduledDate, setScheduledDate] = useState('');
  const [linkedInspectionId, setLinkedInspectionId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  // Valeur par défaut de la date visée : demain 10:00 (client only).
  useEffect(() => {
    setScheduledDate((current) => current || defaultScheduledDate());
  }, []);

  const entrees = useMemo(() => entreeOptions.filter((i) => i.type === 'ENTREE'), [entreeOptions]);

  const submit = async () => {
    if (busy) return;
    // ── Validation locale (les mêmes règles que l'API) ──
    if (propertyName.trim().length < 1) return toast.error('Le nom du logement est requis.');
    if (propertyAddress.trim().length < 1) return toast.error("L'adresse du logement est requise.");
    if (ownerName.trim().length < 1) return toast.error('Le nom du propriétaire est requis.');
    if (guestName.trim().length < 1) return toast.error("Le nom de l'invité est requis.");
    if (guestEmail.trim() && !EMAIL_RE.test(guestEmail.trim())) {
      return toast.error('Adresse email de l’invité invalide.');
    }
    if (!scheduledDate) return toast.error('La date visée est requise.');

    setBusy(true);
    try {
      const res = await fetch('/api/inspection/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyName: propertyName.trim(),
          propertyAddress: propertyAddress.trim(),
          city: city.trim() || undefined,
          ownerName: ownerName.trim(),
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim() || undefined,
          guestPhone: guestPhone.trim() || undefined,
          type,
          scheduledDate: new Date(scheduledDate).toISOString(),
          linkedInspectionId: type === 'SORTIE' && linkedInspectionId ? linkedInspectionId : undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { inspection?: { shareUrl?: string }; error?: string }
        | null;
      if (!res.ok || !json?.inspection) {
        toast.error(json?.error ?? 'Création impossible. Réessayez.');
        return;
      }

      // Le lien public est copié pour un partage immédiat.
      const shareUrl = json.inspection.shareUrl ?? '';
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('État des lieux créé — lien copié dans le presse-papier.', {
          description: shareUrl,
        });
      } catch {
        toast.success('État des lieux créé.', { description: shareUrl });
      }
      onSuccess();
    } catch {
      toast.error('Création impossible. Vérifiez votre connexion.');
    } finally {
      setBusy(false);
    }
  };

  const typeOption = (value: 'ENTREE' | 'SORTIE', label: string, hint: string) => (
    <button
      type="button"
      onClick={() => setType(value)}
      aria-pressed={type === value}
      className={cn(
        'flex min-h-[44px] flex-1 flex-col items-start rounded-xl border px-4 py-2.5 text-left transition-colors',
        type === value
          ? value === 'ENTREE'
            ? 'border-[#2dd4bf]/60 bg-[#2dd4bf]/12'
            : 'border-[#f07d6a]/60 bg-[#f07d6a]/12'
          : 'border-white/12 bg-white/[0.03] hover:bg-white/[0.06]',
      )}
    >
      <span
        className={cn(
          'text-sm font-semibold',
          type === value
            ? value === 'ENTREE'
              ? 'text-[#2dd4bf]'
              : 'text-[#f07d6a]'
            : 'text-white',
        )}
      >
        {label}
      </span>
      <span className="text-[11px] text-[#8fa0c2]">{hint}</span>
    </button>
  );

  return (
    <section className="lux-card p-4 sm:p-6" aria-label="Nouvel état des lieux">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="lux-eyebrow">Nouveau document</p>
          <h3 className="lux-display mt-1 text-lg text-white">Créer un état des lieux</h3>
          <p className="text-xs text-[#8fa0c2]">
            Les pièces réglementaires et leurs équipements sont pré-remplis automatiquement.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          className={cn('h-9 rounded-full px-4 text-xs')}
          aria-label="Fermer le formulaire de création"
        >
          Fermer ×
        </Button>
      </div>

      <form
        className="mt-5 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edl-create-property" className="text-xs text-[#8fa0c2]">
            Logement (nom)
          </Label>
          <Input
            id="edl-create-property"
            value={propertyName}
            onChange={(e) => setPropertyName(e.target.value)}
            placeholder="ex. Villa Azur — Appartement 2"
            maxLength={160}
            className={cn('h-11', LUX_FIELD)}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edl-create-address" className="text-xs text-[#8fa0c2]">
            Adresse
          </Label>
          <Input
            id="edl-create-address"
            value={propertyAddress}
            onChange={(e) => setPropertyAddress(e.target.value)}
            placeholder="ex. 12 rue des Palmiers, 06000 Nice"
            maxLength={300}
            autoComplete="street-address"
            className={cn('h-11', LUX_FIELD)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edl-create-city" className="text-xs text-[#8fa0c2]">
            Ville <span className="normal-case">(mention « Fait à … » du PDF — optionnel)</span>
          </Label>
          <Input
            id="edl-create-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="ex. Nice"
            maxLength={120}
            autoComplete="address-level2"
            className={cn('h-11', LUX_FIELD)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edl-create-owner" className="text-xs text-[#8fa0c2]">
            Propriétaire
          </Label>
          <Input
            id="edl-create-owner"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="ex. Camille Martin"
            maxLength={120}
            className={cn('h-11', LUX_FIELD)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edl-create-guest" className="text-xs text-[#8fa0c2]">
            Invité (nom)
          </Label>
          <Input
            id="edl-create-guest"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="ex. Thomas Lambert"
            maxLength={120}
            className={cn('h-11', LUX_FIELD)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edl-create-email" className="text-xs text-[#8fa0c2]">
            Email invité <span className="normal-case">(optionnel)</span>
          </Label>
          <Input
            id="edl-create-email"
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            placeholder="ex. thomas@exemple.fr"
            autoComplete="email"
            className={cn('h-11', LUX_FIELD)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edl-create-phone" className="text-xs text-[#8fa0c2]">
            Téléphone invité <span className="normal-case">(optionnel)</span>
          </Label>
          <Input
            id="edl-create-phone"
            type="tel"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            placeholder="ex. +33 6 12 34 56 78"
            autoComplete="tel"
            className={cn('h-11', LUX_FIELD)}
          />
        </div>

        <fieldset className="space-y-1.5 sm:col-span-2">
          <legend className="text-xs text-[#8fa0c2]">Type d&apos;état des lieux</legend>
          <div className="flex flex-col gap-2 sm:flex-row">
            {typeOption('ENTREE', "Entrée — arrivée de l'invité", 'Constat à l’installation')}
            {typeOption('SORTIE', "Sortie — départ de l'invité", 'Comparatif + propreté')}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="edl-create-date" className="text-xs text-[#8fa0c2]">
            Date visée
          </Label>
          <Input
            id="edl-create-date"
            type="datetime-local"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className={cn('h-11', LUX_FIELD, '[color-scheme:dark]')}
          />
        </div>

        {type === 'SORTIE' && (
          <div className="space-y-1.5" aria-live="polite">
            <Label htmlFor="edl-create-linked" className="text-xs text-[#8fa0c2]">
              Lier à une entrée existante
            </Label>
            <Select value={linkedInspectionId || 'none'} onValueChange={(v) => setLinkedInspectionId(v === 'none' ? '' : v)}>
              <SelectTrigger
                id="edl-create-linked"
                className={cn('h-11 w-full', LUX_FIELD)}
                aria-label="Lier cette sortie à un état des lieux d'entrée"
              >
                <SelectValue placeholder="Aucune liaison" />
              </SelectTrigger>
              <SelectContent className="border-white/12 bg-[#0b1226] text-white">
                <SelectItem value="none">Aucune liaison</SelectItem>
                {entrees.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.propertyName} — {i.guestName} ({formatFrDateTime(i.scheduledDate)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {entrees.length === 0 && (
              <p className="text-[11px] text-[#8fa0c2]/80">
                Aucun état des lieux d&apos;entrée disponible — créez-en un pour activer la
                comparaison entrée / sortie.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 sm:col-span-2">
          <Button
            type="submit"
            size="sm"
            disabled={busy}
            className="h-11 rounded-full bg-[#e9c47c] px-6 text-sm font-semibold text-[#1a1206] shadow-[0_10px_28px_-12px_rgba(212,175,106,0.5)] hover:bg-[#dfb76a]"
            aria-label="Créer et partager l'état des lieux"
          >
            {busy ? 'Création…' : 'Créer et partager'}
          </Button>
        </div>
      </form>
    </section>
  );
}
