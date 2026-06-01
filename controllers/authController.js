const AdminUser = require("../models/AdminUser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

exports.signin = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    const existingUser = await AdminUser.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ ok: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new AdminUser({
      name,
      email,
      password: hashedPassword,
    });
    
    await newUser.save();
    return res.status(201).json({ ok: true, message: "User created successfully", user: { id: newUser._id, name: newUser.name, email: newUser.email } });
  } catch (error) {
    console.error("Signin error:", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await AdminUser.findOne({ email });
    if (!user) {
      return res.status(400).json({ ok: false, message: "Invalid email or password" });
    }

    // Since earlier passwords might not be hashed, we handle both
    const isMatch = await bcrypt.compare(password, user.password).catch(() => false);
    if (!isMatch && password !== user.password) {
      return res.status(400).json({ ok: false, message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role }, 
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("adminToken", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({ ok: true, message: "Logged in successfully", token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await AdminUser.find().select("-password");
    return res.status(200).json({ ok: true, users });
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await AdminUser.findByIdAndDelete(id);
    return res.status(200).json({ ok: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
};
