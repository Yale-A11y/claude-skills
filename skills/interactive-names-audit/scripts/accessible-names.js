// accessible-names.js
async page => JSON.stringify(await page.evaluate(() => {
  // Normalize for comparison: lowercase, collapse whitespace, strip surrounding punctuation.
  const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,:;!?'"()\[\]{}]/g, '').trim();

  // Content-derived accessible name: like textContent, but excludes aria-hidden subtrees
  // and display:none/visibility:hidden nodes (none of which contribute to the accessible
  // name), while KEEPING sr-only/clipped text (which does). Using raw textContent here
  // would treat an icon-only button whose only text is inside an aria-hidden span
  // (e.g. <button><span aria-hidden="true">×</span></button>) as named, so its genuinely
  // empty accessible name would never be flagged.
  function accessibleContent(el) {
    let out = '';
    const walk = node => {
      if (node.nodeType === 3) { out += node.textContent; return; }
      if (node.nodeType !== 1) return;
      if (node.getAttribute('aria-hidden') === 'true') return;
      const st = getComputedStyle(node);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      for (const c of node.childNodes) walk(c);
    };
    for (const c of el.childNodes) walk(c);
    return out.replace(/\s+/g, ' ').trim();
  }

  // Text a SIGHTED user actually sees: skip aria-hidden subtrees, display:none/visibility:hidden,
  // and sr-only-clipped nodes (which count toward the accessible name but render nothing).
  function visibleText(el) {
    let out = '';
    const walk = node => {
      if (node.nodeType === 3) { out += node.textContent; return; }
      if (node.nodeType !== 1) return;
      if (node.getAttribute('aria-hidden') === 'true') return;
      const st = getComputedStyle(node);
      if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return;
      const r = node.getBoundingClientRect();
      const clipped = st.clip === 'rect(0px, 0px, 0px, 0px)' || st.clipPath === 'inset(50%)';
      if ((r.width <= 1 && r.height <= 1) || clipped) return;
      for (const c of node.childNodes) walk(c);
    };
    for (const c of el.childNodes) walk(c);
    return out.replace(/\s+/g, ' ').trim();
  }

  const els = Array.from(document.querySelectorAll(
    'button, a[href], [role=button], [role=link], [role=tab], [role=checkbox], [role=switch]'
  ));
  const unnamed = [], labelInName = [], fakeAnchors = [];

  for (const el of els) {
    const contentName = accessibleContent(el);
    const ariaLabel = el.getAttribute('aria-label');
    const lbIds = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    const lbText = lbIds.map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
    const imgAlt = el.querySelector('img[alt]')?.getAttribute('alt');
    const title = el.getAttribute('title');
    const href = el.getAttribute('href');

    // Accessible-name precedence: aria-labelledby > aria-label > content > img alt > title.
    let name = '', source = 'none';
    if (lbText) { name = lbText; source = 'aria-labelledby'; }
    else if (ariaLabel) { name = ariaLabel; source = 'aria-label'; }
    else if (contentName) { name = contentName; source = 'content'; }
    else if (imgAlt) { name = imgAlt; source = 'img-alt'; }
    else if (title) { name = title; source = 'title'; }

    if (href === '#' || (href || '').startsWith('javascript:')) {
      fakeAnchors.push({ tag: el.tagName, href, name });
    }

    if (name.length === 0) {
      unnamed.push({ tag: el.tagName, role: el.getAttribute('role'), href });
      continue;
    }

    // Label in Name (WCAG 2.5.3): only meaningful when there's VISIBLE text AND the
    // accessible name came from an override source (aria-label / aria-labelledby). When
    // the name IS the content, the visible text is trivially contained, so skip.
    const vis = visibleText(el);
    const nVis = norm(vis);
    // Guard: only strict-check when the visible text is short enough to be a spoken label
    // (voice-control labels are 1–4 words). A long composite block (e.g. a dropzone with
    // several lines of instructions) is not "the label" and comparing it produces noise.
    if (nVis && nVis.length <= 30 && (source === 'aria-label' || source === 'aria-labelledby')) {
      const nName = norm(name);
      const contains = nName.includes(nVis);
      const startsWith = nName.startsWith(nVis);
      if (!contains || !startsWith) {
        labelInName.push({
          tag: el.tagName, role: el.getAttribute('role'),
          visibleText: vis, accessibleName: name, nameSource: source,
          contains, startsWith,
        });
      }
    }
  }
  return { unnamed, labelInName, fakeAnchors };
}), null, 1)
