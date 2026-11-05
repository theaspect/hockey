// Конфетти и прочие частицы.
const CONFETTI_COLORS = ['#ff5252', '#ffd600', '#69f0ae', '#40c4ff', '#e040fb', '#ff9100'];

const Effects = {
  parts: [],

  add(x, y, vx, vy, gravity) {
    this.parts.push({
      x, y, vx, vy, gravity,
      size: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 12,
      life: 2 + Math.random() * 1.5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    });
  },

  // Взрыв конфетти из точки, dir = -1 летит влево, 1 — вправо.
  burst(x, y, count, dir) {
    for (let i = 0; i < count; i++) {
      const speed = 300 + Math.random() * 700;
      const angle = (Math.random() - 0.5) * 1.6;
      this.add(x, y, Math.cos(angle) * speed * dir, Math.sin(angle) * speed - 300, 900);
    }
  },

  rain(count) {
    for (let i = 0; i < count; i++) {
      this.add(Math.random() * WORLD.w, -20 - Math.random() * 300, (Math.random() - 0.5) * 100, 100 + Math.random() * 200, 150);
    }
  },

  update(dt) {
    const drag = Math.pow(0.4, dt);
    for (const p of this.parts) {
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
  },

  draw(ctx) {
    for (const p of this.parts) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
  },
};
