import { Printer, ZoomIn, ZoomOut } from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Renderer, Stave, StaveConnector } from 'vexflow';
import { instrumentLabel } from '../domain/instruments';
import type { ScoreModel } from '../domain/score';
import { ROLE_LABELS, type Role } from '../domain/types';
import {
  clefForScore,
  createVexState,
  drawMeasure,
  drawRepeaterLabels,
  drawTies,
} from '../render/vexScore';

const ROLE_ORDER: Role[] = ['melody', 'chords', 'bass', 'drums'];
type Orientation = 'landscape' | 'portrait';

const LEFT_MARGIN = 112;
const RIGHT_MARGIN = 18;
const MEASURE_WIDTH = 240;
const TOP_MARGIN = 26;
const STAFF_GAP = 166;
const BOTTOM_MARGIN = 36;
const MEASURE_OPTIONS = [2, 3, 4, 6];
const MEASURE_LABELS: Record<number, string> = {
  2: '2 bars — largest print',
  3: '3 bars — medium',
  4: '4 bars — compact',
  6: '6 bars — condensed',
};
const PRINT_SYSTEM_MARGIN = 24;

interface FullScoreViewProps {
  scores: Partial<Record<Role, ScoreModel>>;
  title: string;
}

interface SystemProps {
  systemIndex: number;
  roles: Role[];
  scores: Partial<Record<Role, ScoreModel>>;
  measuresPerSystem: number;
  showClicks: boolean;
  showRepeaters: boolean;
}

function SystemScore({
  systemIndex,
  roles,
  scores,
  measuresPerSystem,
  showClicks,
  showRepeaters,
}: SystemProps) {
  const host = useRef<HTMLDivElement>(null);
  const width = LEFT_MARGIN + measuresPerSystem * MEASURE_WIDTH + RIGHT_MARGIN;
  const height = TOP_MARGIN + roles.length * STAFF_GAP + BOTTOM_MARGIN;
  const roleKey = roles.join(',');

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    element.innerHTML = '';

    const renderer = new Renderer(element, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const context = renderer.getContext();
    const svg = element.querySelector('svg');
    if (svg) {
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.style.width = '100%';
      svg.style.height = 'auto';
    }

    const state = createVexState();
    const firstStaves: Stave[] = [];

    roles.forEach((role, partIndex) => {
      const score = scores[role];
      if (!score) return;
      const clef = clefForScore(score);
      const y = TOP_MARGIN + partIndex * STAFF_GAP;

      context.save();
      context.setFont('Plus Jakarta Sans, sans-serif', 10, 'bold');
      context.setFillStyle('#141824');
      context.fillText(ROLE_LABELS[role], 8, y + 32);
      context.setFont('Plus Jakarta Sans, sans-serif', 8, 'normal');
      context.setFillStyle('#64748b');
      context.fillText(
        score.instrument ? instrumentLabel(score.instrument) : 'Percussion',
        8,
        y + 46,
      );
      context.restore();

      for (let column = 0; column < measuresPerSystem; column += 1) {
        const measureIndex = systemIndex * measuresPerSystem + column;
        const x = LEFT_MARGIN + column * MEASURE_WIDTH;
        const stave = new Stave(x, y, MEASURE_WIDTH);
        if (column === 0) stave.addClef(clef);
        if (systemIndex === 0 && column === 0) {
          stave.addTimeSignature(`${score.numerator}/${score.denominator}`);
        }
        stave.setContext(context).draw();
        if (column === 0) firstStaves.push(stave);

        const measure = score.measures[measureIndex];
        if (measure) {
          drawMeasure(
            context,
            stave,
            score,
            measure,
            clef,
            state,
            `s${systemIndex}-p${partIndex}`,
            { showClicks, showRepeaters },
          );
        }
      }
    });

    if (firstStaves.length > 1) {
      new StaveConnector(firstStaves[0], firstStaves[firstStaves.length - 1])
        .setType('bracket')
        .setContext(context)
        .draw();
    }

    drawTies(context, state.ties);
    drawRepeaterLabels(context, state);
  }, [
    systemIndex,
    scores,
    roles,
    roleKey,
    width,
    height,
    measuresPerSystem,
    showClicks,
    showRepeaters,
  ]);

  return (
    <div className="score-system">
      <div ref={host} />
    </div>
  );
}

