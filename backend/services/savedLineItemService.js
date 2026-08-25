const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");


const runAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.run(sql, params, function (err) {

      if (err) {
        reject(err);
      } else {
        resolve(this);
      }

    });

  });

};


const allAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.all(sql, params, (err, rows) => {

      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }

    });

  });

};


const getAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.get(sql, params, (err, row) => {

      if (err) {
        reject(err);
      } else {
        resolve(row);
      }

    });

  });

};



const createSavedLineItem = async (business_id, description, unit_price) => {

  const id = uuidv4();

  await runAsync(

    `
    INSERT INTO saved_line_items
    (id, business_id, description, unit_price)
    VALUES (?, ?, ?, ?)
    `,

    [id, business_id, description, unit_price]

  );

  return id;

};



const getSavedLineItems = (business_id) => {

  return allAsync(

    `
    SELECT *
    FROM saved_line_items
    WHERE business_id = ?
    ORDER BY created_at ASC
    `,

    [business_id]

  );

};



const getSavedLineItemById = (id, business_id) => {

  return getAsync(

    `
    SELECT *
    FROM saved_line_items
    WHERE id = ?
    AND business_id = ?
    `,

    [id, business_id]

  );

};



const updateSavedLineItem = async (id, business_id, description, unit_price) => {

  const result = await runAsync(

    `
    UPDATE saved_line_items
    SET description = ?, unit_price = ?
    WHERE id = ?
    AND business_id = ?
    `,

    [description, unit_price, id, business_id]

  );

  return result.changes > 0;

};



const deleteSavedLineItem = async (id, business_id) => {

  const result = await runAsync(

    `
    DELETE FROM saved_line_items
    WHERE id = ?
    AND business_id = ?
    `,

    [id, business_id]

  );

  return result.changes > 0;

};



module.exports = {

  createSavedLineItem,

  getSavedLineItems,

  getSavedLineItemById,

  updateSavedLineItem,

  deleteSavedLineItem

};
