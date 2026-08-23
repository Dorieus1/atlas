const db = require("../../database/db");


const generateDashboardIntelligence = (business_id) => {

  return new Promise((resolve, reject) => {


    db.all(

      `
      SELECT
        leads.*,
        customers.name

      FROM leads

      LEFT JOIN customers

      ON leads.customer_id = customers.id

      WHERE leads.business_id = ?

      ORDER BY leads.created_at DESC

      `,

      [business_id],


      (err, leads)=>{


        if(err){

          reject(err);

          return;

        }



        const recommendations = leads.map((lead)=>{


          let action = "";

          let reason = "";



          if(lead.priority === "hot"){


            action =
              "Contact customer immediately.";


            reason =
              "Customer shows strong buying intent.";


          }

          else if(lead.status === "contacted"){


            action =
              "Send a follow-up message.";


            reason =
              "Customer was contacted but may need another touchpoint.";


          }

          else {


            action =
              "Continue nurturing this customer.";


            reason =
              "Customer is still in the early sales process.";


          }



          return {


            customer_id:
              lead.customer_id,


            business_id:
              lead.business_id,


            customer:
              lead.name || "Unknown",


            priority:
              lead.priority,


            status:
              lead.status,


            interest:
              lead.interest,


            reason,


            action


          };


        });



        resolve({

          recommendations

        });


      }

    );


  });


};



module.exports = {

  generateDashboardIntelligence

};