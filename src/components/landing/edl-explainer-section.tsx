'use client';

// =============================================================
// EDL EXPLAINER (v5.17) — Onglet « États des Lieux » de la page
// d'accueil (ancre #etats-des-lieux, accessible depuis le menu
// header). Demande client : « expliquer la procédure de l'état des
// lieux, à quoi ça sert, ses avantages, etc. »
//
//   1. À quoi ça sert — l'état des lieux = votre preuve.
//   2. La procédure en 5 étapes (le parcours réel du module).
//   3. Les avantages (6 cartes bénéfices concrets).
//   4. CTA → tarifs (#pricing) + achat direct (/edl/abonnement).
//
// Thème clair cohérent (blanc / #F7F7F8, accent bleu logo).
// =============================================================

import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  FileCheck2,
  FileSignature,
  Gavel,
  Hourglass,
  Link2,
  Mail,
  ScanLine,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { Reveal } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';

const PROCEDURE_STEPS = [
  {
    icon: ScanLine,
    title: '1. Préparez votre bien (une seule fois)',
    text: 'Lors de l\u2019onboarding, vous photographiez chaque zone de référence (salon, chambres, cuisine, salle de bain…) et vos équipements. 10 minutes, valables à vie tant que le bien ne change pas.',
  },
  {
    icon: Camera,
    title: '2. Captures photo zone par zone',
    text: 'Le jour de l\u2019état des lieux, l\u2019app vous guide pièce par pièce : chaque zone est comparée automatiquement à la référence — rien ne peut être oublié.',
  },
  {
    icon: Video,
    title: '3. Vidéo walkthrough guidée',
    text: 'Filmez le logement en continu : la voix du guide vous indique quoi montrer et combien de temps il reste. La vidéo est horodatée et scellée par un hash SHA-256.',
  },
  {
    icon: FileSignature,
    title: '4. Signature de l\u2019invité',
    text: 'Le locataire (ou le mandataire) signe sur place, sur votre téléphone — ou à distance via un lien sécurisé, sans créer de compte.',
  },
  {
    icon: FileCheck2,
    title: '5. PDF certifié + emails automatiques',
    text: 'Le rapport complet (identification, photos, vidéo, comparatif entrée/sortie, signatures) est généré en PDF et envoyé automatiquement à l\u2019hôte et au locataire.',
  },
];

const ADVANTAGES = [
  {
    icon: ShieldCheck,
    title: 'Une preuve incontestable',
    text: 'Photos de référence, vidéo horodatée, hash SHA-256 et signatures : vous débarquez dans un litige avec un dossier que rien ne peut contester.',
  },
  {
    icon: Gavel,
    title: 'Litiges & assurances couverts',
    text: 'Le PDF d\u2019état des lieux est un document professionnel reconnu par les assurances et les plateformes — dégradations, mobilier manquant, retenues de garantie.',
  },
  {
    icon: Hourglass,
    title: 'Des heures gagnées par séjour',
    text: 'Fini le Word à remplir et les photos à trier : tout est capté au fil de la visite et le rapport se génère tout seul, prêt à envoyer.',
  },
  {
    icon: Link2,
    title: 'Partage sans compte',
    text: 'Le locataire reçoit un lien sécurisé : il consulte, signe et récupère son PDF sans installer quoi que ce soit ni créer de compte.',
  },
  {
    icon: Mail,
    title: 'Zéro relance',
    text: 'Emails automatiques à chaque étape pour l\u2019hôte ET le locataire : invitation, signature, PDF final. Personne n\u2019est oublié.',
  },
  {
    icon: BadgeCheck,
    title: 'Une image professionnelle',
    text: 'Un état des lieux impeccable et signé renforce la confiance des propriétaires dont vous gérez les biens — et valorise votre conciergerie.',
  },
];

