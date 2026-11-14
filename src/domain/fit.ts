import {
  INSTRUMENTS,
  PITCHED_INSTRUMENTS,
  ROLE_PREFERENCE,
  clickCount,
  drumInstrumentFor,
  isPlayable,
  type InstrumentId,
} from './instruments';
import type { MidiNote, Role } from './types';

export interface Placement {
  note: MidiNote;
  midiOut: number;
  /** Tuning clicks from a fresh block; null when unplayable or percussion. */
  clicks: number | null;
  instrument: InstrumentId;
  /** True when this note was moved by whole octaves to fit the range. */
  folded: boolean;
}

export interface FitCandidate {
  instrument: InstrumentId;
  shift: number;
  playable: number;
  total: number;
  octaveOnly: boolean;
  score: number;
}

export interface FitResult {
  role: Role;
  instrument: InstrumentId | null;
  shift: number;
  fits: boolean;
  placements: Placement[];
  unresolved: MidiNote[];
  candidates: FitCandidate[];
  originalRange: { low: number; high: number } | null;
  outputRange: { low: number; high: number } | null;
  /** True when the chosen shift changes the key (not a whole octave). */
  keyChange: boolean;
  /** Notes moved by whole octaves because the part spans more than 2 octaves. */
  foldedCount: number;
}

export interface FitOptions {
  /** Move notes that still do not fit by whole octaves (changes register). */
  fold?: boolean;
  /** Force a specific Minecraft instrument instead of auto-selecting. */
  instrumentOverride?: InstrumentId | 'auto';
  /** Manual whole-octave transpose nudge (-2..+2). */
  octaveOffset?: number;
}

function preferenceIndex(role: Role, instrument: InstrumentId): number {
  if (role === 'drums') return 0;
  const list = ROLE_PREFERENCE[role];
  const index = list.indexOf(instrument);
  return index === -1 ? list.length : index;
}

function rangeOf(notes: MidiNote[]): { low: number; high: number } | null {
  if (notes.length === 0) return null;
  let low = Infinity;
  let high = -Infinity;
  for (const note of notes) {
    low = Math.min(low, note.midi);
    high = Math.max(high, note.midi);
  }
  return { low, high };
}

function candidateShifts(
  instrument: InstrumentId,
  low: number,
  high: number,
): number[] {
  const base = INSTRUMENTS[instrument].baseMidi;
  if (base === null) return [0];
  const shifts = new Set<number>();
  const top = base + 24;
  // Whole-octave shifts first (key-preserving).
  for (let oct = -5; oct <= 5; oct += 1) {
    const s = oct * 12;
    if (high + s >= base && low + s <= top) shifts.add(s);
  }
  // Arbitrary semitone shifts covering the range window.
  const minShift = base - high;
  const maxShift = top - low;
  for (let s = minShift; s <= maxShift; s += 1) {
    shifts.add(s);
  }
  return [...shifts];
}

