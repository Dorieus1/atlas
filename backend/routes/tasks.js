const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createTask,
  getTasks,
  completeTask
} = require("../controllers/taskController");

router.post(
  "/",
  authMiddleware,
  createTask
);

router.get(
  "/",
  authMiddleware,
  getTasks
);

router.patch(
  "/:id",
  authMiddleware,
  completeTask
);

module.exports = router;