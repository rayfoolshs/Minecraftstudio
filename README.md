# NoteBlock Studio

**MIDI → playable Minecraft note-block music.** Turn a `.mid` file into a redstone-ready score,
a 3D build stage, tuning click counts, repeater timings and an exportable build plan.

[![Deploy](https://github.com/rayfoolshs/Minecraftstudio/actions/workflows/deploy.yml/badge.svg)](https://github.com/rayfoolshs/Minecraftstudio/actions/workflows/deploy.yml)
[![Version](https://img.shields.io/badge/version-1.0.0-emerald)](CHANGELOG.md)
[![Live](https://img.shields.io/badge/live-rayfoolshs.github.io%2FMinecraftstudio-1b7f5b)](https://rayfoolshs.github.io/Minecraftstudio/)

**Live:** <https://rayfoolshs.github.io/Minecraftstudio/>

---

## What it does

- **Drop any MIDI file** (or pick one of four built-in demos). Everything is parsed and rendered
  locally in the browser — no upload, no account, no server.
- **Assign MIDI tracks to roles** — Melody, Chords, Bass, Drums (or ignore a track). Multiple
  tracks can share a role.
- **Auto-fit to the note-block range.** Each pitched instrument covers exactly 25 semitones
  (clicks 0–24). The fitter prefers whole-octave shifts so the key is preserved, and only changes
  key when nothing else fits.
- **See the build before you build it** on an interactive 3D redstone stage. Click any block to
  audition its instrument.
- **Get exact tuning instructions** — how many right-clicks each block needs from fresh.
- **Get redstone timing** — repeaters only delay in 0.1 s ticks, so the app computes repeater
  counts/settings per note and warns about gaps that are too fast to wire.
- **Fix tempo problems** with a one-click recommendation, or dial tempo 35 %–160 % yourself.
- **Print a real score** — engraved multi-staff notation (VexFlow) with click counts and repeater
  labels, landscape or portrait A4 print styling.
- **Export the build** — a shopping list, a build-step CSV, and a Java Edition `.mcfunction` that
  places the note blocks, repeaters and redstone wire for you.
- **Hear it** — Web Audio synthesis for all 20 instruments, with optional CC0 samples (see
  [Audio](#audio)).

## Views

| Tab | What you get |
| --- | --- |
| **Studio** | 3D stage, track/role mixer, instrument + octave overrides, tempo scale, fold, mute/solo, transport |
| **Score & Print** | Engraved full score with click and repeater annotations, print/PDF |
| **Build Guide** | Material list, per-measure build steps, click histogram, CSV + `.mcfunction` export |
| **Tuner Sandbox** | Audition every instrument across its 25-click range |

## Quick start

Requires **Node.js 22+** (the deploy workflow uses 22).

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build and preview:

```bash
npm run build      # emits dist/ with the /Minecraftstudio/ base path
npm run preview
npm run lint       # tsc --noEmit
```

> `npm run build` always targets the GitHub Pages path. For a different host, adjust the
> `base` value in [`vite.config.ts`](vite.config.ts) or open an issue.

## How it works

```
.mid bytes
   │  src/domain/midiFile.ts      parse header/tracks, absolute ticks, tempo & meter
   ▼
ParsedMidi (parts, notes, tempos, time signatures)
   │  src/domain/roles.ts         suggest roles from channel 10, average pitch, polyphony
   │  src/domain/fit.ts           choose instrument + transpose; emit click counts
   ▼
FitResult (placements, unresolved notes, candidate scores)
   │  src/domain/score.ts         quantise to a 16th grid, group chords, attach repeaters
   ▼
ScoreModel per role
   ├─ src/components/*           3D stage, notation, build guide, tuner
   ├─ src/render/vexScore.ts     VexFlow engraving
   ├─ src/audio/player.ts        look-ahead Web Audio scheduler
   └─ src/domain/buildPlan.ts    materials, CSV, .mcfunction
```

A detailed module map and domain rules live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Redstone facts the app relies on

- One redstone tick = **0.1 s**.
- A repeater delays **1–4 ticks**; redstone dust adds no delay, so *n* repeaters cover 1–4*n* ticks.
- Gaps shorter than one tick cannot be wired. NoteBlock Studio flags them as **`R! < 0.1s`** and
  offers a tempo scale that opens the gap to ~0.102 s.
- Pitched note blocks have exactly **25 notes** (clicks 0–24) and depend on the block underneath.
- Percussion (bass drum, snare, hi-hat) is unpitched and chosen by General MIDI drum note.

Full tables: [docs/NOTE-BLOCK-REFERENCE.md](docs/NOTE-BLOCK-REFERENCE.md).

## Audio

Playback uses small synth voices ([`src/audio/voices.ts`](src/audio/voices.ts)) so the app works
with zero assets. To use real samples, host a CC0 pack at `public/samples/` with a
`manifest.json` shaped like:

```json
{
  "samples": [
    { "instrument": "harp", "rootMidi": 54, "file": "harp-54.wav", "gain": 1 }
  ]
}
```

[`SampleBank`](src/audio/samples.ts) loads what exists, pitch-shifts per note, and silently falls
back to synth for anything missing. Missing samples never break playback.

## Privacy

The app has **no backend**. MIDI parsing, scoring, synthesis and exports all run in the tab. The
only network requests are the app bundle, Google Fonts, and optional `samples/` files.

## Project structure

```
src/
  App.tsx                 app shell, state, transport, role/instrument controls
  audio/                  Web Audio scheduler, synth voices, sample bank
  components/             3D stage, score views, build guide, tuner
  domain/                 MIDI parsing, role detection, fitter, scoring, redstone, build plan
  render/                 VexFlow engraving helpers
docs/                     architecture, deployment, versioning, reference
```

## Deployment

Pushing to `main` builds and deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Setup, rollback and
troubleshooting: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Versioning

Releases follow [SemVer](https://semver.org/), are tracked in [CHANGELOG.md](CHANGELOG.md), and
are snapshotted as annotated git tags plus GitHub Releases.
See [docs/VERSIONING.md](docs/VERSIONING.md).

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). If you are an AI
coding agent, read [AGENTS.md](AGENTS.md) first.

## Credits

Built by **Ray Foo**. Minecraft is a trademark of Mojang Studios; this project is an unofficial
fan tool and is not affiliated with Mojang or Microsoft.
