const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs/promises");

const {
  UPLOAD_DIR,
  savePhotoRecord,
  getPhotosByCustomer,
  getPhotoById,
  deletePhoto
} = require("../services/photoService");

const { getCustomerById } = require("../services/customerService");
const { getBusinessById } = require("../services/businessService");
const { generateEstimateFromPhoto } = require("../services/aiService");


const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// The extension a saved file gets is picked from THIS map, keyed by the
// (fileFilter-validated) mimetype - never from the client-supplied
// original filename. file.mimetype is just the multipart field's
// Content-Type, which the uploader fully controls (curl, a hand-built
// FormData, etc.) - nothing stops someone naming their upload
// "x.html" while still passing fileFilter by claiming "image/jpeg".
// Since these are served back out via a plain express.static mount
// (see server.js's "/uploads" route) with no per-file Content-Type
// override, that static server decides the response's Content-Type
// from the FILE'S OWN EXTENSION - if the original filename's extension
// were trusted, an ".html" (or ".svg", etc) upload would come back out
// as real, browser-executed HTML/script instead of an image, giving
// anyone who later opens that "photo" directly (the owner, a
// teammate, or a customer in their portal) a stored-XSS payload
// running in Atlas's own origin. Forcing the extension from the
// validated mimetype means a saved file's extension is always one of
// these four safe, non-executable image types, regardless of what the
// uploader named it.
const EXTENSION_BY_MIME_TYPE = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif"
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;


const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (req, file, cb) => {

    const ext = EXTENSION_BY_MIME_TYPE[file.mimetype] || "";
    cb(null, `${uuidv4()}${ext}`);

  }

});


const upload = multer({

  storage,

  limits: {
    fileSize: MAX_FILE_SIZE
  },

  fileFilter: (req, file, cb) => {

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, WEBP, and GIF images are allowed"));
      return;
    }

    cb(null, true);

  }

}).single("photo");



const uploadPhoto = (req, res) => {

  upload(req, res, async (err) => {

    if (err) {

      const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? "That image is too large. Please use a file under 10MB."
        : err.message || "Couldn't upload that file.";

      return res.status(400).json({ error: message });

    }

    try {

      const { customer_id, caption } = req.body;
      const business_id = req.user.business_id;

      if (!req.file) {

        return res.status(400).json({
          error: "No photo was uploaded"
        });

      }

      if (!customer_id) {

        return res.status(400).json({
          error: "customer_id is required"
        });

      }

      if (caption && caption.length > 300) {

        return res.status(400).json({
          error: "Caption is too long"
        });

      }

      const customer = await getCustomerById(customer_id, business_id);

      if (!customer) {

        return res.status(404).json({
          error: "Customer not found"
        });

      }

      const id = await savePhotoRecord(
        business_id,
        customer_id,
        req.file.filename,
        req.file.originalname,
        caption,
        req.file.mimetype
      );

      res.status(201).json({
        id,
        message: "Photo uploaded"
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: "Something went wrong. Please try again."
      });

    }

  });

};



const getCustomerPhotos = async (req, res) => {

  try {

    const { customer_id } = req.params;
    const business_id = req.user.business_id;

    const customer = await getCustomerById(customer_id, business_id);

    if (!customer) {

      return res.status(404).json({
        error: "Customer not found"
      });

    }

    const photos = await getPhotosByCustomer(customer_id, business_id);

    res.json(

      photos.map((photo) => ({
        id: photo.id,
        caption: photo.caption,
        created_at: photo.created_at,
        url: `/uploads/photos/${photo.filename}`
      }))

    );

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const removePhoto = async (req, res) => {

  try {

    const deleted = await deletePhoto(req.params.id, req.user.business_id);

    if (!deleted) {

      return res.status(404).json({
        error: "Photo not found"
      });

    }

    res.json({
      message: "Photo removed"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const draftEstimateFromPhoto = async (req, res) => {

  try {

    const photo = await getPhotoById(req.params.id, req.user.business_id);

    if (!photo) {

      return res.status(404).json({
        error: "Photo not found"
      });

    }

    let fileBuffer;

    try {

      fileBuffer = await fs.readFile(path.join(UPLOAD_DIR, photo.filename));

    } catch (readError) {

      return res.status(404).json({
        error: "That photo's file couldn't be found"
      });

    }

    const dataUrl = `data:${photo.mime_type || "image/jpeg"};base64,${fileBuffer.toString("base64")}`;

    const business = await getBusinessById(req.user.business_id);

    let draft;

    try {

      draft = await generateEstimateFromPhoto(dataUrl, business, photo.caption);

    } catch (aiError) {

      console.error("PHOTO ESTIMATE AI ERROR:", aiError);

      return res.status(502).json({
        error: "Couldn't draft an estimate from that photo right now. Please try again."
      });

    }

    res.json(draft);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  uploadPhoto,

  getCustomerPhotos,

  removePhoto,

  draftEstimateFromPhoto

};
