const db = require("./db");

db.serialize(() => {

  db.run(`
    ALTER TABLE users
    ADD COLUMN reset_token TEXT
  `, (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    }

  });



  db.run(`
    ALTER TABLE users
    ADD COLUMN reset_token_expires DATETIME
  `, (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    }

  });

});

console.log("Password reset column migration complete");
