const db = require("./db");


db.run(

`
CREATE TABLE IF NOT EXISTS appointments (

  id TEXT PRIMARY KEY,

  business_id TEXT NOT NULL,

  customer_id TEXT,

  title TEXT NOT NULL,

  notes TEXT,

  start_time DATETIME NOT NULL,

  end_time DATETIME,

  status TEXT DEFAULT 'scheduled',

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP

)
`,

(err) => {

  if (err) {

    console.log(err.message);

  } else {

    console.log("Appointments table created");

  }

  db.close();

}

);
