const db = require("./db");


db.run(

`
CREATE TABLE IF NOT EXISTS notes (

  id TEXT PRIMARY KEY,

  customer_id TEXT NOT NULL,

  note TEXT NOT NULL,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP

)
`,

(err) => {

  if (err) {

    console.log(err.message);

  } else {

    console.log("Notes table created");

  }

  db.close();

}

);