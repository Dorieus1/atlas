const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");



// priority is now passed in already-computed (see chatService.js's
// runLeadDetection) rather than classified internally here - the caller
// needs to know hot/warm/cold BEFORE deciding whether to create a lead
// at all (a "cold" message shouldn't become a lead in the first place),
// so classifying here too would either duplicate that same OpenAI call
// for nothing or force this function to make its own irreversible
// decision about whether it's worth creating. createLead's only other
// caller was this same chatService.js path, so this is a safe, fully
// contained signature change.
const createLead = (

  customer_id,

  business_id,

  interest,

  priority

) => {

  return new Promise((resolve, reject) => {

    try {

      const id = uuidv4();

      db.get(

        `
        SELECT name, email, phone
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
              phone,
              interest,
              priority
            )

            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,

            [

              id,

              customer_id,

              business_id,

              customer?.name || null,

              customer?.email || null,

              customer?.phone || null,

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





// Separate from updateLead on purpose - status changes carry real side
// effects (stamping last_contacted/next_follow_up), and tangling an
// unrelated field into that same function risks a source update
// accidentally tripping one of those status-specific branches.
const updateLeadSource = (id, source, business_id) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE leads
      SET source = ?
      WHERE id = ?
      AND business_id = ?
      `,

      [source, id, business_id],

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



// Deliberately NOT "is the customer's most recent lead still open" -
// getCustomerLead above only ever looks at the single newest row, so a
// customer with an older lead still sitting at "contacted" and a
// NEWER, already-closed one would slip past that check entirely (the
// newest row looks closed, even though an older one is still a live
// open opportunity) and get a duplicate lead created anyway - exactly
// the bug runLeadDetection's own dedup check is supposed to prevent.
// This checks across ALL of the customer's leads, not just the latest.
const hasOpenLead = (customer_id, business_id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT 1
      FROM leads
      WHERE customer_id = ?
      AND business_id = ?
      AND status != 'closed'
      LIMIT 1
      `,

      [customer_id, business_id],

      (err, row) => {

        if (err) {
          reject(err);
        } else {
          resolve(!!row);
        }

      }

    );

  });

};



module.exports = {

  createLead,

  hasOpenLead,

  getLeadsByBusiness,

  updateLead,

  updateLeadSource,

  getCustomerLead

};