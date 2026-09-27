const express = require("express");
const mongoose = require("mongoose");
const Block = require("../models/Block");
const Like = require("../models/Like");
const Message = require("../models/Message");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");
const router = express.Router();
router.get("/", auth, async (req, res) => {
  try {
    res.json({
      blocked: await Block.find({ blocker: req.userId }).populate(
        "blocked",
        "name profileImage",
      ),
    });
  } catch (e) {
    res.status(500).json({ message: "Could not load blocked users" });
  }
});
router.post("/:userId", auth, async (req, res) => {
  try {
    const id = req.params.userId;
    if (!mongoose.Types.ObjectId.isValid(id) || id === req.userId.toString())
      return res.status(400).json({ message: "Invalid user" });
    if (!(await User.exists({ _id: id })))
      return res.status(404).json({ message: "User not found" });
    await Block.updateOne(
      { blocker: req.userId, blocked: id },
      { $setOnInsert: { blocker: req.userId, blocked: id } },
      { upsert: true },
    );
    await Like.deleteMany({
      $or: [
        { from: req.userId, to: id },
        { from: id, to: req.userId },
      ],
    });
    await Message.deleteMany({
      $or: [
        { sender: req.userId, receiver: id },
        { sender: id, receiver: req.userId },
      ],
    });
    res.json({ message: "User blocked" });
  } catch (e) {
    res.status(500).json({ message: "Could not block user" });
  }
});
router.delete("/:userId", auth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.userId))
    return res.status(400).json({ message: "Invalid user" });
  await Block.deleteOne({ blocker: req.userId, blocked: req.params.userId });
  res.json({ message: "User unblocked" });
});
module.exports = router;
