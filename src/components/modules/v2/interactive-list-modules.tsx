'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  ShoppingCart, Package, ListChecks, Calendar, UtensilsCrossed, CalendarDays,
  Truck, PackageSearch, Plus, Trash2, Check, GripVertical, Clock, User,
  AlertCircle, Filter, Search, ChevronRight, MoveRight, CircleDot,
} from 'lucide-react';
import type { ModuleProps } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  SHOPPING LIST
// ═══════════════════════════════════════════════════════════════════════════

const SHOPPING_DEFAULT = {
  items: [
    { id: '1', name: 'Lait demi-écrémé', quantity: '2L', category: 'Produits laitiers', checked: false },
    { id: '2', name: 'Pain complet', quantity: '1', category: 'Boulangerie', checked: false },
    { id: '3', name: 'œufs bio', quantity: '12', category: 'Produits frais', checked: true },
    { id: '4', name: 'Tomates', quantity: '500g', category: 'Fruits & Légumes', checked: false },
    { id: '5', name: 'Pâtes penne', quantity: '500g', category: 'Épicerie', checked: false },
    { id: '6', name: 'Fromage comté', quantity: '200g', category: 'Produits laitiers', checked: false },
  ] as { id: string; name: string; quantity: string; category: string; checked: boolean }[],
};

