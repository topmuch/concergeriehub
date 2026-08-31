'use client';

import type { GuestPayload } from './types';

// =============================================================
// ÉTAPE 16 (V3) — Onglet 📖 Guide
// Guidebook complet (contenu inline → mis en cache par le SW →
// lisible HORS-LIGNE) + règles de la maison si QR dédié.
// =============================================================

export function TabGuide({ guidebook, houseRules }: {
  guidebook: GuestPayload['guest']['guidebook'];
  houseRules: string[] | null;
}) {
  if (!guidebook || !guidebook.body.trim()) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-sm p-8 text-center" role="status">
        <span className="text-5xl select-none" aria-hidden="true">📖</span>
        <h2 className="mt-4 text-lg font-bold text-card-foreground">Guide en préparation</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Votre hôte prépare son guide de bienvenue&nbsp;: accès, équipements, bonnes adresses… Revenez très vite&nbsp;!
        </p>
      </div>
    );
  }

  const blocks = guidebook.body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return (
    <div className="space-y-4">
      <section className="bg-card border border-border rounded-2xl shadow-sm p-5" aria-label="Guide de bienvenue">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-bold text-card-foreground leading-snug">{guidebook.title}</h1>
          <span
            className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-accent/10 text-accent border border-accent/30"
            title="Consultable même sans réseau"
          >
            📴 Hors-ligne
          </span>
        </div>
        <div className="mt-4 space-y-3.5">
          {blocks.map((block, i) => (
            <GuideBlock key={i} block={block} />
          ))}
        </div>
      </section>

      {houseRules && houseRules.length > 0 && (
        <section className="bg-card border border-border rounded-2xl shadow-sm p-5" aria-label="Règles de la maison">
          <h2 className="text-base font-bold text-card-foreground">🛡️ Règles de la maison</h2>
          <ul className="mt-3 space-y-2">
            {houseRules.map((rule, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-card-foreground leading-relaxed">
                <span className="mt-0.5 select-none shrink-0" aria-hidden="true">✅</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Merci de les respecter — les voisins (et votre hôte) vous disent merci&nbsp;🙏
          </p>
        </section>
      )}
    </div>
  );
}

/** Heuristique de rendu : une ligne courte (≤ 48 caractères, sans
    ponctuation finale) est traitée comme un intertitre de section
    (ex: "🔑 Accès"), le reste comme un paragraphe. */
function GuideBlock({ block }: { block: string }) {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const first = lines[0];
  const isHeading =
    lines.length === 1 && first.length <= 48 && !/[.!?;]$/.test(first);

  if (isHeading) {
    return <h2 className="text-base font-bold text-card-foreground pt-1">{first}</h2>;
  }

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-card-foreground/90 leading-relaxed whitespace-pre-line">
          {line}
        </p>
      ))}
    </div>
  );
}
