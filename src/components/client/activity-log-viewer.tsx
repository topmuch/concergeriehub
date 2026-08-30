'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Download, Search, Filter } from 'lucide-react';

interface LogEntry {
  id: string;
  actionType: string;
  detailsJson: string;
  createdAt: string;
  user?: { fullName: string | null; email: string } | null;
  qrCode?: { name: string; type: string } | null;
}

const ACTION_LABELS: Record<string, string> = {
  qr_activated: 'QR activé',
  qr_deactivated: 'QR désactivé',
  qr_created: 'QR créé',
  qr_updated: 'QR modifié',
  home_created: 'Maison créée',
  member_invited: 'Membre invité',
  room_created: 'Pièce créée',
};

export function ActivityLogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [homeId, setHomeId] = useState('');

  const fetchLogs = (hid: string) => {
    fetch(`/api/client/activity?homeId=${hid}&limit=100`)
      .then((r) => r.json())
      .then((d) => { setLogs(d.logs || []); setLoading(false); })
      .catch(console.error);
  };

  useEffect(() => {
    fetch('/api/client/homes')
      .then((r) => r.json())
      .then((d) => { const h = d.homes?.[0]; if (h) { setHomeId(h.id); fetchLogs(h.id); } else { setLoading(false); } })
      .catch(() => { setLoading(false); });
  }, []);

  const filtered = logs.filter((l) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      l.actionType.toLowerCase().includes(s) ||
      (l.user?.fullName || '').toLowerCase().includes(s) ||
      (l.qrCode?.name || '').toLowerCase().includes(s)
    );
  });

  const handleExportCsv = () => {
    const header = 'Date,Action,Utilisateur,QR Code\n';
    const rows = filtered
      .map((l) =>
        `${new Date(l.createdAt).toLocaleString('fr-FR')},${ACTION_LABELS[l.actionType] || l.actionType},${l.user?.fullName || 'Système'},${l.qrCode?.name || '-'}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'activite-qr-domotik.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const actionColor = (type: string) => {
    if (type.includes('activ')) return 'bg-emerald-500/15 text-emerald-700';
    if (type.includes('deactiv')) return 'bg-red-500/15 text-red-700';
    if (type.includes('creat')) return 'bg-blue-500/15 text-blue-700';
    if (type.includes('invit')) return 'bg-violet-500/15 text-violet-700';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Journal d'activité</h2>
          <p className='text-muted-foreground'>Historique de toutes les actions.</p>
        </div>
        <Button variant='outline' onClick={handleExportCsv} disabled={filtered.length === 0}>
          <Download className='mr-2 h-4 w-4' />Export CSV
        </Button>
      </div>

      <div className='flex gap-3'>
        <div className='relative flex-1'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
          <Input placeholder='Rechercher...' value={search} onChange={(e) => setSearch(e.target.value)} className='pl-9' />
        </div>
      </div>

      <Card>
        <CardContent className='p-0'>
          {loading ? (
            <div className='p-6 space-y-4'>{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className='h-12 w-full' />))}</div>
          ) : filtered.length === 0 ? (
            <div className='py-16 text-center'>
              <Activity className='h-10 w-10 mx-auto mb-3 text-muted-foreground' />
              <p className='text-sm text-muted-foreground'>{search ? 'Aucun résultat' : 'Aucune activité enregistrée.'}</p>
            </div>
          ) : (
            <div className='max-h-[600px] overflow-y-auto divide-y'>
              {filtered.map((log) => (
                <div key={log.id} className='flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors'>
                  <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted'>
                    <Activity className='h-4 w-4 text-muted-foreground' />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 mb-0.5'>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actionColor(log.actionType)}`}>
                        {ACTION_LABELS[log.actionType] || log.actionType}
                      </span>
                      {log.qrCode?.name && (
                        <span className='text-xs text-muted-foreground truncate'>{log.qrCode.name}</span>
                      )}
                    </div>
                    <p className='text-xs text-muted-foreground'>
                      par {log.user?.fullName || 'Système'}
                    </p>
                  </div>
                  <span className='text-xs text-muted-foreground whitespace-nowrap shrink-0'>
                    {new Date(log.createdAt).toLocaleString('fr-FR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
