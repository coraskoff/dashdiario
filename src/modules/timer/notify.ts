let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

export function playBell(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const make = (freq: number, start: number, dur: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.25, now + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.05);
  };
  make(880, 0, 0.6);
  make(1318.5, 0.12, 0.7);
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

export function fireNotification(title: string, body?: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, silent: false });
  } catch {
    /* ignore */
  }
}

/** Flashes the document title for a few seconds. Returns a stop fn. */
export function flashTitle(message: string, durationMs = 8000): () => void {
  if (typeof document === "undefined") return () => {};
  const original = document.title;
  let on = false;
  const id = window.setInterval(() => {
    on = !on;
    document.title = on ? message : original;
  }, 800);
  const stop = () => {
    window.clearInterval(id);
    document.title = original;
  };
  window.setTimeout(stop, durationMs);
  return stop;
}

export function setTabTitle(title: string | null, fallback: string): void {
  if (typeof document === "undefined") return;
  document.title = title ?? fallback;
}