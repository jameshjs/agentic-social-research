# Two World mark

The symbol is a shared street branching into two small, isometric city blocks. It expresses the core product: hold the starting world constant, change one policy, then inspect two outcomes. It avoids a globe, sparkles, arrows, and chart bars because the product already has a concrete place and a causal split.

## Assets

- `two-world-mark.svg`: primary mark for dark UI, using the existing cream, mint, and coral palette.
- `two-world-mark-light.svg`: darker ink and darker route colours for white or cream fields.
- `two-world-mark-mono.svg`: one-ink version for stamps, overlays, or limited-color exports.
- `two-world-favicon.svg`: simplified shape redrawn on a coarse grid for 16–32 px browser icons.

Both are hand-authored SVG geometry with no external font, filter, gradient, or image dependency. The files have a square viewBox and transparent background. Use the existing `two.world` text lockup next to the mark. The mark is artwork; the `<a>` wrapping it supplies the accessible name.

Suggested header replacement (Aadit or integration owner): replace the entire four-span `.brand-mark` element with `<img class="brand-icon" src="./brand/two-world-mark.svg" width="29" height="29" alt="" />`, and add `.brand-icon{display:block;flex:none;width:29px;height:29px}`. Keep the image decorative because the existing link is labelled `Two World home`. Add `<link rel="icon" href="./brand/two-world-favicon.svg" type="image/svg+xml">` in the page head. On a light field use the light variant. The `preview.html` page shows the marks at 16, 24, and 64 px on both backgrounds.
