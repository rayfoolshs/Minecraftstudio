import { parseMidi, writeMidi, type MidiData, type MidiEvent } from 'midi-file';
import type {
  MidiNote,
  MidiPart,
  ParsedMidi,
  TempoEvent,
  TimeSignatureEvent,
} from './types';

interface RawEvent {
  deltaTime: number;
  type: string;
  [key: string]: unknown;
}

interface RawMidi {
  header: { format: number; ticksPerBeat?: number };
  tracks: RawEvent[][];
}

interface OpenNote {
  midi: number;
  startTicks: number;
  velocity: number;
  channel: number;
}

const DEFAULT_MICROSECONDS_PER_BEAT = 500_000;

export function parseMidiBytes(bytes: Uint8Array, fileName = 'song.mid'): ParsedMidi {
  const data = parseMidi(bytes) as unknown as RawMidi;
  const ppq = data.header.ticksPerBeat ?? 480;
  const tempos: TempoEvent[] = [];
  const timeSignatures: TimeSignatureEvent[] = [];
  const parts: MidiPart[] = [];
  let durationTicks = 0;
  let sawTempoAtZero = false;

  data.tracks.forEach((track, trackIndex) => {
    let absoluteTicks = 0;
    let trackName = '';
    const programs = new Map<number, number>();
    const open = new Map<string, OpenNote[]>();
    const notesByChannel = new Map<number, MidiNote[]>();

    const addNote = (note: OpenNote, endTicks: number) => {
      const list = notesByChannel.get(note.channel) ?? [];
      list.push({
        midi: note.midi,
        startTicks: note.startTicks,
        durationTicks: Math.max(1, endTicks - note.startTicks),
        velocity: note.velocity / 127,
      });
      notesByChannel.set(note.channel, list);
    };

    for (const event of track) {
      absoluteTicks += event.deltaTime;
      switch (event.type) {
        case 'trackName':
          if (typeof event.text === 'string' && !trackName) trackName = event.text;
          break;
        case 'programChange': {
          const channel = (event.channel as number | undefined) ?? 0;
          const program = (event.programNumber as number | undefined) ?? 0;
          programs.set(channel, program);
          break;
        }
        case 'setTempo': {
          const microsecondsPerBeat =
            (event.microsecondsPerBeat as number | undefined) ??
            DEFAULT_MICROSECONDS_PER_BEAT;
          if (absoluteTicks === 0) sawTempoAtZero = true;
          tempos.push({ ticks: absoluteTicks, microsecondsPerBeat });
          break;
        }
        case 'timeSignature':
          timeSignatures.push({
            ticks: absoluteTicks,
            numerator: (event.numerator as number | undefined) ?? 4,
            denominator: (event.denominator as number | undefined) ?? 4,
          });
          break;
        case 'noteOn': {
          const channel = (event.channel as number | undefined) ?? 0;
          const midi = (event.noteNumber as number | undefined) ?? 0;
          const velocity = (event.velocity as number | undefined) ?? 0;
          if (velocity === 0) {
            closeNote(open, addNote, channel, midi, absoluteTicks);
            break;
          }
          const key = `${channel}:${midi}`;
          const stack = open.get(key) ?? [];
          stack.push({ midi, startTicks: absoluteTicks, velocity, channel });
          open.set(key, stack);
          break;
        }
        case 'noteOff': {
          const channel = (event.channel as number | undefined) ?? 0;
          const midi = (event.noteNumber as number | undefined) ?? 0;
          closeNote(open, addNote, channel, midi, absoluteTicks);
          break;
        }
        default:
          break;
      }
    }

    for (const stack of open.values()) {
      for (const note of stack) {
        addNote(note, Math.max(absoluteTicks, note.startTicks + 1));
      }
    }

    const channels = [...notesByChannel.keys()].sort((a, b) => a - b);
    for (const channel of channels) {
      const notes = notesByChannel.get(channel) ?? [];
      if (notes.length === 0) continue;
      notes.sort((a, b) => a.startTicks - b.startTicks || a.midi - b.midi);
      const end = Math.max(...notes.map((n) => n.startTicks + n.durationTicks));
      durationTicks = Math.max(durationTicks, end);
      const baseName = trackName || `Track ${trackIndex + 1}`;
      const name =
        channels.length > 1 || data.header.format === 0
          ? `${baseName} · Ch ${channel + 1}`
          : baseName;
      parts.push({
        id: `${trackIndex}:${channel}`,
        name,
        trackIndex,
        channel,
        program: programs.get(channel) ?? 0,
        isDrums: channel === 9,
        notes,
      });
    }
  });

  if (!sawTempoAtZero && tempos.length === 0) {
    tempos.push({ ticks: 0, microsecondsPerBeat: DEFAULT_MICROSECONDS_PER_BEAT });
  }
  tempos.sort((a, b) => a.ticks - b.ticks);
  if (timeSignatures.length === 0) {
    timeSignatures.push({ ticks: 0, numerator: 4, denominator: 4 });
  }
  timeSignatures.sort((a, b) => a.ticks - b.ticks);

  return {
    name: fileName.replace(/\.(mid|midi)$/i, ''),
    format: data.header.format,
    ppq,
    parts: parts.filter((part) => part.notes.length > 0),
    tempos,
    timeSignatures,
    durationTicks,
  };
}

