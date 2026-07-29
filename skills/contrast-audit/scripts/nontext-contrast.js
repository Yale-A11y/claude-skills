// nontext-contrast.js
async page => JSON.stringify(await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const toRgb = str => { ctx.clearRect(0,0,1,1); ctx.fillStyle='#000000'; ctx.fillStyle=str; ctx.fillRect(0,0,1,1); const d=ctx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]]; };
  const lum = ([r,g,b]) => { const a=[r,g,b].map(v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);}); return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]; };
  const ratio = (f,b) => { const l1=lum(f)+0.05, l2=lum(b)+0.05; return l1>l2? l1/l2 : l2/l1; };
  // Effective background of a node (opaque), starting from its parent so we measure the
  // *surface the component sits on* rather than the component's own fill.
  const effBg = (node) => { while(node){ const c=toRgb(getComputedStyle(node).backgroundColor); if(c[3]>2) return c; node=node.parentElement; } return [255,255,255,255]; };
  const FIELD_TYPES = new Set(['text','email','password','search','tel','url','number','date','datetime-local','month','week','time']);
  const STATEFUL_TYPES = new Set(['range','checkbox','radio']);
  const STATEFUL_ROLES = new Set(['slider','checkbox','switch','radio','spinbutton']);
  const sel = 'input:not([type=hidden]), select, textarea, button, [role=button], [role=checkbox], [role=switch], [role=radio], [role=slider], [role=tab], [role=spinbutton]';
  const comps = Array.from(document.querySelectorAll(sel)).filter(el =>
    el.offsetParent !== null && !el.disabled &&
    getComputedStyle(el).visibility !== 'hidden' && el.getAttribute('aria-hidden') !== 'true'
  );
  const out = [];
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

    const ownBg = toRgb(s.backgroundColor);
    const interior = ownBg[3] > 2 ? ownBg : effBg(el.parentElement);
    const exterior = effBg(el.parentElement);
    const bw = parseFloat(s.borderTopWidth) || 0;
    const hasBorder = bw >= 1 && s.borderTopStyle !== 'none';
    const border = toRgb(s.borderTopColor);
    const borderVsExterior = (hasBorder && border[3] > 2) ? Math.round(ratio(border, exterior) * 100) / 100 : null;
    const fillVsExterior = ownBg[3] > 2 ? Math.round(ratio(interior, exterior) * 100) / 100 : null;
    const best = Math.max(borderVsExterior || 0, fillVsExterior || 0);
    if (best >= 3) continue; // a measurable ≥3:1 boundary exists

    const note = kind === 'field'
      ? 'Form field: its border/fill is the primary cue that it is an input; measured boundary < 3:1 — likely a real 1.4.11 failure, confirm no other cue exists.'
      : kind === 'stateful'
      ? 'Stateful control: track/thumb/checked state are typically drawn via pseudo-elements or SVG this element-background check cannot read — confirm those graphics each meet 3:1 in a screenshot.'
      : 'Icon-only control: identification rests on the icon glyph, not the element boundary — confirm the icon (SVG fill/stroke) meets 3:1 vs its background; the button boundary itself may not be required.';

    out.push({
      tag, type, role, kind, name: (el.getAttribute('aria-label') || visibleText).slice(0, 40),
      hasBorder, borderColor: hasBorder ? s.borderTopColor : null, borderVsExterior,
      bg: s.backgroundColor, exterior: `rgb(${exterior[0]}, ${exterior[1]}, ${exterior[2]})`,
      fillVsExterior, bestBoundary: Math.round(best * 100) / 100, note,
    });
  }
  return { checked: comps.length, flagged: out.length, candidates: out };
}), null, 1)
