import type { Role } from './types';

export type InstrumentId =
  | 'harp'
  | 'bass'
  | 'guitar'
  | 'flute'
  | 'bell'
  | 'chime'
  | 'xylophone'
  | 'iron_xylophone'
  | 'cow_bell'
  | 'didgeridoo'
  | 'bit'
  | 'banjo'
  | 'pling'
  | 'trumpet'
  | 'exposed_trumpet'
  | 'weathered_trumpet'
  | 'oxidized_trumpet'
  | 'snare'
  | 'hat'
  | 'basedrum';

export type VoiceKind =
  | 'pluck'
  | 'bass'
  | 'bell'
  | 'chime'
  | 'xylophone'
  | 'flute'
  | 'brass'
  | 'square'
  | 'snare'
  | 'hat'
  | 'kick';

export interface NoteBlockInstrument {
  id: InstrumentId;
  label: string;
  shortLabel: string;
  /** Block placed directly underneath the note block. */
  block: string;
  /** Minecraft Java resource ID for commands / export. */
  minecraftId: string;
  /** Primary hex color for block swatch & 3D texture. */
  blockColor: string;
  /** Secondary accent hex color for 3D procedural texture grain. */
  blockAccent: string;
  /** MIDI note number of click count 0, or null for unpitched percussion. */
  baseMidi: number | null;
  voice: VoiceKind;
}

/**
 * Range is always 25 semitones: baseMidi .. baseMidi + 24.
 * Source: https://minecraft.wiki/w/Note_Block
 */
