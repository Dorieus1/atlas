// Shared helper for migration files: promisifies db.run and, for ALTER
// TABLE statements, treats "duplicate column" as success so a migration
// stays safe to re-run even outside the tracked/applied-once path.
const run = (db, sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.run(sql, params, function (err) {

      if (err && !err.message.includes("duplicate column")) {
        reject(err);
      } else {
        resolve(this);
      }

    });

  });

};

module.exports = { run };
