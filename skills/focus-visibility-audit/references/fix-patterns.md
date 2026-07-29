# Reference fix patterns — focus-visibility-audit

Cited by `SKILL.md` when a finding needs a **Fix pattern:** line. Copy the entries you cite
into the report so it stands alone.

**Focus indicator.** Never ship `outline: none` without a replacement focus style. A
`:focus-visible` box-shadow or outline with sufficient contrast against both light and
dark surrounding content satisfies this without also showing on mouse clicks if that's
the desired UX.

**Control removed from tab order.** If an element looks and behaves like a control,
remove the negative `tabindex` (or convert it to a native `<button>`/`<a>`) so keyboard
users can reach it. Reserve `tabindex="-1"` for elements you focus programmatically only.