export function ShoppingListModule({ content, onSave }: ModuleProps) {
  const data = { ...SHOPPING_DEFAULT, ...content } as typeof SHOPPING_DEFAULT & { items: { id: string; name: string; quantity: string; category: string; checked: boolean }[] };
  const [items, setItems] = useState(data.items);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newCat, setNewCat] = useState('');
  const [filter, setFilter] = useState('all');

  const toggleItem = (id: string) => {
    const updated = items.map(it => it.id === id ? { ...it, checked: !it.checked } : it);
    setItems(updated);
    onSave({ ...content, items: updated });
  };

  const addItem = () => {
    if (!newName.trim()) return;
    const updated = [...items, { id: Date.now().toString(), name: newName.trim(), quantity: newQty || '1', category: newCat || 'Autre', checked: false }];
    setItems(updated);
    setNewName(''); setNewQty(''); setNewCat('');
    onSave({ ...content, items: updated });
  };

  const deleteItem = (id: string) => {
    const updated = items.filter(it => it.id !== id);
    setItems(updated);
    onSave({ ...content, items: updated });
  };

  const filtered = filter === 'all' ? items : filter === 'done' ? items.filter(i => i.checked) : items.filter(i => !i.checked);
  const categories = [...new Set(items.map(i => i.category))];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-950">
              <ShoppingCart className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-base">Liste de courses</CardTitle>
              <p className="text-xs text-muted-foreground">{items.filter(i => !i.checked).length} article(s) restant(s)</p>
            </div>
          </div>
          <div className="flex gap-1">
            {['all', 'todo', 'done'].map(f => (
              <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" className="text-xs h-7" onClick={() => setFilter(f)}>
                {f === 'all' ? 'Tout' : f === 'todo' ? 'À faire' : 'Fait'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Article..." value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} className="flex-1" />
          <Input placeholder="Qté" value={newQty} onChange={e => setNewQty(e.target.value)} className="w-20" />
          <Input placeholder="Catégorie" value={newCat} onChange={e => setNewCat(e.target.value)} className="w-32 hidden sm:block" />
          <Button size="icon" onClick={addItem}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucun article</p>}
          {filtered.map(item => (
            <div key={item.id} className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${item.checked ? 'bg-muted/50 opacity-60' : ''}`}>
              <Checkbox checked={item.checked} onCheckedChange={() => toggleItem(item.id)} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${item.checked ? 'line-through' : 'font-medium'}`}>{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.quantity} · {item.category}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteItem(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  INVENTORY
// ═══════════════════════════════════════════════════════════════════════════

const INVENTORY_DEFAULT = {
  items: [
    { id: '1', name: 'Lait', quantity: 2, unit: 'L', expiry: '2024-12-25', status: 'fresh' as const },
    { id: '2', name: 'Yaourts', quantity: 6, unit: 'pcs', expiry: '2024-12-22', status: 'warning' as const },
    { id: '3', name: 'Poulet', quantity: 500, unit: 'g', expiry: '2024-12-19', status: 'critical' as const },
    { id: '4', name: 'Confiture', quantity: 1, unit: 'pot', expiry: '2025-06-01', status: 'fresh' as const },
    { id: '5', name: 'Riz basmati', quantity: 2, unit: 'kg', expiry: '2025-12-01', status: 'fresh' as const },
  ] as { id: string; name: string; quantity: number; unit: string; expiry: string; status: string }[],
};

const STATUS_COLORS: Record<string, string> = { fresh: 'bg-green-100 text-green-700', warning: 'bg-yellow-100 text-yellow-700', critical: 'bg-red-100 text-red-700', expired: 'bg-gray-100 text-gray-700' };
const STATUS_LABELS: Record<string, string> = { fresh: 'Frais', warning: 'Bientôt périmé', critical: 'Urgent', expired: 'Expiré' };

export function InventoryModule({ content }: ModuleProps) {
  const data = { ...INVENTORY_DEFAULT, ...content } as typeof INVENTORY_DEFAULT & { items: { id: string; name: string; quantity: number; unit: string; expiry: string; status: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-800">
            <Package className="h-5 w-5 text-stone-600" />
          </div>
          <div>
            <CardTitle className="text-base">Inventaire</CardTitle>
            <p className="text-xs text-muted-foreground">{data.items.length} produit(s) · {data.items.filter(i => i.status === 'critical').length} en urgence</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {data.items.map(item => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${STATUS_COLORS[item.status] || STATUS_COLORS.fresh}`}>{item.quantity}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.quantity} {item.unit} · Expire le {item.expiry}</p>
              </div>
              <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[item.status] || ''}`}>{STATUS_LABELS[item.status] || item.status}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECKLIST
// ═══════════════════════════════════════════════════════════════════════════

const CHECKLIST_DEFAULT = {
  title: 'Checklist de départ',
  items: [
    { id: '1', text: 'Éteindre toutes les lumières', checked: true },
    { id: '2', text: 'Fermer les fenêtres', checked: true },
    { id: '3', text: 'Vider le réfrigérateur', checked: false },
    { id: '4', text: 'Sortir les poubelles', checked: false },
    { id: '5', text: 'Vérifier les robinets', checked: false },
    { id: '6', text: 'Ranger les coussins', checked: true },
    { id: '7', text: 'Verrouiller la porte', checked: false },
  ] as { id: string; text: string; checked: boolean }[],
};

export function ChecklistModule({ content, onSave }: ModuleProps) {
  const data = { ...CHECKLIST_DEFAULT, ...content } as typeof CHECKLIST_DEFAULT & { items: { id: string; text: string; checked: boolean }[] };
  const [items, setItems] = useState(data.items);
  const [newText, setNewText] = useState('');

  const toggle = (id: string) => {
    const updated = items.map(i => i.id === id ? { ...i, checked: !i.checked } : i);
    setItems(updated);
    onSave({ ...content, items: updated });
  };

  const add = () => {
    if (!newText.trim()) return;
    const updated = [...items, { id: Date.now().toString(), text: newText.trim(), checked: false }];
    setItems(updated);
    setNewText('');
    onSave({ ...content, items: updated });
  };

  const remove = (id: string) => {
    const updated = items.filter(i => i.id !== id);
    setItems(updated);
    onSave({ ...content, items: updated });
  };

  const progress = items.length ? Math.round((items.filter(i => i.checked).length / items.length) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950">
              <ListChecks className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <CardTitle className="text-base">{data.title}</CardTitle>
              <p className="text-xs text-muted-foreground">{items.filter(i => i.checked).length}/{items.length} terminé(s)</p>
            </div>
          </div>
          <Badge variant={progress === 100 ? 'default' : 'outline'}>{progress}%</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border p-2.5">
              <Checkbox checked={item.checked} onCheckedChange={() => toggle(item.id)} />
              <span className={`flex-1 text-sm ${item.checked ? 'line-through text-muted-foreground' : ''}`}>{item.text}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input placeholder="Nouvelle tâche..." value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} className="flex-1" />
          <Button size="icon" onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLEANING SCHEDULE
// ═══════════════════════════════════════════════════════════════════════════

const CLEANING_DEFAULT = {
  schedule: [
    { id: '1', day: 'Lundi', room: 'Cuisine', tasks: ['Nettoyer les plaques', 'Passer l\'aspirateur', 'Essuyer les plans de travail'], assignee: 'Marie' },
    { id: '2', day: 'Mardi', room: 'Salles de bain', tasks: ['Nettoyer lavabos', 'Désinfecter WC', 'Changer serviettes'], assignee: 'Pierre' },
    { id: '3', day: 'Mercredi', room: 'Salon', tasks: ['Dépoussiérer', 'Passer l\'aspirateur', 'Ranger les coussins'], assignee: 'Marie' },
    { id: '4', day: 'Jeudi', room: 'Chambres', tasks: ['Changer les draps', 'Passer l\'aspirateur', 'Ranger'], assignee: 'Pierre' },
    { id: '5', day: 'Vendredi', room: 'Tout', tasks: ['Grand ménage hebdo', 'Nettoyer vitres', 'Sortir les poubelles'], assignee: 'Tous' },
  ] as { id: string; day: string; room: string; tasks: string[]; assignee: string }[],
};

export function CleaningScheduleModule({ content }: ModuleProps) {
  const data = { ...CLEANING_DEFAULT, ...content } as typeof CLEANING_DEFAULT & { schedule: { id: string; day: string; room: string; tasks: string[]; assignee: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-100 dark:bg-lime-950">
            <Calendar className="h-5 w-5 text-lime-600" />
          </div>
          <CardTitle className="text-base">Planning de nettoyage</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {data.schedule.map(s => (
            <div key={s.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{s.day}</Badge>
                  <span className="text-sm font-medium">{s.room}</span>
                </div>
                <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> {s.assignee}</span>
              </div>
              <ul className="space-y-1">
                {s.tasks.map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-lime-500" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MEAL PLANNER
// ═══════════════════════════════════════════════════════════════════════════

const MEAL_DEFAULT = {
  week: [
    { day: 'Lundi', midi: 'Salade César', soir: 'Poulet rôti + légumes', note: '' },
    { day: 'Mardi', midi: 'Quiche lorraine', soir: 'Pâtes bolognaise', note: '' },
    { day: 'Mercredi', midi: 'Restes', soir: 'Saumon + riz', note: 'Acheter saumon' },
    { day: 'Jeudi', midi: 'Omelette', soir: 'Gratin dauphinois', note: '' },
    { day: 'Vendredi', midi: 'Sandwichs', soir: 'Pizza maison', note: '' },
    { day: 'Samedi', midi: 'Brunch', soir: 'Tajine poulet', note: 'Invités prévus' },
    { day: 'Dimanche', midi: 'Rôti de bœuf', soir: 'Soupe de légumes', note: '' },
  ] as { day: string; midi: string; soir: string; note: string }[],
};

export function MealPlannerModule({ content }: ModuleProps) {
  const data = { ...MEAL_DEFAULT, ...content } as typeof MEAL_DEFAULT & { week: { day: string; midi: string; soir: string; note: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-950">
            <UtensilsCrossed className="h-5 w-5 text-orange-500" />
          </div>
          <CardTitle className="text-base">Planificateur de repas</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left font-semibold">Jour</th>
                <th className="py-2 text-left font-semibold">Midi ☀️</th>
                <th className="py-2 text-left font-semibold">Soir 🌙</th>
              </tr>
            </thead>
            <tbody>
              {data.week.map((d, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2.5 font-medium">{d.day}</td>
                  <td className="py-2.5">{d.midi}</td>
                  <td className="py-2.5">{d.soir}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SHARED CALENDAR
// ═══════════════════════════════════════════════════════════════════════════

const CALENDAR_DEFAULT = {
  events: [
    { id: '1', date: '2024-12-23', time: '10:00', title: 'RDV Vétérinaire Luna', category: 'Animaux', color: 'bg-amber-100' },
    { id: '2', date: '2024-12-24', time: '', title: 'Réveillon Noël', category: 'Famille', color: 'bg-red-100' },
    { id: '3', date: '2024-12-25', time: '14:00', title: 'Déjeuner famille', category: 'Famille', color: 'bg-red-100' },
    { id: '4', date: '2024-12-28', time: '09:00', title: 'Départ poubelles encombrantes', category: 'Maison', color: 'bg-green-100' },
    { id: '5', date: '2024-12-30', time: '16:00', title: 'Réparation chaudière', category: 'Maison', color: 'bg-orange-100' },
  ] as { id: string; date: string; time: string; title: string; category: string; color: string }[],
};

export function SharedCalendarModule({ content }: ModuleProps) {
  const data = { ...CALENDAR_DEFAULT, ...content } as typeof CALENDAR_DEFAULT & { events: { id: string; date: string; time: string; title: string; category: string; color: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950">
            <CalendarDays className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <CardTitle className="text-base">Calendrier partagé</CardTitle>
            <p className="text-xs text-muted-foreground">{data.events.length} événement(s) à venir</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {data.events.map(evt => (
            <div key={evt.id} className={`flex items-center gap-3 rounded-lg border p-3 ${evt.color} bg-opacity-50`}>
              <div className="flex-shrink-0 text-center">
                <p className="text-xs text-muted-foreground">{evt.date.slice(5)}</p>
                <p className="text-xs font-medium">{evt.time || 'Journée'}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{evt.title}</p>
                <Badge variant="outline" className="text-[10px]">{evt.category}</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  DELIVERY
// ═══════════════════════════════════════════════════════════════════════════

const DELIVERY_DEFAULT = {
  instructions: 'Sonner à l\'interphone « Dupont ». Si absent, déposer au point relais Mondial Relay (boulangerie en bas de rue). Ne pas laisser devant la porte.',
  dropoffLocation: 'Hall d\'entrée, sur la table à droite',
  alternativeLocation: 'Mondial Relay - Boulangerie Leclerc, 10 Rue de la Paix',
  accessCode: '4829#',
  contactNote: 'Pour tout problème : Pierre au +33 6 12 34 56 78',
  safePlace: 'Sous l\'abri de jardin (côté gauche)',
};

export function DeliveryModule({ content }: ModuleProps) {
  const data = { ...DELIVERY_DEFAULT, ...content } as typeof DELIVERY_DEFAULT;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-950">
            <Truck className="h-5 w-5 text-orange-600" />
          </div>
          <CardTitle className="text-base">Instructions de livraison</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-sm">{data.instructions}</p></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground mb-1">📍 Lieu de dépôt principal</p><p className="text-sm font-medium">{data.dropoffLocation}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground mb-1">📍 Lieu alternatif</p><p className="text-sm font-medium">{data.alternativeLocation}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground mb-1">🔐 Code d\'accès</p><p className="text-sm font-mono font-bold">{data.accessCode}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground mb-1">🏠 Endroit sûr</p><p className="text-sm font-medium">{data.safePlace}</p></div>
        </div>
        <p className="text-xs text-muted-foreground">📞 {data.contactNote}</p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PACKAGE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

const PACKAGE_DEFAULT = {
  packages: [
    { id: '1', name: 'Colis Amazon', tracking: '1Z999AA10123456784', carrier: 'UPS', status: 'En transit', eta: '2024-12-23', icon: '📦' },
    { id: '2', name: 'Commande Cdiscount', tracking: 'CD2024122098765', carrier: 'Chronopost', status: 'Livré', eta: '2024-12-20', icon: '📦' },
    { id: '3', name: 'Lettre recommandée', tracking: 'LR123456789FR', carrier: 'La Poste', status: 'En attente de retrait', eta: '', icon: '✉️' },
  ] as { id: string; name: string; tracking: string; carrier: string; status: string; eta: string; icon: string }[],
};

export function PackageTrackingModule({ content }: ModuleProps) {
  const data = { ...PACKAGE_DEFAULT, ...content } as typeof PACKAGE_DEFAULT & { packages: { id: string; name: string; tracking: string; carrier: string; status: string; eta: string; icon: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-950">
            <PackageSearch className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <CardTitle className="text-base">Suivi de colis</CardTitle>
            <p className="text-xs text-muted-foreground">{data.packages.length} colis</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {data.packages.map(pkg => (
            <div key={pkg.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{pkg.icon}</span>
                  <span className="text-sm font-medium">{pkg.name}</span>
                </div>
                <Badge variant={pkg.status.includes('Livré') ? 'default' : 'outline'} className="text-[10px]">{pkg.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono">{pkg.tracking}</p>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground">{pkg.carrier}</span>
                {pkg.eta && <span className="text-xs">📅 {pkg.eta}</span>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
