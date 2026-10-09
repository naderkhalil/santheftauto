# Decal brand assets and treatments

Retrieved from the companies' official sources on October 8, 2026. Assets are
stored locally for the garage selector and the hood and door decals.

| Files | Official source | Treatment |
| --- | --- | --- |
| `nvidia.svg` | [NVIDIA brand guidelines](https://www.nvidia.com/en-us/about-nvidia/legal-info/logo-brand-usage/) · [color application SVG](https://www.nvidia.com/content/nvidiaGDC/us/en_US/about-nvidia/legal-info/logo-brand-usage/_jcr_content/root/responsivegrid/nv_container_3929217_1009525359/nv_container_412055486/nv_image.coreimg.svg/1776076920589/nvidia-logo-color.svg) | The original white vertical lockup from group `h` of NVIDIA's green-background example, exported with a tight viewBox. Paths and color are unchanged. Background is the example's NVIDIA green, `#76B900`. |
| `roboflow.svg`, `roboflow-symbol.svg` | [Roboflow brand guidelines](https://roboflow.com/brand) · [official asset kit](https://media.roboflow.com/brand/roboflow-brand-assets.zip) · [light logo SVG](https://roboflow.com/_next/static/immutable/media/roboflow-logo-light.1zi7vk6-j95_r.svg) | Original light (`#F4F2EC`) full logo and compact symbol, unchanged. The selector uses the symbol in its small square; decals use the full logo. Background is the current purple accent, `#8033EB`. |
| `sf-compute.svg`, `sf-compute-symbol.svg` | [SF Compute](https://sfcompute.com/) · [full logo SVG](https://sfcompute.com/home/logo-wordmark.svg) · [official press kit](https://sfcompute.com/brand/press-kit.zip) | Original black full logo and the kit's `logo-circle.svg`, unchanged, on white. |

## What the published guidance supports

- NVIDIA explicitly supplies one-color versions for its green background; its
  color-application example shows the white vertical logo on green. Keep the
  eyemark and wordmark together, preserve proportions, and leave at least the
  wordmark's lowercase-letter height as clear space. The decal renderer reserves
  additional padding for this lockup. The examples and text on the page differ
  on contrast (its text asks for 10:1, which its white-on-green example does not
  reach); this implementation follows the actual supplied color example.
- Roboflow's October 2026 kit supplies only ink and light logos and instructs
  users not to recolor them. It designates the light version for dark backgrounds,
  the symbol for compact spaces, and purple as an accent. A flat purple square
  with the unchanged light symbol is our application of those rules; the page
  does not explicitly approve a purple-square composition. The older purple
  wordmark is not part of the current kit.
- Square backgrounds are UI containers, not edits to the logo artwork. Company
  captions and selection indicators sit outside the brand square.

These are selectable cosmetic decals. Brand-format guidance is not a grant of
usage rights: NVIDIA's page separately requires written authorization and
prohibits implying an unapproved sponsorship or endorsement. Company marks
remain the property of their respective owners.
