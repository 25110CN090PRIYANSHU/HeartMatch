const express = require("express");
const mongoose = require("mongoose");
const Report = require("../models/Report");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");
const router = express.Router();

router.post("/:userId", auth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId) || userId === req.userId.toString())
      return res.status(400).json({ message: "Invalid user" });
    if (!(await User.exists({ _id: userId })))
      return res.status(404).json({ message: "User not found" });
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return res.status(400).json({ message: "Reason is required" });
    if (reason.length > 500)
      return res.status(400).json({ message: "Reason is too long" });
    await Report.create({ reporter: req.userId, reported: userId, reason });
    res.json({ message: "Report submitted. Thank you." });
  } catch (e) {
    res.status(500).json({ message: "Could not submit report" });
  }
});

module.exports = router;
