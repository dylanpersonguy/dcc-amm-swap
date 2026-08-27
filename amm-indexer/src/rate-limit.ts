/**
 * Minimal in-memory sliding-window rate limiter for the raw http server —
 * no external dependency, correct for a single-instance deployment. Not
 * suitable if this service is ever run with multiple replicas behind a
 * load balancer (each instance would count independently).
 */
import type { IncomingMessage } from 'http';

interface Bucket {
  timestamps: number[];
}

export function createRateLimiter(opts: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();

  setInterval(() => {
    const cutoff = Date.now() - opts.windowMs;
    for (const [key, bucket] of buckets) {
      bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
      if (bucket.timestamps.length === 0) buckets.delete(key);
    }
  }, opts.windowMs).unref();

  return (req: IncomingMessage): boolean => {
    // Railway sits in front of this as a reverse proxy — req.socket.remoteAddress
    // would resolve to Railway's edge for every request otherwise, collapsing
    // this to one shared bucket across all clients.
    const forwarded = req.headers['x-forwarded-for'];
    const key =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0].trim()) ||
      req.socket.remoteAddress ||
      'unknown';
    const now = Date.now();
    const cutoff = now - opts.windowMs;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      buckets.set(key, bucket);
    }
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

    if (bucket.timestamps.length >= opts.max) return false;
    bucket.timestamps.push(now);
    return true;
  };
}
