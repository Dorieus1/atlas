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



});


console.log("Business profile migration complete");