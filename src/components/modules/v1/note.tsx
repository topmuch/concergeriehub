'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StickyNote, Edit3, Save, Palette } from 'lucide-react';
import type { ModuleProps } from '../types';

const COLORS = ['bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200', 'bg-blue-50 dark:bg-blue-950/50 border-blue-200', 'bg-green-50 dark:bg-green-950/50 border-green-200', 'bg-pink-50 dark:bg-pink-950/50 border-pink-200', 'bg-purple-50 dark:bg-purple-950/50 border-purple-200', 'bg-orange-50 dark:bg-orange-950/50 border-orange-200'];

const DEFAULT_CONTENT = {
  text: 'Pensez à sortir les poubelles ce soir !\n\nLe livreur FedEx passera demain matin entre 8h et 10h.',
  colorIndex: 0,
  pinned: false,
};

export default function NoteModule({ content, onSave }: ModuleProps) {
  const data = { ...DEFAULT_CONTENT, ...content } as typeof DEFAULT_CONTENT;
  const [text, setText] = useState(data.text);
  const [colorIndex, setColorIndex] = useState(data.colorIndex);
  const [editing, setEditing] = useState(false);

  const handleSave = () => {
    onSave({ ...content, text, colorIndex });
    setEditing(false);
  };

  const handleColorChange = (idx: number) => {
    setColorIndex(idx);
    onSave({ ...content, text, colorIndex: idx });
  };

  return (
    <Card className={`${COLORS[colorIndex]} border transition-colors`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Note</h3>
            {data.pinned && <span className="text-xs">📌</span>}
          </div>
          <div className="flex items-center gap-1">
            <div className="flex gap-1 mr-1">
              {COLORS.map((c, i) => (
                <button key={i} className={`h-4 w-4 rounded-full border-2 transition-transform hover:scale-125 ${c} ${i === colorIndex ? 'ring-2 ring-offset-1 ring-primary scale-110' : ''}`} onClick={() => handleColorChange(i)} />
              ))}
            </div>
            {!editing ? (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave}>
                <Save className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        {editing ? (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="bg-white/50 dark:bg-black/20 border-dashed resize-none"
            autoFocus
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
        )}
      </CardContent>
    </Card>
  );
}
