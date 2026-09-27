const express = require("express");
const User = require("../models/User");
const Like = require("../models/Like");
const Block = require("../models/Block");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();
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
