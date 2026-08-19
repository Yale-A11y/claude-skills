// crawl.js — same-origin page discovery for `--all-pages`, in ONE run-code call.
//
// Returns a URL list plus counts. It never returns page text, link labels, or titles:
// discovered URLs are navigated to and nothing else, so there is nothing here that could
// carry an instruction. Cross-origin links are dropped outright, which is what bounds the
// one place in this suite where page content influences behavior at all.
//
// NOTE: this file is evaluated as a SINGLE EXPRESSION — the arrow function below is the
// whole module. Declaring anything at top level fails with "SyntaxError: Unexpected token
// 'const'". Keep all helpers and constants inside the function body.
//
// NOTE: the outer function runs in a sandbox WITHOUT Node globals — `new URL(...)` here
// throws "ReferenceError: URL is not defined". All URL parsing therefore happens inside
// page.evaluate (the browser has URL); this scope only does string and Set bookkeeping.
//
// `run-code` cannot pass arguments, so the caps below are the script's own hard ceilings.
// They are deliberately generous; the router truncates the returned list to the user's
// --max-pages. These exist to bound wall-clock and to stop infinite URL spaces, not to
// express user intent.
async page => {
  const MAX_VISITS = 40;   // pages actually navigated during the BFS
  const MAX_DEPTH = 2;     // link hops from the start page
  const SHAPE_CAP = 3;     // max URLs sharing one path shape — the calendar/pagination guard
  const MAX_RETURN = 100;
  const GOTO_TIMEOUT = 15000;

  const skipped = {
    offsite: 0, query: 0, extension: 0, excludedPath: 0,
    robotsDisallow: 0, shapeCap: 0, unreachable: 0,
  };

  // Runs in the browser: resolves every href against the current origin and applies the
  // filters that need real URL parsing. Returns {url, path} pairs plus per-call skip counts.
  // Must not close over anything out here — Playwright serializes it.
  // Takes a single packed argument — page.evaluate passes exactly one.
  const sift = ([hrefs, disallows]) => {
    // Paths that mutate state, end a session, or are never user-facing HTML. A crawler that
    // follows /logout ends its own session partway through the run.
    const EXCLUDED = /(^|\/)(logout|log-out|signout|sign-out|login|sign-in|signin|register|admin|wp-admin|wp-login|api|graphql|cart|checkout|delete|edit|new|preview|feed|rss)(\/|$)/i;
    const BAD_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|gz|tar|mp4|webm|mp3|wav|doc|docx|xls|xlsx|ppt|pptx|css|js|json|xml|txt|rss)$/i;
    const out = [];
    const skip = { offsite: 0, query: 0, extension: 0, excludedPath: 0, robotsDisallow: 0 };
    for (const href of hrefs) {
      let u;
      try {
        u = new URL(href, location.origin);
      } catch {
        skip.offsite++;
        continue;
      }
      if (u.origin !== location.origin) { skip.offsite++; continue; }
      // Query strings are an infinite space (?page=, ?date=, tracking params) and rarely a
      // distinct page for accessibility purposes.
      if (u.search) { skip.query++; continue; }
      u.hash = '';
      // A trailing slash is not a distinct page; without this every link appears twice.
      if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
      if (BAD_EXT.test(u.pathname)) { skip.extension++; continue; }
      if (EXCLUDED.test(u.pathname)) { skip.excludedPath++; continue; }
      if (disallows.some(d => u.pathname.startsWith(d))) { skip.robotsDisallow++; continue; }
      out.push({ url: u.toString(), path: u.pathname });
    }
    return { out, skip };
  };

  const tally = skip => {
    for (const k of Object.keys(skip)) skipped[k] += skip[k];
  };

  // Same-origin fetches from the page context: cheaper and more reliable than navigating,
  // and both files are plain text with no scripting.
  const ctx = await page.evaluate(async () => {
    const get = async p => {
      try {
        const r = await fetch(p, { redirect: 'follow' });
        return r.ok ? (await r.text()).slice(0, 400000) : null;
      } catch {
        return null;
      }
    };
    return {
      origin: location.origin,
      start: location.origin + (location.pathname.length > 1 && location.pathname.endsWith('/')
        ? location.pathname.slice(0, -1)
        : location.pathname),
      startPath: location.pathname,
      robots: await get('/robots.txt'),
      sitemap: await get('/sitemap.xml'),
    };
  });

  // ---- robots.txt: honor Disallow for the catch-all agent ----
  const disallows = [];
  if (ctx.robots) {
    let inStar = false;
    for (const raw of ctx.robots.split('\n')) {
      const line = raw.replace(/#.*/, '').trim();
      if (!line) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key === 'user-agent') inStar = value === '*';
      else if (key === 'disallow' && inStar && value) disallows.push(value);
    }
  }

  // A path's "shape": the template it is likely rendered by. SHAPE_CAP then keeps a few
  // representatives per shape and drops the rest, which is the whole anti-trap mechanism.
  //
  // Two collapses, and the second matters more than the first:
  //   1. numeric/date segments — /calendar/2026/08/13 vs /calendar/2026/08/14 (calendars,
  //      pagination, id-keyed archives).
  //   2. the LAST segment of any path two or more levels deep — /people/students/le-liu and
  //      /people/students/mi-chen are one template with different content. Without this a
  //      crawl of a directory-shaped site returns nothing but person pages: measured on a
  //      real site, 87 of 100 returned URLs were individual profiles and the crawl never
  //      reached /apply or /news. Slugs are not numeric, so rule 1 alone does not catch them.
  //
  // Single-segment paths are never collapsed: /about, /apply, /news are genuinely distinct
  // templates and all of them should be audited.
  const shapeOf = path => {
    const segs = path.split('/').map(seg => {
      if (/^\d+$/.test(seg)) return '#num';
      if (/^\d{4}-\d{2}(-\d{2})?$/.test(seg)) return '#date';
      return seg.toLowerCase();
    });
    // segs[0] is '' for a leading slash, so a path like /people/students/le-liu is length 4.
    if (segs.length >= 3) segs[segs.length - 1] = '*';
    return segs.join('/');
  };

  const seen = new Set();
  const shapeCounts = {};

  // Dedupe + shape cap. Everything needing URL parsing already happened in sift().
  const admit = ({ url, path }) => {
    if (seen.has(url)) return false;
    const shape = shapeOf(path);
    if ((shapeCounts[shape] || 0) >= SHAPE_CAP) { skipped.shapeCap++; return false; }
    seen.add(url);
    shapeCounts[shape] = (shapeCounts[shape] || 0) + 1;
    return true;
  };

  // The start page is always first and always kept, whatever the filters say about it.
  seen.add(ctx.start);
  shapeCounts[shapeOf(ctx.startPath)] = 1;
  const pages = [ctx.start];

  // ---- sitemap route: authoritative and one fetch, so prefer it ----
  const sitemapHrefs = [];
  if (ctx.sitemap && /<urlset|<sitemapindex/i.test(ctx.sitemap)) {
    for (const m of ctx.sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) sitemapHrefs.push(m[1]);
  }

  if (sitemapHrefs.length) {
    const { out, skip } = await page.evaluate(sift, [sitemapHrefs, disallows]);
    tally(skip);
    for (const entry of out) {
      if (pages.length >= MAX_RETURN) break;
      if (admit(entry)) pages.push(entry.url);
    }
    return JSON.stringify({
      origin: ctx.origin, source: 'sitemap', pages,
      discovered: sitemapHrefs.length, visited: 0, returned: pages.length,
      capped: pages.length >= MAX_RETURN, skipped,
    }, null, 1);
  }

  // ---- link-crawl fallback: BFS, navigating each page to catch client-rendered nav ----
  const queue = [{ url: pages[0], depth: 0 }];
  let visited = 0;
  let discovered = 0;

  while (queue.length && visited < MAX_VISITS && pages.length < MAX_RETURN) {
    const { url, depth } = queue.shift();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT });
    } catch {
      skipped.unreachable++;
      continue;
    }
    visited++;
    if (depth >= MAX_DEPTH) continue;

    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'), a => a.href)
    );
    discovered += hrefs.length;
    const { out, skip } = await page.evaluate(sift, [hrefs, disallows]);
    tally(skip);
    for (const entry of out) {
      if (pages.length >= MAX_RETURN) break;
      if (!admit(entry)) continue;
      pages.push(entry.url);
      queue.push({ url: entry.url, depth: depth + 1 });
    }
  }

  return JSON.stringify({
    origin: ctx.origin, source: 'links', pages,
    discovered, visited, returned: pages.length,
    capped: pages.length >= MAX_RETURN || visited >= MAX_VISITS,
    skipped,
  }, null, 1);
}
