'use client';

import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { generateUniqueCodes } from '@/lib/activation-code';
import { generatePdf, type QrCodeForPdf } from '@/lib/pdf-export';
import {
  // FIX-11 — matériau réel de la plaque (aluminium défaut | bois | acrylique),
  // persisté dans designConfig JSON (aucune migration).
  DEFAULT_PLAQUE_MATERIAL,
  PLAQUE_MATERIALS,
  PLAQUE_MATERIAL_META,
  normalizePlaqueMaterial,
  type PlaqueMaterial,
} from '@/lib/plaque-material';
import { QRCodeSVG } from 'qrcode.react';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface DesignConfig {
  dotsColor: string;
  backgroundColor: string;
  dotsType: string;
  cornersSquareType: string;
  cornersDotType: string;
  errorCorrectionLevel: string;
  logoPreset: string;
  material: PlaqueMaterial; // FIX-11 — matériau de la plaque physique
}

const DOT_TYPES = [
  { value: 'rounded', label: 'Arrondi' },
  { value: 'dots', label: 'Points' },
  { value: 'classy', label: 'Classique' },
  { value: 'classy-rounded', label: 'Classique arrondi' },
  { value: 'square', label: 'Carré' },
  { value: 'extra-rounded', label: 'Extra arrondi' },
];

const CORNER_SQUARE_TYPES = [
  { value: 'square', label: 'Carré' },
  { value: 'extra-rounded', label: 'Extra arrondi' },
];

const CORNER_DOT_TYPES = [
  { value: 'square', label: 'Carré' },
  { value: 'dot', label: 'Rond' },
];

const ERROR_LEVELS = [
  { value: 'L', label: 'L (7%)' },
  { value: 'M', label: 'M (15%)' },
  { value: 'Q', label: 'Q (25%)' },
  { value: 'H', label: 'H (30%)' },
];

const LOGO_PRESETS = [
  { value: '', label: 'Aucun', icon: 'none' },
  { value: 'wifi', label: 'Wi-Fi', icon: 'wifi' },
  { value: 'home', label: 'Maison', icon: 'home' },
  { value: 'list', label: 'Liste', icon: 'list' },
  { value: 'bell', label: 'Portier', icon: 'bell' },
  { value: 'shield', label: 'Urgence', icon: 'shield' },
];

const DEFAULT_DESIGN: DesignConfig = {
  dotsColor: '#10B981',
  backgroundColor: '#FFFFFF',
  dotsType: 'rounded',
  cornersSquareType: 'extra-rounded',
  cornersDotType: 'dot',
  errorCorrectionLevel: 'M',
  logoPreset: '',
  material: DEFAULT_PLAQUE_MATERIAL,
};

/* ================================================================== */
/*  SVG → PNG utility                                                  */
/* ================================================================== */

function svgElementToPngDataUrl(svgEl: SVGSVGElement, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No 2d context')); return; }
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('SVG image load failed'));
    img.src = svgUrl;
  });
}

/* ================================================================== */
/*  SVG Logo presets                                                   */
/* ================================================================== */

