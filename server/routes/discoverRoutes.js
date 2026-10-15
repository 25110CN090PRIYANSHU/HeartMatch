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

    const {
      category,
      gender,
      lookingFor,
      interest,
      minAge,
      maxAge,
      location,
      verifiedOnly,
      onlineOnly,
      hasPhotoOnly,
      hasBioOnly
    } = req.query;

    // 1. Gender / Category (Men, Women, Non-binary, Genderfluid, Other)
    const cat = String(category || gender || "").trim().toLowerCase();
    if (cat && cat !== "all" && cat !== "any") {
      if (cat === "men" || cat === "male") {
        filter.gender = { $in: ["male", "men"] };
      } else if (cat === "women" || cat === "female") {
        filter.gender = { $in: ["female", "women"] };
      } else if (cat === "non-binary" || cat === "nonbinary") {
        filter.gender = { $in: ["non-binary", "nonbinary"] };
      } else if (cat === "genderfluid") {
        filter.gender = "genderfluid";
      } else if (cat === "other") {
        filter.gender = "other";
      }
    }

    // 2. Looking For (Relationship Intent)
    const intent = String(lookingFor || "").trim().toLowerCase();
    if (intent && intent !== "all" && intent !== "any") {
      filter.lookingFor = intent;
    }

    // 3. Interests & Vibe
    const interestQuery = String(interest || "").trim();
    if (interestQuery && interestQuery !== "all" && interestQuery !== "any") {
      filter.interests = { $elemMatch: { $regex: escapeRegex(interestQuery), $options: "i" } };
    }

    // 4. Age classification
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
      if (parsedMin !== null && parsedMin >= 0) filter.age.$gte = parsedMin;
      if (parsedMax !== null && parsedMax >= 0) filter.age.$lte = parsedMax;
    }

    // 5. Location classification
    if (typeof location === "string" && location.trim().length > 0) {
      filter.location = { $regex: escapeRegex(location.trim()), $options: "i" };
    }

    // 6. Verified profiles only (✓)
    if (verifiedOnly === "true" || verifiedOnly === "1") {
      filter.isVerified = true;
    }

    // 7. Recently active / online (active in last 24 hours)
    if (onlineOnly === "true" || onlineOnly === "1") {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      filter.lastSeen = { $gte: last24h };
    }

    // 8. Profile Completeness: Has real profile photo
    if (hasPhotoOnly === "true" || hasPhotoOnly === "1") {
      filter.profileImage = { $exists: true, $ne: "" };
    }

    // 9. Profile Completeness: Has bio
    if (hasBioOnly === "true" || hasBioOnly === "1") {
      filter.bio = { $exists: true, $ne: "" };
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
