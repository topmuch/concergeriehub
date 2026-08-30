'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Store, Wrench, Percent, Phone, MapPin, Clock, Star,
  Send, ExternalLink, Tag, Calendar, AlertCircle, CheckCircle2,
  MessageSquare, ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import type { ModuleProps } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  MERCHANT
// ═══════════════════════════════════════════════════════════════════════════

const MERCHANT_DEFAULT = {
  name: 'Boulangerie Leclerc',
  category: 'Boulangerie-pâtisserie',
  description: 'Boulangerie artisanale depuis 1987. Pain au levain, viennoiseries et pâtisseries fraîches chaque jour.',
  address: '10 Rue de la Paix, 75002 Paris',
  phone: '+33 1 42 33 44 55',
  email: 'contact@boulangerie-leclerc.fr',
  website: 'https://boulangerie-leclerc.fr',
  hours: [
    { day: 'Lun-Ven', time: '7h00 - 20h00' },
    { day: 'Samedi', time: '7h00 - 13h00' },
    { day: 'Dimanche', time: 'Fermé' },
  ] as { day: string; time: string }[],
  rating: 4.7,
  reviewCount: 142,
  services: ['Livraison', 'Sur commande', 'CB accepté'],
  specialOffer: 'Carte de fidélité : 10ème baguette offerte !',
};

