import { pitchName } from './instruments';
import type { MidiNote, MidiPart, Role } from './types';

export interface RoleSuggestion {
  role: Role | 'ignore';
  reason: string;
}

function averagePitch(part: MidiPart): number {
  const total = part.notes.reduce((sum, note) => sum + note.midi, 0);
  return total / Math.max(1, part.notes.length);
}

function polyphony(part: MidiPart): number {
  const counts = new Map<number, number>();
  for (const note of part.notes) {
    counts.set(note.startTicks, (counts.get(note.startTicks) ?? 0) + 1);
  }
  const starts = counts.size;
  const chords = [...counts.values()].filter((count) => count > 1).length;
  return starts === 0 ? 0 : chords / starts;
}

function distinctPitches(part: MidiPart): number {
  return new Set(part.notes.map((note) => note.midi)).size;
}

export function partRange(part: MidiPart): string {
  if (part.notes.length === 0) return '—';
  let low = Infinity;
  let high = -Infinity;
  for (const note of part.notes) {
    low = Math.min(low, note.midi);
    high = Math.max(high, note.midi);
  }
  return `${pitchName(low)}–${pitchName(high)}`;
}

/**
 * Conservative role heuristic: assigns up to one track per primary role so
 * unrelated doublings do not silently merge unless chosen by the user.
 */
export function suggestRoles(parts: MidiPart[]): Record<string, RoleSuggestion> {
  const result: Record<string, RoleSuggestion> = {};
  for (const part of parts) {
    if (part.isDrums) {
      result[part.id] = { role: 'drums', reason: 'MIDI channel 10 is percussion' };
    }
  }
  const pitched = parts.filter((part) => !part.isDrums);
  if (pitched.length === 0) return result;
  if (pitched.length === 1) {
    result[pitched[0].id] = { role: 'melody', reason: 'only pitched track' };
    return result;
  }
  const byPitch = [...pitched].sort((a, b) => averagePitch(a) - averagePitch(b));
  const bass = byPitch[0];
  result[bass.id] = { role: 'bass', reason: 'lowest average pitch' };
  const rest = byPitch
    .slice(1)
    .sort(
      (a, b) =>
        polyphony(a) - polyphony(b) ||
        distinctPitches(b) - distinctPitches(a) ||
        averagePitch(b) - averagePitch(a),
    );
  const melody = rest[0];
  result[melody.id] = { role: 'melody', reason: 'most melodic single-note part' };
  for (const part of rest.slice(1)) {
    result[part.id] =
      polyphony(part) > 0.3
        ? { role: 'chords', reason: 'mostly simultaneous notes' }
        : { role: 'ignore', reason: 'possible doubling or counter-melody' };
  }
  return result;
}

export function mergeRoleNotes(parts: MidiPart[]): MidiNote[] {
  const merged = parts.flatMap((part) => part.notes);
  const seen = new Set<string>();
  const deduped: MidiNote[] = [];
  for (const note of merged) {
    const key = `${note.startTicks}:${note.midi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(note);
  }
  deduped.sort((a, b) => a.startTicks - b.startTicks || a.midi - b.midi);
  return deduped;
}
