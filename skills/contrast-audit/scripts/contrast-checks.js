// contrast-checks.js — all three contrast probes in ONE playwright-cli round-trip:
//   text     → WCAG 1.4.3 (Step 1)
//   nonText  → WCAG 1.4.11 (Step 2)
//   focus    → WCAG 2.4.11 / 1.4.11 (Step 3)
//
// Batched deliberately: each separate `run-code` invocation costs a full model round-trip,
// which re-sends the whole subagent context. Measured, splitting these three back apart
// costs ~70k input tokens per run. The read-only DOM/CSSOM probes run first; the Tab walk
// runs last because it moves focus.
//
// Colors are normalized through a rasterized 1×1 canvas pixel, never string-parsed, so
// oklch()/oklab()/lab()/lch()/color() (Tailwind v4 defaults to oklch) yield real sRGB
// bytes instead of silently collapsing to [0,0,0]. The trio below is duplicated in the
// focus walk's own evaluate because each page.evaluate runs in a fresh page context and
// cannot close over Node-side values — keep the two copies consistent.
async page => {
  const COLOR_SRC = '#[0-9a-fA-F]{3,8}|rgba?\\([^)]*\\)|hsla?\\([^)]*\\)|oklab\\([^)]*\\)|oklch\\([^)]*\\)|lab\\([^)]*\\)|lch\\([^)]*\\)|color\\([^)]*\\)';

  const staticChecks = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const toRgbArray = str => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000000'; // reset so a rejected/invalid value can't leak the previous color
      ctx.fillStyle = str;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3]]; // alpha is 0-255 here, not 0-1
    };
    const luminance = ([r, g, b]) => {
      const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    };
    const contrastRatio = (fg, bg) => {
      const l1 = luminance(fg) + 0.05, l2 = luminance(bg) + 0.05;
      return l1 > l2 ? l1 / l2 : l2 / l1;
    };
    // Text part: walks up from the element itself and returns the color STRING.
    const effectiveBgStr = el => {
      let node = el;
      while (node) {
        const bgStr = getComputedStyle(node).backgroundColor;
        const [, , , a] = toRgbArray(bgStr);
        if (a > 2) return bgStr; // meaningfully opaque, not just a rounding artifact of transparent
        node = node.parentElement;
      }
      return 'rgb(255, 255, 255)';
    };
    // Non-text part: called with el.parentElement so it measures the *surface the component
    // sits on* rather than the component's own fill; returns an rgb ARRAY.
    const effBgArr = node => {
      while (node) {
        const c = toRgbArray(getComputedStyle(node).backgroundColor);
        if (c[3] > 2) return c;
        node = node.parentElement;
      }
      return [255, 255, 255, 255];
    };

    // ---- Step 1: text contrast (1.4.3) ----
    const textEls = Array.from(document.querySelectorAll('body *')).filter(el =>
      el.children.length === 0 &&
      el.textContent.trim().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden' &&
      el.offsetParent !== null
    );
    const sampled = textEls.slice(0, 800);
    const textFailures = sampled.map(el => {
      const style = getComputedStyle(el);
      const fg = toRgbArray(style.color);
      const bgStr = effectiveBgStr(el);
      const bg = toRgbArray(bgStr);
      const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
      const fontSize = parseFloat(style.fontSize);
      const bold = parseInt(style.fontWeight, 10) >= 700;
      const isLarge = fontSize >= 24 || (fontSize >= 18.66 && bold);
      const threshold = isLarge ? 3 : 4.5;
      return { text: el.textContent.trim().slice(0, 40), tag: el.tagName, ratio, threshold, isLarge, pass: ratio >= threshold, color: style.color, bg: bgStr };
    }).filter(r => !r.pass);

    // ---- Step 2: non-text / UI-component contrast (1.4.11) ----
    const FIELD_TYPES = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'date', 'datetime-local', 'month', 'week', 'time']);
    const STATEFUL_TYPES = new Set(['range', 'checkbox', 'radio']);
    const STATEFUL_ROLES = new Set(['slider', 'checkbox', 'switch', 'radio', 'spinbutton']);
    const sel = 'input:not([type=hidden]), select, textarea, button, [role=button], [role=checkbox], [role=switch], [role=radio], [role=slider], [role=tab], [role=spinbutton]';
    const comps = Array.from(document.querySelectorAll(sel)).filter(el =>
      el.offsetParent !== null && !el.disabled &&
      getComputedStyle(el).visibility !== 'hidden' && el.getAttribute('aria-hidden') !== 'true'
    );
    const candidates = [];
    for (const el of comps) {
      const s = getComputedStyle(el);
      const tag = el.tagName, type = el.type || null, role = el.getAttribute('role');
      const visibleText = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const hasText = visibleText.length >= 2;

      // Classify the control's actual 1.4.11 obligation.
      let kind;
      if ((tag === 'INPUT' && FIELD_TYPES.has(type)) || tag === 'TEXTAREA' || tag === 'SELECT') kind = 'field';
      else if ((tag === 'INPUT' && STATEFUL_TYPES.has(type)) || STATEFUL_ROLES.has(role)) kind = 'stateful';
      else if (hasText) kind = 'text-labeled';
      else kind = 'icon-only';
      if (kind === 'text-labeled') continue; // identified by its text — not a non-text obligation

      const ownBg = toRgbArray(s.backgroundColor);
      const interior = ownBg[3] > 2 ? ownBg : effBgArr(el.parentElement);
      const exterior = effBgArr(el.parentElement);
      const bw = parseFloat(s.borderTopWidth) || 0;
      const hasBorder = bw >= 1 && s.borderTopStyle !== 'none';
      const border = toRgbArray(s.borderTopColor);
      const borderVsExterior = (hasBorder && border[3] > 2) ? Math.round(contrastRatio(border, exterior) * 100) / 100 : null;
      const fillVsExterior = ownBg[3] > 2 ? Math.round(contrastRatio(interior, exterior) * 100) / 100 : null;
      const best = Math.max(borderVsExterior || 0, fillVsExterior || 0);
      if (best >= 3) continue; // a measurable ≥3:1 boundary exists

      const note = kind === 'field'
        ? 'Form field: its border/fill is the primary cue that it is an input; measured boundary < 3:1 — likely a real 1.4.11 failure, confirm no other cue exists.'
        : kind === 'stateful'
        ? 'Stateful control: track/thumb/checked state are typically drawn via pseudo-elements or SVG this element-background check cannot read — confirm those graphics each meet 3:1 in a screenshot.'
        : 'Icon-only control: identification rests on the icon glyph, not the element boundary — confirm the icon (SVG fill/stroke) meets 3:1 vs its background; the button boundary itself may not be required.';

      candidates.push({
        tag, type, role, kind, name: (el.getAttribute('aria-label') || visibleText).slice(0, 40),
        hasBorder, borderColor: hasBorder ? s.borderTopColor : null, borderVsExterior,
        bg: s.backgroundColor, exterior: `rgb(${exterior[0]}, ${exterior[1]}, ${exterior[2]})`,
        fillVsExterior, bestBoundary: Math.round(best * 100) / 100, note,
      });
    }

    return {
      text: { sampledCount: sampled.length, totalTextNodes: textEls.length, failures: textFailures },
      nonText: { checked: comps.length, flagged: candidates.length, candidates },
    };
  });

  // ---- Step 3: focus-indicator contrast (2.4.11 / 1.4.11) ----
  // Runs last: it moves focus, which the two read-only probes above must not see.
  const focus = [];
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
    focus.push({ step: i, ...(info ?? { focus: 'BODY_OR_WRAPPED' }) });
  }

  return JSON.stringify({ ...staticChecks, focus }, null, 1);
}
