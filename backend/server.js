const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());

const chatRoutes = require("./routes/chat");

app.use("/api/chat", chatRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Atlas AI backend is running"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});