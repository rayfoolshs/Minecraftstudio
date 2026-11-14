# Architecture

NoteBlock Studio is a client-only React application. Every computation — MIDI parsing, fitting,
scoring, synthesis, exports — happens in the browser. This document explains the module boundaries
and the musical/redstone rules that connect them.

## Pipeline

```
File / demo
   │
   ▼
parseMidiBytes ──► ParsedMidi ──► suggestRoles ──► user assignment
   │                 │                                  │
   │                 └──────────────┬───────────────────┘
   │                                ▼
   │                         mergeRoleNotes (per role)
   │                                ▼
   │                            fitRole ──► FitResult
   │                                ▼
   │                           buildScore ──► ScoreModel (per role)
   │                                │
   ├──► NoteBlockPlayer ◄───────────┤  playEvents
   ├──► NoteBlockStage3D ◄──────────┤  scores + events + playhead
   ├──► FullScoreView ◄─────────────┤  VexFlow rendering
   ├──► BuildGuideView ◄────────────┤  generated build plan
   └──► exports (.mid, CSV, .mcfunction)
```

`App.tsx` owns the pipeline. The heavy work runs inside one `useMemo` keyed by the MIDI file,
assignment, overrides, meter, fold and tempo scale; transport state (`playing`, `currentTime`) is
kept separate so playback does not recompute scores.

## Modules

### `src/domain` — pure logic

| File | Key exports | Responsibility |
| --- | --- | --- |
| `types.ts` | `ParsedMidi`, `MidiPart`, `scaleTempos`, `ticksToSeconds`, `secondsToTicks`, `timeSignatureAt` | Shared shapes; tempo-map conversions; role union |
| `midiFile.ts` | `parseMidiBytes`, `buildMidiBytesFromTracks` | Byte-level MIDI parsing into absolute ticks; demo MIDI synthesis |
| `roles.ts` | `suggestRoles`, `mergeRoleNotes`, `partRange` | Conservative role heuristics; de-duplicated merge of tracks sharing a role |
| `instruments.ts` | `INSTRUMENTS`, `PITCHED_INSTRUMENTS`, `clickCount`, `midiForClicks`, `drumInstrumentFor`, `instrumentRange` | 20-instrument catalog, 25-click math, GM drum mapping, particle colours |
| `fit.ts` | `fitRole`, `describeShift` | Chooses instrument + shift, folds out-of-range notes, produces placements and click counts |
| `score.ts` | `buildScore`, `durationToVex`, `splitValue` | Quantises to a 16th grid, groups simultaneous notes into chords, attaches repeater plans, exposes notation durations |
| `redstone.ts` | `repeatersForDelay`, `formatRepeaterTicks`, `recommendedTempoScale` | Tick/repeater math and too-fast detection |
| `buildPlan.ts` | `generateBuildPlan`, `buildPlanToCsv`, `buildPlanToMcFunction` | Material counts, ordered build steps, CSV and Java `/setblock` export |
| `demos.ts` | `DEMO_PRESETS` | Four generated demo arrangements |

Domain modules must not import React, DOM APIs or components. This keeps them easy to reason about
and reuse in exports.

### `src/components` — views

| Component | Notes |
| --- | --- |
| `NoteBlockStage3D.tsx` | Three.js scene; procedural block textures, note particles, click-to-audition, playhead; exposes a handle for seeking |
| `ScoreView.tsx` | Compact studio score (VexFlow) with measure seeking |
| `FullScoreView.tsx` | Paged print score; orientation, bars per system, click/repeater toggles, `@page` A4 rules |
| `BuildGuideView.tsx` | Materials, steps, click histogram, CSV and `.mcfunction` downloads |
| `TunerSandbox.tsx` | 25-click audition pad for every instrument |

### `src/audio` — playback

- `player.ts`: `NoteBlockPlayer` creates an `AudioContext`, a master gain and a compressor, then
  schedules events on a 25 ms timer with a **0.22 s look-ahead** (`dueEvents`). It also exposes
  `audition()` for single notes and accepts an optional `SampleBank`.
- `voices.ts`: synthesised voices (pluck, bass, bell, chime, xylophone, flute, brass, square,
  snare, hat, kick). Used whenever no sample exists.
