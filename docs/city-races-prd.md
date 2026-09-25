# San Francisco city races

## Product intent

Expand SF Night Run from the original downtown route into six selectable, complete races. Each race should feel like a specific part of San Francisco, with a memorable destination, recognizable stops, its own road shape and scenery, and a visible finish. Keep the established manual steering and the original Union Square experience available.

The first release uses compact authored courses of roughly 1.6–3.4 game kilometres. These are stylized game maps: road distances, compass angles, terrain heights, pedestrian paths, and connectors are compressed or fictionalized. The itineraries preserve the requested sequence of places. They are not navigation directions or surveyed replicas.

## Shared requirements

- Let players choose a race before starting and switch back to the original route.
- Show the race name, destination, difficulty, highlights, progress, next named checkpoint, and completion state.
- Give every itinerary its own complete road geometry, backdrop, landmark labels, and start/finish.
- Preserve manual throttle, brake, steering, drift, and boost. Rounded corners must remain continuous and wide enough to drive.
- Score checkpoints by ordered route distance. Revisiting the same intersection during a lap must not jump back to an earlier route station or skip the lap.
- A restart returns to the selected course’s start and clears its checkpoint and fog state.
- Keep city detail outside the racing corridor. Landmark props are visual wayfinding, with more detailed commissioned models a later art pass.

## 1. VC Circle

**Pitch:** The quickest race: an office-tower launch into a full lap around South Park.

**Itinerary:** Salesforce Tower at Mission/Fremont → Fremont → Howard → Second → South Park’s north side → west bend → south side → east bend → north side finish after completing the loop.

**Look and feel:** Cool glass towers, warmer SoMa frontages, an intimate green park island, and café signage. Keep the park loop legible from the chase camera.

**Acceptance:** Start at the tower; reach South Park through the named SoMa sequence; drive every side of the loop before finishing. The return to the north side must remain a later checkpoint even though it overlaps an earlier section of road.

## 2. Cerebral Valley

**Updated:** The original stylized map is superseded by the [dedicated geographic and Blender rebuild](cerebral-valley-rebuild.md). The current 2.622 km race uses uncompressed geographic metres, a shared measured terrain surface, and the Alamo skyline glide.

**Pitch:** Approach Patricia’s Green and Anina, sprint up Hayes, glide toward the Painted Ladies and skyline, then descend through the neighborhood’s specific stops.

**Itinerary:** Hayes between Gough and Octavia → Anina on the right and Patricia’s Green on the left → Octavia → Hayes west past Laguna, Webster and Steiner to Scott → southwest Alamo asphalt entrance → western climbing path → east-facing skyline glide → southeast asphalt landing and Painted Ladies exit → south on Steiner across Fell and Oak → east on Page → 531 Page Street → Webster → south to Waller → west to Steiner → south past Café Réveille → Duboce Park.

**Route decisions:** “Walker” is interpreted as **Waller**. The café stop is authored at **201 Steiner**, so the route needs a Waller-to-Steiner turn after Webster. The new Hayes approach between Gough and Octavia begins before both opening landmarks, which the old Octavia start had already passed. The Alamo climb uses mapped asphalt paths and avoids the central Hayes/Pierce and Steiner stairs. The glide, accelerators and widened park asphalt are explicit game features. Steiner-to-Page replaces the earlier park perimeter lap and Scott/Page/Pierce detour. The 531 Page checkpoint occurs before the turn south onto Webster.

**Look and feel:** Patricia’s Green and Anina’s outdoor patio establish the opening block, followed by detailed Victorians, rising streets, an open Alamo lawn, the Painted Ladies against the distant skyline, a clearly signed Page address, the Réveille corner, and a Duboce Park finish.

**Acceptance:** Start east of Anina and Patricia’s Green and show them on the correct sides before the first Laguna accelerator. Follow the southwest asphalt entry, complete the east-facing glide and southeast landing, then descend Steiner to Page. 531 Page precedes Webster; the café follows Waller/Steiner and precedes the finish. Show the full street name Waller in checkpoint guidance. Provide nine inspection views, including Patricia’s Green and Anina.

## 3. Golden Gate Surfride

**Pitch:** A long westbound green corridor that opens onto Irving’s surf-and-food stops and the Pacific.

**Itinerary:** Panhandle at Baker → Stanyan → JFK Promenade → Conservatory of Flowers → Music Concourse/de Young area → Spreckels Lake → Chain of Lakes → MLK Drive → Lincoln/41st Avenue → Irving west → Mollusk near 46th → Hook Fish near 47th → Ocean Beach.

**Route decisions:** The western exit is authored near 41st rather than the late 30s to give a simple Irving approach. Mollusk is represented at **4500 Irving** and Hook Fish at **4542 Irving**, so both stops are farther west than the late 30s. Park paths and internal links are widened into fictional racing corridors.

**Look and feel:** Panhandle trees, a broad park canopy, conservatory and museum cues, lakes, distant western-park windmills, low Sunset storefronts, then open beach. The windmills are background scenery rather than a mandatory Irving stop.

