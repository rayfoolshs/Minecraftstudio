# Deployment

The site is a static Vite build hosted on **GitHub Pages** as a project site:

- URL: <https://rayfoolshs.github.io/Minecraftstudio/>
- Pages source: **GitHub Actions** (`build_type: workflow`)
- Workflow: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
- Trigger: push to `main`, or manual `workflow_dispatch`

## How the pipeline works

```
push to main
   │
   ▼
build job (ubuntu-latest, Node 22)
   npm ci → npm run build → configure-pages → upload-pages-artifact (dist/)
   │
   ▼
deploy job (github-pages environment)
   actions/deploy-pages
   │
   ▼
https://rayfoolshs.github.io/Minecraftstudio/
```

Key properties:

- `permissions` grants `contents: read`, `pages: write`, `id-token: write` — the minimum for
  OIDC-based Pages deployment.
- `concurrency: pages` with `cancel-in-progress` means only the newest push deploys; a queued run
  for an older commit is skipped.
- `npm ci` requires the committed `package-lock.json`. Keep it in sync whenever dependencies change.
- The artifact is `dist/` only. `node_modules/`, logs and source are never published.

## The base path matters

GitHub Pages serves project sites under `/<repo>/`, so `vite.config.ts` sets:

```ts
base: command === 'build' ? '/Minecraftstudio/' : '/'
```

Consequences:

- `npm run dev` serves at `http://localhost:3000/`.
- `npm run build` emits `<script src="/Minecraftstudio/assets/…">`.
- `npm run preview` serves the built app at `http://localhost:4173/Minecraftstudio/`.

If you fork the repo under a different name, change `base` to `/<your-repo>/` or the page will
load blank with 404s for `/assets/*`.

## Deploying

Normal flow: merge or push to `main`. Watch the run:

```bash
gh run list --repo rayfoolshs/Minecraftstudio --workflow deploy.yml
gh run watch --repo rayfoolshs/Minecraftstudio
```

Manual deploy of the current `main`:

```bash
gh workflow run deploy.yml --repo rayfoolshs/Minecraftstudio --ref main
```

Local production check before pushing:

```bash
npm run build
npm run preview     # http://localhost:4173/Minecraftstudio/
```

## Rollback

**Preferred:** revert the offending commit on `main` and let the workflow redeploy the previous
state.

```bash
git revert <sha>
git push origin main
```

**Fast path:** re-run the last successful workflow (it re-deploys that commit's artifact):

```bash
gh run list --repo rayfoolshs/Minecraftstudio --workflow deploy.yml --status success --limit 5
gh run rerun <run-id> --repo rayfoolshs/Minecraftstudio
```

To deploy an older release exactly, check out its tag, build and use the same workflow's manual
dispatch from that ref (or push a revert). GitHub Pages only keeps the current deployment; the
permanent snapshots are the git tags and GitHub Releases (see [VERSIONING.md](VERSIONING.md)).

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Page shows `404` for `/src/main.tsx` | Pages is still deploying the branch/root (legacy pipeline), serving the raw `index.html` | Set `build_type` to `workflow`: `gh api -X PUT repos/<owner>/<repo>/pages -f build_type=workflow`, then re-run the workflow |
| Blank page, console 404s under `/assets/` | Wrong `base` in `vite.config.ts` | Set `base` to `/<repo>/` for builds |
| Deploy job fails with "environment protection rules" | `github-pages` environment requires approval or has branch restrictions | Approve the deployment or relax the rule in Settings → Environments |
| `npm ci` fails: peer dependency conflict | `package-lock.json` out of date or `esbuild` outside Vite 8's peer range | Run `npm install`, commit the lockfile; keep `esbuild` at `^0.28` |
| Assets stale after deploy | Browser/CDN cache | Hard reload, or check the deployment in Settings → Pages |
| Workflow warns Node 20 actions are deprecated | Action majors still target Node 20; runners force Node 24 | Harmless; upgrade action majors when available |
| Two deployments race after changing Pages settings | An in-flight legacy build finishes after the Actions deploy | Re-run the workflow once `build_type` is `workflow` |

Check the live state without a browser:

```bash
gh api repos/rayfoolshs/Minecraftstudio/pages \
  --jq '{status, build_type, url: .html_url}'
curl -s https://rayfoolshs.github.io/Minecraftstudio/ | grep -o 'src="[^"]*"'
```

The script `src` should be `/Minecraftstudio/assets/index-*.js`, never `/src/main.tsx`.

## Changing the Pages source

Only maintainers should change this. Confirm the current setting first:

```bash
gh api repos/rayfoolshs/Minecraftstudio/pages
```

Switch to Actions deployment:

```bash
gh api -X PUT repos/rayfoolshs/Minecraftstudio/pages -f build_type=workflow
```

After switching, trigger one deploy so the first Actions artifact becomes live (an older
branch-based build may otherwise remain until the next push).
