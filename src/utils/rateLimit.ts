import type { NextApiRequest } from 'next';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the time window
   */
  maxAttempts: number;

  /**
   * Time window in milliseconds
   */
  windowMs: number;

  /**
   * Function to generate the rate limit key from the request
   * Common options: IP address, user ID, API key, etc.
   * @default Uses IP address
   */
  key?: (request: Request | NextApiRequest) => string | Promise<string>;

  /**
   * Custom store for rate limit data
   * Defaults to in-memory store (not suitable for production with multiple instances)
   */
  store?: RateLimitStore;

  /**
   * Whether to skip rate limiting for certain requests
   */
  skip?: (request: Request | NextApiRequest) => boolean | Promise<boolean>;

  /**
   * Custom error message when rate limited
   */
  message?: string;
}

/**
 * Rate limit state for a specific key
 */
export interface RateLimitState {
  /** Number of requests made in the current window */
  count: number;
  /** Timestamp when the window resets */
  resetAt: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Total limit */
  limit: number;
  /** Timestamp when the window resets */
  resetAt: number;
  /** Number of seconds until reset */
  retryAfter: number;
}

/**
 * Interface for rate limit storage
 */
export interface RateLimitStore {
  /** Get the current state for a key */
  get(key: string): Promise<RateLimitState | null>;
  /** Set the state for a key */
  set(key: string, state: RateLimitState, ttlMs: number): Promise<void>;
  /** Increment the count for a key, returns new state */
  increment(key: string, windowMs: number): Promise<RateLimitState>;
}

/**
 * In-memory rate limit store (for development/testing only)
 * In production, use Redis or another distributed store
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitState>();

  async get(key: string): Promise<RateLimitState | null> {
    const state = this.store.get(key);
    if (!state) return null;

    // Check if window has expired
    if (Date.now() > state.resetAt) {
      this.store.delete(key);
      return null;
    }

    return state;
  }

  async set(key: string, state: RateLimitState, _ttlMs: number): Promise<void> {
    this.store.set(key, state);

    // Clean up expired entries periodically
    if (this.store.size > 1000) {
      this.cleanup();
    }
  }

  async increment(key: string, windowMs: number): Promise<RateLimitState> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now > existing.resetAt) {
      // Start new window
      const state: RateLimitState = {
        count: 1,
        resetAt: now + windowMs,
      };
      this.store.set(key, state);
      return state;
    }

    // Increment existing window
    existing.count++;
    return existing;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, state] of this.store.entries()) {
      if (now > state.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

// Default shared store instance
let defaultStore: RateLimitStore = new MemoryRateLimitStore();

/**
 * Set a custom default rate limit store
 * Useful for setting up Redis or other distributed stores
 */
export function setDefaultRateLimitStore(store: RateLimitStore): void {
  defaultStore = store;
}

/**
 * Get the client IP from a request
 */
function getClientIp(request: Request | NextApiRequest): string {
  // App Router Request
  if ('headers' in request && request.headers instanceof Headers) {
    return (
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'
    );
  }

  // Pages Router NextApiRequest
  const req = request as NextApiRequest;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0]?.split(',')[0]?.trim() || 'unknown';
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') {
    return realIp;
  }

  // Fallback to socket address if available
  const socket = (req as unknown as { socket?: { remoteAddress?: string } }).socket;
  return socket?.remoteAddress || 'unknown';
}

/**
 * Check rate limit for a request
 */
export async function checkRateLimit(
  request: Request | NextApiRequest,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { maxAttempts, windowMs, key, store = defaultStore, skip } = config;

  // Check if we should skip rate limiting
  if (skip && (await skip(request))) {
    return {
      allowed: true,
      remaining: maxAttempts,
      limit: maxAttempts,
      resetAt: Date.now() + windowMs,
      retryAfter: 0,
    };
  }

  // Get the rate limit key
  const rateLimitKey = key ? await key(request) : getClientIp(request);
  const fullKey = `ratelimit:${rateLimitKey}`;

  // Increment the counter
  const state = await store.increment(fullKey, windowMs);

  const allowed = state.count <= maxAttempts;
  const remaining = Math.max(0, maxAttempts - state.count);
  const retryAfter = allowed ? 0 : Math.ceil((state.resetAt - Date.now()) / 1000);

  return {
    allowed,
    remaining,
    limit: maxAttempts,
    resetAt: state.resetAt,
    retryAfter,
  };
}

/**
 * Rate limit error thrown when a request exceeds the rate limit
 */
export class RateLimitError extends Error {
  readonly retryAfter: number;
  readonly remaining: number;
  readonly limit: number;
  readonly resetAt: number;

  constructor(result: RateLimitResult, message?: string) {
    super(message || `Rate limit exceeded. Retry after ${result.retryAfter} seconds.`);
    this.name = 'RateLimitError';
    this.retryAfter = result.retryAfter;
    this.remaining = result.remaining;
    this.limit = result.limit;
    this.resetAt = result.resetAt;
  }

  /**
   * Get headers to send with the rate limit response
   */
  getHeaders(): Record<string, string> {
    return {
      'X-RateLimit-Limit': String(this.limit),
      'X-RateLimit-Remaining': String(this.remaining),
      'X-RateLimit-Reset': String(this.resetAt),
      'Retry-After': String(this.retryAfter),
    };
  }
}

/**
 * Create rate limit configuration with sensible defaults
 */
export function rateLimit(config: Partial<RateLimitConfig> & { maxAttempts: number; windowMs: number }): RateLimitConfig {
  return {
    key: getClientIp,
    ...config,
  };
}
