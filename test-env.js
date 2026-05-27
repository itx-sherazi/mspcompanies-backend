const dotenv = require("dotenv");
dotenv.config();
const cloudinary = require("cloudinary").v2;
const nodemailer = require("nodemailer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dcz7cb7dy",
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function testAll() {
  console.log("Testing Cloudinary...");
  try {
    const res = await cloudinary.api.ping();
    console.log("Cloudinary ping:", res);
  } catch (err) {
    console.error("Cloudinary error:", err.message);
  }

  console.log("Testing Nodemailer...");
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.CONTACT_SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.CONTACT_SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.CONTACT_SMTP_USER,
        pass: process.env.CONTACT_SMTP_PASS,
      },
    });
    const verify = await transporter.verify();
    console.log("Nodemailer verify:", verify);
  } catch (err) {
    console.error("Nodemailer error:", err.message);
  }
}

testAll();
