const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true, sparse: true, lowercase: true, trim: true, minlength: 3, maxlength: 24, match: /^[a-z0-9._-]+$/ },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8 },
  age: { type: Number, required: true, min: 18, max: 100 },
  gender: { type: String, enum: ["male", "female", "other", "non-binary", "genderfluid"], required: true },
  lookingFor: { type: String, enum: ["long-term", "casual", "friends", "not-sure", "any", ""], default: "any" },
  bio: { type: String, default: "", maxlength: 500 },
  profileImage: { type: String, default: "" },
  profileImageFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
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
  isIncognito: { type: Boolean, default: false },
  photos: { type: [String], default: [] },
  prompts: [{
    question: { type: String, default: "", maxlength: 100 },
    answer: { type: String, default: "", maxlength: 300 }
  }],
  lastSeen: { type: Date, default: Date.now },
  // Per-conversation chat wallpaper, keyed by the other user's id. Only visible to this user.
  chatBackgrounds: { type: Map, of: String, default: {} },
  // Web Push notification subscriptions (for lock screen PWA alerts)
  pushSubscriptions: [{
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

userSchema.index({ isActive: 1, isIncognito: 1, lastSeen: -1 });
userSchema.index({ gender: 1, lookingFor: 1, age: 1 });

module.exports = mongoose.model("User", userSchema);
