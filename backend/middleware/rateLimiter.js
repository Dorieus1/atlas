const rateLimiter = (maxRequests, windowMs) => {

  // One Map per configured limiter instance, not a module-level shared
  // one - otherwise every route that calls rateLimiter(...) draws from
  // the same per-IP/per-user bucket, so a tight limit on one endpoint
  // (e.g. 5/15min) silently throttles an unrelated endpoint (e.g.
  // 60/min) sharing the same caller.
  const requestLog = new Map();

  return (req, res, next) => {

    // Every unauthenticated route (portal login/verify, the public chat,
    // etc.) has nothing but req.ip to key on - correct in production,
    // where req.ip really does distinguish different people. Under the
    // test suite, though, every request comes from the same loopback
    // address regardless of which "customer" or "business" a given test
    // is simulating, so many independent tests calling the same
    // anonymous endpoint end up sharing ONE rate-limit bucket purely as
    // a test-environment artifact - not the real abuse this limiter
    // exists to catch. A test can opt into its own independent bucket by
    // sending X-Test-Client-Id (see the shared loginAsCustomer() test
    // helper) - inert outside Jest, so it changes nothing about
    // production behavior or the real per-IP limit rateLimit.test.js
    // itself verifies.
    const testClientId = process.env.JEST_WORKER_ID !== undefined && req.headers["x-test-client-id"];

    const key = testClientId ? `test:${testClientId}` : (req.user ? req.user.id : req.ip);

    const now = Date.now();

    const timestamps = (requestLog.get(key) || [])
      .filter((t) => now - t < windowMs);

    if (timestamps.length >= maxRequests) {

      return res.status(429).json({
        error: "Too many requests. Please slow down and try again shortly."
      });

    }

    timestamps.push(now);

    requestLog.set(key, timestamps);

    next();

  };

};

module.exports = rateLimiter;
