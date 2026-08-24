const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
} = require("../controllers/notificationController");


router.get(
  "/",
  authMiddleware,
  getNotifications
);

router.get(
  "/unread-count",
  authMiddleware,
  getUnreadCount
);

router.patch(
  "/read-all",
  authMiddleware,
  markAllAsRead
);

router.patch(
  "/:id/read",
  authMiddleware,
  markAsRead
);


module.exports = router;
