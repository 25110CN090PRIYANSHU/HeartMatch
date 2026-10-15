const express = require("express");
const User = require("../models/User");
const Block = require("../models/Block");
const Like = require("../models/Like");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

function escapeRegex(text) {
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const blocked = await Block.find({
      $or: [{ blocker: req.userId }, { blocked: req.userId }]
    }).select("blocker blocked");

    const excluded = new Set([String(req.userId)]);

    // Hide users that I have already liked or passed.
    const actedOn = await Like.find({ from: req.userId }).select("to");
    actedOn.forEach((item) => excluded.add(String(item.to)));

    blocked.forEach((b) => {
      excluded.add(String(b.blocker));
      excluded.add(String(b.blocked));
    });

    const filter = {
      _id: { $nin: [...excluded] },
      isActive: { $ne: false }
    };

    // Category / Gender classification: men, women, other
    const { category, gender, minAge, maxAge, location } = req.query;
    const cat = String(category || gender || "").trim().toLowerCase();

    if (cat && cat !== "all" && cat !== "any") {
      if (cat === "men" || cat === "male") {
        filter.gender = { $in: ["male", "men"] };
      } else if (cat === "women" || cat === "female") {
        filter.gender = { $in: ["female", "women"] };
      } else if (cat === "other") {
        filter.gender = "other";
      }
    }

    // Age classification
    let parsedMin = minAge !== undefined && minAge !== "" ? parseInt(minAge, 10) : null;
    let parsedMax = maxAge !== undefined && maxAge !== "" ? parseInt(maxAge, 10) : null;

    if (parsedMin !== null && isNaN(parsedMin)) parsedMin = null;
    if (parsedMax !== null && isNaN(parsedMax)) parsedMax = null;

    if (parsedMin !== null && parsedMax !== null && parsedMin > parsedMax) {
      const temp = parsedMin;
      parsedMin = parsedMax;
      parsedMax = temp;
    }

    if (parsedMin !== null || parsedMax !== null) {
      filter.age = {};
      if (parsedMin !== null && parsedMin >= 0) {
        filter.age.$gte = parsedMin;
      }
      if (parsedMax !== null && parsedMax >= 0) {
        filter.age.$lte = parsedMax;
      }
    }

    // Location classification
    if (typeof location === "string" && location.trim().length > 0) {
      filter.location = { $regex: escapeRegex(location.trim()), $options: "i" };
    }

    const users = await User.find(filter)
      .select("-password")
      .sort({ lastSeen: -1, createdAt: -1 });

    res.json({
      message: "Users fetched successfully ❤️",
      users,
      count: users.length
    });
  } catch (e) {
    console.error("Discover error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
