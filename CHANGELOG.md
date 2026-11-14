# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [1.0.0] - 2026-11-14

First documented public release, deployed to GitHub Pages.

### Added

- MIDI import by file picker or drag-and-drop, parsed entirely in the browser.
- Four generated demo arrangements: *Overworld Dawn*, *Ode to Joy Quartet*,
  *Emerald 8-Bit Groove* and *Bell & Flute Minuet* (3/4 showcase).
- Automatic role detection (Melody, Chords, Bass, Drums) with manual per-track assignment and
  track auditioning.
- Instrument catalog of 20 note-block instruments with correct base blocks and 25-semitone ranges.
- Range fitter that prefers key-preserving whole-octave shifts, with optional folding, per-role
  instrument overrides and ±octave nudges.
- Interactive 3D redstone stage with procedural block textures, note particles, click-to-audition
  and a playback playhead.
- Redstone timing engine: repeater count/settings per note, `R! < 0.1s` detection and a
  **Fit Redstone** tempo recommendation (35 %–160 % manual tempo scale).
- Engraved score view and A4 print/PDF export (VexFlow) with click counts, repeater labels,
  orientation and bars-per-system controls.
- Build Guide with material shopping list, per-measure build steps, click histogram, CSV export and
  Java Edition `.mcfunction` export.
- Tuner Sandbox: audition all 25 clicks for every instrument.
- Web Audio playback: synthesised voices for 11 timbres, look-ahead scheduling, mute/solo, and an
  optional CC0 sample pack with automatic synth fallback.
- `.mid` re-export of the loaded source file.
- Fully client-side operation; no uploads, accounts or backend.

### Changed

- `package.json` renamed to `noteblock-studio` and versioned `1.0.0`.
- `esbuild` devDependency raised to `^0.28.2` to satisfy Vite 8's peer range, allowing clean
  `npm ci` installs without `--legacy-peer-deps`.
- Production builds use the `/Minecraftstudio/` base path for GitHub Pages.

### Added (infrastructure and docs)

- GitHub Actions workflow `.github/workflows/deploy.yml` to build and deploy `dist/` to Pages.
- Committed `package-lock.json` for reproducible CI installs.
- Project documentation: `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, and `docs/` covering
  architecture, deployment, versioning and the note-block/redstone reference.

## [0.1.0] - 2026-11-14

### Added

- Initial NoteBlock Studio scaffold: MIDI parser, role heuristics, instrument model, fitter, score
  model, redstone math, demos, audio engine, 3D stage, score/print, build guide and tuner.

[Unreleased]: https://github.com/rayfoolshs/Minecraftstudio/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/rayfoolshs/Minecraftstudio/releases/tag/v1.0.0
[0.1.0]: https://github.com/rayfoolshs/Minecraftstudio/commit/13a6cd8
