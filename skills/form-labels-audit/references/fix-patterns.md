# Reference fix patterns — form-labels-audit

Cited by `SKILL.md` when a finding needs a **Fix pattern:** line. Copy the entries you cite
into the report so it stands alone.

**Form label association.** Use `<label for="id">` or wrap the control in a `<label>`. If
a visible label isn't in the design, use `aria-label` — never rely on `placeholder` as
the only name, since it vanishes on input and isn't a reliable accessible-name source
across screen readers.

**Visual-only or orphaned label.** The label text already exists in the design — the bug
is purely the missing/broken association, so don't write new copy. If the "label" is a
`<span>`/`<div>`/table cell next to the field with no relationship: convert it to a real
`<label for="id">` (give the control an `id` if needed) or move the text inside a
wrapping `<label>`. If a `<label>` exists but its `for` points at a non-existent id (typo
or stale after a rename): fix the `for` value to the control's actual `id` — don't add a
second label. Re-verify by checking the control's computed accessible name equals the
visible text, not just that a `for`/`id` pair exists syntactically.

**Missing visible label (accessible name exists, nothing shows on screen).** If relying
on `aria-label` alone: add real visible text and switch to `<label for="id">` (or wrap
the control), reserving `aria-label` for cases where a visible label is deliberately not
in the design (icon-only search/filter fields) — and pair it with a persistent visual
affordance (icon, static prefix), since a `placeholder` alone disappears on input. If a
real `<label>` exists but is visually hidden via an `sr-only` class: keep it for screen
readers, but confirm a sighted user still has *some* persistent visual cue — if not, make
the label visible or add one. Don't delete the hidden label to "fix" this. If a visible
text run already sits next to the field but the accessible name comes from a separate
parallel `aria-label`: replace the `aria-label` with `aria-labelledby` pointing at that
existing visible element's `id` — one source of truth for both audiences.

**Error text association.** Wire visible error/help text to its field via
`aria-describedby` pointing at the message element's `id`, and set `aria-invalid="true"`
on the field while the error is present, so screen reader users hear the error, not just
sighted users.

**Autocomplete / input purpose (WCAG 1.3.5).** For any field that collects the user's own
data, add an `autocomplete` attribute whose value is a valid HTML autofill token matching
the field's purpose — e.g. `given-name`, `family-name`, `name`, `email`, `tel`,
`street-address`, `address-level2` (city), `address-level1` (state/region),
`postal-code`, `country-name`, `organization`, `bday`, `current-password`/`new-password`.
Compose with a `section-*` and/or `shipping`/`billing` prefix when disambiguating repeated
groups (e.g. `autocomplete="shipping postal-code"`). Fix a misspelled/invented value
(`"e-mail"`, `"fname"`, `"phonenumber"`) to the real token — the attribute being present
isn't enough, it must be a recognized token. Reserve `autocomplete="off"` for fields where
autofill is genuinely undesirable (one-time codes, security answers); it does not satisfy
1.3.5. This is independent of labeling — a correctly-labeled field can still need this.
