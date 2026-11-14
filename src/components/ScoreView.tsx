import { useEffect, useRef } from 'react';
import { Renderer, Stave } from 'vexflow';
import { describeShift } from '../domain/fit';
import { INSTRUMENTS, instrumentLabel, pitchName } from '../domain/instruments';
import type { ScoreModel } from '../domain/score';
import {
  clefForScore,
  createVexState,
  drawMeasure,
  drawRepeaterLabels,
  drawTies,
} from '../render/vexScore';

interface ScoreViewProps {
  score: ScoreModel;
  title: string;
  activeMeasureIndex: number | null;
  showClicks?: boolean;
  showRepeaters?: boolean;
  onSeekMeasure?: (measureIndex: number) => void;
}

export function ScoreView({
  score,
  title,
  activeMeasureIndex,
  showClicks = true,
  showRepeaters = true,
  onSeekMeasure,
}: ScoreViewProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    element.innerHTML = '';
    if (score.empty) return;

    const measuresPerRow = 2;
    const measureWidth = 480;
    const rowHeight = 216;
    const margin = 12;
    const rows = Math.ceil(score.measures.length / measuresPerRow);
    const width = measuresPerRow * measureWidth + margin * 2;
    const height = rows * rowHeight + 36;

    const renderer = new Renderer(element, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const context = renderer.getContext();
    const svg = element.querySelector('svg');
    if (svg) {
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.style.width = '100%';
      svg.style.height = 'auto';
    }

    const clef = clefForScore(score);
    const state = createVexState();

    // Draw interactive hit targets & active measure highlight behind staves
    if (svg) {
      const ns = 'http://www.w3.org/2000/svg';
      const bgGroup = document.createElementNS(ns, 'g');
      score.measures.forEach((measure, measureIndex) => {
        const row = Math.floor(measureIndex / measuresPerRow);
        const column = measureIndex % measuresPerRow;
        const x = margin + column * measureWidth;
        const y = 26 + row * rowHeight;
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y - 12));
        rect.setAttribute('width', String(measureWidth));
        rect.setAttribute('height', String(rowHeight - 28));
        rect.setAttribute('rx', '6');
        const isActive = activeMeasureIndex === measureIndex;
        rect.setAttribute('fill', isActive ? 'rgba(22, 163, 74, 0.08)' : 'transparent');
        rect.setAttribute(
          'stroke',
          isActive ? 'rgba(22, 163, 74, 0.45)' : 'transparent',
        );
        rect.setAttribute('stroke-width', '1.5');
        if (onSeekMeasure) {
          rect.style.cursor = 'pointer';
          rect.addEventListener('click', () => onSeekMeasure(measureIndex));
        }
        bgGroup.appendChild(rect);
      });
      svg.appendChild(bgGroup);
    }

    score.measures.forEach((measure, measureIndex) => {
      const row = Math.floor(measureIndex / measuresPerRow);
      const column = measureIndex % measuresPerRow;
      const x = margin + column * measureWidth;
      const y = 28 + row * rowHeight;

      const stave = new Stave(x, y, measureWidth);
      if (column === 0) stave.addClef(clef);
      if (measureIndex === 0) {
        stave.addTimeSignature(`${score.numerator}/${score.denominator}`);
      }
      stave.setContext(context).draw();

      // Subtle bar number above top-left of stave
      context.save();
      context.setFont('JetBrains Mono, monospace', 9, '500');
      context.setFillStyle(
        activeMeasureIndex === measureIndex ? '#15803d' : '#64748b',
      );
      context.fillText(`m.${measureIndex + 1}`, x + 4, y + 4);
      context.restore();

      drawMeasure(context, stave, score, measure, clef, state, `row-${row}`, {
        showClicks,
        showRepeaters,
      });
    });

    drawTies(context, state.ties);
    drawRepeaterLabels(context, state);
  }, [score, activeMeasureIndex, showClicks, showRepeaters, onSeekMeasure]);

  const instrument = score.instrument ? INSTRUMENTS[score.instrument] : null;
  const allNotes = score.measures.flatMap((measure) => measure.notes);
  const highest = allNotes.length
    ? Math.max(...allNotes.flatMap((note) => note.midiOut))
    : null;
  const totalRepeaters = allNotes.reduce(
    (sum, note) => sum + (note.repeaters?.count ?? 0),
    0,
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-slate-900">{title}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {score.role === 'drums' ? (
              <span>Percussion · K kick · S snare · H hat (no tuning clicks)</span>
            ) : (
              <>
                <span>{instrumentLabel(score.instrument)}</span>
                <span aria-hidden="true">·</span>
                <span>{describeShift(score.shift)}</span>
                {instrument && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Place on {instrument.block}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs text-slate-500 tabular-nums">
          <span>{score.measures.length} bars</span>
          <span aria-hidden="true">·</span>
          <span>{totalRepeaters} repeaters</span>
          {score.tooFastCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-amber-700">
                {score.tooFastCount} R! fast gaps
              </span>
            </>
          )}
        </div>
      </header>

      <div className="score-canvas max-h-[520px] overflow-auto py-1" ref={host} />

      {score.empty && (
        <p className="py-6 text-center text-sm text-slate-500">
          No notes assigned to this part.
        </p>
      )}

      {!score.empty && (
        <p className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
          <strong className="font-semibold text-slate-700">Numbers above</strong> =
          right-clicks from a fresh block.{' '}
          <strong className="font-semibold text-slate-700">R n below</strong> = redstone
          repeaters between triggers (1 tick = 0.1 s, max 4 ticks/repeater).{' '}
          <strong className="font-semibold text-amber-700">R!</strong> = faster than 0.1 s.
          {onSeekMeasure && ' Click any bar to play from there.'}
          {highest !== null && score.role !== 'drums'
            ? ` Highest note: ${pitchName(highest)}.`
            : ''}
        </p>
      )}
    </section>
  );
}
