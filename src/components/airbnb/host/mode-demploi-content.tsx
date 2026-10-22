'use client';

import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Award,
  Camera,
  DoorClosed,
  DoorOpen,
  FileText,
  Images,
  ShieldCheck,
  Sparkles,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

// =============================================================
// ModeDEmploiContent - onglet "Mode d'emploi des Etats des Lieux"
// du dashboard hote (/airbnb/mode-demploi, groupe Aide - Task 42-c).
//
// Design theme clair premium :
//  - fond #f8fafc, cartes blanches rounded-2xl shadow-sm border-gray-200
//  - accent Bleu #1e3a8a (titres, numeros, puces)
//  - accent Rouge #C41E3A ponctuel (alerte prioritaire, badge Certificat)
//  - textes gray-900 / gray-600 / gray-500
// Contenu 100 % statique : aucune donnee, aucun fetch, aucune session.
// Mobile first : timeline verticale, cibles tactiles >= 44 px.
// =============================================================

interface GuideStep {
  icon: LucideIcon;
  title: string;
  /** Description riche : jetons techniques en mono (liens magiques, refs). */
  description: ReactNode;
  /** Badge ponctuel rouge (step 6 : Certificat). */
  badge?: string;
}

/** Puce mono pour les jetons techniques du guide (liens, references). */
function CodeChip({ children }: { children: ReactNode }) {
  return (
    <code className="mx-0.5 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#1e3a8a]">
      {children}
    </code>
  );
}

const GUIDE_STEPS: GuideStep[] = [
  {
    icon: ShieldCheck,
    title: 'Activer l’Inventaire & créer le logement',
    description: (
      <>
        Après le paiement, un assistant de 5 minutes vous guide : nom du
        logement, pièces, équipements. Votre référence unique{' '}
        <CodeChip>ONB-XXX</CodeChip> est générée automatiquement.
      </>
    ),
  },
  {
    icon: Camera,
    title: 'Les photos de référence',
    description: (
      <>
        Photographiez chaque pièce et chaque équipement depuis votre dashboard —
        ou déléguez : votre équipe sur place ouvre le lien magique{' '}
        <CodeChip>/upload/[token]</CodeChip> (valable 7 jours) et photographie à
        votre place. Vous êtes notifié à réception.
      </>
    ),
  },
  {
    icon: DoorOpen,
    title: 'CHECK-IN — état des lieux d’entrée en 90 s',
    description: (
      <>
        À l’arrivée du voyageur, une photo par pièce suffit : la comparaison
        automatique avec les références est instantanée et le rapport PDF
        d’entrée vous est envoyé.
      </>
    ),
  },
  {
    icon: Sparkles,
    title: 'Le ménage',
    description: (
      <>
        Votre agent reçoit un lien <CodeChip>/s/[token]</CodeChip> (app cleaner)
        : photos « fantômes » des zones et vidéo walkthrough de 120 secondes
        maximum. Tout est horodaté.
      </>
    ),
  },
  {
    icon: DoorClosed,
    title: 'CHECK-OUT — état des lieux de sortie',
    description: (
      <>
        Comparatif automatique entrée / sortie : les dégradations éventuelles
        sont signalées avec leurs preuves photo, prêtes à l’emploi.
      </>
    ),
  },
  {
    icon: Award,
    title: 'Le Certificat Anti-Dégâts',
    description: (
      <>
        PDF scellé par hash <CodeChip>SHA256</CodeChip> accompagné du dossier de
        preuves horodatées : un document officiel, utilisable en cas de litige
        Airbnb. Téléchargeable aussi en guide PDF depuis le bouton
        «&nbsp;Télécharger le PDF&nbsp;».
      </>
    ),
    badge: 'Certificat',
  },
];

interface NotifItem {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Variante rouge ponctuelle (alerte prioritaire). */
  alert?: boolean;
  /** Petite etiquette a droite du titre (ex : Prioritaire). */
  tag?: string;
}

const NOTIFICATIONS: NotifItem[] = [
  {
    icon: ShieldCheck,
    title: 'Création du logement',
    description:
      'Email de confirmation avec votre référence ONB-XXX dès la fin de l’assistant de configuration.',
  },
  {
    icon: Camera,
    title: 'Réception des photos de délégation',
    description:
      'Vos photos de référence sont disponibles dès que votre équipe a terminé ses prises de vue.',
  },
  {
    icon: FileText,
    title: 'Check-in réalisé',
    description:
      'Le rapport PDF d’entrée arrive dès la fin de l’état des lieux (90 s au compteur).',
  },
  {
    icon: Video,
    title: 'Ménage réalisé',
    description:
      'Photos fantômes des zones et vidéo walkthrough, horodatées, déposées dans votre dashboard.',
  },
  {
    icon: Images,
    title: 'Check-out réalisé',
    description:
      'Le comparatif complet entrée / sortie est prêt à consulter, preuves à l’appui.',
  },
  {
    icon: AlertTriangle,
    title: 'Dégradation détectée',
    description:
      'Alerte immédiate avec les photos de la dégradation et le dossier de litige pré-rempli.',
    alert: true,
    tag: 'Prioritaire',
  },
  {
    icon: Award,
    title: 'Certificat disponible',
    description:
      'Votre Certificat Anti-Dégâts PDF scellé est téléchargeable depuis le dashboard.',
  },
];