**Acceptance:** Travel through the park before entering Irving; show Mollusk before Hook Fish; finish at the ocean. Both business names should be readable when passed.

## 4. Lands End

**Pitch:** A technical coastal descent with cliffside views and a dramatic Sutro approach.

**Itinerary:** Legion of Honor → El Camino del Mar → Eagle’s Point → Lands End coastal trail → Mile Rock overlook → cypress descent → Sutro Baths overlook → Point Lobos Avenue → Cliff House → Ocean Beach.

**Look and feel:** Dark cypress, pale cliffs, coastal haze, the ruins and headlands implied by low landmark silhouettes, and an open ocean finish. A fictional broad course links the trail sections.

**Acceptance:** Deliver a distinct coastal road with several readable bends; reach Sutro before Cliff House; finish below the starting elevation. Trail segments must be presented as part of the game’s stylized course, not real drivable streets.

## 5. Presidio Run

**Pitch:** A forest climb followed by flowing turns down to Crissy Field.

**Itinerary:** Arguello Gate → Arguello Boulevard/Inspiration Point → Washington Boulevard → Immigrant Point → Lincoln Boulevard → Golden Gate overlook → McDowell Avenue → Crissy Field.

**Look and feel:** Eucalyptus canopy, restrained military-era buildings, coastal batteries, an opening Golden Gate view, then the broad waterfront lawn. Use the elevation change to distinguish this race from the flat park cruise.

**Acceptance:** Include both Inspiration Point and a coastal battery landmark; descend from the forest toward Crissy Field; maintain a clear finish on the waterfront.

## 6. Golden Gate → Hawk Hill

**Pitch:** A multi-act race: waterfront launch, iconic bridge crossing, a short mandatory fog stage, then the Marin climb.

**Itinerary:** Crissy Field → Marine Drive → Fort Point → Long Avenue → Lincoln Boulevard → Merchant Road/bridge approach → south tower → fog stage across the main span → north tower → bridge exit → Alexander Avenue connector → Conzelman Road → Battery Spencer → Hawk Hill.

**Fog stage:** Trigger automatically after the south tower and clear it before the north end of the bridge. Fog builds gradually; the player stays in the same race with the same controls. Bright guidance gates provide a short playable sequence through reduced visibility. The fog stage must register completion before the bridge is considered cleared. Leaving the section clears the heavy fog and resumes the headlands climb; restarting clears the stage. The first version does not require a separate scene load or a second minigame control scheme.

**Look and feel:** International Orange bridge structures, suspension cables, fog moving across the roadway, a blue-grey bay, and warmer headland terrain above the fog. The final climb should reveal the bridge below the player.

**Acceptance:** Fog starts and ends physically on the bridge; the bridge exit follows the stage’s completion; the route continues to Battery Spencer and ends higher at Hawk Hill. Restart and course changes restore the correct normal atmosphere.

## Geographic confidence and remaining reference work

The route order comes from the user’s brief and editorial planning. The three business addresses were checked against their official location pages on September 24, 2026:

- [Café Réveille, Lower Haight](https://www.cafereveille.com/lowerhaight): 201 Steiner Street.
- [Mollusk, San Francisco](https://mollusksurfshop.com/san-francisco): 4500 Irving Street.
- [Hook Fish Co.](https://www.hookfishco.com/): 4542 Irving Street, explicitly listed at 47th Avenue.

“Walker” is interpreted as Waller; the itinerary uses Waller/Steiner to connect the café to Duboce. Precise park entrances, the bridge connectors, one-way streets, 531 Page’s exact footprint, and park path alignment still need mapping references before a later geography-accurate art pass. No exact local footprint, legal street access, or surveyed distance is claimed by this release.

The code stores explicit itinerary labels and authored elevations separately from scenery. This lets future reference work correct a street or move a landmark without redesigning the race selector or driving engine.

## Three future races worth exploring

| Race | Route idea | Why it adds something different |
| --- | --- | --- |
| Twin Peaks Transmission | Castro → Market/Portola climb → Twin Peaks Boulevard → summit overlook | A sustained hill climb, switchbacks, broadcast-tower silhouette, and a whole-city finish. |
| Mission After Hours | Dolores Park → Valencia → 24th Street → Potrero Hill overlook | Dense neighborhood corners, murals, food storefronts, then a short final climb. |
| Bay Lights | Ferry Building → Embarcadero → Oracle Park → Mission Bay → Crane Cove | A flatter night sprint with bridge lights, ballpark scale, working-waterfront shapes, and reflected neon. |

These are concept candidates only. They are intentionally outside the six-race implementation scope.

## Validation

Geometry checks cover route continuity, heading continuity, lane radius, authored heights, checkpoint order, repeated lap locations, endpoint reachability, malformed route input, and the bridge-relative fog interval. Existing driving tests should continue to pass with the original route. Integration validation should cover selecting and restarting every course, reaching a finish with manual controls, and completing the fog stage before exiting the bridge.
