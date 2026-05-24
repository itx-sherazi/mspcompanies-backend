const express = require("express");
const { signin, login, getUsers, deleteUser } = require("../controllers/authController");
const { adminAuthMiddleware } = require("../middleware/adminAuthMiddleware");

const router = express.Router();

router.post("/signin", signin); // Actually used to add/create a user based on frontend
router.post("/login", login);
router.get("/getuser", adminAuthMiddleware, getUsers);
router.delete("/users/:id", adminAuthMiddleware, deleteUser);

module.exports = router;
