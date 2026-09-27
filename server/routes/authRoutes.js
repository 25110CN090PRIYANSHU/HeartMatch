const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const PasswordReset = require("../models/PasswordReset");
const EmailVerification = require("../models/EmailVerification");

const router = express.Router();
const safeUser = (u) => ({
  id: u._id,
  userId: u.userId,
  name: u.name,
  email: u.email,
  age: u.age,
  gender: u.gender,
  profileImage: u.profileImage,
  profileImageFileId: u.profileImageFileId,
  isVerified: u.isVerified,
  isAdmin: u.isAdmin,
});

function makeUserIdBase(name) {
  const base = String(name || "user").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "user";
  return base;
}

async function generateUniqueUserId(name) {
  const base = makeUserIdBase(name);
  for (let i = 0; i < 20; i++) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${base}${suffix}`.slice(0, 24);
    if (!(await User.exists({ userId: candidate }))) return candidate;
  }
  return `user${crypto.randomBytes(5).toString("hex")}`.slice(0, 24);
}

const tokenFor = (id) =>
  jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: "7d" });

async function mail(to, subject, text) {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  )
    return false;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
  return true;
}

router.get("/test", (req, res) =>
  res.json({ message: "Auth route is working ❤️" }),
);

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, age, gender } = req.body || {};
    const normalizedName = String(name || "").trim();
    const normalizedEmail = String(email || "").toLowerCase().trim();
    const numericAge = Number(age);
    const allowedGenders = ["male", "female", "other"];
    if (
      !normalizedName ||
      normalizedName.length > 80 ||
      !normalizedEmail ||
      !password ||
      !Number.isInteger(numericAge) ||
      !allowedGenders.includes(gender)
    )
      return res
        .status(400)
        .json({ message: "Please provide valid account details" });
    if (numericAge < 18 || numericAge > 100)
      return res.status(400).json({ message: "HeartMatch is 18+ only" });
    if (typeof password !== "string" || password.length < 8)
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      return res.status(400).json({ message: "Please provide a valid email" });
    if (await User.findOne({ email: normalizedEmail }))
      return res.status(400).json({ message: "Email already registered" });
    const isAdmin =
      !!process.env.ADMIN_EMAIL &&
      normalizedEmail === process.env.ADMIN_EMAIL.toLowerCase().trim();
    const user = await User.create({
      userId: await generateUniqueUserId(normalizedName),
      name: normalizedName,
      email: normalizedEmail,
      password: await bcrypt.hash(password, 12),
      age: numericAge,
      gender,
      isAdmin,
    });
    const raw = crypto.randomBytes(32).toString("hex");
    await EmailVerification.create({
      user: user._id,
      tokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const base = process.env.APP_URL || "http://localhost:5000";
    const verificationUrl = `${base}/verify.html?token=${raw}`;
    const sent = await mail(
      user.email,
      "Verify your HeartMatch account",
      `Welcome to HeartMatch! Verify your account: ${verificationUrl}`,
    );
    res
      .status(201)
      .json({
        message: sent
          ? "Account created. Check your email to verify."
          : "Account created successfully ❤️",
        user: safeUser(user),
        verificationUrl:
          process.env.NODE_ENV === "production" ? undefined : verificationUrl,
      });
  } catch (e) {
    console.error(e);
    if (e?.code === 11000)
      return res.status(400).json({ message: "Email already registered" });
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string")
      return res.status(400).json({ message: "Email and password are required" });
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });
    if (!user || !(await bcrypt.compare(password || "", user.password)))
      return res.status(401).json({ message: "Invalid email or password" });
    if (!user.isActive)
      return res
        .status(403)
        .json({ message: "This account has been disabled" });
    if (
      process.env.ADMIN_EMAIL &&
      user.email === process.env.ADMIN_EMAIL.toLowerCase().trim() &&
      !user.isAdmin
    ) {
      user.isAdmin = true;
    }
    user.lastSeen = new Date();
    await user.save();
    res.json({
      message: "Login successful ❤️",
      token: tokenFor(user._id),
      user: safeUser(user),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/verify", async (req, res) => {
  try {
    const hash = crypto
      .createHash("sha256")
      .update(String(req.query.token || ""))
      .digest("hex");
    const record = await EmailVerification.findOne({ tokenHash: hash });
    if (!record || record.expiresAt < new Date())
      return res
        .status(400)
        .json({ message: "Invalid or expired verification link" });
    await User.findByIdAndUpdate(record.user, { isVerified: true });
    await record.deleteOne();
    res.json({ message: "Email verified successfully ✓" });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .toLowerCase()
      .trim();
    const user = await User.findOne({ email });
    const response = {
      message: "If that email exists, a reset link has been prepared.",
    };
    if (!user) return res.json(response);
    const raw = crypto.randomBytes(32).toString("hex");
    await PasswordReset.deleteMany({ user: user._id });
    await PasswordReset.create({
      user: user._id,
      tokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const url = `${process.env.APP_URL || "http://localhost:5000"}/reset-password.html?token=${raw}`;
    const sent = await mail(
      email,
      "HeartMatch password reset",
      `Reset your password: ${url}`,
    );
    if (!sent && process.env.NODE_ENV !== "production") response.resetUrl = url;
    res.json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.length < 8)
      return res
        .status(400)
        .json({
          message: "Valid token and an 8+ character password are required",
        });
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const record = await PasswordReset.findOne({ tokenHash: hash });
    if (!record || record.expiresAt < new Date())
      return res.status(400).json({ message: "Invalid or expired reset link" });
    await User.findByIdAndUpdate(record.user, {
      password: await bcrypt.hash(password, 12),
    });
    await record.deleteOne();
    res.json({ message: "Password reset successfully. You can log in now." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
