'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, ExternalLink, Plus, Printer } from 'lucide-react';
import { B2BCard } from '@/components/ui/b2b-card';
import { EmojiIcon } from '@/components/ui/emoji-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Toaster } from '@/components/ui/sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// =============================================================
// PlaquesContent — ÉTAPE 6 : "Mes plaques QR" (Espace Hôte).
// La plaque est le pont physique entre le logement et le Hub :
//  - liste des plaques (statut, bien, lien hub)
//  - génération d'une nouvelle plaque (hubSlug + code)
//  - impression d'une fiche QR (sticker) → /plaques/[id]/print
//  - cycle de vie : active / désactivée / perdue
// =============================================================

interface PlaqueDTO {
  id: string;
  hubSlug: string | null;
  status: string;
  activationCode: string;
  createdAt: string;
  claimedAt: string | null;
  property: { id: string; name: string } | null;
}

interface PlaquesData {
  plaques: PlaqueDTO[];
  properties: { id: string; name: string }[];
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  active: { label: '● Active', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: '○ Désactivée', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  lost: { label: '⚠ Perdue', className: 'bg-red-50 text-red-700 border-red-200' },
  inactive: { label: 'En attente', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.inactive;
  return (
    <Badge variant="outline" className={cn('text-xs font-semibold', meta.className)}>
      {meta.label}
    </Badge>
  );
}

export function PlaquesContent() {
  const router = useRouter();
  const [data, setData] = useState<PlaquesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newPropertyId, setNewPropertyId] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/airbnb/plaques');
      if (!res.ok) throw new Error('http');
      const json = (await res.json()) as PlaquesData;
      setData(json);
      setError('');
    } catch {
      setError('Impossible de charger les plaques. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Création d'une nouvelle plaque ──
  async function createPlaque() {
    if (!newPropertyId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/airbnb/plaques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: newPropertyId }),
      });
      const json = (await res.json()) as { plaque?: PlaqueDTO; error?: string };
      if (!res.ok || !json.plaque) throw new Error(json.error ?? 'http');
      toast.success('Plaque générée ✅ — imprimez-la et collez-la dans le logement');
      setCreateOpen(false);
      router.push(`/airbnb/dashboard/plaques/${json.plaque.id}/print`);
    } catch {
      toast.error('Impossible de générer la plaque. Réessayez.');
    } finally {
      setCreating(false);
    }
  }

  // ── Changement de statut (désactiver / perdue / réactiver) ──
  async function setStatus(plaque: PlaqueDTO, status: 'active' | 'cancelled' | 'lost') {
    setBusyId(plaque.id);
    try {
      const res = await fetch(`/api/airbnb/plaques/${plaque.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('http');
      const labels: Record<string, string> = {
        active: 'Plaque réactivée ✅ — le Hub redevient accessible',
        cancelled: 'Plaque désactivée — le Hub affiche un message aux visiteurs',
        lost: 'Plaque signalée perdue 🔒',
      };
      toast.success(labels[status] ?? 'Statut mis à jour');
      await load();
    } catch {
      toast.error('Impossible de changer le statut. Réessayez.');
    } finally {
      setBusyId(null);
    }
  }

  function copyHubLink(hubSlug: string) {
    const url = `${window.location.origin}/hub/${hubSlug}`;
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Lien du Hub copié !'))
      .catch(() => toast.error('Copie impossible dans ce navigateur.'));
  }

  // ── Rendus intermédiaires ──
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-4" aria-busy="true" aria-label="Chargement des plaques">
        <Skeleton className="h-10 w-64 rounded-xl" />
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-4xl mx-auto w-full px-4 py-16 flex justify-center">
        <B2BCard className="max-w-md w-full text-center">
          <p className="text-3xl" aria-hidden="true">😵</p>
          <p className="mt-2 font-semibold text-slate-900">Erreur de chargement</p>
          <p className="text-sm text-slate-600 mt-1">{error}</p>
        </B2BCard>
        <Toaster position="top-center" richColors />
      </div>
    );
  }

  const plaques = data?.plaques ?? [];
  const properties = data?.properties ?? [];
  const activeCount = plaques.filter((p) => p.status === 'active').length;

  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-6">
      <Toaster position="top-center" richColors />

      {/* ----- En-tête ----- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span aria-hidden="true">🏷️</span> Mes plaques QR
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {plaques.length === 0
              ? 'Créez votre première plaque et collez-la dans le logement.'
              : `${activeCount} active${activeCount > 1 ? 's' : ''} sur ${plaques.length} — imprimez, découpez, collez au logement.`}
          </p>
        </div>
        <Button
          onClick={() => {
            if (properties.length === 0) {
              toast.error('Créez d\u2019abord un bien via l\u2019onboarding /setup.');
              return;
            }
            setNewPropertyId(properties[0].id);
            setCreateOpen(true);
          }}
          className="bg-slate-900 hover:bg-slate-800 text-white font-semibold shrink-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle plaque
        </Button>
      </div>

      {/* ----- Bandeau explicatif ----- */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">🔗 Comment ça marche ?</p>
        <p className="mt-1 text-emerald-800">
          Chaque plaque porte un QR unique. Vos voyageurs le scannent avec l&apos;appareil photo :
          ils arrivent sur le Hub du logement (Wi-Fi, guide, services, contact). Vous, vous gérez
          tout depuis cet espace — et si une plaque est perdue, désactivez-la d&apos;un clic.
        </p>
      </div>

      {/* ----- Liste des plaques ----- */}
      {plaques.length === 0 ? (
        <B2BCard className="text-center py-12">
          <p className="text-5xl" aria-hidden="true">🏷️</p>
          <p className="mt-3 font-bold text-slate-900 text-lg">Aucune plaque pour le moment</p>
          <p className="text-sm text-slate-600 mt-1 max-w-sm mx-auto">
            Générez une plaque QR, imprimez-la, collez-la sur place : vos voyageurs n&apos;ont
            plus qu&apos;à scanner.
          </p>
          <Button
            onClick={() => {
              if (properties.length === 0) {
                toast.error('Créez d\u2019abord un bien via l\u2019onboarding /setup.');
                return;
              }
              setNewPropertyId(properties[0].id);
              setCreateOpen(true);
            }}
            className="mt-5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Générer ma première plaque
          </Button>
        </B2BCard>
      ) : (
        <ul className="space-y-4" aria-label="Liste des plaques QR">
          {plaques.map((plaque) => {
            const isActive = plaque.status === 'active';
            return (
              <li key={plaque.id}>
                <B2BCard className="p-4 sm:p-5">
                  <div className="flex items-start gap-4">
                    <EmojiIcon emoji="🏷️" size="lg" variant={isActive ? 'accent' : 'default'} />
                    <div className="min-w-0 flex-1">
                      {/* Ligne 1 : bien + statut */}
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold text-slate-900 truncate">
                          {plaque.property?.name ?? 'Plaque non liée à un bien'}
                        </h2>
                        <StatusBadge status={plaque.status} />
                      </div>

                      {/* Ligne 2 : slug + code d'activation */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="font-mono bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-700">
                          /hub/{plaque.hubSlug ?? '—'}
                        </span>
                        <span>
                          Code : <span className="font-mono text-slate-600">{plaque.activationCode}</span>
                        </span>
                        <span>
                          Créée le{' '}
                          {new Date(plaque.createdAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>

                      {/* Ligne 3 : lien hub + actions */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {plaque.hubSlug && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyHubLink(plaque.hubSlug as string)}
                              className="h-8 text-xs font-semibold"
                            >
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copier le lien
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                window.open(`/hub/${plaque.hubSlug}`, '_blank', 'noopener')
                              }
                              className="h-8 text-xs font-semibold"
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Ouvrir le Hub
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          asChild
                          className={cn(
                            'h-8 text-xs font-semibold',
                            isActive
                              ? 'bg-slate-900 hover:bg-slate-800 text-white'
                              : 'bg-slate-200 hover:bg-slate-300 text-slate-700',
                          )}
                        >
                          <Link href={`/airbnb/dashboard/plaques/${plaque.id}/print`}>
                            <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Imprimer
                          </Link>
                        </Button>

                        {isActive ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === plaque.id}
                              onClick={() => void setStatus(plaque, 'cancelled')}
                              className="h-8 text-xs font-semibold text-slate-600"
                            >
                              Désactiver
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === plaque.id}
                              onClick={() => void setStatus(plaque, 'lost')}
                              className="h-8 text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50"
                            >
                              Signaler perdue
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === plaque.id}
                            onClick={() => void setStatus(plaque, 'active')}
                            className="h-8 text-xs font-semibold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          >
                            Réactiver
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </B2BCard>
              </li>
            );
          })}
        </ul>
      )}

      {/* ----- Dialog création ----- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span aria-hidden="true">🏷️</span> Nouvelle plaque QR
            </DialogTitle>
            <DialogDescription>
              Une plaque unique sera générée pour le bien choisi : lien Hub public, code
              d&apos;activation et fiche imprimable. Elle est active immédiatement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="plaque-property">Pour quel bien ?</Label>
            {properties.length > 1 ? (
              <select
                id="plaque-property"
                value={newPropertyId}
                onChange={(e) => setNewPropertyId(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <Input id="plaque-property" value={properties[0]?.name ?? ''} readOnly />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Annuler
            </Button>
            <Button
              onClick={() => void createPlaque()}
              disabled={creating || !newPropertyId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {creating ? 'Génération…' : 'Générer la plaque'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
