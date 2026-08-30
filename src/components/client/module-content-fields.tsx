'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Wifi, Link, BookOpen, StickyNote, User, Bell, UtensilsCrossed, Pill, Zap, KeyRound, Sparkles } from 'lucide-react';

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface ModuleFieldDef {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'select' | 'url';
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

// ---------------------------------------------------------------------------
//  Module Activation Configuration
// ---------------------------------------------------------------------------

/** V1 modules that require content fields at activation time */
export const MODULE_ACTIVATION_CONFIG: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  fields: ModuleFieldDef[];
}> = {
  wifi: {
    icon: Wifi,
    description: 'Connexion instantanée au réseau Wi-Fi',
    fields: [
      { key: 'ssid', label: 'Nom du réseau (SSID)', type: 'text', placeholder: 'MonWiFi', required: true },
      { key: 'password', label: 'Mot de passe', type: 'password', placeholder: '••••••••', required: true },
      { key: 'security', label: 'Type de sécurité', type: 'select', options: ['WPA2', 'WPA3', 'WPA', 'WEP', 'Ouvert'], required: false },
    ],
  },
  external_link: {
    icon: Link,
    description: 'Redirection vers un lien externe',
    fields: [
      { key: 'url', label: 'URL', type: 'url', placeholder: 'https://netflix.com', required: true },
      { key: 'title', label: 'Titre', type: 'text', placeholder: 'Netflix', required: false },
    ],
  },
  home_manual: {
    icon: BookOpen,
    description: 'Guide de la maison avec règles et informations',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', placeholder: 'Guide de la maison', required: true },
      { key: 'body', label: 'Contenu', type: 'textarea', placeholder: 'Bienvenue ! Voici les informations importantes pour votre séjour...', required: true },
    ],
  },
  note: {
    icon: StickyNote,
    description: 'Message court modifiable en temps réel',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', placeholder: 'Mon post-it', required: false },
      { key: 'body', label: 'Message', type: 'textarea', placeholder: 'Poulet au four à 180°', required: true },
    ],
  },
  meal_planner: {
    icon: UtensilsCrossed,
    description: 'Menu du jour pour la famille',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', placeholder: 'Menu de la semaine', required: false },
      { key: 'body', label: 'Menu du jour', type: 'textarea', placeholder: 'Midi : Poulet rôti avec légumes\nSoir : Pâtes carbonara', required: true },
    ],
  },
  guestbook: {
    icon: BookOpen,
    description: 'Messages des invités',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', placeholder: "Livre d'or", required: false },
      { key: 'body', label: "Message d'accueil", type: 'textarea', placeholder: 'Laissez-nous un message !', required: false },
    ],
  },
  doorbell: {
    icon: Bell,
    description: 'Portier virtuel pour les livreurs et voisins',
    fields: [
      { key: 'mode', label: 'Mode actuel', type: 'select', options: ['absent', 'présent'], required: true },
      { key: 'instructions', label: 'Instructions pour les visiteurs', type: 'textarea', placeholder: 'Sonner 2 fois puis attendre. Déposer les colis près de la porte.', required: false },
    ],
  },
  emergency: {
    icon: Pill,
    description: 'Contacts d\'urgence',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', placeholder: 'En cas d\'urgence', required: false },
      { key: 'body', label: 'Instructions', type: 'textarea', placeholder: 'Appeler le 15 (SAMU) ou le 112...', required: false },
    ],
  },
  contact: {
    icon: User,
    description: 'Informations de contact',
    fields: [
      { key: 'name', label: 'Nom', type: 'text', placeholder: 'Jean Dupont', required: true },
      { key: 'phone', label: 'Téléphone', type: 'text', placeholder: '+33 6 12 34 56 78', required: false },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'jean@example.com', required: false },
    ],
  },
  medication: {
    icon: Pill,
    description: 'Suivi de prise de médicaments',
    fields: [
      { key: 'title', label: 'Nom du médicament', type: 'text', placeholder: 'Vitamine D', required: true },
      { key: 'body', label: 'Posologie / Instructions', type: 'textarea', placeholder: '1 comprimé par jour le matin à jeun', required: false },
    ],
  },
  energy_monitor: {
    icon: Zap,
    description: 'Suivi des compteurs d\'énergie',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', placeholder: 'Compteur électrique', required: false },
      { key: 'body', label: 'Note', type: 'textarea', placeholder: 'Relevé à faire le 1er de chaque mois', required: false },
    ],
  },
  key_location: {
    icon: KeyRound,
    description: 'Suivi d\'emprunt de clés et objets',
    fields: [
      { key: 'title', label: 'Objet suivi', type: 'text', placeholder: 'Clés de la voiture', required: true },
      { key: 'body', label: 'Emplacement habituel', type: 'textarea', placeholder: 'Porte-clés sur le crochet à gauche de l\'entrée', required: false },
    ],
  },
  cleaning_schedule: {
    icon: Sparkles,
    description: 'Checklist de ménage profond',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', placeholder: 'Ménage hebdomadaire', required: false },
      { key: 'body', label: 'Tâches', type: 'textarea', placeholder: '- Nettoyer le filtre de la machine à laver\n- Vider les gouttières\n- Dépoussiérer les hauts', required: false },
    ],
  },
  shopping_list: {
    icon: BookOpen,
    description: 'Liste de courses collaborative',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', placeholder: 'Courses de la semaine', required: false },
      { key: 'body', label: 'Articles initiaux', type: 'textarea', placeholder: '- Lait\n- Pain\n- œufs', required: false },
    ],
  },
  checklist: {
    icon: BookOpen,
    description: 'To-Do list administrative',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', placeholder: 'Tâches à faire', required: false },
      { key: 'body', label: 'Tâches', type: 'textarea', placeholder: '- Payer la facture d\'électricité\n- Renvoyer le courrier', required: false },
    ],
  },
};

