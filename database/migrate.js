const db = require("./db");


db.serialize(() => {


  db.run(`
    ALTER TABLE businesses
    ADD COLUMN phone TEXT
  `, (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    }

  });



  db.run(`
    ALTER TABLE businesses
    ADD COLUMN email TEXT
  `, (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    }

  });



  db.run(`
    ALTER TABLE businesses
    ADD COLUMN address TEXT
  `, (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    }

  });



  db.run(`
    ALTER TABLE businesses
    ADD COLUMN industry TEXT
  `, (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    }

  });



  db.run(`
    ALTER TABLE businesses
    ADD COLUMN services TEXT
  `, (err) => {

    if (err && !err.message.includes("duplicate column")) {
      console.log(err.message);
    }

  });



  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      business_id TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      email TEXT,
      interest TEXT,
      status TEXT DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {

    if (err) {
      console.log(err.message);
    }

  });



});


console.log("Database migration complete");