const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");



const createTask = (

  customer_id,
  business_id,
  title,
  description,
  due_date

) => {


  return new Promise((resolve, reject)=>{


    const id = uuidv4();



    db.run(

      `
      INSERT INTO tasks
      (
        id,
        customer_id,
        business_id,
        title,
        description,
        due_date
      )

      VALUES (?, ?, ?, ?, ?, ?)
      `,

      [

        id,
        customer_id,
        business_id,
        title,
        description || null,
        due_date || null

      ],


      function(err){


        if(err){

          reject(err);

        } else {

          resolve(id);

        }


      }


    );


  });


};







const getTasks = (business_id) => {


  return new Promise((resolve,reject)=>{


    db.all(

      `
      SELECT *
      FROM tasks
      WHERE business_id = ?
      ORDER BY created_at DESC
      `,

      [

        business_id

      ],


      (err, rows)=>{


        if(err){

          reject(err);

        } else {

          resolve(rows);

        }


      }


    );


  });


};







const completeTask = (id, business_id)=>{


  return new Promise((resolve,reject)=>{


    db.run(

      `
      UPDATE tasks

      SET status = 'completed'

      WHERE id = ?

      AND business_id = ?

      `,

      [

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







module.exports = {

  createTask,

  getTasks,

  completeTask

};