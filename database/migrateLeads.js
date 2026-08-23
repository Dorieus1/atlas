const db = require("./db");

db.run(
  `
  ALTER TABLE leads
  ADD COLUMN priority TEXT DEFAULT 'warm'
  `,
  (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    } else {
      console.log("Lead priority migration complete");
    }

    db.close();
  }
);