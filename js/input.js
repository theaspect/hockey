// Клавиатура, мышь/тач и геймпад (Xbox-раскладка) в одном месте.
// pressed / pointer.pressed / pointer.released живут ровно один кадр — их сбрасывает endFrame().
// Кнопки геймпада попадают в те же keys/pressed под кодами PadA, PadB, PadLeft и т.д.
const PAD_BUTTONS = {
  0: 'PadA', 1: 'PadB', 2: 'PadX', 3: 'PadY',
  4: 'PadLB', 5: 'PadRB', 6: 'PadLT', 7: 'PadRT',
  8: 'PadSelect', 9: 'PadStart',
  12: 'PadUp', 13: 'PadDown', 14: 'PadLeft', 15: 'PadRight',
};
const STICK_DEADZONE = 0.25;

const Input = {
  keys: new Set(),
  pressed: new Set(),
  padHeld: new Set(),
  stick: { x: 0, y: 0 },
  // «Главный» указатель — последний нажатый палец/мышь.
  pointer: { x: 0, y: 0, down: false, pressed: false, released: false },
  // Все пальцы, которые сейчас на экране (мультитач): id -> { x, y, type }.
  pointers: new Map(),
  // Нажатия за этот кадр: [{ id, x, y, type }].
  taps: [],
  // Где мышь (даже без нажатия) — чтобы вратарь мог ездить за курсором.
  mouse: { x: 0, y: 0 },
  // Чем пользовались последним: 'key' | 'pad' | 'mouse' | 'touch'.
  lastDevice: 'key',

  isDown(...codes) {
    return codes.some((code) => this.keys.has(code) || this.padHeld.has(code));
  },

  wasPressed(...codes) {
    return codes.some((code) => this.pressed.has(code));
  },

  anyPress() {
    return this.pressed.size > 0 || this.pointer.pressed;
  },

  // Направления движения, длина вектора не больше 1.
  keyDirection() {
    return this.dirFrom(0, 0, ['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD'], ['ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS']);
  },

  wasdDirection() {
    return this.dirFrom(0, 0, ['KeyA'], ['KeyD'], ['KeyW'], ['KeyS']);
  },

  arrowsDirection() {
    return this.dirFrom(0, 0, ['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown']);
  },

  padDirection() {
    return this.dirFrom(this.stick.x, this.stick.y, ['PadLeft'], ['PadRight'], ['PadUp'], ['PadDown']);
  },

  direction() {
    const k = this.keyDirection();
    const p = this.padDirection();
    return this.clampDir(k.x + p.x, k.y + p.y);
  },

  dirFrom(x, y, left, right, up, down) {
    if (this.isDown(...left)) x -= 1;
    if (this.isDown(...right)) x += 1;
    if (this.isDown(...up)) y -= 1;
    if (this.isDown(...down)) y += 1;
    return this.clampDir(x, y);
  },

  clampDir(x, y) {
    const len = Math.hypot(x, y);
    if (len <= 1) return { x, y };
    return { x: x / len, y: y / len };
  },

  padConnected: false,
  // Каждый геймпад по отдельности (для игры вдвоём): [{ stick, held, pressed }], по порядку подключения.
  pads: [],
  prevPadHeld: {},

  pollGamepads() {
    const held = new Set();
    this.stick = { x: 0, y: 0 };
    this.padConnected = false;
    this.pads = [];
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      this.padConnected = true;
      const ax = pad.axes[0] || 0;
      const ay = pad.axes[1] || 0;
      const stick = Math.hypot(ax, ay) > STICK_DEADZONE ? { x: ax, y: ay } : { x: 0, y: 0 };
      if (stick.x || stick.y) this.stick = stick;
      const own = new Set();
      pad.buttons.forEach((button, i) => {
        if (button.pressed && PAD_BUTTONS[i]) own.add(PAD_BUTTONS[i]);
      });
      const prev = this.prevPadHeld[pad.index] || new Set();
      const pressed = new Set([...own].filter((code) => !prev.has(code)));
      this.prevPadHeld[pad.index] = own;
      this.pads.push({ stick, held: own, pressed });
      own.forEach((code) => held.add(code));
    }
    for (const code of held) {
      if (!this.padHeld.has(code)) this.pressed.add(code);
    }
    if (held.size > 0 || this.stick.x || this.stick.y) this.lastDevice = 'pad';
    this.padHeld = held;
  },

  // Направление с одного геймпада (стик + крестовина).
  padDirectionOf(i) {
    const p = this.pads[i];
    if (!p) return { x: 0, y: 0 };
    let { x, y } = p.stick;
    if (p.held.has('PadLeft')) x -= 1;
    if (p.held.has('PadRight')) x += 1;
    if (p.held.has('PadUp')) y -= 1;
    if (p.held.has('PadDown')) y += 1;
    return this.clampDir(x, y);
  },

  padPressedOf(i, ...codes) {
    const p = this.pads[i];
    return Boolean(p) && codes.some((code) => p.pressed.has(code));
  },

  // Текущее нажатие мыши/пальца уже использовано (например, кликом по меню) — его отпускание не считаем.
  swallowPointer() {
    if (!this.pointer.down) return;
    this.pointer.down = false;
    this.pointer.swallowed = true;
  },

  endFrame() {
    this.pressed.clear();
    this.taps = [];
    this.pointer.pressed = false;
    this.pointer.released = false;
  },
};

function deviceOf(e) {
  return e.pointerType === 'mouse' ? 'mouse' : 'touch';
}

// Пока человек печатает в поле (окошко «Имена»), клавиши в игру не идут.
function typingInField(e) {
  return e.target instanceof HTMLInputElement;
}

window.addEventListener('keydown', (e) => {
  if (typingInField(e)) return;
  if (!e.repeat) Input.pressed.add(e.code);
  Input.keys.add(e.code);
  Input.lastDevice = 'key';
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => Input.keys.delete(e.code));
window.addEventListener('blur', () => {
  Input.keys.clear();
  Input.pointers.clear();
});

window.addEventListener('pointerdown', (e) => {
  if (e.target.tagName !== 'CANVAS') return; // нажатия по окошкам поверх игры — не игре
  const type = deviceOf(e);
  Input.lastDevice = type;
  Input.pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY, type, startX: e.clientX, startY: e.clientY });
  Input.taps.push({ id: e.pointerId, x: e.clientX, y: e.clientY, type });
  Object.assign(Input.pointer, { x: e.clientX, y: e.clientY, down: true, pressed: true });
});
window.addEventListener('pointermove', (e) => {
  const p = Input.pointers.get(e.pointerId);
  if (p) Object.assign(p, { x: e.clientX, y: e.clientY });
  if (e.pointerType === 'mouse') {
    Object.assign(Input.mouse, { x: e.clientX, y: e.clientY });
    Input.lastDevice = 'mouse';
  }
  Input.pointer.x = e.clientX;
  Input.pointer.y = e.clientY;
});
function pointerEnd(e) {
  Input.pointers.delete(e.pointerId);
  Input.pointer.down = false;
  Input.pointer.released = !Input.pointer.swallowed;
  Input.pointer.swallowed = false;
}
window.addEventListener('pointerup', pointerEnd);
window.addEventListener('pointercancel', pointerEnd);
