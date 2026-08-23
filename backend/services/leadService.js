const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");

const {
  classifyLead
} = require("./aiService");



const createLead = (

  customer_id,

  business_id,

  interest

) => {

  return new Promise(async (resolve, reject) => {

    try {

      const id = uuidv4();

      const priority = await classifyLead(interest);

      db.get(

        `
        SELECT name, email
        FROM customers
        WHERE id = ?
        `,

        [
          customer_id
        ],

        (err, customer)=>{

          if(err){

            reject(err);

            return;

          }

          db.run(

            `
            INSERT INTO leads
            (
              id,
              customer_id,
              business_id,
              name,
              email,
              interest,
              priority
            )

            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,

            [

              id,

              customer_id,

              business_id,

              customer?.name || null,

              customer?.email || null,

              interest,

              priority

            ],

            function(err){

              if(err){

                reject(err);

              } else {

                resolve(id);

              }

            }

          );

        }

      );

    } catch(error){

      reject(error);

    }

  });

};





const getLeads = () => {

  return new Promise((resolve,reject)=>{

    db.all(

      `
      SELECT *
      FROM leads
      ORDER BY created_at DESC
      `,

      [],

      (err,rows)=>{

        if(err){

          reject(err);

        } else {

          resolve(rows);

        }

      }

    );

  });

};





const getLeadsByBusiness = (business_id) => {

  return new Promise((resolve,reject)=>{

    db.all(

      `
      SELECT *
      FROM leads
      WHERE business_id = ?
      ORDER BY created_at DESC
      `,

      [

        business_id

      ],

      (err,rows)=>{

        if(err){

          reject(err);

        } else {

          resolve(rows);

        }

      }

    );

  });

};





const updateLead = (

  id,

  status,

  business_id

) => {

  return new Promise((resolve,reject)=>{

    let lastContacted = null;

    let nextFollowUp = null;

    if(status === "contacted"){

      lastContacted =
        new Date().toISOString();

      const tomorrow =
        new Date();

      tomorrow.setDate(

        tomorrow.getDate()+1

      );

      nextFollowUp =
        tomorrow.toISOString();

    }

    db.run(

      `
      UPDATE leads

      SET

      status = ?,

      last_contacted = COALESCE(?, last_contacted),

      next_follow_up = COALESCE(?, next_follow_up)

      WHERE id = ?
      AND business_id = ?
      `,

      [

        status,

        lastContacted,

        nextFollowUp,

        id,

        business_id

      ],

      function(err){

        if(err){

          reject(err);

        } else {

          resolve(this.changes > 0);

        }

      }

    );

  });

};





const getCustomerLead = (customer_id, business_id) => {

  return new Promise((resolve,reject)=>{

    db.get(

      `
      SELECT *
      FROM leads
      WHERE customer_id = ?
      AND business_id = ?
      ORDER BY created_at DESC
      LIMIT 1
      `,

      [

        customer_id,

        business_id

      ],

      (err,row)=>{

        if(err){

          reject(err);

        } else {

          resolve(row);

        }

      }

    );

  });

};



module.exports = {

  createLead,

  getLeads,

  getLeadsByBusiness,

  updateLead,

  getCustomerLead

};