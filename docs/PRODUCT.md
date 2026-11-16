# SniffMap product notes

Working doc. Edit freely. Last updated 2026-11-16.

## The idea

Show dog walkers where dogs are most likely to pee and poop. Start with our own
best guess from map data, then let walkers improve it with quick reports, the
way Waze drivers report traffic.

## Who it's for

| Walker | What they want | What the map does for them |
| --- | --- | --- |
| Seeker | Dog to go fast, especially in bad weather or before work | Route toward hot spots |
| Avoider | Reactive or nervous dog, wants fewer dog encounters | Route around hot spots |
| Neighbor / HOA | Less mess on their block | Shows where waste is left behind and where bag stations are missing |

Seekers and avoiders use the same heat map with the colors read two ways. One
toggle: **Seek** or **Avoid**.

## Baseline heat map (before anyone reports anything)

Score each H3 hex cell from features that pull dogs in. Weights are guesses to
tune later.

| Signal | Source | OSM tag |
| --- | --- | --- |
| Fire hydrants | OpenStreetMap, city open data | `emergency=fire_hydrant` |
| Street trees | OSM, city tree inventories | `natural=tree`, `natural=tree_row` |
| Grass parkways and lawns | OSM, NAIP imagery | `landuse=grass` |
| Poles and lamp posts | OSM | `highway=street_lamp`, `power=pole` |
| Parks and park entrances | OSM | `leisure=park` |
| Dog parks | OSM | `leisure=dog_park` |
| Bag stations, dog waste bins | OSM | `vending=excrement_bags`, `waste=dog_excrement` |
| Foot traffic | OSM sidewalks and paths, residential density | `highway=footway`, `footway=sidewalk` |

OSM coverage of hydrants and trees varies a lot by town, so check the pilot
area first and fill gaps from that city's open-data portal.

**Imagery:** Google Maps, Earth, and Street View terms forbid image analysis,
tracing, and object detection, so we don't use them. USDA NAIP aerial imagery is
public domain and includes a near-infrared band, which makes grass and tree
cover easy to detect. It's too coarse to spot hydrants, so treat it as a later
add-on for vegetation, not the core signal.

**OSM license (ODbL):** attribution on the map is required. Keep the
OSM-derived tables separate from user reports so our report data stays ours.

## Reports (the Waze part)

Three taps max: open, tap a type, confirm the pin at current location.

- **Went here**: pee or poop
- **Mess left**: waste not picked up
- **Busy spot**: lots of dogs right now
- **Bag station / trash can**: missing from the map

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

## v1 plan

1. Map with current location and the baseline heat layer for one pilot area.
2. Sign-in and a report button. Reports show on the map.
3. Blend baseline and reports into one score per cell, with the Seek / Avoid
   toggle.
4. First badges.

Ship as a mobile web app first (add to home screen). Move to a native app
(Expo / React Native) when background location or push notifications matter,
or when App Store presence becomes the growth channel.

## Open questions

- Final name and domain.
- Pilot area: Naperville, a Chicago neighborhood, or wherever the two of us
  walk dogs most.
- Pee, poop, or both in v1.
- Ownership split and who pays for what. Write it down before it gets bigger.

