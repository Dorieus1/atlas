const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createAppointment,
  getAppointments,
  getCustomerAppointments,
  updateAppointmentStatus,
  deleteAppointment
} = require("../controllers/appointmentController");


router.post(
  "/",
  authMiddleware,
  createAppointment
);

router.get(
  "/",
  authMiddleware,
  getAppointments
);

router.get(
  "/customer/:customer_id",
  authMiddleware,
  getCustomerAppointments
);

router.patch(
  "/:id",
  authMiddleware,
  updateAppointmentStatus
);

router.delete(
  "/:id",
  authMiddleware,
  deleteAppointment
);


module.exports = router;
