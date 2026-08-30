'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { QrCode, CheckCircle2, XCircle, AlertCircle, Loader2, ArrowRight, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { QR_MODULE_LABELS } from '@/types/database';
import {
  ModuleContentFields,
  moduleHasContentFields,
  validateModuleContent,
  MODULE_ACTIVATION_CONFIG,
} from '@/components/client/module-content-fields';

const POPULAR_MODULES = [
  'wifi', 'external_link', 'home_manual', 'note', 'meal_planner',
  'guestbook', 'doorbell', 'emergency', 'contact', 'shopping_list',
  'checklist', 'medication', 'energy_monitor', 'key_location', 'cleaning_schedule',
  'inventory', 'chore', 'timer', 'recipe',
] as const;

export function ActivationPage() {
  const [code, setCode] = useState('');
  const [codeStatus, setCodeStatus] = useState<'loading' | 'not_found' | 'inactive' | 'active' | 'lost' | 'cancelled'>('loading');
  const [physicalQrId, setPhysicalQrId] = useState('');
  const [moduleType, setModuleType] = useState('');
  const [qrName, setQrName] = useState('');
  const [homeId, setHomeId] = useState('');
  const [moduleContent, setModuleContent] = useState<Record<string, string>>({});
  const [contentErrors, setContentErrors] = useState<string[]>([]);
  const [activating, setActivating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successSlug, setSuccessSlug] = useState('');

  // Check code API — isolated try/catch so homes fetch failure doesn't overwrite status
  const checkCode = async (codeToCheck: string) => {
    if (codeToCheck.length < 3) return;
    setCodeStatus('loading');
    try {
      const res = await fetch(`/api/client/check-code?code=${codeToCheck}`);
      const data = await res.json();
      setCodeStatus(data.status);
      if (data.status === 'inactive' && data.physicalQr) {
        setPhysicalQrId(data.physicalQr.id);
        // Fetch homes in a SEPARATE try/catch so it doesn't affect code status
        try {
          const homesRes = await fetch('/api/client/homes');
          const homesData = await homesRes.json();
          const home = homesData.homes?.[0];
          if (home) setHomeId(home.id);
        } catch {
          // Homes fetch failed — code is still valid, will auto-resolve on activation
          console.warn('Failed to fetch homes, will auto-resolve on activation');
        }
      }
    } catch {
      setCodeStatus('not_found');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (code.length >= 6) checkCode(code);
      else setCodeStatus('loading');
    }, 500);
    return () => clearTimeout(timer);
  }, [code]);

  const formatCode = (val: string) => val.replace(/[^A-Z0-9-]/gi, '').toUpperCase();

  const handleActivate = async () => {
    if (!physicalQrId || !moduleType || !qrName) return;

    // Validate content fields
    const errors = validateModuleContent(moduleType, moduleContent);
    if (errors.length > 0) {
      setContentErrors(errors);
      toast.error(`Champs requis : ${errors.join(', ')}`);
      return;
    }

    setActivating(true);
    try {
      const hasContent = moduleHasContentFields(moduleType) && Object.keys(moduleContent).length > 0;
      const res = await fetch('/api/client/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          moduleType,
          name: qrName,
          homeId: homeId || undefined,
          content: hasContent ? moduleContent : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess(true);
      setSuccessSlug(data.qrCode?.publicSlug || '');
      toast.success('QR code activé avec succès !');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActivating(false);
    }
  };

  // Success state
  if (success) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-white p-4'>
        <Card className='w-full max-w-md text-center'>
          <CardContent className='p-8'>
            <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100'><CheckCircle2 className='h-8 w-8 text-emerald-600' /></div>
            <h2 className='text-xl font-bold mb-2'>QR Code activé !</h2>
            <p className='text-muted-foreground mb-2'>Votre QR code <span className='font-mono font-semibold'>{code}</span> est maintenant actif.</p>
            <p className='text-sm text-muted-foreground mb-6'>
              {successSlug
                ? `Scannez-le à nouveau pour voir le module « ${(QR_MODULE_LABELS as Record<string, string>)[moduleType] || moduleType} » en action.`
                : 'Votre QR code est prêt à être utilisé.'}
            </p>
            <Button variant='outline' onClick={() => {
              setSuccess(false);
              setCode('');
              setCodeStatus('loading');
              setModuleType('');
              setQrName('');
              setModuleContent({});
              setContentErrors([]);
              setPhysicalQrId('');
            }}>
              Activer un autre QR code
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white p-4'>
      <Card className='w-full max-w-lg'>
        <CardHeader className='text-center pb-2'>
          <div className='mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary'><QrCode className='h-7 w-7 text-primary-foreground' /></div>
          <CardTitle className='text-xl'>Activer un QR Code</CardTitle>
          <CardDescription>Entrez le code imprimé sur votre QR code physique.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {/* Code input */}
          <div className='space-y-2'>
            <Label>Code d'activation</Label>
            <Input
              className='text-center font-mono text-xl tracking-widest h-14'
              placeholder='QR-XXXXXXXX'
              value={code}
              onChange={(e) => setCode(formatCode(e.target.value))}
              maxLength={30}
            />
            {codeStatus === 'loading' && code.length >= 3 && (
              <p className='text-xs text-muted-foreground text-center mt-1'>Vérification en cours...</p>
            )}
            {codeStatus === 'not_found' && (
              <div className='flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive'><XCircle className='h-4 w-4 shrink-0' /><span>Code introuvable. Vérifiez et réessayez.</span></div>
            )}
            {codeStatus === 'active' && (
              <div className='flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm text-amber-700'><AlertCircle className='h-4 w-4 shrink-0' /><span>Ce code est déjà activé.</span></div>
            )}
            {(codeStatus === 'lost' || codeStatus === 'cancelled') && (
              <div className='flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive'><XCircle className='h-4 w-4 shrink-0' /><span>Ce code n'est plus valable.</span></div>
            )}
            {codeStatus === 'inactive' && (
              <div className='flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/5 p-3 text-sm text-emerald-700'><CheckCircle2 className='h-4 w-4 shrink-0' /><span>Code valide et prêt à être activé !</span></div>
            )}
          </div>

          {codeStatus === 'inactive' && (
            <>
              <Separator />
              {/* Module type selection */}
              <div className='space-y-3'>
                <div className='flex items-center gap-2'><Zap className='h-4 w-4 text-primary' /><Label className='font-semibold'>Choisissez le module</Label></div>
                <div className='grid grid-cols-3 gap-2 max-h-48 overflow-y-auto'>
                  {POPULAR_MODULES.map((type) => {
                    const config = MODULE_ACTIVATION_CONFIG[type];
                    const IconComp = config?.icon;
                    return (
                      <button
                        key={type}
                        onClick={() => { setModuleType(type); setModuleContent({}); setContentErrors([]); }}
                        className={`rounded-lg border-2 px-3 py-2 text-xs font-medium text-center transition-all ${moduleType === type ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                      >
                        {IconComp && <IconComp className='h-4 w-4 mx-auto mb-1 text-muted-foreground' />}
                        {QR_MODULE_LABELS[type as keyof typeof QR_MODULE_LABELS] || type}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Module content fields */}
              {moduleType && moduleHasContentFields(moduleType) && (
                <>
                  <Separator />
                  <div className='space-y-3'>
                    <Label className='font-semibold'>Configuration du module</Label>
                    {contentErrors.length > 0 && (
                      <div className='flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-2.5 text-sm text-destructive'>
                        <AlertCircle className='h-4 w-4 shrink-0' />
                        <span>Remplissez : {contentErrors.join(', ')}</span>
                      </div>
                    )}
                    <ModuleContentFields
                      moduleType={moduleType}
                      content={moduleContent}
                      onChange={(c) => { setModuleContent(c); setContentErrors([]); }}
                    />
                  </div>
                </>
              )}

              {/* Name input */}
              <div className='space-y-2'>
                <Label>Nom du QR code</Label>
                <Input placeholder='ex: Wi-Fi Invités' value={qrName} onChange={(e) => setQrName(e.target.value)} />
              </div>

              <Button className='w-full' size='lg' onClick={handleActivate} disabled={activating || !moduleType || !qrName}>
                {activating ? <><Loader2 className='mr-2 h-4 w-4 animate-spin' />Activation...</> : <>Activer maintenant <ArrowRight className='ml-2 h-4 w-4' /></>}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