/** Modules that have no special content fields — just use defaults */
export const MODULES_WITHOUT_CONTENT_FIELDS = new Set([
  'inventory', 'chore', 'timer', 'recipe', 'pet_info', 'plant_care',
  'visitor_info', 'delivery', 'baby_sitter', 'house_rules', 'wifi_reset',
  'appliance_manual', 'laundry_guide', 'recycling_info', 'utility_shutoff',
  'first_aid', 'pet_sitter', 'rental_guest', 'airbnb_guest',
  'emergency_contacts', 'package_tracking', 'home_network',
  'entertainment', 'music_room', 'game_room', 'library',
  'photo_gallery', 'family_board', 'announcement', 'mood_tracker',
  'habit_tracker', 'weather_station', 'smart_home_control', 'voice_assistant',
]);

// ---------------------------------------------------------------------------
//  Component: Module Content Fields
// ---------------------------------------------------------------------------

interface ModuleContentFieldsProps {
  moduleType: string;
  content: Record<string, string>;
  onChange: (content: Record<string, string>) => void;
}

export function ModuleContentFields({ moduleType, content, onChange }: ModuleContentFieldsProps) {
  const config = MODULE_ACTIVATION_CONFIG[moduleType];

  if (!config) return null;

  const updateField = (key: string, value: string) => {
    onChange({ ...content, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <config.icon className="h-4 w-4 text-primary" />
        <span className="text-sm text-muted-foreground">{config.description}</span>
      </div>
      {config.fields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label className="text-sm font-medium">
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.type === 'textarea' ? (
            <Textarea
              placeholder={field.placeholder}
              value={content[field.key] || ''}
              onChange={(e) => updateField(field.key, e.target.value)}
              rows={3}
            />
          ) : field.type === 'select' ? (
            <Select
              value={content[field.key] || ''}
              onValueChange={(val) => updateField(field.key, val)}
            >
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder || 'Sélectionner...'} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={field.type === 'password' ? 'password' : 'text'}
              placeholder={field.placeholder}
              value={content[field.key] || ''}
              onChange={(e) => updateField(field.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Validate required fields and return missing field labels */
export function validateModuleContent(
  moduleType: string,
  content: Record<string, string>,
): string[] {
  const config = MODULE_ACTIVATION_CONFIG[moduleType];
  if (!config) return [];

  return config.fields
    .filter((f) => f.required && !content[f.key]?.trim())
    .map((f) => f.label);
}

/** Check if a module type has configurable content fields */
export function moduleHasContentFields(moduleType: string): boolean {
  return moduleType in MODULE_ACTIVATION_CONFIG;
}
