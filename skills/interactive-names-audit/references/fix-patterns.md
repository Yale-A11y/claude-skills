# Reference fix patterns — interactive-names-audit

Cited by `SKILL.md` when a finding needs a **Fix pattern:** line. Copy the entries you cite
into the report so it stands alone.

**Missing accessible name (button/link/control).** Add visible text where possible;
otherwise `aria-label` describing the action ("Close dialog", not "Icon button"). Never
rely on `title` alone — it's not reliably exposed by screen readers and isn't visible on
touch devices.

**Unlabeled icon-only control.** Add `aria-label` directly to the interactive element
itself — the icon can and should stay `aria-hidden="true"`, but the name has to live on
the element a screen reader will actually stop on, not on content hidden from it.

**Label in Name (visible text not in accessible name).** When a control shows visible
text, its accessible name must contain that exact text — ideally at the start (WCAG
2.5.3). Don't let an `aria-label` *replace* the visible label with a paraphrase (visible
"CC" + `aria-label="Toggle closed captions"` breaks a voice user saying "click CC"). Fix
by either (a) dropping the `aria-label` and letting the visible text be the name, or (b)
starting the `aria-label` with the visible text and appending context ("CC — toggle closed
captions"), or (c) pointing `aria-labelledby` at the element that holds the visible text.
Re-verify that the computed accessible name begins with the visible label string.

**Fake-button anchor.** If it performs an in-page action rather than navigating, use a
real `<button>` (or `role="button"` with keyboard handling) instead of `<a href="#">` —
this restores expected keyboard/right-click behavior and stops screen readers announcing
a link that goes nowhere.
