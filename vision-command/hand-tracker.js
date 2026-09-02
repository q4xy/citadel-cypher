import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';

let handLandmarker = null;
let handLandmarkerPromise = null;

export async function initHandTracker() {
  if (handLandmarker) {
    return handLandmarker;
  }

  if (!handLandmarkerPromise) {
    handLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
      );

      try {
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });
      } catch (error) {
        console.warn('GPU hand tracking unavailable, falling back to CPU.', error);
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });
      }

      return handLandmarker;
    })();
  }

  return handLandmarkerPromise;
}

export async function detectHands(videoElement, timestampMs = performance.now()) {
  if (!videoElement || typeof videoElement.videoWidth !== 'number' || videoElement.videoWidth <= 0 || typeof videoElement.videoHeight !== 'number' || videoElement.videoHeight <= 0) {
    return { handLandmarks: [] };
  }

  const model = await initHandTracker();
  return model.detectForVideo(videoElement, timestampMs);
}

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [12, 13], [13, 14], [14, 15], [15, 16],
  [16, 17], [17, 18], [18, 19], [19, 20],
  [0, 17], [0, 5], [5, 9], [9, 13]
];

export function drawLandmarks(canvasCtx, landmarks = []) {
  if (!canvasCtx || !Array.isArray(landmarks)) {
    return;
  }

  const width = canvasCtx.canvas.width || 1;
  const height = canvasCtx.canvas.height || 1;

  canvasCtx.clearRect(0, 0, width, height);
  canvasCtx.lineWidth = 2.5;
  canvasCtx.strokeStyle = 'rgba(45, 212, 191, 0.95)';
  canvasCtx.fillStyle = 'rgba(45, 212, 191, 0.95)';
  canvasCtx.shadowColor = 'rgba(45, 212, 191, 0.7)';
  canvasCtx.shadowBlur = 10;

  for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];
    if (!start || !end) continue;

    canvasCtx.beginPath();
    canvasCtx.moveTo(start.x * width, start.y * height);
    canvasCtx.lineTo(end.x * width, end.y * height);
    canvasCtx.stroke();
  }

  landmarks.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    const radius = index === 8 || index === 4 || index === 12 || index === 16 || index === 20 ? 4.8 : 3.2;
    canvasCtx.beginPath();
    canvasCtx.arc(x, y, radius, 0, Math.PI * 2);
    canvasCtx.fill();
  });

  canvasCtx.shadowBlur = 0;
}
