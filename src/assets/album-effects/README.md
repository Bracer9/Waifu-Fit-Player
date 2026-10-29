# Album image layers

Derived with the built-in imagegen tool from the existing album illustrations. Original files and stored library data remain unchanged. Static and selected cards use the **same composition**; selection starts/stops motion rather than swapping the illustration.

- `vocaloid-disc.png`: reconstructed full circular disc, including the cropped/occluded portions. Rotates as one rigid image.
- `vocaloid-foreground-mask.png`: extracted foreground. Only its alpha is used as a mask to restore **original cover pixels** for the waveform, ribbons and character over the rotating disc. Its generated RGB is never displayed.
- `all-disc.png`: complete record reconstructed from `all_album.png`. The original thin magenta ribbon remains in front through an authored SVG foreground mask. The right waveform reuses the menu FFT via `MusicPulse`.
- `all-disc-oil.png`, `vocaloid-disc-oil.png`: oil-paint versions of the corresponding record sprites for the user's replacement covers. Original sprites remain available for the original fingerprints; all three idle/selected/insertion states use the same chosen sprite.

The SVG composition uses the original cover's 2200×715 coordinate system, with disc centre at (1100,178) and circular radius 440. The previous 0.75 vertical projection compressed the disc and has been removed: the sprite and clip now use the same circular proportions as the cover. Both layers must be decoded before the selected vinyl effect is shown.

The other banners use 2345×670 coordinates. The collection record is centred at (1500,428), radius 440. All derived layers are decoded before their composition is displayed. Reduced motion retains the same static composition. Local masks, light and sparkle geometry live in `components/AlbumCoverEffects.tsx`; motion and light tuning live in `album-cover.css`.

## Prompts used for the new layers

Oil-paint sprites use built-in imagegen style-transfer edits. Each original sprite is the edit target; its corresponding user-edited cover is the texture reference. Shared prompt: “Return only the original perfectly centred ROUND record on transparent background. Change only surface texture to match the cover's raised directional oil-paint brush ridges. Preserve the circular silhouette, diameter, margin, centre hole, cream label, every black/cyan/hot-pink sector boundary, orientation and colour. No redesign, perspective, new highlights, symbols, waveform, character, scene or ribbon.” Both outputs were inspected and saved beside the original sprites.

Built-in imagegen, each with the corresponding original as an edit target:

- **Collection record:** “Extract and reconstruct ONLY its large vinyl record as a COMPLETE perfectly ROUND front-facing disc on transparent square canvas, centered filling 96 percent width. Keep the source's charcoal black base, magenta and cyan angular painted sectors, distressed circular scratches, thin cream outer rim, cream label, magenta center-hole rim and dark center hole. The record centre is around (1500,428) in original 2345x670 banner; top and bottom are cropped. Reconstruct those hidden parts consistently. Remove the thin pink wavy ribbon that passes across it, all rectangles/album sleeves behind it, waveform, sky and every other object. NO extra reflection, NO glow, no glossy photoreal CD, no text. A rigid single printed disc sprite for rotation. Palette and texture must closely match the original.”
