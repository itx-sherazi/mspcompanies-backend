const express = require("express");
const { signin, login, getUsers, deleteUser } = require("../controllers/authController");
const { adminAuthMiddleware, requireRole } = require("../middleware/adminAuthMiddleware");

const router = express.Router();

router.post("/signin", adminAuthMiddleware, requireRole("admin"), signin); // Creates a dashboard user (admin only)
router.post("/login", login);
router.get("/getuser", adminAuthMiddleware, requireRole("admin"), getUsers);
router.delete("/users/:id", adminAuthMiddleware, requireRole("admin"), deleteUser);

module.exports = router;
