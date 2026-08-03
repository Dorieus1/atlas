require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();


// Middleware
app.use(cors());
app.use(express.json());


// Database connection
require("../database/db");


// Routes
const businessRoutes = require("./routes/business");
const customerRoutes = require("./routes/customer");
const chatRoutes = require("./routes/chat");
const conversationRoutes = require("./routes/conversation");
const memoryRoutes = require("./routes/memory");
const knowledgeRoutes = require("./routes/knowledge");


// API routes
app.use("/api/business", businessRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/memories", memoryRoutes);
app.use("/api/knowledge", knowledgeRoutes);


// Test route
app.get("/", (req, res) => {
  res.send("Atlas API running");
});


// Start server
const PORT = process.env.PORT || 5050;

app.listen(PORT, () => {
  console.log(`Atlas server running on port ${PORT}`);
});