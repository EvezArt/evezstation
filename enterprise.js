/**
 * Enterprise — Production-grade auth, billing, rate limiting, audit trail.
 * Middleware stack for EVEZ Station API hardening.
 */

class RateLimiter {
  constructor(config = {}) {
    this.windows = new Map(); // key -> { count, resetAt }
    this.limit = config.limit || 100;
    this.windowMs = config.windowMs || 60000;
  }

  check(key) {
    const now = Date.now();
    let window = this.windows.get(key);
    if (!window || now > window.resetAt) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
    }
    window.count++;
    const remaining = Math.max(0, this.limit - window.count);
    return {
      allowed: window.count <= this.limit,
      remaining,
      resetAt: window.resetAt,
      retryAfter: window.count > this.limit ? Math.ceil((window.resetAt - now) / 1000) : 0
    };
  }

  // Periodic cleanup
  cleanup() {
    const now = Date.now();
    for (const [key, window] of this.windows) {
      if (now > window.resetAt + this.windowMs) this.windows.delete(key);
    }
  }
}

class AuditLog {
  constructor(maxSize = 10000) {
    this.entries = [];
    this.maxSize = maxSize;
  }

  log(event) {
    this.entries.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event
    });
    if (this.entries.length > this.maxSize) this.entries = this.entries.slice(-this.maxSize);
  }

  query(filters = {}) {
    let results = [...this.entries];
    if (filters.apiKeyId) results = results.filter(e => e.apiKeyId === filters.apiKeyId);
    if (filters.action) results = results.filter(e => e.action === filters.action);
    if (filters.since) results = results.filter(e => new Date(e.timestamp) >= new Date(filters.since));
    if (filters.until) results = results.filter(e => new Date(e.timestamp) <= new Date(filters.until));
    return results.slice(-(filters.limit || 100));
  }
}

class UsageTracker {
  constructor() {
    this.usage = new Map(); // apiKeyId -> { calls, tokens, lastActive }
  }

  track(apiKeyId, tokens = 0) {
    const u = this.usage.get(apiKeyId) || { calls: 0, tokens: 0, lastActive: null, endpoints: {} };
    u.calls++;
    u.tokens += tokens;
    u.lastActive = new Date().toISOString();
    this.usage.set(apiKeyId, u);
  }

  trackEndpoint(apiKeyId, endpoint) {
    const u = this.usage.get(apiKeyId);
    if (u) {
      u.endpoints[endpoint] = (u.endpoints[endpoint] || 0) + 1;
    }
  }

  getUsage(apiKeyId) {
    return this.usage.get(apiKeyId) || { calls: 0, tokens: 0, lastActive: null };
  }

  getTopUsers(limit = 10) {
    return [...this.usage.entries()]
      .map(([id, u]) => ({ apiKeyId: id, ...u }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, limit);
  }
}

// Tier definitions
const TIERS = {
  explorer: { name: "Explorer", price: 0, callsPerMonth: 1000, tokensPerMonth: 100000, maxClaws: 1, maxSwarmNodes: 2, storage_mb: 100, rateLimit: 20 },
  builder: { name: "Builder", price: 2900, callsPerMonth: 50000, tokensPerMonth: 5000000, maxClaws: 10, maxSwarmNodes: 20, storage_mb: 5120, rateLimit: 100 },
  enterprise: { name: "Enterprise", price: null, callsPerMonth: Infinity, tokensPerMonth: Infinity, maxClaws: Infinity, maxSwarmNodes: Infinity, storage_mb: Infinity, rateLimit: 1000 },
};

// Express middleware factory
function enterpriseMiddleware(config = {}) {
  const rateLimiter = new RateLimiter({ limit: config.rateLimit || 100 });
  const audit = new AuditLog();
  const usage = new UsageTracker();

  // Cleanup interval
  setInterval(() => rateLimiter.cleanup(), 60000);

  const middleware = (req, res, next) => {
    const apiKey = req.headers["x-api-key"] || req.query.api_key;
    const start = Date.now();

    // Rate limit check
    if (apiKey) {
      const check = rateLimiter.check(apiKey);
      res.setHeader("X-RateLimit-Limit", rateLimiter.limit);
      res.setHeader("X-RateLimit-Remaining", check.remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(check.resetAt / 1000));
      if (!check.allowed) {
        res.setHeader("Retry-After", check.retryAfter);
        audit.log({ action: "rate_limited", apiKeyId: apiKey, path: req.path });
        return res.status(429).json({ error: "Rate limit exceeded", retryAfter: check.retryAfter });
      }
    }

    // Track usage
    if (apiKey) {
      usage.track(apiKey);
      usage.trackEndpoint(apiKey, req.path);
    }

    // Audit log on response
    const originalEnd = res.end;
    res.end = function(...args) {
      audit.log({
        action: "api_call",
        apiKeyId: apiKey || "anonymous",
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        latency_ms: Date.now() - start,
        userAgent: req.headers["user-agent"]?.slice(0, 100)
      });
      originalEnd.apply(this, args);
    };

    // Attach enterprise context
    req.enterprise = { audit, usage, rateLimiter, tiers: TIERS };
    next();
  };

  return { middleware, audit, usage, rateLimiter, TIERS };
}

export { RateLimiter, AuditLog, UsageTracker, TIERS, enterpriseMiddleware };
export default enterpriseMiddleware;
