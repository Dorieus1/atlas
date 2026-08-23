const requestLog = new Map();

const rateLimiter = (maxRequests, windowMs) => {

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
