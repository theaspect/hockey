// Хоккей: ребёнок — вратарь (красный) в левых воротах. Синий нападающий бросает по воротам.
// Кнопка действия (A / пробел / клик):
//   без шайбы — раскрыть ловушку на долю секунды; шайба долетела в этот момент — поймал.
//     Не нажал вовремя — шайба просто отскакивает от вратаря.
//   с шайбой — бросок по прицелу-радару, который качается туда-сюда. Зелёный прицел — попадёт в ворота.
// Очки: поймал бросок соперника = 1 звезда (от звёзд растёт сложность).
//       Красный кружок — голы вратаря, синий — голы нападающего. Каждый гол = 1.
// Режимы (выбираются в меню):
//   pvc — нападающий компьютерный, вратарь управляется чем угодно.
//   pvp — нападающим управляет второй игрок:
//         с геймпадом: вратарь — геймпад; нападающий — клавиатура (стрелки/WASD + пробел/Enter) или мышь;
//         без геймпада: вратарь — WASD + пробел; нападающий — стрелки + Enter или мышь.
//   Мышь у нападающего: держать кнопку — ехать к курсору, отпустить — бросок.
//   Мышь у вратаря (pvc): вратарь едет за курсором, клик — действие.
//   Планшет (pvc): палец где угодно — вратарь едет к пальцу; кнопка 🧤/🏒 справа внизу — действие.
// Медленную шайбу вратарь берёт простым касанием (без звезды), быструю — только ловушкой.
// Меню: кнопка ☰ слева сверху, Esc или Start на геймпаде.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };

const GOALIE_R = 48;
const SKATER_R = 38;
const PUCK_R = 14;
const GOALIE_ZONE = 230; // как далеко вратарь может отъехать вперёд от линии своих ворот
const CREASE_KEEP_OUT = RINK.creaseR + 20; // нападающий не заезжает в синюю зону вратаря
const THROW_SPEED = 1500;
const AUTO_THROW = 5; // через сколько секунд вратарь сам бросит по прицелу
const MIN_HOLD = 0.3; // сразу после поимки бросить нельзя — чтобы двойное нажатие не выкидывало шайбу
const GLOVE_COOLDOWN = 0.45; // пауза после попытки, чтобы не ловить «долбёжкой» по кнопке
const RADAR_AMP = (60 * Math.PI) / 180; // прицел качается на ±60° вокруг ворот — хватает на броски через борт
const RADAR_BOUNCES = 2; // сколько отскоков от бортов показывает прицел
const BOARD_BOUNCE_KEEP = 0.9; // сколько скорости шайба сохраняет после удара о борт

// Уровни сложности (выбираются в меню).
//   startLevel — с какого уровня начинается игра, growth — сколько уровня даёт одна звезда,
//   gloveTime — сколько ловушка открыта, reach — докуда достаёт ловушка сверх тела,
//   aimAssist — насколько можно промахнуться мимо створа, чтобы прицел всё равно был зелёным.
const DIFFICULTIES = [
  { label: 'Легко', stars: 1, color: '#43a047', startLevel: 0, growth: 0.5, gloveTime: 0.5, reach: 40, aimAssist: 80 },
  { label: 'Средне', stars: 2, color: '#fb8c00', startLevel: 0, growth: 1, gloveTime: 0.35, reach: 28, aimAssist: 50 },
  { label: 'Трудно', stars: 3, color: '#e53935', startLevel: 8, growth: 1.5, gloveTime: 0.25, reach: 18, aimAssist: 25 },
];
const DIFFICULTY_KEY = 'hockey.difficulty';
let difficultyIndex = loadDifficulty();

function loadDifficulty() {
  try {
    const saved = Number(localStorage.getItem(DIFFICULTY_KEY));
    return DIFFICULTIES[saved] ? saved : 0;
  } catch {
    return 0;
  }
}

function setDifficulty(i) {
  difficultyIndex = (i + DIFFICULTIES.length) % DIFFICULTIES.length;
  try {
    localStorage.setItem(DIFFICULTY_KEY, String(difficultyIndex));
  } catch {
    // без сохранения тоже работает
  }
}

function difficulty() {
  return DIFFICULTIES[difficultyIndex];
}

function catchReach() {
  return GOALIE_R + PUCK_R + difficulty().reach;
}
const PUCK_FRICTION = 0.7; // какая доля скорости шайбы остаётся через секунду
const SLOW_FRICTION = 0.3; // медленная шайба тормозит сильнее и быстро останавливается — её легко подобрать
const FAST_PUCK = 700; // быструю шайбу нападающему поймать труднее — нужно встать точно на пути
const PATROL_X = RINK.cx - 150; // где нападающий караулит бросок вратаря
const PATROL_AMP = 260;
const PATROL_FREQ = 0.9;
const PAD_ACTIONS = ['PadA', 'PadB', 'PadX', 'PadY', 'PadRT', 'PadRB'];
// Кнопка меню, кнопки действия и джойстики привязаны к краям экрана — см. menuButton() / actionButtonOf() / stickHomeOf().
const VERSION = 'v12'; // показывается в углу экрана; поднимать при каждой выкладке
const SLOW_PUCK = 300; // медленную шайбу вратарь берёт просто касанием, без кнопки
const STICK_RADIUS = 80; // насколько отводить палец экранного джойстика для полной скорости
const TOUCH_STICK_DEADZONE = 0.15;
const SWING_TIME = 0.35; // длительность замаха клюшкой при броске
const STEAL_LEVEL = 12; // с какого уровня компьютер отбирает шайбу у вратаря, выехавшего из своей зоны
const MAX_LEVEL = 30; // примерно здесь сложность перестаёт расти — конец шкалы уровня

// Игра всегда альбомная, и поворот iPad на неё не влияет (страница не может запретить поворот экрана).
// Если система повернула экран в портрет, мы поворачиваем картинку обратно — в ту сторону, чтобы игра
// осталась на месте относительно рук (по углу поворота экрана и последней альбомной ориентации).
// Размер холста задаём точно в пикселях окна: в Safari 100vh больше видимой области и картинка сплющивалась.
let lastLandscapeAngle = 90;

// Угол поворота экрана: iOS — window.orientation (0, 90, -90, 180), остальные — screen.orientation.angle.
function screenAngle() {
  if (typeof window.orientation === 'number') return window.orientation;
  const a = window.screen.orientation ? window.screen.orientation.angle : 0;
  return a > 180 ? a - 360 : a;
}

function normalizeAngle(a) {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const angle = screenAngle();
  view.w = w;
  view.h = h;
  view.rotated = h > w;
  if (!view.rotated && Math.abs(angle) === 90) lastLandscapeAngle = angle;
  // 1 — крутим картинку по часовой, -1 — против часовой.
  view.turn = normalizeAngle(angle - lastLandscapeAngle) > 0 ? 1 : -1;
  view.dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * view.dpr);
  canvas.height = Math.round(h * view.dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const lw = view.rotated ? h : w; // размеры «альбомного» экрана
  const lh = view.rotated ? w : h;
  // Масштаб — по самой площадке (плюс место для табло сверху), остальное поле экрана — просто фон.
  const c = CONTENT;
  view.scale = Math.min(lw / (c.x1 - c.x0), lh / (c.y1 - c.y0));
  view.ox = lw / 2 - ((c.x0 + c.x1) / 2) * view.scale;
  view.oy = lh / 2 - ((c.y0 + c.y1) / 2) * view.scale;
  // Края экрана в координатах игры — к ним привязаны табло, меню, джойстик и кнопка действия.
  view.screen = {
    left: -view.ox / view.scale,
    top: -view.oy / view.scale,
    right: (lw - view.ox) / view.scale,
    bottom: (lh - view.oy) / view.scale,
  };
}

// Что обязательно должно влезть в экран: площадка и полоса для табло над ней.
const CONTENT = { x0: RINK.left - 16, x1: RINK.right + 16, y0: RINK.top - 92, y1: RINK.bottom + 16 };

