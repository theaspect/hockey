// Фоновая музыка: весёлая 8-битная мелодия, генерируется кодом (без файлов).
// Ноты планируются чуть вперёд из игрового цикла (Music.update()), поэтому когда вкладка
// не видна, музыка сама замолкает. Включение/выключение запоминается.
const MUSIC_KEY = 'hockey.music';
const MUSIC_STEP = 0.18; // длительность восьмой ноты, сек
const MUSIC_VOLUME = 0.05;

function midi(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

// 4 такта по 8 восьмых. null — пауза.
const MELODY = [
  72, 76, 79, 76, 72, 76, 79, 84,
  81, 79, 76, 79, 77, 76, 74, null,
  72, 76, 79, 76, 72, 76, 79, 84,
  86, 84, 81, 79, 77, 79, 72, null,
];
// Бас — четвертями (на каждую вторую восьмую): тоника и квинта, аккорды C — F — C — G.
const BASS = [
  48, 55, 48, 55,
  53, 60, 53, 60,
  48, 55, 48, 55,
  55, 62, 55, 62,
];

const Music = {
  enabled: loadMusicSetting(),
  step: 0,
  nextTime: 0,

  toggle() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(MUSIC_KEY, this.enabled ? 'on' : 'off');
    } catch {
      // без сохранения тоже работает
    }
  },

  update() {
    const ctx = Sound.ctx;
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.05;
    while (this.nextTime < now + 0.3) {
      this.playStep(this.step, this.nextTime - now);
      this.step = (this.step + 1) % MELODY.length;
      this.nextTime += MUSIC_STEP;
    }
  },

  playStep(step, delay) {
    const note = MELODY[step];
    if (note !== null) Sound.tone(midi(note), MUSIC_STEP * 0.9, 'square', delay, MUSIC_VOLUME);
    if (step % 2 === 0) Sound.tone(midi(BASS[step / 2]), MUSIC_STEP * 1.8, 'triangle', delay, MUSIC_VOLUME * 1.6);
  },
};

function loadMusicSetting() {
  try {
    return localStorage.getItem(MUSIC_KEY) !== 'off';
  } catch {
    return true;
  }
}
