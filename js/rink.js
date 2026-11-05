// Хоккейная площадка: размеры, столкновения с бортами и рисование.
// Ворота встроены в торцевые борта: в проёме борта нет, шайба может туда залететь.
const WORLD = { w: 1600, h: 900 };

const RINK = {
  left: 90,
  right: 1510,
  top: 100,
  bottom: 860,
  corner: 160,
  goalHalf: 95,
  goalDepth: 60,
};
RINK.cx = (RINK.left + RINK.right) / 2;
RINK.cy = (RINK.top + RINK.bottom) / 2;

function inGoalMouth(y, r) {
  return Math.abs(y - RINK.cy) < RINK.goalHalf - r;
}

// Отражает скорость от стенки с нормалью (nx, ny), если объект летит в неё.
function bounceOff(o, nx, ny, bounce) {
  const vn = o.vx * nx + o.vy * ny;
  if (vn <= 0) return;
  o.vx -= (1 + bounce) * vn * nx;
  o.vy -= (1 + bounce) * vn * ny;
}

// Держит круг радиуса r внутри площадки. Возвращает true, если был удар о борт.
function collideRink(o, r, bounce, canEnterGoal) {
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
  if (canEnterGoal && inGoalMouth(o.y, r)) return hit;
  if (o.x < left + r) { o.x = left + r; bounceOff(o, -1, 0, bounce); hit = true; }
  if (o.x > right - r) { o.x = right - r; bounceOff(o, 1, 0, bounce); hit = true; }
  return hit;
}

// Путь шайбы радиуса r по прямой с отскоками от верхнего/нижнего борта до линии ворот goalX.
// Отскок у закруглённого угла не предсказываем — такой путь считается «не доходит».
// Возвращает { points: [{x,y}...], yHit } — yHit = null, если до линии ворот не долетает.
function tracePath(x, y, dx, dy, r, goalX, maxBounces) {
  const lo = RINK.top + r;
  const hi = RINK.bottom - r;
  const points = [{ x, y }];
  if (Math.sign(dx) !== Math.sign(goalX - x)) return { points, yHit: null };

  for (let bounce = 0; bounce <= maxBounces; bounce++) {
    const tGoal = (goalX - x) / dx;
    const tWall = dy > 0 ? (hi - y) / dy : dy < 0 ? (lo - y) / dy : Infinity;
    if (tGoal <= tWall) {
      points.push({ x: goalX, y: y + dy * tGoal });
      return { points, yHit: y + dy * tGoal };
    }
    x += dx * tWall;
    y += dy * tWall;
    points.push({ x, y });
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
  return { x: goalX, y: mirrorY };
}

function drawNet(ctx, x, dir) {
  const { cy, goalHalf, goalDepth } = RINK;
  const backX = x + dir * goalDepth;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(Math.min(x, backX), cy - goalHalf, goalDepth, goalHalf * 2);

  ctx.strokeStyle = '#b0bec5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = cy - goalHalf; y <= cy + goalHalf; y += 16) {
    ctx.moveTo(x, y);
    ctx.lineTo(backX, y);
  }
  for (let i = 0; i <= goalDepth; i += 15) {
    ctx.moveTo(x + dir * i, cy - goalHalf);
    ctx.lineTo(x + dir * i, cy + goalHalf);
  }
  ctx.stroke();

  ctx.strokeStyle = '#e53935';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(x, cy - goalHalf);
  ctx.lineTo(backX, cy - goalHalf);
  ctx.lineTo(backX, cy + goalHalf);
  ctx.lineTo(x, cy + goalHalf);
  ctx.stroke();
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
  ctx.arc(x, RINK.cy, 120, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI * 1.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(100,170,255,0.35)';
  ctx.fill();
  ctx.strokeStyle = '#1e63d6';
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawRink(ctx) {
  const { left, right, top, bottom, corner, cx, cy, goalHalf } = RINK;
  const w = right - left;
  const h = bottom - top;

  drawNet(ctx, left, -1);
  drawNet(ctx, right, 1);

  ctx.fillStyle = '#f4fbff';
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, corner);
  ctx.fill();

  drawLine(ctx, cx, top, cx, bottom, '#e53935', 10);
  drawLine(ctx, cx - 300, top, cx - 300, bottom, '#1e63d6', 12);
  drawLine(ctx, cx + 300, top, cx + 300, bottom, '#1e63d6', 12);
  drawCircle(ctx, cx, cy, 110, '#1e63d6', 5);
  ctx.fillStyle = '#1e63d6';
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();

  for (const x of [left + 300, right - 300]) {
    for (const y of [cy - 200, cy + 200]) drawCircle(ctx, x, y, 80, '#e53935', 4);
  }
  drawCrease(ctx, left, 1);
  drawCrease(ctx, right, -1);

  // Борта, а потом «вырезаем» проём ворот.
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, corner);
  ctx.strokeStyle = '#263859';
  ctx.lineWidth = 22;
  ctx.stroke();
  ctx.strokeStyle = '#ffcc33';
  ctx.lineWidth = 12;
  ctx.stroke();

  ctx.fillStyle = '#f4fbff';
  ctx.fillRect(left - 12, cy - goalHalf, 24, goalHalf * 2);
  ctx.fillRect(right - 12, cy - goalHalf, 24, goalHalf * 2);
  drawLine(ctx, left, cy - goalHalf, left, cy + goalHalf, '#e53935', 4);
  drawLine(ctx, right, cy - goalHalf, right, cy + goalHalf, '#e53935', 4);
}
