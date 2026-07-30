# Changelog

All notable changes to the `accessibility-audit` plugin are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version
is below `1.0.0`, minor releases may change skill structure and report layout; how skills
are invoked (`/<skill> <url> [output-path]`) is stable.

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
