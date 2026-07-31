# Accessibility Audit — a Claude Code plugin

A suite of **browser-driven accessibility-audit skills** for [Claude Code](https://claude.com/claude-code). Every check runs against the **live page** through `playwright-cli` — inspecting the real DOM/CSSOM and accessibility tree — and never by reading or grepping source code. That means the skills work on any URL, with or without repo access, and test what the browser actually exposes rather than what the code intends.

The deliverable of every skill is a self-contained, **fix-ready Markdown report** written to a resolved output path.

## What's inside

The `accessibility-audit` skill is an **orchestrator**: it opens the page once, fingerprints which accessibility surfaces exist, then dispatches only the relevant category sub-skills as **parallel subagents** and merges their findings into one combined report.

| Skill | What it audits |
|-------|----------------|
| `accessibility-audit` | Router/orchestrator — fingerprints the page and dispatches the sub-skills below |
| `structure-audit` | Document `lang`, page title, single `h1`, duplicate ids, skip links, landmarks, heading hierarchy |
| `images-media-audit` | `alt` text, image-only links/buttons, video captions, unnamed icon SVGs, CSS/icon-font icons |
| `form-labels-audit` | Missing/visual-only labels, orphaned `<label for>`, placeholder-only labels, error wiring, `autocomplete` |
| `interactive-names-audit` | Accessible names on buttons/links, WCAG 2.5.3 Label in Name, fake-button anchors |
| `focus-visibility-audit` | Page-wide keyboard focus visibility and Tab reachability |
| `contrast-audit` | Text contrast (1.4.3), non-text/UI contrast (1.4.11), focus-indicator contrast (2.4.11) |
| `keyboard-dropdown-audit` | Deep, per-trigger keyboard operability of dropdowns/menus/listboxes (standalone; never auto-dispatched) |

`keyboard-dropdown-audit` is intentionally standalone — it runs a slow, stateful Tab/Enter/hover interaction state-machine per trigger. The router only *detects* custom dropdowns and recommends running it separately.

## Installation

Add the marketplace, then install the plugin:

```
/plugin marketplace add Yale-A11y/claude-skills
/plugin install accessibility-audit@yale-a11y
```

`Yale-A11y/claude-skills` is GitHub `owner/repo` shorthand. A local clone works as a source too:

```
/plugin marketplace add /path/to/claude-skills
```

The marketplace is named `yale-a11y` (`.claude-plugin/marketplace.json`) and publishes a single plugin, `accessibility-audit` (`.claude-plugin/plugin.json`) — hence the `accessibility-audit@yale-a11y` target. Claude Code auto-discovers every skill under `skills/`.

### Working on the plugin

To load a working copy without installing it:

```
claude --plugin-dir /path/to/claude-skills
```

Skill files are read when a session starts, so **restart Claude Code after editing a `SKILL.md`** — mid-session edits won't take effect in that session.

### Repo layout

```
.claude-plugin/
  marketplace.json          marketplace "yale-a11y" — publishes the plugin below
  plugin.json               plugin manifest
skills/
  structure-audit/          every skill follows this shape
    SKILL.md                checks, flagging rules, findings format
    scripts/                browser probes, run via `run-code --filename`
      page-checks.js
    references/             loaded on demand, not on every run
      fix-patterns.md       read only when a run has ≥1 finding
      standalone-report.md  read only when run directly, not router-dispatched
```

`SKILL.md` carries only what every run needs; `scripts/` and `references/` load when actually used, so a skill's context cost stays proportional to the work it does. Two skills deviate: the `accessibility-audit` router has no `references/` (it merges what its subagents return), and `keyboard-dropdown-audit` has no `standalone-report.md` because it only ever runs standalone — and no `scripts/` yet, since its probes are per-trigger parameterized and still inline pending extraction.

The `scripts/*.js` files are the single source of truth for the probes — **never inline a script body back into `SKILL.md`** (`keyboard-dropdown-audit` is the one outstanding exception, not a pattern to copy). A Step names the script, describes the shape it returns, and interprets the fields. See `CLAUDE.md` for the full conventions.

## Usage

```
/accessibility-audit https://example.com
/accessibility-audit localhost:3000 ./reports/a11y.md
/keyboard-dropdown-audit https://example.com
```

Each skill takes the target URL as its first argument and an optional output path as the second. Re-running the same path **overwrites** the report — intentional, for a fix-then-reaudit loop.

## Changelog

Release history is in [CHANGELOG.md](CHANGELOG.md). Skills are read at session start, so restart Claude Code after upgrading.

## Requirements

- Claude Code with the `playwright-cli` tool available.
- Network access to the target URL (the skills do a connectivity check before opening).

## License

MIT

