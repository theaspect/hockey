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
  pointer: { x: 0, y: 0, down: false, pressed: false, released: false },

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

  pollGamepads() {
    const held = new Set();
    this.stick = { x: 0, y: 0 };
    this.padConnected = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      this.padConnected = true;
      const ax = pad.axes[0] || 0;
      const ay = pad.axes[1] || 0;
      if (Math.hypot(ax, ay) > STICK_DEADZONE) this.stick = { x: ax, y: ay };
      pad.buttons.forEach((button, i) => {
        if (button.pressed && PAD_BUTTONS[i]) held.add(PAD_BUTTONS[i]);
      });
    }
    for (const code of held) {
      if (!this.padHeld.has(code)) this.pressed.add(code);
    }
    this.padHeld = held;
  },

  // Текущее нажатие мыши/пальца уже использовано (например, кликом по меню) — его отпускание не считаем.
  swallowPointer() {
    if (!this.pointer.down) return;
    this.pointer.down = false;
    this.pointer.swallowed = true;
  },

  endFrame() {
    this.pressed.clear();
    this.pointer.pressed = false;
    this.pointer.released = false;
  },
};

window.addEventListener('keydown', (e) => {
  if (!e.repeat) Input.pressed.add(e.code);
  Input.keys.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => Input.keys.delete(e.code));
window.addEventListener('blur', () => Input.keys.clear());

window.addEventListener('pointerdown', (e) => {
  Object.assign(Input.pointer, { x: e.clientX, y: e.clientY, down: true, pressed: true });
});
window.addEventListener('pointermove', (e) => {
  Input.pointer.x = e.clientX;
  Input.pointer.y = e.clientY;
});
window.addEventListener('pointerup', () => {
  Input.pointer.down = false;
  Input.pointer.released = !Input.pointer.swallowed;
  Input.pointer.swallowed = false;
});
