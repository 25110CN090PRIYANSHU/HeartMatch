const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Report = require("../models/Report");
const admin = require("../middleware/adminMiddleware");
const router = express.Router();
router.get("/stats", admin, async (req, res) =>
  res.json({
    users: await User.countDocuments(),
    activeUsers: await User.countDocuments({ isActive: true }),
    verifiedUsers: await User.countDocuments({ isVerified: true }),
    openReports: await Report.countDocuments({ status: "open" }),
  }),
);
router.get("/users", admin, async (req, res) =>
  res.json({
    users: await User.find()
      .select("-password")
      .sort({ createdAt: -1 })
      .limit(200),
  }),
);
router.put("/users/:id/status", admin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json({ message: "Invalid user ID" });
  if (typeof req.body?.isActive !== "boolean")
    return res.status(400).json({ message: "isActive must be a boolean" });
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: !!req.body.isActive },
    { returnDocument: "after" },
  ).select("-password");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
});
router.get("/reports", admin, async (req, res) =>
  res.json({
    reports: await Report.find()
      .populate("reporter", "name email")
      .populate("reported", "name email")
      .sort({ createdAt: -1 })
      .limit(200),
  }),
);
router.put("/reports/:id", admin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json({ message: "Invalid report ID" });
  if (!["open", "reviewed", "dismissed"].includes(req.body?.status))
    return res.status(400).json({ message: "Invalid report status" });
  const report = await Report.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status, adminNote: String(req.body.adminNote || "") },
    { returnDocument: "after" },
  );
  if (!report) return res.status(404).json({ message: "Report not found" });
  res.json({ report });
});
module.exports = router;
