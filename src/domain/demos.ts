import { buildMidiBytesFromTracks, parseMidiBytes } from './midiFile';
import type { ParsedMidi } from './types';

export interface DemoPreset {
  id: string;
  title: string;
  subtitle: string;
  build: () => { parsed: ParsedMidi; bytes: Uint8Array };
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: 'overworld-dawn',
    title: 'Overworld Dawn',
    subtitle: '4/4 · 96 BPM · Gentle 4-part ensemble',
    build: () => {
      const bytes = buildMidiBytesFromTracks({
        bpm: 96,
        numerator: 4,
        denominator: 4,
        tracks: [
          {
            name: 'Lead Harp',
            channel: 0,
            program: 0,
            notes: [
              // Bar 1 (C major7 warmth)
              [0, 1.5, 72],
              [1.5, 0.5, 76],
              [2, 1.0, 74],
              [3, 1.0, 71],
              // Bar 2
              [4, 2.0, 69],
              [6, 1.0, 72],
              [7, 1.0, 74],
              // Bar 3
              [8, 1.5, 76],
              [9.5, 0.5, 79],
              [10, 1.0, 76],
              [11, 1.0, 74],
              // Bar 4
              [12, 3.0, 72],
              [15, 1.0, 67],
              // Bar 5
              [16, 1.5, 72],
              [17.5, 0.5, 76],
              [18, 1.0, 79],
              [19, 1.0, 76],
              // Bar 6
              [20, 1.5, 74],
              [21.5, 0.5, 72],
              [22, 2.0, 69],
              // Bar 7
              [24, 1.0, 67],
              [25, 1.0, 69],
              [26, 1.0, 72],
              [27, 1.0, 74],
              // Bar 8
              [28, 4.0, 72],
            ],
          },
          {
            name: 'Warm Chords',
            channel: 1,
            program: 4,
            notes: [
              // Bar 1: Cmaj7
              [0, 2, 60], [0, 2, 64], [0, 2, 67],
              [2, 2, 59], [2, 2, 64], [2, 2, 67],
              // Bar 2: Am7
              [4, 2, 57], [4, 2, 60], [4, 2, 64],
              [6, 2, 57], [6, 2, 60], [6, 2, 67],
              // Bar 3: Fmaj7
              [8, 2, 53], [8, 2, 60], [8, 2, 64],
              [10, 2, 55], [10, 2, 59], [10, 2, 62],
              // Bar 4: C
              [12, 4, 60], [12, 4, 64], [12, 4, 67],
              // Bar 5: C -> Em
              [16, 2, 60], [16, 2, 64], [16, 2, 67],
              [18, 2, 59], [18, 2, 64], [18, 2, 67],
              // Bar 6: F -> Dm
              [20, 2, 57], [20, 2, 60], [20, 2, 65],
              [22, 2, 57], [22, 2, 62], [22, 2, 65],
              // Bar 7: G7
              [24, 2, 55], [24, 2, 59], [24, 2, 62],
              [26, 2, 55], [26, 2, 59], [26, 2, 65],
              // Bar 8: C
              [28, 4, 60], [28, 4, 64], [28, 4, 67],
            ],
          },
          {
            name: 'Wooden Bass',
            channel: 2,
            program: 32,
            notes: [
              [0, 2, 36], [2, 2, 40],
              [4, 2, 33], [6, 2, 36],
              [8, 2, 41], [10, 2, 43],
              [12, 2, 36], [14, 2, 43],
              [16, 2, 36], [18, 2, 40],
              [20, 2, 41], [22, 2, 38],
              [24, 2, 43], [26, 2, 31],
              [28, 4, 36],
            ],
          },
          {
            name: 'Percussion',
            channel: 9,
            program: 0,
            notes: Array.from({ length: 8 }, (_, bar) => {
              const b = bar * 4;
              return [
                [b + 0, 0.5, 36],
                [b + 0, 0.25, 42],
                [b + 1, 0.25, 38],
                [b + 1, 0.25, 42],
                [b + 2, 0.5, 36],
                [b + 2, 0.25, 42],
                [b + 3, 0.25, 38],
                [b + 3.5, 0.25, 42],
              ] as Array<[number, number, number]>;
            }).flat(),
          },
        ],
      });
      return { parsed: parseMidiBytes(bytes, 'Overworld Dawn.mid'), bytes };
    },
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy Quartet',
    subtitle: '4/4 · 108 BPM · Classroom ensemble',
    build: () => {
      const melodyPhrase: Array<[number, number, number]> = [
        // Bar 1: E E F G
        [0, 1, 64], [1, 1, 64], [2, 1, 65], [3, 1, 67],
        // Bar 2: G F E D
        [4, 1, 67], [5, 1, 65], [6, 1, 64], [7, 1, 62],
        // Bar 3: C C D E
        [8, 1, 60], [9, 1, 60], [10, 1, 62], [11, 1, 64],
        // Bar 4: E. D D-
        [12, 1.5, 64], [13.5, 0.5, 62], [14, 2, 62],
        // Bar 5: E E F G
        [16, 1, 64], [17, 1, 64], [18, 1, 65], [19, 1, 67],
        // Bar 6: G F E D
        [20, 1, 67], [21, 1, 65], [22, 1, 64], [23, 1, 62],
        // Bar 7: C C D E
        [24, 1, 60], [25, 1, 60], [26, 1, 62], [27, 1, 64],
        // Bar 8: D. C C-
        [28, 1.5, 62], [29.5, 0.5, 60], [30, 2, 60],
      ];
      const bytes = buildMidiBytesFromTracks({
        bpm: 108,
        numerator: 4,
        denominator: 4,
        tracks: [
          { name: 'Melody', channel: 0, program: 73, notes: melodyPhrase },
          {
            name: 'Harmony Chords',
            channel: 1,
            program: 0,
            notes: [
              [0, 2, 55], [0, 2, 60], [2, 2, 55], [2, 2, 59],
              [4, 2, 55], [4, 2, 60], [6, 2, 55], [6, 2, 59],
              [8, 2, 55], [8, 2, 60], [10, 2, 53], [10, 2, 57],
              [12, 2, 55], [12, 2, 60], [14, 2, 55], [14, 2, 59],
              [16, 2, 55], [16, 2, 60], [18, 2, 55], [18, 2, 59],
              [20, 2, 55], [20, 2, 60], [22, 2, 55], [22, 2, 59],
              [24, 2, 55], [24, 2, 60], [26, 2, 53], [26, 2, 57],
              [28, 2, 55], [28, 2, 59], [30, 2, 55], [30, 2, 60],
            ],
          },
          {
            name: 'Bass Line',
            channel: 2,
            program: 33,
            notes: [
              [0, 2, 36], [2, 2, 43],
              [4, 2, 36], [6, 2, 43],
              [8, 2, 36], [10, 2, 41],
              [12, 2, 43], [14, 2, 31],
              [16, 2, 36], [18, 2, 43],
              [20, 2, 36], [22, 2, 43],
              [24, 2, 36], [26, 2, 41],
              [28, 2, 43], [30, 2, 36],
            ],
          },
          {
            name: 'Marching Percussion',
            channel: 9,
            program: 0,
            notes: Array.from({ length: 8 }, (_, bar) => {
              const b = bar * 4;
              return [
                [b + 0, 0.5, 36],
                [b + 1, 0.5, 38],
                [b + 2, 0.5, 36],
                [b + 3, 0.5, 38],
              ] as Array<[number, number, number]>;
            }).flat(),
          },
        ],
      });
      return { parsed: parseMidiBytes(bytes, 'Ode to Joy Quartet.mid'), bytes };
    },
  },
  {
    id: 'emerald-groove',
    title: 'Emerald 8-Bit Groove',
    subtitle: '4/4 · 128 BPM · Fast arpeggios & redstone speed test',
    build: () => {
      const lead: Array<[number, number, number]> = [];
      const bass: Array<[number, number, number]> = [];
      const chords: Array<[number, number, number]> = [];
      const drums: Array<[number, number, number]> = [];

      const roots = [45, 41, 48, 43]; // Am, F, C, G
      for (let bar = 0; bar < 4; bar += 1) {
        const b = bar * 4;
        const root = roots[bar];
        const third = bar === 0 ? root + 3 : root + 4;
        const fifth = root + 7;

        // Fast 16th/8th arpeggiated melody (showcases R! detection at 128 BPM)
        lead.push(
          [b + 0, 0.5, root + 24],
          [b + 0.5, 0.5, third + 24],
          [b + 1.0, 0.25, fifth + 24],
          [b + 1.25, 0.25, root + 36],
          [b + 1.5, 0.5, fifth + 24],
          [b + 2.0, 0.5, third + 24],
          [b + 2.5, 0.5, fifth + 24],
          [b + 3.0, 0.5, root + 36],
          [b + 3.5, 0.5, fifth + 24],
        );

        // Driving octave bass
        for (let step = 0; step < 4; step += 1) {
          bass.push([b + step, 0.5, root - 12], [b + step + 0.5, 0.5, root]);
        }

        // Stab chords on beats 2 and 4
        chords.push(
          [b + 1, 0.5, root + 12], [b + 1, 0.5, third + 12], [b + 1, 0.5, fifth + 12],
          [b + 3, 0.5, root + 12], [b + 3, 0.5, third + 12], [b + 3, 0.5, fifth + 12],
        );

        // Four-on-the-floor beat
        for (let beat = 0; beat < 4; beat += 1) {
          drums.push([b + beat, 0.25, 36]);
          drums.push([b + beat + 0.5, 0.25, 42]);
          if (beat === 1 || beat === 3) drums.push([b + beat, 0.25, 38]);
        }
      }

      const bytes = buildMidiBytesFromTracks({
        bpm: 128,
        numerator: 4,
        denominator: 4,
        tracks: [
          { name: 'Chiptune Lead', channel: 0, program: 80, notes: lead },
          { name: 'Chord Stabs', channel: 1, program: 4, notes: chords },
          { name: 'Octave Bass', channel: 2, program: 38, notes: bass },
          { name: 'Drum Kit', channel: 9, program: 0, notes: drums },
        ],
      });
      return { parsed: parseMidiBytes(bytes, 'Emerald 8-Bit Groove.mid'), bytes };
    },
  },
  {
    id: 'minuet-waltz',
    title: 'Bell & Flute Minuet',
    subtitle: '3/4 · 104 BPM · Time signature showcase',
    build: () => {
      const bytes = buildMidiBytesFromTracks({
        bpm: 104,
        numerator: 3,
        denominator: 4,
        tracks: [
          {
            name: 'Flute Melody',
            channel: 0,
            program: 73,
            notes: [
              [0, 1, 74], [1, 0.5, 67], [1.5, 0.5, 69], [2, 0.5, 71], [2.5, 0.5, 72],
              [3, 1, 74], [4, 1, 67], [5, 1, 67],
              [6, 1, 76], [7, 0.5, 72], [7.5, 0.5, 74], [8, 0.5, 76], [8.5, 0.5, 78],
              [9, 1, 79], [10, 1, 67], [11, 1, 67],
              [12, 1, 72], [13, 0.5, 74], [13.5, 0.5, 72], [14, 0.5, 71], [14.5, 0.5, 69],
              [15, 1, 71], [16, 0.5, 72], [16.5, 0.5, 71], [17, 0.5, 69], [17.5, 0.5, 67],
              [18, 1, 66], [19, 0.5, 67], [19.5, 0.5, 69], [20, 0.5, 71], [20.5, 0.5, 67],
              [21, 3, 69],
            ],
          },
          {
            name: 'Waltz Chords',
            channel: 1,
            program: 46,
            notes: [
              [1, 1, 59], [1, 1, 62], [2, 1, 59], [2, 1, 62],
              [4, 1, 59], [4, 1, 62], [5, 1, 59], [5, 1, 62],
              [7, 1, 60], [7, 1, 64], [8, 1, 60], [8, 1, 64],
              [10, 1, 59], [10, 1, 62], [11, 1, 59], [11, 1, 62],
              [13, 1, 60], [13, 1, 64], [14, 1, 60], [14, 1, 64],
              [16, 1, 59], [16, 1, 62], [17, 1, 59], [17, 1, 62],
              [19, 1, 57], [19, 1, 62], [20, 1, 57], [20, 1, 62],
              [22, 1, 57], [22, 1, 62], [23, 1, 57], [23, 1, 62],
            ],
          },
          {
            name: 'Pedal Bass',
            channel: 2,
            program: 42,
            notes: [
              [0, 3, 43],
              [3, 3, 38],
              [6, 3, 48],
              [9, 3, 43],
              [12, 3, 48],
              [15, 3, 43],
              [18, 3, 38],
              [21, 3, 38],
            ],
          },
        ],
      });
      return { parsed: parseMidiBytes(bytes, 'Bell & Flute Minuet.mid'), bytes };
    },
  },
];
