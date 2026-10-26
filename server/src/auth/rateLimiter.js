/**
 * In-process sliding-window rate limiter for authentication endpoints.
 * Note: Designed for single-instance local development. State resets on process restart.
 */

export class RateLimiter {
  /**
   * @param {object} options
   * @param {number} options.windowMs - Time window in milliseconds
   * @param {number} options.maxAttempts - Maximum allowed attempts within window
   * @param {string} [options.name] - Limiter name for logging
   */
  constructor({ windowMs, maxAttempts, name = 'rate-limiter' }) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
    this.name = name;
    this.records = new Map(); // IP -> Array<timestamp>
  }

  /**
   * Cleans expired timestamps for a given key.
   *
   * @private
   * @param {string} key
   * @param {number} now
   */
  _cleanup(key, now) {
    const timestamps = this.records.get(key);
    if (!timestamps) return;

    const validFrom = now - this.windowMs;
    const active = timestamps.filter((t) => t > validFrom);

    if (active.length === 0) {
      this.records.delete(key);
    } else {
      this.records.set(key, active);
    }
  }

  /**
   * Checks if an IP address is currently throttled without consuming an attempt.
   *
   * @param {string} key
   * @returns {{ throttled: boolean, retryAfterSeconds: number }}
   */
  check(key) {
    const now = Date.now();
    this._cleanup(key, now);

    const timestamps = this.records.get(key) || [];
    if (timestamps.length >= this.maxAttempts) {
      const oldestActive = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestActive + this.windowMs - now) / 1000));
      return { throttled: true, retryAfterSeconds };
    }

    return { throttled: false, retryAfterSeconds: 0 };
  }

  /**
   * Records an attempt.
   *
   * @param {string} key
   * @returns {{ throttled: boolean, retryAfterSeconds: number }}
   */
  record(key) {
    const now = Date.now();
    this._cleanup(key, now);

    const timestamps = this.records.get(key) || [];
    timestamps.push(now);
    this.records.set(key, timestamps);

    if (timestamps.length > this.maxAttempts) {
      const oldestActive = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestActive + this.windowMs - now) / 1000));
      return { throttled: true, retryAfterSeconds };
    }

    return { throttled: false, retryAfterSeconds: 0 };
  }

  /**
   * Resets attempts for a key (e.g. upon successful authentication).
   *
   * @param {string} key
   */
  reset(key) {
    this.records.delete(key);
  }

  /**
   * Clears all recorded entries (useful for test isolation).
   */
  clearAll() {
    this.records.clear();
  }

  /**
   * Returns an Express middleware that enforces this rate limit.
   *
   * @returns {import('express').RequestHandler}
   */
  middleware() {
    return (req, res, next) => {
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const status = this.check(clientIp);

      if (status.throttled) {
        res.setHeader('Retry-After', String(status.retryAfterSeconds));
        return res.status(429).json({
          error: 'TooManyRequests',
          message: 'Too many authentication attempts. Please try again later.',
        });
      }

      return next();
    };
  }
}

// 5 failed login attempts per 15 minutes per IP
export const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
  name: 'login',
});

// 10 registration attempts per 60 minutes per IP
export const registerLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000,
  maxAttempts: 10,
  name: 'register',
});
