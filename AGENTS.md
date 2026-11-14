# AGENTS.md

Project instructions for OpenCode and other AI coding agents working in **NoteBlock Studio**
(`rayfoolshs/Minecraftstudio`).

Read this file before changing code. It is intentionally specific to this repository.

## 1. What this project is

A single-page React + TypeScript tool that converts MIDI files into Minecraft note-block music:
fitted notes, click counts, redstone repeater timings, a 3D preview, printed notation and a
build-plan export. It is **entirely client-side** — there is no server, database, auth or upload
path. Do not introduce one without an explicit request.

Stack: React 19, TypeScript, Vite 8 (Rolldown), Tailwind CSS 4, Three.js, VexFlow 5,
Web Audio, lucide-react icons, `midi-file` for parsing.

## 2. Commands

```bash
npm install          # lockfile is package-lock.json; use `npm ci` in CI
npm run dev          # Vite on http://localhost:3000
npm run build        # production build into dist/ with base /Minecraftstudio/
npm run preview      # serve the built output
npm run lint         # tsc --noEmit (the only automated check)
```

There is no test runner configured. Do not claim tests passed. For behaviour changes, run
`npm run lint` and `npm run build`, then exercise the affected view in a browser.

## 3. Architecture and boundaries

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | App shell, all UI state (assignment, overrides, tempo, mute/solo), transport, file loading |
| `src/domain/midiFile.ts` | MIDI byte parsing and demo MIDI synthesis |
| `src/domain/types.ts` | Shared MIDI/role types and tick↔seconds helpers |
| `src/domain/roles.ts` | Role heuristics, note merging, range formatting |
| `src/domain/instruments.ts` | Instrument catalog, ranges, click math, drum mapping |
| `src/domain/fit.ts` | Instrument choice, transposition, folding, click placement |
| `src/domain/score.ts` | Quantised per-role score model, durations, repeaters |
| `src/domain/redstone.ts` | Repeater math, too-fast detection, tempo recommendation |
| `src/domain/buildPlan.ts` | Materials, build steps, CSV and `.mcfunction` export |
| `src/audio/*` | Look-ahead scheduler, synth voices, optional sample pack |
| `src/components/*` | Studio stage, score/print, build guide, tuner |
| `src/render/vexScore.ts` | VexFlow measure drawing, ties, repeater labels |

Keep domain logic in `src/domain` (pure, no DOM/React), rendering in `src/components` and
`src/render`, and audio in `src/audio`. Do not move musical or redstone rules into components.

## 4. Domain invariants — do not break these

- A pitched note block has exactly **25 notes**: clicks `0..24` from `baseMidi`. Ranges are
  `baseMidi..baseMidi+24`; instruments with `baseMidi: null` are unpitched percussion.
- Prefer **whole-octave transposition** (key-preserving) when fitting. A non-octave shift changes
  the key and must stay visible as `keyChange` in `FitResult`.
- One redstone tick = **0.1 s**. A repeater delays **1–4 ticks**; dust adds none. A gap shorter
  than one tick is `tooFast` and must render as `R! < 0.1s`, never as a valid repeater chain.
- Tempo scaling must go through `scaleTempos` so playback, score and repeater math stay in sync.
- Notes are quantised to a 16th-note grid (`ppq / 4`) in `buildScore`; changing the grid changes
  printed rhythms — update the docs and verify print output if you touch it.
- Multiple MIDI tracks may share a role; `mergeRoleNotes` de-duplicates identical onsets.
- All tabs must keep working with **no MIDI file loaded** (the empty-state fallback).

## 5. Code style

Match the existing code: 2-space indentation, single quotes, semicolons, `type` imports where
possible, named exports for modules and a default export for `App`. Components are function
components with hooks; no classes except the audio engine. Use Tailwind utility classes with the
existing slate/emerald palette; avoid new global CSS. Icons come from `lucide-react`.

Prefer extending the domain modules over adding ad-hoc logic to `App.tsx`. Keep functions small and
pure where you can, and add a comment only for non-obvious musical or redstone reasoning.

## 6. Build, base path and deployment

- `vite.config.ts` sets `base: '/Minecraftstudio/'` for `build` and `/` for `dev`. Do not remove
  this; assets 404 on GitHub Pages without it.
- `dist/` and `node_modules/` are ignored. Never commit build output.
- Deployment is `.github/workflows/deploy.yml` on pushes to `main` (GitHub Actions Pages).
  Do not switch Pages back to branch deployment.
- Keep `package-lock.json` committed. The `esbuild` devDependency must satisfy Vite 8's peer range
  (`^0.27 || ^0.28`); downgrading it breaks clean `npm ci`.

## 7. Versioning and releases

- `package.json` `version` is the source of truth; the changelog is `CHANGELOG.md` (Keep a
  Changelog + SemVer).
- Behaviour changes need a changelog entry. User-visible features and fixes bump the minor or patch
  version; breaking workflow/API changes bump major.
- Releases are annotated tags (`vX.Y.Z`) plus a GitHub Release, pushed to `origin`. Follow
  `docs/VERSIONING.md`; do not tag without a matching changelog section and a green deploy.

## 8. Safety and scope

- Never hard-code secrets. `.env*` is ignored; `.env.example` documents placeholders only. The app
  does not currently call Gemini or any API, so no key is required at runtime.
- Do not add analytics, telemetry, remote persistence or third-party network calls without an
  explicit request. The privacy claim in the README must stay true.
- Validate untrusted input at the MIDI boundary and fail gracefully: bad files show an error and
  must not crash the studio or leave stale state.
- Do not rewrite or force-push shared history. Do not discard uncommitted user work.
- Do not commit, push, tag or publish unless the task asks for it.

## 9. Verification checklist

Before finishing a change:

1. `npm run lint` and `npm run build` both succeed.
2. The affected view works with a demo preset, a real `.mid` file, and the empty state where
   relevant.
3. Click counts, repeater text and exports still match the domain rules above.
4. Print layout still fits A4 (landscape/portrait) when score rendering changes.
5. Docs (`README.md`, `docs/*`, `CHANGELOG.md`) reflect any behaviour, setup or release change.

Report what you actually ran, and be explicit about anything left unverified.