// Animation d'entree legere (fade + montee, framer-motion).
const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: 'easeOut' as const },
};

export function ModeDEmploiContent() {
  return (
    // Bande claire pleine largeur : neutralise le fond du shell pour un
    // rendu theme premium independant (clair + sombre v5.0).
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-[#f8fafc] p-4 pb-10 dark:bg-[#070c1c] sm:-m-6 sm:p-6 sm:pb-12">
      <div className="mx-auto w-full max-w-3xl">
        {/* ---------- En-tete de page ---------- */}
        <motion.header {...fadeUp}>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#C41E3A] dark:text-[#ff5a76]">
            Espace Hôte — Aide
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-100 sm:text-[26px]">
            Mode d’emploi des États des Lieux
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-500 dark:text-slate-400">
            Le guide complet de l’Inventaire RoomScan : les 6 étapes d’un séjour
            certifié et les notifications envoyées automatiquement.
          </p>
        </motion.header>

        {/* ---------- Encart intro ---------- */}
        <motion.section
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.05 }}
          aria-labelledby="mode-demploi-intro"
          className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[#22305a] dark:bg-[#0d1530]/90"
        >
          <div className="flex items-start gap-3.5 sm:items-center">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1e3a8a] to-[#2f6fed] text-white shadow-sm"
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p
                id="mode-demploi-intro"
                className="text-[15px] font-bold leading-snug text-gray-900 dark:text-slate-100"
              >
                Zéro papier, zéro litige : l’Inventaire RoomScan photographie,
                compare et certifie chaque séjour.
              </p>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-slate-400">
                Chaque étape génère des preuves photo horodatées, comparées par
                l’IA et scellées dans un certificat.
              </p>
            </div>
          </div>
        </motion.section>

        {/* ---------- Section A : les 6 etapes (timeline) ---------- */}
        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="mt-8">
          <h2 className="flex items-center gap-2.5 text-lg font-bold text-gray-900 dark:text-slate-100">
            <span aria-hidden="true" className="h-5 w-1 rounded-full bg-[#1e3a8a]" />
            Les 6 étapes
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            De l’activation de l’Inventaire au Certificat Anti-Dégâts, un séjour
            certifié suit toujours le même parcours.
          </p>

          <ol className="relative mt-5 space-y-4">
            {/* Ligne verticale de la timeline */}
            <span
              aria-hidden="true"
              className="absolute bottom-7 left-[19px] top-7 w-px bg-blue-100 dark:bg-[#22305a]"
            />
            {GUIDE_STEPS.map((step, index) => (
              <li key={step.title} className="relative flex gap-3 sm:gap-4">
                {/* Numero dans la pastille bleue */}
                <span
                  aria-hidden="true"
                  className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1e3a8a] to-[#2f6fed] text-sm font-bold text-white shadow-sm ring-4 ring-[#f8fafc] dark:ring-[#070c1c]"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[#22305a] dark:bg-[#0d1530]/90 sm:p-5">
                  <div className="flex items-center gap-2.5">
                    <step.icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#1e3a8a] dark:text-[#3b82f6]" />
                    <h3 className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-gray-900 dark:text-slate-100">
                      {step.title}
                    </h3>
                    {step.badge ? (
                      <span className="shrink-0 rounded-full bg-[#C41E3A] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        {step.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-slate-400">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </motion.section>

        {/* ---------- Section B : les notifications ---------- */}
        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.15 }} className="mt-8">
          <h2 className="flex items-center gap-2.5 text-lg font-bold text-gray-900 dark:text-slate-100">
            <span aria-hidden="true" className="h-5 w-1 rounded-full bg-[#1e3a8a]" />
            Les notifications
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Des emails et alertes envoyés automatiquement à chaque étape — rien
            à surveiller, vous êtes tenu au courant.
          </p>

          <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#22305a] dark:bg-[#0d1530]/90">
            <ul className="divide-y divide-gray-100 dark:divide-[#1a2749]">
              {NOTIFICATIONS.map((notif) => (
                <li key={notif.title} className="flex items-start gap-3 p-4 sm:px-5">
                  <span
                    aria-hidden="true"
                    className={
                      notif.alert
                        ? 'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-[#C41E3A] dark:bg-red-500/15 dark:text-[#ff5a76]'
                        : 'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#1e3a8a] dark:bg-[#2f6fed]/20 dark:text-[#60a5fa]'
                    }
                  >
                    <notif.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-slate-100">
                      {notif.title}
                      {notif.tag ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#C41E3A] dark:bg-red-500/15 dark:text-[#ff5a76]">
                          {notif.tag}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500 dark:text-slate-400">
                      {notif.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
