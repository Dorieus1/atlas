const db = require("../../database/db");


const getTourStatus = (business_id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `SELECT tour_completed FROM businesses WHERE id = ?`,

      [business_id],

      (err, row) => (err ? reject(err) : resolve({ completed: !!(row && row.tour_completed) }))

    );

  });

};


const completeTour = (business_id) => {

  return new Promise((resolve, reject) => {

    db.run(

      `UPDATE businesses SET tour_completed = 1 WHERE id = ?`,

      [business_id],

      function (err) {

        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }

      }

    );

  });

};


module.exports = {

  getTourStatus,

  completeTour

};
