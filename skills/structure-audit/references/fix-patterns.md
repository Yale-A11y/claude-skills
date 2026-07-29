# Reference fix patterns — structure-audit

Cited by `SKILL.md` when a finding needs a **Fix pattern:** line. Copy the entries you cite
into the report so it stands alone.

**Heading hierarchy.** Headings step down one level at a time (`h1`→`h2`→`h3`),
reflecting document structure, not visual size — use CSS for size, heading level for
structure.

**Landmark regions.** Wrap primary content in a single `<main>`; use `<nav>`,
`<header>`, `<footer>` for their semantic roles rather than generic `<div>`s, so screen
reader users can jump between regions instead of tabbing through everything linearly.

**Skip link.** First focusable element on the page, visually hidden until focused,
`href="#main-content"` pointing at an element with a matching `id` (and `tabindex="-1"`
on that target if it isn't natively focusable) so activating the link actually moves
focus, not just scroll position.

**Document lang / title.** Set `<html lang="...">` to the page's primary language and a
unique, descriptive `<title>` per page so assistive tech announces the right pronunciation
and users can tell tabs/windows apart.

**Duplicate ids.** Every `id` must be unique on the page — rename collisions so
`for`/`aria-labelledby`/`aria-describedby` relationships resolve unambiguously.
