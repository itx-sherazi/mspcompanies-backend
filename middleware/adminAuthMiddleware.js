const jwt = require("jsonwebtoken");
const AdminUser = require("../models/AdminUser");

exports.adminAuthMiddleware = async (req, res, next) => {
  try {
    
    // Get token from cookies
    const token = req.cookies.adminToken;
    
    // Check if token exists
    if (!token) {
      console.log("No token found");
      return res.status(401).json({
        ok: false,
        message: "please login first"
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user exists (using email since that's what's in the token)
    const user = await AdminUser.findOne({ email: decoded.email }).select("-password");
    
    if (!user) {
      return res.status(401).json({
        ok: false,
        message: "Invalid token. User not found."
      });
    }

    // Attach user to request object
    req.user = {
      userId: user._id,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    console.error("Admin auth middleware error:", error);
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        ok: false,
        message: "Invalid token."
      });
    }
    
    return res.status(500).json({
      ok: false,
      message: "Server error during authentication."
    });
  }
}