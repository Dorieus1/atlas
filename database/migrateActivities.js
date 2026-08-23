const db = require("./db");


db.run(

`
CREATE TABLE IF NOT EXISTS activities (

  id TEXT PRIMARY KEY,

  customer_id TEXT NOT NULL,

  type TEXT NOT NULL,

  content TEXT NOT NULL,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP

)
`,

(err) => {

  if (err) {

    console.log(err.message);

  } else {

    console.log("Activities table created");

  }

  db.close();

}

);