# Versioning and backups

NoteBlock Studio follows [Semantic Versioning](https://semver.org/) and
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every release is a permanent,
restorable snapshot on GitHub.

## Current version

| Item | Value |
| --- | --- |
| Version | **1.0.0** |
| Source of truth | `version` in [`package.json`](../package.json) |
| Changelog | [`CHANGELOG.md`](../CHANGELOG.md) |
| Tag format | `vMAJOR.MINOR.PATCH` (annotated) |
| Live build | GitHub Pages deployment from `main` |

## What each number means

- **MAJOR** — incompatible changes to a public contract: export formats, `.mcfunction` command
  shape, URL structure, or saved data (if persistence is ever added).
- **MINOR** — backwards-compatible features: a new instrument, view, control or export column.
- **PATCH** — backwards-compatible fixes: wrong click count, layout bug, timing correction.

Documentation-only changes do not need a version bump unless they accompany a release.

## Release checklist

1. **Confirm the tree is clean and green.**

   ```bash
   git status --short
   npm run lint
   npm run build
   ```

2. **Bump the version** in `package.json` (no other file stores it).

3. **Write the changelog entry** at the top of `CHANGELOG.md`:

   ```md
   ## [1.1.0] - 2026-12-01
   ### Added
   - ...
   ```

   Keep `[Unreleased]` at the top for work in progress. Update the link references at the bottom.

4. **Commit** with a release message:

   ```bash
   git add package.json CHANGELOG.md
   git commit -m "Release v1.1.0"
   ```

5. **Tag and push** (annotated tags only):

   ```bash
   git tag -a v1.1.0 -m "NoteBlock Studio v1.1.0"
   git push origin main
   git push origin v1.1.0
   ```

6. **Publish a GitHub Release** from the tag, using the changelog section as the body:

   ```bash
   gh release create v1.1.0 --repo rayfoolshs/Minecraftstudio \
     --title "NoteBlock Studio v1.1.0" --notes-file - <<'EOF'
   See CHANGELOG.md for the full list of changes.
   EOF
   ```

   Attaching source archives is automatic; no build artifact is required because the site is
   deployed separately.

7. **Verify the deploy** for the release commit:

   ```bash
   gh run list --repo rayfoolshs/Minecraftstudio --workflow deploy.yml --limit 1
   curl -s https://rayfoolshs.github.io/Minecraftstudio/ | grep -o 'src="[^"]*"'
   ```

## What counts as a backup

- **Annotated git tags** — immutable pointers to the exact source of every release.
- **GitHub Releases** — human-readable notes plus downloadable source archives for each tag.
- **`main` history** — every deployed commit remains in the repository.
- **GitHub Pages deployment** — only the *current* build is served; it is **not** an archive. A
  rollback re-deploys an older tag/commit (see [DEPLOYMENT.md](DEPLOYMENT.md)).

Do not rely on `dist/` being committed: it is ignored by design and is always reproducible from a
tag with `npm ci && npm run build`.

## Restoring an old version

```bash
git fetch --tags
git checkout v1.0.0
npm ci
npm run build
npm run preview     # verify locally at /Minecraftstudio/
```

To put an old version back on the live site, either revert on `main` or build from the tag and
deploy with the workflow. Tags themselves are never moved; corrections are new patch releases.

## Hotfix flow

1. Branch from the release tag if `main` has moved on: `git switch -c fix/issue v1.0.0`.
2. Fix, verify, bump PATCH, update the changelog.
3. Merge to `main`, tag `vX.Y.Z+1`, push the tag, publish the release.

## Tag rules

- Never delete or re-point a published tag.
- Never reuse a version number.
- Use lowercase `v` and no leading zeroes.
- Pre-releases use `vX.Y.Z-beta.N` and a GitHub Release marked as a pre-release; they are not
  deployed to the public Pages site unless explicitly requested.
