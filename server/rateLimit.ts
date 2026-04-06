export interface RateLimiter {
  check(key: string): { allowed: boolean; retryAfterSeconds?: number };
  cleanup(): void;
}

export function createInMemoryRateLimiter({
  windowMs,
  maxAttempts,
}: {
  windowMs: number;
  maxAttempts: number;
}): RateLimiter {
  const store = new Map<string, { count: number; resetTime: number }>();

  return {
    check(key) {
      const now = Date.now();
      const record = store.get(key);

      if (!record || now > record.resetTime) {
        store.set(key, { count: 1, resetTime: now + windowMs });
        return { allowed: true };
      }

      if (record.count >= maxAttempts) {
        const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
        return { allowed: false, retryAfterSeconds };
      }

      record.count++;
      return { allowed: true };
    },

    cleanup() {
      const now = Date.now();
      for (const [key, record] of store) {
        if (now > record.resetTime) {
          store.delete(key);
        }
      }
    },
  };
}
