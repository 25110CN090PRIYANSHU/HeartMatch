const mongoose = require("mongoose");
const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reported: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reason: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ["open", "reviewed", "dismissed"], default: "open" },
  adminNote: { type: String, default: "" }
}, { timestamps: true });
reportSchema.index({ reporter: 1, reported: 1, createdAt: -1 });
module.exports = mongoose.model("Report", reportSchema);
