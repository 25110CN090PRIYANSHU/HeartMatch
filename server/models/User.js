const mongoose = require("mongoose");
const crypto = require("crypto");

function generateUniqueId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[crypto.randomInt(0, alphabet.length)];
  return `hm_${code}`;
}

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  uniqueId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
    minlength: 4,
    maxlength: 24,
    match: /^[a-z0-9._-]+$/
  },
  password: { type: String, required: true, minlength: 8 },
  age: { type: Number, required: true, min: 18, max: 100 },
  gender: { type: String, enum: ["male", "female", "other"], required: true },
  bio: { type: String, default: "", maxlength: 500 },
  profileImage: { type: String, default: "" },
  interests: { type: [String], default: [] },
  location: { type: String, default: "", maxlength: 120 },
  preferences: {
    minAge: { type: Number, default: 18, min: 18, max: 100 },
    maxAge: { type: Number, default: 100, min: 18, max: 100 },
    interestedIn: { type: String, enum: ["male", "female", "other", "any"], default: "any" },
    location: { type: String, default: "", maxlength: 120 }
  },
  isVerified: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastSeen: { type: Date, default: Date.now },
  // Per-conversation chat wallpaper, keyed by the other user's id. Only visible to this user.
  chatBackgrounds: { type: Map, of: String, default: {} }
}, { timestamps: true });

userSchema.pre("validate", function(next) {
  if (!this.uniqueId) this.uniqueId = generateUniqueId();
  next();
});

module.exports = mongoose.model("User", userSchema);
