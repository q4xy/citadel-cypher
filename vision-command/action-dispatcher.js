import { getCurrentHoverTarget, markClickFired } from './pointer-controller.js';

export function triggerClick(targetElement) {
  if (!(targetElement instanceof Element)) {
    return false;
  }

  const activeHoverTarget = getCurrentHoverTarget();
  if (!activeHoverTarget || targetElement !== activeHoverTarget) {
    return false;
  }

  targetElement.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: targetElement.getBoundingClientRect().left,
      clientY: targetElement.getBoundingClientRect().top,
    })
  );

  markClickFired();
  return true;
}
