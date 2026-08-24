const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const {
  UPLOAD_DIR,
  savePhotoRecord,
  getPhotosByCustomer,
  deletePhoto
} = require("../services/photoService");

const { getCustomerById } = require("../services/customerService");


const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const MAX_FILE_SIZE = 10 * 1024 * 1024;


const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (req, file, cb) => {

    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
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



module.exports = {

  uploadPhoto,

  getCustomerPhotos,

  removePhoto

};
