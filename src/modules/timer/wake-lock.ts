type Sentinel = { release: () => Promise<void> };

let sentinel: Sentinel | null = null;

export async function acquireWakeLock(): Promise<void> {
  try {
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
    };
    if (!nav.wakeLock) return;
    sentinel = await nav.wakeLock.request("screen");
  } catch {
    /* silent */
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await sentinel?.release();
  } catch {
    /* silent */
  }
  sentinel = null;
}