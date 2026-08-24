const db = require("../../database/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");


const createUser = async (
  business_id,
  name,
  email,
  password
) => {


  const id = uuidv4();

  const normalizedEmail = email.trim().toLowerCase();

  const trimmedName = name ? name.trim() : name;


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

        trimmedName,

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





const setResetToken = (email) => {

  return new Promise((resolve, reject) => {

    const token = crypto.randomBytes(32).toString("hex");

    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    db.run(

      `
      UPDATE users
      SET reset_token = ?, reset_token_expires = ?
      WHERE LOWER(email) = LOWER(?)
      `,

      [token, expires, email.trim()],

      function(err) {

        if (err) {

          reject(err);

        } else if (this.changes === 0) {

          resolve(null);

        } else {

          resolve(token);

        }

      }

    );

  });

};



const findUserByResetToken = (token) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT *
      FROM users
      WHERE reset_token = ?
      AND reset_token_expires > ?
      `,

      [token, new Date().toISOString()],

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



const resetPasswordByUserId = async (userId, newPassword) => {

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE users
      SET password = ?, reset_token = NULL, reset_token_expires = NULL
      WHERE id = ?
      `,

      [hashedPassword, userId],

      function(err) {

        if (err) {

          reject(err);

        } else {

          resolve(this.changes > 0);

        }

      }

    );

  });

};



const countUsersByBusiness = (business_id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT COUNT(*) AS count
      FROM users
      WHERE business_id = ?
      `,

      [business_id],

      (err, row) => {

        if (err) {

          reject(err);

        } else {

          resolve(row.count);

        }

      }

    );

  });

};



const getUsersByBusiness = (business_id) => {

  return new Promise((resolve, reject) => {

    db.all(

      `
      SELECT id, name, email, created_at
      FROM users
      WHERE business_id = ?
      ORDER BY created_at ASC
      `,

      [business_id],

      (err, rows) => {

        if (err) {

          reject(err);

        } else {

          resolve(rows);

        }

      }

    );

  });

};



const getUserByIdWithPassword = (userId) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT *
      FROM users
      WHERE id = ?
      `,

      [userId],

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



const getUserById = (userId, business_id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT id, name, email, created_at
      FROM users
      WHERE id = ?
      AND business_id = ?
      `,

      [userId, business_id],

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



const deleteUser = (userId, business_id) => {

  return new Promise((resolve, reject) => {

    db.run(

      `
      DELETE FROM users
      WHERE id = ?
      AND business_id = ?
      `,

      [userId, business_id],

      function(err) {

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

  createUser,

  findUserByEmail,

  setResetToken,

  findUserByResetToken,

  resetPasswordByUserId,

  countUsersByBusiness,

  getUsersByBusiness,

  getUserById,

  getUserByIdWithPassword,

  deleteUser

};