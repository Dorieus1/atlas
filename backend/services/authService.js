const db = require("../../database/db");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");


const createUser = async (
  business_id,
  name,
  email,
  password
) => {


  const id = uuidv4();

  const normalizedEmail = email.trim().toLowerCase();


  const hashedPassword =
    await bcrypt.hash(password, 10);



  return new Promise((resolve,reject)=>{


    db.run(

      `
      INSERT INTO users
      (
        id,
        business_id,
        name,
        email,
        password
      )

      VALUES (?, ?, ?, ?, ?)

      `,

      [

        id,

        business_id,

        name,

        normalizedEmail,

        hashedPassword

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





const findUserByEmail = (email)=>{


  return new Promise((resolve,reject)=>{


    db.get(

      `
      SELECT *
      FROM users
      WHERE LOWER(email) = LOWER(?)

      `,

      [email.trim()],

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

  createUser,

  findUserByEmail

};