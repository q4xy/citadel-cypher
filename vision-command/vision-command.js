import { detectHands, drawLandmarks } from './hand-tracker.js';
import { isPointing, PinchDetector } from './gesture-recognizer.js';
import {
  mapToScreen,
  moveCursor,
  updateHover,
  getCurrentHoverTarget,
  canTriggerClick,
  clearHover,
  updateDwellProgress,
} from './pointer-controller.js';
import { triggerClick } from './action-dispatcher.js';

const activeArea = { xMin: 0.2, xMax: 0.8, yMin: 0.2, yMax: 0.8 };

let canvasElement = null;
let videoElement = null;
let mediaStream = null;
let animationFrameHandle = null;
let imagingEnabled = false;
let pinchDetector = new PinchDetector();

function ensureVideo() {
  if (videoElement) {
    return videoElement;
  }

  videoElement = document.getElementById('vc-video');

  if (!videoElement) {
    videoElement = document.createElement('video');
    videoElement.id = 'vc-video';
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true;
    videoElement.setAttribute('playsinline', 'true');
    videoElement.style.position = 'fixed';
    videoElement.style.top = '0';
    videoElement.style.left = '0';
    videoElement.style.width = '320px';
    videoElement.style.height = '240px';
    videoElement.style.zIndex = '999';
    videoElement.style.objectFit = 'cover';
    videoElement.style.opacity = '0';
    videoElement.style.pointerEvents = 'none';
    videoElement.style.transform = 'scaleX(-1)';
    document.body.appendChild(videoElement);
  }

  return videoElement;
}

function ensureCanvas() {
  if (canvasElement) {
    return canvasElement;
  }

  canvasElement = document.getElementById('vc-canvas');

  if (!canvasElement) {
    canvasElement = document.createElement('canvas');
    canvasElement.id = 'vc-canvas';
    canvasElement.style.position = 'fixed';
    canvasElement.style.top = '0';
    canvasElement.style.left = '0';
    canvasElement.style.width = '320px';
    canvasElement.style.height = '240px';
    canvasElement.style.zIndex = '1000';
    canvasElement.style.pointerEvents = 'none';
    canvasElement.style.borderRadius = '12px';
    canvasElement.style.border = '1px solid rgba(94, 234, 212, 0.8)';
    canvasElement.style.background = 'rgba(15, 23, 42, 0.15)';
    document.body.appendChild(canvasElement);
  }

  return canvasElement;
}

export async function initCamera() {
  const targetVideo = ensureVideo();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('getUserMedia is not supported in this browser.');
  }

  if (mediaStream) {
    stopCamera();
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user' },
    audio: false,
  });

  targetVideo.srcObject = mediaStream;

  await new Promise((resolve, reject) => {
    const cleanup = () => {
      targetVideo.onloadedmetadata = null;
      targetVideo.onerror = null;
    };

    targetVideo.onloadedmetadata = () => {
      cleanup();
      targetVideo.play().catch(() => {
        // Silent fallback: the browser may block autoplay until user interaction.
      });
      resolve();
    };

    targetVideo.onerror = () => {
      cleanup();
      reject(new Error('Unable to load the camera stream.'));
    };
  });

  const canvas = ensureCanvas();
  canvas.width = targetVideo.videoWidth || 320;
  canvas.height = targetVideo.videoHeight || 240;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;

  return targetVideo;
}

export function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (videoElement) {
    videoElement.pause();
    videoElement.srcObject = null;
  }

  if (canvasElement) {
    const ctx = canvasElement.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }
  }
}

function stopLoop() {
  imagingEnabled = false;

  if (animationFrameHandle) {
    cancelAnimationFrame(animationFrameHandle);
    animationFrameHandle = null;
  }
}

async function runFrame() {
  if (!imagingEnabled) {
    return;
  }

  const currentVideo = ensureVideo();
  if (currentVideo && currentVideo.readyState >= 2) {
    try {
      const timestamp = performance.now();
      const result = await detectHands(currentVideo, timestamp);
      const landmarks = result?.landmarks?.[0] ?? [];
      const canvas = ensureCanvas();
      const ctx = canvas.getContext('2d');

      if (ctx) {
        canvas.width = currentVideo.videoWidth || canvas.width || 320;
        canvas.height = currentVideo.videoHeight || canvas.height || 240;
        canvas.style.width = `${canvas.width}px`;
        canvas.style.height = `${canvas.height}px`;
        drawLandmarks(ctx, landmarks);
      }

      if (landmarks.length === 21) {
        const pinchState = pinchDetector.update(landmarks);
        const pointing = isPointing(landmarks);
        const indexTip = landmarks[8];

        let hoverTarget = null;
        let hoverPosition = null;

        if (indexTip) {
          const indexMapped = mapToScreen(indexTip.x, indexTip.y, activeArea);
          moveCursor(indexMapped.x, indexMapped.y);
          hoverPosition = indexMapped;
          hoverTarget = updateHover(indexMapped.x, indexMapped.y);
        }

        if (!hoverTarget || !hoverPosition || pointing) {
          clearHover();
        }

        if (hoverTarget && hoverPosition && !pointing) {
          const activePinch = pinchState === 'pinching' || pinchDetector.isPinching;
          const completed = updateDwellProgress(activePinch, timestamp);

          if (completed && canTriggerClick()) {
            triggerClick(hoverTarget);
            clearHover();
          }
        } else {
          updateDwellProgress(false, timestamp);
        }
      }
    } catch (error) {
      console.debug('Vision frame paused because the camera/video is unavailable yet.', error);
    }
  }

  animationFrameHandle = requestAnimationFrame(runFrame);
}

export async function startVisionCommand() {
  if (imagingEnabled) {
    return true;
  }

  try {
    await initCamera();
    imagingEnabled = true;
    animationFrameHandle = requestAnimationFrame(runFrame);
    return true;
  } catch (error) {
    console.error('Vision command could not start.', error);
    imagingEnabled = false;
    return false;
  }
}

export function stopVisionCommand() {
  stopLoop();
  stopCamera();
  clearHover();
}

export async function toggleVisionCommand() {
  if (imagingEnabled) {
    stopVisionCommand();
    return false;
  }

  return await startVisionCommand();
}

