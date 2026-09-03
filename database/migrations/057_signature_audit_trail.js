const { run } = require("./util");

module.exports = async (db) => {

  // A signature alone (migration 054) proves what was drawn, not who
  // drew it or from where - the same gap that made physical signatures
  // untrustworthy on their own before notarization existed. Recording
  // the IP address and browser/device (user agent) of the actual
  // request that submitted the signature gives a business a real,
  // independently-checkable record to point to if a signature is ever
  // disputed ("that wasn't approved by anyone at my company"), the same
  // basic audit trail every mainstream e-signature product (DocuSign,
  // HelloSign, etc.) captures by default. Applies to both acceptance
  // paths (the customer's own portal, and a staff member's on-site
  // device) - whichever request actually carried the signature.
  await run(db, `ALTER TABLE quotes ADD COLUMN signed_ip_address TEXT`);

  await run(db, `ALTER TABLE quotes ADD COLUMN signed_user_agent TEXT`);

};
