// Small enhancements. The page is fully readable without this file.
document.documentElement.classList.add('js');

/* ── 1. Hero: NOx + VOC plume → ozone, on an MPAS-style mesh ─────
   Smokestacks and cars emit NOx and VOC. The wind carries the plume
   across a hexagonal mesh (like an unstructured model grid), mixing
   it up to the top of the boundary layer. Where sunlight is strong,
   NOx and VOC sharing a cell react to form ozone (O₃).
   Each cell tints by the concentration passing through it.
   Move the mouse up/down over the header to shift the wind.

   Tweak these to change the look ↓                                   */
const PLUME = {
  stacks: [0.07, 0.19, 0.34],     // smokestack positions (fraction of width)
  sun: { x: 0.6, y: 0.13 },       // sun position (fraction of width/height)
  // The boundary-layer top is the black line above the stats (.hero__stats)
  windSpeed: 0.95,                // pixels per frame
  hexSize: 13,                    // mesh cell radius in pixels (smaller = finer mesh)
  meshLine: 1.4,                  // mesh line thickness
  particleSize: 2.8,              // NOx / VOC dot size (O₃ is a bit bigger)
  cars: 1 / 150,                  // cars per pixel of width
  reactionRate: 0.035,            // chance per frame a sunlit NOx+VOC pair reacts
  maxParticles: 900,
  colors: {                       // r, g, b
    NOx:  [122, 62, 28],          // brown (NO₂ is a brown gas)
    VOC:  [78, 138, 16],          // leaf green (many VOCs come from trees)
    O3:   [232, 140, 0],          // amber
    cellNOx: [255, 150, 90],      // brighter versions used to fill the mesh cells
    cellVOC: [170, 235, 60],
    cellO3:  [255, 214, 40],
    city: [159, 93, 53],          // rust #9F5D35
  },
};

