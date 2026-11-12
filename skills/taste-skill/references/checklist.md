# Pre-Ship Checklist & Chrome DevTools MCP Audit

Each checklist item names its checks: `consistency.mjs` IDs in brackets, `check.mjs` findings in braces, `perf.mjs` / Chrome DevTools MCP checks in prose. The final item is for visual inspection.

## Checklist

- **First screen:** says what is sold, for whom or where, with one hard fact `[copy-headline, copy-fact]`; the hero fills it alone at every width, its main button inside it `[hero-screen, hero-fill, fold-action, fold-cut]` `{hero-fold}`.
- **One section per screen:** every section 1 or 2 screens, its h2 first and top-aligned, no neighbour's heading or picture in its tile, nothing sparse, no section half empty `[section-height, one-section, one-heading, section-air, one-screen, section-gaps, empty-area]` `{screen-short, screen-height, sparse, neighbour, neighbour-ground}`.
- **Equal edges:** every block on the `.wrap` lines or the grid's columns, nothing out to one side, no sideways scroll `[container-edges, row-lines, split-pair, off-grid, right-edge, col-edge, spill, off-viewport, stagger, top-stagger]` `{edge-left, edge-right, spill, bleed-one-side, one-sided, lines}`.
- **Every visual draws** at 1440, 1024, 768 and 390; a refused effect shows its still fallback `[visual-empty, empty-visual, gl-fallback, shader-lint, no-visual, photo-weight]`.
- **No caption** explains, apologises for or labels a picture; credits in one footer line `[visual-caption, caption, credit-wall, photo-credit]`; no placeholder, sample note or printed `.example` address `[placeholder, sample-label]`.
- **The right things for the kind:** outside tech no effect ground, print or scene, only the dealt photo- or type-led moments (WebGL only for a product render the brief asked for) `[effect-kind, effects-fit, photo-print]`; the subject itself shows: the product big, whole in three sections at most, a new picture each `[product-shown, same-object, photo-repeat]`; each asset the brief names in its slot; a game's name and its world as key art, the diff of a code-review tool, software's `app-frame`; real photographs where they fit, none twice `[photo-set, photo-repeat, photo-upscale]`; real icons in their own colours; flat grounds on other `[grounds]`; a place deals two different compositions and one type moment.
- **Motion:** every button, link, linked card and linked photograph visibly answers the pointer, nothing tilts `[motion-layer, hover, hover-move, tilt]`; the hero enters once on load `[hero-enter]`; one or two dealt moments `[moment-none]`; card loops cycle in 2.5-4 s `[loop-cycle]`; nothing moves because the page scrolled except a dealt moment inside its own section (every kind) or the big scene (tech) `[scroll-linked, scroll-reveal, pinned]` (expected only there); anything moving past 5 s has a pause button `[loop-pause]`; under reduced motion everything rests and nothing stays hidden `[reduced-motion, hidden-content]`; at most four live contexts `[webgl]`.
- **Contacts** as house rule 9 `[street-number, postcode, coordinates, company-number, phone-number]`; Get directions only with a street, "See the area" with a district, no map link with a town only `[map-link]`.
- **Keyboard and head:** every control named, alt on pictures, labels you can see, headings one level at a time, no tabindex above 0; Tab reaches the skip link first, its ring shows at once and never under the header; the menu button says its state; lang, title, description and share tags `[a11y-name, img-alt, field-label, heading-order, tabindex, skip-link, focus-ring, focus-visible, focus-hidden, menu-toggle, lang, page-meta, share-meta]`.
- **One system:** one button pair, one card style, one radius scale, one link look `[button-styles, button-shape, card-family, card-layout, link-styles]`; two boxes deep at most `[nesting]`; one heading scale, its faces loaded `[heading-scale, font-load]`; text contrast `[text-contrast, contrast]`.
- **Copy and links:** headings name things, buttons a verb and an object, at most two hero actions `[copy-headings, copy-buttons, copy-actions, action-count]`; one action twice a screen at most `[action-repeat]`; a heading's grey half is its own sentence `[run-on]`; one fact, one wording `[fact-agree]`; assumed facts marked, never an open-now line from them `[assumed, open-now]`; every link lands, forms send, a confirmation only after a real send, each error under its own field `[links, forms, form-send, form-fields]`; no slop word, stock line, leftover or device used as a tic, a voice of its own (`copy-lint` IDs: `copy-residue`, `copy-slop-word`, `copy-stock-phrase`, `copy-two-fragment`, `copy-virtue`; `copy-voice.md`).
- **Fast:** no FAIL row in `perf.mjs` or Chrome DevTools MCP runtime/LCP checks (image weight, contexts, layout shift).
- **820, 768, 390 and 320:** sections on their screens `[section-height]`; on a phone a section is at least its screens and grows with what it holds, so nothing lies on anything else or under a fixed bar `[collide]`; every link and control outside running text 44px tall `[tap-size]` (a FAIL when another target is under 8px away); nothing past the screen at 320 `[off-viewport]`, and nothing lies on anything else there either `[collide]`; the first screen ending whole or on a clear bleed `[fold-card]` (`layout-v4.md`); splits stack text first, no row half empty; one column at 390, buttons full width, a full-screen menu; the place action bar.
- **Your eyes:** beside the figma.com and x.ai frames it reads as a professional company site; nothing tilted, staggered, cut or overlapping; the hero is the work, not a mood.

