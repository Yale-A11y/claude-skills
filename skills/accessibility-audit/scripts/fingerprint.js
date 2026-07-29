// fingerprint.js — cheap presence counts only; the sub-skills do the real analysis
async page => JSON.stringify(await page.evaluate(() => {
  const q = sel => document.querySelectorAll(sel).length;
  const standaloneSvg = Array.from(document.querySelectorAll('svg')).filter(s => !s.closest('img')).length;
  const focusable = q('a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable=true]');
  // Custom-dropdown signals — presence means "recommend keyboard-dropdown-audit"
  const dropdownSignals = q('[aria-haspopup], [role=menu], [role=menubar], [role=listbox], [role=combobox], [aria-expanded], details > summary');
  return {
    imgs: q('img'),
    videos: q('video'),
    standaloneSvg,
    formControls: q('input:not([type=hidden]), select, textarea'),
    interactive: q('button, a[href], [role=button], [role=link], [role=tab], [role=checkbox], [role=switch]'),
    focusable,
    hasText: !!document.body && document.body.innerText.trim().length > 0,
    dropdownSignals,
  };
}), null, 1)
