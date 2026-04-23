/**
 * Repeating twin-tone alarm using Web Audio (no MP3 asset).
 * Call `primeArrivalAlarmAudio()` from a user gesture (e.g. Start monitoring) so playback works later.
 * Call `stopArrivalAlarmLoop()` from Stop alarm / Complete / page unload.
 */

let sharedCtx: AudioContext | null = null;
let loopTimer: ReturnType<typeof setInterval> | null = null;

function getAudioContext(): AudioContext | null {
  const w = globalThis as unknown as { webkitAudioContext?: typeof AudioContext };
  const AC = typeof AudioContext !== "undefined" ? AudioContext : w.webkitAudioContext;
  if (!AC) {
    return null;
  }
  try {
    if (!sharedCtx || sharedCtx.state === "closed") {
      sharedCtx = new AC();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

/** Call from a click/tap handler (e.g. Start monitoring) so arrival tones can play later. */
export function primeArrivalAlarmAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
}

const FREQ_HIGH = 880;
const FREQ_LOW = 554;
const BEEP_S = 0.14;
const CYCLE_S = 0.28;
const LOOPS = 9;
const PEAK = 0.11;

/** Wall-clock spacing between alarm “chunks” (one full high/low pattern train). */
const CHUNK_INTERVAL_MS = Math.ceil((LOOPS * CYCLE_S + BEEP_S + 0.08) * 1000);

function scheduleBeeps(ctx: AudioContext, t0: number): void {
  for (let i = 0; i < LOOPS; i++) {
    const high = i % 2 === 0;
    const start = t0 + i * CYCLE_S;
    const freq = high ? FREQ_HIGH : FREQ_LOW;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(PEAK, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + BEEP_S);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + BEEP_S + 0.02);
  }
}

export function stopArrivalAlarmLoop(): void {
  if (loopTimer !== null) {
    window.clearInterval(loopTimer);
    loopTimer = null;
  }
}

/** Loops the alarm until `stopArrivalAlarmLoop()`. */
export function startArrivalAlarmLoop(): void {
  stopArrivalAlarmLoop();
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  void ctx
    .resume()
    .then(() => {
      scheduleBeeps(ctx, ctx.currentTime + 0.02);
      loopTimer = window.setInterval(() => {
        const c = getAudioContext();
        if (!c || c.state === "closed") {
          stopArrivalAlarmLoop();
          return;
        }
        void c.resume().then(() => {
          scheduleBeeps(c, c.currentTime + 0.02);
        });
      }, CHUNK_INTERVAL_MS);
    })
    .catch(() => {});
}
