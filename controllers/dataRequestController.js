const DataRequest = require("../models/DataRequest");

// ADMIN: Get all data requests (contact form, lead popup, email list, book-a-call)
exports.getAllData = async (req, res) => {
  try {
    const data = await DataRequest.find().sort({ createdAt: -1 });
    res.json({ ok: true, data, total: data.length });
  } catch (err) {
    console.error("getAllData:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// ADMIN: Delete a data request by id
exports.deleteRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await DataRequest.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ ok: false, message: "Not found" });
    res.json({ ok: true, message: "Deleted" });
  } catch (err) {
    console.error("deleteRequest:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
