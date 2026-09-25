# Anina: 482 Hayes and the east patio

Original Blender geometry authored for the Cerebral Valley opening. This asset replaces ordinary parcel **60824061**, the **482–488 Hayes** twin-bay Victorian. **Anina occupies the eastern/right storefront; Brass Tacks occupies the western/left storefront.** The neighboring Octavia corner building and the rear Ivy Street apartments remain separate neighborhood buildings.

## Observed references

Inspected 25 September 2026:

1. [Anina's official website](https://www.aninasf.com/): confirms **482 Hayes Street**, the outdoor patio, and patio reservations. Its gallery photograph shows a turquoise paneled rear fence, timber picnic tables on navy steel frames, bare festoon bulbs, round concrete pots, stacked white concrete blocks and a lime green planter. The large ANINA wordmark over the website gallery is a page overlay, not a physical sign on the rear fence; it is not copied onto the modeled fence.
2. [Google Maps Street View, May 2025](https://www.google.com/maps/place/ANINA/@37.7767083,-122.4243483,3a,75y,11.48h,90t/data=!3m4!1e1!3m2!1s8cG67xvpX9HY-r4JNxiRgw!2e0): viewed from Hayes. Establishes the paired rectangular bays, light sage siding, darker green spandrels, ivory cornices and window frames, deep central recess, separate Brass Tacks and Anina entries, navy/coral bar frontage and small cream ANINA sign. The open side parcel is clearly **east of Anina**, between the Victorian and the contemporary 450 Hayes building. Street View also shows newer covered seating and a street parklet.
3. [SF Station's Anina gallery](https://www.sfstation.com/anina-b256425): confirms the navy/coral bar exterior and historical outdoor seating. Its red umbrellas and street enclosure reflect an earlier arrangement; they are not added as opaque blockers to the opening race view.

Photographs were used as visual references only. No source photograph, Google imagery or website artwork is embedded as a texture. Geometry, material maps and the small decorative palm silhouettes are original. The palm forms suggest the bar's tropical interior theme without reproducing a photographed mural.

## Location and patio boundaries

Source parcel and street coordinates are from the existing [measured geographic layout](cerebral-valley-layout.json), © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

The asset's local frontage midpoint is semantic **x −16.106, z 28.639**, elevation **21.6867 m**. It rotates **0.160918 radians** with Hayes Street. The main bar frontage is south-facing; Blender X east/Y north/Z elevation exports to glTF X east/Y elevation/**negative Z north**. Attach directly to the canonical Cerebral scene group, outside the reflected car root.

The patio is the unbuilt gap between parcel 60824061 and the splayed west edge of **450 Hayes, parcel 28015901**. Its footprint uses these mapped adjoining boundaries, in x east/z north metres:

| Corner | X | Z |
| --- | ---: | ---: |
| Southwest | −10.805 | 29.500 |
| Southeast | −3.414 | 30.658 |
| Northeast | 4.919 | 51.597 |
| Northwest | −13.788 | 48.669 |

The patio's north boundary meets the existing rear apartment parcel **60824057**. No other ordinary building is excluded. The layout of tables and individual plants is interpreted within this mapped space; their placement is not a surveyed inventory.

## Detail and gameplay interpretation

The model includes twin bay stacks with projecting cornices, dentils and corbels; individual siding courses; framed sash windows; an open timber bar door; separate Anina and Brass Tacks nameboards; patio-facing windows and door; a shallow furnished bar interior; nine picnic tables; planters and hollow white concrete blocks; and suspended bulbs on sagging wires.

The opaque turquoise fence is at the **rear**. The Hayes edge remains low, with an open entrance. Thin steel framework and two **14% opacity** rear roof panels retain the covered patio's character while exposing tables to the race camera. The front patio roof area is deliberately open. The street parklet is omitted so it does not narrow the road or cover the storefront from the driving camera. These are intentional visibility choices, not a claim of an exact reconstruction of the May 2025 canopy arrangement.

Pale green, ivory, navy and coral colors are photographic interpretations under different daylight, not sampled paint specifications. Dimensions outside the mapped footprint are architectural estimates. Original packed fine-grain normal and roughness maps provide subtle close-view material detail.

## Files and reproduction

- [Blender generator](../../tools/blender/build_cerebral_anina.py)
- [Editable Blender source](../source/cerebral-anina.blend)
- [Runtime GLB](../../public/assets/cerebral-valley/anina.glb) and [metadata](../../public/assets/cerebral-valley/anina.meta.json)
- [Front review](../reviews/cerebral-anina-front.png) and [patio review](../reviews/cerebral-anina-patio.png)

Final export: **504,456 bytes**, **29,766 triangles**, **30 material batches**. All **935 front glyph face samples** across the three signs are unblocked. Rear canopy panels export as glTF `BLEND` with alpha **0.14**.

Run Blender 4.5 LTS from the project root:

```sh
Blender --background --factory-startup -t 4 --python tools/blender/build_cerebral_anina.py
```

Append `-- --skip-render` to export without reviews. Optional macOS Arial fonts fall back to Blender's default font elsewhere. The source scene remains editable; other hero assets are untouched.

Verification includes both Blender views, finite GLB bounds, material alpha mode for the rear canopy, and a ray audit of every front glyph face sample. All three signs have zero blocked samples. Final street approach framing and the surrounding 450 Hayes wall are reviewed in the integrated game.
