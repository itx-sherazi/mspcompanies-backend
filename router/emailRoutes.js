const express = require("express");
const { leadPopup, contactForm, emailListForm, bookACall } = require("../controllers/emailController");

const router = express.Router();

router.post("/lead-popup", leadPopup);
router.post("/contact", contactForm);
router.post("/email-list", emailListForm);
router.post("/book-a-call", bookACall);

module.exports = router;
