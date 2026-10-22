'use client';

import { motion } from 'framer-motion';
import { Mail } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

// =============================================================
// FaqContent - onglet "Questions frequentes" du dashboard hote
// (/airbnb/faq, groupe Aide - Task 42-c).
//
// Design theme clair premium :
//  - fond #f8fafc, cartes blanches rounded-2xl shadow-sm border-gray-200
//  - accent Bleu #1e3a8a (numeros des questions, chevrons)
//  - textes gray-900 / gray-600 / gray-500
//  - Rouge #C41E3A non utilise ici (aucune alerte dans la FAQ)
// Accordion shadcn/ui existant (src/components/ui/accordion.tsx),
// styles clairs passes en className (le scope .lux est sombre par defaut).
// Contenu 100 % statique : aucune donnee, aucun fetch, aucune session.
// =============================================================

interface FaqEntry {
  q: string;
  a: string;
}

const FAQ_ITEMS: FaqEntry[] = [
  {
    q: 'Qu’est-ce que l’Inventaire RoomScan ?',
    a: 'C’est un état des lieux photo automatisé : les pièces sont photographiées à l’entrée et à la sortie, comparées par l’IA, puis le séjour est certifié par un PDF scellé. Fini les désaccords sur l’origine des dégradations.',
  },
  {
    q: 'Combien de temps prend l’installation ?',
    a: 'Environ 5 minutes : après le paiement, l’assistant vous demande le nom du logement, ses pièces et vos équipements. Ajoutez ensuite vos photos de référence, pièce par pièce.',
  },
  {
    q: 'Puis-je déléguer les photos de référence à mon équipe ?',
    a: 'Oui. Votre équipe sur place ouvre le lien magique /upload/[token] — valable 7 jours — et photographie chaque pièce à votre place. Vous êtes notifié dès la réception des photos.',
  },
  {
    q: 'Mes photos sont-elles sécurisées ?',
    a: 'Toutes les photos sont chiffrées et horodatées, puis scellées par un hash SHA256 : elles forment une preuve intègre, inviolable, utilisable en cas de litige.',
  },
  {
    q: 'L’application fonctionne-t-elle avec une mauvaise connexion ?',
    a: 'Oui, elle est optimisée pour la 4G comme la 3G. Un mode hors-ligne partiel enregistre les photos et l’envoi reprend automatiquement en arrière-plan dès que le réseau revient.',
  },
  {
    q: 'Comment le ménage est-il vérifié ?',
    a: 'Votre agent reçoit un lien dédié (app cleaner) : il photographie les zones sensibles — les « photos fantômes » — et filme une vidéo walkthrough de 120 secondes maximum. Le tout est horodaté dans votre dashboard.',
  },
  {
    q: 'Comment obtenir le certificat PDF ?',
    a: 'Il est généré automatiquement après le check-in et le check-out, puis scellé (hash SHA256). Vous le téléchargez à tout moment depuis votre dashboard ou via l’email de fin de séjour.',
  },
  {
    q: 'Que se passe-t-il en cas de dégradation ?',
    a: 'Le comparatif automatique entrée / sortie isole la dégradation et vous alerte avec les photos correspondantes. Le dossier de litige, pré-rempli de preuves horodatées, est prêt à être envoyé à Airbnb.',
  },
  {
    q: 'Comment installer l’application sur mon téléphone ?',
    a: 'Depuis votre dashboard, scannez le QR code ou touchez le bouton « Installer l’app ». L’icône RoomScan s’ajoute à votre écran d’accueil, comme une application native.',
  },
  {
    q: 'Comment contacter le support ?',
    a: 'Écrivez-nous à support@roomscan.pro : notre équipe vous répond sous 24 heures ouvrées. Joignez une capture d’écran si possible, cela nous aide à vous répondre plus vite.',
  },
];

// Animation d'entree legere (fade + montee, framer-motion).
const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: 'easeOut' as const },
};

export function FaqContent() {
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
            Questions fréquentes
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-500 dark:text-slate-400">
            Tout ce qu’il faut savoir sur l’Inventaire RoomScan : photos
            sécurisées, connexion, ménage vérifié, certificat et litiges.
          </p>
        </motion.header>

        {/* ---------- Accordion des 10 Q/R ---------- */}
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.05 }}
          className="mt-6 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-[#22305a] dark:bg-[#0d1530]/90 sm:p-4"
        >
          <Accordion type="single" collapsible className="w-full">
            {FAQ_ITEMS.map((item, index) => (
              <AccordionItem
                key={item.q}
                value={`faq-${index + 1}`}
                className="border-gray-200 dark:border-[#1a2749]"
              >
                <AccordionTrigger className="min-h-[44px] gap-3 rounded-xl px-3 py-4 text-left text-[15px] font-semibold text-gray-900 hover:no-underline hover:text-[#1e3a8a] dark:text-slate-100 dark:hover:text-[#60a5fa] sm:px-4 [&>svg]:shrink-0 [&>svg]:text-[#1e3a8a] dark:[&>svg]:text-[#60a5fa]">
                  <span className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-[#1e3a8a] dark:bg-[#2f6fed]/20 dark:text-[#60a5fa]"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 pt-0.5">{item.q}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-4 pt-0 sm:pl-[52px] sm:pr-4">
                  <p className="max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-slate-400">
                    {item.a}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>

        {/* ---------- Carte support ---------- */}
        <motion.a
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.1 }}
          href="mailto:support@roomscan.pro"
          className="mt-6 flex min-h-[64px] items-center gap-3.5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/40 dark:border-[#22305a] dark:bg-[#0d1530]/90 dark:hover:border-[#2f6fed]/40 dark:hover:bg-[#13204a] sm:px-5"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1e3a8a] to-[#2f6fed] text-white shadow-sm"
          >
            <Mail className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-900 dark:text-slate-100">
              Une autre question ?
            </span>
            <span className="block text-sm text-gray-500 dark:text-slate-400">
              Écrivez à{' '}
              <span className="font-mono text-[13px] font-semibold text-[#1e3a8a] dark:text-[#60a5fa]">
                support@roomscan.pro
              </span>{' '}
              — réponse sous 24 h ouvrées.
            </span>
          </span>
        </motion.a>
      </div>
    </div>
  );
}
