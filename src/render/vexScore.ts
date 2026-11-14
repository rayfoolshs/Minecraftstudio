import {
  Accidental,
  Annotation,
  Beam,
  Dot,
  Formatter,
  Fraction,
  StaveNote,
  StaveTie,
  Voice,
} from 'vexflow';
import type { Renderer, Stave } from 'vexflow';
import { vexDurationForTicks, type ScoreMeasure, type ScoreModel } from '../domain/score';

export type VexContext = ReturnType<Renderer['getContext']>;

export interface VexTie {
  first: StaveNote | null;
  last: StaveNote | null;
  indices: number[];
}

export interface VexLabel {
  note: StaveNote;
  text: string;
  tooFast: boolean;
  staveTopY: number;
  staveBottomY: number;
  laneKey: string;
}

export interface VexState {
  lastByNote: Map<number, { note: StaveNote; laneKey: string }>;
  ties: VexTie[];
  labels: VexLabel[];
  notesByLane: Map<string, StaveNote[]>;
  staves: Map<string, { top: number; bottom: number }>;
}

const SHARP_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const LETTERS = ['c', 'c', 'd', 'd', 'e', 'f', 'f', 'g', 'g', 'a', 'a', 'b'];

export const DRUM_LABELS: Record<string, string> = {
  basedrum: 'K',
  snare: 'S',
  hat: 'H',
};

export function createVexState(): VexState {
  return {
    lastByNote: new Map(),
    ties: [],
    labels: [],
    notesByLane: new Map(),
    staves: new Map(),
  };
}

