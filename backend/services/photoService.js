const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "..", "uploads", "photos");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}


const savePhotoRecord = (

  business_id,
  customer_id,
  filename,
  original_name,
  caption,
  mime_type,
  appointment_id,
  photo_type

) => {

  return new Promise((resolve, reject) => {

    const id = uuidv4();

    db.run(

      `
      INSERT INTO photos
      (id, business_id, customer_id, filename, original_name, caption, mime_type, appointment_id, photo_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,

      [id, business_id, customer_id, filename, original_name || null, caption || null, mime_type || null, appointment_id || null, photo_type || null],

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



const getPhotosByCustomer = (customer_id, business_id) => {

  return new Promise((resolve, reject) => {

    db.all(

      `
      SELECT *
      FROM photos
      WHERE customer_id = ?
      AND business_id = ?
      ORDER BY created_at DESC
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



// Oldest-first (unlike getPhotosByCustomer's newest-first gallery order)
// - a job's own photos read naturally in the order they were actually
// taken: whatever was snapped walking up to the job first, then the
// after shots once it was done.
const getPhotosByAppointment = (appointment_id, business_id) => {

  return new Promise((resolve, reject) => {

    db.all(

      `
      SELECT *
      FROM photos
      WHERE appointment_id = ?
      AND business_id = ?
      ORDER BY created_at ASC
      `,

      [appointment_id, business_id],

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



const getPhotoById = (id, business_id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT *
      FROM photos
      WHERE id = ?
      AND business_id = ?
      `,

      [id, business_id],

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



const deletePhoto = async (id, business_id) => {

  const photo = await getPhotoById(id, business_id);

  if (!photo) {
    return false;
  }

  await new Promise((resolve, reject) => {

    db.run(

      `
      DELETE FROM photos
      WHERE id = ?
      AND business_id = ?
      `,

      [id, business_id],

      (err) => (err ? reject(err) : resolve())

    );

  });

  const filePath = path.join(UPLOAD_DIR, photo.filename);

  fs.unlink(filePath, (err) => {

    if (err && err.code !== "ENOENT") {
      console.error("Failed to remove photo file:", err.message);
    }

  });

  return true;

};



const deletePhotosByCustomer = async (customer_id, business_id) => {

  const photos = await getPhotosByCustomer(customer_id, business_id);

  await new Promise((resolve, reject) => {

    db.run(

      `DELETE FROM photos WHERE customer_id = ? AND business_id = ?`,

      [customer_id, business_id],

      (err) => (err ? reject(err) : resolve())

    );

  });

  photos.forEach((photo) => {

    fs.unlink(path.join(UPLOAD_DIR, photo.filename), (err) => {

      if (err && err.code !== "ENOENT") {
        console.error("Failed to remove photo file:", err.message);
      }

    });

  });

};



module.exports = {

  UPLOAD_DIR,

  savePhotoRecord,

  getPhotosByCustomer,

  getPhotosByAppointment,

  getPhotoById,

  deletePhoto,

  deletePhotosByCustomer

};