export const INSTRUMENTS: Record<InstrumentId, NoteBlockInstrument> = {
  harp: {
    id: 'harp',
    label: 'Harp (Piano)',
    shortLabel: 'Harp',
    block: 'Dirt / Grass / Air',
    minecraftId: 'grass_block',
    blockColor: '#6d9b41',
    blockAccent: '#865f3e',
    baseMidi: 54,
    voice: 'pluck',
  },
  bass: {
    id: 'bass',
    label: 'Bass',
    shortLabel: 'Bass',
    block: 'Oak Planks / Wood',
    minecraftId: 'oak_planks',
    blockColor: '#a88753',
    blockAccent: '#7d6237',
    baseMidi: 30,
    voice: 'bass',
  },
  guitar: {
    id: 'guitar',
    label: 'Guitar',
    shortLabel: 'Guitar',
    block: 'White Wool',
    minecraftId: 'white_wool',
    blockColor: '#e5e7eb',
    blockAccent: '#cbd5e1',
    baseMidi: 42,
    voice: 'pluck',
  },
  flute: {
    id: 'flute',
    label: 'Flute',
    shortLabel: 'Flute',
    block: 'Clay Block',
    minecraftId: 'clay',
    blockColor: '#9ea5b4',
    blockAccent: '#828a9b',
    baseMidi: 66,
    voice: 'flute',
  },
  bell: {
    id: 'bell',
    label: 'Bell (Glockenspiel)',
    shortLabel: 'Bell',
    block: 'Block of Gold',
    minecraftId: 'gold_block',
    blockColor: '#f6d03e',
    blockAccent: '#d49b1a',
    baseMidi: 78,
    voice: 'bell',
  },
  chime: {
    id: 'chime',
    label: 'Chime',
    shortLabel: 'Chime',
    block: 'Packed Ice',
    minecraftId: 'packed_ice',
    blockColor: '#8eb6f7',
    blockAccent: '#6997e6',
    baseMidi: 78,
    voice: 'chime',
  },
  xylophone: {
    id: 'xylophone',
    label: 'Xylophone',
    shortLabel: 'Xylophone',
    block: 'Bone Block',
    minecraftId: 'bone_block',
    blockColor: '#e3dec8',
    blockAccent: '#c4bda0',
    baseMidi: 78,
    voice: 'xylophone',
  },
  iron_xylophone: {
    id: 'iron_xylophone',
    label: 'Iron Xylophone (Vibraphone)',
    shortLabel: 'Iron Xylo',
    block: 'Block of Iron',
    minecraftId: 'iron_block',
    blockColor: '#d9dadb',
    blockAccent: '#a9acb0',
    baseMidi: 54,
    voice: 'bell',
  },
  cow_bell: {
    id: 'cow_bell',
    label: 'Cow Bell',
    shortLabel: 'Cow Bell',
    block: 'Soul Sand',
    minecraftId: 'soul_sand',
    blockColor: '#564135',
    blockAccent: '#3c2c23',
    baseMidi: 66,
    voice: 'bell',
  },
  didgeridoo: {
    id: 'didgeridoo',
    label: 'Didgeridoo',
    shortLabel: 'Didgeridoo',
    block: 'Pumpkin',
    minecraftId: 'carved_pumpkin',
    blockColor: '#d97a1f',
    blockAccent: '#9b4f0b',
    baseMidi: 30,
    voice: 'bass',
  },
  bit: {
    id: 'bit',
    label: 'Bit (8-Bit Synth)',
    shortLabel: 'Bit',
    block: 'Block of Emerald',
    minecraftId: 'emerald_block',
    blockColor: '#25c468',
    blockAccent: '#0f8c46',
    baseMidi: 54,
    voice: 'square',
  },
  banjo: {
    id: 'banjo',
    label: 'Banjo',
    shortLabel: 'Banjo',
    block: 'Hay Bale',
    minecraftId: 'hay_block',
    blockColor: '#d4b238',
    blockAccent: '#a8472b',
    baseMidi: 54,
    voice: 'pluck',
  },
  pling: {
    id: 'pling',
    label: 'Pling (Electric Piano)',
    shortLabel: 'Pling',
    block: 'Glowstone',
    minecraftId: 'glowstone',
    blockColor: '#f5cc6c',
    blockAccent: '#b87635',
    baseMidi: 54,
    voice: 'bell',
  },
  trumpet: {
    id: 'trumpet',
    label: 'Trumpet',
    shortLabel: 'Trumpet',
    block: 'Block of Copper',
    minecraftId: 'copper_block',
    blockColor: '#c96f4d',
    blockAccent: '#944b32',
    baseMidi: 54,
    voice: 'brass',
  },
  exposed_trumpet: {
    id: 'exposed_trumpet',
    label: 'Exposed Trumpet',
    shortLabel: 'Exp. Trumpet',
    block: 'Exposed Copper',
    minecraftId: 'exposed_copper',
    blockColor: '#a67b69',
    blockAccent: '#6b7e72',
    baseMidi: 54,
    voice: 'brass',
  },
  weathered_trumpet: {
    id: 'weathered_trumpet',
    label: 'Weathered Trumpet',
    shortLabel: 'Weath. Trumpet',
    block: 'Weathered Copper',
    minecraftId: 'weathered_copper',
    blockColor: '#6b9d86',
    blockAccent: '#547b69',
    baseMidi: 54,
    voice: 'brass',
  },
  oxidized_trumpet: {
    id: 'oxidized_trumpet',
    label: 'Oxidized Trumpet',
    shortLabel: 'Ox. Trumpet',
    block: 'Oxidized Copper',
    minecraftId: 'oxidized_copper',
    blockColor: '#52a38b',
    blockAccent: '#397b68',
    baseMidi: 54,
    voice: 'brass',
  },
  snare: {
    id: 'snare',
    label: 'Snare Drum',
    shortLabel: 'Snare',
    block: 'Sand / Gravel',
    minecraftId: 'sand',
    blockColor: '#dfd3a4',
    blockAccent: '#bfb282',
    baseMidi: null,
    voice: 'snare',
  },
  hat: {
    id: 'hat',
    label: 'Hi-Hat / Clicks',
    shortLabel: 'Hat',
    block: 'Glass',
    minecraftId: 'glass',
    blockColor: '#bfe6f2',
    blockAccent: '#8ec7dc',
    baseMidi: null,
    voice: 'hat',
  },
  basedrum: {
    id: 'basedrum',
    label: 'Bass Drum',
    shortLabel: 'Kick',
    block: 'Stone / Cobblestone',
    minecraftId: 'stone',
    blockColor: '#888c94',
    blockAccent: '#686c74',
    baseMidi: null,
    voice: 'kick',
  },
};

