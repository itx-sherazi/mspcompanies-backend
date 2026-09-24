const express = require("express");
const { leadPopup, contactForm, emailListForm, bookACall } = require("../controllers/emailController");
const { formLimiter } = require("../middleware/rateLimits");

const router = express.Router();

router.post("/lead-popup", formLimiter(), leadPopup);
router.post("/contact", formLimiter(), contactForm);
router.post("/email-list", formLimiter(), emailListForm);
router.post("/book-a-call", formLimiter(), bookACall);

module.exports = router;
