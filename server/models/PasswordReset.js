const mongoose = require("mongoose");
const passwordResetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("PasswordReset", passwordResetSchema);
