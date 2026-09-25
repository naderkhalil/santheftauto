# Cerebral Valley: Alamo skyline backdrop

The new backdrop is original Blender geometry for **20 named downtown/Civic Center landmarks**. It supplements the surveyed nearby district with recognizable distant silhouettes. It does not reuse or modify the deliberately compressed skyline in `src/skyline.ts` or the original City Loop.

## Source and placement

Public building coordinates were retrieved from the corresponding Wikipedia building articles on **24 September 2026**. Each article URL and coordinate is retained in [the asset metadata](../../public/assets/cerebral-valley/skyline.meta.json). These are named landmark centres, not imported cadastral footprints. Main references include [Salesforce Tower](https://en.wikipedia.org/wiki/Salesforce_Tower), [Transamerica Pyramid](https://en.wikipedia.org/wiki/Transamerica_Pyramid), [555 California Street](https://en.wikipedia.org/wiki/555_California_Street), [181 Fremont](https://en.wikipedia.org/wiki/181_Fremont) and [San Francisco City Hall](https://en.wikipedia.org/wiki/San_Francisco_City_Hall).

Positions use the same local equirectangular projection and origin as the driving district: longitude **−122.42415**, latitude **37.77655**. No horizontal compression or repositioning is applied. The source is authored with Blender X east/Y north/Z elevation; standard glTF export makes north negative Z. Attach the loaded group outside the reflected vehicle root.

From the Alamo reveal near x −900/z −30, Salesforce lies about **3,629 m away and 24.7° north of east**. Transamerica is **37.2° north of east**, 555 California **32.9°**, and City Hall **13.6°**. A broad east/northeast view therefore includes both the Painted Ladies and the actual downtown panorama. A narrow camera aimed exactly east cannot centre all these landmarks simultaneously without moving real geography.

## Interpretation

The distinctive forms are modeled individually: Salesforce's rounded tapered profile, curved crown and silver fins; Transamerica's quartz pyramid, wings and spire; 555 California's broad carnelian granite façade and stepped roof; 181 Fremont's diagonal structure; Marriott's fan-shaped crown; and City Hall's ribbed dome and gilded lantern. Supporting towers retain their named positions, material families and approximate proportions.

Model heights are based on published overall heights where available. The metadata field `publishedHeight` is the dimensional modeling reference, not a survey assertion: the secondary One Rincon tower and simplified crowns use approximate architectural dimensions. Named landmark heights receive a **1.12 vertical scale** to make the game reveal legible. Horizontal dimensions and façade details are artistic approximations. No copied photographs or external textures are included.

## Continuous city and ground

The skyline includes **8,789 actual OpenStreetMap building footprints** between the detailed neighborhood and downtown. Known neighborhood parcel IDs and parcels around the individually modeled skyline heroes are excluded. This subordinate context uses OSM height tags or levels when available, interpreted low-rise heights otherwise, and a 105 m cap so generic massing does not replace the named tower silhouettes. Runtime materials add a restrained window rhythm that fades smoothly at subpixel sizes. This is distant city mass, not a detailed recreation of every downtown façade.

All tower and context bases now sample a separate **144×144 USGS 3DEP elevation grid**, roughly 24×27 m samples. It covers longitude −122.4248 to −122.386 and latitude 37.768 to 37.803. The ground mesh overlaps the detailed map from x 80; it blends toward the existing finer grid across the first 100 m. Beyond the measured downtown grid, a low ground skirt extends past the camera range. Its boundaries have vertical skirts, and a plane at elevation **−2 m** lies underneath the entire region to close sky gaps outside the original terrain rectangle in wide views. The lowest measured nearby terrain is 13.241 m, so the floor stays below the park and road surfaces. These closure surfaces are atmospheric rendering geometry, not surveyed terrain or a modeled Bay shoreline.

The reduced [footprints and elevation source](cerebral-skyline-context.json) retain the exact query, extent, origin, attribution, building IDs and height interpretation. Data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Elevations: [USGS 3DEP Elevation ImageServer](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer), public US government data. Retrieved 24 September 2026.

## Runtime and budget

- [Generator](../../tools/blender/build_cerebral_skyline.py), [editable Blender source](../source/cerebral-skyline.blend), [GLB](../../public/assets/cerebral-valley/skyline.glb), and [metadata](../../public/assets/cerebral-valley/skyline.meta.json).
- **380,153 triangles**, **20 material batches**, approximately **2.5 MB** of Draco-compressed GLB, including the complete terrain and lower-city layer.
- [Runtime helper](../../src/cerebral-skyline.ts): `await createCerebralSkyline()` returns a group; callers own scene attachment. Do not apply the nearby district's 650 m culling to it.
- Distant towers cast no local shadows and opt out of the neighborhood AO pass. They retain ordinary depth testing and foreground occlusion.
- Named skyline landmarks use the scene's fog color with effective exponential density capped at **0.00016** and a maximum haze blend of **46%**. Surface fog at 0.00056 would erase almost all of the skyline at this distance.
- The lower city, rooftops and ground use a stronger **0.00037** effective density, **24% minimum tint** and **88% maximum haze**. The tint composes with distance attenuation, giving about 34% haze at 1 km, 56% at 2 km and 78% at 3 km. This places the distant mass behind the existing neighborhood atmosphere while preserving readable landmark silhouettes.

## Reproduction and review

Run Blender 4.5 LTS from the project root:

```sh
Blender --background --factory-startup -t 4 --python tools/blender/build_cerebral_skyline.py
```

Append `-- --skip-render` to generate assets without the two review renders. The source scene is saved before adding any review-only imported hero buildings. [Panorama review](../reviews/cerebral-skyline-panorama.png) and [Painted Ladies bearing/scale review](../reviews/cerebral-skyline-painted-ladies.png) include the continuous downtown ground and lower city; the nearer district and Alamo terrain are supplied by the game.

The checked-in source is sufficient to rebuild offline. To refresh it, retrieve the recorded Overpass query and a float TIFF from USGS `exportImage` with the recorded extent, EPSG:4326, 144×144 pixels, and bilinear interpolation. Then run [the source reducer](../../tools/blender/prepare_cerebral_skyline_context.py) with those three local response paths: Overpass JSON, USGS response JSON, and TIFF. It requires Pillow.

Verification: TypeScript compile passed; GLB 2.0 header, finite position bounds, all twenty mesh batches, and position/normal attributes checked; both updated Blender renders inspected. The city and ground now connect under every skyline tower. Final atmosphere and foreground occlusion should also be checked in the integrated Alamo camera.