export function fitRole(
  notes: MidiNote[],
  role: Role,
  options: FitOptions = {},
): FitResult {
  const total = notes.length;
  const originalRange = rangeOf(notes);

  if (role === 'drums') {
    const mapping = drumMapFor(notes);
    const placements: Placement[] = notes.map((note) => ({
      note,
      midiOut: note.midi,
      clicks: null,
      instrument: mapping.get(note.midi) ?? 'snare',
      folded: false,
    }));
    return {
      role,
      instrument: null,
      shift: 0,
      fits: true,
      placements,
      unresolved: [],
      candidates: [],
      originalRange,
      outputRange: null,
      keyChange: false,
      foldedCount: 0,
    };
  }

  if (total === 0 || !originalRange) {
    return {
      role,
      instrument: null,
      shift: 0,
      fits: false,
      placements: [],
      unresolved: [],
      candidates: [],
      originalRange,
      outputRange: null,
      keyChange: false,
      foldedCount: 0,
    };
  }

  const instrumentPool =
    options.instrumentOverride && options.instrumentOverride !== 'auto'
      ? [options.instrumentOverride]
      : PITCHED_INSTRUMENTS;

  const candidates: FitCandidate[] = [];
  for (const instrument of instrumentPool) {
    for (const shift of candidateShifts(
      instrument,
      originalRange.low,
      originalRange.high,
    )) {
      let playable = 0;
      for (const note of notes) {
        if (isPlayable(instrument, note.midi + shift)) playable += 1;
      }
      if (playable === 0) continue;
      const octaveOnly = shift % 12 === 0;
      candidates.push({
        instrument,
        shift,
        playable,
        total,
        octaveOnly,
        score:
          (octaveOnly ? 0 : 1000) +
          Math.abs(shift) +
          preferenceIndex(role, instrument) * 3,
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.playable - a.playable ||
      a.score - b.score ||
      a.instrument.localeCompare(b.instrument),
  );

  let best = candidates[0] ?? null;

  // Fallback if override instrument didn't overlap any note without shifting beyond window
  if (!best && instrumentPool.length === 1) {
    const forced = instrumentPool[0];
    const base = INSTRUMENTS[forced].baseMidi ?? 54;
    const centerShift = Math.round((base + 12 - (originalRange.low + originalRange.high) / 2) / 12) * 12;
    best = {
      instrument: forced,
      shift: centerShift,
      playable: 0,
      total,
      octaveOnly: true,
      score: 9999,
    };
  }

  if (!best) {
    return {
      role,
      instrument: null,
      shift: 0,
      fits: false,
      placements: notes.map((note) => ({
        note,
        midiOut: note.midi,
        clicks: null,
        instrument: 'harp',
        folded: false,
      })),
      unresolved: notes,
      candidates,
      originalRange,
      outputRange: null,
      keyChange: false,
      foldedCount: 0,
    };
  }

  const extraOctave = (options.octaveOffset ?? 0) * 12;
  const effectiveShift = best.shift + extraOctave;
  const base = INSTRUMENTS[best.instrument].baseMidi;
  let foldedCount = 0;

  const placements: Placement[] = notes.map((note) => {
    const raw = note.midi + effectiveShift;
    let midiOut = raw;
    if (options.fold && base !== null) {
      while (midiOut < base) midiOut += 12;
      while (midiOut > base + 24) midiOut -= 12;
    }
    const folded = midiOut !== raw;
    if (folded) foldedCount += 1;
    return {
      note,
      midiOut,
      clicks: clickCount(best.instrument, midiOut),
      instrument: best.instrument,
      folded,
    };
  });

  const unresolved = placements.filter((p) => p.clicks === null).map((p) => p.note);
  const outputRange = rangeOf(
    placements.map((p) => ({ ...p.note, midi: p.midiOut })),
  );

  return {
    role,
    instrument: best.instrument,
    shift: effectiveShift,
    fits: unresolved.length === 0,
    placements,
    unresolved,
    candidates,
    originalRange,
    outputRange,
    keyChange: effectiveShift % 12 !== 0,
    foldedCount,
  };
}

function drumMapFor(notes: MidiNote[]): Map<number, InstrumentId> {
  const distinct = [...new Set(notes.map((note) => note.midi))].sort((a, b) => a - b);
  const map = new Map<number, InstrumentId>();
  const looksGeneralMidi = distinct.every((value) => value >= 27 && value <= 87);
  if (looksGeneralMidi) {
    for (const value of distinct) map.set(value, drumInstrumentFor(value));
    return map;
  }
  const third = Math.max(1, Math.ceil(distinct.length / 3));
  distinct.forEach((value, index) => {
    map.set(
      value,
      index < third ? 'basedrum' : index < third * 2 ? 'snare' : 'hat',
    );
  });
  return map;
}

export function describeShift(shift: number): string {
  if (shift === 0) return 'original pitch';
  const direction = shift > 0 ? 'up' : 'down';
  const semitones = Math.abs(shift);
  if (semitones % 12 === 0) {
    const octaves = semitones / 12;
    return `${direction} ${octaves} octave${octaves === 1 ? '' : 's'}`;
  }
  return `${direction} ${semitones} semitone${semitones === 1 ? '' : 's'} (key change)`;
}
