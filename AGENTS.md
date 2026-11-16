<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AlphaDog project rules

AlphaDog is a live map of where dogs go. Read `docs/PRODUCT.md` before
starting feature work.

## Workflow

- When asked to "commit changes and push to GitHub" (or anything like it), do
  the whole flow without further questions: create a branch, run `npm run lint`
  and `npm run build` and fix any errors, commit with a plain-English message,
  push, open a pull request, merge it with `gh pr merge --merge --delete-branch`,
  then switch back to an up-to-date `main`. Tell the user the live site updates
  in about a minute. The person asking may be new to coding, so explain any
  problem in plain words.
- Never push straight to `main`. Work on a branch named `yourname/short-topic`,
  push it, and open a pull request.
- Branch deploys are turned off (`vercel.json`). Test changes locally with
  `npm run dev` before opening a pull request.
- Run `npm run lint` and `npm run build` before opening a pull request.
- Merge your own pull request on GitHub once it builds and looks right. Ask Jon
  for a second look on anything big. The repo only allows merge commits, and
  `main` is protected, so every change goes through a pull request.
  Merging to `main` deploys to production on Vercel.

## Secrets

- Production keys live in the Vercel project settings.
- Public, browser-safe defaults for local development live in `.env.development`.
  Personal overrides go in `.env.local`, which git ignores.
- Never commit secret keys, and never paste them into issues, pull requests, or chat.

## Database (Supabase)

- Project `alphadog` in the AlphaDog Supabase organization (East US).
- Every schema change is a new SQL file in `supabase/migrations/`, named
  `YYYYMMDDHHMMSS_what_it_does.sql`. Apply it in the Supabase SQL editor, then
  commit the file in the same pull request.
- Every table gets row-level security and explicit grants. New tables are not
  exposed automatically. The `anon` role gets no table access; public map data
  goes through `security definer` functions that return grouped data only.
- The app only uses the publishable key. Never put the secret key in app code
  or anything prefixed `NEXT_PUBLIC_`.

## Data rules

- Map data and the base map come from OpenStreetMap. Do not use Google Maps,
  Google Earth, or Street View imagery for analysis, tracing, or detection.
  Their terms forbid it.
- Do not load map tiles from `tile.openstreetmap.org`. Its usage policy does not
  allow app traffic. Use OpenFreeMap or another OSM tile host.
- OpenStreetMap attribution must stay visible on every map view.
- The app never calls the Overpass API at runtime. Baseline data is prebuilt by
  `scripts/build-area.ts` into `public/data/areas/`, and that file is committed.
- MapLibre 6 loads its worker from `public/vendor/`, copied there by the
  `predev` and `prebuild` scripts. Don't commit it, and keep the `setWorkerUrl`
  call in `src/components/AlphaMap.tsx`.
- Keep the OSM-derived baseline in its own tables, separate from user reports.
  Combine them at query or render time.
- Location privacy: never expose raw user tracks or a single user's report
  history on the public map. Aggregate to H3 cells, and do not show reports
  inside a user's home zone.

## Copy

- Plain, friendly copy. No em dashes in anything a user sees.
