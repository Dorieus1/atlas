const express = require("express");
const cors = require("cors");
require("dotenv").config();

require("../database/db");

const app = express();

const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());

const chatRoutes = require("./routes/chat");
const businessRoutes = require("./routes/business");
const customerRoutes = require("./routes/customer");
const conversationRoutes = require("./routes/conversation");
const memoryRoutes = require("./routes/memory");
const knowledgeRoutes = require("./routes/knowledge");
app.use("/api/chat", chatRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/memories", memoryRoutes);
app.use("/api/knowledge", knowledgeRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Atlas AI backend is running"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});