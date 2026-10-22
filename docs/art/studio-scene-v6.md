# Stage spotlight correction v6

Production plate: `public/art/studio-scene-v6.png` (1672×941).
Transition wash: `public/art/studio-spotlight-wash.svg` (same plate coordinates).

The original v5 plate baked in a disconnected, one-sided light smear below the overhead spotlight. The startup/After Show wash compounded this with a large axis-aligned ellipse. v6 corrects the local baked lighting, while the new wash follows the actual aperture at (680, 32), aimed down and slightly left. Its widening cone and separately clipped wall pools illuminate both wall planes. The adjacent black device is a camera, not a second spotlight.

## Asset production

Mode: built-in `image_gen`, edit, opaque background. Input: `public/art/studio-scene-v5.png`. The returned revision retained the original 1672×941 dimensions. Only its local lighting correction was composited into a copy of v5 with a feathered elliptical mask: center (645, 155), radii (235, 285), outer feather 30%, top fade y=40..52; bounded to x=410..879, y=40..439. Outside this region all original pixels are preserved, including the floor, mat, decorations and camera. The v5 original remains available. This is offline asset preparation, not runtime image processing.

Final image generation prompt:

```text
Use case: precise-object-edit / lighting-weather. Edit target: the supplied production game-stage background plate, 1672 x 941, aspect 16:9. Make a very localized lighting correction ONLY around the black cylindrical spotlight at upper center-left (white aperture near x=680,y=32) and its illumination of the two adjoining walls. The spotlight housing points downward and slightly LEFT, so its light must originate across the actual elliptical white aperture and fan outward along that axis, with soft light on BOTH sides of that axis. Replace the existing odd one-sided bright smear / vertical cyan-white column with one physically coherent restrained warm-white spotlight cone, broadening smoothly downward and slightly left, and a soft elliptical perspective-correct pool on the cream walls. Where the beam reaches the room corner, the illumination must wrap consistently across both wall planes, including a subtle right-hand fringe; no rectangular white patches, no disconnected bright spots, no vertical stripe unrelated to the lamp. Airborne cone should be faint and soft, not opaque fog or laser. Keep the lamp shape, aperture center and tilt EXACTLY fixed. CRITICAL INVARIANTS: preserve exact pixel placement and appearance of the overhead black camera (not a lamp, do NOT light it), spotlight, pink ceiling, central vertical wall corner at x=706, cyan wall decoration at x=530..617, all pop-art wall graphics, cream wall surfaces away from the local light, floor boundary, rubber mat and neon skirting. Do not alter composition, framing, camera, geometry, colors or any region away from this local upper spotlight lighting correction. Output the same 1672x941 landscape composition, no UI, no text, no new fixtures or props.
```

## Integration

PracticeBackdrop and player asset preparation both reference v6, so an old decoded v5 cannot mask the correction. The SVG wash is predecoded by the same shared asset cache. Its coordinates scale with the plate and the existing lamp-cap mask; it has static gradients and clips, no blur filter, animation, scripts or external resources. Existing startup, pause and After Show opacity timelines and floor bounce are unchanged.

Tuning: cone vertices and wall ellipses are in the SVG; their local gradient opacity controls brightness. The lamp aperture and cap anchor remain fixed at 40.67% / 3.44% with the original 18-degree lens tilt.

## Brightness revision

The user found the first correction too bright. A second built-in image_gen edit requested: "One localized photometric adjustment only: the warm-white spotlight cone under the overhead lamp at (680,32) and its pool on the upper adjoining walls are TOO BRIGHT. Reduce their apparent intensity by about 35-40%, soften the white hotspot so the wall is warm cream instead of washed-out white. Retain the existing down-left cone direction, the exact beam outline, feathered edges, spread, positions and shape of the illuminated wall areas. Keep the lamp white aperture and every fixture, cyan graphic, pink ceiling, room seam, wall graphics, floor, mat and all geometry exactly as currently shown. No new lighting or props; no change to regions away from this single upper lamp's illumination. Same exact 1672x941 composition."

Only the revision's lower luminance was applied through the same local feathered mask; the current plate's RGB ratios and geometry remain unchanged. The transition wash's cone, wall pool and aperture halo opacity are reduced by about one third (peaks .25 / .20 / .45). Asset URLs use `?light=soft1` in both rendering and predecode to bypass already decoded bright revisions. Timing and floor bounce are unchanged.
