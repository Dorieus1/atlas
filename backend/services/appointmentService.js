const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");



const createAppointment = (

  business_id,
  customer_id,
  title,
  notes,
  start_time,
  end_time,
  status = "scheduled"

) => {


  return new Promise((resolve, reject) => {


    const id = uuidv4();


    db.run(

      `
      INSERT INTO appointments
      (
        id,
        business_id,
        customer_id,
        title,
        notes,
        start_time,
        end_time,
        status
      )

      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,

      [

        id,
        business_id,
        customer_id || null,
        title,
        notes || null,
        start_time,
        end_time || null,
        status

      ],

      function (err) {

        if (err) {

          reject(err);

        } else {

          resolve(id);

        }

      }

    );

  });

};



const getAppointments = (business_id) => {


  return new Promise((resolve, reject) => {


    db.all(

      `
      SELECT
        appointments.*,
        customers.name AS customer_name
      FROM appointments
      LEFT JOIN customers ON customers.id = appointments.customer_id
      WHERE appointments.business_id = ?
      ORDER BY appointments.start_time ASC
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



const getAppointmentsByCustomer = (customer_id, business_id) => {


  return new Promise((resolve, reject) => {


    db.all(

      `
      SELECT *
      FROM appointments
      WHERE customer_id = ?
      AND business_id = ?
      ORDER BY start_time ASC
      `,

      [customer_id, business_id],

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



const getAppointmentById = (id, business_id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT *
      FROM appointments
      WHERE id = ?
      AND business_id = ?
      `,

      [id, business_id],

      (err, row) => (err ? reject(err) : resolve(row))

    );

  });

};



const updateAppointmentStatus = (id, business_id, status) => {


  return new Promise((resolve, reject) => {


    db.run(

      `
      UPDATE appointments
      SET status = ?
      WHERE id = ?
      AND business_id = ?
      `,

      [status, id, business_id],

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



const deleteAppointment = (id, business_id) => {


  return new Promise((resolve, reject) => {


    db.run(

      `
      DELETE FROM appointments
      WHERE id = ?
      AND business_id = ?
      `,

      [id, business_id],

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



module.exports = {

  createAppointment,

  getAppointmentById,

  getAppointments,

  getAppointmentsByCustomer,

  updateAppointmentStatus,

  deleteAppointment

};
