# Reference fix patterns — images-media-audit

Cited by `SKILL.md` when a finding needs a **Fix pattern:** line. Copy the entries you cite
into the report so it stands alone.

**Image alt text.** Meaningful images: describe the content/function in `alt`, not the
filename. Purely decorative images: `alt=""` (empty, not omitted) so screen readers skip
them silently. An image that's the *only* content of a link/button: its `alt` must convey
the link's destination/action, not just describe the picture.

**Standalone icon SVG.** Give an interactive icon SVG an accessible name via `aria-label`
on the element (or a `<title>` as the first child referenced by `aria-labelledby`);
purely decorative icons get `aria-hidden="true"` so they're skipped.

**Video captions.** Provide a `<track kind="captions">` (or `subtitles`) for any video
with dialogue or meaningful audio, per WCAG 1.2.2. Confirm with the content owner before
exempting a truly silent/ambient clip.

**CSS background-image / icon-font icons.** These cannot carry an accessible name
themselves. Handle by case:
- *Decorative, CSS background-image* (meaning already in adjacent text — a phone glyph
  beside the phone number): leave as-is; a background image is never in the accessibility
  tree, so no `aria-hidden` is needed.
- *Decorative, icon-font glyph* (`::before`/`::after`): add `aria-hidden="true"` to the
  glyph element — Private-Use-Area glyphs can otherwise be spoken as a junk character by
  some screen readers, unlike background images.
- *Sole content of a control*: name the control with `aria-label` (e.g.
  `<a class="icon-phone" aria-label="Call us">`) and hide the glyph.
- *Informative, no text nearby*: add a visually-hidden `.sr-only` text equivalent beside
  it. Prefer a real `<img>`/inline `<svg>` with a proper name for genuinely informative
  icons rather than a background image or font glyph.
