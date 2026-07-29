// color-contrast.js
async page => JSON.stringify(await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  function toRgbArray(str) {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000000'; // reset so a rejected/invalid value can't leak the previous color
    ctx.fillStyle = str;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3]]; // alpha is 0-255 here, not 0-1
  }
  function luminance([r, g, b]) {
    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrastRatio(fg, bg) {
    const l1 = luminance(fg) + 0.05, l2 = luminance(bg) + 0.05;
    return l1 > l2 ? l1 / l2 : l2 / l1;
  }
  function effectiveBg(el) {
    let node = el;
    while (node) {
      const bgStr = getComputedStyle(node).backgroundColor;
      const [, , , a] = toRgbArray(bgStr);
      if (a > 2) return bgStr; // meaningfully opaque, not just a rounding artifact of transparent
      node = node.parentElement;
    }
    return 'rgb(255, 255, 255)';
  }
  const textEls = Array.from(document.querySelectorAll('body *')).filter(el =>
    el.children.length === 0 &&
    el.textContent.trim().length > 0 &&
    getComputedStyle(el).visibility !== 'hidden' &&
    el.offsetParent !== null
  );
  const sampled = textEls.slice(0, 800);
  const failures = sampled.map(el => {
    const style = getComputedStyle(el);
    const fg = toRgbArray(style.color);
    const bgStr = effectiveBg(el);
    const bg = toRgbArray(bgStr);
    const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
    const fontSize = parseFloat(style.fontSize);
    const bold = parseInt(style.fontWeight, 10) >= 700;
    const isLarge = fontSize >= 24 || (fontSize >= 18.66 && bold);
    const threshold = isLarge ? 3 : 4.5;
    return { text: el.textContent.trim().slice(0, 40), tag: el.tagName, ratio, threshold, isLarge, pass: ratio >= threshold, color: style.color, bg: bgStr };
  }).filter(r => !r.pass);
  return { sampledCount: sampled.length, totalTextNodes: textEls.length, failures };
}), null, 1)