export function EdlExplainer() {
  const { t } = useLandingLang();
  return (
    <section
      id="etats-des-lieux"
      className="relative scroll-mt-24 overflow-hidden bg-white py-24 text-slate-900"
    >
      {/* Halo d'ambiance discret */}
      <div
        aria-hidden="true"
        className="absolute -top-40 left-1/2 h-[420px] w-[760px] max-w-none -translate-x-1/2 rounded-full bg-[#055492]/[0.07] blur-[130px]"
      />

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── En-tête ── */}
        <Reveal className="mb-14 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#04467a]">
            {t('Module États des Lieux')}
          </p>
          <h2 className="display-title font-serif! mb-4 text-4xl font-bold md:text-5xl">
            {t('L\u2019état des lieux,')}{' '}
            <span className="air-gradient-text font-serif italic">{t('sans stress.')}</span>
          </h2>
          <p className="mx-auto max-w-3xl text-lg leading-relaxed text-slate-600">
            {t(
              'L\u2019état des lieux est LE document qui protège votre activité : il constate l\u2019état du logement à l\u2019entrée et à la sortie du locataire. C\u2019est lui qui fait foi en cas de dégradation, de mobilier manquant ou de litige avec l\u2019assurance. RoomScan le transforme en parcours guidé de 5 étapes — sur votre téléphone, avec preuve photo et vidéo.',
            )}
          </p>
        </Reveal>

        {/* ── La procédure en 5 étapes ── */}
        <Reveal className="mb-16">
          <div className="mb-8 text-center">
            <h3 className="font-serif text-2xl font-bold md:text-3xl">
              {t('La procédure en 5 étapes guidées')}
            </h3>
            <p className="mt-2 text-slate-500">
              {t('Entrée comme sortie : le même parcours, guidé à la voix, impossible à rater.')}
            </p>
          </div>
          <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PROCEDURE_STEPS.map((step, i) => (
              <li
                key={step.title}
                className={`air-shadow-lg flex flex-col rounded-3xl border border-slate-200/80 bg-white p-6 ${
                  i === PROCEDURE_STEPS.length - 1 ? 'md:col-span-2 lg:col-span-1' : ''
                }`}
              >
                <span
                  aria-hidden="true"
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#055492]/10 text-[#04467a]"
                >
                  <step.icon className="h-5 w-5" />
                </span>
                <h4 className="mb-2 text-[15px] font-bold text-slate-900">{t(step.title)}</h4>
                <p className="text-sm leading-relaxed text-slate-600">{t(step.text)}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        {/* ── Les avantages ── */}
        <Reveal className="mb-14">
          <div className="mb-8 text-center">
            <h3 className="font-serif text-2xl font-bold md:text-3xl">
              {t('Ce que ça change pour vous')}
            </h3>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ADVANTAGES.map((adv) => (
              <div
                key={adv.title}
                className="rounded-3xl border border-slate-200/80 bg-[#F7F7F8] p-6 transition-shadow duration-300 hover:shadow-[0_12px_32px_rgba(4,70,122,0.10)]"
              >
                <span
                  aria-hidden="true"
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#055492]/10 text-[#04467a]"
                >
                  <adv.icon className="h-5 w-5" />
                </span>
                <h4 className="mb-2 text-[15px] font-bold text-slate-900">{t(adv.title)}</h4>
                <p className="text-sm leading-relaxed text-slate-600">{t(adv.text)}</p>
              </div>
            ))}
          </div>
        </Reveal>

        {/* ── CTA ── */}
        <Reveal className="text-center">
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/edl/abonnement"
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(135deg,#055492,#033a66)] px-8 py-4 font-semibold text-white shadow-[0_8px_24px_rgba(4,70,122,0.30)] transition-all hover:scale-[1.02] hover:shadow-[0_12px_32px_rgba(4,70,122,0.38)] sm:w-auto"
            >
              {t('Découvrir l\u2019offre États des Lieux')}
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <a
              href="#pricing"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector('#pricing')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-8 py-4 font-semibold text-slate-900 transition-all hover:scale-[1.02] hover:border-slate-300 hover:shadow-md sm:w-auto"
            >
              {t('Voir les tarifs')}
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            {t('Dès 299 €/an pour 3 biens — états des lieux illimités, paiement sécurisé PayPal.')}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
