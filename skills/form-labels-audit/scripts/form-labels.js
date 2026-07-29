// form-labels.js
async page => JSON.stringify(await page.evaluate(() => {
  // Page-wide: <label> elements that don't actually label anything.
  const orphanedLabels = Array.from(document.querySelectorAll('label')).filter(l => {
    const forId = l.getAttribute('for');
    const wrapsControl = !!l.querySelector('input, select, textarea');
    if (wrapsControl) return false;
    if (forId && document.getElementById(forId)) return false; // correctly wired
    return true; // no `for` and doesn't wrap anything, OR `for` resolves to nothing
  }).map(l => ({
    text: l.textContent.trim().slice(0, 60),
    forAttr: l.getAttribute('for'),
    reason: l.getAttribute('for') ? 'for="' + l.getAttribute('for') + '" matches no element id' : 'no for attribute and wraps no control',
  }));

  // Geometric proximity: does label-shaped text sit directly above/left of an
  // unlabeled control with zero DOM/ARIA relationship to it? This is what a sighted
  // QA pass "sees" as the label even though no association exists.
  // Collect label-shaped elements ONCE (not per control) — this query + its el-independent
  // filter is the same for every field, so hoisting it out of findNearbyVisualLabel avoids
  // a full-document querySelectorAll per control on form-heavy pages.
  const labelCandidateEls = Array.from(document.querySelectorAll('label, span, div, p, td, th, dt, legend'))
    .filter(c => !c.querySelector('input, select, textarea'));
  function findNearbyVisualLabel(el) {
    const rect = el.getBoundingClientRect();
    const candidates = labelCandidateEls.filter(c => c !== el && !el.contains(c) && !c.contains(el));
    let best = null, bestDist = Infinity;
    for (const c of candidates) {
      const text = (c.textContent || '').trim();
      if (!text || text.length > 80) continue; // empty or too long to be label-shaped
      const r = c.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // not rendered
      const horizOverlap = !(r.right < rect.left - 4 || r.left > rect.right + 4);
      const vertOverlap = !(r.bottom < rect.top - 4 || r.top > rect.bottom + 4);
      const above = horizOverlap && r.bottom <= rect.top + 4 && rect.top - r.bottom < 40;
      const left = vertOverlap && r.right <= rect.left + 4 && rect.left - r.right < 200;
      if (!above && !left) continue;
      const dist = above ? (rect.top - r.bottom) : (rect.left - r.right);
      if (dist < bestDist) {
        bestDist = dist;
        best = { text: text.slice(0, 60), tag: c.tagName, position: above ? 'above' : 'left', isOrphanedLabelTag: c.tagName === 'LABEL' };
      }
    }
    return best;
  }

  // Common sr-only / visually-hidden techniques: display:none and visibility:hidden
  // are excluded from the accessible-name computation entirely (so if a <label> used
  // one of those, `name` above would already be empty and it's caught as missing name,
  // not this check). The techniques that DO still count toward the accessible name
  // while rendering nothing on screen are the "clip"/1px-box family used by sr-only
  // utility classes across every major CSS framework.
  function isVisuallyHidden(el) {
    if (!el) return true;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    if (parseFloat(style.opacity) === 0) return true;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 && rect.height <= 1) return true; // classic 1x1px sr-only box
    if (style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)') return true;
    return false;
  }

  // --- Autocomplete / input purpose (WCAG 1.3.5 Identify Input Purpose, AA) ---
  // The valid autofill "field name" tokens from the HTML spec — the set WCAG 1.3.5 draws
  // on. A field that COLLECTS information about the user must carry an appropriate one.
  const AUTOFILL_FIELD_TOKENS = new Set([
    'name','honorific-prefix','given-name','additional-name','family-name','honorific-suffix',
    'nickname','username','new-password','current-password','one-time-code','organization-title',
    'organization','street-address','address-line1','address-line2','address-line3',
    'address-level4','address-level3','address-level2','address-level1','country','country-name',
    'postal-code','cc-name','cc-given-name','cc-additional-name','cc-family-name','cc-number',
    'cc-exp','cc-exp-month','cc-exp-year','cc-csc','cc-type','transaction-currency',
    'transaction-amount','language','bday','bday-day','bday-month','bday-year','sex','url','photo',
    'tel','tel-country-code','tel-national','tel-area-code','tel-local','tel-local-prefix',
    'tel-local-suffix','tel-extension','email','impp',
  ]);
  const CONTACT_TYPES = new Set(['home','work','mobile','fax','pager']);
  // Validate an autocomplete value per the spec grammar: optional `section-*`, then
  // optional `shipping`/`billing`, then optional contact type, then the field token
  // (`webauthn` credential suffix allowed). Returns present/valid/state/token.
  function classifyAutocomplete(raw) {
    if (raw == null) return { present: false };
    const v = raw.trim().toLowerCase();
    if (v === '') return { present: true, valid: false, token: null };
    if (v === 'on' || v === 'off') return { present: true, state: v, valid: null };
    let toks = v.split(/\s+/);
    if (toks[0] && toks[0].startsWith('section-')) toks = toks.slice(1);
    if (toks[0] === 'shipping' || toks[0] === 'billing') toks = toks.slice(1);
    if (CONTACT_TYPES.has(toks[0])) toks = toks.slice(1);
    const parts = toks.filter(t => t !== 'webauthn');
    const token = parts.length ? parts[parts.length - 1] : null;
    return { present: true, valid: !!token && AUTOFILL_FIELD_TOKENS.has(token), token };
  }
  // Guess the input purpose from type + name/id/accessible-name/placeholder keywords.
  // Returns null when the field doesn't look like it collects user-identity info, so
  // 1.3.5 (which applies only to such fields) is not flagged for search/submit/etc.
  function inferPurpose(el, accName) {
    const t = (el.getAttribute('type') || el.type || '').toLowerCase();
    if (t === 'email') return 'email';
    if (t === 'tel') return 'tel';
    if (t === 'password') {
      const h0 = ((el.getAttribute('name') || '') + ' ' + (el.id || '') + ' ' + (accName || '')).toLowerCase();
      return /new|register|sign[\s_-]?up|create|confirm/.test(h0) ? 'new-password' : 'current-password';
    }
    if (['search','hidden','checkbox','radio','submit','button','reset','file','range','color'].includes(t)) return null;
    const hay = [el.getAttribute('name'), el.id, accName, el.getAttribute('placeholder')]
      .filter(Boolean).join(' ').toLowerCase();
    const HINTS = [
      [/first[\s_-]?name|given[\s_-]?name|\bfname\b/, 'given-name'],
      [/last[\s_-]?name|family[\s_-]?name|surname|\blname\b/, 'family-name'],
      [/full[\s_-]?name|your[\s_-]?name|contact[\s_-]?name|\bname\b/, 'name'],
      [/e-?mail/, 'email'],
      [/phone|telephone|\btel\b|mobile/, 'tel'],
      [/street|address(?!\s*level)|\baddr\b/, 'street-address'],
      [/\bcity\b|town/, 'address-level2'],
      [/state|province|region/, 'address-level1'],
      [/zip|postal|post[\s_-]?code/, 'postal-code'],
      [/country/, 'country-name'],
      [/organization|organisation|company|employer/, 'organization'],
      [/user[\s_-]?name/, 'username'],
      [/birth|\bdob\b|\bbday\b/, 'bday'],
      [/job[\s_-]?title|\borg[\s_-]?title/, 'organization-title'],
    ];
    for (const [re, tok] of HINTS) if (re.test(hay)) return tok;
    return null;
  }

  const controls = Array.from(document.querySelectorAll('input, select, textarea'))
    .filter(el => el.type !== 'hidden' && getComputedStyle(el).display !== 'none');
  const controlResults = controls.map(el => {
    const id = el.id;
    const explicitLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    const wrappingLabel = el.closest('label');
    const ariaLabel = el.getAttribute('aria-label');
    const labelledbyIds = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    const labelledbyEls = labelledbyIds.map(lid => document.getElementById(lid)).filter(Boolean);
    const labelledbyText = labelledbyEls.map(e => e.textContent.trim()).filter(Boolean).join(' ');
    const name = explicitLabel?.textContent?.trim() || wrappingLabel?.textContent?.trim() ||
      ariaLabel || labelledbyText || '';
    const hasAccessibleName = name.length > 0;

    // Which source actually produced `name`, and is that source visible on screen?
    let nameSource = 'none', hasVisibleLabel = false;
    if (explicitLabel?.textContent?.trim()) {
      nameSource = isVisuallyHidden(explicitLabel) ? 'hidden-label-for' : 'visible-label';
      hasVisibleLabel = nameSource === 'visible-label';
    } else if (wrappingLabel?.textContent?.trim()) {
      nameSource = isVisuallyHidden(wrappingLabel) ? 'hidden-label-wrapping' : 'visible-label';
      hasVisibleLabel = nameSource === 'visible-label';
    } else if (ariaLabel) {
      nameSource = 'aria-label'; // never rendered, by definition never a visible label
    } else if (labelledbyText) {
      const anyVisible = labelledbyEls.some(e => !isVisuallyHidden(e));
      nameSource = anyVisible ? 'aria-labelledby-visible' : 'aria-labelledby-hidden';
      hasVisibleLabel = anyVisible;
    }

    return {
      tag: el.tagName,
      type: el.type || null,
      id: id || null,
      name,
      hasAccessibleName,
      nameSource,
      hasVisibleLabel,
      placeholderOnly: !hasAccessibleName && !!el.getAttribute('placeholder'),
      required: el.required,
      hasAriaInvalid: el.hasAttribute('aria-invalid'),
      describedBy: el.getAttribute('aria-describedby'),
      // Input purpose (WCAG 1.3.5): the raw autocomplete value, whether it's a valid
      // token, and the purpose inferred from the field's type/name/label (null = not a
      // user-info field, so 1.3.5 doesn't apply).
      autocomplete: el.getAttribute('autocomplete'),
      autocompleteInfo: classifyAutocomplete(el.getAttribute('autocomplete')),
      inferredPurpose: inferPurpose(el, name),
      // Run the proximity search whenever there's no VISIBLE label source — this
      // covers both "no accessible name at all" (Visual-only label candidate) and
      // "accessible name comes from aria-label/hidden-label" (Missing visible label
      // candidate). In the second case, finding nearby text doesn't necessarily mean
      // the finding is wrong — it means there's a nearby visible text run that likely
      // *is* serving as the de facto sighted label even though it isn't the technical
      // name source, which changes the finding from "no visual cue exists" to "a visual
      // cue exists but is disconnected from the accessible name" (see flagging).
      nearbyVisualLabel: hasVisibleLabel ? null : findNearbyVisualLabel(el),
    };
  });

  return { controls: controlResults, orphanedLabels };
}), null, 1)
