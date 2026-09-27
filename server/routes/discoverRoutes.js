const express = require("express");
const User = require("../models/User");
const Block = require("../models/Block");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

router.get("/", authMiddleware, async (req, res) => {
  try {
    const blocked = await Block.find({
      $or: [{ blocker: req.userId }, { blocked: req.userId }]
    }).select("blocker blocked");

    const excluded = new Set([String(req.userId)]);
    blocked.forEach((b) => {
      excluded.add(String(b.blocker));
      excluded.add(String(b.blocked));
    });

    // Discover shows every other active HeartMatch user.
    // Preferences are intentionally not used as Discover filters.
    const users = await User.find({
      _id: { $nin: [...excluded] },
      isActive: { $ne: false }
    })
      .select("-password")
      .sort({ lastSeen: -1, createdAt: -1 });

    res.json({
      message: "All users fetched successfully ❤️",
      users
    });
  } catch (e) {
    console.error("Discover error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