export const PITCHED_INSTRUMENTS: InstrumentId[] = [
  'harp',
  'pling',
  'bit',
  'banjo',
  'iron_xylophone',
  'trumpet',
  'exposed_trumpet',
  'weathered_trumpet',
  'oxidized_trumpet',
  'guitar',
  'cow_bell',
  'flute',
  'bell',
  'chime',
  'xylophone',
  'bass',
  'didgeridoo',
];

export const PERCUSSION_INSTRUMENTS: InstrumentId[] = ['basedrum', 'snare', 'hat'];

/** Role preference; earlier entries win ties. */
export const ROLE_PREFERENCE: Record<Exclude<Role, 'drums'>, InstrumentId[]> = {
  melody: ['harp', 'pling', 'flute', 'bell', 'banjo', 'bit', 'trumpet'],
  bass: ['bass', 'didgeridoo', 'guitar'],
  chords: ['harp', 'guitar', 'pling', 'banjo', 'bit'],
};

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function pitchName(midi: number): string {
  const name = PITCH_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function instrumentRange(id: InstrumentId): { low: number; high: number } | null {
  const base = INSTRUMENTS[id].baseMidi;
  if (base === null) return null;
  return { low: base, high: base + 24 };
}

export function formatInstrumentRange(id: InstrumentId): string {
  const range = instrumentRange(id);
  if (!range) return 'Unpitched';
  return `${pitchName(range.low)}–${pitchName(range.high)}`;
}

export function isPlayable(id: InstrumentId, midi: number): boolean {
  const range = instrumentRange(id);
  return range !== null && midi >= range.low && midi <= range.high;
}

/** Number of right-clicks needed from a fresh block, or null if out of range. */
export function clickCount(id: InstrumentId, midi: number): number | null {
  const base = INSTRUMENTS[id].baseMidi;
  if (base === null) return null;
  const clicks = midi - base;
  return clicks >= 0 && clicks <= 24 ? clicks : null;
}

export function midiForClicks(id: InstrumentId, clicks: number): number | null {
  const base = INSTRUMENTS[id].baseMidi;
  if (base === null || clicks < 0 || clicks > 24) return null;
  return base + clicks;
}

/** General MIDI percussion note -> note block percussion instrument. */
export function drumInstrumentFor(midi: number): InstrumentId {
  if (midi <= 36) return 'basedrum';
  if (midi <= 40) return 'snare';
  if (midi >= 42 && midi <= 46) return 'hat';
  if (midi >= 49 && midi <= 59) return 'hat';
  return 'snare';
}

export function instrumentLabel(id: InstrumentId | null): string {
  return id ? INSTRUMENTS[id].label : '—';
}

/**
 * Authentic Minecraft note particle color curve for clicks 0..24.
 * Returns CSS hex string.
 */
export function noteParticleColor(clicks: number | null): string {
  if (clicks === null) return '#94a3b8';
  const note = Math.max(0, Math.min(24, clicks)) / 24;
  const r = Math.round((Math.sin((note + 0 / 3) * Math.PI * 2) * 0.65 + 0.35) * 255);
  const g = Math.round((Math.sin((note + 1 / 3) * Math.PI * 2) * 0.65 + 0.35) * 255);
  const b = Math.round((Math.sin((note + 2 / 3) * Math.PI * 2) * 0.65 + 0.35) * 255);
  const clamp = (v: number) => Math.max(40, Math.min(245, v));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
