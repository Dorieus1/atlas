const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {

  getAllLeads,

  changeLeadStatus,

  getCustomerLead

} = require("../controllers/leadController");



router.get(

  "/",

  authMiddleware,

  getAllLeads

);



router.get(

  "/customer/:customer_id",

  authMiddleware,

  getCustomerLead

);



router.patch(

  "/:id",

  authMiddleware,

  changeLeadStatus

);



module.exports = router;