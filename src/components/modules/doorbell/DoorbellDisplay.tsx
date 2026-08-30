'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  Bell, BellRing, MessageSquare, Package, CheckCircle2,
  Home, Eye, Send, X, Clock, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

export interface DoorbellContent {
  mode: 'present' | 'absent';
  instructions: string[];
  allowMessages: boolean;
  allowDoorbell: boolean;
  presentMessage: string;
  absentMessage: string;
}

interface DoorbellDisplayProps {
  content: DoorbellContent;
  qrCodeId?: string;
  qrName?: string;
}

type VisitorView = 'home' | 'instructions' | 'message' | 'success-ring' | 'success-message';

export function DoorbellDisplay({ content, qrCodeId, qrName }: DoorbellDisplayProps) {
  const [view, setView] = useState<VisitorView>('home');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const { t } = useTranslation();

  const isPresent = content.mode === 'present';
  const safeInstructions = Array.isArray(content.instructions) ? content.instructions : typeof content.instructions === 'string' ? content.instructions.split('\n').filter(Boolean) : [];
  const bgColor = isPresent
    ? 'from-green-50 to-white dark:from-green-950/20 dark:to-background'
    : 'from-amber-50 to-white dark:from-amber-950/20 dark:to-background';
  const accentColor = isPresent ? 'green' : 'amber';

  const handleRing = async () => {
    setSending(true);
    try {
      if (qrCodeId) {
        await fetch('/api/client/doorbell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrCodeId, action: 'ring' }),
        });
      }
      setView('success-ring');
    } catch {
      toast.error(t('retry'));
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) {
      toast.error(t('write_a_message'));
      return;
    }
    setSending(true);
    try {
      if (qrCodeId) {
        await fetch('/api/client/doorbell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrCodeId, action: 'message', text: messageText.trim() }),
        });
      }
      setView('success-message');
    } catch {
      toast.error(t('retry'));
    } finally {
      setSending(false);
    }
  };

  // Success screens
  if (view === 'success-ring') {
    return (
      <div className={`min-h-screen bg-gradient-to-b ${bgColor}`}>
        <div className="mx-auto max-w-md px-4 py-16 flex flex-col items-center justify-center min-h-screen">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-6 animate-in zoom-in-50 duration-300">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">{t('ring_sent')}</h1>
          <p className="text-muted-foreground text-center mb-8">{t('notified')}</p>
          <Button variant="outline" onClick={() => setView('home')} className="gap-2">
            {t('back')}
          </Button>
        </div>
      </div>
    );
  }

  if (view === 'success-message') {
    return (
      <div className={`min-h-screen bg-gradient-to-b ${bgColor}`}>
        <div className="mx-auto max-w-md px-4 py-16 flex flex-col items-center justify-center min-h-screen">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 mb-6 animate-in zoom-in-50 duration-300">
            <CheckCircle2 className="h-10 w-10 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">{t('message_sent')}</h1>
          <p className="text-muted-foreground text-center mb-8">{t('notified')}</p>
          <Button variant="outline" onClick={() => { setView('home'); setMessageText(''); }} className="gap-2">
            {t('back')}
          </Button>
        </div>
      </div>
    );
  }

  // Instructions view
  if (view === 'instructions') {
    return (
      <div className={`min-h-screen bg-gradient-to-b ${bgColor}`}>
        <div className="mx-auto max-w-md px-4 py-8">
          <button
            onClick={() => setView('home')}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <X className="h-4 w-4" /> {t('back')}
          </button>

          <div className="text-center mb-8">
            <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-${accentColor}-500 shadow-lg shadow-${accentColor}-500/25`}>
              <Package className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold">{t('instructions')}</h1>
            {qrName && <p className="mt-1 text-sm text-muted-foreground">{qrName}</p>}
          </div>

          <div className="space-y-3 mb-8">
            {safeInstructions.map((inst, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-${accentColor}-100 dark:bg-${accentColor}-900/30 text-sm font-bold text-${accentColor}-700 dark:text-${accentColor}-400`}>
                  {i + 1}
                </span>
                <p className="text-sm font-medium">{inst}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setView('home')} className="gap-2">
              <X className="h-4 w-4" /> {t('close_instructions')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Message view
  if (view === 'message') {
    return (
      <div className={`min-h-screen bg-gradient-to-b ${bgColor}`}>
        <div className="mx-auto max-w-md px-4 py-8">
          <button
            onClick={() => setView('home')}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <X className="h-4 w-4" /> {t('back')}
          </button>

          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/25">
              <MessageSquare className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold">{t('write_your_message')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('your_message_will_be_sent')}</p>
          </div>

          <div className="space-y-4">
            <Textarea
              placeholder={t('your_message')}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={5}
              className="text-base"
              autoFocus
            />
            <Button
              onClick={handleSendMessage}
              disabled={sending || !messageText.trim()}
              className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 gap-2"
              size="lg"
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              {t('send_message')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // HOME view — main screen
  return (
    <div className={`min-h-screen bg-gradient-to-b ${bgColor}`}>
      <div className="mx-auto max-w-md px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-${accentColor}-500 shadow-lg shadow-${accentColor}-500/25`}>
            {isPresent ? <Home className="h-8 w-8 text-white" /> : <Eye className="h-8 w-8 text-white" />}
          </div>
          <h1 className="text-2xl font-bold">
            {isPresent ? t('present') : t('absent')}
          </h1>
          {qrName && <p className="mt-1 text-sm text-muted-foreground">{qrName}</p>}
        </div>

        {/* Status Card */}
        <Card className="mb-6 border-2 shadow-sm">
          <div className={`p-6 rounded-t-xl ${isPresent ? 'bg-green-50 dark:bg-green-950/20 border-b border-green-200 dark:border-green-900/30' : 'bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/30'}`}>
            <div className="flex items-center gap-3">
              {isPresent
                ? <CheckCircle2 className="h-6 w-6 text-green-600" />
                : <Clock className="h-6 w-6 text-amber-600" />
              }
              <p className={`text-sm font-medium ${isPresent ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                {isPresent ? content.presentMessage : content.absentMessage}
              </p>
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          {/* Instructions button — always visible */}
          <Button
            variant="outline"
            className="w-full h-16 text-base font-semibold gap-3 border-2"
            onClick={() => setView('instructions')}
          >
            <Package className="h-6 w-6" />
            {t('instructions')}
          </Button>

          {/* Doorbell button */}
          {content.allowDoorbell && (
            <Button
              className={`w-full h-16 text-base font-semibold gap-3 ${isPresent ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}
              size="lg"
              onClick={handleRing}
              disabled={sending}
            >
              {sending ? <Loader2 className="h-6 w-6 animate-spin" /> : <BellRing className="h-6 w-6" />}
              {isPresent ? t('ring') : t('notify_me')}
            </Button>
          )}

          {/* Message button */}
          {content.allowMessages && (
            <Button
              variant="outline"
              className="w-full h-16 text-base font-semibold gap-3 border-2"
              onClick={() => setView('message')}
            >
              <MessageSquare className="h-6 w-6" />
              {t('leave_message')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
