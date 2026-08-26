const db = require("../../database/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { withTransaction } = require("../../database/transactionQueue");


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });

  });

};


const createUser = async (
  business_id,
  name,
  email,
  password,
  role = "staff"
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
        password,
        role
      )

      VALUES (?, ?, ?, ?, ?, ?)

      `,

      [

        id,

        business_id,

        trimmedName,

        normalizedEmail,

        hashedPassword,

        role

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



// Shared by both password-change paths (the authenticated changePassword
// flow and the forgot/reset-password flow - see authController.js,
// both call this same function) - stamping password_changed_at here
// covers both in one place. authMiddleware rejects any token issued
// before this timestamp, so this is what actually makes a password
// change invalidate a leaked/stolen token instead of leaving it valid
// for the rest of its 7-day life.
const resetPasswordByUserId = async (userId, newPassword) => {

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  return new Promise((resolve, reject) => {

    db.run(

      `
      UPDATE users
      SET password = ?, reset_token = NULL, reset_token_expires = NULL, password_changed_at = ?
      WHERE id = ?
      `,

      [hashedPassword, new Date().toISOString(), userId],

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
      SELECT id, name, email, role, created_at
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



// Clears assigned_user_id on this user's appointments before removing
// them - unlike created_by_user_id/created_by_name (a deliberate
// snapshot, never meant to be re-resolved - see migration
// 032_created_by_attribution.js), assigned_user_id is a live "who's
// doing this job" reference the UI actively looks up by id. Left
// dangling, a removed teammate's appointments would silently stop
// showing an assignee at all (the frontend's teammatesById[id] lookup
// just returns undefined) rather than correctly reading as "unassigned" -
// same free-agent state a never-assigned appointment already has.
const deleteUser = (userId, business_id) => {

  return withTransaction(async () => {

    await runAsync("BEGIN TRANSACTION");

    try {

      await runAsync(
        `UPDATE appointments SET assigned_user_id = NULL WHERE assigned_user_id = ? AND business_id = ?`,
        [userId, business_id]
      );

      const result = await runAsync(

        `
        DELETE FROM users
        WHERE id = ?
        AND business_id = ?
        `,

        [userId, business_id]

      );

      await runAsync("COMMIT");

      return result.changes > 0;

    } catch (err) {

      await runAsync("ROLLBACK").catch(() => {});
      throw err;

    }

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