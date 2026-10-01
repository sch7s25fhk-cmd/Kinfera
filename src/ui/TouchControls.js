// Bildschirm-Steuerung für Handys: Steuerkreuz links, Aktions-/Menütaste rechts.
// Die Tasten lösen dieselben abstrakten Aktionen aus wie die Tastatur.

const DEADZONE = 0.18; // Anteil des Steuerkreuz-Radius ohne Richtung

/**
 * @param {HTMLElement} container
 * @param {import('../engine/Input.js').Input} input
 */
export function createTouchControls(container, input) {
  container.innerHTML = `
    <div class="dpad" aria-label="Steuerkreuz">
      <span class="arm arm-v"></span><span class="arm arm-h"></span>
      <span class="hub"></span>
    </div>
    <div class="buttons">
      <button type="button" class="btn btn-b" data-action="cancel" aria-label="Menü / Zurück">B<small>Menü</small></button>
      <button type="button" class="btn btn-a" data-action="confirm" aria-label="Aktion">A<small>Aktion</small></button>
    </div>`;

  setupDpad(container.querySelector('.dpad'), input);
  container.querySelectorAll('.btn').forEach((btn) => setupButton(btn, input));
  // Kontextmenü bei langem Drücken unterdrücken
  container.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Richtung aus der Daumenposition relativ zur Mitte – Daumen kann gleiten */
function setupDpad(el, input) {
  let pointerId = null;
  let current = null;

  const setDir = (dir) => {
    if (dir === current) return;
    if (current) input.release(current);
    if (dir) {
      input.press(dir);
      vibrate(6);
    }
    current = dir;
    el.dataset.dir = dir ?? '';
  };

  const dirFromEvent = (e) => {
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < (rect.width / 2) * DEADZONE) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  };

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointerId = e.pointerId;
    el.setPointerCapture(pointerId);
    setDir(dirFromEvent(e));
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId === pointerId) setDir(dirFromEvent(e));
  });
  const end = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    setDir(null);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function setupButton(btn, input) {
  const action = btn.dataset.action;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('down');
    input.press(action);
    vibrate(10);
  });
  const end = () => {
    btn.classList.remove('down');
    input.release(action);
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
}

function vibrate(ms) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // nicht unterstützt (z. B. iOS) – egal
  }
}

/** Touch-Gerät erkannt oder per ?touch erzwungen */
export function wantsTouchControls() {
  return new URLSearchParams(window.location.search).has('touch')
    || window.matchMedia('(pointer: coarse)').matches
    || 'ontouchstart' in window;
}
