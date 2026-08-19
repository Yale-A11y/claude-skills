// structure-checks.js — all page-structure probes in ONE playwright-cli round-trip:
//   page      → lang, title, h1 count, duplicate ids, skip-link presence
//   landmarks → landmark region counts, heading list, heading-level skips
//   skipLink  → whether activating the skip link actually moves focus
//
// Batched deliberately: each separate `run-code` invocation costs a full model round-trip,
// which re-sends the whole subagent context. (Separate `page.evaluate` calls inside this
// script are only CDP round-trips and are free by comparison — the batching rule is about
// `run-code` invocations, not these.) The read-only probe runs first; skip-link detection
// and verification run after, because they tag nodes with data-a11y-skip attributes and
// move focus.

//
// NOTE: this file is evaluated as a SINGLE EXPRESSION — the arrow function below is the
// whole module. Declaring anything at top level (`const x = …` before it) fails with
// "SyntaxError: Unexpected token 'const'". Keep all helpers inside the function body.
async page => {
  // How a skip link is recognized. Deliberately NOT an allowlist of exact phrases: an
  // earlier version matched /skip to|skip navigation|skip main/ and reported
  // hasSkipLink:false on a page whose first element was `<a href="#notifications-sidebar">
  // Skip content to notifications sidebar</a>` — any wording that puts a word between
  // "skip" and "to", or that targets something other than "main"/"navigation", was
  // invisible to it. Identity is instead structural: a same-page fragment link, named with
  // the word "skip" or "jump", positioned early in the focus order.
  const SKIP_LINK_PATTERN = '\\bskip\\b|\\bjump\\b';

  // Runs in the browser (Playwright serializes this function, so it must not close over
  // anything out here — the pattern is passed in as an argument). Returns the bypass-link
  // metadata and tags the link + its target so the verification phase below can find them
  // again without re-running the match.
  const findSkipLink = pattern => {
    const re = new RegExp(pattern, 'i');
    const focusable = Array.from(
      document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')
    ).filter(el => el.tabIndex >= 0);

    const index = focusable.findIndex(el => {
      if (el.tagName !== 'A') return false;
      const href = el.getAttribute('href') || '';
      // `#` alone is a placeholder anchor, not a bypass target.
      if (!href.startsWith('#') || href.length < 2) return false;
      return re.test(el.textContent || '');
    });
    if (index === -1) return { found: false };

    const link = focusable[index];
    const href = link.getAttribute('href');
    // Target existence is REPORTED, never a condition of detection: a skip link whose href
    // points at no element is a broken bypass the skill flags as Serious, and gating
    // detection on it would silently downgrade that to the milder "no skip link" finding.
    const target = document.getElementById(href.slice(1));
    link.setAttribute('data-a11y-skip', '1');
    if (target) target.setAttribute('data-a11y-skip-target', '1');

    return {
      found: true,
      href,
      text: link.textContent.trim().slice(0, 80),
      // Position in the focus order, for the "reachable early" rule. 0 is ideal; a large
      // index means the match is late enough that it may be body content ("Skip intro",
      // "Jump to top") rather than a real bypass link — read the text before trusting it.
      focusIndex: index,
      focusableCount: focusable.length,
      targetExists: !!target,
    };
  };

  const readOnly = await page.evaluate(() => {
    // ---- page-level structure ----
    const html = document.documentElement;
    const ids = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
    const seen = new Set(), dupes = new Set();
    ids.forEach(id => { if (seen.has(id)) dupes.add(id); seen.add(id); });
    const page = {
      lang: html.getAttribute('lang'),
      title: document.title.trim(),
      h1Count: document.querySelectorAll('h1').length,
      duplicateIds: Array.from(dupes),
    };

    // ---- landmarks and heading hierarchy ----
    const landmarkEls = Array.from(document.querySelectorAll(
      'header, nav, main, footer, aside, form, [role=banner], [role=navigation], [role=main], [role=contentinfo], [role=complementary], [role=search]'
    ));
    const counts = {};
    landmarkEls.forEach(el => {
      const key = el.getAttribute('role') || el.tagName.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]'))
      .map(el => ({
        // Explicit aria-level wins; else the level from an <h1>–<h6> tag; else a
        // role="heading" on a non-heading tag (e.g. <div role="heading">) defaults to 2
        // per ARIA — never Number('I')=NaN, which would silently break skip detection.
        level: el.getAttribute('aria-level')
          ? Number(el.getAttribute('aria-level'))
          : (/^H[1-6]$/.test(el.tagName) ? Number(el.tagName[1]) : 2),
        text: el.textContent.trim().slice(0, 60),
      }));
    const skips = [];
    for (let i = 1; i < headings.length; i++) {
      if (headings[i].level - headings[i - 1].level > 1) {
        skips.push({ from: headings[i - 1], to: headings[i] });
      }
    }

    return {
      page,
      landmarks: {
        landmarkCounts: counts,
        hasMain: counts.main != null || counts['role=main'] != null,
        headings,
        levelSkips: skips,
      },
    };
  });

  // ---- skip-link detection ----
  const meta = await page.evaluate(findSkipLink, SKIP_LINK_PATTERN);
  readOnly.page.hasSkipLink = meta.found;
  readOnly.page.skipLinkText = meta.found ? meta.text : null;
  readOnly.page.skipLinkHref = meta.found ? meta.href : null;

  if (!meta.found) {
    return JSON.stringify({ ...readOnly, skipLink: { found: false } }, null, 1);
  }

  // ---- skip-link verification ----
  // A skip link "works" if activating it lands focus on/inside its target EITHER
  // immediately (native-focusable target, or one with tabindex="-1") OR on the next Tab
  // (spec-correct for a non-focusable target: activeElement stays on <body> but the
  // sequential-focus starting point moves to the target). Only when BOTH fail is the skip
  // link genuinely non-functional.
  const active = () => page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a && a.tagName, id: (a && a.id) || null, text: (a && (a.innerText||a.textContent)||'').trim().slice(0,60) };
  });
  const inTarget = () => page.evaluate(() => {
    const t = document.querySelector('[data-a11y-skip-target]');
    return !!(t && (t === document.activeElement || t.contains(document.activeElement)));
  });

  await page.focus('[data-a11y-skip]');
  await page.keyboard.press('Enter');
  const afterEnter = await active();
  const focusInTargetAfterEnter = await inTarget();
  await page.keyboard.press('Tab');
  const afterTab = await active();
  const focusInTargetAfterTab = await inTarget();

  return JSON.stringify({
    ...readOnly,
    skipLink: {
      ...meta, afterEnter, focusInTargetAfterEnter, afterTab, focusInTargetAfterTab,
      works: focusInTargetAfterEnter || focusInTargetAfterTab,
    },
  }, null, 1);
}
