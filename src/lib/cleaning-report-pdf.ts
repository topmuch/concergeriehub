// =============================================================
// v4.53 « HISTORIQUE D'ÉTAT DES LIEUX EN PHOTOS HORODATÉES »
// CLIENT ONLY (jspdf) — en cas de litige avec un client au sujet de
// la propreté, l'hôte extrait EN UN CLIC le rapport visuel horodaté
// du ménage : photos de l'appartement propre + heures serveur + GPS
// de l'équipe, prêtes à joindre à un dossier Airbnb/assurance.
// =============================================================
import jsPDF from 'jspdf';
import { pdfFooter, pdfHeader, toPdfReadyImage, wrapText } from '@/lib/pdf-image';

export interface CleaningPdfReport {
  propertyName: string | null;
  staffName: string | null;
  checklist: { label: string; done: boolean }[];
  photos: string[];
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  /** v4.50 — preuve de présence GPS (optionnelle). */
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
}

function frDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function generateCleaningReportPdf(report: CleaningPdfReport): Promise<jsPDF> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const marginX = 14;
  const usable = 182;
  const endIso = report.endedAt ?? report.createdAt;
  const startIso = report.startedAt ?? endIso;

  let y = pdfHeader(
    pdf,
    'État des lieux — preuve visuelle',
    'Rapport de ménage horodaté',
    `${report.propertyName ?? 'Logement'} · validé le ${frDateTime(endIso)}`,
  );

  // ── Bloc horodatage + agent + GPS ──
  const durationMin =
    report.startedAt && report.endedAt
      ? Math.max(0, Math.round((new Date(report.endedAt).getTime() - new Date(report.startedAt).getTime()) / 60_000))
      : null;
  const infoRows: [string, string][] = [
    ['Agent de ménage', report.staffName || 'Équipe ménage'],
    ['Arrivée (horodatée)', frDateTime(startIso)],
    ['Validation (horodatée)', frDateTime(endIso)],
    ...(durationMin != null ? ([['Durée d’intervention', `${durationMin} min`]] as [string, string][]) : []),
    ...(report.startLat != null && report.startLng != null
      ? ([[ 'Position GPS (arrivée)', `${report.startLat.toFixed(5)}, ${report.startLng.toFixed(5)}` ]] as [string, string][])
      : []),
  ];
  pdf.setDrawColor(226, 232, 240);
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(marginX, y - 4, usable, infoRows.length * 8 + 6, 2, 2, 'FD');
  for (const [label, value] of infoRows) {
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${label} :`, marginX + 3, y + 2);
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.text(wrapText(pdf, value, usable - 66), marginX + 52, y + 2);
    y += 8;
  }
  y += 8;

  // ── Checklist validée (résumé compact) ──
  if (report.checklist.length > 0) {
    const done = report.checklist.filter((c) => c.done).length;
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Checklist validée — ${done}/${report.checklist.length} points`, marginX, y);
    y += 5;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(51, 65, 85);
    const items = report.checklist
      .slice(0, 20)
      .map((c) => `${c.done ? '✓' : '✗'} ${c.label}`)
      .join('  ·  ');
    for (const line of wrapText(pdf, items, usable)) {
      if (y > 262) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(line, marginX, y);
      y += 4.4;
    }
    y += 4;
  }

  // ── Photos horodatées (preuve visuelle) ──
  if (report.photos.length > 0) {
    pdf.addPage();
    y = 20;
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Photos de l'appartement propre (${report.photos.length})`, marginX, y);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      'Horodatage serveur RoomScan — prises au moment de la validation du ménage.',
      marginX,
      y + 5,
    );
    y += 12;

    for (let i = 0; i < report.photos.length; i += 1) {
      const imgH = 96;
      if (y + imgH > 268) {
        pdf.addPage();
        y = 20;
      }
      try {
        const ready = await toPdfReadyImage(report.photos[i]);
        if (ready) {
          pdf.addImage(ready.dataUrl, ready.format, marginX, y, usable, imgH, undefined, 'FAST');
        }
      } catch {
        // photo illisible → cadran + légende quand même
      }
      pdf.setDrawColor(226, 232, 240);
      pdf.rect(marginX, y, usable, imgH);
      pdf.setFontSize(8.5);
      pdf.setTextColor(71, 85, 105);
      pdf.text(
        `Photo ${i + 1}/${report.photos.length} — prise le ${frDateTime(endIso)} (validation ${report.staffName || 'équipe ménage'})`,
        marginX,
        y + imgH + 5,
      );
      y += imgH + 12;
    }
  }

  pdfFooter(
    pdf,
    "Preuve visuelle horodatée du ménage — exploituable en cas de litige propreté — RoomScan",
  );
  return pdf;
}

export async function downloadCleaningReportPdf(report: CleaningPdfReport): Promise<void> {
  const pdf = await generateCleaningReportPdf(report);
  const d = new Date(report.endedAt ?? report.createdAt);
  const stamp = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  pdf.save(`etat-des-lieux-menage-${stamp}.pdf`);
}
