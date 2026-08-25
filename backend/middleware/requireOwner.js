// Gate for the handful of clearly-administrative/financial routes (inviting
// or removing teammates, starting Stripe Connect onboarding, editing the
// business profile) that should only be available to the business owner,
// not every staff login. Must run after authMiddleware, which is what
// populates req.user.role fresh from the DB on every request.
const requireOwner = (req, res, next) => {

  if (!req.user || req.user.role !== "owner") {

    return res.status(403).json({
      error: "Only the business owner can do that"
    });

  }

  next();

};

module.exports = requireOwner;
