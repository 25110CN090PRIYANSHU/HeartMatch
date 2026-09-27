const express = require("express");
const User = require("../models/User");
const Like = require("../models/Like");
const Block = require("../models/Block");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

router.get("/id/:uniqueId", authMiddleware, async (req, res) => {
  try {
    const uniqueId = String(req.params.uniqueId || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{3,23}$/.test(uniqueId)) {
      return res.status(400).json({ message: "Enter a valid HeartMatch ID." });
    }
    if (uniqueId === String((await User.findById(req.userId).select("uniqueId"))?.uniqueId || "").toLowerCase()) {
      return res.status(400).json({ message: "That's your own HeartMatch ID." });
    }
    const user = await User.findOne({ uniqueId, isActive: true })
      .select("_id name age gender location bio interests profileImage isVerified uniqueId");
    if (!user) return res.status(404).json({ message: "No user found with that HeartMatch ID." });
    const blocked = await Block.exists({
      $or: [
        { blocker: req.userId, blocked: user._id },
        { blocker: user._id, blocked: req.userId }
      ]
    });
    if (blocked) return res.status(404).json({ message: "No user found with that HeartMatch ID." });
    res.json({ success: true, user });
  } catch (e) {
    console.error("HeartMatch ID search error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId); const pref = me.preferences || {};
    const blocked = await Block.find({ $or: [{ blocker: req.userId }, { blocked: req.userId }] }).select("blocker blocked");
    const excluded = [req.userId, ...blocked.flatMap(b => [b.blocker.toString(), b.blocked.toString()])];
    const acted = await Like.find({ from: req.userId }).select("to"); excluded.push(...acted.map(x => x.to.toString()));
    const q = { _id: { $nin: [...new Set(excluded)] }, isActive: true, age: { $gte: Number(pref.minAge || 18), $lte: Number(pref.maxAge || 100) } };
    if (pref.interestedIn && pref.interestedIn !== "any") q.gender = pref.interestedIn;
    if (pref.location) q.location = { $regex: pref.location, $options: "i" };
    const users = await User.find(q).select("-password").limit(30);
    res.json({ message: "Users fetched successfully ❤️", users });
  } catch (e) { console.error(e); res.status(500).json({ message: "Server error" }); }
});
module.exports = router;
