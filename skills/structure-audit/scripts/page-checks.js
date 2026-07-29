// page-checks.js
async page => JSON.stringify(await page.evaluate(() => {
  const html = document.documentElement;
  const skipLink = Array.from(document.querySelectorAll('a[href^="#"]')).find(a =>
    /skip to|skip navigation|skip main/i.test(a.textContent || '')
  );
  const ids = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
  const seen = new Set(), dupes = new Set();
  ids.forEach(id => { if (seen.has(id)) dupes.add(id); seen.add(id); });
  return {
    lang: html.getAttribute('lang'),
    title: document.title.trim(),
    h1Count: document.querySelectorAll('h1').length,
    duplicateIds: Array.from(dupes),
    hasSkipLink: !!skipLink,
    skipLinkText: skipLink ? skipLink.textContent.trim() : null,
    skipLinkHref: skipLink ? skipLink.getAttribute('href') : null,
  };
}), null, 1)
