// Простые звуки без файлов — генерируются через Web Audio.
// Браузер разрешает звук только после первого нажатия, поэтому unlock() висит на событиях ввода.
const Sound = {
  ctx: null,

  unlock() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  tone(freq, duration = 0.15, type = 'square', delay = 0, volume = 0.2) {
    if (!this.ctx) return;
    const start = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
  },

  melody(notes, step = 0.12, type = 'square', volume = 0.15) {
    notes.forEach((freq, i) => this.tone(freq, step * 1.5, type, i * step, volume));
  },
};

window.addEventListener('pointerdown', () => Sound.unlock());
window.addEventListener('keydown', () => Sound.unlock());
