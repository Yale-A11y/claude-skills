---
name: keyboard-dropdown-audit
description: Audits dropdowns, menus, listboxes, popovers, and submenus for keyboard-only operability — entirely through the live browser via playwright-cli, never by reading or grepping source code. Writes a self-contained, fix-ready Markdown report. Takes the target URL as its argument (e.g. "/keyboard-dropdown-audit https://example.com" or "/keyboard-dropdown-audit localhost:3000"), with an optional second argument for the report's output path. Use whenever asked to check/verify/audit keyboard accessibility, or as a mandatory follow-up to any automated accessibility scan (axe-core, Lighthouse, etc.) — those scanners test static ARIA semantics, not interaction, and will report zero violations on menus that are completely unusable without a mouse. Works even without repo access. Triggers on "keyboard accessibility", "dropdown a11y", "menu keyboard", "check dropdowns", "/keyboard-dropdown-audit".
argument-hint: "[url] [output-path]"
arguments: [url, output]
---

# Keyboard Dropdown/Menu Accessibility Audit

**This is a black-box, browser-only audit.** Do not open, read, or grep the project's
source files at any point — every finding must come from observing the live page
through `playwright-cli`. This makes the audit trustworthy (it tests what a real
keyboard user experiences, not what the code implies) and makes the skill usable on
any site, including ones you don't have source access to.

## Input — target URL

The target URL is the `url` argument: `$url`.

- If `$url` is empty (invoked as bare `/keyboard-dropdown-audit` with no argument),
  first check whether the current conversation already named a specific dev server or
  URL — if so, use that. Otherwise **ask the user** for the URL before doing anything
  else. Don't guess a default (e.g. don't assume `localhost:3000`) — a wrong guess
  wastes a full audit cycle on the wrong page.
- If `$url` looks like a bare host with no scheme (`localhost:3000`,
  `192.168.1.5:8080`), prepend `http://`.
- If more text follows the URL (e.g. `/keyboard-dropdown-audit localhost:3000 focus
  only on the export modal`), that scoping instruction is still available in full via
  `$ARGUMENTS` — `$url` only captures the first whitespace-delimited token.

Before opening it, do a plain connectivity check (e.g. `curl -s -o /dev/null -w
'%{http_code}' $url`) so a dead URL fails fast with a clear message instead of
Playwright timing out deep into Step 1.

## Input — output path

The report's output path is the `output` argument: `$output`.

- If `$output` is empty, default to `./keyboard-dropdown-audit.md` in the current
  working directory.
- If `$output` is a directory (trailing `/`, or an existing directory), write
  `keyboard-dropdown-audit.md` inside it.
- Re-running the skill against the same output path **overwrites** it — that's
  intentional, so a fix-then-reaudit loop always reflects the current state. If the
  user wants history preserved, they'll pass a distinct path per run (or copy/rename
  the file themselves before the next run); don't auto-timestamp the default.

## Why this exists

Automated accessibility scanners (axe-core, Lighthouse, WAVE) check static DOM/ARIA
properties — roles, names, contrast, labels. They cannot tell whether a menu actually
*opens* when a keyboard user presses Enter, or whether Tab can reach its options. A
custom dropdown that only opens on hover can pass an axe scan with zero violations
while being 100% unusable without a mouse.

**The single biggest trap when verifying this yourself:** Playwright's `.click()` moves
the mouse over the element before clicking, which fires `mouseenter`/`mouseover` first.
If a menu opens on hover, a scripted `.click()` will make it *look* keyboard-operable
when it isn't. Never validate keyboard support with `.click()` — use `Tab` to move
focus and `Enter`/`Space` to activate, then check the DOM directly.

## Step 1 — Discover every dropdown/menu candidate live

Open the resolved target URL with `playwright-cli open $url`, then build an inventory
two ways:

**A. Full keyboard Tab-order walk.** Starting from the top of the page, press `Tab`
repeatedly and record what's focused at each stop. This surfaces every trigger,
including ones with no ARIA markup at all:

```bash
playwright-cli --raw run-code --filename=tab-walk.js
```
```js
// tab-walk.js — generic, works on any page
async page => {
  const results = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return {
        tag: el.tagName,
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        ariaHaspopup: el.getAttribute('aria-haspopup'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        text: (el.textContent || '').trim().slice(0, 40),
      };
    });
    results.push({ step: i, ...(info ?? { focus: 'BODY_OR_WRAPPED' }) });
  }
  return JSON.stringify(results, null, 1);
}
```

Flag any stop where `ariaHaspopup`/`ariaExpanded` is present, or where the label/icon
implies a menu (chevron, ellipsis, "Settings", "More", "File", etc.) even without ARIA.

