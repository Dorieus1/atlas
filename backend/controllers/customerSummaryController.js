const db = require("../../database/db");


const {
  generateCustomerSummary
} = require("../services/customerSummaryService");



const getCustomerSummary = async (req, res) => {


  const {
    customer_id
  } = req.params;



  try {


    db.get(

      `
      SELECT *
      FROM customers
      WHERE id = ?
      AND business_id = ?
      `,

      [customer_id, req.user.business_id],

      async (err, customer) => {


        if (err) {

          return res.status(500).json({

            error: err.message

          });

        }



        if (!customer) {

          return res.status(404).json({

            error: "Customer not found"

          });

        }



        db.all(

          `
          SELECT *
          FROM conversations
          WHERE customer_id = ?
          `,

          [customer_id],

          async (err, conversations) => {


            db.all(

              `
              SELECT *
              FROM notes
              WHERE customer_id = ?
              `,

              [customer_id],

              async (err, notes) => {


                try {

                  const summary =
                    await generateCustomerSummary(

                      customer,

                      conversations,

                      notes,

                      []

                    );



                  res.json({

                    summary

                  });

                } catch (summaryError) {

                  console.error(summaryError);

                  res.status(500).json({

                    error: "Summary failed"

                  });

                }


              }


            );


          }


        );


      }


    );


  } catch(error) {


    console.error(error);


    res.status(500).json({

      error: "Summary failed"

    });


  }


};



module.exports = {

  getCustomerSummary

};