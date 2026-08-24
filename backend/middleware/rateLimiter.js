const rateLimiter = (maxRequests, windowMs) => {

  // One Map per configured limiter instance, not a module-level shared
  // one - otherwise every route that calls rateLimiter(...) draws from
  // the same per-IP/per-user bucket, so a tight limit on one endpoint
  // (e.g. 5/15min) silently throttles an unrelated endpoint (e.g.
  // 60/min) sharing the same caller.
  const requestLog = new Map();

  return (req, res, next) => {

    const key = req.user ? req.user.id : req.ip;

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
