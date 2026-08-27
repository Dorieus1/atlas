require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();


// Stops naming the framework in every response for free - not a real
// barrier on its own, but there's no reason to hand a would-be attacker
// even this much for zero cost.
app.disable("x-powered-by");

// Defense in depth alongside the photoController fix that forces
// uploaded files onto a safe image extension: without this, an older
// browser can still "content-sniff" a response and render it as HTML
// based on its bytes rather than its declared Content-Type. This tells
// every browser to trust the Content-Type header as-is instead.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

app.use(cors());

// Registered before express.json() and given its own raw-body parser:
// Stripe's webhook signature check needs the exact, unparsed request
// bytes, which express.json() would otherwise already have consumed by
// the time a route handler saw them.
const { handleStripeWebhook } = require("./controllers/stripeWebhookController");

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use(express.json());

app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "uploads"))
);


const db = require("../database/db");
const { runMigrations } = require("../database/migrate");



const businessRoutes = require("./routes/business");
const customerRoutes = require("./routes/customer");
const chatRoutes = require("./routes/chat");
const activityRoutes = require("./routes/activity");
const leadRoutes = require("./routes/leads");
const conversationRoutes = require("./routes/conversation");
const memoryRoutes = require("./routes/memory");
const knowledgeRoutes = require("./routes/knowledge");
const noteRoutes = require("./routes/notes");
const customerSummaryRoutes = require("./routes/customerSummary");
const followUpRoutes = require("./routes/followUp");
const analyticsRoutes = require("./routes/analytics");
const followUpMessageRoutes = require("./routes/followUpMessage");
const intelligenceRoutes = require("./routes/intelligence");
const briefingRoutes = require("./routes/briefing");
const messageRoutes = require("./routes/messages");
const taskRoutes = require("./routes/tasks");
const authRoutes = require("./routes/auth");
const appointmentRoutes = require("./routes/appointments");
const serviceAgreementRoutes = require("./routes/serviceAgreements");
const quoteRoutes = require("./routes/quotes");
const photoRoutes = require("./routes/photos");
const reviewRequestRoutes = require("./routes/reviewRequests");
const publicRoutes = require("./routes/public");
const notificationRoutes = require("./routes/notifications");
const onboardingRoutes = require("./routes/onboarding");
const tourRoutes = require("./routes/tour");
const portalRoutes = require("./routes/portal");
const stripeConnectRoutes = require("./routes/stripeConnect");
const googleCalendarRoutes = require("./routes/googleCalendar");
const appleCalendarRoutes = require("./routes/appleCalendar");
const calendarFeedRoutes = require("./routes/calendarFeed");
const searchRoutes = require("./routes/search");
const knowledgeGapRoutes = require("./routes/knowledgeGaps");
const savedLineItemRoutes = require("./routes/savedLineItems");
const tagRoutes = require("./routes/tags");
const assistantRoutes = require("./routes/assistant");

app.use("/api/business", businessRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/follow-up-message", followUpMessageRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/intelligence", intelligenceRoutes);
app.use("/api/briefing", briefingRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/memories", memoryRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/customer-summary", customerSummaryRoutes);
app.use("/api/follow-up", followUpRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/service-agreements", serviceAgreementRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/review-requests", reviewRequestRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/tour", tourRoutes);
app.use("/api/portal", portalRoutes);
app.use("/api/stripe/connect", stripeConnectRoutes);
app.use("/api/calendar/google", googleCalendarRoutes);
app.use("/api/calendar/apple", appleCalendarRoutes);
app.use("/api/calendar/feed", calendarFeedRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/knowledge-gaps", knowledgeGapRoutes);
app.use("/api/saved-line-items", savedLineItemRoutes);
app.use("/api/tags", tagRoutes);

app.get("/", (req,res)=>{

  res.send("Atlas API running");

});



const PORT = process.env.PORT || 5050;


if (require.main === module) {

  if (!process.env.JWT_SECRET) {

    console.error(
      "Missing JWT_SECRET in your .env file. Logins won't work without it. See .env.example."
    );

    process.exit(1);

  }

  runMigrations(db)
    .then(() => {

      const { backupDatabase } = require("../database/backup");

      backupDatabase().catch(() => {});

      setInterval(() => {

        backupDatabase().catch(() => {});

      }, 6 * 60 * 60 * 1000);

      const { sendAppointmentReminders } = require("./services/reminderService");

      sendAppointmentReminders().catch((err) => console.error("APPOINTMENT REMINDERS FAILED:", err));

      setInterval(() => {

        sendAppointmentReminders().catch((err) => console.error("APPOINTMENT REMINDERS FAILED:", err));

      }, 30 * 60 * 1000);

      const { sendInvoiceReminders } = require("./services/invoiceReminderService");

      sendInvoiceReminders().catch((err) => console.error("INVOICE REMINDERS FAILED:", err));

      setInterval(() => {

        sendInvoiceReminders().catch((err) => console.error("INVOICE REMINDERS FAILED:", err));

      }, 30 * 60 * 1000);

      const { sendQuoteReminders } = require("./services/quoteReminderService");

      sendQuoteReminders().catch((err) => console.error("QUOTE REMINDERS FAILED:", err));

      setInterval(() => {

        sendQuoteReminders().catch((err) => console.error("QUOTE REMINDERS FAILED:", err));

      }, 30 * 60 * 1000);

      const { sendLeadFollowUps } = require("./services/leadFollowUpService");

      sendLeadFollowUps().catch((err) => console.error("LEAD FOLLOW-UPS FAILED:", err));

      setInterval(() => {

        sendLeadFollowUps().catch((err) => console.error("LEAD FOLLOW-UPS FAILED:", err));

      }, 30 * 60 * 1000);

      const { sendDailyDigests } = require("./services/dailyDigestService");

      sendDailyDigests().catch((err) => console.error("DAILY DIGESTS FAILED:", err));

      setInterval(() => {

        sendDailyDigests().catch((err) => console.error("DAILY DIGESTS FAILED:", err));

      }, 30 * 60 * 1000);

      // Permanently purges customers that have sat in the trash for more
      // than 30 days (see customerPurgeService.js). A 30-day window has
      // no need for frequent polling, so this runs every 6 hours -
      // matching the backup job's cadence just above - rather than the
      // 30-minute interval used for the time-sensitive reminder jobs.
      const { purgeOldTrashedCustomers } = require("./services/customerPurgeService");

      purgeOldTrashedCustomers().catch((err) => console.error("CUSTOMER PURGE FAILED:", err));

      setInterval(() => {

        purgeOldTrashedCustomers().catch((err) => console.error("CUSTOMER PURGE FAILED:", err));

      }, 6 * 60 * 60 * 1000);

      // A 90-day dormancy window is just as unhurried as the trash purge
      // above, so it shares the same 6-hour cadence rather than the
      // 30-minute interval used for time-sensitive reminders.
      const { sendWinBackCampaign } = require("./services/winBackService");

      sendWinBackCampaign().catch((err) => console.error("WIN-BACK CAMPAIGN FAILED:", err));

      setInterval(() => {

        sendWinBackCampaign().catch((err) => console.error("WIN-BACK CAMPAIGN FAILED:", err));

      }, 6 * 60 * 60 * 1000);

      app.listen(PORT,()=>{

        console.log(
          `Atlas server running on port ${PORT}`
        );

      });

    })
    .catch((err) => {

      console.error("Database migration failed:", err.message);
      process.exit(1);

    });

}


module.exports = app;