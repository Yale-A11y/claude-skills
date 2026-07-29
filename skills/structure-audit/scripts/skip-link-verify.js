// skip-link-verify.js — a skip link "works" if activating it lands focus on/inside its
// target EITHER immediately (native-focusable target, or one with tabindex="-1") OR on
// the next Tab (spec-correct for a non-focusable target: activeElement stays on <body>
// but the sequential-focus starting point moves to the target). Only when BOTH fail is
// the skip link genuinely non-functional.
async page => {
  const active = () => page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a && a.tagName, id: (a && a.id) || null, text: (a && (a.innerText||a.textContent)||'').trim().slice(0,60) };
  });
  const meta = await page.evaluate(() => {
    const link = Array.from(document.querySelectorAll('a[href^="#"]')).find(a =>
      /skip to|skip navigation|skip main/i.test(a.textContent || ''));
    if (!link) return { found: false };
    const id = (link.getAttribute('href') || '').slice(1);
    const target = id ? document.getElementById(id) : null;
    link.setAttribute('data-a11y-skip', '1');
    if (target) target.setAttribute('data-a11y-skip-target', '1');
    return { found: true, href: link.getAttribute('href'), targetExists: !!target };
  });
  if (!meta.found) return JSON.stringify({ found: false }, null, 1);
  const inTarget = () => page.evaluate(() => {
    const t = document.querySelector('[data-a11y-skip-target]');
    return !!(t && (t === document.activeElement || t.contains(document.activeElement)));
  });
  await page.focus('[data-a11y-skip]');
  await page.keyboard.press('Enter');
  const afterEnter = await active();
  const focusInTargetAfterEnter = await inTarget();
  await page.keyboard.press('Tab');
  const afterTab = await active();
  const focusInTargetAfterTab = await inTarget();
  return JSON.stringify({
    ...meta, afterEnter, focusInTargetAfterEnter, afterTab, focusInTargetAfterTab,
    works: focusInTargetAfterEnter || focusInTargetAfterTab,
  }, null, 1);
}
