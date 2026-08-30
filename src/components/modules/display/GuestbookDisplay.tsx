'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, Send, Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

interface GuestbookEntry {
  guestName: string;
  message: string;
  createdAt: string;
}

interface GuestbookDisplayProps {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
  entries?: Array<GuestbookEntry>;
}

export function GuestbookDisplay({ content, qrCodeId, qrName, entries = [] }: GuestbookDisplayProps) {
  const title = content?.title || undefined;
  const body = content?.body || '';

  const [guestName, setGuestName] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localEntries, setLocalEntries] = useState<Array<GuestbookEntry>>(entries);
  const { t, locale } = useTranslation();

  const handleSubmit = async () => {
    if (!guestName.trim()) {
      toast.error(t('enter_your_name'));
      return;
    }
    if (!message.trim()) {
      toast.error(t('write_a_message'));
      return;
    }

    setSubmitting(true);
    const newEntry: GuestbookEntry = {
      guestName: guestName.trim(),
      message: message.trim(),
      createdAt: new Date().toISOString(),
    };

    // Optimistically add entry
    setLocalEntries((prev) => [newEntry, ...prev]);
    setGuestName('');
    setMessage('');

    try {
      if (qrCodeId) {
        await fetch(`/api/public/guestbook/${qrCodeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newEntry),
        });
      }
      toast.success(t('message_added'));
    } catch {
      // Remove optimistic entry on failure
      setLocalEntries((prev) => prev.filter((e) => e !== newEntry));
      toast.error(t('send_error'));
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(locale === 'ar' ? 'ar-SA' : locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/25">
          <BookOpen className="h-8 w-8 text-white" />
        </div>
        {qrName && <p className="text-sm text-muted-foreground">{qrName}</p>}
      </div>

      {/* Welcome Message */}
      <Card className="mb-4 border-2 border-emerald-100 dark:border-emerald-900/30">
        <CardContent className="p-6">
          <h1 className="mb-2 text-2xl font-bold text-emerald-900 dark:text-emerald-100">
            {title || t('guestbook')}
          </h1>
          {body && (
            <p className="text-sm leading-relaxed text-emerald-700 dark:text-emerald-300">
              {body}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Form Card */}
      <Card className="mb-4 border-2 border-emerald-100 dark:border-emerald-900/30">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              {t('write_message')}
            </p>
          </div>

          <div className="space-y-3">
            <Input
              placeholder={t('your_name')}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="border-emerald-200 dark:border-emerald-800"
            />
            <Textarea
              placeholder={t('your_message')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="border-emerald-200 dark:border-emerald-800"
            />
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t('submit')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Entries */}
      {localEntries.length > 0 && (
        <Card className="border-2 border-emerald-100 dark:border-emerald-900/30">
          <CardContent className="p-6">
            <p className="mb-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              {localEntries.length} {t('messages')}
            </p>
            <ScrollArea className="max-h-96">
              <div className="space-y-4">
                {localEntries.map((entry, index) => (
                  <div key={index}>
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-semibold text-sm text-emerald-900 dark:text-emerald-100">
                          {entry.guestName}
                        </p>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">
                          {formatDate(entry.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-emerald-800 dark:text-emerald-200">
                        {entry.message}
                      </p>
                    </div>
                    {index < localEntries.length - 1 && (
                      <Separator className="my-3" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}