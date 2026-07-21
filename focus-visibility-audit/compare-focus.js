async page => {
  const el = await page.getByRole('button', { name: 'Upload media by clicking or' });
  const grab = () => page.evaluate(() => {
    const e = document.activeElement;
    const t = document.querySelector('[role=button]');
    return null;
  });
  // focus and capture
  await el.focus();
  const focused = await page.evaluate(() => {
    const e = document.activeElement;
    const s = getComputedStyle(e);
    return { outline: s.outlineStyle+' '+s.outlineWidth+' '+s.outlineColor, boxShadow: s.boxShadow, border: s.border, background: s.backgroundColor };
  });
  // blur to body
  await page.evaluate(() => document.activeElement.blur());
  const blurred = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button,[role=button]')];
    const e = btns.find(b => (b.getAttribute('aria-label')||'').startsWith('Upload media'));
    const s = getComputedStyle(e);
    return { outline: s.outlineStyle+' '+s.outlineWidth+' '+s.outlineColor, boxShadow: s.boxShadow, border: s.border, background: s.backgroundColor };
  });
  return JSON.stringify({ focused, blurred }, null, 1);
}
