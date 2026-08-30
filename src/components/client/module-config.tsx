'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Settings2, QrCode, Wifi, Link2, FileText, Bell,
  Search, ChevronRight, Puzzle,
} from 'lucide-react';
import { toast } from 'sonner';
import { QR_MODULE_LABELS, type QrModuleType } from '@/types/database';
import { MODULE_DEFINITIONS, getModuleDef } from '@/components/modules/registry';

// Module configs
import { WifiConfig, type WifiContent } from '@/components/modules/wifi/WifiConfig';
import { LinkConfig, type LinkContent } from '@/components/modules/link/LinkConfig';
import { InfoConfig, type InfoContent } from '@/components/modules/info/InfoConfig';
import { DoorbellConfig, type DoorbellContent } from '@/components/modules/doorbell/DoorbellConfig';

// Module displays for preview
import { WifiDisplay } from '@/components/modules/wifi/WifiDisplay';
import { LinkDisplay } from '@/components/modules/link/LinkDisplay';
import { InfoDisplay } from '@/components/modules/info/InfoDisplay';
import { DoorbellDisplay } from '@/components/modules/doorbell/DoorbellDisplay';

interface QrCodeItem {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  room: { id: string; name: string; icon: string | null } | null;
  content: { id: string; contentJson: string; updatedAt: string } | null;
}

const MODULE_ICON_MAP: Record<string, React.ReactNode> = {
  wifi: <Wifi className="h-4 w-4" />,
  external_link: <Link2 className="h-4 w-4" />,
  home_manual: <FileText className="h-4 w-4" />,
  doorbell: <Bell className="h-4 w-4" />,
};

const PLACEHOLDER_CONTENT: Record<string, Record<string, unknown>> = {
  wifi: { ssid: 'MonWiFi', password: 'monmotdepasse', security: 'WPA', hidden: false },
  external_link: { url: 'https://qrdomotik.roomscan.pro', title: 'QR Domotik', description: 'Plateforme de QR codes domotiques' },
  home_manual: { title: 'Bienvenue !', body: '# Guide de la maison\n\nVoici les informations utiles.\n\n## Wi-Fi\n- **SSID** : MonWiFi\n- **Mot de passe** : disponible au scan\n\n## Consignes\n> Merci de respecter les lieux' },
  doorbell: { mode: 'present', instructions: ['Chez le gardien', 'Dans la boîte à colis'], allowMessages: true, allowDoorbell: true, presentMessage: 'Je suis là, merci de sonner !', absentMessage: 'Je suis absent pour le moment.' },
};

