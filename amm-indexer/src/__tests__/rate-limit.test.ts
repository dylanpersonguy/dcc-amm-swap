import { createRateLimiter } from '../rate-limit';
import type { IncomingMessage } from 'http';

function makeReq(opts: { ip?: string; forwardedFor?: string | string[] } = {}): IncomingMessage {
  return {
    headers: opts.forwardedFor !== undefined ? { 'x-forwarded-for': opts.forwardedFor } : {},
    socket: { remoteAddress: opts.ip ?? '127.0.0.1' },
  } as unknown as IncomingMessage;
}

describe('createRateLimiter', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const check = createRateLimiter({ windowMs: 60_000, max: 3 });
    const req = makeReq();
    expect(check(req)).toBe(true);
    expect(check(req)).toBe(true);
    expect(check(req)).toBe(true);
  });

  it('blocks requests once the max is reached within the window', () => {
    const check = createRateLimiter({ windowMs: 60_000, max: 3 });
    const req = makeReq();
    expect(check(req)).toBe(true);
    expect(check(req)).toBe(true);
    expect(check(req)).toBe(true);
    expect(check(req)).toBe(false); // 4th request within the window
    expect(check(req)).toBe(false); // still blocked
  });

  it('tracks separate buckets per client key (x-forwarded-for)', () => {
    const check = createRateLimiter({ windowMs: 60_000, max: 1 });
    const reqA = makeReq({ forwardedFor: '1.1.1.1' });
    const reqB = makeReq({ forwardedFor: '2.2.2.2' });
    expect(check(reqA)).toBe(true);
    expect(check(reqA)).toBe(false); // A is now over its own limit
    expect(check(reqB)).toBe(true); // B has its own independent bucket
  });

  it('uses the first address in a comma-separated x-forwarded-for header', () => {
    const check = createRateLimiter({ windowMs: 60_000, max: 1 });
    const req1 = makeReq({ forwardedFor: '9.9.9.9, 10.10.10.10' });
    const req2 = makeReq({ forwardedFor: '9.9.9.9,10.10.10.10' }); // no space, same client
    expect(check(req1)).toBe(true);
    expect(check(req2)).toBe(false); // resolves to the same key '9.9.9.9'
  });

  it('handles x-forwarded-for provided as an array', () => {
    const check = createRateLimiter({ windowMs: 60_000, max: 1 });
    const req = makeReq({ forwardedFor: ['3.3.3.3', '4.4.4.4'] });
    expect(check(req)).toBe(true);
    expect(check(req)).toBe(false);
  });

  it('falls back to socket.remoteAddress when there is no x-forwarded-for', () => {
    const check = createRateLimiter({ windowMs: 60_000, max: 1 });
    const req = makeReq({ ip: '5.5.5.5' });
    expect(check(req)).toBe(true);
    expect(check(req)).toBe(false);
  });

  it('resets a client bucket after the window elapses', () => {
    jest.useFakeTimers();
    const check = createRateLimiter({ windowMs: 60_000, max: 1 });
    const req = makeReq();

    expect(check(req)).toBe(true);
    expect(check(req)).toBe(false); // over the limit within the window

    jest.advanceTimersByTime(60_001); // past the window

    expect(check(req)).toBe(true); // allowed again — old timestamp aged out
  });

  it('does not reset early — still blocked just before the window elapses', () => {
    jest.useFakeTimers();
    const check = createRateLimiter({ windowMs: 60_000, max: 1 });
    const req = makeReq();

    expect(check(req)).toBe(true);
    jest.advanceTimersByTime(59_000); // window not yet elapsed
    expect(check(req)).toBe(false);
  });

  it('the periodic sweep does not keep the process alive (timer is unref-ed)', () => {
    jest.useFakeTimers();
    const unrefSpy = jest.spyOn(global, 'setInterval');
    createRateLimiter({ windowMs: 60_000, max: 1 });
    const timer = unrefSpy.mock.results[0]?.value;
    // Node's Timeout object exposes hasRef() to introspect unref state.
    expect(typeof timer?.hasRef).toBe('function');
    expect(timer.hasRef()).toBe(false);
    unrefSpy.mockRestore();
  });
});