function getPresetLogoDataUrl(preset: string): string {
  const svgs: Record<string, string> = {
    wifi: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/></svg>`,
    home: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    list: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    bell: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    shield: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  };
  if (!svgs[preset]) return '';
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgs[preset])))})}`;
}

// FIX-DOMAINE : l'ancien domaine était hardcodé (qrdomotik.roomscan.pro) → les
// QR générés pointaient vers l'ancien projet (page d'erreur + « ancienne accueil »).
// On utilise le domaine courant à l'exécution : correct quel que soit le déploiement.
const APP_URL = typeof window !== 'undefined'
  ? window.location.origin
  : (process.env.NEXT_PUBLIC_APP_URL || '');

/* ================================================================== */
/*  Color picker component                                             */
/* ================================================================== */

const PALETTE_COLORS = [
  '#10B981', '#059669', '#14B8A6', '#06B6D4',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7',
  '#EC4899', '#F43F5E', '#EF4444', '#F97316',
  '#EAB308', '#84CC16', '#1E293B', '#111827',
  '#FFFFFF', '#F8FAFC', '#F1F5F9', '#E2E8F0',
];

function ColorPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="space-y-2">
      <Label className="lux-eyebrow !text-[10px]">{label}</Label>
      <div className="flex items-center gap-2 flex-wrap">
        {PALETTE_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`h-7 w-7 rounded-lg border-2 transition-all hover:scale-110 ${
              value.toUpperCase() === c.toUpperCase()
                ? 'border-white/80 ring-2 ring-white/25 scale-110'
                : 'border-white/10'
            }`}
            style={{ backgroundColor: c, boxShadow: c === '#FFFFFF' ? 'inset 0 0 0 1px rgba(255,255,255,0.2)' : undefined }}
          />
        ))}
        <div className="relative ml-1">
          <Input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-7 p-0 cursor-pointer border-0 bg-transparent"
          />
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Style option selector                                              */
/* ================================================================== */

