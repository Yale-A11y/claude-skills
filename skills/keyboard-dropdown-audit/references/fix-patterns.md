# Reference fix patterns — keyboard-dropdown-audit

Cited by `SKILL.md` when a finding needs a **Fix pattern:** line. Copy the entries you cite
into the report so it stands alone.

{Copy these six patterns in verbatim, so the report is self-contained even if the
reader never sees this skill file:}

**A — Hover-only trigger → add real keyboard path.** Keep hover as a progressive
enhancement, but add a click handler that toggles open state, and a keydown handler on
the trigger for Enter/Space/ArrowDown to open (`preventDefault()` on the ones handled).

**B — WAI-ARIA listbox for a `role="listbox"`/`role="option"` menu.** Roving highlight
via `aria-activedescendant` + state (not real focus per item): on open, focus moves
into the list container (`tabindex="-1"` + `.focus()`); Arrow Up/Down/Home/End move the
highlighted id; Enter/Space commits the highlighted option, closes, and refocuses the
trigger; Escape closes and refocuses the trigger without committing.
  - **Gotcha:** if the popover's mount depends on a second piece of state computed
    after open (e.g. a portal that waits for a measured position before rendering), an
    effect keyed only on the "open" flag can fire before the list actually mounts and
    never re-fire once it does — the focus call silently no-ops. Focus it from the
    list's mount/ref-attach callback instead, which fires exactly when the node mounts.

**C — CSS-hover-only submenus.** Pair the hover-reveal rule with a `:focus-within`
equivalent (or drive visibility from click/Enter-toggled state instead of hover).
Never gate visibility for content that must stay tabbable behind `visibility:hidden`/
`display:none` — those remove descendants from the tab order even while a hover rule
would otherwise reveal them.

**D — Hidden-but-mounted overlays that must not be focusable** (toasts, closed panels
kept in the DOM for an exit animation). Use the `inert` attribute instead of manually
pairing `aria-hidden` with hope — `inert` atomically removes the whole subtree from
both the accessibility tree and the tab order, so a button inside an `aria-hidden`-but-
not-`inert` panel can't trap keyboard focus.

**E — Nested/duplicate interactive elements** (a decorative inner `a`/`button` sitting
inside an already-labeled, already-interactive outer trigger — e.g. an icon-only anchor
duplicating a labeled parent `button`). If the inner element serves no independent
purpose, remove its `tabindex`/`href`/click-handling entirely and let the outer control
own activation. If it must remain focusable for some unrelated reason, give it
`aria-hidden="true"` **and** `tabindex="-1"` together — never leave a focusable element
nested inside another focusable element with its own separate (and usually unlabeled)
stop in the tab order.

**F — Unlabeled icon-only controls** (a link/button whose only content is an
`aria-hidden` icon glyph, so its computed accessible name is empty). Add `aria-label`
directly to the interactive element itself — the icon can and should stay
`aria-hidden="true"`, but the name has to live on the element a screen reader will
actually stop on, not on content that's been explicitly hidden from it.
