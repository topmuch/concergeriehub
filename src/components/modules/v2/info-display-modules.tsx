'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Home, FileText, Settings, RotateCcw, Key, Car,
  Shirt, Recycle, Wrench, Heart, Phone, Network,
  Users, PawPrint, Pencil, Save, X, ChevronDown, ChevronUp,
  MapPin, ShieldCheck, Droplets, Flame, Zap, Wifi,
  Edit3, Plus, Trash2,
} from 'lucide-react';
import { useState } from 'react';
import type { ModuleProps } from '../types';

// ─── Shared Info Section Component ────────────────────────────────────────

function InfoSection({ icon, title, content, color = 'text-muted-foreground' }: { icon: React.ReactNode; title: string; content: string; color?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className={`text-sm ${color} whitespace-pre-wrap`}>{content}</p>
      </div>
    </div>
  );
}

// ─── Collapsible Sections Editor ──────────────────────────────────────────

function CollapsibleSections({
  sections,
  onAdd,
  onUpdate,
  onDelete,
}: {
  sections: { id: string; title: string; content: string }[];
  onAdd: () => void;
  onUpdate: (id: string, title: string, content: string) => void;
  onDelete: (id: string) => void;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(sections.map(s => s.id)));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const toggle = (id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startEdit = (s: { id: string; title: string; content: string }) => {
    setEditingId(s.id);
    setEditTitle(s.title);
    setEditContent(s.content);
  };

  const saveEdit = () => {
    if (editingId) onUpdate(editingId, editTitle, editContent);
    setEditingId(null);
  };

  return (
    <div className="space-y-2">
      {sections.map(s => (
        <div key={s.id} className="rounded-lg border">
          <div className="flex items-center justify-between p-3">
            <button onClick={() => toggle(s.id)} className="flex items-center gap-2 flex-1 text-left">
              {openIds.has(s.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="text-sm font-medium">{s.title}</span>
            </button>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(s)}><Edit3 className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          {openIds.has(s.id) && (
            <div className="px-3 pb-3">
              {editingId === s.id ? (
                <div className="space-y-2">
                  <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                  <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit}><Save className="h-3.5 w-3.5 mr-1" />Enregistrer</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5 mr-1" />Annuler</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">{s.content}</p>
              )}
            </div>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onAdd}><Plus className="h-3.5 w-3.5" />Ajouter une section</Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  HOME MANUAL
// ═══════════════════════════════════════════════════════════════════════════

const HOME_MANUAL_DEFAULT = {
  welcome: 'Bienvenue dans notre maison ! Ce guide contient tout ce que vous devez savoir pour un séjour agréable.',
  checkIn: 'Arrivée à partir de 15h00. Code porte : 4829#',
  checkOut: 'Départ avant 11h00. Merci de laisser les clés sur la table.',
  sections: [
    { id: '1', title: '🛏️ Chambres', content: '2 chambres avec lit double, 1 chambre avec 2 lits simples.\nLinge de lit fourni dans les armoires.' },
    { id: '2', title: '🚿 Salles de bain', content: '2 salles de bain avec douche. Serviettes dans le placard au-dessus du lavabo. Sèche-cheveux dans le tiroir gauche.' },
    { id: '3', title: '🍳 Cuisine', content: 'Cuisine entièrement équipée : four, micro-ondes, lave-vaisselle. Cafetière Nespresso (capsules dans le placard). Produits de base (sel, poivre, huile) fournis.' },
  ] as { id: string; title: string; content: string }[],
};

export function HomeManualModule({ content, onSave }: ModuleProps) {
  const data = { ...HOME_MANUAL_DEFAULT, ...content } as typeof HOME_MANUAL_DEFAULT & { sections: { id: string; title: string; content: string }[] };
  const [sections, setSections] = useState(data.sections);

  const updateSections = (newSections: { id: string; title: string; content: string }[]) => {
    setSections(newSections);
    onSave({ ...content, sections: newSections });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              <Home className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <CardTitle className="text-base">Manuel de la maison</CardTitle>
              <p className="text-xs text-muted-foreground">Guide complet pour les occupants</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{data.welcome}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoSection icon={<Badge variant="outline">Arrivée</Badge>} title="Horaires d'arrivée" content={data.checkIn} />
            <InfoSection icon={<Badge variant="outline">Départ</Badge>} title="Horaires de départ" content={data.checkOut} />
          </div>
          <CollapsibleSections
            sections={sections}
            onAdd={() => updateSections([...sections, { id: Date.now().toString(), title: 'Nouvelle section', content: '' }])}
            onUpdate={(id, title, cnt) => updateSections(sections.map(s => s.id === id ? { id, title, content: cnt } : s))}
            onDelete={(id) => updateSections(sections.filter(s => s.id !== id))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  HOUSE RULES
// ═══════════════════════════════════════════════════════════════════════════

const HOUSE_RULES_DEFAULT = {
  rules: [
    { id: '1', title: 'Silence après 22h', content: 'Merci de respecter le repos des voisins.', important: true },
    { id: '2', title: 'Fumeurs', content: 'Interdit de fumer à l\'intérieur. Balcon autorisé.', important: true },
    { id: '3', title: 'Animaux', content: 'Animaux acceptés sur demande préalable.', important: false },
    { id: '4', title: 'Piscine', content: 'Ouverte de 8h à 21h. Enfants accompagnés.', important: false },
    { id: '5', title: 'Climatisation', content: 'Merci d\'éteindre la clim en quittant la pièce.', important: false },
  ] as { id: string; title: string; content: string; important: boolean }[],
};

export function HouseRulesModule({ content, onSave }: ModuleProps) {
  const data = { ...HOUSE_RULES_DEFAULT, ...content } as typeof HOUSE_RULES_DEFAULT & { rules: { id: string; title: string; content: string; important: boolean }[] };
  const rules = data.rules;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
            <FileText className="h-5 w-5 text-gray-600" />
          </div>
          <CardTitle className="text-base">Règles de la maison</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rules.map((rule, i) => (
          <div key={rule.id} className={`flex items-start gap-3 rounded-lg border p-3 ${rule.important ? 'border-orange-200 bg-orange-50/50 dark:bg-orange-950/30' : ''}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${rule.important ? 'bg-orange-200 text-orange-700' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold">{rule.title}</p>
              <p className="text-sm text-muted-foreground">{rule.content}</p>
            </div>
            {rule.important && <Badge variant="outline" className="text-orange-600 border-orange-200 text-[10px] shrink-0">Important</Badge>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  APPLIANCE MANUAL
// ═══════════════════════════════════════════════════════════════════════════

const APPLIANCE_DEFAULT = {
  applianceName: 'Lave-vaisselle Bosch Serie 6',
  brand: 'Bosch',
  model: 'Serie 6 SMS68TW02E',
  quickStart: '1. Charger la vaisselle\n2. Ajouter le produit (compartiment droit)\n3. Ajouter le sel et le liquide de rinçage\n4. Sélectionner le programme "Auto 45-65°"\n5. Appuyer sur Start',
  programs: [
    { name: 'Auto 45-65°', description: 'Programme automatique, adaptatif', duration: '2h15', icon: '🔄' },
    { name: 'Éco 50°', description: 'Économique, pour vaisselle normale', duration: '3h30', icon: '🌿' },
    { name: 'Rapide 45°', description: 'Pour vaisselle peu sale', duration: '30 min', icon: '⚡' },
    { name: 'Intensif 70°', description: 'Casseroles et poêles très sales', duration: '2h', icon: '🔥' },
  ],
  troubleshooting: [
    { issue: 'Le lave-vaisselle ne démarre pas', solution: 'Vérifiez que la porte est bien fermée et que le robinet d\'eau est ouvert.' },
    { issue: 'Résidus sur la vaisselle', solution: 'Vérifiez les bras de lavage (non obstrués) et le niveau de sel.' },
  ],
};

export function ApplianceManualModule({ content }: ModuleProps) {
  const data = { ...APPLIANCE_DEFAULT, ...content } as typeof APPLIANCE_DEFAULT & { programs: { name: string; description: string; duration: string; icon: string }[]; troubleshooting: { issue: string; solution: string }[] };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
              <Settings className="h-5 w-5 text-zinc-600" />
            </div>
            <div>
              <CardTitle className="text-base">{data.applianceName}</CardTitle>
              <p className="text-xs text-muted-foreground">{data.brand} · {data.model}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-2">Démarrage rapide</h4>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm whitespace-pre-wrap">{data.quickStart}</p>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2">Programmes</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.programs.map((p, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{p.icon}</span>
                    <span className="text-sm font-medium">{p.name}</span>
                    <Badge variant="outline" className="ml-auto text-[10px]">{p.duration}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2">Dépannage</h4>
            <div className="space-y-2">
              {data.troubleshooting.map((t, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">❓ {t.issue}</p>
                  <p className="text-sm text-muted-foreground mt-1">✅ {t.solution}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  WIFI RESET
// ═══════════════════════════════════════════════════════════════════════════

const WIFI_RESET_DEFAULT = {
  routerLocation: 'Bureau, 2ème étage, sur l\'étagère droite',
  routerModel: 'Freebox Delta',
  resetMethod: 'Appuyez sur le bouton "Reset" à l\'arrière pendant 10 secondes avec un trombone.',
  rebootSteps: '1. Débranchez le câble d\'alimentation\n2. Attendez 30 secondes\n3. Rebranchez le câble\n4. Attendez 2 minutes que les voyants soient stables',
  adminUrl: 'http://192.168.0.254',
  adminUser: 'admin',
  adminPassword: 'Voir le carnet dans le tiroir du bureau',
  ispPhone: '3244',
};

export function WifiResetModule({ content }: ModuleProps) {
  const data = { ...WIFI_RESET_DEFAULT, ...content } as typeof WIFI_RESET_DEFAULT;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950">
            <RotateCcw className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-base">Réinitialisation Wi-Fi</CardTitle>
            <p className="text-xs text-muted-foreground">Problèmes de connexion ? Suivez ces étapes</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <InfoSection icon={<MapPin className="h-4 w-4 text-blue-500" />} title="Où est le routeur ?" content={data.routerLocation} />
        <InfoSection icon={<Settings className="h-4 w-4 text-gray-500" />} title="Modèle" content={`${data.routerModel} · Admin : ${data.adminUrl}`} />
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Redémarrage du routeur</h4>
          <div className="rounded-lg bg-muted/50 p-3"><p className="text-sm whitespace-pre-wrap">{data.rebootSteps}</p></div>
        </div>
        <InfoSection icon={<Wifi className="h-4 w-4 text-green-500" />} title="Réinitialisation complète" content={data.resetMethod} />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`tel:${data.ispPhone}`)}>
          <Phone className="h-3.5 w-3.5" /> Appeler le FAI ({data.ispPhone})
        </Button>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  KEY LOCATION
// ═══════════════════════════════════════════════════════════════════════════

const KEY_LOCATION_DEFAULT = {
  keys: [
    { id: '1', name: 'Clé principale', location: 'Boîte aux lettres, code 4829#', icon: '🔑' },
    { id: '2', name: 'Clé porte de garage', location: 'Crochet à côté de la porte d\'entrée, à gauche', icon: '🗝️' },
    { id: '3', name: 'Clé boîte aux lettres', location: 'Sur le trousseau principal', icon: '📬' },
    { id: '4', name: 'Clé cave', location: 'Tiroir du hall d\'entrée, 2ème tiroir', icon: '🔦' },
  ] as { id: string; name: string; location: string; icon: string }[],
  spareKeyNote: 'Clé de réserve chez les voisins : M. et Mme Bernard au n°14.',
  lockboxCode: '4829',
};

export function KeyLocationModule({ content }: ModuleProps) {
  const data = { ...KEY_LOCATION_DEFAULT, ...content } as typeof KEY_LOCATION_DEFAULT & { keys: { id: string; name: string; location: string; icon: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-100 dark:bg-yellow-950">
            <Key className="h-5 w-5 text-yellow-600" />
          </div>
          <CardTitle className="text-base">Emplacement des clés</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.keys.map(k => (
          <div key={k.id} className="flex items-center gap-3 rounded-lg border p-3">
            <span className="text-xl">{k.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-medium">{k.name}</p>
              <p className="text-sm text-muted-foreground">📍 {k.location}</p>
            </div>
          </div>
        ))}
        {data.spareKeyNote && (
          <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 p-3">
            <p className="text-sm">🔑 <strong>Clé de réserve :</strong> {data.spareKeyNote}</p>
          </div>
        )}
        {data.lockboxCode && (
          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
            <span className="text-sm text-muted-foreground">Code boîte à clés</span>
            <Badge variant="outline" className="font-mono text-sm">{data.lockboxCode}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  GARAGE INSTRUCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const GARAGE_DEFAULT = {
  garageType: 'Sous-sol',
  doorCode: '1974#',
  remoteLocation: 'Sur le porte-clés dans le hall, 1er crochet',
  manualOpen: 'Tirez la corde d\'urgence vers le bas pour déverrouiller, puis soulevez manuellement.',
  parkingSpots: [
    { spot: 'Place 1', info: 'Voiture principale - face au garage' },
    { spot: 'Place 2', info: 'Place visiteurs - à gauche' },
  ],
  notes: 'Hauteur max : 2m10. Ne pas stationner devant la porte de service.',
};

export function GarageInstructionsModule({ content }: ModuleProps) {
  const data = { ...GARAGE_DEFAULT, ...content } as typeof GARAGE_DEFAULT & { parkingSpots: { spot: string; info: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
            <Car className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <CardTitle className="text-base">Instructions Garage</CardTitle>
            <p className="text-xs text-muted-foreground">Garage {data.garageType}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoSection icon={<Key className="h-4 w-4" />} title="Code porte" content={data.doorCode} />
        <InfoSection icon={<Settings className="h-4 w-4" />} title="Télécommande" content={data.remoteLocation} />
        <InfoSection icon={<Wrench className="h-4 w-4" />} title="Ouverture manuelle" content={data.manualOpen} />
        <div>
          <h4 className="text-sm font-semibold mb-2">Places de parking</h4>
          {data.parkingSpots.map((p, i) => (
            <div key={i} className="rounded-lg border p-3 mb-2">
              <p className="text-sm font-medium">🅿️ {p.spot}</p>
              <p className="text-xs text-muted-foreground">{p.info}</p>
            </div>
          ))}
        </div>
        {data.notes && <p className="text-xs text-muted-foreground italic">⚠️ {data.notes}</p>}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  LAUNDRY GUIDE
// ═══════════════════════════════════════════════════════════════════════════

const LAUNDRY_DEFAULT = {
  machineLocation: 'Buanderie, sous-sol niveau -1',
  detergentLocation: 'Étagère au-dessus de la machine',
  instructions: [
    { icon: '👕', label: 'Coton blanc', temp: '60°C', program: 'Coton', duration: '2h15' },
    { icon: '👕', label: 'Coton couleur', temp: '40°C', program: 'Coton', duration: '2h' },
    { icon: '👚', label: 'Synthétique', temp: '30°C', program: 'Synthétique', duration: '1h15' },
    { icon: '👗', label: 'Délicat', temp: '30°C', program: 'Délicat', duration: '1h' },
    { icon: '🧶', label: 'Laine', temp: 'Froid', program: 'Laine', duration: '1h30' },
  ],
  dryerNote: 'Sèche-linge à côté. Programme automatique recommandé. Ne pas surcharger.',
  ironAvailable: true,
};

export function LaundryGuideModule({ content }: ModuleProps) {
  const data = { ...LAUNDRY_DEFAULT, ...content } as typeof LAUNDRY_DEFAULT & { instructions: { icon: string; label: string; temp: string; program: string; duration: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950">
            <Shirt className="h-5 w-5 text-sky-600" />
          </div>
          <CardTitle className="text-base">Guide de lavage</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoSection icon={<MapPin className="h-4 w-4" />} title="Machine à laver" content={data.machineLocation} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.instructions.map((inst, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{inst.icon}</span>
                <span className="text-sm font-medium">{inst.label}</span>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>🌡️ {inst.temp} · {inst.program}</p>
                <p>⏱️ {inst.duration}</p>
              </div>
            </div>
          ))}
        </div>
        {data.dryerNote && <p className="text-sm text-muted-foreground">🔄 {data.dryerNote}</p>}
        {data.ironAvailable && <p className="text-sm text-muted-foreground">👐 Fer à repasser disponible dans le placard de la buanderie.</p>}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  RECYCLING INFO
// ═══════════════════════════════════════════════════════════════════════════

const RECYCLING_DEFAULT = {
  collectionDay: 'Mardi et vendredi',
  bins: [
    { color: 'Jaune', items: 'Emballages plastiques, cartons, boîtes de conserve, briques', icon: '🟡' },
    { color: 'Vert', items: 'Verre : bouteilles, pots, bocaux (pas de céramique)', icon: '🟢' },
    { color: 'Bleu', items: 'Papier, journaux, magazines, carton plat', icon: '🔵' },
    { color: 'Marron', items: 'Déchets organiques, épluchures, restes alimentaires', icon: '🟤' },
    { color: 'Gris', items: 'Ordures ménagères non recyclables', icon: '⚪' },
  ],
  specialItems: 'Piles : supermarché · Vêtements : conteneur parking · Encombrants : mairie le 1er samedi du mois',
  dechetterie: 'Déchetterie communale : Zone industrielle Nord, ouvert mar-sam 8h-18h',
};

export function RecyclingInfoModule({ content }: ModuleProps) {
  const data = { ...RECYCLING_DEFAULT, ...content } as typeof RECYCLING_DEFAULT & { bins: { color: string; items: string; icon: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-950">
            <Recycle className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <CardTitle className="text-base">Guide de recyclage</CardTitle>
            <p className="text-xs text-muted-foreground">📅 Collecte le {data.collectionDay}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          {data.bins.map((bin, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
              <span className="text-xl">{bin.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Poubelle {bin.color}</p>
                <p className="text-xs text-muted-foreground">{bin.items}</p>
              </div>
            </div>
          ))}
        </div>
        {data.specialItems && <InfoSection icon={<Recycle className="h-4 w-4 text-green-500" />} title="Déchets spéciaux" content={data.specialItems} />}
        {data.dechetterie && <InfoSection icon={<MapPin className="h-4 w-4" />} title="Déchetterie" content={data.dechetterie} />}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  UTILITY SHUTOFF
// ═══════════════════════════════════════════════════════════════════════════

const UTILITY_DEFAULT = {
  utilities: [
    { id: '1', type: 'Eau', location: 'Cave, sous l\'escalier, vanne rouge', icon: '💧', shutoff: 'Tourner le robinet dans le sens horaire' },
    { id: '2', type: 'Électricité', location: 'Entrée, tableau à droite de la porte', icon: '⚡', shutoff: 'Baisser tous les disjoncteurs vers le bas' },
    { id: '3', type: 'Gaz', location: 'Cuisine, derrière le four, vanne jaune', icon: '🔥', shutoff: 'Tourner le robinet perpendiculaire à la tuyauterie' },
    { id: '4', type: 'Eau chaude', location: 'Chauffe-eau dans le garage', icon: '🌡️', shutoff: 'Couper le disjoncteur dédié dans le tableau' },
  ] as { id: string; type: string; location: string; icon: string; shutoff: string }[],
  emergencyNote: 'En cas de fuite de gaz : n\'allumez aucune lumière, ouvrez les fenêtres, appelez le 0 800 47 30 00.',
};

export function UtilityShutoffModule({ content }: ModuleProps) {
  const data = { ...UTILITY_DEFAULT, ...content } as typeof UTILITY_DEFAULT & { utilities: { id: string; type: string; location: string; icon: string; shutoff: string }[] };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950">
              <Wrench className="h-5 w-5 text-red-500" />
            </div>
            <CardTitle className="text-base">Coupes utilités</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.utilities.map(u => (
            <div key={u.id} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{u.icon}</span>
                <span className="text-sm font-bold">{u.type}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">📍 {u.location}</p>
              <p className="text-xs">🔧 {u.shutoff}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      {data.emergencyNote && (
        <div className="rounded-lg border-2 border-red-200 bg-red-50 dark:bg-red-950/30 p-3">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">⚠️ {data.emergencyNote}</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  FIRST AID
// ═══════════════════════════════════════════════════════════════════════════

const FIRST_AID_DEFAULT = {
  kitLocation: 'Salle de bain principale, sous l\'évier, boîte blanche avec croix rouge',
  aedLocation: 'Hôtel de ville (à 200m), pharmacie rue principale',
  nearestHospital: 'Hôpital Saint-Louis, 1 Avenue Claude Vellefaux, 75010 Paris',
  nearestPharmacy: 'Pharmie du Centre, 8 Rue de la Paix',
  emergencyNumber: '15',
  contents: ['Pansements adhésifs', 'Bandes de gaze', 'Désinfectant', 'Ciseaux', 'Gants jetables', 'Couverture de survie', 'Thermomètre', 'Anti-douleurs (paracétamol)'],
  cprSteps: '1. Vérifier la conscience\n2. Appeler le 15\n3. 30 compressions thoraciques\n4. 2 insufflations\n5. Répéter à 100-120/min',
};

export function FirstAidModule({ content }: ModuleProps) {
  const data = { ...FIRST_AID_DEFAULT, ...content } as typeof FIRST_AID_DEFAULT & { contents: string[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950">
            <Heart className="h-5 w-5 text-red-600" />
          </div>
          <CardTitle className="text-base">Premiers secours</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoSection icon={<MapPin className="h-4 w-4 text-red-500" />} title="Trousse de premiers secours" content={data.kitLocation} />
          <InfoSection icon={<ShieldCheck className="h-4 w-4" />} title="DEA le plus proche" content={data.aedLocation} />
          <InfoSection icon={<Heart className="h-4 w-4 text-pink-500" />} title="Hôpital le plus proche" content={data.nearestHospital} />
          <InfoSection icon={<Droplets className="h-4 w-4 text-green-500" />} title="Pharmacie la plus proche" content={data.nearestPharmacy} />
        </div>
        <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => window.open('tel:15')}>
          <Phone className="h-3.5 w-3.5" /> Appeler le SAMU (15)
        </Button>
        <div>
          <h4 className="text-sm font-semibold mb-2">Contenu de la trousse</h4>
          <div className="flex flex-wrap gap-1.5">
            {data.contents.map((item, i) => <Badge key={i} variant="secondary" className="text-xs">{item}</Badge>)}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-2">Mouvements de réanimation</h4>
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3">
            <p className="text-sm whitespace-pre-wrap font-mono">{data.cprSteps}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  EMERGENCY CONTACTS
// ═══════════════════════════════════════════════════════════════════════════

const EMERGENCY_CONTACTS_DEFAULT = {
  contacts: [
    { id: '1', name: 'Propriétaire', phone: '+33 6 12 34 56 78', role: 'Propriétaire' },
    { id: '2', name: 'Conciergerie', phone: '+33 6 98 76 54 32', role: 'Conciergerie' },
    { id: '3', name: 'Plombier', phone: '+33 6 11 22 33 44', role: 'Plombier d\'urgence' },
    { id: '4', name: 'Électricien', phone: '+33 6 55 66 77 88', role: 'Électricien' },
    { id: '5', name: 'Locksmith', phone: '+33 6 99 88 77 66', role: 'Serrurier' },
    { id: '6', name: 'Vétérinaire', phone: '+33 6 33 44 55 66', role: 'Vétérinaire de garde' },
  ] as { id: string; name: string; phone: string; role: string }[],
  emergencyServices: [
    { name: 'Urgences européennes', number: '112', icon: '🇪🇺' },
    { name: 'Police', number: '17', icon: '🚔' },
    { name: 'Pompiers', number: '18', icon: '🚒' },
    { name: 'SAMU', number: '15', icon: '🏥' },
  ],
};

export function EmergencyContactsModule({ content }: ModuleProps) {
  const data = { ...EMERGENCY_CONTACTS_DEFAULT, ...content } as typeof EMERGENCY_CONTACTS_DEFAULT & { contacts: { id: string; name: string; phone: string; role: string }[]; emergencyServices: { name: string; number: string; icon: string }[] };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950">
              <Phone className="h-5 w-5 text-red-600" />
            </div>
            <CardTitle className="text-base">Contacts d'urgence</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {data.emergencyServices.map((s, i) => (
              <Button key={i} variant="destructive" className="h-auto py-3 flex-col gap-1" onClick={() => window.open(`tel:${s.number}`)}>
                <span className="text-lg">{s.icon}</span>
                <span className="text-sm font-bold">{s.number}</span>
                <span className="text-[10px] opacity-80">{s.name}</span>
              </Button>
            ))}
          </div>
          <h4 className="text-sm font-semibold">Contacts locaux</h4>
          <div className="space-y-1.5">
            {data.contacts.map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"><Phone className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.role}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.open(`tel:${c.phone.replace(/\s/g, '')}`)}>{c.phone}</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  HOME NETWORK
// ═══════════════════════════════════════════════════════════════════════════

const HOME_NETWORK_DEFAULT = {
  routerModel: 'Freebox Delta',
  routerIp: '192.168.0.254',
  ssid2_4: 'MonWiFi_2.4G',
  ssid5: 'MonWiFi_5G',
  adminUser: 'admin',
  devices: [
    { name: 'TV Salon', ip: '192.168.0.10', type: 'TV' },
    { name: 'Imprimante', ip: '192.168.0.20', type: 'Imprimante' },
    { name: 'Caméra jardin', ip: '192.168.0.30', type: 'IoT' },
    { name: 'Enceinte cuisine', ip: '192.168.0.40', type: 'Audio' },
    { name: 'Thermostat', ip: '192.168.0.50', type: 'IoT' },
  ] as { name: string; ip: string; type: string }[],
  tips: 'Pour de meilleures performances, connectez les appareils fixes en Ethernet.',
};

export function HomeNetworkModule({ content }: ModuleProps) {
  const data = { ...HOME_NETWORK_DEFAULT, ...content } as typeof HOME_NETWORK_DEFAULT & { devices: { name: string; ip: string; type: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950">
            <Network className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-base">Réseau domestique</CardTitle>
            <p className="text-xs text-muted-foreground">{data.routerModel} · {data.routerIp}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoSection icon={<Wifi className="h-4 w-4" />} title="Wi-Fi 2.4 GHz" content={data.ssid2_4} />
          <InfoSection icon={<Wifi className="h-4 w-4" />} title="Wi-Fi 5 GHz" content={data.ssid5} />
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-2">Appareils connectés</h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {data.devices.map((d, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">{d.name}</span>
                  <Badge variant="outline" className="text-[10px]">{d.type}</Badge>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{d.ip}</span>
              </div>
            ))}
          </div>
        </div>
        {data.tips && <p className="text-xs text-muted-foreground italic">💡 {data.tips}</p>}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  VISITOR INFO
// ═══════════════════════════════════════════════════════════════════════════

const VISITOR_INFO_DEFAULT = {
  welcome: 'Bienvenue ! Voici les informations pratiques pour votre séjour.',
  wifiHint: 'Scannez le QR Wi-Fi dans le hall d\'entrée pour les identifiants.',
  houseRules: 'Merci de faire les courses si vous utilisez les denrées alimentaires.',
  checkout: 'Départ avant 11h. Laissez les clés sur la table de l\'entrée.',
  goodToKnow: [
    { icon: '🏪', text: 'Boulangerie à 100m (ouverte 7h-13h, 15h30-19h30)' },
    { icon: '🚇', text: 'Métro ligne 4, station « Vaneau » à 5 min à pied' },
    { icon: '🛒', text: 'Supermarché Carrefour City à 200m, ouvert jusqu\'à 22h' },
    { icon: '🏥', text: 'Pharmacie de garde : 15 rue du Bac' },
    { icon: '🍕', text: 'Restaurants conseillés : Le Bistrot Paul (rue de Sèvres)' },
  ],
};

export function VisitorInfoModule({ content }: ModuleProps) {
  const data = { ...VISITOR_INFO_DEFAULT, ...content } as typeof VISITOR_INFO_DEFAULT & { goodToKnow: { icon: string; text: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 dark:bg-cyan-950">
            <Users className="h-5 w-5 text-cyan-600" />
          </div>
          <CardTitle className="text-base">Informations visiteurs</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{data.welcome}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoSection icon={<Wifi className="h-4 w-4 text-blue-500" />} title="Wi-Fi" content={data.wifiHint} />
          <InfoSection icon={<FileText className="h-4 w-4" />} title="Règles" content={data.houseRules} />
        </div>
        <InfoSection icon={<ChevronDown className="h-4 w-4" />} title="Au départ" content={data.checkout} />
        <div>
          <h4 className="text-sm font-semibold mb-2">Bon à savoir</h4>
          <div className="space-y-1.5">
            {data.goodToKnow.map((item, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5">
                <span>{item.icon}</span>
                <p className="text-sm">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PET INFO
// ═══════════════════════════════════════════════════════════════════════════

const PET_INFO_DEFAULT = {
  pets: [
    { name: 'Luna', species: 'Chat', breed: 'British Shorthair', color: 'Gris bleu', age: '3 ans', weight: '4.5 kg', microchip: '250123456789012', photo: null, personality: 'Calme et affectueux', diet: 'Croquettes Royal Canin Indoor, 50g/jour', medical: 'Stérilisée, vaccinée à jour (prochain rappel : mars 2025)', vetName: 'Dr. Laurent', vetPhone: '+33 1 42 56 78 90', habits: 'Dort beaucoup, aime les fenêtres ensoleillées. Ne pas lui donner de lait.' },
    { name: 'Max', species: 'Chien', breed: 'Labrador', color: 'Noir', age: '5 ans', weight: '32 kg', microchip: '250987654321098', photo: null, personality: 'Joueur et très sociable', diet: 'Croquettes Hill\'s, 200g 2x/jour + complément articulation', medical: 'Vacciné, rappel annuel. Allergie aux poulets.', vetName: 'Dr. Laurent', vetPhone: '+33 1 42 56 78 90', habits: '2 promenades/jour (matin et soir). Ne pas le laisser seul >6h.' },
  ] as { name: string; species: string; breed: string; color: string; age: string; weight: string; microchip: string; photo: string | null; personality: string; diet: string; medical: string; vetName: string; vetPhone: string; habits: string }[],
  emergencyNote: 'En cas d\'urgence vétérinaire : clinique 24h au 15 avenue des Champs-Élysées.',
};

export function PetInfoModule({ content }: ModuleProps) {
  const data = { ...PET_INFO_DEFAULT, ...content } as typeof PET_INFO_DEFAULT & { pets: typeof PET_INFO_DEFAULT.pets };

  return (
    <div className="space-y-4">
      {data.pets.map((pet, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl ${pet.species === 'Chat' ? 'bg-amber-100 dark:bg-amber-950' : 'bg-teal-100 dark:bg-teal-950'}`}>{pet.species === 'Chat' ? '🐱' : '🐶'}</div>
              <div>
                <CardTitle className="text-base">{pet.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{pet.breed} · {pet.color} · {pet.age} · {pet.weight}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <InfoSection icon={<Heart className="h-4 w-4 text-pink-500" />} title="Caractère" content={pet.personality} />
            <InfoSection icon={<Shirt className="h-4 w-4" />} title="Alimentation" content={pet.diet} />
            <InfoSection icon={<ShieldCheck className="h-4 w-4 text-green-500" />} title="Santé" content={pet.medical} />
            <InfoSection icon={<MapPin className="h-4 w-4" />} title="Habitudes" content={pet.habits} />
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <div>
                <p className="text-sm font-medium">🩺 {pet.vetName}</p>
                <p className="text-xs text-muted-foreground">Puce : {pet.microchip}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.open(`tel:${pet.vetPhone.replace(/\s/g, '')}`)}>Appeler</Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {data.emergencyNote && <div className="rounded-lg border-2 border-red-200 bg-red-50 dark:bg-red-950/30 p-3"><p className="text-sm">🚨 {data.emergencyNote}</p></div>}
    </div>
  );
}

// ─── Re-export individual defaults for barrel imports ─────────────────────

export { HOME_MANUAL_DEFAULT, HOUSE_RULES_DEFAULT, APPLIANCE_DEFAULT, WIFI_RESET_DEFAULT, KEY_LOCATION_DEFAULT, GARAGE_DEFAULT, LAUNDRY_DEFAULT, RECYCLING_DEFAULT, UTILITY_DEFAULT, FIRST_AID_DEFAULT, EMERGENCY_CONTACTS_DEFAULT, HOME_NETWORK_DEFAULT, VISITOR_INFO_DEFAULT, PET_INFO_DEFAULT };
