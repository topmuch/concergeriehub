'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, FileText, Eye } from 'lucide-react';
import { toast } from 'sonner';

export interface InfoContent {
  title: string;
  body: string;
}

interface InfoConfigProps {
  qrCodeId: string;
  initialContent?: Partial<InfoContent>;
  onSave?: (content: InfoContent) => void;
}

const TOOLBAR_BUTTONS = [
  { label: 'G', title: 'Gras', prefix: '**', suffix: '**' },
  { label: 'I', title: 'Italique', prefix: '_', suffix: '_' },
  { label: 'H1', title: 'Titre 1', prefix: '# ', suffix: '' },
  { label: 'H2', title: 'Titre 2', prefix: '## ', suffix: '' },
  { label: 'H3', title: 'Titre 3', prefix: '### ', suffix: '' },
  { label: '•', title: 'Liste', prefix: '- ', suffix: '' },
  { label: '1.', title: 'Liste numérotée', prefix: '1. ', suffix: '' },
  { label: '―', title: 'Séparateur', prefix: '\n---\n', suffix: '' },
  { label: '""', title: 'Citation', prefix: '> ', suffix: '' },
  { label: '🔗', title: 'Lien', prefix: '[texte](', suffix: ')' },
];

export function InfoConfig({ qrCodeId, initialContent, onSave }: InfoConfigProps) {
  const [title, setTitle] = useState(initialContent?.title || '');
  const [body, setBody] = useState(initialContent?.body || '');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!initialContent);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!initialContent && qrCodeId) {
      fetch(`/api/client/module-content?qrCodeId=${qrCodeId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.content) {
            setTitle(data.content.title || '');
            setBody(data.content.body || '');
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [qrCodeId, initialContent]);

  const insertMarkdown = (prefix: string, suffix: string) => {
    const textarea = document.getElementById('info-body') as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.substring(start, end);
    const newBody = body.substring(0, start) + prefix + selected + suffix + body.substring(end);
    setBody(newBody);
    setTimeout(() => {
      textarea.focus();
      const cursorPos = start + prefix.length + selected.length + suffix.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Le titre est requis');
      return;
    }

    const content: InfoContent = { title: title.trim(), body: body.trim() };

    if (onSave) {
      onSave(content);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/client/module-content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCodeId, content }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      toast.success('Page info sauvegardée');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const renderMarkdownPreview = (md: string) => {
    let html = md
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-5 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-3">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-primary/30 pl-4 italic text-muted-foreground my-2">$1</blockquote>')
      .replace(/^---$/gm, '<hr class="my-4 border-border" />')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>')
      .replace(/\n/g, '<br />');
    return html;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
          <FileText className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Page Info / Guide Maison</h3>
          <p className="text-sm text-muted-foreground">Créez un guide ou une page informative</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contenu de la page</CardTitle>
          <CardDescription>Utilisez la syntaxe Markdown pour formater le texte</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="info-title">Titre</Label>
            <Input
              id="info-title"
              placeholder="Guide de la maison"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="info-body">Contenu</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye className="h-3.5 w-3.5" />
                {showPreview ? 'Éditer' : 'Aperçu'}
              </Button>
            </div>

            {!showPreview ? (
              <>
                {/* Markdown toolbar */}
                <div className="flex flex-wrap gap-1 rounded-t-lg border border-b-0 bg-muted/30 p-1.5">
                  {TOOLBAR_BUTTONS.map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      title={btn.title}
                      onClick={() => insertMarkdown(btn.prefix, btn.suffix)}
                      className="rounded px-2 py-1 text-xs font-medium hover:bg-accent transition-colors"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  id="info-body"
                  placeholder="# Bienvenue !\n\nVoici les informations importantes..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="font-mono text-sm rounded-t-none"
                />
              </>
            ) : (
              <div className="min-h-[200px] rounded-lg border bg-background p-4">
                {body ? (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(body) }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun contenu à afficher</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Sauvegarder
        </Button>
      </div>
    </div>
  );
}