export function FullScoreView({ scores, title }: FullScoreViewProps) {
  const [measuresPerSystem, setMeasuresPerSystem] = useState(4);
  const [zoom, setZoom] = useState(1);
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [showClicks, setShowClicks] = useState(true);
  const [showRepeaters, setShowRepeaters] = useState(true);

  const roles = useMemo(
    () => ROLE_ORDER.filter((role) => scores[role] && !scores[role]!.empty),
    [scores],
  );

  if (roles.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Assign at least one MIDI track to a role to preview the printable full score.
      </section>
    );
  }

  const firstScore = scores[roles[0]]!;
  const maxMeasures = Math.max(
    ...roles.map((role) => scores[role]?.measures.length ?? 0),
  );
  const systemCount = Math.ceil(maxMeasures / measuresPerSystem);
  const systemWidth = LEFT_MARGIN + measuresPerSystem * MEASURE_WIDTH + RIGHT_MARGIN;
  const systemHeight = TOP_MARGIN + roles.length * STAFF_GAP + BOTTOM_MARGIN;

  const pageWidthMm = orientation === 'landscape' ? 297 : 210;
  const pageHeightMm = orientation === 'landscape' ? 210 : 297;
  const pageWidthPx = ((pageWidthMm - 20) * 96) / 25.4;
  const pageHeightPx = ((pageHeightMm - 20) * 96) / 25.4;
  const printScale = Math.min(1, pageWidthPx / systemWidth);
  const printedSystemHeight = systemHeight * printScale + PRINT_SYSTEM_MARGIN;
  const systemsPerPage = Math.max(1, Math.floor(pageHeightPx / printedSystemHeight));
  const pageCount = Math.ceil(systemCount / systemsPerPage);

  const pages: number[][] = [];
  for (let start = 0; start < systemCount; start += systemsPerPage) {
    pages.push(
      Array.from(
        { length: Math.min(systemsPerPage, systemCount - start) },
        (_, offset) => start + offset,
      ),
    );
  }

  return (
    <section
      className="print-only-container rounded-xl border border-slate-200 bg-slate-100 p-5"
      style={
        {
          ['--preview-zoom' as string]: zoom,
          ['--page-width' as string]: `${pageWidthMm}mm`,
          ['--page-height' as string]: `${pageHeightMm}mm`,
          ['--page-ratio' as string]: `${pageWidthMm} / ${pageHeightMm}`,
        } as CSSProperties
      }
    >
      <style>{`@media print { @page { size: A4 ${orientation}; margin: 0; } }`}</style>

      <header className="no-print mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Full Score Print Preview
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
            {title} · {roles.length} part{roles.length === 1 ? '' : 's'} ·{' '}
            {firstScore.numerator}/{firstScore.denominator} · {pageCount} A4 page
            {pageCount === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={showClicks}
              onChange={(e) => setShowClicks(e.target.checked)}
              className="accent-emerald-700"
            />
            Click counts
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={showRepeaters}
              onChange={(e) => setShowRepeaters(e.target.checked)}
              className="accent-emerald-700"
            />
            Repeaters
          </label>

          <div
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"
            role="group"
            aria-label="Preview zoom"
          >
            <button
              type="button"
              onClick={() => setZoom((v) => Math.max(0.75, v - 0.25))}
              className="flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-slate-100"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="w-11 text-center font-mono text-xs text-slate-700 tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((v) => Math.min(2.5, v + 0.25))}
              className="flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-slate-100"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <select
            aria-label="Page orientation"
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as Orientation)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
          >
            <option value="landscape">A4 Landscape</option>
            <option value="portrait">A4 Portrait</option>
          </select>

          <select
            aria-label="Measures per system"
            value={measuresPerSystem}
            onChange={(e) => setMeasuresPerSystem(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
          >
            {MEASURE_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {MEASURE_LABELS[count] ?? count}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 whitespace-nowrap shrink-0"
          >
            <Printer className="h-3.5 w-3.5" />
            Print full score
          </button>
        </div>
      </header>

      <div className="print-preview-scroll overflow-x-auto pb-2">
        {pages.map((systemIndexes, pageIndex) => (
          <div className="print-page" key={`page-${pageIndex}`}>
            {pageIndex === 0 && (
              <div className="mb-1.5 flex items-baseline justify-between border-b border-slate-200 pb-1">
                <span className="font-display text-xs font-bold text-slate-900">
                  {title} — Minecraft Note Block Score
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  {firstScore.numerator}/{firstScore.denominator}
                </span>
              </div>
            )}
            <div className="print-page-content">
              {systemIndexes.map((systemIndex) => (
                <SystemScore
                  key={`${systemIndex}-${measuresPerSystem}-${showClicks}-${showRepeaters}`}
                  systemIndex={systemIndex}
                  roles={roles}
                  scores={scores}
                  measuresPerSystem={measuresPerSystem}
                  showClicks={showClicks}
                  showRepeaters={showRepeaters}
                />
              ))}
            </div>
            <span className="absolute right-[10mm] bottom-[6mm] font-mono text-[9px] text-slate-500 tabular-nums">
              {pageIndex + 1} / {pages.length}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
