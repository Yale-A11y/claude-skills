// focus-visibility.js
async page => {
  const results = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const pseudoBefore = getComputedStyle(el, '::before');
      const pseudoAfter = getComputedStyle(el, '::after');
      const noOutline = style.outlineStyle === 'none' || style.outlineWidth === '0px';
      const noBoxShadow = style.boxShadow === 'none';
      const noBorderChange = true; // border changes need a before/blur comparison if suspected
      return {
        tag: el.tagName,
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
        tabIndex: el.tabIndex,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        likelyNoVisibleFocus: noOutline && noBoxShadow,
      };
    });
    results.push({ step: i, ...(info ?? { focus: 'BODY_OR_WRAPPED' }) });
  }
  return JSON.stringify(results, null, 1);
}
