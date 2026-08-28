/**
 * Sliding-window rate limiter tests: requests under the limit pass through,
 * the limit'th+1 request within the window is blocked with 429, different
 * clients (by req.ip) are tracked independently, and the window rolling
 * forward lets a previously-blocked client back in.
 */
import type { Request, Response, NextFunction } from 'express';
import { rateLimit } from './rate-limit';

function makeReq(ip: string): Request {
  return { ip } as Request;
}

function makeRes(): Response {
  const res: Partial<Response> = {
    statusCode: 200,
    status: jest.fn(function (this: Response, code: number) {
      res.statusCode = code;
      return res as Response;
    }),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  };
  return res as Response;
}

describe('rateLimit', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const middleware = rateLimit({ windowMs: 60_000, max: 3 });
    const next = jest.fn();
    const res = makeRes();

    middleware(makeReq('1.2.3.4'), res, next as NextFunction);
    middleware(makeReq('1.2.3.4'), res, next as NextFunction);
    middleware(makeReq('1.2.3.4'), res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(3);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks the request that exceeds the limit within the window', () => {
    const middleware = rateLimit({ windowMs: 60_000, max: 2 });
    const next = jest.fn();
    const res = makeRes();

    middleware(makeReq('5.5.5.5'), res, next as NextFunction);
    middleware(makeReq('5.5.5.5'), res, next as NextFunction);
    middleware(makeReq('5.5.5.5'), res, next as NextFunction); // 3rd — over the max of 2

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many requests' });
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
  });

  it('tracks each client ip independently', () => {
    const middleware = rateLimit({ windowMs: 60_000, max: 1 });
    const next = jest.fn();
    const resA = makeRes();
    const resB = makeRes();

    middleware(makeReq('1.1.1.1'), resA, next as NextFunction);
    middleware(makeReq('1.1.1.1'), resA, next as NextFunction); // blocked for A
    middleware(makeReq('2.2.2.2'), resB, next as NextFunction); // B's own first request — allowed

    expect(next).toHaveBeenCalledTimes(2);
    expect(resA.status).toHaveBeenCalledWith(429);
    expect(resB.status).not.toHaveBeenCalled();
  });

  it('falls back to a shared "unknown" bucket when req.ip is absent', () => {
    const middleware = rateLimit({ windowMs: 60_000, max: 1 });
    const next = jest.fn();
    const res = makeRes();

    middleware({} as Request, res, next as NextFunction);
    middleware({} as Request, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('resets after the window passes, allowing requests again', () => {
    jest.useFakeTimers();
    const middleware = rateLimit({ windowMs: 1_000, max: 1 });
    const next = jest.fn();
    const res = makeRes();

    middleware(makeReq('9.9.9.9'), res, next as NextFunction);
    middleware(makeReq('9.9.9.9'), res, next as NextFunction); // blocked, still in window

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(429);

    jest.advanceTimersByTime(1_001); // roll past the 1s window

    const res2 = makeRes();
    middleware(makeReq('9.9.9.9'), res2, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res2.status).not.toHaveBeenCalled();
  });

  it('only counts timestamps still inside the sliding window, not the whole request history', () => {
    jest.useFakeTimers();
    const middleware = rateLimit({ windowMs: 1_000, max: 2 });
    const next = jest.fn();
    const res = makeRes();

    middleware(makeReq('8.8.8.8'), res, next as NextFunction); // t=0
    jest.advanceTimersByTime(600);
    middleware(makeReq('8.8.8.8'), res, next as NextFunction); // t=600, both still in window -> 2/2 used
    jest.advanceTimersByTime(500); // t=1100 — the t=0 request has aged out, the t=600 one hasn't
    middleware(makeReq('8.8.8.8'), res, next as NextFunction); // should be allowed (only 1 timestamp in window)
    middleware(makeReq('8.8.8.8'), res, next as NextFunction); // this one should now be blocked (2/2 used again)

    expect(next).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