function menuButton() {
  return { x: view.screen.left + 50, y: view.screen.top + 48, r: 32 };
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// Точка экрана → точка «альбомного» экрана (с учётом поворота) → координаты игры.
function toLandscape(p) {
  if (!view.rotated) return p;
  if (view.turn > 0) return { x: p.y, y: view.w - p.x };
  return { x: view.h - p.y, y: p.x };
}

// Координаты «экрана» (табло, меню, кнопки, джойстики — они никогда не разворачиваются).
function toHud(p) {
  const l = toLandscape(p);
  return { x: (l.x - view.ox) / view.scale, y: (l.y - view.oy) / view.scale };
}

// «2 игрока на одном планшете»: площадка разворачивается на 180°, чтобы ворота вратаря
// были у того игрока, который сейчас вратарь. Разворот — вокруг центра площадки.
function flipped() {
  return tabletDuel() && goalieOwner === 1;
}

function flipPoint(p) {
  if (!flipped()) return p;
  return { x: 2 * RINK.cx - p.x, y: 2 * RINK.cy - p.y };
}

// Координаты площадки (с учётом разворота).
function toWorld(p) {
  return flipPoint(toHud(p));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function makePlayer(color, r) {
  // swing: 1 → 0 — идёт замах клюшкой после броска.
  return { x: 0, y: 0, vx: 0, vy: 0, fx: 1, fy: 0, r, color, cooldown: 0, swing: 0 };
}

const PLAYER_COLORS = ['#e53935', '#1e63d6']; // игрок 0 — красный, игрок 1 — синий
const goalie = makePlayer(PLAYER_COLORS[0], GOALIE_R);
const skater = makePlayer(PLAYER_COLORS[1], SKATER_R);
// «2 игрока»: кто сейчас вратарь (0 или 1) — меняется после каждого гола; голы каждого игрока.
let goalieOwner = 0;
const pvpScore = [0, 0];
const puck = { x: 0, y: 0, vx: 0, vy: 0, owner: null, shot: false, prev: { x: 0, y: 0 } };
const score = { saves: 0, mine: 0, goals: 0 };
const glove = { open: 0, cooldown: 0 };
const radar = { center: 0, phase: 0 };
let state = 'menu'; // menu | play | goal
let pausedState = null; // в каком состоянии была игра, когда открыли меню; null — игра ещё не начата
let mode = 'pvc'; // pvc | pvp
let goalInfo = null;
let holdTimer = 0;
let saveFlash = 0;
let shotSpot = null;
let patrolPhase = 0;
let skaterReaction = 0; // сколько ещё нападающий «соображает» после броска вратаря
let skaterHeld = 0; // сколько нападающий уже держит шайбу — бросать сразу нельзя
let wrap = null; // маршрут объезда ворот, если компьютер решил объехать

// ---------- Сложность: всё зависит от количества очков ----------

function level() {
  return difficulty().startLevel + score.saves * difficulty().growth;
}

function shotSpeed() {
  return Math.min(550 + level() * 30, 1250);
}

// Скорости: соперник с ростом сложности быстрее, вратарь — медленнее.
function skaterSpeed() {
  return Math.min(220 + level() * 10, 420);
}

function humanSkaterSpeed() {
  return Math.min(330 + level() * 5, 460);
}

// Время реакции компьютера на бросок вратаря: чем сложнее, тем быстрее бросается на перехват.
function reactionTime() {
  return Math.max(0.35 - level() * 0.01, 0.1);
}

function goalieSpeed() {
  return Math.max(480 - level() * 6, 320);
}

// Насколько компьютер ошибается, выбирая, куда бросить мимо вратаря (в пикселях «оценки»).
// Не опускается до нуля — компьютер никогда не играет идеально.
function aimNoise() {
  return Math.max(220 - level() * 10, 40);
}

// Сколько нападающий держит шайбу, прежде чем может бросить.
function minSkaterHold() {
  return Math.max(1.2 - level() * 0.03, 0.5);
}

// Скорость качания прицела, радиан в секунду.
function radarSpeed() {
  return Math.min(0.9 + level() * 0.03, 1.8);
}

// Шанс, что компьютер бросит через борт: только на высоких уровнях.
function bankChance() {
  if (level() < 10) return 0;
  return Math.min((level() - 10) * 0.03, 0.5);
}

// Сколько нападающий едет к точке броска, прежде чем бросить.
function aimTime() {
  return Math.max(3 - level() * 0.1, 0.8);
}

// Шанс финта: доехал, передумал и поехал бросать с другого места.
function fakeChance() {
  if (level() < 6) return 0;
  return Math.min((level() - 5) * 0.04, 0.45);
}

// Шанс объезда: нападающий объезжает ворота сзади и бросает с другой стороны.
function wrapChance() {
  if (level() < 5) return 0;
  return Math.min((level() - 5) * 0.04, 0.3);
}

function pickShotSpot(faked = false) {
  shotSpot = {
    x: rand(RINK.leftGoalX + 260, RINK.cx - 150),
    y: rand(RINK.top + 120, RINK.bottom - 120),
    timer: faked ? aimTime() / 2 : aimTime(),
    faked,
  };
  wrap = !faked && Math.random() < wrapChance() ? makeWrapRoute() : null;
}

// Объезд ворот: подъехать сбоку, проехать за сеткой, выскочить с другой стороны и бросить в ближний угол.
function makeWrapRoute() {
  const { leftGoalX: gx, cy, goalHalf, goalDepth } = RINK;
  const s = skater.y >= cy ? 1 : -1; // заезжаем с той стороны, где уже едем
  const behindX = gx - goalDepth - 60;
  return {
    side: s,
    timer: 7,
    route: [
      { x: gx + 40, y: cy + s * (goalHalf + 130) },
      { x: behindX, y: cy + s * (goalHalf + 50) },
      { x: behindX, y: cy - s * (goalHalf + 50) },
      { x: gx + 60, y: cy - s * (goalHalf + 40) },
    ],
  };
}

// Едет по маршруту объезда. Возвращает true, пока объезд продолжается.
function followWrap(speed, dt) {
  wrap.timer -= dt;
  const target = wrap.route[0];
  moveToward(skater, target.x, target.y, speed, dt);
  if (Math.hypot(target.x - skater.x, target.y - skater.y) < 30) wrap.route.shift();
  if (wrap.route.length > 0 && wrap.timer > 0) return true;
  const s = wrap.side;
  wrap = null;
  if (puck.owner !== skater) return false;
  skaterShot(RINK.leftGoalX - 30, RINK.cy + s * 10);
  return true;
}

// ---------- Партия ----------

function faceoff() {
  // Форма — по игроку: в «2 игрока» красный остаётся красным, кем бы он ни играл.
  const owner = mode === 'pvp' ? goalieOwner : 0;
  goalie.color = PLAYER_COLORS[owner];
  skater.color = PLAYER_COLORS[1 - owner];
  Object.assign(goalie, { x: RINK.leftGoalX + 60, y: RINK.cy, fx: 1, fy: 0, cooldown: 0 });
  Object.assign(skater, { x: RINK.cx, y: RINK.cy, fx: -1, fy: 0, cooldown: 0 });
  Object.assign(puck, holdPoint(skater), { vx: 0, vy: 0, owner: skater, shot: false });
  skaterHeld = 0;
  pickShotSpot();
}

function newGame(newMode) {
  mode = newMode;
  pausedState = null;
  score.saves = 0;
  score.mine = 0;
  score.goals = 0;
  goalieOwner = 0;
  pvpScore[0] = 0;
  pvpScore[1] = 0;
  saveFlash = 0;
  glove.open = 0;
  glove.cooldown = 0;
  Effects.parts = [];
  faceoff();
  state = 'play';
}

// ---------- Кто чем управляет ----------

function skaterIsHuman() {
  return mode === 'pvp';
}

// ---------- Сенсорное управление ----------
// «1 игрок» на планшете, двумя большими пальцами:
//   левая половина экрана — джойстик: где коснулся, там его основание, отклонение пальца = направление и скорость;
//   правая половина — действие (кнопка 🧤/🏒 справа внизу — подсказка, нажимать можно где угодно справа).
// «2 игрока» на одном планшете (лежит на столе, игроки у узких краёв, каждый за своими воротами):
//   у каждого своя половина экрана (игрок 0 — левая, игрок 1 — правая);
//   в своей половине: кнопка действия в углу под правую руку, всё остальное — джойстик.
// Поворачивать игрока не нужно: вратарь сам смотрит на шайбу, бросок вратаря идёт по прицелу,
// нападающий бросает туда, куда едет.
// Мышь («1 игрок»): вратарь едет за курсором, клик — действие.
function tabletDuel() {
  return mode === 'pvp' && Input.lastDevice === 'touch';
}

function showTouchControls() {
  return Input.lastDevice === 'touch' && (mode === 'pvc' || tabletDuel());
}

function touchPlayers() {
  return mode === 'pvc' ? [0] : [0, 1];
}

// Чья половина экрана (в «1 игрок» — левая половина для джойстика).
function sideOf(hudPoint) {
  return hudPoint.x < RINK.cx ? 0 : 1;
}

function onLeftHalf(screenPoint) {
  return sideOf(toHud(screenPoint)) === 0;
}

// Кнопка действия игрока; rot — как повернуть значок, чтобы он смотрел на игрока.
function actionButtonOf(player) {
  const s = view.screen;
  if (mode === 'pvc') return { x: s.right - 130, y: s.bottom - 130, r: 90, rot: 0 };
  if (player === 0) return { x: s.left + 110, y: s.bottom - 110, r: 80, rot: Math.PI / 2 };
  return { x: s.right - 110, y: s.top + 130, r: 80, rot: -Math.PI / 2 };
}

// Где рисуется подсказка джойстика, пока пальца нет (под левую руку игрока).
function stickHomeOf(player) {
  const s = view.screen;
  if (mode === 'pvc') return { x: s.left + 150, y: s.bottom - 150 };
  if (player === 0) return { x: s.left + 170, y: s.top + 260 };
  return { x: s.right - 170, y: s.bottom - 260 };
}

function onActionButtonOf(player, screenPoint) {
  const p = toHud(screenPoint);
  const b = actionButtonOf(player);
  return Math.hypot(p.x - b.x, p.y - b.y) < b.r + 20;
}

// Палец джойстика игрока: первый, что опустили в его зону (и не на его кнопку действия).
function stickTouchOf(player) {
  for (const p of Input.pointers.values()) {
    if (p.type !== 'touch') continue;
    const start = { x: p.startX, y: p.startY };
    if (sideOf(toHud(start)) !== player) continue;
    if (mode === 'pvp' && onActionButtonOf(player, start)) continue;
    return p;
  }
  return null;
}

// Джойстик игрока: { base, knob } — в координатах экрана (для рисования), dir — направление на площадке.
function touchStickOf(player) {
  if (!showTouchControls()) return null;
  const touch = stickTouchOf(player);
  if (!touch) return null;
  const base = toHud({ x: touch.startX, y: touch.startY });
  const finger = toHud(touch);
  let dx = (finger.x - base.x) / STICK_RADIUS;
  let dy = (finger.y - base.y) / STICK_RADIUS;
  const len = Math.hypot(dx, dy);
  if (len > 1) {
    dx /= len;
    dy /= len;
  }
  const knob = { x: base.x + dx * STICK_RADIUS, y: base.y + dy * STICK_RADIUS };
  const sign = flipped() ? -1 : 1; // площадка развёрнута — направления тоже
  const dir = len < TOUCH_STICK_DEADZONE ? { x: 0, y: 0 } : { x: dx * sign, y: dy * sign };
  return { base, knob, dir };
}

// Нажал ли игрок действие пальцем в этом кадре.
function touchActionOf(player) {
  if (mode === 'pvc') return Input.taps.some((t) => t.type === 'touch' && !onLeftHalf(t));
  return Input.taps.some((t) => t.type === 'touch' && onActionButtonOf(player, t));
}

function touchControls(player) {
  const act = () => touchActionOf(player);
  return {
    dir: () => (touchStickOf(player) || { dir: { x: 0, y: 0 } }).dir,
    action: act,
    shot: act,
    usesPointer: false,
  };
}

// ---------- Режим «2 игрока»: у каждого игрока своё управление ----------
// Игрок 0 — красный, игрок 1 — синий. Кто из них вратарь, меняется после каждого гола (goalieOwner).
//   2 геймпада: у каждого свой (первый подключённый — игрок 0).
//   1 геймпад: игрок 0 — геймпад, игрок 1 — клавиатура (стрелки/WASD + пробел/Enter) или мышь.
//   без геймпада: игрок 0 — WASD + пробел, игрок 1 — стрелки + Enter или мышь.
// Управление отвечает на три вопроса: куда ехать (dir), действие вратаря (action), бросок нападающего (shot).
// Мышь: держать кнопку — ехать к курсору; у вратаря нажатие — действие, у нападающего отпускание — бросок.
function padControls(i) {
  const act = () => Input.padPressedOf(i, ...PAD_ACTIONS);
  return { dir: () => Input.padDirectionOf(i), action: act, shot: act, usesPointer: false };
}

function keyboardControls(dir, keys, usesPointer) {
  const pressed = () => Input.wasPressed(...keys);
  return {
    dir,
    action: () => pressed() || (usesPointer && Input.pointer.pressed),
    shot: () => pressed() || (usesPointer && Input.pointer.released),
    usesPointer,
  };
}

function controlsOf(player) {
  if (tabletDuel()) return touchControls(player);
  const pads = Input.pads.length;
  if (pads >= 2) return padControls(player);
  if (pads === 1) {
    if (player === 0) return padControls(0);
    return keyboardControls(() => Input.keyDirection(), ['Space', 'Enter'], true);
  }
  if (player === 0) return keyboardControls(() => Input.wasdDirection(), ['Space'], false);
  return keyboardControls(() => Input.arrowsDirection(), ['Enter'], true);
}

function goalieControls() {
  return controlsOf(goalieOwner);
}

function skaterControls() {
  return controlsOf(1 - goalieOwner);
}

function goalieDirection() {
  if (mode === 'pvp') return goalieControls().dir();
  const stick = touchStickOf(0);
  if (stick) return stick.dir;
  return Input.direction();
}

function goalieMoveTarget() {
  if (mode === 'pvp') return goalieControls().usesPointer && Input.pointer.down ? toWorld(Input.pointer) : null;
  if (stickTouchOf(0)) return null;
  if (Input.lastDevice === 'mouse') return toWorld(Input.mouse);
  return null;
}

// Одна кнопка действия: без шайбы — ловить, с шайбой — бросать.
function goalieAction() {
  if (mode === 'pvp') return goalieControls().action();
  if (Input.wasPressed(...PAD_ACTIONS)) return true;
  if (Input.wasPressed('Space', 'Enter')) return true;
  return Input.taps.some((t) => t.type === 'mouse') || touchActionOf(0);
}

function skaterDirection() {
  return skaterControls().dir();
}

function skaterWantsShot() {
  return skaterControls().shot();
}

// ---------- Движение ----------

function moveToward(p, tx, ty, speed, dt) {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const step = Math.min(speed * dt, len);
  p.fx = dx / len;
  p.fy = dy / len;
  p.x += p.fx * step;
  p.y += p.fy * step;
}

function moveByDirection(p, d, speed, dt) {
  p.x += d.x * speed * dt;
  p.y += d.y * speed * dt;
}

function lookAt(p, x, y) {
  const dx = x - p.x;
  const dy = y - p.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  p.fx = dx / len;
  p.fy = dy / len;
}

function updateGoalie(dt) {
  const target = goalieMoveTarget();
  if (target) {
    moveToward(goalie, target.x, target.y, goalieSpeed(), dt);
  } else {
    moveByDirection(goalie, goalieDirection(), goalieSpeed(), dt);
  }
  goalie.x = Math.min(goalie.x, RINK.leftGoalX + GOALIE_ZONE);
  collideRink(goalie, GOALIE_R, 0);
  collideNets(goalie, GOALIE_R, 0, false);

  glove.open -= dt;
  glove.cooldown -= dt;
  const action = goalieAction();

  if (puck.owner !== goalie) {
    lookAt(goalie, puck.x, puck.y);
    if (action) openGlove();
    return;
  }
  radar.phase += (radarSpeed() * dt) / (4 * RADAR_AMP);
  const a = radarAngle();
  goalie.fx = Math.cos(a);
  goalie.fy = Math.sin(a);
  holdTimer -= dt;
  const canShoot = holdTimer < AUTO_THROW - MIN_HOLD;
  if ((action && canShoot) || holdTimer <= 0) shootByRadar();
}

function openGlove() {
  if (glove.cooldown > 0) return;
  glove.open = difficulty().gloveTime;
  glove.cooldown = difficulty().gloveTime + GLOVE_COOLDOWN;
  Sound.tone(900, 0.05, 'triangle', 0, 0.08);
}

// ---------- Прицел-радар ----------

function startRadar() {
  radar.center = Math.atan2(RINK.cy - goalie.y, RINK.rightGoalX - goalie.x) + rand(-0.25, 0.25);
  radar.phase = Math.random();
}

// Треугольная волна: прицел едет с постоянной скоростью от края до края и обратно.
function radarAngle() {
  const t = radar.phase % 1;
  const tri = 2 * Math.abs(2 * t - 1) - 1;
  return radar.center + tri * RADAR_AMP;
}

// Откуда вылетит шайба при броске под углом a — из ловушки перед вратарём.
function throwOrigin(a) {
  return { x: goalie.x + Math.cos(a) * (GOALIE_R + 10), y: goalie.y + Math.sin(a) * (GOALIE_R + 10) };
}

function aimPath(a) {
  const o = throwOrigin(a);
  // Проверяем створ там, где шайба впервые касается линии ворот краем — там же его проверяет физика.
  return tracePath(o.x, o.y, Math.cos(a), Math.sin(a), PUCK_R, RINK.rightGoalX, RADAR_BOUNCES, [NETS.left]);
}

// Куда попадёт бросок по текущему прицелу (с отскоками от бортов) и в створ ли.
function radarAim() {
  const angle = radarAngle();
  const path = aimPath(angle);
  const onTarget = path.yHit !== null
    && Math.abs(path.yHit - RINK.cy) < RINK.goalHalf - PUCK_R + difficulty().aimAssist
    && reachesEnd(path.points, THROW_SPEED)
    && clearsPosts(path.points, NETS.right);
  return { angle, path, onTarget };
}

// При крутом заходе шайба может задеть штангу, даже если центр проходит в створ.
function clearsPosts(points, box) {
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  return [box.y0, box.y1].every((y) => distToSegment(box.front, y, a, b) > PUCK_R + 3);
}

// Долетит ли шайба по пути до конца, не успев сильно затормозить (торможение + потери на отскоках).
function reachesEnd(points, speed) {
  const k = -Math.log(PUCK_FRICTION); // при таком торможении скорость падает на k за каждый пиксель пути
  let v = speed;
  for (let i = 1; i < points.length; i++) {
    if (i > 1) v *= BOARD_BOUNCE_KEEP;
    v -= k * Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return v > SLOW_PUCK + 100;
}

// Зелёный прицел прощает маленький промах: ищем ближайший угол, при котором шайба точно в створе.
function correctedAngle(a) {
  const inner = RINK.goalHalf - PUCK_R - 16; // запас от штанги
  const inside = (angle) => {
    const path = aimPath(angle);
    return path.yHit !== null && Math.abs(path.yHit - RINK.cy) < inner
      && reachesEnd(path.points, THROW_SPEED) && clearsPosts(path.points, NETS.right);
  };
  for (let d = 0; d <= 0.15; d += 0.001) {
    if (inside(a + d)) return a + d;
    if (inside(a - d)) return a - d;
  }
  return a;
}

function shootByRadar() {
  const aim = radarAim();
  const a = aim.onTarget ? correctedAngle(aim.angle) : aim.angle;
  Object.assign(puck, throwOrigin(a));
  launchPuck(puck.x + Math.cos(a) * 1000, puck.y + Math.sin(a) * 1000, THROW_SPEED);
  goalie.cooldown = 0.5;
  goalie.swing = 1;
  skater.cooldown = 0; // нападающий может перехватить бросок вратаря сразу
  skaterReaction = reactionTime();
}

function updateAiSkater(dt) {
  const speed = skaterSpeed();
  if (puck.owner === goalie && canStealFromGoalie()) {
    // Вратарь выехал с шайбой из своей зоны — на высоком уровне компьютер едет отбирать.
    moveToward(skater, puck.x, puck.y, speed, dt);
    return;
  }
  if (puck.owner === goalie) {
    // Караулит, гуляя вверх-вниз посреди площадки: вратарю надо выбрать момент, когда путь свободен.
    patrolPhase += PATROL_FREQ * dt;
    moveToward(skater, PATROL_X, RINK.cy + Math.sin(patrolPhase) * PATROL_AMP, speed, dt);
    return;
  }
  if (puck.owner !== skater) {
    skaterReaction -= dt;
    if (skaterReaction > 0) return;
    const target = interceptPoint(skater, speed);
    moveToward(skater, target.x, target.y, speed, dt);
    return;
  }
  skaterHeld += dt;
  if (wrap && followWrap(speed, dt)) return;
  moveToward(skater, shotSpot.x, shotSpot.y, speed, dt);
  shotSpot.timer -= dt;
  if (skaterHeld < minSkaterHold()) return; // пауза: вратарь успевает приготовиться
  const arrived = Math.hypot(shotSpot.x - skater.x, shotSpot.y - skater.y) < 20;
  if (!arrived && shotSpot.timer > 0) return;
  if (!shotSpot.faked && Math.random() < fakeChance()) {
    pickShotSpot(true);
    return;
  }
  aiShoot();
}

function updateHumanSkater(dt) {
  if (skaterControls().usesPointer && Input.pointer.down) {
    const t = toWorld(Input.pointer);
    moveToward(skater, t.x, t.y, humanSkaterSpeed(), dt);
  } else {
    const d = skaterDirection();
    if (d.x || d.y) moveToward(skater, skater.x + d.x * 1000, skater.y + d.y * 1000, humanSkaterSpeed(), dt);
  }
  if (skaterWantsShot() && puck.owner === skater) humanShoot();
}

function updateSkater(dt) {
  if (skaterIsHuman()) updateHumanSkater(dt);
  else updateAiSkater(dt);
  keepOutOfCrease(skater);
  collideRink(skater, SKATER_R, 0);
  collideNets(skater, SKATER_R, 0, false);
}

// Нападающий не заезжает в синюю зону перед воротами вратаря (за ворота — можно).
function keepOutOfCrease(p) {
  const dx = p.x - RINK.leftGoalX;
  const dy = p.y - RINK.cy;
  if (dx < 0) return;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist >= CREASE_KEEP_OUT) return;
  p.x = RINK.leftGoalX + (dx / dist) * CREASE_KEEP_OUT;
  p.y = RINK.cy + (dy / dist) * CREASE_KEEP_OUT;
}

function separate(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const min = a.r + b.r;
  if (dist >= min || dist === 0) return;
  const push = (min - dist) / 2;
  a.x -= (dx / dist) * push;
  a.y -= (dy / dist) * push;
  b.x += (dx / dist) * push;
  b.y += (dy / dist) * push;
}

// ---------- Шайба ----------

function launchPuck(tx, ty, speed) {
  const dx = tx - puck.x;
  const dy = ty - puck.y;
  const len = Math.hypot(dx, dy) || 1;
  puck.vx = (dx / len) * speed;
  puck.vy = (dy / len) * speed;
  puck.owner = null;
  Sound.tone(120, 0.08, 'sawtooth', 0, 0.25);
  Sound.tone(700, 0.05, 'square', 0, 0.1);
}

function skaterShot(tx, ty) {
  launchPuck(tx, ty, shotSpeed());
  puck.shot = true;
  skater.cooldown = 0.6;
  skater.swing = 1;
}

function distToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

// Насколько путь шайбы проходит мимо ловушки вратаря (меньше нуля — прямо в руки).
function clearance(points) {
  let min = Infinity;
  for (let i = 1; i < points.length; i++) {
    min = Math.min(min, distToSegment(goalie.x, goalie.y, points[i - 1], points[i]));
  }
  return min - catchReach();
}

// Варианты броска: в разные точки створа напрямую, а на высоких уровнях — ещё и через борт.
function aiShotOptions() {
  const from = { x: puck.x, y: puck.y };
  const inner = RINK.goalHalf - PUCK_R - 12;
  const allowBank = Math.random() < bankChance();
  const options = [];
  for (let i = -2; i <= 2; i++) {
    const ty = RINK.cy + (inner * i) / 2;
    const goalPoint = { x: RINK.leftGoalX, y: ty };
    options.push({ aim: { x: RINK.leftGoalX - 30, y: ty }, points: [from, goalPoint] });
    if (!allowBank) continue;
    for (const wall of [-1, 1]) {
      const bank = bankTarget(from.x, from.y, RINK.leftGoalX, ty, wall, PUCK_R);
      if (bank) options.push({ aim: bank, points: [from, bank.bounce, goalPoint] });
    }
  }
  return options;
}

// Компьютер старается бросить туда, где вратаря нет. Но не идеально: чем ниже уровень, тем больше
// он ошибается в оценке (шум), и даже на максимуме ошибка не исчезает совсем.
function aiShoot() {
  const noise = aimNoise();
  let best = null;
  let bestScore = -Infinity;
  for (const option of aiShotOptions()) {
    const score = clearance(option.points) + rand(-noise, noise);
    if (score <= bestScore) continue;
    best = option;
    bestScore = score;
  }
  skaterShot(best.aim.x, best.aim.y);
}

// Человек бросает туда, куда смотрит нападающий; если смотрит не в сторону ворот — прямо в ворота.
function humanShoot() {
  if (skater.fx < -0.3) {
    skaterShot(puck.x + skater.fx * 1000, puck.y + skater.fy * 1000);
    return;
  }
  skaterShot(RINK.leftGoalX - 30, RINK.cy);
}

function holdPoint(p) {
  const reach = p === goalie ? GOALIE_R + 10 : SKATER_R + 26;
  return { x: p.x + p.fx * reach, y: p.y + p.fy * reach };
}

function touchesPuck(p) {
  const fast = Math.hypot(puck.vx, puck.vy) > FAST_PUCK;
  return Math.hypot(puck.x - p.x, puck.y - p.y) < p.r + PUCK_R + (fast ? 4 : 14);
}

// Где будет свободная шайба через t секунд (с учётом торможения, без отскоков).
function puckPositionAt(t) {
  const k = -Math.log(PUCK_FRICTION);
  const travel = (1 - Math.pow(PUCK_FRICTION, t)) / k;
  return { x: puck.x + puck.vx * travel, y: puck.y + puck.vy * travel };
}

// Перехват: самая ранняя точка пути шайбы, куда игрок успеет доехать раньше неё.
// Шайба быстрее игрока, поэтому успеть можно, только если путь проходит рядом.
function interceptPoint(p, speed) {
  const reach = p.r + PUCK_R;
  for (let t = 0; t <= 3; t += 0.05) {
    const q = puckPositionAt(t);
    if (Math.hypot(q.x - p.x, q.y - p.y) - reach <= speed * t) return q;
  }
  return puckPositionAt(10);
}

// Быструю шайбу ловит только раскрытая ловушка (по кнопке) — за это звезда.
// Медленную свободную шайбу вратарь берёт просто касанием, без звезды.
// Раскрытой ловушкой можно отобрать шайбу и у нападающего, если он подъехал близко.
function goalieCatch() {
  if (puck.owner === goalie || goalie.cooldown > 0) return;
  const dist = Math.hypot(puck.x - goalie.x, puck.y - goalie.y);
  const gloveCatch = glove.open > 0 && dist <= catchReach();
  const slow = !puck.owner && Math.hypot(puck.vx, puck.vy) < SLOW_PUCK;
  const pickUp = slow && dist <= GOALIE_R + PUCK_R + 14;
  if (!gloveCatch && !pickUp) return;
  const wasShot = puck.shot && gloveCatch;
  if (puck.owner === skater) skater.cooldown = 0.8;
  puck.owner = goalie;
  puck.shot = false;
  glove.open = 0;
  glove.cooldown = 0;
  holdTimer = AUTO_THROW;
  startRadar();
  if (!wasShot) {
    Sound.tone(500, 0.05, 'triangle', 0, 0.15);
    return;
  }
  score.saves += 1;
  saveFlash = 1;
  Effects.burst(goalie.x, goalie.y, 50, 1);
  Sound.melody([660, 880, 1320], 0.08, 'square', 0.12);
}

// Не поймал — шайба отскакивает от вратаря.
function goalieBlock() {
  if (puck.owner) return;
  const dx = puck.x - goalie.x;
  const dy = puck.y - goalie.y;
  const dist = Math.hypot(dx, dy);
  const min = GOALIE_R + PUCK_R;
  if (dist >= min || dist === 0) return;
  const nx = dx / dist;
  const ny = dy / dist;
  puck.x = goalie.x + nx * min;
  puck.y = goalie.y + ny * min;
  const vn = puck.vx * nx + puck.vy * ny;
  if (vn >= 0) return;
  puck.vx -= 1.6 * vn * nx;
  puck.vy -= 1.6 * vn * ny;
  Sound.tone(160, 0.06, 'triangle', 0, 0.2);
}

// Как в настоящем хоккее: в своей синей зоне вратарь неприкосновенен,
// а выехал с шайбой за её пределы — шайбу можно отобрать.
// Компьютер так делает только на высоком уровне, второй игрок — всегда.
function goalieOutOfCrease() {
  return Math.hypot(goalie.x - RINK.leftGoalX, goalie.y - RINK.cy) > RINK.creaseR;
}

function canStealFromGoalie() {
  if (!goalieOutOfCrease()) return false;
  return mode === 'pvp' || level() >= STEAL_LEVEL;
}

function skaterPickup() {
  if (skater.cooldown > 0 || !touchesPuck(skater)) return;
  const steal = puck.owner === goalie && canStealFromGoalie();
  if (puck.owner && !steal) return;
  if (steal) {
    goalie.cooldown = 0.8;
    Sound.tone(300, 0.08, 'sawtooth', 0, 0.15);
  }
  puck.owner = skater;
  puck.shot = false;
  skaterHeld = 0;
  Sound.tone(400, 0.05, 'triangle', 0, 0.12);
  pickShotSpot();
}

function updatePuck(dt) {
  puck.prev = { x: puck.x, y: puck.y };
  if (puck.owner) {
    const p = holdPoint(puck.owner);
    puck.x = p.x;
    puck.y = p.y;
    collideRink(puck, PUCK_R, 0);
  } else {
    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;
    const slow = Math.hypot(puck.vx, puck.vy) < SLOW_PUCK;
    const friction = Math.pow(slow ? SLOW_FRICTION : PUCK_FRICTION, dt);
    puck.vx *= friction;
    puck.vy *= friction;
    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed < 15) {
      puck.vx = 0;
      puck.vy = 0;
    }
    // Отскок зеркальный (угол падения = углу отражения), чтобы броски через борт были предсказуемыми.
    const hitBoards = collideRink(puck, PUCK_R, 1);
    const hitNet = collideNets(puck, PUCK_R, 1, true);
    if (hitBoards || hitNet) {
      puck.vx *= BOARD_BOUNCE_KEEP;
      puck.vy *= BOARD_BOUNCE_KEEP;
      if (speed > 120) Sound.tone(220, 0.05, 'triangle', 0, 0.2);
    }
  }
  goalieCatch();
  goalieBlock();
  skaterPickup();
}

// ---------- Голы ----------

// «2 игрока»: гол — праздник для того, кто забил, и потом игроки меняются ролями.
function pvpGoal(scorer) {
  pvpScore[scorer] += 1;
  state = 'goal';
  goalInfo = { mine: false, pvpScorer: scorer, timer: 3 };
  Effects.rain(100);
  Sound.tone(196, 1.0, 'sawtooth', 0, 0.12);
  Sound.tone(247, 1.0, 'sawtooth', 0, 0.12);
  Sound.melody([523, 659, 784, 1047], 0.12, 'square', 0.12);
}

function letIn() {
  if (mode === 'pvp') return pvpGoal(1 - goalieOwner);
  score.goals += 1;
  state = 'goal';
  goalInfo = { mine: false, timer: 1.8 };
  Sound.melody([392, 330, 262], 0.18, 'triangle');
}

// Вратарь забросил через всю площадку — праздник!
function goalieScored() {
  if (mode === 'pvp') return pvpGoal(goalieOwner);
  score.mine += 1;
  state = 'goal';
  goalInfo = { mine: true, timer: 3 };
  Effects.burst(RINK.rightGoalX, RINK.cy, 120, -1);
  Effects.rain(120);
  Sound.tone(196, 1.0, 'sawtooth', 0, 0.12);
  Sound.tone(247, 1.0, 'sawtooth', 0, 0.12);
  Sound.melody([523, 659, 784, 1047, 784, 1047], 0.12, 'square', 0.12);
}

// Шайба зашла в сетку спереди — пересекла линию ворот между штангами (а не проскочила сбоку).
function enteredThroughMouth(box) {
  const { x: px, y: py } = puck.prev;
  if ((px - box.front) * box.dir < 0) return false;
  const t = (box.front - px) / (puck.x - px || 1e-9);
  const y = py + (puck.y - py) * t;
  return y > box.y0 && y < box.y1;
}

function checkGoal() {
  if (puck.owner) return;
  const side = puckInNet(puck.x, puck.y);
  if (!side) return;
  const box = NETS[side];
  if (!enteredThroughMouth(box)) {
    // Влетела в сетку сбоку или сзади — отскакивает.
    pushOutOfBox(puck, PUCK_R, box);
    puck.vx *= -0.5;
    puck.vy *= -0.5;
    return;
  }
  if (side === 'left') letIn();
  else goalieScored();
}

// ---------- Меню ----------

// Выбор режима всегда начинает игру заново; «Продолжить» есть, только если игра на паузе.
const CONTINUE_ITEM = { icon: 'play', label: 'Продолжить', color: '#43a047', action: resume };
const MODE_ITEMS = [
  { icon: 'pvc', label: '1 игрок', color: '#fb8c00', action: () => newGame('pvc') },
  { icon: 'pvp', label: '2 игрока', color: '#8e24aa', action: () => newGame('pvp') },
];
// Сложность — ряд из трёх кнопок (Легко / Средне / Трудно), все видны сразу. Нажатие выбирает уровень;
// с клавиатуры/геймпада — влево/вправо, Enter переключает по кругу. Игру не перезапускает.
const DIFFICULTY_ITEM = {
  icon: 'difficulty',
  action: () => setDifficulty(difficultyIndex + 1),
};

function difficultyRect(row, i) {
  const gap = 16;
  const w = (row.w - gap * (DIFFICULTIES.length - 1)) / DIFFICULTIES.length;
  return { x: row.x + i * (w + gap), y: row.y, w, h: row.h };
}
let menuIndex = 0;

function menuItems() {
  const items = [...MODE_ITEMS, DIFFICULTY_ITEM];
  return pausedState ? [CONTINUE_ITEM, ...items] : items;
}

function resume() {
  state = pausedState;
  pausedState = null;
}

function menuItemRect(i) {
  const items = menuItems();
  const h = 120;
  const gap = 30;
  const top = RINK.cy - (items.length * h + (items.length - 1) * gap) / 2;
  return { x: RINK.cx - 300, y: top + i * (h + gap), w: 600, h };
}

function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function menuButtonClicked() {
  if (!Input.pointer.pressed) return false;
  const p = toHud(Input.pointer);
  return Math.hypot(p.x - menuButton().x, p.y - menuButton().y) < menuButton().r + 10;
}

function openMenu() {
  Input.swallowPointer();
  pausedState = state;
  state = 'menu';
  menuIndex = 0;
  Sound.tone(600, 0.06, 'triangle', 0, 0.12);
}

function wantsMenu() {
  return Input.wasPressed('Escape', 'PadStart', 'PadSelect') || menuButtonClicked();
}

function chooseMenuItem(i) {
  Sound.tone(800, 0.08, 'triangle', 0, 0.15);
  Input.swallowPointer();
  menuItems()[i].action();
}

function updateMenu() {
  const items = menuItems();
  if (pausedState && Input.wasPressed('Escape', 'PadStart', 'PadSelect', 'PadB')) {
    resume();
    return;
  }
  const n = items.length;
  if (Input.wasPressed('ArrowUp', 'KeyW', 'PadUp')) menuIndex = (menuIndex + n - 1) % n;
  if (Input.wasPressed('ArrowDown', 'KeyS', 'PadDown')) menuIndex = (menuIndex + 1) % n;
  menuIndex = (menuIndex + n + stickMenuStep()) % n;

  if (items[menuIndex] === DIFFICULTY_ITEM) {
    if (Input.wasPressed('ArrowLeft', 'KeyA', 'PadLeft')) setDifficulty(difficultyIndex - 1);
    if (Input.wasPressed('ArrowRight', 'KeyD', 'PadRight')) setDifficulty(difficultyIndex + 1);
  }
  if (Input.wasPressed('Enter', 'Space', 'PadA')) return chooseMenuItem(menuIndex);
  if (!Input.pointer.pressed) return;
  const p = toHud(Input.pointer);
  const hit = items.findIndex((_, i) => pointInRect(p, menuItemRect(i)));
  if (hit < 0) return;
  if (items[hit] !== DIFFICULTY_ITEM) return chooseMenuItem(hit);
  const row = menuItemRect(hit);
  const level = DIFFICULTIES.findIndex((_, i) => pointInRect(p, difficultyRect(row, i)));
  if (level < 0) return;
  menuIndex = hit;
  setDifficulty(level);
  Input.swallowPointer();
  Sound.tone(800, 0.08, 'triangle', 0, 0.15);
}

// Стик в меню: один шаг на одно отклонение.
let stickWasTilted = false;
function stickMenuStep() {
  const y = Input.stick.y;
  const tilted = Math.abs(y) > 0.6;
  const step = tilted && !stickWasTilted ? Math.sign(y) : 0;
  stickWasTilted = tilted;
  return step;
}

// ---------- Цикл ----------

function update(dt) {
  if (Input.anyPress()) Sound.unlock();
  Effects.update(dt);
  saveFlash = Math.max(0, saveFlash - dt);
  goalie.swing = Math.max(0, goalie.swing - dt / SWING_TIME);
  skater.swing = Math.max(0, skater.swing - dt / SWING_TIME);

  if (state === 'menu') {
    updateMenu();
    return;
  }
  if (wantsMenu()) {
    openMenu();
    return;
  }
  if (state === 'goal') {
    goalInfo.timer -= dt;
    if (goalInfo.timer > 0) return;
    state = 'play';
    if (mode === 'pvp') goalieOwner = 1 - goalieOwner; // меняемся ролями
    faceoff();
    return;
  }

  goalie.cooldown -= dt;
  skater.cooldown -= dt;
  updateGoalie(dt);
  updateSkater(dt);
  separate(goalie, skater);
  updatePuck(dt);
  checkGoal();
}

// ---------- Рисование ----------

// Угол клюшки: замах при броске (сначала назад-вправо, потом резко вперёд-влево и обратно)
// и покачивание, пока нападающий ведёт шайбу.
function stickAngle(p, time) {
  let angle = 0;
  if (p.swing > 0) {
    const t = 1 - p.swing;
    angle = t < 0.4 ? 0.9 - (1.5 * t) / 0.4 : -0.6 + (0.6 * (t - 0.4)) / 0.6;
  }
  if (puck.owner === p && p === skater) angle += Math.sin(time * 14) * 0.18;
  return angle;
}

// Клюшка в системе координат игрока: x — вперёд, y — вправо. Крутится вокруг рук.
function drawStick(p, time) {
  const isGoalie = p === goalie;
  const hands = { x: p.r * 0.15, y: p.r * 0.75 };
  const heel = { x: p.r + (isGoalie ? 6 : 8), y: isGoalie ? 14 : 6 }; // где рукоятка переходит в крюк
  const bladeLen = isGoalie ? 40 : 30;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(p.fy, p.fx));
  ctx.translate(hands.x, hands.y);
  ctx.rotate(stickAngle(p, time));
  ctx.translate(-hands.x, -hands.y);
  ctx.lineCap = 'round';

  // Рукоятка: тёмный контур, светлое дерево, чёрная обмотка у рук.
  drawLine(ctx, hands.x, hands.y, heel.x, heel.y, '#4e342e', 11);
  drawLine(ctx, hands.x, hands.y, heel.x, heel.y, '#d7a86e', 6);
  if (isGoalie) {
    // У вратарской клюшки нижняя часть широкая.
    const mid = { x: (hands.x + heel.x * 2) / 3, y: (hands.y + heel.y * 2) / 3 };
    drawLine(ctx, mid.x, mid.y, heel.x, heel.y, '#4e342e', 16);
    drawLine(ctx, mid.x, mid.y, heel.x, heel.y, '#d7a86e', 11);
  }
  drawLine(ctx, hands.x, hands.y, hands.x + (heel.x - hands.x) * 0.15, hands.y + (heel.y - hands.y) * 0.15, '#212121', 8);

  // Крюк: изогнутый, чёрный, с белой полоской ленты.
  ctx.strokeStyle = '#212121';
  ctx.lineWidth = isGoalie ? 13 : 10;
  ctx.beginPath();
  ctx.moveTo(heel.x - 2, heel.y + 4);
  ctx.quadraticCurveTo(heel.x + 10, heel.y - bladeLen * 0.5, heel.x + 4, heel.y - bladeLen);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(heel.x + 3, heel.y - bladeLen * 0.25);
  ctx.quadraticCurveTo(heel.x + 8, heel.y - bladeLen * 0.5, heel.x + 5, heel.y - bladeLen * 0.75);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(p, time) {
  const { x, y, fx, fy, r } = p;
  const px = -fy; // перпендикуляр к направлению взгляда
  const py = fx;

  drawStick(p, time);

  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  drawCircle(ctx, x, y, r, '#ffffff', 4);

  // Шлем с глазками — смотрит туда же, куда игрок.
  const hx = x + fx * 4;
  const hy = y + fy * 4;
  ctx.fillStyle = '#263238';
  ctx.beginPath();
  ctx.arc(hx, hy, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  for (const side of [-1, 1]) {
    const ex = hx + fx * r * 0.3 + px * 8 * side;
    const ey = hy + fy * r * 0.3 + py * 8 * side;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(ex + fx * 2, ey + fy * 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p === goalie) drawGoalieMask(hx, hy, r * 0.55, fx, fy);
  else drawVisor(hx, hy, r * 0.55, fx, fy);
}

// Вратарский шлем: решётка-маска на лице.
function drawGoalieMask(hx, hy, hr, fx, fy) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(Math.atan2(fy, fx));
  ctx.beginPath();
  ctx.arc(0, 0, hr, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = '#cfd8dc';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const x of [hr * 0.25, hr * 0.55, hr * 0.85]) {
    ctx.moveTo(x, -hr);
    ctx.lineTo(x, hr);
  }
  for (const y of [-hr * 0.35, hr * 0.35]) {
    ctx.moveTo(hr * 0.1, y);
    ctx.lineTo(hr, y);
  }
  ctx.stroke();
  ctx.restore();
  drawCircle(ctx, hx, hy, hr, '#eceff1', 3);
}

// Шлем нападающего: прозрачный визор спереди.
function drawVisor(hx, hy, hr, fx, fy) {
  const a = Math.atan2(fy, fx);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(170,215,255,0.6)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(hx, hy, hr - 4, a - 0.95, a + 0.95);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hx, hy, hr - 7, a - 0.6, a - 0.2);
  ctx.stroke();
  ctx.restore();
}


// У вратаря большая ловушка (перчатка) сбоку. Раскрытая — больше, и видно, докуда она достаёт.
function drawGlove() {
  const open = glove.open > 0;
  if (open) {
    ctx.fillStyle = 'rgba(255,213,0,0.25)';
    ctx.beginPath();
    ctx.arc(goalie.x, goalie.y, catchReach(), 0, Math.PI * 2);
    ctx.fill();
    drawCircle(ctx, goalie.x, goalie.y, catchReach(), '#ffd600', 4);
  }
  const px = -goalie.fy;
  const py = goalie.fx;
  const gx = goalie.x - px * (GOALIE_R + 6) + goalie.fx * 10;
  const gy = goalie.y - py * (GOALIE_R + 6) + goalie.fy * 10;
  const r = open ? 30 : 20;
  ctx.fillStyle = open ? '#ffd600' : '#ffb300';
  ctx.beginPath();
  ctx.arc(gx, gy, r, 0, Math.PI * 2);
  ctx.fill();
  drawCircle(ctx, gx, gy, r, '#ffffff', 3);
}

function strokePolyline(points, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}

// Прицел: пунктир от шайбы с отскоками от бортов. Зелёный — сейчас бросок попадёт в ворота.
function drawRadar() {
  if (puck.owner !== goalie || state !== 'play') return;
  const aim = radarAim();
  const points = aim.path.points;
  const end = points[points.length - 1];
  const color = aim.onTarget ? '#00e676' : 'rgba(255,255,255,0.85)';

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.setLineDash([24, 16]);
  ctx.lineDashOffset = -performance.now() / 20;
  strokePolyline(points, 'rgba(0,0,0,0.35)', aim.onTarget ? 14 : 10);
  strokePolyline(points, color, aim.onTarget ? 8 : 5);
  ctx.restore();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(end.x, end.y, aim.onTarget ? 18 : 10, 0, Math.PI * 2);
  ctx.fill();
}

function drawPuck() {
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, PUCK_R, 0, Math.PI * 2);
  ctx.fill();
  drawCircle(ctx, puck.x, puck.y, PUCK_R - 4, '#555555', 2);
}

