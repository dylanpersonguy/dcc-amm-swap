/**
 * Minimal in-memory sliding-window rate limiter — no external dependency,
 * correct for a single-instance deployment. Not suitable if this service is
 * ever run with multiple replicas behind a load balancer (each instance
 * would count independently) — swap for a shared store (Redis) if that
 * changes.
 */
import type { Request, Response, NextFunction } from 'express';

interface Bucket {
  timestamps: number[];
}

export function rateLimit(opts: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();

  // Periodic cleanup so the map doesn't grow unbounded from one-off callers.
  setInterval(() => {
    const cutoff = Date.now() - opts.windowMs;
    for (const [key, bucket] of buckets) {
      bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
      if (bucket.timestamps.length === 0) buckets.delete(key);
    }
  }, opts.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const cutoff = now - opts.windowMs;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      buckets.set(key, bucket);
    }
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

    if (bucket.timestamps.length >= opts.max) {
      res.setHeader('Retry-After', Math.ceil(opts.windowMs / 1000).toString());
      return res.status(429).json({ error: 'Too many requests' });
    }

    bucket.timestamps.push(now);
    next();
  };
}
