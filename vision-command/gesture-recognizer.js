import {
  PINCH_ENTER_THRESHOLD,
  PINCH_EXIT_THRESHOLD,
  PINCH_HOLD_FRAMES,
} from './config.js';

function distance(a, b) {
  if (!a || !b) {
    return 0;
  }

  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function isFingerExtended(landmarks, tipIndex, pipIndex, mcpIndex) {
  const tip = landmarks[tipIndex];
  const pip = landmarks[pipIndex];
  const mcp = landmarks[mcpIndex];

  if (!tip || !pip || !mcp) {
    return false;
  }

  return tip.y < pip.y && pip.y < mcp.y;
}

function isFingerCurled(landmarks, tipIndex, pipIndex, mcpIndex) {
  const tip = landmarks[tipIndex];
  const pip = landmarks[pipIndex];
  const mcp = landmarks[mcpIndex];

  if (!tip || !pip || !mcp) {
    return false;
  }

  return tip.y > pip.y && pip.y > mcp.y;
}

export function isPointing(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 21) {
    return false;
  }

  const indexExtended = isFingerExtended(landmarks, 8, 6, 5);
  const middleCurled = isFingerCurled(landmarks, 12, 10, 9);
  const ringCurled = isFingerCurled(landmarks, 16, 14, 13);
  const pinkyCurled = isFingerCurled(landmarks, 20, 18, 17);

  return indexExtended && middleCurled && ringCurled && pinkyCurled;
}

export class PinchDetector {
  constructor() {
    this.state = 'released';
    this.consecutiveFrames = 0;
    this.isPinching = false;
  }

  update(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length < 21) {
      return this.state;
    }

    const wristToMiddleMcp = distance(landmarks[0], landmarks[9]) || 1;
    const pinchValue = distance(landmarks[4], landmarks[8]) / wristToMiddleMcp;

    if (this.state === 'released') {
      if (pinchValue <= PINCH_ENTER_THRESHOLD) {
        this.consecutiveFrames += 1;
        if (this.consecutiveFrames >= PINCH_HOLD_FRAMES) {
          this.state = 'pinching';
          this.isPinching = true;
          this.consecutiveFrames = 0;
          return 'pinching';
        }
      } else {
        this.consecutiveFrames = 0;
      }

      this.isPinching = false;
      return 'released';
    }

    if (pinchValue >= PINCH_EXIT_THRESHOLD) {
      this.state = 'released';
      this.isPinching = false;
      this.consecutiveFrames = 0;
      return 'released';
    }

    this.isPinching = true;
    return 'pinching';
  }
}