export function MerchantModule({ content }: ModuleProps) {
  const data = { ...MERCHANT_DEFAULT, ...content } as typeof MERCHANT_DEFAULT & { hours: { day: string; time: string }[]; services: string[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950 text-xl">
            🏪
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">{data.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{data.category}</p>
          </div>
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            <span className="text-sm font-bold">{data.rating}</span>
            <span className="text-xs text-muted-foreground">({data.reviewCount})</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{data.description}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-start gap-2 rounded-lg border p-3"><MapPin className="h-4 w-4 mt-0.5 shrink-0" /><p className="text-sm">{data.address}</p></div>
          <div className="flex items-start gap-2 rounded-lg border p-3"><Phone className="h-4 w-4 mt-0.5 shrink-0" /><p className="text-sm">{data.phone}</p></div>
        </div>
        <div className="space-y-1">{data.hours.map((h, i) => (
          <div key={i} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"><span className="text-sm">{h.day}</span><span className={`text-sm font-medium ${h.time === 'Fermé' ? 'text-red-500' : ''}`}>{h.time}</span></div>
        ))}</div>
        {data.services.length > 0 && <div className="flex flex-wrap gap-1.5">{data.services.map((s, i) => <Badge key={i} variant="outline" className="text-xs">{s}</Badge>)}</div>}
        {data.specialOffer && <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 p-3"><p className="text-sm">🎁 {data.specialOffer}</p></div>}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={() => window.open(`tel:${data.phone.replace(/\s/g, '')}`)}><Phone className="h-3.5 w-3.5" />Appeler</Button>
          {data.website && <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={() => window.open(data.website, '_blank')}><ExternalLink className="h-3.5 w-3.5" />Site web</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SERVICE REQUEST
// ═══════════════════════════════════════════════════════════════════════════

const SERVICE_DEFAULT = {
  categories: [
    { name: 'Plomberie', icon: '🔧', color: 'text-blue-600 bg-blue-50' },
    { name: 'Électricité', icon: '⚡', color: 'text-yellow-600 bg-yellow-50' },
    { name: 'Serrurerie', icon: '🔑', color: 'text-orange-600 bg-orange-50' },
    { name: 'Climatisation', icon: '❄️', color: 'text-cyan-600 bg-cyan-50' },
    { name: 'Jardinage', icon: '🌿', color: 'text-green-600 bg-green-50' },
    { name: 'Nettoyage', icon: '🧹', color: 'text-purple-600 bg-purple-50' },
  ] as { name: string; icon: string; color: string }[],
  recentRequests: [
    { id: '1', category: 'Plomberie', description: 'Fuite sous l\'évier de la cuisine', status: 'completed', date: '2024-12-18', rating: 5 },
    { id: '2', category: 'Électricité', description: 'Prise défectueuse dans le salon', status: 'in_progress', date: '2024-12-20', rating: null },
  ] as { id: string; category: string; description: string; status: string; date: string; rating: number | null }[],
  urgentPhone: 'Urgences 24h : +33 1 42 33 44 55',
};

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'outline' | 'destructive'; className: string }> = {
  pending: { label: 'En attente', variant: 'outline', className: 'text-yellow-600 border-yellow-200' },
  accepted: { label: 'Accepté', variant: 'outline', className: 'text-blue-600 border-blue-200' },
  in_progress: { label: 'En cours', variant: 'outline', className: 'text-purple-600 border-purple-200' },
  completed: { label: 'Terminé', variant: 'default', className: '' },
};

export function ServiceRequestModule({ content }: ModuleProps) {
  const data = { ...SERVICE_DEFAULT, ...content } as typeof SERVICE_DEFAULT & { categories: { name: string; icon: string; color: string }[]; recentRequests: { id: string; category: string; description: string; status: string; date: string; rating: number | null }[] };
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950">
            <Wrench className="h-5 w-5 text-blue-600" />
          </div>
          <CardTitle className="text-base">Demande de service</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-semibold mb-2">Choisir une catégorie</p>
          <div className="grid grid-cols-3 gap-2">{data.categories.map(cat => (
            <button key={cat.name} className={`rounded-lg border p-3 text-center transition-all hover:shadow-sm ${selectedCategory === cat.name ? 'ring-2 ring-primary bg-primary/5' : ''}`} onClick={() => setSelectedCategory(cat.name)}>
              <span className="text-xl block mb-1">{cat.icon}</span>
              <span className="text-xs font-medium">{cat.name}</span>
            </button>
          ))}</div>
        </div>
        {selectedCategory && (
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-semibold">Demander un {selectedCategory.toLowerCase()}</p>
            <Textarea placeholder="Décrivez votre besoin..." rows={3} />
            <Button className="w-full" onClick={() => setSelectedCategory(null)}><Send className="h-4 w-4 mr-1" />Envoyer la demande</Button>
          </div>
        )}
        {data.recentRequests.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2">Demandes récentes</p>
            <div className="space-y-1.5">{data.recentRequests.map(r => {
              const s = STATUS_MAP[r.status] || STATUS_MAP.pending;
              return (
                <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div><p className="text-sm font-medium">{r.description}</p><p className="text-xs text-muted-foreground">{r.category} · {r.date}</p></div>
                  <Badge variant={s.variant} className={`text-[10px] ${s.className}`}>{s.label}</Badge>
                </div>
              );
            })}</div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">📞 {data.urgentPhone}</p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROMO
// ═══════════════════════════════════════════════════════════════════════════

const PROMO_DEFAULT = {
  merchant: 'Boulangerie Leclerc',
  promotions: [
    { id: '1', title: '-20% sur les gâteaux', description: 'Valable tous les mardis sur la gamme de pâtisseries.', code: 'MARDI20', validUntil: '2025-01-31', icon: '🎂', used: false },
    { id: '2', title: 'Baguette offerte dès 5 achetées', description: 'Carte de fidélité : la 6ème est offerte.', code: 'FIDELITE6', validUntil: '2025-12-31', icon: '🥖', used: false },
    { id: '3', title: '-15% pour les nouveaux clients', description: 'Première commande avec une réduction de 15%.', code: 'BIENVENUE15', validUntil: '2025-06-30', icon: '🎁', used: false },
  ] as { id: string; title: string; description: string; code: string; validUntil: string; icon: string; used: boolean }[],
};

export function PromoModule({ content }: ModuleProps) {
  const data = { ...PROMO_DEFAULT, ...content } as typeof PROMO_DEFAULT & { promotions: { id: string; title: string; description: string; code: string; validUntil: string; icon: string; used: boolean }[] };

  const copyCode = (code: string) => { navigator.clipboard.writeText(code); };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950">
            <Percent className="h-5 w-5 text-rose-600" />
          </div>
          <div>
            <CardTitle className="text-base">Promotions</CardTitle>
            <p className="text-xs text-muted-foreground">🏪 {data.merchant}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.promotions.map(promo => (
          <div key={promo.id} className={`rounded-lg border-2 p-4 ${promo.used ? 'border-muted opacity-50' : 'border-rose-200 bg-rose-50/50'}`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{promo.icon}</span>
              <div className="flex-1"><p className="text-sm font-bold">{promo.title}</p><p className="text-xs text-muted-foreground">Valable jusqu'au {promo.validUntil}</p></div>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{promo.description}</p>
            {!promo.used && (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md bg-white dark:bg-black border-2 border-dashed border-rose-300 px-3 py-2 text-center">
                  <span className="font-mono font-bold text-rose-600 tracking-widest">{promo.code}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyCode(promo.code)} className="shrink-0"><Tag className="h-3.5 w-3.5 mr-1" />Copier</Button>
              </div>
            )}
            {promo.used && <Badge variant="secondary" className="text-xs">Utilisé</Badge>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
