import type { Placement } from './fit';
import type { InstrumentId } from './instruments';
import { repeatersForDelay, type RepeaterPlan } from './redstone';
import { ticksToSeconds, type Role, type TempoEvent } from './types';

export interface ScoreNote {
  startTicks: number;
  durationTicks: number;
  midiOut: number[];
  clicks: (number | null)[];
  instruments: InstrumentId[];
  /** Repeater chain needed since the previous note; null for the first note. */
  repeaters: RepeaterPlan | null;
}

export interface ScoreSegment {
  kind: 'note' | 'rest';
  startTicks: number;
  durationTicks: number;
  noteId: number | null;
  midiOut: number[];
  clicks: (number | null)[];
  instruments: InstrumentId[];
  repeaters: RepeaterPlan | null;
  tieFrom: boolean;
  tieTo: boolean;
}

export interface ScoreMeasure {
  index: number;
  startTicks: number;
  ticks: number;
  notes: ScoreNote[];
  segments: ScoreSegment[];
}

export interface ScoreModel {
  role: Role;
  instrument: InstrumentId | null;
  shift: number;
  ppq: number;
  grid: number;
  measureTicks: number;
  numerator: number;
  denominator: number;
  measures: ScoreMeasure[];
  empty: boolean;
  minGapSeconds: number | null;
  tooFastCount: number;
}

const VALUES_IN_BEATS = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.125];
const VEX_BY_BEATS: Record<string, string> = {
  '4': 'w',
  '3': 'hd',
  '2': 'h',
  '1.5': 'qd',
  '1': 'q',
  '0.75': '8d',
  '0.5': '8',
  '0.375': '16d',
  '0.25': '16',
  '0.125': '32',
};

export interface VexDuration {
  duration: string;
  dotted: boolean;
}

export function vexDurationForTicks(ticks: number, ppq: number): VexDuration {
  const beats = ticks / ppq;
  const key = String(Math.round(beats * 1000) / 1000);
  const duration = VEX_BY_BEATS[key];
  if (duration) {
    return { duration: duration.replace(/d$/, ''), dotted: duration.endsWith('d') };
  }
  return durationToVex(ticks, ppq);
}

export function durationToVex(ticks: number, ppq: number): VexDuration {
  const whole = ppq * 4;
  const ratio = ticks / whole;
  let best = { duration: '32', dotted: false };
  let bestError = Infinity;
  for (const [key, value] of Object.entries(VEX_BY_BEATS)) {
    const beats = Number(key);
    const error = Math.abs(beats / 4 - ratio);
    if (error < bestError) {
      best = { duration: value.replace(/d$/, ''), dotted: value.endsWith('d') };
      bestError = error;
    }
  }
  return best;
}

export function splitValue(
  startTicks: number,
  durationTicks: number,
  ppq: number,
  barEnd: number,
): number[] {
  const parts: number[] = [];
  let position = startTicks;
  let remaining = durationTicks;
  let guard = 0;
  while (remaining > 0 && guard < 64) {
    guard += 1;
    const offBeat = position % ppq;
    const toBeat = offBeat === 0 ? Number.POSITIVE_INFINITY : ppq - offBeat;
    const max = Math.min(remaining, toBeat, barEnd - position);
    let chosen = 0;
    for (const beats of VALUES_IN_BEATS) {
      const ticks = beats * ppq;
      if (ticks <= max + 0.5) {
        chosen = ticks;
        break;
      }
    }
    if (chosen <= 0) chosen = max;
    parts.push(chosen);
    position += chosen;
    remaining -= chosen;
  }
  return parts;
}

export interface BuildScoreOptions {
  ppq: number;
  numerator: number;
  denominator: number;
  role: Role;
  instrument: InstrumentId | null;
  shift: number;
  tempos: TempoEvent[];
}

