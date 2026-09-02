export function buildCalibrationFlow({ onComplete, getLandmarks, activeArea = { xMin: 0.2, xMax: 0.8, yMin: 0.2, yMax: 0.8 } } = {}) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '1200';
  document.body.appendChild(overlay);

  const targets = [
    { id: 'top-left', x: 0.1, y: 0.1, label: 'TL' },
    { id: 'top-right', x: 0.9, y: 0.1, label: 'TR' },
    { id: 'bottom-left', x: 0.1, y: 0.9, label: 'BL' },
    { id: 'bottom-right', x: 0.9, y: 0.9, label: 'BR' },
  ];

  const markers = [];

  targets.forEach((target) => {
    const marker = document.createElement('div');
    marker.textContent = target.label;
    marker.style.position = 'fixed';
    marker.style.left = `${target.x * window.innerWidth}px`;
    marker.style.top = `${target.y * window.innerHeight}px`;
    marker.style.width = '22px';
    marker.style.height = '22px';
    marker.style.marginLeft = '-11px';
    marker.style.marginTop = '-11px';
    marker.style.borderRadius = '50%';
    marker.style.border = '2px solid rgba(248, 250, 252, 0.9)';
    marker.style.background = 'rgba(59, 130, 246, 0.2)';
    marker.style.display = 'grid';
    marker.style.placeItems = 'center';
    marker.style.fontSize = '10px';
    marker.style.fontWeight = '700';
    marker.style.color = '#e2e8f0';
    marker.style.zIndex = '1201';
    overlay.appendChild(marker);
    markers.push(marker);
  });

  const points = [];

  return {
    start() {
      let index = 0;
      const step = () => {
        if (index >= targets.length) {
          const computed = {
            xMin: Math.min(...points.map((point) => point.x)),
            xMax: Math.max(...points.map((point) => point.x)),
            yMin: Math.min(...points.map((point) => point.y)),
            yMax: Math.max(...points.map((point) => point.y)),
          };
          overlay.remove();
          if (typeof onComplete === 'function') {
            onComplete(computed);
          }
          return;
        }

        const target = targets[index];
        markers[index].style.background = 'rgba(45, 212, 191, 0.45)';
        markers[index].style.borderColor = '#5eead4';

        const startTime = performance.now();
        const capture = () => {
          const landmarks = getLandmarks && getLandmarks();
          if (!landmarks || landmarks.length < 21) {
            requestAnimationFrame(capture);
            return;
          }

          const point = {
            x: landmarks[8].x,
            y: landmarks[8].y,
          };
          points.push(point);
          markers[index].style.background = 'rgba(34, 197, 94, 0.55)';
          index += 1;
          const nextTarget = markers[index];
          if (nextTarget) {
            nextTarget.style.background = 'rgba(96,165,250,0.3)';
          }

          setTimeout(step, 250);
        };

        const delayMs = 900;
        const waitForHold = () => {
          if (performance.now() - startTime >= delayMs) {
            capture();
            return;
          }
          requestAnimationFrame(waitForHold);
        };

        waitForHold();
      };

      step();
    },
  };
}