## Fix-Hint Mapping

| Area | Check IDs / Findings | Typical Fix |
|---|---|---|
| Hero & fold | `hero-screen`, `hero-fill`, `fold-action`, `fold-cut`, `fold-card`, `{hero-fold}` | Keep hero `100svh`, buttons above fold, and picture ending inside `H - 24` or cleanly bleeding. |
| Screen box | `section-height`, `one-section`, `empty-area`, `{screen-short, screen-height, sparse, neighbour}` | Set `--h: 1` or `2` (`100svh`), merge short blocks into the section above, or split into `.g2`. |
| Edges & overflow | `container-edges`, `off-grid`, `spill`, `off-viewport`, `{edge-left, edge-right, bleed-one-side, lines}` | Align blocks to `.wrap` and the 12-column lines; remove sideways overflow down to 320px. |
| Visuals & WebGL | `empty-visual`, `gl-fallback`, `webgl`, `photo-upscale`, `photo-repeat` | Supply real `src` + `width`/`height`, reuse no photo twice, cap live WebGL contexts at 4, keep still fallback. |
| Motion & a11y | `hover-move`, `scroll-reveal`, `reduced-motion`, `focus-ring`, `tap-size`, `contrast` | Use `assets/motion`, remove scroll fades on cards, ensure 44x44px tap targets and visible focus rings. |
| Copy & wiring | `copy-headline`, `copy-fact`, `copy-buttons`, `copy-slop-word`, `links`, `forms` | Rewrite h1 to name category + buyer/place, add first-screen hard fact, remove slop, wire form sends. |

## Chrome DevTools MCP Runtime Audit (`AUDIT`)

Serve the page over local HTTP (`http://127.0.0.1:<port>/`, never `file://`), navigate with `navigate_page`, and run this guarded `evaluate_script` function (pass it unwrapped as `async () => { ... }`; `window.__perf` defaults safely when `perf.mjs` is not injecting probes):

