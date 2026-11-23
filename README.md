# AlphaDog

Mark your turf. A neighborhood game for dog walkers: tap Mark when your dog
pees, claim blocks, win badges, take the Alpha crown, and woof at the dogs
next door. Underneath is a heat map of where dogs go, built from
OpenStreetMap and sharpened by marks and walker reports.

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
npm run data:andersonville               # reuses the OSM download cached in .cache/
npm run data:andersonville -- --refresh  # downloads fresh OpenStreetMap data
```

The public OpenStreetMap servers are often busy, so a fresh download can take
several minutes. Commit the updated JSON file.

The badges also need the area's hydrants, poles and dog parks in the database.
After rebuilding, regenerate that migration and run it in the Supabase SQL
editor:

```bash
node scripts/osm-spots-sql.ts andersonville > supabase/migrations/<timestamp>_osm_spots_andersonville.sql
```

New pilot areas go in `src/lib/areas.ts`, plus a `data:<area>` script in
`package.json`.

## How we work

1. Pull `main`, then branch: `git checkout -b yourname/short-topic`.
2. Build the change and test it with `npm run dev`.
3. Run `npm run lint` and `npm run build`.
4. Commit, push, and open a pull request.
5. Merge the pull request on GitHub. `main` goes live on Vercel a minute later.

Project rules for people and AI coding agents are in [`AGENTS.md`](AGENTS.md).
VS Code offers the recommended extensions (Claude Code, Codex, ESLint,
Prettier, Tailwind CSS) the first time you open the folder.
