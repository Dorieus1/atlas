const { run } = require("./util");

module.exports = async (db) => {

  // Closes the other half of an old user request ("we should add a
  // light mode but also like different color or design settings") -
  // light/dark shipped back in migration-era commit 7ce6022, but the
  // brand color itself (the orange used for every primary button, the
  // active nav highlight, links) was still fixed for every business.
  // NULL means "use the default orange" - every existing business gets
  // exactly the look it already has; validated against a small fixed
  // allowlist in application code (see businessController.js), the same
  // way every other enum-shaped column in this app is, rather than a
  // SQL CHECK constraint.
  await run(db, `ALTER TABLE businesses ADD COLUMN accent_color TEXT`);

};
