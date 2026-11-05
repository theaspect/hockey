// Совместимость со старыми браузерами (iPad с iOS младше 16) и показ ошибок на экране.
// Подключается первым.

// Скруглённый прямоугольник появился в Safari только в iOS 16. Здесь — версия с одним радиусом.
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
    const radius = Math.max(0, Math.min(Number(r) || 0, w / 2, h / 2));
    this.moveTo(x + radius, y);
    this.arcTo(x + w, y, x + w, y + h, radius);
    this.arcTo(x + w, y + h, x, y + h, radius);
    this.arcTo(x, y + h, x, y, radius);
    this.arcTo(x, y, x + w, y, radius);
    this.closePath();
  };
}

// Старые Safari знают звук только под именем webkitAudioContext.
if (!window.AudioContext && window.webkitAudioContext) {
  window.AudioContext = window.webkitAudioContext;
}

// Если что-то сломалось — пишем ошибку прямо на экране, чтобы было видно, что чинить.
function showError(message) {
  let box = document.getElementById('error');
  if (!box) {
    box = document.createElement('pre');
    box.id = 'error';
    box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;margin:0;padding:12px;'
      + 'background:#b71c1c;color:#fff;font:14px/1.4 monospace;white-space:pre-wrap;z-index:10;'
      + 'border-radius:8px;user-select:text;-webkit-user-select:text;';
    document.body.appendChild(box);
  }
  box.textContent = `Ошибка: ${message}\n${navigator.userAgent}`;
}
window.addEventListener('error', (e) => showError(`${e.message} (${e.filename}:${e.lineno})`));
window.addEventListener('unhandledrejection', (e) => showError(String(e.reason)));
