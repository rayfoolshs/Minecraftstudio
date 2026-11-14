export type Role = 'melody' | 'bass' | 'chords' | 'drums';

export const ROLES: Role[] = ['melody', 'chords', 'bass', 'drums'];

export const ROLE_LABELS: Record<Role, string> = {
  melody: 'Melody',
  chords: 'Chords',
  bass: 'Bass',
  drums: 'Drums',
};

export interface MidiNote {
  midi: number;
  startTicks: number;
  durationTicks: number;
  velocity: number;
}

export interface MidiPart {
  id: string;
  name: string;
  trackIndex: number;
  channel: number;
  program: number;
  isDrums: boolean;
  notes: MidiNote[];
}

export interface TempoEvent {
  ticks: number;
  microsecondsPerBeat: number;
}

export interface TimeSignatureEvent {
  ticks: number;
  numerator: number;
  denominator: number;
}

export interface ParsedMidi {
  name: string;
  format: number;
  ppq: number;
  parts: MidiPart[];
  tempos: TempoEvent[];
  timeSignatures: TimeSignatureEvent[];
  durationTicks: number;
}

export function scaleTempos(tempos: TempoEvent[], tempoScale: number): TempoEvent[] {
  const safeScale = Math.max(0.25, Math.min(2.5, tempoScale));
  if (Math.abs(safeScale - 1) < 0.0001) return tempos;
  return tempos.map((event) => ({
    ticks: event.ticks,
    microsecondsPerBeat: Math.round(event.microsecondsPerBeat / safeScale),
  }));
}

export function ticksToSeconds(
  ticks: number,
  ppq: number,
  tempos: TempoEvent[],
): number {
  if (ticks <= 0) return 0;
  const sorted = [...tempos].sort((a, b) => a.ticks - b.ticks);
  let seconds = 0;
  let lastTick = 0;
  let microsecondsPerBeat = 500_000;
  for (const tempo of sorted) {
    if (tempo.ticks <= lastTick) {
      microsecondsPerBeat = tempo.microsecondsPerBeat;
      continue;
    }
    if (tempo.ticks >= ticks) break;
    seconds += ((tempo.ticks - lastTick) / ppq) * (microsecondsPerBeat / 1_000_000);
    lastTick = tempo.ticks;
    microsecondsPerBeat = tempo.microsecondsPerBeat;
  }
  seconds += ((ticks - lastTick) / ppq) * (microsecondsPerBeat / 1_000_000);
  return seconds;
}

export function secondsToTicks(
  targetSeconds: number,
  ppq: number,
  tempos: TempoEvent[],
): number {
  if (targetSeconds <= 0) return 0;
  const sorted = [...tempos].sort((a, b) => a.ticks - b.ticks);
  let elapsed = 0;
  let lastTick = 0;
  let microsecondsPerBeat = 500_000;
  for (const tempo of sorted) {
    if (tempo.ticks <= lastTick) {
      microsecondsPerBeat = tempo.microsecondsPerBeat;
      continue;
    }
    const segSeconds =
      ((tempo.ticks - lastTick) / ppq) * (microsecondsPerBeat / 1_000_000);
    if (elapsed + segSeconds >= targetSeconds) {
      const rem = targetSeconds - elapsed;
      return lastTick + (rem / (microsecondsPerBeat / 1_000_000)) * ppq;
    }
    elapsed += segSeconds;
    lastTick = tempo.ticks;
    microsecondsPerBeat = tempo.microsecondsPerBeat;
  }
  const rem = targetSeconds - elapsed;
  return lastTick + (rem / (microsecondsPerBeat / 1_000_000)) * ppq;
}

export function timeSignatureAt(
  ticks: number,
  signatures: TimeSignatureEvent[],
): { numerator: number; denominator: number } {
  const sorted = [...signatures].sort((a, b) => a.ticks - b.ticks);
  let current = { numerator: 4, denominator: 4 };
  for (const signature of sorted) {
    if (signature.ticks > ticks) break;
    current = { numerator: signature.numerator, denominator: signature.denominator };
  }
  return current;
}
