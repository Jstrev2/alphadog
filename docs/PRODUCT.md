# AlphaDog product notes

Working doc. Edit freely. Last updated 2026-11-16.

## The idea

Show dog walkers where dogs are most likely to pee and poop. Start with our own
best guess from OpenStreetMap, then let walkers improve it with quick reports,
the way Waze drivers report traffic.

## Who it's for

| Walker | What they want | What the map does for them |
| --- | --- | --- |
| Seeker | Dog to go fast, especially in bad weather or before work | Route toward hot spots |
| Avoider | Reactive or nervous dog, wants fewer dog encounters | Route around hot spots |
| Neighbor / HOA | Less mess on their block | Shows where waste is left behind and where bag stations are missing |

Seekers and avoiders use the same heat map with the colors read two ways. One
toggle: **Seek** or **Avoid**.

## Baseline heat map (before anyone reports anything)

All baseline data comes from OpenStreetMap. Each H3 hex cell (about 30 m
across) gets a score from three things multiplied together:

- **Walk:** how much walking route runs through it (sidewalks, quiet streets,
  paths, park edges).
- **Stops:** spots dogs stop at in or next to it (table below).
- **Homes:** how many homes are within a few hundred meters. More homes, more
  dogs. Apartment buildings count for more than houses.

Weights are guesses to tune once reports come in. The scoring lives in
`scripts/build-area.ts`.

| Signal | OSM tag |
| --- | --- |
| Fire hydrants | `emergency=fire_hydrant` |
| Street trees | `natural=tree`, `natural=tree_row` |
| Grass parkways and lawns | `landuse=grass` |
| Poles and lamp posts | `highway=street_lamp`, `power=pole` |
| Parks | `leisure=park` |
| Dog parks | `leisure=dog_park` |
| Bag stations, dog waste bins | `vending=excrement_bags`, `waste=dog_excrement` |
| Foot traffic | `highway=footway`, `footway=sidewalk` |

The build script pulls the data from the Overpass API and writes a small file
the app loads (`public/data/areas/<area>.json`). The app never calls Overpass
live. The public Overpass servers are often busy, so the script retries
across several of them.

**Pilot area: Sanford, FL.** First pull (2026-11-16): 514 sidewalks and paths,
810 residential streets, about 7,500 buildings, 370 trees and tree rows, 123
power poles, 13 parks, 2 dog parks, and only 3 fire hydrants. Hydrants are the
big gap, which is why the score leans on walking routes and homes. Walker
reports of hydrants (below) fill it in over time, and we can add hydrants to
OpenStreetMap too.

**Imagery:** Google Maps, Earth, and Street View terms forbid image analysis,
tracing, and object detection, so we don't use them.

**OSM license (ODbL):** attribution on the map is required. Keep the
OSM-derived tables separate from user reports so report data stays separate.

## Reports (the Waze part)

Three taps max: open, tap a type, confirm the pin at current location.

- **Went here**: pee or poop
- **Mess left**: waste not picked up
- **Busy spot**: lots of dogs right now
- **Missing spot**: a hydrant, bag station, or trash can that isn't on the map

Reports decay over time (a "busy spot" fades in an hour, a "went here" in
weeks). Reports from the same user in the same cell count once per day.

## Badges and streaks

Reward reporting without making it a chore: first report, 7-day streak,
"first on the map" for a new block, neighborhood leaderboards. Keep it
light. No public profiles with walk history.

## Privacy

Walk data reveals where people live. Rules from day one:

- Never show raw tracks or one person's report history to others.
- Show reports as H3 cell aggregates, not exact pins, once a cell has enough.
- Let each user set a home zone. Reports inside it are never shown publicly.

Built so far: raw reports are readable only by the person who made them. The
public map gets reports through `report_heat()`, grouped into ~11 m squares
with counts and no user ids. Pee and poop only show blended into the heat,
never as pins. Still to do: home zones, and a CAPTCHA on anonymous sign-ins
before the app is promoted beyond the pilot.

## v1 plan

1. Map with current location and the baseline heat layer for one pilot area,
   with the Seek / Avoid toggle. **Done 2026-11-16.**
2. Report button. Reports show on the map. **Done 2026-11-16:** no sign-up
   needed (anonymous Supabase sessions), Undo after each report, 30 reports
   per hour per person.
3. Blend baseline and reports into one score per cell. **Started:** pee and
   poop reports already add weight to the heat. Next: proper per-cell scoring
   and decay tuning.
4. First badges.

Ship as a mobile web app first (add to home screen). Move to a native app
(Expo / React Native) when background location or push notifications matter,
or when App Store presence becomes the growth channel.

## Open questions

- Domain name.
- Pee, poop, or both in v1.
