// =============================================================
// RouteSkeleton — squelettes de chargement des onglets hôte
// (WP-BACK v4.61 — feedback instantané à la navigation).
//
// Composant SERVEUR (aucun 'use client', aucun JS) : affiché par les
// loading.tsx de /airbnb/* pendant le chargement de la route — des
// blocs gris pulsants (animate-pulse, tokens light/dark) qui
// reproduisent la largeur du contenu du HostShell (main p-4 sm:p-6,
// les pages se contraignent elles-mêmes à max-w-4xl).
// =============================================================

/** Bloc pulsant générique (div server-side, zéro JS). */
function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className}`} aria-hidden="true" />;
}

/**
 * Squelette de page hôte.
 * variants :
 *  - 'page'    : titre + tableau de cartes (dashboard, orders, calendar…)
 *  - 'list'    : titre + onglets pilules + liste de cartes (messages, team…)
 *  - 'form'    : titre + blocs de formulaires empilés (settings, billing…)
 *  - 'cards'   : grille de cartes 2 colonnes (properties, providers…)
 */
export function RouteSkeleton({
  variant = 'page',
  titleWidth = 'w-64',
}: {
  variant?: 'page' | 'list' | 'form' | 'cards';
  titleWidth?: string;
}) {
  return (
    <div className="flex max-w-4xl flex-col gap-6" role="status" aria-label="Chargement de la page…">
      {/* En-tête : titre + sous-titre */}
      <div className="flex flex-col gap-2">
        <Pulse className={`h-9 ${titleWidth} rounded-xl`} />
        <Pulse className="h-4 w-80 max-w-full rounded-lg" />
      </div>

      {variant === 'list' && (
        <>
          {/* Onglets pilules */}
          <Pulse className="h-11 w-full max-w-md rounded-full" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Pulse key={i} className="h-24 w-full" />
            ))}
          </div>
        </>
      )}

      {variant === 'page' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Pulse key={i} className="h-24 w-full" />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Pulse key={i} className="h-32 w-full" />
            ))}
          </div>
        </>
      )}

      {variant === 'form' && (
        <>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2.5">
              <Pulse className="h-4 w-40 rounded-lg" />
              <Pulse className="h-10 w-full rounded-xl" />
            </div>
          ))}
          <Pulse className="h-10 w-40 self-end rounded-full" />
        </>
      )}

      {variant === 'cards' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Pulse key={i} className="h-40 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}
