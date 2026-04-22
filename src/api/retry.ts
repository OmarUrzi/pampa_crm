export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: {
    attempts?: number;
    baseDelayMs?: number;
    shouldRetry?: (e: unknown) => boolean;
    jitterRatio?: number;
  },
) {
  const attempts = opts?.attempts ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 350;
  const jitterRatio = opts?.jitterRatio ?? 0.25;
  const shouldRetry =
    opts?.shouldRetry ??
    ((e: unknown) => {
      const msg = e instanceof Error ? e.message : "";
      return /timeout|network_error|API 5\d\d/i.test(msg);
    });

  let last: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const ok = i < attempts - 1 && shouldRetry(e);
      if (!ok) throw e;
      const base = baseDelayMs * Math.pow(2, i);
      const jitter = base * jitterRatio * (Math.random() * 2 - 1); // +/- jitter
      const delay = Math.max(0, Math.round(base + jitter));
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw last;
}

