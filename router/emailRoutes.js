const express = require("express");
const { leadPopup, contactForm, emailListForm } = require("../controllers/emailController");

const router = express.Router();

router.post("/lead-popup", leadPopup);
router.post("/contact", contactForm);
router.post("/email-list", emailListForm);

module.exports = router;
