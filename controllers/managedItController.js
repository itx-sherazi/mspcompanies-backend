const ManagedItCompany = require("../models/ManagedItCompany");
const { createDirectoryController } = require("./directoryController");

module.exports = createDirectoryController(ManagedItCompany);