function drawStar(x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawBadge(x, y, color, value) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 36, 0, Math.PI * 2);
  ctx.fill();
  drawCircle(ctx, x, y, 36, '#ffffff', 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(value), x, y + 3);
}

// Кем сейчас играет игрок (для «2 игрока»): вратарь или нападающий.
function roleOf(player) {
  if (mode === 'pvc') return goalie;
  return player === goalieOwner ? goalie : skater;
}

// Кнопки действия для планшета: у вратаря ловушка (поймать) или клюшка (бросить), у нападающего — клюшка.
// Значок повёрнут к своему игроку. Цвет рамки — цвет игрока.
function drawActionButtons(time) {
  if (!showTouchControls() || state !== 'play') return;
  for (const player of touchPlayers()) {
    const { x, y, r, rot } = actionButtonOf(player);
    const role = roleOf(player);
    const holding = puck.owner === role;
    const isGoalie = role === goalie;
    const pulse = holding ? 1 + 0.05 * Math.sin(time * 8) : 1;
    let fill = '#ffb300';
    if (holding) fill = '#43a047';
    else if (isGoalie && glove.open > 0) fill = '#ffd600';
    else if (!isGoalie) fill = '#90a4ae'; // нападающему без шайбы бросать нечего
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
    ctx.fill();
    drawCircle(ctx, x, y, r * pulse, mode === 'pvp' ? PLAYER_COLORS[player] : '#ffffff', 8);
    ctx.globalAlpha = 1;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.font = `${Math.round(r * 0.9)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isGoalie && !holding ? '🧤' : '🏒', 0, 4);
    ctx.restore();
  }
}

// Экранные джойстики: основание там, где коснулся, и «шляпка» под пальцем.
// Пока пальца нет — бледная подсказка под левую руку игрока.
function drawJoysticks() {
  if (!showTouchControls() || state !== 'play') return;
  for (const player of touchPlayers()) {
    const stick = touchStickOf(player);
    const home = stickHomeOf(player);
    const base = stick ? stick.base : home;
    const knob = stick ? stick.knob : home;
    ctx.save();
    ctx.globalAlpha = stick ? 0.8 : 0.35;
    ctx.fillStyle = 'rgba(38,56,89,0.5)';
    ctx.beginPath();
    ctx.arc(base.x, base.y, STICK_RADIUS + 20, 0, Math.PI * 2);
    ctx.fill();
    drawCircle(ctx, base.x, base.y, STICK_RADIUS + 20, mode === 'pvp' ? PLAYER_COLORS[player] : '#ffffff', 5);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(knob.x, knob.y, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawScore() {
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = view.screen.top + 48;
  if (mode === 'pvp') {
    // «2 игрока»: голы каждого игрока, цвет — по игроку (не по роли).
    drawBadge(RINK.cx - 70, y, PLAYER_COLORS[0], pvpScore[0]);
    drawBadge(RINK.cx + 70, y, PLAYER_COLORS[1], pvpScore[1]);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(':', RINK.cx, y - 4);
    return;
  }
  drawBadge(RINK.cx - 70, y, goalie.color, score.mine);
  drawBadge(RINK.cx + 70, y, skater.color, score.goals);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(':', RINK.cx, y - 4);

  // Звёзды за пойманные броски — отдельно, слева.
  drawStar(RINK.cx - 330, y, 32, '#ffd600');
  ctx.fillStyle = '#ffd600';
  ctx.textAlign = 'left';
  ctx.fillText(String(score.saves), RINK.cx - 285, y + 2);
  drawLevelBar(RINK.cx + 170, y);
}

// Шкала уровня: 10 делений от зелёного к красному — насколько сейчас сильный соперник.
// Растёт с каждой звездой (на «Трудно» начинается не с нуля).
function drawLevelBar(x, y) {
  const segments = 10;
  const w = 26;
  const gap = 5;
  const h = 34;
  const filled = Math.min(segments, Math.ceil((level() / MAX_LEVEL) * segments));
  ctx.font = '36px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚡', x, y + 2);
  for (let i = 0; i < segments; i++) {
    const hue = 120 - (120 * i) / (segments - 1); // зелёный → жёлтый → красный
    const sx = x + 50 + i * (w + gap);
    const sh = h * (0.55 + (0.45 * i) / (segments - 1)); // деления растут, как лесенка
    ctx.fillStyle = i < filled ? `hsl(${hue}, 85%, 52%)` : 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.roundRect(sx, y + h / 2 - sh, w, sh, 5);
    ctx.fill();
  }
}

// Номер версии мелко в правом верхнем углу — чтобы видеть, обновилась ли игра на iPad.
function drawVersion() {
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(VERSION, view.screen.right - 12, view.screen.top + 8);
}

function drawMenuButton() {
  const { x, y, r } = menuButton();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  for (const dy of [-12, 0, 12]) drawLine(ctx, x - 16, y + dy, x + 16, y + dy, '#ffffff', 6);
}

function drawSaveFlash() {
  if (saveFlash <= 0) return;
  const t = 1 - saveFlash;
  ctx.save();
  ctx.globalAlpha = Math.min(1, saveFlash * 2);
  drawStar(goalie.x, goalie.y - GOALIE_R - 30 - t * 60, 30 + t * 30, '#ffd600');
  ctx.restore();
}

function drawGoalText(time) {
  const pulse = 1 + 0.08 * Math.sin(time * 12);
  ctx.save();
  ctx.translate(RINK.cx, RINK.cy);
  ctx.scale(pulse, pulse);
  ctx.font = 'bold 240px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#c62828';
  ctx.strokeText('ГОЛ!', 0, 0);
  ctx.fillStyle = '#ffd600';
  ctx.fillText('ГОЛ!', 0, 0);
  ctx.restore();
}

// «2 игрока»: «ГОЛ!» цветом забившего и «Меняемся!» — дальше роли поменяются.
function drawSwapText(time, scorer) {
  const pulse = 1 + 0.06 * Math.sin(time * 10);
  ctx.save();
  ctx.translate(RINK.cx, RINK.cy - 60);
  ctx.scale(pulse, pulse);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 200px sans-serif';
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText('ГОЛ!', 0, 0);
  ctx.fillStyle = PLAYER_COLORS[scorer];
  ctx.fillText('ГОЛ!', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 80px sans-serif';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#263859';
  ctx.strokeText('🔄 Меняемся!', RINK.cx, RINK.cy + 120);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('🔄 Меняемся!', RINK.cx, RINK.cy + 120);
  ctx.restore();
}

function drawPlayIcon(x, y, size) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.3, y - size * 0.45);
  ctx.lineTo(x + size * 0.5, y);
  ctx.lineTo(x - size * 0.3, y + size * 0.45);
  ctx.closePath();
  ctx.fill();
}

// Иконка-человечек: кружок-шлем с глазками.
function drawHead(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  drawCircle(ctx, x, y, r, '#ffffff', 4);
  ctx.fillStyle = '#ffffff';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + side * r * 0.35, y - r * 0.1, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Компьютер: экран с глазками-квадратиками.
function drawRobot(x, y, r) {
  ctx.fillStyle = '#90a4ae';
  ctx.beginPath();
  ctx.roundRect(x - r, y - r, r * 2, r * 2, r * 0.3);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#263238';
  ctx.fillRect(x - r * 0.6, y - r * 0.4, r * 0.4, r * 0.4);
  ctx.fillRect(x + r * 0.2, y - r * 0.4, r * 0.4, r * 0.4);
  ctx.fillRect(x - r * 0.5, y + r * 0.3, r, r * 0.15);
}

function drawMenuIcon(icon, x, y) {
  if (icon === 'play') return drawPlayIcon(x, y, 90);
  if (icon === 'difficulty') {
    for (let i = 0; i < 3; i++) {
      drawStar(x - 38 + i * 38, y, 20, i < difficulty().stars ? '#ffd600' : 'rgba(255,255,255,0.25)');
    }
    return;
  }
  if (icon === 'pvc') {
    drawHead(x - 22, y, 28, PLAYER_COLORS[0]);
    drawRobot(x + 34, y, 24);
    return;
  }
  drawHead(x - 22, y, 28, PLAYER_COLORS[0]);
  drawHead(x + 34, y, 28, PLAYER_COLORS[1]);
}

function drawOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const s = view.screen;
  ctx.fillRect(s.left, s.top, s.right - s.left, s.bottom - s.top);
}

// Ряд сложности: три кнопки, выбранная — яркая с жёлтой рамкой, остальные приглушены.
function drawDifficultyRow(row, focused, time) {
  DIFFICULTIES.forEach((d, i) => {
    const r = difficultyRect(row, i);
    const chosen = i === difficultyIndex;
    const grow = chosen && focused ? 1 + 0.04 * Math.sin(time * 6) : 1;
    ctx.save();
    ctx.globalAlpha = chosen ? 1 : 0.55;
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.scale(grow, grow);
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.roundRect(-r.w / 2, -r.h / 2, r.w, r.h, 32);
    ctx.fill();
    ctx.strokeStyle = chosen ? '#ffd600' : '#ffffff';
    ctx.lineWidth = chosen ? 12 : 4;
    ctx.stroke();
    for (let s = 0; s < 3; s++) {
      drawStar(-34 + s * 34, -26, 15, s < d.stars ? '#ffd600' : 'rgba(255,255,255,0.3)');
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.label, 0, 28);
    ctx.restore();
  });
}

function drawMenu(time) {
  drawOverlay();
  menuItems().forEach((item, i) => {
    const r = menuItemRect(i);
    const selected = i === menuIndex;
    if (item === DIFFICULTY_ITEM) {
      drawDifficultyRow(r, selected, time);
      return;
    }
    const grow = selected ? 1 + 0.04 * Math.sin(time * 6) : 1;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.scale(grow, grow);
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.roundRect(-r.w / 2, -r.h / 2, r.w, r.h, 40);
    ctx.fill();
    ctx.strokeStyle = selected ? '#ffd600' : '#ffffff';
    ctx.lineWidth = selected ? 12 : 5;
    ctx.stroke();

    const iconX = -r.w / 2 + 100;
    drawMenuIcon(item.icon, iconX, 0);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, iconX + 100, 4);
    ctx.restore();
  });
}

function draw(time) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#24375e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const d = view.dpr;
  if (!view.rotated) ctx.setTransform(d, 0, 0, d, 0, 0);
  else if (view.turn > 0) ctx.setTransform(0, d, -d, 0, view.w * d, 0); // на 90° по часовой
  else ctx.setTransform(0, -d, d, 0, 0, view.h * d); // на 90° против часовой
  ctx.transform(view.scale, 0, 0, view.scale, view.ox, view.oy);

  // Площадка — может быть развёрнута на 180° («2 игрока» на одном планшете).
  ctx.save();
  if (flipped()) {
    ctx.translate(RINK.cx, RINK.cy);
    ctx.rotate(Math.PI);
    ctx.translate(-RINK.cx, -RINK.cy);
  }
  drawRink(ctx);
  drawPlayer(skater, time);
  drawPlayer(goalie, time);
  drawGlove();
  drawRadar();
  drawPuck();
  drawSaveFlash();
  Effects.draw(ctx);
  ctx.restore();

  // Табло, кнопки, джойстики — всегда на своих местах на экране.
  drawScore();
  drawMenuButton();
  drawVersion();
  drawJoysticks();
  drawActionButtons(time);
  if (state === 'goal' && goalInfo.mine) drawGoalText(time);
  if (state === 'goal' && goalInfo.pvpScorer !== undefined) drawSwapText(time, goalInfo.pvpScorer);
  if (state === 'menu') drawMenu(time);
}

faceoff();
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  Input.pollGamepads();
  update(dt);
  draw(now / 1000);
  Input.endFrame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