function closeNote(
  open: Map<string, OpenNote[]>,
  addNote: (note: OpenNote, endTicks: number) => void,
  channel: number,
  midi: number,
  endTicks: number,
): void {
  const key = `${channel}:${midi}`;
  const stack = open.get(key);
  if (!stack || stack.length === 0) return;
  const note = stack.shift();
  if (!note) return;
  addNote(note, endTicks);
  if (stack.length === 0) open.delete(key);
}

export interface DemoTrackSpec {
  name: string;
  channel: number;
  program: number;
  /** [startBeat, durationBeats, midiNote, velocity0to127] */
  notes: Array<[number, number, number, number?]>;
}

export function buildMidiBytesFromTracks(options: {
  bpm: number;
  numerator: number;
  denominator: number;
  ppq?: number;
  tracks: DemoTrackSpec[];
}): Uint8Array {
  const ppq = options.ppq ?? 480;
  const microsecondsPerBeat = Math.round(60_000_000 / options.bpm);

  const metaTrack: MidiEvent[] = [
    {
      deltaTime: 0,
      meta: true,
      type: 'setTempo',
      microsecondsPerBeat,
    },
    {
      deltaTime: 0,
      meta: true,
      type: 'timeSignature',
      numerator: options.numerator,
      denominator: options.denominator,
      metronome: 24,
      thirtyseconds: 8,
    },
    {
      deltaTime: 0,
      meta: true,
      type: 'endOfTrack',
    },
  ];

  const encodedTracks: MidiEvent[][] = [metaTrack];

  for (const track of options.tracks) {
    const absEvents: Array<{ tick: number; priority: number; event: MidiEvent }> = [
      {
        tick: 0,
        priority: 0,
        event: { deltaTime: 0, meta: true, type: 'trackName', text: track.name },
      },
      {
        tick: 0,
        priority: 1,
        event: {
          deltaTime: 0,
          type: 'programChange',
          channel: track.channel,
          programNumber: track.program,
        },
      },
    ];

    for (const [startBeat, durBeats, midi, velocity = 96] of track.notes) {
      const startTick = Math.round(startBeat * ppq);
      const endTick = Math.max(startTick + 1, Math.round((startBeat + durBeats) * ppq));
      absEvents.push({
        tick: startTick,
        priority: 3,
        event: {
          deltaTime: 0,
          type: 'noteOn',
          channel: track.channel,
          noteNumber: midi,
          velocity,
        },
      });
      absEvents.push({
        tick: endTick,
        priority: 2,
        event: {
          deltaTime: 0,
          type: 'noteOff',
          channel: track.channel,
          noteNumber: midi,
          velocity: 0,
        },
      });
    }

    absEvents.sort((a, b) => a.tick - b.tick || a.priority - b.priority);

    const events: MidiEvent[] = [];
    let lastTick = 0;
    for (const item of absEvents) {
      events.push({
        ...item.event,
        deltaTime: Math.max(0, item.tick - lastTick),
      });
      lastTick = item.tick;
    }
    events.push({ deltaTime: 0, meta: true, type: 'endOfTrack' });
    encodedTracks.push(events);
  }

  const midiData: MidiData = {
    header: {
      format: 1,
      numTracks: encodedTracks.length,
      ticksPerBeat: ppq,
    },
    tracks: encodedTracks,
  };

  return new Uint8Array(writeMidi(midiData));
}
