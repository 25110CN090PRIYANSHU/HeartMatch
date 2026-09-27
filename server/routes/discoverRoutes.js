const express = require("express");
const User = require("../models/User");
const Like = require("../models/Like");
const Block = require("../models/Block");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

router.get("/", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId).select("preferences");
    if (!me) return res.status(404).json({ message: "User not found" });

    const pref = me.preferences || {};
    const minAge = Math.max(18, Number.isFinite(Number(pref.minAge)) ? Number(pref.minAge) : 18);
    const maxAge = Math.min(100, Number.isFinite(Number(pref.maxAge)) ? Number(pref.maxAge) : 100);

    const blocked = await Block.find({
      $or: [{ blocker: req.userId }, { blocked: req.userId }]
    }).select("blocker blocked");

    const acted = await Like.find({ from: req.userId }).select("to");
    const excluded = new Set([String(req.userId)]);
    blocked.forEach((b) => {
      excluded.add(String(b.blocker));
      excluded.add(String(b.blocked));
    });
    acted.forEach((x) => excluded.add(String(x.to)));

    // Discover strictly follows the current user's saved preferences.
    const q = {
      _id: { $nin: [...excluded] },
      isActive: { $ne: false },
      age: { $gte: minAge, $lte: Math.max(minAge, maxAge) }
    };

    const interestedIn = String(pref.interestedIn || "any").toLowerCase();
    if (["male", "female", "other"].includes(interestedIn)) {
      q.gender = interestedIn;
    }

    const preferredLocation = String(pref.location || "").trim();
    if (preferredLocation) {
      q.location = { $regex: preferredLocation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }

    const users = await User.find(q)
      .select("-password")
      .sort({ lastSeen: -1, createdAt: -1 })
      .limit(50);

    res.json({
      message: "Users fetched successfully ❤️",
      users,
      preferences: { minAge, maxAge: Math.max(minAge, maxAge), interestedIn, location: preferredLocation }
    });
  } catch (e) {
    console.error("Discover error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