function noteKey(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${LETTERS[pitchClass]}/${octave}`;
}

function annotation(text: string, position: 'top' | 'bottom'): Annotation {
  return new Annotation(text)
    .setFont('JetBrains Mono, monospace', 8, '600')
    .setVerticalJustification(
      position === 'top'
        ? Annotation.VerticalJustify.TOP
        : Annotation.VerticalJustify.BOTTOM,
    );
}

export function clefForScore(score: ScoreModel): 'treble' | 'bass' | 'percussion' {
  if (score.role === 'drums') return 'percussion';
  const pitches = score.measures.flatMap((measure) =>
    measure.notes.flatMap((note) => note.midiOut),
  );
  if (pitches.length === 0) return 'treble';
  const average = pitches.reduce((sum, midi) => sum + midi, 0) / pitches.length;
  return average < 57 ? 'bass' : 'treble';
}

export interface DrawMeasureOptions {
  showClicks?: boolean;
  showRepeaters?: boolean;
}

export function drawMeasure(
  context: VexContext,
  stave: Stave,
  score: ScoreModel,
  measure: ScoreMeasure,
  clef: 'treble' | 'bass' | 'percussion',
  state: VexState,
  laneKey: string,
  options: DrawMeasureOptions = {},
): void {
  const showClicks = options.showClicks ?? true;
  const showRepeaters = options.showRepeaters ?? true;

  if (measure.segments.length === 0) return;
  if (!state.staves.has(laneKey)) {
    state.staves.set(laneKey, {
      top: stave.getTopLineTopY(),
      bottom: stave.getBottomLineY(),
    });
  }

  const staveNotes: StaveNote[] = [];
  const beamed: StaveNote[] = [];

  for (const segment of measure.segments) {
    const { duration, dotted } = vexDurationForTicks(segment.durationTicks, score.ppq);
    if (segment.kind === 'rest') {
      const rest = new StaveNote({
        keys: ['b/4'],
        duration: `${duration}r`,
        clef,
      });
      if (dotted) rest.addModifier(new Dot(), 0);
      staveNotes.push(rest);
      continue;
    }

    const keys = score.role === 'drums' ? ['b/4'] : segment.midiOut.map(noteKey);
    const staveNote = new StaveNote({ keys, duration, clef });

    if (dotted) {
      for (let index = 0; index < keys.length; index += 1) {
        staveNote.addModifier(new Dot(), index);
      }
    }

    if (score.role !== 'drums') {
      keys.forEach((_key, index) => {
        const midi = segment.midiOut[index];
        const pitchClass = ((midi % 12) + 12) % 12;
        if (SHARP_PITCH_CLASSES.has(pitchClass)) {
          staveNote.addModifier(new Accidental('#'), index);
        }
      });
    }

    if (!segment.tieFrom) {
      if (showClicks) {
        const clickLabel =
          score.role === 'drums'
            ? segment.instruments
                .map((instrument) => DRUM_LABELS[instrument] ?? 'S')
                .join('·')
            : segment.clicks
                .map((clicks) => (clicks === null ? '?' : String(clicks)))
                .join('·');
        staveNote.addModifier(annotation(clickLabel, 'top'), 0);
      }

      if (showRepeaters && segment.repeaters) {
        const repeaterLabel = segment.repeaters.tooFast
          ? 'R!'
          : segment.repeaters.count > 0
            ? `R${segment.repeaters.count}`
            : '';
        if (repeaterLabel) {
          state.labels.push({
            note: staveNote,
            text: repeaterLabel,
            tooFast: segment.repeaters.tooFast,
            staveTopY: stave.getTopLineTopY(),
            staveBottomY: stave.getBottomLineY(),
            laneKey,
          });
        }
      }
    }

    const indices = keys.map((_key, index) => index);
    if (segment.tieFrom && segment.noteId !== null) {
      const previous = state.lastByNote.get(segment.noteId);
      if (previous) {
        if (previous.laneKey === laneKey) {
          state.ties.push({ first: previous.note, last: staveNote, indices });
        } else {
          state.ties.push({ first: previous.note, last: null, indices });
          state.ties.push({ first: null, last: staveNote, indices });
        }
      }
    }

    if (segment.noteId !== null) {
      state.lastByNote.set(segment.noteId, { note: staveNote, laneKey });
    }

    staveNotes.push(staveNote);
    beamed.push(staveNote);
    const laneNotes = state.notesByLane.get(laneKey) ?? [];
    laneNotes.push(staveNote);
    state.notesByLane.set(laneKey, laneNotes);
  }

  const voice = new Voice({
    numBeats: score.numerator,
    beatValue: score.denominator,
  }).setMode(Voice.Mode.SOFT);
  voice.addTickables(staveNotes);
  new Formatter().joinVoices([voice]).formatToStave([voice], stave);
  voice.draw(context, stave);

  const beams = Beam.generateBeams(beamed, { groups: [new Fraction(1, 4)] });
  beams.forEach((beam) => beam.setContext(context).draw());
}

export function drawTies(context: VexContext, ties: VexTie[]): void {
  ties.forEach(({ first, last, indices }) => {
    new StaveTie({
      firstNote: first,
      lastNote: last,
      firstIndexes: indices,
      lastIndexes: indices,
    })
      .setContext(context)
      .draw();
  });
}

export function drawRepeaterLabels(context: VexContext, state: VexState): void {
  if (state.labels.length === 0) return;

  const byLane = new Map<string, VexLabel[]>();
  for (const label of state.labels) {
    const list = byLane.get(label.laneKey) ?? [];
    list.push(label);
    byLane.set(label.laneKey, list);
  }

  interface Lane {
    labels: VexLabel[];
    staveTop: number;
    staveBottom: number;
    lowestInk: number;
    highestInk: number;
  }

  const lanes: Lane[] = [];
  for (const [laneKey, geometry] of state.staves.entries()) {
    const labels = byLane.get(laneKey) ?? [];
    const staveTop = geometry.top;
    const staveBottom = geometry.bottom;
    let lowestInk = staveBottom;
    let highestInk = staveTop;

    for (const note of state.notesByLane.get(laneKey) ?? []) {
      for (const y of note.getYs()) {
        lowestInk = Math.max(lowestInk, y);
        highestInk = Math.min(highestInk, y);
      }
      try {
        const stem = note.getStemExtents();
        lowestInk = Math.max(lowestInk, stem.topY, stem.baseY);
        highestInk = Math.min(highestInk, stem.topY, stem.baseY);
      } catch {
        // Whole notes have no stem extents.
      }
    }
    lanes.push({ labels, staveTop, staveBottom, lowestInk, highestInk });
  }

  lanes.sort((a, b) => a.staveTop - b.staveTop);
  context.save();
  context.setFont('JetBrains Mono, monospace', 8, '500');

  for (let index = 0; index < lanes.length; index += 1) {
    const lane = lanes[index];
    if (lane.labels.length === 0) continue;
    let laneY = Math.max(lane.staveBottom + 22, lane.lowestInk + 26);
    const next = lanes[index + 1];
    if (next) {
      laneY = Math.min(laneY, next.highestInk - 26);
    }
    laneY = Math.max(lane.staveBottom + 12, laneY);

    let lastX = Number.NEGATIVE_INFINITY;
    let offset = 0;

    for (const { note, text, tooFast } of lane.labels) {
      const x = note.getAbsoluteX() + 6;
      if (x - lastX < 20) {
        offset = offset === 0 ? 10 : 0;
      } else {
        offset = 0;
      }

      const width = context.measureText(text).width;
      const left = x - width / 2;
      const top = laneY + offset;

      context.setFillStyle('#ffffff');
      context.fillRect(left - 3, top - 8, width + 6, 12);
      context.setFillStyle(tooFast ? '#b45309' : '#39414f');
      context.fillText(text, left, top);
      lastX = x;
    }
  }
  context.restore();
}
