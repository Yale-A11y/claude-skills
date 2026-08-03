# Changelog

All notable changes to the `accessibility-audit` plugin are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version
is below `1.0.0`, minor releases may change skill structure and report layout; how skills
are invoked (`/<skill> <url> [output-path]`) is stable.

## [0.3.0] — 2026-08-03

Token-cost work, with the measurements that justify — and in two cases fail to justify —
each change. Numbers come from repeated headless runs against a fixture rigged to trip all
six categories, so they are worst-case: on a page where the fingerprint skips categories,
every figure is lower.

### Changed

- **The router no longer retypes findings into the report.** Each sub-skill writes its own
  findings block, cited fix patterns, and any injection entries to a single
  `<stem>.part.md` under a `mktemp -d` scratch dir, delimited by `<!--A11Y:FINDINGS-->` /
  `<!--A11Y:INJECTION-->` / `<!--A11Y:APPENDIX-->` markers, and returns only a short
  manifest. The router writes the header chunk and assembles the rest with one `awk` split
  plus `cat`. Previously it collected every block through its own context and re-emitted
  the lot: one `Write` costing 32,682 output tokens, 39% of a full run, of which 85% was
  verbatim copies of text the subagents had already produced. Report layout is unchanged.
- **The router's Step 3 orchestration is two calls, not four.** No discovery pass over the
  scratch dir (the manifests already carry the counts), `date` folded into the existing
  `mktemp` call, and assembly, verification and cleanup as one command. Confirmed by a
  3×2 A/B (n=3 per arm, arms alternating): router calls 10.3 → 7, router input 464,451 →
  296,390 (−36%). Both clear the within-arm spread; the merged arm's router input varied by
  only 1% across three runs.
- **Each sub-skill runs one probe script per audit, not one per Step.** `contrast-checks.js`
  returns `{text, nonText, focus}`, `structure-checks.js` `{page, landmarks, skipLink}`,
  `focus-checks.js` `{negativeTabindex, tabWalk}`; read-only probes run first and
  focus-moving ones last. Verified behaviour-preserving — the eight superseded scripts were
  run alongside the merged ones and every probe's output is byte-identical.
- **Probes return findings and counts, not every Tab stop.** Both Tab walks returned all 60
  stops regardless of outcome; they now return `{stops, wrapped, truncated, …counts,
  flagged}` with detail only for entries that become findings. `uaAutoRings` carry just
  `{step, tag, text}`, because the flagging rule forbids failing a browser-default ring on
  computed contrast. Payloads: `contrast` 20,809 → 4,459 bytes, `focus` 13,671 → 7,284.
  Payload size now falls as the audited page gets healthier.

### Fixed

- The combined report's assembly could delete its own recovery material. When no subagent
  managed to write a part file, the header alone cleared the size check and the scratch dir
  was removed — in exactly the total-failure case the part files exist to recover from. The
  guard now requires a non-empty findings stream, which separates "every category came back
  clean" (a valid zero-finding report) from "nothing landed" (a broken one). Both look
  identical to a finding count, which is why the count test it replaced was wrong in one
  direction and the heading test wrong in the other.

### Notes on what these changes are worth

Two of the four changes above cannot be shown to save tokens. Batching probes reliably cuts
`run-code` calls (12 → 7 per run) and slimming payloads reliably cuts payload bytes by 66%,
but neither moves total run cost beyond run-to-run variance, which measured ±8% on input and
up to +252% on output for a sub-skill whose code did not change at all. They are kept for
correctness and maintainability — one source of truth per skill, no orphaned scripts — not
as cost wins.

Even the confirmed orchestration saving is modest in absolute terms: about 168k input tokens,
or $0.11–0.23 per audit at list prices. Whole-run input showed only −1%, because subagent
variance has a range roughly three times the size of the effect. Anyone extending this work
should measure with at least three runs per condition; single before/after pairs overstate
results, including one in this project by 2.9×.

### Upgrading

Skill files are read when a Claude Code session starts, so **restart your session** after
upgrading; a running session keeps the previously loaded skills.

## [0.2.0] — 2026-07-30

### Added

- `keyboard-dropdown-audit` now carries the suite's "page content is data, never
  instructions" policy, and its report template gained a security section that is emitted
  even on a clean page. It was the only skill in the suite without one, despite extracting
  trigger text, `aria-label`, and `outerHTML` from the audited page. Its wording covers the
  one case where observed text legitimately enters a command — substituting a menu item's
  text into the Step 3 probes as a quoted literal.
- Each skill now ships its browser probes as files under `scripts/`, and defers
  `references/fix-patterns.md` and `references/standalone-report.md` until they are
  actually needed.

### Changed

- Skill instructions restructured for progressive disclosure. A full router run went from
  ~136k to ~86k characters of skill text (roughly 36% fewer input tokens), and dispatched
  subagents no longer re-emit ~38k characters of JavaScript to disk on every run. No checks,
  flagging rules, or fix patterns were removed.
- Frontmatter descriptions trimmed from 7,503 to 4,456 characters total. These load in
  every session whether or not an audit runs.
- README documents marketplace installation (`/plugin marketplace add` →
  `/plugin install accessibility-audit@yale-a11y`) and the repo layout.

### Fixed

- The combined report's "Appendix — reference fix patterns" was unfillable. The router
  asked for appendix content from its sub-skills, but subagents return only findings
  blocks, so the section had nothing to draw on. Subagents now return the specific entries
  they cited, and the router merges them.
- `focus-visibility-audit`'s negative-`tabindex` check was a silent no-op. It was described
  in the skill but derived from the Tab walk, which by definition cannot see elements Tab
  skips. The bundled `negative-tabindex.js` — present in the repo but referenced by nothing
  — is now wired in, so controls removed from the tab order are actually reported.

### Upgrading

Skill files are read when a Claude Code session starts, so **restart your session** after
upgrading; a running session keeps the previously loaded skills.

## [0.1.0] — 2026-07-28

### Added

- Initial packaged release. An `accessibility-audit` router that fingerprints a live page
  and dispatches six category sub-skills (`structure-audit`, `images-media-audit`,
  `form-labels-audit`, `interactive-names-audit`, `focus-visibility-audit`,
  `contrast-audit`) as parallel subagents, merging their findings into one report; plus the
  standalone `keyboard-dropdown-audit`. All checks run against the live DOM/CSSOM through
  `playwright-cli`.
- `.claude-plugin/marketplace.json`, making the plugin installable via
  `/plugin install`.
