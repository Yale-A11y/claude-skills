// images-media.js
async page => JSON.stringify(await page.evaluate(() => {
  // Does the ancestor link/button have an accessible name from something OTHER than this
  // image — visible text, aria-label, or aria-labelledby? Checking textContent alone
  // false-positives on e.g. <a aria-label="Home"><img alt=""></a>, which is fine.
  const controlHasOtherName = ctrl => {
    if (!ctrl) return false;
    if ((ctrl.textContent || '').trim().length > 0) return true;
    if ((ctrl.getAttribute('aria-label') || '').trim().length > 0) return true;
    return (ctrl.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
      .some(id => (document.getElementById(id)?.textContent || '').trim().length > 0);
  };
  const imgs = Array.from(document.querySelectorAll('img')).map(img => {
    const ctrl = img.closest('a, button');
    return {
      src: (img.currentSrc || img.src || '').split('/').pop(),
      hasAltAttr: img.hasAttribute('alt'),
      alt: img.getAttribute('alt'),
      inLink: !!ctrl,
      linkHasOtherText: controlHasOtherName(ctrl),
    };
  });
  const videos = Array.from(document.querySelectorAll('video')).map(v => ({
    hasCaptionTrack: !!v.querySelector('track[kind=captions], track[kind=subtitles]'),
    hasControls: v.hasAttribute('controls'),
  }));
  const svgs = Array.from(document.querySelectorAll('svg')).filter(s => !s.closest('img')).map(s => ({
    hasTitle: !!s.querySelector('title'),
    hasAriaLabel: s.hasAttribute('aria-label'),
    isAriaHidden: s.getAttribute('aria-hidden') === 'true',
    inButtonOrLink: !!s.closest('button, a'),
  }));

  // Icons rendered WITHOUT <img>/<svg>: CSS background-image icons and icon-font glyphs.
  // Neither reaches the accessibility tree on its own, so <img>/<svg> scanning is blind to
  // them. Collect the signals needed to judge each as decorative (redundant with adjacent
  // text → correct as-is, nothing to fix) vs informative-but-unnamed (carries meaning with
  // no text equivalent, or is the sole content of an unnamed control → a real failure).
  // Token followed by a hyphen ("fa-star") OR a word boundary ("icon"/"fa" alone). NOTE:
  // `\b` inside a character class means backspace, not a word boundary — `[-\b]` would
  // wrongly require a trailing hyphen/backspace and miss a bare class="icon"/"fa".
  const ICON_CLASS_RE = /\b(icon|fa|fas|far|fab|glyphicon|material-icons|bi|ico|svg-icon)(?:-|\b)/i;
  const ICON_FONT_RE = /awesome|material icons|material-icons|glyphicon|bootstrap-icons|ionicons|feather/i;
  const controlInfo = el => {
    const ctrl = el.closest('a, button, [role=button], [role=link]');
    if (!ctrl) return { inControl: false };
    const name = (ctrl.getAttribute('aria-label') || ctrl.textContent || '').trim();
    return { inControl: true, controlTag: ctrl.tagName, controlHasName: name.length > 0, controlText: name.slice(0, 40) };
  };
  const iconMeta = (el, kind, detail) => {
    const r = el.getBoundingClientRect();
    const container = el.closest('a, button, li, p, figure, dd, dt, div');
    return {
      kind, detail, tag: el.tagName, cls: el.getAttribute('class'),
      w: Math.round(r.width), h: Math.round(r.height),
      role: el.getAttribute('role'), ariaHidden: el.getAttribute('aria-hidden'),
      ariaLabel: el.getAttribute('aria-label'), title: el.getAttribute('title'),
      ownText: (el.textContent || '').trim().slice(0, 20),
      nearbyText: container ? (container.textContent || '').trim().slice(0, 60) : '',
      ...controlInfo(el),
    };
  };
  const bgIconEls = [], iconFontEls = [];
  Array.from(document.querySelectorAll('span, i, em, a, button, div, li, dd')).forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const empty = (el.textContent || '').trim() === '';
    const iconSized = r.width <= 64 && r.height <= 64;
    const cls = el.getAttribute('class') || '';
    const cs = getComputedStyle(el);
    const bg = cs.backgroundImage;
    if (empty && bg && bg !== 'none' && /url\(/.test(bg) && (iconSized || ICON_CLASS_RE.test(cls))) {
      bgIconEls.push(iconMeta(el, 'css-background', bg.slice(0, 60)));
    }
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      const content = ps.content;
      const hasGlyph = content && !['none', 'normal', '""', "''"].includes(content);
      if (empty && hasGlyph && (ICON_FONT_RE.test(ps.fontFamily || '') || ICON_CLASS_RE.test(cls))) {
        iconFontEls.push(iconMeta(el, 'icon-font', pseudo + ' ' + content.slice(0, 10)));
        break;
      }
    }
  });

  return { imgs, videos, svgs, bgIconEls, iconFontEls };
}), null, 1)
