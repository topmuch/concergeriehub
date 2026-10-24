import type { Metadata } from 'next';
import { SiteChrome, PageHero } from '@/components/landing/site-chrome';

// FIX-CSP-PROD : rendu dynamique exigé par la CSP à nonce (même logique
// que la landing — page pré-rendue = scripts sans nonce = page blanche).
export const dynamic = 'force-dynamic';

const TITLE = 'Mentions légales, CGU & Confidentialité — RoomScan';
const DESCRIPTION =
  'Mentions légales, conditions générales d’utilisation et politique de confidentialité de RoomScan (roomscan.pro).';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/legal' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: '/legal',
    title: TITLE,
    description: DESCRIPTION,
  },
};

const SECTIONS = [
  { id: 'mentions', label: 'Mentions légales' },
  { id: 'cgu', label: 'CGU' },
  { id: 'confidentialite', label: 'Confidentialité' },
];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 pt-2 text-2xl font-bold text-slate-900">
      {children}
    </h2>
  );
}

function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={`leading-relaxed text-slate-600 ${className ?? ''}`}>{children}</p>;
}

// v5.22 — la page légale (Mentions légales / CGU / Confidentialité) rejoint
// le socle commun du site multipages : SiteChrome = navbar avec le logo
// officiel + menu complet (desktop & mobile) + sélecteur de langue, et le
// VRAI footer (5 colonnes) au lieu du mini header/footers locaux.
// Les ancres #mentions / #cgu / #confidentialite (liées depuis le footer)
// et le rendu dynamique CSP sont conservés.
export default function LegalPage() {
  return (
    <SiteChrome>
      <PageHero
        eyebrow="Légal"
        title="Informations"
        highlight="légales."
        description="Mentions légales, conditions d’utilisation et protection des données — RoomScan, accessible sur roomscan.pro."
      />

      <section className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-6">
        <nav aria-label="Sommaire" className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-[#055492] hover:text-[#04467a]"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="mt-10 space-y-10">
          {/* ── Mentions légales ─────────────────────────────── */}
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
            <H2 id="mentions">1. Mentions légales</H2>
            <P>
              <strong>Éditeur :</strong> RoomScan — plateforme SaaS de conciergerie digitale
              pour hôtes de locations courte durée, éditée et hébergée sur le domaine roomscan.pro.
            </P>
            <P>
              <strong>Contact :</strong>{' '}
              <a className="font-semibold text-[#04467a] hover:underline" href="mailto:contact@roomscan.pro">
                contact@roomscan.pro
              </a>{' '}
              — réponse sous 24 h, 7j/7.
            </P>
            <P>
              <strong>Directeur de la publication :</strong> l‘éditeur de la plateforme.
              <br />
              <strong>Hébergement :</strong> infrastructure cloud sécurisée (Union européenne).
            </P>
            <P className="text-sm text-slate-500">
              Note : les informations d‘immatriculation (SIREN, RCS, capital social) sont à compléter
              par l‘exploitant avant mise en production commerciale.
            </P>
          </section>

          {/* ── CGU ──────────────────────────────────────────── */}
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
            <H2 id="cgu">2. Conditions générales d‘utilisation</H2>
            <P>
              <strong>2.1 Objet.</strong> RoomScan permet aux hôtes de créer un hub digital
              accessible par plaque QR (Wi-Fi, guide d’arrivée, check-out, prestataires, upselling) et
              à leurs invités de consulter ces informations, sans installation d‘application.
            </P>
            <P>
              <strong>2.2 Comptes.</strong> L‘hôte garantit l‘exactitude des informations fournies à
              l‘inscription et garde ses identifiants secrets. L‘invité accède au hub via la plaque QR
              ou le lien partagé par l‘hôte, sans compte requis.
            </P>
            <P>
              <strong>2.3 Responsabilités.</strong> L‘hôte est seul responsable du contenu publié dans
              son hub (informations pratiques, photos, prix de services). La plateforme fournit un
              service technique « en continu » (best efforts) et ne garantit pas la disponibilité des
              services tiers référencés (prestataires, billetteries, cartographie).
            </P>
            <P>
              <strong>2.4 Abonnements.</strong> Les plans payants (Solo, Pro) sont sans engagement de
              durée et résiliables à tout moment ; l‘accès reste actif jusqu‘à la fin de la période
              réglée.
            </P>
            <P>
              <strong>2.5 Usage acceptable.</strong> Sont interdits : contenus illicites ou diffamatoires,
              contournement des mesures de sécurité, collecte automatisée de données, usage pour
              porter atteinte aux invités ou aux tiers.
            </P>
          </section>

          {/* ── Confidentialité ──────────────────────────────── */}
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
            <H2 id="confidentialite">3. Politique de confidentialité (RGPD)</H2>
            <P>
              <strong>3.1 Données collectées.</strong> Comptes hôtes (nom, e-mail, mot de passe haché),
              biens et contenus de hub, commandes de services et paiements (traités par PayPal — aucune
              carte bancaire n‘est stockée sur nos serveurs), mesures techniques anonymisées
              (journalisation, détection d‘erreurs).
            </P>
            <P>
              <strong>3.2 Finalités.</strong> Fournir le service, facturer les abonnements, assister les
              utilisateurs (support, tickets), améliorer la fiabilité. Pas de revente de données, pas de
              publicité ciblée.
            </P>
            <P>
              <strong>3.3 Durées de conservation.</strong> Données de compte : pendant la durée de
              l‘abonnement puis 12 mois ; factures : 10 ans (obligation légale) ; journaux techniques :
              12 mois maximum.
            </P>
            <P>
              <strong>3.4 Vos droits.</strong> Accès, rectification, effacement, portabilité,
              opposition et limitation — par simple demande à{' '}
              <a className="font-semibold text-[#04467a] hover:underline" href="mailto:contact@roomscan.pro">
                contact@roomscan.pro
              </a>
              , traitée sous 30 jours. Vous pouvez aussi saisir la CNIL (cnil.fr).
            </P>
            <P>
              <strong>3.5 Cookies.</strong> Un cookie de session strictement nécessaire (authentification)
              est utilisé. Aucun cookie publicitaire ni traceur tiers.
            </P>
          </section>
        </div>

        <p className="mt-10 text-center text-sm text-slate-500">
          Dernière mise à jour : octobre 2026 — contact@roomscan.pro
        </p>
      </section>
    </SiteChrome>
  );
}
