const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createSavedLineItem,
  getSavedLineItems,
  updateSavedLineItem,
  deleteSavedLineItem
} = require("../controllers/savedLineItemController");


router.post("/", authMiddleware, createSavedLineItem);

router.get("/", authMiddleware, getSavedLineItems);

router.put("/:id", authMiddleware, updateSavedLineItem);

router.delete("/:id", authMiddleware, deleteSavedLineItem);


module.exports = router;