export function buildScore(
  placements: Placement[],
  options: BuildScoreOptions,
): ScoreModel {
  const { ppq, numerator, denominator, role, instrument, shift, tempos } = options;
  const grid = Math.max(1, Math.round(ppq / 4));
  const measureTicks = Math.max(1, Math.round((ppq * 4 * numerator) / denominator));

  if (placements.length === 0) {
    return {
      role,
      instrument,
      shift,
      ppq,
      grid,
      measureTicks,
      numerator,
      denominator,
      measures: [],
      empty: true,
      minGapSeconds: null,
      tooFastCount: 0,
    };
  }

  const grouped = new Map<number, ScoreNote>();
  for (const placement of placements) {
    if (placement.clicks === null && role !== 'drums') continue;
    const start = Math.max(0, Math.round(placement.note.startTicks / grid) * grid);
    const duration = Math.max(
      grid,
      Math.round(placement.note.durationTicks / grid) * grid,
    );
    const existing = grouped.get(start);
    if (existing) {
      if (!existing.midiOut.includes(placement.midiOut)) {
        existing.midiOut.push(placement.midiOut);
        existing.clicks.push(placement.clicks);
        existing.instruments.push(placement.instrument);
      }
      existing.durationTicks = Math.max(existing.durationTicks, duration);
    } else {
      grouped.set(start, {
        startTicks: start,
        durationTicks: duration,
        midiOut: [placement.midiOut],
        clicks: [placement.clicks],
        instruments: [placement.instrument],
        repeaters: null,
      });
    }
  }

  const notes = [...grouped.values()].sort((a, b) => a.startTicks - b.startTicks);
  if (notes.length === 0) {
    return {
      role,
      instrument,
      shift,
      ppq,
      grid,
      measureTicks,
      numerator,
      denominator,
      measures: [],
      empty: true,
      minGapSeconds: null,
      tooFastCount: 0,
    };
  }

  for (const note of notes) {
    const order = note.midiOut
      .map((midi, index) => ({ midi, index }))
      .sort((a, b) => b.midi - a.midi);
    note.midiOut = order.map((entry) => entry.midi);
    note.clicks = order.map((entry) => note.clicks[entry.index]);
    note.instruments = order.map((entry) => note.instruments[entry.index]);
  }

  let previousStart: number | null = null;
  let minGapSeconds: number | null = null;
  let tooFastCount = 0;

  for (const note of notes) {
    if (previousStart === null) {
      note.repeaters = null;
    } else {
      const gap =
        ticksToSeconds(note.startTicks, ppq, tempos) -
        ticksToSeconds(previousStart, ppq, tempos);
      if (gap > 0) {
        minGapSeconds = minGapSeconds === null ? gap : Math.min(minGapSeconds, gap);
      }
      note.repeaters = repeatersForDelay(gap);
      if (note.repeaters.tooFast) tooFastCount += 1;
    }
    previousStart = note.startTicks;
  }

  const spans = notes.map((note, index) => {
    const nextStart = notes[index + 1]?.startTicks ?? Number.POSITIVE_INFINITY;
    const end = Math.min(note.startTicks + note.durationTicks, nextStart);
    return {
      note,
      id: index,
      start: note.startTicks,
      end: Math.max(end, note.startTicks + grid),
    };
  });

  const lastEnd = Math.max(...spans.map((span) => span.end));
  const measureCount = Math.max(1, Math.ceil(lastEnd / measureTicks));
  const measures: ScoreMeasure[] = [];

  for (let index = 0; index < measureCount; index += 1) {
    const barStart = index * measureTicks;
    const barEnd = barStart + measureTicks;
    const segments: ScoreSegment[] = [];
    let cursor = barStart;

    for (const span of spans) {
      if (span.end <= barStart || span.start >= barEnd) continue;
      const start = Math.max(span.start, barStart);
      const end = Math.min(span.end, barEnd);
      if (start > cursor) {
        pushRests(segments, cursor, start, ppq, barEnd);
      }
      let position = start;
      for (const part of splitValue(start, end - start, ppq, barEnd)) {
        segments.push({
          kind: 'note',
          startTicks: position,
          durationTicks: part,
          noteId: span.id,
          midiOut: span.note.midiOut,
          clicks: span.note.clicks,
          instruments: span.note.instruments,
          repeaters: position === span.start ? span.note.repeaters : null,
          tieFrom: position > span.start,
          tieTo: position + part < span.end,
        });
        position += part;
      }
      cursor = Math.max(cursor, end);
    }

    if (cursor < barEnd) {
      pushRests(segments, cursor, barEnd, ppq, barEnd);
    }

    measures.push({
      index,
      startTicks: barStart,
      ticks: measureTicks,
      notes: notes.filter(
        (note) => note.startTicks >= barStart && note.startTicks < barEnd,
      ),
      segments,
    });
  }

  return {
    role,
    instrument,
    shift,
    ppq,
    grid,
    measureTicks,
    numerator,
    denominator,
    measures,
    empty: false,
    minGapSeconds,
    tooFastCount,
  };
}

function pushRests(
  segments: ScoreSegment[],
  startTicks: number,
  endTicks: number,
  ppq: number,
  barEnd: number,
): void {
  let position = startTicks;
  for (const part of splitValue(startTicks, endTicks - startTicks, ppq, barEnd)) {
    segments.push({
      kind: 'rest',
      startTicks: position,
      durationTicks: part,
      noteId: null,
      midiOut: [],
      clicks: [],
      instruments: [],
      repeaters: null,
      tieFrom: false,
      tieTo: false,
    });
    position += part;
  }
}