This walk stops after 80 Tab presses. If the last stops were still landing on real
controls (the page has more focusable stops than that), the inventory is incomplete —
note it in the report and re-run from a deeper starting point so later triggers aren't
silently missed.

Icon-only triggers (no visible text, just an `aria-label`) need probe scripts that
match on `getAttribute('aria-label')` instead of `textContent` — a probe written to
match by trimmed text will silently fail to find them and report a false "not found."

**B. Reveal probe on every flagged trigger.** For each candidate found in the walk,
diff the DOM before/after two different activations — this is what actually catches a
hover-only trigger, because pressing `Enter` and hovering will disagree:

```bash
playwright-cli --raw run-code --filename=reveal-probe.js
```
```js
// reveal-probe.js — pass the trigger's ref/selector by editing TARGET below
async page => {
  // Broad fingerprint: count ALL visible interactive elements, not just ARIA-roled
  // ones. Many real-world menus reveal plain <button>s with no role="menu"/"option"
  // at all — an ARIA-only selector here (e.g. just `[role=option],[role=menu]`) will
  // silently miss them and produce a false "OK" on a completely hover-only menu.
  const fingerprint = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a[href], input, [role]'))
      .filter(el => el.offsetParent !== null || el.getClientRects().length > 0)
      .length
  );
  const before = await fingerprint();

  await page.keyboard.press('Tab'); // assumes trigger already focused by caller
  await page.keyboard.press('Enter');
  const afterEnter = await fingerprint();
  await page.keyboard.press('Escape');

  const trigger = page.locator(':focus');
  await trigger.hover();
  const afterHover = await fingerprint();

  return JSON.stringify({ before, afterEnter, afterHover });
}
```

If `afterHover > before` but `afterEnter === before`, the trigger is **hover-only —
CRITICAL**, regardless of what ARIA attributes are present. Do this for every flagged
trigger; don't stop at the first few — sweep the whole page, including toolbars, kebab
menus, and settings panels. Each is an independently-failing instance.

**Always re-run the probe from a clean `page.reload()` before each new trigger.**
Chaining probes back-to-back without reloading lets leftover open-menu state from the
previous trigger contaminate the next `before` count — worse, two unrelated menus
closing and opening at the same time can net to the same total and silently cancel out
in the diff, producing a false "no change" reading.

**C. Non-interactive and unlabeled focus-stop sweep.** Run this in *two* passes — each
catches a different class of bug, and neither pass substitutes for the other:

*Pass 1 — closed page, full Tab walk.* Reuse the walk from 1A, but classify every stop
against a native-interactive allowlist instead of just eyeballing it:

```js
// focus-audit.js — flags stops that aren't natively interactive and lack an interactive role
async page => {
  const INTERACTIVE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);
  const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'checkbox', 'radio', 'combobox', 'listbox', 'option',
    'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch', 'slider',
    'spinbutton', 'textbox', 'searchbox', 'columnheader', 'treeitem'
  ]);
  const results = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return {
        tag: el.tagName, role: el.getAttribute('role'), tabindex: el.getAttribute('tabindex'),
        ariaLabel: el.getAttribute('aria-label'), ariaHidden: el.getAttribute('aria-hidden'),
        text: (el.textContent || '').trim().slice(0, 40),
        outlineStyle: getComputedStyle(el).outlineStyle,
      };
    });
    if (!info) { results.push({ step: i, focus: 'BODY_OR_WRAPPED' }); continue; }
    const isNativelyInteractive = INTERACTIVE_TAGS.has(info.tag);
    const hasInteractiveRole = info.role && INTERACTIVE_ROLES.has(info.role);
    const flagged = !isNativelyInteractive && !hasInteractiveRole;
    const emptyName = isNativelyInteractive && !info.text && !info.ariaLabel;
    const ariaHiddenButFocusable = info.ariaHidden === 'true' && info.tabindex !== '-1';
    results.push({ step: i, ...info, flagged, emptyName, ariaHiddenButFocusable });
  }
  return JSON.stringify(results.filter(r => r.flagged || r.emptyName || r.ariaHiddenButFocusable || r.focus), null, 1);
}
```

This catches stray `tabindex="0"` on plain `div`/`span`/`th` elements sitting in the
normal page flow (sortable table headers hand-wiring `onclick` instead of using a real
`button`, decorative spacer spans, etc.) — bugs that exist whether or not any menu is
ever opened.

