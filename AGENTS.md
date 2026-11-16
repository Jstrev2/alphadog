<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SniffMap project rules

SniffMap (working name) is a Naper Solutions side project built by two people.
Read `docs/PRODUCT.md` before starting feature work.

## Workflow

- Never push straight to `main`. Work on a branch named `yourname/short-topic`,
  open a pull request, and check the Vercel preview URL before merging.
- `main` deploys to production on Vercel automatically.
- Run `npm run lint` and `npm run build` before opening a pull request.
- Secrets live in Vercel project settings. Pull them with
  `npx vercel env pull .env.local`. Never commit `.env*` files except
  `.env.example`, and never paste keys into issues, PRs, or chat.

## Data rules

- Do not use Google Maps, Google Earth, or Street View imagery for analysis,
  tracing, or detection. Their terms forbid it. Baseline data comes from
  OpenStreetMap, city open-data portals, and public-domain USDA NAIP imagery.
- OpenStreetMap attribution must stay visible on every map view.
- Keep the OSM-derived baseline in its own tables, separate from user reports.
  Combine them at query or render time.
- Location privacy: never expose raw user tracks or a single user's report
  history on the public map. Aggregate to H3 cells, and do not show reports
  inside a user's home zone.

## Copy

- Plain, friendly copy. No em dashes in anything a user sees.
