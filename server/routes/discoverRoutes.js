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
      isActive: { $ne: false },
      isIncognito: { $ne: true }
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
      hasBioOnly,
      sortBy
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

    const [me, rawUsers] = await Promise.all([
      User.findById(req.userId).select("age interests lookingFor location preferences isIncognito").lean(),
      User.find(filter)
        .select("name age gender lookingFor bio profileImage interests location isVerified lastSeen createdAt")
        .sort({ lastSeen: -1, createdAt: -1 })
        .limit(80)
        .lean()
    ]);

    function computeCompatibility(userA, userB) {
      if (!userA) return 75;
      let score = 52;
      const myInterests = (userA.interests || []).map(i => String(i).toLowerCase().trim());
      const theirInterests = (userB.interests || []).map(i => String(i).toLowerCase().trim());
      const shared = myInterests.filter(i => theirInterests.includes(i));
      score += Math.min(36, shared.length * 12);

      if (userA.lookingFor && userB.lookingFor && userA.lookingFor === userB.lookingFor && userA.lookingFor !== "any") {
        score += 14;
      }
      if (userA.location && userB.location && String(userA.location).toLowerCase().trim() === String(userB.location).toLowerCase().trim()) {
        score += 8;
      }
      const p = userA.preferences || {};
      if (userB.age >= (p.minAge || 18) && userB.age <= (p.maxAge || 100)) {
        score += 6;
      }
      return Math.min(99, Math.max(55, score));
    }

    let users = rawUsers.map(u => {
      const uObj = { ...u };
      uObj.compatibility = computeCompatibility(me, u);
      // Ensure photos array includes profileImage if photos is empty
      if ((!uObj.photos || uObj.photos.length === 0) && uObj.profileImage) {
        uObj.photos = [uObj.profileImage];
      }
      return uObj;
    });

    // Sorting
    const sort = String(sortBy || "compatibility").toLowerCase();
    if (sort === "compatibility") {
      users.sort((a, b) => b.compatibility - a.compatibility);
    } else if (sort === "recent") {
      users.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
    } else if (sort === "newest") {
      users.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (sort === "age" && me?.age) {
      users.sort((a, b) => Math.abs(a.age - me.age) - Math.abs(b.age - me.age));
    }

    res.json({
      message: "Users fetched successfully ❤️",
      users,
      count: users.length,
      currentUser: {
        interests: me?.interests || [],
        lookingFor: me?.lookingFor || "any",
        location: me?.location || "",
        isIncognito: me?.isIncognito || false
      }
    });
  } catch (e) {
    console.error("Discover error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
