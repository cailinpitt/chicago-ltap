# chicago-ltap

Name the CTA 'L' station between two others, or the next stop toward the terminal.
Ten rounds, every line and branch. Built on the same stack as
[chicago-maptap](https://github.com/cailinpitt/chicago-maptap).

## Local development

```bash
npm install
npm run dev
npm run build
```

## Data

`src/data/lLines.ts` is generated from the CTA GTFS feed and committed — no network
calls at runtime besides map tiles.

```bash
npm run build:data
```

`scripts/build-l-lines.mjs` caches the GTFS zip in `scripts/.cache/` (gitignored).
Delete that folder to pull a fresh feed.
