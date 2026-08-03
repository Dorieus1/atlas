const db = require("../../database/db");


const getBusinessProfile = (business_id) => {

  return new Promise((resolve, reject) => {


    db.get(

      `
      SELECT *
      FROM businesses
      WHERE id = ?
      `,

      [business_id],

      (err, row) => {


        if (err) {

          reject(err);

        } else {

          resolve(row);

        }


      }

    );


  });


};



module.exports = {
  getBusinessProfile
};