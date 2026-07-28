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

Load the plugin locally from a clone of this repo:

```
claude --plugin-dir /path/to/claude-skills
```

The plugin manifest lives at `.claude-plugin/plugin.json`; Claude Code auto-discovers every skill under `skills/`.

> To make this installable via `/plugin install`, add a `.claude-plugin/marketplace.json` entry pointing at this repo. It isn't included yet.

## Usage

```
/accessibility-audit https://example.com
/accessibility-audit localhost:3000 ./reports/a11y.md
/keyboard-dropdown-audit https://example.com
```

Each skill takes the target URL as its first argument and an optional output path as the second. Re-running the same path **overwrites** the report — intentional, for a fix-then-reaudit loop.

## Requirements

- Claude Code with the `playwright-cli` tool available.
- Network access to the target URL (the skills do a connectivity check before opening).

## License

MIT
