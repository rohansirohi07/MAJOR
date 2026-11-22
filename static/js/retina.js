/* Hero animation: a retina whose blood vessels grow outward from the optic disc,
   with a scanning lens that follows the pointer (or wanders on its own). */
(function () {
  const canvas = document.getElementById('retina');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W, H, DPR, cx, cy, R, ox, oy, base, vessels = [], t0 = performance.now();
  const mouse = { x: -1, y: -1, active: false };

  function rng(seed) { // mulberry32
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function grow(rand, x, y, angle, steps, width, depth, delay, out, vein) {
    const pts = [[x, y]];
    let a = angle, bias = (rand() - 0.5) * 0.05, w = width;
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.22 + bias;
      x += Math.cos(a) * 7; y += Math.sin(a) * 7;
      pts.push([x, y]);
      if (depth < 4 && i > 8 && rand() < 0.07) {
        const side = rand() < 0.5 ? -1 : 1;
        grow(rand, x, y, a + side * (0.5 + rand() * 0.5), Math.floor(steps * (0.45 + rand() * 0.3)),
          w * 0.62, depth + 1, delay + i * 0.035, out, vein);
      }
    }
    out.push({ pts, w, delay, vein });
  }

  function build() {
    const rand = rng(7);
    vessels = [];
    const dirs = [-2.35, -1.1, 1.15, 2.4, -2.9, 2.95];
    dirs.forEach((d, i) => {
      grow(rand, ox, oy, d + (rand() - 0.5) * 0.2, 70 + Math.floor(rand() * 20),
        i < 4 ? 7 : 5, 0, i * 0.15, vessels, i % 2 === 1);
    });
  }

  function paintBase() {
    base = document.createElement('canvas');
    base.width = W * DPR; base.height = H * DPR;
    const b = base.getContext('2d');
    b.scale(DPR, DPR);
    const g = b.createRadialGradient(cx - R * 0.15, cy, R * 0.05, cx, cy, R);
    g.addColorStop(0, '#f08a3a'); g.addColorStop(0.55, '#c8431f'); g.addColorStop(0.9, '#6b160f'); g.addColorStop(1, '#2a0a10');
    b.fillStyle = g; b.beginPath(); b.arc(cx, cy, R, 0, 7); b.fill();
    // macula
    const m = b.createRadialGradient(cx + R * 0.18, cy + R * 0.02, 2, cx + R * 0.18, cy + R * 0.02, R * 0.16);
    m.addColorStop(0, 'rgba(90,20,10,.7)'); m.addColorStop(1, 'rgba(90,20,10,0)');
    b.fillStyle = m; b.beginPath(); b.arc(cx + R * 0.18, cy + R * 0.02, R * 0.16, 0, 7); b.fill();
    // optic disc
    const d = b.createRadialGradient(ox, oy, 2, ox, oy, R * 0.12);
    d.addColorStop(0, '#fff2c9'); d.addColorStop(0.6, '#ffc66b'); d.addColorStop(1, 'rgba(255,170,80,0)');
    b.fillStyle = d; b.beginPath(); b.arc(ox, oy, R * 0.12, 0, 7); b.fill();
    // rim
    b.lineWidth = 6; b.strokeStyle = 'rgba(10,15,38,.9)'; b.beginPath(); b.arc(cx, cy, R, 0, 7); b.stroke();
  }

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    const narrow = W < 900;
    R = narrow ? Math.min(W * 0.62, H * 0.4) : Math.min(H * 0.46, W * 0.36);
    cx = narrow ? W * 0.62 : W * 0.72; cy = narrow ? H * 0.62 : H * 0.5;
    ox = cx - R * 0.38; oy = cy - R * 0.04;
    build(); paintBase();
  }

  function drawVessels(now) {
    const el = reduce ? 99 : (now - t0) / 1000;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R - 3, 0, 7); ctx.clip();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const v of vessels) {
      const p = Math.min(1, Math.max(0, (el - v.delay) / 2.6));
      if (p <= 0) continue;
      const n = Math.max(2, Math.floor(p * v.pts.length));
      ctx.strokeStyle = v.vein ? '#7b1424' : '#a8261c';
      for (let i = 1; i < n; i++) {
        const k = 1 - i / v.pts.length;
        ctx.lineWidth = Math.max(0.6, v.w * (0.35 + 0.65 * k));
        ctx.beginPath(); ctx.moveTo(v.pts[i - 1][0], v.pts[i - 1][1]); ctx.lineTo(v.pts[i][0], v.pts[i][1]); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLens(now) {
    let x, y;
    if (mouse.active) { x = mouse.x; y = mouse.y; }
    else { const s = now / 1700; x = cx + Math.cos(s) * R * 0.55; y = cy + Math.sin(s * 1.3) * R * 0.5; }
    const dx = x - cx, dy = y - cy;
    if (Math.hypot(dx, dy) > R) { const k = R / Math.hypot(dx, dy); x = cx + dx * k; y = cy + dy * k; }
    const r = 62;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R - 3, 0, 7); ctx.clip();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    g.addColorStop(0, 'rgba(53,224,194,.28)'); g.addColorStop(1, 'rgba(53,224,194,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(53,224,194,.95)'; ctx.lineWidth = 1.6;
    ctx.setLineDash([8, 7]); ctx.lineDashOffset = -now / 40;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x - r - 14, y); ctx.lineTo(x - r + 12, y); ctx.moveTo(x + r - 12, y); ctx.lineTo(x + r + 14, y);
    ctx.moveTo(x, y - r - 14); ctx.lineTo(x, y - r + 12); ctx.moveTo(x, y + r - 12); ctx.lineTo(x, y + r + 14); ctx.stroke();
    ctx.restore();
  }

  function frame(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(DPR, DPR);
    const pulse = 1 + Math.sin(now / 900) * 0.012;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(pulse, pulse); ctx.translate(-cx, -cy);
    ctx.globalAlpha = W < 900 ? 0.5 : 0.95;
    ctx.drawImage(base, 0, 0, W, H);
    drawVessels(now);
    if (!reduce) drawLens(now);
    ctx.restore();
    if (!document.hidden) requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestAnimationFrame(frame); });
  const hero = canvas.parentElement;
  hero.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.active = true;
  });
  hero.addEventListener('pointerleave', () => { mouse.active = false; });

  resize();
  requestAnimationFrame(frame);
})();
