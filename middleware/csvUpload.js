const multer = require("multer");

// The file is read into memory. 25 MB is enough for 5,000 companies with long text, and anything larger is refused.
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 20 } });

module.exports = csvUpload;
