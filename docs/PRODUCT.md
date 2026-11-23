# AlphaDog product notes

Working doc. Edit freely. Last updated 2026-11-23.

## The idea

**Mark your turf.** A neighborhood game for dog walkers. When your dog pees,
tap **Mark**. Every different spot is a point. The dog with the most points on
a block owns it. Alpha of the Day, Week and Month, leaderboards by dog size,
badges, and dog profiles you can **Woof** at. It's funny first, and it grows
into a way for dog people in a neighborhood to find each other.

Underneath, every mark also feeds a heat map of where dogs go, which still
serves walkers who want to seek or avoid the hot spots.

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

**Pilot area: Andersonville, Chicago.** Moved from Sanford, FL on 2026-11-23.
The box is Andersonville as OpenStreetMap outlines it (Lawrence to Ardmore,
Ravenswood to Broadway), padded a few blocks and stretched east to take in the
lakefront dog parks. First pull (2026-11-23): 2,262 trees, 132 poles and lamp
posts, 75 benches, about 8,800 homes, 4 dog parks (Bryn Mawr Dog Friendly
Area, Lawrence House, Puptown, Montrose Dog Beach), and only 6 fire hydrants.
Chicago has a hydrant on nearly every corner, but almost none are mapped in
OSM yet. Walker reports of hydrants (below) fill that in, and we can add them
to OpenStreetMap too.

**Imagery:** Google Maps, Earth, and Street View terms forbid image analysis,
tracing, and object detection, so we don't use them.

**OSM license (ODbL):** attribution on the map is required. Keep the
OSM-derived tables separate from user reports so report data stays separate.

## The turf game

- **Blocks** follow Chicago's address grid: one block per hundred-block
  crossing (about 200 m square), centered on the corner, so streets run through
  the middle of a block. Names like "Paulina & Balmoral" come from OSM streets
  (`scripts/build-area.ts`). Grid math lives in `src/lib/grid.ts` and in SQL.
- **Points:** one per different ~25 m spot a dog marks, once per spot per day.
  Marking your stoop 30 times is one point. Roaming the block is many.
- **Ownership:** the dog with the most points on a block over the last 7 days.
  Ties go to the local dog, then to whoever got there first. The board is
  computed as of the top of each hour, never live.
- **Marks are real:** GPS location only (no dragging a pin), accuracy 100 m or
  better, inside the pilot box, at most 60 an hour, and no faster than a run
  between marks.
- **Leaderboards:** points this day, week or month, all sizes or Toy / Small /
  Medium / Large / Giant. Number one is the Alpha.
- **Badges** (counted, so "Fire Dog ×7"): Alpha of the Day / Week / Month,
  Fire Dog (hydrant), Tuff Stuff (lamp post or pole), Park Life (dog park),
  Nomad (first dog ever to mark a block), On a Roll (7 days in a row), Night
  Owl, Early Bird, First Mark. Hydrants, poles and dog parks come from OSM in
  `public.osm_spots`, plus walker hydrant reports that 2 or more people agree on.
- **Woofs:** tap Woof on a dog's card. Woof back and you're pack. No messages
  in v1.
- **While you were out:** on open, blocks you won or lost since last time.

## Reports (the Waze part)

Three taps max: open, tap a type, confirm the pin at current location.

- **Went here**: poop (pee is a Mark now)
- **Mess left**: waste not picked up
- **Busy spot**: lots of dogs right now
- **Missing spot**: a hydrant, bag station, or trash can that isn't on the map

Reports decay over time (a "busy spot" fades in an hour, a "went here" in
weeks). Reports from the same user in the same cell count once per day.

## Privacy

Walk data reveals where people live. Rules from day one:

- Never show raw tracks, marks, or one person's report history to others.
  Marks and reports are readable only by the person who made them.
- Dogs are the public face. Owner names and emails are never shown.
- **Hidden zone** (like Strava's privacy zones, but it hides attribution
  instead of throwing data away). The owner drops a pin on home once; the app
  turns it into a random 2 by 2 square of blocks that contains home, sometimes
  plus one more, and saves only those block ids. Home could be any of them.
  Marks inside still count for everything. A block won by a dog whose own
  hidden zone covers it shows to everyone else as "Held by a local", with no
  name or photo. Because it only hides your own marks, no block is ever closed
  off to other dogs.
- Who holds a block shows only when someone taps it. There is no public list
  or map of one dog's turf, so nobody can look for the hole around a home.
- The turf board updates hourly, not live.
- **Ghost mode:** the dog disappears from the turf board, leaderboards and
  woofs, and still earns points and badges privately.
- Heat map: marks and pee/poop reports only show in a ~25 m spot once 3 or
  more different people have marked it (`dog_heat()`).
- Still to do: a CAPTCHA on anonymous sign-ins and photo moderation before the
  app is promoted beyond the pilot.

## Plan

1. Map, baseline heat, Seek / Avoid. **Done 2026-11-16.**
2. Reports. **Done 2026-11-16.**
3. Turf game: dog profiles with photos, Mark, turf blocks, hidden zones, ghost
   mode, leaderboards by size, badges, woofs, "While you were out", phone and
   desktop layouts. **Done 2026-11-23.**
4. Next: custom email sender (SMTP) so sign-in emails carry a 6 digit code
   (works inside the installed app), push alerts for stolen blocks (web push
   works for home-screen apps on iPhone), pack walks and dog events.

Accounts start as anonymous guests. Adding an email in My dog saves the dog
and lets the same account sign in on phone and computer.

Ship as a web app that installs to the home screen on phones and as a desktop
app from Chrome or Edge. Move to a native app (Expo / React Native) when
background location matters, or when App Store presence becomes the growth
channel.

## Open questions

- Domain name.
- Photo moderation before a wider launch.
- Whether to re-fit the address grid as the game spreads beyond Andersonville.
