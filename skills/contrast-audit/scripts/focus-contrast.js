// focus-contrast.js
async page => {
  const COLOR_SRC = '#[0-9a-fA-F]{3,8}|rgba?\\([^)]*\\)|hsla?\\([^)]*\\)|oklab\\([^)]*\\)|oklch\\([^)]*\\)|lab\\([^)]*\\)|lch\\([^)]*\\)|color\\([^)]*\\)';
  const results = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate((COLOR_SRC) => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const COLOR_RE = new RegExp(COLOR_SRC, 'g');
      const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const toRgb = str => { ctx.clearRect(0,0,1,1); ctx.fillStyle='#000000'; ctx.fillStyle=str; ctx.fillRect(0,0,1,1); const d=ctx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]]; };
      const lum = ([r,g,b]) => { const a=[r,g,b].map(v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);}); return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]; };
      const ratio = (f,b) => { const l1=lum(f)+0.05, l2=lum(b)+0.05; return l1>l2? l1/l2 : l2/l1; };
      const effBg = (node) => { while(node){ const c=toRgb(getComputedStyle(node).backgroundColor); if(c[3]>2) return c; node=node.parentElement; } return [255,255,255,255]; };
      const s = getComputedStyle(el);
      const ownBg = toRgb(s.backgroundColor);
      const interior = ownBg[3] > 2 ? ownBg : effBg(el.parentElement);
      const exterior = effBg(el.parentElement);
      // Pick the indicator color. Two traps to avoid, both of which cause false positives:
      //  (1) outline-style:auto is the browser's NATIVE focus ring, painted as a TWO-TONE
      //      stroke (a colored line PLUS a contrasting white/dark companion line) so it
      //      stays visible on any background. The CSSOM exposes only the single author-set
      //      `outline-color`, NOT the companion line — so contrast computed from
      //      outline-color alone UNDER-reports an auto ring. Never fail an auto ring from
      //      computed color; flag it as a UA ring and judge it from a screenshot instead.
      //  (2) a layered box-shadow ring (e.g. dark outline + light halo — the recommended
      //      fix pattern) passes if ANY layer contrasts; take the BEST-contrasting token,
      //      not the first one, or the check false-positives on a perfectly good ring.
      let indicator = null, source = null, uaAutoRing = false;
      const ow = parseFloat(s.outlineWidth) || 0;
      if (s.outlineStyle === 'auto' && ow > 0) {
        uaAutoRing = true; source = 'outline-auto';
        const c = toRgb(s.outlineColor); if (c[3] > 2) indicator = c; // author color only — informational, do NOT fail on it
      } else if (s.outlineStyle !== 'none' && ow > 0) {
        const c = toRgb(s.outlineColor); if (c[3] > 2) { indicator = c; source = 'outline'; }
      }
      if (!indicator && !uaAutoRing && s.boxShadow !== 'none') {
        const toks = s.boxShadow.match(COLOR_RE) || [];
        let best = null, bestC = -1;
        for (const t of toks) { const c = toRgb(t); if (c[3] > 2) { const r = ratio(c, exterior); if (r > bestC) { bestC = r; best = c; } } }
        if (best) { indicator = best; source = 'box-shadow'; }
      }
      const vsExterior = indicator ? Math.round(ratio(indicator, exterior) * 100) / 100 : null;
      const vsInterior = indicator ? Math.round(ratio(indicator, interior) * 100) / 100 : null;
      return {
        tag: el.tagName,
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
        hasIndicator: !!indicator || uaAutoRing, indicatorSource: source, uaAutoRing,
        outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth,
        boxShadow: s.boxShadow.slice(0, 120),
        vsExterior, vsInterior,
      };
    }, COLOR_SRC);
    results.push({ step: i, ...(info ?? { focus: 'BODY_OR_WRAPPED' }) });
  }
  return JSON.stringify(results, null, 1);
}