function StyleSelector({
  options, value, onChange, label,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="lux-eyebrow !text-[10px]">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              value === o.value
                ? 'bg-[#e9c47c] text-[#1a1206] shadow-sm'
                : 'bg-white/[0.05] text-[#8fa0c2] hover:bg-white/10 hover:text-white'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Generated QR grid                                                  */
/* ================================================================== */

function GeneratedQrGrid({
  codes, design, qrLevel,
}: {
  codes: string[];
  design: DesignConfig;
  qrLevel: 'L' | 'M' | 'Q' | 'H';
}) {
  const handleDownloadSingle = async (code: string) => {
    const svgEl = document.querySelector(`#generated-qr-${code} svg`) as SVGSVGElement | null;
    if (!svgEl) return;
    try {
      const pngUrl = await svgElementToPngDataUrl(svgEl, 400);
      const a = document.createElement('a');
      a.download = `${code}.png`;
      a.href = pngUrl;
      a.click();
    } catch { toast.error('Erreur de téléchargement'); }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Code ${code} copié !`);
  };

  const handleDownloadAllPdf = async () => {
    const items: QrCodeForPdf[] = [];
    for (const code of codes) {
      const svgEl = document.querySelector(`#generated-qr-${code} svg`) as SVGSVGElement | null;
      if (svgEl) {
        try {
          const pngUrl = await svgElementToPngDataUrl(svgEl, 300);
          items.push({ code, imageUrl: pngUrl });
        } catch { /* skip */ }
      }
    }
    if (items.length === 0) { toast.error('Aucun QR exportable'); return; }
    generatePdf({ qrCodes: items, batchName: 'Plaque QR Hub' });
    toast.success('PDF téléchargé !');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="lux-dot shrink-0" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-white">Plaque QR Hub générée</p>
            <p className="text-xs text-[#8fa0c2]">Téléchargez en PDF ou individuellement</p>
          </div>
        </div>
        <Button onClick={handleDownloadAllPdf} className="lux-btn h-9 rounded-full px-4 text-xs">
          Télécharger PDF
        </Button>
      </div>

      <div className="lux-scroll grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[480px] overflow-y-auto pr-1">
        {codes.map((code) => (
          <div
            key={code}
            className="group relative flex flex-col items-center gap-2 rounded-2xl border border-white/10 p-3 shadow-sm transition-all duration-200 hover:border-white/20"
            style={{ backgroundColor: design.backgroundColor }}
          >
            <div id={`generated-qr-${code}`}>
              <QRCodeSVG
                value={`${APP_URL}/activate/${code}`}
                size={120}
                bgColor={design.backgroundColor}
                fgColor={design.dotsColor}
                level={qrLevel}
              />
            </div>
            <span className="font-mono text-[10px] font-bold text-center break-all leading-tight text-black/70">
              {code}
            </span>
            <div className="flex gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleCopyCode(code)}
                className="rounded-md bg-black/5 px-2 py-1 text-[10px] font-medium text-black/60 hover:bg-black/10 transition-colors"
              >
                Copier
              </button>
              <button
                onClick={() => handleDownloadSingle(code)}
                className="rounded-md bg-black/5 px-2 py-1 text-[10px] font-medium text-black/60 hover:bg-black/10 transition-colors"
              >
                PNG
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Live Preview (sticky sidebar)                                       */
/* ================================================================== */

function LivePreview({ design, qrLevel }: { design: DesignConfig; qrLevel: 'L' | 'M' | 'Q' | 'H' }) {
  return (
    <Card className="lux-card rounded-2xl border-dashed border-white/15 bg-white/[0.02]">
      <CardHeader className="pb-3">
        <CardTitle className="lux-eyebrow !text-[10px]">Aperçu en direct</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div
          className="rounded-2xl p-4 shadow-inner transition-all duration-300"
          style={{ backgroundColor: design.backgroundColor }}
        >
          <QRCodeSVG
            value={`${APP_URL}/activate/QR-XXXXXXXX`}
            size={180}
            bgColor={design.backgroundColor}
            fgColor={design.dotsColor}
            level={qrLevel}
          />
        </div>
        <div className="w-full space-y-1.5 text-xs text-[#8fa0c2]">
          <div className="flex justify-between"><span>Matériau</span><span className="font-medium text-white">{PLAQUE_MATERIAL_META[design.material].label}</span></div>
          <div className="flex justify-between"><span>Points</span><span className="font-mono font-medium text-white">{design.dotsType}</span></div>
          <div className="flex justify-between"><span>Coins</span><span className="font-mono font-medium text-white">{design.cornersSquareType}</span></div>
          <div className="flex justify-between"><span>Correction</span><span className="font-mono font-medium text-white">{design.errorCorrectionLevel}</span></div>
          <div className="flex justify-between"><span>Logo</span><span className="font-mono font-medium text-white">{design.logoPreset || 'Aucun'}</span></div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  Main component                                                     */
/* ================================================================== */

export function GenerateBatch() {
  const [batchName, setBatchName] = useState('');
  const [design, setDesign] = useState<DesignConfig>({ ...DEFAULT_DESIGN });
  const [generating, setGenerating] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);

  const qrLevel = (design.errorCorrectionLevel || 'M').toUpperCase() as 'L' | 'M' | 'Q' | 'H';

  const updateDesign = useCallback(<K extends keyof DesignConfig>(key: K, value: DesignConfig[K]) => {
    setDesign((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const activationCodes = generateUniqueCodes(1);
      const res = await fetch('/api/admin/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: 1,
          designConfig: JSON.stringify(design),
          batchName: batchName || undefined,
          activationCodes,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur serveur');
      }
      const data = await res.json();
      const returnedCodes = data.physicalQrCodes?.map((c: { activationCode: string }) => c.activationCode) || activationCodes;
      setCodes(returnedCodes);
      toast.success('Plaque QR Hub générée avec succès !');
      setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  /* ---- Render ---- */
  return (
    <div className="space-y-6">
      {/* Page title */}
      <div className="flex flex-col gap-1">
        <h2 className="lux-display text-2xl font-semibold text-white">Générer une plaque QR Hub</h2>
        <p className="text-sm text-[#8fa0c2]">Personnalisez le design de votre plaque</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ===== LEFT COLUMN (8 cols) ===== */}
        <div className="lg:col-span-8 space-y-6">

          {/* ---- Configuration ---- */}
          <Card className="lux-card">
            <CardHeader className="border-b border-white/8">
              <CardTitle className="lux-display text-lg text-white">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <Label className="lux-eyebrow !text-[10px]">Référence (optionnel)</Label>
                <Input
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="Ex: Commande #1234"
                  className="h-11 rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                />
              </div>

              {/* FIX-11 — choix du matériau réel de la plaque (persisté
                  dans designConfig JSON : QrBatch + PhysicalQrCode) */}
              <div className="space-y-2">
                <Label className="lux-eyebrow !text-[10px]">
                  Matériau de la plaque
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PLAQUE_MATERIALS.map((m) => {
                    const active = design.material === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => updateDesign('material', normalizePlaqueMaterial(m.value))}
                        aria-pressed={active}
                        className={`text-left rounded-xl border-2 p-3 transition-all ${
                          active
                            ? 'border-[#5c8af0]/60 bg-[#5c8af0]/10 shadow-sm'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                        }`}
                      >
                        <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-[#c7d3ec]'}`}>
                          {m.label}
                        </p>
                        <p className="text-[11px] text-[#8fa0c2] mt-0.5 leading-snug">{m.hint}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#8fa0c2]">
                  Le matériau est enregistré avec le design du lot (aluminium par défaut).
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ---- Design ---- */}
          <Card className="lux-card">
            <CardHeader className="border-b border-white/8">
              <CardTitle className="lux-display text-lg text-white">Style &amp; Design</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Tabs defaultValue="style">
                <TabsList className="mb-4 w-full rounded-full border border-white/10 bg-white/[0.04] p-1">
                  <TabsTrigger value="style" className="flex-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fa0c2] transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white">
                    Couleurs &amp; Style
                  </TabsTrigger>
                  <TabsTrigger value="logo" className="flex-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fa0c2] transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white">
                    Logo central
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="style" className="space-y-5 mt-0">
                  <ColorPicker label="Couleur des points" value={design.dotsColor} onChange={(v) => updateDesign('dotsColor', v)} />
                  <ColorPicker label="Couleur de fond" value={design.backgroundColor} onChange={(v) => updateDesign('backgroundColor', v)} />
                  <Separator className="bg-white/10" />
                  <StyleSelector label="Style des points" options={DOT_TYPES} value={design.dotsType} onChange={(v) => updateDesign('dotsType', v)} />
                  <StyleSelector label="Coins extérieurs" options={CORNER_SQUARE_TYPES} value={design.cornersSquareType} onChange={(v) => updateDesign('cornersSquareType', v)} />
                  <StyleSelector label="Coins intérieurs" options={CORNER_DOT_TYPES} value={design.cornersDotType} onChange={(v) => updateDesign('cornersDotType', v)} />
                  <StyleSelector label="Correction d'erreur" options={ERROR_LEVELS} value={design.errorCorrectionLevel} onChange={(v) => updateDesign('errorCorrectionLevel', v)} />
                </TabsContent>

                <TabsContent value="logo" className="mt-0">
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {LOGO_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => updateDesign('logoPreset', preset.value)}
                        className={`flex flex-col items-center gap-2 rounded-xl p-3 border-2 transition-all ${
                          design.logoPreset === preset.value
                            ? 'border-[#e9c47c]/50 bg-[#e9c47c]/10'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className={`text-[10px] font-medium ${design.logoPreset === preset.value ? 'text-[#e9c47c]' : 'text-[#8fa0c2]'}`}>
                          {preset.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* ---- Generate Button ---- */}
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="lux-btn h-14 w-full rounded-full text-base font-semibold"
          >
            {generating ? 'Génération en cours...' : 'Générer la plaque QR'}
          </Button>

          {/* ---- Generated Grid ---- */}
          {codes.length > 0 && (
            <Card ref={previewRef} className="lux-card">
              <CardContent className="pt-6">
                <GeneratedQrGrid codes={codes} design={design} qrLevel={qrLevel} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* ===== RIGHT COLUMN (4 cols) — Sticky Preview ===== */}
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-4">
            <LivePreview design={design} qrLevel={qrLevel} />
          </div>
        </div>
      </div>
    </div>
  );
}