```js
async () => {
  const sy = scrollY, out = { imgs: [], fonts: [], mountedFx: [], declaredFx: [], dom: document.getElementsByTagName('*').length };
  const size = u => new Promise(res => { const i = new Image(); const t = setTimeout(() => res(null), 4000); i.onload = () => { clearTimeout(t); res([i.naturalWidth, i.naturalHeight]); }; i.onerror = () => { clearTimeout(t); res(null); }; i.src = u; });
  const liveImgs = [...document.querySelectorAll('img')], srcLazy = new Map();
  try {
    const html = await (await fetch(location.href)).text();
    const srcImgs = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('img')];
    const same = srcImgs.length === liveImgs.length && srcImgs.every((x, i) => x.getAttribute('src') === liveImgs[i].getAttribute('src'));
    if (same) srcImgs.forEach((x, i) => srcLazy.set(liveImgs[i], x.getAttribute('loading') === 'lazy'));
    else liveImgs.forEach(im => { const k = im.getAttribute('src'); if (k != null && srcImgs.some(x => x.getAttribute('src') === k && x.getAttribute('loading') === 'lazy')) srcLazy.set(im, true); });
  } catch (e) { /* no source to read: the live attribute counts */ }
  liveImgs.forEach(im => {
    const r = im.getBoundingClientRect();
    out.imgs.push({ kind: 'img', src: (im.currentSrc || im.src || '').slice(-80), top: Math.round(r.top + sy), w: Math.round(r.width), h: Math.round(r.height), nw: im.naturalWidth, nh: im.naturalHeight,
      hasWH: im.hasAttribute('width') && im.hasAttribute('height'), lazy: im.loading === 'lazy' || srcLazy.get(im) === true, lazySwapped: im.loading !== 'lazy' && srcLazy.get(im) === true, visible: r.width > 0 && r.height > 0,
      sized: getComputedStyle(im).aspectRatio !== 'auto' });
  });
  const extra = [];
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.width < 40 || r.height < 40) return;
    if (el instanceof SVGImageElement) { const u = el.href && el.href.baseVal; if (u && !/^data:/.test(u)) extra.push({ kind: 'svg', u: new URL(u, location.href).href, el, r }); return; }
    const bg = getComputedStyle(el).backgroundImage; if (!bg || bg === 'none') return;
    for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) if (!/^data:/.test(m[1])) extra.push({ kind: 'bg', u: new URL(m[1], location.href).href, el, r });
  });
  for (const x of extra.slice(0, 40)) {
    const nat = await size(x.u);
    out.imgs.push({ kind: x.kind, src: x.u.slice(-80), top: Math.round(x.r.top + sy), w: Math.round(x.r.width), h: Math.round(x.r.height), nw: nat ? nat[0] : 0, nh: nat ? nat[1] : 0,
      hasWH: true, lazy: false, visible: true, sized: true });
  }
  document.fonts.forEach(f => { if (f.status === 'loaded') out.fonts.push(f.family.replace(/["']/g, '') + '|' + f.weight + '|' + f.style); });
  const P = window.__perf || { ever: [], glCreated: 0, canvases: 0 }, ever = P.ever || [];
  ever.forEach(e => out.mountedFx.push(e.getAttribute('data-fx-mounted') || e.getAttribute('data-fx') || e.getAttribute('data-glow')));
  document.querySelectorAll('[data-fx]:not([data-glow])').forEach(e => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return; out.declaredFx.push([e.getAttribute('data-fx'),
    ever.includes(e) || e.hasAttribute('data-fx-mounted') || !!e.querySelector('canvas,[data-fx-mounted]') || e.hasAttribute('data-fx-fallback')]); });
  out.tokens = [...new Set([...document.querySelectorAll('*')].flatMap(e => [...e.classList, ...[...e.attributes].filter(a => /^data-/.test(a.name) && a.value.length < 40).map(a => a.value)]))];
  out.hosts = document.querySelectorAll('canvas').length + document.querySelectorAll('[data-fx-fallback]').length;
  out.glMade = P.glCreated; out.canvasesMade = P.canvases;
  out.docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  out.overflowX = document.documentElement.scrollWidth > innerWidth + 1;
  return out;
}
```

## Layout Check & `share.jpg` Capture via Chrome DevTools MCP

1. **Inject `layout-check.js`**: Read `assets/layout/layout-check.js` and run it via `evaluate_script` with `format: "script"` and `; 0` appended (`<layout-check.js source>\n; 0`) so `window.lyCheck` is registered in the page.
2. **Evaluate viewports**: Resize with `resize_page` across `1440x900`, `1024x768`, `820x1180`, `768x1024`, and `390x844`, and call `evaluate_script` with `() => window.lyCheck()` at each size. Every finding fails the page.
3. **Capture `share.jpg`**: At `1440x900` with `scrollY = 0` (`window.scrollTo(0, 0)`), call `take_screenshot` with `format: "jpeg"` and save beside `index.html` as `share.jpg`.
