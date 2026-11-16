# SniffMap (working name)

A live map of where dogs go. Think Waze for dog walkers: a baseline heat map
built from map data (hydrants, trees, grass strips, parks), sharpened by
reports from walkers. Some walkers want the hot spots so their dog goes
quickly. Others want to avoid them because their dog reacts to other dogs.

A Naper Solutions side project. Product notes live in
[`docs/PRODUCT.md`](docs/PRODUCT.md).

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js 16, TypeScript, Tailwind | Runs on Vercel with no config. Ships first as a mobile web app (PWA). |
| Map | MapLibre GL JS | Free and open source, has a built-in heatmap layer, no per-load map bill. |
| Base tiles | OpenFreeMap to start, MapTiler or Protomaps later | Free to start, swap via `NEXT_PUBLIC_MAP_STYLE_URL`. |
| Database | Supabase (Postgres + PostGIS + Auth) | Geo queries, sign-in, and row-level security in one place. Not set up yet. |
| Grid | H3 hex cells | Even buckets for heat scores, and hides exact report locations. |
| Hosting | Vercel | Preview URL for every pull request, `main` goes to production. |

## Local setup

```bash
git clone https://github.com/Jstrev2/sniffmap.git
cd sniffmap
npm install
cp .env.example .env.local   # or: npx vercel env pull .env.local
npm run dev
```

Open http://localhost:3000.

## Working together

1. Pull `main`, then branch: `git checkout -b yourname/short-topic`.
2. Commit, push, open a pull request.
3. Vercel posts a preview URL on the PR. Check it on your phone.
4. The other person reviews, then merge. `main` deploys to production.

Project rules for people and AI coding agents are in [`AGENTS.md`](AGENTS.md).
