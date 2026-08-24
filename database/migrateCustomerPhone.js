const db = require("./db");

db.run(`
  ALTER TABLE customers
  ADD COLUMN phone TEXT
`, (err) => {

  if (err && !err.message.includes("duplicate column")) {
    console.log(err.message);
  } else {
    console.log("Customer phone column migration complete");
  }

});
