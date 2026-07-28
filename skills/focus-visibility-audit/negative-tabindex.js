async page => {
  return await page.evaluate(() => {
    const controlSel = 'button, a[href], input, select, textarea, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [role=slider]';
    const out = [];
    document.querySelectorAll(controlSel).forEach(el => {
      const ti = el.getAttribute('tabindex');
      if (ti !== null && parseInt(ti, 10) < 0) {
        const r = el.getBoundingClientRect();
        out.push({
          tag: el.tagName,
          role: el.getAttribute('role'),
          tabindex: ti,
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 50),
          visible: r.width > 0 && r.height > 0,
        });
      }
    });
    return JSON.stringify(out, null, 1);
  });
}
