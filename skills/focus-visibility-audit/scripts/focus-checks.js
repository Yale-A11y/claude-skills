// focus-checks.js — both focus probes in ONE playwright-cli round-trip:
//   negativeTabindex → control-looking elements removed from the tab order
//   tabWalk          → one entry per Tab stop, with whether a focus indicator is painted
//
// Batched deliberately: each separate `run-code` invocation costs a full model round-trip,
// which re-sends the whole subagent context. The negative-tabindex read runs first because
// it is a read-only DOM query; the Tab walk runs last because it moves focus. The two are
// complementary by construction — the Tab walk cannot see elements Tab skips, which is
// exactly what the first probe enumerates.
async page => {
  const negativeTabindex = await page.evaluate(() => {
    const controlSel = 'button, a[href], input, select, textarea, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [role=slider]';
    const out = [];
    document.querySelectorAll(controlSel).forEach(el => {
      const ti = el.getAttribute('tabindex');
      if (ti === null || parseInt(ti, 10) >= 0) return;
      const r = el.getBoundingClientRect();
      out.push({
        tag: el.tagName,
        role: el.getAttribute('role'),
        tabindex: ti,
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 50),
        visible: r.width > 0 && r.height > 0,
      });
    });
    return out;
  });

  const tabWalk = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const noOutline = style.outlineStyle === 'none' || style.outlineWidth === '0px';
      const noBoxShadow = style.boxShadow === 'none';
      return {
        tag: el.tagName,
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
        tabIndex: el.tabIndex,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        // A border-only focus change needs a before/blur comparison to detect; if one is
        // suspected, confirm from the screenshot rather than this flag.
        likelyNoVisibleFocus: noOutline && noBoxShadow,
      };
    });
    tabWalk.push({ step: i, ...(info ?? { focus: 'BODY_OR_WRAPPED' }) });
  }

  return JSON.stringify({ negativeTabindex, tabWalk }, null, 1);
}
