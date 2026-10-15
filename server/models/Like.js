const mongoose = require("mongoose");
const likeSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["like", "pass"], required: true }
}, { timestamps: true });
likeSchema.index({ from: 1, to: 1 }, { unique: true });
likeSchema.index({ to: 1, type: 1 });
likeSchema.index({ from: 1, type: 1 });
module.exports = mongoose.model("Like", likeSchema);
