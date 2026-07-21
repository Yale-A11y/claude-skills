async page => {
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Tab');
  }
  return await page.evaluate(() => {
    const e = document.activeElement;
    const s = getComputedStyle(e);
    return JSON.stringify({
      tag: e.tagName,
      label: e.getAttribute('aria-label'),
      matchesFocusVisible: e.matches(':focus-visible'),
      outline: s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor,
      boxShadow: s.boxShadow,
      border: s.border,
    }, null, 1);
  });
}
