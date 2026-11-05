// Хоккейная площадка: размеры, столкновения с бортами и воротами, рисование.
// Ворота стоят внутри площадки, как в настоящем хоккее: за ними можно проехать.
// Сетка (бока и задняя стенка) твёрдая; шайба может зайти в ворота только спереди, через створ.
const WORLD = { w: 1500, h: 900 };

const RINK = {
  left: 40,
  right: 1460,
  top: 100,
  bottom: 860,
  corner: 160,
  goalHalf: 95, // половина ширины створа
  goalDepth: 55, // глубина сетки
  goalOffset: 170, // от торцевого борта до линии ворот
  creaseR: 120, // радиус синей зоны вратаря перед воротами
};
RINK.cx = (RINK.left + RINK.right) / 2;
RINK.cy = (RINK.top + RINK.bottom) / 2;
RINK.leftGoalX = RINK.left + RINK.goalOffset; // линия левых ворот (вратарь)
RINK.rightGoalX = RINK.right - RINK.goalOffset; // линия правых ворот

// Коробка сетки. front — x линии ворот (там открыто), dir — куда смотрит створ.
function netBox(side) {
  const { cy, goalHalf, goalDepth } = RINK;
  if (side < 0) {
    const x = RINK.leftGoalX;
    return { x0: x - goalDepth, x1: x, y0: cy - goalHalf, y1: cy + goalHalf, front: x, dir: 1 };
  }
  const x = RINK.rightGoalX;
  return { x0: x, x1: x + goalDepth, y0: cy - goalHalf, y1: cy + goalHalf, front: x, dir: -1 };
}
const NETS = { left: netBox(-1), right: netBox(1) };

// Отражает скорость от стенки с нормалью (nx, ny), если объект летит в неё.
function bounceOff(o, nx, ny, bounce) {
  const vn = o.vx * nx + o.vy * ny;
  if (vn <= 0) return;
  o.vx -= (1 + bounce) * vn * nx;
  o.vy -= (1 + bounce) * vn * ny;
}

// Держит круг радиуса r внутри площадки. Возвращает true, если был удар о борт.
function collideRink(o, r, bounce) {
  const { left, right, top, bottom, corner } = RINK;
  const cornerX = o.x < left + corner ? left + corner : o.x > right - corner ? right - corner : null;
  const cornerY = o.y < top + corner ? top + corner : o.y > bottom - corner ? bottom - corner : null;

  if (cornerX !== null && cornerY !== null) {
    const dx = o.x - cornerX;
    const dy = o.y - cornerY;
    const dist = Math.hypot(dx, dy);
    const max = corner - r;
    if (dist <= max) return false;
    const nx = dx / dist;
    const ny = dy / dist;
    o.x = cornerX + nx * max;
    o.y = cornerY + ny * max;
    bounceOff(o, nx, ny, bounce);
    return true;
  }

  let hit = false;
  if (o.y < top + r) { o.y = top + r; bounceOff(o, 0, -1, bounce); hit = true; }
  if (o.y > bottom - r) { o.y = bottom - r; bounceOff(o, 0, 1, bounce); hit = true; }
  if (o.x < left + r) { o.x = left + r; bounceOff(o, -1, 0, bounce); hit = true; }
  if (o.x > right - r) { o.x = right - r; bounceOff(o, 1, 0, bounce); hit = true; }
  return hit;
}

