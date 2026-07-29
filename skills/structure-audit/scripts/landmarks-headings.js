// landmarks-headings.js
async page => JSON.stringify(await page.evaluate(() => {
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
    landmarkCounts: counts,
    hasMain: counts.main != null || counts['role=main'] != null,
    headings,
    levelSkips: skips,
  };
}), null, 1)
