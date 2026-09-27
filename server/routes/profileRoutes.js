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