export function ModuleConfigPage() {
  const [qrCodes, setQrCodes] = useState<QrCodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedQrId, setSelectedQrId] = useState<string | null>(null);
  const [selectedQr, setSelectedQr] = useState<QrCodeItem | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [contentData, setContentData] = useState<Record<string, unknown> | null>(null);

  const fetchQrCodes = useCallback(async () => {
    setLoading(true);
    try {
      const homesRes = await fetch('/api/client/homes');
      const homesData = await homesRes.json();
      const home = homesData.homes?.[0];
      if (!home) {
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/client/qr-codes?homeId=${home.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const data = JSON.parse(text);
      setQrCodes(data.qrCodes || []);
    } catch (err) {
      console.error('[ModuleConfig fetchQrCodes]', err);
      toast.error('Erreur de chargement des QR codes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQrCodes(); }, [fetchQrCodes]);

  useEffect(() => {
    if (selectedQrId) {
      const qr = qrCodes.find((q) => q.id === selectedQrId);
      setSelectedQr(qr || null);
      if (qr?.content) {
        try { setContentData(JSON.parse(qr.content.contentJson)); } catch { setContentData(null); }
      } else { setContentData(null); }
    } else {
      setSelectedQr(null);
      setContentData(null);
    }
    setShowPreview(false);
  }, [selectedQrId, qrCodes]);

  const filteredQrCodes = qrCodes.filter((qr) => {
    const matchesSearch = qr.name.toLowerCase().includes(search.toLowerCase()) || qr.type.toLowerCase().includes(search.toLowerCase());
    const isSupportedModule = MODULE_DEFINITIONS.some((m) => m.type === qr.type);
    return matchesSearch && isSupportedModule;
  });

  const renderConfig = () => {
    if (!selectedQr) return null;
    switch (selectedQr.type) {
      case 'wifi':
        return <WifiConfig qrCodeId={selectedQr.id} initialContent={contentData as Partial<WifiContent> || undefined} onSave={() => fetchQrCodes()} />;
      case 'external_link':
        return <LinkConfig qrCodeId={selectedQr.id} initialContent={contentData as Partial<LinkContent> || undefined} onSave={() => fetchQrCodes()} />;
      case 'home_manual':
        return <InfoConfig qrCodeId={selectedQr.id} initialContent={contentData as Partial<InfoContent> || undefined} onSave={() => fetchQrCodes()} />;
      case 'doorbell':
        return <DoorbellConfig qrCodeId={selectedQr.id} initialContent={contentData as Partial<DoorbellContent> || undefined} onSave={() => fetchQrCodes()} />;
      default:
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Puzzle className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Module non disponible</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Le type &laquo; {QR_MODULE_LABELS[selectedQr.type as QrModuleType] || selectedQr.type} &raquo; sera bientôt supporté
            </p>
          </div>
        );
    }
  };

  const renderPreview = () => {
    if (!selectedQr) return null;
    const data = contentData || PLACEHOLDER_CONTENT[selectedQr.type] || {};
    switch (selectedQr.type) {
      case 'wifi':
        return <WifiDisplay content={data as WifiContent} qrName={selectedQr.name} />;
      case 'external_link':
        return <LinkDisplay content={data as LinkContent} qrName={selectedQr.name} />;
      case 'home_manual':
        return <InfoDisplay content={data as InfoContent} qrName={selectedQr.name} />;
      case 'doorbell':
        return <DoorbellDisplay content={data as DoorbellContent} qrName={selectedQr.name} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Configuration des Modules</h2>
            <p className="text-sm text-muted-foreground">Sélectionnez un QR code pour configurer son contenu</p>
          </div>
        </div>
        {selectedQr && (
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? 'Configuration' : 'Aperçu mobile'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* QR Code List */}
        <div className="lg:col-span-4">
          <Card className="h-[calc(100vh-14rem)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">QR Codes</CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Rechercher..." className="pl-9 h-9 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-22rem)]">
                {loading ? (
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <div className="flex-1"><Skeleton className="h-4 w-3/4 mb-1" /><Skeleton className="h-3 w-1/2" /></div>
                      </div>
                    ))}
                  </div>
                ) : filteredQrCodes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <QrCode className="mb-3 h-10 w-10 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-muted-foreground">Aucun QR code</p>
                    <p className="text-xs text-muted-foreground mt-1">Activez d&apos;abord un QR code dans la section &laquo; Activer QR codes &raquo;</p>
                  </div>
                ) : (
                  <div className="space-y-1 p-2">
                    {filteredQrCodes.map((qr) => {
                      const modDef = getModuleDef(qr.type);
                      return (
                        <button
                          key={qr.id}
                          onClick={() => setSelectedQrId(qr.id)}
                          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                            selectedQrId === qr.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                          }`}
                        >
                          <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
                            selectedQrId === qr.id ? 'bg-primary-foreground/20' : modDef?.bgColor || 'bg-muted'
                          }`}>
                            <span className={selectedQrId === qr.id ? 'text-primary-foreground' : modDef?.color || ''}>
                              {MODULE_ICON_MAP[qr.type] || <QrCode className="h-4 w-4" />}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{qr.name}</p>
                            <p className={`text-xs truncate ${selectedQrId === qr.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                              {QR_MODULE_LABELS[qr.type as QrModuleType] || qr.type}{qr.room ? ` · ${qr.room.name}` : ''}
                            </p>
                          </div>
                          {qr.content && (
                            <Badge variant={selectedQrId === qr.id ? 'secondary' : 'outline'} className="shrink-0 text-[10px] px-1.5 py-0">
                              Configuré
                            </Badge>
                          )}
                          <ChevronRight className={`h-4 w-4 shrink-0 ${selectedQrId === qr.id ? 'text-primary-foreground/50' : 'text-muted-foreground'}`} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Config / Preview Area */}
        <div className="lg:col-span-8">
          {showPreview && selectedQr ? (
            <div className="rounded-xl border shadow-sm overflow-hidden">
              <div className="bg-muted/30 px-4 py-2 flex items-center gap-2 border-b">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 text-center">
                  <span className="text-xs text-muted-foreground">Aperçu mobile — {selectedQr.name}</span>
                </div>
              </div>
              <div className="mx-auto max-w-[390px] h-[500px] overflow-y-auto overflow-x-hidden border-x relative">
                {renderPreview()}
              </div>
            </div>
          ) : selectedQr ? (
            <div className="rounded-xl border bg-card shadow-sm p-6">
              {renderConfig()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border bg-card shadow-sm py-20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
                <Settings2 className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-medium text-muted-foreground">Sélectionnez un QR code</h3>
              <p className="mt-1 text-sm text-muted-foreground/70 text-center max-w-sm">
                Choisissez un QR code dans la liste pour configurer son module
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
