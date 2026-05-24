const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const cityRoutes = require("./router/cityRoutes.js");
const blogRoutes = require("./router/blogRoutes.js");

dotenv.config();

connectDB();

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3007",
  "https://mspcompanies.us",
  "https://www.mspcompanies.us",
  "https://dashboard.mspcompanies.us",
  "https://api.mspcompanies.us",
  "https://*.mspcompanies.us",
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());


app.get("/", (req, res) => {
  res.send("MSP Companies API v1.0 - Running");
});
const userRoutes = require("./router/userRoutes.js");
app.use("/api/v1", cityRoutes);
app.use("/api/v1", userRoutes);
app.use("/api/v1", blogRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});