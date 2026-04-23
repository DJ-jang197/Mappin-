/**
 * Repeating haptic pattern for arrival (Vibration API — mainly mobile; no-op on most desktops).
 * Stops with `stopArrivalVibration()` in sync with the arrival alarm.
 */

let intervalId: ReturnType<typeof setInterval> | null = null;

/** ms: vibrate, pause, … (from Vibration spec) */
const PATTERN = [200, 120, 200, 120, 400];
const CYCLE_MS = PATTERN.reduce((a, b) => a + b, 0) + 150;

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function stopArrivalVibration(): void {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      void navigator.vibrate(0);
    } catch {
      // ignore
    }
  }
}

/**
 * Loops a vibration pattern until `stopArrivalVibration()`.
 * On desktop browsers this is usually a no-op.
 */
export function startArrivalVibrationLoop(): void {
  stopArrivalVibration();
  if (!canVibrate()) {
    return;
  }
  const run = () => {
    if (!canVibrate()) {
      return;
    }
    try {
      void navigator.vibrate(PATTERN);
    } catch {
      // ignore
    }
  };
  run();
  intervalId = window.setInterval(run, CYCLE_MS);
}
