
const multer = require("multer");

const storage = multer.memoryStorage(); // ✅ RAM me file save hoti hai
const csvUpload = multer({ storage });

module.exports = csvUpload;