- `samples.ts`: `SampleBank.load()` fetches `samples/manifest.json`, decodes what it can, and
  returns `null` on any failure. `play()` pitch-shifts by playback rate and reports whether it
  handled the note; callers then fall back to synth.

### `src/render`

`vexScore.ts` wraps VexFlow: builds a stave per role/system, draws notes, ties and repeater labels,
and picks clefs (treble, bass or percussion). It has no app state and receives everything through
arguments.

## State in `App.tsx`

| State | Purpose |
| --- | --- |
| `midi`, `midiBytes`, `activeDemoId` | Loaded source; bytes retained for `.mid` re-export |
| `assignment` | Per-track role (`melody`/`chords`/`bass`/`drums`/`ignore`) |
| `instrumentOverrides`, `octaveOffsets` | Manual instrument choice and ±octave nudges per role |
| `fold`, `forceFourFour`, `tempoScale` | Fitting and timing controls |
| `mutedRoles`, `soloRole` | Mixer state (solo wins over mute) |
| `playing`, `currentTime` | Transport; drives the 3D playhead and score highlights |
| refs (`playerRef`, `bankRef`, `stageRef`) | Non-rendering handles to audio, samples and the stage |

Loading a new file resets overrides, octaves, tempo, mute and solo, then applies fresh role
suggestions. This reset is deliberate: stale overrides from another song are misleading.

## Musical and redstone rules

1. **Ranges.** A pitched note block spans `baseMidi .. baseMidi + 24` (25 semitones). A note is
   playable only inside that window; `clickCount` returns `0..24` or `null`.
2. **Fitting.** `fitRole` enumerates instrument × shift candidates, scores them by playable count,
   then by preference: octave-only shifts first (`score + 0`), non-octave shifts penalised
   (`+1000`), then shift size, then role preference order. Optional folding moves still-unplayable
   notes by whole octaves and records `foldedCount`.
3. **Key changes.** A non-octave shift is a real key change. `describeShift` and the UI surface it
   so users are never surprised.
4. **Scoring.** Notes snap to `grid = round(ppq / 4)` (16th notes). Simultaneous onsets merge into
   one `ScoreNote` with parallel `midiOut`, `clicks` and `instruments` arrays. Each note carries a
   `RepeaterPlan` for the gap from the previous onset.
5. **Timing.** `repeatersForDelay` converts seconds to redstone ticks (0.1 s), rounds, splits into
   1–4-tick repeaters, and flags `tooFast` when the exact gap is below one tick. Tempo scaling
   (`scaleTempos`, 0.25×–2.5× clamp) keeps audio, notation and repeater math consistent; the UI
   slider is 35 %–160 %.
6. **Drums.** Channel 10 parts are percussion. GM notes map to bass drum (`≤36`), snare (`≤40`),
   hi-hat (`42–46`, `49–59`) and snare otherwise. Percussion has no clicks.

## Export formats

- **`.mid`** — the original bytes, re-downloaded unchanged (`audio/midi`).
- **Build CSV** — one row per role/measure/beat with instruments, pitches, clicks and repeater
  text (`buildPlanToCsv`).
- **`.mcfunction`** — Java Edition `setblock` commands that build lanes along **+X**, separated
  along **+Z** by role. Lanes contain a stone base, a trigger button, repeaters with
  `delay=1..4`, redstone wire and note blocks with `note=0..24` on the correct base block.
- **Print/PDF** — browser print of `FullScoreView`; `.no-print` chrome is hidden by
  `src/index.css`, and `@page { size: A4 … }` is injected per orientation.

## Failure handling

- Invalid or empty MIDI files throw during parsing; `App` catches and shows the message, leaving the
  previous song intact.
- A file with no note events loads but shows "contains no note events" instead of stale data.
- Sample loading never throws: any network/decode error yields `null` and synth playback continues.
- Playback is torn down on file change, tab-close effects and end-of-song.

## Performance notes

- The production bundle is one large chunk (~2 MB, dominated by Three.js and VexFlow) and Vite warns
  about the 500 kB threshold. That is acceptable for a local tool; if it becomes a problem, split
  the stage and print views with dynamic imports rather than trimming features.
- Score computation is memoised; playback progress updates state at animation-frame rate, so avoid
  adding derived work to that path.
- The 3D stage caps device pixel ratio and reuses geometries/materials; keep per-note allocations out
  of the animation loop.
