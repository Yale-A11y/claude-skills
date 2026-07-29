# Reference fix patterns — contrast-audit

Cited by `SKILL.md` when a finding needs a **Fix pattern:** line. Copy the entries you cite
into the report so it stands alone.

**A — Text contrast (1.4.3).** Darken text or lighten background until the ratio clears
4.5:1 (normal text) or 3:1 (large/bold text ≥24px or ≥18.66px+bold). Check both the
default and any hover/disabled/placeholder states — these frequently regress contrast
even when the base state passes. For text over a background image or gradient, add a
scrim/overlay or a text shadow sufficient to guarantee the ratio across the whole area the
text can sit on.

**B — Non-text / UI-component contrast (1.4.11).** Give every active control a boundary
that clears 3:1 against the surface it sits on — either a border color at ≥3:1 or a fill
that differs from the surrounding background by ≥3:1. Don't rely on a 1px hairline in a
near-background tint. The same 3:1 rule covers graphics that convey information (icons,
chart series, status indicators, required-field markers) and the meaningful states of a
control (checked/selected/error) when those states are shown by color/shape alone.

**C — Focus-indicator contrast (2.4.11 / 1.4.11).** The focus ring must contrast ≥3:1
against the colors adjacent to it — both the page/surface behind the control and, ideally,
the control's own fill. A thin light-blue outline can pass on a white page yet vanish on a
dark button; either pick a ring color that clears 3:1 on both sides, add a second
contrasting layer (e.g. a dark outline plus a light halo, via double `box-shadow`), or
thicken the indicator. Pair this with `focus-visibility-audit`, which confirms an
indicator is present in the first place.
