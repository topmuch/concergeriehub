'use client';

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
    <Card className="lux-card">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="lux-eyebrow">Catalogue</p>
            <CardTitle className="lux-display mt-1 text-xl text-white">Packs pré-configurés</CardTitle>
            <CardDescription className="text-sm text-[#8fa0c2]">
              Visualisation et gestion des packs d'inscription
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Info Banner ──────────────────────────────────────── */}
        <div className="flex gap-3 rounded-xl border border-[#5c8af0]/25 bg-[#5c8af0]/[0.08] p-4">
          <span className="lux-dot mt-1.5 shrink-0" style={{ backgroundColor: '#5c8af0' }} aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-[#a9c4ff]">
              Configuration en code
            </p>
            <p className="mt-1 text-sm text-[#8fa0c2]">
              Les packs sont présentés lors de l'inscription. Le client choisit son profil
              et les modules sont installés automatiquement. Les packs sont configurés dans{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-[#a9c4ff]">
                packs-config.ts
              </code>
              .
            </p>
          </div>
        </div>

        {/* ── Stats Bar ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="lux-card relative p-4">
            <span className="lux-dot absolute right-4 top-4 opacity-70" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
            <p className="lux-eyebrow">Packs configurés</p>
            <p className="lux-num mt-2 text-3xl leading-none text-white">{totalPacks}</p>
          </div>
          <div className="lux-card relative p-4">
            <span className="lux-dot absolute right-4 top-4 opacity-70" style={{ backgroundColor: '#5c8af0' }} aria-hidden="true" />
            <p className="lux-eyebrow">Total QR codes</p>
            <p className="lux-num mt-2 text-3xl leading-none text-white">{totalModules}</p>
          </div>
          <div className="lux-card relative p-4">
            <span className="lux-dot absolute right-4 top-4 opacity-70" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
            <p className="lux-eyebrow">Modules couverts</p>
            <p className="lux-num mt-2 text-3xl leading-none text-white">{uniqueModules}</p>
          </div>
        </div>

        {/* ── Pack Cards Grid ──────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {PACKS.map((pack) => {
            return (
              <Card
                key={pack.id}
                className="lux-card lux-card-hover overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/8 bg-white/[0.03] px-5 py-3">
                  <span className="lux-display text-base text-white">{pack.name}</span>
                  <Badge
                    variant="secondary"
                    className="border border-[#e9c47c]/30 bg-[#e9c47c]/10 text-xs text-[#e9c47c]"
                  >
                    {pack.badge}
                  </Badge>
                </div>

                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-medium leading-snug text-[#c7d3ec]">
                    {pack.description}
                  </CardTitle>
                  <CardDescription className="text-xs text-[#8fa0c2]">
                    {pack.targetAudience}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 pb-5">
                  {/* Module Count */}
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-white/12 bg-white/[0.03] text-xs text-[#8fa0c2]">
                      {pack.qrCodes.length} QR code{pack.qrCodes.length > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" className="border-white/12 bg-white/[0.03] text-xs text-[#8fa0c2]">
                      {new Set(pack.qrCodes.map((q) => q.moduleType)).size} module{new Set(pack.qrCodes.map((q) => q.moduleType)).size > 1 ? 's' : ''}
                    </Badge>
                  </div>

                  {/* Modules List */}
                  <div className="lux-scroll max-h-48 overflow-y-auto rounded-xl border border-white/10">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-[#0d1530]">
                        <tr>
                          <th className="lux-eyebrow !text-[9.5px] px-3 py-2 text-left">
                            Module
                          </th>
                          <th className="lux-eyebrow !text-[9.5px] hidden sm:table-cell px-3 py-2 text-left">
                            Pièce
                          </th>
                          <th className="lux-eyebrow !text-[9.5px] px-3 py-2 text-left">
                            Nom
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/8">
                        {pack.qrCodes.map((qr, idx) => (
                          <tr key={idx} className="hover:bg-white/[0.04]">
                            <td className="px-3 py-2">
                              <Badge variant="secondary" className="border border-[#5c8af0]/25 bg-[#5c8af0]/10 text-xs text-[#a9c4ff]">
                                {moduleLabel(qr.moduleType)}
                              </Badge>
                            </td>
                            <td className="hidden sm:table-cell px-3 py-2 text-[#8fa0c2]">
                              {qr.roomName}
                            </td>
                            <td className="px-3 py-2 font-medium text-white">
                              {qr.name}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Features */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <ul className="space-y-1.5">
                      {pack.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-sm text-[#c7d3ec]"
                        >
                          <span aria-hidden="true" className="mt-0.5 shrink-0 text-[#86e9cb]">✓</span>
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
        <div className="lux-empty rounded-xl p-4 text-center text-sm text-[#8fa0c2]">
          <p>
            Fonctionnalité à venir : activation/désactivation des packs et personnalisation
            des modules par pack directement depuis cette interface.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
