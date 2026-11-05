// Имена игроков: окошко с двумя полями (на iPad вылезает клавиатура), запоминаются в браузере.
// Имя пишется по кругу на спине формы (см. drawNameRing в game.js).
const NAMES_KEY = 'hockey.names';
const NAME_MAX = 10;

const Names = {
  list: loadNames(),
  open: false,

  get(player) {
    return this.list[player] || '';
  },

  save() {
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(this.list));
    } catch {
      // без сохранения тоже работает
    }
  },

  // colors — цвета формы игроков, чтобы поля были подписаны понятно.
  openDialog(colors) {
    if (this.open) return;
    this.open = true;
    const box = document.createElement('div');
    box.id = 'names-dialog';
    box.innerHTML = `
      <form>
        <div class="title">✏️ Имена</div>
        ${[0, 1].map((i) => `
          <label style="--c:${colors[i]}">
            <span class="dot"></span>
            <input name="n${i}" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="characters"
                   placeholder="Игрок ${i + 1}" value="${escapeHtml(this.get(i))}">
          </label>`).join('')}
        <button type="submit">Готово ✓</button>
      </form>`;
    document.body.appendChild(box);
    const form = box.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.list = [0, 1].map((i) => form.elements[`n${i}`].value.trim().slice(0, NAME_MAX));
      this.save();
      box.remove();
      this.open = false;
    });
    form.elements.n0.focus();
  },
};

function loadNames() {
  try {
    const saved = JSON.parse(localStorage.getItem(NAMES_KEY));
    if (Array.isArray(saved)) return [String(saved[0] || ''), String(saved[1] || '')];
  } catch {
    // нет сохранённых — пусто
  }
  return ['', ''];
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