// Столкновение круга с сеткой ворот. Для шайбы (openFront) створ открыт: в него можно залететь.
// Игроков сетка не пускает внутрь совсем. Возвращает true, если был удар.
function collideNet(o, r, box, bounce, openFront) {
  const px = Math.max(box.x0, Math.min(box.x1, o.x));
  const py = Math.max(box.y0, Math.min(box.y1, o.y));
  const dx = o.x - px;
  const dy = o.y - py;
  const dist = Math.hypot(dx, dy);
  if (dist >= r) return false;
  // Шайба летит в створ между штангами — не мешаем.
  if (openFront && px === box.front && py > box.y0 && py < box.y1) return false;
  if (dist === 0) {
    if (openFront) return false; // шайба уже в сетке — это гол
    pushOutOfBox(o, r, box);
    return true;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  o.x = px + nx * r;
  o.y = py + ny * r;
  bounceOff(o, -nx, -ny, bounce);
  return true;
}

// Игрок оказался внутри сетки — выталкиваем через ближайшую стенку.
function pushOutOfBox(o, r, box) {
  const exits = [
    { d: o.x - box.x0, x: box.x0 - r, y: o.y },
    { d: box.x1 - o.x, x: box.x1 + r, y: o.y },
    { d: o.y - box.y0, x: o.x, y: box.y0 - r },
    { d: box.y1 - o.y, x: o.x, y: box.y1 + r },
  ];
  const best = exits.reduce((a, b) => (b.d < a.d ? b : a));
  o.x = best.x;
  o.y = best.y;
}

function collideNets(o, r, bounce, openFront) {
  const a = collideNet(o, r, NETS.left, bounce, openFront);
  const b = collideNet(o, r, NETS.right, bounce, openFront);
  return a || b;
}

// Шайба в сетке? Возвращает 'left' / 'right' / null.
function puckInNet(x, y) {
  for (const side of ['left', 'right']) {
    const box = NETS[side];
    if (x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1) return side;
  }
  return null;
}

// Пересекает ли отрезок a→b коробку box, расширенную на r. Возвращает долю пути до удара или null.
function segmentHitsBox(a, b, box, r) {
  let t0 = 0;
  let t1 = 1;
  const d = { x: b.x - a.x, y: b.y - a.y };
  const slabs = [
    [a.x, d.x, box.x0 - r, box.x1 + r],
    [a.y, d.y, box.y0 - r, box.y1 + r],
  ];
  for (const [p, dp, lo, hi] of slabs) {
    if (Math.abs(dp) < 1e-9) {
      if (p < lo || p > hi) return null;
      continue;
    }
    let ta = (lo - p) / dp;
    let tb = (hi - p) / dp;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}

// Путь шайбы радиуса r по прямой с отскоками от верхнего/нижнего борта до линии ворот goalX.
// obstacles — сетки, о которые путь «разбивается» (свои ворота за спиной).
// Отскок у закруглённого угла не предсказываем — такой путь считается «не доходит».
// Возвращает { points: [{x,y}...], yHit } — yHit = null, если до линии ворот не долетает.
function tracePath(x, y, dx, dy, r, goalX, maxBounces, obstacles = []) {
  const lo = RINK.top + r;
  const hi = RINK.bottom - r;
  const points = [{ x, y }];
  if (Math.sign(dx) !== Math.sign(goalX - x)) return { points, yHit: null };

  for (let bounce = 0; bounce <= maxBounces; bounce++) {
    const tGoal = (goalX - x) / dx;
    const tWall = dy > 0 ? (hi - y) / dy : dy < 0 ? (lo - y) / dy : Infinity;
    const t = Math.min(tGoal, tWall);
    const from = { x, y };
    const to = { x: x + dx * t, y: y + dy * t };
    for (const box of obstacles) {
      const hit = segmentHitsBox(from, to, box, r);
      if (hit === null) continue;
      points.push({ x: from.x + (to.x - from.x) * hit, y: from.y + (to.y - from.y) * hit });
      return { points, yHit: null };
    }
    points.push(to);
    if (tGoal <= tWall) return { points, yHit: to.y };
    x = to.x;
    y = to.y;
    if (x < RINK.left + RINK.corner + 20 || x > RINK.right - RINK.corner - 20) break;
    dy = -dy;
  }
  return { points, yHit: null };
}

// Точка, куда целиться, чтобы шайба отскочила от борта (wall: -1 верхний, 1 нижний) и пришла в (goalX, ty).
// Возвращает null, если отскок пришёлся бы на закруглённый угол.
function bankTarget(x, y, goalX, ty, wall, r) {
  const wallY = wall < 0 ? RINK.top + r : RINK.bottom - r;
  const mirrorY = 2 * wallY - ty;
  const t = (wallY - y) / (mirrorY - y);
  const bounceX = x + t * (goalX - x);
  if (bounceX < RINK.left + RINK.corner + 20 || bounceX > RINK.right - RINK.corner - 20) return null;
  return { x: goalX, y: mirrorY, bounce: { x: bounceX, y: wallY } };
}

// ---------- Рисование ----------

function drawNet(ctx, box) {
  const back = box.dir > 0 ? box.x0 : box.x1;
  const { front, y0, y1 } = box;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(box.x0, y0, box.x1 - box.x0, y1 - y0);

  ctx.strokeStyle = '#b0bec5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = y0; y <= y1; y += 16) {
    ctx.moveTo(box.x0, y);
    ctx.lineTo(box.x1, y);
  }
  for (let x = box.x0; x <= box.x1; x += 14) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  ctx.stroke();

  // Рама: бока и задняя стенка, спереди открыто.
  ctx.strokeStyle = '#e53935';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(front, y0);
  ctx.lineTo(back, y0);
  ctx.lineTo(back, y1);
  ctx.lineTo(front, y1);
  ctx.stroke();
  ctx.fillStyle = '#e53935';
  for (const y of [y0, y1]) {
    ctx.beginPath();
    ctx.arc(front, y, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLine(ctx, x1, y1, x2, y2, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawCircle(ctx, x, y, r, stroke, width) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCrease(ctx, x, dir) {
  ctx.beginPath();
  ctx.arc(x, RINK.cy, RINK.creaseR, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI * 1.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(100,170,255,0.35)';
  ctx.fill();
  ctx.strokeStyle = '#1e63d6';
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawRink(ctx) {
  const { left, right, top, bottom, corner, cx, cy, leftGoalX, rightGoalX } = RINK;
  const w = right - left;
  const h = bottom - top;

  ctx.fillStyle = '#f4fbff';
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, corner);
  ctx.fill();

  drawLine(ctx, cx, top, cx, bottom, '#e53935', 10);
  drawLine(ctx, cx - 300, top, cx - 300, bottom, '#1e63d6', 12);
  drawLine(ctx, cx + 300, top, cx + 300, bottom, '#1e63d6', 12);
  drawLine(ctx, leftGoalX, top, leftGoalX, bottom, '#e53935', 4);
  drawLine(ctx, rightGoalX, top, rightGoalX, bottom, '#e53935', 4);
  drawCircle(ctx, cx, cy, 110, '#1e63d6', 5);
  ctx.fillStyle = '#1e63d6';
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();

  for (const x of [leftGoalX + 170, rightGoalX - 170]) {
    for (const y of [cy - 210, cy + 210]) drawCircle(ctx, x, y, 80, '#e53935', 4);
  }
  drawCrease(ctx, leftGoalX, 1);
  drawCrease(ctx, rightGoalX, -1);
  drawNet(ctx, NETS.left);
  drawNet(ctx, NETS.right);

  ctx.beginPath();
  ctx.roundRect(left, top, w, h, corner);
  ctx.strokeStyle = '#263859';
  ctx.lineWidth = 22;
  ctx.stroke();
  ctx.strokeStyle = '#ffcc33';
  ctx.lineWidth = 12;
  ctx.stroke();
}
