# AlphaDog

A live map of where dogs go. Think Waze for dog walkers: a baseline heat map
built from OpenStreetMap (hydrants, trees, grass strips, parks), sharpened by
reports from walkers. Some walkers want the hot spots so their dog goes
quickly. Others want to avoid them because their dog reacts to other dogs.

Product notes live in [`docs/PRODUCT.md`](docs/PRODUCT.md).

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js 16, TypeScript, Tailwind | Runs on Vercel with no config. Ships first as a mobile web app (PWA). |
| Map data | OpenStreetMap | Free, and already tags hydrants, trees, parks, dog parks, and bag stations. |
| Base map | MapLibre GL JS + OpenFreeMap tiles | Free and open source, built-in heatmap layer, no API key or per-load bill. |
| Database | Supabase (Postgres + Auth) | Walker reports, anonymous sessions, and row-level security in one place. Schema lives in `supabase/migrations/`. |
| Grid | H3 hex cells | Even buckets for heat scores, and hides exact report locations. |
| Hosting | Vercel | `main` deploys to production. |

## Local setup

```bash
git clone https://github.com/Jstrev2/alphadog.git
cd alphadog
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. To test on your phone, open the Network address
that `npm run dev` prints while your phone is on the same Wi-Fi.

## Map data

The heat map comes from a prebuilt file per pilot area in
`public/data/areas/`. To rebuild it after changing the scoring in
`scripts/build-area.ts`:

```bash
npm run data:sanford               # reuses the OSM download cached in .cache/
npm run data:sanford -- --refresh  # downloads fresh OpenStreetMap data
```

The public OpenStreetMap servers are often busy, so a fresh download can take
several minutes. Commit the updated JSON file.

New pilot areas go in `src/lib/areas.ts`, plus a `data:<area>` script in
`package.json`.

## How we work

1. Pull `main`, then branch: `git checkout -b yourname/short-topic`.
2. Build the change and test it with `npm run dev`.
3. Run `npm run lint` and `npm run build`.
4. Commit, push, and open a pull request.
5. Jon reviews and merges. `main` goes live on Vercel a minute later.

Project rules for people and AI coding agents are in [`AGENTS.md`](AGENTS.md).
