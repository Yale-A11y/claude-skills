// structure-checks.js — all page-structure probes in ONE playwright-cli round-trip:
//   page      → lang, title, h1 count, duplicate ids, skip-link presence
//   landmarks → landmark region counts, heading list, heading-level skips
//   skipLink  → whether activating the skip link actually moves focus
//
// Batched deliberately: each separate `run-code` invocation costs a full model round-trip,
// which re-sends the whole subagent context. The two read-only probes run first; the
// skip-link verification runs last because it moves focus and tags nodes with
// data-a11y-skip attributes (which would otherwise show up in the duplicate-id read).
async page => {
  const readOnly = await page.evaluate(() => {
    // ---- page-level structure ----
    const html = document.documentElement;
    const skipLink = Array.from(document.querySelectorAll('a[href^="#"]')).find(a =>
      /skip to|skip navigation|skip main/i.test(a.textContent || '')
    );
    const ids = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
    const seen = new Set(), dupes = new Set();
    ids.forEach(id => { if (seen.has(id)) dupes.add(id); seen.add(id); });
    const page = {
      lang: html.getAttribute('lang'),
      title: document.title.trim(),
      h1Count: document.querySelectorAll('h1').length,
      duplicateIds: Array.from(dupes),
      hasSkipLink: !!skipLink,
      skipLinkText: skipLink ? skipLink.textContent.trim() : null,
      skipLinkHref: skipLink ? skipLink.getAttribute('href') : null,
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
  const meta = await page.evaluate(() => {
    const link = Array.from(document.querySelectorAll('a[href^="#"]')).find(a =>
      /skip to|skip navigation|skip main/i.test(a.textContent || ''));
    if (!link) return { found: false };
    const id = (link.getAttribute('href') || '').slice(1);
    const target = id ? document.getElementById(id) : null;
    link.setAttribute('data-a11y-skip', '1');
    if (target) target.setAttribute('data-a11y-skip-target', '1');
    return { found: true, href: link.getAttribute('href'), targetExists: !!target };
  });
  if (!meta.found) {
    return JSON.stringify({ ...readOnly, skipLink: { found: false } }, null, 1);
  }
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
