import {
  AlertTriangle,
  Download,
  FileMusic,
  Gauge,
  Pause,
  Play,
  Printer,
  Square,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { NoteBlockPlayer, type PlayEvent } from './audio/player';
import { SampleBank } from './audio/samples';
import { BuildGuideView } from './components/BuildGuideView';
import { FullScoreView } from './components/FullScoreView';
import {
  NoteBlockStage3D,
  type NoteBlockStage3DHandle,
} from './components/NoteBlockStage3D';
import { ScoreView } from './components/ScoreView';
import { TunerSandbox } from './components/TunerSandbox';
import { DEMO_PRESETS } from './domain/demos';
import { describeShift, fitRole, type FitResult } from './domain/fit';
import {
  INSTRUMENTS,
  PITCHED_INSTRUMENTS,
  formatInstrumentRange,
  instrumentLabel,
  type InstrumentId,
} from './domain/instruments';
import { parseMidiBytes } from './domain/midiFile';
import { recommendedTempoScale } from './domain/redstone';
import { mergeRoleNotes, partRange, suggestRoles } from './domain/roles';
import { buildScore, type ScoreModel } from './domain/score';
import {
  ROLES,
  ROLE_LABELS,
  scaleTempos,
  secondsToTicks,
  ticksToSeconds,
  timeSignatureAt,
  type MidiPart,
  type ParsedMidi,
  type Role,
} from './domain/types';

type TabId = 'studio' | 'print' | 'build' | 'tuner';

interface RoleSummary {
  role: Role;
  trackCount: number;
  instrument: InstrumentId | null;
  shift: number;
  fits: boolean;
  blocks: number;
  tuningClicks: number;
  playHits: number;
  folded: number;
  unresolved: number;
  tooFastCount: number;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export default function App() {
  const [tab, setTab] = useState<TabId>('studio');
  const [midi, setMidi] = useState<ParsedMidi | null>(null);
  const [midiBytes, setMidiBytes] = useState<Uint8Array | null>(null);
  const [activeDemoId, setActiveDemoId] = useState<string | null>(DEMO_PRESETS[0].id);
  const [assignment, setAssignment] = useState<Record<string, Role | 'ignore'>>({});
  const [instrumentOverrides, setInstrumentOverrides] = useState<
    Partial<Record<Role, InstrumentId | 'auto'>>
  >({});
  const [octaveOffsets, setOctaveOffsets] = useState<Partial<Record<Role, number>>>({});
  const [fold, setFold] = useState(true);
  const [forceFourFour, setForceFourFour] = useState(false);
  const [tempoScale, setTempoScale] = useState(1);
  const [mutedRoles, setMutedRoles] = useState<Set<Role>>(new Set());
  const [soloRole, setSoloRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<NoteBlockPlayer | null>(null);
  const bankRef = useRef<SampleBank | null>(null);
  const stageRef = useRef<NoteBlockStage3DHandle | null>(null);

  const applyParsedMidi = useCallback(
    (parsed: ParsedMidi, bytes: Uint8Array | null, demoId: string | null) => {
      playerRef.current?.stop();
      setPlaying(false);
      setCurrentTime(0);
      setMidi(parsed);
      setMidiBytes(bytes);
      setActiveDemoId(demoId);
      const suggestions = suggestRoles(parsed.parts);
      const initial: Record<string, Role | 'ignore'> = {};
      for (const part of parsed.parts) {
        initial[part.id] = suggestions[part.id]?.role ?? 'ignore';
      }
      setAssignment(initial);
      setInstrumentOverrides({});
      setOctaveOffsets({});
      setTempoScale(1);
      setMutedRoles(new Set());
      setSoloRole(null);
      setError(
        parsed.parts.length === 0
          ? 'This MIDI file contains no note events.'
          : null,
      );
    },
    [],
  );

  // Load initial flagship demo on mount so the studio is immediately interactive
  useEffect(() => {
    const preset = DEMO_PRESETS[0];
    const { parsed, bytes } = preset.build();
    applyParsedMidi(parsed, bytes, preset.id);
  }, [applyParsedMidi]);

  const loadDemo = useCallback(
    (presetId: string) => {
      const preset = DEMO_PRESETS.find((d) => d.id === presetId);
      if (!preset) return;
      const { parsed, bytes } = preset.build();
      applyParsedMidi(parsed, bytes, preset.id);
    },
    [applyParsedMidi],
  );

  const loadFile = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const parsed = parseMidiBytes(bytes, file.name);
        applyParsedMidi(parsed, bytes, null);
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : 'Unable to parse MIDI file.';
        setError(message);
      }
    },
    [applyParsedMidi],
  );

  const scaledTempos = useMemo(
    () => (midi ? scaleTempos(midi.tempos, tempoScale) : []),
    [midi, tempoScale],
  );

  const baseBpm = midi
    ? Math.round(60_000_000 / (midi.tempos[0]?.microsecondsPerBeat ?? 500_000))
    : 120;
  const effectiveBpm = Math.round(baseBpm * tempoScale);

  const meter = useMemo(() => {
    if (!midi || forceFourFour) return { numerator: 4, denominator: 4 };
    const sig = timeSignatureAt(0, midi.timeSignatures);
    if (sig.numerator <= 0 || sig.denominator <= 0) {
      return { numerator: 4, denominator: 4 };
    }
    return sig;
  }, [midi, forceFourFour]);

  const { fits, scores, summaries, playEvents, totalDuration, minGapAtUnity } =
    useMemo(() => {
      const fitsOut: Partial<Record<Role, FitResult>> = {};
      const scoresOut: Partial<Record<Role, ScoreModel>> = {};
      const summariesOut: Partial<Record<Role, RoleSummary>> = {};
      const eventsOut: PlayEvent[] = [];

      if (!midi) {
        return {
          fits: fitsOut,
          scores: scoresOut,
          summaries: summariesOut,
          playEvents: eventsOut,
          totalDuration: 0,
          minGapAtUnity: null as number | null,
        };
      }

      const byRole: Record<Role, MidiPart[]> = {
        melody: [],
        chords: [],
        bass: [],
        drums: [],
      };
      for (const part of midi.parts) {
        const role = assignment[part.id];
        if (role && role !== 'ignore') byRole[role].push(part);
      }

      let globalMinGapUnity: number | null = null;

      for (const role of ROLES) {
        const parts = byRole[role];
        if (parts.length === 0) continue;

        const merged = mergeRoleNotes(parts);
        const fit = fitRole(merged, role, {
          fold,
          instrumentOverride: instrumentOverrides[role] ?? 'auto',
          octaveOffset: octaveOffsets[role] ?? 0,
        });
        fitsOut[role] = fit;

        const score = buildScore(fit.placements, {
          ppq: midi.ppq,
          numerator: meter.numerator,
          denominator: meter.denominator,
          role,
          instrument: fit.instrument,
          shift: fit.shift,
          tempos: scaledTempos,
        });
        scoresOut[role] = score;

        // Compute min gap at 1.0x tempo for auto-fit redstone speed recommendation
        const allScoreNotes = score.measures.flatMap((m) => m.notes);
        for (let i = 1; i < allScoreNotes.length; i += 1) {
          const gapUnity =
            ticksToSeconds(allScoreNotes[i].startTicks, midi.ppq, midi.tempos) -
            ticksToSeconds(allScoreNotes[i - 1].startTicks, midi.ppq, midi.tempos);
          if (gapUnity > 0) {
            globalMinGapUnity =
              globalMinGapUnity === null
                ? gapUnity
                : Math.min(globalMinGapUnity, gapUnity);
          }
        }

        const uniqueBlocks = new Set<string>();
        let tuningClicks = 0;
        let playHits = 0;

        for (const note of allScoreNotes) {
          for (let i = 0; i < note.midiOut.length; i += 1) {
            const inst = note.instruments[i];
            const clk = note.clicks[i];
            const key = `${inst}:${clk ?? 'drum'}`;
            if (!uniqueBlocks.has(key)) {
              uniqueBlocks.add(key);
              if (clk !== null) tuningClicks += clk;
            }
            playHits += 1;

            const startSec = ticksToSeconds(note.startTicks, midi.ppq, scaledTempos);
            const endSec = ticksToSeconds(
              note.startTicks + note.durationTicks,
              midi.ppq,
              scaledTempos,
            );
            eventsOut.push({
              time: startSec,
              duration: Math.max(0.1, endSec - startSec),
              midiOut: note.midiOut[i],
              instrument: inst,
              velocity: 0.85,
              role,
              clicks: clk,
            });
          }
        }

        summariesOut[role] = {
          role,
          trackCount: parts.length,
          instrument: fit.instrument,
          shift: fit.shift,
          fits: fit.fits,
          blocks: uniqueBlocks.size,
          tuningClicks,
          playHits,
          folded: fit.foldedCount,
          unresolved: fit.unresolved.length,
          tooFastCount: score.tooFastCount,
        };
      }

      eventsOut.sort((a, b) => a.time - b.time);
      const maxEnd = eventsOut.reduce(
        (max, ev) => Math.max(max, ev.time + ev.duration),
        0,
      );

      return {
        fits: fitsOut,
        scores: scoresOut,
        summaries: summariesOut,
        playEvents: eventsOut,
        totalDuration: maxEnd,
        minGapAtUnity: globalMinGapUnity,
      };
    }, [
      midi,
      assignment,
      fold,
      instrumentOverrides,
      octaveOffsets,
      meter,
      scaledTempos,
    ]);

  const effectiveMutedRoles = useMemo(() => {
    const next = new Set<Role>(mutedRoles);
    if (soloRole) {
      for (const r of ROLES) {
        if (r !== soloRole) next.add(r);
      }
    }
    return next;
  }, [mutedRoles, soloRole]);

  useEffect(() => {
    playerRef.current?.setMutedRoles(effectiveMutedRoles);
  }, [effectiveMutedRoles]);

  const loadSamples = useCallback(async () => {
    if (bankRef.current) return bankRef.current;
    try {
      const context = new AudioContext();
      const bank = await SampleBank.load(context);
      await context.close();
      bankRef.current = bank;
      return bank;
    } catch {
      return null;
    }
  }, []);

  const startPlaybackAt = useCallback(
    async (startSec: number) => {
      if (playEvents.length === 0) return;
      playerRef.current ??= new NoteBlockPlayer();
      const bank = await loadSamples();
      setPlaying(true);
      await playerRef.current.play(playEvents, {
        startTimeSeconds: startSec,
        mutedRoles: effectiveMutedRoles,
        samples: bank,
        onProgress: (sec) => setCurrentTime(sec),
        onNoteTrigger: (ev) => stageRef.current?.triggerEvent(ev),
        onEnd: () => {
          setPlaying(false);
          setCurrentTime(0);
        },
      });
    },
    [playEvents, loadSamples, effectiveMutedRoles],
  );

  const handleTogglePlay = useCallback(() => {
    if (playing) {
      playerRef.current?.stop();
      setPlaying(false);
    } else {
      const resumeAt = currentTime >= totalDuration - 0.1 ? 0 : currentTime;
      void startPlaybackAt(resumeAt);
    }
  }, [playing, currentTime, totalDuration, startPlaybackAt]);

  const handleStop = useCallback(() => {
    playerRef.current?.stop();
    setPlaying(false);
    setCurrentTime(0);
  }, []);

  const handleAudition = useCallback(
    async (instrument: InstrumentId, midiNote: number) => {
      playerRef.current ??= new NoteBlockPlayer();
      const bank = await loadSamples();
      await playerRef.current.audition(instrument, midiNote, bank);
    },
    [loadSamples],
  );

  const handleSeekMeasure = useCallback(
    (measureIndex: number) => {
      if (!midi) return;
      const measureTicks = Math.max(
        1,
        Math.round((midi.ppq * 4 * meter.numerator) / meter.denominator),
      );
      const sec = ticksToSeconds(measureIndex * measureTicks, midi.ppq, scaledTempos);
      setCurrentTime(sec);
      void startPlaybackAt(sec);
    },
    [midi, meter, scaledTempos, startPlaybackAt],
  );

  const handleSeekSlider = (nextSec: number) => {
    setCurrentTime(nextSec);
    if (playing) {
      void startPlaybackAt(nextSec);
    }
  };

  useEffect(() => () => playerRef.current?.dispose(), []);

  const activeMeasureIndex = useMemo(() => {
    if (!midi || (!playing && currentTime <= 0)) return null;
    const ticks = secondsToTicks(currentTime, midi.ppq, scaledTempos);
    const measureTicks = Math.max(
      1,
      Math.round((midi.ppq * 4 * meter.numerator) / meter.denominator),
    );
    return Math.max(0, Math.floor(ticks / measureTicks));
  }, [midi, playing, currentTime, scaledTempos, meter]);

  const totalTooFast = Object.values(summaries).reduce(
    (sum, s) => sum + (s?.tooFastCount ?? 0),
    0,
  );
  const safeTempoScale = recommendedTempoScale(minGapAtUnity);

  const toggleMute = (role: Role) => {
    setMutedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const toggleSolo = (role: Role) => {
    setSoloRole((prev) => (prev === role ? null : role));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  };

  const handleDownloadMidi = () => {
    if (!midiBytes || !midi) return;
    const blob = new Blob([midiBytes.buffer as ArrayBuffer], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${midi.name}.mid`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintScore = () => {
    setTab('print');
    window.setTimeout(() => window.print(), 120);
  };

  return (
    <div
      className={`min-h-screen bg-[#f7f8fa] text-slate-900 pb-28 ${
        dragging ? 'ring-4 ring-emerald-600 ring-inset' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi,audio/midi"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadFile(file);
          e.target.value = '';
        }}
      />

      {/* Top Bar Contract: [Wordmark] — [Nav Links] — [1 Primary CTA] */}
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setTab('studio');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            NoteBlock Studio
          </a>

          <nav
            aria-label="Workspace views"
            className="flex items-center gap-1 overflow-x-auto sm:gap-5"
          >
            {(
              [
                ['studio', 'Studio'],
                ['print', 'Score & Print'],
                ['build', 'Build Guide'],
                ['tuner', 'Tuner Sandbox'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`border-b-2 px-2 py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  tab === id
                    ? 'border-emerald-700 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            Import MIDI
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 pt-6 sm:px-6">
        {/* Song Header & Demo Selector Strip */}
        <section className="no-print mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {midi ? midi.name : 'Drop a MIDI file to start'}
              </h1>
            </div>
            {midi && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                <span>Format {midi.format}</span>
                <span aria-hidden="true">·</span>
                <span>{midi.parts.length} parts</span>
                <span aria-hidden="true">·</span>
                <span>
                  {effectiveBpm} BPM{tempoScale !== 1 ? ` (${Math.round(tempoScale * 100)}%)` : ''}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {meter.numerator}/{meter.denominator} time
                </span>
                <span aria-hidden="true">·</span>
                <span>Drop any .mid/.midi file anywhere on this window</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1">
              {DEMO_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => loadDemo(preset.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeDemoId === preset.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {preset.title}
                </button>
              ))}
            </div>
            {midiBytes && (
              <button
                type="button"
                onClick={handleDownloadMidi}
                title="Download current MIDI file"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                .mid
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="no-print mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {tab === 'studio' && midi && (
          <div className="space-y-6">
            {/* 1. Interactive 3D Redstone Note Block Stage */}
            <NoteBlockStage3D
              ref={stageRef}
              scores={scores}
              events={playEvents}
              currentTime={currentTime}
              playing={playing}
              mutedRoles={effectiveMutedRoles}
              onAudition={handleAudition}
            />

            {/* 2. Two-Column Track Mixer & Redstone Tempo Controls */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left: MIDI Part Assignment Table */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    MIDI Tracks & Roles
                  </h2>
                  <span className="text-xs text-slate-500">
                    Multiple tracks assigned to the same role merge cleanly
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                        <th className="py-2 pr-3">Track</th>
                        <th className="px-2 py-2">Ch</th>
                        <th className="px-2 py-2">Notes</th>
                        <th className="px-2 py-2">Range</th>
                        <th className="py-2 pl-2">Assign Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {midi.parts.map((part) => {
                        const val = assignment[part.id] ?? 'ignore';
                        const isIgnored = val === 'ignore';
                        const sampleNote = part.notes[0];
                        return (
                          <tr
                            key={part.id}
                            className={isIgnored ? 'text-slate-400' : 'text-slate-800'}
                          >
                            <td className="py-2.5 pr-3 font-medium">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  title="Audition track sample note"
                                  onClick={() => {
                                    if (!sampleNote) return;
                                    void handleAudition(
                                      part.isDrums ? 'snare' : 'harp',
                                      sampleNote.midi,
                                    );
                                  }}
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-emerald-500 hover:text-emerald-700"
                                >
                                  <Volume2 className="h-3 w-3" />
                                </button>
                                <span className="truncate max-w-[180px]">{part.name}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 font-mono tabular-nums">
                              {part.channel + 1}
                            </td>
                            <td className="px-2 py-2.5 font-mono tabular-nums">
                              {part.notes.length}
                            </td>
                            <td className="px-2 py-2.5 font-mono tabular-nums">
                              {partRange(part)}
                            </td>
                            <td className="py-2.5 pl-2">
                              <select
                                aria-label={`Role for ${part.name}`}
                                value={val}
                                onChange={(e) =>
                                  setAssignment((curr) => ({
                                    ...curr,
                                    [part.id]: e.target.value as Role | 'ignore',
                                  }))
                                }
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800"
                              >
                                <option value="ignore">Ignore</option>
                                {part.isDrums ? (
                                  <option value="drums">Drums</option>
                                ) : (
                                  <>
                                    <option value="melody">Melody</option>
                                    <option value="chords">Chords</option>
                                    <option value="bass">Bass</option>
                                  </>
                                )}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Right: Redstone Speed & Notation Controls */}
              <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Redstone Timing & Arrangement
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Minecraft repeaters delay in 0.1 s ticks; adjust tempo to eliminate fast R! gaps
                  </p>

                  {/* Tempo Scale Slider */}
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">
                        Tempo Scale:{' '}
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {Math.round(tempoScale * 100)}% ({effectiveBpm} BPM)
                        </span>
                      </span>
                      {tempoScale !== 1 && (
                        <button
                          type="button"
                          onClick={() => setTempoScale(1)}
                          className="text-xs font-medium text-emerald-700 hover:underline"
                        >
                          Reset 100%
                        </button>
                      )}
                    </div>
                    <input
                      type="range"
                      min={0.35}
                      max={1.6}
                      step={0.05}
                      value={tempoScale}
                      onChange={(e) => setTempoScale(Number(e.target.value))}
                      aria-label="Tempo speed multiplier"
                      className="mt-2.5 w-full accent-emerald-700"
                    />
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      {totalTooFast > 0 ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span className="tabular-nums">
                            {totalTooFast} R! notes faster than 0.1 s
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <Gauge className="h-3.5 w-3.5 shrink-0" />
                          <span>All triggers ≥ 0.1 s (Redstone safe)</span>
                        </div>
                      )}
                      {totalTooFast > 0 && safeTempoScale < tempoScale && (
                        <button
                          type="button"
                          onClick={() => setTempoScale(safeTempoScale)}
                          className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 whitespace-nowrap shrink-0"
                        >
                          Fit Redstone ({Math.round(safeTempoScale * 100)}%)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Notation & Fitting Toggles */}
                  <div className="mt-4 space-y-3">
                    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs">
                      <span className="font-medium text-slate-700">
                        Fold out-of-range notes by whole octaves
                      </span>
                      <input
                        type="checkbox"
                        checked={fold}
                        onChange={(e) => setFold(e.target.checked)}
                        className="h-4 w-4 accent-emerald-700"
                      />
                    </label>

                    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs">
                      <span className="font-medium text-slate-700">
                        Force standard 4/4 meter (ignore MIDI time sig)
                      </span>
                      <input
                        type="checkbox"
                        checked={forceFourFour}
                        onChange={(e) => setForceFourFour(e.target.checked)}
                        className="h-4 w-4 accent-emerald-700"
                      />
                    </label>
                  </div>
                </div>
              </section>
            </div>

            {/* 3. Role Fit & Instrument Override Cards */}
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Minecraft Instrument & Fit Report
                </h2>
                <span className="text-xs text-slate-500">
                  Override any part’s block sound or nudge by octave; mute or solo for practice
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {ROLES.map((role) => {
                  const summary = summaries[role];
                  if (!summary) return null;
                  const fit = fits[role];
                  const instrument = summary.instrument
                    ? INSTRUMENTS[summary.instrument]
                    : null;
                  const isMuted = effectiveMutedRoles.has(role);
                  const isSolo = soloRole === role;
                  const octOffset = octaveOffsets[role] ?? 0;

                  return (
                    <article
                      key={role}
                      className={`flex flex-col justify-between rounded-xl border p-4 ${
                        !summary.fits
                          ? 'border-amber-300 bg-amber-50/40'
                          : 'border-slate-200 bg-slate-50/50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold tracking-wide text-emerald-800 uppercase">
                            {ROLE_LABELS[role]}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleSolo(role)}
                              title={`Solo ${ROLE_LABELS[role]}`}
                              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
                                isSolo
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              S
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleMute(role)}
                              title={`Mute ${ROLE_LABELS[role]}`}
                              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
                                isMuted
                                  ? 'bg-slate-800 text-white'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {isMuted ? (
                                <VolumeX className="h-3.5 w-3.5" />
                              ) : (
                                <Volume2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {role === 'drums' ? (
                          <div className="mt-2">
                            <div className="text-sm font-semibold text-slate-900">
                              Percussion Set
                            </div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              Stone (Kick) · Sand (Snare) · Glass (Hat)
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <select
                              aria-label={`Instrument for ${ROLE_LABELS[role]}`}
                              value={instrumentOverrides[role] ?? 'auto'}
                              onChange={(e) =>
                                setInstrumentOverrides((curr) => ({
                                  ...curr,
                                  [role]: e.target.value as InstrumentId | 'auto',
                                }))
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                            >
                              <option value="auto">
                                Auto: {instrumentLabel(summary.instrument)}
                              </option>
                              {PITCHED_INSTRUMENTS.map((id) => (
                                <option key={id} value={id}>
                                  {INSTRUMENTS[id].label} ({formatInstrumentRange(id)})
                                </option>
                              ))}
                            </select>

                            {instrument && (
                              <div className="flex items-center gap-2 text-xs text-slate-600">
                                <span
                                  className="h-3 w-3 shrink-0 rounded-xs border border-black/15"
                                  style={{ backgroundColor: instrument.blockColor }}
                                />
                                <span className="truncate">{instrument.block}</span>
                              </div>
                            )}

                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                              <span className="truncate">
                                {describeShift(summary.shift)}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOctaveOffsets((c) => ({
                                      ...c,
                                      [role]: Math.max(-2, octOffset - 1),
                                    }))
                                  }
                                  className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 hover:bg-slate-100"
                                >
                                  -8va
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOctaveOffsets((c) => ({
                                      ...c,
                                      [role]: Math.min(2, octOffset + 1),
                                    }))
                                  }
                                  className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 hover:bg-slate-100"
                                >
                                  +8va
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 border-t border-slate-200/80 pt-3">
                        <dl className="grid grid-cols-3 gap-2">
                          <div>
                            <dt className="text-[10px] font-medium text-slate-500 uppercase">
                              Blocks
                            </dt>
                            <dd className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                              {summary.blocks}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[10px] font-medium text-slate-500 uppercase">
                              Clicks
                            </dt>
                            <dd className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                              {role === 'drums' ? '—' : summary.tuningClicks}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[10px] font-medium text-slate-500 uppercase">
                              Hits
                            </dt>
                            <dd className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                              {summary.playHits}
                            </dd>
                          </div>
                        </dl>

                        {summary.folded > 0 && (
                          <p className="mt-2 text-[11px] text-slate-600">
                            {summary.folded} note{summary.folded === 1 ? '' : 's'} octave-folded
                          </p>
                        )}
                        {fit && !fit.fits && summary.unresolved > 0 && (
                          <p className="mt-1 text-[11px] font-medium text-amber-800">
                            {summary.unresolved} note{summary.unresolved === 1 ? '' : 's'} outside
                            2-octave window
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* 4. Interactive Individual Part Scores */}
            <div className="space-y-5">
              {ROLES.map((role) => {
                const score = scores[role];
                if (!score) return null;
                return (
                  <ScoreView
                    key={role}
                    score={score}
                    title={`${ROLE_LABELS[role]}${
                      score.instrument ? ` — ${instrumentLabel(score.instrument)}` : ''
                    }`}
                    activeMeasureIndex={activeMeasureIndex}
                    onSeekMeasure={handleSeekMeasure}
                  />
                );
              })}
            </div>
          </div>
        )}

        {tab === 'print' && midi && (
          <FullScoreView scores={scores} title={midi.name} />
        )}

        {tab === 'build' && midi && (
          <BuildGuideView title={midi.name} scores={scores} />
        )}

        {tab === 'tuner' && <TunerSandbox onAudition={handleAudition} />}

        {!midi && (
          <section className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-12 text-center">
            <FileMusic className="mx-auto h-10 w-10 text-slate-400" />
            <h2 className="mt-3 font-display text-lg font-semibold text-slate-900">
              Load a MIDI file or pick a preset above
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Everything runs locally in your browser with zero server uploads.
            </p>
          </section>
        )}
      </main>

      {/* Persistent Bottom Transport Playbar */}
      {midi && (
        <div className="no-print fixed bottom-4 left-1/2 z-40 w-[min(940px,calc(100vw-24px))] -translate-x-1/2 rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTogglePlay}
                disabled={playEvents.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                {playing ? (
                  <>
                    <Pause className="h-3.5 w-3.5 fill-current" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Play
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleStop}
                aria-label="Stop playback"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            </div>

            {/* Scrubber & Time Readout */}
            <div className="flex min-w-[180px] flex-1 items-center gap-3">
              <span className="font-mono text-xs text-slate-300 tabular-nums">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(1, totalDuration)}
                step={0.05}
                value={Math.min(currentTime, Math.max(1, totalDuration))}
                onChange={(e) => handleSeekSlider(Number(e.target.value))}
                aria-label="Playback position"
                className="h-1.5 flex-1 cursor-pointer accent-emerald-400"
              />
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {formatTime(totalDuration)}
              </span>
              {activeMeasureIndex !== null && (
                <span className="hidden font-mono text-xs text-emerald-400 tabular-nums sm:inline">
                  Bar {activeMeasureIndex + 1}
                </span>
              )}
            </div>

            {/* Quick Role Mutes + Print Action */}
            <div className="flex items-center gap-1.5">
              {ROLES.map((r) => {
                if (!summaries[r]) return null;
                const isMuted = effectiveMutedRoles.has(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleMute(r)}
                    title={`Toggle ${ROLE_LABELS[r]}`}
                    className={`h-7 rounded px-2 font-mono text-[11px] font-semibold transition-colors ${
                      isMuted
                        ? 'bg-slate-800 text-slate-500 line-through'
                        : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
                    }`}
                  >
                    {ROLE_LABELS[r][0]}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={handlePrintScore}
                className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10 whitespace-nowrap shrink-0"
              >
                <Printer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Print</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
