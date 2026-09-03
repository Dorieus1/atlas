const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const requireOwner = require("../middleware/requireOwner");

const {
  getTimesheets,
  exportTimesheetsCsv
} = require("../controllers/timesheetController");


// Owner-only, unlike the clock-in/out endpoints themselves (any team
// member can clock themselves in/out) and unlike /api/analytics (any
// team member can see the business's aggregate labor cost) - this
// report names each teammate next to their hours and effectively their
// pay, which is a level of detail about coworkers that should stay with
// whoever runs payroll, not open to every logged-in crew member.
router.get(
  "/",
  authMiddleware,
  requireOwner,
  getTimesheets
);

// ".csv" suffix matches the convention exportQuotesCsv's route already
// set (routes/quotes.js) rather than a bare "/export".
router.get(
  "/export.csv",
  authMiddleware,
  requireOwner,
  exportTimesheetsCsv
);


module.exports = router;
