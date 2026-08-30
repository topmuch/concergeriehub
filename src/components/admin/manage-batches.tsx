'use client';

import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  FileDown,
  Trash2,
  ChevronDown,
  ChevronUp,
  PackageOpen,
  Loader2,
  QrCode,
  X,
  Download,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { generatePdf, type QrCodeForPdf } from '@/lib/pdf-export';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BatchListItem {
  id: string;
  quantity: number;
  designConfig: string | null;
  createdAt: string;
  _count?: {
    physicalQrCodes: number;
    active: number;
    inactive: number;
    lost: number;
    cancelled: number;
  };
}

interface PhysicalQr {
  id: string;
  activationCode: string;
  status: string;
  activatedAt: string | null;
  designConfig: string;
}

interface BatchDetail extends BatchListItem {
  physicalQrCodes: PhysicalQr[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseDesign(designConfig: string | null | undefined) {
  if (!designConfig) return { bgColor: '#FFFFFF', fgColor: '#111827' };
  try {
    const c = JSON.parse(designConfig);
    return {
      bgColor: c.backgroundColor || '#FFFFFF',
      fgColor: c.dotsColor || '#111827',
      qrLevel: (c.errorCorrectionLevel || 'M').toUpperCase() as 'L' | 'M' | 'Q' | 'H',
    };
  } catch {
    return { bgColor: '#FFFFFF', fgColor: '#111827' };
  }
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  active:     { label: 'Actif',     cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  inactive:   { label: 'Inactif',   cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  lost:       { label: 'Perdu',     cls: 'bg-red-100 text-red-700 border-red-200' },
  cancelled:  { label: 'Annulé',    cls: 'bg-amber-100 text-amber-800 border-amber-200' },
};

function getStatusStyle(status: string) {
  return STATUS_STYLES[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
}

const APP_URL = 'https://qrdomotik.roomscan.pro';

/* ------------------------------------------------------------------ */
/*  Status Badge (batch level)                                         */
/* ------------------------------------------------------------------ */

function StatusBadge({ _count, quantity }: { _count?: BatchListItem['_count']; quantity: number }) {
  const activated = _count?.active ?? 0;
  const allActivated = activated === quantity && quantity > 0;
  const noneActivated = activated === 0;

  if (noneActivated) return <Badge variant="secondary">{activated}/{quantity} activés</Badge>;
  if (allActivated) return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{activated}/{quantity} activés</Badge>;
  return <Badge variant="outline" className="border-amber-500 text-amber-700">{activated}/{quantity} activés</Badge>;
}

/* ------------------------------------------------------------------ */
/*  QR Code Card (single QR in grid)                                   */
/* ------------------------------------------------------------------ */

function QrCard({ qr }: { qr: PhysicalQr }) {
  const design = parseDesign(qr.designConfig);
  const st = getStatusStyle(qr.status);
  const url = `${APP_URL}/activate/${qr.activationCode}`;

  const handleDownloadSingle = () => {
    const svg = document.querySelector(`#qr-svg-${qr.id} svg`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = 400;
      canvas.height = 400;
      ctx?.drawImage(img, 0, 0, 400, 400);
      const a = document.createElement('a');
      a.download = `${qr.activationCode}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border bg-white p-3 shadow-sm hover:shadow-md transition-shadow">
      <div id={`qr-svg-${qr.id}`}>
        <QRCodeSVG
          value={url}
          size={110}
          level={design.qrLevel}
          bgColor={design.bgColor}
          fgColor={design.fgColor}
        />
      </div>
      <span className="font-mono text-[10px] font-semibold text-center break-all leading-tight text-gray-700">
        {qr.activationCode}
      </span>
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${st.cls}`}>
        {st.label}
      </Badge>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 text-gray-500 hover:text-gray-800"
        onClick={handleDownloadSingle}
      >
        <Download className="h-3 w-3" />
        PNG
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Batch Detail Dialog (grid of QR codes)                             */
/* ------------------------------------------------------------------ */

function BatchDetailDialog({
  batch,
  open,
  onOpenChange,
}: {
  batch: BatchDetail | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [downloading, setDownloading] = useState(false);

  if (!batch) return null;

  const design = parseDesign(batch.designConfig);
  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const codes: QrCodeForPdf[] = batch.physicalQrCodes.map((qr) => {
        // Generate SVG → canvas → PNG data URL for each QR
        const svg = document.querySelector(`#qr-svg-${qr.id} svg`);
        let imageUrl = '';
        if (svg) {
          const svgData = new XMLSerializer().serializeToString(svg);
          const canvas = document.createElement('canvas');
          canvas.width = 300;
          canvas.height = 300;
          const ctx = canvas.getContext('2d');
          const img = new Image();
          img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
          // Synchronous draw (image already loaded as data URL)
          ctx?.drawImage(img, 0, 0, 300, 300);
          imageUrl = canvas.toDataURL('image/png');
        }
        return { code: qr.activationCode, imageUrl };
      });

      const pdf = generatePdf({
        qrCodes: codes,
        batchName: `Lot ${batch.id.slice(0, 8)}`,
      });
      const fileName = `qr-domotik-lot-${batch.id.slice(0, 8)}.pdf`;
      pdf.save(fileName);
      toast.success('PDF téléchargé !');
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la génération du PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Plaque QR Hub
          </DialogTitle>
          <DialogDescription>
            Plaque <span className="font-mono">{batch.id.slice(0, 8)}</span> —{' '}
            Créée le {format(new Date(batch.createdAt), 'dd MMM yyyy HH:mm', { locale: fr })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-2">
            <Badge variant="secondary">Plaque Hub</Badge>
            <StatusBadge _count={batch._count} quantity={batch.quantity} />
          </div>
          <Button
            size="sm"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="gap-2"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Télécharger PDF
          </Button>
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-1">
            {batch.physicalQrCodes.map((qr) => (
              <QrCard key={qr.id} qr={qr} />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function ManageBatches() {
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expanded batch (inline QR grid)
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [expandedBatchData, setExpandedBatchData] = useState<BatchDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Dialog (full view)
  const [dialogBatch, setDialogBatch] = useState<BatchDetail | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<BatchListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---- Fetch batches list ---- */
  const fetchBatches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/batches');
      if (!res.ok) throw new Error('Erreur lors du chargement des plaques');
      const data = await res.json();
      const list: BatchListItem[] = Array.isArray(data) ? data : data.batches ?? [];
      setBatches(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  /* ---- Expand / collapse batch inline ---- */
  const toggleExpand = async (batch: BatchListItem) => {
    if (expandedBatchId === batch.id) {
      setExpandedBatchId(null);
      setExpandedBatchData(null);
      return;
    }
    setExpandedBatchId(batch.id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/batches/${batch.id}`);
      if (!res.ok) throw new Error('Erreur lors du chargement de la plaque');
      const detail: BatchDetail = await res.json();
      setExpandedBatchData(detail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
      setExpandedBatchId(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  /* ---- Open full detail dialog ---- */
  const openDetail = async (batch: BatchListItem) => {
    // Reuse expanded data if available
    if (expandedBatchData && expandedBatchData.id === batch.id) {
      setDialogBatch(expandedBatchData);
      setDialogOpen(true);
      return;
    }
    try {
      const res = await fetch(`/api/admin/batches/${batch.id}`);
      if (!res.ok) throw new Error('Erreur');
      const detail: BatchDetail = await res.json();
      setDialogBatch(detail);
      setDialogOpen(true);
    } catch {
      toast.error('Erreur lors du chargement des QR codes');
    }
  };

  /* ---- Delete batch ---- */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/batches/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur lors de la suppression');
      const result = await res.json();
      toast.success('Plaque supprimée');
      setDeleteTarget(null);
      // Remove from expanded if it was this batch
      if (expandedBatchId === deleteTarget.id) {
        setExpandedBatchId(null);
        setExpandedBatchData(null);
      }
      fetchBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  /* ---- Inline PDF download (for expanded view) ---- */
  const handleInlinePdfDownload = () => {
    if (!expandedBatchData) return;
    const codes: QrCodeForPdf[] = expandedBatchData.physicalQrCodes.map((qr) => {
      const svg = document.querySelector(`#qr-svg-${qr.id} svg`);
      let imageUrl = '';
      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        ctx?.drawImage(img, 0, 0, 300, 300);
        imageUrl = canvas.toDataURL('image/png');
      }
      return { code: qr.activationCode, imageUrl };
    });
    const pdf = generatePdf({
      qrCodes: codes,
      batchName: `Lot ${expandedBatchData.id.slice(0, 8)}`,
    });
    pdf.save(`qr-domotik-lot-${expandedBatchData.id.slice(0, 8)}.pdf`);
    toast.success('PDF téléchargé !');
  };

  /* ---- Render ---- */
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5" />
            Plaques QR Hub
          </CardTitle>
          <CardDescription>
            Toutes les plaques QR Hub générées
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchBatches}>
                Réessayer
              </Button>
            </div>
          )}

          {!loading && !error && batches.length === 0 && (
            <div className="text-center py-12">
              <PackageOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">Aucune plaque</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Aucune plaque QR Hub n&apos;a été générée pour le moment.
              </p>
            </div>
          )}

          {!loading && !error && batches.length > 0 && (
            <div className="space-y-3">
              {batches.map((batch) => {
                const isExpanded = expandedBatchId === batch.id;
                const color = parseDesign(batch.designConfig);
                return (
                  <div key={batch.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    {/* Batch header row */}
                    <div className="flex flex-wrap items-center gap-3 p-4">
                      {/* Color dot */}
                      <span
                        className="h-8 w-8 rounded-lg border flex-shrink-0"
                        style={{ backgroundColor: color.bgColor, borderColor: color.fgColor + '40' }}
                      >
                        <QrCode className="h-4 w-4 m-2" style={{ color: color.fgColor }} />
                      </span>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-semibold">{batch.id.slice(0, 8)}</span>
                          <Badge variant="outline" className="text-xs">
                            1 plaque
                          </Badge>
                          <StatusBadge _count={batch._count} quantity={batch.quantity} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Créé le {format(new Date(batch.createdAt), 'dd MMM yyyy à HH:mm', { locale: fr })}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => toggleExpand(batch)}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {isExpanded ? 'Masquer' : 'Voir les QR'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={handleInlinePdfDownload}
                          disabled={!isExpanded || !expandedBatchData}
                          title="Télécharger PDF"
                        >
                          <FileDown className="h-4 w-4" />
                          PDF
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(batch)}
                          title="Supprimer cette plaque"
                        >
                          <Trash2 className="h-4 w-4" />
                          Supprimer
                        </Button>
                      </div>
                    </div>

                    {/* Expanded QR grid */}
                    {isExpanded && (
                      <div className="border-t bg-muted/30 px-4 py-4">
                        {loadingDetail ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {Array.from({ length: batch.quantity > 10 ? 10 : batch.quantity }).map((_, i) => (
                              <Skeleton key={i} className="h-[180px] rounded-xl" />
                            ))}
                          </div>
                        ) : expandedBatchData ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {expandedBatchData.physicalQrCodes.map((qr) => (
                              <QrCard key={qr.id} qr={qr} />
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Erreur lors du chargement des QR codes
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full detail dialog */}
      <BatchDetailDialog
        batch={dialogBatch}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette plaque ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La plaque{' '}
              <span className="font-mono font-semibold">{deleteTarget?.id.slice(0, 8)}</span> sera définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
