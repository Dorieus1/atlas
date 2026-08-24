const { run } = require("./util");

module.exports = async (db) => {

  await run(db, `ALTER TABLE businesses ADD COLUMN review_link TEXT`);

};
