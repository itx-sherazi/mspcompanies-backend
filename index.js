const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");

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
  "https://mspcompanies-dashboard.vercel.app",
  "https://www.mspcompanies-dashboard.vercel.app",
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));
app.options(/(.*)/, cors());
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("MSP Companies API v1.0 - Running");
});

app.use("/api/v1", require("./router/userRoutes"));
app.use("/api/v1", require("./router/cityRoutes"));
app.use("/api/v1", require("./router/blogRoutes"));
app.use("/api/v1", require("./router/emailRoutes"));
app.use("/api/v1", require("./router/listingRequestRoutes"));
app.use("/api/v1", require("./router/ServiceRoute"));
app.use("/api/v1", require("./router/CompanyTeamRoute"));
app.use("/api/v1", require("./router/managedItRoutes"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
