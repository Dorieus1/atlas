const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs/promises");

const {
  UPLOAD_DIR,
  savePhotoRecord,
  getPhotosByCustomer,
  getPhotosByAppointment,
  getPhotoById,
  deletePhoto
} = require("../services/photoService");

const { getCustomerById } = require("../services/customerService");
const { getBusinessById } = require("../services/businessService");
const { getAppointmentById } = require("../services/appointmentService");
const { generateEstimateFromPhoto } = require("../services/aiService");


const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Validated here in application code rather than a SQL CHECK constraint
// on the column - same convention as every other enum-shaped field in
// this app (quotes.type, appointments.status). null/omitted stays a
// valid, untagged photo - tagging is optional depth, not a requirement
// every upload has to satisfy.
const PHOTO_TYPES = ["before", "after"];


// Shared by both list endpoints below - the customer gallery and a
// single job's own photos need to render identically (PhotoGallery.jsx
// is used from both places), so they share one response shape.
const formatPhoto = (photo) => ({
  id: photo.id,
  caption: photo.caption,
  created_at: photo.created_at,
  appointment_id: photo.appointment_id,
  photo_type: photo.photo_type,
  url: `/uploads/photos/${photo.filename}`
});

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

      const { customer_id, caption, appointment_id, photo_type } = req.body;
      const business_id = req.user.business_id;

      if (!req.file) {

        return res.status(400).json({
          error: "No photo was uploaded"
        });

      }

      if (photo_type && !PHOTO_TYPES.includes(photo_type)) {

        return res.status(400).json({
          error: "photo_type must be either \"before\" or \"after\""
        });

      }

      if (caption && caption.length > 300) {

        return res.status(400).json({
          error: "Caption is too long"
        });

      }

      // A job-card upload (from the mobile field view) only ever has the
      // appointment on hand, not a separate customer_id - rather than
      // make every caller look up and pass a redundant customer_id, this
      // derives it from the appointment itself, the same customer_id it's
      // already scoped to. customer_id is still accepted directly (and
      // still required in that case) for the plain customer-gallery
      // upload, which has no appointment context at all.
      let resolvedCustomerId = customer_id;

      if (appointment_id) {

        const appointment = await getAppointmentById(appointment_id, business_id);

        if (!appointment) {

          return res.status(404).json({
            error: "Appointment not found"
          });

        }

        if (!resolvedCustomerId) {

          if (!appointment.customer_id) {

            return res.status(400).json({
              error: "This job has no customer attached, so a photo can't be saved to it"
            });

          }

          resolvedCustomerId = appointment.customer_id;

        }

      }

      if (!resolvedCustomerId) {

        return res.status(400).json({
          error: "customer_id is required"
        });

      }

      const customer = await getCustomerById(resolvedCustomerId, business_id);

      if (!customer) {

        return res.status(404).json({
          error: "Customer not found"
        });

      }

      const id = await savePhotoRecord(
        business_id,
        resolvedCustomerId,
        req.file.filename,
        req.file.originalname,
        caption,
        req.file.mimetype,
        appointment_id || null,
        photo_type || null
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

    res.json(photos.map(formatPhoto));

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getJobPhotos = async (req, res) => {

  try {

    const { appointment_id } = req.params;
    const business_id = req.user.business_id;

    const appointment = await getAppointmentById(appointment_id, business_id);

    if (!appointment) {

      return res.status(404).json({
        error: "Appointment not found"
      });

    }

    const photos = await getPhotosByAppointment(appointment_id, business_id);

    res.json(photos.map(formatPhoto));

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

  getJobPhotos,

  removePhoto,

  draftEstimateFromPhoto

};
