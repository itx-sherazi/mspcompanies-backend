const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  name: String,
  role: {
    type: String,
    default: 'admin'
  }
});

const AdminUser = mongoose.model('AdminUser', userSchema);
module.exports = AdminUser;