*Pass 2 — inside each open menu/panel.* This is the pass most audits skip, and it's
where the interesting bugs live: **elements that only enter the tab order once a
widget is expanded** don't show up in Pass 1 at all. For every trigger you already
opened in Step 1B/1C, keep tabbing a few more times *past* the item you expected to
find, and inspect each stop the same way:

```js
// inside-menu-walk.js — walk N tab stops after opening a trigger, flag each one
async page => {
  const describe = () => page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el.tagName, role: el.getAttribute('role'), href: el.getAttribute('href'),
      tabindex: el.getAttribute('tabindex'), ariaLabel: el.getAttribute('aria-label'),
      text: (el.textContent || '').trim().slice(0, 40),
    };
  });

  await page.keyboard.press('Enter'); // open the trigger (already Tab-focused by caller)
  await page.waitForTimeout(300);

  const stops = [];
  const STEPS_AFTER_OPEN = 6; // enough to see the cycle repeat, not just the first item
  for (let i = 0; i < STEPS_AFTER_OPEN; i++) {
    stops.push({ step: i, ...(await describe()) });
    await page.keyboard.press('Tab');
  }
  return JSON.stringify(stops, null, 1);
  // Look for a stop repeating what step 0 showed — that confirms you've walked the
  // full cycle. Any stop in between with empty text + no aria-label, or with
  // aria-hidden="true" alongside a non-negative tabindex, is a finding.
}
```

Two concrete anti-patterns to check for at every stop found this way:
- **A natively-interactive element (`A`/`BUTTON`) with empty `textContent` and no
  `aria-label`** — announced to a screen reader as just "link"/"button" with nothing
  else, even though it's a real, reachable control. This is extremely common on
  icon-only close ("X") buttons and on decorative inner anchors that duplicate an
  already-labeled outer trigger (nested interactive elements) — if you find one
  unlabeled stop, re-run this same pass on every sibling trigger of the same
  component type (every item in an icon toolbar, every row's kebab menu, etc.); these
  bugs are usually shared markup and present identically everywhere that markup is
  reused, not a one-off.
- **`aria-hidden="true"` combined with `tabindex="0"` (or any non-negative tabindex)
  on the same element** — a direct conflict: `aria-hidden` removes the element from
  the accessibility tree (screen readers never reach it) while a non-negative
  `tabindex` keeps it in the native tab order, so a keyboard user can Tab onto a
  stop that will never be announced. This shows up most often on manually-built
  focus-trap sentinel pairs (elements literally named things like
  `focus-trap-top`/`focus-trap-bottom` in their `class`) that are left permanently
  tabbable instead of only while their popover is open.

*Custom-control activation parity.* For any non-natively-interactive element you find
wired up as a control (a `div`/`th` with `tabindex` + a click handler standing in for
a button — sortable column headers are the classic case), test **both** `Enter` and
`Space`, not just one:

```bash
playwright-cli press Enter   # note whether the action fires
# reload, re-tab to the same element fresh
playwright-cli press Space   # note whether the action fires — many custom controls wire only Enter
playwright-cli --raw eval "getComputedStyle(document.activeElement).outlineStyle"   # "none" = no visible focus indicator at all
```

A custom control that responds to `Enter` but silently swallows `Space` violates the
standard button-activation convention (both keys should work) — flag it even though
it's technically operable, and separately flag `outlineStyle: "none"` (or any focus
style indistinguishable from unfocused) as its own finding, since a sighted keyboard
user gets no confirmation they've tabbed onto the control at all.

## Step 2 — Classify each one from observed behavior only

Answer these from what you just watched happen in the browser — never from inferred
intent:

1. **Did `Enter`/`Space` on the trigger reveal the menu**, or did only `hover` do it
   (per the probe above)? Hover-only → **CRITICAL, unreachable**.
