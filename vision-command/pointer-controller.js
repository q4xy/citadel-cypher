import {
  CLICK_COOLDOWN_MS,
  DWELL_CONFIRM_MS,
} from './config.js';

let hoverTarget = null;
let cursorElement = null;
let lastClickAt = 0;
let dwellStartTimestamp = null;
let dwellProgress = 0;
let smoothX = 0;
let smoothY = 0;

function ensureCursor() {
  if (cursorElement) {
    return cursorElement;
  }

  cursorElement = document.createElement('div');
  cursorElement.id = 'vc-cursor';
  cursorElement.className = 'vc-cursor';
  cursorElement.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cursorElement);
  return cursorElement;
}

function refreshCursorProgress() {
  const cursor = ensureCursor();
  const progress = Math.min(Math.max(dwellProgress, 0), 1);
  cursor.style.setProperty('--vc-progress', `${(progress * 100).toFixed(2)}%`);
  const hasActiveHold = hoverTarget && progress > 0;
  cursor.classList.toggle('vc-cursor-active', hasActiveHold);
}

export function mapToScreen(normX, normY, activeArea = { xMin: 0.2, xMax: 0.8, yMin: 0.2, yMax: 0.8 }) {
  const safeArea = {
    xMin: activeArea.xMin ?? 0.2,
    xMax: activeArea.xMax ?? 0.8,
    yMin: activeArea.yMin ?? 0.2,
    yMax: activeArea.yMax ?? 0.8,
  };

  const clampedX = Math.min(Math.max(normX, 0), 1);
  const clampedY = Math.min(Math.max(normY, 0), 1);
  const mirroredX = 1 - clampedX;

  const xRange = Math.max(safeArea.xMax - safeArea.xMin, 0.0001);
  const yRange = Math.max(safeArea.yMax - safeArea.yMin, 0.0001);

  const xOffset = (mirroredX - safeArea.xMin) / xRange;
  const yOffset = (clampedY - safeArea.yMin) / yRange;

  return {
    x: Math.min(Math.max(xOffset, 0), 1) * window.innerWidth,
    y: Math.min(Math.max(yOffset, 0), 1) * window.innerHeight,
  };
}

export function moveCursor(px, py) {
  const cursor = ensureCursor();
  smoothX += (px - smoothX) * 0.22;
  smoothY += (py - smoothY) * 0.22;

  cursor.style.left = `${smoothX}px`;
  cursor.style.top = `${smoothY}px`;
  refreshCursorProgress();
  return { x: smoothX, y: smoothY };
}

export function getCurrentHoverTarget() {
  return hoverTarget;
}

export function updateHover(px, py) {
  const target = document.elementFromPoint(px, py);
  if (!target || target === document.body || target === document.documentElement) {
    hoverTarget = null;
    return null;
  }

  const interactive = target.closest ? target.closest('button, a, input, select, textarea, [role="button"], .gov-need-card') : null;
  const resolvedTarget = interactive || target;
  hoverTarget = resolvedTarget;
  return resolvedTarget;
}

export function clearHover() {
  hoverTarget = null;
  dwellStartTimestamp = null;
  dwellProgress = 0;
  refreshCursorProgress();
}

export function canTriggerClick() {
  return performance.now() - lastClickAt >= CLICK_COOLDOWN_MS;
}

export function markClickFired() {
  lastClickAt = performance.now();
}

export function updateDwellProgress(isPinching, timestamp = performance.now()) {
  if (isPinching) {
    if (dwellStartTimestamp === null) {
      dwellStartTimestamp = timestamp;
    }

    const elapsed = timestamp - dwellStartTimestamp;
    dwellProgress = Math.min(elapsed / DWELL_CONFIRM_MS, 1);
    refreshCursorProgress();
    return dwellProgress >= 1;
  }

  dwellStartTimestamp = null;
  dwellProgress = 0;
  refreshCursorProgress();
  return false;
}
