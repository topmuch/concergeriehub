'use client';

import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  QrCode, Download, Sparkles, Palette, Layout, ImageIcon,
  Loader2, Check, Package, Home, Wifi,
  List, Bell, ShieldCheck, Eye, Copy,
} from 'lucide-react';
import { generateUniqueCodes } from '@/lib/activation-code';
import { generatePdf, type QrCodeForPdf } from '@/lib/pdf-export';
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

const LOGO_ICON_MAP: Record<string, React.ReactNode> = {
  none: <Package className="h-5 w-5" />,
  wifi: <Wifi className="h-5 w-5" />,
  home: <Home className="h-5 w-5" />,
  list: <List className="h-5 w-5" />,
  bell: <Bell className="h-5 w-5" />,
  shield: <ShieldCheck className="h-5 w-5" />,
};

const APP_URL = 'https://qrdomotik.roomscan.pro';

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
      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 flex-wrap">
        {PALETTE_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`h-7 w-7 rounded-lg border-2 transition-all hover:scale-110 ${
              value.toUpperCase() === c.toUpperCase()
                ? 'border-foreground ring-2 ring-foreground/20 scale-110'
                : 'border-transparent'
            }`}
            style={{ backgroundColor: c, boxShadow: c === '#FFFFFF' ? 'inset 0 0 0 1px rgba(0,0,0,0.1)' : undefined }}
          />
        ))}
        <div className="relative ml-1">
          <Input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-7 p-0 cursor-pointer border-0"
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
      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              value === o.value
                ? 'bg-foreground text-background shadow-sm'
                : 'bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground'
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Check className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">Plaque QR Hub générée</p>
            <p className="text-xs text-muted-foreground">Téléchargez en PDF ou individuellement</p>
          </div>
        </div>
        <Button onClick={handleDownloadAllPdf} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Download className="h-4 w-4" />
          Télécharger PDF
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[480px] overflow-y-auto pr-1">
        {codes.map((code) => (
          <div
            key={code}
            className="group relative flex flex-col items-center gap-2 rounded-2xl border bg-white p-3 shadow-sm hover:shadow-lg transition-all duration-200"
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
            <span className="font-mono text-[10px] font-bold text-center break-all leading-tight text-gray-700">
              {code}
            </span>
            <div className="flex gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleCopyCode(code)}
                className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-200 transition-colors"
              >
                <Copy className="h-2.5 w-2.5" /> Copier
              </button>
              <button
                onClick={() => handleDownloadSingle(code)}
                className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-200 transition-colors"
              >
                <Download className="h-2.5 w-2.5" /> PNG
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
    <Card className="border-2 border-dashed border-muted-foreground/20 bg-gradient-to-b from-muted/30 to-muted/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4" />
          Aperçu en direct
        </CardTitle>
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
        <div className="w-full space-y-1.5 text-xs text-muted-foreground">
          <div className="flex justify-between"><span>Points</span><span className="font-mono font-medium text-foreground">{design.dotsType}</span></div>
          <div className="flex justify-between"><span>Coins</span><span className="font-mono font-medium text-foreground">{design.cornersSquareType}</span></div>
          <div className="flex justify-between"><span>Correction</span><span className="font-mono font-medium text-foreground">{design.errorCorrectionLevel}</span></div>
          <div className="flex justify-between"><span>Logo</span><span className="font-mono font-medium text-foreground">{design.logoPreset || 'Aucun'}</span></div>
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
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/25">
          <QrCode className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Générer une plaque QR Hub</h2>
          <p className="text-sm text-muted-foreground">Personnalisez le design de votre plaque</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ===== LEFT COLUMN (8 cols) ===== */}
        <div className="lg:col-span-8 space-y-6">

          {/* ---- Configuration ---- */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="bg-gradient-to-r from-muted/50 to-transparent border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layout className="h-4 w-4 text-blue-500" />
                Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Référence (optionnel)</Label>
                <Input
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="Ex: Commande #1234"
                  className="h-11"
                />
              </div>
            </CardContent>
          </Card>

          {/* ---- Design ---- */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="bg-gradient-to-r from-muted/50 to-transparent border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Palette className="h-4 w-4 text-violet-500" />
                Style & Design
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Tabs defaultValue="style">
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="style" className="flex-1 gap-1.5">
                    <Palette className="h-3.5 w-3.5" /> Couleurs & Style
                  </TabsTrigger>
                  <TabsTrigger value="logo" className="flex-1 gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" /> Logo central
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="style" className="space-y-5 mt-0">
                  <ColorPicker label="Couleur des points" value={design.dotsColor} onChange={(v) => updateDesign('dotsColor', v)} />
                  <ColorPicker label="Couleur de fond" value={design.backgroundColor} onChange={(v) => updateDesign('backgroundColor', v)} />
                  <Separator />
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
                            ? 'border-foreground bg-muted shadow-sm'
                            : 'border-transparent hover:border-muted-foreground/30 hover:bg-muted/50'
                        }`}
                      >
                        <div className={`h-10 w-10 flex items-center justify-center rounded-lg ${
                          design.logoPreset === preset.value ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {LOGO_ICON_MAP[preset.icon]}
                        </div>
                        <span className="text-[10px] font-medium">{preset.label}</span>
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
            className="w-full h-14 text-base font-bold gap-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-600/25 transition-all hover:shadow-xl"
          >
            {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            {generating ? 'Génération en cours...' : 'Générer la plaque QR'}
          </Button>

          {/* ---- Generated Grid ---- */}
          {codes.length > 0 && (
            <Card ref={previewRef} className="border-0 shadow-sm">
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
