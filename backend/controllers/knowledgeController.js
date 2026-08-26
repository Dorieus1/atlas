const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");

const { importKnowledgeFromCsv } = require("../services/knowledgeImportService");


// Mirrors customerController.js's own csvUpload setup - memoryStorage
// since an import only needs the file's bytes once to parse, nothing
// persists to disk.
const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024;

const csvUpload = multer({

  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_IMPORT_FILE_SIZE
  }

}).single("file");


const MAX_CATEGORY_LENGTH = 100;


const createKnowledge = (req, res) => {

  const {
    title,
    content,
    category
  } = req.body;

  const business_id = req.user.business_id;


  if (!title || !title.trim() || !content || !content.trim()) {
    return res.status(400).json({
      error: "title and content are required"
    });
  }

  if (title.length > 200 || content.length > 5000) {
    return res.status(400).json({
      error: "Title or content is too long"
    });
  }

  if (category && category.length > MAX_CATEGORY_LENGTH) {
    return res.status(400).json({
      error: "Category is too long"
    });
  }


  const id = uuidv4();


  db.run(
    `INSERT INTO knowledge
    (id, business_id, title, content, category)
    VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      business_id,
      title.trim(),
      content.trim(),
      category && category.trim() ? category.trim() : null
    ],
    function(err) {

      if (err) {
        console.error(err);
        return res.status(500).json({
          error: "Something went wrong. Please try again."
        });
      }


      res.status(201).json({
        id,
        message: "Knowledge saved"
      });

    }
  );

};



const getKnowledge = (req, res) => {

  const {
    business_id
  } = req.params;


  if (business_id !== req.user.business_id) {
    return res.status(403).json({
      error: "Forbidden"
    });
  }


  db.all(
    `SELECT *
     FROM knowledge
     WHERE business_id = ?
     ORDER BY created_at ASC`,
    [
      business_id
    ],
    (err, rows) => {

      if (err) {
        console.error(err);
        return res.status(500).json({
          error: "Something went wrong. Please try again."
        });
      }


      res.json(rows);

    }
  );

};



const updateKnowledge = (req, res) => {

  const {
    title,
    content,
    category
  } = req.body;

  const business_id = req.user.business_id;

  const { id } = req.params;


  if (!title || !title.trim() || !content || !content.trim()) {
    return res.status(400).json({
      error: "title and content are required"
    });
  }

  if (title.length > 200 || content.length > 5000) {
    return res.status(400).json({
      error: "Title or content is too long"
    });
  }

  if (category && category.length > MAX_CATEGORY_LENGTH) {
    return res.status(400).json({
      error: "Category is too long"
    });
  }


  db.run(
    `UPDATE knowledge
     SET title = ?, content = ?, category = ?
     WHERE id = ? AND business_id = ?`,
    [
      title.trim(),
      content.trim(),
      category && category.trim() ? category.trim() : null,
      id,
      business_id
    ],
    function(err) {

      if (err) {
        console.error(err);
        return res.status(500).json({
          error: "Something went wrong. Please try again."
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          error: "Knowledge entry not found"
        });
      }

      res.json({
        message: "Knowledge updated"
      });

    }
  );

};



const deleteKnowledge = (req, res) => {

  const business_id = req.user.business_id;

  const { id } = req.params;


  db.run(
    `DELETE FROM knowledge
     WHERE id = ? AND business_id = ?`,
    [
      id,
      business_id
    ],
    function(err) {

      if (err) {
        console.error(err);
        return res.status(500).json({
          error: "Something went wrong. Please try again."
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          error: "Knowledge entry not found"
        });
      }

      res.json({
        message: "Knowledge deleted"
      });

    }
  );

};



const importKnowledge = (req, res) => {

  csvUpload(req, res, async (err) => {

    if (err) {

      const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? "That file is too large. Please upload a CSV under 2MB."
        : err.message || "Couldn't upload that file.";

      return res.status(400).json({ error: message });

    }

    try {

      if (!req.file) {

        return res.status(400).json({
          error: "No CSV file was uploaded"
        });

      }

      const summary = await importKnowledgeFromCsv(req.user.business_id, req.file.buffer);

      res.json(summary);

    } catch (error) {

      if (error.statusCode) {

        return res.status(error.statusCode).json({
          error: error.message
        });

      }

      console.error(error);

      res.status(500).json({
        error: "Something went wrong. Please try again."
      });

    }

  });

};



module.exports = {
  createKnowledge,
  getKnowledge,
  updateKnowledge,
  deleteKnowledge,
  importKnowledge
};