(function plume() {
  const canvas = document.querySelector('.hero__flow');
  if (!canvas) return;
  const hero = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SQ3 = Math.sqrt(3), R = PLUME.hexSize, C = PLUME.colors;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const shade = (c, k) => c.map(v => Math.round(v * k));
  const ROAD = 14;                                   // road height in pixels
  let w, h, dpr, staticLayer, blTop, stacks = [], cars = [], particles = [], flashes = [];
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
  const sunlight = (x, y) => Math.max(0, 1 - Math.hypot(x - w * PLUME.sun.x, (y - h * PLUME.sun.y) * 1.2) / (w * 0.6));

  // ── Things drawn once per resize: mesh, skyline, stacks, road ──
  function buildStatic() {
    staticLayer = document.createElement('canvas');
    staticLayer.width = w * dpr; staticLayer.height = h * dpr;
    const s = staticLayer.getContext('2d');
    s.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Mesh
    s.strokeStyle = 'rgba(255,255,255,0.22)'; s.lineWidth = PLUME.meshLine;
    const rows = Math.ceil(h / (R * 1.5)) + 1, cols = Math.ceil(w / (R * SQ3)) + 2;
    for (let r = -1; r <= rows; r++) for (let c = -1; c <= cols; c++) {
      const [cx, cy] = hexCenter(c - Math.floor(r / 2), r);
      hexPath(s, cx, cy, R); s.stroke();
    }

    // Skyline (rust)
    const rand = seeded(7), base = h - ROAD, sky = [];
    for (let x = -10; x < w + 40;) {
      const bw = 18 + rand() * 46, bh = 18 + rand() * (w < 700 ? 38 : 64);
      sky.push([x, bw, bh]); x += bw + 2 + rand() * 4;
    }
    sky.forEach(([x, bw, bh], i) => {
      s.fillStyle = rgba(shade(C.city, i % 3 === 0 ? 0.82 : i % 3 === 1 ? 1 : 0.92), 1);
      s.fillRect(x, base - bh, bw, bh);
    });
    s.fillStyle = 'rgba(255,240,215,0.55)';                       // windows
    for (const [x, bw, bh] of sky) for (let wy = base - bh + 6; wy < base - 6; wy += 8)
      for (let wx = x + 4; wx < x + bw - 4; wx += 7) if (rand() < 0.22) s.fillRect(wx, wy, 2, 3);

    // Smokestacks
    stacks = PLUME.stacks.map(f => ({ x: w * f, top: base - (w < 700 ? 74 : 110) }));
    for (const st of stacks) {
      s.fillStyle = rgba(shade(C.city, 0.62), 1); s.fillRect(st.x - 5, st.top, 10, base - st.top);
      s.fillStyle = 'rgba(255,255,255,0.75)'; s.fillRect(st.x - 5, st.top + 10, 10, 3);
    }

    // Road with lane markings
    s.fillStyle = '#3a3533'; s.fillRect(0, base, w, ROAD);
    s.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = 0; x < w; x += 22) s.fillRect(x, base + ROAD / 2 - 0.5, 11, 1);
  }

  // Boundary-layer top = the black line above the stats
  function measureBoundaryLayer() {
    const stats = hero.querySelector('.hero__stats');
    blTop = stats ? stats.getBoundingClientRect().top - canvas.getBoundingClientRect().top : h * 0.3;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measureBoundaryLayer();
    particles = []; flashes = []; cells = new Map();
    const palette = ['#ffffff', '#111111', '#9DD431', '#2b6577', '#e8e2d6', '#c0392b'];
    cars = Array.from({ length: Math.max(3, Math.round(w * PLUME.cars)) }, (_, i) => {
      const dir = i % 2 ? -1 : 1;
      return { x: Math.random() * w, dir, speed: 0.7 + Math.random() * 0.8,
               y: h - ROAD + (dir > 0 ? ROAD * 0.72 : ROAD * 0.28), color: palette[i % palette.length] };
    });
    buildStatic();
  }

  // ── Emission ──
  const cap = () => Math.min(PLUME.maxParticles, Math.round(w * h / 900));
  function emit() {
    if (particles.length >= cap()) return;
    for (const st of stacks) {
      if (Math.random() < 0.55) particles.push({
        x: st.x + (Math.random() - 0.5) * 5, y: st.top - 2, rise: 1.6,
        kind: Math.random() < 0.6 ? 'NOx' : 'VOC', age: 0, life: 800 + Math.random() * 700,
      });
    }
    // Traffic: tailpipe NOx, plus some VOC
    for (const car of cars) {
      if (Math.random() < 0.05) particles.push({
        x: car.x - car.dir * 9, y: car.y - 2, rise: 0.5,
        kind: Math.random() < 0.7 ? 'NOx' : 'VOC', age: 0, life: 700 + Math.random() * 600,
      });
    }
  }

  // ── One simulation step ──
  function step() {
    t += 0.01;
    wind += (windTarget - wind) * 0.02;
    for (const car of cars) {
      car.x += car.dir * car.speed;
      if (car.x > w + 20) car.x = -20; else if (car.x < -20) car.x = w + 20;
    }
    emit();

    const buckets = new Map();
    for (const p of particles) {
      // Wind field: mean flow + gentle waves; buoyant rise near the source;
      // turbulent mixing grows with age and fills the boundary layer
      const ang = wind + 0.28 * Math.sin(p.y * 0.006 + t * 2) + 0.2 * Math.cos(p.x * 0.004 - t * 1.5);
      const sp = PLUME.windSpeed * (0.85 + 0.25 * Math.sin(p.x * 0.002 + t));
      const rise = p.rise * Math.exp(-p.age / 60);
      const mix = 0.3 + Math.min(1.4, Math.sqrt(p.age) * 0.065);
      p.x += Math.cos(ang) * sp + (Math.random() - 0.5) * mix;
      p.y += Math.sin(ang) * sp * 0.6 - rise + (Math.random() - 0.5) * mix * 1.6;
      // The boundary-layer top acts like a lid: reflect particles back down
      if (p.y < blTop) p.y = blTop + (blTop - p.y);
      if (p.y > h - ROAD - 2) p.y = h - ROAD - 2 - Math.random() * 3;
      p.age++;
      if (p.age > p.life || p.x > w + 10 || p.x < -10) { p.dead = true; continue; }

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
        if (Math.random() < PLUME.reactionRate * sun * 3) {
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
      c.NOx += b.NOx.length * 0.08; c.VOC += b.VOC.length * 0.08; c.O3 += b.O3.length * 0.08;
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
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.42);
    glow.addColorStop(0, 'rgba(255,252,230,0.75)'); glow.addColorStop(0.1, 'rgba(255,248,215,0.35)');
    glow.addColorStop(1, 'rgba(255,248,215,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(sx, sy, 20, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(sx, sy, 30 + i * 13 + (t * 20 % 13), 0, 7); ctx.stroke(); }

    // Mesh cells tinted by concentration (colour = dominant species)
    for (const c of cells.values()) {
      const total = c.NOx + c.VOC + c.O3;
      const kind = c.O3 >= c.NOx && c.O3 >= c.VOC ? 'O3' : c.NOx >= c.VOC ? 'NOx' : 'VOC';
      const a = Math.min(0.42, total * 0.12);
      if (a < 0.01) continue;
      const [cx, cy] = hexCenter(c.q, c.r);
      hexPath(ctx, cx, cy, R - 0.5);
      ctx.fillStyle = rgba(C['cell' + kind], a); ctx.fill();
    }

    ctx.drawImage(staticLayer, 0, 0, w, h);


    // Cars
    for (const car of cars) {
      const x = car.x, y = car.y;
      ctx.fillStyle = car.color;
      ctx.beginPath(); ctx.roundRect(x - 8, y - 5, 16, 5, 1.5); ctx.fill();
      ctx.beginPath(); ctx.roundRect(x - 4 - car.dir, y - 8, 9, 4, 1.5); ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillRect(x - 6, y - 0.5, 3, 1.5); ctx.fillRect(x + 3, y - 0.5, 3, 1.5);
      ctx.fillStyle = 'rgba(255,236,150,0.95)'; ctx.fillRect(x + car.dir * 7 - 0.5, y - 4, 1.5, 1.5);
    }

    // Particles
    for (const p of particles) {
      const fade = Math.min(1, p.age / 15, (p.life - p.age) / 80);
      ctx.fillStyle = rgba(C[p.kind], (p.kind === 'O3' ? 0.95 : 0.75) * fade);
      const sz = PLUME.particleSize * (p.kind === 'O3' ? 1.25 : 1);
      ctx.beginPath(); ctx.arc(p.x, p.y, sz / 2, 0, 7); ctx.fill();
    }
    // Reaction flashes
    ctx.lineWidth = 1.2;
    for (const f of flashes) {
      ctx.strokeStyle = rgba(C.O3, 0.7 * (1 - f.age / 28));
      ctx.beginPath(); ctx.arc(f.x, f.y, 2 + f.age * 0.4, 0, 7); ctx.stroke();
    }

    // Legend
    if (w >= 760) {
      ctx.font = '600 11px Sora, system-ui, sans-serif'; ctx.textBaseline = 'middle';
      const parts = [['NOx', C.NOx], [' + ', null], ['VOC', C.VOC], [' + sunlight  →  ', null], ['O₃', C.O3]];
      const width = parts.reduce((s, [txt, col]) => s + ctx.measureText(txt).width + (col ? 12 : 0), 0);
      let x = w - 24 - width;
      const y = 26;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.roundRect(x - 10, y - 11, width + 20, 22, 11); ctx.fill();
      for (const [txt, col] of parts) {
        if (col) { ctx.fillStyle = rgba(col, 1); ctx.beginPath(); ctx.arc(x + 3, y, 3.5, 0, 7); ctx.fill(); x += 12; }
        ctx.fillStyle = '#111'; ctx.fillText(txt, x, y); x += ctx.measureText(txt).width;
      }
    }
  }

  function loop() { if (running) { step(); draw(); } requestAnimationFrame(loop); }

  resize();
  addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
  document.fonts?.ready.then(measureBoundaryLayer);   // the line can move once the font loads
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

/* ── 6. "Back to top" ───────────────────────────────────────── */
document.querySelector('.to-top')?.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0 }); });
