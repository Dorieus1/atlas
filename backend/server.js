require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();


app.use(cors());

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
const quoteRoutes = require("./routes/quotes");
const photoRoutes = require("./routes/photos");

app.use("/api/business", businessRoutes);
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
app.use("/api/quotes", quoteRoutes);
app.use("/api/photos", photoRoutes);

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