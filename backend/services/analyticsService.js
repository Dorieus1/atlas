const db = require("../../database/db");



const getAnalytics = (business_id) => {


  return new Promise((resolve,reject)=>{


    const analytics = {};



    db.get(

      `
      SELECT COUNT(*) as count
      FROM customers
      WHERE business_id = ?
      `,

      [business_id],

      (err,row)=>{


        if(err){

          reject(err);
          return;

        }


        analytics.customers = row.count;



        db.get(

          `
          SELECT COUNT(*) as count
          FROM leads
          WHERE business_id = ?
          `,

          [business_id],

          (err,row)=>{


            analytics.leads = row.count;



            db.get(

              `
              SELECT COUNT(*) as count
              FROM leads
              WHERE business_id = ?
              AND priority = 'hot'
              `,

              [business_id],

              (err,row)=>{


                analytics.hotLeads = row.count;



                resolve(analytics);



              }


            );


          }


        );


      }


    );


  });


};



module.exports = {

  getAnalytics

};