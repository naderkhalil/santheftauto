# Cerebral Valley: Hayes sprint and Alamo skyline glide

This playable revision follows the user's new direction after checkpoint commit `d3ad64e`. The original geographic source remains in `cerebral-valley-layout.json` and `CEREBRAL_POINTS`; the new race is authored separately in `src/cerebral-play-route.ts`.

## The line

Start at Hayes/Octavia, take two short boost strips up Hayes, and brake before the southwest corner of Alamo Square. Sweep from Hayes/Scott onto the southwest asphalt entrance and climb the real western path. At the western crest, face east and launch over the open lawn. Land on the real southeast asphalt junction, descend the southeast path beside the Painted Ladies, then turn south on Steiner. Cross Fell and Oak, turn east on Page, pass 531–535 Page, turn south on Webster and west on Waller past Café Réveille, and finish at Duboce Park.

The route is **2,532.96 metres** with the current 12 m corner rounding. It removes the old Alamo perimeter lap and the Scott-to-Page/Pierce detour. It keeps the required Page, 531 Page, Webster, Waller, Réveille and Duboce sequence.

## Why this entrance

The obvious central Hayes/Pierce entrance includes **two mapped twelve-step concrete flights** (OSM ways `25004336` and `481515729`). The middle Steiner entrance is also stairs. Those would be the wrong choice for an asphalt car route.

The southwest entry is mapped asphalt: path `481480919` connects the Hayes/Scott corner, path `25004337` climbs northeast, and path `389112758` reaches the western crest. These are paths 27, 6 and 25 in the canonical park JSON. The southeast landing junction and exit use asphalt path `1559829905` (path 54).

The southwest gate is deliberately simplified into one broad 12 m turn. Following every tightly spaced source node would force an unsteerable ~5 m radius with this car. The race surface widens the inside of that bend by a few metres; the route does not claim that a full-width motor road exists in the park. The airborne crossing over the lawn is an intentional game feature.

## Launch geometry

| Beat | X east | Z north | Ground elevation |
| --- | ---: | ---: | ---: |
| Hayes/Scott park entrance | −1055.908 | −148.590 | 64.524 m |
| Western climbing path | −1018.012 | −91.004 | 74.065 m |
| Summit approach | −984.339 | −76.221 | 78.829 m |
| Crest anchor | −967.296 | −67.293 | 79.709 m |
| Southeast asphalt landing anchor | −856.440 | −55.304 | 76.157 m |
| Southeast exit path | −803.374 | −78.525 | 71.043 m |

Takeoff starts five metres past the crest anchor, after its small heading transition. With current rounding it is at route station **1128.318 m**, and touchdown is at **1234.776 m**: a **106.458 m** crossing. Heading is **83.83° clockwise from north**, almost due east with six degrees of northward component. The line stays straight until the very small final transition onto the landing path.

All seven Painted Ladies lie within the forward vista from the midpoint, about 100 m beyond touchdown, slightly left of the flight heading. The configured 15 m glide rise lifts the car above nearby Victorian roofs, with the actual park lawn below. A downtown backdrop should remain geographically east/northeast; it should not move onto the lawn or replace the houses.

The rounded touchdown is only ~16 cm from the mapped asphalt junction. The outgoing path bends gently southeast before Steiner, allowing the vista to remain stable through the crossing.

## Boost and braking design

- **Hayes Express:** stations ~160–182 m, 74 m/s target, four-second effect.
- **Hayes Hill Sprint:** ~454–478 m, 76 m/s target, 3.6-second effect. Even assuming immediate maximum speed for the full effect, it expires over 250 m before the park entrance. Keep that approach clear for braking.
- **Skyline Run-up:** ~1072–1108 m, 36 m/s target, 1.5-second effect. Its exit is about 20 m before takeoff, providing the minimum 24 m/s launch speed without carrying the Hayes sprint into the park bend.

Named anchor indices and all features are exported together. Scenery, jump rings, checkpoints and camera stops should use those names rather than the removed perimeter-lap indices.

## Verification

The standalone geometry tests check the 2.53 km length, retained geographic source, required destination order, exact measured asphalt anchors, minimum 12 m turning radius, open-park flight corridor, east-facing Painted Ladies vista, asphalt touchdown, and meaningful braking distance after Hayes boosts. Driving tests verify a complete run using only accelerator, brake and steering inputs at 30, 60 and 120 Hz: all three pads collect, the car launches and lands once, Hayes speed exceeds 70 m/s, glide altitude exceeds 12 m, every checkpoint completes, and no collision assistance is required. Pad bypass, one-time collection, braking cancellation and reset are also covered.
