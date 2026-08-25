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



const createTag = async (business_id, name) => {

  // Case-insensitive duplicate check - "VIP" and "vip" are the same tag
  // as far as filtering is concerned, so letting both exist would defeat
  // the point of a relational tag list in the first place.
  const existing = await getAsync(
    `
    SELECT id
    FROM tags
    WHERE business_id = ?
    AND LOWER(name) = LOWER(?)
    `,
    [business_id, name]
  );

  if (existing) {

    const error = new Error(`A tag named "${name}" already exists`);
    error.code = "DUPLICATE_TAG";
    throw error;

  }

  const id = uuidv4();

  await runAsync(
    `
    INSERT INTO tags
    (id, business_id, name)
    VALUES (?, ?, ?)
    `,
    [id, business_id, name]
  );

  return id;

};



const getTags = (business_id) => {

  return allAsync(
    `
    SELECT *
    FROM tags
    WHERE business_id = ?
    ORDER BY created_at ASC
    `,
    [business_id]
  );

};



const getTagById = (id, business_id) => {

  return getAsync(
    `
    SELECT *
    FROM tags
    WHERE id = ?
    AND business_id = ?
    `,
    [id, business_id]
  );

};



const deleteTag = async (id, business_id) => {

  const tag = await getTagById(id, business_id);

  if (!tag) {
    return false;
  }

  // A real transaction so a tag never ends up deleted while some of its
  // customer_tags rows are left behind (or vice versa) if something fails
  // partway through.
  await runAsync("BEGIN TRANSACTION");

  try {

    await runAsync(
      `
      DELETE FROM customer_tags
      WHERE tag_id = ?
      AND business_id = ?
      `,
      [id, business_id]
    );

    const result = await runAsync(
      `
      DELETE FROM tags
      WHERE id = ?
      AND business_id = ?
      `,
      [id, business_id]
    );

    await runAsync("COMMIT");

    return result.changes > 0;

  } catch (err) {

    await runAsync("ROLLBACK").catch(() => {});
    throw err;

  }

};



module.exports = {

  createTag,

  getTags,

  getTagById,

  deleteTag

};
