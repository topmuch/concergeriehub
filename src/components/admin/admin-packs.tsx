'use client';

import {
  Home,
  Users,
  Briefcase,
  ShieldCheck,
  TrendingUp,
  Package,
  Info,
  Check,
  Layers,
  BoxesIcon,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PACKS, type PackDefinition } from '@/lib/packs-config';
import { QR_MODULE_LABELS } from '@/types/database';

// ── Icon mapping ──────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  Home,
  Users,
  Briefcase,
  ShieldCheck,
  TrendingUp,
};

// ── Helpers ────────────────────────────────────────────────────
/** Count unique module types across all packs */
function countUniqueModules(packs: PackDefinition[]): number {
  const moduleTypes = new Set<string>();
  for (const pack of packs) {
    for (const qr of pack.qrCodes) {
      moduleTypes.add(qr.moduleType);
    }
  }
  return moduleTypes.size;
}

/** Get the French label for a module type, fallback to the key */
function moduleLabel(type: string): string {
  return (QR_MODULE_LABELS as Record<string, string>)[type] || type;
}

// ── Component ──────────────────────────────────────────────────
export function AdminPacks() {
  const totalPacks = PACKS.length;
  const totalModules = PACKS.reduce((sum, p) => sum + p.qrCodes.length, 0);
  const uniqueModules = countUniqueModules(PACKS);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Packs pré-configurés</CardTitle>
            <CardDescription>
              Visualisation et gestion des packs d'inscription
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Info Banner ──────────────────────────────────────── */}
        <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
              Configuration en code
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300/80">
              Les packs sont présentés lors de l'inscription. Le client choisit son profil
              et les modules sont installés automatiquement. Les packs sont configurés dans{' '}
              <code className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-mono dark:bg-blue-900/50">
                packs-config.ts
              </code>
              .
            </p>
          </div>
        </div>

        {/* ── Stats Bar ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
              <BoxesIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalPacks}</p>
              <p className="text-xs text-muted-foreground">Packs configurés</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalModules}</p>
              <p className="text-xs text-muted-foreground">Total QR codes</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Layers className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{uniqueModules}</p>
              <p className="text-xs text-muted-foreground">Modules couverts</p>
            </div>
          </div>
        </div>

        {/* ── Pack Cards Grid ──────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {PACKS.map((pack) => {
            const IconComponent = ICON_MAP[pack.icon] || Package;

            return (
              <Card
                key={pack.id}
                className="overflow-hidden transition-shadow hover:shadow-lg"
              >
                {/* Gradient Header */}
                <div className={`bg-gradient-to-r ${pack.color} px-5 py-3`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconComponent className="h-5 w-5 text-white" />
                      <span className="text-sm font-semibold text-white">{pack.name}</span>
                    </div>
                    <Badge
                      variant="secondary"
                      className="border-0 bg-white/20 text-xs text-white backdrop-blur-sm"
                    >
                      {pack.badge}
                    </Badge>
                  </div>
                </div>

                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm leading-snug text-foreground">
                    {pack.description}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    {pack.targetAudience}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 pb-5">
                  {/* Module Count */}
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      <Package className="mr-1 h-3 w-3" />
                      {pack.qrCodes.length} QR code{pack.qrCodes.length > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Layers className="mr-1 h-3 w-3" />
                      {new Set(pack.qrCodes.map((q) => q.moduleType)).size} module{new Set(pack.qrCodes.map((q) => q.moduleType)).size > 1 ? 's' : ''}
                    </Badge>
                  </div>

                  {/* Modules List */}
                  <div className="max-h-48 overflow-y-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                            Module
                          </th>
                          <th className="hidden sm:table-cell px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                            Pièce
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                            Nom
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {pack.qrCodes.map((qr, idx) => (
                          <tr key={idx} className="hover:bg-muted/30">
                            <td className="px-3 py-2">
                              <Badge variant="secondary" className="text-xs">
                                {moduleLabel(qr.moduleType)}
                              </Badge>
                            </td>
                            <td className="hidden sm:table-cell px-3 py-2 text-muted-foreground">
                              {qr.roomName}
                            </td>
                            <td className="px-3 py-2 font-medium">
                              {qr.name}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Features */}
                  <div className="rounded-lg bg-slate-900 p-3">
                    <ul className="space-y-1.5">
                      {pack.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-sm text-white/80"
                        >
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Future Note ──────────────────────────────────────── */}
        <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <p>
            Fonctionnalité à venir : activation/désactivation des packs et personnalisation
            des modules par pack directement depuis cette interface.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
