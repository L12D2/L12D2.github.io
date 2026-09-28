// Small enhancements. The page is fully readable without this file.
document.documentElement.classList.add('js');

/* ── 1. Wind streamlines in the hero ─────────────────────────── */
(function flow() {
  const canvas = document.querySelector('.hero__flow');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w, h, dpr, particles, t = 0, running = true;

  // A smooth, slowly-evolving vector field: westerly flow with gentle waves.
  const field = (x, y) => {
    const a = Math.sin(y * 0.004 + t * 0.15) * 0.9
            + Math.cos(x * 0.003 - y * 0.002 + t * 0.1) * 0.6
            + Math.sin((x + y) * 0.0015 + t * 0.05) * 0.4;
    return a * 0.5; // angle offset from due east
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round((w * h) / 2600);
    particles = Array.from({ length: n }, spawn);
    ctx.clearRect(0, 0, w, h);
  }
  function spawn() {
    return { x: Math.random() * w, y: Math.random() * h, age: Math.random() * 120, life: 80 + Math.random() * 140 };
  }
  function step() {
    // Fade previous frame to leave soft trails
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1;
    for (const p of particles) {
      const ang = field(p.x, p.y);
      const nx = p.x + Math.cos(ang) * 1.1;
      const ny = p.y + Math.sin(ang) * 1.1;
      const fade = Math.sin((p.age / p.life) * Math.PI);
      // warmer near the top-right "sun", cooler elsewhere
      const warm = Math.max(0, 1 - Math.hypot(p.x - w * 0.85, p.y - h * 0.1) / (w * 0.7));
      ctx.strokeStyle = warm > 0.3
        ? `rgba(242,184,114,${0.35 * fade})`
        : `rgba(205,225,238,${0.28 * fade})`;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
      p.x = nx; p.y = ny; p.age++;
      if (p.age > p.life || p.x > w + 5 || p.y < -5 || p.y > h + 5) Object.assign(p, spawn(), { x: Math.random() * w * 0.3, age: 0 });
    }
    t += 0.01;
  }
  function loop() { if (running) step(); requestAnimationFrame(loop); }

  resize();
  addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
  if (still) { for (let i = 0; i < 160; i++) step(); return; }   // draw one static frame
  // Pause when the hero is off-screen to save battery
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
