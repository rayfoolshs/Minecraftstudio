# Contributing to NoteBlock Studio

Thanks for helping improve the tool. This guide covers local setup, the checks we expect, and how
to get a change merged.

## Before you start

- Open an issue for anything larger than a small fix, so the approach can be agreed first.
- Search existing issues and pull requests to avoid duplicate work.
- For anything involving Minecraft behaviour (clicks, repeater delay, block materials), cite the
  relevant [Minecraft Wiki](https://minecraft.wiki/w/Note_Block) fact in the issue or PR.

## Setup

Requires **Node.js 22+**.

```bash
git clone https://github.com/rayfoolshs/Minecraftstudio.git
cd Minecraftstudio
npm install
npm run dev
```

The dev server runs at <http://localhost:3000>. MIDI files are parsed in the browser, so you can
test with any local `.mid` file — drag it onto the window or use **Import MIDI**.

## Checks

Run these before opening a pull request:

```bash
npm run lint     # TypeScript, no emit
npm run build    # production build (also proves the Pages base path resolves)
```

There is no automated test suite yet. Describe the manual verification you did in the PR,
including which demo preset or MIDI file you used.

## Code guidelines

- Match the existing style: 2-space indent, single quotes, semicolons, TypeScript everywhere.
- Keep musical/redstone logic in `src/domain` and free of React or DOM imports.
- Reuse the existing domain helpers (`fitRole`, `buildScore`, `repeatersForDelay`, ...) instead of
  duplicating rules in components.
- Preserve the domain invariants listed in [AGENTS.md](AGENTS.md) — especially the 25-semitone
  range, whole-octave preference, and 0.1 s redstone tick.
- Do not add dependencies without explaining why an existing one (or plain browser APIs) will not
  do. Avoid anything that sends user data off-device.
- Update `README.md` / `docs/*` when user-visible behaviour changes.

## Branching and commits

- Branch from `main`: `feat/short-name`, `fix/short-name`, `docs/short-name`.
- Keep commits focused; one logical change per commit.
- Write imperative subject lines, e.g. `Add trumpet instrument to the tuner`.
- Reference the issue number in the body when there is one.

## Release and deploy

Merging to `main` deploys to GitHub Pages automatically. Versioning, tagging and rollback are
documented in [docs/VERSIONING.md](docs/VERSIONING.md) and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Contributors do not need to bump versions; maintainers do
that at release time.

## Pull request checklist

- [ ] The change is scoped to one problem.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] The affected view was tested with a demo and a real MIDI file.
- [ ] Click counts, repeater labels and exports were checked if score logic changed.
- [ ] Docs or changelog updated when behaviour changed.

## Reporting bugs

Include:

- What you expected and what happened.
- Browser and OS.
- The MIDI file (or a minimal excerpt) and which demo preset was closest.
- Console errors, if any, and whether the failure happens on the live site or locally.

Please do not attach copyrighted MIDI arrangements you do not have permission to share.

## Code of conduct

Be respectful and constructive. This is a small volunteer project; assume good intent and keep
discussion focused on the work.
