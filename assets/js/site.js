// Small enhancements. The page is fully readable without this file.
document.documentElement.classList.add('js');

/* ── 1. Hero: NOx + VOC plume → ozone, on an MPAS-style mesh ─────
   Smokestacks emit NOx and VOC. The wind carries the plume across a
   hexagonal mesh (like an unstructured model grid). Where sunlight is
   strong, NOx and VOC sharing a cell react to form ozone (O₃).
   Each cell tints by the concentration passing through it.
   Move the mouse up/down over the header to shift the wind.

   Tweak these to change the look ↓                                   */
const PLUME = {
  stacks: [0.07, 0.19, 0.34],     // smokestack positions (fraction of width)
  sun: { x: 0.86, y: 0.16 },      // sun position (fraction of width/height)
  windSpeed: 0.95,                // pixels per frame
  hexSize: 22,                    // mesh cell radius in pixels
  reactionRate: 0.035,            // chance per frame a sunlit NOx+VOC pair reacts
  maxParticles: 750,
  colors: {                       // r, g, b
    NOx: [140, 182, 238],         // sky
    VOC: [157, 212, 49],          // lime
    O3:  [226, 218, 120],         // khaki gold
  },
};

(function plume() {
  const canvas = document.querySelector('.hero__flow');
  if (!canvas) return;
  const hero = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  canvas.style.opacity = '1';     // this effect manages its own transparency

  const SQ3 = Math.sqrt(3), R = PLUME.hexSize, C = PLUME.colors;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  let w, h, dpr, staticLayer, stacks = [], particles = [], flashes = [];
  let cells = new Map(), t = 0, running = true, wind = -0.1, windTarget = -0.1;

  // Deterministic random numbers so the skyline looks the same on every visit
  function seeded(seed) {
    return () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }

  // ── Hex-grid geometry (pointy-top, axial coordinates) ──
  function pixelToHex(x, y) {
    let q = (SQ3 / 3 * x - y / 3) / R, r = (2 / 3 * y) / R, s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return [rq, rr];
  }
  const hexCenter = (q, r) => [R * SQ3 * (q + r / 2), R * 1.5 * r];
  function hexPath(c, cx, cy, size) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      c[i ? 'lineTo' : 'moveTo'](cx + size * Math.cos(a), cy + size * Math.sin(a));
    }
    c.closePath();
  }
  const sunlight = (x, y) => Math.max(0, 1 - Math.hypot(x - w * PLUME.sun.x, (y - h * PLUME.sun.y) * 1.3) / (w * 0.62));

  // ── Things drawn once per resize: mesh, skyline, stacks ──
  function buildStatic() {
    staticLayer = document.createElement('canvas');
    staticLayer.width = w * dpr; staticLayer.height = h * dpr;
    const s = staticLayer.getContext('2d');
    s.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Mesh
    s.strokeStyle = 'rgba(220,215,245,0.06)'; s.lineWidth = 1;
    const rows = Math.ceil(h / (R * 1.5)) + 1, cols = Math.ceil(w / (R * SQ3)) + 2;
    for (let r = -1; r <= rows; r++) for (let c = -1; c <= cols; c++) {
      const [cx, cy] = hexCenter(c - Math.floor(r / 2), r);
      hexPath(s, cx, cy, R); s.stroke();
    }

    // Skyline
    const rand = seeded(7), base = h, sky = [];
    for (let x = -10; x < w + 40;) {
      const bw = 18 + rand() * 46, bh = 18 + rand() * (w < 700 ? 38 : 64);
      sky.push([x, bw, bh]); x += bw + 2 + rand() * 4;
    }
    const grad = s.createLinearGradient(0, base - 90, 0, base);
    grad.addColorStop(0, 'rgba(38,39,18,0.8)'); grad.addColorStop(1, 'rgba(28,29,12,0.97)');
    s.fillStyle = grad;
    for (const [x, bw, bh] of sky) s.fillRect(x, base - bh, bw, bh);
    // lit windows
    s.fillStyle = 'rgba(217,210,124,0.4)';
    for (const [x, bw, bh] of sky) for (let wy = base - bh + 6; wy < base - 6; wy += 8)
      for (let wx = x + 4; wx < x + bw - 4; wx += 7) if (rand() < 0.12) s.fillRect(wx, wy, 2, 3);

    // Smokestacks
    stacks = PLUME.stacks.map(f => ({ x: w * f, top: base - (w < 700 ? 70 : 104) }));
    s.fillStyle = 'rgba(28,29,12,0.97)';
    for (const st of stacks) {
      s.fillRect(st.x - 4, st.top, 8, base - st.top);
      s.fillStyle = 'rgba(140,182,238,0.6)'; s.fillRect(st.x - 4, st.top + 8, 8, 2);
      s.fillStyle = 'rgba(28,29,12,0.97)';
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles = []; flashes = []; cells = new Map();
    buildStatic();
  }

  // ── Emission ──
  function emit() {
    const cap = Math.min(PLUME.maxParticles, Math.round(w * h / 1100));
    if (particles.length >= cap) return;
    for (const st of stacks) {
      if (Math.random() < 0.55) particles.push({
        x: st.x + (Math.random() - 0.5) * 4, y: st.top - 2,
        kind: Math.random() < 0.6 ? 'NOx' : 'VOC', age: 0, life: 700 + Math.random() * 600,
      });
    }
    // Traffic and trees add VOC near street level
    if (Math.random() < 0.35) particles.push({
      x: Math.random() * w * 0.5, y: h - 20 - Math.random() * 30,
      kind: 'VOC', age: 0, life: 600 + Math.random() * 500,
    });
  }

  // ── One simulation step ──
  function step() {
    t += 0.01;
    wind += (windTarget - wind) * 0.02;
    emit();

    const buckets = new Map();
    for (const p of particles) {
      // Wind field: mean flow + gentle waves; buoyant rise near the stack; turbulent mixing grows with age
      const ang = wind + 0.28 * Math.sin(p.y * 0.006 + t * 2) + 0.2 * Math.cos(p.x * 0.004 - t * 1.5);
      const sp = PLUME.windSpeed * (0.85 + 0.25 * Math.sin(p.x * 0.002 + t));
      const rise = 1.1 * Math.exp(-p.age / 45);
      const mix = 0.25 + Math.min(1.1, Math.sqrt(p.age) * 0.05);
      p.x += Math.cos(ang) * sp + (Math.random() - 0.5) * mix;
      p.y += Math.sin(ang) * sp - rise + (Math.random() - 0.5) * mix;
      p.age++;
      if (p.age > p.life || p.x > w + 10 || p.x < -10 || p.y < -10 || p.y > h) { p.dead = true; continue; }

      const [q, r] = pixelToHex(p.x, p.y), key = q * 10000 + r;
      let b = buckets.get(key); if (!b) buckets.set(key, b = { q, r, NOx: [], VOC: [], O3: [] });
      b[p.kind].push(p);
    }

    // Photochemistry: NOx + VOC + sunlight → O₃
    for (const b of buckets.values()) {
      if (!b.NOx.length || !b.VOC.length) continue;
      const [cx, cy] = hexCenter(b.q, b.r), sun = sunlight(cx, cy);
      if (sun < 0.08) continue;
      for (const n of b.NOx) {
        if (!b.VOC.length) break;
        if (Math.random() < PLUME.reactionRate * sun * 2) {
          const v = b.VOC.pop(); v.dead = true;
          n.kind = 'O3'; n.life = n.age + 500 + Math.random() * 400; b.O3.push(n);
          if (flashes.length < 40) flashes.push({ x: n.x, y: n.y, age: 0 });
        }
      }
    }

    // Cell concentrations: decaying average of what passes through
    for (const c of cells.values()) { c.NOx *= 0.95; c.VOC *= 0.95; c.O3 *= 0.95; }
    for (const [key, b] of buckets) {
      let c = cells.get(key); if (!c) cells.set(key, c = { q: b.q, r: b.r, NOx: 0, VOC: 0, O3: 0 });
      c.NOx += b.NOx.length * 0.05; c.VOC += b.VOC.length * 0.05; c.O3 += b.O3.length * 0.05;
    }
    for (const [k, c] of cells) if (c.NOx + c.VOC + c.O3 < 0.01) cells.delete(k);

    particles = particles.filter(p => !p.dead);
    flashes = flashes.filter(f => ++f.age < 28);
  }

  // ── Drawing ──
  function draw() {
    ctx.clearRect(0, 0, w, h);

    // Sun
    const sx = w * PLUME.sun.x, sy = h * PLUME.sun.y;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.45);
    glow.addColorStop(0, 'rgba(236,230,160,0.32)'); glow.addColorStop(0.12, 'rgba(217,210,124,0.15)');
    glow.addColorStop(1, 'rgba(217,210,124,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(240,236,180,0.95)'; ctx.beginPath(); ctx.arc(sx, sy, 16, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(240,236,180,0.2)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(sx, sy, 26 + i * 12 + (t * 20 % 12), 0, 7); ctx.stroke(); }

    // Mesh cells tinted by concentration (colour = dominant species)
    for (const c of cells.values()) {
      const total = c.NOx + c.VOC + c.O3;
      const kind = c.O3 >= c.NOx && c.O3 >= c.VOC ? 'O3' : c.NOx >= c.VOC ? 'NOx' : 'VOC';
      const a = Math.min(0.13, total * 0.05);
      if (a < 0.01) continue;
      const [cx, cy] = hexCenter(c.q, c.r);
      hexPath(ctx, cx, cy, R - 1);
      ctx.fillStyle = rgba(C[kind], a); ctx.fill();
    }

    ctx.drawImage(staticLayer, 0, 0, w, h);

    // Particles
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      const fade = Math.min(1, p.age / 20, (p.life - p.age) / 80);
      ctx.fillStyle = rgba(C[p.kind], (p.kind === 'O3' ? 0.85 : 0.6) * fade);
      const sz = p.kind === 'O3' ? 2.2 : 1.6;
      ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    // Reaction flashes
    for (const f of flashes) {
      ctx.strokeStyle = rgba(C.O3, 0.5 * (1 - f.age / 28));
      ctx.beginPath(); ctx.arc(f.x, f.y, 2 + f.age * 0.35, 0, 7); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Legend
    if (w >= 760) {
      ctx.font = '500 11px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle';
      const parts = [['NOx', C.NOx], [' + ', null], ['VOC', C.VOC], [' + sunlight  →  ', null], ['O₃', C.O3]];
      let x = w - 24 - parts.reduce((s, [txt, col]) => s + ctx.measureText(txt).width + (col ? 12 : 0), 0);
      const y = h - 18;
      for (const [txt, col] of parts) {
        if (col) { ctx.fillStyle = rgba(col, 0.95); ctx.beginPath(); ctx.arc(x + 3, y, 3, 0, 7); ctx.fill(); x += 12; }
        ctx.fillStyle = 'rgba(244,245,234,0.75)'; ctx.fillText(txt, x, y); x += ctx.measureText(txt).width;
      }
    }
  }

  function loop() { if (running) { step(); draw(); } requestAnimationFrame(loop); }

  resize();
  addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
  hero.addEventListener('pointermove', e => {
    const rect = hero.getBoundingClientRect();
    windTarget = ((e.clientY - rect.top) / rect.height - 0.6) * 0.9;   // steer the wind
  });
  hero.addEventListener('pointerleave', () => { windTarget = -0.1; });

  if (still) { for (let i = 0; i < 1400; i++) step(); draw(); return; }  // one still frame
  for (let i = 0; i < 900; i++) step();                                   // start with a developed plume
  new IntersectionObserver(([e]) => { running = e.isIntersecting; }).observe(canvas);
  loop();
})();