2. **Once open, does `Tab` actually land on each visible option** (check
   `document.activeElement` matches an option's text/role each time), or does `Tab`
   skip past them to the next page control? Skipped → **BROKEN** — the items aren't
   really focusable regardless of what markup produced them.
3. **For nested flyouts:** does hovering a submenu trigger reveal content that
   `Enter`/`ArrowRight`/`Tab` does not? Same hover-only signature as #1, one level
   deeper → **BROKEN**.
4. **Does `Escape` close the menu, and does focus land back on the trigger** (not
   `<body>`, not a now-vanished option)? Check both `document.querySelector('[role=
   listbox],[role=menu]')` is gone/hidden AND `document.activeElement` after Escape.
   Either missing → **PARTIAL**.
5. **For multi-option menus:** does `ArrowDown`/`ArrowUp` move
   `aria-activedescendant`, or move which element has `:focus`? If neither changes
   after repeated arrow presses → no roving navigation; combined with #2 this is
   **BROKEN**, otherwise note it as a **PARTIAL** gap.
6. **Did the Step 1C sweep flag anything** — a non-natively-interactive stop, an
   unlabeled interactive element, an `aria-hidden`+focusable conflict, or a custom
   control where `Space` doesn't match `Enter` or there's no visible focus outline?
   These don't describe a single trigger's open/close behavior the way #1–5 do, so
   they're reported separately (see the Addendum in Step 5) rather than forced into
   the per-trigger Critical/Broken/Partial/OK table — but default their severity to
   **PARTIAL** (the surrounding menu is still usable some other way — Escape still
   closes it, the real menu item is still reachable) and only escalate to **BROKEN**
   if the stray/unlabeled stop actually traps focus or sits on the *only* path to an
   action with no working alternative.

## Step 3 — Run the full interaction sequence per candidate

Use `press`, never `click`, for every step that's supposed to prove keyboard support.

```bash
# 1. Reach the trigger via Tab only — never click/hover it into position.
playwright-cli press Tab            # repeat until the right element is focused
playwright-cli --raw eval "document.activeElement?.textContent?.trim()"

# 2. Activate with Enter, then Space if Enter is a no-op.
playwright-cli press Enter
playwright-cli --raw eval "JSON.stringify(Array.from(document.querySelectorAll('button,li,[role=option]')).some(el => el.textContent.includes('EXPECTED_ITEM_TEXT')))"
# false here on a menu that "works" via .click() = CRITICAL finding.

# 3. Check where focus landed once open.
playwright-cli --raw eval "JSON.stringify({tag: document.activeElement?.tagName, role: document.activeElement?.getAttribute('role')})"
# If focus is still on the trigger and Tab (below) can't reach an option, arrow keys
# and Tab will never reach the items.

# 4. Exercise navigation.
playwright-cli press ArrowDown
playwright-cli --raw eval "document.activeElement?.getAttribute('aria-activedescendant') ?? document.activeElement?.textContent"
playwright-cli press Tab
playwright-cli --raw eval "document.activeElement?.getAttribute('role')"   # should be 'option'/'menuitem', not the next page control

# 5. Commit and confirm focus return.
playwright-cli press Enter
playwright-cli --raw eval "document.activeElement?.textContent?.trim()"   # should be the trigger, not <body>

# 6. Reopen, then confirm Escape closes AND returns focus.
playwright-cli press Escape
playwright-cli --raw eval "JSON.stringify({stillOpen: !!document.querySelector('[role=listbox],[role=menu]')?.offsetParent, focused: document.activeElement?.textContent?.trim()})"
```

For portal-rendered/nested menus, also Tab past the last item and confirm focus lands
somewhere sane (either the next page control, if that's intended, or it's trapped
inside the menu until Escape — not silently dumped behind an invisible overlay).

If the app has a companion automated scan (axe-core etc.), you may re-run it after
fixes land, but **never treat a clean automated scan as evidence of keyboard
operability** — it only confirms the static ARIA semantics weren't regressed. The live
probes above are the actual test, and they're the only thing this skill relies on.

## Step 4 — Classify, ranked by severity

- **Critical** — menu never opens via keyboard at all (hover-only trigger).
- **Broken** — menu opens, but options/submenu are unreachable (Tab skips them, no
  arrow-key roving, hover-only nested flyout).
- **Partial** — fully operable via keyboard, but missing Escape-to-close and/or
  focus-return-to-trigger.
- **OK** — Tab reaches every option, activation works, Escape and focus-return both
  confirmed live.

Since source isn't read, identify each finding by what's on screen, not a file
location: the trigger's accessible name/visible label, its position ("second item in
the top toolbar", "kebab menu on each list row"), and — if you want something durable
enough to hand to whoever fixes it — run `playwright-cli generate-locator <ref>` on the
trigger to get a stable Playwright locator string. Capture the exact repro sequence
(which keys, in order, and the raw before/after numbers from the probes) for each
finding — this is what goes into the report in Step 5, so it can be re-verified without
re-discovering it.

## Step 5 — Write the report to the resolved output path

Write the findings to `$output` (resolved above) using the exact template below. This
report is the hand-off artifact — assume whoever reads it next (human or AI) has **not**
seen this conversation and has **not** read the skill: it must stand alone. Don't just
paste a summary into chat and skip the file — the file is the deliverable; a short
chat summary plus a pointer to the file is enough for the conversation itself.

Keep the summary table and checklist scannable for a human skimming on a phone; keep
each finding's repro block copy-pasteable so an AI agent can re-run the exact probe
without re-deriving it. Use GitHub-flavored task list syntax (`- [ ]`) for the
checklist — both humans and coding agents recognize and can toggle it.

```markdown
# Keyboard Dropdown/Menu Audit — {url}

**Generated:** {date, e.g. via `date` shell command} · **Method:** live browser only
(playwright-cli Tab/Enter/hover probes — no source code was read to produce this report)

## Summary

| Severity | Count |
|---|---|
| 🔴 Critical | {n} |
| 🟠 Broken | {n} |
| 🟡 Partial | {n} {if any come from the Step 1C sweep rather than a trigger's open/close behavior, note it inline: "{n} (non-interactive/unlabeled elements receiving focus — see addendum)"} |
| ✅ OK | {n} |

## Fix checklist

- [ ] 🔴 [{Trigger name}](#{anchor}) — {one-line symptom}
- [ ] 🟠 [{Trigger name}](#{anchor}) — {one-line symptom}
- [ ] 🟡 [{Trigger name}](#{anchor}) — {one-line symptom}
- [ ] 🟡 [{Non-interactive/unlabeled finding name}](#{anchor}) — {one-line symptom, e.g. "silent extra Tab stop inside the open menu"}
- [x] ✅ [{Trigger name}](#{anchor}) — verified working, no action needed

## Findings

### {Trigger name}

**Severity:** {🔴 Critical / 🟠 Broken / 🟡 Partial / ✅ OK} — {one-line reason}
**Locator:** `{playwright locator string, from generate-locator or a getByRole/getByLabel guess}`
**Position:** {where a human would find it on screen}

**Observed** (interactive-element count fingerprint, playwright-cli):

| Step | Count | Note |
|---|---|---|
| Baseline | {n} | |
| After `Enter` | {n} | {opened / no change} |
| After `hover` | {n} | {opened / no change} |
| After `Escape` | {n} | {closed, back to baseline / stayed open} |

**Repro** (exact commands, re-runnable as-is):
1. `playwright-cli press Tab` — repeat until `{trigger name}` is focused
2. `playwright-cli press Enter`
3. `playwright-cli --raw eval "document.activeElement?.textContent?.trim()"` — {expected result}
4. {continue with whichever of Escape/ArrowDown/hover steps produced this finding}

**Fix pattern:** {A / B / C / D — see Appendix} — {one sentence of what specifically to change for this trigger}

**Re-verify after fixing:** repeat the repro above; {state the specific pass condition, e.g. "`Enter` should raise the count the same way `hover` currently does"}.

---

{repeat the Findings block above for every trigger, most severe first; omit the
Observed/Repro table rows that don't apply to a given severity (e.g. an OK finding
still gets a compact Observed block showing all steps passed, no separate fix pattern)}

## Addendum — non-interactive elements receiving focus

{Only include this section if the Step 1C sweep surfaced anything — omit it entirely
otherwise, don't leave an empty section. One short paragraph explaining the sweep
method (closed-page walk + inside-open-widget walk, as in Step 1C), then one finding
block per issue using the same Severity/Locator/Position/Observed/Repro/Fix-pattern/
Re-verify shape as the main findings above. If the same defect repeats across multiple
sibling triggers (e.g. the same unlabeled inner link on every icon in a toolbar),
name all confirmed instances in one finding rather than duplicating the block —
state clearly which siblings were actually tested vs. presumed-affected-but-untested.}

### {Finding name, e.g. "Redundant unlabeled inner link inside every X menu"}

**Severity:** {🟡 Partial / 🟠 Broken — per the Step 2 item 6 default} — {one-line reason}
**Locator:** {no accessible name is common here — say so explicitly, then give a DOM-only identification: tag, distinguishing class/id/attribute}
**Position:** {where a human would find it, and under what condition — e.g. "only appears in the tab order once the X panel is open"}

**Observed:** {the specific conflict or absence — e.g. an `outerHTML` dump showing `aria-hidden="true"` alongside `tabindex="0"`, or empty `textContent`/`aria-label` on a real `A`/`BUTTON`}

**Repro** (exact commands, re-runnable as-is):
1. {steps to reach the same stop, including how many `Tab` presses and in what state (closed page vs. inside an opened widget)}
2. `playwright-cli --raw eval "document.activeElement.outerHTML"` — {expected vs actual}

**Fix pattern:** {E / F — see Appendix} — {one sentence of what to change}

**Re-verify after fixing:** {the specific pass condition}

---

## Appendix — reference fix patterns

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
```

After writing the file, tell the user in chat: the output path, the summary counts, and
the single most severe finding — not the full findings list again. The file is where
the detail lives.
