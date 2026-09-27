const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const User = require("../models/User");
const Block = require("../models/Block");
const Like = require("../models/Like");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const Report = require("../models/Report");
const EmailVerification = require("../models/EmailVerification");
const PasswordReset = require("../models/PasswordReset");
const bcrypt = require("bcryptjs");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

function userIdBase(name) {
  return String(name || "user").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "user";
}
async function ensureUserId(user) {
  if (user.userId) return user.userId;
  for (let i = 0; i < 20; i++) {
    const candidate = `${userIdBase(user.name)}${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 24);
    if (!(await User.exists({ userId: candidate }))) { user.userId = candidate; await user.save(); return candidate; }
  }
  user.userId = `user${Date.now().toString(36)}`.slice(0, 24);
  await user.save();
  return user.userId;
}
const uploadDir = path.join(__dirname, "../uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) =>
    cb(
      null,
      `${req.userId}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`,
    ),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    await ensureUserId(user);
    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});
router.put("/", authMiddleware, async (req, res) => {
  try {
    const allowed = [
      "name",
      "userId",
      "age",
      "gender",
      "bio",
      "interests",
      "location",
      "preferences",
    ];
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    for (const key of allowed)
      if (req.body[key] !== undefined) user[key] = req.body[key];
    if (req.body.userId !== undefined) {
      const requested = String(req.body.userId).trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,24}$/.test(requested))
        return res.status(400).json({ message: "User ID must be 3–24 characters and use only letters, numbers, dot, underscore or hyphen." });
      const taken = await User.findOne({ userId: requested, _id: { $ne: req.userId } });
      if (taken) return res.status(409).json({ message: "That User ID is already taken." });
      user.userId = requested;
    }
    await user.save();
    res.json({
      message: "Profile updated successfully ❤️",
      user: user.toObject({
        transform: (_, ret) => {
          delete ret.password;
          return ret;
        },
      }),
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: e.message || "Could not update profile" });
  }
});
router.get("/search/:userId", authMiddleware, async (req, res) => {
  try {
    const value = String(req.params.userId || "").trim().toLowerCase();
    if (!value) return res.status(400).json({ message: "Enter a User ID." });
    const user = await User.findOne({ userId: value, isActive: true }).select("_id userId name age gender location bio interests profileImage isVerified");
    if (!user) return res.status(404).json({ message: "No user found with that User ID." });
    if (await Block.exists({ $or: [{ blocker: req.userId, blocked: user._id }, { blocker: user._id, blocked: req.userId }] }))
      return res.status(403).json({ message: "This user is unavailable." });
    res.json({ user });
  } catch (e) { console.error(e); res.status(500).json({ message: "Search failed" }); }
});

router.post(
  "/photo",
  authMiddleware,
  upload.single("profileImage"),
  async (req, res) => {
    try {
      if (!req.file)
        return res
          .status(400)
          .json({
            message: "Please upload a JPG, PNG or WebP image under 5MB",
          });
      const user = await User.findById(req.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      user.profileImage = `/uploads/${req.file.filename}`;
      await user.save();
      res.json({
        message: "Profile photo updated 📸",
        profileImage: user.profileImage,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Upload failed" });
    }
  },
);
router.put("/password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      newPassword.length < 8
    )
      return res
        .status(400)
        .json({
          message:
            "Current password and a new 8+ character password are required",
        });
    const user = await User.findById(req.userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.password)))
      return res.status(401).json({ message: "Current password is incorrect" });
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: "Password changed successfully 🔐" });
  } catch (e) {
    res.status(500).json({ message: "Could not change password" });
  }
});
router.delete("/account", authMiddleware, async (req, res) => {
  try {
    await Promise.all([
      User.findByIdAndDelete(req.userId),
      Like.deleteMany({
        $or: [{ from: req.userId }, { to: req.userId }],
      }),
      Block.deleteMany({
        $or: [{ blocker: req.userId }, { blocked: req.userId }],
      }),
      Message.deleteMany({
        $or: [{ sender: req.userId }, { receiver: req.userId }],
      }),
      Notification.deleteMany({
        $or: [{ recipient: req.userId }, { sender: req.userId }],
      }),
      Report.deleteMany({
        $or: [{ reporter: req.userId }, { reported: req.userId }],
      }),
      EmailVerification.deleteMany({ user: req.userId }),
      PasswordReset.deleteMany({ user: req.userId }),
    ]);
    res.json({ message: "Account deleted" });
  } catch (e) {
    res.status(500).json({ message: "Could not delete account" });
  }
});

module.exports = router;