/* ── 2. Highlight the current section in the side nav ────────── */
(function scrollSpy() {
  const links = [...document.querySelectorAll('.toc nav a')];
  const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => a.classList.remove('is-active'));
      const a = map.get(e.target.id);
      if (a) { a.classList.add('is-active'); a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    });
  }, { rootMargin: '-35% 0px -60% 0px' });
  document.querySelectorAll('main .section').forEach(s => obs.observe(s));
})();

/* ── 3. Fade sections in as they scroll into view ───────────── */
(function reveal() {
  const els = document.querySelectorAll('.section > *:not(.section__title), .section__title');
  els.forEach(el => el.classList.add('reveal'));
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); obs.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach(el => {
    // Anything already above the fold (e.g. arriving via a #link) shows immediately
    if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in');
    else obs.observe(el);
  });
})();

/* ── 4. Presentation filters + "show all" ───────────────────── */
(function talks() {
  const list = document.querySelector('.talks');
  if (!list) return;
  const items = [...list.children];
  const more = document.querySelector('.show-more');
  const buttons = document.querySelectorAll('.filters button');
  const LIMIT = 8;
  let filter = 'all', expanded = false;

  function render() {
    const matches = items.filter(li =>
      filter === 'all' ? true : filter === 'award' ? li.hasAttribute('data-award') : li.dataset.format === filter);
    items.forEach(li => { li.hidden = true; });
    matches.forEach((li, i) => { li.hidden = !expanded && filter === 'all' && i >= LIMIT; });
    const hiddenCount = filter === 'all' ? Math.max(0, matches.length - LIMIT) : 0;
    more.hidden = expanded || hiddenCount === 0;
    more.textContent = `Show all ${matches.length} presentations`;
  }
  buttons.forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    buttons.forEach(x => x.setAttribute('aria-pressed', x === b));
    render();
  }));
  more.addEventListener('click', () => { expanded = true; render(); });
  render();
})();

/* ── 5. Theme toggle (remembers your choice) ────────────────── */
(function theme() {
  const btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const root = document.documentElement;
    const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
})();

/* ── 6. "Back to top" ───────────────────────────────────────── */
document.querySelector('.to-top')?.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0 }); });
