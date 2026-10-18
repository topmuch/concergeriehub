'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// =============================================================
// v5.0 « ÉTAT DES LIEUX DE SORTIE » — SignaturePad
// Canvas de signature au doigt / stylet (pointer events) :
//  • devicePixelRatio → trait net sur écrans Retina ;
//  • trait 2,2 px arrondi (lineCap/lineJoin round) sur fond blanc ;
//  • vide par défaut — le formulaire reste désactivé sans signature ;
//  • bouton « Effacer » (+ accessible clavier) ;
//  • export PNG dataURL via onChange(dataUrl | null).
// Compact (~300 px de haut), responsive, touch-action:none pour
// empêcher le scroll de la page pendant le tracé.
// =============================================================

const CANVAS_HEIGHT = 260; // hauteur interne (CSS ~ responsive)

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  // v4.81 (AUDIT QA) — flag ref : un simple TAP sans tracé ne doit JAMAIS
  // produire une signature (canvas blanc accepté comme « signé »). Le ref
  // est lu de façon synchrone dans endStroke (le state peut être stale
  // dans le même batch d'événements pointer).
  const hasInkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Initialisation : dimensions réelles × DPR, fond blanc, pointer events.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const width = canvas.clientWidth || 320;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(CANVAS_HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, CANVAS_HEIGHT);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * (canvas.width / (window.devicePixelRatio || 1)),
      y: ((e.clientY - rect.top) / rect.height) * (canvas.height / (window.devicePixelRatio || 1)),
    };
  };

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      onChange(canvas.toDataURL('image/png'));
    } catch {
      onChange(null);
    }
  }, [onChange]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = pointOf(e);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    const from = lastPoint.current;
    if (!ctx || !from) return;
    const to = pointOf(e);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    lastPoint.current = to;
    if (!hasInkRef.current) {
      hasInkRef.current = true;
      setHasInk(true);
    }
  };

  const endStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    // v4.81 — anti-canvas-blanc : sans encre, on remonte null (le
    // formulaire parent reste désactivé, le PDF n'a jamais de signature vide).
    if (hasInkRef.current) emit();
    else onChange(null);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.scale(dpr, dpr);
    hasInkRef.current = false;
    setHasInk(false);
    onChange(null);
  };

  return (
    <div>
      <div className="rounded-xl border border-slate-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-[#0066EF]/50">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Zone de signature — dessinez votre signature avec le doigt ou le stylet"
          style={{ height: CANVAS_HEIGHT, touchAction: 'none' }}
          className="block w-full cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500 leading-snug">
          {hasInk ? 'Signature enregistrée ✓' : 'Signez ci-dessus avec votre doigt'}
        </p>
        <button
          type="button"
          onClick={clear}
          className="min-h-[44px] px-4 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
        >
          Effacer
        </button>
      </div>
    </div>
  );
}
