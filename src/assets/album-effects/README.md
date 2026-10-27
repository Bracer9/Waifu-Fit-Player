# Album image layers

Derived with the built-in imagegen tool from the existing album illustrations. Original files and stored library data remain unchanged. Static and selected cards use the **same composition**; selection starts/stops motion rather than swapping the illustration.

- `vocaloid-disc.png`: reconstructed full circular disc, including the cropped/occluded portions. Rotates as one rigid image.
- `vocaloid-foreground-mask.png`: extracted foreground. Only its alpha is used as a mask to restore **original cover pixels** for the waveform, ribbons and character over the rotating disc. Its generated RGB is never displayed.
- `all-disc.png`: complete record reconstructed from `all_album.png`. The original thin magenta ribbon remains in front through an authored SVG foreground mask. The right waveform reuses the menu FFT via `MusicPulse`.

The SVG composition uses the original cover's 2200×715 coordinate system, with disc centre at (1100,178), horizontal radius 440 and vertical radius 330. The full circular sprite rotates before the 0.75 vertical projection, so the painted oval stays fixed while the whole disc turns. Both layers must be decoded before the selected vinyl effect is shown.

The other banners use 2345×670 coordinates. The collection record is centred at (1500,428), radius 440. All derived layers are decoded before their composition is displayed. Reduced motion retains the same static composition. Local masks, light and sparkle geometry live in `components/AlbumCoverEffects.tsx`; motion and light tuning live in `album-cover.css`.

## Prompts used for the new layers

Built-in imagegen, each with the corresponding original as an edit target:

- **Collection record:** “Extract and reconstruct ONLY its large vinyl record as a COMPLETE perfectly ROUND front-facing disc on transparent square canvas, centered filling 96 percent width. Keep the source's charcoal black base, magenta and cyan angular painted sectors, distressed circular scratches, thin cream outer rim, cream label, magenta center-hole rim and dark center hole. The record centre is around (1500,428) in original 2345x670 banner; top and bottom are cropped. Reconstruct those hidden parts consistently. Remove the thin pink wavy ribbon that passes across it, all rectangles/album sleeves behind it, waveform, sky and every other object. NO extra reflection, NO glow, no glossy photoreal CD, no text. A rigid single printed disc sprite for rotation. Palette and texture must closely match the original.”
